"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Clock3,
  Compass,
  Crosshair,
  Footprints,
  LocateFixed,
  MapPin,
  Navigation,
  Radio,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import type { City, Place } from "@/lib/types";
import {
  cityLabels,
  getDay,
  getTodayTripDay,
  isDuringTrip,
  mapsDirectionsUrl,
  placeCategoryLabels,
  places as allPlaces,
  type TripDay,
} from "@/lib/trip-data";
import { CategoryIcon, categoryTone } from "@/components/visuals";
import { MapStyles } from "@/components/map/map-style";
import { Thumb } from "@/components/map/Thumb";
import {
  MapCanvas,
  type FitCommand,
  type FocusCommand,
  type MapMarkerSpec,
  type ViewCommand,
} from "@/components/map/MapCanvas";
import {
  buildPlacePopup,
  buildSimplePopup,
  markerHtml,
  markerSizeFor,
} from "@/components/map/markers";
import {
  buildAreaOptions,
  directionsUrl,
  distanceMeters,
  formatDistance,
  formatWalk,
  JAPAN_VIEW,
  WALK_LIMIT_M,
  type AreaOption,
} from "@/components/map/geo";
import {
  DISCOVERY_RADIUS_M,
  fetchDiscoveries,
  type Discovery,
} from "@/components/map/overpass";
import {
  formatFixAge,
  geoErrorCopy,
  useGeoLocation,
} from "@/components/map/useGeoLocation";

const MAPPABLE = allPlaces.filter(
  (place) => Number.isFinite(place.lat) && Number.isFinite(place.lng),
);

const AREA_OPTIONS = buildAreaOptions(MAPPABLE);
const PICKER_CITIES: City[] = ["tokyo", "kyoto", "osaka", "kamakura", "uji"];
const PAGE_SIZE = 24;
const MAP_MARKER_LIMIT = 26;

type Origin = {
  lat: number;
  lng: number;
  label: string;
  kind: "gps" | "manual";
  accuracy?: number;
};

type Segment = "all" | "planned" | "extra" | "discovery";

/** Beyond this from the nearest place we are planning from home, not walking. */
const FAR_FROM_TRIP_M = 50_000;
/** How far the origin must move before the map re-frames itself. */
const REFIT_THRESHOLD_M = 400;

type Ranked = { place: Place; meters: number };

const SEGMENTS: { id: Segment; label: string }[] = [
  { id: "all", label: "הכול" },
  { id: "planned", label: "מהמסלול" },
  { id: "extra", label: "המלצות" },
  { id: "discovery", label: "גילוי ליד" },
];

function GlyphTile({ category, className = "" }: { category: Place["category"]; className?: string }) {
  const tone = categoryTone[category] ?? "#e34234";
  return (
    <div className={`photo ${className}`.trim()} style={{ "--tone": tone } as CSSProperties} aria-hidden>
      <div className="photo-fallback">
        <CategoryIcon category={category} size={20} />
        <span className="jp">日</span>
      </div>
    </div>
  );
}

