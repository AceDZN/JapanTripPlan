import { defineAgent } from "eve";

/**
 * Routed through the Vercel AI Gateway (project OIDC locally, project
 * credentials in production). Flash keeps replies fast and cheap enough to ask
 * a hundred small questions a day while travelling.
 *
 * `google/gemini-3.6-flash` is the intended model. It used to 403 ("Free tier
 * users do not have access to this model"), which is why this was pinned down
 * to `google/gemini-2.5-flash` — but 2.5-flash badly under-calls tools: it
 * answers shopping/research questions straight from training memory, or replies
 * "I'm searching now" and ends the turn with zero tool calls. That is the bug
 * this pin caused, not a cosmetic quality difference.
 *
 * Re-probed the Gateway for this team on 2026-08-02 (POST /v1/chat/completions
 * with the project OIDC token): gemini-3.6-flash, 3.5-flash and 3-flash all
 * return 200, so the credits constraint no longer applies and the pin is lifted.
 * If credits ever lapse again the 403 cascades down the fallback chain below,
 * which still ends on free-tier-served 2.5-flash — degraded, but not down.
 *
 * Read at build time and captured into the compiled manifest, so changing it
 * requires a rebuild/redeploy — not just an env edit. NOTE: `EVE_MODEL` is also
 * set as a Production env var on the Vercel project; the deployed model comes
 * from that value, so editing `.env.local` alone only changes local dev.
 */
const MODEL = process.env.EVE_MODEL ?? "google/gemini-3.6-flash";

export default defineAgent({
  model: MODEL,

  // Gemini occasionally returns transient 500s through the Gateway. Fail over
  // instead of parking the session. Fallbacks only — the primary above is tried
  // first. Ordered strongest tool-caller first, because a fallback that does not
  // call tools is the same outage in a different costume. Gemini-family first
  // (user preference); GPT only as the very last resort. 2.5-flash stays last in
  // the Gemini block purely as the known free-tier-served floor.
  modelOptions: {
    providerOptions: {
      gateway: {
        models: [
          "google/gemini-3.5-flash",
          "google/gemini-3-flash",
          "google/gemini-2.5-flash",
          "openai/gpt-5.6-luna",
          "openai/gpt-5-mini",
        ],
      },
    },
  },

  // This is one durable conversation per family member, potentially kept for
  // the whole trip. Eve's session limits count every provider input again on
  // every turn (not just the current context), so a healthy long conversation
  // eventually hits any finite total. That used to surface Eve's internal
  // Approve / Stop budget prompt in the family chat and every later message was
  // held behind it. Per-turn/model context remains bounded by compaction below;
  // the lifetime counters must not be a user-facing gate.
  limits: {
    maxInputTokensPerSession: false,
    maxOutputTokensPerSession: false,
  },

  // Guide markdown is long; compact a little earlier than the 0.9 default so a
  // read_guide call late in a chat never blows the window mid-answer.
  compaction: {
    thresholdPercent: 0.8,
  },
});
