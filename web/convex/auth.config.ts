/**
 * Convex trusts JWTs minted by Clerk.
 *
 * `applicationID` must match the `aud` claim in the Clerk JWT template (the
 * template is named "convex" and sets `"aud": "convex"`).
 *
 * The issuer differs per environment, so it comes from Convex env rather than
 * being hard-coded:
 *   dev   https://darling-serval-81.clerk.accounts.dev
 *   prod  https://clerk.japan.acedzn.dev
 *
 * Set it with:  npx convex env set CLERK_JWT_ISSUER_DOMAIN <url>
 *
 * Convex fetches {domain}/.well-known/openid-configuration to find the JWKS,
 * so nothing here needs the public key or either Clerk secret.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
