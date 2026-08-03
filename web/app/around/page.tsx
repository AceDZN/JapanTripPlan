import type { Metadata } from "next";
import { AroundExplorer } from "@/components/map/AroundExplorer";
import { preloadDays, preloadPlaces } from "@/lib/trip-source";

export const metadata: Metadata = {
  title: "מה יש סביבי",
  description:
    "כל מקומות המסע ממוינים לפי מרחק הליכה מהמיקום שלכם, עם גילויים חיים מהסביבה וניווט ישיר ב־Google Maps.",
};

/**
 * Places and days are preloaded on the server rather than fetched in the
 * client: the HTML then ships complete, so the service worker can cache a page
 * that still works on a Kyoto pavement with no signal, and the client upgrades
 * the same data to a live subscription once it hydrates.
 */
export default async function AroundPage() {
  const [places, days] = await Promise.all([preloadPlaces(), preloadDays()]);
  return <AroundExplorer preloadedPlaces={places} preloadedDays={days} />;
}
