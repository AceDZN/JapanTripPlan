# יפן 2026 — the trip webapp

Next.js 16 (App Router) app that renders the family's Japan 2026 plan, hosted on
Vercel. The canonical planning documents live in `../JAPAN2026/`; everything the
app shows is generated from them.

## Prerequisites

- Node.js `>=22.13.0`

## Quick start

```bash
npm install
cp .env.local.example .env.local   # then fill in the values
npm run dev                        # http://localhost:3000
```

`npm run dev` starts **two** processes: the Next dev server and the local eve
agent from `../trip-agent`, on `127.0.0.1:2000`. They share a fate — Ctrl-C stops
both, and if either dies the other is stopped too, because a live web server
talking to a dead agent looks exactly like a bug in the app.

**In development the chat always talks to the local agent**, whatever `EVE_URL`
says in `.env.local`. That variable points at the deployment, and quietly testing
localhost against a deployed agent is how you end up debugging your own working
code: it once cost a long session where the deployment turned out to be 24
commits behind and missing the wish tools entirely. To aim at the deployment on
purpose:

```bash
EVE_USE_DEPLOYED=1 npm run dev
```

`npm run dev` and `npm run build` both run `scripts/sync-content.mjs` first,
which copies `../JAPAN2026/*.md` into `public/markdown/` and regenerates
`app/generated/`. Never edit the generated files by hand.

## Scripts

- `npm run dev` — Next dev server **+ the local eve agent** (see above)
- `npm run dev:web` — the Next dev server alone, when the agent is already running
- `npm run build` — production build
- `npm start` — serve the production build
- `npm test` — build, then run `node --test tests/*.test.mjs`
- `npm run lint` — ESLint (`eslint-config-next`)
- `npm run sync:content` — regenerate content from `../JAPAN2026/`

## Server endpoints

| Route | What it does |
| --- | --- |
| `POST /api/chat` | Stateless concierge agent (AI SDK `ToolLoopAgent`) streamed as UI messages |
| `POST /api/tts` | Reads an answer aloud (`generateSpeech`, `openai/tts-1`) |
| `POST /api/transcribe` | Listens to a recorded voice note and returns the words |
| `GET /api/agent/enabled` | Whether the durable eve transport is configured |
| `GET`/`POST` `/api/agent/*` | Credentialed NDJSON relay to the deployed eve trip agent |

The eve relay is the only holder of `EVE_URL` / `EVE_SHARED_SECRET`; the browser
only ever learns a boolean from `/api/agent/enabled`.

### Why `/api/transcribe` exists

eve stages every attachment into the agent sandbox and only re-inlines the bytes
for `image/*` (≤3 MiB) and `application/pdf` (≤20 MiB) on the way into the model
call — see `shouldInlineSandboxRefAsBytes` in
`eve/dist/src/harness/attachment-staging.js`, unchanged as of 0.29.4. An
`audio/*` part reaches the model as the line `Attached file
/workspace/attachments/…/voice.webm (audio/webm)`, so the agent answers "I can't
listen to it" no matter how audio-capable the model is. The staging call is
unconditional, there is no config flag, and every eve agent has exactly one
sandbox.

So the app listens first: an audio-native model (Gemini, with the trip's proper
nouns as a vocabulary hint) turns the recording into words, and the turn is sent
marked `קלט: הודעה קולית מתומללת` in the context part so the agent knows the
wording was *heard*, not typed. The recording stays on the device in IndexedDB
and is re-attached to its bubble by transcript, so it still plays back after a
reload. Images and PDFs need none of this — they reach the model as bytes.

## Environment

See `.env.local.example`. On Vercel the AI Gateway authenticates over OIDC, so
no gateway key is needed there — only `EVE_URL` and `EVE_SHARED_SECRET`.

```bash
vercel env pull    # refresh .env.local (incl. the OIDC token) from the project
```

## Deploying

```bash
vercel deploy --prod
```

## Tests

`tests/rendered-html.test.mjs` builds once (via `npm test`) and then boots
`next start` on ephemeral ports with different environments, asserting the
rendered HTML and the API contracts over HTTP. `tests/eve-protocol.test.mjs` is
a pure unit test of the NDJSON event parser.
