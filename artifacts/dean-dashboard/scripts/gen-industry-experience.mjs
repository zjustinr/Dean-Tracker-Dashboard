// Industry-tie derivation pass.
//
//   node scripts/gen-industry-experience.mjs                       # write src/data/industry-experience.json
//   node scripts/gen-industry-experience.mjs --report              # coverage report only, no write
//   node scripts/gen-industry-experience.mjs --dump-unclassified   # list orgs no rule matched
//
// WHY THIS EXISTS
// ---------------
// Schools increasingly want leaders who bring a corporate network they can tap
// for gifts, partnerships, executive education and placement. That makes the
// question "whose connections are worth something", which is a RANKING problem,
// not the census problem a boolean implies.
//
// `hasIndustryExp` -- the boolean already on every dean record -- is the wrong
// container for it twice over:
//
//   1. It is empty. 12 of the 21 indices (17,013 rows) never set it once;
//      build-publichealth.mjs and news-lib.mjs write `false` literally. A
//      boolean cannot say "nobody looked", so that `false` reads as a
//      researched No and every percentage built on it understates.
//   2. Even where it is filled, it collapses the part that decides the answer.
//      A Goldman managing director who left in 2019 and a software engineer who
//      left in 1991 are both `true`, and only one can make a call that lands.
//
// So this pass emits TIES, not a flag: person -> firm -> sector -> seniority ->
// recency -> how they were attached (employed, board seat, advisory). The firm
// is the asset; the sector is only how you group it.
//
// SYSTEM-WIDE BY CONSTRUCTION
// ---------------------------
// Nothing here names an index. Files come from `lib/indices.mjs`, the taxonomy
// from `lib/org-classify.mjs`, and both are index-agnostic -- an index added
// next year is covered by existing, and `assertRegistered` complains if one
// shows up that the registry has not been told about. Vocabulary grows in
// org-classify.mjs and every consumer picks it up on its next run.
//
// WHAT IT READS
// -------------
//   priorInstitution + priorTitle   every index, ~12.9k of 29.6k rows
//   leader-research.json .career    ~2.3k people, ~8.2k dated career stops
//   careerBackground                a label in some indices, a bio in others
//   hasConsultingBg                 existing boolean, business/engineering only
//
// It deliberately does NOT mine `notes` or research `summary` prose. That was
// measured: a phrase-level regex over all 14.6k people with free text returned
// 125 hits, and hand-checking them showed real false positives ("the KPMG
// Academic Research Panel", "Walton's Walmart-anchored strength in retail") --
// prose mentions a firm for many reasons other than employment. Low yield at
// visibly poor precision is not worth the maintenance.
//
// It never writes back into the dean JSONs. Output is a regenerable sidecar.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertRegistered, deanFiles, FILE_ID } from "./lib/indices.mjs";
import {
  buildAcademicIndex, makeClassifier, splitOrgs,
  seniorityOf, tieKindOf, SENIORITY_BANDS, INDUSTRY_NAMES,
} from "./lib/org-classify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const OUT = join(SRC, "industry-experience.json");
const REPORT_ONLY = process.argv.includes("--report");
const DUMP_UNCLASSIFIED = process.argv.includes("--dump-unclassified");

const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return null; } };
const nkey = (s) => String(s || "").trim().toLowerCase();
const ekey = (name, uni) => `${nkey(name)}|${nkey(uni)}`;

// The year every recency decay is measured against. Written into the output so
// a stored score is auditable, and so regenerating is deterministic rather than
// quietly drifting with the wall clock.
const AS_OF = 2026;

assertRegistered(SRC);

// ---------------------------------------------------------------------------
// load
// ---------------------------------------------------------------------------
const files = deanFiles(SRC);
const ROWS = Object.fromEntries(files.map((f) => [f, read(f) || []]));
const ALL_ROWS = files.flatMap((f) => ROWS[f]);

const academic = buildAcademicIndex({
  records: ALL_ROWS,
  // career-geo.json is a general ORGANIZATION geocoder, not a school list -- it
  // carries "mckinsey & company", "goldman sachs" and "boeing" alongside the
  // alma maters. buildAcademicIndex takes only its academically-worded entries;
  // passing the raw keys marked those firms academic, which is what made
  // "McKinsey & Company" classify as a university in an earlier cut.
  extraNames: Object.keys(read("career-geo.json") || {}),
});

