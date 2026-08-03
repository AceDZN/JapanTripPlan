import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  haversineMeters,
  mapsDirectionsUrl,
  toCompact,
  walkingMinutes,
} from "../lib/trip";
import { getPlaces } from "../lib/content";

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 15;

export default defineTool({
  description: [
    "Find the trip's curated places closest to a coordinate, nearest first.",
    "Use it for 'what's around us right now' questions when the family shares their location.",
    "Each result includes straight-line distance, a rough walking-time estimate and a Google Maps walking-directions link.",
  ].join(" "),
  inputSchema: z.object({
    lat: z.number().min(-90).max(90).describe("Latitude of the current position."),
    lng: z.number().min(-180).max(180).describe("Longitude of the current position."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_LIMIT)
      .optional()
      .describe(`How many places to return (default ${DEFAULT_LIMIT}).`),
  }),
  async execute({ lat, lng, limit }) {
    const origin = { lat, lng };
    const take = limit ?? DEFAULT_LIMIT;
    const { places, stale } = await getPlaces();

    const ranked = places
      .map((place) => {
        const meters = Math.round(haversineMeters(origin, place));
        return {
          ...toCompact(place),
          distanceMeters: meters,
          walkingMinutes: walkingMinutes(meters),
          directionsUrl: mapsDirectionsUrl(origin, place),
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, take);

    return {
      ok: true as const,
      origin,
      returned: ranked.length,
      note: "Distances are straight-line; walking time assumes 80 m/min.",
      ...(stale
        ? { stale: true, staleNote: "לא הצלחתי להתחבר לנתונים החיים — זה מהעותק השמור." }
        : {}),
      results: ranked,
    };
  },
});
