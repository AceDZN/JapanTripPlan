import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  currencyCode,
  expenseCategory,
  expenseStatus,
  paymentMethod,
} from "./schema";
import { FAMILY } from "./lib/family";
import { requireFamily } from "./lib/guards";

/**
 * The money layer: what we planned to spend, and what we actually spent.
 *
 * This file returns ROWS, not totals. Every sum the family sees is computed by
 * `web/lib/money.ts`, which the day page, the budget guide, the /money board
 * and the agent's report all share — one implementation of "skip the refunds,
 * count the pendings separately", instead of four that drift.
 *
 * THE PRIVACY RULE, same sentence as `wishes.ts`: a caller sees every `shared`
 * expense plus their own `private` ones, and never anybody else's. It lives in
 * exactly one place, `visibleTo()`, and every read goes through it. Buying the
 * surprise present is precisely the charge that must not show up in a total
 * everyone can see, so totals are per-caller by construction.
 */

// The ledger is inherently small — a 17-day trip for four generates hundreds of
// rows, not millions. These caps guard against an unbounded read, not paging.
const MAX_EXPENSES = 2000;
const MAX_BUDGETS = 200;
const MAX_RATES = 20;
const MAX_FILES_PER_EXPENSE = 6;

/** A fetched rate this far from the stored one is a bad feed, not a market move. */
const MAX_RATE_DRIFT = 0.25;

const visibilityValidator = v.union(v.literal("shared"), v.literal("private"));

const sourceValidator = v.union(
  v.literal("app"),
  v.literal("agent"),
  v.literal("receipt"),
  v.literal("import"),
);

/** ISO calendar date, and nothing else — `spentOn` is grouped and sorted on. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function requireIsoDate(value: string): string {
  if (!ISO_DATE.test(value)) {
    throw new Error(`spentOn must be an ISO date like "2026-10-05", got "${value}".`);
  }
  return value;
}

/** The verified caller, with the e-mail that owns their private rows. */
async function caller(ctx: QueryCtx | MutationCtx) {
  const actor = await requireFamily(ctx);
  if (!actor.email) {
    // Unreachable — requireFamily only returns a family actor for an
    // allowlisted e-mail claim — but ownership must never silently default.
    throw new Error("Family identity has no e-mail claim; cannot own an expense.");
  }
  return { email: actor.email, name: actor.name, role: actor.role };
}

/** The one place the privacy rule lives. */
function visibleTo(email: string) {
  return (expense: Doc<"expenses">) =>
    expense.visibility === "shared" || expense.paidByEmail === email;
}

/**
 * Convert to yen and freeze the rate onto the row.
 *
 * A JPY expense is always exactly 1:1 — accepting a rate for it would let a
 * typo silently rescale a yen amount. Everything else needs a rate, and the
 * caller either supplies one or we fall back to the stored `fxRates` row.
 * There is deliberately NO hardcoded default: a made-up shekel rate produces a
 * total that looks authoritative and is wrong, which is worse than refusing.
 */
async function resolveRate(
  ctx: QueryCtx | MutationCtx,
  currency: Doc<"expenses">["currency"],
  supplied?: number,
): Promise<{ jpyPerUnit: number; rateSource?: string }> {
  if (currency === "JPY") return { jpyPerUnit: 1 };

  if (supplied !== undefined) {
    if (!(supplied > 0)) throw new Error("jpyPerUnit must be a positive number.");
    return { jpyPerUnit: supplied, rateSource: "נמסר עם ההוצאה" };
  }

  const stored = await ctx.db
    .query("fxRates")
    .withIndex("by_currency", (q) => q.eq("currency", currency))
    .unique();

  if (!stored) {
    throw new Error(
      `No exchange rate stored for ${currency}. Set one first (money.setRate / ` +
        `/agent/money/rate) or pass jpyPerUnit — guessing a rate would produce a ` +
        `confident, wrong total.`,
    );
  }
  return { jpyPerUnit: stored.jpyPerUnit, rateSource: stored.source };
}

function yenOf(amount: number, jpyPerUnit: number): number {
  return Math.round(amount * jpyPerUnit);
}

