"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type {
  LayerGroup,
  Map as LeafletMap,
  Marker as LeafletMarker,
} from "leaflet";

export type MapBounds = { north: number; south: number; east: number; west: number };

export type MapMarkerSpec = {
  id: string;
  lat: number;
  lng: number;
  /** Pre-rendered divIcon markup (see markers.ts). */
  html: string;
  size: number;
  title: string;
  /** Built lazily, only when Leaflet actually opens the popup. */
  popup?: () => HTMLElement;
};

export type RouteSpec = {
  id: string;
  color: string;
  points: [number, number][];
};

export type ViewCommand = { center: [number, number]; zoom: number; nonce: number };
export type FocusCommand = { id: string; nonce: number };
export type FitCommand = { points: [number, number][]; nonce: number };

type Props = {
  markers: MapMarkerSpec[];
  routes?: RouteSpec[];
  initialView: { center: [number, number]; zoom: number };
  view?: ViewCommand | null;
  focus?: FocusCommand | null;
  fit?: FitCommand | null;
  userPoint?: { lat: number; lng: number; accuracy?: number } | null;
  /** Controls floated over the map (locate button, badges) — outside Leaflet's DOM. */
  overlay?: ReactNode;
  onBounds?: (bounds: MapBounds) => void;
  onMarkerClick?: (id: string) => void;
  onNavigate?: (href: string) => void;
  className?: string;
  ariaLabel: string;
  scrollWheelZoom?: boolean;
  /** Extra bottom padding for the zoom control (mobile bottom sheet). */
  controlBottom?: number;
};

/**
 * CARTO raster basemaps — chosen over stock OSM tiles because they label Japan
 * in Latin script (SHIBUYA, MEGURO…), which is what the family can actually
 * read on the street. Dark mode swaps to CARTO's own dark basemap instead of
 * CSS-inverting the tiles, so labels stay legible.
 */
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_SUBDOMAINS = "abcd";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

/**
 * The single Leaflet surface used by /map and /around.
 *
 * Leaflet is imported dynamically inside an effect so nothing touches `window`
 * during SSR. All updates flow through small effects keyed on stable props, so
 * the map instance itself is created exactly once per mount.
 */
