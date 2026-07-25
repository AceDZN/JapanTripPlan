import type { Metadata } from "next";
import {
  CloudRain,
  Footprints,
  Layers3,
  ShieldCheck,
  SunMedium,
} from "lucide-react";
import { PreparationPlanner } from "@/components/PreparationPlanner";
import { weatherCities } from "@/lib/preparation-data";

export const metadata: Metadata = {
  title: "הכנות לטיול",
  description:
    "רשימת ההכנות המשפחתית ליפן: מה עושים, מתי, איפה, כרטיסים, אפליקציות, מזג אוויר וציוד.",
};

export default function PreparePage() {
  return (
    <div className="page-surface prepare-page">
      <header className="prepare-heading">
        <div>
          <p>READY FOR JAPAN · OCTOBER 2026</p>
          <h1>מגיעים מוכנים</h1>
        </div>
        <p>
          כל מה שצריך לעשות לפני הטיסה — עם תאריך, ערוץ ביצוע ואחריות. הסימון
          נשמר במכשיר הזה.
        </p>
      </header>

      <section className="weather-brief" aria-labelledby="weather-title">
        <div className="weather-intro">
          <span>
            <CloudRain size={19} />
            תנאי אוקטובר
          </span>
          <h2 id="weather-title">נעים להליכה, ערוכים לגשם</h2>
          <p>
            אלה ממוצעי אקלים של JMA ל־1991–2020, לא תחזית לטיול. את התחזית
            האמיתית בודקים מדי יום החל מ־24.9.
          </p>
          <a
            href="https://www.jma.go.jp/bosai/map.html#contents=forecast"
            target="_blank"
            rel="noreferrer"
          >
            תחזית JMA הרשמית
          </a>
        </div>
        <div className="weather-cities">
          {weatherCities.map((city) => (
            <div key={city.city}>
              <strong>{city.city}</strong>
              <p>
                <SunMedium size={17} />
                <span>{city.high}</span>
                <small>יום</small>
              </p>
              <p>
                <span>{city.low}</span>
                <small>לילה</small>
              </p>
              <p>
                <CloudRain size={17} />
                <span>{city.rain}</span>
                <small>בחודש</small>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="wear-system" aria-labelledby="wear-title">
        <div>
          <p className="section-label">מערכת לבוש לכל אחד</p>
          <h2 id="wear-title">שכבות קלות. נעליים מוכחות.</h2>
        </div>
        <div className="wear-list">
          <article>
            <Footprints size={22} />
            <strong>בסיס להליכה</strong>
            <span>נעליים שבורות, גרביים מנדפות ומכנס נוח.</span>
          </article>
          <article>
            <Layers3 size={22} />
            <strong>שכבה משתנה</strong>
            <span>חולצה קלה + קרדיגן, overshirt או פליז דק בתיק.</span>
          </article>
          <article>
            <ShieldCheck size={22} />
            <strong>מעטפת לגשם</strong>
            <span>מעיל גשם מתקפל; מטרייה קומפקטית נוחה בימים עירוניים.</span>
          </article>
        </div>
      </section>

      <PreparationPlanner />
    </div>
  );
}
