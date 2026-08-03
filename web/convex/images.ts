import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireFamily } from "./lib/guards";
import { contentTable, type ContentTable } from "./lib/contentPolicy";
import type { QueryCtx } from "./_generated/server";

/** Mirrors `storedImage` in schema.ts — the shape stored on a content row. */
type StoredImage = { storageId: Id<"_storage">; url: string; alt?: string };

export type AttachResult = {
  table: ContentTable;
  key: string;
  slot: "hero" | "gallery";
  storageId: Id<"_storage">;
  url: string;
  deduped: boolean;
  applied: string[];
  pending: string[];
};

type EditResult = { applied: string[]; pending: string[] };

/** Which argument slot a table's patch travels in — see convex/content.ts. */
const PATCH_SLOT: Record<ContentTable, "place" | "day" | "block" | "checklistItem"> = {
  places: "place",
  days: "day",
  blocks: "block",
  checklistItems: "checklistItem",
};

/** The row a content key points at, or null. Read-only twin of content.ts's `resolve`. */
async function resolveContentRow(ctx: QueryCtx, table: ContentTable, key: string) {
  switch (table) {
    case "places":
      return await ctx.db.query("places").withIndex("by_slug", (q) => q.eq("slug", key)).unique();
    case "checklistItems":
      return await ctx.db
        .query("checklistItems")
        .withIndex("by_slug", (q) => q.eq("slug", key))
        .unique();
    case "days": {
      const n = Number(key);
      if (!Number.isInteger(n)) return null;
      return await ctx.db.query("days").withIndex("by_n", (q) => q.eq("n", n)).unique();
    }
    case "blocks": {
      const id = ctx.db.normalizeId("blocks", key);
      return id ? await ctx.db.get("blocks", id) : null;
    }
  }
}

/** An action has `ctx.auth` but no database; `requireFamily` only needs auth. */
async function requireFamilyIdentity(ctx: ActionCtx) {
  return await requireFamily(ctx);
}

/**
 * Pictures: finding them, storing them, and not storing them twice.
 *
 * ## Why any of this exists
 *
 * Every image in this app used to be a file in `web/public/images/` — 120 MB of
 * unoptimised Wikimedia originals (a 2.4 MB JPEG behind a 200 px thumbnail),
 * referenced by path from `places.image` and `days.heroImage`. That meant a
 * photo could only be changed by a commit, so the one thing an agent is
 * genuinely good at here — going and finding a better picture of somewhere —
 * was impossible by construction.
 *
 * Now the bytes live in Convex storage next to the row that points at them, and
 * `search` + `storeFromUrl` are the two halves an agent needs.
 *
 * ## The search layers, and why there is no single provider
 *
 * Whole-web image search has no stable free API left: Google's Custom Search
 * JSON API is discontinued (closing Jan 2027), Brave retired its free tier, and
 * SerpApi is under DMCA litigation from Google. So `search` is layered, and
 * every layer is optional:
 *
 *   1. SERPER      — real Google Images, when SERPER_API_KEY is set in Convex
 *                    env. Best recall, especially for a specific shop.
 *   2. OFFICIAL    — the place's own page, read for `og:image`. Usually the
 *                    best single photo of a restaurant or a café, and the one
 *                    Wikimedia will never have.
 *   3. WIKIMEDIA   — keyless, excellent for temples, stations and landmarks,
 *                    and it hands back a pre-sized thumbnail plus the
 *                    photographer and licence for free.
 *
 * A missing key degrades a layer, never the tool. The reply says which layers
 * actually ran, so the model can tell "nothing found" from "Serper is off".
 */

/** Refuse anything that would be a silly thing to keep for a family trip app. */
const MAX_BYTES = 8_000_000;

/** What we ask a source for. Bigger than any slot we render; next/image resizes. */
const TARGET_WIDTH = 1600;

const MAX_ASSETS = 2000;

/* ========================================================================== */
/* Searching                                                                  */
/* ========================================================================== */

export type ImageSearchResult = {
  query: string;
  /** Which layers actually ran — so "nothing found" is distinguishable from
   *  "Serper is not configured on this deployment". */
  layersRun: string[];
  layersSkipped: string[];
  candidates: ImageCandidate[];
};

