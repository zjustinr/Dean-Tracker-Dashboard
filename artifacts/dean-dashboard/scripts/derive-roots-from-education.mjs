// Derive structured alma-mater records from the education strings already in
// leader-research.json.
//
//   node scripts/derive-roots-from-education.mjs            # dry run + quality report
//   node scripts/derive-roots-from-education.mjs --write    # merge into career-roots.json
//
// Why this exists: 12,403 leaders carry a researched `education` string, but only
// 5,929 have structured entries in career-roots.json -- and career-roots is what
// gen-affinity.mjs reads to build undergrad/grad ties. So ~6,500 leaders' alma
// maters are sitting in the repo as prose, contributing nothing to affinity. This
// converts the prose we already have; it invents nothing and does no research.
//
// It is deliberately conservative. A tie asserted here becomes "this candidate is
// an alum of your institution" in a slate a search firm shows a client, so a false
// positive is far more damaging than a miss. Three rules follow from that:
//
//   1. A segment must contain BOTH a recognized degree token AND an institution
//      that already exists in career-geo.json (the spelling the geocoder joins on).
//   2. Segments describing employment rather than study are dropped outright --
//      "faculty appointments at Utah, Notre Dame, and Johns Hopkins" names three
//      schools the person never studied at. Those are faculty ties, not degrees,
//      and mining them here would silently invert their meaning.
//   3. Anything ambiguous is skipped and counted, not guessed.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));
const WRITE = process.argv.includes("--write");

const lr = read("leader-research.json");
const roots = read("career-roots.json");
const geo = read("career-geo.json");

// Normalization used on BOTH the geo keys and the prose. Length is not preserved,
// so positions are computed against the normalized form throughout.
const norm = (s) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

// Institution lookup. Both sides are normalized the same way, because career-geo
// keys carry punctuation the education prose does not ("university of
// wisconsin-madison" vs "University of Wisconsin Madison") -- comparing a raw key
// against a normalized segment silently fails and lets a shorter, less specific key
// ("university of wisconsin") win instead.
//
// Longest-first so the most specific campus wins. Keys under 8 characters are held
// back for a stricter test: they match inside unrelated words, but genuine
// abbreviations ("MIT", "UCLA") are exactly how the prose names those schools, so
// they are accepted only when the ORIGINAL text contains them as an upper-case word.
const geoByNorm = new Map();
for (const k of Object.keys(geo)) {
  const n = norm(k);
  if (n && !geoByNorm.has(n)) geoByNorm.set(n, k);
}
const geoNormKeys = [...geoByNorm.keys()].sort((a, b) => b.length - a.length);
const longKeys = geoNormKeys.filter((k) => k.length >= 8);
const shortKeys = geoNormKeys.filter((k) => k.length < 8 && /^[a-z]+$/.test(k));

// Degree tokens, longest-first within the alternation so "Ph.D" is not shortened to
// "D". Covers the doctorates, professional degrees and bachelor's forms that appear
// in the corpus, including the MIT/Harvard S.B./A.B./S.M. conventions.
const DEGREE =
  /\b(ph\.?\s?d|ed\.?\s?d|d\.?\s?phil|sc\.?\s?d|dr\.?\s?p\.?\s?h|pharm\.?\s?d|psy\.?\s?d|d\.?\s?v\.?\s?m|d\.?\s?d\.?\s?s|d\.?\s?n\.?\s?p|ll\.?\s?m|ll\.?\s?b|m\.?\s?b\.?\s?a|m\.?\s?p\.?\s?h|m\.?\s?p\.?\s?a|m\.?\s?p\.?\s?p|m\.?\s?f\.?\s?a|m\.?\s?s\.?\s?w|m\.?\s?ed|b\.?\s?f\.?\s?a|b\.?\s?b\.?\s?a|j\.?\s?d|m\.?\s?d|m\.?\s?s\.?\s?c|m\.?\s?s|m\.?\s?a|m\.?\s?e|s\.?\s?m|b\.?\s?sc|b\.?\s?s|b\.?\s?a|b\.?\s?e|a\.?\s?b|s\.?\s?b|bachelor'?s?|master'?s?|doctorate|doctoral degree|undergraduate degree)\b/i;

// Employment, not study. A segment matching this is discarded even if it also
// carries a degree token, because the institution named is the employer.
const EMPLOYMENT =
  /\b(faculty|professor|appointment|postdoc|post-doc|postdoctoral|tenure|worked at|career at|served as|dean at|chair at|provost|president of|research associate|fellowship at|residency|internship|taught at|joined)\b/i;

// Undergraduate degree tokens, for the level split gen-affinity.mjs applies.
const UGRAD = /\b(b\.?\s?a|b\.?\s?s|b\.?\s?sc|b\.?\s?e|a\.?\s?b|s\.?\s?b|b\.?\s?f\.?\s?a|b\.?\s?b\.?\s?a|bachelor|undergraduate)\b/i;

/**
 * Find every career-geo institution named in a segment, with its position, so each
 * degree can be paired with the school it actually belongs to.
 *
 * Matches are non-overlapping and longest-first: once "university of texas at
 * austin" is claimed, the "university of texas" inside it cannot match separately.
 */
