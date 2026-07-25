"use client";

import {
  Check,
  ChevronDown,
  ExternalLink,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  categoryLabels,
  preparationTasks,
  type PreparationCategory,
} from "@/lib/preparation-data";

const storageKey = "japan-2026-preparation-completed";
type Filter = PreparationCategory | "all";

export function PreparationPlanner() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(stored)) setCompleted(new Set(stored));
    } catch {
      // A malformed local preference should never block the checklist.
    }
  }, []);

  const filteredTasks = useMemo(
    () =>
      filter === "all"
        ? preparationTasks
        : preparationTasks.filter((task) => task.category === filter),
    [filter],
  );

  const percent = Math.round((completed.size / preparationTasks.length) * 100);

  function toggleTask(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }

  function resetProgress() {
    setCompleted(new Set());
    localStorage.removeItem(storageKey);
  }

  return (
    <section className="prep-workspace" aria-labelledby="prep-list-title">
      <div className="prep-progress">
        <div>
          <span>התקדמות במכשיר הזה</span>
          <strong>
            {completed.size} / {preparationTasks.length}
          </strong>
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={preparationTasks.length}
          aria-valuenow={completed.size}
          aria-label={`${percent}% מהמשימות הושלמו`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <button type="button" onClick={resetProgress} disabled={!completed.size}>
          <RotateCcw size={15} />
          איפוס
        </button>
      </div>

      <div className="prep-toolbar">
        <div>
          <p className="section-label">WHAT · WHEN · WHERE</p>
          <h2 id="prep-list-title">רשימת ההכנות</h2>
        </div>
        <div className="prep-filters" aria-label="סינון משימות">
          {(Object.keys(categoryLabels) as Filter[]).map((key) => (
            <button
              type="button"
              className={filter === key ? "active" : ""}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              key={key}
            >
              {categoryLabels[key]}
            </button>
          ))}
        </div>
      </div>

      <div className="prep-table">
        <div className="prep-table-heading" aria-hidden="true">
          <span>בוצע</span>
          <span>מה עושים</span>
          <span>מתי</span>
          <span>איפה / איך</span>
          <span>מי</span>
        </div>
        {filteredTasks.map((task) => {
          const isDone = completed.has(task.id);
          return (
            <article
              className={isDone ? "completed" : ""}
              data-priority={task.priority}
              key={task.id}
            >
              <button
                className="prep-check"
                type="button"
                onClick={() => toggleTask(task.id)}
                aria-label={`${isDone ? "סימון כלא הושלם" : "סימון כהושלם"}: ${task.title}`}
                aria-pressed={isDone}
              >
                {isDone && <Check size={17} />}
              </button>
              <div className="prep-task-title">
                <small>{categoryLabels[task.category]}</small>
                <strong>{task.title}</strong>
              </div>
              <div className="prep-cell" data-label="מתי">
                <span>{task.timing}</span>
              </div>
              <div className="prep-cell prep-where" data-label="איפה / איך">
                <span>{task.where}</span>
                {task.href && (
                  <a href={task.href} target="_blank" rel="noreferrer">
                    מקור רשמי
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="prep-cell" data-label="מי">
                <span>{task.owner}</span>
              </div>
            </article>
          );
        })}
      </div>

      <details className="prep-completion-rule">
        <summary>
          מתי משימה באמת נחשבת גמורה?
          <ChevronDown size={18} />
        </summary>
        <p>
          רכישה מסתיימת רק כשהאישור שמור אופליין. אפליקציה מסתיימת רק אחרי
          התקנה, התחברות ובדיקה. נעל מסתיימת רק אחרי הליכה ארוכה בלי נקודות לחץ.
        </p>
      </details>
    </section>
  );
}
