#!/usr/bin/env node
/**
 * Edit the trip's content from a terminal.
 *
 *   npm run content -- <command> …
 *
 * This is the human/Claude-Code/GPT half of the content API. eve has the other
 * half (`edit_content`), and the two differ in exactly one way that matters:
 *
 *   eve       writes FACTS immediately, and everything that changes the PLAN
 *             becomes a suggestion for Alex to approve in the app.
 *   this CLI  writes everything, no queue.
 *
 * That is not a shortcut, it is the point. Running this means having the repo
 * checked out and a Convex deploy key on the machine — you are the owner, at a
 * terminal, not somebody talking to a chatbot who might be a twelve-year-old
 * asking it to move day 5. See `convex/lib/contentPolicy.ts` for the split and
 * `convex/content.ts:internalEditAsOwner` for why the full tier lives behind
 * the deploy key rather than behind `AGENT_SERVICE_KEY`.
 *
 * Reads go over HTTP with AGENT_SERVICE_KEY; writes go through
 * `npx convex run`, which uses the deploy key from `.env.local`.
 */

import { spawnSync } from "node:child_process";

const SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? process.env.CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

const TABLES = {
  place: "places",
  places: "places",
  day: "days",
  days: "days",
  block: "blocks",
  blocks: "blocks",
  task: "checklistItems",
  checklist: "checklistItems",
  checklistItems: "checklistItems",
};

/** Which argument slot a table's patch goes in — see convex/content.ts. */
const PATCH_ARG = {
  places: "place",
  days: "day",
  blocks: "block",
  checklistItems: "checklistItem",
};

const USAGE = `
Trip content — read and edit what the app and eve both serve.

READ
  npm run content -- show place <id>          one place, every field
  npm run content -- show day <n>             one day, its blocks (with ids) and places
  npm run content -- find <query>             search places by name / area / description
  npm run content -- pending                  suggestions waiting on Alex

WRITE                                          (applies straight away — no approval queue)
  npm run content -- set place <id> openingHours="9:00–17:00" lastEntry="16:00"
  npm run content -- set day 12 note="..." rainPlan="..."
  npm run content -- set block <blockId> detail="..."   (get the id from: show day <n>)
  npm run content -- set task <id> due=2026-08-20 critical=true
  npm run content -- clear place <id> phone ticketNote
  npm run content -- add place <id> nameHe="..." nameEn="..." category=food city=tokyo \\
                       area="..." lat=35.7 lng=139.7 descriptionHe="..."
  npm run content -- rm place <id>

PICTURES                                       (applies straight away — a photo is a fact)
  npm run content -- find-image "Fushimi Inari torii Kyoto" [--page https://...]
  npm run content -- set-image place <id> hero <imageUrl> "alt in Hebrew"
  npm run content -- set-image place <id> gallery <imageUrl> "alt in Hebrew"
  npm run content -- images                    what is stored, and what nothing points at
  npm run content -- images --sweep            delete the unreferenced ones

VALUES are parsed as JSON when they parse, and as plain text otherwise. So
  mustDo=true          -> boolean          days=[11,12]         -> array
  walkMinutes=7        -> number           lastEntry="16:00"    -> the text 16:00
  nearestStation='{"he":"פושימי","ja":"伏見"}'                   -> object
To remove a field use \`clear\`, not an empty string: "" records a fact that is not one.
`.trim();

/* ------------------------------------------------------------------ reading */

