// Scout Assistant "weak link" mining pass — a shared-employer/institution
// overlap signal, distinct from (and complementary to) affinity-by-school.json's
// direct alumni/faculty/admin ties. Where affinity answers "who has a direct tie
// to this school," this answers "who has a career background matching the KIND
// of place this DISCIPLINE's external hires tend to come from" -- e.g. Finance
// & Accounting deans skew Wall Street/consulting backgrounds far more than the
// index average, so any leader elsewhere with that kind of stop on their record
// becomes a candidate for a Finance & Accounting deanship, even with zero direct
// tie to that specific school. This is a co-affiliation (shared-neighbor) signal
// over the person<->organization graph -- not a full network embedding, which
// the data here (thin per-person career coverage, a few hundred appointments
// per index) is too sparse to support credibly.
//
//   node scripts/gen-employer-affinity.mjs
//
// Two passes:
//   1. Categorize every EXTERNAL hire's priorInstitution into a broad
//      organization type, grouped by disciplineBroad (NOT by individual
//      school -- a single school's entire recorded history rarely has more
//      than 3-6 external hires, too thin to trust; an earlier cut of this
//      script tried per-school and per-tier grouping and a held-out
//      validation showed both barely beat chance). Flag categories that are
//      distinctive for a discipline (lift vs. the index-wide baseline,
//      excluding Academic, which dominates everywhere and would swamp
//      everything else). Gated on a leave-one-hire-out validation per index:
//      does a category flagged from a discipline's OTHER hires actually
//      predict a held-out hire's category more than that category's own
//      base rate would by chance? An index that doesn't clear that bar
//      contributes nothing to the output -- most indices don't, and that's
//      the honest result, not a bug to paper over.
//   2. Build every person's OWN lifetime organization-category set (from every
//      priorInstitution they've ever listed across any appointment, plus any
//      researched career stops in leader-research.json), then match people
//      against each VALIDATED discipline's distinctive categories. Output is
//      still keyed by university (every school inherits its own discipline's
//      profile) so nothing downstream needs to know discipline is the
//      grouping unit.
//
// Deduping "weak link" candidates against people who already have a direct
// affinity tie, or who've already held the role, is left to the client
// (ScoutAssistant.tsx already loads both affinity-by-school.json and the
// current index's own deans for that) -- this script only answers "who
// matches this school's revealed hiring pattern," not "who's new information."
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { assertRegistered, deanFiles as listDeanFiles, FILE_ID, INDEX_LABEL } from "./lib/indices.mjs";
import { affinityCategory, buildAcademicIndex, makeClassifier } from "./lib/org-classify.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const OUT = join(SRC, "employer-affinity.json");

// FILE_ID and INDEX_LABEL used to be copy-pasted here, in gen-affinity.mjs,
// gen-scout-insights.mjs and scout-backtest.mjs, each with a note saying the
// duplication was deliberate. It drifted: scout-backtest.mjs never learned about
// r1-adminleaders-deans.json, the largest index, and silently mined a corpus
// missing a fifth of its people. The registry now lives in lib/indices.mjs.

const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return null; } };
const nkey = (s) => String(s || "").trim().toLowerCase();
const ekey = (name, uni) => `${nkey(name)}|${nkey(uni)}`;

// ---- organization categorizer --------------------------------------------
// Delegates to lib/org-classify.mjs, the taxonomy shared with
// gen-industry-experience.mjs, and maps its fine-grained sectors onto the coarse
// category names this file has always published (Scout Assistant renders them as
// "<category> background").
//
// The local copy this replaces had the trailing-\b stem bug: written
// `/\b(google|...|technolog|software)\b/i`, the closing boundary applies to
// every branch, so `technolog` never matched "Technology" or "Technologies" and
// `philanthrop` never matched "Philanthropy". The Technology category could
// therefore only ever fire on the named-company list -- which for engineering
// schools is precisely the signal most worth having. It also had no academic
// gazetteer, so informal school names ("Stanford GSB", "UCLA Anderson") fell to
// the residual bucket.
//
// One category is new rather than renamed: Energy & Industrials and Consumer &
// Retail employers used to land in "Other" and be discarded as too broad; they
// now group as "Industry & Manufacturing" and are minable.
assertRegistered(SRC);

// Read every dean file up front: the academic gazetteer is built from the
// corpus's own institution spellings, so it has to exist before the first
// categorize() call rather than being assembled as we go.
const DEAN_FILES = listDeanFiles(SRC).filter((f) => FILE_ID[f]);
const FILE_ROWS = Object.fromEntries(DEAN_FILES.map((f) => [f, read(f) || []]));

const classifyOrg = makeClassifier(
  buildAcademicIndex({
    records: DEAN_FILES.flatMap((f) => FILE_ROWS[f]),
    // Only the academically-worded slice: career-geo.json is an ORGANIZATION
    // geocoder and lists McKinsey, Goldman and Boeing next to the alma maters.
    extraNames: Object.keys(read("career-geo.json") || {}),
  }),
);
const categorize = (org) => affinityCategory(classifyOrg(org));

