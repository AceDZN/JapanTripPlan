/**
 * Put the family's first wishes in, so the list is not an empty page.
 *
 *   npm run seed:wishes
 *
 * These are the ones already said out loud — Tommy wants a Pikachu figurine,
 * Yonit wants a specific serum. Everything else the family adds themselves in
 * the app, which is the point of the feature.
 *
 * Seeded as SHARED, deliberately: nothing here is a surprise for anybody, and
 * a private wish seeded by someone else would be a contradiction — private
 * means "only I can see it", so only its owner should ever create one.
 *
 * Idempotent on (ownerEmail, title): re-running converges and never clobbers
 * an edit the family has since made.
 */

// Marks the file as a module so its top-level `await` is legal — the other
// scripts get this for free from their imports.
export {};

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

if (!SITE_URL) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set (check web/.env.local)");
if (!KEY) throw new Error("AGENT_SERVICE_KEY is not set (check web/.env.local)");

type Wish = {
  ownerEmail: string;
  kind: "attraction" | "place" | "product" | "food" | "experience" | "other";
  title: string;
  /** The name to actually say or show in a shop — Hebrew is no help there. */
  titleEn?: string;
  titleJa?: string;
  note?: string;
  area?: string;
  priceYen?: number;
  priority: "must" | "want" | "maybe";
  visibility: "shared" | "private";
};

const WISHES: Wish[] = [
  {
    ownerEmail: "tommy@acedzn.com",
    kind: "product",
    title: "פיגורה של פיקאצ׳ו",
    titleEn: "Pikachu figure",
    titleJa: "ピカチュウ フィギュア",
    note: "לחפש ב־Pokémon Center — יש סניפים בשיבויה (יום 6), בטוקיו סטיישן (יום 16) ובניהונבאשי. להשוות מחיר לפני שקונים את הראשון שרואים.",
    area: "פוקימון סנטר",
    priority: "must",
    visibility: "shared",
  },
  {
    ownerEmail: "yonitiny@gmail.com",
    kind: "product",
    title: "סרום PDRN ורוד עם פפטידים",
    titleEn: "PDRN Pink Peptide Serum",
    titleJa: "PDRN ピンクペプチド 美容液",
    note: "מוצר ספציפי — לצלם את השם באנגלית וביפנית ולהראות בדלפק. לחפש ב־Don Quijote, ב־Matsumoto Kiyoshi (マツモトキヨシ) או ב־@cosme. לוודא שזה בדיוק אותו מוצר ולא גרסה דומה.",
    area: "רשתות דראגסטור",
    priority: "must",
    visibility: "shared",
  },
];

let created = 0;
let existing = 0;

for (const wish of WISHES) {
  const response = await fetch(`${SITE_URL}/agent/wishes/seed`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(wish),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`seed failed for "${wish.title}" (${response.status}): ${JSON.stringify(body)}`);
  }
  if (body.created) created += 1;
  else existing += 1;
  console.log(`  ${body.created ? "added  " : "already"}  ${wish.ownerEmail}  ${wish.title}`);
}

console.log(`\n${created} added, ${existing} already present.`);
