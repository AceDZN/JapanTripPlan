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
│   ├── lib/github.ts          # GitHub Contents API write path (edit + commit)
│   └── tools/
│       ├── read_guide.ts      # read a full JAPAN2026 guide
│       ├── get_day.ts         # one day (1–17) of the canonical itinerary
│       ├── get_now.ts         # current time in Japan + Israel, and today's trip day
│       ├── search_places.ts   # search the 154-place database (Hebrew + English)
│       ├── nearby_places.ts   # what's near a coordinate, with walk time + directions
│       ├── edit_plan_doc.ts   # edit a canonical doc + commit  (approval-gated)
│       ├── mark_done.ts       # tick a checklist item with ✅   (approval-gated)
│       └── {bash,read_file,write_file,glob,grep,agent}.ts   # disableTool() sentinels
└── scripts/sync-data.mjs      # regenerates agent/data/content.ts
```

### Tools

| Tool | Purpose |
|---|---|
| `get_day` | The full plan for trip day 1–17, sliced out of `09-DAILY-ITINERARY.md`, plus that day's places. The default for "what do we do on day N". |
| `read_guide` | Any of the 12 canonical guides in full (enum of real filenames). |
| `get_now` | Current date/time in `Asia/Tokyo` and `Asia/Jerusalem` (ISO + Hebrew strings) and which trip day today is. The model has no clock; anything that depends on "now" starts here. |
| `search_places` | Substring search over Hebrew + English names/descriptions/areas, filterable by `category`, `city`, `day`, `plannedOnly`. Capped at 15 results. |
| `nearby_places` | Haversine-ranked places near `{lat,lng}`, with an 80 m/min walking estimate and a Google Maps walking-directions URL. |
| `edit_plan_doc` | Exact-substring edit of one canonical `JAPAN2026/*.md` doc, committed to the repo. **Approval-gated.** |
| `mark_done` | Marks a `11-PRE-TRIP-CHECKLIST.md` item done with a ✅ (plus an optional note), committed to the repo. **Approval-gated.** |

### Where and when the family is

The concierge is used on a phone, mid-trip, so "now" and "here" matter constantly.

- **Time** comes from `get_now` — the model has no clock of its own.
- **Location** comes from the webapp, which prefixes a user message with a bracketed context
  line when it has permission, e.g.
  `[הקשר: 14:32 בטוקיו; מיקום: 35.6812,139.7671 דיוק 30מ']`. `instructions.md` tells the model
  to treat that line as trusted metadata, never to echo it back, and to ask where they are when
  it is missing and the question is location-sensitive.
- **"מה יש לידי"** is answered from both sides: `nearby_places` for the curated 154-place
  database, plus `web_search` for what the database cannot know — events today, current opening
  hours, closures.

**Default harness decisions.** The shell/filesystem tools (`bash`, `read_file`,
`write_file`, `glob`, `grep`) and the root `agent` delegation tool are disabled with
`disableTool()` — a family concierge has no use for a sandbox, and the trip content is
bundled rather than read from disk. `web_fetch` and `web_search` are kept on purpose:
live opening hours, ticket-release status and transport disruptions are the one class of
question the documents genuinely cannot answer. `todo` and `ask_question` stay at their
defaults.

## Data bundling

`scripts/sync-data.mjs` generates `agent/data/content.ts` — the guides and places as plain
TypeScript literals — so the agent never touches the filesystem at runtime. It runs on
`predev` / `prebuild` / `pretypecheck`, and the generated file is **committed**.

The project is git-connected to `github.com/AceDZN/JapanTripPlan` with **Root Directory
`trip-agent`**, and a Vercel git build clones the *whole* repo. So `../JAPAN2026` and
`../web/data/places.json` **are** present during a deployment build and the bundle is genuinely
regenerated from source on every deploy. Verified in the build log:

```
> trip-agent@0.0.0 prebuild
> npm run sync-data
sync-data: 12 guides + 154 places -> agent/data/content.ts (266 KB)
```

The committed bundle is only a **fallback** for an upload that does not carry the repo root; the
script then logs `sync-data: repo sources not present (deployment build?)` and keeps the
checked-in file. If you ever see that line in a Vercel build log, the agent's knowledge is
frozen at whatever was last committed — treat it as a bug in the deployment setup, not as
normal behaviour.

**Whenever a `JAPAN2026/*.md` file or `web/data/places.json` changes outside a deploy, re-run
`npm run sync-data` and commit the regenerated `agent/data/content.ts`** so local runs and the
fallback stay honest.

```bash
npm run sync-data     # also runs automatically via predev / prebuild / pretypecheck
```

## עריכת התוכנית מהצ׳אט — editing the plan from the chat

The concierge can **change the plan**, not just read it. This is the feature that makes the
agent useful mid-trip on a phone: "we bought the teamLab tickets", "we're leaving at 08:30
instead of 08:00 on day 9".

### How it works

`JAPAN2026/*.md` stays the single source of truth. An edit is a real commit to this repo,
made by the agent through the **GitHub Contents API** (`GET` for the blob sha → `PUT` with the
new content) on the branch in `GITHUB_BRANCH` (default `main`). Everything downstream rebuilds
from that commit:

```
chat message
  └─ tool call (edit_plan_doc | mark_done)
       └─ approval prompt in the chat  ← nothing happens before the user confirms
            └─ commit "Trip update: <summary>" on main
                 ├─ japan-2026-trip  → webapp rebuild: guide pages + AI context regenerate
                 └─ japan-trip-agent → agent rebuild: agent/data/content.ts regenerates
```

Commit messages are exactly `Trip update: <summary>` — no co-author or attribution trailers.

### The ✅ convention

**A checklist line carrying ✅ is done; a line without one is still open.** That is the whole
convention, and it is what the model reads completion state from.
`11-PRE-TRIP-CHECKLIST.md` holds its items in markdown tables whose first column is `Done`, so
`mark_done` replaces the `[ ]` in that cell rather than prefixing the row — the table keeps
rendering everywhere. An optional note rides in the same cell:

```
| [ ] | Buy/confirm family travel insurance | Now | … | Adults |
| ✅ — אמא, פוליסה 12345 | Buy/confirm family travel insurance | Now | … | Adults |
```

On a non-table line (plain bullet or free text) the ✅ is prefixed to the line and the note is
appended. `mark_done` is idempotent: an item that already carries ✅ is reported as already
done and nothing is committed.

### The approval flow

Both write tools use eve's `approval: always()`, so **every** call pauses the run at
`session.waiting` and emits an `input.requested` event before anything is fetched, replaced or
committed. The request carries the full tool input, so the user sees exactly what will change:

```jsonc
{
  "type": "input.requested",
  "data": { "requests": [{
    "requestId": "aitxt-4M2M0pIy7yZtavFViWW6JYUF",
    "prompt": "Approve tool call: edit_plan_doc",
    "display": "confirmation",
    "allowFreeform": false,
    "options": [{ "id": "approve", "label": "Yes" }, { "id": "deny", "label": "No" }],
    "action": { "kind": "tool-call", "toolName": "edit_plan_doc",
                "input": { "file": "09-DAILY-ITINERARY.md", "old_string": "…", "new_string": "…",
                           "summary": "עדכון שעת יציאה ביום 9 ל-08:30" } }
  }] }
}
```

Two ways to answer, both verified end to end:

- **Structured** — `POST /eve/v1/session/:id` with
  `{ continuationToken, inputResponses: [{ requestId, optionId: "approve" }] }`.
- **Plain text** — `POST /eve/v1/session/:id` with `{ continuationToken, message: "approve" }`.
  eve resolves a follow-up whose text matches an option id (`approve` / `deny`) or label
  (`Yes` / `No`). This is what the webapp chat uses, since it renders the request as text.
  Unrelated follow-up text does **not** deny the call — eve holds it and keeps the approval
  pending.

A denied approval commits nothing at all: the tool never executes.

### Staleness — read this before trusting a reply

The commit is live in the repo immediately, but the **agent's own bundled knowledge**
(`agent/data/content.ts`) only refreshes on its next deployment, a few minutes later. So for
the remainder of the conversation that made an edit, `read_guide` and `get_day` still return
the pre-edit text. `instructions.md` instructs the model to trust what it just changed over
those tools until the redeploy lands, and every successful edit returns an explicit
`staleness` field saying so.

### What auto-updates, and what does not

| Surface | Regenerates from the md? |
|---|---|
| Webapp guide pages (`/guide/[slug]`) | **Yes** — `web/scripts/sync-content.mjs` runs on `prebuild`. |
| Webapp AI context (`web/app/generated/ai-context.ts`) | **Yes** — same prebuild step. |
| Agent knowledge (`agent/data/content.ts`) | **Yes** — `scripts/sync-data.mjs` runs on `prebuild`. |
| Webapp **structured** day/place data (`web/lib/trip-data.ts`, `web/data/places.json`) | **No.** |

That last row is the honest caveat. The map pins, the day cards and the place database are
hand-curated TypeScript/JSON, not derived from the markdown. An edit that moves an activity to
a different day, renames a place, or adds/removes a stop will make the **prose and the
structured data disagree** — the guide page will say one thing and the itinerary/map another.
Nothing breaks, but it drifts. The resync path is a Claude session: ask it to reconcile
`web/lib/trip-data.ts` and `web/data/places.json` against the changed `JAPAN2026/*.md`, then
re-run `npm run sync-data` in `trip-agent/` and commit. Small wording, time and status edits
(what the chat is mostly for) do not drift anything.

### Setup — the one manual step

Production deliberately ships **without** `GITHUB_TOKEN`. Until it is set the tools fail
closed with a clear Hebrew message ("עריכת התוכנית לא מחוברת עדיין…") and the agent explains
what is missing instead of pretending to save. To turn editing on:

1. **Create a fine-grained GitHub PAT** — GitHub → Settings → Developer settings →
   *Personal access tokens* → *Fine-grained tokens* → **Generate new token**:
   - Resource owner: `AceDZN`
   - Repository access: **Only select repositories** → `AceDZN/JapanTripPlan`
   - Repository permissions: **Contents: Read and write** (nothing else)
   - Expiration: around **December 2026** (after the trip)
2. **Add it to the agent's Vercel project**, from `trip-agent/`:

   ```bash
   npx vercel env add GITHUB_TOKEN production      # paste the token when prompted
   ```

3. **Redeploy** so the running deployment picks it up:

   ```bash
   npx vercel deploy --prod --yes
   ```

Optional overrides, both with sensible defaults: `GITHUB_REPO` (default
`AceDZN/JapanTripPlan`) and `GITHUB_BRANCH` (default `main`). Point `GITHUB_BRANCH` at a
scratch branch to rehearse edits without touching the real plan.

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

The Vercel project `japan-trip-agent` is **git-connected** to
`github.com/AceDZN/JapanTripPlan` (production branch `main`, Root Directory `trip-agent`), so
the normal path is simply to push:

| Push to | Result |
|---|---|
| `main` | production deploy of the agent |
| any other branch / PR | preview deploy |

The sibling project `japan-2026-trip` (the webapp) is connected to the same repo with Root
Directory `web`, so one commit — including a commit the agent itself makes from the chat —
rebuilds both.

### Deploying by CLI

Because the Root Directory is `trip-agent`, the CLI must be run from the **repo root**, not
from `trip-agent/` (from inside `trip-agent/` it looks for `trip-agent/trip-agent` and fails):

```bash
cd /path/to/JapanTripPlan
VERCEL_ORG_ID=team_pt2iOXAJxsY57zIvHgYHzgzR \
VERCEL_PROJECT_ID=prj_pRpjwRuydEd1ePSu0kBtHG31CNxn \
  npx vercel deploy --prod --yes
```

This also uploads `JAPAN2026/`, so `sync-data` regenerates the bundle exactly as a git build
does. `vercel env pull .env.development.local` (from `trip-agent/`) still provisions
`VERCEL_OIDC_TOKEN` for local runs.

> **While PR #1 is open:** `trip-agent/` does not exist on `main` yet, so any push to `main`
> before the merge fails the agent build with *"The specified Root Directory `trip-agent` does
> not exist"*. It resolves itself the moment the PR lands.

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
