import placesJson from "@/data/places.json";
import { checklistItems } from "@/lib/checklist-data";
import type { Place, TripDay as TripDayBase } from "@/lib/types";

export type { City, DayBlock, BookingStatus, Place, PlaceCategory } from "@/lib/types";

/**
 * The canonical day shape is `TripDay` from `lib/types.ts`.
 * `image` is kept as a legacy alias of `heroImage` so the pre-redesign components
 * keep compiling while the UI is rebuilt; new code should read `heroImage`.
 */
export type TripDay = TripDayBase & {
  image: string;
  discovery?: {
    label: string;
    title: string;
    detail: string;
    href: string;
  };
};

export const places: Place[] = placesJson as unknown as Place[];

export const placesById: Record<string, Place> = Object.fromEntries(
  places.map((place) => [place.id, place]),
);

export const plannedPlaces: Place[] = places.filter((place) => place.planned);
export const extraPlaces: Place[] = places.filter((place) => !place.planned);

export function getPlaces(ids: string[]): Place[] {
  return ids.map((id) => placesById[id]).filter(Boolean);
}

export function getPlacesForDay(n: number): Place[] {
  return places.filter((place) => place.days.includes(n));
}

const day = (
  n: number,
  rest: Omit<TripDay, "day" | "heroImage" | "image">,
): TripDay => {
  const hero = `/images/days/day-${String(n).padStart(2, "0")}.jpg`;
  return { day: n, heroImage: hero, image: hero, ...rest };
};

/**
 * The four bases, written once.
 *
 * `stay` is repeated on every day (see `lib/types.ts`) so "where do I sleep
 * tonight" never requires reasoning about date ranges — but the *content* is
 * shared, so a corrected door code or address is a one-line change here rather
 * than a hunt through seventeen day literals.
 */
const tabataStay: TripDay["stay"] = {
  placeId: "tabata-base",
  label: "הדירה בטבטה · Marble Tokyo Base Tabata",
  url: "https://www.airbnb.com/rooms/1348289002107449827?adults=4&check_in=2026-10-02&check_out=2026-10-11",
  note: "הכתובת המדויקת, קוד הלוקבוקס ומספר הקומה שמורים בכספת המשפחתית. בבניין אין מעלית.",
};

const fushimiStay: TripDay["stay"] = {
  placeId: "fushimi-inari-apartment",
  label: "הדירה בפושימי אינארי",
  checkIn: "15:00",
  checkOut: "11:00",
  note: "כשלוש דקות הליכה מהמקדש. אין הבטחה להשארת מזוודות לפני 15:00 — לתכנן אחסון בתחנת קיוטו.",
};

const osakaStay: TripDay["stay"] = {
  placeId: "namba-base",
  label: "המלון בנמבה, אוסקה",
  note: "טרם נסגר סופית. ברגע שנקבע — לעדכן כאן כתובת ביפנית, שעות צ׳ק־אין וקבלת משלוח מזוודות.",
};

const finalTokyoStay: TripDay["stay"] = {
  placeId: "ueno-inaricho-base",
  label: "הבסיס האחרון בטוקיו · אזור אואנו/אינאריצ׳ו",
  note: "ליד בלבד, לא הזמנה סגורה. כל המסלולים של 15–17.10 מותנים בכך שהלינה הזו תיסגר.",
};

