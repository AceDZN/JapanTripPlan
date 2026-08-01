"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * The one place the app asks the device where it is.
 *
 * Everything on the street depends on this — /around ranks 150 places by walking
 * distance from it, /map centres on it, and the chat attaches it to every turn —
 * so the rules are deliberate:
 *
 *   - **Nothing is requested behind the user's back.** When the browser has not
 *     been asked yet we render a button and wait for a tap. An auto-request on
 *     page load is exactly how a permission sheet gets dismissed by reflex (or
 *     suppressed outright by Chrome after a couple of dismissals), leaving a
 *     screen that says "locating…" forever with no way back.
 *   - **Already-granted is resumed silently.** The Permissions API tells us
 *     before we touch the GPS, so a returning visitor gets their dot with no
 *     prompt and no tap.
 *   - **Live, not one-shot.** `watchPosition` keeps the dot honest while the
 *     family walks. A single fix goes stale the moment they cross the street.
 *   - **Failures are named.** Denied, timed out, no signal and insecure-origin
 *     are four different problems with four different fixes; collapsing them
 *     into "couldn't locate you" is what makes a location feature feel broken.
 *
 * The last fix is mirrored into the same localStorage key the chat reads
 * (`japan2026.chat.geo.v1`), so opening the map warms the location the
 * concierge will quote back, and neither surface prompts twice.
 */

/** Mirrors `GeoFix` in components/chat/eve-protocol.ts — same key, same shape. */
const SHARED_FIX_KEY = "japan2026.chat.geo.v1";

/** Past this age a fix is shown as "last known" rather than "here". */
export const FIX_FRESH_MS = 5 * 60_000;

const ONE_SHOT_TIMEOUT_MS = 12_000;
const WATCH_TIMEOUT_MS = 20_000;
/** A fix this recent is good enough to show instantly while the GPS warms up. */
const ACCEPTABLE_AGE_MS = 60_000;

export type GeoPermission = "unknown" | "prompt" | "granted" | "denied";
export type GeoStatus = "idle" | "locating" | "ready" | "error";

export type GeoErrorKind =
  /** The user (or the OS, or a policy) said no. */
  | "denied"
  /** Page is not on HTTPS, so the API is unavailable by spec. */
  | "insecure"
  /** No geolocation API in this browser at all. */
  | "unsupported"
  /** Asked, but no fix arrived in time. */
  | "timeout"
  /** The device tried and failed — no GPS, no wifi positioning, airplane mode. */
  | "unavailable";

export type GeoFix = {
  lat: number;
  lng: number;
  /** Radius in metres, as reported by the device. */
  accuracy: number;
  /** Degrees clockwise from true north while moving, when the device knows. */
  heading: number | null;
  /** Metres per second, when the device knows. */
  speed: number | null;
  /** Epoch ms when the fix was taken. */
  at: number;
};

export type GeoLocation = {
  /** A geolocation API exists and the origin is allowed to use it. */
  supported: boolean;
  permission: GeoPermission;
  status: GeoStatus;
  /** Best known position — may be stale; check `stale` before trusting it. */
  fix: GeoFix | null;
  stale: boolean;
  error: GeoErrorKind | null;
  /** A live `watchPosition` subscription is running. */
  watching: boolean;
  /** True when a tap is the only thing standing between us and a fix. */
  needsPermission: boolean;
  /** Ask now. Safe to call from a click; that is where it belongs. */
  request: () => void;
  /** Subscribe to live updates. Idempotent. */
  startWatch: () => void;
  stopWatch: () => void;
  /** Forget the position, here and in the shared store. */
  clear: () => void;
};

/* ------------------------------------------------------------------ store */

/**
 * The stored fix is exposed as a proper external store rather than seeded in an
 * effect. That keeps it hydration-safe (the server snapshot is simply `null`)
 * and means two open surfaces — the map and the chat — see the same position
 * without either of them prompting twice.
 */

function parseFix(raw: string | null): GeoFix | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<GeoFix>;
    const { lat, lng, at } = parsed;
    if (typeof lat !== "number" || typeof lng !== "number" || typeof at !== "number") return null;

    return {
      lat,
      lng,
      accuracy: typeof parsed.accuracy === "number" ? parsed.accuracy : 0,
      heading: typeof parsed.heading === "number" ? parsed.heading : null,
      speed: typeof parsed.speed === "number" ? parsed.speed : null,
      at,
    };
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
// `getSnapshot` must return a referentially stable value between reads or React
// re-renders forever, so the parsed object is memoised against the raw string.
let cachedRaw: string | null = null;
let cachedFix: GeoFix | null = null;

