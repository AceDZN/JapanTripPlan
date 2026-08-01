import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/MapExplorer";
import { preloadDays, preloadPlaces } from "@/lib/trip-source";

export const metadata: Metadata = {
  title: "מפת הטיול",
  description:
    "כל תחנות המסע על מפה אחת: סינון לפי קטגוריה ולפי יום, מסלולי ימים, הפתעות שכנות וניווט ישיר.",
};

/** Server-preloaded for the same offline reason as /around — see that page. */
export default async function MapPage() {
  const [places, days] = await Promise.all([preloadPlaces(), preloadDays()]);
  return <MapExplorer preloadedPlaces={places} preloadedDays={days} />;
}
