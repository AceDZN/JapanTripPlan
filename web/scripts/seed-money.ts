/**
 * Lift the money out of 10-BUDGET.md and into the ledger.
 *
 *   npm run seed:money
 *
 * The budget guide has kept two things a document cannot really keep: a set of
 * planning envelopes, and a "פנקס ההזמנות" whose "החיוב המשפחתי בפועל" column a
 * person is meant to fill in after every purchase. This seeds both as data, so
 * the numbers can be summed, shown on a day page, and added to from a shop.
 *
 * Everything here is copied from the guide, not invented. Where the guide is
 * deliberately silent — the flights total, the anime-shopping ceiling, the four
 * unbooked nights — the envelope is seeded WITHOUT bounds and with the guide's
 * own reason as its note. An empty envelope keeps an open question visible;
 * omitting it would quietly close one.
 *
 * Idempotent: envelopes upsert on `slug`, expenses on
 * (paidByEmail, title, spentOn, amount), so re-running converges and never
 * doubles a charge.
 */

export {};

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

if (!SITE_URL) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set (check web/.env.local)");
if (!KEY) throw new Error("AGENT_SERVICE_KEY is not set (check web/.env.local)");

async function post(path: string, body: unknown) {
  const response = await fetch(`${SITE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as
    | { ok?: boolean; created?: boolean; error?: string }
    | null;
  if (!response.ok || !json?.ok) {
    throw new Error(`${path} failed (${response.status}): ${JSON.stringify(json)?.slice(0, 300)}`);
  }
  return json;
}

/* ------------------------------------------------------------------- rates */

/**
 * Read off exchangerate-api on 1 August 2026 and cited as such.
 *
 * A floor, not the live number: `convex/fx.ts` refreshes these daily from the
 * same feed. The date belongs in `asOf`, not in the source string — otherwise
 * the row reads "exchangerate-api, 1.8.2026 · 2.8.2026" and the reader has to
 * work out which of the two dates the rate is actually for.
 *
 * These convert the two shekel Airbnb charges into the single yen total. They
 * are a starting point, not a claim about what the card actually did: the guide
 * is explicit that the real number is "שער התשלום/הדוח בפועל", and each expense
 * keeps whatever rate it was recorded at, so correcting one row later does not
 * silently re-scale the rest.
 */
const RATE_AS_OF = Date.parse("2026-08-01T00:00:00Z");

const RATES: { currency: "ILS" | "USD" | "EUR"; jpyPerUnit: number; source: string }[] = [
  { currency: "ILS", jpyPerUnit: 51.835159, source: "exchangerate-api" },
  { currency: "USD", jpyPerUnit: 158.537858, source: "exchangerate-api" },
  { currency: "EUR", jpyPerUnit: 182.5, source: "exchangerate-api" },
];

/* --------------------------------------------------------------- envelopes */

type Envelope = {
  slug: string;
  category:
    | "flights"
    | "stay"
    | "transport"
    | "food"
    | "attractions"
    | "shopping"
    | "arcade"
    | "gifts"
    | "essentials"
    | "other";
  label: string;
  minYen?: number;
  maxYen?: number;
  note?: string;
};

/**
 * "מעטפות תכנון" from 10-BUDGET.md, in the guide's own order.
 *
 * Two of the guide's roll-ups are deliberately NOT seeded — the Kyoto
 * traditional-experience subtotal (¥101,600–109,600) and the celebration
 * envelope (¥32,000–68,000). Both are cross-sections of envelopes that are
 * already here: seeding them too would double-count the same yen against the
 * trip total, which is exactly the arithmetic this table exists to fix. They
 * remain readable as prose in the guide.
 */
const ENVELOPES: Envelope[] = [
  {
    slug: "flights",
    category: "flights",
    label: "טיסות",
    note: "מוזמנות ומשולמות; סכום הקבלה עדיין לא תועד. להזין את החיוב בפועל ואז לקבוע טווח.",
  },
  {
    slug: "stay-booked",
    category: "stay",
    label: "לינה — 11 הלילות המוזמנים",
    // 188,628 + 41,280: each charge converts and rounds on its own, so this is
    // the sum of the two rows rather than sum-then-convert, which lands a yen
    // higher and makes a fully-covered envelope render as overspent by ¥1.
    minYen: 229908,
    maxYen: 229908,
    note: "טוקיו ₪3,638.99 + קיוטו ₪796.37, מומר בשער 1.8.2026. הסכום המדויק ביין תלוי בשער החיוב בפועל.",
  },
  {
    slug: "stay-remaining",
    category: "stay",
    label: "לינה — 4 הלילות שנותרו",
    note: "אוסקה (ליד ESLEAD Namba East ¥35,184) וטוקיו הסופית (ליד ₪1,380). לא מוזמן, ולכן בלי טווח מחייב.",
  },
  {
    slug: "local-transport",
    category: "transport",
    label: "תחבורה מקומית + שתי נסיעות Skyliner",
    minYen: 65000,
    maxYen: 75000,
    note: "בסיס ביקורת המסלולים הוא ¥61,200–62,000; היתרה למונית לבסיס הסופי ולשינויים בזמן אמת.",
  },
  {
    slug: "shinkansen",
    category: "transport",
    label: "שינקנסן שמור טוקיו ↔ אוסקה/קיוטו",
    minYen: 110000,
    maxYen: 125000,
    note: "כרטיסי נוזומי שמורים בנפרד — מתאימים למסלול הזה יותר מ־JR Pass ארצי.",
  },
  {
    slug: "attractions-core",
    category: "attractions",
    label: "אטרקציות וסדנאות מרכזיות (ללא USJ)",
    minYen: 150000,
    maxYen: 260000,
    note: "הטווח רחב כי PokéPark, ג׳יבלי ו-Mundo Pixar עדיין לא סגורים. קניות הוצאו מכאן במכוון.",
  },
  {
    slug: "usj",
    category: "attractions",
    label: "USJ Studio Pass + מוצר Express",
    minYen: 90000,
    maxYen: 180000,
    note: "לקנות בדיוק את ערך ה-Express שמכסה את סופר נינטנדו וורלד; לא להניח חבילה גנרית.",
  },
  {
    slug: "food",
    category: "food",
    label: "אוכל וחטיפים (ללא כרטיס מראש)",
    minYen: 190000,
    maxYen: 260000,
    note: "יום עיר רגיל ¥12,000–17,000; יום פסטיבל/פארק ¥15,000–22,000; יום החגיגה ¥25,000–45,000.",
  },
  {
    slug: "arcade",
    category: "arcade",
    label: "ארקייד, גצ׳פון ומשחקי מנוף",
    minYen: 25000,
    maxYen: 45000,
    note: "מעטפת מזומן לכל ילד — זו השיטה שהמדריך ממליץ עליה, ולא כרטיס פתוח.",
  },
  {
    slug: "anime-shopping",
    category: "shopping",
    label: "קניות אנימה ודמויות",
    note: "המדריך דורש תקרה משפחתית נפרדת, והיא עדיין לא הוגדרה. עד שתיקבע — אין תקרה, וזו בדיוק הבעיה.",
  },
  {
    slug: "essentials",
    category: "essentials",
    label: "eSIM, כביסה, לוקרים, ציוד גשם ובית מרקחת",
    minYen: 20000,
    maxYen: 35000,
  },
  {
    slug: "reserve",
    category: "other",
    label: "רזרבה",
    note: "10–15% מכל הקטגוריות המשתנות. מכוון שאין לה טווח משלה — היא נגזרת מהשאר.",
  },
];

/* ---------------------------------------------------------------- expenses */

type SeedExpense = {
  title: string;
  titleEn?: string;
  category: Envelope["category"];
  amount: number;
  currency: "JPY" | "ILS";
  spentOn: string;
  dayN?: number;
  status?: "paid" | "pending";
  method?: "card" | "cash" | "ic" | "transfer" | "points" | "other";
  reference?: string;
  note?: string;
};

/**
 * Every charge 10-BUDGET.md already records as made.
 *
 * Attributed to the trip owner: the guide describes these as one credit-card
 * booking each and never names a payer, so this is the only defensible default.
 * Whoever actually paid can correct the row in the app.
 *
 * The two Airbnb charges carry `2026-02-01` because the guide records the
 * amount and not the date. That is stated in the note rather than hidden, so it
 * reads as "needs correcting from the statement" instead of as a fact.
 */
const OWNER = "alex@acedzn.com";
const FROM_GUIDE = "מתוך פנקס ההזמנות ב-10-BUDGET.md.";
/** The guide records amounts, never purchase dates. Say so on every such row. */
const DATE_PLACEHOLDER = "תאריך הרכישה הוא מציין מקום — לתקן לתאריך החיוב האמיתי.";

const EXPENSES: SeedExpense[] = [
  {
    title: "Airbnb טוקיו — Marble Tokyo Base Tabata, 9 לילות",
    titleEn: "Marble Tokyo Base Tabata",
    category: "stay",
    amount: 3638.99,
    currency: "ILS",
    spentOn: "2026-02-01",
    status: "paid",
    method: "card",
    note: `${FROM_GUIDE} תאריך החיוב המדויק לא מתועד באף מסמך — לתקן מדף החיובים של הכרטיס, וגם את שער ההמרה בפועל.`,
  },
  {
    title: "Airbnb קיוטו — bliss Kyoto Fushimi Inari, 2 לילות",
    titleEn: "bliss Kyoto Fushimi Inari",
    category: "stay",
    amount: 796.37,
    currency: "ILS",
    spentOn: "2026-02-01",
    status: "paid",
    method: "card",
    note: `${FROM_GUIDE} תאריך החיוב המדויק לא מתועד — לתקן מדף החיובים של הכרטיס.`,
  },
  {
    title: "teamLab Planets — Entrance Pass לארבעה",
    titleEn: "teamLab Planets TOKYO",
    category: "attractions",
    amount: 16800,
    currency: "JPY",
    spentOn: "2026-07-01",
    dayN: 4,
    status: "paid",
    method: "card",
    note: `${FROM_GUIDE} 2 מבוגרים ב-¥5,600 ו-2 תלמידים ב-¥2,800. כניסה 09:30–10:00. ${DATE_PLACEHOLDER}`,
  },
  {
    title: "UZUMASA Kyoto Village — כניסה, טקס תה, נינג׳ה ומבוך",
    titleEn: "UZUMASA Kyoto Village",
    category: "attractions",
    amount: 29600,
    currency: "JPY",
    spentOn: "2026-07-01",
    dayN: 12,
    status: "paid",
    method: "card",
    note: `${FROM_GUIDE} כניסה ¥15,200 + טקס תה ¥10,800 + Ninja Escape ¥2,400 + 3D Maze ¥1,200. אי אפשר לבטל, אבל אפשר לשנות תאריך. ${DATE_PLACEHOLDER}`,
  },
  {
    title: "DRUM TAO HIBIKI — שורה G, מושבים 12–15",
    titleEn: "DRUM TAO HIBIKI",
    category: "attractions",
    amount: 47108,
    currency: "JPY",
    spentOn: "2026-07-01",
    dayN: 12,
    status: "paid",
    method: "card",
    reference: "00003314",
    note: `${FROM_GUIDE} Standard עם חטיפים ×4 ב-¥11,000, ועוד ¥2,800 שירות ו-¥308 כרטוס. ${DATE_PLACEHOLDER}`,
  },
  {
    title: "מוזיאון נינטנדו — כרטיסים",
    titleEn: "Nintendo Museum",
    category: "attractions",
    amount: 11000,
    currency: "JPY",
    spentOn: "2026-08-02",
    dayN: 15,
    status: "paid",
    method: "card",
    reference: "M0715260779",
    note:
      `${FROM_GUIDE} מבוגר ×2 ¥6,600 + נוער ×2 ¥4,400 = ¥11,000 כולל מס. שולם, מספר רכישה M0715260779, ` +
      "חותמת הרכישה 3.8.2026 ב-01:36 שעון יפן — כלומר ערב 2.8 בישראל, וזה התאריך שנרשם כאן. " +
      "לאמת מול דף האשראי אם החיוב נרשם ב-3.8. אין החזר ואי אפשר להעביר תאריך.",
  },
];

/* -------------------------------------------------------------------- run */

let rates = 0;
for (const rate of RATES) {
  await post("/agent/money/rate", { ...rate, asOf: RATE_AS_OF, updatedBy: "seed" });
  rates += 1;
}

let created = 0;
let updated = 0;
for (const [index, envelope] of ENVELOPES.entries()) {
  const result = await post("/agent/money/budget", {
    ...envelope,
    order: (index + 1) * 10,
    updatedBy: "seed",
  });
  if (result.created) created += 1;
  else updated += 1;
}

let recorded = 0;
let already = 0;
for (const expense of EXPENSES) {
  const result = await post("/agent/money/expense", {
    ...expense,
    paidByEmail: OWNER,
    source: "import",
  });
  if (result.created) recorded += 1;
  else already += 1;
}

console.log(
  `Money seeded: ${rates} rates, ${created} new envelopes (${updated} updated), ` +
    `${recorded} new expenses (${already} already there).`,
);
