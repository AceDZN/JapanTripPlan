#!/usr/bin/env node
// Bundles the canonical trip content into agent/data/content.ts as plain TS
// literals, so the agent never depends on the filesystem at runtime (Vercel
// functions do not ship ../web/data).
//
// Sources:
//   Convex /agent/export     (canonical guides — the trip lives there)
//   ../web/data/places.json  (map/place database shared with the webapp)
//
// Run: npm run sync-data   (also wired as predev / prebuild)

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const placesFile = join(repoRoot, "web", "data", "places.json");
const outFile = join(appRoot, "agent", "data", "content.ts");

/*
 * GUIDES COME FROM CONVEX NOW.
 *
 * They used to be read from ../JAPAN2026/*.md. Those files are gone — the trip
 * lives in Convex and the guides are edited there, so a copy on disk was a
 * second source that could disagree with the first.
 *
 * Places are still a repo file (web/data/places.json); only the guides moved.
 */
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
const AGENT_SERVICE_KEY = process.env.AGENT_SERVICE_KEY;

/**
 * Fall back to the committed bundle rather than failing the build.
 *
 * A Vercel deployment uploads only trip-agent/, so ../web/data is absent, and
 * the Convex credentials may not be present in every build environment.
 * `agent/data/content.ts` is committed precisely so those builds can proceed —
 * but only if the bundle actually exists to fall back to.
 */
function keepCommittedBundle(reason) {
  if (existsSync(outFile)) {
    console.log(`sync-data: ${reason} — keeping the committed agent/data/content.ts`);
    process.exit(0);
  }
  console.error(`sync-data: ${reason}, and no committed ${outFile} to fall back to.`);
  process.exit(1);
}

if (!existsSync(placesFile)) keepCommittedBundle("places source not present (deployment build?)");
if (!CONVEX_SITE_URL || !AGENT_SERVICE_KEY) {
  keepCommittedBundle("CONVEX_SITE_URL / AGENT_SERVICE_KEY not set");
}

/** First `# heading` in the body, falling back to a readable filename. */
function titleOf(markdown, file) {
  for (const line of markdown.split("\n")) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return file.replace(/\.md$/, "");
}

const response = await fetch(`${CONVEX_SITE_URL}/agent/export`, {
  headers: { Authorization: `Bearer ${AGENT_SERVICE_KEY}` },
  cache: "no-store",
});
const exported = await response.json().catch(() => null);
if (!response.ok || !exported?.ok || !Array.isArray(exported.guides)) {
  console.error(
    `sync-data: Convex /agent/export failed (${response.status}): ` +
      `${JSON.stringify(exported)?.slice(0, 300)}`,
  );
  process.exit(1);
}

const guides = exported.guides
  .slice()
  .sort((a, b) => a.order - b.order)
  .map(({ file, markdown }) => ({ file, title: titleOf(markdown, file), markdown }));

if (guides.length === 0) {
  console.error("sync-data: Convex returned no guides — refusing to bake an empty bundle.");
  process.exit(1);
}

const places = JSON.parse(readFileSync(placesFile, "utf8"));
if (!Array.isArray(places) || places.length === 0) {
  throw new Error(`No places found in ${placesFile}`);
}

const header = `// generated — run npm run sync-data
// Source of truth: Convex (guides) and web/data/places.json (places).
// Do not edit by hand; edits are overwritten on the next sync.
`;

const types = `
export type Guide = {
  /** Stable guide file name, e.g. "09-DAILY-ITINERARY.md". */
  file: string;
  /** First markdown H1 of the guide. */
  title: string;
  markdown: string;
};

export type PlaceCity = "tokyo" | "kyoto" | "osaka" | "kamakura" | "uji" | "other";

export type PlaceCategory =
  | "attraction"
  | "food"
  | "shopping"
  | "nature"
  | "culture"
  | "gaming"
  | "kawaii"
  | "viewpoint"
  | "stay"
  | "transport"
  | "event";

export type Place = {
  id: string;
  nameHe: string;
  nameEn: string;
  category: PlaceCategory;
  area: string;
  city: PlaceCity;
  lat: number;
  lng: number;
  /** Trip day numbers (1..17) this place appears on; [] for unscheduled extras. */
  days: number[];
  /** true = part of the itinerary, false = nearby-extra recommendation. */
  planned: boolean;
  descriptionHe: string;
  tips?: string;
  image?: string;
  officialUrl?: string;
  mapsQuery?: string;
  priceLevel?: number;
  mustDo?: boolean;
  indoor?: boolean;
  openingHours?: string;
  /** Trilingual + operational fields added with the day-page rebuild. */
  nameJa?: string;
  addressEn?: string;
  addressJa?: string;
  phone?: string;
  nearestStation?: { he: string; en?: string; ja?: string };
  stationExit?: { he: string; en?: string; ja?: string };
  walkMinutes?: number;
  closedDays?: string;
  lastEntry?: string;
  ticketNote?: string;
};
`;

const body = `
export const guides: Guide[] = ${JSON.stringify(guides, null, 2)};

export const places: Place[] = ${JSON.stringify(places, null, 2)};

export const guideFiles = guides.map((g) => g.file);

export default { guides, places };
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, header + types + body, "utf8");

const bytes = Buffer.byteLength(header + types + body, "utf8");
console.log(
  `sync-data: ${guides.length} guides + ${places.length} places -> agent/data/content.ts (${Math.round(bytes / 1024)} KB)`,
);
