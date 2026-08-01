import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { serviceActorFromRequest } from "./lib/guards";

// No sign-in routes here: Clerk handles the whole auth flow in the Next.js
// app and Convex only verifies the resulting JWT (see convex/auth.config.ts).
const http = httpRouter();

/**
 * Machine API for eve and the local Claude Code skills.
 *
 * Everything under /agent is authenticated with
 * `Authorization: Bearer <AGENT_SERVICE_KEY>` and acts with full owner access.
 * The key lives in Convex env, trip-agent's Vercel env and your local .env —
 * never in client code.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const UNAUTHORIZED = () => json({ ok: false, error: "unauthorized" }, 401);

http.route({
  path: "/agent/health",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const actor = serviceActorFromRequest(request);
    if (!actor) return UNAUTHORIZED();
    return json({ ok: true, actor: actor.kind });
  }),
});

/**
 * Bulk import from the legacy hand-maintained files.
 *
 * Body: { kind, rows }, plus `dayN` when kind is "blocks". The caller chunks —
 * guide bodies run to ~42KB each, so they are posted one at a time.
 */
http.route({
  path: "/agent/import",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "body must be an object" }, 400);
    }
    const { kind, rows, dayN } = body as {
      kind?: unknown;
      rows?: unknown;
      dayN?: unknown;
    };
    if (typeof kind !== "string" || !Array.isArray(rows)) {
      return json({ ok: false, error: "expected { kind: string, rows: array }" }, 400);
    }

    try {
      switch (kind) {
        case "days":
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importDays, { rows: rows as never })) });
        case "blocks": {
          if (typeof dayN !== "number") {
            return json({ ok: false, error: "kind 'blocks' requires numeric dayN" }, 400);
          }
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importBlocksForDay, { dayN, rows: rows as never })) });
        }
        case "places":
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importPlaces, { rows: rows as never })) });
        case "checklistGroups":
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importChecklistGroups, { rows: rows as never })) });
        case "checklistItems":
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importChecklistItems, { rows: rows as never })) });
        case "guides":
          return json({ ok: true, ...(await ctx.runMutation(internal.importData.importGuides, { rows: rows as never })) });
        default:
          return json({ ok: false, error: `unknown kind '${kind}'` }, 400);
      }
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
  }),
});

/**
 * Full read-back for the parity gate.
 *
 * The migration's safety net: the import script fetches this and deep-compares
 * it against the current `trip-data.ts` / `places.json` / `checklist-data.ts`
 * so we can prove Convex holds exactly what the live app holds before anything
 * switches over.
 */
http.route({
  path: "/agent/snapshot",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const [days, places, checklist, guides] = await Promise.all([
      ctx.runQuery(api.trip.listDays, {}),
      ctx.runQuery(api.trip.listPlaces, {}),
      ctx.runQuery(api.trip.listChecklist, {}),
      ctx.runQuery(api.trip.listGuides, {}),
    ]);

    return json({ ok: true, days, places, checklist, guides });
  }),
});

/**
 * Read every private record. Used to copy the vault between deployments.
 */
http.route({
  path: "/agent/private/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();
    const records = await ctx.runQuery(internal.private.internalListAll, {});
    return json({ ok: true, records });
  }),
});

/**
 * Create or update one private record.
 *
 * Used by the seeder to lay out an empty slot for every private item the
 * guides reference ("save it in the private lodging folder", "keep the door
 * code out of the public itinerary"), and available to eve later. A blank
 * value never overwrites a filled-in one.
 */
http.route({
  path: "/agent/private/upsert",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const actor = serviceActorFromRequest(request);
    if (!actor) return UNAUTHORIZED();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "body must be an object" }, 400);
    }
    const { subject, subjectId, kind, label, value, url, hint, updatedBy } = body as Record<string, unknown>;

    if (
      typeof subject !== "string" ||
      typeof subjectId !== "string" ||
      typeof kind !== "string" ||
      typeof label !== "string" ||
      typeof value !== "string"
    ) {
      return json(
        { ok: false, error: "expected { subject, subjectId, kind, label, value } as strings" },
        400,
      );
    }

    try {
      const id = await ctx.runMutation(internal.private.internalUpsert, {
        subject: subject as never,
        subjectId,
        kind: kind as never,
        label,
        value,
        url: typeof url === "string" && url.length > 0 ? url : undefined,
        hint: typeof hint === "string" && hint.length > 0 ? hint : undefined,
        updatedBy: typeof updatedBy === "string" ? updatedBy : undefined,
      });
      return json({ ok: true, id });
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
  }),
});