export function MapCanvas({
  markers,
  routes = [],
  initialView,
  view = null,
  focus = null,
  fit = null,
  userPoint = null,
  overlay = null,
  onBounds,
  onMarkerClick,
  onNavigate,
  className = "",
  ariaLabel,
  scrollWheelZoom = true,
  controlBottom = 0,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const routeLayerRef = useRef<LayerGroup | null>(null);
  const userLayerRef = useRef<LayerGroup | null>(null);
  const markersByIdRef = useRef(new Map<string, LeafletMarker>());
  const themeCleanupRef = useRef<(() => void) | null>(null);
  const handlersRef = useRef({ onBounds, onMarkerClick, onNavigate });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    handlersRef.current = { onBounds, onMarkerClick, onNavigate };
  });

  /* ------------------------------------------------------------ mount */
  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    const onHostClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest?.("[data-jm-nav]") as HTMLElement | null;
      const href = link?.dataset.jmNav;
      if (!href) return;
      event.preventDefault();
      handlersRef.current.onNavigate?.(href);
    };

    (async () => {
      const L = await import("leaflet");
      if (cancelled || !hostRef.current || mapRef.current) return;

      const map = L.map(hostRef.current, {
        center: initialView.center,
        zoom: initialView.zoom,
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom,
        worldCopyJump: true,
      });

      L.control
        .zoom({ position: "bottomleft", zoomInTitle: "התקרבות", zoomOutTitle: "התרחקות" })
        .addTo(map);
      L.control
        .attribution({ position: "bottomleft", prefix: false })
        .addAttribution(TILE_ATTRIBUTION)
        .addTo(map);
      const tileUrl = () =>
        document.documentElement.dataset.theme === "dark" ? TILE_DARK : TILE_LIGHT;
      // No `detectRetina` here: Leaflet fills the `{r}` placeholder from
      // Browser.retina on its own, and enabling both would request @2x tiles at
      // half tile-size — double the bytes for no gain.
      const tiles = L.tileLayer(tileUrl(), {
        maxZoom: 19,
        subdomains: TILE_SUBDOMAINS,
      }).addTo(map);
      // Watching the attribute rather than the media query picks up both an OS
      // flip and a manual choice from the header toggle, with no shared state
      // between this imperative map and React.
      const themeObserver = new MutationObserver(() => tiles.setUrl(tileUrl()));
      themeObserver.observe(document.documentElement, {
        attributeFilter: ["data-theme"],
      });
      themeCleanupRef.current = () => themeObserver.disconnect();

      markerLayerRef.current = L.layerGroup().addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      userLayerRef.current = L.layerGroup().addTo(map);

      const emit = () => {
        const bounds = map.getBounds();
        handlersRef.current.onBounds?.({
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        });
      };
      map.on("moveend", emit);
      map.on("zoomend", emit);

      host.addEventListener("click", onHostClick);

      leafletRef.current = L;
      mapRef.current = map;
      setReady(true);

      window.setTimeout(() => {
        map.invalidateSize();
        emit();
      }, 120);
    })();

    return () => {
      cancelled = true;
      host.removeEventListener("click", onHostClick);
      themeCleanupRef.current?.();
      themeCleanupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      leafletRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
      userLayerRef.current = null;
      markersByIdRef.current = new Map();
      setReady(false);
    };
    // The map is intentionally created once; view/zoom updates flow through
    // the dedicated command effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------ markers */
  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    markersByIdRef.current.clear();

    markers.forEach((spec) => {
      const icon = L.divIcon({
        className: "jm-mk-wrap",
        html: spec.html,
        iconSize: [spec.size, spec.size],
        iconAnchor: [spec.size / 2, spec.size / 2],
        popupAnchor: [0, -spec.size / 2 - 2],
      });
      const marker = L.marker([spec.lat, spec.lng], {
        icon,
        title: spec.title,
        riseOnHover: true,
        keyboard: false,
      });
      if (spec.popup) {
        const build = spec.popup;
        marker.bindPopup(() => build(), {
          closeButton: true,
          minWidth: 244,
          maxWidth: 260,
          autoPanPadding: [24, 72],
        });
      }
      marker.on("click", () => handlersRef.current.onMarkerClick?.(spec.id));
      marker.addTo(layer);
      markersByIdRef.current.set(spec.id, marker);
    });
  }, [ready, markers]);

  /* ------------------------------------------------------------ routes */
  useEffect(() => {
    const L = leafletRef.current;
    const layer = routeLayerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    routes.forEach((route) => {
      if (route.points.length < 2) return;
      L.polyline(route.points, {
        color: route.color,
        weight: 3.5,
        opacity: 0.8,
        lineCap: "round",
        lineJoin: "round",
        dashArray: "1 9",
      }).addTo(layer);
    });
  }, [ready, routes]);

  /* ------------------------------------------------------------ user dot */
  useEffect(() => {
    const L = leafletRef.current;
    const layer = userLayerRef.current;
    if (!ready || !L || !layer) return;

    layer.clearLayers();
    if (!userPoint) return;

    L.marker([userPoint.lat, userPoint.lng], {
      icon: L.divIcon({
        className: "jm-user-wrap",
        html: '<span class="jm-user"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
      title: "המיקום שלי",
      interactive: false,
      keyboard: false,
    }).addTo(layer);

    if (userPoint.accuracy && userPoint.accuracy > 40) {
      L.circle([userPoint.lat, userPoint.lng], {
        radius: Math.min(userPoint.accuracy, 900),
        color: "#2f6fd0",
        weight: 1,
        opacity: 0.45,
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(layer);
    }
  }, [ready, userPoint]);

  /* ------------------------------------------------------------ commands */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !view) return;
    map.flyTo(view.center, view.zoom, { duration: 0.7 });
  }, [ready, view]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!ready || !map || !L || !fit || fit.points.length === 0) return;
    map.fitBounds(L.latLngBounds(fit.points), { padding: [48, 48], maxZoom: 15 });
  }, [ready, fit]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    const marker = markersByIdRef.current.get(focus.id);
    if (!marker) return;
    map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 15), { duration: 0.6 });
    const timer = window.setTimeout(() => marker.openPopup(), 640);
    return () => window.clearTimeout(timer);
  }, [ready, focus]);

  /* ------------------------------------------------------------ resize */
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    if (hostRef.current) observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div
      className={`jm-canvas ${className}`.trim()}
      style={{ "--jm-ctl-bottom": `${controlBottom}px` } as CSSProperties}
    >
      <div ref={hostRef} className="jm-canvas-host" role="application" aria-label={ariaLabel} />
      {overlay ? <div className="jm-canvas-overlay">{overlay}</div> : null}
      {ready ? null : (
        <div className="jm-canvas-skel" aria-hidden>
          <span />
        </div>
      )}
    </div>
  );
}
