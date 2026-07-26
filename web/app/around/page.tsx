import type { Metadata } from "next";
import { AroundExplorer } from "@/components/map/AroundExplorer";

export const metadata: Metadata = {
  title: "מה יש סביבי",
  description:
    "כל מקומות המסע ממוינים לפי מרחק הליכה מהמיקום שלכם, עם גילויים חיים מהסביבה וניווט ישיר ב־Google Maps.",
};

export default function AroundPage() {
  return <AroundExplorer />;
}
