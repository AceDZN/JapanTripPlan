/**
 * Browser transport for the durable eve agent, proxied by the Worker.
 *
 * `useEveAgent` from `eve/react` is not used on purpose: the hook talks to
 * same-origin `/eve/v1/*` (or a `host` it can reach directly), and this app
 * must never expose `EVE_URL`/`EVE_SHARED_SECRET` to the browser. Everything
 * goes through the Worker at `/api/agent/*`, which owns the credential, so a
 * hand-rolled NDJSON consumer is both smaller and more honest than bending the
 * hook around a relay that owns the cursor.
 *
 * Route map (Worker → `${EVE_URL}/eve/v1/...`), per eve/docs/channels/eve.mdx:
 *   POST /api/agent/session              → start a session
 *   POST /api/agent/session/:id          → follow-up (needs continuationToken)
 *   POST /api/agent/session/:id/cancel   → cancel the in-flight turn
 *   GET  /api/agent/session/:id/stream   → NDJSON events (?startIndex=N)
 */

import { parseNdjson, type EveEvent } from "./eve-protocol";

/** AI SDK `UserContent` parts — the shape eve's message route accepts. */
export type EveMessagePart =
  | { type: "text"; text: string }
  | { type: "file"; data: string; mediaType: string; filename?: string };

export type EveMessage = string | EveMessagePart[];

export type EveSessionHandles = {
  sessionId: string;
  continuationToken: string | null;
};

/** Thrown for transport/route failures so the UI can show a Hebrew card. */
export class EveTransportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EveTransportError";
    this.status = status;
  }
}

const BASE = "/api/agent";

/**
 * Status stamped on a rejected `fetch` — the request never reached the relay.
 * Distinguishes "the phone lost signal" from "the agent said no".
 */
export const NETWORK_FAILURE = 0;

/** `fetch` with transport rejections normalized into an `EveTransportError`. */
async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new EveTransportError(
      "אין חיבור לסוכן. בדקו את החיבור לאינטרנט ונסו שוב.",
      NETWORK_FAILURE,
    );
  }
}

async function failure(response: Response): Promise<EveTransportError> {
  let detail = "";
  try {
    const body: unknown = await response.json();
    const parsed = body as { error?: string; message?: string };
    detail = parsed.error ?? parsed.message ?? "";
  } catch {
    // non-JSON error body — the status alone has to carry the meaning
  }
  return new EveTransportError(detail || `HTTP ${response.status}`, response.status);
}

/** Which transport the chat should use. Never throws — falls back to `false`. */
export async function fetchAgentEnabled(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${BASE}/enabled`, { signal, headers: { accept: "application/json" } });
    if (!response.ok) return false;
    const body = (await response.json()) as { enabled?: unknown };
    return body.enabled === true;
  } catch {
    return false;
  }
}

/** Starts a durable session. The response carries the first continuation token. */
export async function createSession(
  message: EveMessage,
  signal?: AbortSignal,
): Promise<EveSessionHandles> {
  const response = await request(`${BASE}/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });

  if (!response.ok) throw await failure(response);

  const body = (await response.json()) as { sessionId?: string; continuationToken?: string };
  if (!body.sessionId) throw new EveTransportError("הסוכן לא החזיר מזהה שיחה.", 502);

  return { sessionId: body.sessionId, continuationToken: body.continuationToken ?? null };
}

/**
 * Sends a follow-up on an existing session using the current continuation
 * token. A session has one active continuation at a time, and a stale token is
 * rejected — the composer stays disabled until `session.waiting` rotates it.
 */
export async function sendFollowUp(
  sessionId: string,
  continuationToken: string,
  message: EveMessage,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await request(`${BASE}/session/${encodeURIComponent(sessionId)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ continuationToken, message }),
    signal,
  });

  if (!response.ok) throw await failure(response);

  try {
    const body = (await response.json()) as { continuationToken?: string };
    return body.continuationToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Requests cancellation of the in-flight turn. Both `accepted` and
 * `no_active_turn` are successes, so this is fire-and-forget by design.
 */
export async function cancelTurn(sessionId: string): Promise<void> {
  try {
    await request(`${BASE}/session/${encodeURIComponent(sessionId)}/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  } catch {
    // The stream still settles on `turn.cancelled`; a failed POST is not fatal.
  }
}

/**
 * Recovers the session's current continuation token by reading the stream tail.
 *
 * `startIndex=-1` reads the latest event, which for a parked session is
 * `session.waiting` — the documented lightweight way for a consumer holding
 * only a `sessionId` to get its resume handle back
 * (eve/docs/concepts/sessions-runs-and-streaming.md, "Reconnect and rewind").
 * Used by the retry path when the failure arrived before the token did.
 */
export async function fetchContinuationToken(sessionId: string): Promise<string | null> {
  try {
    for await (const event of streamSession(sessionId, -1)) {
      const token = (event.data as { continuationToken?: unknown } | undefined)?.continuationToken;
      // A tail read is one event and out: it never advances the stored cursor.
      return typeof token === "string" && token.length > 0 ? token : null;
    }
  } catch {
    // Retry will surface its own error if this was the only way through.
  }
  return null;
}

/**
 * Attaches to the durable event stream from an absolute event index.
 *
 * `startIndex` is a nonnegative absolute count: `0` rewinds to the beginning
 * (history rebuild), and the consumed-event count resumes after a dropped
 * connection.
 */
export async function* streamSession(
  sessionId: string,
  startIndex: number,
  signal?: AbortSignal,
): AsyncGenerator<EveEvent> {
  const url = `${BASE}/session/${encodeURIComponent(sessionId)}/stream?startIndex=${startIndex}`;
  const response = await request(url, { signal, headers: { accept: "application/x-ndjson" } });

  if (!response.ok) throw await failure(response);
  if (!response.body) throw new EveTransportError("הסוכן לא החזיר זרם אירועים.", 502);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const { events, rest } = parseNdjson(buffer);
      buffer = rest;
      for (const event of events) yield event;
    }

    // Flush a final line that arrived without its trailing newline.
    const { events } = parseNdjson(`${buffer}\n`);
    for (const event of events) yield event;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
