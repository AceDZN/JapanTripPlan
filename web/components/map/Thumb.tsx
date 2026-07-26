"use client";

import { useState, type CSSProperties } from "react";
import type { Place } from "@/lib/types";
import { CategoryIcon, categoryTone } from "@/components/visuals";

/**
 * Square place thumbnail that degrades to the category gradient both when the
 * place has no image *and* when the file 404s (images land in a separate wave).
 */
export function Thumb({ place, className = "" }: { place: Place; className?: string }) {
  const [failed, setFailed] = useState(false);
  const tone = categoryTone[place.category] ?? "#e34234";
  const style = { "--tone": tone } as CSSProperties;
  const classes = `photo ${className}`.trim();

  if (!place.image || failed) {
    return (
      <div className={classes} style={style} aria-hidden>
        <div className="photo-fallback">
          <CategoryIcon category={place.category} size={20} />
          <span className="jp">日</span>
        </div>
      </div>
    );
  }

  return (
    <div className={classes} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={place.image}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
