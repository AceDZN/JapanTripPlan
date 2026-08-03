"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useAction,
  useMutation,
  useQuery,
} from "convex/react";
import { UserButton } from "@clerk/nextjs";
import {
  AlertTriangle,
  Banknote,
  Clock3,
  ExternalLink,
  Eye,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Receipt,
  RefreshCcw,
  Trash2,
  Undo2,
  Wallet,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { yen } from "@/lib/ops";
import {
  byCategory,
  byCurrency,
  byPayer,
  categoryLabels,
  categoryOrder,
  currencyLabels,
  envelopeRange,
  methodLabels,
  money,
  rateAgeDays,
  rateAsOf,
  sortByDate,
  statusLabels,
  tripTotals,
  type Currency,
  type Envelope,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
  type FxRate,
  type PaymentMethod,
} from "@/lib/money";

/**
 * The money board: what the trip was budgeted at, and what it has actually cost.
 *
 * All the arithmetic lives in `lib/money.ts` and all the rows come from
 * `convex/money.ts`; this file is presentation. Two rules it enforces visually,
 * because getting them wrong is how a budget lies:
 *
 *  - PLANNED and ACTUAL never share a number. Envelopes are ranges from the
 *    guide; spend is receipts. They sit side by side, never summed.
 *  - PENDING is called out separately from PAID. A booking that is held but not
 *    yet charged is neither: counting it as spent would overstate today, and
 *    ignoring it would understate what the trip owes.
 */

const CURRENCIES: Currency[] = ["JPY", "ILS", "USD", "EUR"];

const STATUSES: ExpenseStatus[] = ["paid", "pending", "refunded"];

const METHODS: PaymentMethod[] = ["card", "cash", "ic", "transfer", "points", "other"];

type Board = {
  expenses: Expense[];
  envelopes: Envelope[];
  rates: FxRate[];
  me: string;
};

/* ------------------------------------------------------------------ pieces */

function Bar({ used, label }: { used: number | undefined; label?: string }) {
  if (used === undefined) return null;
  const pct = Math.max(0, Math.min(used, 1)) * 100;
  const over = used > 1;

  return (
    <div className="money-bar" role="img" aria-label={label ?? `${Math.round(used * 100)}% מהמעטפה`}>
      <span className={`money-bar-fill${over ? " is-over" : ""}`} style={{ width: `${pct}%` }} />
      {over ? <span className="money-bar-over" /> : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "over" | "ok";
}) {
  return (
    <div className={`money-stat${tone ? ` is-${tone}` : ""}`}>
      <p className="eyebrow">{label}</p>
      <p className="money-stat-value" dir="ltr">
        {value}
      </p>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

/* -------------------------------------------------------------- add / edit */

function AddExpenseForm({ rates, onDone }: { rates: FxRate[]; onDone: () => void }) {
  const add = useMutation(api.money.addExpense);

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<Currency>("JPY");
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [status, setStatus] = useState<ExpenseStatus>("paid");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [dayN, setDayN] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = rates.find((row) => row.currency === currency);
  const needsRate = currency !== "JPY" && !rate;

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
        currency,
        spentOn,
        dayN: dayN ? Number(dayN) : undefined,
        status,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        visibility: isPrivate ? "private" : "shared",
      });
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card wish-form money-form" onSubmit={submit}>
      <label>
        <span className="eyebrow">על מה שילמנו</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="כרטיסי USJ Studio Pass"
          required
        />
      </label>

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">כמה</span>
          <input
            dir="ltr"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="54000"
            required
          />
        </label>
        <label>
          <span className="eyebrow">מטבע</span>
          <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
            {CURRENCIES.map((value) => (
              <option key={value} value={value}>
                {currencyLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {needsRate ? (
        <p className="money-form-warn">
          <AlertTriangle size={13} />
          אין שער המרה שמור ל{currencyLabels[currency]}. צריך לקבוע אחד למטה לפני שאפשר לשמור —
          שער מומצא היה נותן סכום כולל שנראה סמכותי ואינו נכון.
        </p>
      ) : rate && currency !== "JPY" ? (
        <p className="money-form-hint">
          יומר לפי <span dir="ltr">1 {currency} = ¥{rate.jpyPerUnit.toFixed(3)}</span>
          {rate.source ? ` (${rate.source})` : null}
        </p>
      ) : null}

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">קטגוריה</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as ExpenseCategory)}
          >
            {categoryOrder.map((value) => (
              <option key={value} value={value}>
                {categoryLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="eyebrow">מצב</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ExpenseStatus)}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">מתי</span>
          <input
            dir="ltr"
            type="date"
            value={spentOn}
            onChange={(event) => setSpentOn(event.target.value)}
            required
          />
        </label>
        <label>
          <span className="eyebrow">יום בטיול (לא חובה)</span>
          <select value={dayN} onChange={(event) => setDayN(event.target.value)}>
            <option value="">לפני הטיול / לא משויך</option>
            {Array.from({ length: 17 }, (_, index) => index + 1).map((value) => (
              <option key={value} value={value}>
                יום {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="wish-form-row">
        <label>
          <span className="eyebrow">אמצעי תשלום</span>
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {METHODS.map((value) => (
              <option key={value} value={value}>
                {methodLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="wish-private-toggle">
          <span className="eyebrow">מי רואה</span>
          <button
            type="button"
            className={`btn btn-sm wish-vis ${isPrivate ? "btn-dark" : "btn-ghost"}`}
            onClick={() => setIsPrivate((value) => !value)}
            aria-pressed={isPrivate}
          >
            {isPrivate ? <Lock size={14} /> : <Eye size={14} />}
            {isPrivate ? "רק אני" : "כל המשפחה"}
          </button>
        </label>
      </div>

      <label>
        <span className="eyebrow">מספר הזמנה (לא חובה)</span>
        <input dir="ltr" value={reference} onChange={(event) => setReference(event.target.value)} />
      </label>

      <label>
        <span className="eyebrow">הערה (לא חובה)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} />
      </label>

      {error ? <p className="money-form-warn">{error}</p> : null}

      <div className="wish-form-actions">
        <button className="btn" type="submit" disabled={saving || needsRate}>
          {saving ? "שומר…" : "רישום ההוצאה"}
        </button>
        <button className="btn btn-ghost" type="button" onClick={onDone}>
          ביטול
        </button>
      </div>
    </form>
  );
}

/** Attaching the receipt is what turns a typed number into something checkable. */
function ReceiptButton({ expense }: { expense: Expense }) {
  const generateUploadUrl = useMutation(api.money.generateReceiptUploadUrl);
  const attach = useMutation(api.money.attachReceipt);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const url = await generateUploadUrl();
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await attach({
        id: expense.id as Id<"expenses">,
        storageId,
        name: file.name,
        size: file.size,
        type: file.type,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ההעלאה נכשלה");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <button
        className="btn btn-sm btn-ghost"
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 size={13} /> : <Paperclip size={13} />}
        קבלה
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {error ? <small className="money-row-error">{error}</small> : null}
    </>
  );
}

function ExpenseRow({ expense }: { expense: Expense }) {
  const update = useMutation(api.money.updateExpense);
  const remove = useMutation(api.money.removeExpense);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`money-row${expense.status === "refunded" ? " is-refunded" : ""}`}>
      <div className="money-row-main">
        <p className="money-row-title">
          <strong>{expense.title}</strong>
          {expense.visibility === "private" ? (
            <span className="chip money-chip-private">
              <Lock size={11} />
              רק אני
            </span>
          ) : null}
          {expense.status !== "paid" ? (
            <span className={`chip money-chip-${expense.status}`}>
              {expense.status === "pending" ? <Clock3 size={11} /> : <Undo2 size={11} />}
              {statusLabels[expense.status]}
            </span>
          ) : null}
        </p>

        <p className="money-row-meta">
          <span>{categoryLabels[expense.category]}</span>
          <span dir="ltr">{expense.spentOn}</span>
          {expense.dayN ? (
            <Link href={`/day/${expense.dayN}`}>יום {expense.dayN}</Link>
          ) : null}
          <span>{expense.paidByName}</span>
          {expense.method ? <span>{methodLabels[expense.method]}</span> : null}
          {expense.reference ? <span dir="ltr">#{expense.reference}</span> : null}
        </p>

        {expense.note ? <p className="money-row-note">{expense.note}</p> : null}

        {expense.files.length > 0 ? (
          <p className="money-row-files">
            {expense.files.map((file) =>
              file.url ? (
                <a key={file.storageId} href={file.url} target="_blank" rel="noreferrer">
                  <Paperclip size={11} />
                  {file.name}
                  <ExternalLink size={10} />
                </a>
              ) : null,
            )}
          </p>
        ) : null}

        {expense.mine ? (
          <div className="money-row-actions">
            <ReceiptButton expense={expense} />
            {expense.status === "pending" ? (
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => update({ id: expense.id as Id<"expenses">, status: "paid" }))
                }
              >
                סומן כשולם
              </button>
            ) : null}
            {expense.status !== "refunded" ? (
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => update({ id: expense.id as Id<"expenses">, status: "refunded" }))
                }
              >
                <Undo2 size={13} />
                הוחזר
              </button>
            ) : null}
            <button
              className="btn btn-sm btn-ghost money-row-danger"
              type="button"
              disabled={busy}
              onClick={() => run(() => remove({ id: expense.id as Id<"expenses"> }))}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="money-row-amount">
        <strong dir="ltr">{money(expense.amount, expense.currency)}</strong>
        {expense.currency !== "JPY" ? (
          <small dir="ltr">
            {yen(expense.amountYen)}
            <br />@{expense.jpyPerUnit.toFixed(2)}
          </small>
        ) : null}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ rates */

/** Past this, the rate on screen is old enough that it is worth saying so. */
const STALE_AFTER_DAYS = 3;

function RateEditor({ rates }: { rates: FxRate[] }) {
  const setRate = useMutation(api.money.setRate);
  const refreshRates = useAction(api.fx.refreshNow);
  const [currency, setCurrency] = useState<Currency>("ILS");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    setNote(null);
    try {
      const result = await refreshRates({});
      if (!result.ok) {
        setError(`לא הצלחנו למשוך שער (${result.error}). השערים הקיימים נשארו.`);
      } else if (result.rejected.length > 0) {
        setNote(
          result.rejected.map((row) => `${row.currency}: ${row.reason}`).join(" · "),
        );
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לרענן");
    } finally {
      setRefreshing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const rate = Number(value);
    if (!(rate > 0)) return;
    setSaving(true);
    setError(null);
    setNote(null);
    try {
      await setRate({ currency, jpyPerUnit: rate, source: source.trim() || undefined });
      setValue("");
      setSource("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "לא הצלחנו לשמור");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel money-rates">
      <div className="money-rates-head">
        <h2>
          <RefreshCcw size={16} />
          שערי המרה
        </h2>
        <button className="btn btn-sm" type="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="spin" size={13} /> : <RefreshCcw size={13} />}
          {refreshing ? "מרענן" : "רענון"}
        </button>
      </div>
      <p>
        השערים נמשכים אוטומטית פעם ביום. כל הוצאה שומרת את השער שבו נרשמה, ולכן עדכון שער
        לא משנה למפרע מה שכבר נרשם — הוא משמש רק להוצאה הבאה.
      </p>

      <ul className="money-rate-list">
        {rates.length === 0 ? <li>עוד לא נקבע אף שער.</li> : null}
        {rates.map((rate) => {
          const age = rateAgeDays(rate);
          return (
            <li key={rate.currency}>
              <span dir="ltr">
                1 {rate.currency} = ¥{rate.jpyPerUnit.toFixed(3)}
              </span>
              <small>
                {rate.source ?? "ידני"} · שער ל־
                {new Date(rateAsOf(rate)).toLocaleDateString("he-IL")}
                {age > STALE_AFTER_DAYS ? (
                  <span className="money-rate-stale"> · בן {age} ימים</span>
                ) : null}
              </small>
            </li>
          );
        })}
      </ul>

      {note ? <p className="money-form-hint">{note}</p> : null}
      {error ? <p className="money-form-warn">{error}</p> : null}

      <details className="money-rate-manual">
        <summary>עדכון ידני</summary>
        <p className="money-form-hint">
          למקרה שהמקור לא זמין, או כשרוצים את השער שהכרטיס באמת חייב בו — הוא בדרך כלל
          אחוז-שניים גרוע יותר משער השוק.
        </p>
        <form className="money-rate-form" onSubmit={submit}>
          <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
            {CURRENCIES.filter((code) => code !== "JPY").map((code) => (
              <option key={code} value={code}>
                {currencyLabels[code]}
              </option>
            ))}
          </select>
          <input
            aria-label="ין ליחידה"
            dir="ltr"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ""))}
            placeholder="51.8"
          />
          <input
            aria-label="מקור"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="מקור השער"
          />
          <button className="btn btn-sm" type="submit" disabled={saving}>
            עדכון
          </button>
        </form>
      </details>
    </section>
  );
}

/* ------------------------------------------------------------------- board */

function Board() {
  const data = useQuery(api.money.board, {}) as Board | undefined;
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<ExpenseCategory | "all">("all");

  const view = useMemo(() => {
    if (!data) return null;
    const trip = tripTotals(data.expenses, data.envelopes);
    return {
      trip,
      categories: byCategory(data.expenses, data.envelopes),
      payers: byPayer(data.expenses),
      currencies: byCurrency(data.expenses),
      rows: sortByDate(
        filter === "all"
          ? data.expenses
          : data.expenses.filter((expense) => expense.category === filter),
      ),
    };
  }, [data, filter]);

  if (!data || !view) {
    return (
      <p className="money-loading">
        <Loader2 size={16} />
        טוען את הכספים…
      </p>
    );
  }

  const { trip } = view;

  return (
    <>
      <section className="money-stats">
        <Stat
          label="שולם עד עכשיו"
          value={yen(trip.paidYen)}
          hint={`${trip.count} רישומים`}
        />
        <Stat
          label="מוזמן וטרם חויב"
          value={yen(trip.pendingYen)}
          hint="כרטיסים שנסגרו אבל הכסף עוד לא ירד"
        />
        <Stat
          label="סך ההתחייבות"
          value={yen(trip.committedYen)}
          hint="שולם ועוד ממתין"
        />
        <Stat
          label="מעטפות התכנון"
          value={
            envelopeRange(trip.plannedMinYen, trip.plannedMaxYen) ?? "טרם הוגדרו"
          }
          hint={
            trip.remainingYen === undefined
              ? "חלק מהמעטפות עדיין בלי טווח"
              : trip.remainingYen >= 0
                ? `נשארו ${yen(trip.remainingYen)} עד תקרת המעטפות`
                : `חריגה של ${yen(-trip.remainingYen)} מעל התקרה`
          }
          tone={
            trip.remainingYen === undefined ? undefined : trip.remainingYen >= 0 ? "ok" : "over"
          }
        />
      </section>

      <Bar used={trip.usedFraction} label="ניצול מעטפות התכנון" />

      {view.currencies.length > 1 ? (
        <p className="money-currencies">
          {view.currencies.map((row) => (
            <span key={row.currency} dir="ltr">
              {money(row.amount, row.currency)}
            </span>
          ))}
          <small>הסכומים כפי שחויבו בפועל, לפני המרה.</small>
        </p>
      ) : null}

      <section className="money-section">
        <div className="section-head">
          <p className="eyebrow">
            <Wallet size={14} />
            מעטפה מול הוצאה
          </p>
          <h2 className="display-sm">לאן הכסף הולך</h2>
        </div>

        <ul className="money-categories">
          {view.categories.map((row) => {
            const used =
              row.plannedMaxYen === undefined || row.plannedMaxYen === 0
                ? undefined
                : row.totals.committedYen / row.plannedMaxYen;
            const range = envelopeRange(row.plannedMinYen, row.plannedMaxYen);
            const empty = row.totals.count === 0 && row.envelopes.length === 0;
            if (empty) return null;

            return (
              <li key={row.category}>
                <p className="money-cat-head">
                  <strong>{row.label}</strong>
                  <span dir="ltr">{yen(row.totals.committedYen)}</span>
                </p>
                <Bar used={used} label={`${row.label} — ניצול המעטפה`} />
                <p className="money-cat-meta">
                  {range ? <span>מעטפה {range}</span> : <span>אין מעטפה מוגדרת</span>}
                  {row.totals.pendingYen > 0 ? (
                    <span dir="ltr">+{yen(row.totals.pendingYen)} ממתין</span>
                  ) : null}
                </p>
                {row.envelopes.map((envelope) =>
                  envelope.note ? (
                    <p className="money-cat-note" key={envelope.slug}>
                      <strong>{envelope.label}:</strong> {envelope.note}
                    </p>
                  ) : null,
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {view.payers.length > 1 ? (
        <section className="panel money-payers">
          <h2>
            <Banknote size={16} />
            מי שילם
          </h2>
          <ul>
            {view.payers.map((payer) => (
              <li key={payer.email}>
                <span>{payer.name}</span>
                <span dir="ltr">{yen(payer.totals.committedYen)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="money-section">
        <div className="section-head money-list-head">
          <div>
            <p className="eyebrow">
              <Receipt size={14} />
              הפנקס
            </p>
            <h2 className="display-sm">כל מה שנרשם</h2>
          </div>
          <button className="btn" type="button" onClick={() => setAdding((value) => !value)}>
            <Plus size={16} />
            רישום הוצאה
          </button>
        </div>

        {adding ? <AddExpenseForm rates={data.rates} onDone={() => setAdding(false)} /> : null}

        <div className="money-filters">
          <button
            type="button"
            className={`chip ${filter === "all" ? "chip-day" : ""}`}
            onClick={() => setFilter("all")}
          >
            הכול
          </button>
          {categoryOrder
            .filter((category) =>
              data.expenses.some((expense) => expense.category === category),
            )
            .map((category) => (
              <button
                key={category}
                type="button"
                className={`chip ${filter === category ? "chip-day" : ""}`}
                onClick={() => setFilter(category)}
              >
                {categoryLabels[category]}
              </button>
            ))}
        </div>

        {view.rows.length === 0 ? (
          <p className="money-empty">אין כאן עדיין הוצאות. הראשונה נרשמת מהכפתור למעלה.</p>
        ) : (
          <ul className="money-rows">
            {view.rows.map((expense) => (
              <ExpenseRow expense={expense} key={expense.id} />
            ))}
          </ul>
        )}
      </section>

      <RateEditor rates={data.rates} />
    </>
  );
}

export function MoneyBoard() {
  return (
    <>
      <AuthLoading>
        <p className="money-loading">
          <Loader2 size={16} />
          בודקים מי מחובר…
        </p>
      </AuthLoading>

      <Unauthenticated>
        <div className="card money-signin">
          <span className="chip">
            <Lock size={13} />
            רק למשפחה
          </span>
          <p className="lede" style={{ margin: 0 }}>
            הכספים הם מידע משפחתי בלבד — קבלות, מספרי הזמנה וסכומים. צריך להתחבר כדי לראות
            אותם ולרשום הוצאה.
          </p>
          <Link className="btn btn-primary" href="/sign-in">
            כניסה
          </Link>
        </div>
      </Unauthenticated>

      <Authenticated>
        <div className="wish-signed-in">
          <UserButton />
        </div>
        <Board />
      </Authenticated>
    </>
  );
}
