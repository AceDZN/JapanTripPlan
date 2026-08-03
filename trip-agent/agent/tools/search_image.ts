// Look for a picture of something. Finds candidates; keeps nothing.
//
// Deliberately split from `set_image`, rather than one "get me a photo" call.
// A search returns five or six things and only one of them is the right one —
// a shop's own storefront rather than stock photography of ramen in general, a
// torii path rather than a map of Kyoto. That judgement is the model's job, and
// it cannot make it without looking. Storing six pictures to keep one is also
// exactly the waste this design avoids.

import { defineTool } from "eve/tools";
import { z } from "zod";
import { searchImages } from "../lib/content";

export default defineTool({
  description: [
    "Search the web for pictures of a place, a dish, a shop, an attraction — anything on the trip.",
    "",
    "Returns candidates with their source, and where the source told us, the photographer and",
    "licence. Nothing is saved: pick one and pass its `imageUrl` to set_image.",
    "",
    "ALWAYS pass `pageUrl` when the thing has an official site — search_places returns `officialUrl`.",
    "A restaurant's or shop's own page almost always has the right photo of it, and no image search",
    "will surface that above generic pictures of the same kind of thing.",
    "",
    "Write the query the way you would type it into Google Images: the name plus the city, in",
    "English or Japanese rather than Hebrew — the sources index far more under those.",
    "Good: 'Fushimi Inari Taisha senbon torii Kyoto'. Poor: 'מקדש יפה'.",
  ].join("\n"),

  inputSchema: z.object({
    query: z
      .string()
      .min(2)
      .describe("What to look for. Name + city, in English or Japanese."),
    pageUrl: z
      .string()
      .optional()
      .describe("The thing's official site, if it has one — its own photo is read from here."),
    limit: z.number().int().min(1).max(15).optional().describe("How many candidates (default 6)."),
  }),

  async execute({ query, pageUrl, limit }) {
    const outcome = await searchImages({ query, pageUrl, limit });
    if (!outcome.ok) return { ok: false as const, error: outcome.error };

    if (outcome.candidates.length === 0) {
      return {
        ok: true as const,
        query,
        candidates: [],
        note:
          "לא מצאתי תמונות לחיפוש הזה. כדאי לנסות את השם באנגלית או ביפנית, " +
          "או להוסיף את שם העיר.",
        layersRun: outcome.layersRun,
      };
    }

    return {
      ok: true as const,
      query,
      layersRun: outcome.layersRun,
      // Present when a source is switched off rather than empty-handed — the
      // difference between "there is nothing" and "we did not look there".
      ...(outcome.layersSkipped.length > 0 ? { layersSkipped: outcome.layersSkipped } : {}),
      candidates: outcome.candidates,
      note:
        "אלה רק מועמדות — עדיין לא נשמר כלום. בוחרים אחת ומעבירים את ה-imageUrl שלה ל-set_image.",
    };
  },
});