/** Shape an expense for the client, minting signed URLs for its receipts. */
async function toExpense(ctx: QueryCtx, doc: Doc<"expenses">, email: string) {
  const { _id, _creationTime, files, ...rest } = doc;
  return {
    id: _id,
    ...rest,
    files: await Promise.all(
      (files ?? []).map(async (file) => ({
        ...file,
        // A file whose storage entry has gone yields null rather than throwing,
        // so one dead receipt cannot take the whole ledger down.
        url: await ctx.storage.getUrl(file.storageId),
      })),
    ),
    mine: doc.paidByEmail === email,
  };
}

function toEnvelope(doc: Doc<"budgets">) {
  const { _id, _creationTime, updatedAt, updatedBy, ...rest } = doc;
  return { id: _id, ...rest };
}

function toRate(doc: Doc<"fxRates">) {
  return {
    currency: doc.currency,
    jpyPerUnit: doc.jpyPerUnit,
    source: doc.source,
    asOf: doc.asOf,
    updatedAt: doc.updatedAt,
  };
}

/* ------------------------------------------------------------------- reads */

/** Every expense this caller may see. Sorting belongs to `lib/money.ts`. */
export const listExpenses = query({
  args: {},
  handler: async (ctx) => {
    const { email } = await caller(ctx);
    const all = await ctx.db.query("expenses").take(MAX_EXPENSES);
    return await Promise.all(
      all.filter(visibleTo(email)).map((doc) => toExpense(ctx, doc, email)),
    );
  },
});

/** One day's spend, for the day page panel. */
export const listForDay = query({
  args: { dayN: v.number() },
  handler: async (ctx, args) => {
    const { email } = await caller(ctx);
    const rows = await ctx.db
      .query("expenses")
      .withIndex("by_dayN", (q) => q.eq("dayN", args.dayN))
      .take(MAX_EXPENSES);
    return await Promise.all(
      rows.filter(visibleTo(email)).map((doc) => toExpense(ctx, doc, email)),
    );
  },
});

export const listBudgets = query({
  args: {},
  handler: async (ctx) => {
    await caller(ctx);
    const rows = await ctx.db.query("budgets").withIndex("by_order").take(MAX_BUDGETS);
    return rows.map(toEnvelope);
  },
});

export const listRates = query({
  args: {},
  handler: async (ctx) => {
    await caller(ctx);
    const rows = await ctx.db.query("fxRates").take(MAX_RATES);
    return rows.map(toRate);
  },
});

/**
 * Everything the money board needs, in one subscription.
 *
 * Three separate `useQuery` calls would give the page three independent loading
 * states and a visible moment where spend has arrived but the envelopes have
 * not — i.e. a total that briefly reads as wildly over budget.
 */
export const board = query({
  args: {},
  handler: async (ctx) => {
    const { email } = await caller(ctx);

    const [expenseDocs, budgetDocs, rateDocs] = await Promise.all([
      ctx.db.query("expenses").take(MAX_EXPENSES),
      ctx.db.query("budgets").withIndex("by_order").take(MAX_BUDGETS),
      ctx.db.query("fxRates").take(MAX_RATES),
    ]);

    return {
      expenses: await Promise.all(
        expenseDocs.filter(visibleTo(email)).map((doc) => toExpense(ctx, doc, email)),
      ),
      envelopes: budgetDocs.map(toEnvelope),
      rates: rateDocs.map(toRate),
      me: email,
    };
  },
});

/* ------------------------------------------------------------------ writes */

const expenseFields = {
  title: v.string(),
  titleEn: v.optional(v.string()),
  category: expenseCategory,
  amount: v.number(),
  currency: currencyCode,
  /** Omit for JPY; omit elsewhere to use the stored rate. */
  jpyPerUnit: v.optional(v.number()),
  spentOn: v.string(),
  dayN: v.optional(v.number()),
  placeId: v.optional(v.string()),
  guideSlug: v.optional(v.string()),
  wishId: v.optional(v.id("wishes")),
  checklistItemSlug: v.optional(v.string()),
  blockTitle: v.optional(v.string()),
  status: v.optional(expenseStatus),
  method: v.optional(paymentMethod),
  reference: v.optional(v.string()),
  url: v.optional(v.string()),
  note: v.optional(v.string()),
  visibility: v.optional(visibilityValidator),
};

