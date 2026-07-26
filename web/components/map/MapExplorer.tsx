"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronUp,
  ExternalLink,
  Layers,
  ListFilter,
  Route,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { Place, PlaceCategory } from "@/lib/types";
import {
  cityLabels,
  getDay,
  getPlacesForDay,
  mapsSearchUrl,
  placeCategoryLabels,
  places as allPlaces,
  placesById,
  tripDays,
} from "@/lib/trip-data";
import { CategoryIcon, categoryTone } from "@/components/visuals";
import { MapStyles } from "@/components/map/map-style";
import { Thumb } from "@/components/map/Thumb";
import {
  MapCanvas,
  type FitCommand,
  type FocusCommand,
  type MapBounds,
  type MapMarkerSpec,
  type RouteSpec,
  type ViewCommand,
} from "@/components/map/MapCanvas";
import { buildPlacePopup, markerHtml, markerSizeFor } from "@/components/map/markers";
import { CITY_JUMPS, JAPAN_VIEW } from "@/components/map/geo";

const MAPPABLE = allPlaces.filter(
  (place) => Number.isFinite(place.lat) && Number.isFinite(place.lng),
);

const CATEGORIES: PlaceCategory[] = (
  ["attraction", "gaming", "food", "kawaii", "shopping", "culture", "nature", "viewpoint", "event", "transport", "stay"] as PlaceCategory[]
).filter((category) => MAPPABLE.some((place) => place.category === category));

const LIST_LIMIT = 120;

/** Points of a day, in the order the itinerary blocks visit them. */
function dayRoutePoints(dayNumber: number): [number, number][] {
  const day = getDay(dayNumber);
  if (!day) return [];
  const seen = new Set<string>();
  const points: [number, number][] = [];

  for (const block of day.blocks) {
    for (const id of block.placeIds) {
      if (seen.has(id)) continue;
      seen.add(id);
      const place = placesById[id];
      if (!place || !Number.isFinite(place.lat)) continue;
      points.push([place.lat, place.lng]);
    }
  }

  if (points.length >= 2) return points;
  return getPlacesForDay(dayNumber)
    .filter((place) => Number.isFinite(place.lat))
    .map((place) => [place.lat, place.lng] as [number, number]);
}

function inBounds(place: Place, bounds: MapBounds): boolean {
  return (
    place.lat <= bounds.north &&
    place.lat >= bounds.south &&
    place.lng <= bounds.east &&
    place.lng >= bounds.west
  );
}

