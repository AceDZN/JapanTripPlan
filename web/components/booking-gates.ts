import type { BookingStatus, ChecklistItem, TripDay } from "@/lib/types";

export type BookingGate = {
  key: string;
  title: string;
  detail?: string;
  url?: string;
  status: BookingStatus;
  day?: number;
  due?: string;
  critical: boolean;
};

const statusOrder: Record<BookingStatus, number> = {
  "buy-now": 0,
  lottery: 1,
  "on-sale-soon": 2,
  monitor: 3,
  fallback: 4,
  booked: 5,
};

function checklistByUrl(checklistItems: ChecklistItem[]): Map<string, ChecklistItem> {
  const map = new Map<string, ChecklistItem>();
  checklistItems.forEach((item) => {
    if (item.url && !map.has(item.url)) map.set(item.url, item);
  });
  return map;
}

/**
 * The booking gates panel: every `booking` entry across the 17 days, enriched
 * with the matching checklist deadline, plus critical checklist gates that have
 * no day block of their own (accommodation, documents…).
 *
 * Takes the days and items as arguments rather than importing them. It used to
 * close over the hand-written `tripDays` and `checklistItems` modules, which
 * meant the home page's "what must we book" panel was computed from a snapshot
 * of the plan rather than from the plan: marking a ticket booked in Convex left
 * the gate showing on the front page until someone re-typed the static file.
 */
export function bookingGates(
  tripDays: TripDay[],
  checklistItems: ChecklistItem[],
): BookingGate[] {
  const byChecklist = checklistByUrl(checklistItems);
  const gates = new Map<string, BookingGate>();

  tripDays.forEach((day) => {
    day.blocks.forEach((block) => {
      if (!block.booking) return;
      const { label, url, status } = block.booking;
      const existing = gates.get(url);
      if (existing && statusOrder[existing.status] <= statusOrder[status]) return;
      const item = byChecklist.get(url);
      gates.set(url, {
        key: url,
        title: item?.title ?? label,
        detail: item?.detail ?? (item ? undefined : label),
        url,
        status,
        day: existing?.day ?? day.day,
        due: item?.due,
        critical: Boolean(item?.critical),
      });
    });
  });

  checklistItems.forEach((item) => {
    if (!item.critical || !item.url) return;
    if (gates.has(item.url)) return;
    gates.set(item.url, {
      key: item.url,
      title: item.title,
      detail: item.detail,
      url: item.url,
      status: item.due ? "buy-now" : "monitor",
      due: item.due,
      critical: true,
    });
  });

  return [...gates.values()].sort((a, b) => {
    const byStatus = statusOrder[a.status] - statusOrder[b.status];
    if (byStatus !== 0) return byStatus;
    if (a.due && b.due) return a.due < b.due ? -1 : 1;
    if (a.due) return -1;
    if (b.due) return 1;
    return (a.day ?? 99) - (b.day ?? 99);
  });
}

const hebrewMonths = [
  "בינואר",
  "בפברואר",
  "במרץ",
  "באפריל",
  "במאי",
  "ביוני",
  "ביולי",
  "באוגוסט",
  "בספטמבר",
  "באוקטובר",
  "בנובמבר",
  "בדצמבר",
];

export function formatDueHe(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${hebrewMonths[month - 1]}`;
}

/** overdue | soon (14 days) | later — drives the deadline badge color. */
export function dueTone(iso: string, now: Date): "past" | "soon" | "far" {
  const today = now.toISOString().slice(0, 10);
  if (iso < today) return "past";
  const diff = (Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return diff <= 14 ? "soon" : "far";
}
