import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

/**
 * The arithmetic behind every money figure in the app.
 *
 * Worth its own file because every consumer — the /money board, the day page's
 * spend panel, the live panel on the budget guide, and the report eve reads out
 * loud — calls into this one module. A wrong sum here is wrong in four places
 * at once, and it is wrong in the specific way people act on: "we have ¥40,000
 * left for food" when we do not.
 *
 * The cases below are the ones that are genuinely easy to get wrong: refunds
 * silently entering a total, pending charges being counted as spent, an
 * envelope with no bounds reading as a ceiling of zero, and a foreign-currency
 * charge being summed in its own units.
 */

function load(relative, rewrites = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  let js = transpileModule(source, {
    compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(rewrites)) {
    js = js.replaceAll(`"${specifier}"`, `"${replacement}"`);
  }
  return `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`;
}

const opsUrl = load("../lib/ops.ts");
const money = await import(load("../lib/money.ts", { "@/lib/ops": opsUrl }));

/** Only the fields the arithmetic reads; the rest never enters a sum. */
function expense(overrides) {
  return {
    id: Math.random().toString(36).slice(2),
    title: "x",
    category: "food",
    amount: 1000,
    currency: "JPY",
    amountYen: 1000,
    jpyPerUnit: 1,
    spentOn: "2026-10-05",
    status: "paid",
    paidByEmail: "alex@acedzn.com",
    paidByName: "Alex",
    visibility: "shared",
    files: [],
    source: "app",
    createdAt: 0,
    updatedAt: 0,
    mine: true,
    ...overrides,
  };
}

function envelope(overrides) {
  return { id: "e", slug: "s", category: "food", label: "אוכל", order: 10, ...overrides };
}

/* ------------------------------------------------------------------ totals */

test("a refund leaves every total but stays in the list", () => {
  const rows = [
    expense({ amountYen: 5000 }),
    expense({ amountYen: 3000, status: "refunded" }),
  ];
  const result = money.totals(rows);

  assert.equal(result.paidYen, 5000);
  assert.equal(result.committedYen, 5000, "a refunded charge must not be committed money");
  assert.equal(result.refundedYen, 3000, "but it is still reported");
  assert.equal(result.count, 1);
});

test("pending is committed but not paid", () => {
  const rows = [
    expense({ amountYen: 16800 }),
    expense({ amountYen: 11000, status: "pending" }),
  ];
  const result = money.totals(rows);

  assert.equal(result.paidYen, 16800, "the Nintendo Museum is won, not paid");
  assert.equal(result.pendingYen, 11000);
  assert.equal(result.committedYen, 27800, "but the trip is on the hook for it");
});

test("a foreign charge is summed in yen, never in its own units", () => {
  const rows = [
    expense({ amount: 3638.99, currency: "ILS", amountYen: 188628, jpyPerUnit: 51.835159 }),
    expense({ amount: 16800, currency: "JPY", amountYen: 16800 }),
  ];
  assert.equal(money.totals(rows).paidYen, 205428);
});

/* -------------------------------------------------------------- categories */

test("every category appears even at zero, in a stable order", () => {
  const rows = money.byCategory([expense({ category: "food", amountYen: 4000 })]);

  assert.deepEqual(
    rows.map((row) => row.category),
    money.categoryOrder,
    "a category that vanishes when empty reshuffles the list on every purchase",
  );
  assert.equal(rows.find((row) => row.category === "food").totals.paidYen, 4000);
  assert.equal(rows.find((row) => row.category === "gifts").totals.paidYen, 0);
});

test("several envelopes covering one category sum into one range", () => {
  const rows = money.byCategory(
    [expense({ category: "transport", amountYen: 60000 })],
    [
      envelope({ slug: "local", category: "transport", minYen: 65000, maxYen: 75000 }),
      envelope({ slug: "shinkansen", category: "transport", minYen: 110000, maxYen: 125000 }),
    ],
  );
  const transport = rows.find((row) => row.category === "transport");

  assert.equal(transport.plannedMinYen, 175000);
  assert.equal(transport.plannedMaxYen, 200000);
  assert.equal(transport.envelopes.length, 2);
});

test("an envelope with no bounds contributes no ceiling but keeps its category", () => {
  const rows = money.byCategory(
    [expense({ category: "shopping", amountYen: 9000 })],
    [envelope({ slug: "anime-shopping", category: "shopping", note: "תקרה טרם הוגדרה" })],
  );
  const shopping = rows.find((row) => row.category === "shopping");

  assert.equal(shopping.plannedMaxYen, undefined, "no bound is an open question, not a zero");
  assert.equal(shopping.envelopes.length, 1, "and the open question stays on screen");
});

/* ------------------------------------------------------------ trip totals */

test("headroom is measured against the top of the envelope range", () => {
  const trip = money.tripTotals(
    [expense({ amountYen: 40000 }), expense({ amountYen: 10000, status: "pending" })],
    [envelope({ minYen: 190000, maxYen: 260000 })],
  );

  assert.equal(trip.committedYen, 50000);
  assert.equal(trip.plannedMaxYen, 260000);
  assert.equal(trip.remainingYen, 210000);
  assert.ok(Math.abs(trip.usedFraction - 50000 / 260000) < 1e-9);
});

test("overspending reports negative headroom rather than clamping to zero", () => {
  const trip = money.tripTotals(
    [expense({ amountYen: 300000 })],
    [envelope({ minYen: 190000, maxYen: 260000 })],
  );

  assert.equal(trip.remainingYen, -40000);
  assert.ok(trip.usedFraction > 1, "the bar has to be able to say 'over'");
});

test("with no bounded envelope at all there is no headroom to report", () => {
  const trip = money.tripTotals([expense({ amountYen: 5000 })], [envelope({})]);

  assert.equal(trip.plannedMaxYen, undefined);
  assert.equal(trip.remainingYen, undefined, "undefined, never 0 — 0 reads as 'nothing left'");
});

/* --------------------------------------------------------------- per day */

test("a day compares plan against receipts without merging them", () => {
  const rows = [
    expense({ dayN: 4, amountYen: 16800 }),
    expense({ dayN: 4, amountYen: 1200 }),
    expense({ dayN: 12, amountYen: 29600 }),
  ];
  const day = money.dayMoney(4, 16800, rows);

  assert.equal(day.plannedYen, 16800);
  assert.equal(day.actual.committedYen, 18000, "day 12 must not leak into day 4");
  assert.equal(day.varianceYen, 1200);
});

test("a day with nothing recorded reports no variance rather than a false saving", () => {
  const day = money.dayMoney(9, 12000, [expense({ dayN: 3, amountYen: 5000 })]);

  assert.equal(day.actual.committedYen, 0);
  assert.equal(day.varianceYen, null, "-¥12,000 would read as 'we came in under budget'");
});

/* ------------------------------------------------------------- formatting */

test("yen has no minor unit and the shekel keeps its agorot", () => {
  assert.equal(money.money(16800, "JPY"), "¥16,800");
  assert.equal(money.money(3638.99, "ILS"), "₪3,638.99");
  assert.equal(money.money(1380, "ILS"), "₪1,380", "a whole amount does not gain .00");
});

test("an envelope range renders both bounds, one bound, or nothing", () => {
  assert.equal(money.envelopeRange(65000, 75000), "¥65,000–¥75,000");
  assert.equal(money.envelopeRange(90000, 90000), "¥90,000");
  assert.equal(money.envelopeRange(undefined, undefined), null);
  assert.equal(money.envelopeRange(20000, undefined), "¥20,000+");
});

test("conversion rounds to a whole yen", () => {
  assert.equal(money.toYen(796.37, 51.835159), 41280);
  assert.equal(money.toYen(100, 1), 100);
});

/* ------------------------------------------------------------------ people */

test("who fronted the money is grouped by payer, biggest first", () => {
  const rows = [
    expense({ paidByEmail: "alex@acedzn.com", paidByName: "Alex", amountYen: 5000 }),
    expense({ paidByEmail: "yonitiny@gmail.com", paidByName: "Yonit", amountYen: 9000 }),
    expense({ paidByEmail: "alex@acedzn.com", paidByName: "Alex", amountYen: 1000 }),
  ];
  const payers = money.byPayer(rows);

  assert.deepEqual(
    payers.map((row) => [row.name, row.totals.committedYen]),
    [
      ["Yonit", 9000],
      ["Alex", 6000],
    ],
  );
});

test("currencies are reported as charged, before conversion", () => {
  const rows = [
    expense({ amount: 3638.99, currency: "ILS", amountYen: 188628 }),
    expense({ amount: 16800, currency: "JPY", amountYen: 16800 }),
    expense({ amount: 500, currency: "ILS", amountYen: 25917, status: "refunded" }),
  ];
  const byCurrency = money.byCurrency(rows);

  assert.equal(byCurrency.find((row) => row.currency === "JPY").amount, 16800);
  assert.equal(
    byCurrency.find((row) => row.currency === "ILS").amount,
    3638.99,
    "the refunded shekels are not money we spent",
  );
});
