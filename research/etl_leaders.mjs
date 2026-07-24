/**
 * Generic president/chancellor ETL: agent research JSON -> <prefix>-deans.json +
 * <prefix>-schools.json on the standard 54-key leadership schema, plus a photo
 * manifest. Carries forward the rules the vet build established:
 *   - origin derived at appointment time, never defaulted to External
 *   - a leader is "sitting" only if they are the LAST record for that institution
 *   - interim who then won the permanent job is flagged convertedToPermanent
 * Adds one rule this index needs: research is capped at 1996+ appointments for
 * most institutions, so each school records historyFrom and truncated, and the
 * earliest record is never presented as a founding leader.
 *
 * Usage:
 *   node etl_leaders.mjs --glob w --out r1-r2public --label "R2 University"
 *   node etl_leaders.mjs --glob s --out r1-system  --label "University System"
 */
import { readFileSync, writeFileSync, readdirSync } from "fs";

const HERE = "C:/Users/ren/AppData/Local/Temp/claude/C--Users-ren-BOSTON-UNIVERSITY-Dropbox-Justin-Z--Ren-00-Summer-2026-Sean-Willems-MSOM-data/154d52f1-b19f-49c6-9bb4-b1822091d87b/scratchpad/r2/";
const DATA = "C:/Users/ren/BOSTON UNIVERSITY Dropbox/Justin Z. Ren/00 Spring 2026/Dean Research/App/Dean-Tracker-Dashboard/artifacts/dean-dashboard/src/data/";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const PREFIX = arg("glob", "w");
const OUT = arg("out", "r1-r2public");
const LABEL = arg("label", "R2 University");

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const decade = (y) => `${Math.floor(y / 10) * 10}s`;

// ---- gather agent output ----
const files = readdirSync(HERE).filter((f) => f.startsWith(PREFIX) && f.endsWith(".json") && !f.startsWith("universe")).sort();
let unitsIn = [];
for (const f of files) {
  try {
    const j = JSON.parse(readFileSync(HERE + f, "utf8"));
    if (Array.isArray(j)) unitsIn.push(...j);
    else if (j && Array.isArray(j.institutions)) unitsIn.push(...j.institutions);
  } catch (e) { console.log("SKIP unreadable", f, e.message); }
}
console.log(`input files: ${files.join(", ")}`);
console.log(`institutions parsed: ${unitsIn.length}`);

function mapNext(rec) {
  const t = `${rec.nextRole || ""} ${rec.nextRoleInstitution || ""}`.toLowerCase();
  if (rec.endYear == null) return "Still_serving";
  if (!t.trim()) return "Unknown";
  if (/provost|president|chancellor/.test(t)) return "Provost_president_chancellor";
  if (/dean/.test(t)) return "Another_deanship";
  if (/emerit|faculty|professor|research|teaching/.test(t)) return "Faculty_emeritus";
  if (/retire/.test(t)) return "Full_retirement";
  if (/died|deceased|passed/.test(t)) return "Deceased";
  if (/industry|company|corp|foundation|government|nonprofit|association|firm|bank/.test(t)) return "Industry_nonprofit_govt";
  return "Unknown";
}

// Origin: internal means the prior job was at this same institution, or elsewhere
// inside the same system when the record carries one. Never defaulted.
function originOf(rec, university, system) {
  const pi = String(rec.priorInstitution || "").trim();
  const pt = String(rec.priorTitle || "").trim();
  const interim = !!rec.isInterim;
  const ctx = norm(`${pt} ${pi}`);
  if (!ctx) return { origin: "Unknown", isInternal: false, isExternal: false, appt: "unknown", sameSystem: false };
  const u = norm(university).replace(/^the /, "");
  const keys = new Set([u]);
  const ofM = u.match(/^university of (.+)$/); if (ofM) keys.add(ofM[1]);
  const core = u.replace(/\b(university|college|school|state|system|of|at)\b/g, " ").replace(/\s+/g, " ").trim();
  if (core.length >= 5) keys.add(core);
  for (const k of keys) {
    if (k.length >= 5 && ctx.includes(k)) {
      return { origin: interim ? "Interim-Internal" : "Internal", isInternal: true, isExternal: false, appt: interim ? "interim" : "internal", sameSystem: false };
    }
  }
  // same system but a different campus: external to the institution, worth flagging
  const sys = norm(system).replace(/^the /, "");
  const sysCore = sys.replace(/\b(university|system|of|state)\b/g, " ").replace(/\s+/g, " ").trim();
  const sameSystem = sysCore.length >= 5 && ctx.includes(sysCore);
  if (pi) return { origin: interim ? "Interim-External" : "External", isInternal: false, isExternal: true, appt: interim ? "interim" : "external", sameSystem };
  return { origin: "Unknown", isInternal: false, isExternal: false, appt: "unknown", sameSystem: false };
}

