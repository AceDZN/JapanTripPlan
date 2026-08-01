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

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

const generatedDir = path.resolve(process.cwd(), "app", "generated");

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set — the guides live in Convex now, so this " +
      "script cannot run without it. Locally it comes from web/.env.local; on " +
      "Vercel it is a project environment variable.",
  );
}

const convex = new ConvexHttpClient(CONVEX_URL);

const index = await convex.query(api.trip.listGuides, {});

/*
 * One request per guide rather than one for everything: `listGuides` is
 * metadata-only by design (see convex/trip.ts) so the listing stays small, and
 * `getGuide` is the only thing that returns a body.
 */
const guides = await Promise.all(
  index.map(async ({ slug }) => {
    const guide = await convex.query(api.trip.getGuide, { slug });
    if (!guide) throw new Error(`Guide "${slug}" vanished between listing and fetch.`);
    return { file: guide.file, title: guide.title, markdown: guide.body };
  }),
);

// A build that silently shipped an empty system prompt would leave the chat
// confidently answering from nothing at all, which is worse than not building.
if (guides.length === 0) {
  throw new Error("Convex returned no guides — refusing to write an empty AI context.");
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
