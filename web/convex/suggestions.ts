/**
 * Proposed changes to the shared plan, and the owner's decision on them.
 *
 * The rule this file exists to enforce: anyone in the family may PROPOSE a
 * change to a guide or a day; only the owner may APPROVE one. Everything else
 * here is bookkeeping around that sentence.
 *
 * Why guides and days only — see the `suggestions` table comment in schema.ts.
 * Wishes deliberately do not go through this: people manage their own.
 *
 * ## The service-key hole, and why approval is closed to it
 *
 * `requireFamily()` accepts two kinds of actor. A "family" actor proved who
 * they are with a Clerk JWT. A "service" actor merely holds AGENT_SERVICE_KEY,
 * and `guards.ts` documents it as acting "with full access, as the trip owner".
 *
 * That is fine for reading, and fine for PROPOSING — a pending row is inert,
 * and eve creating one on Maya's behalf is the whole point. It is NOT fine for
 * approving, because the approval gate is the only thing standing between "a
 * kid asked eve to rewrite the itinerary" and "the itinerary is rewritten". A
 * shared secret that every agent process holds cannot be the proof that Alex
 * personally said yes.
 *
 * So `approve` and `reject` require `kind === "family"` AND `role === "owner"`.
 * A service caller is refused with an explanation rather than silently treated
 * as the owner. For eve to approve, the caller's real Clerk identity has to
 * reach Convex — which is what the relay change in `lib/agent-context.ts` and
 * the `/agent` routes are for.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireFamily } from "./lib/guards";
import { FAMILY } from "./lib/family";

const targetKindValidator = v.union(v.literal("guide"), v.literal("day"));

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("withdrawn"),
);

/** How many rows any one query will ever read. Small on purpose: four people. */
const MAX_ROWS = 200;

/**
 * The owner, or a clear refusal.
 *
 * Deliberately strict about `kind`: see the header. A service token is not a
 * person, and approval is a person's act.
 */
async function requireOwner(ctx: MutationCtx) {
  const actor = await requireFamily(ctx);

  if (actor.kind !== "family") {
    throw new Error(
      "Approving a change to the shared plan needs a signed-in family member, " +
        "not a service key. Ask Alex to approve it from the app or from his own chat.",
    );
  }
  if (actor.role !== "owner") {
    throw new Error(
      `Only the trip owner can approve or reject changes to the plan. ` +
        `You are signed in as ${actor.name} (${actor.role}). ` +
        `Your suggestion stays pending until Alex decides on it.`,
    );
  }
  if (!actor.email) {
    throw new Error("Owner identity has no e-mail claim; refusing to record a decision.");
  }

  return { ...actor, email: actor.email };
}

/** Shape a row for the client and for the agent. */
function toSuggestion(doc: Doc<"suggestions">) {
  const { _id, _creationTime, ...rest } = doc;
  return { id: _id, ...rest };
}

/**
 * Apply a guide edit as an exact substring replacement.
 *
 * Checked at APPROVAL time, not at proposal time: between proposing and
 * approving, the document may have changed under the suggestion. Failing loudly
 * here — inside the approving transaction, so nothing is half-done — is much
 * better than applying a stale edit to text that no longer says what the
 * proposer read.
 */
async function applyGuideEdit(
  ctx: MutationCtx,
  slug: string,
  oldString: string,
  newString: string,
  actorName: string,
) {
  const guide = await ctx.db
    .query("guides")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!guide) throw new Error(`No guide with slug "${slug}".`);

  const occurrences = guide.bodyHe.split(oldString).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `Cannot apply: the text to replace is no longer in ${guide.file}. ` +
        `The document changed since this was suggested — re-read it and propose the edit again.`,
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `Cannot apply: the text to replace appears ${occurrences} times in ${guide.file}. ` +
        `It must match exactly once — include more surrounding text and propose again.`,
    );
  }

  await ctx.db.patch("guides", guide._id, {
    bodyHe: guide.bodyHe.replace(oldString, newString),
    updatedAt: Date.now(),
    updatedBy: actorName,
  });
}

/**
 * Propose a change. Open to every family member, and to eve on their behalf.
 *
 * Never applies anything, whoever calls it — even the owner's own proposal
 * lands as `pending`, so there is always a row to point at afterwards. The
 * owner approving their own suggestion is one extra call and keeps the audit
 * trail honest.
 */
