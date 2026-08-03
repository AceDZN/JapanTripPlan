import { defineTool } from "eve/tools";
import { z } from "zod";
import { matchesQuery, toCompact, TRIP_DAYS } from "../lib/trip";
import { getPlaces } from "../lib/content";

const MAX_RESULTS = 15;

const categories = [
  "attraction",
  "food",
  "shopping",
  "nature",
  "culture",
  "gaming",
  "kawaii",
  "viewpoint",
  "stay",
  "transport",
  "event",
] as const;

const cities = ["tokyo", "kyoto", "osaka", "kamakura", "uji", "other"] as const;

export default defineTool({
  description: [
    "Search the trip's place database (154 curated places: attractions, food, shopping, gaming, kawaii, stays, transport).",
    "The query matches Hebrew and English names, descriptions and areas as a substring, so short Hebrew words work well.",
    `All filters are optional and combine with AND. Returns at most ${MAX_RESULTS} compact results.`,
  ].join(" "),
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Free text in Hebrew or English, e.g. 'ראמן', 'pokemon', 'חתולים'."),
    category: z.enum(categories).optional().describe("Filter by place category."),
    city: z.enum(cities).optional().describe("Filter by city."),
    day: z
      .number()
      .int()
      .min(1)
      .max(TRIP_DAYS)
      .optional()
      .describe("Only places scheduled on this trip day."),
    plannedOnly: z
      .boolean()
      .optional()
      .describe("true = only places already in the itinerary; false = only nearby extras."),
  }),
  async execute({ query, category, city, day, plannedOnly }) {
    const { places, stale } = await getPlaces();

    const matches = places.filter((place) => {
      if (query && !matchesQuery(place, query)) return false;
      if (category && place.category !== category) return false;
      if (city && place.city !== city) return false;
      if (day !== undefined && !place.days.includes(day)) return false;
      if (plannedOnly !== undefined && place.planned !== plannedOnly) return false;
      return true;
    });

    // Itinerary places and must-dos first, then the rest, so a truncated list
    // still leads with what the family actually booked.
    const ranked = [...matches].sort((a, b) => {
      const score = (p: typeof a) => (p.planned ? 2 : 0) + (p.mustDo ? 1 : 0);
      return score(b) - score(a);
    });

    return {
      ok: true as const,
      total: matches.length,
      returned: Math.min(matches.length, MAX_RESULTS),
      truncated: matches.length > MAX_RESULTS,
      // Only present when Convex was unreachable and this came from the baked
      // bundle. Say so rather than asserting details that may have moved.
      ...(stale
        ? { stale: true, staleNote: "לא הצלחתי להתחבר לנתונים החיים — זה מהעותק השמור, ייתכן שהשתנה." }
        : {}),
      results: ranked.slice(0, MAX_RESULTS).map(toCompact),
    };
  },
});