const deans = [], schools = [], photos = [];
for (const s of unitsIn) {
  const university = String(s.university || s.name || "").trim();
  const school = String(s.unit || "Office of the President").trim();
  if (!university) { console.log("SKIP unit missing name", JSON.stringify(s).slice(0, 80)); continue; }
  const system = String(s.system || "").trim();
  const list = Array.isArray(s.leaders) ? s.leaders : Array.isArray(s.deans) ? s.deans : [];
  const years = list.map((d) => (typeof d.startYear === "number" ? d.startYear : null)).filter(Boolean);
  const historyFrom = years.length ? Math.min(...years) : null;

  schools.push({
    university, school,
    rank: null,
    fullName: university,
    shortName: university.replace(/^The /, "").replace(/ University$/, ""),
    type: s.control || "Public",
    totalFaculty: null,
    lat: s.lat ?? null, lng: s.lng ?? null,
    city: s.city || null, state: s.state || null,
    founded: s.founded ?? null,
    carnegie: s.carnegie || "R2",
    system,
    leaderTitle: s.leaderTitle || "Chancellor",
    // Research was capped at 1996+ for most institutions. Recording this keeps the
    // earliest record from being misread as a founding leader.
    historyFrom,
    truncated: historyFrom != null && s.founded != null && historyFrom > s.founded,
  });

  for (const d of list) {
    if (!d || !d.dean) continue;
    const sy = typeof d.startYear === "number" ? d.startYear : null;
    const ey = typeof d.endYear === "number" ? d.endYear : null;
    const o = originOf(d, university, system);
    const female = String(d.gender || "").toLowerCase().startsWith("f");
    const title = s.leaderTitle || "Chancellor";
    deans.push({
      id: 0, university, school, dean: String(d.dean).trim(),
      startYear: sy, endYear: ey,
      startLabel: sy ? String(sy) : "", endLabel: ey ? String(ey) : "",
      priorTitle: d.priorTitle || "", priorInstitution: d.priorInstitution || "",
      origin: o.origin, originV2: o.origin, apptOrigin4: o.appt,
      isInternal: o.isInternal, isExternal: o.isExternal, isInterim: !!d.isInterim,
      careerBackground: "University Administration",
      hasIndustryExp: /industry|corp|company|bank|firm|practice/i.test(`${d.priorTitle || ""} ${d.priorInstitution || ""}`),
      gender: d.gender || "Unknown", isFemale: female,
      isFirstTimeDean: false,
      discipline: title, disciplineBroad: LABEL, phdField: "",
      hasPriorDeanExp: /\b(dean|president|chancellor)\b/i.test(String(d.priorTitle || "")),
      priorAssocOrAsstDean: /associate dean|assistant dean|vice president|vice chancellor/i.test(String(d.priorTitle || "")),
      hadAssocDeanRole: /associate dean|provost/i.test(String(d.priorTitle || "")),
      hadDeptChairRole: /head|chair|dean/i.test(String(d.priorTitle || "")),
      hasConsultingBg: false, hasPhd: true,
      rank: null, tier: "Unranked", inTop50: false, inTop100: false,
      fromEliteInstitution: false, priorInstitutionElite: false,
      tenureLength: sy && ey ? ey - sy : null,
      era: sy ? decade(sy) : "",
      notes: d.notes || "",
      nextRole: mapNext(d), nextRoleCode: null,
      _nextRaw: `${d.nextRole || ""} ${d.nextRoleInstitution || ""}`.trim(),
      involuntary: false, hadPriorConnection: o.isInternal || o.sameSystem,
      hasInstitutionalLink: o.isInternal || o.sameSystem,
      fromSameUniversityDiffSchool: o.sameSystem, surpriseDeparture: false, surpriseEvidence: "",
      sourceUrl: d.sourceUrl || d.bioPage || "",
      enrollmentEnd: null, enrollmentAvg: null, businessPctEnd: null, businessDegreesLatest: null,
      convertedToPermanent: false,
      connectionType: o.isInternal ? "Same institution" : o.sameSystem ? "Same system" : "",
    });
    if (d.photoUrl) photos.push({ dean: String(d.dean).trim(), university, photoUrl: d.photoUrl, bioPage: d.bioPage || "" });
  }
}

deans.sort((a, b) => a.university.localeCompare(b.university) || (a.startYear || 0) - (b.startYear || 0));

// ---- post-passes over each institution's chronology ----
const byUnit = {};
deans.forEach((d) => { const k = `${d.university}|${d.school}`; (byUnit[k] = byUnit[k] || []).push(d); });
let closed = 0, converted = 0;
for (const list of Object.values(byUnit)) {
  list.forEach((d, i) => {
    const next = list[i + 1];
    if (d.endYear == null && next && next.startYear != null) {
      const end = next.startYear;
      d.endYear = end;
      d.endLabel = String(end);
      d.nextRole = mapNext({ nextRole: d._nextRaw, endYear: end });
      d.tenureLength = d.startYear ? end - d.startYear : null;
      d.notes = `${d.notes ? d.notes + " " : ""}End year inferred from the start of the succeeding term; sources do not state an exact end date.`.trim();
      closed++;
    }
    if (d.isInterim && next && norm(next.dean) === norm(d.dean) && !next.isInterim) {
      d.convertedToPermanent = true;
      converted++;
    }
  });
}

deans.forEach((d, i) => { d.id = i + 1; delete d._nextRaw; });

writeFileSync(DATA + `${OUT}-deans.json`, JSON.stringify(deans, null, 2));
writeFileSync(DATA + `${OUT}-schools.json`, JSON.stringify(schools, null, 2));
writeFileSync(HERE + `photo_manifest_${OUT}.json`, JSON.stringify(photos, null, 2));

const sitting = deans.filter((d) => d.endYear == null).length;
const oq = deans.filter((d) => d.origin !== "Unknown").length;
console.log(`\nWROTE ${OUT}-deans.json  ${deans.length} records`);
console.log(`WROTE ${OUT}-schools.json ${schools.length} institutions`);
console.log(`sitting leaders: ${sitting}`);
console.log(`origin known   : ${oq} (${deans.length ? Math.round((oq / deans.length) * 100) : 0}%)`);
console.log(`prior role     : ${deans.filter((d) => d.priorTitle).length}`);
console.log(`same-system moves: ${deans.filter((d) => d.fromSameUniversityDiffSchool).length}`);
console.log(`photo urls     : ${photos.length}`);
console.log(`post-pass      : closed ${closed} open historical terms, ${converted} interim->permanent`);
console.log(`truncated pre-1996 history: ${schools.filter((s) => s.truncated).length} of ${schools.length}`);
