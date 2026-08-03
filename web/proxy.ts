import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Server-side Clerk, so `/api/agent/*` can ask WHO is calling.
 *
 * `proxy.ts`, the Next 16 name. `middleware.ts` is deprecated:
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * This file was briefly renamed BACK to `middleware.ts` on the belief that
 * `proxy.ts` 404s every page route in dev. It does not. That was a stale
 * `.next/` cache surviving the rename: clear it and all 13 page routes serve
 * 200, `/api/agent/*` included. If a rename ever appears to break routing,
 * `rm -rf .next` before concluding anything about the filename.
 *
 * Clerk supports the name — @clerk/nextjs looks for `middleware` OR `proxy` on
 * Next 16+ (`isNext16OrHigher` in its `fs/middleware-location`), so
 * `clerkMiddleware()` keeps its own name here. That is Clerk's export, not the
 * file convention. The codemod only renames a NAMED `middleware` export; this
 * is a default export, so there is nothing to rename.
 *
 * SCOPED TO API ROUTES ON PURPOSE. Not for correctness — a site-wide matcher
 * works fine — but because nothing else needs it, and every matched request
 * pays for the proxy hop.
 *
 * Worth recording, because it cost hours to find and looks like a bug in this
 * file: whenever a request matches, Next 16 re-issues it to
 * `http://localhost:PORT`. Serve with `next start --hostname 127.0.0.1` and
 * that lookup resolves to `::1`, which nothing is bound to, so every matched
 * route dies with `Failed to proxy … Parse Error: Expected HTTP/` and a 500.
 * It is not Clerk and it is not the matcher — a bare `NextResponse.next()`
 * fails identically, and binding to `localhost` fixes it with Clerk in place.
 * `tests/rendered-html.test.mjs` therefore boots the harness on `localhost`.
 *
 * Nothing is lost by scoping it: the pages never needed server-side auth. They
 * are public by design — every route is server-rendered and precached so the
 * app still works on a phone in a Tokyo basement — and private data is guarded
 * by `requireFamily()` inside Convex, not by routing. The one place that needs
 * to know the caller is the eve relay, and that is an API route.
 *
 * This deliberately protects nothing: `clerkMiddleware()` with no argument only
 * attaches the auth context. It does not gate a single route.
 */
export default clerkMiddleware();

export const config = {
  matcher: ["/api/agent/:path*"],
};
