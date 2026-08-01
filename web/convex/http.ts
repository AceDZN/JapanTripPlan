import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { auth } from "./auth";
import { serviceActorFromRequest } from "./lib/guards";

const http = httpRouter();

// Convex Auth's own routes (sign-in, sign-out, token refresh).
auth.addHttpRoutes(http);

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
