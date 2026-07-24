/**
 * QC a president/chancellor index before it ships. Same gates the vet index had,
 * plus awareness that this index is deliberately truncated at 1996.
 *   node qc_leaders.mjs --out r1-r2public
 */
import { readFileSync } from "fs";
const DATA = "C:/Users/ren/BOSTON UNIVERSITY Dropbox/Justin Z. Ren/00 Spring 2026/Dean Research/App/Dean-Tracker-Dashboard/artifacts/dean-dashboard/src/data/";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const OUT = arg("out", "r1-r2public");

const D = JSON.parse(readFileSync(DATA + `${OUT}-deans.json`, "utf8"));
const S = JSON.parse(readFileSync(DATA + `${OUT}-schools.json`, "utf8"));
const REF = JSON.parse(readFileSync(DATA + "r1-nursing-deans.json", "utf8"))[0];
const pct = (a, b) => (b ? Math.round((a / b) * 100) + "%" : "n/a");
let fail = 0;
const bad = (m) => { console.log("  FAIL " + m); fail++; };
const warn = (m) => console.log("  warn " + m);

console.log(`records ${D.length} | institutions ${S.length}`);

const refKeys = Object.keys(REF), missing = refKeys.filter((k) => !(k in (D[0] || {})));
if (missing.length) bad(`schema missing keys: ${missing.join(", ")}`);
else console.log("  ok   schema parity with existing indices");

if (new Set(D.map((d) => d.id)).size !== D.length) bad("duplicate ids");

D.forEach((d) => {
  if (d.startYear && d.endYear && d.endYear < d.startYear) bad(`${d.dean} @ ${d.university}: end ${d.endYear} < start ${d.startYear}`);
  if (d.startYear && (d.startYear < 1850 || d.startYear > 2027)) bad(`${d.dean}: implausible startYear ${d.startYear}`);
  if (!d.startYear) warn(`${d.dean} @ ${d.university}: no startYear`);
});

// an interim year and a permanent year for the same person is real history, not a dup
const seen = new Map();
D.forEach((d) => {
  const k = `${d.dean}|${d.university}|${d.startYear}|${d.isInterim}`;
  if (seen.has(k)) bad(`duplicate record: ${k}`);
  seen.set(k, 1);
});

const byUnit = {};
D.forEach((d) => { const k = `${d.university}|${d.school}`; (byUnit[k] = byUnit[k] || []).push(d); });
Object.entries(byUnit).forEach(([k, list]) => {
  const open = list.filter((d) => d.endYear == null);
  if (open.length > 1) bad(`${k}: ${open.length} sitting leaders (${open.map((o) => o.dean).join(", ")})`);
  if (open.length === 0) warn(`${k}: no sitting leader recorded`);
});

S.forEach((s) => {
  if (!D.some((d) => d.university === s.university && d.school === s.school)) bad(`${s.university} / ${s.school}: no leaders`);
});

// origin must never be blanket-defaulted
const originVals = {}; D.forEach((d) => originVals[d.origin] = (originVals[d.origin] || 0) + 1);
const known = D.filter((d) => d.origin && d.origin !== "Unknown").length;
const internal = D.filter((d) => d.isInternal).length;
if (known > 20 && internal === 0) bad("zero internal hires -- origin looks defaulted, not derived");

// the 1996 cap: report it, do not fail on it, but flag anything suspiciously old
const pre96 = D.filter((d) => d.startYear && d.startYear < 1996);
const trunc = S.filter((s) => s.truncated).length;

console.log("\ncoverage");
console.log(`  prior role   ${pct(D.filter((d) => d.priorTitle).length, D.length)}`);
console.log(`  origin known ${pct(known, D.length)}   internal ${internal} (${pct(internal, D.length)})`);
console.log(`  same-system  ${D.filter((d) => d.fromSameUniversityDiffSchool).length}`);
console.log(`  next role    ${pct(D.filter((d) => !["Unknown", "Still_serving"].includes(d.nextRole)).length, D.filter((d) => d.endYear != null).length)} of completed terms`);
console.log(`  gender known ${pct(D.filter((d) => d.gender && d.gender !== "Unknown").length, D.length)}`);
console.log(`  photos urls  n/a here (see fetch step)`);
console.log(`  sitting      ${D.filter((d) => d.endYear == null).length} of ${S.length} institutions`);
console.log(`  origin mix  `, JSON.stringify(originVals));
console.log(`\n1996 cap`);
console.log(`  records before 1996: ${pre96.length} (expected only from the Arkansas full-history wave)`);
console.log(`  institutions with truncated history: ${trunc} of ${S.length}`);
if (pre96.length) {
  const insts = [...new Set(pre96.map((d) => d.university))];
  console.log(`  pre-1996 appears at: ${insts.join(", ")}`);
}

console.log(fail ? `\n${fail} FAILURES` : "\nQC PASSED");
process.exit(fail ? 1 : 0);
