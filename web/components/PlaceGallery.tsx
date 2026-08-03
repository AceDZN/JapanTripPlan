import Image from "next/image";
import type { StoredImage } from "@/lib/types";

/**
 * The hero plus its extra angles, as a swipeable strip.
 *
 * Why a strip and not a lightbox or a slideshow: the question this answers is
 * "what does this actually look like, is it worth the detour" — the same
 * question a row of thumbnails on a Google result answers in about a second.
 * A slideshow makes you wait for that, and a lightbox makes you tap for it.
 *
 * Renders nothing when there are no extra pictures, so a place with only a hero
 * looks exactly as it did before galleries existed. Below three it stays a
 * simple row; the horizontal scroll only matters once there are more.
 */
export function PlaceGallery({
  hero,
  gallery = [],
  name,
  tone,
}: {
  hero?: StoredImage;
  gallery?: StoredImage[];
  name: string;
  tone?: string;
}) {
  // The hero leads, then the extras — deduped, because attaching the same photo
  // to both slots is an easy thing for an agent to do and a silly thing to show.
  const seen = new Set<string>();
  const images = [...(hero ? [hero] : []), ...gallery].filter((image) => {
    if (seen.has(image.storageId)) return false;
    seen.add(image.storageId);
    return true;
  });

  if (images.length < 2) return null;

  return (
    <div
      className="place-gallery"
      style={tone ? ({ "--tone": tone } as React.CSSProperties) : undefined}
      role="group"
      aria-label={`תמונות של ${name}`}
    >
      {images.map((image) => (
        <div
          className="place-gallery-shot"
          key={image.storageId}
          /*
           * Containment inline, not only in the stylesheet.
           *
           * `next/image` with `fill` renders `position:absolute; inset:0`, which
           * finds the nearest POSITIONED ancestor. If `.place-gallery-shot`'s
           * rule is missing for any reason — a stale cached stylesheet, a CSS
           * chunk that failed to load — that ancestor becomes `.day-hero`, and
           * a 132px thumbnail silently paints itself full-bleed over the page
           * hero. That is not a hypothetical; it is what happened.
           *
           * These three properties are the difference between "the picture is
           * unstyled" and "the picture is somewhere else entirely", so they do
           * not live anywhere they can be dropped.
           */
          style={{ position: "relative", overflow: "hidden" }}
        >
          <Image
            src={image.url}
            alt={image.alt ?? name}
            fill
            sizes="(max-width: 640px) 60vw, 240px"
            loading="lazy"
          />
        </div>
      ))}
    </div>
  );
}
