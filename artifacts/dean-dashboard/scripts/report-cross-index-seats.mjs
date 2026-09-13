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
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf } from "./lib/institution-key.mjs";
import { normSchool } from "./lib/seat-identity.mjs";
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

const seats = new Map();
for (const f of FILES) {
  for (const r of read(f)) {
    if (!r.startYear) continue;
    const k = `${keyOf(r.university)}||${normSchool(r.school || "")}`;
    if (!seats.has(k)) seats.set(k, { display: `${r.university} / ${r.school || "(no school)"}`, inst: keyOf(r.university), byFile: new Map() });
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
    status: contradictions
      ? isVintage
        ? "vintage_overlap_but_contradicts"
        : "needs_review_contradiction"
      : isVintage
        ? "known_carnegie_vintage_overlap"
        : "needs_review",
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
