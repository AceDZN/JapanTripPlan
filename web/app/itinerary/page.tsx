import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, CalendarDays, Plane } from "lucide-react";
import { Photo } from "@/components/visuals";
import { routeChapters } from "@/lib/route-chapters";
import type { TripDay } from "@/lib/types";
import { getTripDays } from "@/lib/trip-source";

export const metadata: Metadata = {
  title: "המסלול היומי",
  description:
    "17 ימים מדויקים של אנימה, גיימינג, ראמן, קוואי וחוויות משפחתיות ביפן — יום אחרי יום.",
};

function DayRow({ day }: { day: TripDay }) {
  return (
    <Link
      className="tl-card"
      href={`/day/${day.day}`}
      style={{ "--day-color": day.color } as CSSProperties}
      data-reveal
    >
      <Photo className="tl-photo" src={day.heroImage} alt={day.title} tone={day.color} />
      <div className="tl-body">
        <div className="tl-top">
          <span className="chip chip-day">יום {day.day}</span>
          <span className="chip">{day.shortDate}</span>
          <span className="tl-area">{day.dateHe}</span>
        </div>
        <h3>{day.title}</h3>
        <p className="tl-area">
          {day.area} · {day.theme}
        </p>
        <ul className="tl-highlights">
          {day.highlights.slice(0, 4).map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </div>
    </Link>
  );
}

export default async function ItineraryPage() {
  const tripDays = await getTripDays();
  const byDay = new Map(tripDays.map((day) => [day.day, day]));
  const prologue = tripDays.filter((day) => day.day === 1);

  return (
    <div className="container section">
      <header className="section-head">
        <p className="eyebrow eyebrow-ltr">1–17 OCT 2026</p>
        <h1 className="display">המסלול שלנו, יום אחרי יום</h1>
        <p className="lede">
          כל יום עבר את מבחן המשפחה: משחק, פאנדום, טעם, וואו או קוואי. לוחצים על
          יום ורואים את הבלוקים, ההזמנות, המפה ומה מוותרים עליו קודם.
        </p>
      </header>

      <section aria-labelledby="chapter-prologue">
        <div className="chapter">
          {/* The prologue is day 1 — take its own photo rather than a path. */}
          <Photo
            className="chapter-photo"
            src={byDay.get(1)?.heroImage}
            alt=""
            tone={byDay.get(1)?.color ?? "#c2553d"}
          />
          <div className="chapter-copy">
            <h2 id="chapter-prologue">
              <Plane size={22} style={{ display: "inline", marginInlineEnd: 8 }} />
              בדרך
            </h2>
            <span>1–2.10 · תל אביב ← אדיס אבבה ← נריטה</span>
          </div>
          <span className="chapter-rule" />
        </div>
        <div className="timeline">
          {prologue.map((day) => (
            <DayRow day={day} key={day.day} />
          ))}
        </div>
      </section>

      {routeChapters(tripDays).map((chapter, index) => (
        <section
          aria-labelledby={`chapter-${index}`}
          key={`${chapter.city}-${chapter.dates}`}
        >
          <div className="chapter">
            <Photo className="chapter-photo" src={chapter.image} alt="" />
            <div className="chapter-copy">
              <h2 id={`chapter-${index}`}>{chapter.label}</h2>
              <span>
                {chapter.dates} · {chapter.days.length} ימים
              </span>
            </div>
            <span className="chapter-rule" />
          </div>
          <div className="timeline">
            {chapter.days
              .map((n) => byDay.get(n))
              .filter((day): day is TripDay => Boolean(day))
              .map((day) => (
                <DayRow day={day} key={day.day} />
              ))}
          </div>
        </section>
      ))}

      <div className="section-head with-action" style={{ marginTop: 40 }}>
        <p className="lede">
          המסמך המלא של המסלול, עם כל ההערות והגיבויים, נמצא במחברת המסע.
        </p>
        <Link className="text-link" href="/guide/daily-itinerary">
          <CalendarDays size={16} />
          למסמך המסלול המלא
          <ArrowLeft size={16} />
        </Link>
      </div>
    </div>
  );
}