export const tripDays: TripDay[] = [
  day(1, {
    date: "2026-10-01",
    dateHe: "יום ה׳, 1 באוקטובר",
    shortDate: "1.10",
    title: "ממריאים ליפן",
    area: "תל אביב ← אדיס אבבה",
    theme: "יום טיסות בלבד",
    city: "other",
    color: "#c2553d",
    lat: 8.9779,
    lng: 38.7993,
    highlights: ["ET419 ב־15:35", "קונקשן 2:45 באדיס", "ET672 בלילה לנריטה"],
    note: "בתיק היד: דרכונים, תרופות, מטענים, פאוור בנקים, בגד החלפה לכל אחד, כתובת הדירה בטבטה ביפנית והוראות הצ׳ק־אין המאוחר.",
    stay: {
      label: "לילה באוויר — ET672 בדרך לנריטה",
      note: "אין לינה יבשתית הלילה. הכריות, מסכות השינה והתרופות צריכות להיות בתיק היד ולא במזוודה.",
    },
    blocks: [
      {
        time: "12:30",
        title: "מגיעים לנתב״ג · טרמינל 3",
        placeIds: [],
        detail:
          "Ethiopian Airlines עובדת מטרמינל 3. להגיע כשלוש שעות לפני ההמראה — עם ארבעה נוסעים ושמונה מזוודות רשומות התור לדלפק הוא החלק האיטי.",
        needs: [
          "ארבעה דרכונים בתוקף (לפחות חצי שנה מעבר לתאריך החזרה)",
          "כרטיסי ה־e-ticket מודפסים או שמורים אופליין",
          "אסמכתת חברת התעופה GHZBPP ואסמכתת איסתא 7MA3B6",
          "פאוור בנקים בתיק היד בלבד — אסור במזוודה רשומה",
        ],
        warnings: [
          "כל נוסע זכאי לשתי מזוודות רשומות בכל הקטעים — לוודא שקילה לפני היציאה מהבית.",
        ],
        links: [
          {
            label: "Ethiopian Airlines · צ׳ק־אין",
            url: "https://www.ethiopianairlines.com/aa/book/check-in",
            kind: "official",
          },
        ],
      },
      {
        time: "15:35",
        title: "ET419 · תל אביב ← אדיס אבבה",
        placeIds: [],
        detail: "טיסה ישירה, 4 שעות ו־15 דקות. נחיתה באדיס אבבה ב־19:50 שעון מקומי.",
        legs: [
          {
            mode: "plane",
            from: { he: "נתב״ג · טרמינל 3", en: "Tel Aviv TLV T3" },
            to: { he: "אדיס אבבה · טרמינל 2", en: "Addis Ababa ADD T2" },
            line: { he: "ET419", en: "ET419" },
            depart: "15:35",
            arrive: "19:50",
            durationMin: 255,
            fareNote: "משולם — כלול בכרטיס",
          },
        ],
      },
      {
        time: "19:50",
        title: "קונקשן באדיס אבבה — 2 שעות ו־45 דקות",
        placeIds: [],
        detail:
          "מנצלים את הזמן למעבר שער, ארוחה, שירותים ומתיחות. הקונקשן קצר מדי לתוכנית מלון עצירה, וגם קצר מספיק כדי שלא כדאי להתפזר בטרמינל.",
        warnings: [
          "הקונקשן הוא בתוך טרמינל 2 באדיס. לאתר את שער ET672 על הצג מיד עם הנחיתה, לפני האוכל.",
        ],
      },
      {
        time: "22:35",
        title: "ET672 · אדיס אבבה ← נריטה",
        placeIds: ["narita-airport"],
        detail:
          "הקטע הארוך: 15 שעות ו־5 דקות עם עצירת ביניים אחת. נוחתים מחר, יום ו׳, ב־19:40 שעון טוקיו — 6 שעות לפני שעון ישראל.",
        legs: [
          {
            mode: "plane",
            from: { he: "אדיס אבבה · טרמינל 2", en: "Addis Ababa ADD T2" },
            to: { he: "נריטה · טרמינל 1", en: "Tokyo Narita NRT T1", ja: "成田空港 第1ターミナル" },
            line: { he: "ET672", en: "ET672" },
            depart: "22:35",
            arrive: "19:40 (למחרת)",
            durationMin: 905,
            fareNote: "משולם — כלול בכרטיס",
            gotcha:
              "הטיסה נוחתת פעם אחת בדרך והנוסעים בדרך כלל נשארים במטוס. זו לא קפיצה אחת רצופה לטוקיו — להכין את הילדים מראש.",
          },
        ],
        warnings: [
          "עוד לא אושר באיזה שדה עוצרת ET672 והאם צריך לרדת מהמטוס. לבדוק בצ׳ק־אין המקוון.",
        ],
      },
    ],
  }),

  day(2, {
    date: "2026-10-02",
    dateHe: "יום ו׳, 2 באוקטובר",
    shortDate: "2.10",
    title: "נוחתים בטוקיו",
    area: "נריטה ← טבטה",
    theme: "נחיתה, נסיעה, אוכל, שינה",
    city: "tokyo",
    color: "#1d6f74",
    lat: 35.738,
    lng: 139.7606,
    highlights: ["נחיתה ב־19:40", "TOURIST PASMO ו־Skyliner", "צ׳ק־אין עצמי מאוחר", "ארוחת קונביני"],
    note: "אין סיורים הערב. הדרכונים נשלחו למארח ב־1 באוגוסט; עדיין צריך אישור כתוב שהגעה ב־21:30–23:00 מותרת, פרטי לוקבוקס ואיש קשר לילי. שימו לב: בבניין בטבטה אין מעלית — כל המזוודות עולות במדרגות.",
    stay: {
      placeId: "tabata-base",
      label: "הדירה בטבטה · Marble Tokyo Base Tabata",
      checkIn: "22:00–23:00 (צ׳ק־אין עצמי)",
      url: "https://www.airbnb.com/rooms/1348289002107449827?adults=4&check_in=2026-10-02&check_out=2026-10-11",
      note: "הכתובת המדויקת, קוד הלוקבוקס ומספר הקומה שמורים בכספת המשפחתית באפליקציה — לפתוח אותם עוד לפני ההמראה ולשמור צילום מסך אופליין.",
    },
    blocks: [
      {
        time: "19:40",
        title: "נחיתה בנריטה · טרמינל 1",
        placeIds: ["narita-airport"],
        detail:
          "להקצות בערך 90 דקות להגירה, מזוודות ומכס. אולם הנוסעים הנכנסים הוא בקומה 1 של טרמינל 1; תחנת הרכבת נמצאת קומה אחת מתחת.",
        needs: [
          "טופס ההגירה וההצהרה למכס — מומלץ למלא מראש ב־Visit Japan Web ולשמור את קודי ה־QR",
          "כתובת הלינה בטבטה — נדרשת בטופס ההגירה",
        ],
        warnings: [
          "בטרמינל 1 יש שני אולמות נכנסים (צפוני ודרומי). שניהם מובילים לאותה קומה 1 — לא להיבהל אם השילוט נראה שונה מהמצופה.",
        ],
        links: [
          {
            label: "Visit Japan Web",
            url: "https://services.digital.go.jp/en/visit-japan-web/",
            kind: "official",
          },
          {
            label: "מפת טרמינל 1",
            url: "https://www.narita-airport.jp/en/terminal1/",
            kind: "map",
          },
        ],
      },
      {
        time: "~21:15",
        title: "TOURIST PASMO ו־Skyliner — בקומה B1",
        placeIds: [],
        detail:
          "מאולם הנכנסים בקומה 1 יורדים בדרגנוע או במעלית לקומה B1, שם נמצאת תחנת Narita Airport Terminal 1. דלפקי Skyliner נמצאים בצד שמאל (דלפקי Narita Express מימין). קודם קונים ארבעה כרטיסי TOURIST PASMO ואז את ה־Skyliner המעשי הבא — לא מזמינים מראש רכבת שעיכוב בטיסה יכול לבטל.",
        legs: [
          {
            mode: "walk",
            from: { he: "אולם נכנסים · קומה 1", en: "Arrivals Lobby 1F" },
            to: {
              he: "תחנת נריטה טרמינל 1 · קומה B1",
              en: "Narita Airport Terminal 1 Station B1",
              ja: "成田空港第1ターミナル駅",
            },
            durationMin: 5,
            transferNote: "לעקוב אחרי שלט הרכבת מיד ביציאה מהמכס, ולרדת בדרגנוע קומה אחת.",
          },
        ],
        needs: [
          "כרטיס אשראי — מכונות ודלפקי Skyliner מקבלים את הכרטיסים הגדולים",
          "מזומן ין לטעינת ה־PASMO בהמשך",
        ],
        costs: [
          {
            label: "TOURIST PASMO",
            yen: 2000,
            basis: "person",
            note: "כל ה־¥2,000 הם ערך צבור — בלי דמי הנפקה ובלי פיקדון. תקף 28 יום.",
          },
          {
            label: "Skyliner לניפורי",
            yen: 2580,
            basis: "person",
            note: "מחיר משולב, כל המושבים שמורים",
          },
        ],
        warnings: [
          "היתרה שלא נוצלה ב־TOURIST PASMO אינה ניתנת להחזר — לטעון בסכומים קטנים.",
          "לשמור את פתק ההפניה שמגיע עם כל כרטיס PASMO יחד עם הכרטיס עצמו.",
        ],
        links: [
          {
            label: "TOURIST PASMO · נקודות מכירה ותנאים",
            url: "https://www.pasmo.co.jp/tourist-pasmo/",
            kind: "official",
          },
          {
            label: "Skyliner · איך קונים",
            url: "https://new-www.keisei.co.jp/keisei/tetudou/skyliner/us/skyliner/purchase.php",
            kind: "tickets",
          },
        ],
      },
      {
        time: "~21:40",
        title: "נריטה ← ניפורי ← טבטה",
        placeIds: [],
        detail:
          "ה־Skyliner רץ ישירות לניפורי בכ־40 דקות. בניפורי עולים מהרציף קומה אחת למעלה, עוברים בשער B — שער המעבר בין Keisei ל־JR — ומשם רכבת אחת בלבד לטבטה.",
        legs: [
          {
            mode: "train",
            from: {
              he: "נריטה טרמינל 1",
              en: "Narita Airport Terminal 1",
              ja: "成田空港第1ターミナル駅",
            },
            to: { he: "ניפורי", en: "Nippori", ja: "日暮里駅" },
            line: { he: "קייסיי סקיילינר", en: "Keisei Skyliner", ja: "京成スカイライナー" },
            durationMin: 40,
            fareYen: 2580,
            fareNote: "כרטיס משולב, מושב שמור",
          },
          {
            mode: "walk",
            from: { he: "רציף הסקיילינר", en: "Skyliner platform" },
            to: { he: "שערי JR בניפורי", en: "JR gates, Nippori" },
            durationMin: 5,
            exit: { he: "שער B — שער המעבר", en: "Ticket Gate B (transfer gate)" },
            transferNote:
              "עולים מהרציף לקומה העליונה ועוברים בשער B עם ה־PASMO. המעבר כולו מקורה, עם דרגנועים ומעלית.",
            gotcha:
              "רק כרטיס Skyliner רגיל מאפשר מעבר בניפורי. מי שקונה בטעות ‏Skyliner & Tokyo Subway Ticket חייב להמשיך עד אואנו.",
          },
          {
            mode: "train",
            from: { he: "ניפורי", en: "Nippori", ja: "日暮里駅" },
            to: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            line: {
              he: "JR ימנוטה או קייהין־טוהוקו",
              en: "JR Yamanote / Keihin-Tohoku",
              ja: "JR山手線・京浜東北線",
            },
            direction: { he: "לכיוון איקבוקורו", en: "toward Ikebukuro" },
            durationMin: 3,
            fareYen: 155,
            fareNote: "IC · תחנה אחת",
            exit: { he: "היציאה הצפונית", en: "North Exit", ja: "北口" },
            gotcha:
              "לצאת דווקא ביציאה הצפונית — יש בה דרגנוע. ביציאה הדרומית יש כ־100 מדרגות ורמפה תלולה, עם המזוודות זה הבדל אמיתי.",
          },
        ],
        costs: [
          { label: "Skyliner נריטה ← ניפורי", yen: 2580, basis: "person" },
          { label: "JR ניפורי ← טבטה", yen: 155, basis: "person" },
        ],
        warnings: [
          "אוטובוס ישיר או מונית רק אם שחרור המזוודות התארך, הילדים גמורים או הצ׳ק־אין העצמי מסתבך — לא כברירת מחדל.",
        ],
      },
      {
        time: "22:00–23:00",
        title: "צ׳ק־אין עצמי בדירה בטבטה",
        placeIds: ["tabata-base"],
        detail:
          "מודיעים למארח מיד אחרי הנחיתה ופועלים לפי הוראות הלוקבוקס ששמרנו אופליין.",
        needs: [
          "קוד הלוקבוקס והוראות הכניסה — צילום מסך אופליין, לא קישור",
          "מספר טלפון של איש קשר שעונה בלילה",
        ],
        warnings: [
          "בבניין אין מעלית. כל מזוודה עולה במדרגות בידיים, אחרי כ־22 שעות נסיעה — להחליט עוד בארץ אם שולחים את הכבדות בשליחות או אורזים כך שכל אחד נושא את שלו.",
          "עדיין חסר אישור כתוב מהמארח שהגעה ב־21:30–23:00 מותרת, וגם פרטי הלוקבוקס ומספר הקומה. הדרכונים נשלחו ב־1 באוגוסט.",
        ],
        booking: {
          label: "לינה 2–11.10 · מוזמן",
          url: "https://www.airbnb.com/rooms/1348289002107449827?adults=4&check_in=2026-10-02&check_out=2026-10-11",
          status: "booked",
        },
      },
      {
        time: "לילה",
        title: "קונביני לארוחת ערב ולארוחת בוקר",
        placeIds: [],
        detail:
          "קונים ארוחה פשוטה וארוחת בוקר למחר. בלי אטרקציות. סביב תחנת טבטה יש 7-Eleven, FamilyMart ו־Lawson שפתוחים 24 שעות.",
        costs: [
          {
            label: "ארוחת ערב וארוחת בוקר בקונביני",
            yen: 4000,
            basis: "family",
            note: "הערכה — כ־¥1,000 לאדם",
          },
        ],
        needs: ["מזומן ין קטן — לא כל קופה קטנה מקבלת כרטיס זר"],
      },
    ],
  }),

  day(3, {
    date: "2026-10-03",
    dateHe: "שבת, 3 באוקטובר",
    shortDate: "3.10",
    title: "אקיהברה: לשחק ולאסוף",
    area: "אקיהברה",
    theme: "אנימה, משחקי רטרו וארקייד",
    city: "tokyo",
    color: "#8b5cf6",
    lat: 35.6992,
    lng: 139.7716,
    highlights: [
      "שוק הפשפשים Oi כאופציית החלפה",
      "Radio Kaikan עם רשימת ציד",
      "Mandarake אחרי 12:00",
      "ארקייד אחד + Super Potato",
    ],
    note: "תקציב משחק ¥1,500–2,000 לילד. כלל קניות: מצלמים פריט יקר ולא קונים את הגרסה הראשונה שרואים. אזור ההולכים של Chuo-dori פועל רק בימי ראשון באוקטובר — לא מבטיחים אותו בשבת.",
    discovery: {
      label: "טיפ מאומת מהרשת",
      title: "שוק הפשפשים Oi — החלפת בוקר אפשרית",
      detail:
        "לוח 2026 מציג את 3.10, 09:00–14:30, כניסה חינם, עם כוכבית ותלות במזג האוויר. אם בוחרים בו, הוא מחליף את בוקר אקיהברה ולא נוסף אליו; בודקים שוב בלילה שלפני ובאותו בוקר.",
      href: "https://www.instagram.com/tokyocity_fleamarket/",
    },
    foodAnchors: ["coco-ichibanya-akihabara"],
    stay: tabataStay,
    blocks: [
      {
        time: "09:00",
        title: "יוצאים מטבטה",
        placeIds: ["tabata-base"],
        detail: "JR ישיר לאקיהברה, ואז הכול ברגל.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "אקיהברה", en: "Akihabara", ja: "秋葉原駅" },
            line: {
              he: "JR ימנוטה או קייהין־טוהוקו",
              en: "JR Yamanote / Keihin-Tohoku",
              ja: "JR山手線・京浜東北線",
            },
            direction: { he: "לכיוון אואנו / טוקיו", en: "toward Ueno / Tokyo" },
            durationMin: 12,
            fareYen: 199,
            fareNote: "IC · ישיר, בלי החלפות",
            exit: { he: "יציאת אלקטריק טאון", en: "Electric Town Exit", ja: "電気街口" },
          },
        ],
        costs: [
          {
            label: "נסיעות היום",
            yen: 398,
            basis: "person",
            note: "הלוך וחזור לאקיהברה; כל השאר ברגל",
          },
        ],
        needs: [
          "מעטפת מזומן לגאצ׳פון ולארקייד — ¥1,500–2,000 לכל ילד",
          "PASMO טעון · לטעון היום כ־¥5,000 לכרטיס",
        ],
      },
      {
        time: "09:30",
        title: "Radio Kaikan — רשימת ציד לכל ילד",
        placeIds: ["radio-kaikan"],
        detail: "כל ילד בוחר סדרה, דמות ומחיר מקסימלי לפני הכניסה.",
      },
      {
        time: "10:45",
        title: "Animate לסדרות עכשוויות",
        placeIds: ["animate-akihabara"],
      },
      {
        time: "12:00",
        title: "Mandarake Complex — יד שנייה",
        placeIds: ["mandarake-complex"],
        detail: "נפתח בצהריים: פיגורות ישנות ומציאות של Hunter × Hunter ופוקימון.",
      },
      {
        time: "12:45",
        title: "צהריים",
        placeIds: ["coco-ichibanya-akihabara"],
        detail: "CoCo Ichibanya או ראמן בסביבה. מייד קפה רק אם שני הילדים באמת רוצים את המופע.",
      },
      {
        time: "13:45",
        title: "ארקייד אחד + עצירת משחקים רצינית אחת",
        placeIds: ["gigo-akihabara", "hey-taito", "super-potato"],
        detail:
          "GiGO למכונות צובט ומשחקי קצב, HEY למשחקי ארקייד אמיתיים, Super Potato לרטרו ולארקייד הקטן בקומה העליונה. בוחרים — לא עושים את שלושתם ברצף.",
      },
      {
        time: "15:45",
        title: "סשן גאצ׳פון מבוקר",
        placeIds: [],
        detail: "מעטפת מזומן קבועה לכל ילד.",
      },
      {
        time: "16:00",
        title: "חנות נוספת",
        placeIds: ["akihabara-electric-town"],
        detail: "לוותר בקלות. מגינים על זמן הארקייד — קפה החתולים עבר ליום ג׳יבלי (8.10).",
        cutFirst: true,
      },
      {
        time: "ערב",
        title: "ניאון ב־Chuo-dori וארוחת ערב",
        placeIds: ["akihabara-electric-town"],
        detail: "תמונות ניאון, ואז ראמן באקיהברה או חזרה בטבטה. לא סמטת בילויים למבוגרים.",
      },
    ],
  }),

  day(4, {
    date: "2026-10-04",
    dateHe: "יום א׳, 4 באוקטובר",
    shortDate: "4.10",
    title: "teamLab, Mundo Pixar ואודאיבה",
    area: "טויוסו ← Shijō-mae ← אודאיבה",
    theme: "אמנות טובלנית, עולמות פיקסאר ומשחק אמיתי",
    city: "tokyo",
    color: "#12a5a0",
    lat: 35.6355,
    lng: 139.7815,
    highlights: ["teamLab Planets 09:30 · מוזמן", "Mundo Pixar ב־12:30", "Unicorn Gundam", "Tokyo Joypolis"],
    note: "היום היחיד שחורג מכלל שתי האטרקציות המתוזמנות — teamLab, Pixar ו־Joypolis יושבים על אותו קו Yurikamome רציף. שלושת העוגנים מוגנים.",
    rainPlan: "כמעט כל היום מקורה — היום הזה עובד גם בגשם.",
    foodAnchors: ["divercity-tokyo-plaza"],
    stay: tabataStay,
    blocks: [
      {
        time: "08:15",
        title: "יוצאים מטבטה לכניסה המוזמנת ב־09:30",
        placeIds: ["tabata-base"],
        detail:
          "JR ישיר לשימבאשי, ואז Yurikamome — להיות בשין־טויוסו בערך ב־09:15. לא באוטובוסים מתחנת טוקיו/גינזה/צוקיג׳י, יש שם עומס כבד.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "שימבאשי", en: "Shimbashi", ja: "新橋駅" },
            line: { he: "JR ימנוטה", en: "JR Yamanote", ja: "JR山手線" },
            direction: { he: "לכיוון טוקיו / שינגאווה", en: "toward Tokyo / Shinagawa" },
            durationMin: 25,
            fareYen: 209,
            fareNote: "IC",
          },
          {
            mode: "monorail",
            from: { he: "שימבאשי", en: "Shimbashi", ja: "新橋駅" },
            to: { he: "שין־טויוסו", en: "Shin-Toyosu", ja: "新豊洲駅" },
            line: { he: "יוריקאמומה", en: "Yurikamome", ja: "ゆりかもめ" },
            durationMin: 22,
            fareNote: "כלול בכרטיס היומי ¥820",
            transferNote:
              "יוצאים משערי JR ונכנסים לשערי Yurikamome — שני מפעילים נפרדים.",
            gotcha:
              "לא להעביר PASMO בשערי Yurikamome אחרי שקנינו כרטיס יומי — משתמשים רק בכרטיס היומי.",
          },
        ],
        needs: [
          "ארבעה קודי QR של teamLab — מופיעים ב־My Tickets רק אחרי חצות של 4.10. לפתוח, לטעון ולצלם מסך לפני היציאה מטבטה. המייל עצמו אינו מסמך כניסה.",
          "בגדים שאפשר להפשיל מעל הברך — יש מים ורצפות מראה",
        ],
        costs: [
          { label: "JR טבטה ← שימבאשי, הלוך וחזור", yen: 418, basis: "person" },
          {
            label: "כרטיס יומי Yurikamome",
            yen: 820,
            basis: "person",
            note: "קונים בשימבאשי לפני הנסיעה הראשונה — זול מארבע הנסיעות המתוכננות",
          },
        ],
        links: [
          {
            label: "Yurikamome · מחירים וכרטיס יומי",
            url: "https://www.yurikamome.co.jp/en/ride-guidance/fare.html",
            kind: "official",
          },
        ],
      },
      {
        time: "09:30–12:00",
        title: "teamLab Planets — מוזמן",
        placeIds: ["teamlab-planets"],
        detail:
          "חלון כניסה 09:30–10:00 — נכנסים ב־09:30, לא בסוף החלון. שולם ¥16,800 לארבעה (2 מבוגרים ¥5,600 + 2 חטיבה/תיכון ¥2,800). ללבוש בגדים שאפשר להפשיל מעל הברך — יש מים ורצפות מראה. 2–2.5 שעות, לוקרים חינם. אפשר לשנות תאריך/שעה עד 3 פעמים, לא יאוחר משעתיים לפני הכניסה.",
        costs: [
          {
            label: "teamLab Planets · שולם",
            yen: 16800,
            basis: "family",
            note: "2 מבוגרים ¥5,600 + 2 חטיבה/תיכון ¥2,800",
          },
        ],
        warnings: [
          "אפשר לשנות תאריך ושעה עד שלוש פעמים, ולא יאוחר משעתיים לפני חלון הכניסה.",
        ],
        links: [
          {
            label: "teamLab Planets TOKYO",
            url: "https://teamlabplanets.dmm.com/en",
            kind: "official",
          },
        ],
        booking: {
          label: "כניסה 09:30–10:00 · מוזמן · ¥16,800",
          url: "https://teamlabplanets.dmm.com/en",
          status: "booked",
        },
      },
      {
        time: "12:30",
        title: "Mundo Pixar ב־CREVIA BASE",
        placeIds: ["mundo-pixar"],
        detail:
          "תחנה אחת מ־teamLab ל־Shijō-mae. CREVIA BASE כשלוש דקות מהתחנה והחוויה 45–55 דקות. 4.10 הוא יום מחיר D: כ־¥20,100 למשפחה לפני עמלות. לקנות מול 12:30–13:00 — הכניסה המוזמנת ל־teamLab ב־09:30 מוציאה מהמשחק את החריץ הישן של 11:45/12:00.",
        legs: [
          {
            mode: "monorail",
            from: { he: "שין־טויוסו", en: "Shin-Toyosu", ja: "新豊洲駅" },
            to: { he: "Shijō-mae", en: "Shijo-mae", ja: "市場前駅" },
            line: { he: "יוריקאמומה", en: "Yurikamome", ja: "ゆりかもめ" },
            durationMin: 2,
            fareNote: "כלול בכרטיס היומי",
          },
          {
            mode: "walk",
            from: { he: "Shijō-mae", en: "Shijo-mae", ja: "市場前駅" },
            to: { he: "CREVIA BASE Tokyo", en: "CREVIA BASE Tokyo" },
            durationMin: 3,
          },
        ],
        costs: [
          {
            label: "Mundo Pixar · יום מחיר D",
            yen: 20100,
            basis: "family",
            note: "3 כרטיסי 16+ וכרטיס אחד 4–15, לפני עמלות",
          },
        ],
        warnings: [
          "אם החריץ המועדף נסגר — לבחור את הקרוב ביותר אחרי 12:15, כדי לשמור על הרצף teamLab ← פיקסאר ← אודאיבה.",
        ],
        links: [
          {
            label: "Mundo Pixar · התערוכה",
            url: "https://mundopixar.com/en/cities/tokyo",
            kind: "official",
          },
          {
            label: "לוח מחירים וחריצים",
            url: "https://t.pia.jp/en/pia/events/mundopixar",
            kind: "tickets",
          },
        ],
        booking: {
          label: "חובה · לקנות כניסה מתוזמנת ל־12:30–13:00",
          url: "https://t.pia.jp/en/pia/events/mundopixar",
          status: "buy-now",
        },
      },
      {
        time: "13:45",
        title: "Yurikamome לאודאיבה + צהריים",
        placeIds: ["odaiba", "divercity-tokyo-plaza"],
        detail: "מושבים קדמיים או אחוריים הופכים את הנסיעה לאטרקציה. צהריים ב־DiverCity.",
      },
      {
        time: "14:45",
        title: "Unicorn Gundam ו־Gundam Base",
        placeIds: ["unicorn-gundam", "gundam-base-tokyo"],
        detail: "מצלמים את הפסל; שיטוט מורחב ב־Gundam Base הוא מהדברים הראשונים לקצר.",
        cutFirst: true,
      },
      {
        time: "15:30–18:00",
        title: "Tokyo Joypolis — בלוק משחק אמיתי",
        placeIds: ["tokyo-joypolis"],
        detail:
          "מתקנים מקורים, עולם סוניק וארקייד. לבדוק מגבלות מתקנים; פספורט רק אם באמת נעשה מספיק מתקנים.",
      },
      {
        time: "ערב",
        title: "ארוחת ערב וחזרה בלילה",
        placeIds: ["divercity-tokyo-plaza"],
        detail: "אוכלים ליד Joypolis או ב־DiverCity ואז Yurikamome לילי חזרה.",
      },
      {
        time: "—",
        title: "קניונים נוספים, Madame Tussauds, Fuji TV ושקיעה על המים",
        placeIds: [],
        detail: "לוותר בקלות. מגינים על teamLab, על Pixar ועל בלוק המשחק ב־Joypolis.",
        cutFirst: true,
      },
    ],
  }),

  day(5, {
    date: "2026-10-05",
    dateHe: "יום ב׳, 5 באוקטובר",
    shortDate: "5.10",
    title: "PokéPark KANTO",
    area: "שינג׳וקו ← Keio-Yomiuriland",
    theme: "יום החלום של הבן",
    city: "tokyo",
    color: "#f2b134",
    lat: 35.6255,
    lng: 139.5177,
    highlights: ["רכבל Sky Shuttle", "כניסה ב־11:00", "Pokémon Forest ראשון", "בקשות באפליקציה מ־10:45"],
    note: "הכרטיסים חייבים להיות מובטחים מראש — לא נוסעים בתקווה למכירה בשער. לא קונים דרך Fiverr, מתווך או ספסר: PokéPark עלול לבטל כרטיסים שנרכשו מסחרית ולסרב כניסה ללא פיצוי.",
    stay: tabataStay,
    blocks: [
      {
        time: "לפני היציאה",
        title: "כרטיסים, אפליקציה וציוד",
        placeIds: [],
        detail:
          "להוריד ולעדכן את האפליקציה הרשמית של PokéPark, לקבץ את הכרטיסים המשפחתיים, ולארוז פאוור בנקים טעונים, מים, שכבת גשם ונעליים נוחות.",
      },
      {
        time: "08:45–09:00",
        title: "יוצאים לשינג׳וקו ולקו Keio",
        placeIds: ["tabata-base"],
        detail:
          "שתי חברות רכבת נפרדות: יוצאים משערי JR בשינג׳וקו ונכנסים לשערי Keio. זו נקודת הבלבול היחידה של היום.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "שינג׳וקו", en: "Shinjuku", ja: "新宿駅" },
            line: { he: "JR ימנוטה", en: "JR Yamanote", ja: "JR山手線" },
            direction: { he: "לכיוון איקבוקורו", en: "toward Ikebukuro" },
            durationMin: 24,
            fareYen: 231,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "שינג׳וקו · קו Keio", en: "Shinjuku (Keio Line)", ja: "京王線新宿駅" },
            to: { he: "צ׳ופו", en: "Chofu", ja: "調布駅" },
            line: { he: "קו Keio · אקספרס", en: "Keio Line Express", ja: "京王線 急行" },
            durationMin: 20,
            fareYen: 314,
            fareNote: "IC · עד Keio-yomiuri-land",
            transferNote:
              "לצאת משערי JR ולהיכנס לשערי Keio — מפעיל אחר, חיוב נפרד.",
          },
          {
            mode: "train",
            from: { he: "צ׳ופו", en: "Chofu", ja: "調布駅" },
            to: {
              he: "Keio-yomiuri-land",
              en: "Keio-yomiuriland",
              ja: "京王よみうりランド駅",
            },
            line: { he: "קו סאגמיהרה", en: "Keio Sagamihara Line", ja: "京王相模原線" },
            durationMin: 10,
            fareNote: "כלול בחיוב מ־שינג׳וקו",
          },
        ],
        costs: [
          {
            label: "רכבות היום, הלוך וחזור",
            yen: 1546,
            basis: "person",
            note: "JR + Keio + רכבל",
          },
        ],
        needs: [
          "אפליקציית PokéPark הרשמית מותקנת ומעודכנת",
          "פאוור בנקים טעונים, מים, שכבת גשם ונעליים נוחות",
        ],
        links: [
          {
            label: "Keio · מחירים משינג׳וקו",
            url: "https://www.keio.co.jp/global/routes/stations/shinjuku/",
            kind: "official",
          },
          {
            label: "PokéPark · הגעה ברכבת",
            url: "https://www.pokepark-kanto.co.jp/ppark/access/train/index",
            kind: "access",
          },
        ],
      },
      {
        time: "~10:20",
        title: "רכבל Sky Shuttle",
        placeIds: ["yomiuriland"],
        detail: "מגיעים לאזור לפני 10:30, כדי להיות בשער בזמן הכרטיס.",
        legs: [
          {
            mode: "cablecar",
            from: {
              he: "Keio-yomiuri-land",
              en: "Keio-yomiuriland",
              ja: "京王よみうりランド駅",
            },
            to: { he: "Yomiuriland", en: "Yomiuriland", ja: "よみうりランド" },
            line: { he: "Sky Shuttle", en: "Sky Shuttle gondola", ja: "スカイシャトル" },
            durationMin: 5,
            fareYen: 500,
            fareNote: "הלוך־חזור · נפרד לגמרי מכרטיס הפארק",
          },
        ],
        costs: [{ label: "רכבל Sky Shuttle", yen: 500, basis: "person", note: "הלוך־חזור" }],
        warnings: [
          "הרכבל לא תמיד פועל. אם הוא מושבת יש אוטובוס מהתחנה — לבדוק באתר לפני היציאה.",
        ],
        links: [
          {
            label: "Yomiuriland · מחירי הרכבל",
            url: "https://www.yomiuriland.com/en/charge/",
            kind: "official",
          },
        ],
      },
      {
        time: "10:45",
        title: "בקשות גישה מוגבלת באפליקציה",
        placeIds: [],
        detail: "מ־10:45 באוקטובר: Daisuki Shop, Playhouse ומופע Sedge Gym.",
      },
      {
        time: "11:00",
        title: "נכנסים ל־PokéPark בשעת הכרטיס",
        placeIds: ["pokepark-kanto"],
        detail:
          "שעות אוקטובר 11:00–19:00. קודם Pokémon Forest בזמן שכולם רעננים — יש שם שטח תלול ו־110 מדרגות. אחר כך העיירה, המופעים והחנויות.",
        booking: {
          label: "מעקב אחרי מלאי רשמי בלבד",
          url: "https://ticket-en.pokepark-kanto.co.jp/",
          status: "monitor",
        },
      },
      {
        time: "אחה״צ",
        title: "מתקנים של Yomiuriland",
        placeIds: ["yomiuriland"],
        detail:
          "רק אחרי שסיימנו את סדרי העדיפויות ב־PokéPark. Trainer's Pass הוא ברירת המחדל; Ace רק אם ההטבות מצדיקות את המחיר החי.",
      },
      {
        time: "גיבוי",
        title: "DisneySea מחליף את היום",
        placeIds: ["tokyo-disneysea"],
        detail:
          "אם לא הושגו כרטיסים רשמיים ל־PokéPark. הלוח הרשמי ל־5.10 מציג 09:00–21:00 והאלווין, אבל Tower of Terror ו־Indiana Jones מתוכננים סגורים. Sanrio Puroland הוא גיבוי משני אם המשפחה מעדיפה דמויות קוואי.",
        booking: {
          label: "גיבוי · DisneySea 5.10",
          url: "https://www.tokyodisneyresort.jp/en/tds/daily/calendar/20261005/",
          status: "fallback",
        },
      },
    ],
  }),

  day(6, {
    date: "2026-10-06",
    dateHe: "יום ג׳, 6 באוקטובר",
    shortDate: "6.10",
    title: "קוואי בהרג׳וקו, גיימינג בשיבויה",
    area: "מייג׳י ג׳ינגו ← טקשיטה ← שיבויה",
    theme: "הכותרת של הבת וסיום נינטנדו/פוקימון משותף",
    city: "tokyo",
    color: "#f05d7c",
    lat: 35.6659,
    lng: 139.7,
    highlights: [
      "Meiji Jingu קצר",
      "KAWAII MONSTER LAND",
      "קומת הפאנדום ב־PARCO",
      "Ichiran או AFURI לערב",
    ],
    note: "היום מתקדם באופן טבעי: רגוע ← חמוד ← משחקים ← ניאון. בלי חזרות לאחור.",
    foodAnchors: ["ichiran-shibuya", "afuri-harajuku"],
    stay: tabataStay,
    blocks: [
      {
        time: "08:00",
        title: "יוצאים מטבטה להרג׳וקו",
        placeIds: ["tabata-base"],
        detail:
          "JR ימנוטה ישיר, בלי החלפות. את היום כולו הולכים דרומה מהרג׳וקו לשיבויה — לא חוזרים על העקבות.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "הרג׳וקו", en: "Harajuku", ja: "原宿駅" },
            line: { he: "JR ימנוטה", en: "JR Yamanote", ja: "JR山手線" },
            direction: { he: "לכיוון איקבוקורו / שינג׳וקו", en: "toward Ikebukuro / Shinjuku" },
            durationMin: 30,
            fareYen: 253,
            fareNote: "IC",
            exit: { he: "היציאה המערבית", en: "West Exit", ja: "西口" },
          },
        ],
        costs: [
          {
            label: "נסיעות היום",
            yen: 506,
            basis: "person",
            note: "טבטה ← הרג׳וקו וחזרה משיבויה",
          },
        ],
      },
      {
        time: "08:45",
        title: "Meiji Jingu — איפוס יער וטוריאי",
        placeIds: ["meiji-jingu"],
        detail: "35–45 דקות, לא שיעור מקדשים ארוך.",
      },
      {
        time: "09:45",
        title: "רחוב טקשיטה לפני העומס",
        placeIds: ["takeshita-street", "kiddy-land"],
        detail: "קרפ הרג׳וקו, פוריקורה ומעבר מהיר ב־Kiddy Land.",
      },
      {
        time: "11:00",
        title: "KAWAII MONSTER LAND",
        placeIds: ["kawaii-monster-land"],
        detail:
          "חריץ מתוזמן של 60 דקות בשעת בוקר מאוחרת. נפתח בפברואר 2026 והוא חוויית הקוואי הכי חזקה בטיול.",
        booking: {
          label: "כניסה מתוזמנת 60 דקות",
          url: "https://contents.gendagigo.jp/kawaii-monster-land/en",
          status: "buy-now",
        },
      },
      {
        time: "13:00",
        title: "Cat Street לכיוון שיבויה + צהריים",
        placeIds: ["cat-street"],
        detail: "הולכים דרומה ואוכלים בדרך.",
      },
      {
        time: "14:00",
        title: "מעבר החצייה והצ׳יקו",
        placeIds: ["shibuya-crossing", "hachiko"],
        detail: "עצירות צילום מהירות בלבד.",
      },
      {
        time: "14:30–17:30",
        title: "Shibuya PARCO 6F — קומת הכוח",
        placeIds: [
          "shibuya-parco",
          "nintendo-tokyo",
          "pokemon-center-shibuya",
          "capcom-store-tokyo",
          "jump-shop-shibuya",
        ],
        detail:
          "Nintendo TOKYO, Pokémon Center Shibuya, CAPCOM STORE ו־JUMP SHOP ל־Hunter × Hunter ו־Demon Slayer.",
      },
      {
        time: "17:30",
        title: "Shibuya Sky",
        placeIds: ["shibuya-sky"],
        detail: "לוותר בקלות. רק אם הוזמן חריץ שקיעה ומזג האוויר בהיר — קומת הפאנדום קודמת.",
        cutFirst: true,
      },
      {
        time: "19:00",
        title: "ארוחת ערב: Ichiran או AFURI",
        placeIds: ["ichiran-shibuya", "afuri-harajuku"],
        detail:
          "Ichiran לחוויית התא (¥1,180 לקערה בסיסית, דלפק בלבד), AFURI ליוזו־שיו קליל וישיבה גמישה יותר.",
      },
    ],
  }),

  day(7, {
    date: "2026-10-07",
    dateHe: "יום ד׳, 7 באוקטובר",
    shortDate: "7.10",
    title: "קמקורה ואנושימה",
    area: "קמקורה ← האסה ← אנושימה ← פוג׳יסאווה",
    theme: "יפן אייקונית בלי עייפות מקדשים, ואז חוף, מערות וחטיפים",
    city: "kamakura",
    color: "#3c86b0",
    lat: 35.3095,
    lng: 139.517,
    highlights: ["הבודהה הגדול", "מערת האסה־דרה", "מעבר Slam Dunk", "אנושימה ושקיעה"],
    note: "מסלול חד־כיווני: חוזרים דרך פוג׳יסאווה במקום לחזור על כל קו האנודן.",
    rainPlan:
      "בגשם חזק — מזיזים את היום ומשתמשים בתוכנית המקורה של 8.10. בגשם קל אפשר להמשיך עם נעליים אטומות, אבל מוותרים על המערות ועל השקיעה בחוף אם זה לא בטוח.",
    stay: tabataStay,
    blocks: [
      {
        time: "07:30",
        title: "יוצאים לקמקורה",
        placeIds: ["tabata-base"],
        detail:
          "כל הנסיעה בתוך שערי JR — לא יוצאים ולא משלמים פעמיים. חוזרים דרך פוג׳יסאווה כדי לא לעשות את האנודן פעמיים.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "טוקיו", en: "Tokyo", ja: "東京駅" },
            line: { he: "JR קייהין־טוהוקו", en: "JR Keihin-Tohoku", ja: "JR京浜東北線" },
            direction: { he: "לכיוון טוקיו / יוקוהמה", en: "toward Tokyo / Yokohama" },
            durationMin: 18,
            fareNote: "כלול בחיוב הרציף עד קמקורה",
          },
          {
            mode: "train",
            from: { he: "טוקיו", en: "Tokyo", ja: "東京駅" },
            to: { he: "קמקורה", en: "Kamakura", ja: "鎌倉駅" },
            line: { he: "JR יוקוסוקה", en: "JR Yokosuka Line", ja: "JR横須賀線" },
            direction: { he: "לכיוון זושי / קוריהאמה", en: "toward Zushi / Kurihama" },
            durationMin: 57,
            fareYen: 953,
            fareNote: "IC · מטבטה, בלי לצאת משערים",
            gotcha:
              "לא לצאת משערי JR בטוקיו או בשימבאשי. יציאה באמצע מפצלת את החיוב ומייקרת את היום.",
          },
        ],
        costs: [
          {
            label: "רכבות JR הלוך וחזור",
            yen: 1804,
            basis: "person",
            note: "טבטה ← קמקורה, וחזרה מפוג׳יסאווה דרך טוקיו",
          },
          {
            label: "Enoden Noriorikun · כרטיס יומי",
            yen: 800,
            basis: "person",
            note: "קונים בקמקורה לפני הנסיעה הראשונה באנודן",
          },
        ],
        links: [
          {
            label: "Enoden Noriorikun",
            url: "https://www.enoden.co.jp/en/tourism/ticket/noriorikun/",
            kind: "tickets",
          },
        ],
      },
      {
        time: "בוקר",
        title: "ישר להאסה: הבודהה הגדול",
        placeIds: ["kamakura-great-buddha"],
        detail: "30–40 דקות.",
      },
      {
        time: "10:30",
        title: "האסה־דרה — מערה, נוף וגנים",
        placeIds: ["hasedera"],
        detail: "כשעה, בסדר הזה.",
      },
      {
        time: "12:00",
        title: "רוכבים על האנודן לאורך החוף",
        placeIds: ["enoden"],
        detail: "קונים Noriorikun ב־¥800 בקמקורה לפני הנסיעה הראשונה.",
      },
      {
        time: "12:30",
        title: "עצירת Slam Dunk",
        placeIds: ["kamakurakokomae-crossing"],
        detail: "עצירה קצרה ומכובדת: מאחורי המעקות, לא בכביש ולא חוסמים תושבים.",
      },
      {
        time: "13:15",
        title: "צהריים בהאסה/אנושימה",
        placeIds: [],
        detail: "שירסו רק אם כולם רוצים.",
      },
      {
        time: "14:30",
        title: "עוברים לאנושימה",
        placeIds: ["enoshima", "enoshima-nakamise", "enoshima-sea-candle", "iwaya-caves"],
        detail:
          "חטיפי נקמיסה, מדרגות נעות לפי הצורך, נוף מה־Sea Candle ומערות איוואיה אם מזג האוויר והגאות מאפשרים.",
      },
      {
        time: "ערב",
        title: "שקיעה בחוף וחזרה דרך פוג׳יסאווה",
        placeIds: [],
        detail: "יוצאים דרך פוג׳יסאווה ולא חוזרים על כל קו האנודן.",
      },
      {
        time: "—",
        title: "Tsurugaoka Hachimangu והטיפוס העמוק באנושימה",
        placeIds: [],
        detail: "לוותר בקלות. שומרים על הבודהה, על הרכבת החופית ועל בלוק אחד מהנה באנושימה.",
        cutFirst: true,
      },
    ],
  }),

  day(8, {
    date: "2026-10-08",
    dateHe: "יום ה׳, 8 באוקטובר",
    shortDate: "8.10",
    title: "ג׳יבלי, נקאנו ושינג׳וקו",
    area: "מיטאקה ← קיצ׳יג׳וג׳י ← נקאנו ← שינג׳וקו",
    theme: "קסם אנימציה, ציד אספנים ממוקד וסיום ניאון אחד",
    city: "tokyo",
    color: "#7157a8",
    lat: 35.6989,
    lng: 139.6178,
    highlights: [
      "ג׳יבלי ב־10:00",
      "פארק אינוקשירה וצהריים בקיצ׳יג׳וג׳י",
      "טירת החתולים ב־Petit Mura",
      "Nakano Broadway 60–90 דקות",
      "חתול 3D וגודזילה",
    ],
    note: "Golden Gai ו־Omoide Yokocho הוסרו: הם מכוונים למבוגרים, צפופים ולא שווים את האנרגיה המשפחתית.",
    foodAnchors: ["kichijoji", "fuunji"],
    stay: tabataStay,
    blocks: [
      {
        time: "08:35",
        title: "יוצאים לכניסה של 10:00",
        placeIds: ["tabata-base"],
        detail:
          "שתי רכבות JR ברצף, בלי לצאת משערים. ממיטאקה אפשר אוטובוס ייעודי או 15 דקות הליכה.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "שינג׳וקו", en: "Shinjuku", ja: "新宿駅" },
            line: { he: "JR ימנוטה", en: "JR Yamanote", ja: "JR山手線" },
            direction: { he: "לכיוון איקבוקורו", en: "toward Ikebukuro" },
            durationMin: 24,
            fareNote: "כלול בחיוב הרציף עד מיטאקה",
          },
          {
            mode: "train",
            from: { he: "שינג׳וקו", en: "Shinjuku", ja: "新宿駅" },
            to: { he: "מיטאקה", en: "Mitaka", ja: "三鷹駅" },
            line: { he: "JR צ׳ואו · ראפיד", en: "JR Chuo Rapid", ja: "JR中央線快速" },
            direction: { he: "לכיוון טאצ׳יקאווה", en: "toward Tachikawa" },
            durationMin: 17,
            fareYen: 396,
            fareNote: "IC · מטבטה, בלי לצאת משערים",
          },
          {
            mode: "bus",
            from: { he: "מיטאקה · יציאה דרומית", en: "Mitaka South Exit", ja: "三鷹駅南口" },
            to: { he: "מוזיאון ג׳יבלי", en: "Ghibli Museum", ja: "三鷹の森ジブリ美術館" },
            line: { he: "אוטובוס הקהילה למוזיאון", en: "Museum community bus" },
            durationMin: 6,
            fareYen: 230,
            fareNote: "למבוגר · או 15 דקות הליכה לאורך התעלה",
          },
        ],
        costs: [
          { label: "רכבות היום", yen: 1057, basis: "person", note: "כולל נקאנו ושינג׳וקו בהמשך" },
          { label: "אוטובוס המוזיאון", yen: 230, basis: "person" },
        ],
        needs: [
          "כרטיסי המוזיאון על שם הרוכש — ג׳יבלי בודקים תעודה מזהה בכניסה",
        ],
        links: [
          {
            label: "מוזיאון ג׳יבלי · הגעה ושעות",
            url: "https://www.ghibli-museum.jp/en/hours-and-directions/",
            kind: "access",
          },
        ],
      },
      {
        time: "10:00–12:30",
        title: "מוזיאון ג׳יבלי",
        placeIds: ["ghibli-museum"],
        detail: "כניסה בהזמנה מראש בלבד. 2–2.5 שעות לסרט הקצר הבלעדי, לבניין, לגג ולחנות.",
        booking: {
          label: "מכירת אוקטובר · 10.9 ב־10:00 שעון יפן",
          url: "https://www.ghibli-museum.jp/en/tickets/",
          status: "on-sale-soon",
        },
      },
      {
        time: "12:30",
        title: "פארק אינוקשירה וצהריים מוקדמים",
        placeIds: ["inokashira-park", "kichijoji"],
        detail: "הולכים דרך הפארק לכיוון קיצ׳יג׳וג׳י ואוכלים משהו פשוט.",
      },
      {
        time: "13:00–14:00",
        title: "Kichijōji Petit Mura — טירת החתולים",
        placeIds: ["petit-mura"],
        detail:
          "כפר אגדות קטן חמש דקות מתחנת קיצ׳יג׳וג׳י. נכנסים ל־Cat Cafe Temari no Oshiro — טירה דו־קומתית עם כ־20 חתולים, בלי הגבלת זמן. גיל 10+, כ־¥1,200 + מס לאדם ביום חול.",
        booking: {
          label: "להזמין ביקור מראש",
          url: "https://temarinooshiro.com/",
          status: "buy-now",
        },
      },
      {
        time: "14:15–16:30",
        title: "ציד אוצרות ב־Nakano Broadway",
        placeIds: ["nakano-broadway"],
        detail:
          "תחום ל־60–90 דקות — הרבה חנויות חוזרות על אקיהברה. שלוש מטרות לכל ילד ותקרת הוצאה; משווים בין סניפי Mandarake לפני קנייה.",
      },
      {
        time: "17:00–20:00",
        title: "שינג׳וקו: חתול 3D, גודזילה וארוחת ערב",
        placeIds: ["shinjuku-3d-cat", "godzilla-head", "fuunji"],
        detail: "חמש דקות ב־JR מנקאנו. החתול חינם; אחר כך תמונה עם גודזילה וארוחת ערב.",
      },
      {
        time: "—",
        title: "namco TOKYO, ואז חנויות נוספות בנקאנו",
        placeIds: ["namco-tokyo"],
        detail: "לוותר בקלות. מגינים על ג׳יבלי, על טירת החתולים ועל ארוחת צהריים לא לחוצה.",
        cutFirst: true,
      },
    ],
  }),

  day(9, {
    date: "2026-10-09",
    dateHe: "יום ו׳, 9 באוקטובר",
    shortDate: "9.10",
    title: "טודורוקי, טוטורו ופסטיבל קארי",
    area: "טודורוקי ← סטגאיה־דאיטה ← שימוקיטזאווה",
    theme: "שני איפוסים ירוקים, מתוקים בצורת טוטורו ופסטיבל אוכל שכונתי אמיתי",
    city: "tokyo",
    color: "#4f8f5c",
    lat: 35.6323,
    lng: 139.6605,
    highlights: [
      "ערוץ טודורוקי בבוקר",
      "פחזניות טוטורו מוזמנות מראש",
      "פיקניק קצר ב־Hanegi",
      "מסלול שלוש מנות קארי",
    ],
    note: "החלטת קפה חיות: העצירה המתוכננת היא קפה החתולים ב־Petit Mura (8.10). סייד־קווסטים אקזוטיים בקיוטו/אוסקה (לוטרות, חיות קטנות, נחשים) נוספו במודע כאופציה בלבד — מחקר הרווחה עדיין מסמן אותם, אז נכנסים רק עם זמן פנוי אמיתי ועוזבים אם החיות בלחץ.",
    rainPlan:
      "בגשם כבד: מדלגים על טודורוקי ועל Hanegi, מתחילים באיסוף המוזמן ב־Shiro-Hige וממשיכים למסעדות המקורות של הפסטיבל, ל־Mikan, ל־Reload ולבתי קפה.",
    foodAnchors: ["setsugekka", "shiro-hige-cream-puff", "shimokitazawa-curry-festival"],
    stay: tabataStay,
    blocks: [
      {
        time: "08:00",
        title: "יוצאים דרך אואימאצ׳י",
        placeIds: ["tabata-base"],
        detail:
          "היום הזה חוצה שלוש חברות רכבת — JR, Tokyu ו־Keio/Odakyu. כל מעבר בין מפעילים מחויב בנפרד, וזה מה שמייקר את היום.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "אואימאצ׳י", en: "Oimachi", ja: "大井町駅" },
            line: { he: "JR קייהין־טוהוקו", en: "JR Keihin-Tohoku", ja: "JR京浜東北線" },
            direction: { he: "לכיוון יוקוהמה", en: "toward Yokohama" },
            durationMin: 32,
            fareYen: 340,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "אואימאצ׳י", en: "Oimachi", ja: "大井町駅" },
            to: { he: "טודורוקי", en: "Todoroki", ja: "等々力駅" },
            line: { he: "Tokyu Oimachi", en: "Tokyu Oimachi Line", ja: "東急大井町線" },
            durationMin: 22,
            fareYen: 220,
            fareNote: "IC · מפעיל נפרד",
            transferNote: "יוצאים משערי JR ונכנסים לשערי Tokyu.",
          },
        ],
        costs: [
          {
            label: "נסיעות היום",
            yen: 1404,
            basis: "person",
            note: "JR + Tokyu + Keio/Odakyu, כולל החזרה משימוקיטזאווה",
          },
        ],
        warnings: [
          "שביל ערוץ טודורוקי צר, לא אחיד ולעיתים ללא מעקה — לא בגשם כבד ולא עד החושך.",
        ],
      },
      {
        time: "08:45–10:45",
        title: "ערוץ טודורוקי והגן היפני",
        placeIds: ["todoroki-ravine", "todoroki-fudoson", "setsugekka"],
        detail:
          "נכנסים מתחת לגשר הגולף, כשלוש דקות מהתחנה, והולכים לאורך הנחל עד Todoroki Fudoson. 60–90 דקות. השביל צר, לא אחיד ולעיתים ללא מעקה — לא בגשם כבד ולא עד החושך. אם Setsugekka פתוח: חולקים תה וקוזו־מוצ׳י.",
      },
      {
        time: "10:45–11:30",
        title: "ממשיכים דרך ג׳יוגאוקה ושיבויה",
        placeIds: [],
        detail: "כ־45 דקות כולל מעברים והליכה לשימוקיטזאווה/סטגאיה־דאיטה.",
      },
      {
        time: "11:30",
        title: "איסוף פחזניות טוטורו",
        placeIds: ["shiro-hige-cream-puff"],
        detail: "קופסה מוזמנת מראש מהסניף בדאיטה, שנפתח ב־10:30.",
        booking: {
          label: "להזמין איסוף כשחלון אוקטובר ייפתח",
          url: "https://shiro-hige.net/",
          status: "on-sale-soon",
        },
      },
      {
        time: "12:15",
        title: "פיקניק קצר ב־Hanegi Park",
        placeIds: ["hanegi-park"],
        detail:
          "לוותר בקלות. חלק מהפארק בשיפוצים ב־2026 — משתמשים במדשאה או באזור מנוחה שפתוח ולא רודפים אחרי מתקן מסוים.",
        cutFirst: true,
      },
      {
        time: "13:30–19:00",
        title: "פסטיבל הקארי של שימוקיטזאווה",
        placeIds: [
          "shimokitazawa",
          "shimokitazawa-curry-festival",
          "mikan-shimokita",
          "reload-shimokitazawa",
        ],
        detail:
          "9.10 הוא היום השני של הפסטיבל (8–25.10). שלוש מנות מיני כמשחק ניקוד משפחתי, ובין הביסים כל ילד בוחר עצירה אחת: וינטג׳, מוזיקה/ספרים, Mikan או Reload.",
        booking: {
          label: "המפה הרשמית של הפסטיבל",
          url: "https://shimokitazawa-curryfes.com/",
          status: "monitor",
        },
      },
      {
        time: "ערב",
        title: "ראמן רק אם עוד רעבים, וחזרה דרך שינג׳וקו",
        placeIds: [],
        detail: "ראמן הוא ארוחת ערב, לא עוד משימה מתוכננת.",
      },
    ],
  }),

  day(10, {
    date: "2026-10-10",
    dateHe: "שבת, 10 באוקטובר",
    shortDate: "10.10",
    title: "חגיגה משפחתית ב־Tokyo Dome City",
    area: "סווידובאשי · Tokyo Dome City",
    theme: "מגרש משחקים חגיגי אחד, בלי רשימת מטלות חוצה עיר",
    city: "tokyo",
    color: "#c98a2e",
    lat: 35.7056,
    lng: 139.7519,
    highlights: ["בוקר איטי ומתנה", "Thunder Dolphin", "גלגל ענק עם קריוקי", "מזכרת אחת מ־JUMP SHOP"],
    note: "לא מוסיפים את התצוגה המקדימה של Tokyo Yosakoi. מחר מתחיל בהעברה מוקדמת לקיוטו ובשני אירועים בשעה קבועה — אף פעם לא בוחרים באפשרות של 21:00 ומעלה.",
    stay: tabataStay,
    blocks: [
      {
        time: "בוקר",
        title: "לישון עד מאוחר ובראנץ׳ אמיתי",
        placeIds: ["tabata-base"],
        detail: "נותנים את מתנת החגיגה באופן פרטי ונותנים לבן לבחור את הפעילות הראשונה.",
      },
      {
        time: "13:00",
        title: "Tokyo Dome City Attractions",
        placeIds: ["tokyo-dome-city", "laqua"],
        detail: "קונים מתקנים בודדים או פספורט — רק אחרי בדיקת הפעלה חיה.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "אקיהברה", en: "Akihabara", ja: "秋葉原駅" },
            line: { he: "JR ימנוטה", en: "JR Yamanote", ja: "JR山手線" },
            direction: { he: "לכיוון אואנו", en: "toward Ueno" },
            durationMin: 12,
            fareNote: "כלול בחיוב הרציף עד סואידובאשי",
          },
          {
            mode: "train",
            from: { he: "אקיהברה", en: "Akihabara", ja: "秋葉原駅" },
            to: { he: "סואידובאשי", en: "Suidobashi", ja: "水道橋駅" },
            line: { he: "JR צ׳ואו־סובו · מקומית", en: "JR Chuo-Sobu Local", ja: "JR中央・総武線各駅停車" },
            direction: { he: "לכיוון מיטאקה", en: "toward Mitaka" },
            durationMin: 6,
            fareYen: 209,
            fareNote: "IC · מטבטה",
            transferNote: "ההחלפה באקיהברה היא בתוך השערים — לא יוצאים.",
          },
        ],
        costs: [
          {
            label: "נסיעות היום",
            yen: 418,
            basis: "person",
            note: "בלי הקרנת Night & Light; איתה כ־¥596",
          },
        ],
        booking: {
          label: "בדיקת הפעלה ותחזוקה חיה",
          url: "https://www.at-raku.com/",
          status: "monitor",
        },
      },
      {
        time: "13:30",
        title: "Thunder Dolphin",
        placeIds: ["thunder-dolphin"],
        detail: "למי שרוצה רכבת הרים גדולה ועומד בכללים.",
      },
      {
        time: "15:00",
        title: "גלגל הענק Big-O",
        placeIds: ["big-o-ferris-wheel"],
        detail: "לבקש תא קריוקי אם זמין.",
      },
      {
        time: "16:00",
        title: "JUMP SHOP — מזכרת אחת מתוכננת",
        placeIds: ["jump-shop-tokyo-dome"],
      },
      {
        time: "17:15",
        title: "המשך אופציונלי להקרנת Night & Light",
        placeIds: ["tokyo-metropolitan-government-building"],
        detail:
          "רק אם הלוח הרשמי ל־10.10 מציג את Pokémon Card Game: TOKYO LUMINOUS NIGHT. Oedo מ־Kasuga ל־Tochomae, מגיעים 15–20 דקות מראש לכיכר האזרחים ומזמינים ארוחה במערב שינג׳וקו. ההקרנה חיצונית ותלוית מזג אוויר, והשעות באינסטגרם אינן לוח אוקטובר.",
        booking: {
          label: "לבדוק את סדר היצירות הרשמי",
          url: "https://tokyoprojectionmappingproject.jp/en/",
          status: "monitor",
        },
      },
      {
        time: "19:00",
        title: "ארוחת חגיגה",
        placeIds: [],
        detail:
          "אם ההקרנה לא מאושרת: מזמינים מסעדה ליד Tokyo Dome, בקגורזאקה או ליד הבסיס ושומרים על ערב באזור אחד. מבקשים מראש מסר על הקינוח.",
      },
      {
        time: "—",
        title: "באולינג/ארקייד וקניות נוספות",
        placeIds: [],
        detail: "לוותר בקלות אם ההקרנה מאושרת.",
        cutFirst: true,
      },
    ],
  }),

  day(11, {
    date: "2026-10-11",
    dateHe: "יום א׳, 11 באוקטובר",
    shortDate: "11.10",
    title: "קיוטו: מיזואקאי ותהלוכת אוואטה",
    area: "טוקיו ← קיוטו ← מיאגאווה־צ׳ו ← אוואטה",
    theme: "רסיטל גייקו ואחריו פנסים, מוזיקה ומסורת חיה",
    city: "kyoto",
    color: "#a4548c",
    lat: 35.0026,
    lng: 135.7745,
    highlights: ["נוזומי מוקדם", "Mizuekai ב־13:00", "מנוחה וארוחה מאוחרת", "תהלוכת אוואטה מ־17:00"],
    note: "לא מוסיפים מקדש או קנייה — היום נשען על שני אירועים בשעה קבועה.",
    foodAnchors: ["gion"],
    stay: fushimiStay,
    blocks: [
      {
        time: "מוקדם",
        title: "צ׳ק־אאוט ונוזומי שמור לקיוטו",
        placeIds: ["tabata-base", "tokyo-station"],
        detail:
          "צ׳ק־אאוט עד 11:00, JR ישיר מטבטה לתחנת טוקיו, ואז שילוט שינקנסן — לא יוצאים מהתחנה. קונים אקיבן לפני העלייה לרכבת.",
        legs: [
          {
            mode: "train",
            from: { he: "טבטה", en: "Tabata", ja: "田端駅" },
            to: { he: "תחנת טוקיו", en: "Tokyo Station", ja: "東京駅" },
            line: { he: "JR קייהין־טוהוקו", en: "JR Keihin-Tohoku", ja: "JR京浜東北線" },
            direction: { he: "לכיוון טוקיו / יוקוהמה", en: "toward Tokyo / Yokohama" },
            durationMin: 18,
            fareYen: 209,
            fareNote: "IC · הקטע המקומי בלבד",
          },
          {
            mode: "train",
            from: { he: "תחנת טוקיו", en: "Tokyo Station", ja: "東京駅" },
            to: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            line: { he: "שינקנסן נוזומי", en: "Nozomi Shinkansen", ja: "新幹線のぞみ" },
            direction: { he: "לכיוון שין־אוסקה / הקאטה", en: "toward Shin-Osaka / Hakata" },
            durationMin: 140,
            fareYen: 14170,
            fareNote: "מושב שמור · כרטיס נפרד, לא PASMO",
            gotcha:
              "מקום למזוודה גדולה מוזמן מראש ובחינם — בלי הזמנה זה קנס וטרטור. להזמין יחד עם המושבים.",
          },
        ],
        costs: [
          { label: "JR טבטה ← תחנת טוקיו", yen: 209, basis: "person" },
          {
            label: "נוזומי טוקיו ← קיוטו · מושב שמור",
            yen: 14170,
            basis: "person",
            note: "הערכה — לאמת בהזמנה בפועל",
          },
        ],
        needs: [
          "הזמנת הנוזומי עם מספיק מרווח לפני מיזואקאי ב־13:00",
          "מקום למזוודות גדולות מוזמן מראש, אם בכלל נוסעים איתן",
        ],
        warnings: [
          "הדירה בפושימי לא נפתחת לפני 15:00 ואין הבטחה להנחת תיקים — לתכנן אחסון בתחנת קיוטו לפני שיוצאים לרסיטל.",
        ],
      },
      {
        time: "בדרך",
        title: "פתרון המזוודות",
        placeIds: ["kyoto-station"],
        detail:
          "משגרים את המזוודות הגדולות למלון באוסקה אם שני הנכסים מאשרים, ונוסעים עם תיקי שני לילות. הדירה בפושימי לא נפתחת לפני 15:00 ואין הבטחה להנחת תיקים מוקדמת — מאחסנים בתחנת קיוטו.",
      },
      {
        time: "13:00",
        title: "מיזואקאי במיאגאווה־צ׳ו",
        placeIds: ["mizuekai", "gion"],
        detail:
          "לא בוחרים את המופע של 16:00 — הוא מתנגש עם אוואטה. הריצה הרשמית ב־2026 היא 8–11.10, ¥10,000 קומה ראשונה או ¥8,000 קומה שנייה, כניסה מגיל 10. זו כותרת אחר הצהריים; בלי רשימת אתרים סביבה.",
        booking: {
          label: "שיטת המכירה הרשמית טרם פורסמה",
          url: "https://www.miyagawacho.jp/mizuekai/",
          status: "monitor",
        },
      },
      {
        time: "14:30–16:30",
        title: "ארוחה מאוחרת ומנוחה ליד המסלול",
        placeIds: ["gion"],
        detail: "יושבים, שותים ונחים ליד הרסיטל/אוואטה. הדירה אינה תחנת מנוחה מעשית לפני התהלוכה.",
      },
      {
        time: "15:30–16:30",
        title: "סייד־קווסט: LOUTRE — קפה הלוטרות",
        placeIds: ["loutre"],
        detail:
          "רק אם נשאר זמן פנוי אמיתי לפני אוואטה. כניסה ללא הזמנה (13:00–19:00), כ־10 דקות הליכה ממיאגאווה־צ׳ו. נוסף במודע למרות מחקר הרווחה על קפה חיות אקזוטיות — מוותרים ראשון, ועוזבים אם החיות בלחץ.",
        cutFirst: true,
      },
      {
        time: "—",
        title: "סייד־קווסט: ציד הסוקאג׳אן — חלון 1 מתוך 3",
        placeIds: ["tow-sukajan", "bsc-gallery"],
        detail:
          "ז׳קט המזכרת לבר המצווה. tow הכי קרוב — קומה 2 ליד גשר שיג׳ו, 300+ ז׳קטים, כ־5 דקות ממיאגאווה־צ׳ו — אבל לא מפרסם שעות פתיחה בשום מקום, אז מאמתים באינסטגרם @tow_kyoto לפני שעולים. B.S.C Gallery בטרמאצ׳י (פינת רוקאקו) הוא המבחר הגדול: 1,000+ ז׳קטים, 11:00–21:00 כל השנה, פטור ממע״מ עם דרכון, כ־10 דקות מהרסיטל ובאותו רחוב כמו קפה הלוטרות. המטרה ¥20,000–30,000, ומידה S/M של מבוגרים בכוונה גדולה. 30–40 דקות מקסימום.",
        cutFirst: true,
      },
      {
        time: "מ־17:00",
        title: "תהלוכת הלילה של מקדש אוואטה",
        placeIds: ["awata-shrine"],
        detail:
          "מגיעים לאזור לפני ההתחלה במקום לרדוף אחרי כל המסלול. נשארים לאווירת הפתיחה ולקטע סביר, ועוזבים סביב 19:30 לפני העומס הכי כבד.",
        booking: {
          label: "לוח האירועים הרשמי",
          url: "https://awatajinja.jp/event/",
          status: "monitor",
        },
      },
      {
        time: "~20:00",
        title: "אוספים את התיקים ומגיעים לדירה בפושימי",
        placeIds: ["kyoto-station", "fushimi-inari-apartment"],
        detail: "צ׳ק־אין עצמי; נועלים את הדלת ידנית בכל יציאה.",
        booking: {
          label: "לינה 11–13.10 · מוזמן",
          url: "https://www.miyagawacho.jp/mizuekai/",
          status: "booked",
        },
      },
      {
        time: "—",
        title: "כל מקדש או קנייה נוספת",
        placeIds: [],
        detail: "לוותר בקלות. אם מיזואקאי לא מסתדר — שומרים על ההגעה המוקדמת, ארוחה ארוכה ואוואטה כעוגן.",
        cutFirst: true,
      },
    ],
  }),

  day(12, {
    date: "2026-10-12",
    dateHe: "יום ב׳, 12 באוקטובר",
    shortDate: "12.10",
    title: "UZUMASA ו־DRUM TAO HIBIKI",
    area: "פושימי ← אוזומאסה ← Kyoto Avanti",
    theme: "משחק סמוראים ביום, טאיקו מתפוצץ בלילה",
    city: "kyoto",
    color: "#d64d45",
    lat: 35.0018,
    lng: 135.7345,
    highlights: ["UZUMASA מ־10:00", "טקס תה ב־13:30", "פסטיבל היוקאי", "HIBIKI ב־19:00"],
    note: "12.10 הוא יום ספורט — חג רשמי, אז UZUMASA מפעיל תוכנית מלאה ויהיה עמוס; נכנסים עם הפתיחה. הכפר סגור ב־13.10, אז שום דבר מהיום הזה לא נדחה. מגינים על בלוק 10:00–15:45, על טקס התה ועל המנוחה לפני HIBIKI.",
    stay: fushimiStay,
    blocks: [
      {
        time: "10:00–15:45",
        title: "UZUMASA Kyoto Village — מוזמן",
        placeIds: ["uzumasa-kyoto-village"],
        detail:
          "שולם ¥29,600: כניסה ×4 ב־¥3,800 (¥15,200) עם חוברת אירוע (יפנית ואנגלית) וגלויה אקראית מתוך שלושה עיצובים לכל אחד, טקס תה ×4 (¥10,800), Ninja Escape Room ×4 (¥2,400) ו־3D Maze the Ninja Fort ×2 (¥1,200). נכנסים עם הפתיחה ומתחילים ברחובות הסטים מעידן אדו. 10:30 Yokai ☆Dance Live (רק בחגים ובסופ״ש), ~11:00 חדר בריחה נינג׳ה — כל הארבעה מכוסים, ~11:45 מבוך תלת־ממד 3D Maze — רק שניים מכוסים, השניים האחרים משלימים ¥600 לאדם במקום. 12:15 ארוחת צהריים בתוך הפארק, מסיימים עד 13:15. 14:30 Yokai ☆Dance Live שני, 15:30 Kaikai Greeting, יוצאים ב־15:45. כל ארבעת הכרטיסים הונפקו כ״13 ומעלה״ — זה מעל תעריף הילד, אז השער מקבל אותם גם עבור בן ה־12. הכול תקף רק ב־12.10.",
        legs: [
          {
            mode: "train",
            from: { he: "JR אינארי", en: "JR Inari", ja: "JR稲荷駅" },
            to: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            line: { he: "JR נארה", en: "JR Nara Line", ja: "JR奈良線" },
            durationMin: 5,
            fareYen: 150,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            to: { he: "Uzumasa-Koryuji", en: "Uzumasa-Koryuji", ja: "太秦広隆寺駅" },
            line: { he: "JR סאגאנו ואז Randen", en: "JR Sagano Line then Randen", ja: "JR嵯峨野線・嵐電" },
            direction: { he: "החלפה ב־Uzumasa", en: "change at Uzumasa" },
            durationMin: 35,
            fareYen: 460,
            fareNote: "IC · לפחות החלפה אחת",
            gotcha:
              "יש שתי תחנות שונות עם השם Uzumasa — אחת של JR ואחת של Randen. לוודא באפליקציה לאיזו מהן המסלול מכוון.",
          },
        ],
        costs: [
          {
            label: "UZUMASA Kyoto Village · שולם",
            yen: 29600,
            basis: "family",
            note: "כניסה ×4, טקס תה ×4, חדר בריחה ×4, מבוך ×2",
          },
          { label: "נסיעות היום", yen: 1220, basis: "person", note: "כולל החזרה ו־Kyoto Avanti" },
        ],
        needs: [
          "סמארטפון טעון עם חבילת גלישה פעילה — הכניסה לכפר היא דרך המסך בלבד, בלי הדפסה",
        ],
        warnings: [
          "המבוך התלת־ממדי מכוסה לשניים בלבד. השניים האחרים משלימים ¥600 לאדם במקום.",
          "כל ההזמנה תקפה רק ב־12.10 — אין העברה ליום אחר.",
        ],
        booking: {
          label: "שולם — ¥29,600",
          url: "https://ticket.eigamura.com/ticket/purchased",
          status: "booked",
        },
      },
      {
        time: "13:30",
        title: "טקס תה — cultural experience Sado × 4",
        placeIds: ["uzumasa-kyoto-village"],
        detail:
          "עוגן קבוע של היום ופריט היקר ביותר בהזמנה — ¥2,700 לאדם, ¥10,800 בסך הכול. מגיעים מוקדם; חריץ שמפספסים לא מוחזר. הכניסה לכפר היא דרך הסמארטפון בלבד: מציגים את הכרטיס מדף הכרטיסים ומראים את המסך בקבלה, בלי הדפסה, ומוודאים שחבילת הגלישה פעילה לפני השער.",
      },
      {
        time: "16:15–18:00",
        title: "חוזרים לדירה, מנוחה וארוחת ערב מוקדמת",
        placeIds: ["fushimi-inari-apartment", "kyoto-station"],
        detail: "אוכלים מוקדם ליד תחנת קיוטו ומגיעים ל־Kyoto Avanti לפני הדלתות ב־18:15.",
      },
      {
        time: "19:00",
        title: "DRUM TAO HIBIKI",
        placeIds: ["kyoto-avanti"],
        detail:
          "מופע של כ־40 דקות שעובד היטב גם אחרי יום אטרקציה מלא. שולם ¥47,108 (הזמנה 00003314): ארבעה מושבי Standard with snacks בשורה G, מקומות 12–15, ¥11,000 כל אחד, בתוספת ¥2,800 דמי שירות ו־¥308 דמי הנפקה. כרטיסים אלקטרוניים — קוד נפרד לכל מושב, מהקישור שבכספת. דלתות 18:15, כדאי להקדים כי המעליות לקומה 9 נתקעות. להביא דרכון. אין ביטול או החזר.",
        booking: {
          label: "חלון מכירה נפתח חודשיים לפני",
          url: "https://drum-tao-kyoto.com/en/ticket/",
          status: "on-sale-soon",
        },
      },
      {
        time: "17:30 / 19:30",
        title: "מצעדי היוקאי — מוותרים במכוון",
        placeIds: [],
        detail:
          "KAIKAI YOKAI Parade ב־17:30 ו־Uzumasa Hyakki Yakō ב־19:30 רצים בחגים, אבל שניהם מתנגשים עם HIBIKI. לא מנסים לדחוס אחד מהם. אזור המתקנים נסגר ב־18:00 עם כניסה אחרונה ב־17:30, מה שלא משפיע על תוכנית היום.",
      },
      {
        time: "בוטל",
        title: "Mibu Kyogen — כבר לא אפשרי",
        placeIds: ["mibu-dera"],
        detail:
          "ההחלפה הישנה דרשה לעזוב את אוזומאסה סביב 13:15, וזה מתנגש עם טקס התה המוזמן ב־13:30. Mibu Kyogen יורד מהמסלול.",
        cutFirst: true,
      },
      {
        time: "—",
        title: "השלמת שני מקומות ב־3D Maze ומתקנים נוספים בתשלום",
        placeIds: [],
        detail: "מוותרים בקלות. מגינים על טקס התה, על המנוחה ועל HIBIKI.",
        cutFirst: true,
      },
    ],
  }),

  day(13, {
    date: "2026-10-13",
    dateHe: "יום ג׳, 13 באוקטובר",
    shortDate: "13.10",
    title: "פושימי אינארי, ואז ניאון באוסקה",
    area: "פושימי ← נמבה ← ניפונבאשי",
    theme: "תמונה אחת אייקונית מקיוטו, ואז ערב אוכל ואנימה קומפקטי באוסקה",
    city: "osaka",
    color: "#e07b39",
    lat: 34.8,
    lng: 135.63,
    highlights: [
      "שערי הטוריאי התחתונים מוקדם",
      "חריטת מקלות אכילה ב־09:30",
      "רכבת רגילה לאוסקה — בלי שינקנסן",
      "Den Den Town מקוצר",
    ],
    note: "טירת אוסקה הוסרה מיום ההגעה — היא הוסיפה נסיעה חוצת עיר וזמן מוזיאון לפני השכונה הכי טובה של אוסקה.",
    discovery: {
      label: "עדכון תחבורה מאומת",
      title: "לא לוקחים שינקנסן כברירת מחדל",
      detail:
        "קיוטו→אוסקה ב־JR Special Rapid הוא כ־28–29 דקות ו־¥580; שינקנסן לקיוטו→שין־אוסקה הוא כ־14–15 דקות ו־¥1,450. לנמבה ההחלפות מוחקות כמעט את כל יתרון הזמן, והפער למשפחה הוא ¥3,480.",
      href: "https://transit.yahoo.co.jp/search/result?all=1&from=%E4%BA%AC%E9%83%BD&stype=&to=%E6%96%B0%E5%A4%A7%E9%98%AA",
    },
    foodAnchors: ["dotonbori"],
    stay: osakaStay,
    blocks: [
      {
        time: "מוקדם",
        title: "הליכה למקדש עם התיקים נעולים בדירה",
        placeIds: ["fushimi-inari-apartment", "fushimi-inari"],
        detail:
          "כשלוש דקות הליכה. 60–90 דקות סביב מסלול הטוריאי האדומים התחתון, ומסתובבים חזרה לפני הטיפוס להר. זו התמונה הקלאסית האחת של קיוטו במסלול, לא יום הליכות.",
      },
      {
        time: "09:30",
        title: "סדנת מקלות אכילה Yūzen Fushimi",
        placeIds: ["yuzen-fushimi"],
        detail:
          "דקה מ־JR Inari. זוגות מתאימים נחרטים במקום בכחמש דקות — מכינים מראש איות מדויק באותיות לטיניות או בקטקנה. החנות מפרסמת 09:30–17:30 עם שינויים עונתיים; לאמת פתיחה ביום ג׳ בטלפון בשבוע האחרון. לא מבטיחים את מחיר הפתיחה ¥1,100 מהאינסטגרם.",
        booking: {
          label: "לאמת פתיחה ביום ג׳ ולהכין ארבעה איותים",
          url: "https://page.line.me/xat.0000115429.mcu",
          status: "monitor",
        },
      },
      {
        time: "10:30–11:00",
        title: "אריזה אחרונה וצ׳ק־אאוט",
        placeIds: ["fushimi-inari-apartment"],
        detail: "משלימים את שלבי הצ׳ק־אאוט של המארח עד 11:00 — לא מסכנים את הדדליין הזה בשום מקרה.",
      },
      {
        time: "11:30",
        title: "פושימי אינארי ← נמבה ברכבת רגילה",
        placeIds: ["namba-base"],
        detail:
          "ברירת המחדל היא JR/Metro או Keihan, לא שינקנסן. אם המלון הסופי הופך את Keihan מפושימי למהיר יותר — בוחרים בו. מורידים מזוודות לפני Den Den Town ואוספים את הגדולות אם שוגרו.",
        legs: [
          {
            mode: "train",
            from: { he: "JR אינארי", en: "JR Inari", ja: "JR稲荷駅" },
            to: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            line: { he: "JR נארה", en: "JR Nara Line", ja: "JR奈良線" },
            direction: { he: "לכיוון קיוטו", en: "toward Kyoto" },
            durationMin: 5,
            fareYen: 150,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            to: { he: "אוסקה / אומדה", en: "Osaka / Umeda", ja: "大阪駅" },
            line: { he: "JR קיוטו · Special Rapid", en: "JR Kyoto Line Special Rapid", ja: "JR京都線 新快速" },
            direction: { he: "לכיוון אוסקה / הימג׳י", en: "toward Osaka / Himeji" },
            durationMin: 29,
            fareYen: 580,
            fareNote: "IC · בלי תוספת אקספרס",
            gotcha:
              "לא לקנות שינקנסן מתוך הרגל. השינקנסן חוסך 14 דקות ועולה ¥870 יותר לאדם — ¥3,480 למשפחה — ומגיע לשין־אוסקה, שרחוקה יותר מנמבה.",
          },
          {
            mode: "subway",
            from: { he: "אומדה", en: "Umeda", ja: "梅田駅" },
            to: { he: "נמבה", en: "Namba", ja: "難波駅" },
            line: { he: "מידוסוג׳י", en: "Osaka Metro Midosuji Line", ja: "大阪メトロ御堂筋線" },
            direction: { he: "לכיוון נקמוזו", en: "toward Nakamozu" },
            durationMin: 9,
            fareYen: 240,
            fareNote: "IC · מפעיל נפרד",
            transferNote: "יוצאים משערי JR באוסקה ונכנסים לשערי Osaka Metro באומדה.",
          },
        ],
        costs: [
          {
            label: "פושימי ← נמבה ברכבת רגילה",
            yen: 970,
            basis: "person",
            note: "JR + Osaka Metro. השינקנסן היה מוסיף ¥870 לאדם ללא רווח דלת־לדלת",
          },
        ],
        links: [
          {
            label: "JR West · מסלולים ולוחות זמנים",
            url: "https://www.westjr.co.jp/travel-information/en/plan-your-trip/routes-schedule/",
            kind: "timetable",
          },
        ],
        booking: {
          label: "לינה 13–15.10 · עדיין לא הוזמן",
          url: "https://www.eslead-hotel.com/en/namba-east/",
          status: "buy-now",
        },
      },
      {
        time: "14:30",
        title: "Den Den Town / Ota Road — מסלול מקוצר",
        placeIds: ["den-den-town", "ota-road"],
        detail: "מתמקדים בחנויות שלא מיצינו בטוקיו: מסלול Animate/Surugaya/Mandarake אחד וארקייד אחד.",
      },
      {
        time: "16:30",
        title: "Pokémon Center Osaka DX",
        placeIds: ["pokemon-center-osaka-dx"],
        detail: "לוותר בקלות. רק אם המשפחה עדיין רוצה סחורה ייחודית לאזור.",
        cutFirst: true,
      },
      {
        time: "—",
        title: "סייד־קווסט: ציד הסוקאג׳אן — חלון 2 מתוך 3",
        placeIds: ["regulus-amemura", "long-river-55"],
        detail:
          "אמריקה־מורה ממילא במסלול הערב, והיא מחוז הסוקאג׳אן של אוסקה. REGULUS (12:00–20:00 כל יום) מחזיק מאות ז׳קטים כולל קולאבים של מנגה; American Long River 55 (11:00–20:00) הוא התחנה השנייה אם הראשונה מפספסת. מדפי הווינטג׳ באזור מתחילים סביב ¥10,000 לפריטים חד־פעמיים. מדלגים על כל החלון אם קיוטו כבר סיפקה.",
        cutFirst: true,
      },
      {
        time: "—",
        title: "סייד־קווסטים: Rock Star וקפה הנחשים",
        placeIds: ["rock-star", "amemura-snake-cafe"],
        detail:
          "רק עם זמן פנוי אמיתי: Rock Star בנמבה (קיפודים, סוריקטות, צ׳ינצ׳ילות; 11:00–22:00, ¥1,100 + שתייה לשעתיים) וקפה הנחשים באמריקה־מורה (12:00–21:00, פתוח ביום ג׳; כ־¥2,000). נוספו במודע למרות מחקר הרווחה — מוותרים בלי רגשות אשם.",
        cutFirst: true,
      },
      {
        time: "ערב",
        title: "ניאון בדוטונבורי וכרטיס ניקוד אוכל",
        placeIds: ["dotonbori", "glico-sign"],
        detail:
          "טאקויאקי, אוקונומיאקי, קושיקאטסו וקינוח אחד — חולקים מנות במקום להזמין ארבע מכל דבר, ולכל ילד יש בחירת ג׳וקר.",
      },
    ],
  }),

  day(14, {
    date: "2026-10-14",
    dateHe: "יום ד׳, 14 באוקטובר",
    shortDate: "14.10",
    title: "Universal Studios ו־Super Nintendo World",
    area: "נמבה ← Universal City",
    theme: "יום הגיימינג הגדול של הטיול",
    city: "osaka",
    color: "#1f6fd0",
    lat: 34.6654,
    lng: 135.4323,
    highlights: ["כניסה מוקדמת לאזור נינטנדו", "Mario Kart", "Mine Cart Madness", "Frieren או One Piece"],
    note: "לא לוויתור: מוצר ה־Express חייב לציין במפורש את מתקני נינטנדו הרצויים ואת הכניסה לאזור — השמות מתחלפים.",
    stay: osakaStay,
    blocks: [
      {
        time: "לפני השער",
        title: "שני קודי QR ואפליקציה",
        placeIds: [],
        detail:
          "Studio Pass ו־Express הם מוצרים נפרדים. לרשום את ה־Studio Pass באפליקציה הרשמית ולהגיע 60–90 דקות לפני הפתיחה המפורסמת — USJ עשוי להתחיל להכניס מוקדם יותר.",
        legs: [
          {
            mode: "train",
            from: { he: "נמבה", en: "Namba", ja: "難波駅" },
            to: { he: "אוסקה / אומדה", en: "Osaka / Umeda", ja: "大阪駅" },
            line: { he: "מידוסוג׳י", en: "Osaka Metro Midosuji Line", ja: "大阪メトロ御堂筋線" },
            direction: { he: "לכיוון סנרי־צ׳ואו", en: "toward Senri-Chuo" },
            durationMin: 9,
            fareYen: 240,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "אוסקה", en: "Osaka", ja: "大阪駅" },
            to: { he: "Universal City", en: "Universal City", ja: "ユニバーサルシティ駅" },
            line: { he: "JR יומיגאוקה ואז Sakurajima", en: "JR Yumesaki (Sakurajima) Line", ja: "JRゆめ咲線" },
            direction: { he: "החלפה בנישי־קוג׳ימה", en: "change at Nishikujo" },
            durationMin: 17,
            fareYen: 190,
            fareNote: "IC",
          },
          {
            mode: "walk",
            from: { he: "Universal City", en: "Universal City", ja: "ユニバーサルシティ駅" },
            to: { he: "שערי USJ", en: "USJ main gate" },
            durationMin: 5,
          },
        ],
        costs: [
          { label: "נסיעות הלוך וחזור", yen: 860, basis: "person" },
        ],
        needs: [
          "שני קודי QR נפרדים — Studio Pass ו־Express הם מוצרים שונים",
          "האפליקציה הרשמית של USJ עם ה־Studio Pass רשום בתוכה",
        ],
        warnings: [
          "להגיע 60–90 דקות לפני הפתיחה המפורסמת — USJ עשוי להתחיל להכניס מוקדם יותר.",
          "ה־Express חייב לציין במפורש כניסה מתוזמנת ל־Super Nintendo World. בלי זה הוא לא מבטיח את האזור.",
        ],
        booking: {
          label: "Studio Pass + Express שמציין את נינטנדו",
          url: "https://www.usj.co.jp/web/en/us/tickets",
          status: "buy-now",
        },
      },
      {
        time: "פתיחה",
        title: "Super Nintendo World לפי לוח ה־Express",
        placeIds: ["universal-studios-japan", "super-nintendo-world"],
        detail: "עוקבים אחרי לוח הכניסה המתוזמן ולא מאלתרים.",
      },
      {
        time: "בוקר",
        title: "Mario Kart: Koopa's Challenge",
        placeIds: ["super-nintendo-world"],
      },
      {
        time: "בוקר",
        title: "Mine Cart Madness בדונקי קונג קאנטרי",
        placeIds: ["super-nintendo-world"],
      },
      {
        time: "לאורך היום",
        title: "אתגרי Power-Up Band",
        placeIds: [],
        detail: "קונים שני צמידים ומשתפים בקבוצות במקום לקנות ארבעה אוטומטית.",
      },
      {
        time: "צהריים",
        title: "Kinopio's Café מוקדם או מאוחר",
        placeIds: [],
        detail: "רק אם ההמתנה סבירה.",
      },
      {
        time: "אחה״צ",
        title: "בונוס אנימה/משפחה אחד",
        placeIds: [],
        detail:
          "Frieren Story Walk, One Piece Premier Show בכרטוס נפרד אם 14.10 הוא תאריך הופעה, או להיט לא־נינטנדו כמו הארי פוטר, JAWS או מיניונים. Halloween Horror Nights ו־Chainsaw Man רק אחרי שההורים קראו את האזהרות ובן ה־12 באמת רוצה; לא מוסיפים מתקנים שאוסרים כניסה לגיל 14 ומטה.",
      },
      {
        time: "ערב",
        title: "נשארים כל עוד יש אנרגיה וחוזרים לאותו מלון",
        placeIds: ["namba-base"],
        detail: "אין רכבת לטוקיו הלילה.",
      },
      {
        time: "—",
        title: "נסיעות חוזרות, קניות וכל מתקן שמפר את תוכנית ה־Express",
        placeIds: [],
        detail: "לוותר בקלות.",
        cutFirst: true,
      },
    ],
  }),

  day(15, {
    date: "2026-10-15",
    dateHe: "יום ה׳, 15 באוקטובר",
    shortDate: "15.10",
    title: "Nintendo Museum וחזרה לטוקיו",
    area: "נמבה ← אוג׳י ← קיוטו ← טוקיו",
    theme: "בוקר רגוע, חוויית גיימינג אחרונה, וערב של נסיעה",
    city: "uji",
    color: "#6b7f2e",
    lat: 34.8929,
    lng: 135.7842,
    highlights: ["זכינו — 14:30–15:00", "לשלם עד 7.8", "דרכונים בתיק", "נוזומי שמור לטוקיו"],
    note: "זכינו בהגרלה, אבל עוד לא שילמנו: יש זמן עד 7.8 בשעה 23:59 שעון יפן, אחרת הזכייה נמחקת. החריץ שהוקצה הוא 14:30–15:00 ואי אפשר לשנות אותו, ולכן היום בנוי מחדש — בוקר רגוע באוסקה, מוזיאון אחר הצהריים, והגעה לטוקיו סביב 20:00–20:30. לא לקבוע שום דבר לערב הזה.",
    stay: finalTokyoStay,
    blocks: [
      {
        time: "עד 7.8",
        title: "לשלם על כרטיסי Nintendo Museum",
        placeIds: ["nintendo-museum"],
        detail:
          "זכינו בהגרלה ב־1.8. יש זמן עד 7.8 בשעה 23:59 שעון יפן לרכוש מדף ההגרלה, אחרת הזכייה נמחקת. 2 מבוגרים ¥6,600 + 2 נוער ¥4,400 = ¥11,000. תשלומי אשראי עלולים להיות מושבתים בתחזוקה ביום שלישי הראשון של החודש — לא להשאיר ל־4.8. הקישור בכספת.",
        booking: {
          label: "זכינו — לשלם עד 7.8 23:59 JST",
          url: "https://check.museum-tickets.nintendo.com/mypage/drawing/detail/6040136",
          status: "buy-now",
        },
      },
      {
        time: "בוקר רגוע",
        title: "בוקר ללא שעון מעורר בנמבה",
        placeIds: ["namba-base"],
        detail:
          "בלי שעון מעורר. ארוחת בוקר בנמבה וצ׳ק־אאוט נינוח עד 11:00. משגרים או מאחסנים את המזוודות — הן לא באות לאוג׳י. שילוח ימאטו לדירה בטוקיו או לוקרים בשין־אוסקה, ומחליטים עד 13.10.",
      },
      {
        time: "12:15–12:45",
        title: "יוצאים לאוג׳י",
        placeIds: ["namba-base"],
        detail:
          "אוסקה ← אוג׳י כשעה. עדיף להקדים: חלון הכניסה הוא שלושים דקות בלבד והכרטיס לא תקף מחוצה לו.",
        legs: [
          {
            mode: "subway",
            from: { he: "נמבה", en: "Namba", ja: "難波駅" },
            to: { he: "אומדה", en: "Umeda", ja: "梅田駅" },
            line: { he: "מידוסוג׳י", en: "Osaka Metro Midosuji Line", ja: "大阪メトロ御堂筋線" },
            direction: { he: "לכיוון סנרי־צ׳ואו", en: "toward Senri-Chuo" },
            durationMin: 9,
            fareYen: 240,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "אוסקה", en: "Osaka", ja: "大阪駅" },
            to: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            line: { he: "JR קיוטו · Special Rapid", en: "JR Kyoto Line Special Rapid", ja: "JR京都線 新快速" },
            direction: { he: "לכיוון קיוטו", en: "toward Kyoto" },
            durationMin: 29,
            fareYen: 580,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            to: { he: "JR אוגורה", en: "JR Ogura", ja: "JR小倉駅" },
            line: { he: "JR נארה", en: "JR Nara Line", ja: "JR奈良線" },
            direction: { he: "לכיוון נארה", en: "toward Nara" },
            durationMin: 20,
            fareYen: 240,
            fareNote: "IC",
            exit: { he: "היציאה הצפונית", en: "North Exit", ja: "北出口" },
            gotcha:
              "יורדים באוגורה, לא באוג׳י. המוזיאון יושב ב־Ogura-cho ותחנת אוג׳י רחוקה ממנו כשלושה ק״מ — זו טעות קלה לעשות כי העיר היא אוג׳י.",
          },
          {
            mode: "walk",
            from: { he: "JR אוגורה", en: "JR Ogura", ja: "JR小倉駅" },
            to: { he: "Nintendo Museum", en: "Nintendo Museum", ja: "ニンテンドーミュージアム" },
            durationMin: 8,
          },
        ],
        costs: [{ label: "נמבה ← אוגורה", yen: 1060, basis: "person" }],
        needs: [
          "כל ארבעת הדרכונים — ייתכן אימות זהות למבקרים מחו״ל בכניסה למוזיאון",
          "אישור התשלום של הכרטיסים, שמור אופליין",
        ],
        warnings: [
          "המזוודות לא באות לאוג׳י. שילוח ימאטו לדירה בטוקיו או לוקרים בשין־אוסקה — מחליטים עד 13.10.",
          "חלון הכניסה 14:30–15:00 אינו ניתן לשינוי. איחור = אין כניסה.",
        ],
      },
      {
        time: "14:30–15:00",
        title: "Nintendo Museum באוג׳י — החריץ שהוקצה",
        placeIds: ["nintendo-museum"],
        detail:
          "תערוכות אינטראקטיביות מהאנאפודה ועד היום. כשעתיים בפנים, כלומר יציאה סביב 16:30–17:00. Hanafuda Craft & Play רק אם יש חריץ נפרד וגם אז זה בדרך כלל לא מסתדר עם היציאה ב־17:00.",
      },
      {
        time: "17:30–18:00",
        title: "אוגורה ← קיוטו ← טוקיו בנוזומי שמור",
        placeIds: ["kyoto-station"],
        detail:
          "מגיעים לטוקיו סביב 20:00–20:30. להזמין מקומות שמורים מראש — ארבעה מקומות לא שמורים בנוזומי של יום חמישי בערב עם מזוודות זה סוף רע ליום הזה.",
        legs: [
          {
            mode: "train",
            from: { he: "JR אוגורה", en: "JR Ogura", ja: "JR小倉駅" },
            to: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            line: { he: "JR נארה", en: "JR Nara Line", ja: "JR奈良線" },
            direction: { he: "לכיוון קיוטו", en: "toward Kyoto" },
            durationMin: 20,
            fareYen: 240,
            fareNote: "IC",
          },
          {
            mode: "train",
            from: { he: "תחנת קיוטו", en: "Kyoto Station", ja: "京都駅" },
            to: { he: "תחנת טוקיו", en: "Tokyo Station", ja: "東京駅" },
            line: { he: "שינקנסן נוזומי", en: "Nozomi Shinkansen", ja: "新幹線のぞみ" },
            direction: { he: "לכיוון טוקיו", en: "toward Tokyo" },
            durationMin: 140,
            fareYen: 14170,
            fareNote: "מושב שמור · כרטיס נפרד",
          },
        ],
        costs: [
          { label: "אוג׳י ← קיוטו", yen: 240, basis: "person" },
          {
            label: "נוזומי קיוטו ← טוקיו · מושב שמור",
            yen: 14170,
            basis: "person",
            note: "הערכה — לאמת בהזמנה בפועל",
          },
        ],
        warnings: [
          "להזמין מקום למזוודה גדולה יחד עם המושבים, אם המזוודות נוסעות איתנו ולא שוגרו.",
        ],
      },
      {
        time: "ערב",
        title: "צ׳ק־אין בבסיס האחרון בטוקיו",
        placeIds: ["ueno-inaricho-base"],
        detail:
          "עם מזוודות גדולות — מונית מתחנת טוקיו היא הפתרון הכי פשוט, כ־¥2,500–3,500. קלים? JR לאואנו והליכה של כתשע דקות.",
        booking: {
          label: "לינה 15–17.10 · עדיין לא הוזמן",
          url: "https://www.airbnb.com/rooms/17658962?adults=4&check_in=2026-10-15&check_out=2026-10-17",
          status: "buy-now",
        },
      },
      {
        time: "רק אם מפספסים את התשלום",
        title: "גרסת ההתאוששות",
        placeIds: [],
        cutFirst: true,
        detail:
          "רלוונטי רק אם הדדליין של 7.8 עובר בלי תשלום והזכייה נמחקת: לישון מאוחר, בראנץ׳ בנמבה ורכבת שמורה לטוקיו אחרי הצהריים, בלי אוג׳י.",
      },
    ],
  }),

  day(16, {
    date: "2026-10-16",
    dateHe: "יום ו׳, 16 באוקטובר",
    shortDate: "16.10",
    title: "פוקימון, תחנת טוקיו, תופים ואסאקוסה",
    area: "ניהונבאשי ← First Avenue ← נישי־אסאקוסה ← סנסו־ג׳י",
    theme: "ארוחת הפאנדום האחרונה, מרכז הדמויות של התחנה, תיפוף וטוקיו קלאסית בין ערביים",
    city: "tokyo",
    color: "#9b2c6f",
    lat: 35.6949,
    lng: 139.7834,
    highlights: [
      "Pokémon Café אם נסגר",
      "45–60 דקות מוגנות ב־First Avenue",
      "Taiko-kan לפני 15:00",
      "זוג bachi ממיאמוטו",
      "סנסו־ג׳י בין ערביים",
    ],
    note: "תלות בלינה: הדירה באואנו/אינאריצ׳ו היא עדיין ליד ולא הזמנה. אם היא נסגרת — שתי דקות לאינאריצ׳ו, קו גינזה ישיר לניהונבאשי בכ־10–12 דקות ויציאה B2. אם נבחרת לינה אחרת — שומרים על סדר היום ומחשבים מחדש רק את הרגליים הקצרות.",
    foodAnchors: ["pokemon-cafe", "tokyo-ramen-street"],
    stay: finalTokyoStay,
    blocks: [
      {
        time: "10:30–11:00",
        title: "Pokémon Café בניהונבאשי",
        placeIds: ["pokemon-cafe", "pokemon-center-tokyo-dx"],
        detail:
          "מגיעים 15 דקות מוקדם ומקצים 90 דקות. Pokémon Center Tokyo DX נמצא באותו בניין. אין עמלת הזמנה לגיטימית — אף פעם לא משלמים לספסר.",
        legs: [
          {
            mode: "walk",
            from: { he: "הבסיס באואנו/אינאריצ׳ו", en: "Ueno / Inaricho base" },
            to: { he: "אינאריצ׳ו", en: "Inaricho", ja: "稲荷町駅" },
            durationMin: 2,
          },
          {
            mode: "subway",
            from: { he: "אינאריצ׳ו", en: "Inaricho", ja: "稲荷町駅" },
            to: { he: "ניהונבאשי", en: "Nihombashi", ja: "日本橋駅" },
            line: { he: "טוקיו מטרו · גינזה", en: "Tokyo Metro Ginza Line", ja: "東京メトロ銀座線" },
            direction: { he: "לכיוון שיבויה", en: "toward Shibuya" },
            durationMin: 11,
            fareYen: 178,
            fareNote: "IC · ישיר, בלי החלפות",
            exit: { he: "יציאה B2", en: "Exit B2" },
          },
        ],
        costs: [
          {
            label: "נסיעות היום",
            yen: 534,
            basis: "person",
            note: "שלוש נסיעות גינזה. כרטיס מטרו יומי ב־¥700 לא משתלם היום",
          },
        ],
        needs: ["אישור ההזמנה של הקפה, אם היא נסגרה — עם השעה המדויקת"],
        warnings: [
          "אין עמלת הזמנה לגיטימית לקפה. לא משלמים לספסר בשום מצב.",
        ],
        links: [
          {
            label: "Tokyo Metro · מחירים",
            url: "https://www.tokyometro.jp/lang_en/ticket/types/regular/index.html",
            kind: "official",
          },
        ],
        booking: {
          label: "מועד ההזמנות לאוקטובר טרם הוכרז",
          url: "https://www.pokemon-cafe.jp/en/cafe/news/",
          status: "monitor",
        },
      },
      {
        time: "12:15–13:15",
        title: "Tokyo Station First Avenue — בלוק מוגן",
        placeIds: ["character-street", "okashi-land", "tokyo-station"],
        detail:
          "45–60 דקות מחוץ לשערי JR בצד Yaesu. מתחילים ב־B1 ב־Tokyo Character Street ובוחרים שתיים־שלוש חנויות שנבחרו מראש; Okashi Land רק אם נשאר זמן.",
      },
      {
        time: "אם הקפה נופל",
        title: "Tokyo Ramen Street במקום הארוחה",
        placeIds: ["tokyo-ramen-street", "pokemon-center-tokyo-dx"],
        detail:
          "אוכלים ב־First Avenue ועדיין מבקרים ב־Center. לא מתכננים גם קפה וגם ראמן סטריט כשתי ארוחות מלאות.",
      },
      {
        time: "14:00",
        title: "Taiko-kan בנישי־אסאקוסה",
        placeIds: ["taiko-kan"],
        detail:
          "המוזיאון פתוח בשישי 11:00–16:00, ועל כלים מסומנים מותר לנגן. כלל תזמון: עם הזמנת קפה של 10:30–11:00 הסדר הוא קפה ← First Avenue ← Taiko-kan; עם הזמנה מאוחרת יותר מגיעים ל־Taiko-kan בפתיחה ב־11:00 וחוזרים לניהונבאשי/First Avenue אחר כך.",
        legs: [
          {
            mode: "walk",
            from: { he: "תחנת טוקיו · First Avenue", en: "Tokyo Station First Avenue" },
            to: { he: "ניהונבאשי", en: "Nihombashi", ja: "日本橋駅" },
            durationMin: 8,
            transferNote: "חוזרים ברגל לניהונבאשי — זה המסלול הזול.",
          },
          {
            mode: "subway",
            from: { he: "ניהונבאשי", en: "Nihombashi", ja: "日本橋駅" },
            to: { he: "טווארמאצ׳י", en: "Tawaramachi", ja: "田原町駅" },
            line: { he: "טוקיו מטרו · גינזה", en: "Tokyo Metro Ginza Line", ja: "東京メトロ銀座線" },
            direction: { he: "לכיוון אסאקוסה", en: "toward Asakusa" },
            durationMin: 12,
            fareYen: 178,
            fareNote: "IC · ישיר",
          },
          {
            mode: "walk",
            from: { he: "טווארמאצ׳י", en: "Tawaramachi", ja: "田原町駅" },
            to: { he: "Taiko-kan", en: "Taiko-kan", ja: "太鼓館" },
            durationMin: 5,
          },
        ],
        warnings: [
          "כניסה אחרונה 15:00 — זו הדדליין הקשיחה של היום. אם נשארות פחות מ־45 דקות אחרי First Avenue, לוקחים מונית מדודה מתחנת טוקיו (כ־¥1,800–2,500) במקום את הגינזה.",
        ],
        links: [
          {
            label: "Tokyo Station First Avenue",
            url: "https://www.tokyoeki-1bangai.co.jp/en/",
            kind: "official",
          },
        ],
        booking: {
          label: "שעות המוזיאון הרשמיות",
          url: "https://www.miyamoto-unosuke.co.jp/pages/museum",
          status: "monitor",
        },
      },
      {
        time: "15:00",
        title: "בוחרים זוג bachi במיאמוטו אונוסוקה",
        placeIds: ["miyamoto-unosuke-store"],
        detail:
          "באותו בניין, אחרי המוזיאון. בוחרים זוג במלאי — חריטת שם לוקחת כשבוע ואינה אפשרית באותו יום.",
      },
      {
        time: "16:30",
        title: "סנסו־ג׳י כשהקהל מתפזר",
        placeIds: ["sensoji", "nakamise", "kaminarimon"],
        detail: "חטיף מהיר בנקמיסה ותמונה משפחתית בקמינרימון.",
      },
      {
        time: "17:45",
        title: "אקווריום סומידה — גמר דגי הזהב (אופציונלי)",
        placeIds: ["sumida-aquarium"],
        detail:
          "רבע שעה הליכה מסנסו־ג׳י, בתוך Skytree Town, עם גלריית דגי זהב בסגנון אדו. בשישי פתוח עד 20:00; כ־¥8,800 למשפחה (¥2,700 מבוגר / ¥2,000 תיכון / ¥1,400 יסודי־חטיבה). רק אם האריזה והאנרגיה מאפשרות בנוחות.",
        cutFirst: true,
        booking: {
          label: "כרטיסים ומחירים רשמיים",
          url: "https://www.sumida-aquarium.com/en/about/price/index.html",
          status: "monitor",
        },
      },
      {
        time: "ערב",
        title: "חוזרים מוקדם לאריזה וארוחת פרידה",
        placeIds: ["ueno-inaricho-base"],
        detail: "Kura Sushi למשחק הצלחות, יאקיניקו לפינוק, או ראמן מצוין אחרון. אורזים הלילה.",
      },
      {
        time: "—",
        title: "Solamachi/Skytree, זמן נוסף בנקמיסה ושיטוט ב־First Avenue מעבר לשעה",
        placeIds: ["tokyo-skytree", "solamachi"],
        detail:
          "לוותר בקלות. מגינים על הביקור הממוקד ב־First Avenue, על Taiko-kan, על ה־bachi ועל סנסו־ג׳י.",
        cutFirst: true,
      },
    ],
  }),

  day(17, {
    date: "2026-10-17",
    dateHe: "שבת, 17 באוקטובר",
    shortDate: "17.10",
    title: "פרידה מקומית ונריטה",
    area: "אואנו ← נריטה",
    theme: "בוקר רגוע בלי סיבוב מסוכן חוצה עיר",
    city: "tokyo",
    color: "#667085",
    lat: 35.7419,
    lng: 140.0834,
    highlights: ["צ׳ק־אאוט ואחסון מזוודות", "אמייוקו או פארק אואנו", "Skyliner ב־15:45–16:00", "ET673 ב־20:40"],
    note: "לא מוסיפים: כרטיסי Skytree, בית קפה רחוק או ״אטרקציה מתוזמנת אחרונה״.",
    blocks: [
      {
        time: "בוקר",
        title: "צ׳ק־אאוט ואחסון מזוודות",
        placeIds: ["ueno-inaricho-base"],
        detail:
          "מאחסנים רק במתקן שהנכס הסופי אישר. אם הליד הנוכחי משתנה — אחסון מזוודות הופך לתנאי הזמנה.",
      },
      {
        time: "11:00–15:00",
        title: "שומרים על היום מקומי",
        placeIds: ["ameyoko", "ueno-park"],
        detail: "חטיפים באמייוקו, פארק אואנו, או כל פיסה מאסאקוסה שפספסנו אתמול.",
      },
      {
        time: "—",
        title: "סייד־קווסט: ציד הסוקאג׳אן — החלון האחרון",
        placeIds: ["okuma-shokai"],
        detail:
          "רק אם הז׳קט עדיין לא נמצא. 大熊商会 יושב בתוך אמייוקו מ־1950 — תוצרת יפן, ¥4,500–75,000, הטווח הרחב ביותר ברשימה, ומידות מבוגרים עד 5L כך שיש באמת מקום לעלות מידה קדימה. 11:00–19:00, סגור בשני (17.10 שבת — פתוח), תמיכה באנגלית. מקסימום 30 דקות, ולא נוגעים באיסוף המזוודות ב־15:15.",
        cutFirst: true,
      },
      {
        time: "15:15",
        title: "אוספים את המזוודות",
        placeIds: [],
        detail: "לא מאחרים — לוח הזמנים מכאן קשיח.",
      },
      {
        time: "15:45–16:00",
        title: "Skyliner מ־Keisei-Ueno",
        placeIds: ["keisei-ueno"],
        detail:
          "להזמין כשהמכירה נפתחת חודש לפני, ואז לאמת את הלוח והטרמינל המדויקים.",
        legs: [
          {
            mode: "taxi",
            from: { he: "הבסיס באואנו/אינאריצ׳ו", en: "Ueno / Inaricho base" },
            to: { he: "קייסיי־אואנו", en: "Keisei-Ueno", ja: "京成上野駅" },
            durationMin: 8,
            fareNote: "מונית מדודה · או 15–20 דקות הליכה אם המזוודות מתגלגלות בנוח",
            gotcha:
              "מונית רגילה אחת לא בהכרח מכילה ארבעה אנשים וארבע מזוודות גדולות — לתכנן שתי מוניות או רכב גדול.",
          },
          {
            mode: "train",
            from: { he: "קייסיי־אואנו", en: "Keisei-Ueno", ja: "京成上野駅" },
            to: {
              he: "נריטה טרמינל 1",
              en: "Narita Airport Terminal 1",
              ja: "成田空港第1ターミナル駅",
            },
            line: { he: "קייסיי סקיילינר", en: "Keisei Skyliner", ja: "京成スカイライナー" },
            depart: "15:45–16:00",
            durationMin: 44,
            fareYen: 2580,
            fareNote: "מושב שמור · להזמין מראש",
          },
        ],
        costs: [{ label: "Skyliner לנריטה", yen: 2580, basis: "person" }],
        warnings: [
          "הטיסה יוצאת מטרמינל 1. היעד הוא להיות בטרמינל סביב 16:45–17:15 לטיסה של 20:40.",
          "לאמת את לוח הזמנים ואת הטרמינל ביום עצמו — לא להסתמך על התכנון מלפני חודש.",
        ],
        booking: {
          label: "מכירה נפתחת חודש לפני הנסיעה",
          url: "https://new-www.keisei.co.jp/keisei/tetudou/skyliner/us/skyliner/purchase.php",
          status: "on-sale-soon",
        },
      },
      {
        time: "16:45–17:15",
        title: "מגיעים לטרמינל הנכון בנריטה",
        placeIds: ["narita-airport"],
        detail: "לבדוק את הטרמינל ואת סטטוס הרכבת ביום עצמו.",
      },
      {
        time: "20:40",
        title: "ET673 · נריטה ← אדיס אבבה",
        placeIds: [],
        detail: "נחיתה באדיס ב־05:50 ב־18.10, ואז ET418 ב־10:25 שנוחתת בתל אביב ב־14:35.",
      },
    ],
  }),
];

