import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  Hotel,
  MapPinned,
  Users,
} from "lucide-react";
import { Countdown } from "@/components/Countdown";
import { bookingTasks, tripDays } from "@/lib/trip-data";
import { tripGuides } from "@/app/generated/trip-content";

export default function Home() {
  const nextDays = tripDays.slice(2, 6);

  return (
    <>
      <section className="home-hero">
        <img
          src="/images/tokyo-sunset.jpg"
          alt="קו הרקיע של טוקיו בשקיעה"
          fetchPriority="high"
        />
        <div className="hero-wash" />
        <div className="hero-japan">日本</div>
        <div className="hero-content">
          <p className="hero-kicker">TOKYO · KYOTO · OSAKA · 2026</p>
          <h1>
            המסע המשפחתי
            <span>שלנו ליפן</span>
          </h1>
          <p className="hero-subtitle">
            17 ימים שנבנו סביב אנימה, גיימינג, פוקימון, נינטנדו, ראמן וקוואי —
            בקצב שמתאים באמת למשפחה שלנו.
          </p>
          <Countdown />
          <div className="hero-actions">
            <Link href="/itinerary">
              <CalendarDays size={19} />
              למסלול המלא
            </Link>
            <Link href="/map" className="secondary">
              <MapPinned size={19} />
              לפתיחת המפה
            </Link>
            <Link href="/prepare" className="secondary">
              <ClipboardCheck size={19} />
              להכנות
            </Link>
          </div>
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
        </div>
      </section>

      <section className="overview-strip">
        <div>
          <span className="strip-icon">
            <Users size={20} />
          </span>
          <p>המשפחה</p>
          <strong>2 הורים · בת 16 · בן 12</strong>
        </div>
        <div>
          <span className="strip-icon">
            <Hotel size={20} />
          </span>
          <p>מבנה הלינה</p>
          <strong>טוקיו · 2 לילות קיוטו · 2 לילות אוסקה · טוקיו</strong>
        </div>
        <div>
          <span className="strip-icon">
            <CheckCircle2 size={20} />
          </span>
          <p>המסנן שלנו</p>
          <strong>משחק · פאנדום · טעם · וואו · קוואי</strong>
        </div>
      </section>

      <section className="home-section section-grid">
        <div className="section-copy">
          <p className="section-label">מה חייבים לעשות עכשיו</p>
          <h2>לפני שהכרטיסים נעלמים</h2>
          <p>
            אלה ההחלטות הקרובות שמחזיקות את כל הטיול. הקבצים המלאים נשארים
            מקור האמת; כאן רואים רק את מה שצריך לפעול עליו.
          </p>
          <Link className="text-link" href="/prepare">
            לרשימת ההכנות המלאה
            <ArrowLeft size={17} />
          </Link>
        </div>
        <div className="booking-list">
          {bookingTasks.slice(0, 4).map((task) => (
            <article key={task.title} data-status={task.status}>
              <div className="task-status">
                {task.status === "urgent" ? (
                  <CircleAlert size={18} />
                ) : (
                  <Clock3 size={18} />
                )}
              </div>
              <div>
                <span>{task.date}</span>
                <h3>{task.title}</h3>
                <p>{task.detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="visual-route">
        <div className="visual-route-copy">
          <p className="section-label">טעימה מהמסלול</p>
          <h2>כל יום הוא עולם אחר</h2>
          <p>
            מאקיהברה ובית קפה לחתולי הצלה ל־PokePark, מערוץ ירוק בלב טוקיו
            לפחזניות טוטורו ופסטיבל קארי, ועד Super Nintendo World ו־Nintendo Museum.
          </p>
          <Link href="/itinerary">
            כל 17 הימים
            <ArrowLeft size={17} />
          </Link>
        </div>
        <div className="route-collage">
          {nextDays.map((day, index) => (
            <Link
              href="/itinerary"
              className={`route-image route-image-${index + 1}`}
              key={day.day}
            >
              <img
                src={day.image}
                alt=""
                loading="lazy"
              />
              <span>יום {day.day}</span>
              <strong>{day.title}</strong>
              <small>{day.shortDate}</small>
            </Link>
          ))}
        </div>
      </section>

      <section className="home-section guide-preview">
        <div className="guide-preview-heading">
          <div>
            <p className="section-label">מחברת המסע</p>
            <h2>כל התכנון, מסודר ונגיש</h2>
          </div>
          <p>
            {tripGuides.length} מדריכים שמתעדכנים אוטומטית מתוך קובצי ה־Markdown.
          </p>
        </div>
        <div className="guide-links">
          {tripGuides.slice(0, 6).map((guide, index) => (
            <Link href={`/guide/${guide.slug}`} key={guide.slug}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </div>
              <ArrowLeft size={18} />
            </Link>
          ))}
        </div>
        <Link className="all-guides-link" href="/guides">
          לכל המדריכים
          <ArrowLeft size={17} />
        </Link>
      </section>
    </>
  );
}