function subscribeSharedFix(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` only fires in *other* tabs, so local writes notify explicitly.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function sharedFixSnapshot(): GeoFix | null {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SHARED_FIX_KEY);
  } catch {
    return cachedFix;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedFix = parseFix(raw);
  }
  return cachedFix;
}

/** No stored fix exists on the server; the client fills it in after hydration. */
function serverFixSnapshot(): GeoFix | null {
  return null;
}

function writeSharedFix(fix: GeoFix | null): void {
  try {
    if (fix) window.localStorage.setItem(SHARED_FIX_KEY, JSON.stringify(fix));
    else window.localStorage.removeItem(SHARED_FIX_KEY);
  } catch {
    // Private mode or a full quota: the fix simply will not outlive the tab.
  }
  for (const listener of listeners) listener();
}

function toFix(position: GeolocationPosition): GeoFix {
  const { latitude, longitude, accuracy, heading, speed } = position.coords;
  return {
    lat: latitude,
    lng: longitude,
    accuracy: Math.round(accuracy ?? 0),
    // A stationary device reports NaN here on some platforms, not null.
    heading: Number.isFinite(heading) ? (heading as number) : null,
    speed: Number.isFinite(speed) ? (speed as number) : null,
    at: position.timestamp || Date.now(),
  };
}

function toErrorKind(error: GeolocationPositionError): GeoErrorKind {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

/** Why the browser cannot help us, or `null` when it can. */
function detectBlocker(): GeoErrorKind | null {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return "unsupported";
  // Chrome removed geolocation from insecure origins; the call just fails
  // forever with no prompt, which is indistinguishable from a silent bug.
  if (typeof window !== "undefined" && window.isSecureContext === false) return "insecure";
  return null;
}

/** Browser capability never changes mid-session, so there is nothing to watch. */
function subscribeBlocker(): () => void {
  return () => undefined;
}

/** The server cannot know; it renders the optimistic "we can locate you" path. */
function serverBlocker(): GeoErrorKind | null {
  return null;
}

/* ------------------------------------------------------------------- hook */

export type GeoLocationOptions = {
  /**
   * Resume watching without a tap when permission was already granted.
   * On by default: a returning visitor has already agreed once.
   */
  autoResume?: boolean;
  /** Keep a live subscription rather than taking a single fix. */
  watch?: boolean;
};

export function useGeoLocation(options: GeoLocationOptions = {}): GeoLocation {
  const { autoResume = true, watch = true } = options;

  const [permission, setPermission] = useState<GeoPermission>("unknown");
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [reportedError, setReportedError] = useState<GeoErrorKind | null>(null);
  const [watching, setWatching] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const watchIdRef = useRef<number | null>(null);
  const wantWatchRef = useRef(watch);

  /* ------------------------------------------------------- external state */
  // Both of these are browser facts, not React state, so they are read through
  // `useSyncExternalStore` — hydration-safe, and no effect-then-setState dance.
  const fix = useSyncExternalStore(subscribeSharedFix, sharedFixSnapshot, serverFixSnapshot);
  const blocker = useSyncExternalStore(subscribeBlocker, detectBlocker, serverBlocker);

  /** A hard blocker outranks anything the API had a chance to report. */
  const error = blocker ?? reportedError;

  /* ------------------------------------------------------- permission */
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    let detach: (() => void) | null = null;

    const sync = (state: PermissionState) => {
      if (cancelled) return;
      setPermission(state === "granted" ? "granted" : state === "denied" ? "denied" : "prompt");
      // A permission revoked in site settings must not leave a stale dot behind.
      if (state === "denied") {
        setStatus("error");
        setReportedError("denied");
      }
    };

    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((result) => {
        if (cancelled) return;
        sync(result.state);
        const onChange = () => sync(result.state);
        result.addEventListener("change", onChange);
        detach = () => result.removeEventListener("change", onChange);
      })
      // Safari < 16 and a few embedded webviews have no geolocation descriptor;
      // "unknown" is the correct answer there, and the CTA covers it.
      .catch(() => undefined);

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  /* ------------------------------------------------------- acquisition */
  const accept = useCallback((position: GeolocationPosition) => {
    // The write is what publishes the fix: `useSyncExternalStore` picks it up
    // here and in every other surface subscribed to the same key.
    writeSharedFix(toFix(position));
    setStatus("ready");
    setReportedError(null);
    setNow(Date.now());
    // A fix is proof of consent even when the Permissions API stayed quiet.
    setPermission("granted");
  }, []);

  const reject = useCallback((positionError: GeolocationPositionError) => {
    const kind = toErrorKind(positionError);
    setReportedError(kind);
    setStatus("error");
    if (kind === "denied") setPermission("denied");
  }, []);

  const stopWatch = useCallback(() => {
    wantWatchRef.current = false;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setWatching(false);
  }, []);

  const startWatch = useCallback(() => {
    if (detectBlocker()) return;
    wantWatchRef.current = true;
    if (watchIdRef.current !== null) return;

    setStatus((current) => (current === "ready" ? current : "locating"));
    watchIdRef.current = navigator.geolocation.watchPosition(accept, reject, {
      enableHighAccuracy: true,
      timeout: WATCH_TIMEOUT_MS,
      maximumAge: ACCEPTABLE_AGE_MS,
    });
    setWatching(true);
  }, [accept, reject]);

  const request = useCallback(() => {
    // A blocker is already surfaced through `error`; there is nothing to ask.
    if (detectBlocker()) return;

    setStatus(() => "locating");
    setReportedError(() => null);

    // One immediate fix so something appears at once, then the live watch takes
    // over. Asking only for the watch can leave the screen empty for seconds.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        accept(position);
        if (wantWatchRef.current) startWatch();
      },
      (positionError) => {
        reject(positionError);
        // A timeout is not a refusal — the watch may still land a fix later.
        if (positionError.code !== positionError.PERMISSION_DENIED && wantWatchRef.current) {
          startWatch();
        }
      },
      { enableHighAccuracy: true, timeout: ONE_SHOT_TIMEOUT_MS, maximumAge: ACCEPTABLE_AGE_MS },
    );
  }, [accept, reject, startWatch]);

  /* ------------------------------------------------------- auto resume */
  // Permission was granted in an earlier visit, so resuming needs no tap and no
  // prompt. This is a subscription to the device, which is exactly what effects
  // are for — the one-shot path reports through `accept`/`reject` callbacks.
  useEffect(() => {
    if (!autoResume || blocker || permission !== "granted") return;
    if (watchIdRef.current !== null) return;
    if (watch) {
      startWatch();
      return;
    }
    navigator.geolocation.getCurrentPosition(accept, reject, {
      enableHighAccuracy: true,
      timeout: ONE_SHOT_TIMEOUT_MS,
      maximumAge: ACCEPTABLE_AGE_MS,
    });
  }, [autoResume, blocker, permission, watch, startWatch, accept, reject]);

  /* ------------------------------------------------------- lifecycle */
  useEffect(() => {
    wantWatchRef.current = watch;
  }, [watch]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  // Drop the watch while the tab is hidden — a phone in a pocket has no reason
  // to keep the GPS warm — and pick it back up on return.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (watchIdRef.current !== null) {
          navigator.geolocation.clearWatch(watchIdRef.current);
          watchIdRef.current = null;
          setWatching(false);
          // Keep the intent: `startWatch` cleared it, `stopWatch` would not.
          wantWatchRef.current = true;
        }
      } else if (wantWatchRef.current && permission === "granted") {
        startWatch();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [permission, startWatch]);

  // Re-render on a slow tick so "last known · 4 דק׳" ages honestly without the
  // caller having to poll.
  useEffect(() => {
    if (!fix) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [fix]);

  const clear = useCallback(() => {
    stopWatch();
    writeSharedFix(null);
    setStatus("idle");
    setReportedError(null);
  }, [stopWatch]);

  const supported = blocker === null;
  const stale = fix !== null && now - fix.at > FIX_FRESH_MS;

  return {
    supported,
    permission,
    status,
    fix,
    stale,
    error,
    watching,
    needsPermission: supported && permission !== "granted" && status !== "ready",
    request,
    startWatch,
    stopWatch,
    clear,
  };
}

/* ------------------------------------------------------------------ copy */

/** Hebrew explanation of a failure, paired with what to actually do about it. */
export function geoErrorCopy(kind: GeoErrorKind): { title: string; body: string } {
  switch (kind) {
    case "denied":
      return {
        title: "הגישה למיקום חסומה",
        body: "הדפדפן חוסם את המיקום לאתר הזה. פותחים את הגדרות האתר (הסמל שליד הכתובת) ← מיקום ← אישור, ואז לוחצים על נסו שוב. בינתיים אפשר לבחור שכונה ידנית — הכול עובד גם ככה.",
      };
    case "insecure":
      return {
        title: "החיבור לא מאובטח",
        body: "דפדפנים מאפשרים מיקום רק בחיבור HTTPS. נכנסים לכתובת עם https:// ומנסים שוב.",
      };
    case "unsupported":
      return {
        title: "אין שירותי מיקום בדפדפן הזה",
        body: "הדפדפן לא תומך באיתור מיקום. בוחרים שכונה ידנית וממשיכים כרגיל.",
      };
    case "timeout":
      return {
        title: "לוקח יותר מדי זמן לאתר",
        body: "לא הגיע איתות GPS בזמן — קורה בתוך בניינים וברכבת התחתית. אפשר לצאת החוצה ולנסות שוב, או לבחור שכונה ידנית.",
      };
    case "unavailable":
    default:
      return {
        title: "אי אפשר לאתר מיקום כרגע",
        body: "המכשיר לא הצליח למצוא מיקום. בודקים שהמיקום מופעל בהגדרות הטלפון ושאין מצב טיסה, או בוחרים שכונה ידנית.",
      };
  }
}

/** "לפני 4 דק׳" for an aging fix. */
export function formatFixAge(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return "עכשיו";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `לפני ${minutes} דק׳`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `לפני ${hours} ש׳` : "לפני יותר מיום";
}
