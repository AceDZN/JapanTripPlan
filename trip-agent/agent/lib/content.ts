// Live trip content, read from Convex on demand.
//
// ## Why this exists
//
// `agent/data/content.ts` is baked at build time. That was fine for the guides,
// which change deliberately and rarely, and quietly wrong for everything else:
// a place whose opening hours were corrected in the app stayed wrong in every
// answer eve gave until somebody redeployed the agent. Worse, the places in
// that bundle came from a JSON file in the webapp repo rather than from Convex
// at all, so the two halves of the same trip could — and did — disagree.
//
// So places and days are read live here, per tool call. The bundle stays as an
// OFFLINE FALLBACK: if Convex cannot be reached, an answer from the last deploy
// is much better than no answer at all, and the family will be using this from
// a Tokyo subway platform. What is gone is the case where a stale copy is
// preferred to a live one.
//
// ## The cache
//
// One tool call rarely happens alone: "what's near us" then "is it open" then
// "fix the hours" is three calls inside one turn, and re-fetching 159 places
// each time is pure latency in front of the family. A short TTL keeps a turn
// internally consistent. Any successful write blows the cache away, so a read
// after an edit never shows the value the edit just replaced.

import { CONVEX_UNCONFIGURED, convexConfigured, convexGet, convexPost } from "./convex";
import { places as bundledPlaces, type Place } from "../data/content";

/** Long enough to cover one conversational turn, short enough to feel live. */
const TTL_MS = 30_000;

type Cached<T> = { value: T; at: number };

let placesCache: Cached<Place[]> | null = null;
const dayCache = new Map<number, Cached<LiveDay>>();

function fresh<T>(entry: Cached<T> | null | undefined): T | null {
  if (!entry) return null;
  return Date.now() - entry.at < TTL_MS ? entry.value : null;
}

/** Drop everything. Called after any write, so the next read sees it. */
export function invalidateContentCache(): void {
  placesCache = null;
  dayCache.clear();
}

export type PlacesResult = {
  places: Place[];
  /** true when Convex could not be reached and the baked bundle was used. */
  stale: boolean;
};

/**
 * Every place, live where possible.
 *
 * Never throws: a tool that cannot answer at all is worse than one that answers
 * from the last deploy and says so. `stale` is surfaced to the model precisely
 * so it can hedge ("לפי מה שיש לי, ייתכן שהשתנה") rather than assert.
 */
export async function getPlaces(): Promise<PlacesResult> {
  const cached = fresh(placesCache);
  if (cached) return { places: cached, stale: false };

  if (!convexConfigured()) return { places: bundledPlaces, stale: true };

  try {
    const body = (await convexGet("/agent/content/places")) as { places?: Place[] };
    if (!Array.isArray(body.places) || body.places.length === 0) {
      return { places: bundledPlaces, stale: true };
    }
    placesCache = { value: body.places, at: Date.now() };
    return { places: body.places, stale: false };
  } catch {
    return { places: bundledPlaces, stale: true };
  }
}

/** One block of one day, with the id `edit_content` needs to change it. */
export type LiveBlock = {
  id: string;
  time?: string;
  title: string;
  detail?: string;
  placeIds: string[];
  cutFirst?: boolean;
  booking?: { label: string; url: string; status: string };
  legs?: unknown[];
  costs?: unknown[];
  links?: unknown[];
  needs?: string[];
  warnings?: string[];
};

export type LiveDay = {
  day: number;
  date: string;
  dateHe: string;
  shortDate: string;
  title: string;
  area: string;
  theme: string;
  city: string;
  highlights: string[];
  note?: string;
  rainPlan?: string;
  foodAnchors?: string[];
  stay?: { placeId?: string; label: string; addressJa?: string; note?: string; url?: string };
  blocks: LiveBlock[];
};

/**
 * One day, structured, from Convex.
 *
 * Unlike `getPlaces` this has no fallback, because there is nothing to fall
 * back TO: the bundle only ever held the itinerary as prose inside
 * `09-DAILY-ITINERARY.md`, and a markdown section has no block ids, so it
 * cannot answer the question this function exists for. `get_day` handles the
 * null by dropping to the guide text and saying it is doing so.
 */
