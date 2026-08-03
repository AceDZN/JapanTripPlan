import { v } from "convex/values";
import {
  booking,
  city,
  contentOpName,
  contentTableName,
  costLine,
  label,
  placeCategory,
  refLink,
  stay,
  storedImage,
  transportLeg,
} from "../schema";

/**
 * Which content edits apply straight away, and which have to be asked for.
 *
 * ## The rule
 *
 * Every editable field on the trip is either a FACT or a PLAN field.
 *
 *   FACT — something true about the world that we merely recorded, and that
 *          the world can change without asking us: opening hours, a closed
 *          day, an address, a phone number, a fare, a ticket URL, a booking
 *          that is now booked, the note explaining what a place is.
 *          Getting these corrected FAST is the whole value of having an agent
 *          that can research. Gating them behind approval means the family
 *          stands outside a museum that shut at 16:00 while the correction
 *          waits in a queue.
 *
 *   PLAN — something we decided: which day a place is on, whether it is in the
 *          itinerary at all, what order the blocks run in, what a day is
 *          called, where we sleep. These are shared decisions. `convex/
 *          suggestions.ts` explains at length why eve must never make one: it
 *          authenticates with a single family credential and genuinely cannot
 *          tell Alex from Tommy, so "Tommy asked the assistant to rewrite day
 *          5" must not rewrite day 5.
 *
 * Creating or deleting a row is ALWAYS plan-tier, whatever table it is in.
 * There is no such thing as a factual correction that adds a stop to the trip.
 *
 * ## Who this binds
 *
 * The tiering is enforced server-side, on the patch, by `classify()` below —
 * not by the caller declaring its intent. That matters: eve's content tool
 * submits one patch and the server decides what happens to each field, so a
 * model cannot talk its way past the gate by picking the wrong endpoint.
 *
 * Service callers (Claude Code, GPT, the seed scripts — anyone holding
 * AGENT_SERVICE_KEY at a terminal) and the signed-in owner apply everything
 * directly. See `tierFor()` in `convex/content.ts`.
 */

export const CONTENT_TABLES = ["places", "days", "blocks", "checklistItems"] as const;
export type ContentTable = (typeof CONTENT_TABLES)[number];

/** Re-exported from `schema.ts`, which owns them so `suggestions` can use them. */
export const contentTable = contentTableName;
export const contentOp = contentOpName;
export type ContentOp = "create" | "patch" | "delete";

/* ------------------------------------------------------------------ patches */

/**
 * Patch validators: every field optional, `updatedAt`/`updatedBy` excluded.
 *
 * These are the authoritative shape of an edit. They are used by the direct
 * mutations AND re-applied when a suggestion is approved, so an edit that was
 * valid when proposed cannot become malformed on the way in.
 */

export const placePatch = v.object({
  nameHe: v.optional(v.string()),
  nameEn: v.optional(v.string()),
  nameJa: v.optional(v.string()),
  category: v.optional(placeCategory),
  area: v.optional(v.string()),
  city: v.optional(city),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  days: v.optional(v.array(v.number())),
  planned: v.optional(v.boolean()),
  descriptionHe: v.optional(v.string()),
  tips: v.optional(v.string()),
  mapsQuery: v.optional(v.string()),
  mustDo: v.optional(v.boolean()),
  indoor: v.optional(v.boolean()),
  openingHours: v.optional(v.string()),
  officialUrl: v.optional(v.string()),
  priceLevel: v.optional(v.number()),
  addressEn: v.optional(v.string()),
  addressJa: v.optional(v.string()),
  phone: v.optional(v.string()),
  nearestStation: v.optional(label),
  stationExit: v.optional(label),
  walkMinutes: v.optional(v.number()),
  closedDays: v.optional(v.string()),
  lastEntry: v.optional(v.string()),
  ticketNote: v.optional(v.string()),
  hero: v.optional(storedImage),
  gallery: v.optional(v.array(storedImage)),
});

export const dayPatch = v.object({
  date: v.optional(v.string()),
  dateHe: v.optional(v.string()),
  shortDate: v.optional(v.string()),
  title: v.optional(v.string()),
  area: v.optional(v.string()),
  theme: v.optional(v.string()),
  city: v.optional(city),
  color: v.optional(v.string()),
  highlights: v.optional(v.array(v.string())),
  note: v.optional(v.string()),
  rainPlan: v.optional(v.string()),
  foodAnchorIds: v.optional(v.array(v.string())),
  stay: v.optional(stay),
  discovery: v.optional(
    v.object({
      label: v.string(),
      title: v.string(),
      detail: v.string(),
      href: v.string(),
    }),
  ),
  hero: v.optional(storedImage),
  gallery: v.optional(v.array(storedImage)),
});

