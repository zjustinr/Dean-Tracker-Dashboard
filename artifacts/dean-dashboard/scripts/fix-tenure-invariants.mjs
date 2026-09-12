#!/usr/bin/env node
/**
 * Bring every leadership dataset back to the tenure invariant (scripts/lib/tenure.mjs):
 * no sitting leader carries a stored tenure length, and no record carries tenure
 * arithmetic that cannot be true.
 *
 * Idempotent and re-runnable: a second run reports no changes. Generators now
 * apply the same normalizer as they write, so this exists for datasets built
 * before that landed and for hand-edited records.
 *
 * Two kinds of fix:
 *
 *  - Rule-driven, from normalizeTenureFields(): drop a sitting leader's frozen
 *    tenure, null a placeholder year (a year of zero is "not documented", not a
 *    date), drop a negative or impossible length.
 *
 *  - UNDOCUMENTED_ENDS below: five historical records whose end year is a
 *    placeholder that produced an 81-to-136-year spell. Each one's own notes say
 *    the succession is undocumented, so the end year is marked unknown rather
 *    than left asserting a span nobody served. A rule cannot make this call --
 *    it takes reading the record -- so the list is explicit and each entry is
 *    checked against the record's name before anything is touched.
 *
 *   node scripts/fix-tenure-invariants.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTenureFields, tenureViolations, UNKNOWN_LABEL } from "./lib/tenure.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DRY = process.argv.includes("--dry-run");

/**
 * Records whose stored end year is a placeholder, not a date. Each entry names
 * the person so a shifted id can never silently rewrite someone else's row, and
 * quotes why the end is unknown -- in every case the record's own notes say so.
 */
const UNDOCUMENTED_ENDS = [
  { file: "r1-education-deans.json", id: 517, dean: "Will G. Chambers",
    why: "1923 founding dean; the row's end year is the next documented dean's start in 1990, with the succession between unresearched." },
  { file: "r1-lawschool-deans.json", id: 888, dean: "Thomas J. Freeman",
    why: "1890 founding dean; notes say the end year is not reliably documented." },
  { file: "r1-medschool-deans.json", id: 131, dean: "George W. McCoy",
    why: "Acting dean from 1945; notes record a gap in the documented succession." },
  { file: "r1-nursing-deans.json", id: 655, dean: "Louisa Parsons",
    why: "1889 founding superintendent; notes say the deans between 1889 and 1990 are undocumented." },
  { file: "r1-pharmacy-deans.json", id: 622, dean: "J. Lester Hayman",
    why: "1936 founding dean; notes say the end year is undocumented and the succession has a gap." },
];

const byFile = new Map();
for (const e of UNDOCUMENTED_ENDS) {
  if (!byFile.has(e.file)) byFile.set(e.file, []);
  byFile.get(e.file).push(e);
}

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

let totalRecords = 0, totalChanged = 0;
const unresolved = [];
for (const f of files) {
  const path = join(SRC, f);
  const raw = readFileSync(path, "utf8");
  let rows;
  try { rows = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(rows)) continue;

  const changedRows = [];
  for (const e of byFile.get(f) ?? []) {
    const r = rows.find((x) => x.id === e.id);
    if (!r) { unresolved.push(`${f}#${e.id} (${e.dean}): no such record`); continue; }
    if (r.dean !== e.dean) { unresolved.push(`${f}#${e.id}: expected "${e.dean}", found "${r.dean}" -- not touched`); continue; }
    if (r.endYear == null) continue; // already marked
    changedRows.push(`  ${f}#${r.id} ${r.dean}: endYear ${r.endYear} -> null, endLabel "${UNKNOWN_LABEL}" (${e.why})`);
    r.endYear = null;
    r.endLabel = UNKNOWN_LABEL;
  }

  for (const r of rows) {
    if (r.id == null || !r.dean) continue;
    totalRecords++;
    const changes = normalizeTenureFields(r);
    if (changes.length) changedRows.push(`  ${f}#${r.id} ${r.dean}: ${changes.join("; ")}`);
    for (const v of tenureViolations(r)) unresolved.push(`${f}#${r.id} "${r.dean}": ${v.code} -- ${v.detail}`);
  }

  if (!changedRows.length) continue;
  totalChanged += changedRows.length;
  for (const line of changedRows) console.log(line);
  if (!DRY) {
    // Write each file back in the shape it already had -- some indices ship
    // minified and some pretty-printed, and reformatting one turns a 30-record
    // fix into a 90,000-line diff nobody can review.
    const minified = /^\[\s*\{"/.test(raw);
    const indent = minified ? 0 : /^\[\s*\n(\s+)/.exec(raw)?.[1].length ?? 2;
    writeFileSync(path, JSON.stringify(rows, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
  }
}

console.log(`\n${DRY ? "[dry run] " : ""}${totalChanged} change(s) across ${totalRecords} records in ${files.length} files.`);
if (unresolved.length) {
  console.error(`\n${unresolved.length} record(s) no rule can fix -- these need a source:`);
  for (const u of unresolved) console.error(`  ${u}`);
  process.exit(1);
}
