#!/usr/bin/env node
/**
 * CI guard: no leadership record may carry tenure arithmetic that cannot be true,
 * and no sitting leader may carry a stored tenure length.
 *
 * Both errors reached production. Three aggregate screens averaged sitting
 * leaders' frozen tenures in with completed ones (359 records across four
 * indices), and 31 records carried arithmetic that is simply impossible --
 * negative spans, a start year of zero reading as a 2,004-year tenure, spells of
 * 81 to 136 years where the end year was a placeholder for "not documented". The
 * frontend now guards against reading them (src/data/tenure.ts); this check stops
 * new ones being written.
 *
 * Unlike the sourceUrl check this is not diff-based: the corpus is clean as of
 * this change, so any violation at all is a regression.
 *
 *   node scripts/validate-tenure.mjs [--quiet]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tenureViolations } from "./lib/tenure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

const violations = [];
let checked = 0;
for (const f of files) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    if (r.id == null || !r.dean) continue;
    checked++;
    for (const v of tenureViolations(r)) {
      violations.push(`${f}#${r.id}: "${r.dean}" (${r.university}) ${v.code} -- ${v.detail}`);
    }
  }
}

if (violations.length) {
  console.error(`tenure check FAILED -- ${violations.length} violation(s) across ${checked} records:`);
  for (const v of violations) console.error(`  ${v}`);
  console.error("\nRun `node scripts/fix-tenure-invariants.mjs` for the ones a rule can fix");
  console.error("(a sitting leader's stored tenure, a placeholder year, a negative span).");
  console.error("An implausible span needs a source, not a rule: find the real end year, or mark");
  console.error('the boundary undocumented with endYear: null and endLabel: "unknown".');
  process.exit(1);
}
if (!process.argv.includes("--quiet")) console.log(`tenure check passed -- ${checked} records, no impossible tenure arithmetic.`);
