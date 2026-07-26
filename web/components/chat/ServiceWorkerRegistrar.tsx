"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the trip works offline and the app is installable.
 *
 * Renders nothing. Skipped in dev (the service worker would shadow HMR) and on
 * insecure origins, where registration is rejected anyway.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const { protocol, hostname } = window.location;
    const secure = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
    if (!secure) return;

    let cancelled = false;

    const register = () => {
      if (cancelled) return;
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Offline support is a bonus — never break the app over it.
      });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", register);
    };
  }, []);

  return null;
}
