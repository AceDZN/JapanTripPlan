import { yen } from "@/lib/ops";

/**
 * The money layer, as pure functions.
 *
 * Every total the family sees — on the day page, on the budget guide, on
 * /money — is computed here and nowhere else. That is deliberate: the failure
 * this whole feature exists to prevent is two places disagreeing about what a
 * trip has cost, and three copies of "sum the paid rows, skip the refunds"
 * would reintroduce it on the first edge case.
 *
 * Convex therefore returns rows, not totals. It is the source of the facts;
 * this module is the source of the arithmetic.
 *
 * THE TWO SIDES, kept apart on purpose (see convex/schema.ts):
 *   planned — `budgets` envelopes and `blocks.costs`. What we expect to pay.
 *   actual  — `expenses`. What actually left an account.
 * Nothing here ever adds one to the other.
 */

export type Currency = "JPY" | "ILS" | "USD" | "EUR";

export type ExpenseCategory =
  | "flights"
  | "stay"
  | "transport"
  | "food"
  | "attractions"
  | "shopping"
  | "arcade"
  | "gifts"
  | "essentials"
  | "other";

export type ExpenseStatus = "paid" | "pending" | "refunded";

export type PaymentMethod =
  | "card"
  | "cash"
  | "ic"
  | "transfer"
  | "points"
  | "other";

export type Expense = {
  id: string;
  title: string;
  titleEn?: string;
  category: ExpenseCategory;
  amount: number;
  currency: Currency;
  amountYen: number;
  jpyPerUnit: number;
  rateSource?: string;
  spentOn: string;
  dayN?: number;
  placeId?: string;
  guideSlug?: string;
  wishId?: string;
  checklistItemSlug?: string;
  blockTitle?: string;
  status: ExpenseStatus;
  method?: PaymentMethod;
  reference?: string;
  url?: string;
  note?: string;
  paidByEmail: string;
  paidByName: string;
  visibility: "shared" | "private";
  files: { storageId: string; name: string; size: number; type: string; url: string | null }[];
  source: "app" | "agent" | "receipt" | "import";
  createdAt: number;
  updatedAt: number;
  /** True when the caller is the payer, so the UI can offer edit/delete. */
  mine: boolean;
};

export type Envelope = {
  id: string;
  slug: string;
  category: ExpenseCategory;
  label: string;
  minYen?: number;
  maxYen?: number;
  note?: string;
  order: number;
};

export type FxRate = {
  currency: Currency;
  jpyPerUnit: number;
  source?: string;
  /** When the provider quoted it. Absent on a hand-typed rate. */
  asOf?: number;
  /** When we wrote the row. */
  updatedAt: number;
};

/**
 * The one date worth showing for a rate: what it is a rate *for*.
 *
 * `updatedAt` alone reads as fresher than the number is (a refresh that only
 * re-confirms Friday's quote still bumps it), and showing both dates next to
 * each other just makes the reader do the subtraction.
 */
export function rateAsOf(rate: FxRate): number {
  return rate.asOf ?? rate.updatedAt;
}

/** Days old, for the "this rate is from last week" warning. */
export function rateAgeDays(rate: FxRate, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - rateAsOf(rate)) / 86_400_000));
}

/* ------------------------------------------------------------------ labels */

export const categoryLabels: Record<ExpenseCategory, string> = {
  flights: "טיסות",
  stay: "לינה",
  transport: "תחבורה",
  food: "אוכל",
  attractions: "אטרקציות",
  shopping: "קניות",
  arcade: "ארקייד וגצ׳פון",
  gifts: "מתנות",
  essentials: "הוצאות שוטפות",
  other: "אחר",
};

/** Fixed display order — the same one 10-BUDGET.md walks through. */
export const categoryOrder: ExpenseCategory[] = [
  "flights",
  "stay",
  "transport",
  "attractions",
  "food",
  "shopping",
  "arcade",
  "gifts",
  "essentials",
  "other",
];

export const statusLabels: Record<ExpenseStatus, string> = {
  paid: "שולם",
  pending: "מוזמן, טרם חויב",
  refunded: "הוחזר",
};

export const methodLabels: Record<PaymentMethod, string> = {
  card: "כרטיס אשראי",
  cash: "מזומן",
  ic: "כרטיס IC",
  transfer: "העברה",
  points: "נקודות",
  other: "אחר",
};

