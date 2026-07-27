import { defineAgent } from "eve";

/**
 * Routed through the Vercel AI Gateway (project OIDC locally, project
 * credentials in production). Flash keeps replies fast and cheap enough to ask
 * a hundred small questions a day while travelling.
 *
 * `google/gemini-3.6-flash` is the intended model, but it is a paid-tier model:
 * a Gateway account without credits gets a 403 ("Free tier users do not have
 * access to this model"). Until credits are enabled on the Vercel team, set
 * `EVE_MODEL=google/gemini-2.5-flash`, which the free tier does serve.
 *
 * Read at build time and captured into the compiled manifest, so changing it
 * requires a rebuild/redeploy — not just an env edit.
 */
const MODEL = process.env.EVE_MODEL ?? "google/gemini-3.6-flash";

export default defineAgent({
  model: MODEL,

  // Gemini occasionally returns transient 500s through the Gateway. Fail over
  // instead of parking the session: retry on 2.5-flash, then Claude Sonnet
  // (both verified working on this account).
  modelOptions: {
    providerOptions: {
      gateway: {
        models: ["google/gemini-2.5-flash", "anthropic/claude-sonnet-5"],
      },
    },
  },

  // Family app: a runaway loop should stop and ask instead of quietly burning
  // budget. Hitting a limit pauses the session and offers approve / stop.
  limits: {
    maxInputTokensPerSession: 2_000_000,
    maxOutputTokensPerSession: 120_000,
  },

  // Guide markdown is long; compact a little earlier than the 0.9 default so a
  // read_guide call late in a chat never blows the window mid-answer.
  compaction: {
    thresholdPercent: 0.8,
  },
});
