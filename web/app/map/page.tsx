import type { Metadata } from "next";
import { MapExplorer } from "@/components/map/MapExplorer";

export const metadata: Metadata = {
  title: "מפת הטיול",
  description:
    "כל תחנות המסע על מפה אחת: סינון לפי קטגוריה ולפי יום, מסלולי ימים, הפתעות שכנות וניווט ישיר.",
};

export default function MapPage() {
  return <MapExplorer />;
}
