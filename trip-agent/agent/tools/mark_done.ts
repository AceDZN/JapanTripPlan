// Tick a pre-trip checklist item off from the chat.
//
// ## What changed, and why
//
// This used to rewrite `11-PRE-TRIP-CHECKLIST.md` in GitHub — replacing `[ ]`
// with ✅ — and commit it. That was the real state of the checklist while the
// markdown was the source of truth.
//
// It is not any more. Those files are Convex's export now, so a commit into
// them is written to a build artefact and disappears at the next
// `npm run export:md`. A tick recorded that way would silently vanish, which is
// the worst possible failure for a checklist: it would read "not done" for
// something the family had already bought.
//
// Progress therefore lives in the `checklistState` table, which is also what
// the /prepare page renders — so ticking here and ticking in the app are now
// the same act, visible to everyone, instead of two different records.
//
// ## Why this is not gated like edit_plan_doc
//
// Ticking "we bought the teamLab tickets" reports a fact about the world. It
// does not change what the family plans to do, so it does not go through the
// owner's approval queue the way a change to a guide or a day does. It still
// asks the user in chat first, because a wrong tick is annoying to find.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

export default defineTool({
  description: [
    "Mark a pre-trip checklist item as done, or reopen one that was ticked by mistake.",
    "The tick is shared: everyone in the family sees it, in the app and here.",
    "",
    "Give `item_text` as a distinctive fragment of the item's wording, copied from the checklist",
    "(e.g. 'לקנות נעלי הליכה חדשות'). It must identify exactly one item — if it matches several,",
    "the tool refuses and asks for a longer fragment.",
    "",
    "Use this when someone reports that something is done ('קנינו את הכרטיסים ל-teamLab').",
    "Do NOT use edit_plan_doc to tick items off — that proposes a change to the plan, which is",
    "a different thing and needs Alex's approval.",
    "",
    "The user must approve the call before anything is recorded.",
  ].join("\n"),

  inputSchema: z.object({
    actorEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    item_text: z
      .string()
      .min(3)
      .describe("Distinctive fragment of the checklist item's text. Must identify exactly one item."),
    done: z
      .boolean()
      .optional()
      .describe("Defaults to true. Pass false to reopen an item ticked by mistake."),
  }),

  // Writes to the family's shared checklist — always ask first.
  approval: always(),

  async execute({ actorEmail, item_text, done }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    // Without a verified speaker there is nobody to record as having done it,
    // and "someone ticked this" is not much better than no record at all.
    if (!actorEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "אין לי כתובת מזוהה של מי שמדווח, אז אי אפשר לרשום מי סימן. " +
          "צריך להיות מחוברים לחשבון משפחתי.",
      };
    }

    try {
      const body = (await convexPost("/agent/checklist/done", {
        actorEmail,
        itemText: item_text,
        done: done ?? true,
      })) as { ok?: boolean; error?: string; itemSlug?: string; changed?: boolean };

      if (body?.ok === false) {
        const error = String(body.error ?? "");
        if (error.includes("No checklist item matches")) {
          return {
            ok: false as const,
            error:
              `לא מצאתי פריט בצ׳קליסט שמתאים ל"${item_text}", ולכן לא סימנתי כלום. ` +
              "צריך לצטט קטע מדויק מהניסוח של הפריט.",
          };
        }
        if (error.includes("matches")) {
          return {
            ok: false as const,
            error:
              `"${item_text}" מתאים ליותר מפריט אחד, אז לא ברור מה לסמן ולא נגעתי בכלום. ` +
              "צריך לצטט קטע ארוך יותר.",
          };
        }
        return { ok: false as const, error };
      }

      const marked = done ?? true;
      return {
        ok: true as const,
        itemSlug: body?.itemSlug,
        done: marked,
        // `changed: false` means it was already in this state. Worth passing on
        // so the model says "כבר היה מסומן" instead of implying it did something.
        alreadyInThatState: body?.changed === false,
        note: marked
          ? "הפריט סומן כבוצע ומופיע ככה לכל המשפחה."
          : "הפריט נפתח מחדש ומופיע ככה לכל המשפחה.",
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
