import Link from "next/link";
import type { CSSProperties } from "react";
import {
  CalendarOff,
  Clock3,
  DoorOpen,
  ExternalLink,
  Footprints,
  Globe,
  MapPin,
  Phone,
  Star,
  Ticket,
  TrainFront,
} from "lucide-react";
import type { Place } from "@/lib/types";
import type { TripDay } from "@/lib/types";
import { mapsDirectionsUrl, mapsSearchUrl, placeCategoryLabels } from "@/lib/labels";
import { labelForeign } from "@/lib/ops";
import { CategoryIcon, Photo, categoryTone } from "@/components/visuals";
import { PlaceGallery } from "@/components/PlaceGallery";
import { CopyButton } from "@/components/CopyButton";

export function DayCard({ day, reveal = true }: { day: TripDay; reveal?: boolean }) {
  return (
    <Link
      href={`/day/${day.day}`}
      className="day-card"
      style={{ "--day-color": day.color } as CSSProperties}
      {...(reveal ? { "data-reveal": "" } : {})}
    >
      <Photo src={day.heroImage} alt={day.title} tone={day.color} />
      <span className="day-badge">
        <span>יום</span>
        <strong>{day.day}</strong>
      </span>
      <span className="day-card-body">
        <span>{day.shortDate}</span>
        <h3>{day.title}</h3>
        <small>{day.area}</small>
      </span>
    </Link>
  );
}

export function PlaceCard({ place }: { place: Place }) {
  return (
    <article className="card place-card" data-reveal>
      <Photo
        src={place.image}
        alt={place.nameHe}
        tone={categoryTone[place.category]}
        category={place.category}
      />
      <div className="place-card-body">
        <span className="place-meta">
          <span className="chip">
            <CategoryIcon category={place.category} size={13} />
            {placeCategoryLabels[place.category]}
          </span>
          {place.mustDo ? (
            <span className="chip chip-must">
              <Star size={12} />
              חובה
            </span>
          ) : null}
        </span>
        <h3>{place.nameHe}</h3>
        <span className="en" dir="ltr">
          {place.nameEn}
          {place.nameJa ? <span lang="ja"> · {place.nameJa}</span> : null}
        </span>
        <p>{place.descriptionHe}</p>

        <PlaceGallery
          hero={place.hero}
          gallery={place.gallery}
          name={place.nameHe}
          tone={categoryTone[place.category]}
        />

        <PlaceFacts place={place} />

        {place.tips ? <p className="tips">{place.tips}</p> : null}

        {place.addressJa ? (
          <div className="place-address">
            <span dir="ltr" lang="ja">
              {place.addressJa}
            </span>
            <CopyButton value={place.addressJa} label={`העתקת הכתובת של ${place.nameHe}`} />
          </div>
        ) : null}

        <div className="place-actions">
          <a className="text-link" href={mapsSearchUrl(place)} target="_blank" rel="noreferrer">
            <MapPin size={15} />
            {place.area}
            <ExternalLink size={13} />
          </a>
          <a className="text-link" href={mapsDirectionsUrl(place)} target="_blank" rel="noreferrer">
            <Footprints size={15} />
            ניווט
          </a>
          {place.officialUrl ? (
            <a className="text-link" href={place.officialUrl} target="_blank" rel="noreferrer">
              <Globe size={15} />
              אתר רשמי
              <ExternalLink size={13} />
            </a>
          ) : null}
          {place.phone ? (
            <a className="text-link" href={`tel:${place.phone.replace(/[^+\d]/g, "")}`}>
              <Phone size={15} />
              <span dir="ltr">{place.phone}</span>
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

/**
 * The facts you check before leaving, not the prose you read at home.
 *
 * Rendered as a short definition list so a closed day or a 15:00 last
 * admission is impossible to skim past — both have already nearly cost us a
 * stop (see the Taiko-kan deadline in 03-TRANSPORT.md).
 */
function PlaceFacts({ place }: { place: Place }) {
  const station = place.nearestStation;
  const stationForeign = station ? labelForeign(station) : null;

  const facts: { icon: typeof Clock3; text: string; ltr?: string; tone?: string }[] = [];

  if (station) {
    const walk = place.walkMinutes ? ` · ${place.walkMinutes} ד׳ הליכה` : "";
    facts.push({
      icon: TrainFront,
      text: `${station.he}${walk}`,
      ltr: stationForeign ?? undefined,
    });
  }
  if (place.stationExit) {
    facts.push({
      icon: DoorOpen,
      text: `יציאה ${place.stationExit.he}`,
      ltr: labelForeign(place.stationExit) ?? undefined,
    });
  }
  if (place.openingHours) facts.push({ icon: Clock3, text: place.openingHours });
  if (place.lastEntry) {
    facts.push({ icon: Clock3, text: `כניסה אחרונה ${place.lastEntry}`, tone: "warn" });
  }
  if (place.closedDays) facts.push({ icon: CalendarOff, text: place.closedDays, tone: "warn" });
  if (place.ticketNote) facts.push({ icon: Ticket, text: place.ticketNote });

  if (facts.length === 0) return null;

  return (
    <ul className="place-facts">
      {facts.map(({ icon: Icon, text, ltr, tone }) => (
        <li key={text} data-tone={tone}>
          <Icon size={13} />
          <span>
            {text}
            {ltr ? (
              <span className="name-foreign" dir="ltr">
                {ltr}
              </span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
