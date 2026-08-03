// Edit the trip's structured content — a place, a day, a block, a checklist item.
//
// ## What this is for, and what edit_plan_doc is for
//
// `edit_plan_doc` edits PROSE: it replaces a substring inside a guide's
// markdown, and every call becomes a suggestion. That is the right shape for
// "rewrite this paragraph about the transport passes".
//
// It is the wrong shape for "Fushimi Inari's last entry is 16:00, not 16:30".
// Doing that through prose means find-and-replace against Hebrew text with
// markdown table pipes in it, it changes only the sentence and not the data the
// day page renders from, and it waits in a queue while the family stands
// outside a closed gate. This tool writes the field.
//
// ## Applied or proposed — the server decides, not you
//
// Every call goes to one Convex endpoint, which splits the patch:
//
//   FACT fields  — hours, closed days, last entry, address, phone, station and
//                  exit, walking time, ticket notes, prices, booking status,
//                  links, warnings, descriptions, a checklist item's deadline.
//                  These APPLY IMMEDIATELY. The world changed; we recorded it.
//
//   PLAN fields  — which days a place is on, whether it is in the trip at all,
//                  a block's time/title/order/day, a day's title or theme or
//                  where we sleep. Plus every create and every delete.
//                  These become a PENDING SUGGESTION for Alex.
//
// One call can do both, and the reply says which happened to which. Report that
// honestly: never tell somebody the plan changed when the answer says pending.
//
// You cannot choose the tier. There is no "apply anyway" argument, and asking
// for one is not a thing that works — the split is computed in Convex from the
// field names. This is the same rule `edit_plan_doc` and `convex/suggestions.ts`
// already enforce: eve authenticates with one shared family credential, so it
// cannot tell Alex from Tommy, and "Alex said it was fine" is a claim rather
// than proof.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { editContent, type ContentOp, type ContentTable } from "../lib/content";

const TABLE_HELP = [
  "  places          key = the place id from search_places / nearby_places (e.g. 'fushimi-inari-taisha')",
  "  days            key = the day number as a string ('12'). Days cannot be created or deleted.",
  "  blocks          key = the block's `id` from get_day. NEVER guess it — read the day first.",
  "  checklistItems  key = the item id from the checklist",
].join("\n");

const FACT_EXAMPLES = [
  "  places          openingHours, closedDays, lastEntry, ticketNote, phone, addressEn, addressJa,",
  "                  nearestStation, stationExit, walkMinutes, officialUrl, priceLevel, tips,",
  "                  descriptionHe, nameHe, nameEn, nameJa, area, city, category, lat, lng, image",
  "  days            note, rainPlan, heroImage, color, discovery",
  "  blocks          detail, booking, legs, costs, links, needs, warnings",
  "  checklistItems  detail, url, due",
].join("\n");

const PLAN_EXAMPLES = [
  "  places          days, planned, mustDo",
  "  days            title, theme, area, city, date, dateHe, shortDate, highlights, foodAnchorIds, stay",
  "  blocks          dayN, order, time, title, placeIds, cutFirst",
  "  checklistItems  group, order, title, critical",
].join("\n");