const MIN_INDEX_N = 8; // categorized external hires an index needs to be worth mining at all
const LOW_CONFIDENCE_N = 20; // discipline-group sample below this is still flagged as preliminary
const LIFT_THRESHOLD = 1.4;
const MAX_DISTINCTIVE = 2;
const MAX_WEAK_LINKS = 20; // over-provide; client dedupes against affinity + everHeldNames

// ---- pass 1: every person's lifetime organization-category set ------------
// Two sources: (a) priorInstitution on every appointment record they've ever
// held, across ANY index -- broad coverage, one org per record; (b) researched
// career steps in leader-research.json -- sparser (~23% of people) but often
// has several stops per person, catching a buried past org a single
// priorInstitution field would miss.
const PERSON = new Map(); // nkey(name) -> { disp: {...} | null, categories: Map<cat, evidence> }
const getPerson = (name) => {
  const k = nkey(name);
  let p = PERSON.get(k);
  if (!p) { p = { disp: null, categories: new Map() }; PERSON.set(k, p); }
  return p;
};
const addCategory = (name, org, evidence) => {
  const cat = categorize(org);
  if (!cat || cat === "Other") return; // "Other" is too broad to be a useful weak-link signal
  const p = getPerson(name);
  if (!p.categories.has(cat)) p.categories.set(cat, evidence);
};

const ALL_ROWS = []; // { r, id } across every index, for the school-profile pass
for (const f of DEAN_FILES) {
  const id = FILE_ID[f];
  for (const r of FILE_ROWS[f]) {
    ALL_ROWS.push({ r, id });
    if (!r.dean) continue;
    if (r.priorInstitution) addCategory(r.dean, r.priorInstitution, `${r.priorTitle ? r.priorTitle + ", " : ""}${r.priorInstitution}`);
    // Track each person's most notable ("disp") record the same way
    // gen-affinity.mjs does, so weak-link entries can open a real profile.
    if (r.roleType !== "subdean" && r.university) {
      const p = getPerson(r.dean);
      const sitting = r.endYear == null, start = r.startYear || 0;
      const cand = { name: r.dean, role: r.discipline || r.school || "Leader", university: r.university, index: id, indexLabel: INDEX_LABEL[id] || id, enrichKey: ekey(r.dean, r.university), sitting, start };
      if (!p.disp || (cand.sitting && !p.disp.sitting) || (cand.sitting === p.disp.sitting && cand.start > p.disp.start)) p.disp = cand;
    }
  }
}
const lr = read("leader-research.json") || {};
for (const [key, rec] of Object.entries(lr)) {
  const name = key.split("|")[0];
  for (const step of rec.career || []) addCategory(name, step.org, `${step.role}${step.org ? ", " + step.org : ""}${step.years ? ", " + step.years : ""}`);
}

// ---- pass 2: per index, per discipline -> distinctive hire-origin categories
const employerAffinity = {};
let totalSchools = 0, totalWeakLinks = 0;

