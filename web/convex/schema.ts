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
 * Operational vocabulary — see `web/lib/types.ts` for why each of these exists.
 *
 * The rule these encode: anything we have to *act on* in Japan is stored as
 * structured fields, never as a sentence. A fare inside prose cannot be summed,
 * a station name inside prose cannot carry its Japanese, and a last-admission
 * time inside prose cannot warn anyone.
 */
export const label = v.object({
  he: v.string(),
  en: v.optional(v.string()),
  ja: v.optional(v.string()),
});

export const transportMode = v.union(
  v.literal("train"),
  v.literal("subway"),
  v.literal("walk"),
  v.literal("bus"),
  v.literal("taxi"),
  v.literal("plane"),
  v.literal("ferry"),
  v.literal("cablecar"),
  v.literal("monorail"),
);

export const transportLeg = v.object({
  mode: transportMode,
  from: label,
  to: label,
  line: v.optional(label),
  direction: v.optional(label),
  platform: v.optional(v.string()),
  depart: v.optional(v.string()),
  arrive: v.optional(v.string()),
  durationMin: v.optional(v.number()),
  fareYen: v.optional(v.number()),
  fareNote: v.optional(v.string()),
  exit: v.optional(label),
  transferNote: v.optional(v.string()),
  gotcha: v.optional(v.string()),
});

export const costLine = v.object({
  label: v.string(),
  yen: v.number(),
  basis: v.union(v.literal("person"), v.literal("family"), v.literal("total")),
  note: v.optional(v.string()),
});

export const refLink = v.object({
  label: v.string(),
  url: v.string(),
  kind: v.union(
    v.literal("official"),
    v.literal("tickets"),
    v.literal("timetable"),
    v.literal("map"),
    v.literal("hours"),
    v.literal("menu"),
    v.literal("access"),
  ),
});

/**
 * Money vocabulary.
 *
 * Two different things get called "cost" in this trip and they must never be
 * summed together by accident:
 *
 *   PLANNED  — `costLine` above, and the `budgets` envelopes below. What we
 *              expect a thing to cost. Lives on the plan.
 *   ACTUAL   — the `expenses` table. What actually left an account, with a
 *              receipt behind it. Lives on the record of what happened.
 *
 * The categories are the join between them: an envelope and an expense both
 * carry one, which is what makes "we budgeted ¥190k–260k for food and have
 * spent ¥84k" a question the database can answer rather than a spreadsheet.
 * They are deliberately the envelopes 10-BUDGET.md already argues for — arcade
 * and gachapon are their own line precisely because the guide refuses to let
 * them hide inside "attractions".
 */
export const expenseCategory = v.union(
  v.literal("flights"),
  v.literal("stay"),
  v.literal("transport"),
  v.literal("food"),
  v.literal("attractions"),
  v.literal("shopping"),
  v.literal("arcade"),
  v.literal("gifts"),
  v.literal("essentials"),
  v.literal("other"),
);

/**
 * The four currencies this trip is actually paid in.
 *
 * Flights and both booked Airbnbs were charged in shekels; everything from
 * 2 October onwards is yen. A single total is only honest if every row carries
 * the rate it was converted at, which is why `jpyPerUnit` is stored per expense
 * rather than looked up at read time — a total that silently moves because the
 * yen moved is not a record of what we spent.
 */
export const currencyCode = v.union(
  v.literal("JPY"),
  v.literal("ILS"),
  v.literal("USD"),
  v.literal("EUR"),
);

export const expenseStatus = v.union(
  /** Money has left an account. */
  v.literal("paid"),
  /** Committed — booked, lottery won, ticket held — but not yet charged. */
  v.literal("pending"),
  /** Charged and given back. Kept, with the sign intact, so the trail survives. */
  v.literal("refunded"),
);

export const paymentMethod = v.union(
  v.literal("card"),
  v.literal("cash"),
  v.literal("ic"),
  v.literal("transfer"),
  v.literal("points"),
  v.literal("other"),
);

/** Receipts and confirmations, in Convex file storage. Same shape as the vault. */
export const attachedFile = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  size: v.number(),
  type: v.string(),
  uploadedAt: v.number(),
});

