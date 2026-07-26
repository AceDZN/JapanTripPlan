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

/** Base URL of the deployed eve trip agent, without a trailing slash. */
export function eveUrl(): string | undefined {
  const url = process.env.EVE_URL?.trim();
  return url ? url.replace(/\/+$/, "") : undefined;
}

/** Shared secret for the eve channel's Basic auth. Never sent to the browser. */
export function eveSecret(): string | undefined {
  const secret = process.env.EVE_SHARED_SECRET?.trim();
  return secret ? secret : undefined;
}

/** The durable transport is available only when both values are present. */
export function eveEnabled(): boolean {
  return Boolean(eveUrl() && eveSecret());
}