/* ---------------------------------------------------------------- helpers */

const TRIP_START = "2026-10-01";
const TRIP_END = "2026-10-17";

/** Local-date key (YYYY-MM-DD) for a Date, without UTC drift. */
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The trip day matching `now`, or null when we are outside Oct 1–17 2026. */
export function getTodayTripDay(now: Date = new Date()): TripDay | null {
  const key = dateKey(now);
  if (key < TRIP_START || key > TRIP_END) return null;
  return tripDays.find((entry) => entry.date === key) ?? null;
}

/** True while the trip is running, including the flight home on Oct 18. */
export function isDuringTrip(now: Date = new Date()): boolean {
  const key = dateKey(now);
  return key >= TRIP_START && key <= "2026-10-18";
}

export function getDay(n: number): TripDay | null {
  return tripDays.find((entry) => entry.day === n) ?? null;
}

export function getNextTripDay(now: Date = new Date()): TripDay | null {
  const key = dateKey(now);
  return tripDays.find((entry) => entry.date > key) ?? null;
}

export function daysUntilTrip(now: Date = new Date()): number {
  const start = new Date(`${TRIP_START}T00:00:00`);
  const today = new Date(`${dateKey(now)}T00:00:00`);
  return Math.round((start.getTime() - today.getTime()) / 86400000);
}

