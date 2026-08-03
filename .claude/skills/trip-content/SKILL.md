---
name: trip-content
description: Read and edit the Japan 2026 trip's content in Convex — places, days, blocks, checklist items and their pictures. Use whenever a fact about the trip needs correcting (opening hours, addresses, prices, booking status, deadlines), the plan itself needs changing (which day a place is on, block order, a day's title), or something needs a photo. Also use to check what suggestions are waiting for Alex's approval. Triggers on "update the opening hours", "fix this place", "move this to day X", "add a stop", "find a picture of", "add a photo", "what's pending approval".
allowed-tools: Bash, Read, Grep
---

# Editing the trip

Convex is the only source of truth for the trip. The website, the eve agent's
answers and the `JAPAN2026/*.md` export are all **derived** from it. There are no
data files to edit — `web/lib/trip-data.ts`, `web/lib/checklist-data.ts` and
`web/data/places.json` were deleted precisely because they were a second copy
that drifted.

So: never hand-edit a TypeScript file to change a fact about the trip. Use the
CLI below.

## The CLI

All commands run from `web/`.

```bash
npm run content
```

with no arguments prints the full usage. The commands:

| Command | What it does |
|---|---|
| `show place <id>` | one place, every field |
| `show day <n>` | a day, its blocks **with their ids**, and its places |
| `find <query>` | search places by id, name, area or description |
| `pending` | suggestions waiting on Alex |
| `set <target> <id> field=value …` | change fields |
| `clear <target> <id> field …` | remove fields |
| `add <target> <id> field=value …` | create a row |
| `rm <target> <id>` | delete a row |
| `find-image "<query>" [--page <url>]` | search the web for pictures; saves nothing |
| `set-image <target> <id> hero\|gallery <imageUrl> "<alt>"` | keep a picture and attach it |
| `images [--sweep]` | what is stored; `--sweep` deletes what nothing points at |

`<target>` is `place`, `day`, `block` or `task`.

## Rules that matter

**Read before you write.** Get the current value first — `show place <id>` or
`show day <n>`. Editing a field whose current contents you have not seen is how
a correct note gets replaced by a worse one.

**Blocks are addressed by id, and the id cannot be guessed.** Run `show day <n>`
and copy the id from the first column. A block's title is not a key: two blocks
on one day can share one.

**Values are JSON when they parse, text when they don't.**

```bash
npm run content -- set place fushimi-inari-taisha lastEntry="16:00" walkMinutes=5
npm run content -- set place teamlab-planets days=[4,5] mustDo=true
npm run content -- set place shibuya-sky nearestStation='{"he":"שיבויה","ja":"渋谷"}'
```

**To remove a field use `clear`, never `field=""`.** An empty string records a
fact that is not one — the app will render an empty "opening hours" row rather
than omitting it.

**Never write a fact you have not verified.** Check the official page with
WebFetch first. An opening time typed from memory is the failure mode that
leaves four people outside a closed gate.

## The two tiers, and why the CLI ignores them

`web/convex/lib/contentPolicy.ts` splits every field into **FACT** (the world
changed: hours, address, phone, price, booking status, deadlines) and **PLAN**
(we changed our minds: which days a place is on, block order and timing, a day's
title, where we sleep).

That split governs **eve**, the in-app chat agent: it writes facts immediately
and files anything plan-shaped as a suggestion for Alex, because it authenticates
with one shared family credential and genuinely cannot tell Alex from Tommy.

This CLI writes **both tiers directly**, no queue. Running it means a checked-out
repo and a Convex deploy key — the owner at a terminal, not a chat message. That
is why `internalEditAsOwner` has no HTTP route: eve holds `AGENT_SERVICE_KEY`,
so the full tier is deliberately behind a credential the agent does not have.

Because there is no approval step here, **say what you are about to change and
get a yes before running a `set`/`add`/`rm` that touches the plan** — a day's
title, which day a place is on, a block's time or order, or where the family
sleeps. Factual corrections you have verified need no ceremony.

## After a content change

Nothing needs regenerating for the website — it reads Convex per request.

Two derived artefacts do lag:

- `web/app/generated/ai-context.ts` (the fallback chat's guide context) —
  refreshed by `npm run sync:content`, which also runs on `predev`/`prebuild`.
- `trip-agent/agent/data/content.ts` (eve's offline fallback bundle) — refreshed
  by `npm run sync-data` in `trip-agent/`, which also runs on `predev`/`prebuild`.

Both are fallbacks, not sources, so a lag is not a correctness problem — but
refresh them before a deploy so the offline copy matches.

## Checking the approval queue

```bash
npm run content -- pending
```

Approving is deliberately impossible from here: `convex/suggestions.ts:approve`
requires a signed-in owner's Clerk identity and refuses a service or deploy
credential. Send Alex to `/suggestions` in the app.

## Pictures

Every image lives in Convex storage. `web/public/images/` is **gone** — 127 MB of
unoptimised originals that could only be changed by a commit. Places, days,
guides, blocks and checklist items each take a `hero`; places, days and blocks
also take a `gallery` (3–5 on an attraction reads like a Google result).

Two steps, always in this order:

```bash
npm run content -- find-image "Fushimi Inari senbon torii Kyoto"
npm run content -- set-image place fushimi-inari-taisha hero "<imageUrl from above>" "שביל הטוריאים האדומים"
```

**Pass `--page` when the thing has an official site.** For a shop or a
restaurant its own `og:image` beats anything an image search returns, and it is
the layer nothing else covers:

```bash
npm run content -- find-image "Okuma Shokai sukajan Ueno" --page https://yokosuka-jumper.com/
```

Query in **English or Japanese**, not Hebrew — the sources index far more under
those. Name plus city. `alt` text goes in **Hebrew** and describes what is
visible in the photo, not what the place is called.

The search runs in Convex, layered: Serper (Google Images) → the official page's
`og:image` → Wikimedia Commons. Serper needs `SERPER_API_KEY` set on the Convex
deployment — `npx convex env set SERPER_API_KEY <key>`, and again with `--prod`.
Without it the other two layers still work; the reply says which ran.

Pictures are **FACT tier**, so they apply immediately — for eve too. Deleting one
is a delete, and deletes are always Alex's call.

Bytes are copied into storage rather than linked, so a source going away cannot
put a hole in a page the family is looking at offline in Japan. Identical
pictures are stored once (matched on source URL first, then on content hash), so
attaching the same photo to a place and to the block that visits it costs one
file. `npm run content -- images --sweep` deletes what nothing points at — the
reference count is recomputed by scanning, never incremented, so it cannot drift
into deleting something still on screen.

## When the guides need editing instead

Prose lives in the `guides` table and is edited as markdown, not as fields. That
is a different path (`convex/suggestions.ts`, or `internalUpsertGuide` for
maintenance) — this skill does not cover it. The rule of thumb: if the thing you
want to change is rendered as a **field** on the site (an hour, a price, a
station, a status), it is content; if it is a **paragraph**, it is a guide.
