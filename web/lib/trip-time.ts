import type { TripDay } from "@/lib/trip-data";

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
