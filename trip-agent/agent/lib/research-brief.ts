/**
 * The prompt a background research run wakes up to.
 *
 * A session started over `POST /eve/v1/session` gets exactly one thing from its
 * caller: the message. There is no state parameter on that route, no shared
 * sandbox (sandboxes are session-scoped) and no way to hand it a closure. So
 * everything the run needs — who asked, what for, which wish to write onto, and
 * how to get back to the conversation — is written into this text.
 *
 * It is deliberately blunt about two things the model gets wrong otherwise:
 * that its own reply text goes nowhere (task-style runs are not read by anyone),
 * and that the research is worthless unless it ends in `research_wish`.
 */

/**
 * Opening marker of every prompt that starts a background run.
 *
 * `hooks/live-sessions.ts` matches on it to flag the session, which is what
 * stops a background run from queueing further background runs. The schedule
 * prompt opens with the same marker for the same reason.
 */
export const BACKGROUND_MARKER = "[משימת רקע";

export interface ResearchBrief {
  /** Hebrew: what to research, as the family would say it. */
  topic: string;
  /** Wish id from `create_wish` / `list_wishes`, when there is one. */
  wishId?: string;
  /** Display name of the person who asked. */
  askedBy?: string;
  /** What they actually said, verbatim. */
  promptText?: string;
  /** Anything that narrows the search: budget, recipient, size, colour. */
  context?: string;
  /** A private wish must never be summarised to the wrong person. */
  visibility: "shared" | "private";
  /** Opaque handle for delivering the answer back into the chat. */
  replyTicket?: string;
}

export function buildResearchBrief(brief: ResearchBrief): string {
  const lines: string[] = [];

  lines.push(
    "[משימת רקע — מחקר משאלה]",
    "",
    "אתה רץ עכשיו בסשן נפרד, ברקע, אחרי שהתור מול המשפחה כבר נסגר.",
    "אף אחד לא קורא את הטקסט שאתה כותב כאן. הפלט של הסשן הזה נזרק.",
    "יש בדיוק שתי דרכים שבהן העבודה שלך מגיעה למישהו:",
    "  1. `research_wish` — כותב את הממצאים על המשאלה, ומשם הם מופיעים בעמוד המשאלות ובעמוד היום.",
    brief.replyTicket
      ? "  2. `deliver_background_result` — מחזיר תשובה מדוברת אל תוך הצ'אט שממנו הבקשה יצאה."
      : "  2. (אין ערוץ חזרה לצ'אט בהרצה הזאת — רק המשאלה.)",
    "",
    "## מה לחקור",
    `נושא: ${brief.topic}`,
  );

  if (brief.wishId) lines.push(`מזהה משאלה: ${brief.wishId}`);
  if (brief.askedBy) lines.push(`מי ביקש: ${brief.askedBy}`);
  if (brief.promptText) lines.push(`מה נאמר במקור: "${brief.promptText}"`);
  if (brief.context) lines.push(`הקשר נוסף: ${brief.context}`);
  lines.push(`נראות: ${brief.visibility === "private" ? "פרטית" : "משותפת"}`);

  lines.push(
    "",
    "## הרצף",
    "1. `web_search` ו-`web_fetch` — מה המוצר/המקום הזה בדיוק, כמה הוא עולה בין, ואיפה משיגים אותו.",
    "   שם באנגלית וביפנית הם חלק מהתוצאה, לא תוספת: אי אפשר לבקש בחנות בטוקיו בעברית.",
    "2. `search_places` ו-`get_day` — הצלב מול המסלול שלנו. חנות שיושבת על יום שכבר מתוכנן שווה",
    "   פי כמה מהחנות הזולה בעיר אחרת, וזה בדיוק מה שאתה כאן בשבילו.",
    "3. `research_wish` עם כל מה שמצאת: `titleEn`, `titleJa`, `priceYen`, `whereToBuy` (עם `dayN`",
    "   על כל חנות שנמצאת על המסלול), `sources` ו-`note` בעברית. `finish: true` בסוף.",
  );

  if (brief.replyTicket) {
    lines.push(
      "4. `deliver_background_result` — שלח את התשובה חזרה לצ'אט.",
      "",
      "## החזרה לצ'אט",
      `replyTicket: ${brief.replyTicket}`,
      "המחרוזת הזאת היא כתובת פנימית. אל תדפיס אותה, אל תצטט אותה ואל תזכיר שהיא קיימת —",
      "היא נכנסת רק לתוך הפרמטר `replyTicket` של `deliver_background_result`.",
      "ב-`text` תכתוב בעברית, קצר ומדובר, מה מצאת: מה זה, כמה זה עולה, באיזו חנות, ובאיזה יום",
      "זה יוצא להם בדרך. זאת התשובה שהובטחה להם — כתוב אותה כאילו אתה חוזר אליהם עם בשורה.",
    );
  }

  lines.push(
    "",
    "אתה כבר ברקע: אל תקרא ל-`queue_background_research`. אין למי להעביר את זה הלאה.",
    "",
    "## כשלא הצלחת",
    "אל תמציא מחיר, חנות או מלאי. אם לא אימתת — השדה נשאר ריק.",
    "אם המחקר נכשל לגמרי: `research_wish` עם `note` בעברית שמסביר מה לא נמצא ו-`finish: true`,",
    brief.replyTicket
      ? "ואז `deliver_background_result` עם `outcome: \"failed\"` והסבר קצר. כישלון שקט הוא הדבר היחיד שאסור."
      : "כדי שהמשאלה לא תישאר תקועה במצב 'בבדיקה' לנצח. כישלון שקט הוא הדבר היחיד שאסור.",
  );

  if (brief.visibility === "private") {
    lines.push(
      "",
      "## פרטיות",
      "המשאלה הזאת פרטית. היא נוצרה כהפתעה, ומי שביקש אותה הוא היחיד שאמור לדעת עליה.",
      "אל תכתוב בשום מקום ציבורי מה היא, ובטקסט שחוזר לצ'אט אל תנקוב בשם של מי שמקבל את המתנה",
      "יותר ממה שנדרש כדי שהמבקש יבין על מה מדובר.",
    );
  }

  return lines.join("\n");
}
