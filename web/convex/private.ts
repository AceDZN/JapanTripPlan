import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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

/** Cap per record — the vault is for documents, not a media library. */
const MAX_FILES_PER_RECORD = 10;

/**
 * Mint short-lived download URLs for a record's attachments.
 *
 * Only ever called from inside a `requireFamily()`-guarded query, so an
 * unauthenticated caller never reaches the point where a URL exists. A file
 * whose storage entry has gone returns `url: null` rather than throwing, so one
 * bad row cannot take the whole vault down.
 */
async function resolveFiles(
  ctx: { storage: { getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  files: Doc<"privateRecords">["files"],
) {
  return Promise.all(
    (files ?? []).map(async (file) => ({
      ...file,
      url: await ctx.storage.getUrl(file.storageId),
    })),
  );
}

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

    return Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        subject: row.subject,
        subjectId: row.subjectId,
        kind: row.kind,
        label: row.label,
        value: row.value,
        url: row.url,
        hint: row.hint,
        files: await resolveFiles(ctx, row.files),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      })),
    );
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireFamily(ctx);
    const rows = await ctx.db.query("privateRecords").take(MAX_PRIVATE);
    return Promise.all(
      rows.map(async (row) => ({
        id: row._id,
        subject: row.subject,
        subjectId: row.subjectId,
        kind: row.kind,
        label: row.label,
        value: row.value,
        url: row.url,
        hint: row.hint,
        files: await resolveFiles(ctx, row.files),
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
      })),
    );
  },
});

/**
 * Step 1 of an upload: hand the browser a one-shot URL to POST the file to.
 *
 * Guarded like everything else here — an anonymous visitor cannot obtain an
 * upload URL, so nobody can push bytes into the family's storage.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireFamily(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Step 2: record the uploaded file against a vault record.
 *
 * If the record is gone, or already full, the just-uploaded blob is deleted
 * rather than left orphaned in storage.
 */
export const attachFile = mutation({
  args: {
    id: v.id("privateRecords"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);

    const record = await ctx.db.get("privateRecords", args.id);
    if (!record) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That vault record no longer exists.");
    }

    const files = record.files ?? [];
    if (files.length >= MAX_FILES_PER_RECORD) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`A record holds at most ${MAX_FILES_PER_RECORD} files.`);
    }

    await ctx.db.patch("privateRecords", args.id, {
      files: [
        ...files,
        {
          storageId: args.storageId,
          name: args.name,
          size: args.size,
          type: args.type,
          uploadedAt: Date.now(),
        },
      ],
      updatedAt: Date.now(),
      updatedBy: actor.name,
    });
    return null;
  },
});

/** Detach a file and delete the stored blob, so nothing lingers unreferenced. */
export const removeFile = mutation({
  args: { id: v.id("privateRecords"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);

    const record = await ctx.db.get("privateRecords", args.id);
    if (!record) return null;

    await ctx.db.patch("privateRecords", args.id, {
      files: (record.files ?? []).filter((file) => file.storageId !== args.storageId),
      updatedAt: Date.now(),
      updatedBy: actor.name,
    });
    await ctx.storage.delete(args.storageId);
    return null;
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

/**
 * Read side of the machine API, for copying the vault between deployments.
 *
 * Internal, like `internalUpsert`: it skips requireFamily() because the only
 * caller is the Bearer-authenticated `/agent/private/list` route. It must
 * never be public — it returns every private value in the trip.
 */
export const internalListAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("privateRecords").take(MAX_PRIVATE);
    return rows.map((row) => ({
      subject: row.subject,
      subjectId: row.subjectId,
      kind: row.kind,
      label: row.label,
      value: row.value,
      url: row.url,
      hint: row.hint,
      updatedBy: row.updatedBy,
    }));
  },
});

export const remove = mutation({
  args: { id: v.id("privateRecords") },
  handler: async (ctx, args) => {
    await requireFamily(ctx);

    // Delete the blobs first: dropping the row on its own would strand them in
    // storage with nothing left pointing at them.
    const record = await ctx.db.get("privateRecords", args.id);
    for (const file of record?.files ?? []) {
      await ctx.storage.delete(file.storageId);
    }

    await ctx.db.delete("privateRecords", args.id);
    return null;
  },
});
