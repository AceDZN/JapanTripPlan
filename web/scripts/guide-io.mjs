#!/usr/bin/env node
/**
 * Pull a guide's markdown out of Convex to a file, and push an edited file back.
 *
 * `internalUpsertGuide` replaces the whole body, so editing prose safely means
 * round-tripping it through a file rather than doing string surgery inline.
 *
 *   node scripts/guide-io.mjs pull <slug> <path>
 *   node scripts/guide-io.mjs push <slug> <path>
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const [, , cmd, slug, path] = process.argv;

if (!cmd || !slug || !path) {
  console.error("usage: guide-io.mjs pull|push <slug> <path>");
  process.exit(1);
}

const convex = async (fn, args) => {
  const { stdout } = await run("npx", ["convex", "run", fn, JSON.stringify(args)], {
    cwd: process.cwd(),
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim() ? JSON.parse(stdout) : null;
};

const META = "meta.json";

if (cmd === "pull") {
  const guide = await convex("trip:getGuide", { slug });
  if (!guide) throw new Error(`no guide "${slug}"`);
  await writeFile(path, guide.bodyHe ?? guide.body ?? "", "utf8");
  await writeFile(
    `${path}.${META}`,
    JSON.stringify(
      {
        slug: guide.slug,
        file: guide.file,
        order: guide.order,
        titleHe: guide.titleHe ?? guide.title,
        descriptionHe: guide.descriptionHe ?? guide.description,
        category: guide.category,
        generated: guide.generated ?? false,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`pulled ${slug} -> ${path}`);
} else if (cmd === "push") {
  const bodyHe = await readFile(path, "utf8");
  // Body only: `internalUpsertGuide` would replace the row and take the hero
  // with it. See the comment on `internalPatchGuideBody`.
  await convex("suggestions:internalPatchGuideBody", {
    slug,
    bodyHe,
    updatedBy: "content-cli",
  });
  console.log(`pushed ${path} -> ${slug} (${bodyHe.length} chars)`);
} else {
  console.error(`unknown command "${cmd}"`);
  process.exit(1);
}
