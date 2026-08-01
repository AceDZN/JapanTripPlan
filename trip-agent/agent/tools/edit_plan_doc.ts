// Edit a canonical trip document from inside the chat.
//
// The whole trip lives in JAPAN2026/*.md, so an edit here is an edit everywhere:
// the webapp regenerates its guide pages and AI context from these files on its
// next build, and this agent regenerates agent/data/content.ts from them on its
// next deploy. Both deploys are triggered automatically by the commit this tool
// makes.
//
// Staleness window worth knowing while reading the model's behaviour: for the
// rest of the conversation that made an edit, `read_guide` / `get_day` still
// return the pre-edit bundle. instructions.md tells the model to trust its own
// just-committed change over those tools until the redeploy lands.
//
// Safety: gated with approval `always()`. Nothing is fetched, replaced or
// committed until the user confirms in chat.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { guides } from "../data/content";
import {
  commitDoc,
  countOccurrences,
  githubConfig,
  LIVE_IN_MINUTES_NOTE,
  MISSING_TOKEN_ERROR,
  readDoc,
} from "../lib/github";

const files = guides.map((g) => g.file) as [string, ...string[]];
const catalog = guides.map((g) => `- ${g.file}: ${g.title}`).join("\n");

export default defineTool({
  description: [
    "Edit one of the canonical Japan 2026 trip documents and commit the change to the repo.",
    "",
    "NOT for wish lists. If somebody says they WANT something — a product, a place, a food, an",
    "experience — that is a wish and belongs in `create_wish`, never in a document. Writing a wish",
    "into a guide puts it somewhere the family's wish pages cannot see, and it is the wrong answer",
    "even though it looks like 'adding it to the plan'.",
    "This is how the plan actually changes: the documents are the single source of truth, and the",
    "trip website and this agent both rebuild from them automatically after the commit.",
    "",
    "The edit is an exact substring replacement: `old_string` must appear EXACTLY ONCE in the file.",
    "Include enough surrounding text (a whole line, or a line plus its neighbour) to be unique.",
    "Keep edits small and targeted — never rewrite a whole document, never reformat unrelated text.",
    "If unsure of the exact current wording, read the file first with read_guide (or get_day for a",
    "specific day) and copy the text verbatim, including Hebrew punctuation and markdown table pipes.",
    "",
    "Route changes for a specific trip day into 09-DAILY-ITINERARY.md — that file is the canonical route.",
    "For completing a checklist item prefer the mark_done tool.",
    "",
    "The user must approve this call before anything is written. `summary` becomes the commit message",
    "('Trip update: <summary>') and is shown to the user, so write it as a short, plain description",
    "of the change.",
    "",
    "Editable documents:",
    catalog,
  ].join("\n"),

  inputSchema: z.object({
    file: z
      .enum(files)
      .describe("Canonical document to edit, e.g. 09-DAILY-ITINERARY.md"),
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
      .describe(
        "Short plain description of the change, used as the commit message and shown to the user.",
      ),
  }),

  // Every call commits to the family's real trip documents — always ask first.
  approval: always(),

  async execute({ file, old_string, new_string, summary }) {
    const cfg = githubConfig();
    if (!cfg) return { ok: false as const, error: MISSING_TOKEN_ERROR };

    if (old_string === new_string) {
      return {
        ok: false as const,
        error: "הטקסט הישן והחדש זהים — אין מה לשנות.",
      };
    }

    const read = await readDoc(cfg, file);
    if (!read.ok) return { ok: false as const, error: read.error };

    const occurrences = countOccurrences(read.doc.content, old_string);
    if (occurrences === 0) {
      return {
        ok: false as const,
        error:
          `לא מצאתי את הטקסט הזה ב-${file}, ולכן לא שיניתי כלום. ` +
          "צריך להעתיק את הנוסח המדויק מהמסמך (אפשר לקרוא אותו קודם עם read_guide או get_day) — כולל ניקוד, מקפים וסימני טבלה.",
        occurrences: 0,
      };
    }
    if (occurrences > 1) {
      return {
        ok: false as const,
        error:
          `הטקסט הזה מופיע ${occurrences} פעמים ב-${file}, אז לא ברור מה לשנות ולא נגעתי בכלום. ` +
          "צריך להוסיף עוד הקשר סביב הטקסט (שורה שלמה, או שורה והשורה שלפניה) כדי שיהיה ייחודי.",
        occurrences,
      };
    }

    const content = read.doc.content.replace(old_string, new_string);

    const commit = await commitDoc(cfg, { doc: read.doc, content, summary });
    if (!commit.ok) return { ok: false as const, error: commit.error };

    return {
      ok: true as const,
      file,
      branch: cfg.branch,
      summary,
      commitUrl: commit.commitUrl,
      replaced: old_string,
      with: new_string,
      note: LIVE_IN_MINUTES_NOTE,
      staleness:
        "Your bundled copy of this document is now out of date for the rest of this conversation: " +
        "trust this edit over read_guide / get_day output until the next deploy.",
    };
  },
});
