import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireFamily, type Actor } from "./lib/guards";
import { FAMILY } from "./lib/family";
import {
  blockPatch,
  checklistItemPatch,
  classify,
  classifyNames,
  contentOp,
  contentTable,
  dayPatch,
  placePatch,
  type ContentOp,
  type ContentTable,
} from "./lib/contentPolicy";

/**
 * Editing the trip's content, structurally.
 *
 * Until this file existed there was no way to change a place's opening hours
 * except find-and-replace against a guide's markdown, and no way at all to
 * move a block to another day. The plan lived in Convex but was effectively
 * read-only: the only writers were a bulk table-replacing import and a
 * substring edit on prose. This is the missing half.
 *
 * ## Two tiers, decided by the server
 *
 * `lib/contentPolicy.ts` splits every field into FACT (the world changed) and
 * PLAN (we changed our minds), and explains why. This file enforces it:
 *
 *   - a service caller (Claude Code / GPT / a seed script holding
 *     AGENT_SERVICE_KEY at a terminal) and the signed-in owner write anything;
 *   - anyone else — including eve, whoever it says it is speaking for — writes
 *     FACT fields directly and gets a PENDING SUGGESTION for the PLAN half.
 *
 * A single call can therefore do both: correcting a museum's hours while also
 * asking to move it to day 12 applies the hours now and queues the move. The
 * caller is told exactly which happened to which — see `EditResult`.
 *
 * The split is computed from the PATCH, server-side, never from a flag the
 * caller sets. That is deliberate. eve submits one patch through one route; it
 * cannot pick the unguarded endpoint because there isn't one.
 *
 * ## Why eve never gets the full tier, even for Alex
 *
 * eve holds the shared family service key, so `session.auth.initiator` is "the
 * family", not a person. The `proposedByEmail` it passes is a claim relayed
 * from the chat context, not proof. `convex/suggestions.ts` makes this argument
 * at length for approval; it applies identically here. An agent that could be
 * talked into "Alex says it's fine" is not a gate. So `internalEditFor` pins
 * the tier to `fact` unconditionally.
 */

// The tables are small and bounded (17 days, ~200 places, ~60 checklist items).
const MAX_ROWS = 1000;

/* ========================================================================== */
/* Tiering                                                                    */
/* ========================================================================== */

type Tier = "full" | "fact";

function tierFor(actor: Actor): Tier {
  if (actor.kind === "service") return "full";
  if (actor.role === "owner") return "full";
  return "fact";
}

/** What a caller gets back. Never "ok" alone — which half landed matters. */
export type EditResult = {
  table: ContentTable;
  op: ContentOp;
  key: string;
  /** Fields written to the database right now. */
  applied: string[];
  /** Fields that need the owner's yes, and the row now waiting for it. */
  pending: string[];
  suggestionId: Id<"suggestions"> | null;
};

/* ========================================================================== */
/* Applying an edit                                                           */
/* ========================================================================== */

/**
 * Resolve the public key of a row to its Convex document.
 *
 * Places and checklist items are addressed by `slug`, days by their number,
 * blocks by their `_id` — blocks have no natural stable key of their own (two
 * blocks on the same day can share a time and a title), so the document id IS
 * the key and `convex/trip.ts` now returns it as `id` on every block.
 */
async function resolve(
  ctx: MutationCtx,
  table: ContentTable,
  key: string,
): Promise<Doc<"places"> | Doc<"days"> | Doc<"blocks"> | Doc<"checklistItems">> {
  switch (table) {
    case "places": {
      const doc = await ctx.db
        .query("places")
        .withIndex("by_slug", (q) => q.eq("slug", key))
        .unique();
      if (!doc) throw new Error(`No place with id "${key}".`);
      return doc;
    }
    case "checklistItems": {
      const doc = await ctx.db
        .query("checklistItems")
        .withIndex("by_slug", (q) => q.eq("slug", key))
        .unique();
      if (!doc) throw new Error(`No checklist item with id "${key}".`);
      return doc;
    }
    case "days": {
      const n = Number(key);
      if (!Number.isInteger(n)) throw new Error(`Day key must be a number, got "${key}".`);
      const doc = await ctx.db
        .query("days")
        .withIndex("by_n", (q) => q.eq("n", n))
        .unique();
      if (!doc) throw new Error(`No day ${n}.`);
      return doc;
    }
    case "blocks": {
      const id = ctx.db.normalizeId("blocks", key);
      if (!id) {
        throw new Error(
          `"${key}" is not a block id. Read the day first and use the block's own "id".`,
        );
      }
      const doc = await ctx.db.get("blocks", id);
      if (!doc) throw new Error(`No block with id "${key}".`);
      return doc;
    }
  }
}

