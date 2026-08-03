// Add a wish to the family list ON BEHALF OF the person you are talking to.
//
// "תוסיפי לי לרשימה פיגורת פיקאצ׳ו" should end up as TOMMY's wish, not as an
// anonymous one — that is what makes the list worth having, because every item
// carries who actually wants it.
//
// `ownerEmail` is not yours to choose. It comes from the `משתמש:` clause the
// app stamps onto every turn server-side (see web/lib/agent-context.ts); a
// browser cannot forge it, and Convex rejects any address that is not on the
// family allowlist. If that clause is absent, you do not know who is speaking
// and you must not create anything — say so and ask them to sign in.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

export default defineTool({
  description: [
    "Add a wish to the family list on behalf of the person in this conversation.",
    "THIS is the tool for 'תוסיף/י לרשימה', 'אני רוצה', 'תמצא/י לי', 'we want', 'add to my list' —",
    "anything somebody wants to get, eat, see or do. Never record such a request with edit_plan_doc:",
    "a wish written into a guide never reaches the family's wish pages or their day pages.",
    "You MUST pass their e-mail from the `משתמש:` clause of the context line; never guess it,",
    "and never use somebody else's. If there is no such clause you do not know who is asking:",
    "do not call this tool, tell them to sign in instead.",
    "Ask about visibility whenever the request could be a surprise for another family member —",
    "a wish created as 'shared' cannot be un-seen by the person it was meant to surprise.",
  ].join(" "),
  inputSchema: z.object({
    ownerEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    kind: z
      .enum(["attraction", "place", "product", "food", "experience", "other"])
      .describe("What sort of thing this is."),
    title: z.string().describe("Hebrew, short, as the person would say it."),
    titleEn: z.string().optional().describe("English name — needed to ask for it in a shop."),
    titleJa: z.string().optional().describe("Japanese name — needed to show it to staff."),
    note: z.string().optional().describe("Hebrew: anything they said that narrows it down."),
    url: z.string().optional(),
    area: z.string().optional(),
    placeId: z.string().optional().describe("Slug of a trip place, when it maps onto one."),
    dayN: z.number().int().min(1).max(17).optional().describe("Pin to a day when there is an obvious one."),
    priceYen: z.number().int().optional().describe("Only if they named a budget or you verified a price."),
    priority: z
      .enum(["must", "want", "maybe"])
      .describe("How badly they want it, from how they said it. 'want' when unclear."),
    visibility: z
      .enum(["shared", "private"])
      .describe(
        "'shared' = the whole family sees it and it feeds planning. " +
          "'private' = only this person ever sees it — use it for a surprise or a gift, " +
          "and ask them first whenever it might be one.",
      ),
    promptText: z
      .string()
      .optional()
      .describe("What they actually said, kept so the origin of the wish stays visible."),
  }),
  async execute(wish) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    if (!wish.ownerEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "ownerEmail must be the address from the `משתמש:` clause. Without it you cannot tell " +
          "whose wish this is — ask them to sign in rather than guessing.",
      };
    }

    try {
      const body = (await convexPost("/agent/wishes/create", wish)) as {
        id: string;
        created: boolean;
        revived?: boolean;
        status?: string;
      };
      return {
        ok: true as const,
        id: body.id,
        // Idempotent on (owner, title-or-titleEn): say so plainly rather than
        // claiming a second copy was made.
        created: body.created,
        /**
         * True when this call brought a `dropped` wish back onto the board.
         *
         * Reported separately because the three outcomes need three different
         * sentences, and conflating them produced a real failure: a dropped
         * Game Boy wish was "re-added", the call found the existing row, and
         * the reply said it was back on the list while the board — which hides
         * dropped wishes — still showed nothing.
         */
        revived: Boolean(body.revived),
        status: body.status,
        note: body.created
          ? undefined
          : body.revived
            ? "כבר היה ברשימה במצב 'ירד' — הוחזר עכשיו למצב 'רעיון' ושוב מופיע בעמוד."
            : "כבר היה ברשימה ופעיל — לא נוצר כפול ולא השתנה כלום.",
        /**
         * Said here, at the moment it matters, because saying it in the
         * instructions was not enough.
         *
         * Observed for real: the model created the wish, ran `search_places`
         * and `web_search`, reported everything it found in the chat — and
         * never called `research_wish`. The answer read perfectly and the wish
         * card stayed empty: "עוד לא נחקר — אין מחיר, חנות או תמונה". Reporting
         * in chat feels like finishing, so the step that actually lands the
         * value gets skipped. A tool result is the one place the reminder
         * arrives while the turn is still running.
         */
        nextStep:
          "המשאלה נוצרה אבל היא ריקה. עכשיו תחקור, ואז **חובה** לקרוא ל-research_wish עם " +
          `id: "${body.id}" ו-finish: true. לספר להם בצ'אט מה מצאת זה לא תחליף — מה שלא ` +
          "נכתב עם research_wish לא מופיע בכרטיס ולא בעמוד היום, כלומר מבחינתם לא חקרת. " +
          "**וקריאה כמעט ריקה גרועה כמעט כמו לא לקרוא בכלל.** הרף: `note` בעברית שמסביר מה " +
          "זה ואיך מבדילים בין הדגמים; `titleEn` ו-`titleJa`; `priceYen`; **`whereToBuy` עם " +
          "כל חנות רלוונטית** — לכל אחת `shopJa`, `area`, `priceYen`, ו-`dayN` כשהיא יושבת " +
          "על יום מהמסלול; ו-`sources` לכל מחיר. חנות אחת בלי יום ובלי הסבר זה לא מחקר. " +
          "אם `search_places` לא מכיר את החנות — עדיין תרשום אותה עם האזור, ותגיד בפירוש " +
          "שהיא לא על המסלול המתוכנן.",
      };
    } catch (error) {
      return {
        ok: false as const,
        error: String(error),
        /**
         * Spelled out because the model did the opposite.
         *
         * Observed: the create failed with "… is not on the family list", and
         * the reply opened "רשמתי שאתה רוצה לקנות …" — a flat claim that the
         * wish had been saved. A failure the family is told is a success is
         * worse than the failure: they stop watching for it, and the wish is
         * simply gone.
         */
        whatToSay:
          "המשאלה **לא** נשמרה. אל תגיד 'רשמתי', 'הוספתי' או 'שמרתי' — זה פשוט לא נכון. " +
          "תגיד להם בפשטות שלא הצלחת להוסיף אותה ומה הסיבה. אם הסיבה היא שהמשתמש לא מזוהה, " +
          "תבקש שיתחברו. מה שמצאת במחקר עדיין שווה לספר — רק אל תתלה אותו על משאלה שלא קיימת.",
      };
    }
  },
});