export const cityLabels: Record<string, string> = {
  tokyo: "טוקיו",
  kyoto: "קיוטו",
  osaka: "אוסקה",
  kamakura: "קמקורה",
  uji: "אוג׳י",
  other: "בדרך",
};

export const placeCategoryLabels: Record<string, string> = {
  attraction: "אטרקציה",
  food: "אוכל",
  shopping: "קניות",
  nature: "טבע",
  culture: "תרבות",
  gaming: "גיימינג",
  kawaii: "קוואי",
  viewpoint: "תצפית",
  stay: "לינה",
  transport: "תחבורה",
  event: "אירוע",
};

export const bookingStatusLabels: Record<string, string> = {
  booked: "מוזמן",
  "buy-now": "לקנות עכשיו",
  "on-sale-soon": "מכירה נפתחת",
  lottery: "הגרלה",
  monitor: "במעקב",
  fallback: "גיבוי",
};

export const routeChapters = [
  { city: "tokyo", label: "טוקיו", dates: "2–11.10", days: [2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { city: "kyoto", label: "קיוטו", dates: "11–13.10", days: [11, 12] },
  { city: "osaka", label: "אוסקה", dates: "13–15.10", days: [13, 14, 15] },
  { city: "tokyo", label: "טוקיו", dates: "15–17.10", days: [16, 17] },
] as const;

export function mapsSearchUrl(place: Place): string {
  const query = place.mapsQuery ?? place.nameEn;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function mapsDirectionsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&travelmode=walking`;
}

/* ------------------------------------------------- legacy compatibility */

/** Legacy shape used by the pre-redesign map page. */
export const mapPlaces = tripDays
  .filter((item) => item.day > 1)
  .map(({ day: n, title, area, lat, lng, color, heroImage }) => ({
    day: n,
    title,
    area,
    lat,
    lng,
    color,
    image: heroImage,
  }));

function formatDueHe(iso: string): string {
  const [, month, dayPart] = iso.split("-");
  return `עד ${Number(dayPart)}.${Number(month)}`;
}

/** The booking gates surfaced on the home page, in priority order. */
export const bookingGateIds = [
  "nintendo-museum-lottery",
  "mundo-pixar",
  "book-osaka-and-final-tokyo",
  "teamlab-planets",
  "kawaii-monster-land",
  "usj-express",
  "ghibli-museum",
  "pokepark-monitor",
  "mizuekai",
  "drum-tao-hibiki",
  "pokemon-cafe",
] as const;

/** Derived from the checklist so the pre-redesign home-page panel keeps working. */
export const bookingTasks = bookingGateIds
  .map((id) => checklistItems.find((item) => item.id === id))
  .filter((item): item is (typeof checklistItems)[number] => Boolean(item))
  .map((item) => ({
    id: item.id,
    status: item.critical ? "urgent" : "next",
    date: item.due ? formatDueHe(item.due) : "בהקדם",
    title: item.title,
    detail: item.detail ?? "",
    url: item.url,
  }));

export const guideImages: Record<string, string> = {
  overview: "/images/cities/tokyo.jpg",
  flights: "/images/days/day-01.jpg",
  stay: "/images/cities/tokyo.jpg",
  transport: "/images/days/day-11.jpg",
  anime: "/images/places/akihabara-electric-town.jpg",
  food: "/images/places/dotonbori.jpg",
  daytrips: "/images/cities/kamakura.jpg",
  mitzvah: "/images/places/tokyo-dome-city.jpg",
  tips: "/images/cities/kyoto.jpg",
  itinerary: "/images/days/day-09.jpg",
  budget: "/images/cities/osaka.jpg",
  checklist: "/images/days/day-17.jpg",
};