export const stay = v.object({
  placeId: v.optional(v.string()),
  label: v.string(),
  addressJa: v.optional(v.string()),
  checkIn: v.optional(v.string()),
  checkOut: v.optional(v.string()),
  url: v.optional(v.string()),
  note: v.optional(v.string()),
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
    /** Where we sleep tonight — repeated per day on purpose, see lib/types.ts. */
    stay: v.optional(stay),
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
    /** The operational half: how it is done, what it costs, what breaks it. */
    legs: v.optional(v.array(transportLeg)),
    costs: v.optional(v.array(costLine)),
    links: v.optional(v.array(refLink)),
    needs: v.optional(v.array(v.string())),
    warnings: v.optional(v.array(v.string())),
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
    nameJa: v.optional(v.string()), // as it appears on signage / in Google Maps JP
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
    /**
     * Present in `places.json` and `lib/types.ts` since before the migration,
     * but omitted here — so the import silently dropped `officialUrl` for 41
     * places and `priceLevel` for 148. Restored; the app reads them again.
     */
    officialUrl: v.optional(v.string()),
    priceLevel: v.optional(v.number()), // 0..3
    /** Getting-there and being-there facts — see lib/types.ts. */
    addressEn: v.optional(v.string()),
    addressJa: v.optional(v.string()),
    phone: v.optional(v.string()),
    nearestStation: v.optional(label),
    stationExit: v.optional(label),
    walkMinutes: v.optional(v.number()),
    closedDays: v.optional(v.string()),
    lastEntry: v.optional(v.string()),
    ticketNote: v.optional(v.string()),
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
    /** Blank means "slot exists, nobody has filled it in yet". */
    value: v.string(),
    url: v.optional(v.string()),
    /**
     * Where the real value lives today (an inbox, a Drive folder, the Airbnb
     * chat). Seeded from the guides' own "keep it in the private folder"
     * notes so whoever fills a slot knows where to look.
     */
    hint: v.optional(v.string()),
    /**
     * Attached documents — e-tickets, booking confirmations, insurance PDFs.
     *
     * Stored in Convex file storage; only the handle lives here. Reads go
     * through `ctx.storage.getUrl()` inside a `requireFamily()`-guarded query,
     * so the signed URL is only ever minted for a signed-in family member.
     *
     * Optional so every existing row stays valid without a migration.
     */
    files: v.optional(v.array(attachedFile)),
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

  /**
   * FAMILY-ONLY. What each of us actually wants out of this trip.
   *
   * Two things the itinerary alone cannot hold: the kids' own ideas, and the
   * specific object someone is hoping to come home with. A wish is either
   * `shared` (the whole family sees it and it feeds planning) or `private`
   * (only its owner ever sees it) — which is what makes it safe to note a
   * surprise gift for someone who also uses this app.
   *
   * `ownerEmail` rather than `identity.tokenIdentifier`, deliberately, and
   * unlike `chatThreads`: e-mail is already THE family key in `lib/family.ts`
   * and in `requireFamily()`, so using it here means a wish can be seeded or
   * reassigned from a script without first impersonating someone to learn
   * their token. Always stored lowercased, always taken from the verified JWT
   * claim, never from the client.
   */
  wishes: defineTable({
    kind: v.union(
      v.literal("attraction"),
      v.literal("place"),
      v.literal("product"),
      v.literal("food"),
      v.literal("experience"),
      v.literal("other"),
    ),
    title: v.string(),
    /**
     * The same trilingual rule as the itinerary: you cannot ask a shop
     * assistant in Tokyo for a "פיקאצ׳ו" figurine, and a cosmetics counter
     * needs the product name exactly as printed.
     */
    titleEn: v.optional(v.string()),
    titleJa: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.optional(v.string()),
    /** Where it could plausibly be found. */
    placeId: v.optional(v.string()), // place slug
    area: v.optional(v.string()),
    dayN: v.optional(v.number()), // pinned to a day, so it surfaces there
    priceYen: v.optional(v.number()),
    priority: v.union(v.literal("must"), v.literal("want"), v.literal("maybe")),
    visibility: v.union(v.literal("shared"), v.literal("private")),
    ownerEmail: v.string(),
    ownerName: v.string(), // display name, for "who asked for this"
    status: v.union(
      v.literal("idea"),
      /** eve has been asked to research it but has not answered yet. */
      v.literal("researching"),
      v.literal("approved"),
      v.literal("done"),
      v.literal("dropped"),
    ),

    /**
     * The half eve fills in.
     *
     * A wish starts as whatever someone typed — "פיגורת פיקאצ׳ו", maybe with a
     * screenshot. The agent researches it and writes back here: what it costs,
     * which shops on OUR route stock it, pictures, and the sources it used.
     * Everything is optional because a hand-typed wish is still a valid wish;
     * these fields simply stay empty until the research lands.
     */
    images: v.optional(
      v.array(
        v.object({
          storageId: v.id("_storage"),
          alt: v.optional(v.string()),
          /** Where the picture came from, so a rights question has an answer. */
          sourceUrl: v.optional(v.string()),
        }),
      ),
    ),
    /** Shops that actually stock it, ranked by how well they fit the route. */
    whereToBuy: v.optional(
      v.array(
        v.object({
          shop: v.string(),
          shopJa: v.optional(v.string()),
          area: v.optional(v.string()),
          /** Ties the wish to a stop we are already making. */
          placeId: v.optional(v.string()),
          dayN: v.optional(v.number()),
          priceYen: v.optional(v.number()),
          url: v.optional(v.string()),
          note: v.optional(v.string()),
        }),
      ),
    ),
    /** Citations. A researched price with no source is a rumour. */
    sources: v.optional(
      v.array(v.object({ label: v.string(), url: v.string() })),
    ),
    researchedAt: v.optional(v.number()),
    researchedBy: v.optional(v.string()), // "eve", or a person who did it by hand
    /** The original prompt — the text and/or screenshot the wish grew from. */
    promptText: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_visibility", ["visibility"])
    .index("by_ownerEmail", ["ownerEmail"])
    .index("by_dayN", ["dayN"]),

  /** FAMILY-ONLY. `ownerId` is `identity.tokenIdentifier`, as above. */
  chatMessages: defineTable({
    threadId: v.id("chatThreads"),
    ownerId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_threadId_and_createdAt", ["threadId", "createdAt"]),

  /**
   * Proposed changes to the SHARED plan, awaiting the owner's decision.
   *
   * Scope is deliberately narrow: the trip documents (`guides`) and the daily
   * route (`days`/`blocks`). Wishes are NOT routed through here — a family
   * member manages their own wishes directly, shared or private, and needing
   * Alex to rubber-stamp "I'd like to see this shop" would be friction with no
   * payoff. This table is for the grand changes: rewriting a guide, moving a
   * day around.
   *
   * The lifecycle is the same shape `wishes` already uses, minus the research
   * states: pending -> approved | rejected | withdrawn.
   *
   * A guide suggestion carries a mechanical edit (`oldString`/`newString`, an
   * exact substring replacement) so approving it can apply the change inside
   * the same transaction. A day suggestion cannot — days are structured rows,
   * not markdown — so it records intent and `appliedAt` stays null until the
   * structured edit is actually made. `needsManualApply` says which is which
   * rather than leaving the caller to infer it.
   */
  suggestions: defineTable({
    targetKind: v.union(v.literal("guide"), v.literal("day")),
    /** Set when targetKind === "guide". Matches `guides.slug`. */
    guideSlug: v.optional(v.string()),
    /** Set when targetKind === "day". Matches `days.n`. */
    dayN: v.optional(v.number()),

    /** One line, for the list and for the agent to read aloud. */
    title: v.string(),
    /** The case being made. Optional — some changes are self-evident. */
    rationale: v.optional(v.string()),

    /**
     * Exact substring replacement against `guides.bodyHe`. `oldString` must
     * occur EXACTLY once at apply time, which is checked on approval rather
     * than on proposal: the document may have moved on in between.
     */
    oldString: v.optional(v.string()),
    newString: v.optional(v.string()),

    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("withdrawn"),
    ),
    /** True when approval could not itself perform the edit (day targets). */
    needsManualApply: v.boolean(),

    proposedByEmail: v.string(),
    proposedByName: v.string(),

    decidedByEmail: v.optional(v.string()),
    decidedByName: v.optional(v.string()),
    decidedAt: v.optional(v.number()),
    /** The owner's word on why — shown back to whoever proposed it. */
    decisionNote: v.optional(v.string()),

    /** When the change actually landed in the data. */
    appliedAt: v.optional(v.number()),

    createdAt: v.number(),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_proposedByEmail", ["proposedByEmail"])
    .index("by_guideSlug", ["guideSlug"]),

  /**
   * FAMILY-ONLY. What we actually spent.
   *
   * 10-BUDGET.md has kept a "פנקס ההזמנות" — a markdown table with a column
   * headed "החיוב המשפחתי בפועל" that a person is supposed to fill in after
   * every purchase. It mostly reads "—", because a table in a document cannot
   * be written from a shop in Osaka, cannot be summed, and cannot tell the day
   * page that today has cost ¥14,200 so far. This table is that ledger, made
   * writable from the app and from eve.
   *
   * ONE ROW = ONE CHARGE. Not one plan, not one intention: `blocks.costs` and
   * `budgets` already hold what we expect to pay. Mixing the two is how a trip
   * ends up double-counting a ticket it bought once.
   *
   * PRIVACY, and it matters here as much as it does on `wishes`: buying the
   * surprise present is exactly the purchase that must not appear in a family
   * total everyone can see. A `private` expense is visible only to the person
   * who paid, which means totals are per-caller — Alex's own view includes his
   * private spend, nobody else's does. The alternative (a shared total that
   * mysteriously does not add up) leaks the surprise just as effectively.
   */
  expenses: defineTable({
    title: v.string(), // Hebrew, as a person would name the purchase
    titleEn: v.optional(v.string()),
    category: expenseCategory,

    /** What was charged, in the currency it was charged in. */
    amount: v.number(),
    currency: currencyCode,
    /**
     * The same money in yen, frozen at record time.
     *
     * Denormalised on purpose: it is what every total sums, and recomputing it
     * from a live rate would make last month's spend change overnight.
     */
    amountYen: v.number(),
    /** Yen per one unit of `currency` when this was recorded. Exactly 1 for JPY. */
    jpyPerUnit: v.number(),
    rateSource: v.optional(v.string()),

    /** ISO "2026-10-05" — when the money moved, not when somebody typed it in. */
    spentOn: v.string(),
    /** Trip day, when there is one. Pre-trip bookings have none. */
    dayN: v.optional(v.number()),
    placeId: v.optional(v.string()), // place slug
    guideSlug: v.optional(v.string()), // which guide argues for this cost
    /** Set when this purchase IS somebody's wish — see `markWishDone` in money.ts. */
    wishId: v.optional(v.id("wishes")),
    checklistItemSlug: v.optional(v.string()),
    /** The block on the day page this belongs to, matched by title. */
    blockTitle: v.optional(v.string()),

    status: expenseStatus,
    method: v.optional(paymentMethod),
    /** Booking reference / order number, so a receipt can be found again. */
    reference: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),

    /** Who paid. `ownerEmail` for a private row — the only person who sees it. */
    paidByEmail: v.string(),
    paidByName: v.string(),
    visibility: v.union(v.literal("shared"), v.literal("private")),

    /** Receipts, e-tickets, confirmation PDFs. */
    files: v.optional(v.array(attachedFile)),
    /** Where the row came from, so a bad import can be found and undone. */
    source: v.union(
      v.literal("app"),
      v.literal("agent"),
      v.literal("receipt"),
      v.literal("import"),
    ),

    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_spentOn", ["spentOn"])
    .index("by_dayN", ["dayN"])
    .index("by_category", ["category"])
    .index("by_paidByEmail", ["paidByEmail"])
    .index("by_wishId", ["wishId"]),

  /**
   * FAMILY-ONLY. The planning envelopes from 10-BUDGET.md, as data.
   *
   * The guide is emphatic that these are ranges of control, not quotes — so
   * `minYen`/`maxYen` rather than a single number, and both optional, because
   * "קניות אנימה/דמויות: להגדיר תקרה משפחתית נפרדת" is a real envelope with a
   * real name and no figure yet. Storing that as a row with empty bounds keeps
   * the open question visible; leaving it out would quietly close it.
   *
   * Several envelopes may share a `category` (the guide splits local transport
   * from the Shinkansen); the spend side aggregates by category, and the UI
   * shows the envelopes that make it up.
   */
  budgets: defineTable({
    slug: v.string(), // stable kebab key, e.g. "local-transport"
    category: expenseCategory,
    label: v.string(), // Hebrew
    minYen: v.optional(v.number()),
    maxYen: v.optional(v.number()),
    note: v.optional(v.string()),
    order: v.number(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_slug", ["slug"])
    .index("by_order", ["order"]),

  /**
   * FAMILY-ONLY. The conversion rate to use for the NEXT expense entered in a
   * foreign currency.
   *
   * Not a rate history and not a market feed: each expense keeps the rate it was
   * recorded at, so this table only answers "what should we convert at right
   * now". eve refreshes it from a source it can cite; a stale `updatedAt` is
   * shown next to any converted total rather than hidden.
   */
  fxRates: defineTable({
    currency: currencyCode,
    jpyPerUnit: v.number(),
    source: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  }).index("by_currency", ["currency"]),
});
