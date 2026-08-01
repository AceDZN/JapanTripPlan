// Add a wish to the family list ON BEHALF OF the person you are talking to.
//
// "תוסיפי לי לרשימה פיגורת פיקאצ׳ו" should end up as TOMMY's wish, not as an
// anonymous one — that is what makes the list worth having, because every item
// carries who actually wants it.
//
// `ownerEmail` is not yours to choose. It comes from the `משתמש:` clause the
// app stamps onto every turn server-side (see web/lib/agent-context.ts); a
// browser cannot forge it, and Convex rejects any address that is not on the
// family allowlist. If that clause is absent, you do not know who is speaking
// and you must not create anything — say so and ask them to sign in.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

export default defineTool({
  description: [
    "Add a wish to the family list on behalf of the person in this conversation.",
    "Use it when someone says they want something — a product, a place, a food, an experience.",
    "You MUST pass their e-mail from the `משתמש:` clause of the context line; never guess it,",
    "and never use somebody else's. If there is no such clause you do not know who is asking:",
    "do not call this tool, tell them to sign in instead.",
    "Ask about visibility whenever the request could be a surprise for another family member —",
    "a wish created as 'shared' cannot be un-seen by the person it was meant to surprise.",
  ].join(" "),
  inputSchema: z.object({
    ownerEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    kind: z
      .enum(["attraction", "place", "product", "food", "experience", "other"])
      .describe("What sort of thing this is."),
    title: z.string().describe("Hebrew, short, as the person would say it."),
    titleEn: z.string().optional().describe("English name — needed to ask for it in a shop."),
    titleJa: z.string().optional().describe("Japanese name — needed to show it to staff."),
    note: z.string().optional().describe("Hebrew: anything they said that narrows it down."),
    url: z.string().optional(),
    area: z.string().optional(),
    placeId: z.string().optional().describe("Slug of a trip place, when it maps onto one."),
    dayN: z.number().int().min(1).max(17).optional().describe("Pin to a day when there is an obvious one."),
    priceYen: z.number().int().optional().describe("Only if they named a budget or you verified a price."),
    priority: z
      .enum(["must", "want", "maybe"])
      .describe("How badly they want it, from how they said it. 'want' when unclear."),
    visibility: z
      .enum(["shared", "private"])
      .describe(
        "'shared' = the whole family sees it and it feeds planning. " +
          "'private' = only this person ever sees it — use it for a surprise or a gift, " +
          "and ask them first whenever it might be one.",
      ),
    promptText: z
      .string()
      .optional()
      .describe("What they actually said, kept so the origin of the wish stays visible."),
  }),
  async execute(wish) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    if (!wish.ownerEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "ownerEmail must be the address from the `משתמש:` clause. Without it you cannot tell " +
          "whose wish this is — ask them to sign in rather than guessing.",
      };
    }

    try {
      const body = (await convexPost("/agent/wishes/create", wish)) as {
        id: string;
        created: boolean;
      };
      return {
        ok: true as const,
        id: body.id,
        // Idempotent on (owner, title): say so plainly rather than claiming a
        // second copy was made.
        created: body.created,
        note: body.created ? undefined : "כבר היה ברשימה — לא נוצר כפול.",
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
