/**
 * Phase 1 — import the current hand-maintained trip data into Convex, then
 * prove nothing was lost.
 *
 *   npm run import:convex
 *
 * Sources (all still authoritative at this point in the migration):
 *   web/lib/trip-data.ts       17 days with their ordered blocks
 *   web/data/places.json       154 places
 *   web/lib/checklist-data.ts  59 checklist items + their group order
 *   ../JAPAN2026/*.md          the 12 guide documents, verbatim
 *
 * The script is idempotent — every mutation upserts on the natural key — so it
 * can be re-run freely while we iterate.
 *
 * It finishes by reading the whole trip back out of Convex and deep-comparing
 * it against those same sources. That comparison is the migration's safety
 * net: until it passes clean, nothing downstream is allowed to switch over.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { tripDays } from "../lib/trip-data";
import { checklistGroups, checklistItems } from "../lib/checklist-data";
import placesJson from "../data/places.json";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const guidesDir = path.resolve(webRoot, "..", "JAPAN2026");

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

if (!SITE_URL) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set (check web/.env.local)");
if (!KEY) throw new Error("AGENT_SERVICE_KEY is not set — export it or add it to web/.env.local");

/** Same metadata table `sync-content.mjs` uses, so titles/categories carry over unchanged. */
const guideMeta: Record<string, [string, string, string]> = {
  "00-OVERVIEW.md": ["תמונת מצב", "המסלול המשפחתי השלם, סדרי העדיפויות ושערי ההזמנה", "overview"],
  "01-FLIGHTS.md": ["טיסות", "מסלול הטיסות הסגור והפרטים שעוד צריך להשלים", "flights"],
  "02-ACCOMMODATION.md": ["לינה", "המלונות המובילים, מחירים והחלטות פתוחות", "stay"],
  "03-TRANSPORT.md": ["תחבורה", "כל המעברים של המסלול השלם, כולל קיוטו, אוסקה ואוג׳י", "transport"],
  "04-ANIME-POKEMON-GHIBLI.md": ["אנימה, גיימינג וקוואי", "PokePark, נינטנדו, ג׳יבלי, UZUMASA, מנגה וחוויות קוואי", "anime"],
  "05-FOOD-GUIDE.md": ["ראמן ואוכל", "חוויות ראמן, אוכל משפחתי וארוחות העוגן של כל יום", "food"],
  "06-DAY-TRIPS.md": ["טיולי יום", "קמקורה ואנושימה, ויום טודורוקי־סטגאיה של פארקים, טוטורו ופסטיבל קארי", "daytrips"],
  "07-BAR-MITZVAH.md": ["החגיגה המשפחתית", "Tokyo Dome City, זמן משפחתי וארוחת חגיגה", "mitzvah"],
  "08-PRACTICAL-TIPS.md": ["טיפים שימושיים", "אריזה, אינטרנט, כסף, אפליקציות והתנהלות", "tips"],
  "09-DAILY-ITINERARY.md": ["המסלול היומי", "17 ימים של אנימה, גיימינג, ראמן וקוואי בקצב משפחתי", "itinerary"],
  "10-BUDGET.md": ["תקציב", "מעטפות עלות, רישום הזמנות ושליטה בהוצאות המשתנות", "budget"],
  "11-PRE-TRIP-CHECKLIST.md": ["הכנות לטיול", "מה עושים, מתי ואיפה — כרטיסים, אפליקציות, מסמכים, מזג אוויר וציוד", "checklist"],
};