const UNCLASSIFIED = new Map();
const classifyOrg = makeClassifier(academic, {
  onUnclassified: (org) => UNCLASSIFIED.set(org, (UNCLASSIFIED.get(org) || 0) + 1),
});

// ---------------------------------------------------------------------------
// scoring
// ---------------------------------------------------------------------------
// A transparent additive score, not a fitted model -- there is no outcome label
// to fit against, and a made-up weighting that LOOKS learned would be worse than
// one a user can read off the page and argue with.
//
// Seniority dominates because it is what actually determines whether a network
// transfers: a managing director leaves a firm with relationships, an analyst
// leaves with a resume line.
const SENIORITY_POINTS = { executive: 45, senior: 32, professional: 14, unknown: 18 };

// A sitting board seat is a current, named, direct relationship -- for opening a
// door it beats a job the person left a decade ago, which is why board and
// advisory service are tracked separately from employment rather than folded in.
const KIND_POINTS = { board: 18, advisory: 8, employment: 0 };

/** Points for how long ago the tie ended. Unknown sits low-middle: no date is not
 *  evidence of staleness, but it must not outrank a tie known to be recent. */
function recencyPoints(year) {
  if (year == null) return 8;
  const age = AS_OF - year;
  if (age <= 5) return 25;
  if (age <= 12) return 18;
  if (age <= 20) return 10;
  if (age <= 30) return 4;
  return 0;
}

const tieScore = (t) =>
  Math.min(100, (SENIORITY_POINTS[t.seniority] ?? 18) + (KIND_POINTS[t.kind] ?? 0) + recencyPoints(t.endYear));

/** Last year mentioned in a free-text span like "1985-1991" or "2002-present". */
function endYearOf(years) {
  const s = String(years || "");
  if (!s) return null;
  if (/present|current|now/i.test(s)) return AS_OF;
  const all = s.match(/\b(?:19|20)\d{2}\b/g);
  return all ? Number(all[all.length - 1]) : null;
}

/**
 * `careerBackground` as a corroborating flag -- but only where it is a LABEL.
 *
 * In business and engineering the field holds a short taxonomy value
 * ("Industry", "Academic/Industry"). In advancement, nursing and admin the same
 * field holds a paragraph-long researched bio, and substring-matching that prose
 * is wrong in both directions: "corporate and foundation relations" is a
 * fundraising job, "board-certified family nurse practitioner" is clinical
 * nursing, "industry/innovation partnerships" is a university office. All three
 * were being flagged as industry experience before this guard -- 75 people.
 *
 * So: split on the separators a label uses, and require a WHOLE component to
 * match. A paragraph never satisfies that.
 */
