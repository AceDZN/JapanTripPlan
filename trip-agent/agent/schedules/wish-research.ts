// Drain the wishes that are waiting for research.
//
// WHY THIS IS NOT COSMETIC. `convex/wishes.ts::requestResearch` — the mutation
// behind the app's "ask eve to research it" button — inserts a wish with
// `status: "researching"` and returns. Nothing in this repo ever picked that
// queue up. The wish board renders those wishes with a spinner
// (components/WishBoard.tsx), so pressing that button today produces a wish
// that spins forever. This schedule is the worker that was missing.
//
// It is the fire-and-forget markdown form (eve/docs/schedules.mdx): eve runs
// the root agent on this prompt and discards the output. Discarding the output
// is fine here precisely because the output is not the product — the product is
// the `research_wish` write, which lands in Convex and reaches the family
// through the reactive wish page and the day pages.
//
// The transition out of the queue is `research_wish({ finish: true })`, which
// `internalApplyResearch` turns into `status: "researching" → "idea"`, and only
// ever in that direction. So a wish leaves this queue exactly once the research
// (or the honest admission of failure) has been written onto it.
//
// CADENCE. Ten minutes is chosen for the product, not the platform: somebody
// presses the button and expects an answer while they are still looking at the
// screen. On Vercel each `defineSchedule` becomes a Vercel Cron Job evaluated in
// UTC; minute-level expressions require a plan that allows them, and a Hobby
// project will need this widened to a daily expression. `eve dev` never fires
// schedules at all — trigger it by hand with
// `curl -X POST http://localhost:2000/eve/v1/dev/schedules/wish-research`.

import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "*/10 * * * *",
  markdown: [
    "[משימת רקע — ניקוז תור המשאלות]",
    "",
    "אתה רץ לבד, על שעון, בלי אף אחד בצד השני. אף אחד לא קורא את מה שאתה כותב כאן —",
    "הפלט של ההרצה הזאת נזרק. הדבר היחיד ששורד הוא מה שכתבת עם `research_wish`.",
    "",
    "1. `list_wishes` עם `status: \"researching\"`. אלה המשאלות שמישהו לחץ עליהן \"תחקור\" והן ממתינות.",
    "   אם הרשימה ריקה — סיים מיד, בלי לקרוא לשום כלי נוסף. זה המצב הרגיל ברוב ההרצות.",
    "2. קח עד שלוש משאלות, הוותיקות ביותר קודם. אל תיקח יותר — ההרצה הבאה תטפל בשאר.",
    "3. לכל אחת: `web_search` ו-`web_fetch` כדי לברר מה זה בדיוק, כמה זה עולה בין ואיפה משיגים אותו,",
    "   ואז `search_places` ו-`get_day` כדי לבדוק אם אחת החנויות יושבת על יום שכבר מתוכנן לנו.",
    "   שם באנגלית וביפנית הם חלק מהתוצאה, לא תוספת.",
    "4. `research_wish` עם כל מה שמצאת — `titleEn`, `titleJa`, `priceYen`, `whereToBuy` עם `dayN`",
    "   על כל חנות שנמצאת על המסלול, `sources`, ו-`note` בעברית — ותמיד `finish: true`.",
    "",
    "אל תמציא מחיר, חנות או מלאי. מחיר בלי מקור הוא שמועה, וכאן הוא גורם למישהו לנסוע לחינם.",
    "",
    "אם לא הצלחת לחקור משאלה — עדיין `research_wish` עליה, עם `note` בעברית שמסביר מה לא הצלחת",
    "לברר, ועם `finish: true`. משאלה שנשארת ב-'researching' נראית למשפחה כמו ספינר שלא נגמר,",
    "ולכן כישלון שקט הוא הדבר היחיד שאסור כאן.",
    "",
    "אל תיצור משאלות חדשות, אל תציע שינויים במסמכים ואל תנסה לפנות לאף אחד — אין כאן צ'אט.",
    "חלק מהמשאלות פרטיות: תחקור אותן כרגיל, אבל אל תכתוב עליהן שום דבר מחוץ למשאלה עצמה.",
  ].join("\n"),
});
