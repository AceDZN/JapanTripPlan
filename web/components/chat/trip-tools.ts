import { tool } from "ai";
import { z } from "zod";
import { aiContext } from "@/app/generated/ai-context";
import { bookingStatusLabels } from "@/lib/labels";
import { routeChapters } from "@/lib/route-chapters";
import { bookingGates } from "@/components/booking-gates";
import type { ChecklistItem, Place, TripDay } from "@/lib/types";

/**
 * Tools for the FALLBACK chat — the in-app AI SDK agent that answers when the
 * eve agent is switched off (`/api/agent/enabled`).
 *
 * Everything here is built PER REQUEST from Convex, via `createTripTools`.
 * It used to close over `trip-data.ts` / `checklist-data.ts` at module scope,
 * which meant this assistant answered from a snapshot of the itinerary frozen
 * at build time: a block moved in Convex an hour ago was still described the
 * old way, confidently, with no way for anyone to tell.
 *
 * The cost of building the closures per request is a few hundred microseconds
 * against a request that is about to spend seconds in a model. The cost of the
 * old arrangement was the assistant being quietly wrong.
 */

export type TripSnapshot = {
  days: TripDay[];
  places: Place[];
  checklist: {
    groups: string[];
    items: ChecklistItem[];
    /** Shared family progress, keyed by item id. */
    state: Record<string, { done: boolean; doneAt?: number; doneBy?: string }>;
  };
};

/**
 * A ~20 line summary injected into the system prompt so trivial questions
 * ("כמה ימים בקיוטו?", "מה יש ביום 9?") are answered without a tool round-trip.
 * Anything beyond the headline requires a tool call.
 *
 * The lodging bases used to be four hand-typed Hebrew lines here — a fifth
 * copy of the route, after `trip-data.ts`, the itinerary page and the guides.
 * They are derived from the days' `stay` now, so a base that moves moves here.
 */
export function tripDigest(days: TripDay[]): string {
  return [
    "לוח 17 הימים (יום · תאריך · אזור · כותרת):",
    ...[...days]
      .sort((a, b) => a.day - b.day)
      .map((day) => `${day.day} · ${day.shortDate} · ${day.area} · ${day.title}`),
    "",
    "בסיסי לינה:",
    ...routeChapters(days).map(
      (chapter) => `- ${chapter.dates} · ${chapter.label}`,
    ),
  ].join("\n");
}

/* ========================================================================== */
/* Tools                                                                       */
/* ========================================================================== */

const GUIDE_FILES = aiContext.map((entry) => entry.file);

const readGuide = tool({
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

function makeGetDay({ days, places }: TripSnapshot) {
  const placesById = new Map(places.map((place) => [place.id, place]));
  return tool({
  description:
    "Get the full structured plan for one trip day (1–17): date, area, theme, time blocks with details, booking links and statuses, the note, the rain plan and highlights. Use for any question about a specific day or date between Oct 1 and Oct 18 2026.",
  inputSchema: z.object({
    day: z.number().int().min(1).max(17).describe("Trip day number, 1 = Oct 1 2026"),
  }),
  execute: async ({ day }) => {
    const found = days.find((entry) => entry.day === day);
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
          .map((id) => placesById.get(id))
          .filter((place): place is Place => Boolean(place))
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
}

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

function makeSearchPlaces({ places }: TripSnapshot) {
  return tool({
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
}

function makeGetChecklist({ checklist }: TripSnapshot) {
  const { groups: checklistGroups, items: checklistItems } = checklist;
  // `checklist` itself stays in scope for the shared done-state lookup below.
  return tool({
  description: [
    "Get pre-trip checklist items with their groups, deadlines, links, critical flags and whether they are DONE.",
    "Completion is shared across the whole family and is included here as `done` (with `doneBy` when known), so you may state plainly what is and is not finished.",
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
        done: checklist.state[item.id]?.done ?? false,
        doneBy: checklist.state[item.id]?.doneBy,
      })),
    };
  },
  });
}

function makeGetBookingGates({ days, checklist }: TripSnapshot) {
  return tool({
  description:
    "List every booking gate for the trip — the things that must be reserved, entered in a lottery, or bought on a specific on-sale date — with status, deadline, day and booking URL. Use for 'what still needs booking', 'what are we at risk of missing', 'when do tickets open'.",
  inputSchema: z.object({
    openOnly: z
      .boolean()
      .optional()
      .describe("true = exclude gates already marked booked"),
  }),
  execute: async ({ openOnly }) => {
    const gates = bookingGates(days, checklist.items).filter(
      (gate) => !openOnly || gate.status !== "booked",
    );
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
}

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

function makeNearbyPlaces({ places }: TripSnapshot) {
  return tool({
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
}

/** Bind every tool to one request's snapshot of the trip. */
export function createTripTools(trip: TripSnapshot) {
  return {
    readGuide,
    getDay: makeGetDay(trip),
    searchPlaces: makeSearchPlaces(trip),
    getChecklist: makeGetChecklist(trip),
    getBookingGates: makeGetBookingGates(trip),
    nearbyPlaces: makeNearbyPlaces(trip),
  };
}
