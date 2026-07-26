# trip-agent — הקונסיירז' של יפן 2026

An [eve](https://eve.dev/docs) agent that answers questions in Hebrew about the family's
Japan 2026 trip (Oct 1–18, 2026 · 2 adults, daughter 16, son 12).

It is not a general travel bot. It answers **only** from the trip's canonical documents —
`JAPAN2026/*.md` and `web/data/places.json` in the repo root — which are bundled into the
agent at build time. It never invents prices, opening hours or booking status, and it
cites which guide an answer came from. Replies are written to be read aloud (TTS): short,
speakable, no tables or markdown unless asked.

## Layout

```
trip-agent/
├── agent/
│   ├── agent.ts               # model + runtime limits
│   ├── instructions.md        # Hebrew concierge persona, 17-day digest, standing rules
│   ├── channels/eve.ts        # HTTP API + auth walk (Basic → Vercel OIDC → localhost)
│   ├── data/content.ts        # GENERATED — do not edit (npm run sync-data)
│   ├── lib/trip.ts            # shared helpers over the bundled content
│   └── tools/
│       ├── read_guide.ts      # read a full JAPAN2026 guide
│       ├── get_day.ts         # one day (1–17) of the canonical itinerary
│       ├── search_places.ts   # search the 154-place database (Hebrew + English)
│       ├── nearby_places.ts   # what's near a coordinate, with walk time + directions
│       └── {bash,read_file,write_file,glob,grep,agent}.ts   # disableTool() sentinels
└── scripts/sync-data.mjs      # regenerates agent/data/content.ts
```

### Tools

| Tool | Purpose |
|---|---|
| `get_day` | The full plan for trip day 1–17, sliced out of `09-DAILY-ITINERARY.md`, plus that day's places. The default for "what do we do on day N". |
| `read_guide` | Any of the 12 canonical guides in full (enum of real filenames). |
| `search_places` | Substring search over Hebrew + English names/descriptions/areas, filterable by `category`, `city`, `day`, `plannedOnly`. Capped at 15 results. |
| `nearby_places` | Haversine-ranked places near `{lat,lng}`, with an 80 m/min walking estimate and a Google Maps walking-directions URL. |

**Default harness decisions.** The shell/filesystem tools (`bash`, `read_file`,
`write_file`, `glob`, `grep`) and the root `agent` delegation tool are disabled with
`disableTool()` — a family concierge has no use for a sandbox, and the trip content is
bundled rather than read from disk. `web_fetch` and `web_search` are kept on purpose:
live opening hours, ticket-release status and transport disruptions are the one class of
question the documents genuinely cannot answer. `todo` and `ask_question` stay at their
defaults.

## Data bundling

Vercel uploads only `trip-agent/`, so `../JAPAN2026` and `../web/data` do not exist during a
deployment build. `scripts/sync-data.mjs` therefore generates `agent/data/content.ts` as
plain TypeScript literals, and that file is **committed**. On Vercel the script detects the
missing sources and keeps the committed bundle instead of failing.

```bash
npm run sync-data     # also runs automatically via predev / prebuild / pretypecheck
```

**Whenever a `JAPAN2026/*.md` file or `web/data/places.json` changes, re-run
`npm run sync-data` and commit the regenerated `agent/data/content.ts`.**

## Run locally

```bash
npm install
npm run typecheck
npm run dev            # eve dev + terminal UI
npm exec -- eve dev --no-ui   # headless, for scripted verification
```

The dev server listens on `http://127.0.0.1:2000`. `localDev()` accepts loopback requests,
so no credentials are needed locally.

```bash
curl -X POST http://127.0.0.1:2000/eve/v1/session \
  -H 'content-type: application/json' \
  -d '{"message":"מה התוכנית ליום 5?"}'
# -> {"continuationToken":"eve:...","sessionId":"wrun_..."}

curl -N http://127.0.0.1:2000/eve/v1/session/<sessionId>/stream   # NDJSON events
```

### Environment

`.env.local` (gitignored):

| Variable | Meaning |
|---|---|
| `EVE_SHARED_SECRET` | Basic-auth password for the HTTP channel. Username is `family`. |
| `EVE_MODEL` | Optional model override. See below. |
| `VERCEL_OIDC_TOKEN` | Pulled by `vercel link` / `vercel env pull`; authenticates the AI Gateway locally. |

## Model

`agent/agent.ts` uses `process.env.EVE_MODEL ?? "google/gemini-3.6-flash"`, routed through
the Vercel AI Gateway.

`google/gemini-3.6-flash` requires **paid AI Gateway credits**. On a free-tier team the
Gateway answers `403 — Free tier users do not have access to this model`. Until credits are
added, `EVE_MODEL=google/gemini-2.5-flash` is set in `.env.local` and in the Vercel project
(production, preview, development), which the free tier does serve — with per-minute rate
limits.

To upgrade once the team has credits: add credits at **Vercel dashboard → team → AI
Gateway → Top up**, then `vercel env rm EVE_MODEL production` (and preview/development) and
redeploy. The model id is captured into the compiled manifest at build time, so an env
change always needs a redeploy.

## Auth

`agent/channels/eve.ts` runs an ordered auth walk and **fails closed** — there is no
`none()` and no `placeholderAuth()`:

1. **HTTP Basic** `family:$EVE_SHARED_SECRET` — what the webapp and phones use.
2. **`vercelOidc()`** — the eve TUI against the deployment, and our own Vercel deployments.
3. **`localDev()`** — loopback only.

Anything else gets `401` with `WWW-Authenticate: Basic realm="japan-2026", Bearer`.
`GET /eve/v1/health` is always public.

```bash
curl -u "family:$EVE_SHARED_SECRET" -X POST https://japan-trip-agent.vercel.app/eve/v1/session \
  -H 'content-type: application/json' -d '{"message":"מה התוכנית ליום 5?"}'
```

CORS is enabled (`origin: "*"`, GET/POST, `authorization` + `content-type`) so the trip
webapp can call the channel directly from the browser.

## Deploy

```bash
vercel link --yes --project japan-trip-agent   # once
vercel env pull .env.development.local          # provisions VERCEL_OIDC_TOKEN
vercel deploy --prod --yes
```

Production: **https://japan-trip-agent.vercel.app**

Verify:

```bash
curl https://japan-trip-agent.vercel.app/eve/v1/health
npm exec -- eve dev "https://family:$EVE_SHARED_SECRET@japan-trip-agent.vercel.app"
```

---

## Phase 2 — enabling Telegram

Not active yet: there is no bot token. Everything below is the complete enablement path.

### 1. Create the bot in BotFather

1. Open [@BotFather](https://t.me/BotFather) in Telegram.
2. `/newbot` → give it a display name, then a username ending in `bot`
   (e.g. `japan2026_family_bot`). BotFather replies with the **bot token**
   (`123456:AA...`). Keep it secret.
3. `/setprivacy` → select the bot → **Disable** *only* if the bot should read all group
   messages. Leave it **Enabled** (the default) so in groups it only sees commands,
   `@mentions` and replies to its own messages — that is what the channel expects.
4. Optional polish: `/setdescription`, `/setabouttext`, `/setuserpic`,
   and `/setcommands` with something like `ask - שאלה על הטיול`.

### 2. Add the channel file

Create `agent/channels/telegram.ts`:

```ts
import { telegramChannel } from "eve/channels/telegram";

export default telegramChannel({
  botUsername: "japan2026_family_bot",
  // Voice notes and photos from the family arrive as attachments.
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "audio/*", "application/pdf"],
    maxBytes: 20 * 1024 * 1024,
  },
});
```

This mounts `POST /eve/v1/telegram`. The channel verifies the
`X-Telegram-Bot-Api-Secret-Token` header before trusting any update, and it attaches a user
principal for the Telegram sender, so no extra route auth is needed for this path.

### 3. Set the secrets

```bash
SECRET_TOKEN=$(openssl rand -hex 24)

for env in production preview development; do
  vercel env add TELEGRAM_BOT_TOKEN "$env" --value "123456:AA..." --yes
  vercel env add TELEGRAM_WEBHOOK_SECRET_TOKEN "$env" --value "$SECRET_TOKEN" --yes
done

# and locally
printf 'TELEGRAM_BOT_TOKEN=123456:AA...\nTELEGRAM_WEBHOOK_SECRET_TOKEN=%s\n' "$SECRET_TOKEN" >> .env.local
```

(`--sensitive` is rejected for the development environment, so omit it there.)

### 4. Deploy, then register the webhook

eve never calls `setWebhook` for you — do it once after the deployment is live:

```bash
vercel deploy --prod --yes

curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://japan-trip-agent.vercel.app/eve/v1/telegram",
       "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
       "allowed_updates":["message","callback_query"]}'
```

Confirm with:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

`pending_update_count` should be `0` and `last_error_message` absent. Then DM the bot, or
add it to the family group and `@mention` it.

Reference: `node_modules/eve/docs/channels/telegram.mdx`.
