#!/usr/bin/env node
/**
 * CI guard: every leadership record ADDED (or whose sourceUrl is REMOVED) in
 * this change must carry a sourceUrl. Deliberately does not fail on records
 * that were already missing one before this change -- ~974 legacy gaps exist
 * across the dataset (see scripts/photo-lib.mjs's sibling backfill effort)
 * and this check must be safe to ship at any point relative to that backfill.
 *
 * Compares each deans dataset file against a base ref by record `id` (not by
 * line), so a pretty-print/reformat of the JSON never produces a false
 * positive -- only a genuine new-record-without-sourceUrl or
 * had-a-sourceUrl-now-doesn't regression fails the check.
 *
 * RECORDS WITH NO `id`
 * --------------------
 * 6,554 of the 33,664 rows in these files carry no `id` at all -- whole files are
 * affected, `r1-medschool-deans.json` worst at 1,323 of 1,968. This check used to
 * `continue` past every one of them, so 19.5% of the corpus sat outside the only gate
 * guarding it: a new row added without an id and without a sourceUrl passed silently,
 * and 838 of the skipped rows are in fact already missing a sourceUrl.
 *
 * So identity falls back to a natural key -- institution, person, start year, index
 * file -- when `id` is absent. That is weaker than an id (two spells of one person
 * beginning in the same year at one institution collide) but it is dramatically better
 * than not looking, and it needs no id backfill to start working. Backfilling the ids
 * is the real fix and is research-free; it is tracked separately.
 *
 *   node scripts/validate-source-urls.mjs [--base <ref>]
 * Base ref resolution: --base flag > $BASE_REF env > $GITHUB_BASE_REF (as
 * origin/<branch>, set by GitHub Actions on pull_request) > "HEAD^1".
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const SRC = join(HERE, "..", "src", "data");

const argv = process.argv.slice(2);
const baseIdx = argv.indexOf("--base");
const BASE_REF =
  (baseIdx >= 0 && argv[baseIdx + 1]) ||
  process.env.BASE_REF ||
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null) ||
  "HEAD^1";

function readAtRef(ref, absPath) {
  const relPath = relative(ROOT, absPath);
  try {
    return execFileSync("git", ["show", `${ref}:${relPath}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch {
    return null; // file didn't exist at base ref -- every record in it is "new"
  }
}

/**
 * How a record is matched across refs: its `id` where it has one, otherwise the
 * natural key. Prefixed so an id can never collide with a natural key.
 */
const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const identity = (file, r) =>
  r.id != null ? `id:${file}:${r.id}` : `nat:${file}:${norm(r.university)}|${norm(r.dean)}|${r.startYear ?? ""}`;

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

const violations = [];
for (const f of files) {
  const absPath = join(SRC, f);
  let head;
  try { head = JSON.parse(readFileSync(absPath, "utf8")); } catch { continue; }
  if (!Array.isArray(head)) continue;

  const baseRaw = readAtRef(BASE_REF, absPath);
  let baseById = new Map();
  if (baseRaw) {
    try {
      const baseArr = JSON.parse(baseRaw);
      if (Array.isArray(baseArr)) baseById = new Map(baseArr.map((r) => [identity(f, r), r]));
    } catch { /* base version unparsable -- treat every head record as new */ }
  }

  for (const r of head) {
    if (!r.dean || !r.university) continue;
    const key = identity(f, r);
    const before = baseById.get(key);
    const hasUrl = !!r.sourceUrl;
    if (hasUrl) continue;
    if (!before) {
      violations.push(`${f}#${r.id ?? "(no id)"}: new record "${r.dean}" (${r.university}) has no sourceUrl`);
    } else if (before.sourceUrl) {
      violations.push(`${f}#${r.id ?? "(no id)"}: "${r.dean}" (${r.university}) lost its sourceUrl (had one at ${BASE_REF})`);
    }
    // else: sourceUrl was already missing at the base ref -- a pre-existing
    // legacy gap, not something this change introduced. Not a violation.
  }
}

if (violations.length) {
  console.error(`sourceUrl check FAILED (base: ${BASE_REF}) -- ${violations.length} record(s):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`sourceUrl check passed (base: ${BASE_REF}) -- no new or regressed missing sourceUrl.`);
