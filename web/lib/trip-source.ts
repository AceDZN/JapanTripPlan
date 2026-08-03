import { fetchQuery, preloadQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { ChecklistItem, Place, TripDay } from "@/lib/types";

/**
 * Server-side read layer: the trip comes from Convex, and only from Convex.
 *
 * There used to be a `TRIP_SOURCE=generated` escape hatch here that read the
 * hand-maintained `trip-data.ts` / `places.json` / `checklist-data.ts` instead.
 * It is gone, along with those files. Keeping it meant keeping a second full
 * copy of the itinerary in the repo that no longer agreed with the first — the
 * home page's booking gates were still being computed from it — and a rollback
 * switch that silently serves stale data is worse than no rollback switch. The
 * real safety net is `convex/trip.ts:exportGuides` plus the `JAPAN2026/*.md`
 * export: the trip can always be rendered back out to git-tracked files.
 *
 * Server-only by construction: `fetchQuery`/`preloadQuery` come from
 * `convex/nextjs`. Client components receive data as props or via
 * `usePreloadedQuery`, never by importing this module.
 */

export async function getTripDays(): Promise<TripDay[]> {
  return (await fetchQuery(api.trip.listDays, {})) as unknown as TripDay[];
}

export async function getTripDay(n: number): Promise<TripDay | null> {
  return (await fetchQuery(api.trip.getDay, { n })) as unknown as TripDay | null;
}

export async function getPlaces(): Promise<Place[]> {
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
  /** Cover photo, once one is attached; the category fallback covers the rest. */
  hero?: { storageId: string; url: string; alt?: string };
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
  /** Shared, family-wide progress — replaces the per-device localStorage map. */
  state: Record<string, { done: boolean; doneAt?: number; doneBy?: string }>;
};

export async function getChecklist(): Promise<ChecklistPayload> {
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
