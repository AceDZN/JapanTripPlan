/**
 * Who counts as family. This list IS the access control for the trip.
 *
 * Sign-in is Clerk e-mail + password. We deliberately do NOT use Clerk's
 * Allowlist feature (it is a paid plan, and for four people it would buy us
 * nothing): authorization is enforced here, on the server, on every call.
 *
 * What that means in practice — if a stranger somehow creates an account on
 * our Clerk instance, they get a valid session and precisely nothing with it.
 * They see the same public itinerary anyone with the URL can see, and every
 * write and every private record is refused, because `requireFamily()` looks
 * up their address here and does not find it. The gate is in version control
 * rather than in a dashboard setting, which is where we want it.
 *
 * `name` is what shows up as "who closed this" on a ticked checklist item, so
 * keep it short and human.
 *
 * To add someone later (a grandparent following along, say), add the address
 * here and redeploy — there is no invite flow to maintain.
 */

export type FamilyRole = "owner" | "adult" | "kid";

export type FamilyMember = {
  name: string;
  role: FamilyRole;
};

export const FAMILY: Record<string, FamilyMember> = {
  "alex@acedzn.com": { name: "Alex", role: "owner" },
  "yonitiny@gmail.com": { name: "Yonit", role: "adult" },
  "maya.s@acedzn.com": { name: "Maya", role: "kid" },
  "tommy@acedzn.com": { name: "Tommy", role: "kid" },
};

/** Case-insensitive lookup — Google may hand back a differently-cased address. */
export function familyMemberFor(email: string | undefined): FamilyMember | null {
  if (!email) return null;
  return FAMILY[email.trim().toLowerCase()] ?? null;
}

export function isFamilyEmail(email: string | undefined): boolean {
  return familyMemberFor(email) !== null;
}