for (const [file, id] of Object.entries(FILE_ID)) {
  const rows = ALL_ROWS.filter((x) => x.id === id).map((x) => x.r);
  if (!rows.length) continue;

  const externalHires = rows.filter((r) => r.isExternal === true && r.roleType !== "subdean" && r.priorInstitution && categorize(r.priorInstitution) && categorize(r.priorInstitution) !== "Other");
  if (externalHires.length < MIN_INDEX_N) continue;

  const indexCounts = new Map();
  for (const r of externalHires) { const c = categorize(r.priorInstitution); indexCounts.set(c, (indexCounts.get(c) || 0) + 1); }
  const indexRate = (cat) => (indexCounts.get(cat) || 0) / externalHires.length;

  const MIN_GROUP_N = 15;
  const byGroup = new Map();
  for (const r of externalHires) {
    const g = String(r.disciplineBroad || "").trim();
    if (!g || /^(unknown|other)$/i.test(g)) continue; // too heterogeneous a bucket to mean anything
    (byGroup.get(g) || byGroup.set(g, []).get(g)).push(r);
  }

  // Leave-one-hire-out validation, run over every hire in every discipline
  // group (not just one held-out hire per group) -- pooling within a
  // discipline gives enough hires per bucket (15-60+) for a real sample.
  // Tests the actual mechanism weak-links relies on: excluding Academic (the
  // dominant category everywhere, so "predicting" it proves nothing), does a
  // DISTINCTIVE category flagged from a discipline's other hires actually
  // predict the held-out hire's category more often than that category's own
  // index-wide base rate would by chance? hitRate well above baselineHitRate
  // means the signal is real; hitRate near baseline means it's noise.
  let hits = 0, baselineSum = 0, evaluated = 0;
  for (const [, hires] of byGroup) {
    if (hires.length < MIN_GROUP_N) continue;
    for (let i = 0; i < hires.length; i++) {
      const train = hires.filter((_, j) => j !== i);
      const trainCounts = new Map();
      for (const r of train) { const c = categorize(r.priorInstitution); trainCounts.set(c, (trainCounts.get(c) || 0) + 1); }
      const trainDistinctive = [...trainCounts.entries()]
        .map(([cat, n]) => ({ cat, lift: (n / train.length) / indexRate(cat) }))
        .filter((d) => d.cat !== "Academic" && d.lift >= LIFT_THRESHOLD)
        .sort((a, b) => b.lift - a.lift)[0];
      if (!trainDistinctive) continue;
      evaluated++;
      if (categorize(hires[i].priorInstitution) === trainDistinctive.cat) hits++;
      baselineSum += indexRate(trainDistinctive.cat);
    }
  }
  const validation = evaluated >= 10
    ? { hitRate: Math.round((hits / evaluated) * 1000) / 1000, baselineHitRate: Math.round((baselineSum / evaluated) * 1000) / 1000, n: evaluated }
    : null;
  // Require the signal to clearly beat chance before shipping ANY weak links
  // for this index -- a null or unproven validation means "don't trust this
  // index's employer-overlap signal," not "show it anyway."
  // Each individual category is rare (a few percent of all hires), so even
  // real signal caps out at a low ABSOLUTE hit rate -- a 3x lift over a 2%
  // baseline is only 6% accuracy in absolute terms, and that's expected, not
  // a sign the model is broken. The ratio over baseline is what actually
  // measures "is there real signal here," with a small absolute floor just to
  // rule out a lift computed from a baseline so close to zero that any single
  // lucky hit would inflate it.
  const validated = !!validation && validation.hitRate >= validation.baselineHitRate * 2.5 && validation.hitRate >= 0.04;
  if (!validated) continue;

  const groupCategories = new Map(); // discipline -> { categories, sampleSize }
  for (const [group, hires] of byGroup) {
    if (hires.length < MIN_GROUP_N) continue;
    const counts = new Map();
    for (const r of hires) { const c = categorize(r.priorInstitution); counts.set(c, (counts.get(c) || 0) + 1); }
    const distinctive = [...counts.entries()]
      .map(([cat, n]) => ({ category: cat, n, rate: Math.round((n / hires.length) * 1000) / 1000, indexRate: Math.round(indexRate(cat) * 1000) / 1000, lift: Math.round((n / hires.length / indexRate(cat)) * 100) / 100 }))
      .filter((c) => c.category !== "Academic" && c.lift >= LIFT_THRESHOLD && c.n >= 3)
      .sort((a, b) => b.lift - a.lift)
      .slice(0, MAX_DISTINCTIVE);
    if (distinctive.length) groupCategories.set(group, { categories: distinctive, sampleSize: hires.length });
  }
  if (!groupCategories.size) continue;

  // Map every school in this index to its discipline (most frequent discipline
  // among its own past external hires).
  const schoolGroup = new Map();
  for (const r of rows) {
    if (!r.university || !r.disciplineBroad) continue;
    const g = String(r.disciplineBroad).trim();
    if (!groupCategories.has(g)) continue;
    const m = schoolGroup.get(r.university) || new Map();
    m.set(g, (m.get(g) || 0) + 1);
    schoolGroup.set(r.university, m);
  }

  const schools = {};
  for (const [university, groupCounts] of schoolGroup) {
    const group = [...groupCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const { categories: distinctive, sampleSize } = groupCategories.get(group);

    // Weak-link candidates: anyone in the whole database whose own category
    // set overlaps this school's discipline-level distinctive categories,
    // ranked by how many categories they match and how strong those are.
    const scored = [];
    for (const p of PERSON.values()) {
      if (!p.disp) continue; // no real leadership record to show a profile for
      const matched = distinctive.filter((d) => p.categories.has(d.category));
      if (!matched.length) continue;
      scored.push({
        name: p.disp.name, enrichKey: p.disp.enrichKey, index: p.disp.index, indexLabel: p.disp.indexLabel,
        university: p.disp.university, role: p.disp.role,
        matchedCategories: matched.map((d) => ({ category: d.category, lift: d.lift, evidence: p.categories.get(d.category) })),
        score: matched.reduce((s, d) => s + d.lift, 0),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const weakLinks = scored.slice(0, MAX_WEAK_LINKS).map(({ score, ...e }) => e);
    if (!weakLinks.length) continue;

    schools[university] = { categories: distinctive, weakLinks, group, sampleSize, lowConfidence: sampleSize < LOW_CONFIDENCE_N };
    totalSchools++;
    totalWeakLinks += weakLinks.length;
  }

  if (Object.keys(schools).length) employerAffinity[id] = { validation, schools };
}

writeFileSync(OUT, JSON.stringify(employerAffinity) + "\n");
console.log(`employer-affinity.json: ${Object.keys(employerAffinity).length} indices, ${totalSchools} schools with a distinctive hiring pattern, ${totalWeakLinks} weak-link candidate slots`);
for (const [id, v] of Object.entries(employerAffinity)) {
  if (v.validation) console.log(`  ${id}: leave-one-out hit rate ${v.validation.hitRate} vs. baseline ${v.validation.baselineHitRate} (n=${v.validation.n})`);
}