export function AroundExplorer() {
  const router = useRouter();
  const nonce = useRef(0);
  const next = () => (nonce.current += 1);

  const [manual, setManual] = useState<Origin | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [discovery, setDiscovery] = useState<{ key: string; items: Discovery[] } | null>(null);
  const [today, setToday] = useState<TripDay | null>(null);
  const [duringTrip, setDuringTrip] = useState(false);
  const [focus, setFocus] = useState<FocusCommand | null>(null);
  const [view, setView] = useState<ViewCommand | null>(null);
  const [fit, setFit] = useState<FitCommand | null>(null);

  /* --------------------------------------------------------- today mode */
  // Read the clock only after paint, so the server and client markup match and
  // "today" never causes a hydration mismatch.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const now = new Date();
      setToday(getTodayTripDay(now));
      setDuringTrip(isDuringTrip(now));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  /* --------------------------------------------------------- geolocation */
  // Live by default: the list is a walking-distance list, so it has to follow
  // the family down the street rather than freeze on the fix they arrived with.
  const geo = useGeoLocation({ watch: true });

  /**
   * A hand-picked neighbourhood always wins over the GPS — that is the whole
   * point of picking one — until it is explicitly dropped.
   */
  const origin = useMemo<Origin | null>(() => {
    if (manual) return manual;
    if (!geo.fix) return null;
    return {
      lat: geo.fix.lat,
      lng: geo.fix.lng,
      accuracy: geo.fix.accuracy,
      label: "המיקום הנוכחי שלך",
      kind: "gps",
    };
  }, [manual, geo.fix]);

  const pickArea = (area: AreaOption) => {
    setManual({ lat: area.lat, lng: area.lng, label: area.label, kind: "manual" });
    setPickerOpen(false);
    setLimit(PAGE_SIZE);
  };

  const useMyLocation = useCallback(() => {
    setManual(null);
    setPickerOpen(false);
    setLimit(PAGE_SIZE);
    geo.request();
  }, [geo]);

  /** Puts the blue dot back on screen, whatever the map is currently framing. */
  const centreOnMe = useCallback(() => {
    if (!geo.fix) {
      geo.request();
      return;
    }
    setView({ center: [geo.fix.lat, geo.fix.lng], zoom: 16, nonce: next() });
  }, [geo]);

  /* --------------------------------------------------------- discovery */
  // Quantised to a ~110 m grid on purpose: with a live watch running, keying on
  // the raw fix would fire a fresh Overpass round trip every few metres of GPS
  // jitter. This matches the cache cell in overpass.ts, so walking a block is
  // one request and standing still is none.
  const originKey = origin ? `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}` : null;

  useEffect(() => {
    if (!origin || !originKey) return;
    let cancelled = false;

    fetchDiscoveries({ lat: origin.lat, lng: origin.lng }, MAPPABLE).then((items) => {
      if (!cancelled) setDiscovery({ key: originKey, items });
    });

    return () => {
      cancelled = true;
    };
  }, [origin, originKey]);

  // Results are keyed by location, so a stale payload can never leak into a new
  // spot and "loading" needs no separate state.
  const discoveries = useMemo<Discovery[]>(
    () => (discovery && discovery.key === originKey ? discovery.items : []),
    [discovery, originKey],
  );
  const discoveryLoading = Boolean(originKey) && discovery?.key !== originKey;

  /* --------------------------------------------------------- ranking */
  const ranked = useMemo<Ranked[]>(() => {
    if (!origin) return [];
    return MAPPABLE.map((place) => ({ place, meters: distanceMeters(origin, place) })).sort(
      (a, b) => a.meters - b.meters,
    );
  }, [origin]);

  const todayNearby = useMemo<Ranked[]>(() => {
    if (!today || !duringTrip) return [];
    return ranked.filter((entry) => entry.place.days.includes(today.day)).slice(0, 6);
  }, [ranked, today, duringTrip]);

  const filtered = useMemo<Ranked[]>(() => {
    if (segment === "planned") return ranked.filter((entry) => entry.place.planned);
    if (segment === "extra") return ranked.filter((entry) => !entry.place.planned);
    if (segment === "discovery") return [];
    return ranked;
  }, [ranked, segment]);

  /** True when we are not in Japan yet — planning from home rather than on the street. */
  const farFromTrip = ranked.length > 0 && ranked[0].meters > FAR_FROM_TRIP_M;

  const rankedDiscoveries = useMemo(() => {
    if (!origin) return [];
    return discoveries
      .map((item) => ({ item, meters: distanceMeters(origin, item) }))
      .sort((a, b) => a.meters - b.meters);
  }, [discoveries, origin]);

  /* --------------------------------------------------------- map */
  const markers = useMemo<MapMarkerSpec[]>(() => {
    const placeMarkers = filtered.slice(0, MAP_MARKER_LIMIT).map((entry) => {
      const place = entry.place;
      const firstDay = place.days[0] ? getDay(place.days[0]) : null;
      const variant = place.planned ? "planned" : "extra";
      return {
        id: place.id,
        lat: place.lat,
        lng: place.lng,
        size: markerSizeFor(variant),
        title: place.nameHe,
        html: markerHtml({
          category: place.category,
          tone: categoryTone[place.category],
          dayLabel: place.days[0] ? String(place.days[0]) : null,
          dayColor: firstDay?.color ?? null,
          variant,
          mustDo: place.mustDo,
        }),
        popup: () =>
          buildPlacePopup(place, {
            dayChips: place.days.map((day) => ({
              day,
              color: getDay(day)?.color ?? "#e34234",
              label: `יום ${day}`,
            })),
            mapsUrl: mapsDirectionsUrl(place),
            distanceLabel: formatDistance(entry.meters),
          }),
      } satisfies MapMarkerSpec;
    });

    const discoveryMarkers = rankedDiscoveries.slice(0, 20).map((entry) => ({
      id: entry.item.id,
      lat: entry.item.lat,
      lng: entry.item.lng,
      size: markerSizeFor("discovery"),
      title: entry.item.name,
      html: markerHtml({
        category: entry.item.category,
        tone: categoryTone[entry.item.category],
        variant: "discovery",
      }),
      popup: () =>
        buildSimplePopup({
          title: entry.item.name,
          subtitle: `${entry.item.kindHe} · ${formatDistance(entry.meters)} · ${formatWalk(entry.meters)}`,
          badge: "גילוי ליד",
          tone: categoryTone[entry.item.category],
          category: entry.item.category,
          mapsUrl: directionsUrl(entry.item.lat, entry.item.lng),
        }),
    })) satisfies MapMarkerSpec[];

    return segment === "discovery"
      ? discoveryMarkers
      : [...placeMarkers, ...discoveryMarkers];
  }, [filtered, rankedDiscoveries, segment]);

  // Stateful and throttled, because the watch is live: re-framing on every GPS
  // tick would yank the map out from under anyone trying to pan it. We re-fit
  // when the origin *source* changes or when it has genuinely moved a block.
  const lastFitRef = useRef<{ kind: string; lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!origin || ranked.length === 0) return;

    const kind = origin.kind === "manual" ? `manual:${origin.label}` : "gps";
    const previous = lastFitRef.current;
    const moved = previous
      ? distanceMeters(previous, origin) > REFIT_THRESHOLD_M
      : true;
    if (previous && previous.kind === kind && !moved) return;

    lastFitRef.current = { kind, lat: origin.lat, lng: origin.lng };

    const nearby = ranked
      .slice(0, 8)
      .map((entry) => [entry.place.lat, entry.place.lng] as [number, number]);
    // Before the trip the family is nowhere near Japan; framing both would show
    // half the planet, so we frame the places only and offer "מרכז עליי" for
    // anyone who wants to see where they actually are.
    const points: [number, number][] = farFromTrip
      ? nearby
      : [[origin.lat, origin.lng], ...nearby];

    setFit({ points, nonce: next() });
  }, [origin, ranked, farFromTrip]);

  const handleNavigate = useCallback((href: string) => router.push(href), [router]);

  const pageItems = filtered.slice(0, limit);
  const showList = origin !== null;

  /** The permission sheet has not been answered yet — so we ask, with a button. */
  const askForPermission = geo.needsPermission && geo.status !== "locating" && !geo.error;
  const nearestMeters = ranked.length > 0 ? ranked[0].meters : null;

  return (
    <div className="container jm-around">
      <MapStyles />

      <header className="jm-around-head">
        <span className="eyebrow">
          <Compass size={14} />
          סביבי
        </span>
        <h1>מה יש עכשיו סביבכם</h1>
        <p className="lede">
          כל {MAPPABLE.length} המקומות של המסע ממוינים לפי מרחק הליכה, ועוד גילויים חיים
          מהמפה הפתוחה ברדיוס {DISCOVERY_RADIUS_M} מטר.
        </p>
      </header>

      <div className="jm-origin">
        <span className="jm-origin-copy">
          <strong>
            {origin
              ? origin.kind === "gps"
                ? "המיקום הנוכחי שלך"
                : `אזור נבחר · ${origin.label}`
              : geo.status === "locating"
                ? "מאתרים אתכם…"
                : "אין מיקום עדיין"}
          </strong>
          <small>
            {origin
              ? origin.kind === "gps"
                ? `דיוק כ־${Math.round(origin.accuracy ?? 0)} מ׳ · ${
                    geo.fix ? formatFixAge(geo.fix.at) : "עכשיו"
                  } · ${MAPPABLE.length} מקומות במאגר`
                : `מרכז השכונה · ${MAPPABLE.length} מקומות במאגר`
              : `${MAPPABLE.length} מקומות במאגר · אפשר לאשר מיקום או לבחור אזור ידנית`}
          </small>
          {origin?.kind === "gps" && geo.watching ? (
            <small className="jm-live">
              <Radio size={11} />
              עוקב אחריכם בזמן אמת
            </small>
          ) : null}
          {farFromTrip && nearestMeters !== null ? (
            <small>
              אתם {formatDistance(nearestMeters)} מהמקום הקרוב ביותר במסלול — עדיין לא ביפן.
              המפה ממוקדת ביפן; ״מרכז עליי״ יראה איפה אתם עכשיו.
            </small>
          ) : null}
        </span>
        <span className="jm-origin-actions">
          {manual ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}>
              <LocateFixed size={15} />
              חזרה למיקום שלי
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={geo.request}
              disabled={geo.status === "locating"}
            >
              <RefreshCw size={15} />
              {geo.status === "locating" ? "מאתרים…" : "רענון מיקום"}
            </button>
          )}
          {geo.fix ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={centreOnMe}>
              <Crosshair size={15} />
              מרכז עליי
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <MapPin size={15} />
            אני ליד…
          </button>
        </span>
      </div>

      {askForPermission ? (
        <div className="jm-state">
          <h2>מרשים לנו לדעת איפה אתם?</h2>
          <p>
            הרשימה כאן מסודרת לפי מרחק הליכה, אז היא צריכה מיקום. הדפדפן ישאל אתכם פעם
            אחת — המיקום נשאר על המכשיר ומשמש רק למיון המקומות ולנקודה הכחולה על המפה.
          </p>
          <span className="jm-origin-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={geo.request}>
              <LocateFixed size={15} />
              אפשרו מיקום
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPickerOpen(true)}
            >
              <MapPin size={15} />
              במקום זה, אבחר שכונה
            </button>
          </span>
        </div>
      ) : null}

      {geo.error && !manual ? (
        <div className="jm-state">
          <h2>{geoErrorCopy(geo.error).title}</h2>
          <p>{geoErrorCopy(geo.error).body}</p>
          {geo.error !== "unsupported" && geo.error !== "insecure" ? (
            <span className="jm-origin-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={geo.request}>
                <RefreshCw size={15} />
                נסו שוב
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      {pickerOpen || (!origin && !askForPermission && geo.status !== "locating") ? (
        <div className="jm-state jm-picker">
          <h2>אני ליד…</h2>
          {PICKER_CITIES.map((city) => {
            const areas = AREA_OPTIONS.filter((area) => area.city === city).slice(0, 8);
            if (areas.length === 0) return null;
            return (
              <div className="jm-picker-city" key={city}>
                <span>{cityLabels[city]}</span>
                <div className="jm-picker-areas">
                  {areas.map((area) => (
                    <button key={area.id} type="button" onClick={() => pickArea(area)}>
                      {area.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="jm-around-split">
        <div className="jm-around-map">
          <MapCanvas
            markers={markers}
            initialView={JAPAN_VIEW}
            fit={fit}
            view={view}
            focus={focus}
            // Always the real GPS dot, never the hand-picked neighbourhood — a
            // fake "you are here" on the other side of the world is worse than
            // none. The chosen area shows up as the map framing instead.
            userPoint={
              geo.fix
                ? { lat: geo.fix.lat, lng: geo.fix.lng, accuracy: geo.fix.accuracy }
                : null
            }
            overlay={
              <button
                type="button"
                className="jm-locate"
                onClick={centreOnMe}
                aria-label={geo.fix ? "מרכוז המפה על המיקום שלי" : "איתור המיקום שלי"}
                data-active={geo.watching ? "" : undefined}
              >
                <LocateFixed size={17} />
              </button>
            }
            onNavigate={handleNavigate}
            ariaLabel="מפת המקומות הקרובים אליי"
            scrollWheelZoom={false}
          />
        </div>

        <div className="jm-around-col">
          {todayNearby.length > 0 && today ? (
            <section className="jm-sec jm-sec-today" aria-labelledby="jm-today-head">
              <div className="jm-sec-head">
                <h2 id="jm-today-head">מהמסלול של היום</h2>
                <small>
                  יום {today.day} · {today.title}
                </small>
              </div>
              <div className="jm-cards">
                {todayNearby.map((entry) => (
                  <PlaceRow
                    key={`today-${entry.place.id}`}
                    entry={entry}
                    onFocus={() => setFocus({ id: entry.place.id, nonce: next() })}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <div className="jm-scroller" role="group" aria-label="סינון תצוגה">
            {SEGMENTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="jm-tog"
                aria-pressed={segment === option.id}
                onClick={() => {
                  setSegment(option.id);
                  setLimit(PAGE_SIZE);
                }}
              >
                {option.id === "discovery" ? <Sparkles size={13} /> : null}
                {option.label}
              </button>
            ))}
          </div>

          {!showList ? (
            <div className="jm-skel" aria-hidden>
              <span className="jm-skel-row" />
              <span className="jm-skel-row" />
              <span className="jm-skel-row" />
            </div>
          ) : segment === "discovery" ? (
            <section className="jm-sec">
              <div className="jm-sec-head">
                <h2>גילוי ליד</h2>
                <small>OpenStreetMap · רדיוס {DISCOVERY_RADIUS_M} מ׳</small>
              </div>
              {discoveryLoading ? (
                <div className="jm-skel" aria-hidden>
                  <span className="jm-skel-row" />
                  <span className="jm-skel-row" />
                </div>
              ) : rankedDiscoveries.length === 0 ? (
                <p className="jm-empty">
                  לא נמצאו גילויים חיים ברדיוס הזה כרגע. הרשימה שלנו ממשיכה לעבוד גם בלי חיבור.
                </p>
              ) : (
                <div className="jm-cards">
                  {rankedDiscoveries.map((entry) => (
                    <DiscoveryRow
                      key={entry.item.id}
                      discovery={entry.item}
                      meters={entry.meters}
                      onFocus={() => setFocus({ id: entry.item.id, nonce: next() })}
                    />
                  ))}
                </div>
              )}
            </section>
          ) : (
            <section className="jm-sec">
              <div className="jm-sec-head">
                <h2>הכי קרוב אליכם</h2>
                <small>{filtered.length} מקומות</small>
              </div>
              <div className="jm-cards">
                {pageItems.map((entry) => (
                  <PlaceRow
                    key={entry.place.id}
                    entry={entry}
                    onFocus={() => setFocus({ id: entry.place.id, nonce: next() })}
                  />
                ))}
              </div>
              {limit < filtered.length ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm jm-more"
                  onClick={() => setLimit((value) => value + PAGE_SIZE)}
                >
                  עוד {Math.min(PAGE_SIZE, filtered.length - limit)} מקומות
                </button>
              ) : null}

              {rankedDiscoveries.length > 0 ? (
                <div className="jm-sec" style={{ marginTop: 18 }}>
                  <div className="jm-sec-head">
                    <h2>גילוי ליד</h2>
                    <small>OpenStreetMap · רדיוס {DISCOVERY_RADIUS_M} מ׳</small>
                  </div>
                  <div className="jm-cards">
                    {rankedDiscoveries.slice(0, 8).map((entry) => (
                      <DiscoveryRow
                        key={entry.item.id}
                        discovery={entry.item}
                        meters={entry.meters}
                        onFocus={() => setFocus({ id: entry.item.id, nonce: next() })}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ rows */

function PlaceRow({ entry, onFocus }: { entry: Ranked; onFocus: () => void }) {
  const { place, meters } = entry;
  const day = place.days[0] ? getDay(place.days[0]) : null;
  const far = meters > WALK_LIMIT_M;

  return (
    <article className="jm-card">
      <button
        type="button"
        className="jm-card-thumb-btn"
        onClick={onFocus}
        aria-label={`הצגת ${place.nameHe} על המפה`}
      >
        <Thumb place={place} className="jm-card-thumb" />
      </button>
      <div className="jm-card-body">
        <span className="jm-item-top">
          <span className="jm-tag" style={{ "--tone": categoryTone[place.category] } as CSSProperties}>
            <CategoryIcon category={place.category} size={10} />
            {placeCategoryLabels[place.category]}
          </span>
          {place.planned && day ? (
            <span className="jm-tag" style={{ "--tone": day.color } as CSSProperties}>
              במסלול יום {day.day}
            </span>
          ) : (
            <span className="jm-tag jm-tag-extra">המלצה ליד</span>
          )}
        </span>
        <strong>{place.nameHe}</strong>
        <span className="jm-card-meta">
          <span className={far ? "jm-card-far" : "jm-card-dist"}>
            <Footprints size={11} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            {formatDistance(meters)} · {formatWalk(meters)}
          </span>
          <span>{place.area}</span>
        </span>
        {place.openingHours ? (
          <span className="jm-card-meta">
            <Clock3 size={11} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
            {place.openingHours}
          </span>
        ) : null}
        {place.days[0] ? (
          <Link className="text-link" href={`/day/${place.days[0]}`} style={{ fontSize: 12 }}>
            ליום {place.days[0]} במסלול
          </Link>
        ) : null}
      </div>
      <a
        className="jm-card-nav"
        href={mapsDirectionsUrl(place)}
        target="_blank"
        rel="noreferrer"
      >
        <Navigation size={14} />
        נווט
      </a>
    </article>
  );
}

function DiscoveryRow({
  discovery,
  meters,
  onFocus,
}: {
  discovery: Discovery;
  meters: number;
  onFocus: () => void;
}) {
  const far = meters > WALK_LIMIT_M;
  return (
    <article className="jm-card">
      <button
        type="button"
        className="jm-card-thumb-btn"
        onClick={onFocus}
        aria-label={`הצגת ${discovery.name} על המפה`}
      >
        <GlyphTile category={discovery.category} className="jm-card-thumb" />
      </button>
      <div className="jm-card-body">
        <span className="jm-item-top">
          <span
            className="jm-tag"
            style={{ "--tone": categoryTone[discovery.category] } as CSSProperties}
          >
            <CategoryIcon category={discovery.category} size={10} />
            {discovery.kindHe}
          </span>
          <span className="jm-tag jm-tag-extra">
            <Crosshair size={10} />
            גילוי ליד
          </span>
        </span>
        <strong dir="auto">{discovery.name}</strong>
        <span className="jm-card-meta">
          <span className={far ? "jm-card-far" : "jm-card-dist"}>
            {formatDistance(meters)} · {formatWalk(meters)}
          </span>
        </span>
      </div>
      <a
        className="jm-card-nav"
        href={directionsUrl(discovery.lat, discovery.lng)}
        target="_blank"
        rel="noreferrer"
      >
        <Navigation size={14} />
        נווט
      </a>
    </article>
  );
}
