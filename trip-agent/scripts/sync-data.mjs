#!/usr/bin/env node
// Bundles the canonical trip content into agent/data/content.ts as plain TS
// literals, so the agent never depends on the filesystem at runtime (Vercel
// functions do not ship ../web/data).
//
// Sources — both Convex, which is the only place the trip lives:
//   /agent/export          canonical guides
//   /agent/content/places  the place database
//
// Run: npm run sync-data   (also wired as predev / prebuild)

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const outFile = join(appRoot, "agent", "data", "content.ts");

/*
 * EVERYTHING COMES FROM CONVEX NOW.
 *
 * Guides used to be read from ../JAPAN2026/*.md and places from
 * ../web/data/places.json. Both are gone. The trip lives in Convex, and a copy
 * on disk was a second source that could — and did — disagree with the first:
 * the webapp read places from Convex while this agent read them from the JSON,
 * so a place corrected in the app stayed wrong in every answer eve gave.
 *
 * What this bundle still is: an OFFLINE FALLBACK, not a rival source. The tools
 * read Convex live on every call (`agent/lib/content.ts`) and drop back to what
 * is baked here only when Convex cannot be reached. So the worst case is an
 * answer from the last deploy rather than no answer at all — and there is no
 * longer any path where a stale copy wins over a live one.
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

/**
 * Refresh the guides from Convex — but never fail the build over it.
 *
 * This is a CONTENT REFRESH, not a correctness requirement: `content.ts` is
 * committed, so a build that cannot reach Convex can still ship a working agent
 * with the last known-good guides. Exiting non-zero here took down a Vercel
 * deploy once already, and "the assistant's guides are a commit behind" is a far
 * better outcome than "the assistant is not deployed".
 *
 * The most common cause of a 404 here, worth stating because it costs an hour
 * to spot: Convex serves HTTP actions from `<deployment>.convex.SITE`, while
 * `<deployment>.convex.CLOUD` is the client/query endpoint. Pointing
 * `CONVEX_SITE_URL` at the `.cloud` host returns exactly a 404 with an empty
 * body, which looks like a missing route rather than a wrong host.
 */
async function fetchGuidesFromConvex() {
  let response;
  try {
    response = await fetch(`${CONVEX_SITE_URL}/agent/export`, {
      headers: { Authorization: `Bearer ${AGENT_SERVICE_KEY}` },
      cache: "no-store",
    });
  } catch (error) {
    return { error: `network error reaching ${CONVEX_SITE_URL} (${error})` };
  }

  const body = await response.json().catch(() => null);

  if (response.status === 404) {
    return {
      error:
        `/agent/export returned 404 at ${CONVEX_SITE_URL}. ` +
        `HTTP routes live on the \`.convex.site\` host — check CONVEX_SITE_URL is not the \`.convex.cloud\` URL, ` +
        `and that this deployment has the functions deployed.`,
    };
  }
  if (response.status === 401) {
    return { error: `/agent/export returned 401 — AGENT_SERVICE_KEY does not match this deployment.` };
  }
  if (!response.ok || !body?.ok || !Array.isArray(body.guides)) {
    return {
      error: `/agent/export failed (${response.status}): ${JSON.stringify(body)?.slice(0, 200)}`,
    };
  }
  if (body.guides.length === 0) {
    return { error: "Convex returned no guides — refusing to bake an empty bundle." };
  }

  return {
    guides: body.guides
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(({ file, markdown }) => ({ file, title: titleOf(markdown, file), markdown })),
  };
}

/** The place database, from the same deployment the guides came from. */
async function fetchPlacesFromConvex() {
  let response;
  try {
    response = await fetch(`${CONVEX_SITE_URL}/agent/content/places`, {
      headers: { Authorization: `Bearer ${AGENT_SERVICE_KEY}` },
      cache: "no-store",
    });
  } catch (error) {
    return { error: `network error reaching ${CONVEX_SITE_URL} (${error})` };
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok || !Array.isArray(body.places)) {
    return {
      error: `/agent/content/places failed (${response.status}): ${JSON.stringify(body)?.slice(0, 200)}`,
    };
  }
  if (body.places.length === 0) {
    return { error: "Convex returned no places — refusing to bake an empty bundle." };
  }
  return { places: body.places };
}

const fetched = await fetchGuidesFromConvex();
if (fetched.error) keepCommittedBundle(`could not refresh guides — ${fetched.error}`);
const guides = fetched.guides;

const fetchedPlaces = await fetchPlacesFromConvex();
if (fetchedPlaces.error) keepCommittedBundle(`could not refresh places — ${fetchedPlaces.error}`);
const places = fetchedPlaces.places;

const header = `// generated — run npm run sync-data
// Source of truth: Convex. This file is an OFFLINE FALLBACK for the live reads
// in agent/lib/content.ts, not a source in its own right.
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

/** A stored picture: Convex storage id plus its cached, non-expiring URL. */
export type StoredImage = {
  storageId: string;
  url: string;
  alt?: string;
};

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
  /** The hero's URL, for code that just wants somewhere to point an <img>. */
  image?: string;
  hero?: StoredImage;
  gallery?: StoredImage[];
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