async function post(kind: string, rows: unknown[], extra: Record<string, unknown> = {}) {
  const response = await fetch(`${SITE_URL}/agent/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ kind, rows, ...extra }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`import ${kind} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

/** Drop undefined-valued keys so comparisons match Convex, which omits them. */
function clean<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out as Partial<T>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------- import ---

async function importAll() {
  // Days (without blocks — those go per-day so ordering is unambiguous).
  await post(
    "days",
    tripDays.map((d) =>
      clean({
        n: d.day,
        date: d.date,
        dateHe: d.dateHe,
        shortDate: d.shortDate,
        title: d.title,
        area: d.area,
        theme: d.theme,
        city: d.city,
        color: d.color,
        heroImage: d.heroImage,
        highlights: d.highlights,
        note: d.note,
        rainPlan: d.rainPlan,
        foodAnchorIds: d.foodAnchors ?? [],
        discovery: d.discovery,
      }),
    ),
  );
  console.log(`  days              ${tripDays.length}`);

  let blockCount = 0;
  for (const day of tripDays) {
    const rows = day.blocks.map((b, index) =>
      clean({
        order: index,
        time: b.time,
        title: b.title,
        detail: b.detail,
        placeIds: b.placeIds,
        cutFirst: b.cutFirst,
        booking: b.booking,
      }),
    );
    await post("blocks", rows, { dayN: day.day });
    blockCount += rows.length;
  }
  console.log(`  blocks            ${blockCount}`);

  // `officialUrl` and `priceLevel` are deliberately dropped — the exploration
  // confirmed nothing in the app or the agent reads them.
  const places = (placesJson as Record<string, unknown>[]).map((p) =>
    clean({
      slug: p.id as string,
      nameHe: p.nameHe,
      nameEn: p.nameEn,
      category: p.category,
      area: p.area,
      city: p.city,
      lat: p.lat,
      lng: p.lng,
      days: p.days,
      planned: p.planned,
      descriptionHe: p.descriptionHe,
      tips: p.tips,
      image: p.image,
      mapsQuery: p.mapsQuery,
      mustDo: p.mustDo,
      indoor: p.indoor,
      openingHours: p.openingHours,
    }),
  );
  for (const batch of chunk(places, 40)) await post("places", batch);
  console.log(`  places            ${places.length}`);

  await post(
    "checklistGroups",
    checklistGroups.map((title, order) => ({ title, order })),
  );
  console.log(`  checklistGroups   ${checklistGroups.length}`);

  const items = checklistItems.map((item, order) =>
    clean({
      slug: item.id,
      group: item.group,
      order,
      title: item.title,
      detail: item.detail,
      due: item.due,
      url: item.url,
      critical: item.critical,
    }),
  );
  for (const batch of chunk(items, 30)) await post("checklistItems", batch);
  console.log(`  checklistItems    ${items.length}`);

  // All 12 guides go in verbatim with `generated: false`. Phase 2 is what
  // splits 09 and 11 into preamble/postamble and flips them to generated —
  // keeping them whole here means the parity gate can be strict.
  const files = Object.keys(guideMeta).sort();
  for (const [order, file] of files.entries()) {
    const markdown = await readFile(path.join(guidesDir, file), "utf8");
    const [titleHe, descriptionHe, category] = guideMeta[file];
    await post("guides", [
      {
        slug: file.replace(/^\d+-/, "").replace(/\.md$/, "").toLowerCase(),
        file,
        order,
        titleHe,
        descriptionHe,
        category,
        bodyHe: markdown,
        generated: false,
      },
    ]);
  }
  console.log(`  guides            ${files.length}`);
}

// ------------------------------------------------------------ parity gate ---

type Diff = { what: string; key: string; expected: unknown; actual: unknown };

/**
 * Order-independent serialisation. Convex returns object keys alphabetically
 * while the source files use authoring order, so a plain JSON.stringify
 * comparison reports every record as different. Array order is preserved —
 * block and highlight ordering is real data.
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, stable(v)]),
    );
  }
  return value;
}

/** Field-level diff, so a failure says which key is wrong rather than dumping both records. */
function fieldDiff(expected: unknown, actual: unknown): Record<string, { expected: unknown; actual: unknown }> {
  const out: Record<string, { expected: unknown; actual: unknown }> = {};
  const e = (expected ?? {}) as Record<string, unknown>;
  const a = (actual ?? {}) as Record<string, unknown>;
  for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
    if (JSON.stringify(e[key]) !== JSON.stringify(a[key])) {
      out[key] = { expected: e[key], actual: a[key] };
    }
  }
  return out;
}

function compare(what: string, key: string, expected: unknown, actual: unknown, diffs: Diff[]) {
  const a = JSON.stringify(stable(expected));
  const b = JSON.stringify(stable(actual));
  if (a !== b) {
    const fields = fieldDiff(stable(expected), stable(actual));
    diffs.push({ what, key, expected: fields, actual: Object.keys(fields) });
  }
}

async function verify(): Promise<Diff[]> {
  const response = await fetch(`${SITE_URL}/agent/snapshot`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const snapshot = await response.json();
  if (!response.ok || !snapshot.ok) {
    throw new Error(`snapshot failed (${response.status}): ${JSON.stringify(snapshot)}`);
  }

  const diffs: Diff[] = [];

  // --- days + blocks
  const actualDays = new Map<number, Record<string, unknown>>(
    snapshot.days.map((d: Record<string, unknown>) => [d.day as number, d]),
  );
  for (const expected of tripDays) {
    const actual = actualDays.get(expected.day);
    if (!actual) {
      diffs.push({ what: "day", key: String(expected.day), expected: "present", actual: "missing" });
      continue;
    }
    compare("day", String(expected.day), clean({
      day: expected.day,
      date: expected.date,
      dateHe: expected.dateHe,
      shortDate: expected.shortDate,
      title: expected.title,
      area: expected.area,
      theme: expected.theme,
      city: expected.city,
      heroImage: expected.heroImage,
      color: expected.color,
      highlights: expected.highlights,
      note: expected.note,
      rainPlan: expected.rainPlan,
      foodAnchors: expected.foodAnchors ?? [],
      discovery: expected.discovery,
      blocks: expected.blocks.map((b) => clean({
        time: b.time,
        title: b.title,
        placeIds: b.placeIds,
        detail: b.detail,
        cutFirst: b.cutFirst,
        booking: b.booking,
      })),
    }), clean({
      day: actual.day,
      date: actual.date,
      dateHe: actual.dateHe,
      shortDate: actual.shortDate,
      title: actual.title,
      area: actual.area,
      theme: actual.theme,
      city: actual.city,
      heroImage: actual.heroImage,
      color: actual.color,
      highlights: actual.highlights,
      note: actual.note,
      rainPlan: actual.rainPlan,
      foodAnchors: actual.foodAnchors,
      discovery: actual.discovery,
      blocks: (actual.blocks as Record<string, unknown>[]).map(clean),
    }), diffs);
  }

  // --- places
  const actualPlaces = new Map<string, Record<string, unknown>>(
    snapshot.places.map((p: Record<string, unknown>) => [p.id as string, p]),
  );
  for (const raw of placesJson as Record<string, unknown>[]) {
    const actual = actualPlaces.get(raw.id as string);
    if (!actual) {
      diffs.push({ what: "place", key: raw.id as string, expected: "present", actual: "missing" });
      continue;
    }
    const { officialUrl, priceLevel, ...expected } = raw;
    compare("place", raw.id as string, clean(expected), clean(actual), diffs);
  }

  // --- checklist
  const actualItems = new Map<string, Record<string, unknown>>(
    snapshot.checklist.items.map((i: Record<string, unknown>) => [i.id as string, i]),
  );
  for (const expected of checklistItems) {
    const actual = actualItems.get(expected.id);
    if (!actual) {
      diffs.push({ what: "checklistItem", key: expected.id, expected: "present", actual: "missing" });
      continue;
    }
    compare("checklistItem", expected.id, clean({ ...expected }), clean(actual), diffs);
  }
  compare("checklistGroups", "order", [...checklistGroups], snapshot.checklist.groups, diffs);

  // --- guides: full body must round-trip byte-identical
  for (const file of Object.keys(guideMeta)) {
    const slug = file.replace(/^\d+-/, "").replace(/\.md$/, "").toLowerCase();
    const expectedBody = await readFile(path.join(guidesDir, file), "utf8");
    const guideResponse = await fetch(`${SITE_URL}/agent/guide?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${KEY}` },
    });
    const guideBody = await guideResponse.json();
    if (!guideResponse.ok || !guideBody.ok) {
      diffs.push({ what: "guide", key: slug, expected: "present", actual: `HTTP ${guideResponse.status}` });
      continue;
    }
    if (guideBody.guide.body !== expectedBody) {
      diffs.push({
        what: "guide",
        key: slug,
        expected: `${expectedBody.length} chars`,
        actual: `${String(guideBody.guide.body).length} chars`,
      });
    }
  }

  return diffs;
}

// ------------------------------------------------------------------- main ---

console.log(`Importing into ${SITE_URL}`);
await importAll();

console.log("\nVerifying round-trip against the live source files...");
const diffs = await verify();

if (diffs.length === 0) {
  console.log("\n✅ Parity gate PASSED — Convex holds exactly what the app holds today.");
  process.exit(0);
}

console.error(`\n❌ Parity gate FAILED — ${diffs.length} difference(s):\n`);
for (const diff of diffs.slice(0, 20)) {
  console.error(`  [${diff.what}] ${diff.key} — differing fields: ${JSON.stringify(diff.actual)}`);
  console.error(`    ${JSON.stringify(diff.expected).slice(0, 600)}\n`);
}
if (diffs.length > 20) console.error(`  ...and ${diffs.length - 20} more`);
process.exit(1);
