import type { City, Place } from "@/lib/types";

/* ---------------------------------------------------------------- geometry */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in meters. Accurate enough for walking scale. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Average walking pace used across the app: 80 meters per minute. */
export const WALK_METERS_PER_MINUTE = 80;

/** Above this we stop pretending walking is a good idea. */
export const WALK_LIMIT_M = 2000;

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    const rounded = meters < 100 ? Math.round(meters / 5) * 5 : Math.round(meters / 10) * 10;
    return `${rounded} מ׳`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ק״מ`;
}

/** Hebrew walking hint; suggests transit once the walk stops being sane. */
export function formatWalk(meters: number): string {
  if (meters > WALK_LIMIT_M) return "רחוק להליכה · עדיף רכבת";
  return `${walkMinutes(meters)} דק׳ הליכה`;
}

/* ---------------------------------------------------------------- views */

export type MapView = { center: [number, number]; zoom: number };

export const CITY_JUMPS: { id: string; label: string; view: MapView }[] = [
  { id: "tokyo", label: "טוקיו", view: { center: [35.6812, 139.7671], zoom: 11 } },
  { id: "kyoto", label: "קיוטו", view: { center: [34.9946, 135.7614], zoom: 12 } },
  { id: "osaka", label: "אוסקה", view: { center: [34.6659, 135.4991], zoom: 12 } },
  { id: "kamakura", label: "קמקורה", view: { center: [35.3092, 139.5065], zoom: 13 } },
];

/** Whole-trip default view: Kanto and Kansai both on screen. */
export const JAPAN_VIEW: MapView = { center: [35.3, 137.6], zoom: 7 };

/* ---------------------------------------------------------------- areas */

export type AreaOption = {
  id: string;
  label: string;
  city: City;
  lat: number;
  lng: number;
  count: number;
};

/**
 * Neighborhood centers derived from our own data, so the manual "I'm near…"
 * picker always offers areas that actually hold places.
 */
export function buildAreaOptions(all: Place[]): AreaOption[] {
  const groups = new Map<string, { city: City; lat: number; lng: number; count: number }>();

  for (const place of all) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
    const key = `${place.city}|${place.area}`;
    const current = groups.get(key);
    if (current) {
      current.lat += place.lat;
      current.lng += place.lng;
      current.count += 1;
    } else {
      groups.set(key, { city: place.city, lat: place.lat, lng: place.lng, count: 1 });
    }
  }

  return Array.from(groups.entries())
    .map(([key, value]) => ({
      id: key,
      label: key.slice(key.indexOf("|") + 1),
      city: value.city,
      lat: value.lat / value.count,
      lng: value.lng / value.count,
      count: value.count,
    }))
    .filter((option) => option.count >= 2)
    .sort((a, b) => b.count - a.count);
}

/** Google Maps walking directions for a raw coordinate (non-Place targets). */
export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}
