#!/usr/bin/env node
/**
 * Store interim-to-permanent conversion on both sides of the pair, and report the
 * departure-category distribution the corpus can currently support.
 *
 * Only the conversion flags are WRITTEN. The departure category is a pure
 * function of `nextRole`, so every consumer derives it instead -- the frontend
 * through src/data/departure.ts, scripts through lib/departure.mjs -- and the
 * definition stays in one place with nothing to drift from it. Writing it onto
 * 12,941 records would add a second copy of the same fact and a reason to keep
 * them in step, for no reader that could not call the function. Conversion is
 * different: it is not a property of one record at all but of a pair of spells in
 * a succession, so a consumer holding one record cannot compute it, and
 * `convertedToPermanent` is already part of the schema.
 *
 * Idempotent and re-runnable; scripts/validate-departures.mjs fails CI if a
 * stored flag stops matching the derivation.
 *
 *   node scripts/derive-departures.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DEPARTURE_CATEGORIES, deriveDepartureCategory, deriveConversions } from "./lib/departure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DRY = process.argv.includes("--dry-run");

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

const tally = Object.fromEntries(Object.keys(DEPARTURE_CATEGORIES).map((k) => [k, 0]));
const basisTally = { code: 0, text: 0, none: 0, sitting: 0 };
let records = 0, departed = 0, changed = 0, converted = 0, fromInterim = 0, legacyMoved = 0;

for (const f of files) {
  const path = join(SRC, f);
  const raw = readFileSync(path, "utf8");
  let rows;
  try { rows = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(rows)) continue;

  const flags = deriveConversions(rows);
  let fileChanged = false;
  for (const r of rows) {
    if (r.id == null || !r.dean) continue;
    records++;
    const { category, basis } = deriveDepartureCategory(r);
    basisTally[basis]++;
    if (category) { departed++; tally[category]++; }

    const derived = flags.get(r.id);
    const next = {
      convertedToPermanent: derived?.convertedToPermanent ?? false,
      // Written only where true. A boolean that is false on 99% of records is
      // noise in every diff and every file; absent means false, the same way
      // `roleType` and `nextRoleDetail` already work in this corpus.
      ...(derived?.fromInterim ? { fromInterim: true } : {}),
    };
    if (!derived?.fromInterim && r.fromInterim !== undefined) {
      delete r.fromInterim;
      fileChanged = true;
      changed++;
    }
    // A permanent spell that carried the conversion flag and now carries
    // fromInterim instead is a MIGRATION, not a loss: same fact, recorded on the
    // side of the pair it actually describes. Counted so the change is visible.
    if (r.convertedToPermanent && !r.isInterim && next.fromInterim && !next.convertedToPermanent) legacyMoved++;
    if (next.convertedToPermanent) converted++;
    if (next.fromInterim) fromInterim++;

    for (const [k, v] of Object.entries(next)) {
      if (r[k] === v) continue;
      r[k] = v;
      fileChanged = true;
      changed++;
    }
  }

  if (fileChanged && !DRY) {
    // Same shape in, same shape out -- some indices ship minified, and
    // reformatting one turns a field addition into an unreviewable diff.
    const minified = /^\[\s*\{"/.test(raw);
    const indent = minified ? 0 : /^\[\s*\n(\s+)/.exec(raw)?.[1].length ?? 2;
    writeFileSync(path, JSON.stringify(rows, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
  }
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : "—");
console.log(`${DRY ? "[dry run] " : ""}${changed} field value(s) written across ${records} records in ${files.length} files.\n`);
console.log(`Departure categories (${departed} completed spells):`);
for (const [code, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code.padEnd(17)} ${String(n).padStart(6)}  ${pct(n, departed).padStart(6)}  ${DEPARTURE_CATEGORIES[code].label}`);
}
console.log(`\nHow each category was reached: ${basisTally.code} from the corpus's own codes, ${basisTally.text} read from a free-text destination, ${basisTally.none} with nothing recorded.`);
console.log(`Interim conversions: ${converted} interim spells converted; ${fromInterim} permanent spells followed one (${legacyMoved} of those migrated off a legacy flag on the permanent row).`);
console.log(`\nUnknown is ${pct(tally.unknown, departed)} of completed spells -- the destination is actually recorded for ${pct(departed - tally.unknown, departed)}, not the 94.5% that "nextRole is populated" suggests. That is a gap in the record, not evidence of a voluntary exit.`);
console.log("Categories are derived on read (src/data/departure.ts, scripts/lib/departure.mjs), not stored; only the conversion flags above are written.");
