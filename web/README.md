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

`npm run dev` and `npm run build` both run `scripts/sync-content.mjs` first,
which copies `../JAPAN2026/*.md` into `public/markdown/` and regenerates
`app/generated/`. Never edit the generated files by hand.

## Scripts

- `npm run dev` — Next dev server
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
| `GET /api/agent/enabled` | Whether the durable eve transport is configured |
| `GET`/`POST` `/api/agent/*` | Credentialed NDJSON relay to the deployed eve trip agent |

The eve relay is the only holder of `EVE_URL` / `EVE_SHARED_SECRET`; the browser
only ever learns a boolean from `/api/agent/enabled`.

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
