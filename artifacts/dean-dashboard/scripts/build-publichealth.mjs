// One-off ETL: normalize the researched Public Health dean records (pragmatic
// shape) into the full Dean schema -> src/data/r1-publichealth-deans.json, and
// fold their education strings into leader-research.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const SC = "C:/Users/ren/AppData/Local/Temp/claude/C--Users-ren-BOSTON-UNIVERSITY-Dropbox-Justin-Z--Ren-00-Summer-2026-Sean-Willems-MSOM-data/154d52f1-b19f-49c6-9bb4-b1822091d87b/scratchpad";

const raw = JSON.parse(readFileSync(join(SC, "ph_deans_all.json"), "utf8"));
const schools = JSON.parse(readFileSync(join(SRC, "r1-publichealth-schools.json"), "utf8"));
const research = JSON.parse(readFileSync(join(SRC, "r1-publichealth-research.json"), "utf8"));
const tierByKey = new Map(research.map((r) => [`${r.university}|||${r.school}`, r.tier]));
const schoolOrder = new Map(schools.map((s, i) => [`${s.university}|||${s.school}`, i]));

const NOW = 2026;
const hasDoc = (s) => /(ph\.?\s?d|dr\.?\s?p\.?\s?h|sc\.?\s?d|ed\.?\s?d|d\.?\s?n\.?\s?p|dph|d\.?sc|d\.?o\b)/i.test(s || "");
const era = (y) => (y ? `${Math.floor(y / 10) * 10}s` : "");
const chairRole = (t) => /\bchair\b/i.test(t || "");
const assocDean = (t) => /(associate|assistant|senior associate|deputy|vice)\s+dean/i.test(t || "");
const priorDean = (t) => /(^|[^a-z])dean\b/i.test(t || "") && !assocDean(t);

// Sort by school (as ordered in the schools file), then by start year.
raw.sort((a, b) => {
  const ka = schoolOrder.get(`${a.university}|||${a.school}`) ?? 999;
  const kb = schoolOrder.get(`${b.university}|||${b.school}`) ?? 999;
  return ka !== kb ? ka - kb : (a.startYear || 0) - (b.startYear || 0);
});

let id = 1;
const deans = raw.map((d) => {
  const key = `${d.university}|||${d.school}`;
  const tier = tierByKey.get(key) || "Non-R1";
  const isInternal = d.origin === "Internal";
  const tenure = d.endYear != null && d.startYear != null ? d.endYear - d.startYear : null;
  const phd = hasDoc(d.phdField) || hasDoc(d.education);
  return {
    id: id++,
    university: d.university,
    school: d.school,
    dean: d.dean,
    startYear: d.startYear ?? null,
    endYear: d.endYear ?? null,
    startLabel: d.startYear ? String(d.startYear) : "",
    endLabel: d.endYear ? String(d.endYear) : "",
    priorTitle: d.priorTitle || "",
    priorInstitution: d.priorInstitution || "",
    origin: d.origin || "",
    originV2: d.origin || "",
    apptOrigin4: (d.origin || "").toLowerCase(),
    isInternal,
    isExternal: !isInternal && !!d.origin,
    isInterim: !!d.isInterim,
    careerBackground: "Public Health",
    hasIndustryExp: false,
    gender: d.gender || "Unknown",
    isFemale: d.gender === "Female",
    isFirstTimeDean: false,
    discipline: "Dean",
    disciplineBroad: "Public Health",
    phdField: d.phdField || "",
    hasPriorDeanExp: priorDean(d.priorTitle),
    priorAssocOrAsstDean: assocDean(d.priorTitle),
    hadAssocDeanRole: assocDean(d.priorTitle),
    hadDeptChairRole: chairRole(d.priorTitle),
    hasConsultingBg: false,
    hasPhd: phd,
    rank: null,
    tier,
    inTop50: false,
    inTop100: false,
    fromEliteInstitution: false,
    priorInstitutionElite: false,
    tenureLength: tenure,
    era: era(d.startYear),
    notes: d.notes || "",
    nextRole: d.endYear == null ? "Still_serving" : "",
    nextRoleCode: null,
    involuntary: false,
    hadPriorConnection: false,
    hasInstitutionalLink: isInternal,
    fromSameUniversityDiffSchool: false,
    surpriseDeparture: false,
    surpriseEvidence: "",
    sourceUrl: d.sourceUrl || "",
    enrollmentEnd: null,
    enrollmentAvg: null,
    businessPctEnd: null,
    businessDegreesLatest: null,
    convertedToPermanent: false,
    connectionType: "",
  };
});

writeFileSync(join(SRC, "r1-publichealth-deans.json"), JSON.stringify(deans, null, 1));

// Fold education into leader-research.json (keyed by dean|university, lowercased).
const lr = JSON.parse(readFileSync(join(SRC, "leader-research.json"), "utf8"));
let eduAdded = 0;
for (const d of raw) {
  if (!d.education) continue;
  const k = `${d.dean.trim().toLowerCase()}|${d.university.trim().toLowerCase()}`;
  lr[k] = Object.assign({}, lr[k] || {}, { education: d.education });
  eduAdded++;
}
writeFileSync(join(SRC, "leader-research.json"), JSON.stringify(lr));

console.log(`Wrote r1-publichealth-deans.json (${deans.length} records)`);
console.log(`  current: ${deans.filter((d) => d.endYear == null).length} | female: ${deans.filter((d) => d.isFemale).length} | interim: ${deans.filter((d) => d.isInterim).length} | hasPhd: ${deans.filter((d) => d.hasPhd).length}`);
console.log(`  education folded into leader-research.json: ${eduAdded} entries (now ${Object.keys(lr).length} keys)`);
