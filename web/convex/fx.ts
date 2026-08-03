import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, internalAction } from "./_generated/server";
import { requireFamily } from "./lib/guards";

/**
 * Where the shekel-to-yen rate comes from, so that nobody has to type it.
 *
 * A cron calls `refresh` once a day (see `crons.ts`) and the money board keeps
 * a button for "now". The manual form in the UI is the fallback for the day the
 * feed is down or the day you want the rate your card actually charged, which
 * is a couple of percent worse than any mid-market quote.
 *
 * open.er-api.com is exchangerate-api's keyless endpoint: one daily publish,
 * no account, no secret to rotate, and it reports the timestamp of its own
 * quote — which is what lets the UI show one honest date instead of "fetched
 * today" next to a rate from Friday.
 *
 * We ask per base currency rather than inverting a single JPY-based response:
 * `1/0.019265` is only good to five figures, and a rate is the one number here
 * that multiplies every total downstream.
 */

const PROVIDER = "exchangerate-api";
const BASE_URL = "https://open.er-api.com/v6/latest/";

/** JPY is 1 by definition; the rest are what the family actually spends. */
const AUTO_CURRENCIES = ["ILS", "USD", "EUR"] as const;

type Quote = { currency: (typeof AUTO_CURRENCIES)[number]; jpyPerUnit: number; asOf: number };

/**
 * Written out rather than inferred: the handlers reach the database through
 * `ctx.runMutation`, so letting TypeScript infer their return type makes the
 * generated `internal.fx.*` reference depend on itself.
 */
type RefreshResult = {
  ok: boolean;
  /** Currencies whose stored rate now matches the feed. */
  written: string[];
  /** Currencies deliberately left at the stored rate, and why. */
  rejected: { currency: string; reason: string }[];
  error?: string;
};

/** One base currency's yen rate, or null if the feed answered anything unusable. */
async function quote(currency: (typeof AUTO_CURRENCIES)[number]): Promise<Quote | null> {
  const response = await fetch(`${BASE_URL}${currency}`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) return null;

  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null) return null;

  const row = body as Record<string, unknown>;
  if (row.result !== "success") return null;

  const rates = row.rates;
  if (typeof rates !== "object" || rates === null) return null;

  const jpyPerUnit = (rates as Record<string, unknown>).JPY;
  if (typeof jpyPerUnit !== "number" || !Number.isFinite(jpyPerUnit) || jpyPerUnit <= 0) {
    return null;
  }

  const published = row.time_last_update_unix;
  const asOf = typeof published === "number" ? published * 1000 : Date.now();

  return { currency, jpyPerUnit, asOf };
}

async function fetchAndStore(ctx: ActionCtx, force: boolean): Promise<RefreshResult> {
  const quotes = await Promise.all(AUTO_CURRENCIES.map((currency) => quote(currency)));
  const usable = quotes.filter((row): row is Quote => row !== null);

  if (usable.length === 0) {
    // Leave the stored rates alone and say so. A missed refresh shows up as a
    // stale date on the board, which is recoverable; a zeroed rate is not.
    return { ok: false, written: [], rejected: [], error: `${PROVIDER} unreachable` };
  }

  const result = await ctx.runMutation(internal.money.applyFetchedRates, {
    source: PROVIDER,
    // Every currency in one response batch carries the same publish time.
    asOf: Math.max(...usable.map((row) => row.asOf)),
    force,
    rows: usable.map(({ currency, jpyPerUnit }) => ({ currency, jpyPerUnit })),
  });

  const missing = AUTO_CURRENCIES.filter(
    (currency) => !usable.some((row) => row.currency === currency),
  );

  return {
    ok: true,
    written: result.written,
    rejected: [
      ...result.rejected,
      ...missing.map((currency) => ({ currency, reason: `${PROVIDER} returned no rate` })),
    ],
  };
}

/** The daily cron's entry point. */
export const refresh = internalAction({
  args: {},
  handler: async (ctx): Promise<RefreshResult> => await fetchAndStore(ctx, false),
});

/**
 * The board's refresh button. Family-only.
 *
 * `force` skips the drift guard, and is how you accept a rate the guard would
 * otherwise refuse — after a long gap, or a genuinely large move.
 */
export const refreshNow = action({
  args: { force: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<RefreshResult> => {
    await requireFamily(ctx);
    return await fetchAndStore(ctx, args.force ?? false);
  },
});