function findSchools(segment) {
  const n = " " + norm(segment) + " ";
  const claimed = []; // [start, end) spans already taken by a longer name
  const hits = [];
  const overlaps = (s, e) => claimed.some(([cs, ce]) => s < ce && e > cs);

  for (const k of longKeys) {
    let from = 0, idx;
    while ((idx = n.indexOf(" " + k + " ", from)) !== -1) {
      const s = idx + 1, e = s + k.length;
      if (!overlaps(s, e)) { claimed.push([s, e]); hits.push({ key: k, pos: s }); }
      from = idx + 1;
    }
  }
  // Abbreviations, only when the raw text uses them as an upper-case word.
  for (const k of shortKeys) {
    if (!new RegExp(`\\b${k.toUpperCase()}\\b`).test(segment)) continue;
    const idx = n.indexOf(" " + k + " ");
    if (idx === -1) continue;
    const s = idx + 1, e = s + k.length;
    if (overlaps(s, e)) continue;
    claimed.push([s, e]);
    hits.push({ key: k, pos: s });
  }
  return hits.sort((a, b) => a.pos - b.pos);
}

const stats = {
  candidates: 0, parsed: 0, degrees: 0,
  noDegreeToken: 0, noSchoolMatch: 0, employmentOnly: 0,
};
const derived = {}; // key -> [{school,state,level,lat,lng}]
const samples = [];
const skippedSamples = [];

for (const [k, v] of Object.entries(lr)) {
  const edu = (v && v.education || "").trim();
  if (!edu) continue;
  if (roots[k] && roots[k].length) continue; // never overwrite researched data
  stats.candidates++;

  // Split only on ";" -- the separator the corpus uses between degrees. Splitting on
  // sentence periods fragments "A.B. Engineering" at the abbreviation's own period,
  // and splitting on "/" severs "Dartmouth College / Thayer School" from its degrees.
  const segments = edu.split(/;/).map((s) => s.trim()).filter(Boolean);
  const out = [];
  let sawDegree = false, sawSchool = false, sawEmployment = false;

  for (const seg of segments) {
    if (!DEGREE.test(seg)) continue;
    sawDegree = true;
    if (EMPLOYMENT.test(seg)) { sawEmployment = true; continue; }
    const schools = findSchools(seg);
    if (!schools.length) continue;
    sawSchool = true;

    // Every degree in the segment, not just the first: "B.S., M.S., and Ph.D. ...,
    // Penn State" is three degrees, and dropping the doctorate would file a PhD alum
    // as an undergrad-only tie -- which is what the Slate Builder's grad/undergrad
    // affinity filters key on.
    const n = " " + norm(seg) + " ";
    const degrees = [...n.matchAll(new RegExp(DEGREE.source, "gi"))];

    for (const m of degrees) {
      // Pair with the first school appearing after the degree; if the degree trails
      // every school name ("... from UC Berkeley, a PhD"), fall back to the last one
      // before it. Prose lists the school after its degree in the overwhelming
      // majority of cases, so the forward rule leads.
      const after = schools.find((s) => s.pos > m.index);
      const before = [...schools].reverse().find((s) => s.pos < m.index);
      const pick = after || before;
      if (!pick) continue;
      const g = geo[geoByNorm.get(pick.key)];
      const level = m[0].replace(/\s+/g, "").toUpperCase();
      const school = geoByNorm.get(pick.key);
      if (out.some((d) => d.school === school && d.level === level)) continue;
      out.push({
        school,
        state: g.state || null,
        level,
        lat: g.lat ?? null,
        lng: g.lng ?? null,
        derived: true, // provenance: parsed from an education string, not researched
      });
    }
  }

  if (out.length) {
    derived[k] = out;
    stats.parsed++;
    stats.degrees += out.length;
    if (samples.length < 12) samples.push([k, edu, out]);
  } else {
    if (!sawDegree) stats.noDegreeToken++;
    else if (sawEmployment && !sawSchool) stats.employmentOnly++;
    else stats.noSchoolMatch++;
    if (skippedSamples.length < 10 && sawDegree) skippedSamples.push([k, edu]);
  }
}

const pct = (n) => `${((100 * n) / stats.candidates).toFixed(1)}%`;
console.log(`\ncandidates (education string, no structured roots): ${stats.candidates}`);
console.log(`  parsed into structured degrees: ${stats.parsed} (${pct(stats.parsed)}) -> ${stats.degrees} degree records`);
console.log(`  skipped, no degree token:       ${stats.noDegreeToken} (${pct(stats.noDegreeToken)})`);
console.log(`  skipped, employment prose only: ${stats.employmentOnly} (${pct(stats.employmentOnly)})`);
console.log(`  skipped, school not in geo:     ${stats.noSchoolMatch} (${pct(stats.noSchoolMatch)})`);

console.log(`\n--- 12 parsed samples (verify these read correctly) ---`);
for (const [k, edu, out] of samples) {
  console.log(`\n  ${k}`);
  console.log(`    "${edu.slice(0, 150)}"`);
  console.log(`    => ${out.map((d) => `${d.level} @ ${d.school}`).join(" | ")}`);
}
console.log(`\n--- 10 skipped-with-degree-token samples (checking for lost signal) ---`);
for (const [k, edu] of skippedSamples) console.log(`  ${k}\n    "${edu.slice(0, 150)}"`);

if (!WRITE) {
  console.log(`\n(dry run -- pass --write to merge into career-roots.json)\n`);
} else {
  let added = 0;
  for (const [k, v] of Object.entries(derived)) {
    if (roots[k] && roots[k].length) continue;
    roots[k] = v;
    added++;
  }
  writeFileSync(join(SRC, "career-roots.json"), JSON.stringify(roots));
  console.log(`\ncareer-roots.json: +${added} leaders, now ${Object.keys(roots).length} total\n`);
}
