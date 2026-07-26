/**
 * POST /api/tts — read an answer out loud.
 *
 * AI SDK `generateSpeech` through the Vercel AI Gateway. The client falls back
 * to the browser's own speechSynthesis when this endpoint is unavailable.
 */

import { generateSpeech } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { describeGatewayError } from "@/lib/gateway-error";
import { gatewayApiKey, gatewayConfigured, jsonResponse } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** One call, one answer-sized chunk. Mirrors the client-side clamp. */
const TTS_MAX_CHARS = 1000;
const DEFAULT_TTS_MODEL = "openai/tts-1";
/** Multilingual OpenAI voice; carries Hebrew acceptably. */
const DEFAULT_TTS_VOICE = "nova";

export async function POST(request: Request): Promise<Response> {
  if (!gatewayConfigured()) {
    return jsonResponse({ error: "ההקראה לא מוגדרת — אין חיבור ל־Vercel AI Gateway." }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "הבקשה אינה JSON תקין." }, 400);
  }

  const raw = (body as { text?: unknown }).text;
  const text = typeof raw === "string" ? raw.trim().slice(0, TTS_MAX_CHARS) : "";
  if (!text) return jsonResponse({ error: "אין טקסט להקראה." }, 400);

  const modelId = process.env.TTS_MODEL || DEFAULT_TTS_MODEL;
  const apiKey = gatewayApiKey();

  try {
    const speech = await generateSpeech({
      // With a key we address the Gateway explicitly; without one the AI SDK's
      // default provider resolves the slug and authenticates over OIDC.
      model: apiKey ? createGateway({ apiKey }).speech(modelId) : modelId,
      text,
      voice: process.env.TTS_VOICE || DEFAULT_TTS_VOICE,
      outputFormat: "mp3",
      // OpenAI speech models detect the language themselves and warn when this
      // is set, so it is deliberately omitted.
    });

    return new Response(speech.audio.uint8Array as unknown as BodyInit, {
      headers: {
        "content-type": speech.audio.mediaType || "audio/mpeg",
        // Same answer, same audio — worth keeping around on the device.
        "cache-control": "public, max-age=86400",
      },
    });
  } catch (error) {
    const failure = describeGatewayError(error);
    // The client silently falls back to the browser voice, so the server log is
    // the only place this is ever visible.
    console.error(`[tts] ${failure.summary}`);

    if (failure.kind === "rate-limit") {
      return new Response(
        JSON.stringify({ error: "עומס זמני על שירות ההקראה. נסו שוב בעוד רגע." }),
        {
          status: 429,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "retry-after": String(failure.retryAfter ?? 10),
          },
        },
      );
    }

    if (failure.kind === "credit") {
      return jsonResponse({ error: "נגמר הקרדיט של ה־AI Gateway, אז אין הקראה כרגע." }, 503);
    }

    if (failure.kind === "auth") {
      return jsonResponse({ error: "החיבור ל־Vercel AI Gateway נדחה, אז ההקראה כבויה." }, 503);
    }

    return jsonResponse({ error: "ההקראה נכשלה. נסו שוב בעוד רגע." }, 502);
  }
}

export async function GET(): Promise<Response> {
  return jsonResponse({ error: "רק בקשות POST נתמכות כאן." }, 405);
}