export async function getLiveDay(n: number): Promise<LiveDay | null> {
  const cached = fresh(dayCache.get(n));
  if (cached) return cached;
  if (!convexConfigured()) return null;

  try {
    const body = (await convexGet(`/agent/content/day?n=${n}`)) as { day?: LiveDay };
    if (!body.day) return null;
    dayCache.set(n, { value: body.day, at: Date.now() });
    return body.day;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------- images */

export type ImageCandidate = {
  imageUrl: string;
  thumbnailUrl?: string;
  title?: string;
  pageUrl?: string;
  sourceName: string;
  credit?: string;
  license?: string;
  width?: number;
  height?: number;
};

/**
 * Look for pictures of something. Finds, does not keep.
 *
 * Convex runs the actual search because that is where the layers and the
 * SERPER_API_KEY live — one implementation, shared by eve, the app and the
 * terminal, rather than three that drift.
 */
export async function searchImages(args: {
  query: string;
  pageUrl?: string;
  limit?: number;
}): Promise<
  | { ok: true; candidates: ImageCandidate[]; layersRun: string[]; layersSkipped: string[] }
  | { ok: false; error: string }
> {
  if (!convexConfigured()) return { ok: false, error: CONVEX_UNCONFIGURED };
  try {
    const body = (await convexPost("/agent/images/search", args)) as {
      candidates?: ImageCandidate[];
      layersRun?: string[];
      layersSkipped?: string[];
    };
    return {
      ok: true,
      candidates: body.candidates ?? [],
      layersRun: body.layersRun ?? [],
      layersSkipped: body.layersSkipped ?? [],
    };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export type AttachImageResult = {
  table: string;
  key: string;
  slot: "hero" | "gallery";
  url: string;
  /** True when we already had these exact bytes — nothing was downloaded. */
  deduped: boolean;
  applied: string[];
  pending: string[];
};

/**
 * Keep a picture and put it on something.
 *
 * The bytes are copied into Convex storage rather than linked, for the same
 * reason wish images are: a photo on somebody else's CDN is one redesign away
 * from a hole in the page, and this app is opened offline on a phone in Japan.
 */
export async function attachImage(args: {
  byEmail: string;
  table: ContentTable;
  key: string;
  slot: "hero" | "gallery";
  url: string;
  alt?: string;
  sourceName?: string;
  credit?: string;
  license?: string;
  pageUrl?: string;
}): Promise<{ ok: true; result: AttachImageResult } | { ok: false; error: string }> {
  if (!convexConfigured()) return { ok: false, error: CONVEX_UNCONFIGURED };
  try {
    const body = (await convexPost("/agent/images/attach", args)) as AttachImageResult;
    invalidateContentCache();
    return { ok: true, result: body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/* ------------------------------------------------------------------ writing */

export type ContentTable = "places" | "days" | "blocks" | "checklistItems";
export type ContentOp = "patch" | "create" | "delete";

export type EditContentResult = {
  table: ContentTable;
  op: ContentOp;
  key: string;
  /** Field names written to the trip right now. */
  applied: string[];
  /** Field names now waiting on Alex, with the suggestion holding them. */
  pending: string[];
  suggestionId: string | null;
};

/**
 * Submit a content edit.
 *
 * The caller does NOT decide whether this applies or queues — the server does,
 * from the fields in the patch (`web/convex/lib/contentPolicy.ts`). Facts land
 * immediately; anything that changes the plan becomes a pending suggestion for
 * the trip owner. That split is enforced in Convex precisely so no prompt, and
 * no clever tool call, can route around it.
 */
export async function editContent(args: {
  byEmail: string;
  table: ContentTable;
  op: ContentOp;
  key: string;
  fields?: Record<string, unknown>;
  unset?: string[];
  rationale?: string;
}): Promise<{ ok: true; result: EditContentResult } | { ok: false; error: string }> {
  if (!convexConfigured()) return { ok: false, error: CONVEX_UNCONFIGURED };

  try {
    const body = (await convexPost("/agent/content/edit", {
      byEmail: args.byEmail,
      table: args.table,
      op: args.op,
      key: args.key,
      fields: args.fields ?? {},
      unset: args.unset,
      rationale: args.rationale,
    })) as EditContentResult;

    // The trip just moved under the cache; the next read must not serve what
    // this call replaced.
    invalidateContentCache();
    return { ok: true, result: body };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
