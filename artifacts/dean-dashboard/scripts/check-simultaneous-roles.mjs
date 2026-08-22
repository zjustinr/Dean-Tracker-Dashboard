#!/usr/bin/env node
/**
 * Data-quality guard: find people the corpus records as *currently sitting* in two
 * leadership seats at once.
 *
 * A record counts as "sitting" when it has a startYear and no endYear. Two sitting
 * records for the same person at two different institutions is usually one of three
 * things:
 *
 *   1. Two spellings of one institution      -- a school-canon gap, fix in school-canon.mjs
 *   2. A genuine concurrent appointment      -- system chancellor + flagship president,
 *                                               a joint presidency, shared campus admin
 *   3. A stale record                        -- the person moved and the old seat was
 *                                               never closed out
 *
 * Only (3) is a bug, and it is the one worth surfacing: a leader who left in 2022 but
 * still reads as sitting inflates tenure stats, keeps a filled seat out of the vacancy
 * counts, and shows the wrong incumbent on the school page. This script separates the
 * three so the residual list is short enough to research by hand.
 *
 * (1) is folded automatically through school-canon's canonicalizer, so a new alias
 * fixes those pairs here for free. (2) needs a human call, so it lives in the
 * CONCURRENT list below with a reason attached -- every entry is a claim someone
 * checked, not a silencer.
 *
 *   node scripts/check-simultaneous-roles.mjs [--all]
 *
 * --all also prints the pairs that were classified away, so the classification itself
 * stays auditable. Exit status is always 0: this reports, it does not gate CI, because
 * a stale incumbency is a research task rather than a broken build.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCanon } from "./lib/school-canon.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const SHOW_ALL = process.argv.includes("--all");

/**
 * Seats the corpus is right to show as concurrent. Keyed by the *normalized* name
 * (lowercased, punctuation stripped -- "Mun Y. Choi" -> "mun y choi"), so keys written
 * with periods silently never match. The reason is printed under --all so a wrong
 * entry stays visible rather than becoming a silencer.
 */
const CONCURRENT = {
  "renu khator": "UH System chancellor and UH president -- one appointment, two seats",
  "rebecca cunningham": "UMN System president and Twin Cities president",
  "mun y choi": "UM System president and Mizzou chancellor",
  "michael amiridis": "USC System president and USC president",
  "carine m feyten": "TWU System chancellor and TWU president",
  "brian j bruess": "joint presidency of College of Saint Benedict and Saint John's",
  "casey gordon": "shared CSB/SJU administration under the joint presidency",
  "alan kadish": "Touro University president; Hebrew Theological College is a Touro division",
  "joanne m mahoney": "SUNY-ESF president, indexed once as president and once as college head",
};

/**
 * Institution pairs that share an administration, so one officer genuinely holds the
 * seat at both. Normalized-name pairs, order-insensitive.
 */
const SHARED_ADMIN = [
  ["purdue university", "purdue university global"],
  ["university of oklahoma", "university of oklahoma health sciences center"],
  ["university of nevada las vegas", "university of nevada reno"], // NSHE system-wide posts
  ["college of saint benedict", "saint johns university"],
];

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sharedAdmin = (a, b) => {
  const [x, y] = [norm(a), norm(b)];
  return SHARED_ADMIN.some(([p, q]) => (x === p && y === q) || (x === q && y === p));
};

// ---------------------------------------------------------------- load

const records = [];
for (const file of readdirSync(SRC).filter((f) => /^r1-.*-deans\.json$/.test(f))) {
  let rows;
  try {
    rows = JSON.parse(readFileSync(join(SRC, file), "utf8"));
  } catch {
    continue;
  }
  if (!Array.isArray(rows)) continue;
  for (const r of rows) records.push({ ...r, _file: file });
}

const { toCanon } = buildCanon(records);

const sitting = records.filter(
  (r) => r.dean && r.startYear && (r.endYear === null || r.endYear === undefined || r.endYear === ""),
);

const byPerson = new Map();
for (const r of sitting) {
  const k = norm(r.dean);
  if (!byPerson.has(k)) byPerson.set(k, []);
  byPerson.get(k).push(r);
}

// ---------------------------------------------------------------- classify

const buckets = { alias: [], concurrent: [], review: [] };

for (const [person, seats] of byPerson) {
  if (seats.length < 2) continue;

  // Distinct institutions only -- two seats at one school (dean then provost) are
  // a different question and are not what this check is for.
  const canons = new Set(seats.map((s) => toCanon(s.university) || norm(s.university)));
  if (canons.size < 2) {
    buckets.alias.push({ person, seats, why: "same institution after canonicalization" });
    continue;
  }

  if (CONCURRENT[person]) {
    buckets.concurrent.push({ person, seats, why: CONCURRENT[person] });
    continue;
  }

  // Every seat has to pair with every other one, so a third unrelated seat still
  // surfaces even when two of the three are a known shared-admin pair.
  const allShared = seats.every((a) =>
    seats.every((b) => a === b || sharedAdmin(a.university, b.university)),
  );
  if (allShared) {
    buckets.concurrent.push({ person, seats, why: "shared administration across paired institutions" });
    continue;
  }

  buckets.review.push({ person, seats });
}

// ---------------------------------------------------------------- report

const show = ({ person, seats, why }) => {
  console.log(`\n  ${person}${why ? `  -- ${why}` : ""}`);
  for (const s of seats.sort((a, b) => a.startYear - b.startYear)) {
    console.log(`      ${String(s.startYear).padEnd(5)} ${s.university} | ${s.school}  [${s._file}#${s.id}]`);
  }
};

console.log(`Scanned ${records.length} records, ${sitting.length} of them sitting.`);

if (buckets.review.length) {
  console.log(`\n${"=".repeat(72)}\nNEEDS REVIEW -- ${buckets.review.length} people sitting in two seats at once`);
  console.log("Most are a seat that was never closed out. The later start year is\nusually the live one; the earlier record is the one to end-date.");
  // Widest gap first: a 2018 seat still open against a 2026 appointment is the
  // most certainly stale, and the most distorting to tenure stats.
  buckets.review
    .sort((a, b) => {
      const span = (x) => Math.max(...x.seats.map((s) => s.startYear)) - Math.min(...x.seats.map((s) => s.startYear));
      return span(b) - span(a);
    })
    .forEach(show);
}

if (SHOW_ALL) {
  console.log(`\n${"=".repeat(72)}\nCONCURRENT BY DESIGN -- ${buckets.concurrent.length}`);
  buckets.concurrent.forEach(show);
  console.log(`\n${"=".repeat(72)}\nONE INSTITUTION, TWO SPELLINGS -- ${buckets.alias.length}`);
  buckets.alias.forEach(show);
} else {
  console.log(
    `\n${buckets.concurrent.length} concurrent by design, ${buckets.alias.length} folded by school-canon. Re-run with --all to see them.`,
  );
}
