/**
 * Convex deployment sync — dev <-> prod, full fidelity.
 *
 *   npm run sync:from-prod              pull prod over dev
 *   npm run sync:to-prod -- --confirm   push dev over prod
 *
 * WHY FULL FIDELITY: the family works locally and then migrates up, and also
 * needs local to match prod when prod moved on. So this copies EVERYTHING —
 * `privateRecords` and `chatMessages` included — rather than filtering the
 * private tables out. Consequence, stated plainly: after a `from-prod`, your
 * dev deployment holds real passport numbers, door codes and chat history.
 * Treat the dev deployment as just as sensitive as prod.
 *
 * File storage travels too (`--include-file-storage`), so vault attachments
 * and every trip photograph survive the trip.
 *
 * AFTERWARDS, ALWAYS RE-MINT THE IMAGE URLS. `storedImage.url` is cached, and a
 * cached URL names the deployment it was minted on — so straight after a copy
 * the target still points its pictures at the SOURCE. They load, so nothing
 * looks wrong, right up until the source deployment is wiped. This script runs
 * it for you; if you ever import by hand, run it yourself:
 *
 *   npx convex run [--prod] images:internalRemintUrls '{"apply":true}'
 *
 * SAFETY: both directions are `--replace-all` on the target, which deletes
 * whatever the source does not have. So before writing anything, this script
 * snapshots the TARGET into `.convex-snapshots/` and prints the path. That
 * file is the undo button — restore with:
 *
 *   npx convex import --replace-all -y <backup.zip>          # into dev
 *   npx convex import --prod --replace-all -y <backup.zip>   # into prod
 *
 * `to-prod` additionally refuses to run without `--confirm`, because it
 * overwrites production with whatever happens to be on this laptop.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const snapshotDir = path.join(webRoot, ".convex-snapshots");

const direction = process.argv[2];
const confirmed = process.argv.includes("--confirm");

if (direction !== "from-prod" && direction !== "to-prod") {
  console.error("Usage: node scripts/sync-deployment.mjs <from-prod|to-prod> [--confirm]");
  process.exit(1);
}

/** prod -> dev, or dev -> prod. */
const source = direction === "from-prod" ? "prod" : "dev";
const target = direction === "from-prod" ? "dev" : "prod";

if (direction === "to-prod" && !confirmed) {
  console.error(
    [
      "",
      "  Refusing to overwrite production without --confirm.",
      "",
      "  `to-prod` replaces ALL prod data with this machine's dev deployment,",
      "  deleting any prod rows dev does not have. If the family has edited the",
      "  vault or the checklist in the live app since your last pull, those edits",
      "  are gone.",
      "",
      "  Pull first if you are unsure:   npm run sync:from-prod",
      "  Then push deliberately:         npm run sync:to-prod -- --confirm",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

/** Convex CLI flags that select a deployment. Dev is the CLI default. */
const deploymentFlags = (which) => (which === "prod" ? ["--prod"] : []);

function convex(args) {
  return execFileSync("npx", ["convex", ...args], {
    cwd: webRoot,
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
  });
}

function stamp() {
  // Local time, filename-safe: 2026-08-01T16-30-05
  return new Date().toISOString().replace(/\..+$/, "").replace(/:/g, "-");
}

function sizeMb(file) {
  return (statSync(file).size / 1024 / 1024).toFixed(1);
}

mkdirSync(snapshotDir, { recursive: true });

const runStamp = stamp();
const backupPath = path.join(snapshotDir, `${target}-before-${direction}-${runStamp}.zip`);
const sourcePath = path.join(snapshotDir, `${source}-snapshot-${runStamp}.zip`);

console.log(`\nConvex sync: ${source} -> ${target}\n`);

// 1. Back up the target FIRST. If this fails, nothing has been touched yet.
console.log(`  [1/3] Backing up ${target} (the undo button)...`);
convex(["export", ...deploymentFlags(target), "--include-file-storage", "--path", backupPath]);
console.log(`        ${backupPath} (${sizeMb(backupPath)} MB)`);

// 2. Snapshot the source.
console.log(`  [2/3] Exporting ${source}...`);
convex(["export", ...deploymentFlags(source), "--include-file-storage", "--path", sourcePath]);
console.log(`        ${sourcePath} (${sizeMb(sourcePath)} MB)`);

// 3. Replace the target wholesale.
console.log(`  [3/4] Importing into ${target} (--replace-all)...`);
convex(["import", ...deploymentFlags(target), "--replace-all", "-y", sourcePath]);

/*
 * 4. Re-point the pictures at THIS deployment.
 *
 * `storedImage.url` is cached, and a cached URL names the deployment that
 * minted it — so the rows just imported all still point at `source`. The
 * images would load, which is exactly why this must not be left to whoever
 * remembers: nothing looks broken until the source deployment is wiped.
 *
 * Needs the new code to be deployed to the target. On a target whose functions
 * predate this step it will fail; the import has already succeeded by then, so
 * the message says to deploy and re-run rather than implying data was lost.
 */
console.log(`  [4/4] Re-minting image URLs on ${target}...`);
try {
  const out = convex([
    "run",
    ...deploymentFlags(target),
    "images:internalRemintUrls",
    JSON.stringify({ apply: true }),
  ]);
  const rewritten = /"rewritten":\s*(\d+)/.exec(out)?.[1] ?? "?";
  const missing = /"missing":\s*\[([^\]]*)\]/.exec(out)?.[1]?.trim();
  console.log(`        ${rewritten} image references re-pointed at ${target}.`);
  if (missing) console.log(`        WARNING — files not present on ${target}: ${missing.slice(0, 300)}`);
} catch {
  console.log("");
  console.log(`        !! Could not re-mint image URLs on ${target}.`);
  console.log(`        The data import SUCCEEDED — this is the follow-up step.`);
  console.log(`        Until it runs, ${target} serves its photos from ${source}.`);
  console.log(`        Deploy the functions, then run:`);
  console.log(
    `          npx convex run ${target === "prod" ? "--prod " : ""}images:internalRemintUrls '{"apply":true}'`,
  );
}

console.log(
  [
    "",
    `✅ ${target} now matches ${source}.`,
    "",
    `   Undo:  npx convex import ${target === "prod" ? "--prod " : ""}--replace-all -y ${backupPath}`,
    "",
    direction === "from-prod"
      ? "   Reminder: dev now holds the family's real private records. Same care as prod."
      : "   The app and both chats read Convex live, so the guides you just pushed are already what they answer from.",
    "",
  ].join("\n"),
);
