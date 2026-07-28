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
    blocks: [
      {
        time: "בוקר",
        title: "מגיעים לנתב״ג",
        placeIds: [],
        detail: "לפי הנחיות הצ׳ק־אין הבינלאומי של Ethiopian Airlines.",
      },
      {
        time: "15:35",
        title: "ET419 · תל אביב ← אדיס אבבה",
        placeIds: [],
        detail: "נחיתה באדיס אבבה ב־19:50.",
      },
      {
        time: "19:50",
        title: "קונקשן של 2 שעות ו־45 דקות",
        placeIds: [],
        detail: "מנצלים את הזמן למעבר שער, ארוחה, שירותים ומתיחות. הקונקשן קצר מדי לתוכנית מלון עצירה.",
      },
      {
        time: "22:35",
        title: "ET672 · אדיס אבבה ← נריטה",
        placeIds: ["narita-airport"],
        detail: "טיסת לילה ארוכה; נוחתים מחר ב־19:40.",
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
    note: "אין סיורים הערב. שער שצריך לסגור לפני הנסיעה: לשלוח תמונות דרכון של ארבעת האורחים ב־Airbnb chat, לקבל אישור כתוב שהגעה סביב 22:00–23:00 מותרת ולשמור את ההוראות אופליין.",
    blocks: [
      {
        time: "19:40",
        title: "נחיתה בנריטה",
        placeIds: ["narita-airport"],
        detail: "להקצות בערך 90 דקות להגירה, מזוודות ומכס.",
      },
      {
        time: "~21:15",
        title: "TOURIST PASMO ו־Skyliner לניפורי",
        placeIds: [],
        detail:
          "קונים ארבעה כרטיסי TOURIST PASMO (¥2,000 כל אחד, כל הסכום כערך צבור) במרכז המידע של Skyliner & Keisei, ואז את ה־Skyliner המעשי הבא לניפורי — ¥2,580 לאדם. לא מזמינים מראש רכבת שעיכוב בטיסה יכול לבטל.",
      },
      {
        time: "~22:15",
        title: "ניפורי ← טבטה ב־JR",
        placeIds: [],
        detail:
          "יוצאים משערי Keisei, עוקבים אחרי השילוט ל־JR ומעבירים PASMO לנסיעה של תחנה אחת — ¥155. סה״כ צפוי למשפחה: כ־¥10,940. אוטובוס או מונית רק אם המצב באמת מצדיק.",
      },
      {
        time: "22:00–23:00",
        title: "צ׳ק־אין עצמי בדירה בטבטה",
        placeIds: ["tabata-base"],
        detail: "מודיעים למארח מיד אחרי הנחיתה ופועלים לפי הוראות הלוקבוקס ששמרנו אופליין.",
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
        detail: "קונים ארוחה פשוטה וארוחת בוקר למחר. בלי אטרקציות.",
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
    blocks: [
      {
        time: "09:00",
        title: "יוצאים מטבטה",
        placeIds: ["tabata-base"],
        detail: "JR ישיר לאקיהברה, ואז הכול ברגל. כ־¥398 לאדם / ¥1,592 למשפחה ליום כולו.",
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
    highlights: ["teamLab Planets בבוקר", "Mundo Pixar ב־11:45/12:00", "Unicorn Gundam", "Tokyo Joypolis"],
    note: "היום היחיד שחורג מכלל שתי האטרקציות המתוזמנות — teamLab, Pixar ו־Joypolis יושבים על אותו קו Yurikamome רציף. שלושת העוגנים מוגנים.",
    rainPlan: "כמעט כל היום מקורה — היום הזה עובד גם בגשם.",
    foodAnchors: ["divercity-tokyo-plaza"],
    blocks: [
      {
        time: "07:45",
        title: "יוצאים מטבטה לחריץ 09:00",
        placeIds: ["tabata-base"],
        detail:
          "JR ישיר לשימבאשי, ואז Yurikamome. לפני הנסיעה הראשונה קונים כרטיס יומי של Yurikamome ב־¥820 — זול יותר מארבע הנסיעות המתוכננות.",
      },
      {
        time: "09:00–12:00",
        title: "teamLab Planets",
        placeIds: ["teamlab-planets"],
        detail:
          "החריץ המתוזמן הכי מוקדם שאפשר. ללבוש בגדים שאפשר להפשיל מעל הברך — יש מים ורצפות מראה. 2–2.5 שעות, לוקרים חינם.",
        booking: {
          label: "כניסה מתוזמנת לבוקר",
          url: "https://teamlabplanets.dmm.com/en",
          status: "buy-now",
        },
      },
      {
        time: "11:45/12:00",
        title: "Mundo Pixar ב־CREVIA BASE",
        placeIds: ["mundo-pixar"],
        detail:
          "תחנה אחת מ־teamLab ל־Shijō-mae. CREVIA BASE כשלוש דקות מהתחנה והחוויה 45–55 דקות. 4.10 הוא יום מחיר D: כ־¥20,100 למשפחה לפני עמלות.",
        booking: {
          label: "חובה · לקנות כניסה מתוזמנת",
          url: "https://t.pia.jp/en/pia/events/mundopixar",
          status: "buy-now",
        },
      },
      {
        time: "13:00",
        title: "Yurikamome לאודאיבה + צהריים",
        placeIds: ["odaiba", "divercity-tokyo-plaza"],
        detail: "מושבים קדמיים או אחוריים הופכים את הנסיעה לאטרקציה. צהריים ב־DiverCity.",
      },
      {
        time: "14:00",
        title: "Unicorn Gundam ו־Gundam Base",
        placeIds: ["unicorn-gundam", "gundam-base-tokyo"],
        detail: "מצלמים את הפסל; שיטוט מורחב ב־Gundam Base הוא מהדברים הראשונים לקצר.",
        cutFirst: true,
      },
      {
        time: "15:00–17:30",
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
          "JR ימנוטה לשינג׳וקו, יוצאים משערי JR ונכנסים ל־Keio: אקספרס לצ׳ופו ואז קו סאגמיהרה ל־Keio-yomiuri-land. ¥314 IC לכיוון; סה״כ כ־¥1,546 לאדם / ¥6,184 למשפחה.",
      },
      {
        time: "~10:20",
        title: "רכבל Sky Shuttle",
        placeIds: ["yomiuriland"],
        detail: "כרטיס הלוך־חזור ¥500, נפרד מכרטיס הפארק. מגיעים לאזור לפני 10:30.",
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
    blocks: [
      {
        time: "08:00",
        title: "יוצאים מטבטה להרג׳וקו",
        placeIds: ["tabata-base"],
        detail: "JR ימנוטה ישיר. כ־¥506 לאדם / ¥2,024 למשפחה ליום.",
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
    blocks: [
      {
        time: "07:30",
        title: "יוצאים לקמקורה",
        placeIds: ["tabata-base"],
        detail:
          "JR דרך טוקיו/שימבאשי לחיבור יוקוסוקה/טוקאידו, בלי לצאת משערי JR. כ־¥2,604 לאדם / ¥10,416 למשפחה ליום.",
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
    blocks: [
      {
        time: "08:35",
        title: "יוצאים לכניסה של 10:00",
        placeIds: ["tabata-base"],
        detail:
          "JR ימנוטה לשינג׳וקו ואז Chuo Rapid למיטאקה, בלי לצאת משערי JR. אוטובוס המוזיאון ¥230 למבוגר או 15 דקות הליכה. כ־¥1,287 לאדם / ¥5,148 למשפחה.",
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
    blocks: [
      {
        time: "08:00",
        title: "יוצאים דרך אואימאצ׳י",
        placeIds: ["tabata-base"],
        detail:
          "JR קייהין־טוהוקו ישיר לאואימאצ׳י ואז קו Tokyu Oimachi לטודורוקי. כ־¥1,404 לאדם / ¥5,616 למשפחה — כל מעבר בין מפעילים מחויב בנפרד.",
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
    blocks: [
      {
        time: "מוקדם",
        title: "צ׳ק־אאוט ונוזומי שמור לקיוטו",
        placeIds: ["tabata-base", "tokyo-station"],
        detail:
          "צ׳ק־אאוט עד 11:00 ו־JR ישיר מטבטה לתחנת טוקיו (¥209 לאדם). קונים אקיבן לפני העלייה לרכבת.",
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
    highlights: ["UZUMASA מ־10:00", "מופעי סמוראים ונינג׳ות", "מנוחה אמיתית בדירה", "HIBIKI ב־19:00"],
    note: "מגינים על בלוק 10:00–15:00/15:30 ועל המנוחה לפני HIBIKI. שיעור סמוראים פרטי היה משכפל את הנושא והוסר מהמסלול.",
    blocks: [
      {
        time: "10:00–15:00",
        title: "UZUMASA Kyoto Village",
        placeIds: ["uzumasa-kyoto-village"],
        detail:
          "נכנסים סמוך לפתיחה ומתייחסים אליו כאטרקציה הראשית של היום. עדיפות לרחובות הסטים מעידן אדו, למופעי סמוראים/נינג׳ות ולשניים־שלושה מתקנים משתתפים. כניסה ¥2,800 מגיל 13 ו־¥1,600 לגילי 3–12 — ¥10,000 למשפחה לפני מתקנים בתשלום ותחפושות. פסטיבל היוקאי העונתי חופף לתאריכים; לאמת את התוכנית היומית קרוב לנסיעה.",
        booking: {
          label: "שעות וכרטיסים רשמיים",
          url: "https://en.eigamura.com/hours-tickets/",
          status: "buy-now",
        },
      },
      {
        time: "16:00–18:00",
        title: "חוזרים לדירה, מנוחה וארוחת ערב מוקדמת",
        placeIds: ["fushimi-inari-apartment", "kyoto-station"],
        detail: "אוכלים מוקדם ליד תחנת קיוטו ומגיעים ל־Kyoto Avanti לפני הדלתות ב־18:15.",
      },
      {
        time: "19:00",
        title: "DRUM TAO HIBIKI",
        placeIds: ["kyoto-avanti"],
        detail:
          "מופע של כ־40 דקות שעובד היטב גם אחרי יום אטרקציה מלא. ¥10,000 לאדם — ¥40,000 למשפחה, מגיל 6. הכרטיסים נפתחים חודשיים לפני המופע.",
        booking: {
          label: "חלון מכירה נפתח חודשיים לפני",
          url: "https://drum-tao-kyoto.com/en/ticket/",
          status: "on-sale-soon",
        },
      },
      {
        time: "החלפה אופציונלית",
        title: "Mibu Kyogen במקום חלק מ־UZUMASA",
        placeIds: ["mibu-dera"],
        detail:
          "רק אם המשפחה מעדיפה בבירור תיאטרון מסכות היסטורי: עוזבים את אוזומאסה סביב 13:15, רואים הצגה או שתיים בערך 14:00–16:00 וממשיכים ל־HIBIKI. הריצה הרשמית היא 10–12.10, חמש הצגות בין 13:00 ל־17:30, כניסה ביום עצמו. זו חלופה דחוסה ולא הבסיס המומלץ.",
        cutFirst: true,
      },
      {
        time: "—",
        title: "מתקנים נוספים בתשלום ב־UZUMASA",
        placeIds: [],
        detail: "לוותר בקלות אחרי Mibu Kyogen. מגינים על המנוחה ועל HIBIKI.",
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
          "ברירת המחדל היא JR/Metro או Keihan, לא שינקנסן. אם המסלול החי עובר בתחנת קיוטו: JR Inari ← Kyoto ← Special Rapid לאוסקה/Umeda ← Midosuji לנמבה. אם המלון הסופי הופך את Keihan מפושימי למהיר יותר — בוחרים בו. מורידים מזוודות לפני Den Den Town ואוספים את הגדולות אם שוגרו.",
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
    blocks: [
      {
        time: "לפני השער",
        title: "שני קודי QR ואפליקציה",
        placeIds: [],
        detail:
          "Studio Pass ו־Express הם מוצרים נפרדים. לרשום את ה־Studio Pass באפליקציה הרשמית ולהגיע 60–90 דקות לפני הפתיחה המפורסמת — USJ עשוי להתחיל להכניס מוקדם יותר.",
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
    theme: "חוויית גיימינג גדולה אחרונה, ואז נסיעה נוחה",
    city: "uji",
    color: "#6b7f2e",
    lat: 34.8929,
    lng: 135.7842,
    highlights: ["הגרלה עד 31.7", "תערוכות אינטראקטיביות", "דרכונים בתיק", "נוזומי שמור לטוקיו"],
    note: "לא מאלתרים את Nintendo Museum: הכניסה בהגרלה/הזמנה מראש בלבד. אם ההגרלה נכשלת — חוזרים מיד לגרסת ההתאוששות.",
    blocks: [
      {
        time: "עד 31.7",
        title: "להגיש להגרלת אוקטובר",
        placeIds: ["nintendo-museum"],
        detail: "עד 31 ביולי ב־23:59 שעון יפן, ולבחור חריצי בוקר או צהריים מוקדם ב־15.10.",
        booking: {
          label: "הגרלת אוקטובר · עד 31.7 23:59 JST",
          url: "https://museum-tickets.nintendo.com/en/calendar?lang=en",
          status: "lottery",
        },
      },
      {
        time: "בוקר",
        title: "צ׳ק־אאוט, מזוודות ונסיעה לאוג׳י",
        placeIds: ["namba-base"],
        detail:
          "משגרים או מאחסנים מזוודות לפי התוכנית, ונוסעים עם דרכונים — ייתכן אימות זהות למבקרים מחו״ל.",
      },
      {
        time: "החריץ שהוקצה",
        title: "Nintendo Museum באוג׳י",
        placeIds: ["nintendo-museum"],
        detail:
          "תערוכות אינטראקטיביות מהאנאפודה ועד היום. מוסיפים Hanafuda Craft & Play רק אם יש חריץ נפרד ולוח הרכבות עדיין עובד.",
      },
      {
        time: "אחה״צ",
        title: "אוג׳י ← קיוטו ← טוקיו בנוזומי שמור",
        placeIds: ["kyoto-station"],
        detail: "מגיעים, עושים צ׳ק־אין, אוכלים משהו פשוט והולכים לישון.",
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
        time: "אם ההגרלה נכשלת",
        title: "גרסת ההתאוששות",
        placeIds: [],
        detail: "לישון מאוחר, בראנץ׳ בנמבה ורכבת שמורה לטוקיו אחרי הצהריים.",
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
    blocks: [
      {
        time: "10:30–11:00",
        title: "Pokémon Café בניהונבאשי",
        placeIds: ["pokemon-cafe", "pokemon-center-tokyo-dx"],
        detail:
          "מגיעים 15 דקות מוקדם ומקצים 90 דקות. Pokémon Center Tokyo DX נמצא באותו בניין. אין עמלת הזמנה לגיטימית — אף פעם לא משלמים לספסר.",
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
          "להגיע סביב 14:00 ולפני הכניסה האחרונה הרשמית ב־15:00. המוזיאון פתוח בשישי 11:00–16:00, ועל כלים מסומנים מותר לנגן. כלל תזמון: עם הזמנת קפה של 10:30–11:00 הסדר הוא קפה ← First Avenue ← Taiko-kan; עם הזמנה מאוחרת יותר מגיעים ל־Taiko-kan בפתיחה ב־11:00 וחוזרים לניהונבאשי/First Avenue אחר כך.",
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
          "להזמין כשהמכירה נפתחת חודש לפני, ואז לאמת את הלוח והטרמינל המדויקים. ¥2,580 לאדם / ¥10,320 למשפחה. אם המזוודות לא מתגלגלות בנוח — מונית קצרה, ואולי שתיים.",
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
