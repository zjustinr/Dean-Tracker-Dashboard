#!/usr/bin/env node
/**
 * Stamp the corpus-level fields the succession-panel rebuild showed were missing:
 * `seatRole`, plus two data-quality flags.
 *
 *   node scripts/backfill-corpus-fields.mjs            # dry run, prints the breakdown
 *   node scripts/backfill-corpus-fields.mjs --write    # rewrites src/data/*-deans.json
 *
 * Why this exists is argued in lib/seat-role.mjs and docs/corpus-pass-scope.md: the
 * corpus files the chief executive and their cabinet under one key, nothing in a row
 * says which is which, and every consumer that needs the distinction has to rebuild
 * a title classifier. Only the succession panel ever did.
 *
 * SAFETY
 * ------
 * The field is additive and rows are otherwise untouched, so:
 *   - `validate-source-urls.mjs`, the one CI guard on this data, compares by record
 *     `id` and fails only on ADDED rows with no sourceUrl or on a REMOVED sourceUrl.
 *     Adding a key to an existing row is neither.
 *   - Nothing reads `seatRole` yet. The dashboard still selects seat-holders as
 *     `roleType !== "subdean"`, which lets cabinet rows through exactly as before.
 *     Adopting the field in those consumers is a separate change.
 *
 * Rows with no start date are the current administrative roster rather than
 * appointment spells, and are left alone: classifying them would imply the corpus
 * holds a history for them, which it does not.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./lib/institution-key.mjs";
import { classifySeatRole, INDEX_ROLE } from "./lib/seat-role.mjs";
import { isCompoundTitle, titleVerbatim, isPlaceholderEnd } from "./lib/seat-identity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const WRITE = process.argv.includes("--write");
const EXTRACT_YEAR = 2026;

const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));

// The institution's own name for its top seat, so the few led by a Dean or a Senior
// Vice President and Provost are classified by what they call it, not by a guess.
const leaderTitleOf = new Map();
for (const f of ["r1-r2public-schools.json"]) {
  for (const s of read(f)) if (s.leaderTitle) leaderTitleOf.set(keyOf(s.university), s.leaderTitle);
}

const files = readdirSync(SRC).filter((f) => /^(r1-.*-deans|deans)\.json$/.test(f)).sort();
const totals = {};
const perFile = [];

/**
 * Serialise in the file's OWN format.
 *
 * The corpus is not uniformly formatted. Across the 22 dean files there are three
 * styles: minified onto a single line, pretty-printed at a one-space indent, and
 * pretty-printed at two. Writing them all one way expanded `r1-vet-deans.json` from
 * 1 line to 27,399 and produced a 950,000-line diff on a purely additive change --
 * unreviewable, and exactly the kind of churn that hides a real edit. The trailing
 * newline matters too: most of these files do not have one.
 *
 * So the original style is measured rather than assumed, and `assertRoundTrip` below
 * proves the measurement on every file before anything is written.
 */
function detectFormat(text) {
  if (text[1] !== "\n") return { indent: 0, trailingNewline: text.endsWith("\n") };
  const secondLine = text.slice(text.indexOf("\n") + 1);
  return { indent: secondLine.length - secondLine.trimStart().length, trailingNewline: text.endsWith("\n") };
}
const serialise = (rows, fmt) =>
  JSON.stringify(rows, null, fmt.indent || undefined) + (fmt.trailingNewline ? "\n" : "");

/**
 * Prove the formatter reproduces each file byte-for-byte before touching it.
 *
 * Without this the only evidence that the write is clean is the size of the diff,
 * which is the thing that went wrong twice already. A file that cannot be
 * reproduced exactly is left alone and reported, rather than rewritten in a style
 * nobody chose.
 */
function assertRoundTrip(f, text) {
  const exact = serialise(JSON.parse(text), detectFormat(text)) === text;
  if (!exact) console.error(`  !! ${f}: formatter does not reproduce the original; skipped`);
  return exact;
}

let skipped = 0;
const flags = { endYearUnverified: 0, titleIsCompound: 0 };
for (const f of files) {
  const originalText = readFileSync(join(SRC, f), "utf8");
  if (!assertRoundTrip(f, originalText)) { skipped++; continue; }
  const rows = JSON.parse(originalText);
  const indexRole = INDEX_ROLE[f] ?? "";
  const counts = {};
  let dated = 0;
  for (const r of rows) {
    if (!r.startYear) continue;
    dated++;
    const role = classifySeatRole(r, { indexRole, leaderTitle: leaderTitleOf.get(keyOf(r.university)) });
    counts[role || "(unresolved)"] = (counts[role || "(unresolved)"] || 0) + 1;
    totals[role || "(unresolved)"] = (totals[role || "(unresolved)"] || 0) + 1;
    // Empty string, not a missing key: "we looked and could not tell" is a state the
    // data should carry, and it is distinct from a row this pass never reached.
    r.seatRole = role;

    // The audit asked for these 29 end dates to be set to null. That would be wrong
    // HERE even though it was right in the export: the corpus reads `endYear: null`
    // as "still sitting", so nulling them would invent 29 currently-serving leaders
    // out of rows whose spell demonstrably ended. The export can say "ended, date
    // unknown" because it carries a separate is_current column; the corpus cannot.
    // So the date is left in place and marked untrustworthy instead.
    if (isPlaceholderEnd(r.startYear, r.endYear, EXTRACT_YEAR)) {
      r.endYearUnverified = true;
      flags.endYearUnverified++;
    }
    // A title naming several appointments is several rows wearing one. Flagged for
    // splitting rather than split here, which needs a source.
    if (isCompoundTitle(titleVerbatim(r))) {
      r.titleIsCompound = true;
      flags.titleIsCompound++;
    }
  }
  perFile.push([f, dated, counts]);
  if (WRITE) writeFileSync(join(SRC, f), serialise(rows, detectFormat(originalText)), "utf8");
}

const grand = Object.values(totals).reduce((a, b) => a + b, 0);
const pct = (n) => `${((100 * n) / grand).toFixed(1)}%`;

console.log(`${WRITE ? "WROTE" : "DRY RUN"} - seatRole across ${files.length} files, ${grand} dated rows\n`);
console.log("corpus totals");
for (const [k, v] of Object.entries(totals).sort((a, b) => b[1] - a[1]))
  console.log(`  ${k.padEnd(18)} ${String(v).padStart(6)}  ${pct(v)}`);

console.log("\ndata-quality flags stamped");
console.log(`  endYearUnverified  ${String(flags.endYearUnverified).padStart(6)}  extract-year end date on a spell running > 15y`);
console.log(`  titleIsCompound    ${String(flags.titleIsCompound).padStart(6)}  title collapses several appointments`);

console.log("\nby file");
console.log(`  ${"file".padEnd(26)}${"dated".padStart(7)}  breakdown`);
for (const [f, dated, counts] of perFile) {
  const parts = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join("  ");
  console.log(`  ${f.replace("r1-", "").replace("-deans.json", "").padEnd(26)}${String(dated).padStart(7)}  ${parts}`);
}
if (skipped) console.log(`\n${skipped} file(s) skipped: the formatter could not reproduce them byte-for-byte.`);
if (!WRITE) console.log("\nNothing written. Re-run with --write to apply.");
