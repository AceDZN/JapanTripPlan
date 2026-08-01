import { marked } from "marked";

/**
 * Guide markdown -> HTML, rendered on the server.
 *
 * This used to happen in `scripts/sync-content.mjs` at build time, writing
 * `app/generated/trip-content.ts`. That made the guide pages a THIRD copy of
 * the trip — Convex, the markdown export, and a checked-in TypeScript blob —
 * and only the first is authoritative. Rendering here lets the pages read
 * Convex like every other page does.
 */
export function renderGuideHtml(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true, breaks: false });
}

/**
 * Does this guide body read right-to-left?
 *
 * The guides were authored in English and are being translated to Hebrew one
 * at a time, so direction has to be decided per document rather than set once
 * for the section. Counting script beats a flag nobody remembers to flip.
 */
export function isRtl(text: string): boolean {
  const hebrew = text.match(/[֐-׿]/g)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  // Hebrew prose keeps Latin proper nouns (station and store names) on purpose,
  // so the test is "is there meaningful Hebrew", not "is there no Latin".
  return hebrew > 0 && hebrew * 4 > latin;
}
