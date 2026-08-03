/**
 * Server-side configuration, read from `process.env`.
 *
 * Local development: `web/.env.local` (see `.env.local.example`).
 * Vercel: project Settings → Environment Variables.
 */

/** JSON body with the charset the Hebrew error copy needs. */
export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/**
 * Explicit AI Gateway key, when one is configured.
 *
 * On Vercel the AI SDK authenticates to the Gateway through OIDC, so the key is
 * optional there; locally it is either this variable or an OIDC token pulled
 * with `vercel env pull`.
 */
export function gatewayApiKey(): string | undefined {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  return key ? key : undefined;
}

/**
 * Whether a Gateway call can authenticate at all: an explicit key, a pulled
 * OIDC token, or running on Vercel (where the token is injected per request).
 */
export function gatewayConfigured(): boolean {
  return Boolean(gatewayApiKey() || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

/** Where `npm run dev` starts the local agent. Matches scripts/dev.mjs. */
export const LOCAL_EVE_URL = "http://127.0.0.1:2000";

/**
 * Base URL of the eve trip agent, without a trailing slash.
 *
 * **In development this is the LOCAL agent, always** — `EVE_URL` in `.env.local`
 * points at the deployment, and silently talking to it from localhost is worse
 * than useless: you end up judging your unreleased work against a build that may
 * be months behind. That is not hypothetical. It cost a long debugging session
 * here: the chat looked broken locally, and the real explanation was that the
 * deployed agent was 24 commits old and did not have the wish tools at all.
 *
 * Escape hatch, for deliberately testing against the deployment:
 *   EVE_USE_DEPLOYED=1 npm run dev
 */
export function eveUrl(): string | undefined {
  const configured = process.env.EVE_URL?.trim();

  if (process.env.NODE_ENV === "development" && process.env.EVE_USE_DEPLOYED !== "1") {
    return (process.env.EVE_DEV_URL?.trim() || LOCAL_EVE_URL).replace(/\/+$/, "");
  }

  return configured ? configured.replace(/\/+$/, "") : undefined;
}

/** Shared secret for the eve channel's Basic auth. Never sent to the browser. */
export function eveSecret(): string | undefined {
  const secret = process.env.EVE_SHARED_SECRET?.trim();
  return secret ? secret : undefined;
}

/**
 * Whether the durable transport is available.
 *
 * The deployment needs both halves. The local agent does not: its channel admits
 * loopback callers through `localDev()` without a secret, so a fresh clone with
 * no `.env.local` still gets a working chat from `npm run dev` instead of a
 * silent fallback that looks like the feature is missing.
 */
export function eveEnabled(): boolean {
  if (!eveUrl()) return false;
  if (process.env.NODE_ENV === "development" && process.env.EVE_USE_DEPLOYED !== "1") return true;
  return Boolean(eveSecret());
}
