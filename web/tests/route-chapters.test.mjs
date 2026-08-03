/*
 * The trip's four chapters, derived rather than typed.
 *
 * `routeChapters` replaced a hand-written array in the deleted `trip-data.ts`.
 * These assert the two things that array got right and the one thing it got
 * wrong, so the derivation cannot quietly regress into either.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

/**
 * Same loader as `money.test.mjs`: transpile the module and rewrite its `@/`
 * specifiers, because Node's type stripping does not read tsconfig path
 * aliases and the app code should not have to know that.
 */
function load(relative, rewrites = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  let js = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(rewrites)) {
    js = js.replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

const labelsUrl = load("../lib/labels.ts");
const { routeChapters } = await import(
  load("../lib/route-chapters.ts", { "@/lib/labels": labelsUrl })
);

/**
 * A miniature of the real shape: one night in the air, four bases, two day
 * trips that leave the base unchanged (day 7 Kamakura, day 15 Uji), and a
 * final day with no bed because everyone is on a plane home.
 */
const day = (n, city, stayPlaceId) => ({
  day: n,
  date: `2026-10-${String(n).padStart(2, "0")}`,
  dateHe: "",
  shortDate: `${n}.10`,
  title: `יום ${n}`,
  area: "",
  theme: "",
  city,
  heroImage: "",
  color: "#000",
  blocks: [],
  highlights: [],
  ...(stayPlaceId ? { stay: { placeId: stayPlaceId, label: stayPlaceId } } : {}),
});

const DAYS = [
  // Day 1 has a `stay` — "a night in the air" — but no placeId.
  { ...day(1, "other"), stay: { label: "לילה באוויר — ET672 בדרך לנריטה" } },
  ...[2, 3, 4, 5, 6].map((n) => day(n, "tokyo", "tabata-base")),
  day(7, "kamakura", "tabata-base"),
  ...[8, 9, 10].map((n) => day(n, "tokyo", "tabata-base")),
  ...[11, 12].map((n) => day(n, "kyoto", "fushimi-inari-apartment")),
  ...[13, 14].map((n) => day(n, "osaka", "namba-base")),
  day(15, "uji", "ueno-inaricho-base"),
  day(16, "tokyo", "ueno-inaricho-base"),
  day(17, "tokyo", null),
];

test("four chapters, one per base — not one per city", () => {
  const chapters = routeChapters(DAYS);

  // Six would mean the day trips split their runs: Kamakura out of Tokyo and
  // Uji out of Osaka are excursions, not moves.
  assert.equal(chapters.length, 4);
  assert.deepEqual(
    chapters.map((c) => c.label),
    ["טוקיו", "קיוטו", "אוסקה", "טוקיו"],
  );
});

test("the date range runs check-in to check-out, with the month said once", () => {
  assert.deepEqual(
    routeChapters(DAYS).map((c) => c.dates),
    ["2–11.10", "11–13.10", "13–15.10", "15–17.10"],
  );
});

test("a night in the air is not a chapter", () => {
  const chapters = routeChapters(DAYS);
  assert.ok(
    !chapters.some((c) => c.days.includes(1)),
    "day 1 has a `stay` but no place — a seat on ET672 is not a base",
  );
});

test("every day from 2 to 17 lands in a chapter", () => {
  const covered = new Set(routeChapters(DAYS).flatMap((c) => c.days));
  for (let n = 2; n <= 17; n += 1) {
    assert.ok(covered.has(n), `day ${n} vanished off the itinerary page`);
  }
});

test("a day with no bed joins the chapter it follows", () => {
  const last = routeChapters(DAYS).at(-1);
  assert.deepEqual(last.days, [15, 16, 17]);
});

test("the chapter takes its city from its last day, not its first", () => {
  // Day 15 is spent in Uji but slept in Tokyo; reading the city off the first
  // day of the run would label the final chapter "אוג׳י".
  assert.equal(routeChapters(DAYS).at(-1).label, "טוקיו");
});
