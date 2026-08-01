/*
 * יפן 2026 — service worker.
 *
 * Dependency-free. Three caches, all namespaced by VERSION so a bump wipes
 * everything stale on activate:
 *
 *   shell    precached app-shell documents + /markdown/*.md + manifest/icons
 *   runtime  stale-while-revalidate for pages and build assets
 *   images   cache-first for photos, populated lazily as they are visited
 *
 * Deliberately NOT precached: /images/** (~18MB). Images are cached the first
 * time they are actually shown, so an install stays small and fast.
 *
 * Bump VERSION whenever the precache list or a caching rule changes.
 */

const VERSION = "japan2026-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const IMAGE_CACHE = `${VERSION}-images`;
const OWNED_CACHES = [SHELL_CACHE, RUNTIME_CACHE, IMAGE_CACHE];

const OFFLINE_FALLBACK = "/";

const DAY_ROUTES = Array.from({ length: 17 }, (_, i) => `/day/${i + 1}`);

const MARKDOWN_FILES = [
  "00-OVERVIEW",
  "01-FLIGHTS",
  "02-ACCOMMODATION",
  "03-TRANSPORT",
  "04-ANIME-POKEMON-GHIBLI",
  "05-FOOD-GUIDE",
  "06-DAY-TRIPS",
  "07-BAR-MITZVAH",
  "08-PRACTICAL-TIPS",
  "09-DAILY-ITINERARY",
  "10-BUDGET",
  "11-PRE-TRIP-CHECKLIST",
].map((name) => `/markdown/${name}.md`);

const PRECACHE_URLS = [
  "/",
  "/itinerary",
  "/prepare",
  "/guides",
  "/map",
  "/around",
  "/chat",
  // The vault matters most exactly when there is no signal — standing at a
  // lockbox needing a door code. The page shell is public; the records behind
  // it still require a family session.
  "/private",
  ...DAY_ROUTES,
  ...MARKDOWN_FILES,
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

/* --------------------------------------------------------------- helpers */

function isCacheable(response) {
  return Boolean(response) && response.status === 200 && response.type === "basic";
}

/** Serve from cache immediately, refresh in the background. */
async function staleWhileRevalidate(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (isCacheable(response)) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;
  throw new Error("offline and not cached");
}

/** Serve from cache if present; otherwise fetch once and keep it. */
async function cacheFirst(cacheName, request) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) cache.put(request, response.clone());
  return response;
}

/** Fresh pages when online; the cached page (or "/") when not. */
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await caches.match(request, { ignoreSearch: true })) ??
      (await caches.match(OFFLINE_FALLBACK));
    if (cached) return cached;
    return new Response(
      "<!doctype html><html lang=\"he\" dir=\"rtl\"><meta charset=\"utf-8\">" +
        "<title>אין חיבור</title>" +
        "<body style=\"font-family:system-ui;background:#0f1120;color:#f3f1ec;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px\">" +
        "<div><h1 style=\"font-size:24px;margin:0 0 8px\">אין חיבור לאינטרנט</h1>" +
        "<p style=\"opacity:.7;margin:0\">הדף הזה עוד לא נשמר במכשיר. חזרו לעמוד הבית כשיהיה חיבור.</p></div></body></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

/* ---------------------------------------------------------------- events */

/**
 * Precache the build's stylesheets.
 *
 * The precached documents reference hashed CSS under /_next/static/, whose
 * filenames change every build. Without this, an offline cold open served
 * correct HTML with a stylesheet that was not in any cache — the page came up
 * fully readable and completely unstyled. That is exactly what a family member
 * would get on a train with no signal.
 *
 * The URLs are discovered from the shell documents rather than hard-coded,
 * because the hashes are unknowable until build time.
 *
 * JS chunks are deliberately left to the runtime stale-while-revalidate cache:
 * pages are server-rendered so they read fine without hydration, and
 * precaching every chunk would bloat the install.
 */
async function precacheBuildStyles(shellCache, documents) {
  const hrefs = new Set();

  for (const url of documents) {
    const cached = await shellCache.match(url);
    if (!cached) continue;
    const html = await cached.clone().text();
    // The trailing query matters: on Vercel every asset URL carries a
    // ?dpl=<deployment> suffix, so a pattern anchored on `.css"` matches
    // nothing in production while working perfectly against a local build.
    for (const match of html.matchAll(/href="(\/_next\/static\/[^"]+?\.css(?:\?[^"]*)?)"/g)) {
      hrefs.add(match[1]);
    }
  }

  // Into the RUNTIME cache, not the shell cache: build assets are served by
  // the stale-while-revalidate branch of the fetch handler, which only ever
  // looks in RUNTIME_CACHE. Caching them anywhere else is invisible to it.
  const runtime = await caches.open(RUNTIME_CACHE);
  await Promise.allSettled(
    [...hrefs].map(async (href) => {
      const response = await fetch(href, { cache: "reload" });
      if (isCacheable(response)) await runtime.put(href, response);
    }),
  );

  return hrefs.size;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individually, so one 404 doesn't fail the whole install.
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          const response = await fetch(url, { cache: "reload" });
          if (isCacheable(response)) await cache.put(url, response);
        }),
      );
      // Never let a missing stylesheet fail the install — an unstyled app
      // still beats no app.
      try {
        await precacheBuildStyles(cache, ["/", ...DAY_ROUTES]);
      } catch {
        /* ignore */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !OWNED_CACHES.includes(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cross-origin (OSM tiles, Overpass, …) — leave to the browser.
  if (url.origin !== self.location.origin) return;

  // Never cache or intercept the API — the chat must always hit the network.
  if (url.pathname.startsWith("/api/")) return;

  /*
   * Never cache an RSC payload.
   *
   * These are the Flight streams Next fetches for client-side navigation. They
   * are BUILD-COUPLED — a payload carries the client-component module ids of
   * the build that produced it — but their URL is stable across builds. So a
   * cached payload from an older build gets replayed against the current JS
   * bundle, the Flight client cannot resolve those ids, and it throws
   * "Cannot read properties of null (reading 'enqueueModel')" or
   * "the module factory is not available". Both look like application bugs and
   * are not.
   *
   * Nothing is lost offline: `navigationHandler` already serves the precached
   * document for a real navigation, and a failed RSC prefetch degrades to a
   * full browser navigation, which is the fallback Next logs and handles.
   */
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  // Photos: cache-first, populated as the user browses.
  if (url.pathname.startsWith("/images/") || url.pathname === "/_vinext/image") {
    event.respondWith(cacheFirst(IMAGE_CACHE, request).catch(() => Response.error()));
    return;
  }

  // Trip documents: instant from cache, refreshed in the background.
  if (url.pathname.startsWith("/markdown/")) {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request).catch(() => Response.error()));
    return;
  }

  // Page navigations: network-first with an offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  // Everything else same-origin (build assets, fonts, icons, manifest, RSC
  // payloads): stale-while-revalidate.
  event.respondWith(staleWhileRevalidate(RUNTIME_CACHE, request).catch(() => Response.error()));
});
