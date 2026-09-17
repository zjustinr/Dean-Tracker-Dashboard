#!/usr/bin/env node
/**
 * P1: find every school whose leadership is recorded in more than one index.
 *
 *   node scripts/report-cross-index-seats.mjs [--csv <path>]
 *
 * This is the BatonIndex-facing half of the corpus pass. The product pools these
 * indexes, so a school recorded in two of them appears twice in affinity, in scout
 * and on the dashboard, with its spell history split across the copies. The
 * succession panel hit the same defect and fixed it inside its own export by keying
 * seats without `unit_type`; that fix never reached the corpus, and 202 of the 220
 * affected schools sit in indexes the panel does not even read.
 *
 * It REPORTS rather than merges, deliberately. Choosing which copy survives is a
 * judgement about which collection wave researched the school more deeply, and the
 * spec's own rule is not to resolve contradictions silently. The output is an
 * adjudication worklist: one row per school, the indexes involved, how many spells
 * each contributed, and whether the two copies actually disagree about anything.
 *
 * A school appearing twice is not automatically wrong -- `r1-university` and
 * `r1-r2public` overlap on eleven institutions by Carnegie-vintage design, and that
 * is recorded rather than flagged. Everything else needs a human.
 *
 * THE KEY INCLUDES `seatRole`, AND THE FIRST VERSION'S DID NOT
 * -----------------------------------------------------------
 * That first version reported 220 schools, and the number was wrong by an order of
 * magnitude. It keyed on institution plus school name -- and `school` is a catch-all:
 * every cabinet officer at a liberal-arts college carries "Office of the President",
 * the same string the president's own row carries. So a president in `r1-lac` and
 * their VP for Finance in `r1-adminleaders` collided on one key and were reported as
 * the same school recorded twice. They are two different seats, correctly filed in
 * two different indexes. 202 of the 220 were that.
 *
 * The corpus pass's own scope document said "a corpus-wide seat identity needs a role
 * dimension", and then this script was written without one. `seatRole` now exists, so
 * the key carries it, and the worklist drops from 220 schools / 1,859 spells to 54 /
 * 350 -- of which 13 are the expected Carnegie-vintage overlap and 18 are different
 * people still colliding on that same catch-all school value. 23 are real.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./lib/institution-key.mjs";
import { normSchool } from "./lib/seat-identity.mjs";
import { classifySeatRole, INDEX_ROLE } from "./lib/seat-role.mjs";
import { UNREGISTERED_BY_DESIGN } from "./lib/indices.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const csvIdx = process.argv.indexOf("--csv");
const CSV = csvIdx > -1 ? process.argv[csvIdx + 1] : null;

const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));
const FILES = readdirSync(SRC)
  .filter((f) => /^(r1-.*-deans|deans)\.json$/.test(f) && !UNREGISTERED_BY_DESIGN.has(f))
  .sort();

/** The eleven institutions both president indexes cover, by Carnegie vintage. */
const KNOWN_VINTAGE_OVERLAP = new Set(
  read("r1-university-schools.json")
    .map((s) => keyOf(s.university))
    .filter((k) => new Set(read("r1-r2public-schools.json").map((x) => keyOf(x.university))).has(k)),
);

/** Institution leader titles, for classifying a row whose `seatRole` predates the backfill. */
const leaderTitleOf = new Map();
for (const s of read("r1-r2public-schools.json")) if (s.leaderTitle) leaderTitleOf.set(keyOf(s.university), s.leaderTitle);

const seats = new Map();
for (const f of FILES) {
  for (const r of read(f)) {
    if (!r.startYear) continue;
    const seatRole = r.seatRole ?? classifySeatRole(r, { indexRole: INDEX_ROLE[f] ?? "", leaderTitle: leaderTitleOf.get(keyOf(r.university)) });
    const k = `${keyOf(r.university)}||${normSchool(r.school || "")}||${seatRole}`;
    if (!seats.has(k)) seats.set(k, { display: `${r.university} / ${r.school || "(no school)"} [${seatRole || "unresolved"}]`, inst: keyOf(r.university), byFile: new Map() });
    const s = seats.get(k);
    if (!s.byFile.has(f)) s.byFile.set(f, []);
    s.byFile.get(f).push(r);
  }
}

const short = (f) => f.replace("r1-", "").replace("-deans.json", "");
const rows = [];
for (const [, s] of seats) {
  if (s.byFile.size < 2) continue;
  const files = [...s.byFile.keys()];
  const isVintage =
    KNOWN_VINTAGE_OVERLAP.has(s.inst) &&
    files.every((f) => f === "r1-university-deans.json" || f === "r1-r2public-deans.json");

  // Do the copies actually disagree? Same person, same start year, different interim
  // status is a contradiction a human has to settle; the rest is just duplication.
  const byPerson = new Map();
  for (const [f, list] of s.byFile)
    for (const r of list) {
      const pk = `${String(r.dean || "").toLowerCase().replace(/[^a-z ]/g, "").trim()}|${r.startYear}`;
      if (!byPerson.has(pk)) byPerson.set(pk, []);
      byPerson.get(pk).push({ f, r });
    }
  let shared = 0;
  let contradictions = 0;
  for (const [, v] of byPerson) {
    if (new Set(v.map((x) => x.f)).size < 2) continue;
    shared++;
    if (new Set(v.map((x) => Boolean(x.r.isInterim))).size > 1) contradictions++;
  }

  rows.push({
    school: s.display,
    indexes: files.map(short).join(" + "),
    spells: files.map((f) => `${short(f)}:${s.byFile.get(f).length}`).join(" "),
    shared_people: shared,
    contradictions,
    // A contradiction outranks a known overlap: the eleven Carnegie-vintage pairs are
    // expected duplication, but two copies disagreeing on whether a spell was interim
    // still needs settling. Ranking vintage first hid two of the three real ones.
    // `shared_people` is what separates a real duplicate from a collision. Two copies
    // of the same person is duplication; two different officers filed under the same
    // catch-all school value is not, and 18 of the survivors are that.
    status: contradictions
      ? isVintage
        ? "vintage_overlap_but_contradicts"
        : "needs_review_contradiction"
      : isVintage
        ? "known_carnegie_vintage_overlap"
        : shared
          ? "needs_review"
          : "distinct_people_shared_school_value",
  });
}

rows.sort((a, b) => b.contradictions - a.contradictions || a.school.localeCompare(b.school));
const counts = rows.reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {});

console.log(`cross-index seats: ${rows.length} schools recorded in more than one index\n`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(34)} ${v}`);

const pairCounts = rows.reduce((m, r) => ((m[r.indexes] = (m[r.indexes] || 0) + 1), m), {});
console.log("\nby index pair:");
for (const [k, v] of Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 10))
  console.log(`  ${String(v).padStart(4)}  ${k}`);

const contra = rows.filter((r) => r.contradictions);
console.log(`\nschools where the copies contradict each other on interim status: ${contra.length}`);
contra.slice(0, 15).forEach((r) => console.log(`  ${r.school.slice(0, 58).padEnd(60)} ${r.indexes}  (${r.contradictions})`));

if (CSV) {
  const cols = ["school", "indexes", "spells", "shared_people", "contradictions", "status"];
  const esc = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  writeFileSync(CSV, [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n") + "\r\n", "utf8");
  console.log(`\nwrote ${CSV}`);
}
