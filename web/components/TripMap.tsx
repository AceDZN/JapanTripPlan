"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { ExternalLink, MapPin } from "lucide-react";
import type { mapPlaces } from "@/lib/trip-data";

type Place = (typeof mapPlaces)[number];

export function TripMap({ places }: { places: Place[] }) {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<number, L.Marker>>(new Map());
  const [selected, setSelected] = useState(places[0]);

  useEffect(() => {
    let disposed = false;

    async function createMap() {
      if (!mapElement.current || mapInstance.current) return;
      const L = await import("leaflet");
      if (disposed || !mapElement.current) return;

      const map = L.map(mapElement.current, {
        zoomControl: false,
        scrollWheelZoom: false,
      }).setView([35.6762, 139.6503], 9);

      L.control.zoom({ position: "bottomleft" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);

      places.forEach((place) => {
        const icon = L.divIcon({
          className: "trip-map-marker-wrap",
          html: `<span class="trip-map-marker" style="--marker:${place.color}">${place.day}</span>`,
          iconSize: [38, 46],
          iconAnchor: [19, 42],
        });
        const marker = L.marker([place.lat, place.lng], { icon }).addTo(map);
        marker.on("click", () => setSelected(place));
        markers.current.set(place.day, marker);
      });

      mapInstance.current = map;
      window.setTimeout(() => map.invalidateSize(), 100);
    }

    createMap();
    const markerStore = markers.current;
    return () => {
      disposed = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
      markerStore.clear();
    };
  }, [places]);

  const selectPlace = (place: Place) => {
    setSelected(place);
    mapInstance.current?.flyTo([place.lat, place.lng], place.day >= 13 ? 11 : 13, {
      duration: 0.8,
    });
    markers.current.get(place.day)?.openPopup();
  };

  return (
    <div className="map-workspace">
      <div className="map-canvas" ref={mapElement} aria-label="מפת המסלול ביפן" />
      <aside className="map-panel">
        <div className="map-panel-heading">
          <span>מפת המסע</span>
          <strong>{places.length} תחנות</strong>
        </div>
        <div className="place-list">
          {places.map((place) => (
            <button
              className={selected.day === place.day ? "active" : ""}
              key={place.day}
              onClick={() => selectPlace(place)}
            >
              <span
                className="place-dot"
                style={{ "--marker": place.color } as React.CSSProperties}
              >
                {place.day}
              </span>
              <span>
                <strong>{place.title}</strong>
                <small>{place.area}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>
      <article className="map-place-card">
        <div className="map-place-image">
          <img src={selected.image} alt="" loading="lazy" />
        </div>
        <div>
          <span>יום {selected.day}</span>
          <h2>{selected.title}</h2>
          <p>{selected.area}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${selected.lat},${selected.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            <MapPin size={16} />
            ניווט ב־Google Maps
            <ExternalLink size={14} />
          </a>
        </div>
      </article>
    </div>
  );
}
