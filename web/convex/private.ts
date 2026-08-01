import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireFamily } from "./lib/guards";

const subjectValidator = v.union(
  v.literal("place"),
  v.literal("day"),
  v.literal("booking"),
  v.literal("guide"),
  v.literal("checklistItem"),
  v.literal("trip"),
);

const kindValidator = v.union(
  v.literal("ticket"),
  v.literal("confirmation"),
  v.literal("address"),
  v.literal("doorCode"),
  v.literal("passport"),
  v.literal("note"),
);

/**
 * Family-only data: ticket links, booking confirmations, Airbnb addresses,
 * door codes, passport notes.
 *
 * These are the things 11-PRE-TRIP-CHECKLIST.md keeps telling us to "save in
 * the private lodging folder" and "keep out of the public itinerary", because
 * until now the app had nowhere safe to put them.
 *
 * EVERY function in this file calls requireFamily() first. That is the real
 * access control for the trip — not a setting in an auth dashboard. Clerk
 * decides who can hold an account; this decides who can see and change
 * anything private. A stranger who signs up gets a valid session and still
 * cannot read a single row here, because their address is not in
 * `lib/family.ts`.
 *
 * This is also why we do not need Clerk's paid Allowlist feature: the gate
 * lives here, in code, in version control, and is enforced on the server for
 * every single call.
 */

const MAX_PRIVATE = 500;

export const listForSubject = query({
  args: {
    subject: v.union(
      v.literal("place"),
      v.literal("day"),
      v.literal("booking"),
      v.literal("guide"),
      v.literal("checklistItem"),
      v.literal("trip"),
    ),
    subjectId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFamily(ctx);

    const rows = await ctx.db
      .query("privateRecords")
      .withIndex("by_subject_and_subjectId", (q) =>
        q.eq("subject", args.subject).eq("subjectId", args.subjectId),
      )
      .take(MAX_PRIVATE);

    return rows.map((row) => ({
      id: row._id,
      subject: row.subject,
      subjectId: row.subjectId,
      kind: row.kind,
      label: row.label,
      value: row.value,
      url: row.url,
      hint: row.hint,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }));
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireFamily(ctx);
    const rows = await ctx.db.query("privateRecords").take(MAX_PRIVATE);
    return rows.map((row) => ({
      id: row._id,
      subject: row.subject,
      subjectId: row.subjectId,
      kind: row.kind,
      label: row.label,
      value: row.value,
      url: row.url,
      hint: row.hint,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    }));
  },
});

export const upsert = mutation({
  args: {
    subject: v.union(
      v.literal("place"),
      v.literal("day"),
      v.literal("booking"),
      v.literal("guide"),
      v.literal("checklistItem"),
      v.literal("trip"),
    ),
    subjectId: v.string(),
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
    hint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);

    const existing = await ctx.db
      .query("privateRecords")
      .withIndex("by_subject_and_subjectId", (q) =>
        q.eq("subject", args.subject).eq("subjectId", args.subjectId),
      )
      .take(MAX_PRIVATE);

    const match = existing.find((row) => row.kind === args.kind && row.label === args.label);
    const doc = { ...args, updatedAt: Date.now(), updatedBy: actor.name };

    if (match) {
      await ctx.db.patch("privateRecords", match._id, doc);
      return match._id;
    }
    return await ctx.db.insert("privateRecords", doc);
  },
});

/**
 * Seeding path for the machine API.
 *
 * Internal on purpose: it skips `requireFamily()` because the only caller is
 * the Bearer-authenticated `/agent/private/upsert` route, which has already
 * proven it holds AGENT_SERVICE_KEY. It must never be exposed publicly.
 *
 * Used by `scripts/seed-private-slots.ts` to create the empty slots for every
 * private item the guides reference — values stay blank; only the family fills
 * those in.
 */
export const internalUpsert = internalMutation({
  args: {
    subject: subjectValidator,
    subjectId: v.string(),
    kind: kindValidator,
    label: v.string(),
    value: v.string(),
    url: v.optional(v.string()),
    hint: v.optional(v.string()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { updatedBy, ...fields } = args;

    const existing = await ctx.db
      .query("privateRecords")
      .withIndex("by_subject_and_subjectId", (q) =>
        q.eq("subject", args.subject).eq("subjectId", args.subjectId),
      )
      .take(MAX_PRIVATE);

    const match = existing.find((row) => row.kind === args.kind && row.label === args.label);

    // Never clobber a filled-in value with a blank seed: re-running the seeder
    // must be safe once the family has started entering real data.
    if (match) {
      if (match.value.trim().length > 0 && fields.value.trim().length === 0) {
        return match._id;
      }
      await ctx.db.patch("privateRecords", match._id, {
        ...fields,
        updatedAt: Date.now(),
        updatedBy: updatedBy ?? "seed",
      });
      return match._id;
    }

    return await ctx.db.insert("privateRecords", {
      ...fields,
      updatedAt: Date.now(),
      updatedBy: updatedBy ?? "seed",
    });
  },
});

export const remove = mutation({
  args: { id: v.id("privateRecords") },
  handler: async (ctx, args) => {
    await requireFamily(ctx);
    await ctx.db.delete("privateRecords", args.id);
    return null;
  },
});
