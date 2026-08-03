// Read the family's wish list, live from Convex.
//
// PRIVACY: this returns private wishes too — the agent needs them in order to
// research a surprise. Never repeat, summarise or hint at a private wish to
// anyone except the person whose wish it is. See instructions.md.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexGet } from "../lib/convex";

export default defineTool({
  description: [
    "List what the family wants from this trip: attractions, places, food and specific products.",
    "Live from the database, so it reflects what people added minutes ago.",
    "Use it before researching anything, to see whether the wish already exists and what is already known about it.",
    "Filter by status 'researching' to find the wishes that are waiting for you.",
  ].join(" "),
  inputSchema: z.object({
    status: z
      .enum(["idea", "researching", "approved", "done", "dropped"])
      .optional()
      .describe("Only wishes in this state. 'researching' = queued for you."),
    ownerName: z.string().optional().describe("Only wishes added by this person."),
    dayN: z.number().int().min(1).max(17).optional().describe("Only wishes pinned to this trip day."),
  }),
  async execute({ status, ownerName, dayN }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    try {
      const body = (await convexGet("/agent/wishes/list")) as {
        wishes: Array<Record<string, unknown>>;
      };

      const wishes = body.wishes.filter((wish) => {
        if (status && wish.status !== status) return false;
        if (ownerName && wish.ownerName !== ownerName) return false;
        if (dayN !== undefined && wish.dayN !== dayN) return false;
        return true;
      });

      return { ok: true as const, count: wishes.length, wishes };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
