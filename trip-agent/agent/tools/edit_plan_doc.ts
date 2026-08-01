// Propose a change to a canonical trip document.
//
// ## What changed, and why
//
// This tool used to edit the markdown in GitHub and commit it. That made sense
// when `JAPAN2026/*.md` was the source of truth. It is not any more: Convex is,
// and those files are its git-tracked export. Committing to them would now be
// writing to a build artefact — the next export would overwrite it.
//
// So the tool writes to Convex instead. Three things fall out of that, all good:
//
//   * the change is live immediately, so the old "live in a few minutes" note
//     and the staleness warning that went with it are both gone;
//   * `read_guide` reads the same store, so a document read after an edit shows
//     the edit;
//   * the write lands as a PENDING SUGGESTION rather than an applied change.
//
// ## Why it only ever proposes
//
// The plan is shared. Changing it is not the same kind of act as adding your own
// wish, and "Tommy asked the assistant to rewrite day 5" must not rewrite day 5.
// So every call files a suggestion for the trip owner to decide on, whoever is
// speaking — including Alex.
//
// Approving from this agent is deliberately impossible. eve authenticates to the
// app with one shared family credential, so `session.auth.initiator` is "the
// family", not the individual: this process genuinely cannot tell Alex from
// Tommy, and a `משתמש:` clause in the prompt is a claim, not proof. Approval
// therefore happens in the app, where Clerk proves who is signed in and
// `convex/suggestions.ts:approve` checks `role === "owner"` server-side. See the
// header of that file for the full argument.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { guides } from "../data/content";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

const files = guides.map((g) => g.file) as [string, ...string[]];
const catalog = guides.map((g) => `- ${g.file}: ${g.title}`).join("\n");

/** `09-DAILY-ITINERARY.md` -> `daily-itinerary`, matching `guides.slug`. */
function slugFor(file: string): string {
  return file
    .replace(/^\d+-/, "")
    .replace(/\.md$/, "")
    .toLowerCase();
}

/**
 * Turn a server-side validation failure into something the family can act on.
 *
 * The Convex mutation raises precise English errors (not found / appears N
 * times). Those are exactly the cases the model can fix by itself, so they are
 * worth translating rather than surfacing as a raw stack.
 */
function translateServerError(error: string, file: string): string {
  if (error.includes("was not found")) {
    return (
      `לא מצאתי את הטקסט הזה ב-${file}, ולכן לא רשמתי כלום. ` +
      "צריך להעתיק את הנוסח המדויק מהמסמך (אפשר לקרוא אותו קודם עם read_guide או get_day) — " +
      "כולל ניקוד, מקפים וסימני טבלה."
    );
  }
  if (error.includes("appears")) {
    return (
      `הטקסט הזה מופיע יותר מפעם אחת ב-${file}, אז לא ברור מה לשנות ולא רשמתי כלום. ` +
      "צריך להוסיף עוד הקשר סביב הטקסט (שורה שלמה, או שורה והשורה שלפניה) כדי שיהיה ייחודי."
    );
  }
  if (error.includes("not on the family list")) {
    return "הכתובת הזאת לא ברשימת המשפחה, אז אי אפשר לרשום הצעה בשמה.";
  }
  return error;
}

export default defineTool({
  description: [
    "Propose a change to one of the canonical Japan 2026 trip documents.",
    "",
    "This does NOT change the plan straight away. It files a suggestion for Alex, the trip owner,",
    "who approves or rejects it in the app. Say that plainly to whoever asked — never tell them the",
    "plan has been updated. If Alex himself is asking, it still goes to his queue; tell him it is",
    "waiting for him to approve there.",
    "",
    "The edit is an exact substring replacement: `old_string` must appear EXACTLY ONCE in the file.",
    "Include enough surrounding text (a whole line, or a line plus its neighbour) to be unique.",
    "Keep edits small and targeted — never rewrite a whole document, never reformat unrelated text.",
    "If unsure of the exact current wording, read the file first with read_guide (or get_day for a",
    "specific day) and copy the text verbatim, including Hebrew punctuation and markdown table pipes.",
    "",
    "Route changes for a specific trip day into 09-DAILY-ITINERARY.md — that file is the canonical route.",
    "For completing a checklist item prefer the mark_done tool.",
    "For something a person wants to see or buy, prefer create_wish — that is not a change to the plan.",
    "",
    "The user must approve this call before the suggestion is filed. `summary` is what Alex will read",
    "in his queue, so write it as a short, plain description of the change.",
    "",
    "Editable documents:",
    catalog,
  ].join("\n"),

  inputSchema: z.object({
    proposedByEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    file: z.enum(files).describe("Canonical document to edit, e.g. 09-DAILY-ITINERARY.md"),
    old_string: z
      .string()
      .min(1)
      .describe(
        "Exact text to replace, copied verbatim from the document. Must occur exactly once.",
      ),
    new_string: z
      .string()
      .describe("Replacement text. Empty string deletes the matched text."),
    summary: z
      .string()
      .min(3)
      .describe("Short plain description of the change, shown to the owner in his review queue."),
    rationale: z
      .string()
      .optional()
      .describe("Hebrew: why the person wants this. Helps the owner decide without asking back."),
  }),

  // Filing a suggestion against the family's real plan — always ask first.
  approval: always(),

  async execute({ proposedByEmail, file, old_string, new_string, summary, rationale }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    if (old_string === new_string) {
      return { ok: false as const, error: "הטקסט הישן והחדש זהים — אין מה לשנות." };
    }

    // Without a verified speaker there is nobody to attribute the suggestion to,
    // and an unattributable proposal is not reviewable. The relay stamps this
    // clause server-side; its absence means the person is not signed in.
    if (!proposedByEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "אין לי כתובת מזוהה של מי שמבקש, אז אי אפשר לרשום את ההצעה על שמו. " +
          "צריך להיות מחוברים לחשבון משפחתי כדי להציע שינוי בתוכנית.",
      };
    }

    try {
      const body = (await convexPost("/agent/suggestions/propose", {
        proposedByEmail,
        targetKind: "guide",
        guideSlug: slugFor(file),
        title: summary,
        rationale,
        oldString: old_string,
        newString: new_string,
      })) as { id?: string; proposedBy?: string; ok?: boolean; error?: string };

      if (body?.ok === false) {
        // The server does the authoritative uniqueness check against the live
        // document, so its verdict wins over anything checked here.
        return { ok: false as const, error: translateServerError(String(body.error ?? ""), file) };
      }

      return {
        ok: true as const,
        file,
        suggestionId: body?.id,
        proposedBy: body?.proposedBy,
        summary,
        replaced: old_string,
        with: new_string,
        status: "pending" as const,
        note:
          "ההצעה נרשמה וממתינה לאישור של אלכס. התוכנית עצמה עדיין לא השתנתה — " +
          "אל תגידו למי שביקש שהשינוי בוצע.",
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
