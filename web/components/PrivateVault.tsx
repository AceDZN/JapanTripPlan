"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { UserButton } from "@clerk/nextjs";
import { KeyRound, Lock, Pencil, Plus, Trash2, ExternalLink } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The family safe.
 *
 * Everything here comes from `privateRecords`, which no unauthenticated query
 * can reach — see convex/private.ts. This is where the things
 * 11-PRE-TRIP-CHECKLIST.md keeps calling "the private lodging folder" and
 * "the private `06 teamLab` folder" finally live inside the app instead of
 * scattered across a drive.
 */

const KINDS = [
  { value: "ticket", label: "כרטיס" },
  { value: "confirmation", label: "אישור הזמנה" },
  { value: "address", label: "כתובת" },
  { value: "doorCode", label: "קוד כניסה" },
  { value: "passport", label: "דרכון" },
  { value: "note", label: "הערה" },
] as const;

const SUBJECTS = [
  { value: "trip", label: "כללי לטיול" },
  { value: "day", label: "יום מסוים" },
  { value: "place", label: "מקום" },
  { value: "booking", label: "הזמנה" },
  { value: "checklistItem", label: "משימה" },
] as const;

type Kind = (typeof KINDS)[number]["value"];
type Subject = (typeof SUBJECTS)[number]["value"];

const kindLabel = (kind: string) => KINDS.find((k) => k.value === kind)?.label ?? kind;
const subjectLabel = (subject: string) =>
  SUBJECTS.find((s) => s.value === subject)?.label ?? subject;

