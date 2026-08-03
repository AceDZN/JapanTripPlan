import type { Place } from "@/lib/types";

/**
 * Hebrew display labels and URL builders.
 *
 * What is here and what is NOT is the whole point of this file. It holds
 * PRESENTATION for the trip's fixed vocabulary — the six cities, the eleven
 * place categories, the six booking statuses — all of which are closed unions
 * defined in `convex/schema.ts` and none of which is trip content. Adding a
 * category means changing the schema and this file together, in one commit.
 *
 * It holds NO trip data. Days, places, blocks, checklist items and guides all
 * come from Convex, through `lib/trip-source.ts`. That rule is why
 * `lib/trip-data.ts` and `lib/checklist-data.ts` are gone: they mixed three
 * thousand lines of itinerary in with these thirty lines of vocabulary, so
 * every component that wanted a Hebrew word for "gaming" dragged a stale copy
 * of the whole trip in behind it.
 */

export const cityLabels: Record<string, string> = {
  tokyo: "טוקיו",
  kyoto: "קיוטו",
  osaka: "אוסקה",
  kamakura: "קמקורה",
  uji: "אוג׳י",
  other: "בדרך",
};

export const placeCategoryLabels: Record<string, string> = {
  attraction: "אטרקציה",
  food: "אוכל",
  shopping: "קניות",
  nature: "טבע",
  culture: "תרבות",
  gaming: "גיימינג",
  kawaii: "קוואי",
  viewpoint: "תצפית",
  stay: "לינה",
  transport: "תחבורה",
  event: "אירוע",
};

export const bookingStatusLabels: Record<string, string> = {
  booked: "מוזמן",
  "buy-now": "לקנות עכשיו",
  "on-sale-soon": "מכירה נפתחת",
  lottery: "הגרלה",
  monitor: "במעקב",
  fallback: "גיבוי",
};

/**
 * October climate normals for the three base cities.
 *
 * Historical averages, not a forecast — they do not change between now and the
 * trip, and there is nothing to fetch. A live forecast would be a different
 * feature with a different source.
 */
export const weatherCities = [
  { city: "טוקיו", high: "22.0°", low: "14.8°", rain: "234.8 מ״מ" },
  { city: "קיוטו", high: "23.4°", low: "14.4°", rain: "143.2 מ״מ" },
  { city: "אוסקה", high: "23.7°", low: "16.0°", rain: "136.0 מ״מ" },
];

/**
 * The retired localStorage key for checklist ticks.
 *
 * Progress is shared through Convex now (`checklistState`), so this exists
 * only so `ChecklistBoard` can find a device's leftover local ticks, offer to
 * merge them in, and clear the key. Delete it once nobody is running a browser
 * that still holds one.
 */
export const checklistStorageKey = "japan2026.checklist.v1";

export function mapsSearchUrl(place: Place): string {
  const query = place.mapsQuery ?? place.nameEn;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsDirectionsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`;
}
