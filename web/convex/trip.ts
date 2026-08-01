import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

/**
 * Public read layer for the trip.
 *
 * Deliberately unauthenticated: the site is already public, and keeping these
 * open is what lets the Next.js server render and precache every page for
 * offline use in Japan. Anything family-only lives in `privateRecords` /
 * `chatMessages` and is served from `convex/private.ts` behind requireFamily().
 *
 * These return the exact shapes `web/lib/types.ts` already describes, so the
 * eleven modules importing `@/lib/trip-data` keep working with no changes:
 * `slug` is mapped back to `id`, and blocks are nested into their day.
 *
 * NOTE: no function here reads the wall clock. "Which day is today" is a
 * function of the request, not of the data — queries are not re-run just
 * because time passes, so a `Date.now()` in here would cache a stale answer.
 * Callers pass `now` in (see `web/lib/trip-time.ts`).
 */

// The tables are inherently bounded (17 days, ~200 places, ~60 checklist
// items, 12 guides). These caps are a guard against an unbounded read if an
// import ever goes wrong, not a real pagination boundary.
const MAX_DAYS = 50;
const MAX_BLOCKS = 500;
const MAX_PLACES = 1000;
const MAX_CHECKLIST = 500;
const MAX_GUIDES = 50;

function toPlace(doc: Doc<"places">) {
  const { slug, _id, _creationTime, updatedAt, updatedBy, ...rest } = doc;
  return { id: slug, ...rest };
}

function toBlock(doc: Doc<"blocks">) {
  return {
    time: doc.time,
    title: doc.title,
    placeIds: doc.placeIds,
    detail: doc.detail,
    cutFirst: doc.cutFirst,
    booking: doc.booking,
  };
}

function toChecklistItem(doc: Doc<"checklistItems">) {
  return {
    id: doc.slug,
    group: doc.group,
    title: doc.title,
    detail: doc.detail,
    due: doc.due,
    url: doc.url,
    critical: doc.critical,
  };
}

/** All 17 days with their blocks nested, ordered by day number. */
export const listDays = query({
  args: {},
  handler: async (ctx) => {
    const days = await ctx.db.query("days").withIndex("by_n").take(MAX_DAYS);
    const blocks = await ctx.db.query("blocks").take(MAX_BLOCKS);

    const byDay = new Map<number, Doc<"blocks">[]>();
    for (const block of blocks) {
      const list = byDay.get(block.dayN) ?? [];
      list.push(block);
      byDay.set(block.dayN, list);
    }

    return days.map((day) => ({
      day: day.n,
      date: day.date,
      dateHe: day.dateHe,
      shortDate: day.shortDate,
      title: day.title,
      area: day.area,
      theme: day.theme,
      city: day.city,
      heroImage: day.heroImage,
      // Legacy alias kept while the pre-redesign components still read `image`.
      image: day.heroImage,
      color: day.color,
      highlights: day.highlights,
      note: day.note,
      rainPlan: day.rainPlan,
      foodAnchors: day.foodAnchorIds,
      discovery: day.discovery,
      blocks: (byDay.get(day.n) ?? [])
        .sort((a, b) => a.order - b.order)
        .map(toBlock),
    }));
  },
});

export const getDay = query({
  args: { n: v.number() },
  handler: async (ctx, args) => {
    const day = await ctx.db
      .query("days")
      .withIndex("by_n", (q) => q.eq("n", args.n))
      .unique();
    if (!day) return null;

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_dayN_and_order", (q) => q.eq("dayN", args.n))
      .take(MAX_BLOCKS);

    return {
      day: day.n,
      date: day.date,
      dateHe: day.dateHe,
      shortDate: day.shortDate,
      title: day.title,
      area: day.area,
      theme: day.theme,
      city: day.city,
      heroImage: day.heroImage,
      image: day.heroImage,
      color: day.color,
      highlights: day.highlights,
      note: day.note,
      rainPlan: day.rainPlan,
      foodAnchors: day.foodAnchorIds,
      discovery: day.discovery,
      blocks: blocks.map(toBlock),
    };
  },
});

/** All places, planned and extras, in import order. */
export const listPlaces = query({
  args: {},
  handler: async (ctx) => {
    const places = await ctx.db.query("places").take(MAX_PLACES);
    return places.map(toPlace);
  },
});

/**
 * Checklist definitions plus shared progress.
 *
 * `state` is the family-wide done map that replaces the per-device
 * localStorage version — this is what lets everyone see the same ticks.
 */
export const listChecklist = query({
  args: {},
  handler: async (ctx) => {
    const groups = await ctx.db
      .query("checklistGroups")
      .withIndex("by_order")
      .take(MAX_CHECKLIST);
    const items = await ctx.db.query("checklistItems").take(MAX_CHECKLIST);
    const state = await ctx.db.query("checklistState").take(MAX_CHECKLIST);

    const done: Record<string, { done: boolean; doneAt?: number; doneBy?: string }> = {};
    for (const row of state) {
      done[row.itemSlug] = {
        done: row.done,
        doneAt: row.doneAt,
        doneBy: row.doneBy,
      };
    }

    return {
      groups: groups.map((g) => g.title),
      items: items
        .sort((a, b) => a.order - b.order)
        .map(toChecklistItem),
      state: done,
    };
  },
});

/** Guide index — metadata only, no bodies, so the listing stays small. */
export const listGuides = query({
  args: {},
  handler: async (ctx) => {
    const guides = await ctx.db
      .query("guides")
      .withIndex("by_order")
      .take(MAX_GUIDES);
    return guides.map((g) => ({
      slug: g.slug,
      file: g.file,
      title: g.titleHe,
      description: g.descriptionHe,
      category: g.category,
      generated: g.generated,
    }));
  },
});

/**
 * Every guide with its full markdown body, for the `JAPAN2026/*.md` export.
 *
 * This is the half that makes Convex safe to depend on: data can be rendered
 * back to readable, git-tracked files at any time, so the trip can never be
 * trapped in a database. `npm run export:md -- --check` asserts the round-trip
 * is byte-identical.
 *
 * Guides with `generated: true` (09 and 11, from Phase 2 onward) are rendered
 * from the structured tables by the export script rather than served from
 * `bodyHe` — `preamble`/`postamble` are the prose that wraps that output.
 */
export const exportGuides = query({
  args: {},
  handler: async (ctx) => {
    const guides = await ctx.db
      .query("guides")
      .withIndex("by_order")
      .take(MAX_GUIDES);
    return guides.map((g) => ({
      file: g.file,
      slug: g.slug,
      order: g.order,
      generated: g.generated,
      markdown: g.bodyHe,
      preamble: g.preamble,
      postamble: g.postamble,
    }));
  },
});

export const getGuide = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const guide = await ctx.db
      .query("guides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!guide) return null;
    return {
      slug: guide.slug,
      file: guide.file,
      title: guide.titleHe,
      description: guide.descriptionHe,
      category: guide.category,
      body: guide.bodyHe,
      generated: guide.generated,
      preamble: guide.preamble,
      postamble: guide.postamble,
    };
  },
});