export default defineTool({
  description: [
    "Change the trip's structured content: a place's real-world facts, a day's note, a block's",
    "booking or costs, a checklist item's deadline — or PROPOSE a change to the plan itself.",
    "",
    "Targets and how to address them:",
    TABLE_HELP,
    "",
    "FACT fields apply immediately (the world changed and we recorded it):",
    FACT_EXAMPLES,
    "",
    "PLAN fields become a pending suggestion for Alex (we changed our minds):",
    PLAN_EXAMPLES,
    "",
    "Creating or deleting anything is ALWAYS a suggestion, in every table.",
    "",
    "The reply tells you what landed: `applied` went into the trip now, `pending` is waiting for",
    "Alex with `suggestionId`. Say exactly that to whoever asked. If something is pending, do NOT",
    "tell them it is done.",
    "",
    "Use `unset` to CLEAR a field that stopped being true (a phone number no longer published, a",
    "ticket note that no longer applies) — an empty string would record a fact that is not one.",
    "",
    "NEVER write a fact you did not verify this turn with web_search / web_fetch, or that was not",
    "told to you directly by the family. Put where it came from in `rationale`.",
    "For prose inside a guide use edit_plan_doc. For ticking something off use mark_done.",
    "For something a person wants to see or buy use create_wish — that is not a change to the plan.",
    "",
    "The user must approve this call before anything is written or proposed.",
  ].join("\n"),

  inputSchema: z.object({
    byEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    table: z
      .enum(["places", "days", "blocks", "checklistItems"])
      .describe("Which kind of thing is being changed."),
    op: z
      .enum(["patch", "create", "delete"])
      .describe("patch = change an existing row. create/delete always need Alex's approval."),
    key: z
      .string()
      .describe(
        "How to find the row: place id, day number as a string, block id from get_day, or " +
          "checklist item id. For op 'create' on blocks, pass an empty string.",
      ),
    fields: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "The fields to set, exactly as named in the trip's data. Unknown names are rejected " +
          "by the server, so use the names listed in this tool's description.",
      ),
    unset: z
      .array(z.string())
      .optional()
      .describe("Field names to clear, for a fact that stopped being true."),
    rationale: z
      .string()
      .optional()
      .describe(
        "Hebrew: where this came from — the page checked, or who said it. Shown to Alex if " +
          "any part of the change needs his approval.",
      ),
  }),

  // Writing to the family's real trip — always ask first.
  approval: always(),

  async execute({ byEmail, table, op, key, fields, unset, rationale }) {
    // Without a verified speaker there is nobody to attribute the change to,
    // and an unattributable edit to a shared plan is not reviewable. The relay
    // stamps this clause server-side; its absence means nobody is signed in.
    if (!byEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "אין לי כתובת מזוהה של מי שמבקש, אז אי אפשר לרשום את השינוי על שמו. " +
          "צריך להיות מחוברים לחשבון משפחתי כדי לשנות את התוכנית.",
      };
    }

    const hasFields = fields && Object.keys(fields).length > 0;
    if (op === "patch" && !hasFields && !unset?.length) {
      return { ok: false as const, error: "לא ציינת מה לשנות — אין שדות בבקשה." };
    }
    if (op === "create" && !hasFields) {
      return { ok: false as const, error: "כדי ליצור רשומה חדשה צריך למלא את השדות שלה." };
    }

    const outcome = await editContent({
      byEmail,
      table: table as ContentTable,
      op: op as ContentOp,
      key,
      fields,
      unset,
      rationale,
    });

    if (!outcome.ok) return { ok: false as const, error: translate(outcome.error) };

    const { applied, pending, suggestionId } = outcome.result;

    return {
      ok: true as const,
      table,
      op,
      key,
      applied,
      pending,
      suggestionId,
      // Spelled out rather than left for the model to infer, because the one
      // failure that matters here is telling a person their change is live when
      // it is sitting in a queue.
      note:
        pending.length === 0
          ? "השינוי נשמר ונכנס לתוקף מיד."
          : applied.length === 0
            ? "השינוי לא בוצע — הוא נרשם כהצעה וממתין לאישור של אלכס. אל תגידו שהתוכנית עודכנה."
            : `העדכון העובדתי (${applied.join(", ")}) נשמר מיד. השאר (${pending.join(", ")}) ` +
              "נרשם כהצעה וממתין לאישור של אלכס — זה עוד לא בתוקף.",
    };
  },
});

/**
 * Turn the server's English validation errors into something the family can act
 * on. These are exactly the cases the model can fix by itself on the next turn.
 */
function translate(error: string): string {
  if (error.includes("is not a block id")) {
    return (
      "המזהה הזה הוא לא מזהה של בלוק. צריך לקרוא קודם את היום עם get_day ולהעתיק את השדה `id` " +
      "של הבלוק המדויק — לא את הכותרת שלו."
    );
  }
  if (error.includes("No place with id")) {
    return "אין מקום עם המזהה הזה. כדאי לחפש אותו קודם עם search_places ולהשתמש במזהה שחוזר משם.";
  }
  if (error.includes("not on the family list")) {
    return "הכתובת הזאת לא ברשימת המשפחה, אז אי אפשר לרשום את השינוי בשמה.";
  }
  if (error.includes("extra field")) {
    const name = /extra field `([^`]+)`/.exec(error)?.[1];
    return (
      `אין שדה בשם ${name ?? "הזה"} בנתונים של הטיול, ולכן לא שיניתי כלום. ` +
      "צריך להשתמש בשמות השדות שמופיעים בתיאור של הכלי."
    );
  }
  if (error.includes("Days cannot be created or deleted")) {
    return "אי אפשר להוסיף או למחוק ימים — הטיול הוא 17 ימים. אפשר רק לעדכן יום קיים.";
  }
  return error;
}
