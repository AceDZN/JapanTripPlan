import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import {
  BedDouble,
  Gamepad2,
  Heart,
  Landmark,
  Mountain,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Train,
  Trees,
  UtensilsCrossed,
} from "lucide-react";
import type { BookingStatus, PlaceCategory } from "@/lib/types";
import { bookingStatusLabels } from "@/lib/labels";

/** Identity color per place category — also used for photo fallbacks. */
export const categoryTone: Record<PlaceCategory, string> = {
  attraction: "#e34234",
  food: "#e07a3c",
  shopping: "#b5539c",
  nature: "#2f8f5b",
  culture: "#2b3072",
  gaming: "#3b6ee0",
  kawaii: "#f5a3b3",
  viewpoint: "#17a2a2",
  stay: "#6c7192",
  transport: "#4a5a8a",
  event: "#f2b134",
};

const categoryIcon: Record<PlaceCategory, typeof Sparkles> = {
  attraction: Sparkles,
  food: UtensilsCrossed,
  shopping: ShoppingBag,
  nature: Trees,
  culture: Landmark,
  gaming: Gamepad2,
  kawaii: Heart,
  viewpoint: Mountain,
  stay: BedDouble,
  transport: Train,
  event: PartyPopper,
};

export function CategoryIcon({
  category,
  size = 16,
}: {
  category: PlaceCategory;
  size?: number;
}) {
  const Icon = categoryIcon[category] ?? Sparkles;
  return <Icon size={size} strokeWidth={1.8} aria-hidden />;
}

/**
 * Photo with a graceful, never-broken fallback: when no file exists we paint a
 * category-tinted gradient with the category glyph and a 日 accent.
 */
export function Photo({
  src,
  alt = "",
  className = "",
  tone = "#e34234",
  category,
  priority = false,
}: {
  src?: string;
  alt?: string;
  className?: string;
  tone?: string;
  category?: PlaceCategory;
  priority?: boolean;
}) {
  const style = { "--tone": tone } as CSSProperties;

  if (!src) {
    return (
      <div className={`photo ${className}`.trim()} style={style} aria-hidden>
        <div className="photo-fallback">
          {category ? <CategoryIcon category={category} size={26} /> : null}
          <span className="jp">日</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`photo ${className}`.trim()} style={style}>
      {/*
        `fill` rather than explicit dimensions: `.photo` is already
        `position: relative` with a 100%/`object-fit: cover` child, so the
        wrapper decides the size and the intrinsic dimensions of a stored
        picture are neither known here nor relevant.

        `sizes` is what stops the optimiser generating a 3840px variant for a
        thumbnail. These are the real breakpoints the grids use — getting it
        wrong is billed per transformation and downloaded by a phone in Japan.
      */}
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw"
        priority={priority}
        loading={priority ? undefined : "lazy"}
      />
    </div>
  );
}

export function StatusChip({
  status,
  label,
  href,
}: {
  status: BookingStatus;
  label?: ReactNode;
  href?: string;
}) {
  const className = `status-chip st-${status}`;
  const content = label ?? bookingStatusLabels[status];

  if (href) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  return <span className={className}>{content}</span>;
}