/**
 * Buying somebody's wish closes it.
 *
 * The whole point of the wish list is that it stops being a list once the thing
 * is in a bag. Only ever moves a wish TO "done" — never back out of a decision
 * the family made — and only when the wish is still open.
 *
 * It also forces the expense private when the wish is: a shared receipt for a
 * surprise present defeats the surprise just as thoroughly as a shared wish.
 */
async function reconcileWish(
  ctx: MutationCtx,
  wishId: Id<"wishes"> | undefined,
  requested: "shared" | "private" | undefined,
): Promise<"shared" | "private"> {
  if (!wishId) return requested ?? "shared";

  const wish = await ctx.db.get("wishes", wishId);
  if (!wish) throw new Error("No such wish to attach this purchase to.");

  if (wish.status !== "done" && wish.status !== "dropped") {
    await ctx.db.patch("wishes", wishId, { status: "done", updatedAt: Date.now() });
  }

  return wish.visibility === "private" ? "private" : requested ?? "shared";
}

export const addExpense = mutation({
  args: expenseFields,
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);
    const { jpyPerUnit, status, visibility, ...fields } = args;

    const title = fields.title.trim();
    if (!title) throw new Error("An expense needs a title.");
    if (!Number.isFinite(fields.amount) || fields.amount <= 0) {
      throw new Error("An expense needs a positive amount.");
    }
    requireIsoDate(fields.spentOn);

    const rate = await resolveRate(ctx, fields.currency, jpyPerUnit);
    const resolvedVisibility = await reconcileWish(ctx, fields.wishId, visibility);

    const now = Date.now();
    return await ctx.db.insert("expenses", {
      ...fields,
      title,
      amountYen: yenOf(fields.amount, rate.jpyPerUnit),
      jpyPerUnit: rate.jpyPerUnit,
      rateSource: rate.rateSource,
      status: status ?? "paid",
      // The payer is the verified caller, never an argument — there is
      // deliberately no paidByEmail parameter to spoof.
      paidByEmail: email,
      paidByName: name,
      visibility: resolvedVisibility,
      source: "app",
      createdAt: now,
      updatedAt: now,
      updatedBy: name,
    });
  },
});

/**
 * Edit an expense.
 *
 * Only the payer may change it. Unlike a wish, there is no "any family member
 * may move the status along": a status here is a claim about whether money
 * moved, and the person who paid is the only one who knows.
 */
export const updateExpense = mutation({
  args: {
    id: v.id("expenses"),
    title: v.optional(v.string()),
    titleEn: v.optional(v.string()),
    category: v.optional(expenseCategory),
    amount: v.optional(v.number()),
    currency: v.optional(currencyCode),
    jpyPerUnit: v.optional(v.number()),
    spentOn: v.optional(v.string()),
    dayN: v.optional(v.number()),
    placeId: v.optional(v.string()),
    guideSlug: v.optional(v.string()),
    checklistItemSlug: v.optional(v.string()),
    blockTitle: v.optional(v.string()),
    status: v.optional(expenseStatus),
    method: v.optional(paymentMethod),
    reference: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
  },
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);
    const { id, jpyPerUnit, ...patch } = args;

    const expense = await ctx.db.get("expenses", id);
    // Same answer for "gone" and "not yours to see", so this cannot be used to
    // probe whether somebody else has a private expense.
    if (!expense || !visibleTo(email)(expense)) throw new Error("No such expense.");
    if (expense.paidByEmail !== email) {
      throw new Error("Only the person who paid can edit an expense.");
    }

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("An expense needs a title.");
    }
    if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount <= 0)) {
      throw new Error("An expense needs a positive amount.");
    }
    if (patch.spentOn !== undefined) requireIsoDate(patch.spentOn);

    // Any touch of amount, currency or rate re-derives the yen figure. Patching
    // `amount` alone and leaving a stale `amountYen` is how a ledger starts
    // disagreeing with itself.
    const currency = patch.currency ?? expense.currency;
    const amount = patch.amount ?? expense.amount;
    const touchesMoney =
      patch.amount !== undefined || patch.currency !== undefined || jpyPerUnit !== undefined;

    const rate = touchesMoney
      ? await resolveRate(
          ctx,
          currency,
          // An unchanged currency keeps its frozen rate unless a new one is given.
          jpyPerUnit ?? (patch.currency === undefined ? expense.jpyPerUnit : undefined),
        )
      : { jpyPerUnit: expense.jpyPerUnit, rateSource: expense.rateSource };

    await ctx.db.patch("expenses", id, {
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(touchesMoney
        ? {
            amount,
            currency,
            amountYen: yenOf(amount, rate.jpyPerUnit),
            jpyPerUnit: rate.jpyPerUnit,
            rateSource: rate.rateSource,
          }
        : {}),
      updatedAt: Date.now(),
      updatedBy: name,
    });
    return null;
  },
});

