"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  area?: string;
  color?: string;
  mapsUrl?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Client-only Leaflet canvas. Numbered markers, an optional route polyline and
 * RTL-safe popups that hand off to Google Maps.
 */
export function TripMap({
  points,
  color = "#e34234",
  route = false,
  className = "mini-map",
  ariaLabel = "מפה",
}: {
  points: MapPoint[];
  color?: string;
  route?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<LeafletMap | null>(null);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!element.current || instance.current || points.length === 0) return;
      const L = await import("leaflet");
      if (disposed || !element.current) return;

      const map = L.map(element.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);
      // CARTO Voyager renders Latin/English labels (default OSM tiles label Japan in Japanese).
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          attribution: "© OpenStreetMap © CARTO",
          subdomains: "abcd",
          maxZoom: 19,
        },
      ).addTo(map);

      if (route && points.length > 1) {
        L.polyline(
          points.map((point) => [point.lat, point.lng] as [number, number]),
          { color, weight: 3, opacity: 0.65, dashArray: "6 8" },
        ).addTo(map);
      }

      points.forEach((point) => {
        const icon = L.divIcon({
          className: "map-marker-wrap",
          html: `<span class="map-num" style="--marker:${point.color ?? color}">${escapeHtml(point.label)}</span>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });
        const link = point.mapsUrl
          ? `<a href="${point.mapsUrl}" target="_blank" rel="noreferrer">ניווט ב־Google Maps</a>`
          : "";
        L.marker([point.lat, point.lng], { icon, title: point.title })
          .addTo(map)
          .bindPopup(
            `<div dir="rtl" style="text-align:right"><strong>${escapeHtml(point.title)}</strong>${
              point.area ? `<br><span>${escapeHtml(point.area)}</span>` : ""
            }${link ? `<br>${link}` : ""}</div>`,
          );
      });

      const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
      map.fitBounds(bounds, { padding: [34, 34], maxZoom: 14 });

      instance.current = map;
      window.setTimeout(() => map.invalidateSize(), 120);
    }

    createMap();

    return () => {
      disposed = true;
      instance.current?.remove();
      instance.current = null;
    };
  }, [points, color, route]);

  if (points.length === 0) {
    return (
      <div className={className}>
        <div className="mini-map-fallback">אין נקודות ממופות ליום הזה</div>
      </div>
    );
  }

  return <div className={className} ref={element} role="application" aria-label={ariaLabel} />;
}
