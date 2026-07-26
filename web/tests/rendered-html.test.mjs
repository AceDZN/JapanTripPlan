import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

async function html(pathname) {
  const response = await render(pathname);
  assert.equal(response.status, 200, `${pathname} must render`);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  return response.text();
}

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
  const RealDate = Date;
  const frozen = new RealDate("2026-10-05T09:00:00+09:00").getTime();
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(frozen);
      else super(...args);
    }
    static now() {
      return frozen;
    }
  }
  globalThis.Date = FrozenDate;

  try {
    const page = await html("/");
    assert.match(page, /היום במסע/);
    assert.match(page, /PokéPark KANTO/);
    assert.match(page, /class="today-blocks"/);
    assert.match(page, /href="\/day\/5"/);
    assert.doesNotMatch(page, /הדבר הבא שצריך לסגור/);
  } finally {
    globalThis.Date = RealDate;
  }
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
  assert.doesNotMatch(generated, /Yokohama|Chicken Ramen Factory|Cup Noodles|World Porters|Cosmo World|Chinatown/);
});

test("ships a production social card", async () => {
  const socialCard = await stat(new URL("../public/og.png", import.meta.url));
  assert.ok(socialCard.size > 100_000);

  const layout = await readFile(
    new URL("../app/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /summary_large_image/);
});