export const removeExpense = mutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const { email } = await caller(ctx);
    const expense = await ctx.db.get("expenses", args.id);
    if (!expense || !visibleTo(email)(expense)) throw new Error("No such expense.");
    if (expense.paidByEmail !== email) {
      throw new Error("Only the person who paid can delete an expense.");
    }

    // Blobs first: dropping the row alone would strand the receipts in storage
    // with nothing left pointing at them.
    for (const file of expense.files ?? []) {
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete("expenses", args.id);
    return null;
  },
});

/* --------------------------------------------------------------- receipts */

export const generateReceiptUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await caller(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Attach an uploaded receipt to an expense.
 *
 * If the expense is gone or already full, the just-uploaded blob is deleted
 * rather than left orphaned — same contract as the vault's `attachFile`.
 */
export const attachReceipt = mutation({
  args: {
    id: v.id("expenses"),
    storageId: v.id("_storage"),
    name: v.string(),
    size: v.number(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);

    const expense = await ctx.db.get("expenses", args.id);
    if (!expense || !visibleTo(email)(expense)) {
      await ctx.storage.delete(args.storageId);
      throw new Error("That expense no longer exists.");
    }
    if (expense.paidByEmail !== email) {
      await ctx.storage.delete(args.storageId);
      throw new Error("Only the person who paid can attach a receipt.");
    }

    const files = expense.files ?? [];
    if (files.length >= MAX_FILES_PER_EXPENSE) {
      await ctx.storage.delete(args.storageId);
      throw new Error(`An expense holds at most ${MAX_FILES_PER_EXPENSE} files.`);
    }

    await ctx.db.patch("expenses", args.id, {
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
      updatedBy: name,
    });
    return null;
  },
});

export const removeReceipt = mutation({
  args: { id: v.id("expenses"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const { email, name } = await caller(ctx);
    const expense = await ctx.db.get("expenses", args.id);
    if (!expense || !visibleTo(email)(expense)) throw new Error("No such expense.");
    if (expense.paidByEmail !== email) {
      throw new Error("Only the person who paid can remove a receipt.");
    }

    await ctx.db.patch("expenses", args.id, {
      files: (expense.files ?? []).filter((file) => file.storageId !== args.storageId),
      updatedAt: Date.now(),
      updatedBy: name,
    });
    await ctx.storage.delete(args.storageId);
    return null;
  },
});

/* -------------------------------------------------------- planning side */

/**
 * Create or update a planning envelope.
 *
 * Family-wide rather than owner-only: the envelopes ARE the family's shared
 * agreement about what a category may cost, and 10-BUDGET.md is explicit that
 * they are controls to be adjusted, not quotes to be defended.
 */
export const setBudget = mutation({
  args: {
    slug: v.string(),
    category: expenseCategory,
    label: v.string(),
    minYen: v.optional(v.number()),
    maxYen: v.optional(v.number()),
    note: v.optional(v.string()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { name } = await caller(ctx);
    return await upsertBudget(ctx, args, name);
  },
});

export const removeBudget = mutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    await caller(ctx);
    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) await ctx.db.delete("budgets", existing._id);
    return null;
  },
});