export type ImageCandidate = {
  imageUrl: string;
  thumbnailUrl?: string;
  title?: string;
  /** The page the picture appears on, for provenance. */
  pageUrl?: string;
  sourceName: string;
  credit?: string;
  license?: string;
  width?: number;
  height?: number;
};

/** Strip the HTML Wikimedia wraps its `extmetadata` values in. */
function plain(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/<[^>]+>/g, "").trim();
  return text.length > 0 ? text : undefined;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Google Images via Serper. Skipped silently when no key is configured.
 *
 * `npx convex env set SERPER_API_KEY sk_…` turns this on; nothing else changes.
 */
async function searchSerper(query: string, limit: number): Promise<ImageCandidate[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];

  const response = await fetch("https://google.serper.dev/images", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: Math.min(limit * 2, 20) }),
  });
  if (!response.ok) return [];

  const body = (await response.json()) as {
    images?: {
      imageUrl?: string;
      thumbnailUrl?: string;
      title?: string;
      link?: string;
      source?: string;
      imageWidth?: number;
      imageHeight?: number;
    }[];
  };

  return (body.images ?? [])
    .filter((row) => typeof row.imageUrl === "string")
    .slice(0, limit)
    .map((row) => ({
      imageUrl: row.imageUrl!,
      thumbnailUrl: row.thumbnailUrl,
      title: row.title,
      pageUrl: row.link,
      sourceName: row.source ?? hostOf(row.imageUrl!),
      width: row.imageWidth,
      height: row.imageHeight,
    }));
}

/**
 * Wikimedia Commons. No key, and it returns a resized thumbnail directly —
 * so a landmark photo never costs us a 4 MB original download.
 */
async function searchWikimedia(query: string, limit: number): Promise<ImageCandidate[]> {
  const url =
    "https://commons.wikimedia.org/w/api.php?" +
    new URLSearchParams({
      action: "query",
      generator: "search",
      gsrnamespace: "6", // File:
      gsrsearch: query,
      gsrlimit: String(limit),
      prop: "imageinfo",
      iiprop: "url|extmetadata|size",
      iiurlwidth: String(TARGET_WIDTH),
      format: "json",
      origin: "*",
    });

  const response = await fetch(url, {
    headers: { "User-Agent": "japan2026-family-trip/1.0 (private family app)" },
  });
  if (!response.ok) return [];

  const body = (await response.json()) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Record<string, unknown>[] }> };
  };

  const pages = Object.values(body.query?.pages ?? {});
  const out: ImageCandidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info) continue;
    const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
    // `thumburl` is the resized copy; fall back to the original only if absent.
    const imageUrl = (info.thumburl ?? info.url) as string | undefined;
    if (!imageUrl) continue;

    out.push({
      imageUrl,
      thumbnailUrl: info.thumburl as string | undefined,
      title: page.title?.replace(/^File:/, ""),
      pageUrl: info.descriptionurl as string | undefined,
      sourceName: "Wikimedia Commons",
      credit: plain(meta.Artist?.value),
      license: plain(meta.LicenseShortName?.value),
      width: (info.thumbwidth ?? info.width) as number | undefined,
      height: (info.thumbheight ?? info.height) as number | undefined,
    });
  }
  return out;
}

/**
 * The `og:image` of a specific page.
 *
 * This is the layer that covers what the other two miss: a ramen shop's own
 * site has one good photo of the shop, and neither Google Images nor Wikimedia
 * will reliably surface it above stock photography of ramen in general.
 */
async function searchOpenGraph(pageUrl: string): Promise<ImageCandidate[]> {
  let response: Response;
  try {
    response = await fetch(pageUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; japan2026-family-trip/1.0)" },
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];

  const html = (await response.text()).slice(0, 400_000);

  const pick = (pattern: RegExp): string | undefined => pattern.exec(html)?.[1];
  const raw =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ??
    pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (!raw) return [];

  let absolute: string;
  try {
    absolute = new URL(raw, pageUrl).toString();
  } catch {
    return [];
  }

  return [
    {
      imageUrl: absolute,
      title: pick(/<title[^>]*>([^<]+)<\/title>/i)?.trim(),
      pageUrl,
      sourceName: hostOf(pageUrl),
    },
  ];
}

