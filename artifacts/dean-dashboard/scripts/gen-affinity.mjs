// Cross-index AFFINITY map: for every school, the leaders anywhere in the database
// with a tie to it (undergrad / grad / faculty / administration). Powers the Slate
// Builder "Affinity to this school" selector. Regenerated on every build/deploy, so
// it stays current with news auto-adds and new leaders/indices with no manual step.
//
//   node scripts/gen-affinity.mjs
//
// Sources: r1-*-deans.json (leadership stints -> administration, and each leader's
// display identity), leader-research.json career arrays (faculty/admin roles),
// career-roots.json alma-mater degrees (undergrad/grad). New index files matching
// r1-*-deans.json are picked up automatically (glob); add a label to INDEX_LABEL
// for a nicer source badge.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
// Committed alongside leader-research.json (its main input) and served through the
// gated /data endpoint with per-scope filtering. Regenerated on every build/deploy.
const OUT = join(SRC, "affinity-by-school.json");

const FILE_ID = {
  "r1-bschool-deans.json": "r1bschool", "r1-eschool-deans.json": "r1eschool",
  "r1-university-deans.json": "r1university", "r1-medschool-deans.json": "r1medical",
  "r1-lawschool-deans.json": "r1law", "r1-provost-deans.json": "r1provost",
  "r1-agschool-deans.json": "usag", "r1-nursing-deans.json": "usnursing",
  "r1-pharmacy-deans.json": "uspharmacy", "r1-education-deans.json": "useducation",
  "r1-arts-deans.json": "r1arts", "r1-r2public-deans.json": "usr2",
  "r1-system-deans.json": "ussystem", "r1-publichealth-deans.json": "uspublichealth",
  "r1-vet-deans.json": "usvet", "r1-grad-deans.json": "usgrad",
  "r1-camd-deans.json": "uscreativearts",
  "r1-advancement-deans.json": "usadvancement", "r1-lac-deans.json": "uslac",
  // Explicit override, not just a nicer label: without this, the fallback
  // f.replace(/^r1-|-deans\.json$/g, "") derives "adminleaders" -- a string
  // that isn't a real DatasetId (the registered id is "usadminleaders", see
  // datasets.ts). That mismatch silently breaks cross-index resolution for
  // every affinity tie sourced from this file (useScoutCandidates.ts's
  // resolveProfile calls loadDatasetData(entry.index), which throws/no-ops
  // for an unknown id) -- every adminleaders-sourced affinity candidate
  // elsewhere in the app would resolve to "not-found".
  "r1-adminleaders-deans.json": "usadminleaders",
};
const INDEX_LABEL = {
  r1bschool: "Business", r1eschool: "Engineering", r1university: "President",
  r1medical: "Medical", r1law: "Law", r1provost: "Provost", usag: "Ag & Forestry",
  usnursing: "Nursing", uspharmacy: "Pharmacy", useducation: "Education",
  r1arts: "Arts & Sciences", usr2: "R2", ussystem: "System",
  uspublichealth: "Public Health", usvet: "Veterinary", usgrad: "Graduate College",
  uscreativearts: "Creative Arts", usadvancement: "Advancement", uslac: "LAC President",
  usadminleaders: "Administrative",
};
// Fallback label for an index file not yet in the map (a newly added index).
const labelFor = (id) => INDEX_LABEL[id] || id.replace(/^r1|^us/, "").replace(/^\w/, (c) => c.toUpperCase());

const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return null; } };
const nkey = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const ekey = (name, uni) => `${String(name || "").trim().toLowerCase()}|${String(uni || "").trim().toLowerCase()}`;
// School-name normalizer for matching free-text org / degree strings to a
// canonical dropdown school. Drops punctuation, a leading "the", and campus/comma
// tails so "Arizona State University, Tempe" lands on "Arizona State University".
const snorm = (s) => String(s || "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")
  .replace(/^the /, "").trim();

const UGRAD = /\b(ba|bs|bsc|ab|bachelor|undergrad)\b/i;
const ADMIN = /\b(dean|provost|chancellor|president|chair|director|vice president|vice provost|head|officer|coordinator|rector|principal|superintendent)\b/i;

