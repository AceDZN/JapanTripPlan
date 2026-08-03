"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js so the trip works offline and the app is installable.
 *
 * Renders nothing. Skipped in dev (the service worker would shadow HMR) and on
 * insecure origins, where registration is rejected anyway.
 *
 * ## Why dev actively TEARS DOWN a worker instead of just not registering one
 *
 * A service worker is registered per ORIGIN, not per server. Run a production
 * build once on localhost:3000 and the worker it installs keeps controlling
 * that origin afterwards — including `next dev` on the same port, weeks later.
 *
 * Not registering was therefore never enough. And the failure it produces is
 * vicious rather than obvious: dev stylesheet URLs are stable across edits (a
 * production build content-hashes them, Turbopack in dev does not), so the
 * worker serves the FIRST stylesheet it ever cached, for ever. New CSS silently
 * never arrives. What that looked like in practice was a `next/image` with
 * `fill` whose container rule was missing, so the picture found no positioned
 * ancestor, escaped, and painted itself over the page hero — a bug with no
 * plausible connection to its cause.
 *
 * So in dev: unregister everything and drop the caches.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
        if (registrations.length === 0) return;

        await Promise.all(registrations.map((registration) => registration.unregister()));
        // The registration is gone but its caches are not, and a stale one is
        // exactly what would be served after the next reload.
        const names = await caches.keys().catch(() => [] as string[]);
        await Promise.all(names.map((name) => caches.delete(name)));

        console.info(
          "[sw] removed a leftover service worker and its caches — this origin " +
            "once served a production build. Reload to get uncached assets.",
        );
      })();
      return;
    }

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