/**
 * Fields every content row carries, stamped on every write.
 *
 * `updatedBy` is a display name rather than an id because that is what the app
 * shows ("hours corrected by eve, for maya@…"), and because a service caller
 * has no account to point at.
 */
function stamp(actorName: string) {
  return { updatedAt: Date.now(), updatedBy: actorName };
}

/**
 * Write a patch, having already decided it is allowed.
 *
 * Exported because `convex/suggestions.ts` calls it when the owner approves a
 * content suggestion — the same code path applies the change whether it went
 * straight in or waited a week in the queue, so an approved suggestion cannot
 * behave differently from a direct edit.
 */
export async function applyContentPatch(
  ctx: MutationCtx,
  table: ContentTable,
  key: string,
  patch: Record<string, unknown>,
  unset: string[],
  actorName: string,
): Promise<void> {
  const doc = await resolve(ctx, table, key);
  // Convex reads an explicit `undefined` in a patch as "remove this field",
  // which is exactly what `unset` asks for. `classify()` drops undefined from
  // the patch itself for the same reason — so an omitted key can never clear
  // something by accident.
  const cleared = Object.fromEntries(unset.map((name) => [name, undefined]));
  await ctx.db.patch(table, doc._id as never, {
    ...patch,
    ...cleared,
    ...stamp(actorName),
  } as never);
}

/**
 * Delete a row, and clean up the references that would otherwise dangle.
 *
 * Place slugs are held by `blocks.placeIds`, `days.foodAnchorIds` and
 * `days.stay.placeId`. Convex has no foreign keys, so nothing stops a deleted
 * place from leaving a block pointing at a stop that no longer exists — the
 * page would silently render one fewer place and nobody would know why. The
 * cleanup runs in the same transaction as the delete.
 */
export async function applyContentDelete(
  ctx: MutationCtx,
  table: ContentTable,
  key: string,
  actorName: string,
): Promise<void> {
  if (table === "days") {
    throw new Error("Days cannot be created or deleted; patch the existing 17.");
  }

  const doc = await resolve(ctx, table, key);

  if (table === "places") {
    const slug = (doc as Doc<"places">).slug;

    const blocks = await ctx.db.query("blocks").take(MAX_ROWS);
    for (const block of blocks) {
      if (!block.placeIds.includes(slug)) continue;
      await ctx.db.patch("blocks", block._id, {
        placeIds: block.placeIds.filter((id) => id !== slug),
        ...stamp(actorName),
      });
    }

    const days = await ctx.db.query("days").take(MAX_ROWS);
    for (const day of days) {
      const anchored = day.foodAnchorIds.includes(slug);
      const slept = day.stay?.placeId === slug;
      if (!anchored && !slept) continue;
      await ctx.db.patch("days", day._id, {
        foodAnchorIds: anchored
          ? day.foodAnchorIds.filter((id) => id !== slug)
          : day.foodAnchorIds,
        // Keep the stay itself — the label and the door-code note are still
        // true — and only drop the pointer to the vanished place row.
        stay: slept && day.stay ? { ...day.stay, placeId: undefined } : day.stay,
        ...stamp(actorName),
      });
    }
  }

  if (table === "checklistItems") {
    const slug = (doc as Doc<"checklistItems">).slug;
    const state = await ctx.db
      .query("checklistState")
      .withIndex("by_itemSlug", (q) => q.eq("itemSlug", slug))
      .unique();
    if (state) await ctx.db.delete("checklistState", state._id);
  }

  await ctx.db.delete(table, doc._id as never);
}

/* ========================================================================== */
/* Proposing the half that needs a yes                                        */
/* ========================================================================== */

/**
 * File a pending suggestion for a structured edit.
 *
 * Written here rather than in `suggestions.ts` so this module owns the whole
 * decision (apply vs. ask) in one place; `suggestions.ts` owns what happens to
 * the row afterwards. The payload is stored as JSON — see the `content` comment
 * on the `suggestions` table for why it is a string and not a typed object.
 */
