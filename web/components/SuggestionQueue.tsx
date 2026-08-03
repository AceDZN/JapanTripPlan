"use client";

/**
 * The owner's review queue.
 *
 * This is the only place a change to the shared plan can actually be approved.
 * That is not a UI convenience — it is the security boundary. The eve agent
 * signs in with one shared family credential and cannot prove which person is
 * speaking, so it may only ever file a `pending` row. Here, Clerk has proved
 * who is signed in and `ConvexProviderWithClerk` forwards that JWT, so
 * `suggestions.approve` can check `role === "owner"` for real.
 *
 * The whole family can read the queue: knowing what has already been asked for
 * stops three people proposing the same thing. Only the owner gets buttons, and
 * `viewer.isOwner` comes from the server so the UI and the mutation agree on
 * who that is.
 */

import { useState } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Check, Clock, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/** What a structured suggestion is pointing at, in Hebrew. */
const CONTENT_TARGETS: Record<string, string> = {
  places: "מקום",
  days: "יום",
  blocks: "בלוק",
  checklistItems: "משימה",
};

/**
 * The target line for one suggestion.
 *
 * A `content` row has no `guideSlug` and no `dayN` — it names a table and a
 * key — so the original two-branch expression rendered "יום undefined" for it.
 */
function targetLabel(s: {
  targetKind: string;
  guideSlug?: string;
  dayN?: number;
  content?: { table: string; op: string; key?: string };
}): string {
  if (s.targetKind === "guide") return s.guideSlug ?? "מדריך";
  if (s.targetKind === "day") return `יום ${s.dayN}`;
  if (!s.content) return "שינוי בתוכנית";

  const what = CONTENT_TARGETS[s.content.table] ?? s.content.table;
  const verb = s.content.op === "create" ? "הוספה" : s.content.op === "delete" ? "הסרה" : "עדכון";
  return s.content.key ? `${verb} · ${what} ${s.content.key}` : `${verb} · ${what}`;
}

/**
 * Field-by-field view of a structured change.
 *
 * Same reason the guide diff exists below: without it the owner is approving a
 * one-line description of a change rather than the change. `fieldsJson` is
 * whatever was stored — it is rendered, never trusted, and a payload that will
 * not parse is said so rather than shown as an empty table.
 */
function ContentDiff({
  content,
}: {
  content: { table: string; op: string; key?: string; fieldsJson: string; unset?: string[] };
}) {
  let fields: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = JSON.parse(content.fieldsJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      fields = parsed as Record<string, unknown>;
    }
  } catch {
    fields = null;
  }

  const rows = Object.entries(fields ?? {});
  const cleared = content.unset ?? [];

  if (rows.length === 0 && cleared.length === 0) {
    return (
      <p className="muted">
        {fields === null
          ? "לא הצלחתי לקרוא את פרטי השינוי הזה — עדיף לדחות ולבקש שוב."
          : content.op === "delete"
            ? "הפריט יימחק כולו."
            : "אין שדות בשינוי הזה."}
      </p>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name}>
              <th>{name}</th>
              <td>{typeof value === "string" ? value : JSON.stringify(value)}</td>
            </tr>
          ))}
          {cleared.map((name) => (
            <tr key={`unset-${name}`}>
              <th>{name}</th>
              <td>
                <del>יימחק</del>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pending() {
  const viewer = useQuery(api.suggestions.viewer);
  const pending = useQuery(api.suggestions.listPending);
  const approve = useMutation(api.suggestions.approve);
  const reject = useMutation(api.suggestions.reject);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (viewer === undefined || pending === undefined) {
    return <p className="muted">טוען…</p>;
  }

  if (pending.length === 0) {
    return (
      <p className="muted">
        אין הצעות שממתינות להחלטה. שינוי שמישהו יבקש מ‑eve יופיע כאן.
      </p>
    );
  }

  /**
   * Run a decision, surfacing the server's refusal verbatim.
   *
   * The mutation can legitimately fail after the button is shown — a guide may
   * have changed under the suggestion, making the substring no longer unique.
   * That message is written to be actionable, so it is shown rather than
   * flattened into "something went wrong".
   */
  async function decide(id: Id<"suggestions">, action: "approve" | "reject") {
    setBusy(id);
    setError(null);
    try {
      if (action === "approve") await approve({ id });
      else await reject({ id });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      // Convex prefixes server errors with framing the family does not need.
      // `[\s\S]*` rather than the `s` flag: the tsconfig target predates it.
      setError(message.replace(/^[\s\S]*Uncaught Error:\s*/, "").split("\n")[0]);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      {error ? <p className="doc-note">{error}</p> : null}

      {pending.map((s) => (
        <article className="card" key={s.id}>
          <header className="card-head">
            <span className="eyebrow">
              <Clock size={13} />
              {targetLabel(s)}
            </span>
            <h3>{s.title}</h3>
            <p className="muted">הציע/ה: {s.proposedByName}</p>
          </header>

          {s.rationale ? <p>{s.rationale}</p> : null}

          {/* The actual diff. Without it the owner is approving a description
              of a change rather than the change, which is not a real review. */}
          {s.targetKind === "content" && s.content ? <ContentDiff content={s.content} /> : null}

          {s.oldString !== undefined ? (
            <div className="table-scroll">
              <table>
                <tbody>
                  <tr>
                    <th>לפני</th>
                    <td>
                      <del>{s.oldString}</del>
                    </td>
                  </tr>
                  <tr>
                    <th>אחרי</th>
                    <td>{s.newString}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          {s.needsManualApply ? (
            <p className="muted">
              זו הצעה ליום שלם, ולכן אישור שלה לא משנה את הנתונים לבד — צריך
              לבצע את השינוי אחרי האישור.
            </p>
          ) : null}

          {viewer.isOwner ? (
            <div className="row">
              <button
                className="btn btn-sm"
                disabled={busy === s.id}
                onClick={() => decide(s.id as Id<"suggestions">, "approve")}
                type="button"
              >
                <Check size={15} />
                לאשר
              </button>
              <button
                className="btn btn-glass btn-sm"
                disabled={busy === s.id}
                onClick={() => decide(s.id as Id<"suggestions">, "reject")}
                type="button"
              >
                <X size={15} />
                לדחות
              </button>
            </div>
          ) : (
            <p className="muted">רק אלכס יכול לאשר או לדחות שינויים בתוכנית.</p>
          )}
        </article>
      ))}
    </div>
  );
}

export function SuggestionQueue() {
  return (
    <>
      <AuthLoading>
        <p className="muted">בודק כניסה…</p>
      </AuthLoading>
      <Unauthenticated>
        <p className="muted">צריך להיכנס עם חשבון משפחתי כדי לראות את ההצעות.</p>
      </Unauthenticated>
      <Authenticated>
        <Pending />
      </Authenticated>
    </>
  );
}