export const setRate = mutation({
  args: {
    currency: currencyCode,
    jpyPerUnit: v.number(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { name } = await caller(ctx);
    return await upsertRate(ctx, args, name);
  },
});

/** Shared by the family mutation and the service-key route. */
async function upsertBudget(
  ctx: MutationCtx,
  args: {
    slug: string;
    category: Doc<"budgets">["category"];
    label: string;
    minYen?: number;
    maxYen?: number;
    note?: string;
    order?: number;
  },
  actorName: string,
) {
  const slug = args.slug.trim().toLowerCase();
  if (!slug) throw new Error("An envelope needs a slug.");
  if (args.minYen !== undefined && args.maxYen !== undefined && args.minYen > args.maxYen) {
    throw new Error("minYen cannot be greater than maxYen.");
  }

  const existing = await ctx.db
    .query("budgets")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (existing) {
    await ctx.db.patch("budgets", existing._id, {
      category: args.category,
      label: args.label,
      minYen: args.minYen,
      maxYen: args.maxYen,
      note: args.note,
      ...(args.order === undefined ? {} : { order: args.order }),
      updatedAt: Date.now(),
      updatedBy: actorName,
    });
    return { id: existing._id, created: false };
  }

  // Append to the end when no explicit position is given, so a new envelope
  // never silently reshuffles the ones already on screen.
  const all = await ctx.db.query("budgets").take(MAX_BUDGETS);
  const order = args.order ?? all.reduce((max, row) => Math.max(max, row.order), 0) + 10;

  const id = await ctx.db.insert("budgets", {
    slug,
    category: args.category,
    label: args.label,
    minYen: args.minYen,
    maxYen: args.maxYen,
    note: args.note,
    order,
    updatedAt: Date.now(),
    updatedBy: actorName,
  });
  return { id, created: true };
}

async function upsertRate(
  ctx: MutationCtx,
  args: {
    currency: Doc<"fxRates">["currency"];
    jpyPerUnit: number;
    source?: string;
    asOf?: number;
  },
  actorName: string,
) {
  if (!Number.isFinite(args.jpyPerUnit) || !(args.jpyPerUnit > 0)) {
    throw new Error("jpyPerUnit must be a positive number.");
  }
  if (args.currency === "JPY" && args.jpyPerUnit !== 1) {
    throw new Error("The yen rate is 1 by definition.");
  }

  const existing = await ctx.db
    .query("fxRates")
    .withIndex("by_currency", (q) => q.eq("currency", args.currency))
    .unique();

  const doc = {
    currency: args.currency,
    jpyPerUnit: args.jpyPerUnit,
    source: args.source,
    asOf: args.asOf,
    updatedAt: Date.now(),
    updatedBy: actorName,
  };

  if (existing) {
    await ctx.db.patch("fxRates", existing._id, doc);
    return { id: existing._id, created: false };
  }
  return { id: await ctx.db.insert("fxRates", doc), created: true };
}

/* ------------------------------------------------- machine API (eve) */

/**
 * Record a charge on behalf of a family member. Service-key only.
 *
 * This is how "קנינו את הכרטיסים ל-USJ, ¥54,000" in the chat — or a photo of a
 * receipt — becomes a row everyone can see, instead of a sentence that scrolls
 * away. `paidByEmail` must be on the allowlist, and it comes from the verified
 * `משתמש:` clause the app stamps server-side, which a browser cannot forge.
 *
 * Idempotent on (paidByEmail, title, spentOn, amount): a retried tool call
 * converges instead of billing the family twice for one ticket. That tuple is
 * the right key — two genuinely separate ¥600 gachapon pulls on the same day
 * would collapse, so the agent is told to distinguish them in the title, and a
 * duplicated ¥54,000 park entry is by far the more expensive mistake.
 */
export const internalRecordExpense = internalMutation({
  args: {
    paidByEmail: v.string(),
    title: v.string(),
    titleEn: v.optional(v.string()),
    category: expenseCategory,
    amount: v.number(),
    currency: currencyCode,
    jpyPerUnit: v.optional(v.number()),
    spentOn: v.string(),
    dayN: v.optional(v.number()),
    placeId: v.optional(v.string()),
    guideSlug: v.optional(v.string()),
    wishId: v.optional(v.id("wishes")),
    checklistItemSlug: v.optional(v.string()),
    blockTitle: v.optional(v.string()),
    status: v.optional(expenseStatus),
    method: v.optional(paymentMethod),
    reference: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    visibility: v.optional(visibilityValidator),
    /** "receipt" when the numbers were read off a photo, "agent" otherwise. */
    source: v.optional(sourceValidator),
  },
  handler: async (ctx, args) => {
    const { jpyPerUnit, status, visibility, source, paidByEmail, ...fields } = args;

    const email = paidByEmail.trim().toLowerCase();
    const member = FAMILY[email];
    if (!member) throw new Error(`${email} is not on the family list.`);

    const title = fields.title.trim();
    if (!title) throw new Error("An expense needs a title.");
    if (!Number.isFinite(fields.amount) || fields.amount <= 0) {
      throw new Error("An expense needs a positive amount.");
    }
    requireIsoDate(fields.spentOn);

    const existing = await ctx.db
      .query("expenses")
      .withIndex("by_paidByEmail", (q) => q.eq("paidByEmail", email))
      .take(MAX_EXPENSES);
    const match = existing.find(
      (row) =>
        row.title === title &&
        row.spentOn === fields.spentOn &&
        row.amount === fields.amount &&
        row.currency === fields.currency,
    );
    if (match) return { id: match._id, created: false };

    const rate = await resolveRate(ctx, fields.currency, jpyPerUnit);
    const resolvedVisibility = await reconcileWish(ctx, fields.wishId, visibility);

    const now = Date.now();
    const id = await ctx.db.insert("expenses", {
      ...fields,
      title,
      amountYen: yenOf(fields.amount, rate.jpyPerUnit),
      jpyPerUnit: rate.jpyPerUnit,
      rateSource: rate.rateSource,
      status: status ?? "paid",
      paidByEmail: email,
      paidByName: member.name,
      visibility: resolvedVisibility,
      source: source ?? "agent",
      createdAt: now,
      updatedAt: now,
      updatedBy: "eve",
    });
    return { id, created: true };
  },
});

/**
 * Correct a recorded charge. Service-key only.
 *
 * Deliberately cannot change `paidByEmail` or `visibility`: who paid is a fact
 * the agent has no way to re-establish, and flipping a private purchase to
 * shared would out a surprise present. Same asymmetry as
 * `wishes.internalApplyResearch`.
 */
export const internalUpdateExpense = internalMutation({
  args: {
    id: v.id("expenses"),
    title: v.optional(v.string()),
    titleEn: v.optional(v.string()),
    category: v.optional(expenseCategory),
    amount: v.optional(v.number()),
    currency: v.optional(currencyCode),
    jpyPerUnit: v.optional(v.number()),
    spentOn: v.optional(v.string()),
    dayN: v.optional(v.number()),
    placeId: v.optional(v.string()),
    status: v.optional(expenseStatus),
    method: v.optional(paymentMethod),
    reference: v.optional(v.string()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, jpyPerUnit, ...patch } = args;
    const expense = await ctx.db.get("expenses", id);
    if (!expense) throw new Error("No such expense.");

    if (patch.title !== undefined && !patch.title.trim()) {
      throw new Error("An expense needs a title.");
    }
    if (patch.amount !== undefined && (!Number.isFinite(patch.amount) || patch.amount <= 0)) {
      throw new Error("An expense needs a positive amount.");
    }
    if (patch.spentOn !== undefined) requireIsoDate(patch.spentOn);

    const currency = patch.currency ?? expense.currency;
    const amount = patch.amount ?? expense.amount;
    const touchesMoney =
      patch.amount !== undefined || patch.currency !== undefined || jpyPerUnit !== undefined;

    const rate = touchesMoney
      ? await resolveRate(
          ctx,
          currency,
          jpyPerUnit ?? (patch.currency === undefined ? expense.jpyPerUnit : undefined),
        )
      : { jpyPerUnit: expense.jpyPerUnit, rateSource: expense.rateSource };

    await ctx.db.patch("expenses", id, {
      ...patch,
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(touchesMoney
        ? {
            amount,
            currency,
            amountYen: yenOf(amount, rate.jpyPerUnit),
            jpyPerUnit: rate.jpyPerUnit,
            rateSource: rate.rateSource,
          }
        : {}),
      updatedAt: Date.now(),
      updatedBy: "eve",
    });
    return { id, ok: true as const };
  },
});

export const internalRemoveExpense = internalMutation({
  args: { id: v.id("expenses") },
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.id);
    if (!expense) return { ok: false as const, reason: "not-found" as const };
    for (const file of expense.files ?? []) {
      await ctx.storage.delete(file.storageId);
    }
    await ctx.db.delete("expenses", args.id);
    return { ok: true as const };
  },
});

