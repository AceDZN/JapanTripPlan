import { tool } from "ai";
import { z } from "zod";
import { aiContext } from "@/app/generated/ai-context";
import { bookingStatusLabels, places, placesById, tripDays } from "@/lib/trip-data";
import { checklistItems, checklistGroups } from "@/lib/checklist-data";
import { bookingGates } from "@/components/booking-gates";
import type { Place } from "@/lib/types";

/* ========================================================================== */
/* Always-in-context digest                                                    */
/* ========================================================================== */

const STAY_BASES = [
  "2–11 באוקטובר · טוקיו (בסיס אחד)",
  "11–13 באוקטובר · קיוטו",
  "13–15 באוקטובר · אוסקה",
  "15–17 באוקטובר · טוקיו (סיבוב שני)",
];

/**
 * A ~20 line summary injected into the system prompt so trivial questions
 * ("כמה ימים בקיוטו?", "מה יש ביום 9?") are answered without a tool round-trip.
 * Anything beyond the headline requires a tool call.
 */
export const TRIP_DIGEST = [
  "לוח 17 הימים (יום · תאריך · אזור · כותרת):",
  ...tripDays.map(
    (day) => `${day.day} · ${day.shortDate} · ${day.area} · ${day.title}`,
  ),
  "",
  "בסיסי לינה:",
  ...STAY_BASES.map((line) => `- ${line}`),
].join("\n");

/* ========================================================================== */
/* Tools                                                                       */
/* ========================================================================== */

const GUIDE_FILES = aiContext.map((entry) => entry.file);

export const readGuide = tool({
  description: [
    "Read one full planning guide (markdown). These documents are the source of truth for the trip.",
    "Use it whenever the answer needs detail the digest does not contain — prices, transport passes, booking rules, food picks, packing.",
    `Valid file values: ${GUIDE_FILES.join(", ")}.`,
    "Guide topics: 00 overview/booking gates · 01 flights · 02 accommodation · 03 transport & passes · 04 anime/Pokémon/Ghibli · 05 food · 06 day trips · 07 bar mitzvah · 08 practical tips · 09 the canonical daily itinerary · 10 budget · 11 pre-trip checklist.",
  ].join(" "),
  inputSchema: z.object({
    file: z.enum(GUIDE_FILES as [string, ...string[]]).describe("Exact guide file name"),
  }),
  execute: async ({ file }) => {
    const entry = aiContext.find((doc) => doc.file === file);
    if (!entry) {
      return { error: `Unknown guide "${file}". Valid values: ${GUIDE_FILES.join(", ")}` };
    }
    return { file: entry.file, title: entry.title, markdown: entry.markdown };
  },
});

export const getDay = tool({
  description:
    "Get the full structured plan for one trip day (1–17): date, area, theme, time blocks with details, booking links and statuses, the note, the rain plan and highlights. Use for any question about a specific day or date between Oct 1 and Oct 18 2026.",
  inputSchema: z.object({
    day: z.number().int().min(1).max(17).describe("Trip day number, 1 = Oct 1 2026"),
  }),
  execute: async ({ day }) => {
    const found = tripDays.find((entry) => entry.day === day);
    if (!found) return { error: `No such day: ${day}. Valid days are 1–17.` };

    return {
      day: found.day,
      date: found.date,
      dateHe: found.dateHe,
      title: found.title,
      area: found.area,
      theme: found.theme,
      city: found.city,
      highlights: found.highlights,
      note: found.note,
      rainPlan: found.rainPlan,
      blocks: found.blocks.map((block) => ({
        time: block.time,
        title: block.title,
        detail: block.detail,
        cutFirst: block.cutFirst,
        places: block.placeIds
          .map((id) => placesById[id])
          .filter(Boolean)
          .map((place) => ({ id: place.id, name: place.nameHe, area: place.area })),
        booking: block.booking
          ? {
              label: block.booking.label,
              url: block.booking.url,
              status: block.booking.status,
              statusHe: bookingStatusLabels[block.booking.status] ?? block.booking.status,
            }
          : undefined,
      })),
    };
  },
});

const MAX_PLACE_RESULTS = 15;

