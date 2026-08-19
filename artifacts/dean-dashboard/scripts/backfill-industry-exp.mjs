#!/usr/bin/env node
// Baton Index — backfill hasIndustryExp on the Senior Administrative Leaders index.
//
//   node scripts/backfill-industry-exp.mjs           dry run (default, writes nothing)
//   node scripts/backfill-industry-exp.mjs --apply   write the dataset + audit log
//
// WHY: hasIndustryExp shipped `false` on all 4,514 admin-leaders records, so an
// "Industry Experience" filter over this index returned nothing at all -- not a
// thin result, an empty one. The flag was simply never populated during the
// collection waves (careerBackground is empty on 100% of these records too).
//
// WHAT IT INFERS FROM: the officer's immediately-prior employer, classified by
// scripts/employer-sector.mjs. Only SECTOR.INDUSTRY sets the flag; government,
// military, hospital systems, foundations and other universities do not.
//
// KNOWN LIMITATION -- read before quoting a number off this: priorInstitution
// holds only the ONE employer immediately before the current role. An officer
// who spent fifteen years at IBM and then did a stint at another university
// before this appointment reads as an education hire here and will NOT be
// flagged. This backfill therefore UNDERCOUNTS, deliberately: for a filter a
// search consultant runs against real candidates, a missed name costs less than
// a wrong one. Roughly 3,000 of the 4,514 records carry no prior employer at
// all and are untouched by this pass.
//
// Idempotent: re-running changes nothing once applied.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { classifyEmployer, SECTOR } from "./employer-sector.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "src", "data", "r1-adminleaders-deans.json");
const AUDIT = join(HERE, "..", "..", "..", "attached_assets", "industry_exp_backfill_log.csv");
const APPLY = process.argv.includes("--apply");

const raw = JSON.parse(readFileSync(DATA, "utf8"));
const recs = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray);
if (!recs) { console.error("Could not find the record array in", DATA); process.exit(1); }

// One sentence naming the actual employer, so a hit in the filter can be
// justified to a client without opening another tab. careerBackground is
// rendered in DeanProfile/DeanTimeline and searched by Individual Search and
// Scout Assistant, so this text is both visible and findable.
function evidence(rec) {
  const emp = rec.priorInstitution.trim();
  const title = (rec.priorTitle || "").trim();
  return title ? `Industry background: ${title}, ${emp}.` : `Industry background: ${emp}.`;
}

const csv = [["dean", "university", "priorTitle", "priorInstitution", "action"]];
let flagged = 0, already = 0, cbWritten = 0, cbKept = 0;

for (const r of recs) {
  const emp = (r.priorInstitution || "").trim();
  if (!emp) continue;
  if (classifyEmployer(emp) !== SECTOR.INDUSTRY) continue;

  if (r.hasIndustryExp === true) { already++; } else { r.hasIndustryExp = true; flagged++; }

  // Never clobber a careerBackground someone already researched by hand.
  const existing = (r.careerBackground || "").trim();
  let action = "flag";
  if (!existing) { r.careerBackground = evidence(r); cbWritten++; action = "flag+evidence"; }
  else { cbKept++; action = "flag (careerBackground kept)"; }

  csv.push([r.dean || "", r.university || "", r.priorTitle || "", emp, action]);
}

console.log(`records scanned          : ${recs.length}`);
console.log(`newly flagged            : ${flagged}`);
console.log(`already flagged          : ${already}`);
console.log(`evidence written         : ${cbWritten}`);
console.log(`existing text preserved  : ${cbKept}`);
console.log(`total industry-flagged   : ${flagged + already}  (${((100 * (flagged + already)) / recs.length).toFixed(1)}% of the index)`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); process.exit(0); }

writeFileSync(DATA, JSON.stringify(raw, null, 2) + "\n");
const esc = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
writeFileSync(AUDIT, csv.map((row) => row.map(esc).join(",")).join("\n") + "\n");
console.log(`\nWrote ${DATA}`);
console.log(`Wrote ${AUDIT} (${csv.length - 1} rows)`);