/**
 * The agent's window onto the ledger, private rows included.
 *
 * Same deliberate exception as `wishes.internalListAll`, for the same reason:
 * eve has to be able to record and total a surprise present. Its instructions
 * forbid mentioning a private row to anyone but the person who paid, and the
 * service key never reaches a browser.
 */
export const internalListAll = internalQuery({
  args: {},
  handler: async (ctx) => {
    const [expenses, budgets, rates] = await Promise.all([
      ctx.db.query("expenses").take(MAX_EXPENSES),
      ctx.db.query("budgets").withIndex("by_order").take(MAX_BUDGETS),
      ctx.db.query("fxRates").take(MAX_RATES),
    ]);

    return {
      expenses: expenses.map((row) => ({
        id: row._id,
        title: row.title,
        titleEn: row.titleEn,
        category: row.category,
        amount: row.amount,
        currency: row.currency,
        amountYen: row.amountYen,
        jpyPerUnit: row.jpyPerUnit,
        spentOn: row.spentOn,
        dayN: row.dayN,
        placeId: row.placeId,
        wishId: row.wishId,
        status: row.status,
        method: row.method,
        reference: row.reference,
        note: row.note,
        paidByName: row.paidByName,
        paidByEmail: row.paidByEmail,
        visibility: row.visibility,
        hasReceipt: (row.files ?? []).length > 0,
        source: row.source,
      })),
      envelopes: budgets.map(toEnvelope),
      rates: rates.map(toRate),
    };
  },
});

