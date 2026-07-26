import type { Place, PlaceCategory } from "@/lib/types";
import { distanceMeters, type LatLng } from "@/components/map/geo";

/**
 * Live "what is literally around me" discovery via the public Overpass API.
 *
 * Etiquette: one request per rounded location cell, a hard client timeout, a
 * 24h localStorage cache and no polling whatsoever. Any failure is swallowed —
 * the curated list from places.json is the product, this is a bonus layer.
 */

export type Discovery = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Hebrew label, e.g. "בית קפה". */
  kindHe: string;
  /** Mapped onto our palette/glyph vocabulary. */
  category: PlaceCategory;
};

export const DISCOVERY_RADIUS_M = 600;

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const CACHE_PREFIX = "japan2026.around.overpass.v1:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RESULTS = 40;

type OverpassTags = Record<string, string>;
type OverpassElement = {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OverpassTags;
};

const KIND_MAP: { match: (tags: OverpassTags) => boolean; kindHe: string; category: PlaceCategory }[] = [
  { match: (t) => t.shop === "anime", kindHe: "חנות אנימה", category: "kawaii" },
  { match: (t) => t.shop === "video_games", kindHe: "חנות משחקים", category: "gaming" },
  { match: (t) => t.shop === "toys", kindHe: "חנות צעצועים", category: "shopping" },
  { match: (t) => t.tourism === "museum", kindHe: "מוזיאון", category: "culture" },
  { match: (t) => t.tourism === "gallery", kindHe: "גלריה", category: "culture" },
  { match: (t) => t.tourism === "viewpoint", kindHe: "נקודת תצפית", category: "viewpoint" },
  { match: (t) => t.tourism === "attraction", kindHe: "אטרקציה", category: "attraction" },
  { match: (t) => t.leisure === "park", kindHe: "פארק", category: "nature" },
  { match: (t) => t.amenity === "ice_cream", kindHe: "גלידה", category: "food" },
  { match: (t) => t.amenity === "cafe", kindHe: "בית קפה", category: "food" },
  { match: (t) => t.amenity === "restaurant", kindHe: "מסעדה", category: "food" },
];

function buildQuery(origin: LatLng, radius: number): string {
  const around = `around:${radius},${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
  const clauses = [
    `node(${around})["tourism"~"^(attraction|museum|viewpoint|gallery)$"]["name"];`,
    `way(${around})["tourism"~"^(attraction|museum|viewpoint|gallery)$"]["name"];`,
    `node(${around})["leisure"="park"]["name"];`,
    `way(${around})["leisure"="park"]["name"];`,
    `node(${around})["amenity"~"^(cafe|restaurant|ice_cream)$"]["name"];`,
    `node(${around})["shop"~"^(anime|video_games|toys)$"]["name"];`,
    `way(${around})["shop"~"^(anime|video_games|toys)$"]["name"];`,
  ];
  return `[out:json][timeout:20];(${clauses.join("")});out center 80;`;
}

/** ~110m grid — small enough to stay relevant, big enough to hit the cache. */
function cellKey(origin: LatLng): string {
  return `${CACHE_PREFIX}${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}`;
}

function readCache(key: string): Discovery[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: Discovery[] };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return Array.isArray(parsed.items) ? parsed.items : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, items: Discovery[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), items }));
  } catch {
    /* quota or private mode — discovery simply won't be cached */
  }
}

const NON_WORD = /[^a-z0-9֐-׿]/g;

function normalizeName(value: string): string {
  return value.toLowerCase().replace(NON_WORD, "");
}

/** Drops anything that is really one of our own places under a different name. */
function dedupe(items: Discovery[], ours: Place[]): Discovery[] {
  const ourNames = new Set(
    ours.flatMap((place) => [normalizeName(place.nameEn), normalizeName(place.nameHe)]),
  );

  return items.filter((item) => {
    const name = normalizeName(item.name);
    for (const place of ours) {
      const gap = distanceMeters(item, place);
      if (gap < 70) return false;
      if (gap < 250 && name && ourNames.has(name)) return false;
    }
    return true;
  });
}

function toDiscovery(element: OverpassElement): Discovery | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const name = tags["name:en"] ?? tags.name;
  if (lat === undefined || lng === undefined || !name) return null;

  const entry = KIND_MAP.find((candidate) => candidate.match(tags));
  if (!entry) return null;

  return {
    id: `osm-${element.type}-${element.id}`,
    name,
    lat,
    lng,
    kindHe: entry.kindHe,
    category: entry.category,
  };
}

/**
 * Returns nearby OSM points of interest, or an empty list on any failure.
 * Never throws.
 */
export async function fetchDiscoveries(
  origin: LatLng,
  ourPlaces: Place[],
  radius = DISCOVERY_RADIUS_M,
): Promise<Discovery[]> {
  if (typeof window === "undefined") return [];

  const key = cellKey(origin);
  const cached = readCache(key);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(buildQuery(origin, radius))}`,
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { elements?: OverpassElement[] };
    const raw = (payload.elements ?? [])
      .map(toDiscovery)
      .filter((item): item is Discovery => item !== null);

    const seen = new Set<string>();
    const unique = raw.filter((item) => {
      const fingerprint = `${normalizeName(item.name)}|${item.lat.toFixed(4)}`;
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    });

    const result = dedupe(unique, ourPlaces)
      .sort((a, b) => distanceMeters(origin, a) - distanceMeters(origin, b))
      .slice(0, MAX_RESULTS);

    writeCache(key, result);
    return result;
  } catch {
    return [];
  } finally {
    window.clearTimeout(timer);
  }
}
