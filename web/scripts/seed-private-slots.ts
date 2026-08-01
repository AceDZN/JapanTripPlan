/**
 * Lay out an empty slot in the vault for every private item the guides
 * reference.
 *
 *   npm run seed:private
 *
 * The guides mention private material 43 times — "save it in the private
 * lodging folder", "keep the door code out of the public itinerary", "record
 * expiry dates privately", "My Tickets link from the private ticket folder".
 * Every one of those is a pointer to something living in a Drive folder or an
 * inbox, deliberately never committed. So there is nothing to import; what
 * this does is turn those 43 scattered pointers into a fill-in list inside the
 * app, attached to the right day or place.
 *
 * VALUES ARE LEFT BLANK ON PURPOSE. Nothing here invents a confirmation
 * number, a door code or a passport detail. `where` records where the real
 * value currently lives, so whoever fills it in knows where to look.
 *
 * Idempotent, and safe to re-run after the family has started entering real
 * data: a blank seed never overwrites a filled-in value.
 */

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

if (!SITE_URL) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set (check web/.env.local)");
if (!KEY) throw new Error("AGENT_SERVICE_KEY is not set (check web/.env.local)");

type Slot = {
  subject: "place" | "day" | "booking" | "guide" | "checklistItem" | "trip";
  subjectId: string;
  kind: "ticket" | "confirmation" | "address" | "doorCode" | "passport" | "note";
  label: string;
  /** Where the real value lives today. Becomes the slot's placeholder text. */
  where: string;
};