async function propose(
  ctx: MutationCtx,
  args: {
    table: ContentTable;
    op: ContentOp;
    key: string;
    fields: Record<string, unknown>;
    unset?: string[];
    title: string;
    rationale?: string;
    proposedByEmail: string;
    proposedByName: string;
  },
): Promise<Id<"suggestions">> {
  return await ctx.db.insert("suggestions", {
    targetKind: "content",
    content: {
      table: args.table,
      op: args.op,
      key: args.key,
      fieldsJson: JSON.stringify(args.fields),
      unset: args.unset?.length ? args.unset : undefined,
    },
    title: args.title,
    rationale: args.rationale,
    status: "pending",
    // A structured edit is always mechanically appliable — that is the point
    // of it having a shape instead of being prose.
    needsManualApply: false,
    proposedByEmail: args.proposedByEmail,
    proposedByName: args.proposedByName,
    createdAt: Date.now(),
  });
}

/** Short Hebrew description of a target, for the owner's review queue. */
function describeTarget(table: ContentTable, key: string): string {
  switch (table) {
    case "places":
      return `המקום ${key}`;
    case "days":
      return `יום ${key}`;
    case "blocks":
      return "בלוק בתוכנית";
    case "checklistItems":
      return `משימה ${key}`;
  }
}

/* ========================================================================== */
/* The one code path every edit goes through                                  */
/* ========================================================================== */

type EditArgs = {
  table: ContentTable;
  op: ContentOp;
  key: string;
  patch: Record<string, unknown>;
  /** Field names to clear. Tiered exactly like the patch — see contentPolicy. */
  unset?: string[];
  rationale?: string;
};

/**
 * Apply what this actor may apply, propose the rest.
 *
 * Every public mutation and every agent route funnels into here, so the tier
 * rule is written down exactly once.
 */
async function edit(
  ctx: MutationCtx,
  actor: Actor,
  tier: Tier,
  args: EditArgs,
): Promise<EditResult> {
  const { table, op, key } = args;

  const base: EditResult = {
    table,
    op,
    key,
    applied: [],
    pending: [],
    suggestionId: null,
  };

  /* ------------------------------------------------ create and delete */

  // Never a factual correction: adding a stop to the trip or removing one is a
  // decision, in every table, whatever fields come with it.
  if (op === "create" || op === "delete") {
    if (tier === "full") {
      if (op === "delete") {
        await applyContentDelete(ctx, table, key, actor.name);
      } else {
        await applyContentCreate(ctx, table, key, args.patch, actor.name);
      }
      return { ...base, applied: op === "create" ? Object.keys(args.patch) : ["*"] };
    }

    const email = requireProposer(actor);
    const id = await propose(ctx, {
      table,
      op,
      key,
      fields: args.patch,
      title:
        op === "create"
          ? `להוסיף ${describeTarget(table, key)}`
          : `להסיר ${describeTarget(table, key)}`,
      rationale: args.rationale,
      proposedByEmail: email.email,
      proposedByName: email.name,
    });
    return { ...base, pending: ["*"], suggestionId: id };
  }

  /* ------------------------------------------------------------ patch */

  const { fact, plan } = classify(table, args.patch);
  const cleared = classifyNames(table, args.unset ?? []);

  const factNames = [...Object.keys(fact), ...cleared.fact];
  const planNames = [...Object.keys(plan), ...cleared.plan];

  if (factNames.length === 0 && planNames.length === 0) {
    throw new Error("Nothing to change: the patch has no fields.");
  }

  // Fail before writing anything if the target is not there, so a patch that
  // half-applies and half-queues against a missing row is impossible.
  await resolve(ctx, table, key);

  if (tier === "full") {
    await applyContentPatch(
      ctx,
      table,
      key,
      { ...fact, ...plan },
      [...cleared.fact, ...cleared.plan],
      actor.name,
    );
    return { ...base, applied: [...factNames, ...planNames] };
  }

  if (factNames.length > 0) {
    await applyContentPatch(ctx, table, key, fact, cleared.fact, actor.name);
  }

  if (planNames.length === 0) {
    return { ...base, applied: factNames };
  }

  const proposer = requireProposer(actor);
  const id = await propose(ctx, {
    table,
    op: "patch",
    key,
    fields: plan,
    unset: cleared.plan,
    title: `לעדכן ${describeTarget(table, key)} — ${planNames.join(", ")}`,
    rationale: args.rationale,
    proposedByEmail: proposer.email,
    proposedByName: proposer.name,
  });

  return {
    ...base,
    applied: factNames,
    pending: planNames,
    suggestionId: id,
  };
}

/**
 * A suggestion nobody can be asked about is not reviewable — same rule as
 * `suggestions.propose`.
 */
