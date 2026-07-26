/**
 * GET /api/agent/enabled — which transport the chat should use.
 *
 * Never cached: flipping the secret must take effect on the next load. Only a
 * boolean crosses to the browser; EVE_URL and EVE_SHARED_SECRET stay server-side.
 */

import { eveEnabled } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ enabled: eveEnabled() }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
