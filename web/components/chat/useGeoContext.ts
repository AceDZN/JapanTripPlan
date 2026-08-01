"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GEO_FRESH_MS,
  buildContextLine,
  isFreshFix,
  type GeoFix,
} from "./eve-protocol";

/**
 * Where and when the family is, attached to every outgoing turn.
 *
 * Rules that shape this hook:
 *   - The GPS is asked lazily, on the first send — never on page load, so the
 *     permission sheet appears in response to something the user did.
 *   - Sending is never blocked on a fix: the request has a short timeout, a
 *     defensive race guard on top of it, and any failure (denied, unavailable,
 *     timed out) silently drops the location clause.
 *   - A fix is cached in memory and localStorage and reused for 5 minutes, so
 *     only the first message of a session can ever wait.
 *   - The time clause is always sent; only the location clause is conditional.
 */

const FIX_KEY = "japan2026.chat.geo.v1";
const ENABLED_KEY = "japan2026.chat.geo.enabled.v1";

/** Short on purpose — a stale-but-instant answer beats a fresh-but-late one. */
const LOOKUP_TIMEOUT_MS = 4_000;
/** The platform may hand back a recent fix instead of powering up the GPS. */
const POSITION_MAX_AGE_MS = 2 * 60_000;

export type GeoContext = {
  /** The browser exposes a geolocation API at all. */
  supported: boolean;
  /** Sharing is switched on (default) — persisted across reloads. */
  enabled: boolean;
  /** The last send actually carried coordinates. */
  attached: boolean;
  toggle: () => void;
  /** Awaits a fix when needed. Used by the durable eve send path. */
  resolveContextLine: (options?: { voice?: boolean }) => Promise<string>;
  /** Never waits: uses a cached fix and warms one up for the next turn. */
  peekContextLine: (options?: { voice?: boolean }) => string;
};

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    // Default on; only an explicit "0" turns it off.
    return window.localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

function readStoredFix(): GeoFix | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FIX_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<GeoFix>;
    const { lat, lng, accuracy, at } = parsed;
    if (typeof lat !== "number" || typeof lng !== "number" || typeof at !== "number") return null;

    return { lat, lng, accuracy: typeof accuracy === "number" ? accuracy : 0, at };
  } catch {
    return null;
  }
}

function writeStoredFix(fix: GeoFix | null): void {
  try {
    if (fix) window.localStorage.setItem(FIX_KEY, JSON.stringify(fix));
    else window.localStorage.removeItem(FIX_KEY);
  } catch {
    // Private mode: the fix just will not survive a reload.
  }
}

/** One position request, resolving to `null` on any failure. Never rejects. */
function requestPosition(): Promise<GeoFix | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (fix: GeoFix | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(fix);
    };

    // Belt and braces: some browsers ignore the `timeout` option entirely.
    const guard = setTimeout(() => finish(null), LOOKUP_TIMEOUT_MS + 500);

    navigator.geolocation.getCurrentPosition(
      (position) =>
        finish({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy ?? 0),
          at: Date.now(),
        }),
      () => finish(null),
      {
        enableHighAccuracy: false,
        timeout: LOOKUP_TIMEOUT_MS,
        maximumAge: POSITION_MAX_AGE_MS,
      },
    );
  });
}

export function useGeoContext(): GeoContext {
  // Read lazily: the chat mounts client-only, so there is no SSR markup to
  // mismatch and no reason to bounce this through an effect.
  const [enabled, setEnabled] = useState<boolean>(readEnabled);
  const [attached, setAttached] = useState(false);
  const [supported] = useState<boolean>(
    () => typeof navigator !== "undefined" && "geolocation" in navigator,
  );

  const [initialFix] = useState<GeoFix | null>(readStoredFix);
  const fixRef = useRef<GeoFix | null>(initialFix);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef<Promise<GeoFix | null> | null>(null);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  /** Cached fix when fresh, otherwise one shared lookup. */
  const acquire = useCallback(async (): Promise<GeoFix | null> => {
    if (!enabledRef.current || !supported) return null;

    const cached = fixRef.current;
    if (isFreshFix(cached)) return cached;

    // Coalesce: a voice note and a typed question must not race two prompts.
    inFlightRef.current ??= requestPosition().finally(() => {
      inFlightRef.current = null;
    });

    const fix = await inFlightRef.current;
    if (fix) {
      fixRef.current = fix;
      writeStoredFix(fix);
    }
    // A stale cached fix still beats nothing when the lookup failed.
    return fix ?? cached ?? null;
  }, [supported]);

  const resolveContextLine = useCallback(
    async ({ voice = false } = {}): Promise<string> => {
      const location = await acquire();
      setAttached(Boolean(location));
      return buildContextLine({ now: new Date(), location, voice });
    },
    [acquire],
  );

  const peekContextLine = useCallback(
    ({ voice = false } = {}): string => {
      const cached = enabledRef.current ? fixRef.current : null;
      const location = isFreshFix(cached) ? cached : null;
      setAttached(Boolean(location));

      // Warm the cache so the next turn carries coordinates, without making this
      // one wait for the GPS.
      if (!location && enabledRef.current && supported) void acquire();

      return buildContextLine({ now: new Date(), location, voice });
    },
    [acquire, supported],
  );

  const toggle = useCallback(() => {
    setEnabled((current) => {
      const next = !current;
      enabledRef.current = next;
      try {
        window.localStorage.setItem(ENABLED_KEY, next ? "1" : "0");
      } catch {
        // preference simply will not survive a reload
      }
      if (!next) {
        // Switching off drops the stored coordinate, not just future sends.
        fixRef.current = null;
        writeStoredFix(null);
        setAttached(false);
      }
      return next;
    });
  }, []);

  return { supported, enabled, attached, toggle, resolveContextLine, peekContextLine };
}

export { GEO_FRESH_MS };