async function get(path) {
  if (!SITE || !KEY) {
    die("NEXT_PUBLIC_CONVEX_SITE_URL and AGENT_SERVICE_KEY must be set (see web/.env.local).");
  }
  const response = await fetch(`${SITE}${path}`, {
    headers: { Authorization: `Bearer ${KEY}` },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    die(`${path} failed (${response.status}): ${JSON.stringify(body)?.slice(0, 300)}`);
  }
  return body;
}

async function showPlace(id) {
  const { places } = await get("/agent/content/places");
  const place = places.find((entry) => entry.id === id);
  if (!place) die(`No place "${id}". Try: npm run content -- find ${id}`);
  console.log(JSON.stringify(place, null, 2));
}

async function showDay(n) {
  const { day, places } = await get(`/agent/content/day?n=${n}`);
  console.log(`Day ${day.day} · ${day.dateHe} · ${day.area} — ${day.title}`);
  if (day.note) console.log(`note: ${day.note}`);
  if (day.stay) console.log(`stay: ${day.stay.label}`);
  console.log("\nblocks (use the id to edit one):");
  for (const block of day.blocks) {
    console.log(`  ${block.id}  ${(block.time ?? "—").padEnd(7)} ${block.title}`);
  }
  console.log(`\nplaces on this day: ${places.map((p) => p.id).join(", ") || "—"}`);
}

async function find(query) {
  const { places } = await get("/agent/content/places");
  const needle = query.toLowerCase();
  const matches = places.filter((place) =>
    [place.id, place.nameHe, place.nameEn, place.area, place.descriptionHe]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
  if (matches.length === 0) die(`Nothing matches "${query}".`);
  for (const place of matches.slice(0, 30)) {
    console.log(`${place.id.padEnd(34)} ${place.nameHe}  · ${place.area} · ${place.city}`);
  }
  if (matches.length > 30) console.log(`… and ${matches.length - 30} more`);
}

async function pending() {
  const { suggestions } = await get("/agent/suggestions/pending");
  if (suggestions.length === 0) return console.log("Nothing waiting on Alex.");
  for (const row of suggestions) {
    const target =
      row.targetKind === "content"
        ? `${row.content.table}/${row.content.key || "(new)"} ${row.content.op}`
        : (row.guideSlug ?? `day ${row.dayN}`);
    console.log(`${row.id}  ${row.proposedByName.padEnd(6)} ${target.padEnd(28)} ${row.title}`);
  }
  console.log("\nApprove or reject in the app at /suggestions — only a signed-in owner can.");
}

/* ------------------------------------------------------------------ writing */

/**
 * `key=value` pairs. JSON when it parses, text when it does not — so a Hebrew
 * note needs no quoting games and `days=[11,12]` still arrives as an array.
 */
function parseFields(pairs) {
  const fields = {};
  for (const pair of pairs) {
    const at = pair.indexOf("=");
    if (at < 1) die(`"${pair}" is not field=value.`);
    const name = pair.slice(0, at);
    const raw = pair.slice(at + 1);

    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    if (value === null) {
      die(`Use \`clear\` to remove ${name}; null is not a value the trip stores.`);
    }
    fields[name] = value;
  }
  return fields;
}

function runMutation(args) {
  const result = spawnSync(
    "npx",
    ["convex", "run", "content:internalEditAsOwner", JSON.stringify(args)],
    { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout.trim();
}

function write({ table, op, key, fields = {}, unset = [] }) {
  const args = { table, op, key, actorName: process.env.USER ?? "terminal" };
  if (Object.keys(fields).length > 0) args[PATCH_ARG[table]] = fields;
  if (unset.length > 0) args.unset = unset;

  const output = runMutation(args);
  const changed = [...Object.keys(fields), ...unset];
  console.log(
    op === "delete"
      ? `Removed ${table}/${key}.`
      : `${op === "create" ? "Created" : "Updated"} ${table}/${key}: ${changed.join(", ")}`,
  );
  if (output) console.log(output);
}

/* ----------------------------------------------------------------- pictures */

async function post(path, body) {
  if (!SITE || !KEY) die("NEXT_PUBLIC_CONVEX_SITE_URL and AGENT_SERVICE_KEY must be set.");
  const response = await fetch(`${SITE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed = await response.json().catch(() => null);
  if (!response.ok || !parsed?.ok) {
    die(`${path} failed (${response.status}): ${JSON.stringify(parsed)?.slice(0, 300)}`);
  }
  return parsed;
}

async function findImage(query, pageUrl) {
  const result = await post("/agent/images/search", { query, pageUrl, limit: 8 });

  if (result.candidates.length === 0) {
    console.log(`Nothing found for "${query}".`);
    if (result.layersSkipped?.length) console.log(`(skipped: ${result.layersSkipped.join(", ")})`);
    return;
  }

  console.log(`${result.candidates.length} candidates — layers: ${result.layersRun.join(", ")}`);
  if (result.layersSkipped?.length) console.log(`skipped: ${result.layersSkipped.join(", ")}\n`);

  for (const [index, row] of result.candidates.entries()) {
    const bits = [row.sourceName, row.license, row.credit].filter(Boolean).join(" · ");
    console.log(`\n${index + 1}. ${row.title ?? "(untitled)"}`);
    console.log(`   ${bits}`);
    console.log(`   ${row.imageUrl}`);
  }
  console.log("\nCopy an imageUrl into:  npm run content -- set-image <target> <id> hero <url> \"alt\"");
}

/**
 * Attach a picture. No `byEmail`, so this takes the terminal's full tier —
 * though for images that changes nothing, since a photo is a FACT and applies
 * either way. See `web/convex/lib/contentPolicy.ts`.
 */
async function setImage(table, key, slot, url, alt) {
  const result = await post("/agent/images/attach", { table, key, slot, url, alt });
  console.log(
    `${slot === "hero" ? "Hero" : "Gallery"} updated on ${table}/${key}` +
      (result.deduped ? " (we already had these exact bytes — nothing downloaded)" : ""),
  );
  console.log(`  ${result.url}`);
}

async function images(sweep) {
  const response = await fetch(`${SITE}/agent/images/sweep${sweep ? "?apply=1" : ""}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) die(`sweep failed: ${JSON.stringify(body)?.slice(0, 200)}`);

  console.log(`stored:      ${body.assets}`);
  console.log(`referenced:  ${body.referenced}`);
  console.log(`unreferenced:${String(body.orphans).padStart(4)}  (${(body.bytesReclaimable / 1e6).toFixed(1)} MB)`);
  if (body.orphans > 0 && !sweep) {
    console.log("\nRun with --sweep to delete them.");
  } else if (sweep) {
    console.log("\nDeleted.");
  }
}

/* -------------------------------------------------------------------- entry */

function die(message) {
  console.error(message);
  process.exit(1);
}

function tableOf(word) {
  const table = TABLES[word];
  if (!table) die(`Unknown target "${word}". One of: place, day, block, task.`);
  return table;
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "show": {
    const [what, id] = rest;
    if (tableOf(what) === "days") await showDay(Number(id));
    else if (tableOf(what) === "places") await showPlace(id);
    else die("show works on `place` and `day`.");
    break;
  }
  case "find":
    if (!rest[0]) die("find needs something to look for.");
    await find(rest.join(" "));
    break;
  case "pending":
    await pending();
    break;

  case "find-image": {
    const at = rest.indexOf("--page");
    const pageUrl = at >= 0 ? rest[at + 1] : undefined;
    const query = (at >= 0 ? rest.slice(0, at) : rest).join(" ");
    if (!query) die('find-image needs something to look for, e.g. "Fushimi Inari torii Kyoto".');
    await findImage(query, pageUrl);
    break;
  }
  case "set-image": {
    const [what, key, slot, url, ...alt] = rest;
    const table = tableOf(what);
    if (!key || !url) die("set-image needs: <target> <id> <hero|gallery> <imageUrl> \"alt\"");
    if (slot !== "hero" && slot !== "gallery") die("slot must be hero or gallery.");
    if (alt.length === 0) die("Give Hebrew alt text — it is what a screen reader says.");
    await setImage(table, key, slot, url, alt.join(" "));
    break;
  }
  case "images":
    await images(rest.includes("--sweep"));
    break;

  case "set": {
    const [what, key, ...pairs] = rest;
    const table = tableOf(what);
    if (!key) die("set needs a target id.");
    if (pairs.length === 0) die("set needs at least one field=value.");
    write({ table, op: "patch", key, fields: parseFields(pairs) });
    break;
  }
  case "clear": {
    const [what, key, ...names] = rest;
    const table = tableOf(what);
    if (!key || names.length === 0) die("clear needs a target id and at least one field name.");
    write({ table, op: "patch", key, unset: names });
    break;
  }
  case "add": {
    const [what, key, ...pairs] = rest;
    const table = tableOf(what);
    if (!key) die("add needs an id for the new row (a kebab-case slug).");
    write({ table, op: "create", key, fields: parseFields(pairs) });
    break;
  }
  case "rm": {
    const [what, key] = rest;
    const table = tableOf(what);
    if (!key) die("rm needs a target id.");
    write({ table, op: "delete", key });
    break;
  }

  default:
    console.log(USAGE);
    process.exit(command ? 1 : 0);
}
