/**
 * POST /api/chat — the trip concierge agent (AI SDK ToolLoopAgent).
 *
 * Accepts the `useChat` UIMessage payload ({ messages: UIMessage[] }) and
 * returns an AI SDK UI message stream, which `@ai-sdk/react`'s useChat consumes
 * natively — including the tool-call parts the UI renders as progress lines.
 */

import { createAgentUIStreamResponse } from "ai";
import { DEFAULT_CHAT_MODEL, createTripAgent } from "@/components/chat/agent";
import { getChecklist, getPlaces, getTripDays } from "@/lib/trip-source";
import { describeGatewayError } from "@/lib/gateway-error";
import { gatewayApiKey, gatewayConfigured, jsonResponse } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Tool loops with up to eight steps need more than the default budget. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  if (!gatewayConfigured()) {
    return jsonResponse(
      {
        error: "הצ׳אט עוד לא מחובר — חסר חיבור ל־Vercel AI Gateway.",
        hint: [
          "1. בענן: הפרויקט ב־Vercel מתחבר ל־AI Gateway אוטומטית (OIDC) — צריך רק להפעיל אותו בהגדרות הפרויקט.",
          "2. מקומית: מריצים vercel env pull כדי למשוך אסימון OIDC,",
          "   או מוסיפים לקובץ web/.env.local את השורה AI_GATEWAY_API_KEY=vck_...",
        ].join("\n"),
      },
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "הבקשה אינה JSON תקין." }, 400);
  }

  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "לא נמצאה שאלה לשלוח. כתבו הודעה ונסו שוב." }, 400);
  }

  // Cap history, then re-anchor on a user turn: slicing mid-conversation can
  // leave an assistant message first, which providers reject.
  const history = messages.slice(-20);
  while (history.length > 0 && (history[0] as { role?: string })?.role !== "user") {
    history.shift();
  }
  if (history.length === 0) {
    return jsonResponse({ error: "לא נמצאה שאלה לשלוח. כתבו הודעה ונסו שוב." }, 400);
  }

  // One read of the trip per request. The tools close over it, so every answer
  // in this turn is grounded in the same consistent snapshot of Convex.
  let trip;
  try {
    const [days, places, checklist] = await Promise.all([
      getTripDays(),
      getPlaces(),
      getChecklist(),
    ]);
    trip = { days, places, checklist };
  } catch {
    return jsonResponse(
      { error: "לא הצלחתי לקרוא את התוכנית כרגע. נסו שוב בעוד רגע." },
      503,
    );
  }

  const agent = createTripAgent({
    trip,
    apiKey: gatewayApiKey(),
    model: process.env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
  });

  try {
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: history,
      onError: (error) => {
        // Surfaced to the client as an error part on the stream, and to the
        // server log with the upstream status attached.
        console.error(`[chat] ${describeGatewayError(error).summary}`);

        const message = error instanceof Error ? error.message : String(error);
        if (/quota|credit|payment|insufficient/i.test(message)) {
          return "נגמר הקרדיט של ה־AI Gateway. אפשר לטעון עוד בלוח הבקרה של Vercel.";
        }
        if (/rate.?limit|429/i.test(message)) {
          return "יותר מדי בקשות כרגע. נסו שוב בעוד רגע.";
        }
        if (/api key|unauthor|forbidden|401|403/i.test(message)) {
          return "החיבור ל־AI Gateway נדחה. בדקו שה־Gateway מופעל לפרויקט.";
        }
        return "משהו השתבש בדרך לצ׳אט. נסו שוב בעוד רגע.";
      },
    });
  } catch {
    return jsonResponse({ error: "שירות הצ׳אט לא זמין כרגע. נסו שוב בעוד רגע." }, 502);
  }
}

export async function GET(): Promise<Response> {
  return jsonResponse({ error: "רק בקשות POST נתמכות כאן." }, 405);
}
