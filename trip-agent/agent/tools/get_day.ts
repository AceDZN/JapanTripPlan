import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDaySection, ITINERARY_FILE, toCompact, TRIP_DAYS } from "../lib/trip";
import { getLiveDay, getPlaces } from "../lib/content";

/**
 * One trip day, structured and live.
 *
 * This used to return a Markdown section sliced out of the baked itinerary
 * guide. Two things were wrong with that. It was a build-time snapshot, so a
 * block moved this morning read the old way; and prose has no block ids, so
 * nothing downstream — `edit_content` in particular — could point at "that
 * block" and change it.
 *
 * The markdown is still returned alongside, because it carries the connective
 * writing the structured rows do not: why this order, what to cut if it rains,
 * the sentence about the stairs at Nippori. When Convex is unreachable it is
 * the only thing returned, and the reply says so.
 */
export default defineTool({
  description: [
    `Get the full plan for a single trip day (1-${TRIP_DAYS}, where day 1 = Oct 1 2026 and day 17 = Oct 17 2026).`,
    "Returns the day's structured blocks — each with an `id`, time, title, detail, booking, costs and",
    "warnings — plus the places pinned to that day, and the day's prose section from",
    `${ITINERARY_FILE} for the reasoning behind the order.`,
    "",
    "Use this for any 'what do we do on day N / on Oct X' question, and ALWAYS before editing a",
    "block: edit_content addresses a block by the `id` returned here, which cannot be guessed.",
  ].join(" "),
  inputSchema: z.object({
    day: z
      .number()
      .int()
      .min(1)
      .max(TRIP_DAYS)
      .describe("Trip day number. Day 1 = Oct 1, day N = Oct N."),
  }),
  async execute({ day }) {
    const [live, { places, stale }] = await Promise.all([getLiveDay(day), getPlaces()]);
    const section = getDaySection(day);

    if (!live) {
      // No structured read: the guide prose is all there is. Say so plainly —
      // the model must not offer to edit blocks it cannot address.
      if (!section) {
        return {
          ok: false as const,
          error: `Could not read day ${day} from Convex, and ${ITINERARY_FILE} has no section for it.`,
        };
      }
      return {
        ok: true as const,
        day,
        date: `2026-10-${String(day).padStart(2, "0")}`,
        source: ITINERARY_FILE,
        stale: true,
        staleNote:
          "לא הצלחתי לקרוא את הנתונים החיים של היום הזה — זה מהעותק השמור. " +
          "אי אפשר לערוך בלוקים במצב הזה.",
        heading: section.heading,
        markdown: section.markdown,
        places: places.filter((p) => p.days.includes(day)).map(toCompact),
      };
    }

    return {
      ok: true as const,
      day: live.day,
      date: live.date,
      dateHe: live.dateHe,
      title: live.title,
      area: live.area,
      theme: live.theme,
      city: live.city,
      highlights: live.highlights,
      note: live.note,
      rainPlan: live.rainPlan,
      stay: live.stay,
      blocks: live.blocks,
      places: places.filter((p) => p.days.includes(day)).map(toCompact),
      ...(stale ? { placesStale: true } : {}),
      // The prose that explains the day, when the guide still has a section for
      // it. Secondary to `blocks` — those are the data the app renders.
      ...(section
        ? {
            narrative: {
              source: ITINERARY_FILE,
              heading: section.heading,
              markdown: section.markdown,
            },
          }
        : {}),
    };
  },
});