export const currencyLabels: Record<Currency, string> = {
  JPY: "ין",
  ILS: "שקל",
  USD: "דולר",
  EUR: "אירו",
};

const currencySymbols: Record<Currency, string> = {
  JPY: "¥",
  ILS: "₪",
  USD: "$",
  EUR: "€",
};

/**
 * An amount in the currency it was actually charged in.
 *
 * Yen has no minor unit, everything else does — showing "₪3638.99" as "₪3639"
 * would make a receipt stop matching the record it is supposed to prove.
 */
export function money(amount: number, currency: Currency): string {
  if (currency === "JPY") return yen(amount);
  const rounded = Math.round(amount * 100) / 100;
  return `${currencySymbols[currency]}${rounded.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Yen, rounded to a whole yen — there is no such thing as half a yen. */
export function toYen(amount: number, jpyPerUnit: number): number {
  return Math.round(amount * jpyPerUnit);
}

/** "¥65,000–75,000", or the single bound when only one is known. */
export function envelopeRange(min?: number, max?: number): string | null {
  if (min === undefined && max === undefined) return null;
  if (min !== undefined && max !== undefined) {
    return min === max ? yen(min) : `${yen(min)}–${yen(max)}`;
  }
  return min !== undefined ? `${yen(min)}+` : `עד ${yen(max as number)}`;
}

/* -------------------------------------------------------------- aggregation */

/**
 * A refund is not a purchase that never happened — it is a purchase that came
 * back. It stays in the list so the trail survives, and it stays out of every
 * total, which is the one rule the rest of this module is built on.
 */
export function counts(expense: Expense): boolean {
  return expense.status !== "refunded";
}

export type Totals = {
  /** Money that has actually left an account. */
  paidYen: number;
  /** Booked or won but not yet charged. */
  pendingYen: number;
  /** What the trip is on the hook for: paid + pending. */
  committedYen: number;
  refundedYen: number;
  count: number;
};

export function totals(expenses: Expense[]): Totals {
  let paidYen = 0;
  let pendingYen = 0;
  let refundedYen = 0;

  for (const expense of expenses) {
    if (expense.status === "paid") paidYen += expense.amountYen;
    else if (expense.status === "pending") pendingYen += expense.amountYen;
    else refundedYen += expense.amountYen;
  }

  return {
    paidYen,
    pendingYen,
    committedYen: paidYen + pendingYen,
    refundedYen,
    count: expenses.filter(counts).length,
  };
}

/** Group by any key an expense carries; rows the key does not apply to drop out. */
function groupBy<K>(
  expenses: Expense[],
  key: (expense: Expense) => K | undefined,
): Map<K, Expense[]> {
  const groups = new Map<K, Expense[]>();
  for (const expense of expenses) {
    const value = key(expense);
    if (value === undefined) continue;
    const list = groups.get(value);
    if (list) list.push(expense);
    else groups.set(value, [expense]);
  }
  return groups;
}

export type CategoryRow = {
  category: ExpenseCategory;
  label: string;
  totals: Totals;
  /** The envelopes that cover this category, summed. Undefined when none exist. */
  plannedMinYen?: number;
  plannedMaxYen?: number;
  envelopes: Envelope[];
};

/**
 * Spend per category, with the planning envelopes that cover it.
 *
 * Every category appears, even at zero — "we have spent nothing on gifts yet"
 * is information, and a category that vanishes when empty makes the list
 * reshuffle itself every time somebody buys something.
 */
export function byCategory(expenses: Expense[], envelopes: Envelope[] = []): CategoryRow[] {
  const spend = groupBy(expenses, (expense) => expense.category);

  const byCat = new Map<ExpenseCategory, Envelope[]>();
  for (const envelope of envelopes) {
    const list = byCat.get(envelope.category);
    if (list) list.push(envelope);
    else byCat.set(envelope.category, [envelope]);
  }

  return categoryOrder.map((category) => {
    const rows = spend.get(category) ?? [];
    const covering = (byCat.get(category) ?? []).sort((a, b) => a.order - b.order);

    // An envelope with no bounds ("define a family ceiling for anime shopping")
    // contributes nothing to the range but still belongs to the category, so the
    // open question stays on screen.
    const withMin = covering.filter((e) => e.minYen !== undefined);
    const withMax = covering.filter((e) => e.maxYen !== undefined);

    return {
      category,
      label: categoryLabels[category],
      totals: totals(rows),
      plannedMinYen:
        withMin.length > 0 ? withMin.reduce((sum, e) => sum + (e.minYen ?? 0), 0) : undefined,
      plannedMaxYen:
        withMax.length > 0 ? withMax.reduce((sum, e) => sum + (e.maxYen ?? 0), 0) : undefined,
      envelopes: covering,
    };
  });
}

/** Spend per trip day. Pre-trip bookings carry no `dayN` and are excluded. */
export function byDay(expenses: Expense[]): Map<number, Totals> {
  const grouped = groupBy(expenses, (expense) => expense.dayN);
  return new Map([...grouped].map(([dayN, rows]) => [dayN, totals(rows)]));
}

export type PayerRow = { email: string; name: string; totals: Totals };

/**
 * Who has been fronting the money.
 *
 * Not an accusation and not a settlement — just the number that makes "you have
 * paid for everything since Kyoto" a fact instead of a feeling.
 */
export function byPayer(expenses: Expense[]): PayerRow[] {
  const grouped = groupBy(expenses, (expense) => expense.paidByEmail);
  return [...grouped]
    .map(([email, rows]) => ({
      email,
      name: rows[0].paidByName,
      totals: totals(rows),
    }))
    .sort((a, b) => b.totals.committedYen - a.totals.committedYen);
}

/** Spend in each currency as it was actually charged, before conversion. */
export function byCurrency(expenses: Expense[]): { currency: Currency; amount: number }[] {
  const grouped = groupBy(expenses, (expense) => expense.currency);
  return [...grouped]
    .map(([currency, rows]) => ({
      currency,
      amount: rows.filter(counts).reduce((sum, row) => sum + row.amount, 0),
    }))
    .filter((row) => row.amount !== 0)
    .sort((a, b) => (a.currency === "JPY" ? -1 : b.currency === "JPY" ? 1 : 0));
}

export type TripTotals = Totals & {
  plannedMinYen?: number;
  plannedMaxYen?: number;
  /** Envelope headroom, against the top of the range. Negative means over. */
  remainingYen?: number;
  /** How far through the top of the envelope we are, 0..1+, for a progress bar. */
  usedFraction?: number;
};

export function tripTotals(expenses: Expense[], envelopes: Envelope[]): TripTotals {
  const base = totals(expenses);
  const withMin = envelopes.filter((e) => e.minYen !== undefined);
  const withMax = envelopes.filter((e) => e.maxYen !== undefined);

  const plannedMinYen =
    withMin.length > 0 ? withMin.reduce((sum, e) => sum + (e.minYen ?? 0), 0) : undefined;
  const plannedMaxYen =
    withMax.length > 0 ? withMax.reduce((sum, e) => sum + (e.maxYen ?? 0), 0) : undefined;

  return {
    ...base,
    plannedMinYen,
    plannedMaxYen,
    remainingYen: plannedMaxYen === undefined ? undefined : plannedMaxYen - base.committedYen,
    usedFraction:
      plannedMaxYen === undefined || plannedMaxYen === 0
        ? undefined
        : base.committedYen / plannedMaxYen,
  };
}

/**
 * Planned versus actual for one day.
 *
 * `plannedYen` comes from the day's block cost lines (already summed for four
 * people by `familyTotal`), `actual` from the expenses recorded against the
 * day. They are reported side by side and never merged: the plan said ¥16,800,
 * the receipt says ¥16,800 + a ¥1,200 lunch nobody had costed.
 */
export type DayMoney = {
  dayN: number;
  plannedYen: number;
  actual: Totals;
  /** Actual minus planned, once anything has actually been paid. */
  varianceYen: number | null;
};

export function dayMoney(dayN: number, plannedYen: number, expenses: Expense[]): DayMoney {
  const forDay = expenses.filter((expense) => expense.dayN === dayN);
  const actual = totals(forDay);
  return {
    dayN,
    plannedYen,
    actual,
    varianceYen: actual.count === 0 ? null : actual.committedYen - plannedYen,
  };
}

/** Newest first, then by creation, so same-day rows keep a stable order. */
export function sortByDate(expenses: Expense[]): Expense[] {
  return [...expenses].sort(
    (a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt - a.createdAt,
  );
}
