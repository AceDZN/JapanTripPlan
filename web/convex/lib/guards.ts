import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Who is making this call.
 *
 * "family"  — a signed-in family member (Convex Auth session).
 * "service" — eve or a local Claude Code skill, holding AGENT_SERVICE_KEY.
 *             Acts with full access, as the trip owner.
 */
export type Actor = {
  kind: "family" | "service";
  /** Display name for `updatedBy` / `doneBy` attribution. */
  name: string;
};

/**
 * Gate for every write, and for every read that touches private data.
 *
 * Public trip content (days, blocks, places, checklist items, guides) is
 * deliberately readable without auth — the site is already public. What this
 * protects is (a) mutating the plan and (b) reading `privateRecords`,
 * `chatThreads` and `chatMessages`.
 */
export async function requireFamily(ctx: QueryCtx | MutationCtx): Promise<Actor> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error(
      "Not authorized. Sign in as a family member, or call the /agent HTTP routes with AGENT_SERVICE_KEY.",
    );
  }
  return {
    kind: "family",
    name: identity.name ?? identity.email ?? "family",
  };
}

/**
 * Constant-time-ish comparison so a wrong key cannot be recovered by timing
 * the 401. Lengths differing is already a mismatch.
 */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The agent bypass: `Authorization: Bearer <AGENT_SERVICE_KEY>`.
 *
 * Returns null when the header is missing or wrong, so the caller can 401.
 * The key lives in Convex env + trip-agent's Vercel env + your local .env,
 * and never reaches the browser.
 */
export function serviceActorFromRequest(request: Request): Actor | null {
  const expected = process.env.AGENT_SERVICE_KEY;
  if (!expected) return null;

  const header = request.headers.get("Authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return null;

  const presented = header.slice(prefix.length).trim();
  if (!presented || !secretsMatch(presented, expected)) return null;

  return { kind: "service", name: "agent" };
}
