import type { ChecklistItem, TripDay } from "@/lib/types";

/**
 * Date maths for the trip, as pure functions over a day list.
 *
 * These are the Convex-era versions of the helpers in `trip-data.ts`, which
 * closed over the module-scope `tripDays` array. Here the days are passed in,
 * because they now arrive from a query.
 *
 * Deliberately NOT Convex functions: the guidelines are explicit that a query
 * must not read the wall clock, since queries are not re-run just because time
 * passes and a `Date.now()` inside one would cache a stale "today" forever.
 * "Which day is it" is a property of the request, so it is computed here, on
 * the server, per render.
 *
 * Behaviour is copied exactly from the originals, including the asymmetry
 * where `isDuringTrip` runs to Oct 18 (the flight home) while
 * `todayTripDay` stops at Oct 17.
 */

export const TRIP_START = "2026-10-01";
export const TRIP_END = "2026-10-17";
const TRIP_END_INCLUSIVE = "2026-10-18";

/** Local-date key (YYYY-MM-DD) for a Date, without UTC drift. */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The trip day matching `now`, or null when we are outside Oct 1–17 2026. */
export function todayTripDay(days: TripDay[], now: Date): TripDay | null {
  const key = dateKey(now);
  if (key < TRIP_START || key > TRIP_END) return null;
  return days.find((entry) => entry.date === key) ?? null;
}

export function isDuringTrip(now: Date): boolean {
  const key = dateKey(now);
  return key >= TRIP_START && key <= TRIP_END_INCLUSIVE;
}

export function daysUntilTrip(now: Date): number {
  const start = new Date(`${TRIP_START}T00:00:00`);
  const today = new Date(`${dateKey(now)}T00:00:00`);
  return Math.round((start.getTime() - today.getTime()) / 86400000);
}

/* ------------------------------------------- checklist items on a trip day */

/**
 * The dates a checklist item should surface on, as `[from, to]` — or null when
 * it has no deadline at all and therefore belongs nowhere in particular.
 *
 * `doFrom` widens the window backwards; without it the window is the single
 * `due` date. See the field's comment in `convex/schema.ts` for why a task
 * needs to be able to say "from the 2nd, by the 3rd" rather than just "by the
 * 3rd".
 *
 * A `doFrom` later than `due` is treated as no window rather than an empty one:
 * it is a data error, and silently hiding the task would be the worst possible
 * response to a task somebody flagged as time-critical.
 */
export function taskWindow(item: ChecklistItem): [string, string] | null {
  if (!item.due) return null;
  const from = item.doFrom && item.doFrom <= item.due ? item.doFrom : item.due;
  return [from, item.due];
}

/** Does this item's window cover `date` (YYYY-MM-DD)? */
export function taskCoversDate(item: ChecklistItem, date: string): boolean {
  const window = taskWindow(item);
  if (!window) return false;
  return date >= window[0] && date <= window[1];
}

/**
 * The items to show on one trip day, most urgent first.
 *
 * "Urgent" is the due date, not the window start: two tasks visible on the same
 * day should be ordered by which runs out first. Critical items win ties, and
 * `order` breaks the rest so the sequence is stable rather than incidental.
 */
export function tasksForDate(items: ChecklistItem[], date: string): ChecklistItem[] {
  return items
    .filter((item) => taskCoversDate(item, date))
    .sort((a, b) => {
      if (a.due !== b.due) return (a.due ?? "").localeCompare(b.due ?? "");
      if (Boolean(a.critical) !== Boolean(b.critical)) return a.critical ? -1 : 1;
      return 0;
    });
}

/**
 * Which trip days an item lands on, for the "יום 2 · יום 3" chips on /prepare.
 *
 * Returns [] for the great majority of the checklist, whose deadlines fall
 * before the trip starts.
 */
export function tripDaysForTask(days: TripDay[], item: ChecklistItem): TripDay[] {
  const window = taskWindow(item);
  if (!window) return [];
  return days.filter((day) => day.date >= window[0] && day.date <= window[1]);
}
