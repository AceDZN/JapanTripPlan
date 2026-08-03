import { cityLabels } from "@/lib/labels";
import type { TripDay } from "@/lib/types";

export type RouteChapter = {
  /** City key. Kept for styling and keys; the picture comes from `image`. */
  city: string;
  /**
   * The chapter's photo — the hero of the last day in it.
   *
   * Replaces a hand-written `cityImages` map pointing at four files in
   * `public/images/cities/`. Those files were the last content images not in
   * Convex, and the map meant nine Tokyo days shared one photo of a skyline
   * nobody on this trip will stand in.
   */
  image?: string;
  /** Hebrew city name. */
  label: string;
  /** "2–11.10" — check-in day to check-out day, as a person reads it. */
  dates: string;
  days: number[];
};

/**
 * The trip's four chapters, derived from where we sleep.
 *
 * This used to be a hand-written array in `trip-data.ts` that had to be
 * re-typed whenever the plan moved — and by the time it was deleted it had
 * already drifted: it put day 15 (the Uji day) in the Osaka chapter, although
 * that night is spent at the last Tokyo base.
 *
 * Grouping by `stay` rather than by `city` is what makes four chapters come
 * out of seventeen days. Cities alone give six: day 7 is Kamakura and day 15
 * is Uji, both day trips that break the Tokyo and Osaka runs in half without
 * anyone changing accommodation. A chapter is a base, not a prefecture — which
 * is also what the page copy has always said it was.
 *
 * Days with no stay attach to the chapter they follow, so day 17 (flying home,
 * no bed) still appears under the final Tokyo chapter instead of vanishing off
 * the itinerary page. Day 1 has no preceding chapter and is excluded, exactly
 * as the hand-written version excluded it: it is spent entirely in the air.
 */
export function routeChapters(days: TripDay[]): RouteChapter[] {
  const ordered = [...days].sort((a, b) => a.day - b.day);
  const byNumber = new Map(ordered.map((day) => [day.day, day]));

  const runs: { base: string; days: number[] }[] = [];

  for (const day of ordered) {
    // `placeId`, not `label`. Day 1's stay is real data — "לילה באוויר, ET672
    // בדרך לנריטה" — but it is a seat, not a base: it has no place row because
    // there is nowhere to be. Keying on the label would make the flight its own
    // chapter and turn four into five.
    const base = day.stay?.placeId;
    const current = runs[runs.length - 1];

    // No bed on the ground tonight: this day belongs to the chapter in
    // progress, if there is one. Day 1 has none, so it drops out — which is
    // what the hand-written chapters did too.
    if (!base) {
      current?.days.push(day.day);
      continue;
    }

    if (current && current.base === base) current.days.push(day.day);
    else runs.push({ base, days: [day.day] });
  }

  return runs.map((run) => {
    const firstDay = byNumber.get(run.days[0]);
    const lastDay = byNumber.get(run.days[run.days.length - 1]);
    // Check-out is the morning after the last night — that is the range a
    // person reads off a booking, so nine nights at Tabata reads "2–11.10".
    const checkout = byNumber.get((lastDay?.day ?? 0) + 1) ?? lastDay;

    // The city comes from the chapter's LAST day, not its first: the day we
    // travel to a new base is usually still labelled with the city we left,
    // and "chapter 2 is Kyoto" should not depend on which end you read from.
    const city = lastDay?.city ?? "other";

    return {
      city,
      label: cityLabels[city] ?? city,
      image: lastDay?.heroImage || firstDay?.heroImage,
      dates: dateRange(firstDay?.shortDate, checkout?.shortDate),
      days: run.days,
    };
  });
}

/**
 * "2.10" + "11.10" -> "2–11.10". The month is said once when it is the same
 * month, which is how the range has always read on the page and how a person
 * says it out loud.
 */
function dateRange(from = "", to = ""): string {
  const month = (value: string) => value.slice(value.indexOf("."));
  if (from && to && month(from) === month(to)) {
    return `${from.slice(0, from.indexOf("."))}–${to}`;
  }
  return `${from}–${to}`;
}
