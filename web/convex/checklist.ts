/**
 * Ticking pre-trip checklist items off, family-wide.
 *
 * ## Why this file exists now
 *
 * `checklistState` has been in the schema since the migration, described as
 * "empty until Phase 4 starts writing it". Nothing wrote it, so the only way to
 * tick something off was the eve agent editing `11-PRE-TRIP-CHECKLIST.md` and
 * committing it — the markdown `- [x]` was the real state.
 *
 * That stopped being viable when Convex became the source of truth: those files
 * are now the export, so a commit into them is overwritten by the next
 * `npm run export:md`. A tick recorded that way would silently vanish.
 *
 * So progress lives here instead. The markdown keeps its `- [ ]` boxes as the
 * DEFINITION of each item (what to do, when, who), and this table carries
 * whether it is done — which is also what makes it shared rather than
 * per-device.
 *
 * ## Who may tick
 *
 * Any family member, deliberately. Ticking "bought the walking shoes" is not a
 * change to the plan — it is reporting a fact about the world, and needing
 * Alex to countersign it would be friction with no safety payoff. That is the
 * same line drawn in `suggestions.ts`: proposals to CHANGE the plan are gated;
 * recording what happened is not.
 *
 * `doneBy` records who, so a wrong tick is a conversation rather than a mystery.
 */

import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { requireFamily } from "./lib/guards";
import { FAMILY } from "./lib/family";

/**
 * Upsert one item's done state.
 *
 * Shared by the signed-in path and the agent path so the two can never drift in
 * how they record a tick.
 */
async function setState(
  ctx: MutationCtx,
  itemSlug: string,
  done: boolean,
  actorName: string,
) {
  const item = await ctx.db
    .query("checklistItems")
    .withIndex("by_slug", (q) => q.eq("slug", itemSlug))
    .unique();
  if (!item) throw new Error(`No checklist item with slug "${itemSlug}".`);

  const existing = await ctx.db
    .query("checklistState")
    .withIndex("by_itemSlug", (q) => q.eq("itemSlug", itemSlug))
    .unique();

  const patch = {
    itemSlug,
    done,
    // Clearing a tick clears its provenance too: keeping "done by Alex" on an
    // item that is no longer done is worse than knowing nothing.
    doneAt: done ? Date.now() : undefined,
    doneBy: done ? actorName : undefined,
  };

  if (existing) {
    await ctx.db.patch("checklistState", existing._id, patch);
    return { itemSlug, done, changed: existing.done !== done };
  }

  await ctx.db.insert("checklistState", patch);
  return { itemSlug, done, changed: true };
}

/** Tick or untick, as the signed-in family member doing it. */
export const setDone = mutation({
  args: { itemSlug: v.string(), done: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    return setState(ctx, args.itemSlug, args.done, actor.name);
  },
});

/**
 * Tick on behalf of a named family member, for the eve agent.
 *
 * Service-key only, and the address is checked against the allowlist here, so
 * the agent cannot attribute a tick to somebody who is not on the trip. Unlike
 * `suggestions.approve` this is open to the service path on purpose — see the
 * header for why recording a fact is not the same as changing the plan.
 */
export const internalSetDoneFor = internalMutation({
  args: {
    /** Either an exact slug, or `itemText` below. */
    itemSlug: v.optional(v.string()),
    /**
     * A distinctive fragment of the item's wording, as a person would quote it.
     * Resolved here rather than in the agent so that "must identify exactly one
     * item" is defined once, on the server, against the live list.
     */
    itemText: v.optional(v.string()),
    done: v.boolean(),
    actorEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const email = args.actorEmail.trim().toLowerCase();
    const member = FAMILY[email];
    if (!member) throw new Error(`${email} is not on the family list.`);

    if (args.itemSlug) {
      return setState(ctx, args.itemSlug, args.done, member.name);
    }

    if (!args.itemText) throw new Error("Provide either `itemSlug` or `itemText`.");

    const needle = args.itemText.trim().toLowerCase().replace(/\s+/g, " ");
    const items = await ctx.db.query("checklistItems").take(500);
    const matches = items.filter((item) =>
      item.title.toLowerCase().replace(/\s+/g, " ").includes(needle),
    );

    if (matches.length === 0) {
      throw new Error(
        `No checklist item matches "${args.itemText}". ` +
          `Quote a distinctive fragment of the item's wording, copied from the checklist.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `"${args.itemText}" matches ${matches.length} checklist items ` +
          `(${matches.map((m) => m.title).join(" / ")}). Use a longer fragment.`,
      );
    }

    return setState(ctx, matches[0].slug, args.done, member.name);
  },
});