function summarisePlace(place: Place) {
  return {
    id: place.id,
    name: place.nameHe,
    nameEn: place.nameEn,
    category: place.category,
    area: place.area,
    city: place.city,
    days: place.days,
    planned: place.planned,
    description: place.descriptionHe,
    tips: place.tips,
    indoor: place.indoor,
    mapsUrl: place.mapsQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.mapsQuery)}`
      : undefined,
  };
}

export const searchPlaces = tool({
  description: [
    "Search the trip's place database (150 entries): planned stops plus curated nearby extras.",
    "Filter by free-text query (matches Hebrew/English name, description and area), category, city, or trip day.",
    "Use for 'where can we eat near X', 'what arcades are in Akihabara', 'what is indoor on day 7'.",
    `Returns at most ${MAX_PLACE_RESULTS} results.`,
  ].join(" "),
  inputSchema: z.object({
    query: z.string().optional().describe("Free-text match on name, description or area"),
    category: z
      .enum([
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
      ])
      .optional(),
    city: z.enum(["tokyo", "kyoto", "osaka", "kamakura", "uji", "other"]).optional(),
    day: z.number().int().min(1).max(17).optional().describe("Only places scheduled on this day"),
    plannedOnly: z
      .boolean()
      .optional()
      .describe("true = only stops already in the itinerary; false/omitted = include extras"),
    indoorOnly: z.boolean().optional().describe("true = only rain-friendly indoor places"),
  }),
  execute: async ({ query, category, city, day, plannedOnly, indoorOnly }) => {
    const needle = query?.trim().toLowerCase();

    const matches = places.filter((place) => {
      if (category && place.category !== category) return false;
      if (city && place.city !== city) return false;
      if (day && !place.days.includes(day)) return false;
      if (plannedOnly && !place.planned) return false;
      if (indoorOnly && !place.indoor) return false;
      if (!needle) return true;
      return [place.nameHe, place.nameEn, place.descriptionHe, place.area, place.tips ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return {
      total: matches.length,
      truncated: matches.length > MAX_PLACE_RESULTS,
      results: matches.slice(0, MAX_PLACE_RESULTS).map(summarisePlace),
    };
  },
});

export const getChecklist = tool({
  description: [
    "Get pre-trip checklist items with their groups, deadlines, links and critical flags.",
    "IMPORTANT: completion state is stored only in the family's browser (localStorage) and is NOT visible to you.",
    "Never claim an item is done or not done — describe what is on the list and when it is due, and tell the family to check the הכנות page for their own ticks.",
    `Groups: ${checklistGroups.join(" · ")}.`,
  ].join(" "),
  inputSchema: z.object({
    group: z.string().optional().describe("Exact Hebrew group title to filter by"),
    criticalOnly: z.boolean().optional().describe("true = only items flagged critical"),
    withDeadlineOnly: z.boolean().optional().describe("true = only items that have a due date"),
  }),
  execute: async ({ group, criticalOnly, withDeadlineOnly }) => {
    const matches = checklistItems.filter((item) => {
      if (group && item.group !== group) return false;
      if (criticalOnly && !item.critical) return false;
      if (withDeadlineOnly && !item.due) return false;
      return true;
    });

    return {
      note: "Completion state lives in the user's localStorage and is unknown server-side.",
      total: matches.length,
      groups: checklistGroups,
      items: matches.slice(0, 40).map((item) => ({
        id: item.id,
        group: item.group,
        title: item.title,
        detail: item.detail,
        due: item.due,
        url: item.url,
        critical: item.critical,
      })),
    };
  },
});

export const getBookingGates = tool({
  description:
    "List every booking gate for the trip — the things that must be reserved, entered in a lottery, or bought on a specific on-sale date — with status, deadline, day and booking URL. Use for 'what still needs booking', 'what are we at risk of missing', 'when do tickets open'.",
  inputSchema: z.object({
    openOnly: z
      .boolean()
      .optional()
      .describe("true = exclude gates already marked booked"),
  }),
  execute: async ({ openOnly }) => {
    const gates = bookingGates().filter((gate) => !openOnly || gate.status !== "booked");
    return {
      total: gates.length,
      gates: gates.map((gate) => ({
        title: gate.title,
        detail: gate.detail,
        status: gate.status,
        statusHe: bookingStatusLabels[gate.status] ?? gate.status,
        day: gate.day,
        due: gate.due,
        url: gate.url,
        critical: gate.critical,
      })),
    };
  },
});

/** Haversine distance in metres. Inlined so the tool stays worker-safe. */
function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const nearbyPlaces = tool({
  description:
    "Rank trip places by real distance from a latitude/longitude, with walking-time estimates (80 m/min). Use when the family says where they are, or asks what is near a place you already looked up with searchPlaces.",
  inputSchema: z.object({
    lat: z.number().describe("Latitude"),
    lng: z.number().describe("Longitude"),
    limit: z.number().int().min(1).max(15).optional().describe("How many results (default 8)"),
    maxMeters: z.number().int().positive().optional().describe("Ignore places farther than this"),
  }),
  execute: async ({ lat, lng, limit, maxMeters }) => {
    const ranked = places
      .map((place) => ({
        place,
        meters: Math.round(distanceMeters(lat, lng, place.lat, place.lng)),
      }))
      .filter((entry) => !maxMeters || entry.meters <= maxMeters)
      .sort((a, b) => a.meters - b.meters)
      .slice(0, limit ?? 8);

    return {
      from: { lat, lng },
      results: ranked.map(({ place, meters }) => ({
        ...summarisePlace(place),
        meters,
        walkMinutes: Math.max(1, Math.round(meters / 80)),
      })),
    };
  },
});

export const tripTools = {
  readGuide,
  getDay,
  searchPlaces,
  getChecklist,
  getBookingGates,
  nearbyPlaces,
};
