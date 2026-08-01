/**
 * Convex -> `app/generated/ai-context.ts`.
 *
 *   npm run sync:content
 *
 * The chat's system prompt needs every guide's Markdown as a plain string at
 * module scope rather than behind an await, so it is baked into a generated
 * TypeScript file at build time. This script is what bakes it.
 *
 * ## Why this reads Convex and not the filesystem
 *
 * It used to read `../JAPAN2026/*.md` and also copy them into `public/markdown/`
 * for the guide pages' download links. Both are gone: the trip lives in Convex,
 * the app is Convex-only, and a copy of the guides on disk was a second source
 * that could silently disagree with the first.
 *
 * ## Why the PUBLIC client, with no service key
 *
 * Guides are public data — `convex/lib/guards.ts` says so explicitly, and that
 * is what lets every guide page be server-rendered and precached for offline
 * use. So this needs only `NEXT_PUBLIC_CONVEX_URL`, which any build that can
 * run the app already has. Deliberately NOT `AGENT_SERVICE_KEY`: a production
 * build should never be hostage to a credential the app itself never uses. It
 * was, briefly, and it broke the Vercel deploy.
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const generatedDir = path.resolve(process.cwd(), "app", "generated");
const outFile = path.join(generatedDir, "ai-context.ts");

/**
 * Refreshing the chat's context must never take down a deploy.
 *
 * `ai-context.ts` is committed, so a build that cannot reach Convex can still
 * ship with the last known-good guides. Exiting non-zero here has broken a
 * Vercel deploy twice now — once on a missing `.env.local`, once on a wrong
 * Convex host — and "the chat's context is a commit behind" beats "the site is
 * not deployed" every time.
 *
 * The one case that still fails hard is having no committed file to fall back
 * to, because then the alternative is shipping an assistant that confidently
 * answers from nothing.
 */
function keepCommittedContext(reason) {
  if (existsSync(outFile)) {
    console.log(`sync:content: ${reason} — keeping the committed ai-context.ts`);
    process.exit(0);
  }
  console.error(`sync:content: ${reason}, and no committed ai-context.ts to fall back to.`);
  process.exit(1);
}

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  keepCommittedContext("NEXT_PUBLIC_CONVEX_URL is not set");
}

const convex = new ConvexHttpClient(CONVEX_URL);

let index;
try {
  index = await convex.query(api.trip.listGuides, {});
} catch (error) {
  keepCommittedContext(`could not reach Convex at ${CONVEX_URL} (${error})`);
}

/*
 * One request per guide rather than one for everything: `listGuides` is
 * metadata-only by design (see convex/trip.ts) so the listing stays small, and
 * `getGuide` is the only thing that returns a body.
 */
let guides;
try {
  guides = await Promise.all(
    index.map(async ({ slug }) => {
      const guide = await convex.query(api.trip.getGuide, { slug });
      if (!guide) throw new Error(`guide "${slug}" vanished between listing and fetch`);
      return { file: guide.file, title: guide.title, markdown: guide.body };
    }),
  );
} catch (error) {
  keepCommittedContext(`could not read guide bodies (${error})`);
}

// An empty context would leave the chat confidently answering from nothing,
// which is worse than keeping yesterday's copy.
if (guides.length === 0) {
  keepCommittedContext("Convex returned no guides");
}

const aiContextText = guides
  .map((entry) => `## FILE: ${entry.file}\n\n${entry.markdown}`)
  .join("\n\n---\n\n");

const aiOutput = `// Generated from Convex (\`trip.listGuides\` + \`trip.getGuide\`) — do not edit by hand.
export type AiContextFile = {
  file: string;
  title: string;
  markdown: string;
};

export const aiContext: AiContextFile[] = ${JSON.stringify(guides, null, 2)};

export const aiContextText: string = ${JSON.stringify(aiContextText)};
`;

await mkdir(generatedDir, { recursive: true });
await writeFile(path.join(generatedDir, "ai-context.ts"), aiOutput, "utf8");

console.log(
  `Synced ${guides.length} guides from Convex into ai-context.ts (${aiContextText.length} context chars).`,
);
