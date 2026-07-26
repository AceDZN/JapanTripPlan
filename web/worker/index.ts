/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createAgentUIStreamResponse } from "ai";
import { DEFAULT_CHAT_MODEL, createTripAgent } from "../components/chat/agent";

interface Env {
  ASSETS?: Fetcher;
  DB: D1Database;
  /**
   * Vercel AI Gateway key. Local: `web/.dev.vars`.
   * Deployed: `npx wrangler secret put AI_GATEWAY_API_KEY`.
   */
  AI_GATEWAY_API_KEY?: string;
  /** Optional model override, e.g. "anthropic/claude-opus-5". */
  CHAT_MODEL?: string;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

/* ==========================================================================
   POST /api/chat — the trip concierge agent (AI SDK ToolLoopAgent).

   Accepts the `useChat` UIMessage payload ({ messages: UIMessage[] }) and
   returns an AI SDK UI message stream, which `@ai-sdk/react`'s useChat
   consumes natively — including the tool-call parts the UI renders as
   progress lines.
   ========================================================================== */

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ error: "רק בקשות POST נתמכות כאן." }, 405);
  }

  if (!env.AI_GATEWAY_API_KEY) {
    return jsonResponse(
      {
        error: "הצ׳אט עוד לא מחובר — חסר מפתח של Vercel AI Gateway.",
        hint: [
          "1. vercel.com → AI Gateway → API Keys, יוצרים מפתח (כולל $5 קרדיט חינם בחודש).",
          "2. מקומית: מוסיפים לקובץ web/.dev.vars את השורה AI_GATEWAY_API_KEY=vck_...",
          "3. בענן: מריצים npx wrangler secret put AI_GATEWAY_API_KEY",
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

  const agent = createTripAgent({
    apiKey: env.AI_GATEWAY_API_KEY,
    model: env.CHAT_MODEL || DEFAULT_CHAT_MODEL,
  });

  try {
    return await createAgentUIStreamResponse({
      agent,
      // Only the last 20 turns are replayed, to bound context growth.
      uiMessages: messages.slice(-20),
      onError: (error) => {
        // Surfaced to the client as an error part on the stream.
        const message = error instanceof Error ? error.message : String(error);
        if (/quota|credit|payment|insufficient/i.test(message)) {
          return "נגמר הקרדיט של ה־AI Gateway. אפשר לטעון עוד בלוח הבקרה של Vercel.";
        }
        if (/rate.?limit|429/i.test(message)) {
          return "יותר מדי בקשות כרגע. נסו שוב בעוד רגע.";
        }
        if (/api key|unauthor|forbidden|401|403/i.test(message)) {
          return "מפתח ה־AI Gateway נדחה. בדקו שהמפתח נכון ופעיל.";
        }
        return "משהו השתבש בדרך לצ׳אט. נסו שוב בעוד רגע.";
      },
    });
  } catch {
    return jsonResponse({ error: "שירות הצ׳אט לא זמין כרגע. נסו שוב בעוד רגע." }, 502);
  }
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // API routes are handled here, before the framework handler, because that
    // is the reliable path for server endpoints on this stack.
    if (url.pathname === "/api/chat") {
      return handleChat(request, env);
    }

    if (url.pathname === "/_vinext/image") {
      if (!env.ASSETS || !env.IMAGES) {
        const source = url.searchParams.get("url");
        if (source?.startsWith("/") && !source.startsWith("//")) {
          return Response.redirect(new URL(source, request.url), 302);
        }

        return new Response("Image optimization is unavailable.", {
          status: 503,
        });
      }

      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
