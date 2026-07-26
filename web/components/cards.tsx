import Link from "next/link";
import type { CSSProperties } from "react";
import { Clock3, ExternalLink, MapPin, Star } from "lucide-react";
import type { Place } from "@/lib/types";
import type { TripDay } from "@/lib/trip-data";
import { mapsSearchUrl, placeCategoryLabels } from "@/lib/trip-data";
import { CategoryIcon, Photo, categoryTone } from "@/components/visuals";

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
        <span className="en">{place.nameEn}</span>
        <p>{place.descriptionHe}</p>
        {place.openingHours ? (
          <span className="place-meta">
            <Clock3 size={13} />
            {place.openingHours}
          </span>
        ) : null}
        {place.tips ? <p className="tips">{place.tips}</p> : null}
        <a
          className="text-link"
          href={mapsSearchUrl(place)}
          target="_blank"
          rel="noreferrer"
        >
          <MapPin size={15} />
          {place.area}
          <ExternalLink size={13} />
        </a>
      </div>
    </article>
  );
}
