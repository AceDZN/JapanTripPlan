import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { TripDay } from "@/lib/trip-data";
import type { ChecklistItem, Place } from "@/lib/types";

// Legacy sources — the hand-maintained files this migration replaces. They
// stay wired up behind the flag below so a bad deploy is one env var away from
// being undone, and they are deleted only once everything is proven green.
import { tripDays as legacyDays } from "@/lib/trip-data";
import { places as legacyPlaces } from "@/lib/trip-data";
import { checklistGroups as legacyGroups, checklistItems as legacyItems } from "@/lib/checklist-data";

/**
 * Server-side read layer: where does the trip come from?
 *
 * `TRIP_SOURCE=generated` falls back to the pre-migration hand-maintained
 * modules. Anything else (including unset) reads Convex, which is the real
 * source of truth.
 *
 * This exists so Phase 3 is reversible. Once the site has run on Convex
 * through a full test pass, the legacy branch and its imports go away.
 *
 * Server-only by construction: `fetchQuery`/`preloadQuery` come from
 * `convex/nextjs`. Client components receive data as props or via
 * `usePreloadedQuery`, never by importing this module.
 */
const useConvex = process.env.TRIP_SOURCE !== "generated";

export function tripSource(): "convex" | "generated" {
  return useConvex ? "convex" : "generated";
}

export async function getTripDays(): Promise<TripDay[]> {
  if (!useConvex) return legacyDays;
  return (await fetchQuery(api.trip.listDays, {})) as unknown as TripDay[];
}

export async function getTripDay(n: number): Promise<TripDay | null> {
  if (!useConvex) return legacyDays.find((day) => day.day === n) ?? null;
  return (await fetchQuery(api.trip.getDay, { n })) as unknown as TripDay | null;
}

export async function getPlaces(): Promise<Place[]> {
  if (!useConvex) return legacyPlaces;
  return (await fetchQuery(api.trip.listPlaces, {})) as unknown as Place[];
}

/**
 * Places plus the lookups pages need.
 *
 * `trip-data.ts` exposed `placesById` / `getPlaces` / `getPlacesForDay` as
 * module-scope constants over a static array. Those become one fetch plus
 * local indexing, so a page pays for the places once per render instead of
 * per lookup.
 */
export async function getPlaceIndex() {
  const places = await getPlaces();
  const byId = new Map(places.map((place) => [place.id, place]));

  return {
    places,
    byId,
    /** Resolve ids in order, dropping any that no longer exist. */
    get: (ids: string[]): Place[] =>
      ids.map((id) => byId.get(id)).filter((place): place is Place => Boolean(place)),
    forDay: (n: number): Place[] => places.filter((place) => place.days.includes(n)),
  };
}

export type GuideSummary = {
  slug: string;
  file: string;
  title: string;
  description: string;
  category: string;
  generated: boolean;
};

export async function getGuides(): Promise<GuideSummary[]> {
  return await fetchQuery(api.trip.listGuides, {});
}

export async function getGuide(slug: string) {
  return await fetchQuery(api.trip.getGuide, { slug });
}

export type ChecklistPayload = {
  groups: string[];
  items: ChecklistItem[];
  /** Shared, family-wide progress. Empty until Phase 4 starts writing it. */
  state: Record<string, { done: boolean; doneAt?: number; doneBy?: string }>;
};

export async function getChecklist(): Promise<ChecklistPayload> {
  if (!useConvex) {
    return { groups: [...legacyGroups], items: legacyItems, state: {} };
  }
  return (await fetchQuery(api.trip.listChecklist, {})) as unknown as ChecklistPayload;
}

/**
 * Preloaded handles for client components that need live data.
 *
 * `preloadQuery` renders on the server (so the HTML is complete and the
 * service worker can cache a usable page for offline Japan) and hands the
 * client a handle that `usePreloadedQuery` upgrades to a live subscription.
 * Offline, the client simply keeps the server snapshot.
 */
export function preloadPlaces() {
  return preloadQuery(api.trip.listPlaces, {});
}

export function preloadDays() {
  return preloadQuery(api.trip.listDays, {});
}

export function preloadChecklist() {
  return preloadQuery(api.trip.listChecklist, {});
}