export const internalSetBudget = internalMutation({
  args: {
    slug: v.string(),
    category: expenseCategory,
    label: v.string(),
    minYen: v.optional(v.number()),
    maxYen: v.optional(v.number()),
    note: v.optional(v.string()),
    order: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { updatedBy, ...fields } = args;
    return await upsertBudget(ctx, fields, updatedBy ?? "eve");
  },
});

/**
 * Drop an envelope. Service-key only.
 *
 * The counterpart to `internalSetBudget`, for the same reason
 * `internalRemoveExpense` exists: an agent that can create a row and not remove
 * one leaves the family to clean up after a mistyped slug by hand.
 */
export const internalRemoveBudget = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("budgets")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug.trim().toLowerCase()))
      .unique();
    if (!existing) return { ok: false as const, reason: "not-found" as const };
    await ctx.db.delete("budgets", existing._id);
    return { ok: true as const };
  },
});

export const internalSetRate = internalMutation({
  args: {
    currency: currencyCode,
    jpyPerUnit: v.number(),
    source: v.optional(v.string()),
    asOf: v.optional(v.number()),
    updatedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { updatedBy, ...fields } = args;
    return await upsertRate(ctx, fields, updatedBy ?? "eve");
  },
});

/**
 * Write a batch of rates fetched from a price feed. Called by `fx.refresh`.
 *
 * The drift guard is the point of having a separate entry rather than looping
 * `internalSetRate`: a feed that answers 5.18 instead of 51.8 — a decimal slip,
 * a base-currency mix-up, a placeholder — would silently rescale every foreign
 * charge entered afterwards by a factor of ten, and nobody re-reads a rate they
 * did not type. A day's real FX move is under 2%; anything past 25% is the feed
 * being wrong, so we keep yesterday's rate and say why. `force` exists for the
 * genuine outlier (a devaluation, a first fetch after a long gap) and is only
 * ever set by a human asking for it.
 */