function requireProposer(actor: Actor): { email: string; name: string } {
  if (!actor.email) {
    throw new Error(
      "This change needs the trip owner's approval, but there is no identified " +
        "family member to file it on behalf of. Sign in with a family account.",
    );
  }
  return { email: actor.email, name: actor.name };
}

/**
 * Insert a new row. Required fields are checked here rather than by a
 * validator because the same shape has to survive a round trip through a
 * suggestion's `fieldsJson`, where no validator runs.
 */
export async function applyContentCreate(
  ctx: MutationCtx,
  table: ContentTable,
  key: string,
  fields: Record<string, unknown>,
  actorName: string,
): Promise<void> {
  const need = (name: string): unknown => {
    const value = fields[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Creating a ${table} row needs "${name}".`);
    }
    return value;
  };

  switch (table) {
    case "places": {
      const clash = await ctx.db
        .query("places")
        .withIndex("by_slug", (q) => q.eq("slug", key))
        .unique();
      if (clash) throw new Error(`A place with id "${key}" already exists.`);

      await ctx.db.insert("places", {
        slug: key,
        nameHe: need("nameHe") as string,
        nameEn: need("nameEn") as string,
        category: need("category") as never,
        area: need("area") as string,
        city: need("city") as never,
        lat: need("lat") as number,
        lng: need("lng") as number,
        descriptionHe: need("descriptionHe") as string,
        days: (fields.days as number[] | undefined) ?? [],
        planned: (fields.planned as boolean | undefined) ?? false,
        ...optional(fields, [
          "nameJa",
          "tips",
          "image",
          "mapsQuery",
          "mustDo",
          "indoor",
          "openingHours",
          "officialUrl",
          "priceLevel",
          "addressEn",
          "addressJa",
          "phone",
          "nearestStation",
          "stationExit",
          "walkMinutes",
          "closedDays",
          "lastEntry",
          "ticketNote",
        ]),
        ...stamp(actorName),
      } as never);
      return;
    }

    case "checklistItems": {
      const clash = await ctx.db
        .query("checklistItems")
        .withIndex("by_slug", (q) => q.eq("slug", key))
        .unique();
      if (clash) throw new Error(`A checklist item with id "${key}" already exists.`);

      const group = need("group") as string;
      const groupRow = await ctx.db
        .query("checklistGroups")
        .withIndex("by_order")
        .take(MAX_ROWS);
      if (!groupRow.some((g) => g.title === group)) {
        throw new Error(
          `"${group}" is not a checklist group. Existing groups: ` +
            groupRow.map((g) => g.title).join(" · "),
        );
      }

      await ctx.db.insert("checklistItems", {
        slug: key,
        group,
        title: need("title") as string,
        // Append to the end of its group unless the caller placed it.
        order:
          (fields.order as number | undefined) ??
          (await nextChecklistOrder(ctx, group)),
        ...optional(fields, ["detail", "due", "doFrom", "url", "critical"]),
        ...stamp(actorName),
      } as never);
      return;
    }

    case "blocks": {
      const dayN = need("dayN") as number;
      const day = await ctx.db
        .query("days")
        .withIndex("by_n", (q) => q.eq("n", dayN))
        .unique();
      if (!day) throw new Error(`No day ${dayN} to add a block to.`);

      await ctx.db.insert("blocks", {
        dayN,
        title: need("title") as string,
        placeIds: (fields.placeIds as string[] | undefined) ?? [],
        order: (fields.order as number | undefined) ?? (await nextBlockOrder(ctx, dayN)),
        ...optional(fields, [
          "time",
          "detail",
          "cutFirst",
          "booking",
          "legs",
          "costs",
          "links",
          "needs",
          "warnings",
        ]),
        ...stamp(actorName),
      } as never);
      return;
    }

    case "days":
      // The 17 days are the trip. Adding an 18th is not a content edit, it is a
      // different holiday — and `n` is assumed dense by every caller that maps
      // day numbers to routes and hero images.
      throw new Error("Days cannot be created or deleted; patch the existing 17.");
  }
}

function optional(
  fields: Record<string, unknown>,
  names: string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of names) {
    if (fields[name] !== undefined) out[name] = fields[name];
  }
  return out;
}

/**
 * Sparse ordering, so inserting between two blocks never rewrites their
 * siblings — see the `blocks` table comment in schema.ts.
 */
async function nextBlockOrder(ctx: MutationCtx, dayN: number): Promise<number> {
  const blocks = await ctx.db
    .query("blocks")
    .withIndex("by_dayN_and_order", (q) => q.eq("dayN", dayN))
    .take(MAX_ROWS);
  return blocks.reduce((max, b) => Math.max(max, b.order), 0) + 10;
}

async function nextChecklistOrder(ctx: MutationCtx, group: string): Promise<number> {
  const items = await ctx.db
    .query("checklistItems")
    .withIndex("by_group_and_order", (q) => q.eq("group", group))
    .take(MAX_ROWS);
  return items.reduce((max, i) => Math.max(max, i.order), 0) + 10;
}

/* ========================================================================== */
/* Public surface — the app, signed in with Clerk                             */
/* ========================================================================== */

const editResult = v.object({
  table: contentTable,
  op: contentOp,
  key: v.string(),
  applied: v.array(v.string()),
  pending: v.array(v.string()),
  suggestionId: v.union(v.id("suggestions"), v.null()),
});

export const patchPlace = mutation({
  args: {
    id: v.string(),
    patch: placePatch,
    unset: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "places",
      op: "patch",
      key: args.id,
      patch: args.patch,
      unset: args.unset,
      rationale: args.rationale,
    });
  },
});

export const createPlace = mutation({
  args: { id: v.string(), place: placePatch, rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "places",
      op: "create",
      key: args.id,
      patch: args.place,
      rationale: args.rationale,
    });
  },
});

export const removePlace = mutation({
  args: { id: v.string(), rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "places",
      op: "delete",
      key: args.id,
      patch: {},
      rationale: args.rationale,
    });
  },
});

export const patchDay = mutation({
  args: {
    n: v.number(),
    patch: dayPatch,
    unset: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "days",
      op: "patch",
      key: String(args.n),
      patch: args.patch,
      unset: args.unset,
      rationale: args.rationale,
    });
  },
});

export const patchBlock = mutation({
  args: {
    id: v.string(),
    patch: blockPatch,
    unset: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "blocks",
      op: "patch",
      key: args.id,
      patch: args.patch,
      unset: args.unset,
      rationale: args.rationale,
    });
  },
});

export const createBlock = mutation({
  args: { block: blockPatch, rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "blocks",
      op: "create",
      // A block's key is its document id, which does not exist until it is
      // inserted. `""` marks "to be assigned"; the create path ignores it.
      key: "",
      patch: args.block,
      rationale: args.rationale,
    });
  },
});

export const removeBlock = mutation({
  args: { id: v.string(), rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "blocks",
      op: "delete",
      key: args.id,
      patch: {},
      rationale: args.rationale,
    });
  },
});

export const patchChecklistItem = mutation({
  args: {
    id: v.string(),
    patch: checklistItemPatch,
    unset: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "checklistItems",
      op: "patch",
      key: args.id,
      patch: args.patch,
      unset: args.unset,
      rationale: args.rationale,
    });
  },
});

export const createChecklistItem = mutation({
  args: { id: v.string(), item: checklistItemPatch, rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "checklistItems",
      op: "create",
      key: args.id,
      patch: args.item,
      rationale: args.rationale,
    });
  },
});

export const removeChecklistItem = mutation({
  args: { id: v.string(), rationale: v.optional(v.string()) },
  returns: editResult,
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return await edit(ctx, actor, tierFor(actor), {
      table: "checklistItems",
      op: "delete",
      key: args.id,
      patch: {},
      rationale: args.rationale,
    });
  },
});

/**
 * Which tier is the caller in, so the UI can say so before they try.
 *
 * Same reason `suggestions.viewer` exists: a form that offers a field the
 * mutation will only queue should say "this one needs Alex" up front, rather
 * than looking like it saved and then not having.
 */
export const editor = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireFamily(ctx);
    const tier = tierFor(actor);
    return {
      name: actor.name,
      role: actor.role ?? null,
      tier,
      canEditPlan: tier === "full",
    };
  },
});

/* ========================================================================== */
/* Agent (service-key) surface                                                */
/* ========================================================================== */

/**
 * Content edit on behalf of a named family member — eve's only way in.
 *
 * Reached through `/agent/content/edit` in `convex/http.ts`. The tier is pinned
 * to `fact` and NOT derived from the e-mail: see this file's header. Even when
 * the claimed address is the owner's, a plan change from this path lands as a
 * pending suggestion, because a shared secret cannot prove who is typing.
 */
export const internalEditFor = internalMutation({
  args: {
    byEmail: v.string(),
    table: contentTable,
    op: contentOp,
    key: v.string(),
    // Validated per table below. It arrives from an HTTP body, so the shape is
    // checked against the real patch validator by `internalApplyContent`
    // before anything is written.
    place: v.optional(placePatch),
    day: v.optional(dayPatch),
    block: v.optional(blockPatch),
    checklistItem: v.optional(checklistItemPatch),
    unset: v.optional(v.array(v.string())),
    rationale: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const email = args.byEmail.trim().toLowerCase();
    const member = FAMILY[email];
    if (!member) throw new Error(`${email} is not on the family list.`);

    const patch =
      args.place ?? args.day ?? args.block ?? args.checklistItem ?? ({} as Record<string, unknown>);

    return await edit(
      ctx,
      { kind: "family", name: `eve (עבור ${member.name})`, email, role: member.role },
      "fact",
      {
        table: args.table,
        op: args.op,
        key: args.key,
        patch: patch as Record<string, unknown>,
        unset: args.unset,
        rationale: args.rationale,
      },
    );
  },
});

/**
 * Content edit at the FULL tier — the terminal's way in.
 *
 * This is what `npm run content` calls, and it is how Alex, Claude Code and GPT
 * edit the trip from a shell: plan fields included, no approval queue, because
 * whoever runs it is at a terminal with the repo open rather than talking to a
 * chatbot.
 *
 * MAINTENANCE ONLY — deliberately an `internalMutation` with NO HTTP route, so
 * it is reachable from `npx convex run` (which needs the DEPLOY key) and from
 * nothing else. That is the same fence `suggestions.internalUpsertGuide` sits
 * behind, and it matters for one specific reason: eve holds AGENT_SERVICE_KEY,
 * so anything exposed under `/agent/*` is in principle reachable by the agent.
 * Putting the full tier behind a different credential means no prompt, however
 * clever, can reach it — the approval gate is not merely policy in the model's
 * instructions, it is a key the agent does not have.
 */
export const internalEditAsOwner = internalMutation({
  args: {
    table: contentTable,
    op: contentOp,
    key: v.string(),
    place: v.optional(placePatch),
    day: v.optional(dayPatch),
    block: v.optional(blockPatch),
    checklistItem: v.optional(checklistItemPatch),
    unset: v.optional(v.array(v.string())),
    /** Who to record in `updatedBy`. Defaults to the tool that ran it. */
    actorName: v.optional(v.string()),
  },
  returns: editResult,
  handler: async (ctx, args) => {
    const patch = (args.place ??
      args.day ??
      args.block ??
      args.checklistItem ??
      {}) as Record<string, unknown>;

    return await edit(
      ctx,
      { kind: "service", name: args.actorName ?? "terminal" },
      "full",
      {
        table: args.table,
        op: args.op,
        key: args.key,
        patch,
        unset: args.unset,
      },
    );
  },
});

/**
 * Apply an approved content suggestion.
 *
 * Called by `suggestions.approve` via `ctx.runMutation`, which is the point:
 * the payload comes back out of `fieldsJson` as untyped JSON, and routing it
 * through a real function boundary is what re-validates it against the same
 * patch validators the direct path uses. A suggestion whose stored fields no
 * longer typecheck fails here, the nested transaction rolls back, and — because
 * `approve` does not catch — the approval rolls back with it. There is no state
 * where a suggestion says "approved" and the data disagrees.
 */
export const internalApplyContent = internalMutation({
  args: {
    table: contentTable,
    op: contentOp,
    key: v.string(),
    place: v.optional(placePatch),
    day: v.optional(dayPatch),
    block: v.optional(blockPatch),
    checklistItem: v.optional(checklistItemPatch),
    unset: v.optional(v.array(v.string())),
    actorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch = (args.place ??
      args.day ??
      args.block ??
      args.checklistItem ??
      {}) as Record<string, unknown>;

    if (args.op === "delete") {
      await applyContentDelete(ctx, args.table, args.key, args.actorName);
      return null;
    }
    if (args.op === "create") {
      await applyContentCreate(ctx, args.table, args.key, patch, args.actorName);
      return null;
    }
    await applyContentPatch(ctx, args.table, args.key, patch, args.unset ?? [], args.actorName);
    return null;
  },
});

/**
 * The argument slot a table's patch belongs in.
 *
 * `internalApplyContent` and `internalEditFor` take one optional patch per
 * table rather than a single `v.any()`, so every field is checked by a real
 * validator. This maps a table name to its slot for callers assembling those
 * args from loose JSON.
 */
export const PATCH_ARG: Record<ContentTable, "place" | "day" | "block" | "checklistItem"> = {
  places: "place",
  days: "day",
  blocks: "block",
  checklistItems: "checklistItem",
};