const CB_LABELS = new Set([
  "industry", "consulting", "consultant", "corporate", "private sector",
  "practitioner", "business executive", "industry/practitioner", "finance",
]);
function careerBackgroundFlag(raw) {
  const cb = String(raw || "").trim();
  if (!cb || cb.length > 80) return null; // a bio, not a label
  const parts = cb.split(/[/,;&]|\band\b/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return parts.some((x) => CB_LABELS.has(x)) ? cb : null;
}

// ---------------------------------------------------------------------------
// evidence assembly
// ---------------------------------------------------------------------------
// One entry per person, keyed name|university the way every other sidecar in
// src/data is. Someone who appears across several indices (dean, then provost,
// then president at the same university) pools all their rows.
const P = new Map();
const person = (k) => {
  let p = P.get(k);
  if (!p) { p = { stops: [], flags: [], indices: new Set(), sitting: false }; P.set(k, p); }
  return p;
};

for (const f of files) {
  const id = FILE_ID[f];
  for (const r of ROWS[f]) {
    if (!r.dean || !r.university) continue;
    const p = person(ekey(r.dean, r.university));
    p.name ||= r.dean;
    p.university ||= r.university;
    if (id) p.indices.add(id);
    if (r.endYear == null && r.roleType !== "subdean") p.sitting = true;

    for (const org of splitOrgs(r.priorInstitution)) {
      // A prior institution is a job the person left when they took this seat,
      // so the appointment's start year dates the END of that tie. It is the
      // only recency signal available for the ~90% of ties carrying no explicit
      // years, and it is a real one.
      p.stops.push({
        org,
        role: String(r.priorTitle || "").trim(),
        endYear: r.startYear ?? null,
        source: "priorInstitution",
      });
    }

    if (r.hasConsultingBg === true) p.flags.push("hasConsultingBg");
    if (r.hasIndustryExp === true) p.flags.push("hasIndustryExp (existing)");
    const cb = careerBackgroundFlag(r.careerBackground);
    if (cb) p.flags.push(`careerBackground: ${cb}`);
  }
}

// leader-research career stops: sparser (about 1 person in 11) but multi-stop
// and sometimes dated, so they reach employers a single priorInstitution cell
// can never show -- and they are the only place a board seat currently appears.
for (const [k, rec] of Object.entries(read("leader-research.json") || {})) {
  const p = P.get(k);
  if (!p) continue;
  for (const st of rec.career || []) {
    for (const org of splitOrgs(st.org)) {
      p.stops.push({
        org,
        role: String(st.role || "").trim(),
        years: st.years || "",
        endYear: endYearOf(st.years),
        source: "leader-research.career",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// verdicts
// ---------------------------------------------------------------------------
// Three states, because two cannot tell a researched No from an empty cell --
// which is the whole reason this pass exists:
//
//   "yes"     at least one industry tie, or a corroborating flag
//   "no"      stops exist and every one is academic/government/nonprofit/health
//   "unknown" nothing to classify -- no prior institution, no researched career
//
// confidence: "high" when a named firm is attached, "low" when only a flag
// supports it with no employer to point at.
const out = {};
const stats = {
  people: P.size, yes: 0, no: 0, unknown: 0, yesHigh: 0, yesLow: 0, noSingleStop: 0,
  industries: {}, sectors: {}, sources: {}, seniority: {}, kinds: {},
  firms: new Set(), sittingWithTie: 0, sittingSeniorTie: 0,
};

for (const [k, p] of P) {
  const seen = new Set();
  const classified = [];
  for (const st of p.stops) {
    const c = classifyOrg(st.org);
    if (!c) continue;
    const dedup = `${c.sector}|${nkey(st.org)}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    classified.push({ ...st, ...c });
    stats.sectors[c.sector] = (stats.sectors[c.sector] || 0) + 1;
  }

  const ties = classified
    .filter((c) => c.sector === "Industry")
    .map((c) => {
      const kind = tieKindOf(c.role);
      const seniority = seniorityOf(c.role);
      return {
        kind,
        industry: c.industry,
        firm: c.firm,
        ...(c.role ? { role: c.role } : {}),
        seniority,
        ...(c.years ? { years: c.years } : {}),
        ...(c.endYear != null ? { endYear: c.endYear } : {}),
        source: c.source,
        score: tieScore({ kind, seniority, endYear: c.endYear ?? null }),
      };
    })
    .sort((a, b) => b.score - a.score);

  const flags = [...new Set(p.flags)];

  let status, confidence;
  if (ties.length) { status = "yes"; confidence = "high"; }
  else if (flags.length) { status = "yes"; confidence = "low"; }
  else if (classified.length) { status = "no"; confidence = "medium"; }
  else { status = "unknown"; confidence = "none"; }

  stats[status]++;
  if (status === "yes") stats[confidence === "high" ? "yesHigh" : "yesLow"]++;
  // The number that decides how much this pass is really worth: a "no" resting
  // on one career stop only says "the job immediately before this one was
  // academic", which is a different claim from "never worked in industry".
  if (status === "no" && classified.length === 1) stats.noSingleStop++;

  if (ties.length) {
    for (const t of ties) {
      stats.industries[t.industry] = (stats.industries[t.industry] || 0) + 1;
      stats.seniority[t.seniority] = (stats.seniority[t.seniority] || 0) + 1;
      stats.kinds[t.kind] = (stats.kinds[t.kind] || 0) + 1;
      stats.sources[t.source] = (stats.sources[t.source] || 0) + 1;
      stats.firms.add(t.firm);
    }
    if (p.sitting) {
      stats.sittingWithTie++;
      if (ties[0].seniority === "executive" || ties[0].seniority === "senior") stats.sittingSeniorTie++;
    }
  }

  // People with nothing to say are omitted. A consumer treats a missing key
  // exactly like status "unknown", which keeps the file to the people the
  // corpus actually has evidence for.
  if (status === "unknown") continue;

  out[k] = {
    name: p.name,
    university: p.university,
    status,
    confidence,
    sitting: p.sitting,
    ...(ties.length
      ? {
          // Person score is the best single tie, not a sum: one executive seat
          // at a household-name firm opens more doors than four junior stints,
          // and summing would rank the four above it.
          score: ties[0].score,
          seniority: ties[0].seniority,
          industries: [...new Set(ties.map((t) => t.industry))],
          firms: [...new Set(ties.map((t) => t.firm))],
          ties,
        }
      : // A "no" gets the sector tally and stop count only. Spelling out a dozen
        // universities to justify "no industry found" quadrupled the file to say
        // nothing a reader needs.
        { stops: classified.length, sectors: [...new Set(classified.map((c) => c.sector))] }),
    ...(flags.length ? { flags } : {}),
  };
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------
const pct = (n, d = stats.people) => `${((n / d) * 100).toFixed(1)}%`;
const rank = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

console.log(`people in corpus:          ${stats.people}`);
console.log(`  yes  (industry tie):     ${stats.yes}  (${pct(stats.yes)})  named-firm=${stats.yesHigh} flag-only=${stats.yesLow}`);
console.log(`  no   (evidence, no tie): ${stats.no}  (${pct(stats.no)})`);
console.log(`         of which single-stop: ${stats.noSingleStop}  (${pct(stats.noSingleStop, stats.no || 1)} of the No bucket -- a weak No)`);
console.log(`  unknown (no evidence):   ${stats.unknown}  (${pct(stats.unknown)})`);
console.log(`distinct firms named:      ${stats.firms.size}`);
console.log(`\nsitting leaders with a named-firm tie:      ${stats.sittingWithTie}`);
console.log(`  ...at senior or executive rank (v1 pool):  ${stats.sittingSeniorTie}`);
console.log(`\nties by seniority: ${SENIORITY_BANDS.map((b) => `${b}=${stats.seniority[b] || 0}`).join("  ")}`);
console.log(`ties by kind:      ${rank(stats.kinds).map(([k, n]) => `${k}=${n}`).join("  ")}`);
console.log(`industries:`, rank(stats.industries));
console.log(`org sectors seen:`, rank(stats.sectors));
console.log(`evidence source of ties:`, stats.sources);

if (DUMP_UNCLASSIFIED) {
  const rows = [...UNCLASSIFIED].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`\n=== ${rows.length} distinct orgs no rule matched ===`);
  console.log(`(each is either a vocabulary addition in lib/org-classify.mjs, or a genuine unknown)`);
  for (const [org, n] of rows) console.log(String(n).padStart(4), org);
}

if (!REPORT_ONLY && !DUMP_UNCLASSIFIED) {
  // Wrapped rather than a bare person map on purpose. Every other sidecar here
  // is keyed person -> record, and PROJECT.md documents what happens when a
  // generator sneaks a reserved key into one of those maps: consumers iterate
  // the values and choke on the entry that is not a record. Meta lives outside
  // the map instead of beside the people.
  const payload = {
    asOf: AS_OF,
    scoring: {
      seniority: SENIORITY_POINTS,
      kind: KIND_POINTS,
      recency: "<=5y:25  <=12y:18  <=20y:10  <=30y:4  older:0  unknown:8",
      note: "person score = best single tie, not a sum",
    },
    industries: INDUSTRY_NAMES,
    counts: {
      people: stats.people, yes: stats.yes, no: stats.no, unknown: stats.unknown,
      namedFirm: stats.yesHigh, flagOnly: stats.yesLow,
      firms: stats.firms.size,
      sittingWithTie: stats.sittingWithTie, sittingSeniorTie: stats.sittingSeniorTie,
    },
    people: Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]])),
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 1) + "\n");
  console.log(`\nwrote ${OUT} (${Object.keys(out).length} people, asOf ${AS_OF})`);
}
