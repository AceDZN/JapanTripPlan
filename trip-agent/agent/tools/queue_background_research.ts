// Hand a piece of research off to a background run, and get the turn back.
//
// This is the tool that makes "אני על זה, אחזור אליך" a true sentence.
//
// Until now the agent had no "later": every model decision was "do it all in
// this one turn or never", which is exactly why a turn could end with
// "I'm searching now" and zero tool calls — the architecture could not make
// that sentence true, so it was a lie the model had no way of avoiding.
//
// What actually happens: this starts a SECOND durable eve session over the
// agent's own HTTP channel (`POST /eve/v1/session`), which returns as soon as
// the session exists. That session runs the full research on the durable
// workflow runtime — web_search, web_fetch, search_places, get_day — writes the
// findings onto the wish with `research_wish`, and then, if the chat is
// resumable, delivers a spoken answer back into it with
// `deliver_background_result`. The originating turn is free to end immediately.
//
// USE IT ONLY WHEN THE RESEARCH IS TOO BIG FOR THE TURN. Research that fits in
// the current turn should still happen in the current turn: an answer that
// arrives now beats the same answer arriving in ninety seconds.

import { defineTool } from "eve/tools";
import { z } from "zod";

import { convexConfigured, convexPost } from "../lib/convex";
import { buildResearchBrief } from "../lib/research-brief";
import { continuationTokenFor, isBackgroundSession } from "../lib/live-sessions";
import {
  TICKET_TTL_MS,
  encodeReplyTicket,
  startBackgroundSession,
} from "../lib/self";

export default defineTool({
  description: [
    "Queue a real research job that runs in the background, after this turn ends, and reports back",
    "into this same chat when it is done. Use it for a wish that genuinely needs several searches",
    "— a specific product, a price, which shop on our route stocks it — when doing all of that",
    "inside the current turn would leave the family staring at a spinner.",
    "It starts a separate durable agent run with the full tool set; that run writes its findings onto",
    "the wish with research_wish and then speaks the answer back into this conversation.",
    "Call it AFTER create_wish, so the findings have somewhere to land.",
    "Research that you can finish in this turn should be finished in this turn instead.",
    "If this tool returns ok:false, nothing is running — say so in your reply and do the research now.",
  ].join(" "),
  inputSchema: z.object({
    topic: z
      .string()
      .min(2)
      .describe("Hebrew: what to research, phrased as the person would say it."),
    wishId: z
      .string()
      .optional()
      .describe("The wish id from create_wish or list_wishes. Without it there is nowhere to write the findings."),
    askedBy: z.string().optional().describe("Display name of the person who asked."),
    promptText: z.string().optional().describe("What they actually said, verbatim."),
    context: z
      .string()
      .optional()
      .describe("Hebrew: anything that narrows the search — budget, who it is for, size, colour, model."),
    visibility: z
      .enum(["shared", "private"])
      .default("shared")
      .describe("Must match the wish. A private wish is a surprise and is reported back with care."),
    replyInChat: z
      .boolean()
      .default(true)
      .describe(
        "Whether the finished research should be pushed back into this conversation. " +
          "Leave true unless the person explicitly does not want to be interrupted.",
      ),
  }),
  async execute(input, ctx) {
    // A background run must not queue more background runs. Nothing about the
    // tool surface stops it — a research session holds the same tools a chat
    // does — so the recursion is refused here, at the one place that knows
    // which kind of session it is running in.
    if (isBackgroundSession(ctx.session.id)) {
      return {
        ok: false as const,
        error: "You are already a background run. Do the research yourself, in this run.",
      };
    }

    // The token that can resume THIS chat. Recorded by hooks/live-sessions.ts,
    // because a tool's ctx deliberately does not carry it. When it is missing
    // the background run still does the research and still writes it onto the
    // wish — it just cannot come back and say so, and the caller is told that
    // plainly rather than being allowed to promise a reply that will not come.
    const continuationToken = input.replyInChat ? continuationTokenFor(ctx.session.id) : null;

    const replyTicket = continuationToken
      ? encodeReplyTicket({
          s: ctx.session.id,
          c: continuationToken,
          x: Date.now() + TICKET_TTL_MS,
        })
      : undefined;

    const message = buildResearchBrief({
      topic: input.topic,
      ...(input.wishId ? { wishId: input.wishId } : {}),
      ...(input.askedBy ? { askedBy: input.askedBy } : {}),
      ...(input.promptText ? { promptText: input.promptText } : {}),
      ...(input.context ? { context: input.context } : {}),
      visibility: input.visibility,
      ...(replyTicket ? { replyTicket } : {}),
    });

    const started = await startBackgroundSession(message);

    // Park the wish as `researching` once the run is genuinely under way so the
    // board shows it in flight instead of looking untouched. The background
    // session itself is the worker; there is deliberately no polling schedule
    // burning an agent run while the queue is empty.
    //
    // Best-effort on purpose: a wish that will not park is a missing spinner,
    // not a reason to fail research that already started.
    if (started.ok && input.wishId && convexConfigured()) {
      try {
        await convexPost("/agent/wishes/mark-researching", { id: input.wishId });
      } catch {
        // Swallowed deliberately — see above.
      }
    }

    if (!started.ok) {
      return {
        ok: false as const,
        error: started.error,
        // Said in the tool result rather than left to the model to work out:
        // a failed queue means the family gets nothing unless this turn does
        // the work itself.
        whatToDoNow:
          "המחקר ברקע לא התחיל. אל תבטיח שתחזור אליהם — או שתחקור עכשיו באותו תור, " +
          "או שתגיד במפורש שלא הצלחת להתחיל את הבדיקה.",
      };
    }

    return {
      ok: true as const,
      backgroundSessionId: started.sessionId,
      willReplyInChat: Boolean(replyTicket),
      ...(input.wishId ? { wishId: input.wishId } : {}),
      note: replyTicket
        ? "המחקר רץ ברקע ויחזור לצ'אט הזה עם התשובה. אפשר להגיד להם שאתה על זה — זו אמת עכשיו."
        : "המחקר רץ ברקע והממצאים ייכתבו על המשאלה, אבל אין דרך לחזור לצ'אט הזה. " +
          "תגיד להם שהתוצאה תופיע בעמוד המשאלות, לא כאן.",
    };
  },
});
