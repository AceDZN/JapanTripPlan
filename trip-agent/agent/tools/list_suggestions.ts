// What the family has proposed and Alex has not decided on yet.
//
// This is the read half of the suggestion loop: `edit_plan_doc` files them,
// this reads the queue back. There is deliberately no approve/reject tool —
// eve authenticates with one shared family credential and so cannot prove which
// person is speaking, and approving a change to the shared plan is exactly the
// act that needs proof. Deciding happens in the app at /suggestions, where
// Clerk establishes identity and Convex checks `role === "owner"`.
//
// So the right shape of an answer here is "there are three waiting, here they
// are, approve them in the app" — never "shall I approve it for you?".

import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexGet } from "../lib/convex";

type Suggestion = {
  id: string;
  targetKind: "guide" | "day";
  guideSlug?: string;
  dayN?: number;
  title: string;
  rationale?: string;
  proposedByName: string;
  proposedByEmail: string;
  needsManualApply: boolean;
  createdAt: number;
};

export default defineTool({
  description: [
    "List the changes to the trip plan that are waiting for Alex to approve.",
    "Use it when anyone asks what has been suggested, what is waiting, or whether their idea went through.",
    "Also use it before proposing a change, to avoid filing a duplicate of something already pending.",
    "",
    "You cannot approve or reject from here — only Alex can, in the app. If he asks you to approve one,",
    "tell him it is waiting at /suggestions in the trip app and that only a signed-in owner can decide.",
  ].join("\n"),
  inputSchema: z.object({
    proposedByName: z
      .string()
      .optional()
      .describe("Only suggestions from this person, e.g. to answer 'did mine go through?'."),
  }),
  async execute({ proposedByName }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    try {
      const body = (await convexGet("/agent/suggestions/pending")) as {
        suggestions?: Suggestion[];
      };

      let suggestions = body.suggestions ?? [];
      if (proposedByName) {
        const wanted = proposedByName.trim().toLowerCase();
        suggestions = suggestions.filter((s) => s.proposedByName.toLowerCase() === wanted);
      }

      return {
        ok: true as const,
        count: suggestions.length,
        suggestions: suggestions.map((s) => ({
          id: s.id,
          what: s.title,
          why: s.rationale,
          target: s.targetKind === "guide" ? s.guideSlug : `יום ${s.dayN}`,
          proposedBy: s.proposedByName,
          // Worth surfacing: a day suggestion cannot be applied by approving it,
          // so Alex has to make the change himself afterwards.
          needsManualApply: s.needsManualApply,
        })),
        decideAt: "/suggestions",
        note:
          suggestions.length === 0
            ? "אין הצעות שממתינות להחלטה."
            : "רק אלכס יכול לאשר או לדחות, ורק דרך האפליקציה.",
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
