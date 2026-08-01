import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { familyMemberFor } from "./lib/family";

/**
 * Family sign-in: Google one-tap, restricted to the four addresses in
 * `lib/family.ts`.
 *
 * Chosen over passwords or e-mailed codes because the family signs in on
 * phones: everyone is already logged into Google there, so it is one tap with
 * nothing to remember, type or lose. There is no password to reset and no
 * shared secret that leaks by being shared.
 *
 * Reads of the public trip stay open to anyone with the URL, exactly as today.
 * Auth gates writes, and gates reads of `privateRecords` and chat history —
 * the ticket links, booking confirmations, Airbnb addresses and door codes
 * that currently have to live outside the app in "private folders".
 *
 * Machine access (eve, local Claude Code skills) does NOT go through this. It
 * uses the Bearer service key in `convex/http.ts`, so an agent never needs a
 * human identity.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],

  callbacks: {
    /**
     * The allowlist gate. Runs before the account is created, so a stranger
     * who finds the sign-in button never gets a user document at all —
     * rejection happens here rather than being checked on every later query.
     */
    async createOrUpdateUser(ctx, { existingUserId, profile }) {
      const email = typeof profile.email === "string" ? profile.email : undefined;
      const member = familyMemberFor(email);

      if (!member) {
        // Surfaced to the user as a failed sign-in. Deliberately vague about
        // which addresses are allowed.
        throw new Error("This Google account is not on the family list.");
      }

      if (existingUserId) {
        await ctx.db.patch("users", existingUserId, {
          name: member.name,
          email: email!.trim().toLowerCase(),
        });
        return existingUserId;
      }

      return await ctx.db.insert("users", {
        name: member.name,
        email: email!.trim().toLowerCase(),
        emailVerificationTime: profile.emailVerified ? Date.now() : undefined,
        image: typeof profile.image === "string" ? profile.image : undefined,
      });
    },
  },
});
