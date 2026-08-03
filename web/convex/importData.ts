import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  bookingStatus,
  city,
  costLine,
  label,
  placeCategory,
  refLink,
  stay,
  transportLeg,
} from "./schema";

/**
 * One-time (but idempotent) import of the current hand-maintained data into
 * Convex: the former `web/lib/trip-data.ts`, `web/data/places.json`,
 * `web/lib/checklist-data.ts` and the prose of `JAPAN2026/*.md`. Those source
 * files no longer exist; this stays as the bulk-load path for seeding a fresh
 * deployment. Ordinary edits go through `convex/content.ts`.
 *
 * Every mutation here upserts on the natural key, so `npm run import:convex`
 * can be re-run safely while we iterate — it converges rather than duplicating.
 *
 * These are `internalMutation`s on purpose: they rewrite the whole trip, so
 * they must not be reachable from the public API. They are invoked only by the
 * Bearer-authenticated `/agent/import` route in `convex/http.ts`.
 */

const now = () => Date.now();
const BY = "import";

export const importDays = internalMutation({
  args: {
    rows: v.array(
      v.object({
        n: v.number(),
        date: v.string(),
        dateHe: v.string(),
        shortDate: v.string(),
        title: v.string(),
        area: v.string(),
        theme: v.string(),
        city,
        color: v.string(),
        heroImage: v.string(),
        highlights: v.array(v.string()),
        note: v.optional(v.string()),
        rainPlan: v.optional(v.string()),
        foodAnchorIds: v.array(v.string()),
        stay: v.optional(stay),
        discovery: v.optional(
          v.object({
            label: v.string(),
            title: v.string(),
            detail: v.string(),
            href: v.string(),
          }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("days")
        .withIndex("by_n", (q) => q.eq("n", row.n))
        .unique();
      const doc = { ...row, updatedAt: now(), updatedBy: BY };
      if (existing) {
        await ctx.db.replace("days", existing._id, doc);
      } else {
        await ctx.db.insert("days", doc);
      }
    }
    return { count: args.rows.length };
  },
});

/**
 * Blocks are replaced wholesale for the given day rather than upserted
 * individually: a day's blocks are an ordered list, and "the plan for day N is
 * now exactly this" is the only import semantic that cannot leave stale
 * leftovers behind.
 */
export const importBlocksForDay = internalMutation({
  args: {
    dayN: v.number(),
    rows: v.array(
      v.object({
        order: v.number(),
        time: v.optional(v.string()),
        title: v.string(),
        detail: v.optional(v.string()),
        placeIds: v.array(v.string()),
        cutFirst: v.optional(v.boolean()),
        booking: v.optional(
          v.object({
            label: v.string(),
            url: v.string(),
            status: bookingStatus,
          }),
        ),
        legs: v.optional(v.array(transportLeg)),
        costs: v.optional(v.array(costLine)),
        links: v.optional(v.array(refLink)),
        needs: v.optional(v.array(v.string())),
        warnings: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("blocks")
      .withIndex("by_dayN", (q) => q.eq("dayN", args.dayN))
      .take(500);
    for (const doc of existing) {
      await ctx.db.delete("blocks", doc._id);
    }
    for (const row of args.rows) {
      await ctx.db.insert("blocks", {
        ...row,
        dayN: args.dayN,
        updatedAt: now(),
        updatedBy: BY,
      });
    }
    return { dayN: args.dayN, count: args.rows.length };
  },
});

export const importPlaces = internalMutation({
  args: {
    rows: v.array(
      v.object({
        slug: v.string(),
        nameHe: v.string(),
        nameEn: v.string(),
        nameJa: v.optional(v.string()),
        category: placeCategory,
        area: v.string(),
        city,
        lat: v.number(),
        lng: v.number(),
        days: v.array(v.number()),
        planned: v.boolean(),
        descriptionHe: v.string(),
        tips: v.optional(v.string()),
        image: v.optional(v.string()),
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
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("places")
        .withIndex("by_slug", (q) => q.eq("slug", row.slug))
        .unique();
      const doc = { ...row, updatedAt: now(), updatedBy: BY };
      if (existing) {
        await ctx.db.replace("places", existing._id, doc);
      } else {
        await ctx.db.insert("places", doc);
      }
    }
    return { count: args.rows.length };
  },
});

export const importChecklistGroups = internalMutation({
  args: {
    rows: v.array(v.object({ title: v.string(), order: v.number() })),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("checklistGroups")
        .withIndex("by_order", (q) => q.eq("order", row.order))
        .unique();
      if (existing) {
        await ctx.db.replace("checklistGroups", existing._id, row);
      } else {
        await ctx.db.insert("checklistGroups", row);
      }
    }
    return { count: args.rows.length };
  },
});

export const importChecklistItems = internalMutation({
  args: {
    rows: v.array(
      v.object({
        slug: v.string(),
        group: v.string(),
        order: v.number(),
        title: v.string(),
        detail: v.optional(v.string()),
        due: v.optional(v.string()),
        url: v.optional(v.string()),
        critical: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("checklistItems")
        .withIndex("by_slug", (q) => q.eq("slug", row.slug))
        .unique();
      const doc = { ...row, updatedAt: now(), updatedBy: BY };
      if (existing) {
        await ctx.db.replace("checklistItems", existing._id, doc);
      } else {
        await ctx.db.insert("checklistItems", doc);
      }
    }
    return { count: args.rows.length };
  },
});

export const importGuides = internalMutation({
  args: {
    rows: v.array(
      v.object({
        slug: v.string(),
        file: v.string(),
        order: v.number(),
        titleHe: v.string(),
        descriptionHe: v.string(),
        category: v.string(),
        bodyHe: v.string(),
        generated: v.boolean(),
        preamble: v.optional(v.string()),
        postamble: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query("guides")
        .withIndex("by_slug", (q) => q.eq("slug", row.slug))
        .unique();
      const doc = { ...row, updatedAt: now(), updatedBy: BY };
      if (existing) {
        await ctx.db.replace("guides", existing._id, doc);
      } else {
        await ctx.db.insert("guides", doc);
      }
    }
    return { count: args.rows.length };
  },
});