const SLOTS: Slot[] = [
  // ---------------------------------------------------------------- flights
  {
    subject: "trip", subjectId: "trip", kind: "confirmation",
    label: "אתיופיאן — מספר הזמנה (PNR)",
    where: "מתוך מייל אישור הרכישה של Ethiopian Airlines. 01-FLIGHTS.md מבקש לשמור אותו אופליין.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "confirmation",
    label: "אתיופיאן — ארבעה מספרי כרטיס אלקטרוני",
    where: "מייל האישור. כרטיס לכל אחד מארבעת הנוסעים.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "note",
    label: "אתיופיאן — כבודה, מושבים, ארוחות וסכום ששולם",
    where: "התיקייה הפרטית של הטיסות. גם אנשי הקשר לשיבושים.",
  },

  // --------------------------------------------------------------- teamLab
  {
    subject: "place", subjectId: "teamlab-planets", kind: "confirmation",
    label: "teamLab Planets — מייל אישור (¥16,800, 4.10)",
    where: "מייל האישור מחנות DMM הרשמית. הכניסה 09:30–10:00.",
  },
  {
    subject: "place", subjectId: "teamlab-planets", kind: "ticket",
    label: "teamLab Planets — קישור My Tickets",
    where: "התיקייה הפרטית ‎06 teamLab‎. הקישור מציג את הכרטיסים לכל מי שמחזיק בו — לכן לא במסמך משותף. קודי ה־QR מופיעים רק אחרי 00:00 ב־4.10.",
  },

  // --------------------------------------------------------------- UZUMASA
  {
    subject: "place", subjectId: "uzumasa-kyoto-village", kind: "ticket",
    label: "UZUMASA — דף הכרטיסים (כניסה מהסמארטפון בלבד)",
    where: "מייל הרכישה, ¥29,600. אין הדפסה — מראים את המסך בקבלה. תקף רק ב־12.10.",
  },

  // ------------------------------------------------------- Tokyo · Tabata
  {
    subject: "place", subjectId: "tabata-base", kind: "address",
    label: "טבטה — כתובת מדויקת",
    where: "צ׳אט Airbnb. 02-ACCOMMODATION.md מציין שהכתובת לא משוכפלת למדריך המסונכרן.",
  },
  {
    subject: "place", subjectId: "tabata-base", kind: "doorCode",
    label: "טבטה — קוד הלוקבוקס",
    where: "הוראות הצ׳ק־אין מהמארח, נשלחות אחרי אישור הדרכונים.",
  },
  {
    subject: "place", subjectId: "tabata-base", kind: "confirmation",
    label: "טבטה — מספר אישור ההזמנה",
    where: "Airbnb.",
  },
  {
    subject: "place", subjectId: "tabata-base", kind: "note",
    label: "טבטה — אישור בכתב לצ׳ק־אין עצמי מאוחר",
    where: "צ׳אט Airbnb בלבד. הטיסה נוחתת 19:40 — צריך אישור כתוב.",
  },

  // ------------------------------------------------- Kyoto · Fushimi Inari
  {
    subject: "place", subjectId: "fushimi-inari-apartment", kind: "doorCode",
    label: "פושימי — קוד כניסה",
    where: "מדריך הגישה של המארח. 11-PRE-TRIP-CHECKLIST.md: לא להכניס למסלול הפומבי.",
  },
  {
    subject: "place", subjectId: "fushimi-inari-apartment", kind: "address",
    label: "פושימי — כתובת מדויקת וחדר D",
    where: "אישור ההזמנה. קומה שנייה, כשלוש דקות הליכה מהמקדש.",
  },
  {
    subject: "place", subjectId: "fushimi-inari-apartment", kind: "note",
    label: "פושימי — מדריך גישה שמור אופליין",
    where: "טופס הרישום של המארח + צ׳אט Airbnb. לשמור אופליין לפני הנחיתה.",
  },

  // ------------------------------------------------------ still to book
  {
    subject: "place", subjectId: "namba-base", kind: "confirmation",
    label: "אוסקה 13–15.10 — אישור הזמנה",
    where: "עוד לא הוזמן. למלא כשנסגר.",
  },
  {
    subject: "place", subjectId: "ueno-inaricho-base", kind: "confirmation",
    label: "טוקיו 15–17.10 — אישור הזמנה",
    where: "עוד לא הוזמן. למלא כשנסגר.",
  },

  // -------------------------------------------------------------- documents
  {
    subject: "trip", subjectId: "trip", kind: "passport",
    label: "דרכון — אלכס (מספר ותוקף)",
    where: "לבדוק מול רישומי חברת התעופה. 11-PRE-TRIP-CHECKLIST.md: לתעד תוקף באופן פרטי.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "passport",
    label: "דרכון — יוני (מספר ותוקף)",
    where: "לבדוק מול רישומי חברת התעופה.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "passport",
    label: "דרכון — מאיה (מספר ותוקף)",
    where: "לבדוק מול רישומי חברת התעופה.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "passport",
    label: "דרכון — תומי (מספר ותוקף)",
    where: "לבדוק מול רישומי חברת התעופה.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "confirmation",
    label: "ביטוח נסיעות — מספר פוליסה ומוקד חירום",
    where: "אתר המבטח. כולל טיפול רפואי, שיבושים וביטול כרטיסים.",
  },
  {
    subject: "trip", subjectId: "trip", kind: "note",
    label: "מרשמים ואנשי קשר לחירום",
    where: "לשמור אופליין, בנפרד מהמסמכים המקוריים.",
  },
];

async function seed(slot: Slot) {
  const response = await fetch(`${SITE_URL}/agent/private/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      subject: slot.subject,
      subjectId: slot.subjectId,
      kind: slot.kind,
      label: slot.label,
      // Blank on purpose — nothing here invents a real value.
      value: "",
      hint: slot.where,
      updatedBy: "seed",
    }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(`seed "${slot.label}" failed (${response.status}): ${JSON.stringify(body)}`);
  }
}

console.log(`Seeding ${SLOTS.length} private slots into ${SITE_URL}`);
for (const slot of SLOTS) {
  await seed(slot);
  console.log(`  ${slot.kind.padEnd(13)} ${slot.label}`);
}
console.log(
  `\n✅ ${SLOTS.length} slots ready, all blank. Fill them in at /private — nothing was invented.`,
);

export {};
