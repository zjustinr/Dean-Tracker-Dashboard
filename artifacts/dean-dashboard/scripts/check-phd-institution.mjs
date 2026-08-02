// QC guard against the "Field, University" phdInstitution contamination bug
// (fixed corpus-wide in commit 8c21cc2, 306 records / 167 distinct broken
// values). Nothing in the ETL touches phdInstitution -- it is only ever
// written by ad-hoc research/enrichment sessions -- so nothing else catches
// a repeat. See PROJECT.md "phdInstitution research contract" for the
// output format future agents must follow.
//
// Flags any phdInstitution that:
//   (a) doesn't match a career-geo.json key under the same
//       toLowerCase().trim() lookup CareerMap/DeanProfile/DeanTimeline use
//   (b) has a "<field>, <university>" comma pattern (institution keyword
//       after the comma but not before -- the exact shape of the old bug)
//   (c) is a bare ALL-CAPS abbreviation (e.g. "MIT", "UCLA"), or
//   (d) is a short fragment with no institution keyword at all (e.g.
//       "Berkeley" instead of "University of California, Berkeley") --
//       only checked when (a) also fails, since a fragment that already
//       geocodes isn't actionable here
//
// (a) alone will also catch legitimate-but-not-yet-geocoded institutions
// (not in career-geo.json yet) -- that's expected and not a regression by
// itself. Records ALSO flagged by (b)/(c)/(d) are the ones that look like
// genuine corruption and deserve a look first.
//
// Run after any phdInstitution research/enrichment pass:
//   node scripts/check-phd-institution.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const norm = (s) => s.toLowerCase().trim();

const geo = JSON.parse(readFileSync(join(DATA, "career-geo.json"), "utf8"));
const geoKeys = new Set(Object.keys(geo).map(norm));

// Prefix-only (no trailing \b) so it also matches non-English/plural forms
// that show up in real institution names: "Institutet" (Swedish), "Universite"
// (French), "Universität" (German), "Academies", etc.
const INSTITUTION_KEYWORD = /\b(universit|colleg|institut|polytechnic|academ|seminar|conservator|school)/i;

function commaContamination(value) {
  const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return false;
  const [before, after] = parts;
  return INSTITUTION_KEYWORD.test(after) && !INSTITUTION_KEYWORD.test(before);
}

function bareAbbreviation(value) {
  return /^[A-Z]{2,6}$/.test(value.trim());
}

function bareFragment(value) {
  if (bareAbbreviation(value)) return false;
  if (INSTITUTION_KEYWORD.test(value)) return false;
  return value.trim().split(/\s+/).length <= 3;
}

const files = readdirSync(DATA).filter(
  (f) => /^r1-.*-deans\.json$/.test(f) || f === "deans.json" || /top100/i.test(f)
);

const flagged = [];
let scanned = 0;

for (const file of files) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(join(DATA, file), "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(rows)) continue;

  for (const rec of rows) {
    const value = rec && rec.phdInstitution;
    if (!value || typeof value !== "string" || !value.trim()) continue;
    scanned++;

    const geocoded = geoKeys.has(norm(value));
    const reasons = [];
    if (!geocoded) reasons.push("no-geo-match");
    if (commaContamination(value)) reasons.push("comma-contamination");
    if (bareAbbreviation(value)) reasons.push("bare-abbreviation");
    if (!geocoded && bareFragment(value)) reasons.push("bare-fragment");

    if (reasons.length) {
      flagged.push({ file, dean: rec.dean, university: rec.university, phdInstitution: value, reasons });
    }
  }
}

const patternFlagged = flagged.filter((f) => f.reasons.some((r) => r !== "no-geo-match"));
const geoMissOnly = flagged.filter((f) => f.reasons.length === 1 && f.reasons[0] === "no-geo-match");

const distinct = (list) => new Set(list.map((f) => f.phdInstitution)).size;

console.log(`Scanned ${scanned} phdInstitution value(s) across ${files.length} file(s).`);
console.log(`${flagged.length} flagged (${distinct(flagged)} distinct value(s)).\n`);

if (patternFlagged.length) {
  console.error(`✗ ${patternFlagged.length} record(s) (${distinct(patternFlagged)} distinct) look like genuine corruption -- comma contamination or a bare abbreviation/fragment:`);
  for (const f of patternFlagged) {
    console.error(`   [${f.reasons.join(", ")}] ${f.file}  ${f.dean} | ${f.university} -> "${f.phdInstitution}"`);
  }
  console.error("");
}

if (geoMissOnly.length) {
  console.log(`ℹ ${geoMissOnly.length} record(s) (${distinct(geoMissOnly)} distinct) don't geocode against career-geo.json but show no corruption pattern -- likely correct institutions just missing from the lookup table:`);
  for (const f of geoMissOnly) {
    console.log(`   ${f.file}  ${f.dean} | ${f.university} -> "${f.phdInstitution}"`);
  }
  console.log("");
}

if (patternFlagged.length) {
  console.error(`Fix the ${patternFlagged.length} corruption-pattern record(s) above before committing.`);
  process.exit(1);
}

if (flagged.length) {
  console.log(`✓ No corruption patterns found. ${geoMissOnly.length} record(s) remain ungeocoded but clean -- add them to career-geo.json when convenient, not blocking.`);
  process.exit(1);
}

console.log("✓ Every phdInstitution value geocodes cleanly against career-geo.json.");
