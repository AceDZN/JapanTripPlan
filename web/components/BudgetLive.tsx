"use client";

import Link from "next/link";
import { Authenticated, useQuery } from "convex/react";
import { Clock3, Wallet } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { yen } from "@/lib/ops";
import {
  byCategory,
  envelopeRange,
  tripTotals,
  type Envelope,
  type Expense,
  type FxRate,
} from "@/lib/money";

/**
 * The live numbers, on top of the budget guide's prose.
 *
 * 10-BUDGET.md ends with "הפלט הכן כרגע הוא מערכת מעטפות מבוקרת, לא סכום כולל"
 * and a list of things to fill in after each booking. This is that list, filled
 * in — the same envelopes, with what has actually been paid against each one,
 * so the document argues the policy and the panel reports the position.
 *
 * Family-only. Signed out it renders nothing and the guide reads exactly as it
 * did before, which is what keeps the public page public.
 */

type Board = {
  expenses: Expense[];
  envelopes: Envelope[];
  rates: FxRate[];
  me: string;
};

function Live({ compact }: { compact: boolean }) {
  const data = useQuery(api.money.board, {}) as Board | undefined;
  if (!data) return null;
  if (data.expenses.length === 0 && data.envelopes.length === 0) return null;

  const trip = tripTotals(data.expenses, data.envelopes);
  const categories = byCategory(data.expenses, data.envelopes).filter(
    (row) => row.totals.count > 0 || row.envelopes.length > 0,
  );

  return (
    <section className="panel budget-live">
      <h2>
        <Wallet size={16} />
        המצב בפועל
      </h2>

      <p className="budget-live-total" dir="ltr">
        {yen(trip.paidYen)}
      </p>
      <p className="budget-live-sub">
        שולם מתוך מעטפות של{" "}
        {envelopeRange(trip.plannedMinYen, trip.plannedMaxYen) ?? "טווח שטרם הוגדר"}
        {trip.pendingYen > 0 ? (
          <>
            {" · "}
            <Clock3 size={12} />
            ועוד <span dir="ltr">{yen(trip.pendingYen)}</span> מוזמן שטרם חויב
          </>
        ) : null}
      </p>

      {compact ? null : (
        <ul className="budget-live-list">
          {categories.map((row) => (
            <li key={row.category}>
              <span>{row.label}</span>
              <span dir="ltr">
                {yen(row.totals.committedYen)}
                <small>{envelopeRange(row.plannedMinYen, row.plannedMaxYen) ?? "בלי מעטפה"}</small>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link className="text-link" href="/money">
        הפנקס המלא ורישום הוצאה
      </Link>
    </section>
  );
}

export function BudgetLive({ compact = false }: { compact?: boolean }) {
  return (
    <Authenticated>
      <Live compact={compact} />
    </Authenticated>
  );
}
