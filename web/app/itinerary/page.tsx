import type { Metadata } from "next";
import { DayPlanner } from "@/components/DayPlanner";
import { tripDays } from "@/lib/trip-data";

export const metadata: Metadata = {
  title: "המסלול היומי",
  description: "17 ימים מדויקים של אנימה, גיימינג, ראמן, קוואי וחוויות משפחתיות ביפן.",
};

export default function ItineraryPage() {
  return (
    <div className="page-surface">
      <header className="page-heading itinerary-heading">
        <p>1–17 באוקטובר 2026</p>
        <h1>המסלול שלנו, יום אחרי יום</h1>
        <span>
          כל יום עבר את מבחן המשפחה: משחק, פאנדום, טעם, וואו או קוואי. בוחרים
          יום ורואים את העוגנים והגיבויים.
        </span>
      </header>
      <DayPlanner days={tripDays} />
    </div>
  );
}
