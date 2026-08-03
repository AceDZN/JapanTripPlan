import Image from "next/image";
import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  CalendarDays,
  Compass,
  ExternalLink,
  MapPinned,
  Sparkles,
  Ticket,
} from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { DayCard } from "@/components/cards";
import { Photo, StatusChip } from "@/components/visuals";
import { bookingGates, dueTone, formatDueHe } from "@/components/booking-gates";
import { BudgetLive } from "@/components/BudgetLive";
import { getChecklist, getGuides, getTripDays } from "@/lib/trip-source";
import { dateKey, daysUntilTrip, todayTripDay } from "@/lib/trip-time";
import { routeChapters } from "@/lib/route-chapters";

export default async function Home() {
  const [tripDays, checklist, tripGuides] = await Promise.all([
    getTripDays(),
    getChecklist(),
    getGuides(),
  ]);

  const now = new Date();
  const today = todayTripDay(tripDays, now);
  const until = daysUntilTrip(now);

  // The nearest checklist deadline still ahead of us. Computed here rather than
  // in a Convex query, because a query is not re-run just because the clock
  // moves and would happily serve yesterday's answer forever.
  const todayKey = dateKey(now);
  const deadline =
    checklist.items
      .filter((item) => item.due)
      .sort((a, b) => a.due!.localeCompare(b.due!))
      .find((item) => item.due! >= todayKey) ?? null;

  // Day 2 is the first day in Japan; day 1 is spent entirely in the air.
  const arrivalImage =
    tripDays.find((day) => day.day === 2)?.heroImage ?? tripDays[0]?.heroImage ?? "";

  const gates = bookingGates(tripDays, checklist.items)
    .filter((gate) => gate.status !== "booked")
    .slice(0, 6);
  const chapters = routeChapters(tripDays);
  const previewDays = tripDays.filter((day) => day.day >= 3).slice(0, 8);

  return (
    <>
      <section className="hero">
        <div className="hero-media">
          {/* The first day on the ground, rather than a stock skyline. */}
          <Image
            src={arrivalImage}
            alt="יפן 2026"
            fill
            sizes="100vw"
            priority
          />
        </div>
        <div className="hero-wash" />
        <div className="hero-jp" aria-hidden>
          日本
        </div>
        <div className="container hero-body">
          <p className="eyebrow eyebrow-ltr">TOKYO · KYOTO · OSAKA · 2026</p>
          <h1>
            המסע המשפחתי
            <em>שלנו ליפן</em>
          </h1>
          <p className="hero-sub">
            17 ימים סביב אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי — בקצב
            שמתאים באמת לארבעה אנשים עם רגליים.
          </p>
          {today ? (
            <p className="hero-sub" style={{ color: "#f2b134", fontWeight: 700 }}>
              אנחנו ביפן · יום {today.day} מתוך 17
            </p>
          ) : (
            <Countdown />
          )}
          <div className="hero-actions">
            <Link className="btn btn-primary" href={today ? `/day/${today.day}` : "/itinerary"}>
              <CalendarDays size={18} />
              {today ? "התוכנית להיום" : "למסלול המלא"}
            </Link>
            <Link className="btn btn-glass" href="/map">
              <MapPinned size={18} />
              המפה
            </Link>
            <Link className="btn btn-glass" href="/around">
              <Compass size={18} />
              מה יש סביבי
            </Link>
          </div>
          <div className="hero-stats">
            <div>
              <strong>17</strong>
              <span>ימי מסע</span>
            </div>
            <div>
              <strong>4</strong>
              <span>מטיילים</span>
            </div>
            <div>
              <strong>15</strong>
              <span>לילות ביפן</span>
            </div>
            <div>
              <strong>4</strong>
              <span>ערים</span>
            </div>
          </div>
        </div>
      </section>

      {today ? (
        <section className="today" aria-labelledby="today-title">
          <div className="container today-inner">
            <Link href={`/day/${today.day}`} aria-label={`יום ${today.day} · ${today.title}`}>
              <Photo
                className="today-photo"
                src={today.heroImage}
                alt={today.title}
                tone={today.color}
                priority
              />
            </Link>
            <div className="today-copy">
              <p className="eyebrow">
                <Sparkles size={14} />
                היום במסע · {today.dateHe}
              </p>
              <h2 id="today-title">{today.title}</h2>
              <p>
                {today.area} · {today.theme}
              </p>
              <ul className="today-blocks">
                {today.blocks.slice(0, 4).map((block) => (
                  <li key={block.title}>
                    <time>{block.time ?? "—"}</time>
                    <span>{block.title}</span>
                  </li>
                ))}
              </ul>
              <div className="hero-actions">
                <Link className="btn btn-primary" href={`/day/${today.day}`}>
                  כל היום במלואו
                  <ArrowLeft size={17} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="section-tight container" aria-labelledby="next-title">
          <div className="next-up" data-reveal>
            <div>
              <p className="eyebrow">
                <AlarmClock size={14} />
                הדבר הבא שצריך לסגור
              </p>
              <h3 id="next-title">{deadline ? deadline.title : "הכול סגור — נשאר רק לארוז"}</h3>
              <small>
                {deadline?.due
                  ? `עד ${formatDueHe(deadline.due)}${
                      dueTone(deadline.due, now) === "past" ? " · התאריך עבר" : ""
                    }`
                  : "עוברים על רשימת ההכנות ומוודאים שלא נשכח דבר"}
                {until > 0 ? ` · ${until} ימים להמראה` : ""}
              </small>
            </div>
            <div className="prep-actions">
              {deadline?.url ? (
                <a className="btn btn-primary btn-sm" href={deadline.url} target="_blank" rel="noreferrer">
                  לאתר הרשמי
                  <ExternalLink size={14} />
                </a>
              ) : null}
              <Link className="btn btn-ghost btn-sm" href="/prepare">
                לרשימת ההכנות
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="section container" aria-labelledby="route-title">
        <div className="section-head with-action">
          <div>
            <p className="eyebrow">
              <MapPinned size={14} />
              המסלול הגדול
            </p>
            <h2 className="display" id="route-title">
              ארבעה פרקים, עיר אחרי עיר
            </h2>
          </div>
          <Link className="text-link" href="/itinerary">
            כל 17 הימים
            <ArrowLeft size={16} />
          </Link>
        </div>
        <div className="route-strip">
          {chapters.map((chapter, index) => (
            <Link
              className="route-card"
              href={`/day/${chapter.days[0]}`}
              key={`${chapter.city}-${chapter.dates}`}
              data-reveal
            >
              {chapter.image ? (
                <Image
                  src={chapter.image}
                  alt={chapter.label}
                  fill
                  sizes="(max-width: 640px) 80vw, 320px"
                  loading="lazy"
                />
              ) : null}
              <span className="route-card-body">
                <span>פרק {index + 1}</span>
                <strong>{chapter.label}</strong>
                <small>{chapter.dates} · {chapter.days.length} ימים</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section section-tint" aria-labelledby="gates-title">
        <div className="container">
          <div className="section-head with-action">
            <div>
              <p className="eyebrow">
                <Ticket size={14} />
                שערי הזמנה
              </p>
              <h2 className="display" id="gates-title">
                לפני שהכרטיסים נעלמים
              </h2>
            </div>
            <Link className="text-link" href="/prepare">
              לרשימת ההכנות המלאה
              <ArrowLeft size={16} />
            </Link>
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

          {/*
            Right under the gates on purpose: "these tickets are about to
            disappear" and "this is what the trip has cost so far" are the same
            decision. Family-only, so a signed-out home page is unchanged.
          */}
          <BudgetLive compact />
        </div>
      </section>

      <section className="section container" aria-labelledby="days-title">
        <div className="section-head with-action">
          <div>
            <p className="eyebrow">
              <CalendarDays size={14} />
              טעימה מהימים
            </p>
            <h2 className="display" id="days-title">
              כל יום הוא עולם אחר
            </h2>
          </div>
          <Link className="text-link" href="/itinerary">
            לציר הזמן המלא
            <ArrowLeft size={16} />
          </Link>
        </div>
        <div className="day-grid">
          {previewDays.map((day) => (
            <DayCard day={day} key={day.day} />
          ))}
        </div>
      </section>

      <section className="section section-tint" aria-labelledby="guides-title">
        <div className="container">
          <div className="section-head with-action">
            <div>
              <p className="eyebrow">מחברת המסע</p>
              <h2 className="display" id="guides-title">
                כל התכנון, מסודר ונגיש
              </h2>
            </div>
            <p className="lede" style={{ maxWidth: 360 }}>
              {tripGuides.length} מדריכים שמתעדכנים אוטומטית מקובצי המקור של הטיול.
            </p>
          </div>
          <div className="guide-rail" data-reveal>
            {tripGuides.slice(0, 6).map((guide, index) => (
              <Link href={`/guide/${guide.slug}`} key={guide.slug}>
                <span className="num">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{guide.title}</h3>
                  <p>{guide.description}</p>
                </div>
                <ArrowLeft size={18} />
              </Link>
            ))}
          </div>
          <Link className="text-link" href="/guides" style={{ marginTop: 18 }}>
            לכל המדריכים
            <ArrowLeft size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
