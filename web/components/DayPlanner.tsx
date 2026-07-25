"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  ExternalLink,
  MapPin,
  Sparkles,
} from "lucide-react";
import type { TripDay } from "@/lib/trip-data";

export function DayPlanner({ days }: { days: TripDay[] }) {
  const [selectedDay, setSelectedDay] = useState(2);
  const railRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => days.find((day) => day.day === selectedDay) ?? days[0],
    [days, selectedDay],
  );

  const move = (direction: number) => {
    const next = Math.min(days.length, Math.max(1, selected.day + direction));
    setSelectedDay(next);
    const target = railRef.current?.querySelector<HTMLElement>(
      `[data-day="${next}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };

  return (
    <div className="planner">
      <div className="day-rail-wrap">
        <button onClick={() => move(-1)} aria-label="היום הקודם">
          <ArrowRight size={18} />
        </button>
        <div className="day-rail" ref={railRef}>
          {days.map((day) => (
            <button
              className={selected.day === day.day ? "active" : ""}
              data-day={day.day}
              key={day.day}
              onClick={() => setSelectedDay(day.day)}
              style={{ "--day-color": day.color } as React.CSSProperties}
            >
              <span>יום {day.day}</span>
              <strong>{day.shortDate}</strong>
            </button>
          ))}
        </div>
        <button onClick={() => move(1)} aria-label="היום הבא">
          <ArrowLeft size={18} />
        </button>
      </div>

      <article className="day-focus">
        <div className="day-photo">
          <img
            src={selected.image}
            alt=""
            fetchPriority="high"
          />
          <div className="day-number">
            <span>יום</span>
            <strong>{selected.day}</strong>
          </div>
          <div className="photo-caption">{selected.area}</div>
        </div>
        <div className="day-copy">
          <div className="eyebrow">
            <CalendarCheck2 size={17} />
            {selected.date}
          </div>
          <h2>{selected.title}</h2>
          <p className="day-theme">{selected.theme}</p>

          <div className="highlights">
            {selected.highlights.map((highlight, index) => (
              <div key={highlight}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{highlight}</p>
              </div>
            ))}
          </div>

          {selected.note && (
            <p className="day-note">
              <Sparkles size={17} />
              {selected.note}
            </p>
          )}

          {selected.discovery && (
            <aside className="day-discovery" aria-label="ממצא חדש שאומת">
              <span>{selected.discovery.label}</span>
              <h3>{selected.discovery.title}</h3>
              <p>{selected.discovery.detail}</p>
              <Link
                href={selected.discovery.href}
                target="_blank"
                rel="noreferrer"
              >
                מקור ולוח רשמי
                <ExternalLink size={14} />
              </Link>
            </aside>
          )}

          <div className="day-actions">
            <Link
              href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <MapPin size={17} />
              פתיחה במפה
            </Link>
            <Link href="/guide/daily-itinerary">
              התוכנית המלאה
              <ArrowLeft size={17} />
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