/**
 * Every guide with its body, for regenerating `JAPAN2026/*.md`.
 *
 * The counterpart to /agent/import: because this exists, the trip can always
 * be rendered back out to readable files and can never be trapped in Convex.
 */
http.route({
  path: "/agent/export",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();
    const guides = await ctx.runQuery(api.trip.exportGuides, {});
    return json({ ok: true, guides });
  }),
});

/**
 * Seed a wish for a family member, by e-mail.
 *
 * Service-key only. `convex/wishes.ts` refuses any address that is not on the
 * allowlist, so this cannot create a wish for someone outside the family.
 */
http.route({
  path: "/agent/wishes/create",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "body must be an object" }, 400);
    }
    const row = body as Record<string, unknown>;
    if (typeof row.ownerEmail !== "string" || typeof row.title !== "string") {
      return json(
        { ok: false, error: "expected { ownerEmail, title, kind, priority, visibility }" },
        400,
      );
    }

    try {
      const result = await ctx.runMutation(internal.wishes.internalCreateFor, row as never);
      return json({ ...result, ok: true });
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
  }),
});

http.route({
  path: "/agent/wishes/seed",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "body must be an object" }, 400);
    }
    const row = body as Record<string, unknown>;
    if (typeof row.ownerEmail !== "string" || typeof row.title !== "string") {
      return json({ ok: false, error: "expected { ownerEmail, title, kind, priority, visibility }" }, 400);
    }

    try {
      const result = await ctx.runMutation(internal.wishes.internalCreateFor, row as never);
      return json({ ok: true, ...result });
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
  }),
});

/**
 * The agent's window onto the wish list.
 *
 * `/list` returns every wish INCLUDING private ones, which is the one place
 * that happens. That is deliberate and it is the reason the service key never
 * reaches a browser: eve needs to research a private wish (that is the whole
 * point of noting a surprise) but must never surface one to the wrong person.
 * eve's replies go back to a single family chat, so its instructions forbid
 * discussing a private wish that is not the asker's own.
 */
http.route({
  path: "/agent/wishes/list",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();
    const wishes = await ctx.runQuery(internal.wishes.internalListAll, {});
    return json({ ok: true, wishes });
  }),
});

/** Write research back onto a wish. Cannot change ownership or visibility. */
http.route({
  path: "/agent/wishes/research",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return json({ ok: false, error: "body must be an object" }, 400);
    }
    if (typeof (body as Record<string, unknown>).id !== "string") {
      return json({ ok: false, error: "expected { id, ...research }" }, 400);
    }

    try {
      const result = await ctx.runMutation(
        internal.wishes.internalApplyResearch,
        body as never,
      );
      return json({ ...result, ok: true });
    } catch (error) {
      return json({ ok: false, error: String(error) }, 500);
    }
  }),
});

/**
 * Store an image eve found, and return its storage id.
 *
 * The agent sends the bytes; Convex owns the file. Passing a remote URL
 * straight through to the client instead would leave the wish depending on
 * some shop's CDN still being up in October.
 */
http.route({
  path: "/agent/wishes/image",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return json({ ok: false, error: "expected an image/* body" }, 400);
    }

    const storageId = await ctx.storage.store(await request.blob());
    return json({ ok: true, storageId });
  }),
});

/** One guide with its full body — kept separate so /agent/snapshot stays small. */
http.route({
  path: "/agent/guide",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    if (!serviceActorFromRequest(request)) return UNAUTHORIZED();

    const slug = new URL(request.url).searchParams.get("slug");
    if (!slug) return json({ ok: false, error: "missing ?slug" }, 400);

    const guide = await ctx.runQuery(api.trip.getGuide, { slug });
    if (!guide) return json({ ok: false, error: `no guide '${slug}'` }, 404);
    return json({ ok: true, guide });
  }),
});

export default http;
