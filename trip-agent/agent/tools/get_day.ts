import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDaySection, ITINERARY_FILE, places, toCompact, TRIP_DAYS } from "../lib/trip";

export default defineTool({
  description: [
    `Get the full plan for a single trip day (1-${TRIP_DAYS}, where day 1 = Oct 1 2026 and day 17 = Oct 17 2026).`,
    `Returns that day's section from ${ITINERARY_FILE} — the canonical daily route —`,
    "plus the places pinned to that day. Use this for any 'what do we do on day N / on Oct X' question.",
  ].join(" "),
  inputSchema: z.object({
    day: z
      .number()
      .int()
      .min(1)
      .max(TRIP_DAYS)
      .describe("Trip day number. Day 1 = Oct 1, day N = Oct N."),
  }),
  execute({ day }) {
    const section = getDaySection(day);
    if (!section) {
      return {
        ok: false as const,
        error: `No section for day ${day} in ${ITINERARY_FILE}.`,
      };
    }

    return {
      ok: true as const,
      day,
      date: `2026-10-${String(day).padStart(2, "0")}`,
      source: ITINERARY_FILE,
      heading: section.heading,
      markdown: section.markdown,
      places: places.filter((p) => p.days.includes(day)).map(toCompact),
    };
  },
});
