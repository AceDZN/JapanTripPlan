// Speak the finished background research back into the chat it came from.
//
// This is the second half of `queue_background_research`, and the only reason
// the whole flow is worth building: without it the family gets a wish page that
// quietly fills in, and never hears back from the conversation where they asked.
//
// HOW IT REACHES THEM. It posts a follow-up to the originating session through
// eve's own documented route (`POST /eve/v1/session/:id` with that session's
// continuation token — eve/docs/channels/eve.mdx). That wakes the parked chat
// and starts a turn there, so the concierge itself reads these findings and
// says them in its own voice, to whoever is actually holding the phone. The
// delivered text is NOT shown verbatim; it is the material for that reply.
//
// Doing it in two hops is deliberate. The originating session is the one that
// knows who is speaking right now (the `משתמש:` clause), which is the only
// place the privacy rule about private wishes can be enforced honestly.

import { defineTool } from "eve/tools";
import { z } from "zod";

import { decodeReplyTicket, deliverToSession } from "../lib/self";

const OUTCOMES = {
  found: "המחקר הסתיים ויש ממצאים",
  partial: "המחקר הסתיים חלקית — חלק מהפרטים לא אומתו",
  failed: "המחקר נכשל",
} as const;

export default defineTool({
  description: [
    "Deliver a finished background research result back into the conversation that asked for it.",
    "ONLY a background research run calls this, and only with the replyTicket it was given in its brief.",
    "Call it last, after research_wish has already recorded the findings —",
    "this speaks to the family, it does not save anything.",
    "Report failure through it too: a background job that dies silently is the worst outcome there is.",
  ].join(" "),
  inputSchema: z.object({
    replyTicket: z
      .string()
      .describe(
        "The opaque handle from your background brief. Internal routing — never print it, quote it or mention it.",
      ),
    outcome: z
      .enum(["found", "partial", "failed"])
      .describe("Honest state of the research. 'failed' is a legitimate answer and must be reported."),
    text: z
      .string()
      .min(2)
      .describe(
        "Hebrew, short and spoken: what it is, what it costs, which shop, and which trip day it falls on. " +
          "On failure: what you could not find out and why.",
      ),
    topic: z.string().optional().describe("Hebrew: what was researched, for the concierge's context."),
    wishId: z.string().optional().describe("The wish these findings were written onto."),
    askedBy: z.string().optional().describe("Who asked, so the reply can be addressed to them."),
    visibility: z
      .enum(["shared", "private"])
      .default("shared")
      .describe("Copied from the brief. A private wish is reported with care, only to its owner."),
  }),
  async execute(input) {
    const ticket = decodeReplyTicket(input.replyTicket);
    if (!ticket) {
      return {
        ok: false as const,
        error:
          "replyTicket is not readable. It must be copied exactly from the background brief. " +
          "The findings on the wish are still saved; only the chat reply is lost.",
      };
    }

    // Built here rather than by the model so the delivered turn always carries
    // the same guard rails — in particular the privacy check, which depends on
    // who is speaking in the DESTINATION chat and cannot be evaluated here.
    const lines = [
      "[עדכון-רקע]",
      `${OUTCOMES[input.outcome]}.`,
      ...(input.topic ? [`נושא: ${input.topic}`] : []),
      ...(input.askedBy ? [`ביקש/ה: ${input.askedBy}`] : []),
      ...(input.wishId ? [`משאלה: ${input.wishId}`] : []),
      "",
      "ממצאים:",
      input.text,
      "",
      "מסור את זה עכשיו למשפחה בעברית, בקצרה ובטון הרגיל שלך, כמו מי שחוזר עם התשובה שהבטיח.",
      "אל תצטט את השורות האלה, אל תזכיר \"עדכון רקע\" ואל תתאר את המנגנון.",
    ];

    if (input.visibility === "private") {
      lines.push(
        "המשאלה הזאת פרטית. אם מי שמדבר עכשיו בצ'אט אינו מי שביקש אותה — אל תפרט כלום," +
          " תגיד רק שיש עדכון שממתין להם בעמוד המשאלות שלהם.",
      );
    }

    const delivered = await deliverToSession(ticket, lines.join("\n"));

    if (!delivered.ok) {
      return {
        ok: false as const,
        error: delivered.error,
        note:
          "הצ'אט לא נענה. אם כבר קראת ל-research_wish הממצאים שמורים והם יראו אותם בעמוד המשאלות.",
      };
    }

    return { ok: true as const, deliveredTo: delivered.sessionId };
  },
});
