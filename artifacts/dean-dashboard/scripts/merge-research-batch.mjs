// Validate a wave's researched records and append them to the durable ledger.
//
// The ledger is append-only and researcher-set values override everything the
// generator would otherwise derive, so a malformed record here is not a crash
// -- it is a silent wrong answer that survives every later regeneration. Two
// fields have already caused exactly that:
//
//   * `seniority: "exec"` is not in SENIORITY_BANDS. The generator quietly fell
//     back to parsing the title and demoted 24 ties, several of them from
//     executive to unknown.
//   * `sector: "Academic"` is not in CATEGORY_NAMES. Two ties carried it and
//     were counted as industry ties that had no industry in them.
//
// Both were found by hand, afterwards. This script exists so the next one is
// found before the append, not after.
//
// Usage: node scripts/merge-research-batch.mjs <result.jsonl> [more.jsonl ...] [--dry-run]
import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_NAMES, SENIORITY_BANDS } from "./lib/org-classify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LEDGER = join(HERE, "..", "research", "nonacademic-ties.jsonl");

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) throw new Error("usage: merge-research-batch.mjs <result.jsonl> [...] [--dry-run]");

const SECTORS = new Set(CATEGORY_NAMES);
const BANDS = new Set(SENIORITY_BANDS);
const KINDS = new Set(["employment", "board", "advisory"]);
const VERDICTS = new Set(["yes", "no", "unknown"]);

// Every key already in the ledger. The ledger is append-only, so a duplicate is
// not an overwrite -- it is a second record for the same person, and which one
// wins is then an accident of file order.
const seen = new Set();
if (existsSync(LEDGER)) {
  for (const l of readFileSync(LEDGER, "utf8").split("\n")) {
    if (l.trim()) seen.add(JSON.parse(l).key);
  }
}

const problems = [];
const accepted = [];
const batchKeys = new Set();

for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  lines.forEach((line, i) => {
    const at = `${file}:${i + 1}`;
    let r;
    try { r = JSON.parse(line); } catch (e) { problems.push(`${at} unparseable: ${e.message}`); return; }

    for (const f of ["key", "name", "university", "stratum", "verdict", "wave"]) {
      if (!r[f]) problems.push(`${at} missing ${f}`);
    }
    if (!VERDICTS.has(r.verdict)) problems.push(`${at} verdict ${JSON.stringify(r.verdict)} not one of ${[...VERDICTS]}`);
    if (seen.has(r.key)) problems.push(`${at} ${r.key} is already in the ledger`);
    if (batchKeys.has(r.key)) problems.push(`${at} ${r.key} appears twice in this batch`);
    batchKeys.add(r.key);

    const ties = r.ties || [];
    if (r.verdict === "yes" && !ties.length) problems.push(`${at} ${r.key} verdict yes with no ties`);
    if (r.verdict !== "yes" && ties.length) problems.push(`${at} ${r.key} verdict ${r.verdict} but carries ties`);

    ties.forEach((t, ti) => {
      const tat = `${at} tie[${ti}]`;
      if (!t.firm) problems.push(`${tat} missing firm`);
      if (!SECTORS.has(t.sector)) problems.push(`${tat} sector ${JSON.stringify(t.sector)} is not a valid category`);
      if (!BANDS.has(t.seniority)) problems.push(`${tat} seniority ${JSON.stringify(t.seniority)} is not a band (want ${[...BANDS]})`);
      if (!KINDS.has(t.kind)) problems.push(`${tat} kind ${JSON.stringify(t.kind)} not one of ${[...KINDS]}`);
    });

    if (r.verdict === "yes" && !(r.sources || []).length) problems.push(`${at} ${r.key} verdict yes with no sources`);
    accepted.push(r);
  });
}

if (problems.length) {
  console.error(`${problems.length} problem(s) -- nothing appended:\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const tally = accepted.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
const tieCount = accepted.reduce((n, r) => n + (r.ties || []).length, 0);
console.log(`${accepted.length} records validated: yes=${tally.yes || 0} no=${tally.no || 0} unknown=${tally.unknown || 0}, ${tieCount} ties`);

if (DRY) { console.log("--dry-run: not appended"); process.exit(0); }
appendFileSync(LEDGER, accepted.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log(`appended to ${LEDGER} (now ${seen.size + accepted.length} records)`);
