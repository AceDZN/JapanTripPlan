import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

/**
 * Family sign-in.
 *
 * Password provider on purpose: four accounts, no e-mail infrastructure, and
 * it works offline-first once the session cookie exists. Individual accounts
 * (rather than one shared login) are what give `checklistState.doneBy` its
 * "who closed this" attribution.
 *
 * Reads of the public trip stay open to anyone with the URL, exactly as today.
 * Auth gates writes, and gates reads of `privateRecords` / chat history.
 *
 * Machine access (eve, local Claude skills) does NOT go through this — it uses
 * the Bearer service key in `convex/http.ts`.
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
});