// ---- load all leadership files (glob, so new indices auto-include) ------------
const deanFiles = readdirSync(SRC).filter((f) => /^r1-.*-deans\.json$/.test(f)).sort();
const DEANS = []; // { rec, idx }
const canon = new Map(); // snorm(university) -> canonical university string (as shown in the dropdown)
// Proper-cased display name per normalized key. career-roots.json / leader-research.json
// are keyed lowercase, so without this the lowercase spelling can win over the dean
// record's canonical casing. Prefer a value that actually has upper-case letters.
const PROPER = new Map(); // nkey(name) -> properly-cased name
for (const f of deanFiles) {
  const id = FILE_ID[f] || f.replace(/^r1-|-deans\.json$/g, "");
  const rows = read(f) || [];
  for (const r of rows) {
    DEANS.push({ r, id });
    if (r.university) { const k = snorm(r.university); if (!canon.has(k)) canon.set(k, r.university); }
    if (r.dean) { const k = nkey(r.dean); const cur = PROPER.get(k); if (!cur || (/[A-Z]/.test(r.dean) && !/[A-Z]/.test(cur))) PROPER.set(k, String(r.dean).trim()); }
  }
}
// Fallback title-caser for any leader with no dean-record spelling (rare).
const titleCase = (s) => String(s).replace(/\b[a-z][a-z'’-]*/gi, (w) => w.charAt(0).toUpperCase() + w.slice(1));
const displayName = (raw) => PROPER.get(nkey(raw)) || titleCase(raw);
// Curated unambiguous abbreviations -> canonical normalized name. Guarded by
// canon.has() at match time, so a value that isn't an actual school just no-ops.
const ALIAS = {
  "ucla": "university of california los angeles", "ucsd": "university of california san diego",
  "ucsb": "university of california santa barbara", "uc berkeley": "university of california berkeley",
  "berkeley": "university of california berkeley", "cal": "university of california berkeley",
  "uc davis": "university of california davis", "uc irvine": "university of california irvine",
  "uc riverside": "university of california riverside", "uc santa cruz": "university of california santa cruz",
  "mit": "massachusetts institute of technology", "penn": "university of pennsylvania", "upenn": "university of pennsylvania",
  "nyu": "new york university", "usc": "university of southern california", "unc": "university of north carolina",
  "uva": "university of virginia", "umich": "university of michigan", "msu": "michigan state university",
  "osu": "the ohio state university", "penn state": "pennsylvania state university",
  "georgia tech": "georgia institute of technology", "asu": "arizona state university",
};
const canonKeys = [...canon.keys()];
// Match a free-text org/degree string to a canonical dropdown school. Exact ->
// alias -> unique word-boundary prefix (either direction), so "University of
// Michigan Medical School" and "University of Wisconsin" both resolve, while
// ambiguous stems like "University of California" (many campuses) stay unmatched.
function toCanon(org) {
  const n = snorm(org);
  if (!n) return null;
  if (canon.has(n)) return canon.get(n);
  const a = ALIAS[n];
  if (a && canon.has(a)) return canon.get(a);
  const supers = canonKeys.filter((k) => k.startsWith(n + " "));
  if (supers.length === 1) return canon.get(supers[0]);
  let best = null;
  for (const k of canonKeys) if (n.startsWith(k + " ") && (!best || k.length > best.length)) best = k;
  if (best && canonKeys.filter((k) => n.startsWith(k + " ") && k.length === best.length).length === 1) return canon.get(best);
  return null;
}

const lr = read("leader-research.json") || {};
const roots = read("career-roots.json") || {};
const photos = read("dean-photos.json") || {};

// ---- per-leader tie accumulator (keyed by normalized name) --------------------
// L[name] = { name, disp, ties: Map<canonicalSchool, {undergrad,grad,faculty,admin:[]}> }
const L = new Map();
const getL = (name) => {
  const k = nkey(name);
  let e = L.get(k);
  if (!e) { e = { name: String(name).trim(), disp: null, ties: new Map() }; L.set(k, e); }
  return e;
};
const bucket = (name, school, kind, evidence) => {
  if (!school) return;
  const e = getL(name);
  let t = e.ties.get(school);
  if (!t) { t = { undergrad: [], grad: [], faculty: [], admin: [] }; e.ties.set(school, t); }
  if (!t[kind].includes(evidence)) t[kind].push(evidence);
};

// 1) alma maters -> undergrad / grad, matched to a canonical school
for (const [key, rs] of Object.entries(roots)) {
  const name = key.split("|")[0];
  for (const r of rs || []) {
    const school = toCanon(r.school);
    if (!school) continue;
    const lvl = String(r.level || "").trim();
    bucket(name, school, UGRAD.test(lvl) ? "undergrad" : "grad", `${lvl || "degree"}, ${school}`);
  }
}
// 2) career history -> faculty / admin, matched to a canonical school
for (const [key, rec] of Object.entries(lr)) {
  const name = key.split("|")[0];
  for (const step of rec.career || []) {
    const school = toCanon(step.org);
    if (!school) continue;
    const role = String(step.role || ""), yrs = String(step.years || "");
    bucket(name, school, ADMIN.test(role) ? "admin" : "faculty", `${role}${yrs ? ", " + yrs : ""}`);
  }
}
// 3) leadership stints -> administration at that university; also the display record
for (const { r, id } of DEANS) {
  const name = r.dean; if (!name) continue;
  if (r.roleType !== "subdean" && r.university) {
    const title = r.discipline || "Leadership role";
    const sy = r.startYear, ey = r.endYear;
    const span = sy ? `, ${sy}-${ey ? ey : "present"}` : "";
    bucket(name, r.university, "admin", `${title}, ${r.school || r.university}${span}`);
  }
  const e = L.get(nkey(name));
  if (e) {
    const disc = r.discipline || "";
    const roleDisp = disc && disc !== r.disciplineBroad ? disc : (r.school || disc || "Leader");
    const sitting = r.endYear == null, start = r.startYear || 0;
    const cand = { role: roleDisp, university: r.university || "", school: r.school || null, index: id,
      indexLabel: labelFor(id), enrichKey: ekey(name, r.university), sitting, start,
      hasPhoto: !!photos[ekey(name, r.university)] };
    const d = e.disp;
    if (!d || (cand.sitting && !d.sitting) || (cand.sitting === d.sitting && cand.start > d.start)) e.disp = cand;
  }
}

// ---- assemble: { school -> [entries sorted by tie richness] } -----------------
const bySchool = {};
for (const e of L.values()) {
  const disp = e.disp || { role: "", university: "", index: null, indexLabel: null, enrichKey: ekey(e.name, "") };
  for (const [school, t] of e.ties) {
    if (!(t.undergrad.length || t.grad.length || t.faculty.length || t.admin.length)) continue;
    (bySchool[school] = bySchool[school] || []).push({
      name: displayName(e.name), role: disp.role, university: disp.university,
      index: disp.index, indexLabel: disp.indexLabel, enrichKey: disp.enrichKey,
      undergrad: t.undergrad, grad: t.grad, faculty: t.faculty, admin: t.admin,
    });
  }
}
const tieCount = (x) => x.undergrad.length + x.grad.length + x.faculty.length + x.admin.length;
for (const s of Object.keys(bySchool)) bySchool[s].sort((a, b) => tieCount(b) - tieCount(a) || a.name.localeCompare(b.name));

writeFileSync(OUT, JSON.stringify(bySchool) + "\n");
const schools = Object.keys(bySchool).length;
const pairs = Object.values(bySchool).reduce((n, a) => n + a.length, 0);
const withFac = Object.values(bySchool).reduce((n, a) => n + a.filter((x) => x.faculty.length || x.undergrad.length || x.grad.length).length, 0);
console.log(`affinity-by-school.json: ${schools} schools, ${pairs} (school,leader) ties, ${withFac} with faculty/alumni ties`);