export const applyFetchedRates = internalMutation({
  args: {
    source: v.string(),
    asOf: v.number(),
    force: v.optional(v.boolean()),
    rows: v.array(v.object({ currency: currencyCode, jpyPerUnit: v.number() })),
  },
  handler: async (ctx, args) => {
    const written: string[] = [];
    const rejected: { currency: string; reason: string }[] = [];

    for (const row of args.rows) {
      if (!Number.isFinite(row.jpyPerUnit) || !(row.jpyPerUnit > 0)) {
        rejected.push({ currency: row.currency, reason: `not a rate: ${row.jpyPerUnit}` });
        continue;
      }

      const existing = await ctx.db
        .query("fxRates")
        .withIndex("by_currency", (q) => q.eq("currency", row.currency))
        .unique();

      if (existing && !args.force) {
        const drift = Math.abs(row.jpyPerUnit - existing.jpyPerUnit) / existing.jpyPerUnit;
        if (drift > MAX_RATE_DRIFT) {
          rejected.push({
            currency: row.currency,
            reason: `${(drift * 100).toFixed(0)}% from the stored ${existing.jpyPerUnit.toFixed(3)} — kept the old rate`,
          });
          continue;
        }
      }

      await upsertRate(
        ctx,
        { currency: row.currency, jpyPerUnit: row.jpyPerUnit, source: args.source, asOf: args.asOf },
        args.source,
      );
      written.push(row.currency);
    }

    return { written, rejected };
  },
});

/**
 * Correct a PLANNED price on a day's block. Service-key only.
 *
 * This is the other half of "eve, the ticket is ¥3,800 not ¥3,500": that is a
 * fact about the world, not a change of plan, so it lands directly rather than
 * queuing behind the owner's approval the way a route change does. What it
 * cannot do is invent structure — the block must already exist, matched by its
 * exact title on that day, and a cost line is replaced by label or appended.
 *
 * Returns what it matched so the agent can report precisely what changed rather
 * than claiming a rewrite it did not make.
 */
export const internalSetBlockCost = internalMutation({
  args: {
    dayN: v.number(),
    blockTitle: v.string(),
    label: v.string(),
    yen: v.number(),
    basis: v.union(v.literal("person"), v.literal("family"), v.literal("total")),
    note: v.optional(v.string()),
    /** True removes the cost line instead of setting it. */
    remove: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.remove && (!Number.isFinite(args.yen) || args.yen < 0)) {
      throw new Error("A cost line needs a non-negative amount.");
    }

    const blocks = await ctx.db
      .query("blocks")
      .withIndex("by_dayN", (q) => q.eq("dayN", args.dayN))
      .take(500);

    const matches = blocks.filter((block) => block.title.trim() === args.blockTitle.trim());
    if (matches.length === 0) {
      throw new Error(
        `No block titled "${args.blockTitle}" on day ${args.dayN}. Read the day first and ` +
          `copy the title exactly — do not invent one.`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Day ${args.dayN} has ${matches.length} blocks titled "${args.blockTitle}"; ` +
          `cannot tell which one you mean.`,
      );
    }

    const block = matches[0];
    const costs = [...(block.costs ?? [])];
    const index = costs.findIndex((line) => line.label.trim() === args.label.trim());

    if (args.remove) {
      if (index === -1) return { ok: false as const, reason: "no-such-line" as const };
      costs.splice(index, 1);
    } else {
      const line = {
        label: args.label.trim(),
        yen: Math.round(args.yen),
        basis: args.basis,
        note: args.note,
      };
      if (index === -1) costs.push(line);
      else costs[index] = line;
    }

    await ctx.db.patch("blocks", block._id, {
      costs,
      updatedAt: Date.now(),
      updatedBy: "eve",
    });

    return {
      ok: true as const,
      dayN: args.dayN,
      blockTitle: block.title,
      action: args.remove ? ("removed" as const) : index === -1 ? ("added" as const) : ("replaced" as const),
      costs,
    };
  },
});
