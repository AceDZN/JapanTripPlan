/**
 * Record the continuation token of every live session.
 *
 * Hooks are the only authored surface that sees it: `HookContext` carries
 * `channel.continuationToken` (eve/docs/guides/hooks.md), while a tool's
 * `ctx.session` does not (eve/docs/guides/session-context.md). Everything else
 * about the background-research flow follows from that one asymmetry — see
 * `lib/live-sessions.ts`.
 *
 * Subscribed to three events rather than one so the pairing is recorded early
 * (`session.started`), refreshed on every inbound message, and re-recorded at
 * the top of each turn — a turn that resumes in a fresh process after a step
 * boundary still repopulates the cache before any tool runs.
 *
 * A hook that throws surfaces as `turn.failed` (eve/docs/guides/hooks.md), and
 * bookkeeping must never be able to break somebody's chat, so every handler is
 * wrapped.
 */

import { defineHook } from "eve/hooks";

import { markBackgroundSession, rememberSession } from "../lib/live-sessions";
import { BACKGROUND_MARKER } from "../lib/research-brief";

function record(ctx: {
  session: { id: string };
  channel: { continuationToken?: string };
}): void {
  try {
    rememberSession(ctx.session.id, ctx.channel.continuationToken);
  } catch {
    // Never fail a turn over a cache write.
  }
}

export default defineHook({
  events: {
    "session.started"(_event, ctx) {
      record(ctx);
    },
    "message.received"(event, ctx) {
      record(ctx);
      try {
        // A run whose opening message is a background brief must not be able to
        // spawn further background runs. `data.message` is the flattened text
        // of the inbound message (eve's MessageReceivedStreamEvent).
        if (event.data.message.trimStart().startsWith(BACKGROUND_MARKER)) {
          markBackgroundSession(ctx.session.id);
        }
      } catch {
        // Never fail a turn over bookkeeping.
      }
    },
    "turn.started"(_event, ctx) {
      record(ctx);
    },
  },
});
