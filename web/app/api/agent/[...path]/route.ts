/**
 * /api/agent/* — relay to the durable eve trip agent.
 *
 * The browser never learns EVE_URL or EVE_SHARED_SECRET: this route holds the
 * credential and forwards to `${EVE_URL}/eve/v1/...` with HTTP Basic auth.
 * The NDJSON event stream is piped straight through, unbuffered, so the chat
 * renders deltas as they arrive.
 *
 * Routes (eve/docs/channels/eve.mdx):
 *   POST /api/agent/session            -> POST /eve/v1/session
 *   POST /api/agent/session/:id        -> POST /eve/v1/session/:id
 *   POST /api/agent/session/:id/cancel -> POST /eve/v1/session/:id/cancel
 *   GET  /api/agent/session/:id/stream -> GET  /eve/v1/session/:id/stream
 *
 * `/api/agent/enabled` is served by its own handler and never reaches here.
 */

import { eveSecret, eveUrl, jsonResponse } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The durable agent can think for a while before the stream settles. */
export const maxDuration = 300;

const AGENT_ROUTES: Array<{ pattern: RegExp; method: "GET" | "POST" }> = [
  { pattern: /^\/session$/, method: "POST" },
  { pattern: /^\/session\/[A-Za-z0-9_.:-]{1,190}$/, method: "POST" },
  { pattern: /^\/session\/[A-Za-z0-9_.:-]{1,190}\/cancel$/, method: "POST" },
  { pattern: /^\/session\/[A-Za-z0-9_.:-]{1,190}\/stream$/, method: "GET" },
];

/** Basic auth header for the eve channel: base64("family:<secret>"). */
function eveAuthorization(secret: string): string {
  return `Basic ${Buffer.from(`family:${secret}`, "utf8").toString("base64")}`;
}

async function relay(request: Request): Promise<Response> {
  const base = eveUrl();
  const secret = eveSecret();

  if (!base || !secret) {
    return jsonResponse({ error: "הסוכן המתמשך לא מוגדר. הצ׳אט עובד במצב הרגיל." }, 503);
  }

  const url = new URL(request.url);
  const suffix = url.pathname.slice("/api/agent".length);
  const route = AGENT_ROUTES.find((candidate) => candidate.pattern.test(suffix));

  if (!route) return jsonResponse({ error: "נתיב לא מוכר." }, 404);
  if (request.method !== route.method) {
    return jsonResponse({ error: "שיטת בקשה לא נתמכת." }, 405);
  }

  // Only the documented cursor parameter is forwarded — nothing else from the
  // client's query string reaches the agent.
  const startIndex = url.searchParams.get("startIndex");
  const query =
    route.method === "GET" && startIndex !== null && /^-?\d{1,12}$/.test(startIndex)
      ? `?startIndex=${startIndex}`
      : "";

  const target = `${base}/eve/v1${suffix}${query}`;

  const headers = new Headers({
    authorization: eveAuthorization(secret),
    accept: route.method === "GET" ? "application/x-ndjson" : "application/json",
  });

  let body: string | undefined;
  if (route.method === "POST") {
    headers.set("content-type", "application/json");
    body = await request.text();
    if (!body) body = "{}";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, { method: route.method, headers, body, cache: "no-store" });
  } catch {
    return jsonResponse({ error: "אין תשובה מהסוכן. בדקו את החיבור ונסו שוב." }, 502);
  }

  const out = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": "no-store",
    // Defensive: keep intermediaries from buffering the NDJSON stream.
    "x-accel-buffering": "no",
  });

  const sessionId = upstream.headers.get("x-eve-session-id");
  if (sessionId) out.set("x-eve-session-id", sessionId);

  // `upstream.body` is passed as-is, so events reach the browser as they land.
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = relay;
export const POST = relay;
