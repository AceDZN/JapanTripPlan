#!/usr/bin/env node
// Bundles the canonical trip content into agent/data/content.ts as plain TS
// literals, so the agent never depends on the filesystem at runtime (Vercel
// functions do not ship ../JAPAN2026 or ../web/data).
//
// Sources:
//   ../JAPAN2026/*.md        (canonical guides; *ARCHIVE* files are skipped)
//   ../web/data/places.json  (map/place database shared with the webapp)
//
// Run: npm run sync-data   (also wired as predev / prebuild)

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..");
const guidesDir = join(repoRoot, "JAPAN2026");
const placesFile = join(repoRoot, "web", "data", "places.json");
const outFile = join(appRoot, "agent", "data", "content.ts");

// A Vercel deployment uploads only trip-agent/, so ../JAPAN2026 and
// ../web/data are absent at build time. agent/data/content.ts is committed, so
// the correct behaviour there is to keep the checked-in bundle and move on —
// but only if that bundle actually exists.
if (!existsSync(guidesDir) || !existsSync(placesFile)) {
  if (existsSync(outFile)) {
    console.log(
      "sync-data: repo sources not present (deployment build?) — keeping the committed agent/data/content.ts",
    );
    process.exit(0);
  }
  console.error(
    `sync-data: missing sources (${guidesDir}, ${placesFile}) and no committed ${outFile} to fall back to.`,
  );
  process.exit(1);
}

/** First `# heading` in the file, falling back to a readable filename. */
function titleOf(markdown, file) {
  for (const line of markdown.split("\n")) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return file.replace(/\.md$/, "");
}

const guideFiles = readdirSync(guidesDir)
  .filter((f) => f.endsWith(".md"))
  .filter((f) => !/ARCHIVE/i.test(f))
  .sort();

const guides = guideFiles.map((file) => {
  const markdown = readFileSync(join(guidesDir, file), "utf8");
  return { file, title: titleOf(markdown, file), markdown };
});

const places = JSON.parse(readFileSync(placesFile, "utf8"));
if (!Array.isArray(places) || places.length === 0) {
  throw new Error(`No places found in ${placesFile}`);
}

const header = `// generated — run npm run sync-data
// Source of truth: JAPAN2026/*.md and web/data/places.json in the repo root.
// Do not edit by hand; edits are overwritten on the next sync.
`;

const types = `
export type Guide = {
  /** File name inside JAPAN2026/, e.g. "09-DAILY-ITINERARY.md". */
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
