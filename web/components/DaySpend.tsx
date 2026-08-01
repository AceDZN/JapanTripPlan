"use client";

import { useState } from "react";
import Link from "next/link";
import { Authenticated, useMutation, useQuery } from "convex/react";
import { Banknote, Clock3, Paperclip, Plus, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { yen } from "@/lib/ops";
import {
  categoryLabels,
  categoryOrder,
  dayMoney,
  money,
  sortByDate,
  type Expense,
  type ExpenseCategory,
} from "@/lib/money";

/**
 * "What today has actually cost, so far."
 *
 * The panel above it on the day page sums the block cost lines — what the plan
 * SAID this day would cost. This one sums receipts. Showing them next to each
 * other is the entire point: the plan said ¥16,800 for teamLab, and the day
 * also involved a ¥1,200 lunch and ¥900 of gachapon that no document predicted.
 *
 * Family-only, and it renders nothing at all when signed out — the day page
 * itself is public. Same contract as `DayWishes`.
 */

/** Recording a purchase while standing in the shop has to be four taps, not a form. */
function QuickAdd({ dayN, date, onDone }: { dayN: number; date: string; onDone: () => void }) {
  const add = useMutation(api.money.addExpense);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount);
    if (!title.trim() || !(value > 0)) return;

    setSaving(true);
    setError(null);
    try {
      await add({
        title: title.trim(),
        category,
        amount: value,
        // Everything bought on a trip day is bought in yen. Anything else is a
        // pre-trip booking, and those are entered on /money where the currency
        // picker lives.
        currency: "JPY",
        spentOn: date,
        dayN,
      });
      setTitle("");
      setAmount("");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="day-spend-add" onSubmit={submit}>
      <input
        aria-label="על מה"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="ראמן בטבטה"
        required
      />
      <input
        aria-label="כמה, בין"
        dir="ltr"
        inputMode="numeric"
        value={amount}
        onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
        placeholder="1200"
        required
      />
      <select
        aria-label="קטגוריה"
        value={category}
        onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
      >
        {categoryOrder.map((value) => (
          <option key={value} value={value}>
            {categoryLabels[value]}
          </option>
        ))}
      </select>
      <button className="btn btn-sm" type="submit" disabled={saving}>
        {saving ? "שומר…" : "הוספה"}
      </button>
      {error ? <p className="day-spend-error">{error}</p> : null}
    </form>
  );
}

function Panel({ dayN, date, plannedYen }: { dayN: number; date: string; plannedYen: number }) {
  const expenses = useQuery(api.money.listForDay, { dayN }) as Expense[] | undefined;
  const [adding, setAdding] = useState(false);

  // Undefined while loading. Unlike the wish panel this one always renders once
  // loaded, even at zero — "nothing spent today yet" is the answer to a question
  // people actually ask, and a panel that appears only after the first purchase
  // gives them nowhere to record it.
  if (!expenses) return null;

  const summary = dayMoney(dayN, plannedYen, expenses);
  const rows = sortByDate(expenses);
  const over = summary.varianceYen !== null && summary.varianceYen > 0;

  return (
    <section className="panel day-spend">
      <h2>
        <Receipt size={16} />
        מה הוצאנו היום
      </h2>

      <p className="day-spend-total" dir="ltr">
        {yen(summary.actual.paidYen)}
      </p>

      <p className="day-spend-compare">
        {plannedYen > 0 ? (
          <>
            <span>בתוכנית {yen(plannedYen)}</span>
            {summary.varianceYen !== null ? (
              <span className={over ? "day-spend-over" : "day-spend-under"}>
                {over ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {over ? "מעל ב־" : "מתחת ב־"}
                <span dir="ltr">{yen(Math.abs(summary.varianceYen))}</span>
              </span>
            ) : null}
          </>
        ) : (
          <span>אין שורות עלות מתוכננות ליום הזה.</span>
        )}
      </p>

      {summary.actual.pendingYen > 0 ? (
        <p className="day-spend-pending">
          <Clock3 size={12} />
          ועוד <span dir="ltr">{yen(summary.actual.pendingYen)}</span> מוזמן שטרם חויב
        </p>
      ) : null}

      {rows.length > 0 ? (
        <ul className="day-spend-list">
          {rows.map((expense) => (
            <li key={expense.id} className={expense.status === "refunded" ? "is-refunded" : ""}>
              <span className="day-spend-what">
                {expense.title}
                <small>
                  {categoryLabels[expense.category]} · {expense.paidByName}
                  {expense.files.length > 0 ? (
                    <>
                      {" · "}
                      <Paperclip size={10} />
                      קבלה
                    </>
                  ) : null}
                </small>
              </span>
              <span className="day-spend-amount" dir="ltr">
                {money(expense.amount, expense.currency)}
                {expense.currency !== "JPY" ? <small>{yen(expense.amountYen)}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="day-spend-empty">עוד לא נרשמה הוצאה ליום הזה.</p>
      )}

      {adding ? (
        <QuickAdd dayN={dayN} date={date} onDone={() => setAdding(false)} />
      ) : (
        <button className="btn btn-sm btn-ghost" type="button" onClick={() => setAdding(true)}>
          <Plus size={14} />
          רישום הוצאה
        </button>
      )}

      <Link className="text-link" href="/money">
        <Banknote size={13} />
        כל הכספים
      </Link>
    </section>
  );
}

export function DaySpend(props: { dayN: number; date: string; plannedYen: number }) {
  return (
    <Authenticated>
      <Panel {...props} />
    </Authenticated>
  );
}
