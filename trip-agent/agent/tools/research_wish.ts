// Write a research result back onto a wish.
//
// This is the half of the wish list that makes it worth having: somebody types
// "פיגורת פיקאצ׳ו", and this turns it into "¥3,800 at Pokémon Center Shibuya,
// which you walk past on day 6", with a picture and the pages that say so.
//
// What it CANNOT do, by construction on the server side: change who owns a
// wish, change whether it is private, or decide that the family has approved
// it. Those are people's decisions, not the agent's.

import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  CONVEX_UNCONFIGURED,
  convexConfigured,
  convexPost,
  storeImageFromUrl,
} from "../lib/convex";

const shop = z.object({
  shop: z.string().describe("Shop or venue name, as a person would say it."),
  shopJa: z.string().optional().describe("The name in Japanese, for showing staff or a map."),
  area: z.string().optional().describe("Neighbourhood, in Hebrew — e.g. 'שיבויה'."),
  placeId: z
    .string()
    .optional()
    .describe("Slug of an existing trip place, if this shop IS one of our stops."),
  dayN: z
    .number()
    .int()
    .min(1)
    .max(17)
    .optional()
    .describe(
      "Trip day this shop sits on. Set it ONLY when the route already passes here — " +
        "it is what makes the wish appear on that day's page.",
    ),
  priceYen: z.number().int().optional().describe("Observed price in yen at this shop."),
  url: z.string().optional(),
  note: z.string().optional().describe("Hebrew: stock, floor, opening hours, anything useful."),
});

export default defineTool({
  description: [
    "Record what you found out about a wish: what it really is, what it costs,",
    "which shops on OUR route stock it, pictures, and the sources you used.",
    "Call it after researching, with the wish id from list_wishes.",
    "Write Hebrew for anything a person reads, and keep shop and product names in Latin/Japanese too.",
    "Never invent a price or a shop — if you could not verify it, leave the field out and say so in the note.",
  ].join(" "),
  inputSchema: z.object({
    id: z.string().describe("Wish id from list_wishes."),
    titleEn: z.string().optional().describe("Product/place name in English, for asking in a shop."),
    titleJa: z.string().optional().describe("The name in Japanese, for showing to staff."),
    note: z
      .string()
      .optional()
      .describe("Hebrew summary: what it is, what to watch out for, how to tell it apart."),
    url: z.string().optional().describe("The single best reference link."),
    area: z.string().optional(),
    placeId: z.string().optional(),
    dayN: z
      .number()
      .int()
      .min(1)
      .max(17)
      .optional()
      .describe("Pin the whole wish to a day, when one day is clearly the right one."),
    priceYen: z.number().int().optional().describe("Typical price in yen."),
    whereToBuy: z.array(shop).optional().describe("Ranked by how well each fits our route."),
    sources: z
      .array(z.object({ label: z.string(), url: z.string() }))
      .optional()
      .describe("Where the facts came from. A researched price with no source is a rumour."),
    imageUrls: z
      .array(z.string())
      .max(3)
      .optional()
      .describe("Up to 3 image URLs to copy into our own storage, so they survive offline."),
    finish: z
      .boolean()
      .optional()
      .describe("True when the research is complete — moves the wish out of 'researching'."),
  }),
  async execute({ imageUrls, ...research }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    const imageProblems: string[] = [];
    const images: Array<{ storageId: string; sourceUrl: string }> = [];

    for (const url of imageUrls ?? []) {
      try {
        images.push(await storeImageFromUrl(url));
      } catch (error) {
        // A dead image must not lose the research that came with it.
        imageProblems.push(String(error));
      }
    }

    try {
      const body = (await convexPost("/agent/wishes/research", {
        ...research,
        ...(images.length > 0 ? { images } : {}),
      })) as { revivedFromDropped?: boolean; status?: string };

      return {
        ok: true as const,
        id: research.id,
        imagesStored: images.length,
        status: body.status,
        /**
         * The wish was `dropped` and finishing the research brought it back.
         *
         * Worth saying out loud: the board hides dropped wishes, so before this
         * existed a perfectly good research result landed on a card nobody
         * could see, and the family reasonably concluded nothing had happened.
         */
        revivedFromDropped: Boolean(body.revivedFromDropped),
        ...(body.revivedFromDropped
          ? {
              whatToSay:
                "המשאלה הייתה מסומנת 'ירדה' ולכן לא הופיעה בעמוד. היא חזרה עכשיו למצב " +
                "'רעיון' וגם המחקר נכתב עליה — תגיד להם את שני הדברים, כי הם יראו אותה " +
                "מופיעה מחדש.",
            }
          : {}),
        ...(imageProblems.length > 0 ? { imageProblems } : {}),
      };
    } catch (error) {
      return { ok: false as const, error: String(error) };
    }
  },
});
