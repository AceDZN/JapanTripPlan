// Keep a picture and put it on something.
//
// ## Why the bytes are copied rather than linked
//
// The URL a search returns points at somebody else's server. That server can
// redesign, rate-limit, or simply go away, and when it does the app has a hole
// where a photograph was — offline, on a phone, in Japan, which is exactly when
// nobody can fix it. So the picture is downloaded into Convex storage and the
// trip points at its own copy. Same argument the wish list already makes.
//
// ## Why this applies immediately
//
// A photo is a FACT about a place, like its opening hours: something true about
// the world that we merely recorded. `web/convex/lib/contentPolicy.ts` puts
// `hero` and `gallery` in no plan set for that reason, so this lands straight
// away rather than queueing for Alex. A wrong picture is obvious at a glance
// and one call to replace — unlike moving a block to another day, which is a
// decision somebody has to actually agree to.
//
// Removing a picture is a delete, and deletes are always Alex's call.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { attachImage } from "../lib/content";

export default defineTool({
  description: [
    "Save a picture and attach it to a place, a day, a block or a checklist item.",
    "",
    "`url` must be an image URL you got from search_image this turn — not a page, not a guess,",
    "not something remembered. The picture is downloaded and kept, so a broken or wrong link",
    "becomes a broken or wrong picture on the family's trip page.",
    "",
    "Slots:",
    "  hero      the one main picture. Replaces whatever is there.",
    "  gallery   an extra angle. For an attraction 3–5 is the useful number — enough to size the",
    "            place up the way you would from a Google result. Oldest drops off beyond that.",
    "",
    "Targets and their keys:",
    "  places          the place id from search_places (e.g. 'fushimi-inari-taisha')",
    "  days            the day number as a string ('12')",
    "  blocks          the block `id` from get_day — never guess it",
    "  checklistItems  the item id",
    "",
    "Always write `alt` in Hebrew: it is what a screen reader says and what shows if the picture",
    "fails. Describe what is IN the photo, not what the place is called.",
    "",
    "This applies straight away — a picture is a fact, not a change of plan. The user still has to",
    "approve the call in chat.",
  ].join("\n"),

  inputSchema: z.object({
    byEmail: z
      .string()
      .describe("Exactly the address from the `משתמש:` clause of this turn's context line."),
    table: z.enum(["places", "days", "blocks", "checklistItems"]),
    key: z.string().describe("Place id, day number as a string, block id, or checklist item id."),
    slot: z
      .enum(["hero", "gallery"])
      .describe("hero = the main picture (replaces it). gallery = an extra angle."),
    url: z.string().url().describe("The `imageUrl` of a candidate search_image returned."),
    alt: z.string().describe("Hebrew: what is actually visible in the picture."),
    sourceName: z.string().optional().describe("Candidate's `sourceName`, for provenance."),
    credit: z.string().optional().describe("Candidate's `credit`, when it had one."),
    license: z.string().optional().describe("Candidate's `license`, when it had one."),
    pageUrl: z.string().optional().describe("Candidate's `pageUrl` — the page it appeared on."),
  }),

  // Writing to the family's real trip — always ask first.
  approval: always(),

  async execute({ byEmail, table, key, slot, url, alt, sourceName, credit, license, pageUrl }) {
    if (!byEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "אין לי כתובת מזוהה של מי שמבקש, אז אי אפשר לרשום את השינוי על שמו. " +
          "צריך להיות מחוברים לחשבון משפחתי.",
      };
    }

    const outcome = await attachImage({
      byEmail,
      table,
      key,
      slot,
      url,
      alt,
      sourceName,
      credit,
      license,
      pageUrl,
    });

    if (!outcome.ok) return { ok: false as const, error: translate(outcome.error) };

    const { deduped, url: stored, pending } = outcome.result;

    return {
      ok: true as const,
      table,
      key,
      slot,
      storedUrl: stored,
      // Worth telling the model: it means the same photograph is already on
      // something else, which is usually right (a place and the block that
      // visits it) and occasionally a sign it picked a duplicate candidate.
      deduped,
      note:
        pending.length > 0
          ? "התמונה נשמרה אבל השינוי ממתין לאישור של אלכס — אל תגידו שהיא כבר מופיעה."
          : slot === "hero"
            ? "התמונה הראשית עודכנה ומופיעה באתר עכשיו."
            : "התמונה נוספה לגלריה ומופיעה באתר עכשיו.",
    };
  },
});

function translate(error: string): string {
  if (error.includes("not an image")) {
    return "הקישור הזה הוא לא תמונה אלא דף. צריך את ה-imageUrl מהתוצאה של search_image, לא את pageUrl.";
  }
  if (error.includes("too large")) {
    return "התמונה הזאת גדולה מדי. כדאי לבחור מועמדת אחרת — לרוב יש גרסה קטנה יותר.";
  }
  if (error.includes("Could not fetch")) {
    return "לא הצלחתי להוריד את התמונה מהכתובת הזאת. אולי האתר חוסם — כדאי לנסות מועמדת אחרת.";
  }
  if (error.includes("is not a block id")) {
    return "המזהה הזה הוא לא מזהה של בלוק. צריך לקרוא את היום עם get_day ולהעתיק את השדה `id`.";
  }
  if (error.includes("No ") && error.includes("row with key")) {
    return "לא מצאתי את הפריט הזה. כדאי לחפש אותו קודם ולהשתמש במזהה שחוזר משם.";
  }
  if (error.includes("not on the family list")) {
    return "הכתובת הזאת לא ברשימת המשפחה, אז אי אפשר לרשום את השינוי בשמה.";
  }
  return error;
}
