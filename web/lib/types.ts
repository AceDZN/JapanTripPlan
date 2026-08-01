export type City = "tokyo" | "kyoto" | "osaka" | "kamakura" | "uji" | "other";
export type PlaceCategory =
  | "attraction" | "food" | "shopping" | "nature" | "culture"
  | "gaming" | "kawaii" | "viewpoint" | "stay" | "transport" | "event";

/**
 * A name we may have to read off a sign, type into an app, or show to a person.
 *
 * The app is Hebrew, but nothing in Japan is: station signage is Latin +
 * Japanese, a taxi driver reads Japanese, and a ticket machine offers English.
 * A single translated string is therefore not enough for anything we have to
 * *act on* — so every operational proper noun carries all three, and the UI
 * shows the Hebrew with the other two attached rather than making us guess.
 */
export type Label = {
  he: string;
  en?: string;
  ja?: string;
};

export type Place = {
  id: string;               // kebab-case English slug, stable
  nameHe: string;
  nameEn: string;
  nameJa?: string;          // the name as it appears on signage and in Google Maps JP
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

  /**
   * Getting-there and being-there facts.
   *
   * These are the questions that actually get asked on the pavement — which
   * station, which exit, how far on foot, is it shut today, is it too late to
   * go in, what do I show the driver — and until now none of them had a home
   * in the data, so they lived in prose or nowhere.
   */
  addressEn?: string;       // romaji address, for typing into a map
  addressJa?: string;       // Japanese address, for showing a driver or a form
  phone?: string;           // +81 form, tappable
  nearestStation?: Label;   // the station we actually arrive at
  stationExit?: Label;      // which exit — wrong exit is the classic time sink
  walkMinutes?: number;     // from that station's exit to the door
  closedDays?: string;      // Hebrew, e.g. "סגור בשלישי"
  lastEntry?: string;       // "15:00" — deadlines that end a visit early
  ticketNote?: string;      // Hebrew: price and how it is bought at the door
};

export type BookingStatus = "booked" | "buy-now" | "on-sale-soon" | "lottery" | "monitor" | "fallback";

export type TransportMode =
  | "train" | "subway" | "walk" | "bus" | "taxi"
  | "plane" | "ferry" | "cablecar" | "monorail";

/**
 * One movement, at the granularity you have to execute it.
 *
 * A day used to say "Tabata → Akihabara by JR" inside a prose sentence, which
 * is fine at the kitchen table and useless at 22:00 in Nippori with four
 * suitcases. A leg is the unit that answers "which train, from which platform,
 * out of which exit, for how much, and what goes wrong here".
 */
export type TransportLeg = {
  mode: TransportMode;
  from: Label;
  to: Label;
  line?: Label;             // "JR Yamanote" / JR山手線
  direction?: Label;        // trains are signed by destination, not by compass
  platform?: string;
  depart?: string;          // "21:15" — only when the time is real, not invented
  arrive?: string;
  durationMin?: number;
  fareYen?: number;         // per person
  fareNote?: string;        // Hebrew: "IC" / "כרטיס משולב" / "כלול בכרטיס היומי"
  exit?: Label;             // which exit to leave `to` by
  transferNote?: string;    // Hebrew: what the change between operators involves
  gotcha?: string;          // Hebrew: the thing that will actually bite us here
};

export type CostBasis = "person" | "family" | "total";

/** One line of money, with an explicit basis — "¥2,580" alone has burned us. */
export type CostLine = {
  label: string;            // Hebrew
  yen: number;
  basis: CostBasis;
  note?: string;            // Hebrew
};

export type LinkKind =
  | "official" | "tickets" | "timetable" | "map" | "hours" | "menu" | "access";

export type RefLink = { label: string; url: string; kind: LinkKind };

export type DayBlock = {
  time?: string;            // "10:00" or "בוקר"/"צהריים"/"ערב"
  title: string;            // Hebrew
  placeIds: string[];       // refs into places.json (may be empty)
  detail?: string;          // Hebrew
  cutFirst?: boolean;       // explicit "cut first" instruction from the docs
  booking?: { label: string; url: string; status: BookingStatus };

  /** The operational half — what it takes to actually do this block. */
  legs?: TransportLeg[];
  costs?: CostLine[];
  links?: RefLink[];
  needs?: string[];         // Hebrew: what must be in hand before this starts
  warnings?: string[];      // Hebrew: deadlines, closures, no-lift stairs
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
  /**
   * Day centroid. Optional and effectively unused — the only consumer was
   * `mapPlaces` in trip-data.ts, which nothing imports. Not carried into
   * Convex; every map view derives its centre from the day's places instead.
   */
  lat?: number; lng?: number;
  blocks: DayBlock[];
  highlights: string[];     // 3–5 short Hebrew bullets
  note?: string;
  rainPlan?: string;
  foodAnchors?: string[];   // placeIds

  /**
   * Where we sleep at the end of this day.
   *
   * Deliberately repeated on every day rather than looked up from the stay's
   * date range: "where am I sleeping tonight and what do I show the driver" is
   * the single most likely thing to be asked while tired and offline, and it
   * should never require reasoning about which booking covers today.
   */
  stay?: {
    placeId?: string;
    label: string;          // Hebrew
    addressJa?: string;     // for the taxi
    checkIn?: string;
    checkOut?: string;
    url?: string;
    note?: string;          // Hebrew
  };
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
