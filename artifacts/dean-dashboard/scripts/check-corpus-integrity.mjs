#!/usr/bin/env node
/**
 * CI guard: the four corpus defects the succession-panel rebuild surfaced, checked
 * on every change to the leadership data so the next collection wave cannot
 * reintroduce them silently.
 *
 *   node scripts/check-corpus-integrity.mjs [--base <ref>] [--list]
 *
 * WHY A REGRESSION GATE RATHER THAN A PASS/FAIL GATE
 * --------------------------------------------------
 * All four defects exist in the corpus today, in the hundreds. A check that simply
 * failed on any occurrence would block every pull request until a research backlog
 * is cleared, which means it would be switched off within a week. So this counts
 * defects at the base ref and at HEAD and fails only when a count goes UP -- the
 * same reasoning `validate-source-urls.mjs` applies to its ~974 legacy gaps, and the
 * reason that check has survived. The backlog shrinks when someone works it; the
 * check's job is to stop it growing.
 *
 * THE FOUR CHECKS
 * ---------------
 *   1. seat-role coverage  every dated row carries `seatRole`. A new index that
 *      skips the backfill fails here rather than silently contributing unclassified
 *      rows to every downstream consumer.
 *   2. two sitting holders  one seat with two open spells, counting only the seat
 *      itself. This is the check that was impossible before `seatRole`: the raw
 *      count was 581, of which the great majority were a president filed beside
 *      their own cabinet -- Arizona State's Michael Crow beside his EVP and CFO.
 *   3. placeholder end dates  a spell ending exactly at the extract year after
 *      running more than fifteen years is the ETL writing "unknown" as a date.
 *   4. collapsed spells  a title naming several appointments ("Dean of Faculty
 *      (1962-67); Provost (1967-71)") is two rows wearing one, which deletes a
 *      conversion and biases every interim rate downward.
 *
 * Exit status is 1 only on regression, so this is safe to wire into CI immediately.
 */
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./lib/institution-key.mjs";
import { normSchool, isCompoundTitle, titleVerbatim, isPlaceholderEnd } from "./lib/seat-identity.mjs";
import { classifySeatRole, INDEX_ROLE } from "./lib/seat-role.mjs";
import { UNREGISTERED_BY_DESIGN } from "./lib/indices.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..");
const SRC = join(HERE, "..", "src", "data");
const EXTRACT_YEAR = 2026;

const argv = process.argv.slice(2);
const baseIdx = argv.indexOf("--base");
const LIST = argv.includes("--list");
const BASE_REF =
  (baseIdx >= 0 && argv[baseIdx + 1]) ||
  process.env.BASE_REF ||
  (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null) ||
  "HEAD^1";

// `deans.json` is the Top-100 business cut, which overlaps `r1-bschool-deans.json`
// almost row for row; the corpus's own registry marks it unregistered-by-design for
// exactly this reason. Pooling it made 40 business schools look like they had two
// sitting deans, both of them the same person.
const FILES = readdirSync(SRC)
  .filter((f) => /^(r1-.*-deans|deans)\.json$/.test(f) && !UNREGISTERED_BY_DESIGN.has(f))
  .sort();

/** Read a data file at a git ref, or null when it did not exist there. */
function readAt(ref, f) {
  if (ref === null) return JSON.parse(readFileSync(join(SRC, f), "utf8"));
  const rel = relative(ROOT, join(SRC, f));
  try {
    return JSON.parse(execFileSync("git", ["show", `${ref}:${rel}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }));
  } catch {
    return null; // absent at base: every row in it is new
  }
}

/** Count all four defect classes over a whole corpus snapshot. */
function audit(ref) {
  const seats = new Map();
  const out = { unclassified: [], twoSitting: [], placeholder: [], collapsed: [] };
  for (const f of FILES) {
    const rows = readAt(ref, f);
    if (!rows) continue;
    for (const r of rows) {
      if (!r.startYear) continue;
      const where = `${f} #${r.id} ${r.dean}`;
      if (r.seatRole === undefined) out.unclassified.push(where);
      // Classify on the fly where the field is absent, so a snapshot from before the
      // backfill is measured the same way as one after it. Without this the base ref
      // scores zero on every seat check -- not because it was clean, but because
      // nothing was classified -- and every real count reads as a regression.
      const seatRole =
        r.seatRole ?? classifySeatRole(r, { indexRole: INDEX_ROLE[f] ?? "", leaderTitle: leaderTitleOf.get(keyOf(r.university)) });
      if (isPlaceholderEnd(r.startYear, r.endYear, EXTRACT_YEAR)) out.placeholder.push(where);
      if (isCompoundTitle(titleVerbatim(r))) out.collapsed.push(where);

      // Only the seat itself can have "two sitting holders". Cabinet officers and
      // the feeder bench legitimately overlap with the seat and with each other.
      if (seatRole !== "chief_executive" && seatRole !== "provost" && seatRole !== "dean") continue;
      const k = `${keyOf(r.university)}|${normSchool(r.school || "")}|${seatRole}`;
      if (!seats.has(k)) seats.set(k, []);
      seats.get(k).push({ r, where });
    }
  }
  for (const [k, list] of seats) {
    const open = list.filter((x) => x.r.endYear === null || x.r.endYear === undefined);
    if (open.length > 1) out.twoSitting.push(`${k} :: ${open.map((x) => x.r.dean).join(" | ")}`);
  }
  return out;
}

const LABELS = {
  unclassified: "dated rows with no seatRole",
  twoSitting: "seats with two sitting holders",
  placeholder: "placeholder end dates (extract year, run > 15y)",
  collapsed: "titles collapsing several spells",
};

// Institution leader titles, for on-the-fly classification of pre-backfill snapshots.
const leaderTitleOf = new Map();
for (const s of JSON.parse(readFileSync(join(SRC, "r1-r2public-schools.json"), "utf8")))
  if (s.leaderTitle) leaderTitleOf.set(keyOf(s.university), s.leaderTitle);

const now = audit(null);
const base = audit(BASE_REF);

let failed = false;
console.log(`corpus integrity (base: ${BASE_REF})\n`);
console.log(`  ${"check".padEnd(48)}${"base".padStart(8)}${"head".padStart(8)}`);
for (const k of Object.keys(LABELS)) {
  const b = base[k].length;
  const h = now[k].length;
  const verdict = h > b ? "  REGRESSION" : h < b ? "  improved" : "";
  if (h > b) failed = true;
  console.log(`  ${LABELS[k].padEnd(48)}${String(b).padStart(8)}${String(h).padStart(8)}${verdict}`);
  if (h > b || LIST) {
    const added = now[k].filter((x) => !base[k].includes(x));
    (LIST ? now[k] : added).slice(0, 20).forEach((x) => console.log(`      ${x}`));
  }
}

if (failed) {
  console.error(
    "\nFAIL: a defect count went up. These are corpus-level problems the succession-panel\n" +
      "rebuild documented (docs/corpus-pass-scope.md); the guard exists to stop them growing.\n" +
      "If a new index was added, run: node scripts/backfill-corpus-fields.mjs --write",
  );
  process.exit(1);
}
console.log("\nOK: no defect count increased.");
