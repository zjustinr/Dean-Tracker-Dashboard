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
 * `id` isn't actually guaranteed populated (scripts/backfill-missing-ids.mjs
 * exists precisely because ~6,500 ad-hoc-research feeder-bench records
 * shipped without one), so an id-only match breaks the moment a record's id
 * changes from nothing to something: the record looks brand new against the
 * base ref even though nothing about the PERSON changed. Falls back to a
 * name+university match whenever the id lookup misses, so a pure id backfill
 * (like that script) is recognized as the same record, not a new one.
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

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");

// Fallback identity for the id-backfill case above: name+university. Not
// unique in general (the same person can hold non-contiguous spells at one
// school), but it's only ever consulted when the id lookup already missed,
// so a collision just means one fewer false positive, never a false negative
// severe enough to matter here.
const nameUniKey = (r) => `${(r.dean || "").trim().toLowerCase()}|${(r.university || "").trim().toLowerCase()}`;

const violations = [];
for (const f of files) {
  const absPath = join(SRC, f);
  let head;
  try { head = JSON.parse(readFileSync(absPath, "utf8")); } catch { continue; }
  if (!Array.isArray(head)) continue;

  const baseRaw = readAtRef(BASE_REF, absPath);
  let baseById = new Map();
  let baseByNameUni = new Map();
  if (baseRaw) {
    try {
      const baseArr = JSON.parse(baseRaw);
      if (Array.isArray(baseArr)) {
        for (const r of baseArr) {
          if (r.id != null) baseById.set(r.id, r);
          baseByNameUni.set(nameUniKey(r), r);
        }
      }
    } catch { /* base version unparsable -- treat every head record as new */ }
  }

  for (const r of head) {
    if (r.id == null || !r.dean || !r.university) continue;
    const before = baseById.get(r.id) ?? baseByNameUni.get(nameUniKey(r));
    const hasUrl = !!r.sourceUrl;
    if (hasUrl) continue;
    if (!before) {
      violations.push(`${f}#${r.id}: new record "${r.dean}" (${r.university}) has no sourceUrl`);
    } else if (before.sourceUrl) {
      violations.push(`${f}#${r.id}: "${r.dean}" (${r.university}) lost its sourceUrl (had one at ${BASE_REF})`);
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
