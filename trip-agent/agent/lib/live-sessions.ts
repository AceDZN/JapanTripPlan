/**
 * Which continuation token addresses which live session.
 *
 * WHY THIS EXISTS. eve gives authored code two different handles for a session
 * (see eve/docs/concepts/sessions-runs-and-streaming.md): `sessionId` streams
 * and inspects it, `continuationToken` is the only thing that can *resume* it.
 * A tool's `ctx.session` exposes `id`, `turn`, `auth` and `parent` — and NOT the
 * continuation token (eve/docs/guides/session-context.md). A hook's context
 * does expose it (`HookContext.channel.continuationToken`,
 * eve/docs/guides/hooks.md). So the hook writes here and the tools read here.
 *
 * Without this pairing, background work can write to Convex but can never speak
 * into the chat the family is actually looking at.
 *
 * SCOPE, HONESTLY. This is a process-local cache, not durable storage. It is
 * only ever read inside the same turn that the hook just wrote it from, which
 * is the same function invocation — that is why it is sound. It is deliberately
 * NOT relied on across invocations: a token that is not in the map means the
 * background result cannot be pushed into the chat, and the tool says so out
 * loud instead of pretending. The token itself never lands in Convex, so a
 * database dump can never be replayed into somebody's conversation.
 */

/** A parked chat is worth resuming for a while; a day-old one is not. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** Hard cap so a long-lived server cannot grow this without bound. */
const MAX_ENTRIES = 200;

type Entry = { continuationToken: string; seenAt: number };

const sessions = new Map<string, Entry>();

function prune(now: number): void {
  for (const [sessionId, entry] of sessions) {
    if (now - entry.seenAt > TTL_MS) sessions.delete(sessionId);
  }
  // Map preserves insertion order, and every write re-inserts, so the first
  // keys are the least recently seen.
  while (sessions.size > MAX_ENTRIES) {
    const oldest = sessions.keys().next();
    if (oldest.done) break;
    sessions.delete(oldest.value);
  }
}

/** Called from the hook on every event that carries a channel token. */
export function rememberSession(
  sessionId: string | undefined,
  continuationToken: string | undefined,
): void {
  if (!sessionId || !continuationToken) return;
  const now = Date.now();
  sessions.delete(sessionId); // re-insert, so it counts as most recently seen
  sessions.set(sessionId, { continuationToken, seenAt: now });
  prune(now);
}

/**
 * Sessions that are themselves background runs.
 *
 * A background research run holds the same tool set as a chat, including the
 * tool that starts background research — so without a marker it could queue
 * another one, and that one another. The hook flags a session the moment its
 * opening message carries the background marker, and
 * `queue_background_research` refuses to run inside a flagged session.
 *
 * Same process-local caveat as above, and the same direction of failure: the
 * research brief also tells the run not to delegate further, so a lost flag
 * falls back to instruction rather than to nothing.
 */
const backgroundSessions = new Set<string>();

export function markBackgroundSession(sessionId: string | undefined): void {
  if (!sessionId) return;
  if (backgroundSessions.size > MAX_ENTRIES) backgroundSessions.clear();
  backgroundSessions.add(sessionId);
}

export function isBackgroundSession(sessionId: string): boolean {
  return backgroundSessions.has(sessionId);
}

/** The token that can resume this session, or null when we never saw it. */
export function continuationTokenFor(sessionId: string): string | null {
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (Date.now() - entry.seenAt > TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return entry.continuationToken;
}
