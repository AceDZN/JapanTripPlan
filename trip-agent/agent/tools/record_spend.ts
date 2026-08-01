// Record what the family actually paid.
//
// ## Why this exists
//
// 10-BUDGET.md has always had a "פנקס ההזמנות" table with a column headed
// "החיוב המשפחתי בפועל", and most of that column reads "—". Not because nobody
// bought anything, but because a markdown table cannot be filled in from a
// queue at USJ. This tool is that column, made writable from a chat message or
// a photo of a receipt.
//
// ## Why it is not gated behind the owner's approval queue
//
// Same reasoning as `mark_done`: "we paid ¥54,000 for the Studio Pass" reports
// a fact about the world. It does not change what the family plans to do, so it
// does not belong in `/suggestions` with the route changes. It still asks the
// user in chat first, because a wrong charge is unpleasant to find later — and
// because the model reading a receipt WILL occasionally misread a digit, and a
// human glance at "¥54,000, USJ, 14.10" catches that in a second.
//
// ## The rule that matters most
//
// Never invent an amount. A price you remember, a price from a website you did
// not open this turn, or a "typical" price is not a charge — it is a rumour
// that will end up in a family's total and be treated as fact. If the number is
// not in front of you, say so and ask.

import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { CONVEX_UNCONFIGURED, convexConfigured, convexPost } from "../lib/convex";

export default defineTool({
  description: [
    "Record a payment the family actually made, so it lands in the trip's spend totals",
    "and on the relevant day page. Use it when somebody reports a purchase ('קנינו את",
    "הכרטיסים ל-USJ, 54,000 ין'), when they send a photo of a receipt or a booking",
    "confirmation, or when a wish they asked for has been bought.",
    "",
    "READ THE NUMBERS OFF THE THING IN FRONT OF YOU. Never fill `amount` from memory,",
    "from a typical price, or from a page you did not open this turn. If the amount is",
    "not stated, ask for it — a guessed charge becomes a fact in the family's budget.",
    "",
    "`status: 'pending'` is for something booked or won but not yet charged (the Nintendo",
    "Museum lottery before it is paid). Use 'paid' only when the money has actually moved.",
    "",
    "Pass `wishId` when the purchase IS somebody's wish from list_wishes: that closes the",
    "wish and, if the wish is private, keeps the expense private too — which is what",
    "protects a surprise present from showing up in a total everyone can see.",
    "",
    "The user must approve the call before anything is recorded.",
  ].join("\n"),

  inputSchema: z.object({
    paidByEmail: z
      .string()
      .describe(
        "Exactly the address from the `משתמש:` clause of this turn's context line — " +
          "the person reporting the purchase. Never guess it.",
      ),
    title: z
      .string()
      .min(2)
      .describe(
        "Hebrew, short and specific, as a person would name the charge. Two separate " +
          "¥600 gachapon pulls on one day need distinguishable titles — identical " +
          "(title, date, amount) is treated as the same charge recorded twice.",
      ),
    titleEn: z.string().optional().describe("English name, when the receipt gives one."),
    category: z
      .enum([
        "flights",
        "stay",
        "transport",
        "food",
        "attractions",
        "shopping",
        "arcade",
        "gifts",
        "essentials",
        "other",
      ])
      .describe(
        "Which budget envelope this comes out of. 'arcade' is gachapon/crane/arcade " +
          "specifically — the budget guide keeps it out of 'attractions' on purpose. " +
          "'shopping' is anime/character/merch buying.",
      ),
    amount: z
      .number()
      .positive()
      .describe("The amount charged, in the currency it was charged in. Never rounded or guessed."),
    currency: z
      .enum(["JPY", "ILS", "USD", "EUR"])
      .describe("Almost always JPY once the trip starts. Pre-trip bookings are often ILS."),
    jpyPerUnit: z
      .number()
      .positive()
      .optional()
      .describe(
        "Yen per one unit of `currency`, when the receipt or statement states the rate. " +
          "Leave out to use the stored rate. Never needed for JPY.",
      ),
    spentOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe(
        "ISO date the money moved — from the receipt when it has one, otherwise today " +
          "from get_now. Not the date you are recording it.",
      ),
    dayN: z
      .number()
      .int()
      .min(1)
      .max(17)
      .optional()
      .describe("Trip day, when it falls on one. This is what puts it on that day's page."),
    placeId: z.string().optional().describe("Slug of a trip place, when it maps onto one."),
    wishId: z.string().optional().describe("Wish id from list_wishes, when this purchase IS that wish."),
    status: z
      .enum(["paid", "pending", "refunded"])
      .optional()
      .describe("Defaults to 'paid'. 'pending' = booked or won, money not yet taken."),
    method: z
      .enum(["card", "cash", "ic", "transfer", "points", "other"])
      .optional()
      .describe("Only when it is actually known."),
    reference: z.string().optional().describe("Booking or order number from the confirmation."),
    url: z.string().optional(),
    note: z
      .string()
      .optional()
      .describe(
        "Hebrew: what the charge covered, how it breaks down, anything the receipt " +
          "says that a bare number loses. Say here if something was unreadable.",
      ),
    visibility: z
      .enum(["shared", "private"])
      .optional()
      .describe(
        "Defaults to 'shared'. Use 'private' for a surprise or a gift — and ask first " +
          "whenever it might be one, exactly as with a wish.",
      ),
    fromReceipt: z
      .boolean()
      .optional()
      .describe("True when the numbers were read off a photographed receipt or confirmation."),
  }),

  // Writes to the family's shared ledger — always ask first.
  approval: always(),

  async execute({ fromReceipt, ...expense }) {
    if (!convexConfigured()) return { ok: false as const, error: CONVEX_UNCONFIGURED };

    if (!expense.paidByEmail.includes("@")) {
      return {
        ok: false as const,
        error:
          "אין לי כתובת מזוהה של מי שמדווח, ולכן אי אפשר לרשום מי שילם. צריך להיות " +
          "מחוברים לחשבון משפחתי.",
      };
    }

    try {
      const body = (await convexPost("/agent/money/expense", {
        ...expense,
        source: fromReceipt ? "receipt" : "agent",
      })) as { id: string; created: boolean };

      return {
        ok: true as const,
        id: body.id,
        created: body.created,
        // Idempotent on (payer, title, date, amount): say so plainly instead of
        // implying a second charge was filed.
        note: body.created
          ? "ההוצאה נרשמה ומופיעה בעמוד הכספים, ובעמוד היום אם שויכה ליום."
          : "כבר היה רשום חיוב זהה באותו תאריך — לא נרשם כפול.",
        whatToSay:
          "תאשר להם בקצרה מה נרשם: על מה, כמה, ולאיזה יום זה שויך. אם היה `wishId` — " +
          "תגיד שהמשאלה נסגרה. אל תמציא סכום כולל חדש של הטיול; אם שאלו כמה יצא עד עכשיו, " +
          "תקרא ל-money_report.",
      };
    } catch (error) {
      return {
        ok: false as const,
        error: String(error),
        whatToSay:
          "ההוצאה **לא** נרשמה. אל תגיד 'רשמתי' או 'עדכנתי' — זה פשוט לא נכון. תגיד " +
          "בפשטות שלא הצלחת ומה הסיבה. אם חסר שער המרה למטבע — תגיד שצריך לקבוע אותו " +
          "בעמוד הכספים, או תבקש את השער מהחיוב עצמו ותנסה שוב עם jpyPerUnit.",
      };
    }
  },
});
