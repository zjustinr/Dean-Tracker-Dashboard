#!/usr/bin/env node
// Baton Index — audit hasIndustryExp on the Senior Administrative Leaders index.
//
//   node scripts/check-industry-exp.mjs
//
// Same role as check-phd-institution.mjs: hasIndustryExp has no schema guard and
// is only ever written by an enrichment pass, so a later collection wave can
// silently contradict it. This re-derives the flag from the current classifier
// and reports every disagreement.
//
// Exits 0 by design -- it is a report to read, not a gate. A wave that adds
// officers without a prior employer is normal and shows up as "unclassifiable",
// not as an error.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyEmployer, SECTOR } from "./employer-sector.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "src", "data", "r1-adminleaders-deans.json");
const raw = JSON.parse(readFileSync(DATA, "utf8"));
const recs = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);

const flaggedNotIndustry = [];   // true, but the employer says otherwise
const industryNotFlagged = [];   // employer says industry, flag is not set
const flaggedNoEmployer = [];    // true with nothing to justify it
const evidenceMismatch = [];     // evidence text names a different employer
let unclassifiable = 0, flagged = 0;

for (const r of recs) {
  const emp = (r.priorInstitution || "").trim();
  const isFlagged = r.hasIndustryExp === true;
  if (isFlagged) flagged++;
  if (!emp) {
    if (isFlagged) flaggedNoEmployer.push(r);
    else unclassifiable++;
    continue;
  }
  const sector = classifyEmployer(emp);
  if (isFlagged && sector !== SECTOR.INDUSTRY) flaggedNotIndustry.push([r, sector]);
  if (!isFlagged && sector === SECTOR.INDUSTRY) industryNotFlagged.push(r);
  const cb = (r.careerBackground || "").trim();
  if (isFlagged && cb.startsWith("Industry background:") && !cb.includes(emp)) evidenceMismatch.push(r);
}

const line = (r) => `    ${r.dean || "?"} — ${r.university || "?"}  [${r.priorInstitution || "no prior employer"}]`;

console.log(`records                 : ${recs.length}`);
console.log(`hasIndustryExp = true   : ${flagged} (${((100 * flagged) / recs.length).toFixed(1)}%)`);
console.log(`no prior employer       : ${unclassifiable} (cannot be judged either way)`);
console.log();

const report = (label, rows, fmt = line) => {
  console.log(`${rows.length ? "!" : "✓"} ${label}: ${rows.length}`);
  rows.slice(0, 15).forEach((x) => console.log(fmt(x)));
  if (rows.length > 15) console.log(`    ...and ${rows.length - 15} more`);
};

report("flagged, but prior employer is not private sector", flaggedNotIndustry,
  ([r, s]) => `    ${r.dean} — ${r.priorInstitution} classifies as ${s}`);
report("prior employer is private sector, but flag not set", industryNotFlagged);
report("flagged with no prior employer to justify it", flaggedNoEmployer);
report("evidence text does not name the prior employer", evidenceMismatch);

console.log("\nReminder: this only sees the IMMEDIATELY prior employer, so officers");
console.log("with older industry careers behind a university role are undercounted.");
