/**
 * Who counts as family.
 *
 * Sign-in is Google one-tap — no passwords, no keys to type, and everyone is
 * already signed into Google on their phone. This allowlist is what turns
 * "anyone with a Google account" into "the four of us": an address that is not
 * on this list cannot sign in at all, so the trip can be read by anyone with
 * the URL but changed only by us.
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
  "yonitiny@gmail.com": { name: "Yoni", role: "adult" },
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
