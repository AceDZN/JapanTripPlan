"use client";

import { useEffect } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  THEME_ORDER,
  applyTheme,
  readPref,
  resolveTheme,
  type ThemePref,
} from "@/lib/theme";

const LABELS: Record<ThemePref, string> = {
  system: "ערכת נושא: לפי המערכת",
  light: "ערכת נושא: בהיר",
  dark: "ערכת נושא: כהה",
};

/**
 * A leaf client component — the only client-side owner of theme state.
 *
 * It deliberately holds no React state: which icon shows is decided by CSS off
 * `data-theme-pref` on <html>, which the boot script already stamped before
 * hydration. That means no mount gate, no hydration mismatch, and no icon
 * flicker on the first frame.
 */
export function ThemeToggle() {
  // While the choice is "follow the system", track the OS flipping (macOS
  // auto-dark at sunset, Android battery saver) and re-resolve.
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (readPref() !== "system") return;
      document.documentElement.dataset.theme = resolveTheme("system");
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const cycle = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(readPref()) + 1) % THEME_ORDER.length];
    applyTheme(next);
  };

  return (
    <button type="button" className="theme-toggle" onClick={cycle}>
      <span className="theme-ic" data-pref="system">
        <Monitor size={17} strokeWidth={1.9} />
        <span className="sr-only">{LABELS.system}</span>
      </span>
      <span className="theme-ic" data-pref="light">
        <Sun size={17} strokeWidth={1.9} />
        <span className="sr-only">{LABELS.light}</span>
      </span>
      <span className="theme-ic" data-pref="dark">
        <Moon size={17} strokeWidth={1.9} />
        <span className="sr-only">{LABELS.dark}</span>
      </span>
    </button>
  );
}
