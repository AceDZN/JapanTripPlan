export type City = "tokyo" | "kyoto" | "osaka" | "kamakura" | "uji" | "other";
export type PlaceCategory =
  | "attraction" | "food" | "shopping" | "nature" | "culture"
  | "gaming" | "kawaii" | "viewpoint" | "stay" | "transport" | "event";

export type Place = {
  id: string;               // kebab-case English slug, stable
  nameHe: string;
  nameEn: string;
  category: PlaceCategory;
  area: string;             // neighborhood, Hebrew ok (e.g. "אקיהברה")
  city: City;
  lat: number;
  lng: number;
  days: number[];           // trip day numbers (1..17) where it appears; [] for extras
  planned: boolean;         // true = in our itinerary; false = nearby-extra recommendation
  descriptionHe: string;    // 1–2 sentences, family-fit angle
  tips?: string;            // Hebrew: booking/cut-first/timing notes
  image?: string;           // "/images/places/<id>.jpg" if exists
  officialUrl?: string;
  mapsQuery?: string;       // string for Google Maps search deep-link (name + area, English)
  priceLevel?: 0 | 1 | 2 | 3;
  mustDo?: boolean;
  indoor?: boolean;         // rain-friendly
  openingHours?: string;    // short human text, Hebrew
};

export type BookingStatus = "booked" | "buy-now" | "on-sale-soon" | "lottery" | "monitor" | "fallback";

export type DayBlock = {
  time?: string;            // "10:00" or "בוקר"/"צהריים"/"ערב"
  title: string;            // Hebrew
  placeIds: string[];       // refs into places.json (may be empty)
  detail?: string;          // Hebrew
  cutFirst?: boolean;       // explicit "cut first" instruction from the docs
  booking?: { label: string; url: string; status: BookingStatus };
};

export type TripDay = {
  day: number;              // 1..17
  date: string;             // ISO "2026-10-03"
  dateHe: string;           // "שבת, 3 באוקטובר"
  shortDate: string;        // "3.10"
  title: string;            // Hebrew headline
  area: string;
  theme: string;
  city: City;
  heroImage: string;        // "/images/days/day-03.jpg"
  color: string;            // hex, per-day identity color
  lat: number; lng: number; // day centroid
  blocks: DayBlock[];
  highlights: string[];     // 3–5 short Hebrew bullets
  note?: string;
  rainPlan?: string;
  foodAnchors?: string[];   // placeIds
};

export type ChecklistItem = {
  id: string;               // stable kebab slug
  group: string;            // Hebrew group title (e.g. "כרטיסים ואטרקציות")
  title: string;            // Hebrew
  detail?: string;
  due?: string;             // ISO date if there's a real deadline
  url?: string;
  critical?: boolean;
};
