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

test("server-renders the family-first home page and urgent booking gates", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /המסע המשפחתי/);
  assert.match(html, /אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי/);
  assert.match(html, /Nintendo Museum/);
  assert.match(html, /PokePark Kanto/);
  assert.match(html, /DisneySea/);
  assert.match(html, /USJ \+ Express מדויק/);
});

test("server-renders the updated 17-day itinerary", async () => {
  const response = await render("/itinerary");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /כל יום עבר את מבחן המשפחה/);
  assert.match(html, /Neco Republic/);
  assert.match(html, /KAWAII MONSTER LAND/);
  assert.match(html, /Tokyo Joypolis/);
  assert.match(html, /Mundo Pixar נכנס בדיוק/);
  assert.match(html, /Pokémon Card Game על בניין עיריית טוקיו/);
  assert.match(html, /ערוץ טודורוקי/);
  assert.match(html, /פחזניות טוטורו/);
  assert.match(html, /Shimokitazawa Curry Festival/);
  assert.match(html, /קיוטו: מיזואקאי ואוואטה/);
  assert.match(html, /UZUMASA ו־DRUM TAO/);
  assert.match(html, /שערי הטוריאי התחתונים/);
  assert.match(html, /מקלות אכילה עם שם ב־Yūzen Fushimi/);
  assert.match(html, /Taiko-kan לפני 15:00/);
  assert.match(html, /Nintendo Museum וטוקיו/);
  assert.match(html, /Pokémon Café, תופים ואסאקוסה/);
  assert.doesNotMatch(html, /Osaka Castle/);
  assert.doesNotMatch(html, /Tokyo Yosakoi/);
  assert.doesNotMatch(html, /Oeshiki/);
});

test("server-renders the preparation tracker, weather and walking-shoe action", async () => {
  const response = await render("/prepare");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /מגיעים מוכנים/);
  assert.match(html, /לקנות נעלי הליכה חדשות לכולם/);
  assert.match(html, /Nintendo Museum/);
  assert.match(html, /Safety Tips/);
  assert.match(html, /להחליט אם מוסיפים Mundo Pixar/);
  assert.match(html, /22\.0°/);
  assert.match(html, /23\.4°/);
  assert.match(html, /23\.7°/);
  assert.match(html, /WHAT · WHEN · WHERE/);
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
