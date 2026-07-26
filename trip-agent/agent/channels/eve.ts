import {
  httpBasic,
  localDev,
  vercelOidc,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

/**
 * Shared family credential. The webapp (and any curl / TTS client) authenticates
 * with HTTP Basic `family:$EVE_SHARED_SECRET`.
 *
 * The secret is read per request rather than captured once at module load, so a
 * rotated environment variable takes effect without a code change. If it is
 * unset the entry skips instead of admitting anyone: the walk then falls through
 * to OIDC / localhost and finally to a 401. Fails closed.
 */
const FAMILY_USERNAME = "family";
const REALM = "japan-2026";

const familyBasic: AuthFn<Request> = withAuthChallenges(
  (request) => {
    const password = process.env.EVE_SHARED_SECRET;
    if (!password) return null;
    return httpBasic({ username: FAMILY_USERNAME, password }, { realm: REALM })(
      request,
    );
  },
  [{ scheme: "Basic", parameters: { realm: REALM } }],
);

export default eveChannel({
  auth: [
    // 1. The family shared secret — what the webapp and the phones actually use.
    familyBasic,
    // 2. Vercel OIDC: the eve TUI pointed at the deployment, plus our own
    //    Vercel deployments calling this agent.
    vercelOidc(),
    // 3. Localhost only, for `eve dev`. Never admits production traffic.
    localDev(),
    // No placeholderAuth() and no none(): everything else gets a 401.
  ],
  // The trip webapp calls these routes from the browser.
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["authorization", "content-type"],
  },
});
