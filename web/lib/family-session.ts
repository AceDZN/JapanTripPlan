import { auth, currentUser } from "@clerk/nextjs/server";
import { familyMemberFor, type FamilyMember } from "@/convex/lib/family";

/**
 * Who is making this request, resolved on the SERVER.
 *
 * The eve relay used to forward every turn as one shared `family:<secret>`
 * identity, so the agent could not tell Alex from Tommy — which makes
 * "add that to my list" unanswerable and makes a private wish unsafe to
 * mention at all.
 *
 * Deliberately server-only and never parameterised: if the caller could pass
 * in a name, the whole thing would be theatre. The allowlist is the same
 * `convex/lib/family.ts` that guards every Convex write, so there is exactly
 * one definition of "family" in this codebase.
 */
export type FamilySession = FamilyMember & { email: string };

/**
 * Read the e-mail from the session token, falling back to Clerk's API.
 *
 * The default Clerk session token does not always carry `email`; the "convex"
 * JWT template does. Trying the claim first keeps the common path free of a
 * network round trip on a streaming endpoint, and `currentUser()` is the
 * correct answer rather than a guess when the claim is absent.
 */
export async function familySession(): Promise<FamilySession | null> {
  const { userId, sessionClaims } = await auth();
  if (!userId) return null;

  const claimEmail =
    typeof sessionClaims?.email === "string" ? sessionClaims.email : undefined;

  let email = claimEmail;
  if (!email) {
    try {
      const user = await currentUser();
      email = user?.primaryEmailAddress?.emailAddress ?? undefined;
    } catch {
      // Clerk unreachable: treat as unidentified rather than failing the turn.
      // The agent's instructions already cover "I do not know who this is".
      return null;
    }
  }

  const member = familyMemberFor(email);
  // A signed-in stranger is NOT family. Clerk decides who may hold an account;
  // this decides who counts — same rule as requireFamily() on the Convex side.
  if (!member || !email) return null;

  return { ...member, email: email.trim().toLowerCase() };
}
