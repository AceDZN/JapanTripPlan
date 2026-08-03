import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";
import { getGuides } from "@/lib/trip-source";
import { guideImage } from "@/components/guide-images";
import { BudgetLive } from "@/components/BudgetLive";

export const metadata: Metadata = {
  title: "מדריכי הטיול",
  description: "כל מסמכי התכנון של יפן 2026 במקום אחד: טיסות, לינה, תחבורה, אנימה, אוכל, תקציב וטיפים.",
};

export default async function GuidesPage() {
  const tripGuides = await getGuides();

  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow">מתעדכן ישירות מקובצי המקור</p>
        <h1 className="display">מחברת המסע</h1>
        <p className="lede">
          כל המידע העמוק — הזמנות, אוכל, תחבורה, אנימה, תקציב וטיפים — בלי לנהל
          את התוכן פעמיים.
        </p>
      </header>

      {/*
        The one number the notebook cannot render from its own markdown. Signed
        out it renders nothing, so the index looks exactly as it always has.
      */}
      <BudgetLive compact />

      <div className="guides-grid">
        {tripGuides.map((guide, index) => (
          <Link className="guide-card" href={`/guide/${guide.slug}`} key={guide.slug} data-reveal>
            <Image
              src={guide.hero?.url ?? guideImage(guide.category)}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 380px"
              loading="lazy"
            />
            <span className="guide-card-num">{String(index + 1).padStart(2, "0")}</span>
            <span className="guide-card-body">
              <span className="file">
                <FileText size={13} />
                {guide.file}
              </span>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
              <span className="text-link" style={{ color: "#fff", marginTop: 10 }}>
                פתיחת המדריך
                <ArrowLeft size={15} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
