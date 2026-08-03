import type { Metadata } from "next";
import {
  AlarmClock,
  CloudRain,
  ExternalLink,
  SunMedium,
  Ticket,
} from "lucide-react";
import { ChecklistBoard } from "@/components/ChecklistBoard";
import { StatusChip } from "@/components/visuals";
import { bookingGates, formatDueHe } from "@/components/booking-gates";
import { weatherCities } from "@/lib/labels";
import { getChecklist, getTripDays, preloadChecklist } from "@/lib/trip-source";
import { daysUntilTrip } from "@/lib/trip-time";

export const metadata: Metadata = {
  title: "הכנות לטיול",
  description:
    "רשימת ההכנות המשפחתית ליפן: כרטיסים, מסמכים, אפליקציות, ציוד ומזג אוויר — עם התקדמות משותפת לכל המשפחה.",
};

export default async function PreparePage() {
  const now = new Date();
  const until = daysUntilTrip(now);

  // Counts come from the same Convex read the board renders, so the header can
  // never claim a different number of tasks than the list below it shows.
  const [{ items }, tripDays, preloaded] = await Promise.all([
    getChecklist(),
    getTripDays(),
    preloadChecklist(),
  ]);
  const gates = bookingGates(tripDays, items).filter((gate) => gate.status !== "booked");
  const criticalItems = items.filter((item) => item.critical);
  const today = now.toISOString().slice(0, 10);
  const openDated = items.filter((item) => item.due && item.due >= today);

  return (
    <div className="container section">
      <header className="prep-hero" data-reveal>
        <div className="section-head" style={{ marginBottom: 0 }}>
          <p className="eyebrow eyebrow-ltr">READY FOR JAPAN · OCTOBER 2026</p>
          <h1 className="display">מגיעים מוכנים</h1>
          <p className="lede">
            כל מה שצריך לסגור לפני ההמראה, מקובץ לפי נושא. ההתקדמות משותפת לכל
            המשפחה — מה שאחד מסמן, כולם רואים.
          </p>
        </div>
        <div className="prep-stats">
          <div className="stat">
            <strong>{until > 0 ? until : 0}</strong>
            <span>ימים להמראה</span>
          </div>
          <div className="stat">
            <strong>{items.length}</strong>
            <span>משימות</span>
          </div>
          <div className="stat">
            <strong>{criticalItems.length}</strong>
            <span>קריטיות</span>
          </div>
        </div>
      </header>

      <section className="section-tight" aria-labelledby="gates-title">
        <div className="section-head">
          <p className="eyebrow">
            <Ticket size={14} />
            שערי הזמנה
          </p>
          <h2 className="display-sm" id="gates-title">
            מה עוד לא נעול
          </h2>
        </div>
        <div className="gates">
          {gates.map((gate) => (
            <article className="card gate" key={gate.key} data-reveal>
              <div className="gate-top">
                <StatusChip status={gate.status} />
                {gate.day ? <span className="gate-day">יום {gate.day}</span> : null}
              </div>
              <h3>{gate.title}</h3>
              {gate.detail ? <p>{gate.detail}</p> : null}
              {gate.due ? (
                <span className="gate-due">
                  <AlarmClock size={13} />
                  עד {formatDueHe(gate.due)}
                </span>
              ) : null}
              {gate.url ? (
                <a className="text-link" href={gate.url} target="_blank" rel="noreferrer">
                  לעמוד ההזמנה
                  <ExternalLink size={13} />
                </a>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="section-tight" aria-labelledby="weather-title">
        <div className="section-head">
          <p className="eyebrow">
            <CloudRain size={14} />
            תנאי אוקטובר
          </p>
          <h2 className="display-sm" id="weather-title">
            נעים להליכה, ערוכים לגשם
          </h2>
          <p className="lede">
            ממוצעי אקלים של JMA ל־1991–2020, לא תחזית. את התחזית האמיתית בודקים
            כל יום מ־24.9.
          </p>
        </div>
        <div className="prep-stats" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          {weatherCities.map((city) => (
            <div className="stat" key={city.city}>
              <strong>{city.city}</strong>
              <span>
                <SunMedium size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> יום{" "}
                {city.high} · לילה {city.low}
              </span>
              <span>
                <CloudRain size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> משקעים{" "}
                {city.rain}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="section-tight" aria-labelledby="checklist-title">
        <div className="section-head">
          <p className="eyebrow">
            <AlarmClock size={14} />
            {openDated.length} תאריכי יעד פתוחים
          </p>
          <h2 className="display-sm" id="checklist-title">
            רשימת ההכנות
          </h2>
        </div>
        <ChecklistBoard preloaded={preloaded} />
      </section>
    </div>
  );
}
