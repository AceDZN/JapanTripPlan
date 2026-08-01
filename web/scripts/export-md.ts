/**
 * Convex -> `JAPAN2026/*.md`.
 *
 *   npm run export:md            write the files
 *   npm run export:md -- --check verify the round-trip, write nothing
 *
 * This is the half of the migration that makes Convex safe to depend on. The
 * trip lives in Convex, but it is never *trapped* there: these files stay
 * readable, diffable and git-tracked, and can be regenerated at any time.
 *
 * After the cutover these files are BUILD OUTPUT. Do not hand-edit them —
 * edits belong in Convex (via the app, the eve agent, or the trip-edit skill)
 * and land here on the next export.
 *
 * `--check` is what runs in CI and alongside the parity gate: it asserts the
 * export is byte-identical to what is on disk, so a broken renderer surfaces
 * as a failure rather than as silently corrupted backups.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const guidesDir = path.resolve(here, "..", "..", "JAPAN2026");

const SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
const KEY = process.env.AGENT_SERVICE_KEY;

if (!SITE_URL) throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set (check web/.env.local)");
if (!KEY) throw new Error("AGENT_SERVICE_KEY is not set (check web/.env.local)");

const checkOnly = process.argv.includes("--check");

type ExportedGuide = {
  file: string;
  slug: string;
  order: number;
  generated: boolean;
  markdown: string;
  preamble?: string;
  postamble?: string;
};

/**
 * Guides flagged `generated` are rendered from the structured tables instead of
 * from `bodyHe`, wrapped in their own prose. Nothing sets that flag yet —
 * Phase 2 turns it on for 09-DAILY-ITINERARY and 11-PRE-TRIP-CHECKLIST, at
 * which point the renderers land here.
 */
function render(guide: ExportedGuide): string {
  if (!guide.generated) return guide.markdown;
  throw new Error(
    `Guide '${guide.slug}' is flagged generated but no renderer is registered for it yet.`,
  );
}

const response = await fetch(`${SITE_URL}/agent/export`, {
  headers: { Authorization: `Bearer ${KEY}` },
});
const body = await response.json();
if (!response.ok || !body.ok) {
  throw new Error(`export failed (${response.status}): ${JSON.stringify(body)}`);
}

const guides = body.guides as ExportedGuide[];
if (guides.length === 0) throw new Error("Convex returned zero guides — refusing to touch the files.");

const mismatches: string[] = [];
let written = 0;

for (const guide of guides) {
  const target = path.join(guidesDir, guide.file);
  const rendered = render(guide);

  const current = await readFile(target, "utf8").catch(() => null);

  if (checkOnly) {
    if (current !== rendered) {
      mismatches.push(
        `${guide.file}: on disk ${current === null ? "missing" : `${current.length} chars`}, ` +
          `Convex ${rendered.length} chars`,
      );
    }
    continue;
  }

  if (current === rendered) continue;
  await writeFile(target, rendered, "utf8");
  written += 1;
  console.log(`  wrote ${guide.file}`);
}

if (checkOnly) {
  if (mismatches.length === 0) {
    console.log(`✅ Round-trip clean — all ${guides.length} guides match Convex byte-for-byte.`);
    process.exit(0);
  }
  console.error(`❌ ${mismatches.length} guide(s) differ from Convex:\n`);
  for (const line of mismatches) console.error(`  ${line}`);
  process.exit(1);
}

console.log(
  written === 0
    ? `Nothing to write — all ${guides.length} guides already match Convex.`
    : `Exported ${written} of ${guides.length} guides to JAPAN2026/.`,
);
