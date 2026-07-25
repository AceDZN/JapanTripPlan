import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { tripGuides } from "@/app/generated/trip-content";
import { guideImages } from "@/lib/trip-data";

export const metadata: Metadata = {
  title: "מדריכי הטיול",
  description: "כל מסמכי התכנון של יפן 2026 במקום אחד.",
};

export default function GuidesPage() {
  return (
    <div className="page-surface guides-page">
      <header className="page-heading guides-heading">
        <p>מתעדכן ישירות מה־Markdown</p>
        <h1>מחברת המסע</h1>
        <span>
          כל המידע העמוק — הזמנות, אוכל, תחבורה, אנימה, תקציב וטיפים — בלי
          לנהל תוכן פעמיים.
        </span>
      </header>

      <div className="guides-grid">
        {tripGuides.map((guide, index) => (
          <Link href={`/guide/${guide.slug}`} key={guide.slug}>
            <img
              src={guideImages[guide.category]}
              alt=""
              loading="lazy"
            />
            <div className="guide-index">{String(index + 1).padStart(2, "0")}</div>
            <div className="guide-card-copy">
              <span>
                <FileText size={14} />
                {guide.file}
              </span>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
              <strong>
                פתיחת המדריך
                <ArrowLeft size={16} />
              </strong>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
