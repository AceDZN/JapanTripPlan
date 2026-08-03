/**
 * Styles for the map + around-me surfaces.
 *
 * Injected as a single <style> element instead of a CSS module because the
 * marker/popup markup is produced imperatively for Leaflet and needs stable,
 * un-hashed class names. Everything is namespaced `jm-` and every color comes
 * from the design tokens in globals.css, so light/dark themes follow the app.
 */
const CSS = `
/* ------------------------------------------------------------ canvas */
.jm-canvas { position: relative; height: 100%; width: 100%; isolation: isolate; z-index: 0; }
.jm-canvas-host { height: 100%; width: 100%; }
.jm-canvas .leaflet-container { background: var(--surface-2); font-family: var(--font-body); }
.jm-canvas .leaflet-control-zoom { border: 0; box-shadow: var(--shadow-sm); }
.jm-canvas .leaflet-control-zoom a {
  background: var(--surface); border-color: var(--line); color: var(--text);
  height: 36px; line-height: 34px; width: 36px;
}
.jm-canvas .leaflet-control-zoom a:hover { background: var(--surface-2); }
.jm-canvas .leaflet-control-attribution {
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border-radius: 8px; color: var(--text-faint); font-size: 10px; padding: 1px 6px;
}
.jm-canvas .leaflet-control-attribution a { color: var(--text-muted); }
.jm-canvas .leaflet-bottom.leaflet-left { margin-bottom: var(--jm-ctl-bottom, 0px); }

.jm-canvas-skel {
  align-items: center; background: var(--surface-2); display: flex; inset: 0;
  justify-content: center; position: absolute; z-index: 3;
}
.jm-canvas-skel span {
  animation: jm-spin 900ms linear infinite; border: 3px solid var(--line);
  border-radius: 50%; border-top-color: var(--vermillion); height: 32px; width: 32px;
}
@keyframes jm-spin { to { transform: rotate(360deg); } }

/* Dark mode swaps to CARTO's dark basemap in MapCanvas — no CSS inversion, so
   the Latin place labels stay readable. */
:root[data-theme="dark"] .jm-canvas .leaflet-container { background: #12142a; }

/* ------------------------------------------------------------ markers */
.jm-mk-wrap { background: none !important; border: 0 !important; }
.jm-mk {
  align-items: center; background: var(--mk, #e34234); border: 2px solid #fff;
  border-radius: 50%; box-shadow: 0 3px 10px rgba(10, 12, 26, 0.34); color: #fff;
  display: flex; height: var(--mk-size, 30px); justify-content: center;
  position: relative; transition: transform 150ms ease; width: var(--mk-size, 30px);
}
.jm-mk:hover { transform: scale(1.14); z-index: 5; }
.jm-mk-must { box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 70%, transparent), 0 3px 10px rgba(10, 12, 26, 0.34); }
.jm-mk-extra {
  background: color-mix(in srgb, var(--mk) 20%, #fff);
  border: 2px dashed var(--mk); box-shadow: 0 2px 7px rgba(10, 12, 26, 0.2); color: var(--mk);
}
.jm-mk-discovery {
  background: var(--surface); border: 2px dotted var(--mk); color: var(--mk);
  box-shadow: 0 2px 6px rgba(10, 12, 26, 0.18);
}
.jm-mk-badge {
  background: var(--badge, #171a33); border: 1.5px solid #fff; border-radius: 999px;
  color: #fff; font-size: 9.5px; font-style: normal; font-weight: 800; inset-block-start: -7px;
  inset-inline-end: -7px; line-height: 1; min-width: 17px; padding: 3px 3.5px;
  position: absolute; text-align: center;
}
:root[data-theme="dark"] .jm-mk-extra { background: color-mix(in srgb, var(--mk) 26%, #12142a); }
.jm-user-wrap { background: none !important; border: 0 !important; }
.jm-user {
  animation: jm-pulse 2.4s ease-out infinite; background: #2f6fd0; border: 3px solid #fff;
  border-radius: 50%; box-shadow: 0 2px 10px rgba(10, 12, 26, 0.4); display: block;
  height: 18px; width: 18px;
}
@keyframes jm-pulse {
  0% { box-shadow: 0 0 0 0 color-mix(in srgb, #2f6fd0 55%, transparent); }
  70% { box-shadow: 0 0 0 16px rgba(47, 111, 208, 0); }
  100% { box-shadow: 0 0 0 0 rgba(47, 111, 208, 0); }
}

/* ------------------------------------------------------------ overlay controls */
/* Above Leaflet's own controls (z-index 1000) so the locate button is never
   buried under a popup or the zoom cluster. */
.jm-canvas-overlay {
  inset: 0; pointer-events: none; position: absolute; z-index: 1200;
}
.jm-canvas-overlay > * { pointer-events: auto; }
.jm-locate {
  align-items: center; background: var(--surface); border: 1px solid var(--line-strong);
  border-radius: 12px; box-shadow: var(--shadow-sm); color: var(--text); cursor: pointer;
  display: inline-flex; height: 40px; inset-block-start: 10px; inset-inline-end: 10px;
  justify-content: center; position: absolute; width: 40px;
}
.jm-locate:hover { background: var(--surface-2); }
.jm-locate[data-active] { border-color: #2f6fd0; color: #2f6fd0; }
.jm-locate[data-error] { border-color: var(--st-lottery); color: var(--st-lottery); }
/* On /map the top strip belongs to the search bar and the bottom-start corner to
   Leaflet's zoom pair (2 x 36px + its own 10px margin), so the button stacks
   directly above them rather than on top of the zoom-out control. */
.jm-locate-bottom {
  inset-block-start: auto; inset-block-end: calc(var(--jm-ctl-bottom, 0px) + 94px);
}

/* ------------------------------------------------------------ popups */
.jm-canvas .leaflet-popup-content-wrapper {
  background: var(--surface); border-radius: var(--r); box-shadow: var(--shadow); color: var(--text);
  padding: 0; overflow: hidden;
}
.jm-canvas .leaflet-popup-content { margin: 0; width: 244px !important; }
.jm-canvas .leaflet-popup-tip { background: var(--surface); }
.jm-canvas .leaflet-popup-close-button {
  color: var(--text-faint) !important; height: 30px !important; inset-inline-end: 2px; inset-inline-start: auto;
  left: auto !important; right: 2px !important; width: 30px !important;
}
.jm-pop { display: grid; }
.jm-pop-photo { aspect-ratio: 16 / 9; background: var(--surface-2); overflow: hidden; position: relative; }
.jm-pop-photo img { height: 100%; object-fit: cover; width: 100%; }
.jm-pop-fallback {
  align-items: center; background:
    radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--tone) 46%, transparent), transparent 62%),
    linear-gradient(150deg, color-mix(in srgb, var(--tone) 30%, var(--surface-2)), var(--surface-3));
  color: color-mix(in srgb, var(--tone) 70%, var(--text)); display: flex; gap: 8px;
  height: 100%; justify-content: center; width: 100%;
}
.jm-pop-fallback b { font-family: var(--font-jp); font-size: 20px; font-weight: 400; opacity: 0.55; }
.jm-pop-body { display: grid; gap: 6px; padding: 12px 13px 13px; }
.jm-pop-body strong { font-size: 15.5px; line-height: 1.35; }
.jm-pop-en { color: var(--text-faint); direction: ltr; font-size: 11px; text-align: start; }
.jm-pop-body p { color: var(--text-muted); font-size: 12.5px; line-height: 1.6; margin: 0; }
.jm-pop-body small { color: var(--text-faint); font-size: 11.5px; }
.jm-pop-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.jm-pop-chip {
  align-items: center; background: color-mix(in srgb, var(--chip, var(--tone)) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--chip, var(--tone)) 40%, transparent); border-radius: 999px;
  color: color-mix(in srgb, var(--chip, var(--tone)) 62%, var(--text)); display: inline-flex;
  font-size: 10.5px; font-weight: 700; gap: 4px; padding: 3px 8px; white-space: nowrap;
}
.jm-pop-chip-extra { --chip: var(--text-faint); border-style: dashed; }
.jm-pop-chip-dist { --chip: var(--matcha); }
.jm-pop-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.jm-pop-action {
  align-items: center; border: 1px solid var(--line-strong); border-radius: 999px;
  color: var(--text) !important; display: inline-flex; font-size: 12px; font-weight: 700;
  min-height: 32px; padding: 4px 12px; text-decoration: none !important;
}
.jm-pop-action-primary { background: var(--vermillion); border-color: var(--vermillion); color: #fff !important; }
.jm-pop-slim .jm-pop-body { padding: 12px 13px; }

/* ------------------------------------------------------------ map page */
.jm-shell {
  --jm-panel-w: 372px;
  height: calc(100svh - var(--header-h) - var(--tabbar-h));
  min-height: 460px; overflow: hidden; position: relative;
}
@media (min-width: 1001px) { .jm-shell { height: calc(100svh - var(--header-h)); } }

.jm-topbar {
  backdrop-filter: blur(18px); background: color-mix(in srgb, var(--surface) 90%, transparent);
  border: 1px solid var(--line); border-radius: var(--r-lg); box-shadow: var(--shadow);
  display: grid; gap: 8px; inset-block-start: 10px; inset-inline: 10px; max-height: calc(100% - 24px);
  overflow-y: auto; overscroll-behavior: contain; padding: 10px; position: absolute; z-index: 6;
}
@media (min-width: 1001px) {
  .jm-topbar { inset-inline-start: calc(var(--jm-panel-w) + 20px); inset-inline-end: 14px; max-width: 720px; }
}

.jm-topbar-row { align-items: center; display: flex; gap: 8px; }
.jm-search-wrap { align-items: center; display: flex; flex: 1; min-width: 0; position: relative; }
.jm-search-wrap > svg { color: var(--text-faint); inset-inline-start: 13px; pointer-events: none; position: absolute; }
.jm-search {
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px;
  min-height: 40px; min-width: 0; padding: 8px 14px; padding-inline-start: 36px; width: 100%;
}
.jm-search::placeholder { color: var(--text-faint); }
.jm-filter-btn {
  align-items: center; background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 999px; cursor: pointer; display: inline-flex; flex: 0 0 auto; font-size: 13px;
  font-weight: 700; gap: 6px; min-height: 40px; padding: 6px 13px;
}
.jm-filter-btn[aria-expanded="true"] { background: var(--ink); border-color: var(--ink); color: #fff; }
.jm-filter-btn b { background: var(--vermillion); border-radius: 999px; color: #fff; font-size: 10.5px; padding: 1px 6px; }
@media (min-width: 1001px) { .jm-filter-btn { display: none; } }

.jm-scroller {
  display: flex; gap: 6px; margin-inline: -2px; overflow-x: auto; padding: 2px;
  scrollbar-width: thin;
}
.jm-scroller::-webkit-scrollbar { height: 4px; }
.jm-scroller::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 999px; }

.jm-tog {
  align-items: center; background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 999px; color: var(--text-muted); cursor: pointer; display: inline-flex;
  flex: 0 0 auto; font-size: 12.5px; font-weight: 700; gap: 6px; min-height: 34px; padding: 5px 12px;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.jm-tog:hover { background: var(--surface-3); }
.jm-tog[aria-pressed="true"] {
  background: color-mix(in srgb, var(--tone, var(--vermillion)) 16%, transparent);
  border-color: color-mix(in srgb, var(--tone, var(--vermillion)) 55%, transparent);
  color: color-mix(in srgb, var(--tone, var(--vermillion)) 68%, var(--text));
}
.jm-tog-dot { background: var(--tone, var(--vermillion)); border-radius: 50%; height: 8px; width: 8px; }

.jm-day-pill {
  align-items: center; background: var(--surface-2); border: 1px solid var(--line);
  border-radius: 12px; color: var(--text-muted); cursor: pointer; display: inline-flex;
  flex: 0 0 auto; flex-direction: column; font-size: 9.5px; gap: 1px; justify-content: center;
  line-height: 1.15; min-height: 42px; min-width: 42px; padding: 4px 6px;
}
.jm-day-pill strong { direction: ltr; font-size: 14px; }
.jm-day-pill[aria-pressed="true"] {
  background: color-mix(in srgb, var(--tone) 20%, transparent); border-color: var(--tone);
  color: color-mix(in srgb, var(--tone) 66%, var(--text));
}

.jm-filters { display: none; gap: 10px; }
.jm-filters[data-open="true"] { display: grid; }
@media (min-width: 1001px) { .jm-filters { display: grid; } }
.jm-filter-group { display: grid; gap: 5px; }
.jm-filter-label {
  align-items: center; color: var(--text-faint); display: flex; font-size: 10.5px;
  font-weight: 800; gap: 8px; justify-content: space-between; letter-spacing: 0.08em;
  text-transform: uppercase;
}
.jm-filter-label button { color: var(--vermillion); cursor: pointer; font-size: 11px; font-weight: 700; }

/* ------------------------------------------------------------ list drawer */
.jm-panel {
  --jm-peek: 58px;
  background: var(--surface); border-top: 1px solid var(--line);
  border-radius: var(--r-xl) var(--r-xl) 0 0; bottom: 0; box-shadow: var(--shadow-lg);
  display: grid; grid-template-rows: auto 1fr; inset-inline: 0; max-height: 68%;
  position: absolute; transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
  transform: translateY(calc(100% - var(--jm-peek))); z-index: 7;
}
.jm-panel[data-open="true"] { transform: translateY(0); }
@media (min-width: 1001px) {
  .jm-panel {
    border-radius: 0; border-top: 0; border-inline-start: 0; border-inline-end: 1px solid var(--line);
    bottom: 0; inset-block: 0; inset-inline-end: auto; inset-inline-start: 0; max-height: none;
    transform: none; width: var(--jm-panel-w);
  }
}
.jm-panel-head {
  align-items: center; cursor: pointer; display: flex; gap: 10px; justify-content: space-between;
  min-height: var(--jm-peek); padding: 10px 16px; text-align: start; width: 100%;
}
.jm-panel-title { display: block; font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.jm-panel-head small { color: var(--text-muted); display: block; font-size: 12px; font-weight: 500; }
.jm-panel-grip {
  background: var(--line-strong); border-radius: 999px; height: 4px; inset-inline: 0;
  margin-inline: auto; position: absolute; top: 6px; width: 42px;
}
@media (min-width: 1001px) { .jm-panel-grip { display: none; } .jm-panel-head { cursor: default; } }
/* Keep the sheet header clear of the floating chat button (inline-start, bottom). */
@media (max-width: 1000px) { .jm-panel-head { padding-inline-start: 80px; } }

.jm-panel-list {
  display: grid; gap: 6px; overflow-y: auto; overscroll-behavior: contain;
  padding: 0 10px calc(16px + env(safe-area-inset-bottom));
  -webkit-overflow-scrolling: touch;
}
.jm-item {
  align-items: center; border: 1px solid transparent; border-radius: var(--r);
  display: grid; gap: 10px; grid-template-columns: 56px minmax(0, 1fr) auto; padding: 7px;
  transition: background 150ms ease;
}
.jm-item:hover { background: var(--surface-2); border-color: var(--line); }
.jm-item-main {
  align-items: center; cursor: pointer; display: grid; gap: 10px; grid-column: 1 / 3;
  grid-template-columns: 56px minmax(0, 1fr); min-width: 0; text-align: start; width: 100%;
}
.jm-thumb { border-radius: 12px; flex: 0 0 auto; height: 56px; width: 56px; }
.jm-thumb .photo-fallback { border-radius: 12px; }
.jm-item-body { display: grid; gap: 3px; min-width: 0; }
.jm-item-body strong { font-size: 14px; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jm-item-body small { color: var(--text-muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jm-item-top { display: flex; flex-wrap: wrap; gap: 4px; }
.jm-tag {
  align-items: center; background: color-mix(in srgb, var(--tone, var(--vermillion)) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone, var(--vermillion)) 34%, transparent); border-radius: 999px;
  color: color-mix(in srgb, var(--tone, var(--vermillion)) 62%, var(--text)); display: inline-flex;
  font-size: 10px; font-weight: 700; gap: 3px; padding: 2px 7px; white-space: nowrap;
}
.jm-tag-extra { --tone: var(--text-faint); border-style: dashed; }
.jm-item-actions { display: flex; flex: 0 0 auto; gap: 4px; }
.jm-icon-btn {
  align-items: center; border: 1px solid var(--line); border-radius: 10px; color: var(--text-muted);
  display: inline-flex; height: 34px; justify-content: center; width: 34px;
}
.jm-icon-btn:hover { background: var(--surface-2); color: var(--text); }
.jm-empty { color: var(--text-muted); font-size: 13px; padding: 22px 10px; text-align: center; }

/* ------------------------------------------------------------ around page */
.jm-around { display: grid; gap: 14px; padding-block: 18px clamp(28px, 6vw, 56px); }
.jm-around-head { display: grid; gap: 8px; }
.jm-around-head h1 { font-family: var(--font-display); font-size: clamp(28px, 4.4vw, 44px); }
.jm-around-split { display: grid; gap: 14px; }
.jm-around-map {
  border: 1px solid var(--line); border-radius: var(--r-lg); height: 240px; overflow: hidden;
}
.jm-around-col { display: grid; gap: 14px; min-width: 0; }
@media (min-width: 1001px) {
  /* List first (inline-start = right in RTL), big sticky map beside it. */
  .jm-around-split { align-items: start; grid-template-columns: minmax(0, 430px) minmax(0, 1fr); }
  .jm-around-split > .jm-around-map {
    height: calc(100svh - var(--header-h) - 48px); min-height: 460px; order: 2;
    position: sticky; top: calc(var(--header-h) + 16px);
  }
  .jm-around-col { order: 1; }
}

.jm-origin {
  align-items: center; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r-lg); box-shadow: var(--shadow-sm); display: flex; flex-wrap: wrap;
  gap: 10px 14px; justify-content: space-between; padding: 14px 16px;
}
.jm-origin-copy { display: grid; gap: 2px; min-width: 0; }
.jm-origin-copy strong { font-size: 15px; }
.jm-origin-copy small { color: var(--text-muted); font-size: 12px; }
.jm-origin-actions { display: flex; flex-wrap: wrap; gap: 7px; }
.jm-live {
  align-items: center; color: #2f6fd0 !important; display: inline-flex; font-weight: 700; gap: 4px;
}
.jm-live svg { animation: jm-blink 2s ease-in-out infinite; }
@keyframes jm-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.jm-state {
  background: linear-gradient(150deg, color-mix(in srgb, var(--vermillion) 8%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in srgb, var(--vermillion) 24%, transparent); border-radius: var(--r-lg);
  display: grid; gap: 10px; padding: 18px;
}
.jm-state h2 { font-size: 18px; }
.jm-state p { color: var(--text-muted); font-size: 13.5px; line-height: 1.7; }

.jm-picker { display: grid; gap: 10px; }
.jm-picker-city { display: grid; gap: 6px; }
.jm-picker-city > span { color: var(--text-faint); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; }
.jm-picker-areas { display: flex; flex-wrap: wrap; gap: 6px; }
.jm-picker-areas button {
  background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; cursor: pointer;
  font-size: 12.5px; min-height: 36px; padding: 6px 13px;
}
.jm-picker-areas button:hover { background: var(--surface-3); }

.jm-sec { display: grid; gap: 10px; }
.jm-sec-head { align-items: baseline; display: flex; gap: 10px; justify-content: space-between; }
.jm-sec-head h2 { font-family: var(--font-display); font-size: clamp(20px, 2.6vw, 27px); }
.jm-sec-head small { color: var(--text-muted); font-size: 12px; }
.jm-sec-today {
  background: linear-gradient(150deg, color-mix(in srgb, var(--gold) 16%, var(--surface)), var(--surface));
  border: 1px solid color-mix(in srgb, var(--gold) 40%, transparent); border-radius: var(--r-lg); padding: 14px;
}

.jm-cards { display: grid; gap: 8px; }
.jm-card {
  align-items: center; background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); display: grid; gap: 12px; grid-template-columns: 64px minmax(0, 1fr) auto;
  padding: 10px; transition: border-color 150ms ease, transform 150ms ease;
}
.jm-card:hover { border-color: var(--line-strong); transform: translateY(-1px); }
.jm-card-thumb-btn { cursor: pointer; display: block; }
.jm-card-thumb { border-radius: 12px; height: 64px; width: 64px; }
.jm-card-thumb .photo-fallback { border-radius: 12px; }
.jm-card-body { display: grid; gap: 4px; min-width: 0; }
.jm-card-body strong { font-size: 15px; line-height: 1.3; }
.jm-card-body p { color: var(--text-muted); font-size: 12.5px; line-height: 1.55; }
.jm-card-meta { color: var(--text-muted); display: flex; flex-wrap: wrap; font-size: 11.5px; gap: 4px 10px; }
.jm-card-dist { color: var(--matcha); font-weight: 800; }
.jm-card-far { color: var(--st-lottery); font-weight: 800; }
.jm-card-nav {
  align-items: center; background: var(--vermillion); border-radius: 999px; color: #fff;
  display: inline-flex; flex: 0 0 auto; font-size: 12.5px; font-weight: 700; gap: 5px;
  min-height: 38px; padding: 8px 13px;
}
.jm-card-nav:hover { background: var(--vermillion-deep); }

.jm-skel { display: grid; gap: 8px; }
.jm-skel-row {
  animation: jm-shimmer 1400ms ease-in-out infinite; background: var(--surface-2);
  border-radius: var(--r); height: 86px;
}
@keyframes jm-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

.jm-more { justify-self: center; margin-top: 4px; }

@media (prefers-reduced-motion: reduce) {
  .jm-panel { transition: none; }
  .jm-user, .jm-skel-row, .jm-canvas-skel span, .jm-live svg { animation: none; }
}
`;

export function MapStyles() {
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