/**
 * Find candidate pictures. Returns URLs only — nothing is stored yet.
 *
 * Deliberately a two-step flow (search, then `storeFromUrl` the one you chose)
 * rather than one "get me a picture" call: the model should look at what came
 * back and pick, and storing ten candidates to keep one is exactly the waste
 * this design is trying to avoid.
 */
export const internalSearch = internalAction({
  args: {
    query: v.string(),
    /** A specific page to read `og:image` from — usually a place's officialUrl. */
    pageUrl: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args): Promise<ImageSearchResult> => {
    const limit = Math.min(Math.max(args.limit ?? 6, 1), 15);
    const layersRun: string[] = [];
    const layersSkipped: string[] = [];

    // Per-layer, so the result can be interleaved rather than filled from
    // whichever layer answered first. Layers run concurrently: they are three
    // independent HTTP calls and the model is waiting on all of them.
    const [official, serper, wikimedia] = await Promise.all([
      args.pageUrl
        ? searchOpenGraph(args.pageUrl).catch(() => {
            layersSkipped.push("official-page (fetch failed)");
            return [] as ImageCandidate[];
          })
        : Promise.resolve([] as ImageCandidate[]),
      process.env.SERPER_API_KEY
        ? searchSerper(args.query, limit).catch(() => {
            layersSkipped.push("serper (request failed)");
            return [] as ImageCandidate[];
          })
        : Promise.resolve([] as ImageCandidate[]),
      searchWikimedia(args.query, limit).catch(() => {
        layersSkipped.push("wikimedia (request failed)");
        return [] as ImageCandidate[];
      }),
    ]);

    if (args.pageUrl) layersRun.push("official-page");
    if (process.env.SERPER_API_KEY) layersRun.push("serper");
    else layersSkipped.push("serper (no SERPER_API_KEY set on this deployment)");
    layersRun.push("wikimedia");

    /*
     * The official page's own photo goes first when there is one — for a
     * restaurant or a shop it is almost always the right picture, and it is the
     * one neither of the other layers will surface.
     *
     * After that, round-robin rather than concatenate. Serper has the best
     * recall so it would otherwise fill every slot, and Wikimedia is the layer
     * that hands back a licence and a photographer — worth always being visible
     * for a temple or a station, where it is also usually the better photo.
     */
    const seen = new Set<string>();
    const candidates: ImageCandidate[] = [];
    const push = (row?: ImageCandidate) => {
      if (!row || seen.has(row.imageUrl) || candidates.length >= limit) return;
      seen.add(row.imageUrl);
      candidates.push(row);
    };

    official.forEach(push);
    for (let i = 0; i < limit; i += 1) {
      push(serper[i]);
      push(wikimedia[i]);
    }

    return { query: args.query, layersRun, layersSkipped, candidates };
  },
});

/**
 * The app's way in — same search, behind a signed-in family member.
 *
 * Deliberately NOT a public unauthenticated action. Every other read in this
 * app is open on purpose (the site is public so it can be server-rendered and
 * precached for offline Japan), but this one spends money on somebody else's
 * API on every call, and an open endpoint that bills us is a different kind of
 * thing from an open endpoint that reads a museum's opening hours.
 *
 * eve and the CLI do not come through here — they hold AGENT_SERVICE_KEY and
 * use `/agent/images/search`, which is gated the same way as every other
 * `/agent` route.
 */
