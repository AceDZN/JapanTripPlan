import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { FAMILY } from "./lib/family";
import { requireFamily } from "./lib/guards";

/**
 * The family wish list — what each of us wants out of this trip.
 *
 * THE PRIVACY RULE, in one sentence: a caller sees every `shared` wish plus
 * their own `private` ones, and never anybody else's private ones.
 *
 * It is enforced in exactly one place — `visibleTo()` — and every read goes
 * through it. Convex hands back whole documents, so "filter it in the UI" is
 * not a control: the row would still be on the wire. The point of a private
 * wish is that someone can note a surprise for a person who also uses this
 * app, so leaking one is not a cosmetic bug.
 */

const MAX_WISHES = 1000;

const kindValidator = v.union(
  v.literal("attraction"),
  v.literal("place"),
  v.literal("product"),
  v.literal("food"),
  v.literal("experience"),
  v.literal("other"),
);

const priorityValidator = v.union(
  v.literal("must"),
  v.literal("want"),
  v.literal("maybe"),
);

const visibilityValidator = v.union(v.literal("shared"), v.literal("private"));

const statusValidator = v.union(
  v.literal("idea"),
  v.literal("researching"),
  v.literal("approved"),
  v.literal("done"),
  v.literal("dropped"),
);

/** The research half — written by eve, or by a person doing it by hand. */
export const whereToBuyValidator = v.array(
  v.object({
    shop: v.string(),
    shopJa: v.optional(v.string()),
    area: v.optional(v.string()),
    placeId: v.optional(v.string()),
    dayN: v.optional(v.number()),
    priceYen: v.optional(v.number()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
  }),
);

export const sourcesValidator = v.array(
  v.object({ label: v.string(), url: v.string() }),
);

export const imagesValidator = v.array(
  v.object({
    storageId: v.id("_storage"),
    alt: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
  }),
);

/** The verified caller, with the e-mail that owns their wishes. */
async function caller(ctx: QueryCtx | MutationCtx) {
  const actor = await requireFamily(ctx);
  if (!actor.email) {
    // requireFamily only returns a family actor when the JWT carried an
    // allowlisted e-mail, so this is unreachable — but ownership is the whole
    // security model here, and it must never silently default.
    throw new Error("Family identity has no e-mail claim; cannot own a wish.");
  }
  return { email: actor.email, name: actor.name, role: actor.role };
}

/** The one place the privacy rule lives. */
function visibleTo(email: string) {
  return (wish: Doc<"wishes">) =>
    wish.visibility === "shared" || wish.ownerEmail === email;
}

/**
 * Shape a wish for the client, minting signed URLs for its images.
 *
 * Only ever called after `visibleTo()` has already accepted the row, so an
 * image URL is never minted for a wish the caller may not see.
 */
async function toWish(
  ctx: QueryCtx,
  doc: Doc<"wishes">,
  email: string,
) {
  const { _id, _creationTime, images, ...rest } = doc;
  return {
    id: _id,
    ...rest,
    images: await Promise.all(
      (images ?? []).map(async (image) => ({
        ...image,
        // A file whose storage entry has gone yields null rather than throwing,
        // so one bad image cannot take the whole list down.
        url: await ctx.storage.getUrl(image.storageId),
      })),
    ),
    /** So the UI can show edit/delete without re-deriving ownership. */
    mine: doc.ownerEmail === email,
  };
}

/** Every wish this caller is allowed to see, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const { email } = await caller(ctx);
    const all = await ctx.db.query("wishes").take(MAX_WISHES);
    return await Promise.all(
      all
        .filter(visibleTo(email))
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((doc) => toWish(ctx, doc, email)),
    );
  },
});

/** Wishes pinned to one day, for the day page's "what we wanted here" strip. */
export const listForDay = query({
  args: { dayN: v.number() },
  handler: async (ctx, args) => {
    const { email } = await caller(ctx);

    // A wish reaches a day two ways: pinned directly (`dayN`), or because the
    // research found a shop on that day's route. Both belong on the page —
    // "you are passing the shop today" is the whole point of the feature.
    const pinned = await ctx.db
      .query("wishes")
      .withIndex("by_dayN", (q) => q.eq("dayN", args.dayN))
      .take(MAX_WISHES);

    const all = await ctx.db.query("wishes").take(MAX_WISHES);
    const viaShop = all.filter((wish) =>
      (wish.whereToBuy ?? []).some((shop) => shop.dayN === args.dayN),
    );

    const seen = new Set<string>();
    const merged = [...pinned, ...viaShop].filter((wish) => {
      const key = wish._id as unknown as string;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return await Promise.all(
      merged
        .filter(visibleTo(email))
        .filter((wish) => wish.status !== "dropped")
        .map((doc) => toWish(ctx, doc, email)),
    );
  },
});

export const add = mutation({
  args: {
    kind: kindValidator,
    title: v.string(),
    titleEn: v.optional(v.string()),
    titleJa: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    area: v.optional(v.string()),
    dayN: v.optional(v.number()),
    priceYen: v.optional(v.number()),
    priority: priorityValidator,
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("A wish needs a title.");

    const now = Date.now();
    // Ownership comes from the verified identity, never from the arguments —
    // there is deliberately no ownerEmail parameter to spoof.
    return await ctx.db.insert("wishes", {
      ...args,
      title,
      ownerEmail: email,
      ownerName: name,
      status: "idea",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Edit a wish.
 *
 * Content belongs to whoever added it: only the owner may change the words, the
 * price, or — critically — the visibility, so nobody else can make someone's
 * private wish public. `status` is the exception, because deciding "yes we are
 * doing this" is a family conversation, not a personal one; any family member
 * may move a SHARED wish along.
 */
export const update = mutation({
  args: {
    id: v.id("wishes"),
    kind: v.optional(kindValidator),
    title: v.optional(v.string()),
    titleEn: v.optional(v.string()),
    titleJa: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    area: v.optional(v.string()),
    dayN: v.optional(v.number()),
    priceYen: v.optional(v.number()),
    priority: v.optional(priorityValidator),
    visibility: v.optional(visibilityValidator),
    status: v.optional(statusValidator),
    whereToBuy: v.optional(whereToBuyValidator),
    sources: v.optional(sourcesValidator),
  },
  handler: async (ctx, args) => {
    const { email } = await caller(ctx);
    const { id, ...patch } = args;

    const wish = await ctx.db.get("wishes", id);
    // Same answer for "does not exist" and "not yours to see", so this cannot
    // be used to probe whether someone else has a private wish.
    if (!wish || !visibleTo(email)(wish)) throw new Error("No such wish.");

    const mine = wish.ownerEmail === email;
    const onlyStatus =
      Object.keys(patch).every((key) => key === "status" || patch[key as keyof typeof patch] === undefined);

    if (!mine && !(onlyStatus && wish.visibility === "shared")) {
      throw new Error(
        "Only the person who added a wish can edit it. You can change the status of a shared wish.",
      );
    }

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("A wish needs a title.");
    }

    await ctx.db.patch("wishes", id, { ...patch, updatedAt: Date.now() });
  },
});

/** Only the owner may delete. Everyone else can mark a shared wish "dropped". */
export const remove = mutation({
  args: { id: v.id("wishes") },
  handler: async (ctx, args) => {
    const { email } = await caller(ctx);
    const wish = await ctx.db.get("wishes", args.id);
    if (!wish || !visibleTo(email)(wish)) throw new Error("No such wish.");
    if (wish.ownerEmail !== email) {
      throw new Error("Only the person who added a wish can delete it.");
    }
    await ctx.db.delete("wishes", args.id);
  },
});

/**
 * Create a wish ON BEHALF OF a family member. Service-key only.
 *
 * This is how eve records "Tommy asked me for a Pikachu figure" as Tommy's
 * wish rather than as an anonymous one. Two things make that safe:
 *
 * 1. `ownerEmail` must be on the allowlist in `lib/family.ts`, so this can
 *    never mint a wish for someone outside the family; and
 * 2. the caller is the relay, not the browser — the e-mail eve passes comes
 *    from the verified `משתמש:` clause that `lib/agent-context.ts` stamps onto
 *    every turn server-side, which a client cannot forge.
 *
 * `visibility` is the caller's to set here, because the whole point is
 * honouring "keep this one to yourself". Note the asymmetry with
 * `internalApplyResearch`, which deliberately CANNOT touch visibility: setting
 * it at creation is the person's stated intent, flipping it afterwards would
 * be the agent overriding them.
 *
 * Idempotent on (ownerEmail, title), so a retried tool call converges instead
 * of duplicating, and never overwrites an edit somebody has since made.
 */
export const internalCreateFor = internalMutation({
  args: {
    ownerEmail: v.string(),
    /** What the person actually said, so the origin of the wish stays visible. */
    promptText: v.optional(v.string()),
    kind: kindValidator,
    title: v.string(),
    titleEn: v.optional(v.string()),
    titleJa: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    area: v.optional(v.string()),
    dayN: v.optional(v.number()),
    priceYen: v.optional(v.number()),
    priority: priorityValidator,
    visibility: visibilityValidator,
  },
  handler: async (ctx, args) => {
    const ownerEmail = args.ownerEmail.trim().toLowerCase();
    const member = FAMILY[ownerEmail];
    if (!member) throw new Error(`${ownerEmail} is not on the family list.`);

    const existing = await ctx.db
      .query("wishes")
      .withIndex("by_ownerEmail", (q) => q.eq("ownerEmail", ownerEmail))
      .take(MAX_WISHES);
    const match = existing.find((wish) => wish.title === args.title.trim());
    if (match) return { id: match._id, created: false };

    const now = Date.now();
    const id = await ctx.db.insert("wishes", {
      ...args,
      title: args.title.trim(),
      ownerEmail,
      ownerName: member.name,
      status: "idea",
      createdAt: now,
      updatedAt: now,
    });
    return { id, created: true };
  },
});

/**
 * Write a research result back onto a wish. Service-key only, via
 * `/agent/wishes/research`.
 *
 * Split from the family-facing `update` on purpose. eve is not a family member
 * and has no e-mail identity, so it must not be able to reach a mutation that
 * decides ownership — and it must never touch `visibility`, which is the one
 * field that could turn somebody's private wish public. It can fill in the
 * research and move a wish out of "researching"; it cannot change who owns it,
 * who can see it, or what they asked for.
 */
export const internalApplyResearch = internalMutation({
  args: {
    id: v.id("wishes"),
    titleEn: v.optional(v.string()),
    titleJa: v.optional(v.string()),
    note: v.optional(v.string()),
    url: v.optional(v.string()),
    placeId: v.optional(v.string()),
    area: v.optional(v.string()),
    dayN: v.optional(v.number()),
    priceYen: v.optional(v.number()),
    whereToBuy: v.optional(whereToBuyValidator),
    sources: v.optional(sourcesValidator),
    images: v.optional(imagesValidator),
    /** Only ever "idea" (research done) — never approved/done/dropped, which
     *  are family decisions, and never "researching" backwards. */
    finish: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, finish, ...research } = args;
    const wish = await ctx.db.get("wishes", id);
    if (!wish) throw new Error("No such wish.");

    const patch: Record<string, unknown> = {
      ...research,
      researchedAt: Date.now(),
      researchedBy: "eve",
      updatedAt: Date.now(),
    };
    // Only lift it out of "researching"; never override a decision the family
    // has already made about this wish.
    if (finish && wish.status === "researching") patch.status = "idea";

    await ctx.db.patch("wishes", id, patch);
    return { id, ok: true };
  },
});

/**
 * Create a wish from a family member's prompt and park it for eve.
 *
 * This is what the "ask eve to research it" button calls: it records who asked
 * and what they said, marks the wish `researching` so the UI can show it is in
 * flight, and returns the id for the agent to fill in.
 */
export const requestResearch = mutation({
  args: {
    promptText: v.string(),
    kind: v.optional(kindValidator),
    priority: v.optional(priorityValidator),
    visibility: v.optional(visibilityValidator),
    dayN: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);
    const promptText = args.promptText.trim();
    if (!promptText) throw new Error("Tell eve what you are after.");

    const now = Date.now();
    return await ctx.db.insert("wishes", {
      kind: args.kind ?? "other",
      // Until eve answers, the prompt IS the title — a placeholder here would
      // read as though the app had lost what you typed.
      title: promptText.slice(0, 120),
      promptText,
      priority: args.priority ?? "want",
      visibility: args.visibility ?? "shared",
      dayN: args.dayN,
      ownerEmail: email,
      ownerName: name,
      status: "researching",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Upload URL for a wish image. Family-only; eve uses the service route. */
export const generateImageUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await caller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Every wish, private ones included. Service-key only.
 *
 * The single read in this file that bypasses `visibleTo()`. eve needs it to
 * research a private wish at all — but its instructions forbid repeating a
 * private wish to anyone but its owner, and the service key never leaves the
 * server.
 */
export const internalListAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const wishes = await ctx.db.query("wishes").take(MAX_WISHES);
    return wishes.map((wish) => ({
      id: wish._id,
      kind: wish.kind,
      title: wish.title,
      titleEn: wish.titleEn,
      titleJa: wish.titleJa,
      note: wish.note,
      promptText: wish.promptText,
      url: wish.url,
      placeId: wish.placeId,
      area: wish.area,
      dayN: wish.dayN,
      priceYen: wish.priceYen,
      priority: wish.priority,
      visibility: wish.visibility,
      ownerName: wish.ownerName,
      ownerEmail: wish.ownerEmail,
      status: wish.status,
      whereToBuy: wish.whereToBuy,
      sources: wish.sources,
      hasImages: (wish.images ?? []).length > 0,
      researchedAt: wish.researchedAt,
    }));
  },
});