export const propose = mutation({
  args: {
    targetKind: targetKindValidator,
    guideSlug: v.optional(v.string()),
    dayN: v.optional(v.number()),
    title: v.string(),
    rationale: v.optional(v.string()),
    oldString: v.optional(v.string()),
    newString: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);
    if (!actor.email) {
      throw new Error(
        "Cannot attribute this suggestion: no family e-mail on the caller. " +
          "A suggestion nobody can be asked about is not reviewable.",
      );
    }

    if (args.targetKind === "guide" && !args.guideSlug) {
      throw new Error("A guide suggestion needs `guideSlug`.");
    }
    if (args.targetKind === "day" && args.dayN === undefined) {
      throw new Error("A day suggestion needs `dayN`.");
    }

    // A mechanical edit needs both halves or neither: half of a replacement is
    // an edit that can never be applied, and it would sit pending forever.
    const hasOld = args.oldString !== undefined;
    const hasNew = args.newString !== undefined;
    if (hasOld !== hasNew) {
      throw new Error("Provide both `oldString` and `newString`, or neither.");
    }

    // Fail early on a target that does not exist, rather than at approval time.
    if (args.targetKind === "guide" && args.guideSlug) {
      const guide = await ctx.db
        .query("guides")
        .withIndex("by_slug", (q) => q.eq("slug", args.guideSlug!))
        .unique();
      if (!guide) throw new Error(`No guide with slug "${args.guideSlug}".`);

      // Cheap sanity check so an obviously-unappliable edit is refused while
      // the proposer is still here to fix it. The authoritative check is at
      // approval — the document may change in between, in both directions.
      if (hasOld && !guide.bodyHe.includes(args.oldString!)) {
        throw new Error(
          `The text to replace was not found in ${guide.file}. ` +
            `Copy it verbatim from the current document, including Hebrew punctuation.`,
        );
      }
    }

    const now = Date.now();
    const id = await ctx.db.insert("suggestions", {
      targetKind: args.targetKind,
      guideSlug: args.guideSlug,
      dayN: args.dayN,
      title: args.title,
      rationale: args.rationale,
      oldString: args.oldString,
      newString: args.newString,
      status: "pending",
      // Only a guide edit with both halves can be applied mechanically.
      needsManualApply: !(args.targetKind === "guide" && hasOld),
      proposedByEmail: actor.email,
      proposedByName: actor.name,
      createdAt: now,
    });

    return { id, status: "pending" as const };
  },
});

/**
 * Everything awaiting a decision, oldest first.
 *
 * Readable by any family member, not just the owner: a suggestion is about the
 * shared trip, and "did anyone already ask for this?" is a question the whole
 * family benefits from being able to answer before proposing a duplicate.
 */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requireFamily(ctx);
    const rows = await ctx.db
      .query("suggestions")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .take(MAX_ROWS);
    return rows.map(toSuggestion);
  },
});

/** Recent decisions, newest first — so "what happened to mine?" is answerable. */
export const listDecided = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireFamily(ctx);
    const limit = Math.min(args.limit ?? 50, MAX_ROWS);

    const decided = await Promise.all(
      (["approved", "rejected", "withdrawn"] as const).map((status) =>
        ctx.db
          .query("suggestions")
          .withIndex("by_status_and_createdAt", (q) => q.eq("status", status))
          .order("desc")
          .take(limit),
      ),
    );

    return decided
      .flat()
      .sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt))
      .slice(0, limit)
      .map(toSuggestion);
  },
});

/**
 * Approve, and apply the change in the same transaction where that is possible.
 *
 * Atomic on purpose: if `applyGuideEdit` throws — because the document moved on
 * — the whole mutation rolls back and the suggestion stays `pending`. There is
 * no state where a suggestion reads "approved" but the plan does not reflect it.
 */
export const approve = mutation({
  args: { id: v.id("suggestions"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);

    const suggestion = await ctx.db.get("suggestions", args.id);
    if (!suggestion) throw new Error("No such suggestion.");
    if (suggestion.status !== "pending") {
      throw new Error(
        `That suggestion is already ${suggestion.status}; it cannot be approved again.`,
      );
    }

    let appliedAt: number | undefined;
    if (
      suggestion.targetKind === "guide" &&
      suggestion.guideSlug &&
      suggestion.oldString !== undefined &&
      suggestion.newString !== undefined
    ) {
      await applyGuideEdit(
        ctx,
        suggestion.guideSlug,
        suggestion.oldString,
        suggestion.newString,
        owner.name,
      );
      appliedAt = Date.now();
    }

    await ctx.db.patch("suggestions", args.id, {
      status: "approved",
      decidedByEmail: owner.email,
      decidedByName: owner.name,
      decidedAt: Date.now(),
      decisionNote: args.note,
      appliedAt,
    });

    return {
      status: "approved" as const,
      applied: appliedAt !== undefined,
      /** True when the owner still has to make the change by hand. */
      needsManualApply: suggestion.needsManualApply,
    };
  },
});

/** Turn one down. The note is what the proposer actually reads, so ask for one. */
export const reject = mutation({
  args: { id: v.id("suggestions"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);

    const suggestion = await ctx.db.get("suggestions", args.id);
    if (!suggestion) throw new Error("No such suggestion.");
    if (suggestion.status !== "pending") {
      throw new Error(`That suggestion is already ${suggestion.status}.`);
    }

    await ctx.db.patch("suggestions", args.id, {
      status: "rejected",
      decidedByEmail: owner.email,
      decidedByName: owner.name,
      decidedAt: Date.now(),
      decisionNote: args.note,
    });

    return { status: "rejected" as const };
  },
});

