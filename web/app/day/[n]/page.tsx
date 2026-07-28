import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CloudRain,
  ExternalLink,
  Info,
  MapPin,
  Scissors,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import { PlaceCard } from "@/components/cards";
import { StatusChip } from "@/components/visuals";
import { TripMap, type MapPoint } from "@/components/TripMap";
import {
  cityLabels,
  getDay,
  getPlaces,
  getPlacesForDay,
  mapsSearchUrl,
  tripDays,
} from "@/lib/trip-data";
import type { Place } from "@/lib/types";

export function generateStaticParams() {
  return tripDays.map((day) => ({ n: String(day.day) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const day = getDay(Number(n));
  if (!day) return { title: "יום לא נמצא" };
  return {
    title: `יום ${day.day} · ${day.title}`,
    description: `${day.dateHe} — ${day.area}. ${day.theme}.`,
  };
}

/** Ordered, de-duplicated places for the day's map + place grid. */
function routePlaces(placeIdsInOrder: string[]): Place[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  placeIdsInOrder.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  });
  return getPlaces(ordered);
}

export default async function DayPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const day = getDay(Number(n));
  if (!day) notFound();

  const previous = getDay(day.day - 1);
  const next = getDay(day.day + 1);

  const ordered = routePlaces(day.blocks.flatMap((block) => block.placeIds));
  const mapPoints: MapPoint[] = ordered
    .filter((place) => place.lat && place.lng)
    .map((place, index) => ({
      id: place.id,
      lat: place.lat,
      lng: place.lng,
      label: String(index + 1),
      title: place.nameHe,
      area: place.area,
      color: day.color,
      mapsUrl: mapsSearchUrl(place),
    }));

  const foodAnchors = getPlaces(day.foodAnchors ?? []);
  const dayPlaces = getPlacesForDay(day.day);
  const style = { "--day-color": day.color } as CSSProperties;

  return (
    <article style={style}>
      <header className="day-hero">
        <div className="hero-media">
          <img
            src={day.heroImage}
            alt={day.title}
            fetchPriority="high"
            width={1600}
            height={900}
          />
        </div>
        <div className="day-hero-wash" />
        <div className="container day-hero-body">
          <Link className="text-link" href="/itinerary" style={{ color: "#fff" }}>
            <ArrowRight size={16} />
            כל המסלול
          </Link>
          <p className="eyebrow" style={{ color: "#f2b134" }}>
            <Sparkles size={14} />
            יום {day.day} · {day.dateHe}
          </p>
          <h1>{day.title}</h1>
          <div className="day-hero-meta">
            <span className="chip">{day.area}</span>
            <span className="chip">{cityLabels[day.city]}</span>
            <span className="chip">{day.theme}</span>
          </div>
        </div>
      </header>

      <div className="container section">
        <div className="day-layout">
          <div>
            <h2 className="display-sm" style={{ marginBottom: 16 }}>
              איך היום נראה
            </h2>
            <div className="blocks">
              {day.blocks.map((block, index) => (
                <section className="block" key={`${block.title}-${index}`} data-reveal>
                  <div className="block-head">
                    <span className="block-time">{block.time ?? `${index + 1}`}</span>
                    <h3>{block.title}</h3>
                  </div>
                  {block.detail ? <p className="block-detail">{block.detail}</p> : null}
                  {block.placeIds.length > 0 ? (
                    <div className="block-places">
                      {getPlaces(block.placeIds).map((place) => (
                        <a
                          className="place-pill"
                          href={mapsSearchUrl(place)}
                          key={place.id}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPin size={13} />
                          {place.nameHe}
                          <ExternalLink size={11} />
                        </a>
                      ))}
                    </div>
                  ) : null}
                  {block.cutFirst || block.booking ? (
                    <div className="block-tags">
                      {block.cutFirst ? (
                        <span className="chip chip-cut">
                          <Scissors size={12} />
                          לוותר בקלות
                        </span>
                      ) : null}
                      {block.booking ? (
                        <StatusChip
                          status={block.booking.status}
                          href={block.booking.url}
                          label={block.booking.label}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          </div>

          <aside className="side-panel">
            <TripMap
              points={mapPoints}
              color={day.color}
              route
              ariaLabel={`מפת יום ${day.day}`}
            />

            {day.discovery ? (
              <section className="panel discovery-panel" data-reveal>
                <p className="discovery-kicker">
                  <BadgeCheck size={15} />
                  {day.discovery.label}
                </p>
                <h2>{day.discovery.title}</h2>
                <p>{day.discovery.detail}</p>
                <a
                  className="text-link"
                  href={day.discovery.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  למקור ולבדיקה
                  <ExternalLink size={13} />
                </a>
              </section>
            ) : null}

            <section className="panel">
              <h2>
                <Sparkles size={16} />
                העיקר של היום
              </h2>
              <ul className="panel-list">
                {day.highlights.map((highlight) => (
                  <li className="chip chip-day" key={highlight}>
                    {highlight}
                  </li>
                ))}
              </ul>
            </section>

            {foodAnchors.length > 0 ? (
              <section className="panel">
                <h2>
                  <UtensilsCrossed size={16} />
                  עוגני אוכל
                </h2>
                <div className="block-places">
                  {foodAnchors.map((place) => (
                    <a
                      className="place-pill"
                      href={mapsSearchUrl(place)}
                      key={place.id}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {place.nameHe}
                      <ExternalLink size={11} />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}

            {day.rainPlan ? (
              <section className="panel">
                <h2>
                  <CloudRain size={16} />
                  אם יורד גשם
                </h2>
                <p>{day.rainPlan}</p>
              </section>
            ) : null}

            {day.note ? (
              <section className="panel">
                <h2>
                  <Info size={16} />
                  לשים לב
                </h2>
                <p>{day.note}</p>
              </section>
            ) : null}
          </aside>
        </div>

        {dayPlaces.length > 0 ? (
          <section style={{ marginTop: 48 }} aria-labelledby="places-title">
            <div className="section-head">
              <p className="eyebrow">
                <MapPin size={14} />
                המקומות של היום
              </p>
              <h2 className="display-sm" id="places-title">
                {dayPlaces.length} תחנות על המפה
              </h2>
            </div>
            <div className="place-cards">
              {dayPlaces.map((place) => (
                <PlaceCard place={place} key={place.id} />
              ))}
            </div>
          </section>
        ) : null}

        <nav className="day-nav" aria-label="ניווט בין ימים">
          {previous ? (
            <Link href={`/day/${previous.day}`}>
              <ArrowRight size={18} />
              <span>
                <small>יום {previous.day}</small>
                <strong>{previous.title}</strong>
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="to-next" href={`/day/${next.day}`}>
              <span>
                <small>יום {next.day}</small>
                <strong>{next.title}</strong>
              </span>
              <ArrowLeft size={18} />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
    </article>
  );
}
