"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { Preloaded, useConvexAuth, useMutation, usePreloadedQuery } from "convex/react";
import {
  AlarmClock,
  Check,
  Download,
  ExternalLink,
  Flame,
  Loader2,
  LogIn,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { ChecklistItem } from "@/lib/types";
import { checklistStorageKey } from "@/lib/labels";
import { dueTone, formatDueHe } from "@/components/booking-gates";

/**
 * The pre-trip checklist, shared across the family.
 *
 * ## Why this is not localStorage any more
 *
 * It used to be: a `DoneMap` in `window.localStorage`, with export/import
 * buttons as the sharing mechanism — you mailed yourself a JSON file. That made
 * four people keep four different answers to "did anyone book the insurance
 * yet", which is the one question a shared checklist exists to answer.
 *
 * Progress now lives in Convex `checklistState` (see `convex/checklist.ts`),
 * so a tick on one phone is a tick on all of them, and it carries who did it.
 *
 * ## Reading is public, ticking is not
 *
 * `listChecklist` is a public query — the whole trip is, so the page can be
 * server-rendered and precached for offline use in Japan. `setDone` goes
 * through `requireFamily()`. So a signed-out visitor sees the real state and
 * cannot change it, rather than being handed a private scratchpad that looks
 * like the family's list but is not.
 *
 * ## The device-migration button
 *
 * Anyone who ticked things before this change still has them in localStorage,
 * where nothing will ever read them again. Rather than dropping that silently,
 * a signed-in member is offered a one-shot merge of the ticks their device
 * holds that the shared list does not. It only ever adds.
 */

type DoneState = Record<string, { done: boolean; doneAt?: number; doneBy?: string }>;

type ChecklistPayload = {
  groups: string[];
  items: ChecklistItem[];
  state: DoneState;
};

/* ------------------------------------------- the ticks this device still holds */

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", emit);
  };
}

function getLegacyRaw(): string {
  try {
    return window.localStorage.getItem(checklistStorageKey) ?? "";
  } catch {
    return "";
  }
}

function clearLegacy() {
  try {
    window.localStorage.removeItem(checklistStorageKey);
  } catch {
    /* blocked — the merge still succeeded, the prompt just comes back */
  }
  emit();
}

/** Slugs this device once ticked. Tolerates both payload shapes we ever wrote. */
function parseLegacy(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => Boolean(value))
        .map(([id]) => id);
    }
  } catch {
    /* corrupt payload — treat as empty */
  }
  return [];
}

function Ring({ percent, small = false }: { percent: number; small?: boolean }) {
  return (
    <div
      className={`ring${small ? " ring-sm" : ""}`}
      style={{ "--pct": percent } as CSSProperties}
      role="img"
      aria-label={`${percent}% הושלמו`}
    >
      <span>{percent}%</span>
    </div>
  );
}

function DueBadge({ item, today }: { item: ChecklistItem; today: Date }) {
  if (!item.due) return null;
  const tone = dueTone(item.due, today);
  const label =
    tone === "past" ? `עבר התאריך · ${formatDueHe(item.due)}` : `עד ${formatDueHe(item.due)}`;
  return (
    <span className={`due due-${tone}`}>
      <AlarmClock size={12} />
      {label}
    </span>
  );
}

