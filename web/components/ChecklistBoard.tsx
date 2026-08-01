"use client";

import { useCallback, useMemo, useRef, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import {
  AlarmClock,
  Check,
  Download,
  ExternalLink,
  Flame,
  RotateCcw,
  Upload,
} from "lucide-react";
import type { ChecklistItem } from "@/lib/types";
import {
  checklistItems,
  checklistStorageKey,
  criticalItems,
  itemsByGroup,
} from "@/lib/checklist-data";
import { dueTone, formatDueHe } from "@/components/booking-gates";

type DoneMap = Record<string, boolean>;

/* --------------------------------------------------------- storage store */

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", emit);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", emit);
  };
}

function getRaw(): string {
  try {
    return window.localStorage.getItem(checklistStorageKey) ?? "";
  } catch {
    return "";
  }
}

function writeRaw(value: DoneMap) {
  try {
    window.localStorage.setItem(checklistStorageKey, JSON.stringify(value));
  } catch {
    /* storage full or blocked — nothing else we can do */
  }
  emit();
}

function parseRaw(raw: string): DoneMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return Object.fromEntries(parsed.map((id) => [String(id), true]));
    }
    if (parsed && typeof parsed === "object") {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([id, value]) => [
          id,
          Boolean(value),
        ]),
      );
    }
  } catch {
    /* corrupt payload — start clean */
  }
  return {};
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

export function ChecklistBoard() {
  const raw = useSyncExternalStore(subscribe, getRaw, () => "");
  const done = useMemo(() => parseRaw(raw), [raw]);
  const fileInput = useRef<HTMLInputElement>(null);
  const today = useMemo(() => new Date(), []);
  const groups = useMemo(() => itemsByGroup(), []);

  const setDone = useCallback((next: DoneMap) => writeRaw(next), []);

  const toggle = useCallback((id: string) => {
    const current = parseRaw(getRaw());
    writeRaw({ ...current, [id]: !current[id] });
  }, []);

  const completed = checklistItems.filter((item) => done[item.id]).length;
  const percent = Math.round((completed / checklistItems.length) * 100);
  const openCritical = criticalItems.filter((item) => !done[item.id]);

  const exportState = () => {
    const payload = JSON.stringify(
      { key: checklistStorageKey, savedAt: new Date().toISOString(), done },
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

  const importState = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { done?: DoneMap } | DoneMap;
      const next =
        parsed && typeof parsed === "object" && "done" in parsed && parsed.done
          ? parsed.done
          : (parsed as DoneMap);
      setDone(
        Object.fromEntries(
          Object.entries(next).map(([id, value]) => [id, Boolean(value)]),
        ),
      );
    } catch {
      /* ignore malformed files */
    }
  };

  return (
    <div className="prep-board">
      <div className="prep-bar">
        <div className="prep-bar-progress">
          <Ring percent={percent} />
          <div style={{ flex: 1 }}>
            <strong style={{ fontSize: 14 }}>
              {completed} מתוך {checklistItems.length} משימות
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => fileInput.current?.click()}
          >
            <Upload size={15} />
            ייבוא
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setDone({})}
            disabled={completed === 0}
          >
            <RotateCcw size={15} />
            איפוס
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importState(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

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
                  onClick={() => toggle(item.id)}
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

      {groups.map(({ group, items }) => {
        const groupDone = items.filter((item) => done[item.id]).length;
        const groupPercent = Math.round((groupDone / items.length) * 100);
        return (
          <section className="prep-group" key={group} data-reveal>
            <div className="prep-group-head">
              <h2>{group}</h2>
              <div
                style={{ alignItems: "center", display: "flex", gap: 10 }}
              >
                <small>
                  {groupDone}/{items.length}
                </small>
                <Ring percent={groupPercent} small />
              </div>
            </div>
            <ul className="prep-items">
              {items.map((item) => {
                const checked = Boolean(done[item.id]);
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
                      onClick={() => toggle(item.id)}
                    >
                      <Check size={16} />
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
