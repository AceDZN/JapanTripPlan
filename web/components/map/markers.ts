import type { Place, PlaceCategory } from "@/lib/types";
import { categoryTone } from "@/components/visuals";
import { placeCategoryLabels } from "@/lib/labels";

/**
 * Pure inline-SVG glyphs (24×24, stroked) so markers never hit the network and
 * survive offline. Deliberately simple shapes — they read at 13px.
 */
const CATEGORY_GLYPH: Record<PlaceCategory, string> = {
  attraction: '<path d="M12 3.5l2.1 5.1 5.4.4-4.1 3.5 1.3 5.3L12 15l-4.7 2.8 1.3-5.3-4.1-3.5 5.4-.4z"/>',
  food: '<path d="M8 3v6a2 2 0 0 1-4 0V3"/><path d="M6 9v12"/><path d="M17 3c1.9 1.9 1.9 6.1 0 8v10"/>',
  shopping: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.2a3 3 0 0 1 6 0V8"/>',
  nature: '<path d="M12 3l4.5 6.5h-2.6L18 15H6l4.1-5.5H7.5z"/><path d="M12 15v6"/>',
  culture: '<path d="M3 6.5h18"/><path d="M4.5 10h15"/><path d="M6.5 6.5V20"/><path d="M17.5 6.5V20"/>',
  gaming:
    '<rect x="2.8" y="8" width="18.4" height="10" rx="4.4"/><path d="M7.6 11.4v3.2M6 13h3.2"/><path d="M16.2 12.2h.01M18.2 14.6h.01"/>',
  kawaii:
    '<path d="M12 20.2S4.6 15.9 4.6 10.6A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7.4 2.2c0 5.3-7.4 9.6-7.4 9.6z"/>',
  viewpoint: '<path d="M2.6 19l6-11.4L12.6 15l2.1-3.2L21.4 19z"/>',
  stay: '<path d="M3 19V6"/><path d="M3 12.5h18V19"/><path d="M7 12.5V9.5h6v3"/>',
  transport:
    '<rect x="6" y="3" width="12" height="13" rx="3.4"/><path d="M6 10.5h12"/><path d="M9.6 13.2h.01M14.4 13.2h.01"/><path d="M9 19l-2 2.5M15 19l2 2.5"/>',
  event: '<path d="M4 21l5.5-13.5L19 15z"/><path d="M17 2.6v4.2M14.9 4.7h4.2"/>',
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function categorySvg(category: PlaceCategory, size = 13): string {
  const glyph = CATEGORY_GLYPH[category] ?? CATEGORY_GLYPH.attraction;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`;
}

export const MARKER_SIZE = 30;
export const MARKER_SIZE_EXTRA = 26;
export const MARKER_SIZE_DISCOVERY = 22;

/**
 * Marker face. Planned places get a filled category dot with an optional day
 * badge; extras get a hollow dashed ring so they never read as "our plan".
 */
export function markerHtml(options: {
  category: PlaceCategory;
  tone?: string;
  dayLabel?: string | null;
  dayColor?: string | null;
  variant?: "planned" | "extra" | "discovery";
  mustDo?: boolean;
}): string {
  const variant = options.variant ?? "planned";
  const tone = options.tone ?? categoryTone[options.category] ?? "#e34234";
  const size =
    variant === "extra"
      ? MARKER_SIZE_EXTRA
      : variant === "discovery"
        ? MARKER_SIZE_DISCOVERY
        : MARKER_SIZE;
  const glyphSize = variant === "planned" ? 13 : 11;
  const classes = ["jm-mk"];
  if (variant === "extra") classes.push("jm-mk-extra");
  if (variant === "discovery") classes.push("jm-mk-discovery");
  if (options.mustDo) classes.push("jm-mk-must");

  const badge =
    options.dayLabel && variant === "planned"
      ? `<i class="jm-mk-badge" style="--badge:${escapeHtml(options.dayColor ?? "#171a33")}">${escapeHtml(options.dayLabel)}</i>`
      : "";

  return `<span class="${classes.join(" ")}" style="--mk:${escapeHtml(tone)};--mk-size:${size}px">${categorySvg(options.category, glyphSize)}${badge}</span>`;
}

export function markerSizeFor(variant: "planned" | "extra" | "discovery"): number {
  if (variant === "extra") return MARKER_SIZE_EXTRA;
  if (variant === "discovery") return MARKER_SIZE_DISCOVERY;
  return MARKER_SIZE;
}

/* ---------------------------------------------------------------- popups */

export type PopupDayChip = { day: number; color: string; label: string };

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * Popup body built as real DOM (not an HTML string) so image fallbacks and the
 * client-side day link can be wired with proper listeners.
 */
export function buildPlacePopup(
  place: Place,
  options: {
    dayChips: PopupDayChip[];
    mapsUrl: string;
    distanceLabel?: string;
  },
): HTMLElement {
  const tone = categoryTone[place.category] ?? "#e34234";
  const root = el("div", "jm-pop");
  root.setAttribute("dir", "rtl");
  root.style.setProperty("--tone", tone);

  const media = el("div", "jm-pop-photo");
  const paintFallback = () => {
    media.innerHTML = `<span class="jm-pop-fallback">${categorySvg(place.category, 22)}<b>日</b></span>`;
  };
  if (place.image) {
    const img = document.createElement("img");
    img.src = place.image;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", paintFallback, { once: true });
    media.appendChild(img);
  } else {
    paintFallback();
  }
  root.appendChild(media);

  const body = el("div", "jm-pop-body");

  const chips = el("div", "jm-pop-chips");
  const category = el("span", "jm-pop-chip");
  category.innerHTML = `${categorySvg(place.category, 11)}<span>${escapeHtml(placeCategoryLabels[place.category] ?? place.category)}</span>`;
  category.style.setProperty("--chip", tone);
  chips.appendChild(category);

  if (!place.planned) {
    const extra = el("span", "jm-pop-chip jm-pop-chip-extra", "המלצה ליד");
    chips.appendChild(extra);
  }
  options.dayChips.forEach((chip) => {
    const node = el("span", "jm-pop-chip", chip.label);
    node.style.setProperty("--chip", chip.color);
    chips.appendChild(node);
  });
  if (options.distanceLabel) {
    chips.appendChild(el("span", "jm-pop-chip jm-pop-chip-dist", options.distanceLabel));
  }
  body.appendChild(chips);

  body.appendChild(el("strong", undefined, place.nameHe));
  body.appendChild(el("span", "jm-pop-en", place.nameEn));
  body.appendChild(el("p", undefined, place.descriptionHe));
  if (place.openingHours) {
    body.appendChild(el("small", undefined, place.openingHours));
  }

  const actions = el("div", "jm-pop-actions");
  const maps = document.createElement("a");
  maps.className = "jm-pop-action jm-pop-action-primary";
  maps.href = options.mapsUrl;
  maps.target = "_blank";
  maps.rel = "noreferrer";
  maps.textContent = "Google Maps";
  actions.appendChild(maps);

  const firstDay = options.dayChips[0];
  if (firstDay) {
    const dayLink = document.createElement("a");
    dayLink.className = "jm-pop-action";
    dayLink.href = `/day/${firstDay.day}`;
    dayLink.dataset.jmNav = `/day/${firstDay.day}`;
    dayLink.textContent = `יום ${firstDay.day}`;
    actions.appendChild(dayLink);
  }
  body.appendChild(actions);

  root.appendChild(body);
  return root;
}

/** Popup for a live Overpass discovery — much lighter, no photo. */
export function buildSimplePopup(options: {
  title: string;
  subtitle?: string;
  badge?: string;
  tone: string;
  category: PlaceCategory;
  mapsUrl: string;
}): HTMLElement {
  const root = el("div", "jm-pop jm-pop-slim");
  root.setAttribute("dir", "rtl");
  root.style.setProperty("--tone", options.tone);

  const body = el("div", "jm-pop-body");
  if (options.badge) {
    const chips = el("div", "jm-pop-chips");
    const chip = el("span", "jm-pop-chip");
    chip.innerHTML = `${categorySvg(options.category, 11)}<span>${escapeHtml(options.badge)}</span>`;
    chip.style.setProperty("--chip", options.tone);
    chips.appendChild(chip);
    body.appendChild(chips);
  }
  body.appendChild(el("strong", undefined, options.title));
  if (options.subtitle) body.appendChild(el("small", undefined, options.subtitle));

  const actions = el("div", "jm-pop-actions");
  const maps = document.createElement("a");
  maps.className = "jm-pop-action jm-pop-action-primary";
  maps.href = options.mapsUrl;
  maps.target = "_blank";
  maps.rel = "noreferrer";
  maps.textContent = "נווט";
  actions.appendChild(maps);
  body.appendChild(actions);

  root.appendChild(body);
  return root;
}
