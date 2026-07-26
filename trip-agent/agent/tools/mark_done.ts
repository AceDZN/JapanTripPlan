// Tick a pre-trip checklist item off from the chat.
//
// Convention (shared with instructions.md and the README): a checklist item is
// DONE when its line carries a ✅. In 11-PRE-TRIP-CHECKLIST.md the items live in
// markdown tables whose first column is "Done", so the ✅ replaces the `[ ]` in
// that cell and the table keeps rendering; on a plain bullet or free line the ✅
// is prefixed to the line instead. An optional note is recorded next to the ✅.
//
// Same write path and same safety as edit_plan_doc: GitHub Contents API,
// "Trip update: <summary>" commit message, approval `always()`.
//
// Staleness: the ✅ is live in the repo immediately, but this agent's bundled
// copy of the checklist only refreshes on the next deploy (a few minutes). For
// the rest of the conversation the model must trust the item it just ticked over
// what read_guide returns.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import {
  commitDoc,
  githubConfig,
  LIVE_IN_MINUTES_NOTE,
  MISSING_TOKEN_ERROR,
  readDoc,
} from "../lib/github";

const CHECKLIST_FILE = "11-PRE-TRIP-CHECKLIST.md";
const DONE_MARK = "✅";

/** Markdown table row: capture the leading pipe, the "Done" cell, the next pipe. */
const TABLE_DONE_CELL = /^(\s*\|\s*)([^|]*?)(\s*\|)/;
/** Leading bullet / checkbox on a non-table line. */
const LIST_PREFIX = /^(\s*(?:[-*+]\s+)?)(?:\[[ xX]\]\s*)?/;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Skip table headers and `|---|---|` separators when searching for the item. */
function isTableChrome(line: string): boolean {
  return /^\s*\|[\s:|-]*\|\s*$/.test(line);
}

function markLineDone(line: string, note?: string): string {
  const suffix = note ? ` — ${note}` : "";

  const table = TABLE_DONE_CELL.exec(line);
  if (table) {
    // `| [ ] | ...` -> `| ✅ — note | ...`; the note rides in the Done cell so
    // the rest of the row (What / When / Where / Who) stays untouched.
    return (
      table[1] + DONE_MARK + suffix + table[3] + line.slice(table[0].length)
    );
  }

  const prefix = LIST_PREFIX.exec(line);
  const lead = prefix ? prefix[0] : "";
  return `${lead}${DONE_MARK} ${line.slice(lead.length)}${suffix}`;
}

export default defineTool({
  description: [
    `Mark a pre-trip checklist item as completed in ${CHECKLIST_FILE} and commit it to the repo.`,
    `The convention across the whole trip is a ${DONE_MARK} on the item's line: an item carrying ${DONE_MARK} is done,`,
    "an item without one is still open. Read and report completion state from those marks.",
    "",
    "Give `item_text` as a distinctive fragment of the item's wording, copied from the checklist",
    "(e.g. 'Buy teamLab Planets timed entry'). It must match exactly one line — if it matches several,",
    "the tool refuses and asks for a longer fragment. Matching ignores case and extra whitespace.",
    "",
    "`note` is optional and is recorded next to the mark — use it for things like who bought it,",
    "a confirmation number reference, or the date.",
    "",
    "If the item is already marked, the tool says so and commits nothing. The user must approve",
    "the call before anything is written.",
  ].join("\n"),

  inputSchema: z.object({
    item_text: z
      .string()
      .min(3)
      .describe(
        "Distinctive fragment of the checklist item's text. Must identify exactly one line.",
      ),
    note: z
      .string()
      .optional()
      .describe("Optional short note recorded next to the ✅ (who/when/reference)."),
  }),

  // Commits to the family's real checklist — always ask first.
  approval: always(),

  async execute({ item_text, note }) {
    const cfg = githubConfig();
    if (!cfg) return { ok: false as const, error: MISSING_TOKEN_ERROR };

    const read = await readDoc(cfg, CHECKLIST_FILE);
    if (!read.ok) return { ok: false as const, error: read.error };

    const lines = read.doc.content.split("\n");
    const needle = normalize(item_text);
    const hits = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => !isTableChrome(line) && normalize(line).includes(needle));

    if (hits.length === 0) {
      return {
        ok: false as const,
        error:
          `לא מצאתי פריט כזה בצ'קליסט (${CHECKLIST_FILE}), ולכן לא סימנתי כלום. ` +
          "אפשר לקרוא את הצ'קליסט עם read_guide ולנסות שוב עם ניסוח שמופיע בו.",
      };
    }
    if (hits.length > 1) {
      return {
        ok: false as const,
        error:
          `הניסוח הזה מתאים ל-${hits.length} פריטים בצ'קליסט, אז לא סימנתי כלום. ` +
          "צריך קטע טקסט ארוך וייחודי יותר.",
        matches: hits.slice(0, 8).map(({ line }) => line.trim()),
      };
    }

    const hit = hits[0]!;
    if (hit.line.includes(DONE_MARK)) {
      return {
        ok: true as const,
        alreadyDone: true as const,
        file: CHECKLIST_FILE,
        line: hit.line.trim(),
        note: "הפריט הזה כבר מסומן כבוצע, אז לא שיניתי כלום.",
      };
    }

    const updated = markLineDone(hit.line, note);
    lines[hit.index] = updated;

    const summary = `mark done — ${item_text.replace(/\s+/g, " ").trim()}`;
    const commit = await commitDoc(cfg, {
      doc: read.doc,
      content: lines.join("\n"),
      summary,
    });
    if (!commit.ok) return { ok: false as const, error: commit.error };

    return {
      ok: true as const,
      alreadyDone: false as const,
      file: CHECKLIST_FILE,
      branch: cfg.branch,
      before: hit.line.trim(),
      after: updated.trim(),
      commitUrl: commit.commitUrl,
      note: LIVE_IN_MINUTES_NOTE,
      staleness:
        "Your bundled copy of the checklist is now out of date for the rest of this conversation: " +
        "treat this item as done even if read_guide still shows it open.",
    };
  },
});