export function MapExplorer() {
  const router = useRouter();
  const nonce = useRef(0);
  const next = () => (nonce.current += 1);

  const [query, setQuery] = useState("");
  const [activeCategories, setActiveCategories] = useState<PlaceCategory[]>([]);
  const [activeDays, setActiveDays] = useState<number[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [showRoutes, setShowRoutes] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [focus, setFocus] = useState<FocusCommand | null>(null);
  const [view, setView] = useState<ViewCommand | null>(null);
  const [fit, setFit] = useState<FitCommand | null>(null);

  const toggleCategory = (category: PlaceCategory) =>
    setActiveCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );

  const toggleDay = (day: number) =>
    setActiveDays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : [...current, day],
    );

  const visiblePlaces = useMemo(() => {
    const term = query.trim().toLowerCase();
    return MAPPABLE.filter((place) => {
      if (!place.planned && !showExtras) return false;
      if (activeCategories.length && !activeCategories.includes(place.category)) return false;
      if (activeDays.length && !place.days.some((day) => activeDays.includes(day))) return false;
      if (term) {
        const haystack = `${place.nameHe} ${place.nameEn} ${place.area}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [query, activeCategories, activeDays, showExtras]);

  const markers = useMemo<MapMarkerSpec[]>(
    () =>
      visiblePlaces.map((place) => {
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
              mapsUrl: mapsSearchUrl(place),
            }),
        };
      }),
    [visiblePlaces],
  );

  const routes = useMemo<RouteSpec[]>(() => {
    if (!showRoutes) return [];
    const targets = activeDays.length ? activeDays : tripDays.map((day) => day.day);
    return targets
      .map((dayNumber) => {
        const day = getDay(dayNumber);
        const points = dayRoutePoints(dayNumber);
        if (!day || points.length < 2) return null;
        return { id: `route-${dayNumber}`, color: day.color, points } satisfies RouteSpec;
      })
      .filter((route): route is RouteSpec => route !== null);
  }, [showRoutes, activeDays]);

  const listed = useMemo(() => {
    const source = bounds
      ? visiblePlaces.filter((place) => inBounds(place, bounds))
      : visiblePlaces;
    return [...source].sort((a, b) => {
      if (a.planned !== b.planned) return a.planned ? -1 : 1;
      const dayA = a.days[0] ?? 99;
      const dayB = b.days[0] ?? 99;
      if (dayA !== dayB) return dayA - dayB;
      return a.nameHe.localeCompare(b.nameHe, "he");
    });
  }, [visiblePlaces, bounds]);

  const handleBounds = useCallback((value: MapBounds) => setBounds(value), []);
  const handleNavigate = useCallback((href: string) => router.push(href), [router]);

  const flyTo = (place: Place) => {
    setFocus({ id: place.id, nonce: next() });
    setPanelOpen(false);
  };

  const activeFilterCount =
    activeCategories.length + activeDays.length + (showExtras ? 1 : 0) + (showRoutes ? 1 : 0);

  const resetAll = () => {
    setActiveCategories([]);
    setActiveDays([]);
    setQuery("");
    setShowExtras(false);
    setShowRoutes(false);
    setFit({ points: MAPPABLE.filter((p) => p.planned).map((p) => [p.lat, p.lng]), nonce: next() });
  };

  return (
    <div className="jm-shell">
      <MapStyles />

      <MapCanvas
        markers={markers}
        routes={routes}
        initialView={JAPAN_VIEW}
        view={view}
        focus={focus}
        fit={fit}
        onBounds={handleBounds}
        onMarkerClick={() => setPanelOpen(false)}
        onNavigate={handleNavigate}
        ariaLabel="מפת כל תחנות הטיול"
        controlBottom={70}
      />

      <div className="jm-topbar">
        <div className="jm-topbar-row">
          <div className="jm-search-wrap">
            <Search size={15} aria-hidden />
            <input
              className="jm-search"
              type="search"
              value={query}
              aria-label="חיפוש מקום"
              placeholder="חיפוש מקום, שכונה או שם באנגלית"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="jm-filter-btn"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <ListFilter size={15} />
            סינון
            {activeFilterCount ? <b>{activeFilterCount}</b> : null}
          </button>
        </div>

        <div className="jm-scroller" role="group" aria-label="קפיצה לעיר">
          <button
            type="button"
            className="jm-tog"
            onClick={() =>
              setFit({
                points: visiblePlaces.map((place) => [place.lat, place.lng]),
                nonce: next(),
              })
            }
          >
            הכול
          </button>
          {CITY_JUMPS.map((city) => (
            <button
              key={city.id}
              type="button"
              className="jm-tog"
              onClick={() => setView({ ...city.view, nonce: next() })}
            >
              {city.label}
            </button>
          ))}
        </div>

        <div className="jm-filters" data-open={filtersOpen}>
          <div className="jm-filter-group">
            <div className="jm-filter-label">
              <span>קטגוריות</span>
              {activeCategories.length ? (
                <button type="button" onClick={() => setActiveCategories([])}>
                  ניקוי
                </button>
              ) : null}
            </div>
            <div className="jm-scroller">
              {CATEGORIES.map((category) => {
                const on = activeCategories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    className="jm-tog"
                    aria-pressed={on}
                    style={{ "--tone": categoryTone[category] } as CSSProperties}
                    onClick={() => toggleCategory(category)}
                  >
                    <CategoryIcon category={category} size={13} />
                    {placeCategoryLabels[category]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="jm-filter-group">
            <div className="jm-filter-label">
              <span>ימים</span>
              {activeDays.length ? (
                <button type="button" onClick={() => setActiveDays([])}>
                  ניקוי
                </button>
              ) : null}
            </div>
            <div className="jm-scroller">
              {tripDays.map((day) => {
                const on = activeDays.includes(day.day);
                return (
                  <button
                    key={day.day}
                    type="button"
                    className="jm-day-pill"
                    aria-pressed={on}
                    aria-label={`יום ${day.day} · ${day.title}`}
                    title={`יום ${day.day} · ${day.title}`}
                    style={{ "--tone": day.color } as CSSProperties}
                    onClick={() => toggleDay(day.day)}
                  >
                    <strong>{day.day}</strong>
                    <span>{day.shortDate}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="jm-scroller">
            <button
              type="button"
              className="jm-tog"
              aria-pressed={showExtras}
              style={{ "--tone": "#b5539c" } as CSSProperties}
              onClick={() => setShowExtras((value) => !value)}
            >
              <Sparkles size={14} />
              הפתעות ליד
            </button>
            <button
              type="button"
              className="jm-tog"
              aria-pressed={showRoutes}
              style={{ "--tone": "#2f6fd0" } as CSSProperties}
              onClick={() => setShowRoutes((value) => !value)}
            >
              <Route size={14} />
              מסלולי ימים
            </button>
            {activeFilterCount || query ? (
              <button type="button" className="jm-tog" onClick={resetAll}>
                <X size={14} />
                איפוס
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="jm-panel" data-open={panelOpen} aria-label="רשימת מקומות במסגרת המפה">
        <span className="jm-panel-grip" />
        <button
          type="button"
          className="jm-panel-head"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <span>
            <strong className="jm-panel-title">
              <Layers size={15} style={{ display: "inline", verticalAlign: "-2px", marginInlineEnd: 6 }} />
              {listed.length} מקומות בתצוגה
            </strong>
            <small>
              {visiblePlaces.length} תואמים לסינון · {showExtras ? "כולל הפתעות" : "רק מהמסלול"}
            </small>
          </span>
          <ChevronUp
            size={18}
            style={{ transform: panelOpen ? "rotate(180deg)" : "none", transition: "transform 200ms ease" }}
            aria-hidden
          />
        </button>

        <div className="jm-panel-list">
          {listed.length === 0 ? (
            <p className="jm-empty">אין מקומות בתצוגה הנוכחית. אפשר להתרחק במפה או לנקות סינון.</p>
          ) : (
            listed.slice(0, LIST_LIMIT).map((place) => {
              const day = place.days[0] ? getDay(place.days[0]) : null;
              return (
                <div className="jm-item" key={place.id}>
                  <button type="button" className="jm-item-main" onClick={() => flyTo(place)}>
                    <Thumb place={place} className="jm-thumb" />
                    <span className="jm-item-body">
                      <span className="jm-item-top">
                        <span
                          className="jm-tag"
                          style={{ "--tone": categoryTone[place.category] } as CSSProperties}
                        >
                          <CategoryIcon category={place.category} size={10} />
                          {placeCategoryLabels[place.category]}
                        </span>
                        {place.planned && day ? (
                          <span className="jm-tag" style={{ "--tone": day.color } as CSSProperties}>
                            יום {day.day}
                          </span>
                        ) : null}
                        {place.planned ? null : <span className="jm-tag jm-tag-extra">המלצה ליד</span>}
                      </span>
                      <strong>{place.nameHe}</strong>
                      <small>
                        {place.area} · {cityLabels[place.city]}
                      </small>
                    </span>
                  </button>
                  <span className="jm-item-actions">
                    {place.days[0] ? (
                      <Link
                        className="jm-icon-btn"
                        href={`/day/${place.days[0]}`}
                        aria-label={`ליום ${place.days[0]}`}
                        title={`ליום ${place.days[0]}`}
                      >
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{place.days[0]}</span>
                      </Link>
                    ) : null}
                    <a
                      className="jm-icon-btn"
                      href={mapsSearchUrl(place)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${place.nameHe} ב־Google Maps`}
                      title="Google Maps"
                    >
                      <ExternalLink size={15} />
                    </a>
                  </span>
                </div>
              );
            })
          )}
          {listed.length > LIST_LIMIT ? (
            <p className="jm-empty">מוצגים {LIST_LIMIT} הראשונים — אפשר להתקרב במפה כדי לצמצם.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
