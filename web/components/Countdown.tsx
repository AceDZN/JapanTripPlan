"use client";

import { useEffect, useState } from "react";

/** Take-off: ET419, Ben Gurion, October 1 2026 at 15:35 Israel time. */
const TAKEOFF = new Date("2026-10-01T15:35:00+03:00").getTime();

function getCountdown() {
  const distance = Math.max(0, TAKEOFF - Date.now());
  return {
    days: Math.floor(distance / 86_400_000),
    hours: Math.floor((distance / 3_600_000) % 24),
    minutes: Math.floor((distance / 60_000) % 60),
    done: distance === 0,
  };
}

export function Countdown({ onSurface = false }: { onSurface?: boolean }) {
  // Rendered on the server too, then re-computed on mount and every 30s.
  const [time, setTime] = useState(getCountdown);

  useEffect(() => {
    const id = window.setInterval(() => setTime(getCountdown()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (time.done) {
    return null;
  }

  const cells = [
    { value: String(time.days), label: "ימים" },
    { value: String(time.hours).padStart(2, "0"), label: "שעות" },
    { value: String(time.minutes).padStart(2, "0"), label: "דקות" },
  ];

  return (
    <div
      className={`countdown${onSurface ? " on-surface" : ""}`}
      aria-label={`נותרו ${time.days} ימים להמראה`}
      suppressHydrationWarning
    >
      {cells.map((cell) => (
        <div className="countdown-cell" key={cell.label} suppressHydrationWarning>
          <strong>{cell.value}</strong>
          <span>{cell.label}</span>
        </div>
      ))}
    </div>
  );
}
