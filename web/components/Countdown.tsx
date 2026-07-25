"use client";

import { useEffect, useState } from "react";

function getCountdown() {
  const target = new Date("2026-10-01T15:35:00+03:00").getTime();
  const distance = Math.max(0, target - Date.now());
  return {
    days: Math.floor(distance / 86_400_000),
    hours: Math.floor((distance / 3_600_000) % 24),
    minutes: Math.floor((distance / 60_000) % 60),
  };
}

export function Countdown() {
  const [time, setTime] = useState(getCountdown);

  useEffect(() => {
    const id = window.setInterval(() => setTime(getCountdown()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="countdown" aria-label="ספירה לאחור לטיסה">
      <div>
        <strong>{time.days}</strong>
        <span>ימים</span>
      </div>
      <i>:</i>
      <div>
        <strong>{String(time.hours).padStart(2, "0")}</strong>
        <span>שעות</span>
      </div>
      <i>:</i>
      <div>
        <strong>{String(time.minutes).padStart(2, "0")}</strong>
        <span>דקות</span>
      </div>
    </div>
  );
}
