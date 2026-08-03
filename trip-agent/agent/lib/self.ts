/**
 * Talking to our own eve channel over HTTP.
 *
 * WHY HTTP AND NOT AN IN-PROCESS CALL. eve has exactly one mechanism for
 * appending to a session that already exists: a `send()` addressed by that
 * session's continuation token. `channel/send.js` tries `runtime.deliver({
 * continuationToken })` first and only starts a new session when no active one
 * owns the token. Authored code reaches that mechanism through a channel route
 * (`args.send`) or through `args.receive(channel, …)` — and `receive` requires
 * the TARGET channel to implement a `receive` hook, which `eveChannel()` does
 * not (there is no `receive` anywhere in eve's compiled eve-channel module).
 * Continuation tokens are also channel-namespaced (`${channelName}:${raw}`), so
 * a custom channel we could add cannot address a session the eve channel owns.
 *
 * What is left is the documented public route — `POST /eve/v1/session/:id` with
 * the session's `continuationToken` (eve/docs/channels/eve.mdx) — which is
 * exactly the same code path the family's browser uses for a follow-up. So the
 * agent calls its own deployment.
 *
 * Two operations live here:
 *   - `startBackgroundSession` → `POST /eve/v1/session`. Returns as soon as the
 *     session exists (202); the run itself continues durably on its own.
 *   - `deliverToSession` → `POST /eve/v1/session/:id`. Wakes a parked chat and
 *     starts a turn in it. This is the "push into the conversation" half.
 */

/** The username half of the family credential the eve channel expects. */
const FAMILY_USERNAME = "family";

/** A background run starts fast; anything slower than this is a failure. */
const REQUEST_TIMEOUT_MS = 20_000;

export const SELF_API_UNCONFIGURED =
  "The agent cannot reach its own HTTP channel (no EVE_SELF_URL / EVE_URL / VERCEL_URL, " +
  "and no local dev server). Background research cannot be started.";

function trimSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * Where this deployment answers its own requests.
 *
 * `VERCEL_URL` is set automatically on every Vercel deployment and points at
 * the deployment doing the asking, which is what we want: background work runs
 * against the same build that queued it. `EVE_SELF_URL` overrides it for hosts
 * that put the agent behind a different name.
 */
export function selfBaseUrl(): string | null {
  const explicit = process.env.EVE_SELF_URL?.trim() || process.env.EVE_URL?.trim();
  if (explicit) return trimSlashes(explicit);

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${trimSlashes(vercel.replace(/^https?:\/\//, ""))}`;

  // `eve dev` / `eve start` serve locally. localDev() admits this without a
  // secret, which is why dev works with nothing configured.
  const port = process.env.PORT?.trim() || "2000";
  return `http://127.0.0.1:${port}`;
}

function authorization(): string | null {
  const secret = process.env.EVE_SHARED_SECRET?.trim();
  if (!secret) return null;
  return `Basic ${Buffer.from(`${FAMILY_USERNAME}:${secret}`, "utf8").toString("base64")}`;
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const base = selfBaseUrl();
  if (!base) throw new Error(SELF_API_UNCONFIGURED);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = authorization();
  if (auth) headers.Authorization = auth;

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const parsed: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = parsed ? JSON.stringify(parsed).slice(0, 200) : response.statusText;
    throw new Error(`${path} failed (${response.status}): ${detail}`);
  }
  return (parsed ?? {}) as Record<string, unknown>;
}

/**
 * Start a brand-new durable session that runs the given prompt.
 *
 * eve answers immediately with the session id and keeps running the turn on the
 * durable workflow runtime, so the caller's own turn is free to finish. That is
 * the whole point: the agent can now honestly say "I'm on it".
 */
export async function startBackgroundSession(
  message: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  try {
    const body = await post("/eve/v1/session", { message });
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
    if (!sessionId) return { ok: false, error: "eve accepted the session but returned no id." };
    return { ok: true, sessionId };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/* ------------------------------------------------------------ reply tickets */

/**
 * The handle a background run needs in order to speak back into the chat it
 * came from: the session id plus the token that resumes it, with an expiry.
 *
 * It is passed to the background session inside its prompt, because eve gives
 * no other channel for handing data to a session started over HTTP. It is
 * therefore visible to that run's model, which is why `deliver_background_result`
 * tells the model never to print it, why it expires, and why one is never minted
 * at all when the chat is not resumable.
 */
export interface ReplyTicket {
  /** Session to deliver into. */
  s: string;
  /** Continuation token that resumes it. */
  c: string;
  /** Epoch millis after which this ticket is refused. */
  x: number;
}

/** Long enough for a thorough research run, short enough to go stale. */
export const TICKET_TTL_MS = 45 * 60 * 1000;

export function encodeReplyTicket(ticket: ReplyTicket): string {
  return Buffer.from(JSON.stringify(ticket), "utf8").toString("base64url");
}

export function decodeReplyTicket(raw: string): ReplyTicket | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw.trim(), "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { s, c, x } = parsed as Record<string, unknown>;
    if (typeof s !== "string" || typeof c !== "string" || typeof x !== "number") return null;
    if (!s || !c) return null;
    return { s, c, x };
  } catch {
    return null;
  }
}

/**
 * Wake the originating chat and hand it a message.
 *
 * The message arrives as a user turn in that session's durable history, so the
 * family sees it in the live stream and again when they reload. eve is explicit
 * that delivery to a session with an ACTIVE turn is best-effort
 * (eve/docs/concepts/execution-model-and-durability.md, "Message delivery and
 * queueing") — this is only ever called long after the originating turn ended,
 * with the session parked and waiting.
 */
export async function deliverToSession(
  ticket: ReplyTicket,
  message: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  if (Date.now() > ticket.x) {
    return { ok: false, error: "This reply ticket has expired; the chat can no longer be resumed." };
  }
  try {
    await post(`/eve/v1/session/${encodeURIComponent(ticket.s)}`, {
      continuationToken: ticket.c,
      message,
    });
    return { ok: true, sessionId: ticket.s };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}
