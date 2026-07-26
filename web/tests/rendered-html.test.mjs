/**
 * End-to-end assertions against the real Next.js production server.
 *
 * `npm test` runs `next build` first; this file then boots `next start` on
 * ephemeral ports — one server per environment it needs to exercise — and talks
 * to them over HTTP. Environments can no longer be injected per call the way
 * the old Worker harness did, so each distinct configuration gets its own
 * process, and the eve upstream is a local stub server that records what the
 * relay forwarded.
 */

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import net from "node:net";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const freezeDate = pathToFileURL(fileURLToPath(new URL("./fixtures/freeze-date.mjs", import.meta.url)));

/* ========================================================================== */
/* Harness                                                                     */
/* ========================================================================== */

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

const children = [];
const stubs = [];

/**
 * Boots `next start` against the existing build.
 *
 * Every variable the app reads is passed explicitly — including the empty
 * strings that mask `.env.local`, since `@next/env` only fills a key that is
 * absent from `process.env`.
 */
async function startNext(env = {}, { nodeOptions } = {}) {
  const port = await freePort();
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "production",
        VERCEL: "",
        VERCEL_OIDC_TOKEN: "",
        AI_GATEWAY_API_KEY: "",
        EVE_URL: "",
        EVE_SHARED_SECRET: "",
        ...env,
        ...(nodeOptions
          ? { NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} ${nodeOptions}`.trim() }
          : {}),
      },
    },
  );

  children.push(child);

  let log = "";
  child.stdout.on("data", (chunk) => (log += chunk));
  child.stderr.on("data", (chunk) => (log += chunk));

  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 90_000;

  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start exited (${child.exitCode}):\n${log}`);
    try {
      const probe = await fetch(`${origin}/api/agent/enabled`);
      if (probe.ok) {
        await probe.arrayBuffer();
        break;
      }
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`next start never became ready:\n${log}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return { origin, fetch: (pathname, init) => fetch(`${origin}${pathname}`, init) };
}

/** Stands in for the deployed eve agent and records everything the relay sent. */
async function startStubEve() {
  const calls = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      calls.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      response.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "x-eve-session-id": "ses_1",
      });
      response.end('{"type":"session.waiting","data":{"continuationToken":"eve:1"}}\n');
    });
  });

  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  stubs.push(server);

  // Trailing slash on purpose: the relay must normalize it away.
  return { calls, url: `http://127.0.0.1:${port}/` };
}

/** The three server configurations plus the mid-trip clock. */
let app;
let bare;
let partial;
let midTrip;
let eve;

before(async () => {
  eve = await startStubEve();

  [app, bare, partial, midTrip] = await Promise.all([
    startNext({ EVE_URL: eve.url, EVE_SHARED_SECRET: "s3cret" }),
    startNext(),
    startNext({ EVE_URL: "https://a.example" }),
    startNext({}, { nodeOptions: `--import ${freezeDate.href}` }),
  ]);
});

after(() => {
  for (const child of children) child.kill("SIGTERM");
  for (const server of stubs) server.close();
});

/** Fetches a page and asserts it rendered as HTML. */
async function html(pathname, server = app) {
  const response = await server.fetch(pathname, { headers: { accept: "text/html" } });
  assert.equal(response.status, 200, `${pathname} must render`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

/* ========================================================================== */
/* Pages                                                                       */
/* ========================================================================== */

test("renders the RTL shell with the five-item bottom nav and the chat bubble", async () => {
  const page = await html("/");
  assert.match(page, /<html lang="he" dir="rtl"/);
  assert.match(page, /class="tabbar"/);
  for (const label of ["בית", "מסלול", "מפה", "סביבי", "עוד"]) {
    assert.match(page, new RegExp(`>${label}<`), `bottom nav must show ${label}`);
  }
  assert.match(page, /class="chat-fab"/);
  assert.match(page, /href="\/chat"/);
  // never ship an empty image source — components fall back instead
  assert.doesNotMatch(page, /<img[^>]*src=""/);
});

test("home page renders the hero, the next gate to close and the trip previews", async () => {
  const page = await html("/");

  assert.match(page, /המסע המשפחתי/);
  assert.match(page, /אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי/);
  assert.match(page, /\/images\/cities\/tokyo\.jpg/);

  // before the trip: countdown + nearest checklist deadline; during: today mode
  const beforeTrip = /class="countdown"/.test(page);
  if (beforeTrip) {
    assert.match(page, /הדבר הבא שצריך לסגור/);
    assert.match(page, /ימים<\/span>/);
  } else {
    assert.match(page, /היום במסע/);
  }

  // route strip, booking gates and day previews
  assert.match(page, /ארבעה פרקים, עיר אחרי עיר/);
  assert.match(page, /class="route-card"/);
  for (const city of ["טוקיו", "קיוטו", "אוסקה"]) {
    assert.match(page, new RegExp(`<strong>${city}</strong>`));
  }
  assert.match(page, /שערי הזמנה/);
  assert.match(page, /status-chip st-/);
  assert.match(page, /Nintendo Museum/);
  assert.match(page, /class="day-card"/);
  assert.match(page, /href="\/day\/3"/);
  assert.match(page, /לכל המדריכים/);
});

test("home switches to today mode during the trip", async () => {
  // That server's clock is frozen mid-trip (tests/fixtures/freeze-date.mjs).
  const page = await html("/", midTrip);

  assert.match(page, /היום במסע/);
  assert.match(page, /PokéPark KANTO/);
  assert.match(page, /class="today-blocks"/);
  assert.match(page, /href="\/day\/5"/);
  assert.doesNotMatch(page, /הדבר הבא שצריך לסגור/);
});

test("itinerary renders city chapters and all seventeen day cards", async () => {
  const page = await html("/itinerary");

  assert.match(page, /המסלול שלנו, יום אחרי יום/);
  assert.match(page, /class="chapter"/);
  assert.match(page, /בדרך/);
  assert.match(page, /11–13\.10/);
  assert.match(page, /13–15\.10/);

  for (let day = 1; day <= 17; day += 1) {
    assert.match(page, new RegExp(`href="/day/${day}"`), `day ${day} must be linked`);
  }

  assert.match(page, /PokéPark KANTO/);
  assert.match(page, /Nintendo Museum/);
  assert.match(page, /class="tl-highlights"/);
});

test("day page renders blocks, cut-first chips, booking status and the day map", async () => {
  const page = await html("/day/4");

  assert.match(page, /teamLab|Mundo Pixar/);
  assert.match(page, /איך היום נראה/);
  assert.match(page, /class="block-time"/);
  assert.match(page, /לוותר בקלות/);
  assert.match(page, /status-chip st-(buy-now|booked|monitor|on-sale-soon|lottery|fallback)/);
  assert.match(page, /class="mini-map"/);
  assert.match(page, /אם יורד גשם/);
  assert.match(page, /עוגני אוכל/);
  assert.match(page, /המקומות של היום/);
  assert.match(page, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=/);
  assert.match(page, /href="\/day\/3"/);
  assert.match(page, /href="\/day\/5"/);
});

test("day five keeps the PokéPark plan with its official-only monitoring gate", async () => {
  const page = await html("/day/5");

  assert.match(page, /PokéPark/);
  assert.match(page, /Sky Shuttle|רכבל/);
  assert.match(page, /DisneySea/);
  assert.match(page, /status-chip st-monitor/);
  assert.match(page, /status-chip st-fallback/);
});

test("prepare renders every checklist group, deadlines and booking gates", async () => {
  const page = await html("/prepare");

  assert.match(page, /מגיעים מוכנים/);
  for (const group of [
    "כרטיסים ואטרקציות",
    "לינה, מסמכים וכסף",
    "אפליקציות ותקשורת",
    "בריאות והליכה",
    "ציוד ואריזה",
    "שבוע אחרון",
    "48 שעות ויום היציאה",
  ]) {
    assert.match(page, new RegExp(group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(page, /לקנות נעלי הליכה חדשות לארבעתנו/);
  assert.match(page, /Nintendo Museum/);
  assert.match(page, /Safety Tips/);
  assert.match(page, /לקנות Mundo Pixar ל־4\.10/);
  assert.match(page, /class="prep-check"/);
  assert.match(page, /class="due due-/);
  assert.match(page, /ייצוא/);
  assert.match(page, /22\.0°/);
  assert.match(page, /23\.4°/);
  assert.match(page, /23\.7°/);
});

test("guides index and a rendered guide keep the canonical documents readable", async () => {
  const index = await html("/guides");
  assert.match(index, /מחברת המסע/);
  assert.match(index, /class="guide-card"/);
  assert.match(index, /href="\/guide\/daily-itinerary"/);
  assert.match(index, /href="\/guide\/pre-trip-checklist"/);

  const guide = await html("/guide/flights");
  assert.match(guide, /class="guide-content"/);
  assert.match(guide, /BOOKED: Tel Aviv \(TLV\) to Tokyo Narita \(NRT\)/);
  assert.match(guide, /ET419/);
  assert.match(guide, /ET672/);
  assert.match(guide, /ET673/);
  assert.match(guide, /ET418/);
  assert.match(guide, /Tabata/);
  assert.doesNotMatch(guide, /travel to Ueno/);
  assert.doesNotMatch(guide, /Pre-booking Research Archive/);
  assert.doesNotMatch(guide, /Best Value: Etihad Airways/);
  assert.doesNotMatch(guide, /TARGET BOOKING WINDOW/);
});

test("map, around and chat render their full experiences", async () => {
  const map = await html("/map");
  assert.match(map, /מפת הטיול/);
  assert.match(map, /MapExplorer/);

  const around = await html("/around");
  assert.match(around, /מה יש סביבי/);
  assert.match(around, /AroundExplorer/);

  const chat = await html("/chat");
  assert.match(chat, /צ׳אט הטיול/);
  assert.match(chat, /ChatView/);
});

test("the chat ships a mic button and a read-aloud toggle", async () => {
  // Both controls are client-only (the SSR pass renders the composer skeleton),
  // so the contract is asserted on the component source.
  const view = await readFile(new URL("../components/chat/ChatView.tsx", import.meta.url), "utf8");

  assert.match(view, /aria-label=\{recorder\.recording \? "סיום הקלטה ושליחה" : "הקלטת הודעה קולית"\}/);
  assert.match(view, /className=\{`chat-mic/);
  assert.match(view, /"כיבוי הקראה אוטומטית"/);
  assert.match(view, /"הקראה אוטומטית של התשובות"/);
  assert.match(view, /aria-pressed=\{autoSpeak\}/);
  // The mic only exists on the durable transport: /api/chat cannot take audio.
  assert.match(view, /voiceEnabled=\{false\}/);

  const styles = await readFile(new URL("../app/chat/chat.css", import.meta.url), "utf8");
  assert.match(styles, /\.chat-mic\b/);
  assert.match(styles, /\.chat-recording\b/);
  assert.match(styles, /\.chat-speak\b/);
});

test("the composer carries a location toggle wired to both transports", async () => {
  const view = await readFile(new URL("../components/chat/ChatView.tsx", import.meta.url), "utf8");

  assert.match(view, /title="המיקום מצורף כדי שהסוכן ידע מה קרוב אליך"/);
  assert.match(view, /aria-label=\{geo\.enabled \? "כיבוי שיתוף מיקום עם הסוכן" : "שיתוף מיקום עם הסוכן"\}/);
  assert.match(view, /aria-pressed=\{geo\.enabled\}/);
  assert.match(view, /className=\{`chat-geo/);

  // The durable path awaits a fix; the fallback peeks at the cache so it never
  // gains a GPS wait, and strips the line back out before drawing the bubble.
  assert.match(view, /useEveChat\(\{ resolveContext: geo\.resolveContextLine \}\)/);
  assert.match(view, /geo\.peekContextLine\(\)/);
  assert.match(view, /stripContextLines\(raw\)/);

  const geo = await readFile(new URL("../components/chat/useGeoContext.ts", import.meta.url), "utf8");
  assert.match(geo, /"japan2026\.chat\.geo\.v1"/);
  assert.match(geo, /"japan2026\.chat\.geo\.enabled\.v1"/);
  // Lazily on send, short timeout, and a recent platform fix is good enough.
  assert.match(geo, /LOOKUP_TIMEOUT_MS = 4_000/);
  assert.match(geo, /POSITION_MAX_AGE_MS = 2 \* 60_000/);
  assert.doesNotMatch(geo, /useEffect\([^)]*getCurrentPosition/s, "never requested on mount");

  const styles = await readFile(new URL("../app/chat/chat.css", import.meta.url), "utf8");
  assert.match(styles, /\.chat-geo\b/);
});

/* ========================================================================== */
/* API routes                                                                  */
/* ========================================================================== */

test("advertises the eve transport only when both agent secrets are present", async () => {
  const off = await bare.fetch("/api/agent/enabled");
  assert.equal(off.status, 200);
  assert.deepEqual(await off.json(), { enabled: false });
  assert.match(off.headers.get("cache-control") ?? "", /no-store/);

  // EVE_URL alone is not enough — the relay would have no credential.
  const half = await partial.fetch("/api/agent/enabled");
  assert.deepEqual(await half.json(), { enabled: false });

  const on = await app.fetch("/api/agent/enabled");
  assert.deepEqual(await on.json(), { enabled: true });
  assert.match(on.headers.get("cache-control") ?? "", /no-store/);

  // Without the secrets, the relay refuses instead of leaking a 404 page.
  const relay = await bare.fetch("/api/agent/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: "hi" }),
  });
  assert.equal(relay.status, 503);
  assert.match((await relay.json()).error, /הסוכן המתמשך לא מוגדר/);
});

test("relays agent routes to eve with basic auth and streams NDJSON through", async () => {
  const seen = eve.calls.length;

  // Only the documented cursor parameter is forwarded.
  const stream = await app.fetch("/api/agent/session/ses_1/stream?startIndex=12&evil=1", {
    headers: { accept: "application/x-ndjson" },
  });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type") ?? "", /x-ndjson/);
  assert.equal(stream.headers.get("x-eve-session-id"), "ses_1");
  assert.match(stream.headers.get("cache-control") ?? "", /no-store/);
  assert.match(await stream.text(), /session\.waiting/);

  const streamCall = eve.calls[seen];
  assert.equal(streamCall.method, "GET");
  assert.equal(streamCall.url, "/eve/v1/session/ses_1/stream?startIndex=12");
  assert.equal(
    streamCall.headers.authorization,
    `Basic ${Buffer.from("family:s3cret").toString("base64")}`,
  );

  const cancel = await app.fetch("/api/agent/session/ses_1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(cancel.status, 200);
  await cancel.arrayBuffer();
  assert.equal(eve.calls[seen + 1].url, "/eve/v1/session/ses_1/cancel");
  assert.equal(eve.calls[seen + 1].method, "POST");

  // Anything outside the documented route set is rejected before it leaves.
  // Traversal attempts are normalized (by the client for `..`, by Next for the
  // percent-encoded form) and then fail the allowlist as a path or a method.
  for (const bogus of [
    "/api/agent/session/ses_1/../../admin",
    "/api/agent/session/ses_1/%2e%2e/admin",
  ]) {
    const response = await app.fetch(bogus);
    assert.ok(
      response.status === 404 || response.status === 405,
      `${bogus} must not be relayed (got ${response.status})`,
    );
    await response.arrayBuffer();
  }

  // A documented route called with the wrong method never reaches the agent.
  const wrongMethod = await app.fetch("/api/agent/session", {
    headers: { accept: "application/json" },
  });
  assert.equal(wrongMethod.status, 405);
  await wrongMethod.arrayBuffer();

  assert.equal(eve.calls.length, seen + 2, "no extra upstream call");
});

test("the relay streams NDJSON as it arrives instead of buffering the response", async () => {
  // A stub that holds the connection open between lines: the first line must
  // reach the client long before the upstream is done.
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8" });
    response.write('{"type":"turn.started"}\n');
    setTimeout(() => response.end('{"type":"turn.completed"}\n'), 2000);
  });
  const port = await freePort();
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  stubs.push(server);

  const slow = await startNext({
    EVE_URL: `http://127.0.0.1:${port}`,
    EVE_SHARED_SECRET: "s3cret",
  });

  const started = Date.now();
  const response = await slow.fetch("/api/agent/session/ses_9/stream?startIndex=0");
  const reader = response.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  const elapsed = Date.now() - started;

  assert.match(first, /turn\.started/);
  assert.ok(elapsed < 1500, `first chunk must not wait for the upstream (took ${elapsed}ms)`);
  await reader.cancel();
});

test("read-aloud answers 503 without a gateway key, so the browser voice takes over", async () => {
  const response = await app.fetch("/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "שלום" }),
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /Vercel AI Gateway/);

  const wrongMethod = await app.fetch("/api/tts");
  assert.equal(wrongMethod.status, 405);
  await wrongMethod.arrayBuffer();
});

test("the chat endpoint answers a Hebrew setup card without a gateway connection", async () => {
  const response = await app.fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", parts: [{ type: "text", text: "שלום" }] }] }),
  });
  assert.equal(response.status, 503);

  const body = await response.json();
  assert.match(body.error, /AI Gateway/);
  assert.match(body.hint, /AI_GATEWAY_API_KEY|vercel env pull/);

  const wrongMethod = await app.fetch("/api/chat");
  assert.equal(wrongMethod.status, 405);
  await wrongMethod.arrayBuffer();
});

/* ========================================================================== */
/* Static assets and content                                                   */
/* ========================================================================== */

test("serves the PWA manifest and service worker from the app origin", async () => {
  const manifest = await app.fetch("/manifest.webmanifest");
  assert.equal(manifest.status, 200);
  assert.match(JSON.stringify(await manifest.json()), /יפן/);

  const worker = await app.fetch("/sw.js");
  assert.equal(worker.status, 200);
  assert.match(await worker.text(), /caches/);
});

test("keeps all generated guides synchronized with the canonical Markdown", async () => {
  const sourceRoot = new URL("../../JAPAN2026/", import.meta.url);
  const publicRoot = new URL("../public/markdown/", import.meta.url);
  const files = (await readdir(sourceRoot))
    .filter((file) => /^\d{2}-.*\.md$/.test(file) && !file.includes("ARCHIVE"))
    .sort();

  assert.equal(files.length, 12);

  for (const file of files) {
    const [source, published] = await Promise.all([
      readFile(new URL(file, sourceRoot), "utf8"),
      readFile(new URL(file, publicRoot), "utf8"),
    ]);
    assert.equal(published, source, `${file} must be synchronized`);
  }

  const generated = await readFile(
    new URL("../app/generated/trip-content.ts", import.meta.url),
    "utf8",
  );
  assert.match(generated, /Nintendo Museum/);
  assert.match(generated, /KAWAII MONSTER LAND/);
  assert.match(generated, /Todoroki Ravine/);
  assert.match(generated, /Shimokitazawa Curry Festival/);
  assert.match(generated, /Shiro-Hige/);
  assert.match(generated, /Mizuekai/);
  assert.match(generated, /DRUM TAO HIBIKI/);
  assert.match(generated, /UZUMASA Kyoto Village/);
  assert.match(generated, /Fushimi Inari/);
  assert.match(generated, /Taiko-kan/);
  assert.match(generated, /Buy new walking shoes for everyone/);
  assert.doesNotMatch(generated, /Light Manga-morning snack/);
  assert.doesNotMatch(generated, /CHECK IF STILL OPEN/);
  assert.doesNotMatch(generated, /Tokyo Oct 2–13 · Osaka Oct 13–15/);
  assert.doesNotMatch(generated, /Ghibli Museum · Oct 11/);
  assert.doesNotMatch(generated, /September 15, 2026 at 18:00 JST/);
  assert.doesNotMatch(generated, /travel with just daypacks on the night bus/);
  assert.doesNotMatch(
    generated,
    /Yokohama|Chicken Ramen Factory|Cup Noodles|World Porters|Cosmo World|Chinatown/,
  );
});

test("ships a production social card", async () => {
  const socialCard = await stat(new URL("../public/og.png", import.meta.url));
  assert.ok(socialCard.size > 100_000);

  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /summary_large_image/);
});
