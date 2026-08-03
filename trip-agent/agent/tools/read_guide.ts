// Read a canonical trip guide — LIVE from Convex, not from the baked bundle.
//
// Why this changed: `../data/content` is regenerated at deploy time, so it went
// stale the moment anyone edited the plan. `edit_plan_doc.ts` used to carry a
// note telling the model to trust its own just-committed change over whatever
// this tool returned, because the two disagreed for minutes after every edit.
// Convex is the source of truth now, so reading it directly deletes that whole
// class of confusion: an edit made thirty seconds ago is in the next read.
//
// The baked bundle stays as a fallback for when Convex is unreachable or
// unconfigured (a local run without the key). It is labelled in the result as
// possibly-stale so the model says so rather than quietly presenting old text
// as current.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { guides } from "../data/content";
import { convexConfigured, convexGet } from "../lib/convex";

const files = guides.map((g) => g.file) as [string, ...string[]];

const catalog = guides.map((g) => `- ${g.file}: ${g.title}`).join("\n");

/** `09-DAILY-ITINERARY.md` -> `daily-itinerary`, matching `guides.slug`. */
function slugFor(file: string): string {
  return file
    .replace(/^\d+-/, "")
    .replace(/\.md$/, "")
    .toLowerCase();
}

export default defineTool({
  description: [
    "Read one of the canonical Japan 2026 trip guides in full (markdown).",
    "These documents are the source of truth for the plan — prefer them over memory.",
    "Reads live from the database, so it reflects edits made moments ago.",
    "Available guides:",
    catalog,
  ].join("\n"),
  inputSchema: z.object({
    file: z.enum(files).describe("Guide file name, e.g. 05-FOOD-GUIDE.md"),
  }),
  async execute({ file }) {
    const baked = guides.find((g) => g.file === file);
    if (!baked) {
      return { ok: false as const, error: `Unknown guide: ${file}`, available: files };
    }

    if (convexConfigured()) {
      try {
        const body = (await convexGet(
          `/agent/guide?slug=${encodeURIComponent(slugFor(file))}`,
        )) as { guide?: { title?: string; body?: string } };

        if (body?.guide?.body) {
          return {
            ok: true as const,
            file: baked.file,
            title: body.guide.title ?? baked.title,
            markdown: body.guide.body,
            source: "convex" as const,
          };
        }
      } catch {
        // Fall through to the bundle rather than failing the turn. A guide the
        // model can read is worth more than a clean error — as long as it is
        // honest about which copy it got, which the `source` field below does.
      }
    }

    return {
      ok: true as const,
      file: baked.file,
      title: baked.title,
      markdown: baked.markdown,
      source: "bundled-fallback" as const,
      warning:
        "Read from the deploy-time bundle because the live database was unavailable. " +
        "This may be out of date — say so before relying on it for a decision.",
    };
  },
});