export const search = action({
  args: {
    query: v.string(),
    pageUrl: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ImageSearchResult> => {
    await requireFamilyIdentity(ctx);
    // Annotated because it calls a function in its own file — see the
    // circularity note in convex/_generated/ai/guidelines.md.
    const result: ImageSearchResult = await ctx.runAction(
      internal.images.internalSearch,
      args,
    );
    return result;
  },
});

/* ========================================================================== */
/* Storing                                                                    */
/* ========================================================================== */

export const internalFindBySource = internalQuery({
  args: { sourceUrl: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("imageAssets")
      .withIndex("by_sourceUrl", (q) => q.eq("sourceUrl", args.sourceUrl))
      .first();
    return existing ? { storageId: existing.storageId, url: existing.url } : null;
  },
});

/**
 * Record a stored file, collapsing it onto an identical one if we already have it.
 *
 * The sha256 comes from Convex's `_storage` system table, so "identical" means
 * byte-identical rather than same-URL. That is the check that catches the same
 * photograph pulled from a Wikimedia thumbnail on one day and the article page
 * on another — and it is only possible AFTER storing, which is why the loser is
 * deleted here rather than never uploaded.
 */
export const internalRegisterAsset = internalMutation({
  args: {
    storageId: v.id("_storage"),
    sourceUrl: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    credit: v.optional(v.string()),
    license: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    addedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ storageId: Id<"_storage">; url: string; deduped: boolean }> => {
    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw new Error("Stored file vanished before it could be registered.");

    const twin = await ctx.db
      .query("imageAssets")
      .withIndex("by_sha256", (q) => q.eq("sha256", meta.sha256))
      .first();

    if (twin) {
      // Keep the copy we already had; the new upload is redundant bytes.
      await ctx.storage.delete(args.storageId);
      return { storageId: twin.storageId, url: twin.url, deduped: true };
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Could not mint a URL for the stored file.");

    await ctx.db.insert("imageAssets", {
      storageId: args.storageId,
      url,
      sha256: meta.sha256,
      contentType: meta.contentType ?? "image/jpeg",
      size: meta.size,
      width: args.width,
      height: args.height,
      sourceUrl: args.sourceUrl,
      sourceName: args.sourceName,
      credit: args.credit,
      license: args.license,
      refs: 0,
      addedAt: Date.now(),
      addedBy: args.addedBy,
    });

    return { storageId: args.storageId, url, deduped: false };
  },
});

/**
 * Download a picture and keep it.
 *
 * Storing the bytes rather than the link is the whole point: a photo that lives
 * on a shop's CDN is one redesign away from a broken image, and this app is
 * opened offline, on a phone, in Japan. The same argument the wish list already
 * makes in `trip-agent/agent/lib/convex.ts`.
 */
export const storeFromUrl = internalAction({
  args: {
    url: v.string(),
    sourceName: v.optional(v.string()),
    credit: v.optional(v.string()),
    license: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    addedBy: v.optional(v.string()),
  },
  handler: async (
    ctx: ActionCtx,
    args,
  ): Promise<{ storageId: Id<"_storage">; url: string; deduped: boolean }> => {
    // Free dedup: if this exact URL is already stored, do not download it again.
    const known: { storageId: Id<"_storage">; url: string } | null = await ctx.runQuery(
      internal.images.internalFindBySource,
      { sourceUrl: args.url },
    );
    if (known) return { ...known, deduped: true };

    const response = await fetch(args.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; japan2026-family-trip/1.0)" },
    });
    if (!response.ok) {
      throw new Error(`Could not fetch the image (${response.status}): ${args.url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      throw new Error(`That URL is not an image (${contentType || "unknown type"}): ${args.url}`);
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_BYTES) {
      throw new Error(
        `That image is too large (${Math.round(bytes.byteLength / 1000)} kB). ` +
          "Pick a smaller version — most sources offer one.",
      );
    }

    const storageId = await ctx.storage.store(new Blob([bytes], { type: contentType }));

    return await ctx.runMutation(internal.images.internalRegisterAsset, {
      storageId,
      sourceUrl: args.url,
      sourceName: args.sourceName ?? hostOf(args.pageUrl ?? args.url),
      credit: args.credit,
      license: args.license,
      addedBy: args.addedBy,
    });
  },
});

/* ========================================================================== */
/* Attaching                                                                  */
/* ========================================================================== */

/** The pictures a row already has, so a gallery append knows what it appends to. */
export const internalCurrentImages = internalQuery({
  args: { table: contentTable, key: v.string() },
  handler: async (ctx, args): Promise<{ hero?: StoredImage; gallery: StoredImage[] } | null> => {
    const row = await resolveContentRow(ctx, args.table, args.key);
    if (!row) return null;
    return {
      hero: "hero" in row ? (row.hero as StoredImage | undefined) : undefined,
      gallery: "gallery" in row ? ((row.gallery as StoredImage[] | undefined) ?? []) : [],
    };
  },
});

/**
 * Put a picture on a place, day, block or checklist item — in one call.
 *
 * This is the shape an agent actually needs. The alternative is making the
 * model store a URL, remember a storageId, read the current gallery, append to
 * it and send the whole array back — five steps where four of them are
 * bookkeeping it can get wrong, on a slot it cannot see.
 *
 * It goes through the ordinary content-edit path rather than patching the row
 * directly, which is the point: `hero` and `gallery` are FACT fields, so the
 * tier rule in `lib/contentPolicy.ts` applies to them exactly as it applies to
 * opening hours, and there is still only one place where a content write can
 * happen.
 */
export const attach = internalAction({
  args: {
    table: contentTable,
    key: v.string(),
    slot: v.union(v.literal("hero"), v.literal("gallery")),
    /** A picture to fetch and keep. Ignored when `storageId` is given. */
    url: v.optional(v.string()),
    /** An already-stored file, e.g. a second use of one we have. */
    storageId: v.optional(v.id("_storage")),
    alt: v.optional(v.string()),
    sourceName: v.optional(v.string()),
    credit: v.optional(v.string()),
    license: v.optional(v.string()),
    pageUrl: v.optional(v.string()),
    /**
     * The family member this is on behalf of. Present => eve, fact tier.
     * Absent => a terminal holding the deploy key, full tier.
     */
    byEmail: v.optional(v.string()),
    /** Cap on gallery size, so a keen agent cannot pile up forty photos. */
    maxGallery: v.optional(v.number()),
  },
  handler: async (ctx: ActionCtx, args): Promise<AttachResult> => {
    const current: { hero?: StoredImage; gallery: StoredImage[] } | null = await ctx.runQuery(
      internal.images.internalCurrentImages,
      { table: args.table, key: args.key },
    );
    if (!current) throw new Error(`No ${args.table} row with key "${args.key}".`);

    let stored: { storageId: Id<"_storage">; url: string; deduped: boolean };
    if (args.storageId) {
      const asset: Doc<"imageAssets"> | null = await ctx.runQuery(internal.images.internalAssetFor, {
        storageId: args.storageId,
      });
      if (!asset) throw new Error("That storageId is not a picture this app knows about.");
      stored = { storageId: asset.storageId, url: asset.url, deduped: true };
    } else if (args.url) {
      stored = await ctx.runAction(internal.images.storeFromUrl, {
        url: args.url,
        sourceName: args.sourceName,
        credit: args.credit,
        license: args.license,
        pageUrl: args.pageUrl,
        addedBy: args.byEmail ?? "terminal",
      });
    } else {
      throw new Error("Give either a `url` to fetch or an existing `storageId`.");
    }

    const image: StoredImage = { storageId: stored.storageId, url: stored.url, alt: args.alt };

    let patch: Record<string, unknown>;
    if (args.slot === "hero") {
      patch = { hero: image };
    } else {
      const cap = Math.min(args.maxGallery ?? 5, 12);
      // Already there: replace in place rather than adding the same photo twice.
      const without = current.gallery.filter((row) => row.storageId !== stored.storageId);
      patch = { gallery: [...without, image].slice(-cap) };
    }

    const arg = PATCH_SLOT[args.table];
    const result: EditResult = args.byEmail
      ? await ctx.runMutation(internal.content.internalEditFor, {
          byEmail: args.byEmail,
          table: args.table,
          op: "patch",
          key: args.key,
          [arg]: patch,
        } as never)
      : await ctx.runMutation(internal.content.internalEditAsOwner, {
          table: args.table,
          op: "patch",
          key: args.key,
          [arg]: patch,
          actorName: "terminal",
        } as never);

    return {
      table: args.table,
      key: args.key,
      slot: args.slot,
      storageId: stored.storageId,
      url: stored.url,
      /** True when we already had these exact bytes and stored nothing new. */
      deduped: stored.deduped,
      applied: result.applied,
      pending: result.pending,
    };
  },
});

/* ========================================================================== */
/* Housekeeping                                                               */
/* ========================================================================== */

/** Every storageId any content row currently points at. */
async function referencedStorageIds(ctx: MutationCtx): Promise<Set<string>> {
  const used = new Set<string>();
  const add = (image?: { storageId: Id<"_storage"> } | null) => {
    if (image) used.add(image.storageId);
  };
  const addAll = (images?: { storageId: Id<"_storage"> }[] | null) => {
    for (const image of images ?? []) add(image);
  };

  for (const row of await ctx.db.query("places").take(MAX_ASSETS)) {
    add(row.hero);
    addAll(row.gallery);
  }
  for (const row of await ctx.db.query("days").take(MAX_ASSETS)) {
    add(row.hero);
    addAll(row.gallery);
  }
  for (const row of await ctx.db.query("blocks").take(MAX_ASSETS)) {
    addAll(row.gallery);
  }
  for (const row of await ctx.db.query("checklistItems").take(MAX_ASSETS)) {
    add(row.hero);
  }
  for (const row of await ctx.db.query("guides").take(MAX_ASSETS)) {
    add(row.hero);
  }
  for (const row of await ctx.db.query("wishes").take(MAX_ASSETS)) {
    addAll(row.images);
  }
  return used;
}

/**
 * Recount references and, optionally, delete the files nothing points at.
 *
 * `refs` is RECOMPUTED rather than incremented on every attach and detach.
 * Incremental counters are the classic way to end up deleting a picture that is
 * still on screen: one missed decrement and a file leaks forever, one missed
 * increment and it is collected while a page still renders it. These tables are
 * ~500 rows in total, so counting them properly costs nothing and cannot drift.
 *
 * `apply: false` (the default) reports what WOULD go, which is the only sane
 * default for something that deletes.
 */
export const sweep = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const used = await referencedStorageIds(ctx);
    const assets = await ctx.db.query("imageAssets").take(MAX_ASSETS);

    const orphans: { id: Id<"imageAssets">; storageId: Id<"_storage">; size: number }[] = [];

    for (const asset of assets) {
      const refs = used.has(asset.storageId) ? 1 : 0;
      if (asset.refs !== refs) await ctx.db.patch("imageAssets", asset._id, { refs });
      if (refs === 0) {
        orphans.push({ id: asset._id, storageId: asset.storageId, size: asset.size });
      }
    }

    if (args.apply) {
      for (const orphan of orphans) {
        await ctx.storage.delete(orphan.storageId);
        await ctx.db.delete("imageAssets", orphan.id);
      }
    }

    return {
      assets: assets.length,
      referenced: used.size,
      orphans: orphans.length,
      bytesReclaimable: orphans.reduce((sum, o) => sum + o.size, 0),
      deleted: args.apply === true,
    };
  },
});

/**
 * Set a guide's cover photo.
 *
 * Guides are not one of the four `contentTable` tables — their body is prose,
 * edited through `convex/suggestions.ts` — so they do not travel the generic
 * content-edit path and need their own way in. A cover photo is not prose, and
 * it is a FACT like every other picture, so this applies directly.
 */
export const internalSetGuideHero = internalMutation({
  args: {
    slug: v.string(),
    storageId: v.id("_storage"),
    alt: v.optional(v.string()),
    actorName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const guide = await ctx.db
      .query("guides")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!guide) throw new Error(`No guide with slug "${args.slug}".`);

    const asset = await ctx.db
      .query("imageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
    if (!asset) throw new Error("That storageId is not a picture this app knows about.");

    await ctx.db.patch("guides", guide._id, {
      hero: { storageId: args.storageId, url: asset.url, alt: args.alt },
      updatedAt: Date.now(),
      updatedBy: args.actorName ?? "terminal",
    });
    return { slug: args.slug, url: asset.url };
  },
});

/**
 * Re-mint every cached image URL against THIS deployment.
 *
 * ## Why this has to exist
 *
 * `storedImage.url` is cached rather than minted per read, because minting is a
 * call per picture and a place list renders 154 of them. The cost of that
 * choice is exactly one thing: the cached URL names the deployment it was
 * minted on.
 *
 * So the moment data is copied between deployments — `npm run sync:to-prod`,
 * or any `convex import` of a snapshot from elsewhere — every row still points
 * at the deployment it came from. The images would still LOAD, which is what
 * makes it dangerous: production would quietly serve its photographs out of the
 * dev deployment, and keep working right up until dev is wiped.
 *
 * storageIds survive the copy, so re-deriving is enough. Run it on the target
 * immediately after any import:
 *
 *   npx convex run --prod images:internalRemintUrls '{"apply":true}'
 *
 * Defaults to a dry run, because it rewrites every image reference in the app.
 */
export const internalRemintUrls = internalMutation({
  args: { apply: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let checked = 0;
    let stale = 0;
    const missing: string[] = [];

    /** The URL this deployment would mint for a file, or null if it is gone. */
    const current = async (storageId: Id<"_storage">): Promise<string | null> => {
      checked += 1;
      return await ctx.storage.getUrl(storageId);
    };

    const remint = async (
      image: StoredImage | undefined,
      label: string,
    ): Promise<StoredImage | undefined> => {
      if (!image) return image;
      const url = await current(image.storageId);
      if (!url) {
        missing.push(label);
        return image;
      }
      if (url === image.url) return image;
      stale += 1;
      return { ...image, url };
    };

    const remintAll = async (
      images: StoredImage[] | undefined,
      label: string,
    ): Promise<StoredImage[] | undefined> => {
      if (!images?.length) return images;
      return await Promise.all(images.map((image, i) => remint(image, `${label}[${i}]`) as Promise<StoredImage>));
    };

    for (const row of await ctx.db.query("imageAssets").take(MAX_ASSETS)) {
      const url = await current(row.storageId);
      if (!url) {
        missing.push(`imageAssets/${row._id}`);
        continue;
      }
      if (url === row.url) continue;
      stale += 1;
      if (args.apply) await ctx.db.patch("imageAssets", row._id, { url });
    }

    for (const row of await ctx.db.query("places").take(MAX_ASSETS)) {
      const hero = await remint(row.hero, `places/${row.slug}.hero`);
      const gallery = await remintAll(row.gallery, `places/${row.slug}.gallery`);
      if (args.apply && (hero !== row.hero || gallery !== row.gallery)) {
        await ctx.db.patch("places", row._id, { hero, gallery });
      }
    }

    for (const row of await ctx.db.query("days").take(MAX_ASSETS)) {
      const hero = await remint(row.hero, `days/${row.n}.hero`);
      const gallery = await remintAll(row.gallery, `days/${row.n}.gallery`);
      if (args.apply && (hero !== row.hero || gallery !== row.gallery)) {
        await ctx.db.patch("days", row._id, { hero, gallery });
      }
    }

    for (const row of await ctx.db.query("blocks").take(MAX_ASSETS)) {
      const gallery = await remintAll(row.gallery, `blocks/${row._id}.gallery`);
      if (args.apply && gallery !== row.gallery) {
        await ctx.db.patch("blocks", row._id, { gallery });
      }
    }

    for (const row of await ctx.db.query("checklistItems").take(MAX_ASSETS)) {
      const hero = await remint(row.hero, `checklistItems/${row.slug}.hero`);
      if (args.apply && hero !== row.hero) await ctx.db.patch("checklistItems", row._id, { hero });
    }

    for (const row of await ctx.db.query("guides").take(MAX_ASSETS)) {
      const hero = await remint(row.hero, `guides/${row.slug}.hero`);
      if (args.apply && hero !== row.hero) await ctx.db.patch("guides", row._id, { hero });
    }

    return {
      checked,
      /** References whose cached URL names a different deployment. */
      stale,
      rewritten: args.apply === true ? stale : 0,
      /** Files the row points at that do not exist here — a broken copy. */
      missing,
      applied: args.apply === true,
    };
  },
});

/** Provenance for one stored picture — who took it, where it came from. */
export const internalAssetFor = internalQuery({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args): Promise<Doc<"imageAssets"> | null> => {
    return await ctx.db
      .query("imageAssets")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .first();
  },
});
