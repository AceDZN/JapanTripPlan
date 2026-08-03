import {
  AlertTriangle,
  Banknote,
  BedDouble,
  Bus,
  CableCar,
  Car,
  Clock3,
  DoorOpen,
  ExternalLink,
  Footprints,
  Package,
  Plane,
  Ship,
  Train,
  TrainFront,
} from "lucide-react";
import type { ComponentType } from "react";
import type {
  CostLine,
  Label,
  LinkKind,
  RefLink,
  TransportLeg,
  TransportMode,
  TripDay,
} from "@/lib/types";
import {
  costBasisLabels,
  durationHe,
  familyTotal,
  labelForeign,
  legsFare,
  transportModeLabels,
  yen,
} from "@/lib/ops";
import { CopyButton } from "@/components/CopyButton";

/**
 * The operational half of a day, as UI.
 *
 * Everything here answers a question that gets asked while standing up, tired,
 * possibly offline: which train, which exit, how much, what do I need in my
 * hand, what closes at 15:00, and where do I sleep tonight. It is deliberately
 * dense and deliberately scannable — prose is what these pages had too much of.
 */

const modeIcons: Record<TransportMode, ComponentType<{ size?: number }>> = {
  train: TrainFront,
  subway: Train,
  walk: Footprints,
  bus: Bus,
  taxi: Car,
  plane: Plane,
  ferry: Ship,
  cablecar: CableCar,
  monorail: Train,
};

const linkKindLabels: Record<LinkKind, string> = {
  official: "אתר רשמי",
  tickets: "כרטיסים",
  timetable: "לוח זמנים",
  map: "מפה",
  hours: "שעות פתיחה",
  menu: "תפריט",
  access: "הגעה",
};

/** Hebrew name with its Latin/Japanese forms attached, for reading off signs. */
export function NameLabel({ label, strong = false }: { label: Label; strong?: boolean }) {
  const foreign = labelForeign(label);
  return (
    <span className="name-label">
      {strong ? <strong>{label.he}</strong> : <span>{label.he}</span>}
      {foreign ? (
        <span className="name-foreign" dir="ltr">
          {foreign}
        </span>
      ) : null}
    </span>
  );
}

