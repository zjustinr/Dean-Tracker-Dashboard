#!/usr/bin/env node
/**
 * CI guard: the stored interim-to-permanent conversion flags must match what
 * scripts/lib/departure.mjs derives from the succession.
 *
 * The flags are the one piece of the departure work that IS written into the
 * dean files, because a conversion is a property of a pair of spells rather than
 * of one record, so a consumer holding a single record cannot compute it. A
 * stored derivation needs a check that it still matches its derivation, or it
 * quietly becomes a third source of truth -- which is exactly the state this
 * replaced: `convertedToPermanent` meant three different things across indices
 * and eleven indices never set it at all.
 *
 * Recorded-only conversions (a spell whose notes say the interim was made
 * permanent, with no second row to derive it from) are carried forward by the
 * derivation itself, so they pass here too.
 *
 *   node scripts/validate-departures.mjs [--quiet]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveConversions } from "./lib/departure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

const violations = [];
let checked = 0, converted = 0, fromInterim = 0;
for (const f of files) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  const flags = deriveConversions(rows);
  for (const r of rows) {
    if (r.id == null || !r.dean) continue;
    checked++;
    const want = {
      convertedToPermanent: flags.get(r.id)?.convertedToPermanent ?? false,
      fromInterim: flags.get(r.id)?.fromInterim ?? false,
    };
    if (want.convertedToPermanent) converted++;
    if (want.fromInterim) fromInterim++;
    if ((r.convertedToPermanent ?? false) !== want.convertedToPermanent) {
      violations.push(`${f}#${r.id}: "${r.dean}" (${r.university}) convertedToPermanent is ${r.convertedToPermanent ?? "absent"}, derivation says ${want.convertedToPermanent}`);
    }
    if ((r.fromInterim ?? false) !== want.fromInterim) {
      violations.push(`${f}#${r.id}: "${r.dean}" (${r.university}) fromInterim is ${r.fromInterim ?? "absent"}, derivation says ${want.fromInterim}`);
    }
  }
}

if (violations.length) {
  console.error(`conversion check FAILED -- ${violations.length} record(s) out of step with the derivation:`);
  for (const v of violations.slice(0, 40)) console.error(`  ${v}`);
  if (violations.length > 40) console.error(`  … and ${violations.length - 40} more`);
  console.error("\nRun `node scripts/derive-departures.mjs` to bring the stored flags back in line.");
  process.exit(1);
}
if (!process.argv.includes("--quiet")) {
  console.log(`conversion check passed -- ${checked} records; ${converted} interim spells converted, ${fromInterim} permanent spells followed one.`);
}