/**
 * Take back your own pending suggestion.
 *
 * Not an owner power — it is the proposer's. The owner rejects; the proposer
 * withdraws. Keeping them distinct means "Alex said no" and "I changed my mind"
 * do not look the same in the history.
 */
export const withdraw = mutation({
  args: { id: v.id("suggestions") },
  handler: async (ctx, args) => {
    const actor = await requireFamily(ctx);

    const suggestion = await ctx.db.get("suggestions", args.id);
    if (!suggestion) throw new Error("No such suggestion.");
    if (suggestion.status !== "pending") {
      throw new Error(`That suggestion is already ${suggestion.status}.`);
    }

    // The owner can withdraw anything (it is his trip); everyone else only
    // their own. A service actor has no e-mail and so can withdraw nothing.
    const isOwner = actor.kind === "family" && actor.role === "owner";
    if (!isOwner && suggestion.proposedByEmail !== actor.email) {
      throw new Error("You can only withdraw a suggestion you made yourself.");
    }

    await ctx.db.patch("suggestions", args.id, { status: "withdrawn" });
    return { status: "withdrawn" as const };
  },
});

/* ========================================================================== */
/* Agent (service-key) surface                                                */
/* ========================================================================== */

/**
 * Create a suggestion on behalf of a named family member.
 *
 * The eve agent reaches this through `/agent/suggestions/propose`, holding
 * AGENT_SERVICE_KEY. It therefore cannot use `ctx.auth` — there is no JWT — so
 * the acting identity arrives as an argument, exactly as `wishes.internalCreateFor`
 * does. That is only safe because of two things:
 *
 *   1. the address is checked against FAMILY here, so the agent cannot invent a
 *      proposer or attribute a change to a stranger; and
 *   2. the worst it can produce is a PENDING row. Nothing about this path can
 *      approve anything — approval lives in `approve`, which refuses a service
 *      actor outright and demands a real owner JWT.
 *
 * So the blast radius of the shared secret is "can add an item to Alex's review
 * queue", which is the behaviour we actually want from an assistant.
 */
export const internalProposeFor = internalMutation({
  args: {
    proposedByEmail: v.string(),
    targetKind: targetKindValidator,
    guideSlug: v.optional(v.string()),
    dayN: v.optional(v.number()),
    title: v.string(),
    rationale: v.optional(v.string()),
    oldString: v.optional(v.string()),
    newString: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.proposedByEmail.trim().toLowerCase();
    const member = FAMILY[email];
    if (!member) throw new Error(`${email} is not on the family list.`);

    if (args.targetKind === "guide" && !args.guideSlug) {
      throw new Error("A guide suggestion needs `guideSlug`.");
    }
    if (args.targetKind === "day" && args.dayN === undefined) {
      throw new Error("A day suggestion needs `dayN`.");
    }

    const hasOld = args.oldString !== undefined;
    const hasNew = args.newString !== undefined;
    if (hasOld !== hasNew) {
      throw new Error("Provide both `oldString` and `newString`, or neither.");
    }

    if (args.targetKind === "guide" && args.guideSlug) {
      const guide = await ctx.db
        .query("guides")
        .withIndex("by_slug", (q) => q.eq("slug", args.guideSlug!))
        .unique();
      if (!guide) throw new Error(`No guide with slug "${args.guideSlug}".`);
      if (hasOld && !guide.bodyHe.includes(args.oldString!)) {
        throw new Error(
          `The text to replace was not found in ${guide.file}. ` +
            `Read the guide again and copy the current wording verbatim.`,
        );
      }
    }

    const id = await ctx.db.insert("suggestions", {
      targetKind: args.targetKind,
      guideSlug: args.guideSlug,
      dayN: args.dayN,
      title: args.title.trim(),
      rationale: args.rationale,
      oldString: args.oldString,
      newString: args.newString,
      status: "pending",
      needsManualApply: !(args.targetKind === "guide" && hasOld),
      proposedByEmail: email,
      proposedByName: member.name,
      createdAt: Date.now(),
    });

    return { id, status: "pending" as const, proposedBy: member.name };
  },
});

/**
 * What is waiting on the owner, for the agent to read back in chat.
 *
 * Internal + service-key only for the same reason the wish list is: it is the
 * family's business, not the public site's.
 */
export const internalListPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("suggestions")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "pending"))
      .take(MAX_ROWS);
    return rows.map(toSuggestion);
  },
});

/**
 * Who is looking, and may they decide?
 *
 * The list is readable by the whole family, but only the owner sees decision
 * controls. Deriving that here rather than in the client keeps one definition
 * of "owner" — the UI asking "am I allowed?" gets the same answer the mutation
 * will enforce, so the buttons never promise something `approve` then refuses.
 */
export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireFamily(ctx);
    return {
      name: actor.name,
      role: actor.role ?? null,
      isOwner: actor.kind === "family" && actor.role === "owner",
    };
  },
});
