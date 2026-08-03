/**
 * Live Convex access for the agent.
 *
 * Everything else this agent reads (`agent/data/content.ts`) is a snapshot
 * baked in at build time — fine for the itinerary, which changes rarely and
 * deliberately, useless for the wish list, which changes while the family is
 * standing in a shop. So wishes go over HTTP to Convex on every call.
 *
 * The service key is the trip owner's credential: these routes bypass the
 * per-person visibility rule and can see PRIVATE wishes. That is required —
 * researching a surprise present is the point — and it is exactly why the key
 * lives only in this server's environment and why `instructions.md` forbids
 * repeating a private wish to anyone but its owner.
 */

const SITE_URL = process.env.CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

export const CONVEX_UNCONFIGURED =
  "Convex is not configured for this agent (CONVEX_SITE_URL / AGENT_SERVICE_KEY missing). " +
  "The wish list cannot be read or written until it is.";

export function convexConfigured(): boolean {
  return Boolean(SITE_URL && KEY);
}

async function call(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${SITE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body || (body as { ok?: boolean }).ok === false) {
    throw new Error(
      `Convex ${path} failed (${response.status}): ${JSON.stringify(body)?.slice(0, 300)}`,
    );
  }
  return body;
}

export async function convexGet(path: string): Promise<unknown> {
  return call(path, { method: "GET" });
}

export async function convexPost(path: string, body: unknown): Promise<unknown> {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Copy an image found on the web into Convex storage.
 *
 * Storing the bytes rather than the URL is deliberate: a wish that points at a
 * shop's CDN is one redesign away from a broken picture, and the family will
 * be opening these pages offline in Japan.
 */
export async function storeImageFromUrl(
  url: string,
): Promise<{ storageId: string; sourceUrl: string }> {
  const source = await fetch(url, { cache: "no-store" });
  if (!source.ok) throw new Error(`could not fetch image (${source.status}): ${url}`);

  const type = source.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) {
    throw new Error(`not an image (${type || "unknown type"}): ${url}`);
  }

  const bytes = await source.arrayBuffer();
  // Convex file storage is not a media library; refuse anything unreasonable
  // rather than filling the trip's storage with one 40 MB press photo.
  const MAX_BYTES = 5_000_000;
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`image is too large (${Math.round(bytes.byteLength / 1000)} kB): ${url}`);
  }

  const response = await fetch(`${SITE_URL}/agent/wishes/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": type },
    body: bytes,
  });
  const body = (await response.json()) as { ok?: boolean; storageId?: string };
  if (!response.ok || !body.ok || !body.storageId) {
    throw new Error(`image upload failed (${response.status})`);
  }

  return { storageId: body.storageId, sourceUrl: url };
}