export const blockPatch = v.object({
  dayN: v.optional(v.number()),
  order: v.optional(v.number()),
  time: v.optional(v.string()),
  title: v.optional(v.string()),
  detail: v.optional(v.string()),
  placeIds: v.optional(v.array(v.string())),
  cutFirst: v.optional(v.boolean()),
  booking: v.optional(booking),
  legs: v.optional(v.array(transportLeg)),
  costs: v.optional(v.array(costLine)),
  links: v.optional(v.array(refLink)),
  needs: v.optional(v.array(v.string())),
  warnings: v.optional(v.array(v.string())),
  gallery: v.optional(v.array(storedImage)),
});

export const checklistItemPatch = v.object({
  group: v.optional(v.string()),
  order: v.optional(v.number()),
  title: v.optional(v.string()),
  detail: v.optional(v.string()),
  due: v.optional(v.string()),
  doFrom: v.optional(v.string()),
  url: v.optional(v.string()),
  critical: v.optional(v.boolean()),
  hero: v.optional(storedImage),
});

/* -------------------------------------------------------------- the tiering */

/**
 * PLAN fields, per table. Everything else on the patch is a FACT.
 *
 * Stated as a denylist rather than an allowlist on purpose: a field added to
 * the schema later is a fact until someone decides otherwise, and the failure
 * mode of that default (an agent corrects a new field without asking) is much
 * milder than its opposite (a new decision field silently becomes freely
 * writable because nobody remembered to list it).
 */
const PLAN_FIELDS: Record<ContentTable, ReadonlySet<string>> = {
  // Which days a place is on, and whether it is in the trip at all. Its
  // address, hours and phone are facts; its position in the itinerary is not.
  places: new Set(["days", "planned", "mustDo"]),

  // A day's identity and its route. `note`, `rainPlan`, `heroImage`, `color`
  // and `discovery` stay factual/cosmetic and are left out.
  days: new Set([
    "date",
    "dateHe",
    "shortDate",
    "title",
    "area",
    "theme",
    "city",
    "highlights",
    "foodAnchorIds",
    "stay",
  ]),

  // What we do and when. `detail`, `booking`, `legs`, `costs`, `links`,
  // `needs` and `warnings` are the operational facts about doing it — those a
  // researching agent should be able to fix on the spot.
  blocks: new Set(["dayN", "order", "time", "title", "placeIds", "cutFirst"]),

  // NOTE on images: `hero` and `gallery` appear in NO plan set, so they are
  // FACT everywhere — eve finding a better photo of a station applies at once.
  // A wrong picture is obvious at a glance and one call to replace; queueing
  // every "here is a nicer shot" behind approval would defeat the point of
  // letting an agent improve things. Removing a picture is a delete, and every
  // delete is plan-tier regardless.

  // `due` is deliberately a FACT: a deadline belongs to the outside world (a
  // lottery closes when it closes), and a wrong one is dangerous whichever
  // direction it is wrong in. Correcting it fast beats queueing it, and the
  // change is immediately visible on the home page's booking gates.
  //
  // `doFrom` is a FACT for the same reason and one more: it is usually a date
  // the outside world set ("issuable from 29 Sep", "the shop opens on the 2nd"),
  // and it only ever makes a task appear EARLIER on more day pages. Queueing
  // "actually you could have collected these two days ago" behind an approval
  // is precisely the delay the fact tier exists to prevent.
  checklistItems: new Set(["group", "order", "title", "critical"]),
};

export type Classified = {
  /** Fields any family member (and eve) may write without asking. */
  fact: Record<string, unknown>;
  /** Fields only the owner or a service caller may write directly. */
  plan: Record<string, unknown>;
};

/**
 * Split a patch into the half that applies and the half that has to be asked
 * for. `undefined` values are dropped: Convex treats an explicit `undefined`
 * in a patch as "clear this field", which is not what an omitted key means.
 */
export function classify(table: ContentTable, patch: Record<string, unknown>): Classified {
  const planFields = PLAN_FIELDS[table];
  const fact: Record<string, unknown> = {};
  const plan: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (planFields.has(key)) plan[key] = value;
    else fact[key] = value;
  }

  return { fact, plan };
}

/**
 * The same split, for a list of field names to CLEAR.
 *
 * Clearing is its own argument rather than a `null` in the patch: the patch
 * validators are `v.optional(T)`, so accepting null would mean widening every
 * one of them to `v.union(T, v.null())` and teaching the whole write path to
 * tell "set to null" from "unset". A separate `unset: string[]` says the thing
 * it means and needs no new validator at all.
 *
 * It matters because a fact can stop being true by disappearing — a place that
 * no longer publishes a phone number, a ticket note that no longer applies.
 * Without this the only way to retract one was to write a misleading empty
 * string.
 */
export function classifyNames(table: ContentTable, names: string[]): { fact: string[]; plan: string[] } {
  const planFields = PLAN_FIELDS[table];
  return {
    fact: names.filter((name) => !planFields.has(name)),
    plan: names.filter((name) => planFields.has(name)),
  };
}

export function isEmpty(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0;
}

/** Human-readable field list, for suggestion titles and tool replies. */
export function fieldList(patch: Record<string, unknown>): string {
  return Object.keys(patch).join(", ");
}
