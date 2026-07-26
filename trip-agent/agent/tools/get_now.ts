// What time is it, and where are we in the trip?
//
// The concierge is used on the phone, mid-trip, so "now" matters constantly:
// "מה נשאר לנו היום", "מתי צריך לצאת", "זה עוד פתוח". The model has no clock of
// its own, so it has to ask for one. Server clock + Intl only — no dependencies,
// no network.
//
// Both timezones are returned on purpose: the family is Israeli (Asia/Jerusalem
// is what they feel) but the plan is written in Japan local time (Asia/Tokyo).
// Trip day numbers follow the canonical itinerary, which is Japan-local:
// day 1 = Oct 1 2026 ... day 17 = Oct 17 2026, with Oct 18 the flight home.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { TRIP_DAYS } from "../lib/trip";

const TOKYO = "Asia/Tokyo";
const JERUSALEM = "Asia/Jerusalem";

/** Trip day 1 is Oct 1 2026 (Japan-local calendar date). */
const FIRST_DAY = { year: 2026, month: 10, day: 1 };
/** Landing back in Israel. */
const RETURN_DAY = { year: 2026, month: 10, day: 18 };

type CalendarDate = { year: number; month: number; day: number };

function calendarDate(now: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** Days between two calendar dates, via UTC midnights (no DST drift). */
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

function describe(now: Date, timeZone: string) {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(now)
    .replace(", ", "T");

  const offset =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "";

  return {
    timeZone,
    /** "2026-10-05T14:32" in that zone. */
    localIso: iso,
    utcOffset: offset,
    /** e.g. "יום שני, 5 באוקטובר 2026" */
    dateHe: new Intl.DateTimeFormat("he-IL", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now),
    /** e.g. "14:32" */
    timeHe: new Intl.DateTimeFormat("he-IL", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
  };
}

export default defineTool({
  description: [
    "Get the current date and time — in Japan (Asia/Tokyo) and in Israel (Asia/Jerusalem) — and which",
    "trip day today is. The model has no clock, so call this for anything that depends on 'now':",
    "what is left to do today, whether a place is still open, how long until an event, what day of the",
    "week it is, how many days remain before the trip.",
    "Trip days follow the canonical itinerary in Japan local time: day 1 = Oct 1 2026, day 17 = Oct 17 2026.",
    "Combine with get_day once you know the day number. This is a clock, not a location — for where the",
    "family is, use the context line the app sends, or ask.",
  ].join(" "),

  inputSchema: z.object({}),

  execute() {
    const now = new Date();
    const tokyo = describe(now, TOKYO);
    const jerusalem = describe(now, JERUSALEM);

    const today = calendarDate(now, TOKYO);
    const offsetFromStart = daysBetween(FIRST_DAY, today);
    const daysToReturn = daysBetween(today, RETURN_DAY);

    let tripDay: number | null = null;
    let phase: string;

    if (offsetFromStart < 0) {
      const until = -offsetFromStart;
      phase = `לפני הטיול — נשארו ${until} ימים ליציאה (1 באוקטובר 2026).`;
    } else if (offsetFromStart < TRIP_DAYS) {
      tripDay = offsetFromStart + 1;
      phase = `יום ${tripDay} מתוך ${TRIP_DAYS} בטיול.`;
    } else if (daysToReturn === 0) {
      phase = "יום החזרה הביתה — הנחיתה בישראל ב-18 באוקטובר 2026.";
    } else {
      phase = "אחרי הטיול.";
    }

    return {
      ok: true as const,
      japan: tokyo,
      israel: jerusalem,
      utcIso: now.toISOString(),
      tripDay,
      tripDays: TRIP_DAYS,
      phase,
      note:
        "מספר יום הטיול נקבע לפי התאריך ביפן, כמו במסלול הקנוני. לפרטי היום עצמו יש להשתמש ב-get_day.",
    };
  },
});
