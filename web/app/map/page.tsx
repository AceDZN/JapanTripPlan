import type { Metadata } from "next";
import { TripMap } from "@/components/TripMap";
import { mapPlaces } from "@/lib/trip-data";

export const metadata: Metadata = {
  title: "מפת הטיול",
  description: "כל התחנות, הערים והאטרקציות המרכזיות על מפת יפן.",
};

export default function MapPage() {
  return (
    <div className="map-page">
      <header className="map-heading">
        <p>טוקיו וטודורוקי · קמקורה · קיוטו · אוסקה</p>
        <h1>המסע על המפה</h1>
      </header>
      <TripMap places={mapPlaces} />
    </div>
  );
}