function Leg({ leg }: { leg: TransportLeg }) {
  const Icon = modeIcons[leg.mode];
  const meta = [
    leg.durationMin ? durationHe(leg.durationMin) : null,
    leg.fareYen ? `${yen(leg.fareYen)} לאדם` : null,
    leg.fareNote,
    leg.platform ? `רציף ${leg.platform}` : null,
  ].filter(Boolean);

  return (
    <li className="leg">
      <span className="leg-icon" aria-hidden>
        <Icon size={15} />
      </span>
      <div className="leg-body">
        <p className="leg-route">
          <NameLabel label={leg.from} />
          <span className="leg-arrow" aria-label="עד">
            ←
          </span>
          <NameLabel label={leg.to} strong />
        </p>

        {leg.line || leg.direction ? (
          <p className="leg-line">
            <span className="leg-mode">{transportModeLabels[leg.mode]}</span>
            {leg.line ? <NameLabel label={leg.line} /> : null}
            {leg.direction ? (
              <span className="leg-direction">
                לכיוון <NameLabel label={leg.direction} />
              </span>
            ) : null}
          </p>
        ) : null}

        {leg.depart || leg.arrive ? (
          <p className="leg-times" dir="ltr">
            {leg.depart ?? "—"} → {leg.arrive ?? "—"}
          </p>
        ) : null}

        {meta.length > 0 ? (
          <p className="leg-meta">
            {meta.map((item) => (
              <span key={String(item)}>{item}</span>
            ))}
          </p>
        ) : null}

        {leg.exit ? (
          <p className="leg-exit">
            <DoorOpen size={13} />
            יציאה: <NameLabel label={leg.exit} />
          </p>
        ) : null}

        {leg.transferNote ? <p className="leg-note">{leg.transferNote}</p> : null}
        {leg.gotcha ? (
          <p className="leg-gotcha">
            <AlertTriangle size={13} />
            {leg.gotcha}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function RouteStrip({ legs }: { legs: TransportLeg[] }) {
  if (legs.length === 0) return null;
  const fare = legsFare(legs);

  return (
    <div className="ops ops-route">
      <p className="ops-head">
        <TrainFront size={14} />
        איך מגיעים
        {fare > 0 ? (
          <span className="ops-head-aside">
            {yen(fare)} לאדם · {yen(fare * 4)} למשפחה
          </span>
        ) : null}
      </p>
      <ol className="legs">
        {legs.map((leg, index) => (
          <Leg leg={leg} key={`${leg.from.he}-${leg.to.he}-${index}`} />
        ))}
      </ol>
    </div>
  );
}

export function CostList({ costs }: { costs: CostLine[] }) {
  if (costs.length === 0) return null;
  const total = familyTotal(costs);

  return (
    <div className="ops ops-cost">
      <p className="ops-head">
        <Banknote size={14} />
        כמה זה עולה
      </p>
      <ul className="cost-lines">
        {costs.map((line, index) => (
          <li key={`${line.label}-${index}`}>
            <span className="cost-label">
              {line.label}
              {line.note ? <small>{line.note}</small> : null}
            </span>
            <span className="cost-amount" dir="ltr">
              {yen(line.yen)}
              <small>{costBasisLabels[line.basis]}</small>
            </span>
          </li>
        ))}
        <li className="cost-total">
          <span className="cost-label">סה״כ למשפחה</span>
          <span className="cost-amount" dir="ltr">
            {yen(total)}
          </span>
        </li>
      </ul>
    </div>
  );
}

export function NeedsList({ needs }: { needs: string[] }) {
  if (needs.length === 0) return null;
  return (
    <div className="ops ops-needs">
      <p className="ops-head">
        <Package size={14} />
        מה צריך להיות ביד
      </p>
      <ul className="ops-bullets">
        {needs.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <div className="ops ops-warn">
      <p className="ops-head">
        <AlertTriangle size={14} />
        לא לפספס
      </p>
      <ul className="ops-bullets">
        {warnings.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function LinkRow({ links }: { links: RefLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="ops-links">
      {links.map((link) => (
        <a
          className="ops-link"
          href={link.url}
          key={link.url + link.label}
          target="_blank"
          rel="noreferrer"
        >
          <span className="ops-link-kind">{linkKindLabels[link.kind]}</span>
          {link.label}
          <ExternalLink size={11} />
        </a>
      ))}
    </div>
  );
}

/**
 * Where we sleep tonight.
 *
 * The Japanese address gets a copy button because the realistic use is handing
 * a phone to a driver or pasting it into a maps app, not reading it aloud.
 */
export function StayPanel({ stay }: { stay: NonNullable<TripDay["stay"]> }) {
  return (
    <section className="panel stay-panel">
      <h2>
        <BedDouble size={16} />
        איפה ישנים הלילה
      </h2>
      <p className="stay-label">{stay.label}</p>

      {stay.checkIn || stay.checkOut ? (
        <p className="stay-times">
          <Clock3 size={13} />
          {stay.checkIn ? `צ׳ק־אין ${stay.checkIn}` : null}
          {stay.checkIn && stay.checkOut ? " · " : null}
          {stay.checkOut ? `צ׳ק־אאוט ${stay.checkOut}` : null}
        </p>
      ) : null}

      {stay.addressJa ? (
        <div className="stay-address">
          <span dir="ltr" lang="ja">
            {stay.addressJa}
          </span>
          <CopyButton value={stay.addressJa} label="העתקת הכתובת ביפנית" />
        </div>
      ) : null}

      {stay.note ? <p className="stay-note">{stay.note}</p> : null}

      {stay.url ? (
        <a className="text-link" href={stay.url} target="_blank" rel="noreferrer">
          פרטי ההזמנה
          <ExternalLink size={13} />
        </a>
      ) : null}
    </section>
  );
}
