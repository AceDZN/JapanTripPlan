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
  Wallet,
} from "lucide-react";
import { PlaceCard } from "@/components/cards";
import { StatusChip } from "@/components/visuals";
import { TripMap, type MapPoint } from "@/components/TripMap";
import { DayWishes } from "@/components/DayWishes";
import {
  CostList,
  LinkRow,
  NeedsList,
  RouteStrip,
  StayPanel,
  WarningList,
} from "@/components/day-ops";
import { cityLabels, mapsSearchUrl } from "@/lib/trip-data";
import { familyTotal, yen } from "@/lib/ops";
import { getPlaceIndex, getTripDay, getTripDays } from "@/lib/trip-source";
import type { Place } from "@/lib/types";

/**
 * The trip is 17 days. That is a fixed fact, not data.
 *
 * This used to fetch the day list from Convex, which made every build depend
 * on the database being both reachable and already populated — so a fresh
 * deployment could never be built against, and a Convex blip would fail the
 * build rather than one request. The route list is now static; the pages
 * themselves still render from Convex.
 */
export function generateStaticParams() {
  return Array.from({ length: 17 }, (_, i) => ({ n: String(i + 1) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const day = await getTripDay(Number(n));
  if (!day) return { title: "יום לא נמצא" };
  return {
    title: `יום ${day.day} · ${day.title}`,
    description: `${day.dateHe} — ${day.area}. ${day.theme}.`,
  };
}

/** Ordered, de-duplicated ids for the day's map + place grid. */
function orderedPlaceIds(placeIdsInOrder: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  placeIdsInOrder.forEach((id) => {
    if (seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  });
  return ordered;
}

export default async function DayPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;

  // One round trip for the whole page: the day list covers this day plus its
  // neighbours for the prev/next links.
  const [days, placeIndex] = await Promise.all([getTripDays(), getPlaceIndex()]);

  const day = days.find((entry) => entry.day === Number(n));
  if (!day) notFound();

  const previous = days.find((entry) => entry.day === day.day - 1) ?? null;
  const next = days.find((entry) => entry.day === day.day + 1) ?? null;

  const ordered: Place[] = placeIndex.get(
    orderedPlaceIds(day.blocks.flatMap((block) => block.placeIds)),
  );
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

  const foodAnchors = placeIndex.get(day.foodAnchors ?? []);
  const dayPlaces = placeIndex.forDay(day.day);
  const style = { "--day-color": day.color } as CSSProperties;

  // What the whole day costs, summed from the blocks rather than maintained as
  // a second number that can disagree with them.
  const dayCosts = day.blocks.flatMap((block) => block.costs ?? []);
  const dayTotal = familyTotal(dayCosts);

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
                      {placeIndex.get(block.placeIds).map((place) => (
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

                  {block.warnings?.length ? (
                    <WarningList warnings={block.warnings} />
                  ) : null}
                  {block.legs?.length ? <RouteStrip legs={block.legs} /> : null}
                  {block.needs?.length ? <NeedsList needs={block.needs} /> : null}
                  {block.costs?.length ? <CostList costs={block.costs} /> : null}
                  {block.links?.length ? <LinkRow links={block.links} /> : null}
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

            <DayWishes dayN={day.day} />

            {day.stay ? <StayPanel stay={day.stay} /> : null}

            {dayTotal > 0 ? (
              <section className="panel day-total-panel">
                <h2>
                  <Wallet size={16} />
                  עלות היום
                </h2>
                <p className="day-total" dir="ltr">
                  {yen(dayTotal)}
                </p>
                <small>
                  סיכום כל שורות העלות של היום, למשפחה של ארבעה. לא כולל קניות,
                  גאצ׳פון וכיבודים.
                </small>
              </section>
            ) : null}

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
