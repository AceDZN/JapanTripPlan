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
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  return wrapTables(html);
}

/**
 * Give every guide table its own horizontal scroller.
 *
 * The operational tables are the densest thing in the guides — the transport
 * sheet is five columns wide and one of them holds a full route description
 * ("טבטה ← JR דרך טוקיו/שימבאשי ← חיבור Yokosuka/Tokaido לקמקורה…"). Left to
 * fit the container, that column lands around 160px and the prose ribbons down
 * one or two words per line, making a single row taller than the phone screen.
 *
 * The table therefore needs to size to its CONTENT and scroll sideways. It
 * cannot do that as its own scroller: a `display: block` table with
 * `width: max-content` grows the element itself, and then the whole page
 * scrolls horizontally instead of the table. So the scroller has to be a
 * separate box around it, which is what this adds. The CSS in `globals.css`
 * pairs with it — `.table-scroll` owns `overflow-x`, the table owns
 * `width: max-content`.
 *
 * Done as a string rewrite rather than a `marked` renderer override because it
 * is purely presentational packaging: the token stream, the cell markup and the
 * escaping all stay exactly as `marked` produced them.
 */
function wrapTables(html: string): string {
  return html.replace(
    /<table[\s\S]*?<\/table>/g,
    (table) => `<div class="table-scroll" tabindex="0">${table}</div>`,
  );
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
