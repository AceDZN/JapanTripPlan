/**
 * `npm run dev` — the web app AND the local eve agent, wired to each other.
 *
 * Why this exists: the two halves used to be started by hand in two terminals,
 * and the web app read `EVE_URL` from `.env.local`, which points at the
 * deployment. So the default local setup quietly tested the browser against a
 * *deployed* agent. That cost a long debugging session: the chat looked broken,
 * and the actual explanation was that the deployment was 24 commits behind and
 * did not have the wish tools at all.
 *
 * Now one command starts both, and `lib/server-env.ts` forces the dev server at
 * the local agent regardless of what `.env.local` says. To aim at the
 * deployment on purpose: `EVE_USE_DEPLOYED=1 npm run dev`.
 *
 * The two processes share a fate. Ctrl-C stops both; if either dies, the other
 * is stopped too rather than left half-running — a live web server talking to a
 * dead agent is exactly the state that looks like a bug in the app.
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const WEB_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT_DIR = resolve(WEB_DIR, "..", "trip-agent");

/** Must match LOCAL_EVE_URL in lib/server-env.ts. */
const AGENT_PORT = 2000;
const AGENT_READY_TIMEOUT_MS = 90_000;

const children = [];
let shuttingDown = false;

/** ANSI-prefixed piping, so two interleaved logs stay readable. */
function pipe(stream, prefix, colour) {
  let tail = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = (tail + chunk).split("\n");
    tail = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) process.stdout.write(`\x1b[${colour}m${prefix}\x1b[0m ${line}\n`);
    }
  });
}

function start(name, command, args, cwd, colour, env = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  pipe(child.stdout, name, colour);
  pipe(child.stderr, name, colour);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    process.stdout.write(
      `\x1b[31m[dev]\x1b[0m ${name} exited (${signal ?? code}). Stopping everything.\n`,
    );
    shutdown(typeof code === "number" && code !== 0 ? code : 1);
  });

  children.push(child);
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  // Give them a moment to close listeners; a Next dev server that is SIGKILLed
  // leaves a stale .next/dev/lock behind and refuses to start next time.
  setTimeout(() => {
    for (const child of children) if (!child.killed) child.kill("SIGKILL");
    process.exit(code);
  }, 2000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

/** Resolves once something is accepting connections on `port`. */
function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, rejectPromise) => {
    const attempt = () => {
      if (shuttingDown) return;
      const socket = createConnection({ port, host: "127.0.0.1" });
      socket.once("connect", () => {
        socket.destroy();
        resolvePromise();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) rejectPromise(new Error(`port ${port} never opened`));
        else setTimeout(attempt, 400);
      });
    };
    attempt();
  });
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error(`${command} exited ${code}`)),
    );
  });
}

// The agent bundles the guides and places into agent/data/content.ts rather than
// reading them at runtime. Generate it ONCE here, before the watcher starts:
// running trip-agent's own `predev` would rewrite a file `eve dev` is watching,
// and a rebuild storm on that file has knocked the agent over more than once.
process.stdout.write("\x1b[36m[dev]\x1b[0m bundling agent data…\n");
await run("npm", ["run", "sync-data"], AGENT_DIR);

process.stdout.write(`\x1b[36m[dev]\x1b[0m starting eve agent on :${AGENT_PORT}…\n`);
start("[agent]", "npx", ["eve", "dev"], AGENT_DIR, "35");

try {
  await waitForPort(AGENT_PORT, AGENT_READY_TIMEOUT_MS);
} catch (error) {
  process.stdout.write(`\x1b[31m[dev]\x1b[0m agent never came up: ${String(error)}\n`);
  shutdown(1);
}

process.stdout.write(
  `\x1b[36m[dev]\x1b[0m agent ready — the web app will talk to ${
    process.env.EVE_USE_DEPLOYED === "1" ? "the DEPLOYED agent (EVE_USE_DEPLOYED=1)" : `http://127.0.0.1:${AGENT_PORT}`
  }\n`,
);

start("[web]", "npx", ["next", "dev"], WEB_DIR, "32");
