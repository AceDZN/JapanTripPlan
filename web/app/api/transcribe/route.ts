/**
 * POST /api/transcribe — have a model listen to a recorded voice note.
 *
 * Why the app does this instead of just handing the agent the audio: eve stages
 * every attachment into the agent sandbox and, on the way into the model call,
 * only re-inlines the bytes for `image/*` (≤3 MiB) and `application/pdf`
 * (≤20 MiB) — see `shouldInlineSandboxRefAsBytes` in
 * eve/dist/src/harness/attachment-staging.js, unchanged as of 0.29.4. An
 * `audio/*` part therefore reaches the model as the bare line
 * "Attached file /workspace/attachments/…/voice.webm (audio/webm)", which is
 * exactly why a voice note used to come back as "קיבלתי את ההודעה הקולית, אבל
 * אני לא יכולה להאזין לה". The staging call is unconditional, there is no config
 * flag, and every eve agent has exactly one sandbox — so the listening has to
 * happen here, before the turn is sent.
 *
 * The primary model is audio-native (Gemini, the same family the trip agent runs
 * on) rather than a pure speech-to-text engine: it takes the trip's vocabulary as
 * context and gets Hebrew place names right far more often. `whisper-1` is the
 * fallback for when the Gateway refuses that model.
 *
 * The request body is the raw recording; `content-type` carries the media type
 * the browser actually recorded (webm/opus, or mp4/aac on Safari).
 */

import { generateText, transcribe } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { describeGatewayError } from "@/lib/gateway-error";
import { gatewayApiKey, gatewayConfigured, jsonResponse } from "@/lib/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mirrors MAX_RECORDING_SECONDS on the client, with room for a fat codec. */
const MAX_BYTES = 8 * 1024 * 1024;

const DEFAULT_LISTEN_MODEL = "google/gemini-3.6-flash";
const DEFAULT_FALLBACK_MODEL = "openai/whisper-1";

const ACCEPTED = /^audio\/(webm|mp4|mpeg|mp3|ogg|wav|x-m4a|aac|flac)\b/i;

/**
 * Vocabulary hint. This trip is almost entirely proper nouns, and without them
 * "קיוטו" comes back as "קיטו" and brand names arrive transliterated into Latin
 * letters mid-sentence.
 */
const VOCABULARY = [
  "ערים ואזורים: טוקיו, קיוטו, אוסקה, נריטה, קמאקורה, אנושימה, נקאנו, שיבויה, שינג׳וקו, הרג׳וקו, אקיהברה, אודאיבה, אואנו, טבטה, פושימי אינארי, אוג׳י, נמבה, דוטומבורי, שימוקיטזאווה, קיצ׳יג׳וג׳י.",
  "מקומות: מוזיאון ג׳יבלי, פוקימון, פוקפארק, נינטנדו, סופר נינטנדו וורלד, טימלאב פלאנטס, מונדו פיקסאר, ג׳ויפוליס, דיסני סי, טוקיו דום סיטי, סנסו-ג׳י, קוואי מונסטר לנד, בית קפה חתולים, USJ.",
  "מונחים: שינקנסן, ג׳יאר פאס, סויקה, ראמן, אונסן, ריוקאן, קונביני, מאצ׳ה, טאיקו, אנימה, מנגה, קוואי.",
].join(" ");

const LISTEN_PROMPT = [
  "האזן להקלטה וכתוב בדיוק מה נאמר בה, מילה במילה, בשפה שבה דיברו.",
  "ההקלטה היא שאלה או בקשה של משפחה שנמצאת בטיול ביפן. הקשר ושמות שעשויים להופיע:",
  VOCABULARY,
  "החזר אך ורק את התמלול עצמו — בלי מרכאות, בלי הקדמה, בלי הסבר ובלי תרגום.",
  "אם לא נשמע דיבור כלל, החזר בדיוק: ---",
].join("\n");

const NO_SPEECH = "---";

function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

/** Audio-native listen. Returns null when the model produced nothing usable. */
async function listen(
  audio: Uint8Array,
  mediaType: string,
  apiKey: string | undefined,
): Promise<string | null> {
  const modelId = process.env.TRANSCRIBE_MODEL || DEFAULT_LISTEN_MODEL;
  const gateway = createGateway(apiKey ? { apiKey } : {});

  const result = await generateText({
    model: gateway(modelId),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: LISTEN_PROMPT },
          { type: "file", data: audio, mediaType },
        ],
      },
    ],
  });

  const text = result.text.trim();
  return text && text !== NO_SPEECH ? text : null;
}

/** Purpose-built speech-to-text, used when the audio-native model is unavailable. */
async function fallbackTranscribe(
  audio: Uint8Array,
  apiKey: string | undefined,
): Promise<{ text: string; language: string | null }> {
  const modelId = process.env.TRANSCRIBE_FALLBACK_MODEL || DEFAULT_FALLBACK_MODEL;

  const result = await transcribe({
    // With a key the Gateway is addressed explicitly; without one the AI SDK's
    // default provider resolves the slug and authenticates over OIDC.
    model: apiKey ? createGateway({ apiKey }).transcription(modelId) : modelId,
    audio,
    providerOptions: { openai: { prompt: VOCABULARY } },
  });

  return { text: result.text.trim(), language: result.language ?? null };
}

export async function POST(request: Request): Promise<Response> {
  if (!gatewayConfigured()) {
    return jsonResponse(
      { error: "ההאזנה להקלטות לא מוגדרת — אין חיבור ל־Vercel AI Gateway. אפשר לכתוב את השאלה." },
      503,
    );
  }

  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!ACCEPTED.test(mediaType)) {
    return badRequest(`סוג קובץ שמע לא נתמך (${mediaType || "לא ידוע"}).`);
  }

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return badRequest("ההקלטה ריקה.");
  if (audio.byteLength > MAX_BYTES) return badRequest("ההקלטה ארוכה מדי. נסו הקלטה קצרה יותר.");

  const apiKey = gatewayApiKey();

  let text = "";
  let language: string | null = null;

  try {
    text = (await listen(audio, mediaType, apiKey)) ?? "";
  } catch (error) {
    // A model that will not take audio (or is not on this Gateway plan) is a
    // routing problem, not a user problem — fall through to speech-to-text.
    console.error(`[transcribe] listen failed: ${describeGatewayError(error).summary}`);
  }

  if (!text) {
    try {
      const fallback = await fallbackTranscribe(audio, apiKey);
      text = fallback.text;
      language = fallback.language;
    } catch (error) {
      const failure = describeGatewayError(error);
      console.error(`[transcribe] ${failure.summary}`);

      if (failure.kind === "rate-limit") {
        return jsonResponse({ error: "עומס זמני על שירות ההאזנה. נסו שוב בעוד רגע." }, 429);
      }
      if (failure.kind === "credit") {
        return jsonResponse({ error: "נגמר הקרדיט של ה־AI Gateway, אז אין האזנה כרגע." }, 503);
      }
      if (failure.kind === "auth") {
        return jsonResponse({ error: "החיבור ל־Vercel AI Gateway נדחה, אז ההאזנה כבויה." }, 503);
      }
      return jsonResponse({ error: "ההאזנה נכשלה. אפשר לנסות שוב או לכתוב את השאלה." }, 502);
    }
  }

  if (!text) {
    return jsonResponse({ error: "לא זיהינו דיבור בהקלטה. נסו שוב קרוב יותר למיקרופון." }, 422);
  }

  return jsonResponse({ text, language }, 200);
}

export async function GET(): Promise<Response> {
  return jsonResponse({ error: "רק בקשות POST נתמכות כאן." }, 405);
}
