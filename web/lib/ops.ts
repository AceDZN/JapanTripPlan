import type { CostLine, Label, TransportLeg, TransportMode } from "@/lib/types";

/**
 * Shared vocabulary for the operational layer of a day.
 *
 * Kept out of the components so the day page, the itinerary export and the
 * agent all describe a fare or a mode the same way. A number that means
 * "per person" in one place and "for four" in another is the exact bug this
 * module exists to prevent.
 */

/** 2 adults + 2 children, but four adult rail fares — see 03-TRANSPORT.md. */
export const TRAVELLERS = 4;

export function yen(amount: number): string {
  return `¥${amount.toLocaleString("en-US")}`;
}

/**
 * What a cost line actually costs the family.
 *
 * `person` multiplies by four; `family` and `total` are already the whole
 * party. Every planned rail fare in the docs is quoted per adult fare, and
 * the son is 12 during the trip, so no child discount applies.
 */
export function familyTotal(lines: CostLine[]): number {
  return lines.reduce(
    (sum, line) => sum + (line.basis === "person" ? line.yen * TRAVELLERS : line.yen),
    0,
  );
}

export const costBasisLabels: Record<CostLine["basis"], string> = {
  person: "לאדם",
  family: "למשפחה",
  total: "סה״כ",
};

export const transportModeLabels: Record<TransportMode, string> = {
  train: "רכבת",
  subway: "מטרו",
  walk: "הליכה",
  bus: "אוטובוס",
  taxi: "מונית",
  plane: "טיסה",
  ferry: "מעבורת",
  cablecar: "רכבל",
  monorail: "מונורייל",
};

/** Minutes as Hebrew duration text: 95 -> "1 ש׳ 35 ד׳". */
export function durationHe(minutes: number): string {
  if (minutes < 60) return `${minutes} ד׳`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} ש׳` : `${hours} ש׳ ${rest} ד׳`;
}

/**
 * The Latin/Japanese half of a label, as one string.
 *
 * Station signage carries both, so both are shown — but only when they add
 * something. Repeating "Tabata" under "Tabata" is noise, and noise is what
 * made the old pages hard to scan.
 */
export function labelForeign(label: Label): string | null {
  const parts = [label.en, label.ja].filter(
    (part): part is string => Boolean(part) && part !== label.he,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Total travel time of a leg list, ignoring legs that never got a duration. */
export function legsDuration(legs: TransportLeg[]): number {
  return legs.reduce((sum, leg) => sum + (leg.durationMin ?? 0), 0);
}

/** Per-person fare of a leg list. */
export function legsFare(legs: TransportLeg[]): number {
  return legs.reduce((sum, leg) => sum + (leg.fareYen ?? 0), 0);
}
