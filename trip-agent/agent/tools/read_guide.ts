import { defineTool } from "eve/tools";
import { z } from "zod";
import { guides } from "../data/content";

const files = guides.map((g) => g.file) as [string, ...string[]];

const catalog = guides.map((g) => `- ${g.file}: ${g.title}`).join("\n");

export default defineTool({
  description: [
    "Read one of the canonical Japan 2026 trip guides in full (markdown).",
    "These documents are the source of truth for the plan — prefer them over memory.",
    "Available guides:",
    catalog,
  ].join("\n"),
  inputSchema: z.object({
    file: z.enum(files).describe("Guide file name, e.g. 05-FOOD-GUIDE.md"),
  }),
  execute({ file }) {
    const guide = guides.find((g) => g.file === file);
    if (!guide) {
      return { ok: false as const, error: `Unknown guide: ${file}`, available: files };
    }
    return {
      ok: true as const,
      file: guide.file,
      title: guide.title,
      markdown: guide.markdown,
    };
  },
});
