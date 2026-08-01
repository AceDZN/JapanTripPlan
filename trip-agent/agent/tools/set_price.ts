// Correct a PLANNED price — what something is expected to cost.
//
// ## Planned is not spent
//
// `record_spend` is for money that moved. This is for the other kind of number:
// the ¥3,500 written next to a ticket that turns out to cost ¥3,800, the food
// envelope that everyone agrees is too low, the estimate on a wish. Nothing
// here says anybody paid anything.
//
// ## Why a price edit lands directly instead of queuing for approval
//
// `edit_plan_doc` proposes and waits, because changing what the family DOES is
// the owner's call. Correcting what something COSTS is not a change of plan —
// it is the world being reported accurately, and making Alex rubber-stamp
// "actually the ticket went up ¥300" would mean the app carries a price
// everybody already knows is wrong until he gets round to it.
//
// The line is: this tool may change an amount inside a block that already
// exists, an envelope, or a wish estimate. It cannot add a stop, move a block,
// or rewrite a guide. Those are still suggestions.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

export default defineTool({
  description: [
    "Correct a PLANNED price — what something is expected to cost. Three targets:",
    "",
    "  target 'day'      — one cost line inside one block of one day. Needs `dayN`, the",
    "                      block's EXACT title (read the day with get_day and copy it —",
    "                      do not invent or paraphrase it), a `label` for the line, and",
    "                      `yen` with `basis` ('person' = per person, 'family'/'total' =",
    "                      already for all four).",
    "  target 'envelope' — a budget envelope from the budget guide. Needs `slug`,",
    "                      `category`, `label`, and `minYen`/`maxYen` as a range.",
    "  target 'wish'     — the estimated price on somebody's wish. Needs `wishId`, `yen`.",
    "",
    "This is for estimates and quoted prices only. Money that was actually paid is",
    "record_spend — do not use this to log a purchase, and do not use record_spend to",
    "fix an estimate.",
    "",
    "Never set a price you did not verify this turn with web_search / web_fetch, or that",
    "was not stated to you directly. Say where the number came from in `note`.",
    "The user must approve the call before anything changes.",
  ].join("\n"),

  inputSchema: z.object({
    target: z.enum(["day", "envelope", "wish"]),

    // target: "day"
    dayN: z.number().int().min(1).max(17).optional().describe("Day number, for target 'day'."),
    blockTitle: z
      .string()
      .optional()
      .describe("The block's title EXACTLY as get_day returned it. For target 'day'."),
    label: z
      .string()
      .optional()
      .describe(
        "For target 'day': the cost line's name — an existing label replaces that line, " +
          "a new one adds it. For target 'envelope': the envelope's Hebrew name.",
      ),
    basis: z
      .enum(["person", "family", "total"])
      .optional()
      .describe(
        "For target 'day'. 'person' is multiplied by four when the day total is shown, " +
          "so getting this wrong quadruples or quarters the number.",
      ),
    removeLine: z
      .boolean()
      .optional()
      .describe("For target 'day': delete the cost line instead of setting it."),

    // target: "envelope"
    slug: z
      .string()
      .optional()
      .describe("Envelope key, e.g. 'food' or 'local-transport'. Reuse an existing one to edit it."),
    category: z
      .enum([
        "flights",
        "stay",
        "transport",
        "food",
        "attractions",
        "shopping",
        "arcade",
        "gifts",
        "essentials",
        "other",
      ])
      .optional()
      .describe("For target 'envelope': which spend category it covers."),
    minYen: z.number().int().optional().describe("Bottom of the envelope range."),
    maxYen: z.number().int().optional().describe("Top of the envelope range."),

    // target: "wish"
    wishId: z.string().optional().describe("Wish id from list_wishes, for target 'wish'."),

    yen: z
      .number()
      .int()
      .optional()
      .describe("The amount, in yen. Required for targets 'day' and 'wish'."),
    note: z
      .string()
      .optional()
      .describe("Hebrew: where this figure came from. A price with no provenance is a rumour."),
  }),

  approval: always(),

  async execute(input) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    try {
      if (input.target === "day") {
        if (input.dayN === undefined || !input.blockTitle || !input.label) {
          return {
            ok: false as const,
            error: "target 'day' needs dayN, blockTitle and label.",
          };
        }
        if (!input.removeLine && (input.yen === undefined || !input.basis)) {
          return {
            ok: false as const,
            error:
              "target 'day' needs yen and basis. basis: 'person' for a per-person fare, " +
              "'family' or 'total' when the figure already covers all four.",
          };
        }

        const body = (await convexPost("/agent/money/block-cost", {
          dayN: input.dayN,
          blockTitle: input.blockTitle,
          label: input.label,
          yen: input.yen ?? 0,
          basis: input.basis ?? "family",
          note: input.note,
          remove: input.removeLine,
        })) as { action?: string; blockTitle?: string; reason?: string };

        if (body.reason === "no-such-line") {
          return {
            ok: false as const,
            error: `אין שורת עלות בשם "${input.label}" בבלוק הזה, אז לא נמחק כלום.`,
          };
        }

        return {
          ok: true as const,
          target: "day" as const,
          action: body.action,
          note: `שורת העלות "${input.label}" ב"${body.blockTitle}" ביום ${input.dayN} עודכנה, והיא כבר מופיעה בעמוד היום.`,
          whatToSay:
            "תגיד להם מה השתנה בדיוק: איזו שורה, באיזה בלוק, מה הסכום החדש ולפי איזה " +
            "בסיס. תדגיש שזה מחיר מתוכנן, לא תשלום שבוצע.",
        };
      }

      if (input.target === "envelope") {
        if (!input.slug || !input.category || !input.label) {
          return {
            ok: false as const,
            error: "target 'envelope' needs slug, category and label.",
          };
        }

        const body = (await convexPost("/agent/money/budget", {
          slug: input.slug,
          category: input.category,
          label: input.label,
          minYen: input.minYen,
          maxYen: input.maxYen,
          note: input.note,
          updatedBy: "eve",
        })) as { created: boolean };

        return {
          ok: true as const,
          target: "envelope" as const,
          created: body.created,
          note: body.created ? "מעטפה חדשה נוצרה." : "המעטפה הקיימת עודכנה.",
          whatToSay:
            "תגיד שזה טווח תכנון ולא הוצאה. אם קבעת תקרה לקטגוריה שלא הייתה לה — " +
            "שווה להגיד את זה במפורש, כי עד עכשיו הקטגוריה הזאת הייתה בלי גבול.",
        };
      }

      // target === "wish": the estimate on somebody's list. Reuses the research
      // route, which is the only path allowed to touch a wish and is already
      // barred from changing its owner or its visibility.
      if (!input.wishId || input.yen === undefined) {
        return { ok: false as const, error: "target 'wish' needs wishId and yen." };
      }

      await convexPost("/agent/wishes/research", {
        id: input.wishId,
        priceYen: input.yen,
        ...(input.note ? { note: input.note } : {}),
      });

      return {
        ok: true as const,
        target: "wish" as const,
        note: "המחיר המשוער על המשאלה עודכן.",
        whatToSay:
          "תגיד שזה המחיר המשוער על הכרטיס, לא סכום ששולם. אם הם בעצם קנו את זה — " +
          "זה record_spend עם ה-wishId, וזה גם מה שסוגר את המשאלה.",
      };
    } catch (error) {
      return {
        ok: false as const,
        error: String(error),
        whatToSay:
          "המחיר **לא** עודכן. אם ההודעה אומרת שאין בלוק בשם הזה — תקרא ל-get_day, " +
          "תעתיק את הכותרת המדויקת ותנסה שוב. אל תמציא כותרת ואל תגיד שעדכנת.",
      };
    }
  },
});