export function ChecklistBoard({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.trip.listChecklist>;
}) {
  const data = usePreloadedQuery(preloaded) as unknown as ChecklistPayload;
  const { isAuthenticated } = useConvexAuth();
  const setDone = useMutation(api.checklist.setDone);

  const today = useMemo(() => new Date(), []);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const { items, state } = data;
  const isDone = useCallback((id: string) => Boolean(state[id]?.done), [state]);

  const groups = useMemo(
    () =>
      data.groups.map((group) => ({
        group,
        items: items.filter((item) => item.group === group),
      })),
    [data.groups, items],
  );

  const completed = items.filter((item) => isDone(item.id)).length;
  const percent = items.length ? Math.round((completed / items.length) * 100) : 0;
  const openCritical = items.filter((item) => item.critical && !isDone(item.id));

  const toggle = useCallback(
    async (id: string) => {
      if (!isAuthenticated) return;
      setPending((current) => new Set(current).add(id));
      try {
        await setDone({ itemSlug: id, done: !isDone(id) });
      } finally {
        setPending((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
      }
    },
    [isAuthenticated, isDone, setDone],
  );

  /* ---------------------------------------------------- legacy device ticks */

  const legacyRaw = useSyncExternalStore(subscribe, getLegacyRaw, () => "");
  const orphaned = useMemo(() => {
    const known = new Set(items.map((item) => item.id));
    return parseLegacy(legacyRaw).filter((id) => known.has(id) && !state[id]?.done);
  }, [legacyRaw, items, state]);

  const mergeDevice = async () => {
    setMerging(true);
    try {
      for (const id of orphaned) {
        await setDone({ itemSlug: id, done: true });
      }
      clearLegacy();
    } finally {
      setMerging(false);
    }
  };

  const exportState = () => {
    const payload = JSON.stringify(
      {
        savedAt: new Date().toISOString(),
        done: Object.fromEntries(
          items.filter((item) => isDone(item.id)).map((item) => [item.id, state[item.id]]),
        ),
      },
      null,
      2,
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "japan2026-checklist.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { done?: Record<string, unknown> };
      const known = new Set(items.map((item) => item.id));
      const ids = Object.entries(parsed.done ?? parsed)
        .filter(([id, value]) => known.has(id) && Boolean(value))
        .map(([id]) => id);
      for (const id of ids) {
        if (!isDone(id)) await setDone({ itemSlug: id, done: true });
      }
    } catch {
      /* malformed file — nothing to do */
    }
  };

  return (
    <div className="prep-board">
      <div className="prep-bar">
        <div className="prep-bar-progress">
          <Ring percent={percent} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>
              {completed} מתוך {items.length} משימות
            </strong>
            <div className="progress-track" style={{ marginTop: 8 }}>
              <i style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
        <div className="prep-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={exportState}>
            <Download size={15} />
            ייצוא
          </button>
          {isAuthenticated ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} />
                ייבוא
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importFile(file);
                  event.target.value = "";
                }}
              />
            </>
          ) : null}
        </div>
      </div>

      {isAuthenticated ? (
        <p className="prep-shared">
          <Users size={13} />
          הרשימה משותפת — סימון כאן נשמר לכל המשפחה בכל המכשירים.
        </p>
      ) : (
        <p className="prep-shared">
          <LogIn size={13} />
          זו ההתקדמות המשותפת של המשפחה.{" "}
          <Link className="text-link" href="/sign-in">
            להתחבר
          </Link>{" "}
          כדי לסמן משימות.
        </p>
      )}

      {isAuthenticated && orphaned.length > 0 ? (
        <div className="pinned" style={{ marginTop: 14 }}>
          <span className="eyebrow">
            <Upload size={14} />
            סימונים ישנים במכשיר הזה
          </span>
          <p style={{ margin: "8px 0 12px" }}>
            נמצאו {orphaned.length} סימונים ששמורים רק בדפדפן הזה, מלפני שהרשימה הפכה
            משותפת. אפשר להעביר אותם לרשימה המשפחתית — זה רק מוסיף, אף סימון קיים לא
            נמחק.
          </p>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void mergeDevice()}
            disabled={merging}
          >
            {merging ? <Loader2 size={15} className="spin" /> : <Upload size={15} />}
            להעביר לרשימה המשותפת
          </button>
        </div>
      ) : null}

      {openCritical.length > 0 ? (
        <section className="pinned" style={{ marginTop: 18 }} data-reveal>
          <span className="eyebrow">
            <Flame size={14} />
            קריטי — לא נסגר מעצמו
          </span>
          <ul className="prep-items" style={{ marginTop: 12 }}>
            {openCritical.slice(0, 5).map((item) => (
              <li className="prep-item is-critical" key={`pin-${item.id}`}>
                <button
                  type="button"
                  className="prep-check"
                  aria-pressed={false}
                  aria-label={`סימון: ${item.title}`}
                  disabled={!isAuthenticated || pending.has(item.id)}
                  onClick={() => void toggle(item.id)}
                >
                  <Check size={16} />
                </button>
                <div>
                  <div className="prep-title">{item.title}</div>
                </div>
                <div className="prep-tags">
                  <DueBadge item={item} today={today} />
                  {item.url ? (
                    <a
                      className="text-link"
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      לאתר הרשמי
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {groups.map(({ group, items: groupItems }) => {
        const groupDone = groupItems.filter((item) => isDone(item.id)).length;
        const groupPercent = groupItems.length
          ? Math.round((groupDone / groupItems.length) * 100)
          : 0;
        return (
          <section className="prep-group" key={group} data-reveal>
            <div className="prep-group-head">
              <h2>{group}</h2>
              <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                <small>
                  {groupDone}/{groupItems.length}
                </small>
                <Ring percent={groupPercent} small />
              </div>
            </div>
            <ul className="prep-items">
              {groupItems.map((item) => {
                const checked = isDone(item.id);
                const who = state[item.id]?.doneBy;
                return (
                  <li
                    className={`prep-item${item.critical ? " is-critical" : ""}${
                      checked ? " is-done" : ""
                    }`}
                    key={item.id}
                  >
                    <button
                      type="button"
                      className="prep-check"
                      aria-pressed={checked}
                      aria-label={`סימון: ${item.title}`}
                      disabled={!isAuthenticated || pending.has(item.id)}
                      onClick={() => void toggle(item.id)}
                    >
                      {pending.has(item.id) ? (
                        <Loader2 size={15} className="spin" />
                      ) : (
                        <Check size={16} />
                      )}
                    </button>
                    <div className="prep-title">{item.title}</div>
                    {item.detail ? <p className="prep-detail">{item.detail}</p> : null}
                    <div className="prep-tags">
                      <DueBadge item={item} today={today} />
                      {item.critical ? (
                        <span className="due due-critical">
                          <Flame size={12} />
                          קריטי
                        </span>
                      ) : null}
                      {checked && who ? <span className="due due-done">סומן על ידי {who}</span> : null}
                      {item.url ? (
                        <a
                          className="text-link"
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: 12 }}
                        >
                          לאתר הרשמי
                          <ExternalLink size={12} />
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
