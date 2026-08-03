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
 * These return the exact shapes `web/lib/types.ts` describes: `slug` is mapped
 * back to `id`, and blocks are nested into their day. Writes live next door in
 * `convex/content.ts`.
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

/**
 * Places, with pictures resolved to plain URLs.
 *
 * `image` stays a URL string so every component that already renders one keeps
 * working; it is now the stored file's URL rather than a path into a `public/`
 * folder that no longer exists. `hero`/`gallery` carry the full objects for the
 * newer UI (alt text, the attraction carousel).
 *
 */
function toPlace(doc: Doc<"places">) {
  const { slug, _id, _creationTime, updatedAt, updatedBy, hero, gallery, ...rest } = doc;
  return {
    id: slug,
    ...rest,
    image: hero?.url,
    hero,
    gallery: gallery ?? [],
  };
}

function toBlock(doc: Doc<"blocks">) {
  return {
    // A block has no natural stable key — two blocks on one day can share a
    // time and a title — so the document id IS its public key. Everything that
    // edits a block (`convex/content.ts`, the agent's `edit_content` tool)
    // addresses it by this, which is why it has to be on the read path too.
    id: doc._id,
    time: doc.time,
    title: doc.title,
    placeIds: doc.placeIds,
    detail: doc.detail,
    cutFirst: doc.cutFirst,
    gallery: doc.gallery ?? [],
    booking: doc.booking,
    legs: doc.legs,
    costs: doc.costs,
    links: doc.links,
    needs: doc.needs,
    warnings: doc.warnings,
  };
}

/**
 * Day fields, in one place.
 *
 * `listDays` and `getDay` returned the same object literal spelled out twice,
 * which is exactly how `stay` would have shipped on one and not the other.
 */
function toDay(doc: Doc<"days">, blocks: Doc<"blocks">[]) {
  return {
    day: doc.n,
    date: doc.date,
    dateHe: doc.dateHe,
    shortDate: doc.shortDate,
    title: doc.title,
    area: doc.area,
    theme: doc.theme,
    city: doc.city,
    // Same contract as `toPlace.image`: a URL string the existing components
    // can render, sourced from Convex storage rather than from `public/`.
    heroImage: doc.hero?.url ?? "",
    hero: doc.hero,
    gallery: doc.gallery ?? [],
    color: doc.color,
    highlights: doc.highlights,
    note: doc.note,
    rainPlan: doc.rainPlan,
    foodAnchors: doc.foodAnchorIds,
    stay: doc.stay,
    discovery: doc.discovery,
    blocks: [...blocks].sort((a, b) => a.order - b.order).map(toBlock),
  };
}

function toChecklistItem(doc: Doc<"checklistItems">) {
  return {
    id: doc.slug,
    group: doc.group,
    title: doc.title,
    detail: doc.detail,
    due: doc.due,
    doFrom: doc.doFrom,
    url: doc.url,
    critical: doc.critical,
    hero: doc.hero,
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

    return days.map((day) => toDay(day, byDay.get(day.n) ?? []));
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

    return toDay(day, blocks);
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
    // Archived research stays readable at its own URL but never appears in the
    // index — see the `archived` comment in schema.ts.
    return guides
      .filter((g) => !g.archived)
      .map((g) => ({
        slug: g.slug,
        file: g.file,
        title: g.titleHe,
        description: g.descriptionHe,
        category: g.category,
        generated: g.generated,
        hero: g.hero,
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
    // Archived research is excluded here too, so it stays out of the chat's
    // baked context and out of the agent's editable-file list.
    return guides
      .filter((g) => !g.archived)
      .map((g) => ({
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
      hero: guide.hero,
      body: guide.bodyHe,
      generated: guide.generated,
      preamble: guide.preamble,
      postamble: guide.postamble,
    };
  },
});
