import Link from "next/link";
import { AlarmClock, ClipboardCheck, ExternalLink, Flame } from "lucide-react";
import type { ChecklistPayload } from "@/lib/trip-source";
import { tasksForDate } from "@/lib/trip-time";
import { formatDueHe } from "@/components/booking-gates";
import { DayTaskCheck, DayTasksSignIn } from "@/components/DayTaskCheck";

/**
 * The preparation tasks that belong to THIS day, tickable from the day page.
 *
 * ## Why the day page and not just /prepare
 *
 * /prepare is the pre-trip view: fifty-odd tasks grouped by theme, read while
 * sitting at home in August. It is the wrong surface for "collect the Pixar
 * tickets from a 7-Eleven", because that task is invisible among fifty others
 * until precisely the two days when it is the only thing that matters — and on
 * those days nobody is reading a themed checklist, they are reading the day.
 *
 * It is the SAME item and the SAME shared state as /prepare, not a copy, so a
 * tick in either place is immediately true in both. A second list would be a
 * second answer to "did anyone do this", which is the one question a shared
 * checklist exists to prevent.
 *
 * ## The window, not the deadline
 *
 * A task shows on every trip day between `doFrom` and `due` rather than only on
 * `due`. Collecting tickets on arrival evening beats collecting them on the
 * morning you need them, and a panel that only ever appears on the last
 * possible day actively teaches the family to cut it fine.
 *
 * ## Server component
 *
 * The day page is dynamic (`fetchQuery` reads per request), so the whole panel
 * renders on the server — including who ticked what. Only the tick box itself
 * is a client component, because only the tick box writes. See
 * `DayTaskCheck.tsx`.
 */
export function DayTasks({
  date,
  checklist,
}: {
  /** The day's ISO date — the window is matched against this, not against now. */
  date: string;
  checklist: ChecklistPayload;
}) {
  const tasks = tasksForDate(checklist.items, date);

  // Most days have nothing to prepare, and an empty panel on fourteen of the
  // seventeen days would teach everyone to ignore this corner of the page.
  if (tasks.length === 0) return null;

  const open = tasks.filter((task) => !checklist.state[task.id]?.done).length;

  return (
    <section className="panel day-tasks" data-reveal>
      <h2>
        <ClipboardCheck size={16} />
        להכין ליום הזה
      </h2>
      <p className="day-tasks-lede">
        {open > 0 ? `${open} מתוך ${tasks.length} עוד פתוחות. ` : "הכול סומן. "}
        מתוך <Link className="text-link" href="/prepare">רשימת ההכנות</Link>, וסימון
        כאן נשמר לכל המשפחה.
      </p>

      <ul className="day-tasks-list">
        {tasks.map((task) => {
          const done = Boolean(checklist.state[task.id]?.done);
          const who = checklist.state[task.id]?.doneBy;
          // "by the 3rd" is noise on the 3rd itself; on the 2nd it is the point.
          const earlyStart = Boolean(task.due && task.due !== date);
          return (
            <li className={`day-task${task.critical ? " is-critical" : ""}`} key={task.id}>
              <DayTaskCheck itemSlug={task.id} done={done} title={task.title} />
              <div className="day-task-body">
                <div className="day-task-title">{task.title}</div>
                {task.detail ? <p className="day-task-detail">{task.detail}</p> : null}
                <div className="prep-tags">
                  {task.critical ? (
                    <span className="due due-critical">
                      <Flame size={12} />
                      קריטי
                    </span>
                  ) : null}
                  {earlyStart ? (
                    <span className="due due-soon">
                      <AlarmClock size={12} />
                      אפשר כבר היום · עד {formatDueHe(task.due!)}
                    </span>
                  ) : null}
                  {done && who ? (
                    <span className="due due-done">סומן על ידי {who}</span>
                  ) : null}
                  {task.url ? (
                    <a
                      className="text-link"
                      href={task.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 12 }}
                    >
                      לאתר הרשמי
                      <ExternalLink size={12} />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <DayTasksSignIn />
    </section>
  );
}
