import type { Auth } from "convex/server";
import { familyMemberFor, type FamilyMember } from "./family";

/**
 * Who is making this call.
 *
 * "family"  — a signed-in family member, identified by the e-mail claim in a
 *             Clerk JWT and matched against the allowlist in `family.ts`.
 * "service" — eve or a local Claude Code skill holding AGENT_SERVICE_KEY.
 *             Acts with full access, as the trip owner.
 */
export type Actor = {
  kind: "family" | "service";
  /** Display name for `updatedBy` / `doneBy` attribution. */
  name: string;
  email?: string;
  role?: FamilyMember["role"];
};

/**
 * Gate for every write, and for every read that touches private data.
 *
 * Public trip content (days, blocks, places, checklist items, guides) is
 * deliberately readable without auth — the site is already public, and that is
 * what lets every page be server-rendered and precached for offline use in
 * Japan. What this protects is (a) mutating the plan and (b) reading
 * `privateRecords`, `chatThreads` and `chatMessages`.
 *
 * Note the allowlist is enforced here as well as in Clerk. Clerk decides who
 * may hold an account; this decides who may change the trip. Defence in depth,
 * and it keeps the rule visible in the codebase rather than only in a
 * dashboard setting.
 *
 * Takes `{ auth }` rather than a QueryCtx/MutationCtx so an action can gate on
 * it too — the identity check reads nothing from the database.
 */
export async function requireFamily(ctx: { auth: Auth }): Promise<Actor> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error(
      "Not signed in. Sign in with a family account, or call the /agent HTTP routes with AGENT_SERVICE_KEY.",
    );
  }

  const email = typeof identity.email === "string" ? identity.email : undefined;
  const member = familyMemberFor(email);
  if (!member) {
    throw new Error("This account is not on the family list.");
  }

  return {
    kind: "family",
    name: member.name,
    email: email?.trim().toLowerCase(),
    role: member.role,
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
 * The key lives in Convex env, trip-agent's Vercel env and your local .env,
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
