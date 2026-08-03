/**
 * Light / dark theming.
 *
 * The resolved theme lives in a `data-theme` attribute on <html>, stamped by a
 * blocking inline script in the document head (see `themeBootScript`) before
 * the browser paints a single pixel. That is what keeps theming out of React:
 * the root layout stays a server component, every stylesheet keys off the
 * attribute, and nothing flashes on first paint.
 *
 * Two attributes, not one:
 *   data-theme="light|dark"             — what is actually shown; styles use this
 *   data-theme-pref="light|dark|system" — what the user chose; the toggle uses this
 *
 * Because the boot script always resolves "system" down to a concrete value,
 * the CSS never needs `@media (prefers-color-scheme: …)` for tokens — a single
 * `:root[data-theme="dark"]` block is the whole dark palette. The trade-off is
 * that with JavaScript disabled the app stays light; acceptable here, since the
 * shell, the chat and the live Convex data need JS regardless.
 */

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "jp2026:theme";

/** Browser chrome colour per theme — mirrors --bg in globals.css. */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: "#faf7f2",
  dark: "#0f1120",
};

/** Cycle order for the header button: follow the system, then pin either way. */
export const THEME_ORDER: ThemePref[] = ["system", "light", "dark"];

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  return pref === "system" ? systemTheme() : pref;
}

export function readPref(): ThemePref {
  const stored = document.documentElement.dataset.themePref;
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * Applies a preference to the live document: attributes first (so styles and
 * the map's observer react immediately), then the durable bits.
 */
export function applyTheme(pref: ThemePref): ResolvedTheme {
  const root = document.documentElement;
  const resolved = resolveTheme(pref);

  root.dataset.theme = resolved;
  root.dataset.themePref = pref;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private browsing or a blocked origin — the theme still applies, it just
    // won't survive a reload.
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[resolved]);

  return resolved;
}

/**
 * The toggle renders all three icons and lets CSS reveal the one matching
 * data-theme-pref. That markup is meaningless without its rule, and a
 * stylesheet can arrive stale or late — during a deploy, or from a cache — in
 * which case the header collapses into three stacked icons and three labels.
 *
 * So the rule ships inline, in the same document as the markup. Small enough to
 * cost nothing, and it can never be out of sync with what it styles. The
 * cosmetics of the button still live in globals.css.
 */
export const themeBootStyle =
  ".theme-ic{display:none}" +
  ':root[data-theme-pref="system"] .theme-ic[data-pref="system"],' +
  ":root:not([data-theme-pref]) .theme-ic[data-pref=\"system\"]," +
  ':root[data-theme-pref="light"] .theme-ic[data-pref="light"],' +
  ':root[data-theme-pref="dark"] .theme-ic[data-pref="dark"]{display:inline-flex;align-items:center}' +
  // Tailwind's own sr-only would do, but it lives in the stylesheet this block
  // exists to survive — without it the label prints across the header.
  ".theme-ic .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}";

/**
 * Runs synchronously in <head>, before first paint. Kept as a hand-minified
 * string rather than a bundled module because it must not wait on a network
 * fetch or on hydration. Reads its constants from the exports above so the two
 * can never drift.
 */
export const themeBootScript = `(function(){var d=document.documentElement,p="system";try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(s==="light"||s==="dark")p=s}catch(e){}var r=p==="system"?(window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches?"dark":"light"):p;d.dataset.theme=r;d.dataset.themePref=p;var m=document.createElement("meta");m.name="theme-color";m.content=r==="dark"?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)};d.querySelector("head").appendChild(m)})();`;
