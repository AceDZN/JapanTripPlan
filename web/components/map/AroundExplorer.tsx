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
  MapPin,
  Navigation,
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

type GeoState = "locating" | "ready" | "denied" | "unsupported";
type Segment = "all" | "planned" | "extra" | "discovery";

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

  const [geoState, setGeoState] = useState<GeoState>("locating");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [segment, setSegment] = useState<Segment>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [discovery, setDiscovery] = useState<{ key: string; items: Discovery[] } | null>(null);
  const [today, setToday] = useState<TripDay | null>(null);
  const [duringTrip, setDuringTrip] = useState(false);
  const [focus, setFocus] = useState<FocusCommand | null>(null);

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
  const requestLocation = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("unsupported");
      setPickerOpen(true);
      return;
    }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          label: "המיקום הנוכחי שלך",
          kind: "gps",
        });
        setGeoState("ready");
        setPickerOpen(false);
        setLimit(PAGE_SIZE);
      },
      (error) => {
        setGeoState(error.code === error.PERMISSION_DENIED ? "denied" : "unsupported");
        setPickerOpen(true);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(requestLocation, 0);
    return () => window.clearTimeout(timer);
  }, [requestLocation]);

  const pickArea = (area: AreaOption) => {
    setOrigin({ lat: area.lat, lng: area.lng, label: area.label, kind: "manual" });
    setGeoState("ready");
    setPickerOpen(false);
    setLimit(PAGE_SIZE);
  };

  /* --------------------------------------------------------- discovery */
  const originKey = origin ? `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}` : null;

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
  const farFromTrip = ranked.length > 0 && ranked[0].meters > 50000;

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

  // Derived, not stateful: a fresh object here is exactly the signal MapCanvas
  // needs to refit, and it changes only when the origin (or ranking) changes.
  const fit = useMemo<FitCommand | null>(() => {
    if (!origin || ranked.length === 0) return null;
    const nearby = ranked
      .slice(0, 8)
      .map((entry) => [entry.place.lat, entry.place.lng] as [number, number]);
    // Before the trip the user is nowhere near Japan; framing both would show
    // half the planet, so we frame the places only.
    const points: [number, number][] = farFromTrip
      ? nearby
      : [[origin.lat, origin.lng], ...nearby];
    return { points, nonce: 0 };
  }, [origin, ranked, farFromTrip]);

  const handleNavigate = useCallback((href: string) => router.push(href), [router]);

  const pageItems = filtered.slice(0, limit);
  const showList = geoState === "ready" && origin !== null;

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
          כל 150 המקומות של המסע ממוינים לפי מרחק הליכה, ועוד גילויים חיים מהמפה הפתוחה
          ברדיוס {DISCOVERY_RADIUS_M} מטר.
        </p>
      </header>

      <div className="jm-origin">
        <span className="jm-origin-copy">
          <strong>
            {origin
              ? origin.kind === "gps"
                ? "המיקום הנוכחי שלך"
                : `אזור נבחר · ${origin.label}`
              : geoState === "locating"
                ? "מאתרים אתכם…"
                : "אין מיקום"}
          </strong>
          <small>
            {origin
              ? origin.kind === "gps"
                ? `דיוק כ־${Math.round(origin.accuracy ?? 0)} מ׳ · ${MAPPABLE.length} מקומות במאגר`
                : `מרכז השכונה · ${MAPPABLE.length} מקומות במאגר`
              : "אפשר לאשר מיקום או לבחור אזור ידנית"}
          </small>
          {farFromTrip ? (
            <small>עדיין רחוקים מיפן — אפשר לבחור שכונה כדי לראות מה יהיה סביבכם שם.</small>
          ) : null}
        </span>
        <span className="jm-origin-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={requestLocation}>
            <RefreshCw size={15} />
            רענון מיקום
          </button>
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

      {geoState === "denied" || geoState === "unsupported" ? (
        <div className="jm-state">
          <h2>
            {geoState === "denied" ? "הגישה למיקום נחסמה" : "אי אפשר לאתר מיקום כרגע"}
          </h2>
          <p>
            {geoState === "denied"
              ? "אפשר לאשר מיקום בהגדרות האתר בדפדפן ואז ללחוץ על רענון מיקום — או פשוט לבחור למטה את השכונה שאתם נמצאים בה. הרשימה עובדת מצוין גם בלי GPS."
              : "הדפדפן לא סיפק מיקום (למשל בגלישה ללא HTTPS או במצב חיסכון). בוחרים את השכונה ידנית וממשיכים."}
          </p>
        </div>
      ) : null}

      {pickerOpen || (!origin && geoState !== "locating") ? (
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
            focus={focus}
            userPoint={
              origin && origin.kind === "gps"
                ? { lat: origin.lat, lng: origin.lng, accuracy: origin.accuracy }
                : origin
                  ? { lat: origin.lat, lng: origin.lng }
                  : null
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
