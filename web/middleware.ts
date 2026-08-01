import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Server-side Clerk, so `/api/agent/*` can ask WHO is calling.
 *
 * SCOPED TO API ROUTES ON PURPOSE — and narrowly at that. A broad matcher over
 * the whole site made every page 500 in a production build ("Failed to proxy
 * http://localhost:PORT/ — Parse Error: Expected HTTP/"), with Next 16.2.6
 * routing page requests through its proxy runtime once Clerk's handler was in
 * the chain. A trivial `NextResponse.next()` middleware over the same paths was
 * fine, so this is a Clerk-in-Next-16 interaction, not a matcher bug.
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
