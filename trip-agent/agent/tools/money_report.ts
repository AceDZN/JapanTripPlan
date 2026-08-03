// Read the money: envelopes, spend, and where the two disagree.
//
// This is the tool behind "כמה יצא לנו עד עכשיו", "כמה נשאר לאוכל", "כמה שילמנו
// ביום 12" and "מה עוד לא שילמנו". None of those can be answered from
// `agent/data/content.ts`: that snapshot is baked at build time and the ledger
// changes while somebody is standing at a till.
//
// It returns computed totals rather than raw rows on purpose. A model asked to
// sum forty amounts, skip the refunds and keep the pendings separate will get it
// right most of the time, and "most of the time" is not good enough for the
// number a family plans the rest of the trip against.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexGet } from "../lib/convex";

type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  currency: string;
  amountYen: number;
  spentOn: string;
  dayN?: number;
  status: "paid" | "pending" | "refunded";
  paidByName: string;
  paidByEmail: string;
  visibility: "shared" | "private";
  note?: string;
  reference?: string;
  hasReceipt: boolean;
};

type Envelope = {
  slug: string;
  category: string;
  label: string;
  minYen?: number;
  maxYen?: number;
  note?: string;
};

type State = {
  expenses: Expense[];
  envelopes: Envelope[];
  rates: { currency: string; jpyPerUnit: number; source?: string; updatedAt: number }[];
};

/** paid / pending / refunded, kept apart. Refunds never enter a total. */
function total(rows: Expense[]) {
  const paidYen = rows
    .filter((row) => row.status === "paid")
    .reduce((sum, row) => sum + row.amountYen, 0);
  const pendingYen = rows
    .filter((row) => row.status === "pending")
    .reduce((sum, row) => sum + row.amountYen, 0);
  return { paidYen, pendingYen, committedYen: paidYen + pendingYen, count: rows.length };
}

export default defineTool({
  description: [
    "Read the trip's money: what has been paid, what is booked but not yet charged,",
    "and how that sits against the planning envelopes from the budget guide.",
    "",
    "Use it for 'כמה הוצאנו עד עכשיו', 'כמה נשאר לאוכל', 'כמה עלה יום 12',",
    "'מה עוד לא שילמנו', and before answering ANY question with a total in it.",
    "Never add up amounts yourself and never answer a money question from memory —",
    "the ledger changes between turns, and a stale total is worse than no total.",
    "",
    "PRIVACY: some rows are private to the person who paid. Rows marked private must",
    "never be described, summarised or hinted at to anybody else — a private expense",
    "is usually a surprise present. `sharedOnly` totals leave them out entirely, and",
    "that is what you quote when you are not certain who you are talking to.",
  ].join("\n"),

  inputSchema: z.object({
    dayN: z
      .number()
      .int()
      .min(1)
      .max(17)
      .optional()
      .describe("Limit to one trip day, for 'how much did day 12 cost'."),
    category: z
      .enum([
        "flights",
        "stay",
        "transport",
        "food",
        "attractions",
        "shopping",
        "arcade",
        "gifts",
        "essentials",
        "other",
      ])
      .optional()
      .describe("Limit to one budget category."),
    sharedOnly: z
      .boolean()
      .optional()
      .describe(
        "True excludes every private row from both the list and the totals. Use it " +
          "whenever you are not certain that the person speaking is the one who paid.",
      ),
    includeRows: z
      .boolean()
      .optional()
      .describe("True also returns the individual charges, not just the totals. Default false."),
  }),

  async execute({ dayN, category, sharedOnly, includeRows }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    try {
      const state = (await convexGet("/agent/money/state")) as State;

      const visible = state.expenses.filter(
        (row) => !sharedOnly || row.visibility === "shared",
      );
      const scoped = visible
        .filter((row) => dayN === undefined || row.dayN === dayN)
        .filter((row) => category === undefined || row.category === category);

      const envelopes = state.envelopes.filter(
        (envelope) => category === undefined || envelope.category === category,
      );

      const sumBound = (key: "minYen" | "maxYen") => {
        const withBound = envelopes.filter((envelope) => envelope[key] !== undefined);
        return withBound.length > 0
          ? withBound.reduce((sum, envelope) => sum + (envelope[key] ?? 0), 0)
          : undefined;
      };

      const overall = total(scoped);
      const plannedMaxYen = sumBound("maxYen");

      // Per-category, so "how much is left for food" needs one call and not ten.
      const categories = [...new Set(visible.map((row) => row.category))].map((name) => {
        const rows = visible.filter((row) => row.category === name);
        const covering = state.envelopes.filter((envelope) => envelope.category === name);
        const withMax = covering.filter((envelope) => envelope.maxYen !== undefined);
        const maxYen =
          withMax.length > 0
            ? withMax.reduce((sum, envelope) => sum + (envelope.maxYen ?? 0), 0)
            : undefined;
        const sums = total(rows);
        return {
          category: name,
          ...sums,
          envelopeMaxYen: maxYen,
          remainingYen: maxYen === undefined ? undefined : maxYen - sums.committedYen,
        };
      });

      return {
        ok: true as const,
        scope: {
          dayN,
          category,
          sharedOnly: Boolean(sharedOnly),
          privateRowsExcluded: sharedOnly
            ? state.expenses.length - visible.length
            : undefined,
        },
        ...overall,
        plannedMinYen: sumBound("minYen"),
        plannedMaxYen,
        remainingYen:
          plannedMaxYen === undefined ? undefined : plannedMaxYen - overall.committedYen,
        categories,
        /** Envelopes with no bounds are open questions, not zeroes. Say so. */
        envelopesWithoutBounds: envelopes
          .filter((envelope) => envelope.minYen === undefined && envelope.maxYen === undefined)
          .map((envelope) => ({ label: envelope.label, note: envelope.note })),
        pending: scoped
          .filter((row) => row.status === "pending")
          .map((row) => ({
            title: row.title,
            amountYen: row.amountYen,
            dayN: row.dayN,
            note: row.note,
          })),
        rates: state.rates,
        ...(includeRows
          ? {
              rows: scoped.map((row) => ({
                id: row.id,
                title: row.title,
                category: row.category,
                amount: row.amount,
                currency: row.currency,
                amountYen: row.amountYen,
                spentOn: row.spentOn,
                dayN: row.dayN,
                status: row.status,
                paidByName: row.paidByName,
                visibility: row.visibility,
                hasReceipt: row.hasReceipt,
              })),
            }
          : {}),
        howToAnswer:
          "תגיד את המספרים כפי שהם כאן, בלי לחשב מחדש. תמיד תפריד בין מה ששולם לבין מה " +
          "שמוזמן וטרם חויב — הם לא אותו דבר. מעטפה בלי טווח היא שאלה פתוחה, לא אפס: " +
          "אל תדווח 'נשאר 0' על קטגוריה שפשוט לא הוגדרה לה תקרה. ושורה פרטית לא מוזכרת " +
          "לאף אחד חוץ ממי ששילם אותה.",
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