function AddRecordForm({ onDone }: { onDone: () => void }) {
  const upsert = useMutation(api.private.upsert);
  const [subject, setSubject] = useState<Subject>("trip");
  const [subjectId, setSubjectId] = useState("trip");
  const [kind, setKind] = useState<Kind>("confirmation");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!label.trim() || !value.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await upsert({
        subject,
        subjectId: subject === "trip" ? "trip" : subjectId.trim(),
        kind,
        label: label.trim(),
        value: value.trim(),
        url: url.trim() || undefined,
      });
      setLabel("");
      setValue("");
      setUrl("");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} style={{ display: "grid", gap: 12, padding: 18 }}>
      <h3 style={{ margin: 0 }}>הוספת פריט</h3>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">שייך ל־</span>
          <select value={subject} onChange={(e) => setSubject(e.target.value as Subject)}>
            {SUBJECTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        {subject !== "trip" ? (
          <label style={{ display: "grid", gap: 6 }}>
            <span className="eyebrow">
              {subject === "day" ? "מספר יום (1–17)" : "מזהה"}
            </span>
            <input
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder={subject === "day" ? "12" : "tabata-base"}
            />
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <span className="eyebrow">סוג</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">כותרת</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="teamLab Planets — אישור ל־4.10"
          required
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">התוכן</span>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          placeholder="מספר הזמנה, כתובת, קוד כניסה…"
          required
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span className="eyebrow">קישור (לא חובה)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" dir="ltr" />
      </label>

      {error ? <p style={{ color: "var(--danger, #c0392b)", margin: 0 }}>{error}</p> : null}

      <button className="btn btn-primary" type="submit" disabled={saving}>
        <Plus size={16} />
        {saving ? "שומר…" : "שמירה"}
      </button>
    </form>
  );
}

type Record_ = {
  id: string;
  subject: string;
  subjectId: string;
  kind: string;
  label: string;
  value: string;
  url?: string;
  hint?: string;
  updatedBy?: string;
};

/**
 * One record, which may be an empty slot waiting to be filled.
 *
 * Most rows start blank: the seeder lays out a slot for every private item the
 * guides reference, but never invents a value. An empty slot shows where the
 * real value lives today so whoever fills it knows where to look.
 */
function RecordCard({
  record,
  onRemove,
}: {
  record: Record_;
  onRemove: (args: { id: Id<"privateRecords"> }) => Promise<null>;
}) {
  const upsert = useMutation(api.private.upsert);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(record.value);
  const [url, setUrl] = useState(record.url ?? "");
  const [saving, setSaving] = useState(false);

  const empty = record.value.trim().length === 0;

  async function save() {
    setSaving(true);
    try {
      await upsert({
        subject: record.subject as never,
        subjectId: record.subjectId,
        kind: record.kind as never,
        label: record.label,
        value: value.trim(),
        url: url.trim() || undefined,
        hint: record.hint,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card" style={{ padding: 16, opacity: empty && !editing ? 0.72 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="chip">{kindLabel(record.kind)}</span>
        <strong style={{ flex: 1 }}>{record.label}</strong>
        {empty && !editing ? <span className="chip">ריק</span> : null}
        <button
          className="text-link"
          type="button"
          aria-label={`עריכת ${record.label}`}
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil size={15} />
        </button>
        <button
          className="text-link"
          type="button"
          aria-label={`מחיקת ${record.label}`}
          onClick={() => {
            if (confirm(`למחוק את "${record.label}"?`)) {
              void onRemove({ id: record.id as Id<"privateRecords"> });
            }
          }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      {editing ? (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={3}
            autoFocus
            placeholder="להדביק כאן את הערך האמיתי…"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="קישור (לא חובה)"
            dir="ltr"
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-primary btn-sm" type="button" onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמירה"}
            </button>
            <button
              className="btn btn-glass btn-sm"
              type="button"
              onClick={() => {
                setValue(record.value);
                setUrl(record.url ?? "");
                setEditing(false);
              }}
            >
              ביטול
            </button>
          </div>
        </div>
      ) : (
        <>
          {empty ? (
            record.hint ? (
              <p
                style={{
                  margin: "10px 0 0",
                  fontSize: 13,
                  lineHeight: 1.65,
                  opacity: 0.72,
                }}
              >
                <span style={{ fontWeight: 600 }}>איפה זה נמצא עכשיו:</span> {record.hint}
              </p>
            ) : null
          ) : (
            <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>{record.value}</p>
          )}
          {record.url ? (
            <a className="text-link" href={record.url} target="_blank" rel="noreferrer" dir="ltr">
              {record.url}
              <ExternalLink size={13} />
            </a>
          ) : null}
          {!empty && record.updatedBy ? (
            <p style={{ marginTop: 8, fontSize: 12, opacity: 0.6 }}>
              עודכן על ידי {record.updatedBy}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}

function VaultList() {
  const records = useQuery(api.private.listAll);
  // Public query — used only to turn place slugs into readable Hebrew names.
  const places = useQuery(api.trip.listPlaces);
  const remove = useMutation(api.private.remove);
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    if (!records) return [];
    const map = new Map<string, typeof records>();
    for (const record of records) {
      const key = `${record.subject}:${record.subjectId}`;
      map.set(key, [...(map.get(key) ?? []), record]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [records]);

  const placeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const place of places ?? []) map.set(place.id, place.nameHe);
    return map;
  }, [places]);

  if (records === undefined) {
    return <p className="lede">טוען…</p>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="section-head with-action" style={{ marginBottom: 0 }}>
        <p className="lede" style={{ margin: 0 }}>
          {records.length === 0
            ? "הכספת ריקה. אפשר להתחיל מאישור ההזמנה של teamLab או מקוד הכניסה לדירה בטבטה."
            : `${records.length} פריטים, מתוכם ${records.filter((r) => !r.value.trim()).length} עוד מחכים למילוי. גלוי רק למשפחה.`}
        </p>
        <button className="btn btn-glass" type="button" onClick={() => setAdding((v) => !v)}>
          <Plus size={16} />
          {adding ? "ביטול" : "הוספה"}
        </button>
      </div>

      {adding ? <AddRecordForm onDone={() => setAdding(false)} /> : null}

      {grouped.map(([key, items]) => (
        <section key={key}>
          <div className="section-head" style={{ marginBottom: 10 }}>
            <p className="eyebrow">
              {items[0].subject === "trip"
                ? subjectLabel(items[0].subject)
                : placeName.get(items[0].subjectId) ?? items[0].subjectId}
            </p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((record) => (
              <RecordCard key={record.id} record={record} onRemove={remove} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function PrivateVault() {
  return (
    <>
      <AuthLoading>
        <p className="lede">בודק כניסה…</p>
      </AuthLoading>

      <Unauthenticated>
        <div className="card" style={{ padding: 24, display: "grid", gap: 14, justifyItems: "start" }}>
          <span className="chip">
            <Lock size={14} />
            אזור פרטי
          </span>
          <h2 style={{ margin: 0 }}>צריך להיכנס</h2>
          <p className="lede" style={{ margin: 0 }}>
            כאן נשמרים קישורי הכרטיסים, אישורי ההזמנות, הכתובות וקודי הכניסה —
            דברים שלא נכנסים למסלול הפומבי. רק ארבעת בני המשפחה יכולים לראות אותם.
          </p>
          <Link className="btn btn-primary" href="/sign-in">
            <KeyRound size={16} />
            כניסה
          </Link>
        </div>
      </Unauthenticated>

      <Authenticated>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          {/* Sign-out destination is configured once on ClerkProvider (v7 moved it off this component). */}
          <UserButton />
        </div>
        <VaultList />
      </Authenticated>
    </>
  );
}
