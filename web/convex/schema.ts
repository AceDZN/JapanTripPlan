import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Japan 2026 — the single writable copy of the trip.
 *
 * Everything else (the Next.js site, the eve agent's context, and the
 * JAPAN2026/*.md export) is DERIVED from these tables. Nothing downstream is
 * ever hand-edited.
 *
 * Field names deliberately mirror `web/lib/types.ts` so the query layer can
 * hand components the exact shapes they already consume. The one rename is
 * `id` -> `slug`: `id` reads confusingly next to Convex's own `_id`, so the
 * stable kebab-case key lives in `slug` and the query layer maps it back to
 * `id` on the way out.
 *
 * PRIVACY: anything family-only lives in its own table (`privateRecords`,
 * `chatThreads`, `chatMessages`). Convex queries return whole documents, so
 * field-level redaction is manual and easy to get wrong — a public query that
 * cannot reach the table cannot leak it.
 */

export const city = v.union(
  v.literal("tokyo"),
  v.literal("kyoto"),
  v.literal("osaka"),
  v.literal("kamakura"),
  v.literal("uji"),
  v.literal("other"),
);

export const placeCategory = v.union(
  v.literal("attraction"),
  v.literal("food"),
  v.literal("shopping"),
  v.literal("nature"),
  v.literal("culture"),
  v.literal("gaming"),
  v.literal("kawaii"),
  v.literal("viewpoint"),
  v.literal("stay"),
  v.literal("transport"),
  v.literal("event"),
);

export const bookingStatus = v.union(
  v.literal("booked"),
  v.literal("buy-now"),
  v.literal("on-sale-soon"),
  v.literal("lottery"),
  v.literal("monitor"),
  v.literal("fallback"),
);

export const booking = v.object({
  label: v.string(),
  url: v.string(),
  status: bookingStatus,
});

/**
 * No users/sessions tables: Clerk owns identity. A request's identity arrives
 * as a verified JWT and is matched against the allowlist in `lib/family.ts`,
 * so there is no account state for this app to store or keep in sync.
 */
export default defineSchema({
  /** The 17 trip days. `n` is 1..17 and is the stable public key. */
  days: defineTable({
    n: v.number(),
    date: v.string(), // ISO "2026-10-03"
    dateHe: v.string(), // "שבת, 3 באוקטובר"
    shortDate: v.string(), // "3.10"
    title: v.string(),
    area: v.string(),
    theme: v.string(),
    city,
    color: v.string(), // hex, per-day identity colour
    heroImage: v.string(), // "/images/days/day-03.jpg"
    highlights: v.array(v.string()),
    note: v.optional(v.string()),
    rainPlan: v.optional(v.string()),
    foodAnchorIds: v.array(v.string()), // place slugs
    discovery: v.optional(
      v.object({
        label: v.string(),
        title: v.string(),
        detail: v.string(),
        href: v.string(),
      }),
    ),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_n", ["n"]),

  /**
   * Day blocks, as their own table rather than an array on `days`.
   *
   * This is the point of the whole migration: moving or reordering one block
   * is a single atomic mutation, which is exactly the edit that silently
   * desyncs the site today (eve rewrites the markdown, `trip-data.ts` does not
   * follow). `order` is a sparse integer so a block can be inserted between
   * two others without rewriting its siblings.
   */
  blocks: defineTable({
    dayN: v.number(),
    order: v.number(),
    time: v.optional(v.string()), // "10:00" or "בוקר"/"צהריים"/"ערב"
    title: v.string(),
    detail: v.optional(v.string()),
    placeIds: v.array(v.string()), // place slugs
    cutFirst: v.optional(v.boolean()),
    booking: v.optional(booking),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_dayN_and_order", ["dayN", "order"])
    .index("by_dayN", ["dayN"]),

  /** 154 places: 99 planned itinerary stops + 55 nearby extras. */
  places: defineTable({
    slug: v.string(), // stable kebab-case English key; exposed to the app as `id`
    nameHe: v.string(),
    nameEn: v.string(),
    category: placeCategory,
    area: v.string(),
    city,
    lat: v.number(),
    lng: v.number(),
    days: v.array(v.number()), // trip day numbers; [] for unscheduled extras
    planned: v.boolean(),
    descriptionHe: v.string(),
    tips: v.optional(v.string()),
    image: v.optional(v.string()),
    mapsQuery: v.optional(v.string()),
    mustDo: v.optional(v.boolean()),
    indoor: v.optional(v.boolean()), // rain-friendly
    openingHours: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_city", ["city"])
    .index("by_planned", ["planned"]),

  /**
   * Checklist section headings.
   *
   * Today this is a hand-written tuple in `checklist-data.ts:3` that must match
   * every item's `group` string exactly or items silently vanish from the UI.
   * Making it a table with an explicit order removes that footgun.
   */
  checklistGroups: defineTable({
    title: v.string(), // Hebrew group title, e.g. "כרטיסים ואטרקציות"
    order: v.number(),
  }).index("by_order", ["order"]),

  /**
   * 59 checklist items.
   *
   * `slug` MUST stay byte-identical to the ids in today's `checklist-data.ts`:
   * it is the localStorage key (`japan2026.checklist.v1`), so renaming one
   * loses that tick for every family member who already has it saved.
   */
  checklistItems: defineTable({
    slug: v.string(), // exposed to the app as `id`
    group: v.string(), // FK -> checklistGroups.title
    order: v.number(),
    title: v.string(),
    detail: v.optional(v.string()),
    due: v.optional(v.string()), // ISO date, only when there is a real deadline
    url: v.optional(v.string()),
    critical: v.optional(v.boolean()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_group_and_order", ["group", "order"]),

  /**
   * Shared checklist progress — replaces the per-device localStorage map.
   *
   * This is what lets the family see each other's ticks and lets eve read
   * progress, neither of which is possible today.
   */
  checklistState: defineTable({
    itemSlug: v.string(),
    done: v.boolean(),
    doneAt: v.optional(v.number()),
    doneBy: v.optional(v.string()), // display name, for "who closed this"
  }).index("by_itemSlug", ["itemSlug"]),

  /**
   * Prose guides.
   *
   * Only genuinely prose documents are stored: 00, 01, 02, 03, 04, 05, 06, 07,
   * 08, 10. The daily itinerary (09) and the pre-trip checklist (11) are
   * RENDERED from `days`/`blocks` and `checklistItems` instead — that is what
   * removes the last copy of the plan. Their non-generated prose sections
   * (Family-Fit Filter, Booking Gates, Final Experience Balance, ...) live in
   * `preamble`/`postamble` and are rendered around the generated body.
   */
  guides: defineTable({
    slug: v.string(), // "overview", "flights", "itinerary", ...
    file: v.string(), // "00-OVERVIEW.md" — the export filename
    order: v.number(),
    titleHe: v.string(),
    descriptionHe: v.string(),
    category: v.string(), // drives components/guide-images.ts
    /** Canonical Hebrew markdown. Empty for generated guides (09, 11). */
    bodyHe: v.string(),
    /** true => body is rendered from structured tables, not from bodyHe. */
    generated: v.boolean(),
    preamble: v.optional(v.string()),
    postamble: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  /**
   * FAMILY-ONLY. Ticket links, booking confirmations, Airbnb addresses, door
   * codes, passport expiries.
   *
   * These are the things 11-PRE-TRIP-CHECKLIST.md currently tells us to "save
   * in the private lodging folder" / "keep out of the public itinerary",
   * because until now there was nowhere in the app to put them.
   *
   * Never returned by a public query. Every read goes through requireFamily().
   */
  privateRecords: defineTable({
    subject: v.union(
      v.literal("place"),
      v.literal("day"),
      v.literal("booking"),
      v.literal("guide"),
      v.literal("checklistItem"),
      v.literal("trip"),
    ),
    subjectId: v.string(), // slug or day number as a string; "trip" for global
    kind: v.union(
      v.literal("ticket"),
      v.literal("confirmation"),
      v.literal("address"),
      v.literal("doorCode"),
      v.literal("passport"),
      v.literal("note"),
    ),
    label: v.string(),
    value: v.string(),
    url: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_subject_and_subjectId", ["subject", "subjectId"])
    .index("by_kind", ["kind"]),

  /**
   * FAMILY-ONLY. Chat history, scoped to the signed-in user.
   *
   * `ownerId` holds `identity.tokenIdentifier` — the canonical stable identity
   * key — never `identity.subject`, and never a client-supplied user id.
   */
  chatThreads: defineTable({
    ownerId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_ownerId_and_updatedAt", ["ownerId", "updatedAt"]),

  /** FAMILY-ONLY. `ownerId` is `identity.tokenIdentifier`, as above. */
  chatMessages: defineTable({
    threadId: v.id("chatThreads"),
    ownerId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_threadId_and_createdAt", ["threadId", "createdAt"]),
});
