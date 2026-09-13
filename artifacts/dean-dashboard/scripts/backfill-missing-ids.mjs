#!/usr/bin/env node
// Baton Index — backfill missing `id` on dean records across every index.
//
//   node scripts/backfill-missing-ids.mjs           dry run (default, writes nothing)
//   node scripts/backfill-missing-ids.mjs --apply   write every affected dataset
//
// WHY: `id` is a non-optional `number` on the Dean interface, but ~5,700
// associate/vice-dean feeder-bench records (roleType "subdean") across 12
// indices were added by ad-hoc research passes that never assigned one --
// they simply have no `id` key at all. Every place in the app that uses `id`
// as a person's IDENTITY (not just a React list key) silently breaks on
// these rows: Slate Builder's "your slate" checkbox/toggle and the expanded-
// profile state both compare by `d.id`, so two different missing-id
// candidates in the same cohort (there are 1000s of pairs -- e.g. two
// different "Kathy Fox" feeder-bench rows at two different schools) register
// as THE SAME person: checking one into the slate marks the other
// pre-checked, and removing one can silently remove both. Scout Assistant's
// candidate list has the same problem one layer up (its React `key` is
// `bench:${d.id}`/`broad:${d.id}`), which is fixed defensively in
// useScoutCandidates.ts by keying on name+university instead -- but that
// workaround doesn't reach Slate Builder's own id-keyed slate/expand state,
// so the actual data gap needs closing at the source.
//
// WHAT IT DOES: purely mechanical, no research involved. For each affected
// file, finds the highest existing numeric `id` and assigns every record
// missing one the next integer up, in the record's existing array order (so
// re-running is a no-op, and the assignment is stable/reproducible). Ids are
// scoped per FILE, matching how every consumer already treats them (never
// compared across indices). `id` is appended as the LAST key on a backfilled
// record rather than reordered to the front: JSON/JS don't care about key
// order, and appending keeps the diff to one line per record instead of
// reflowing the whole object.
//
// Idempotent: re-running changes nothing once applied.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "src", "data");
const APPLY = process.argv.includes("--apply");

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));

let totalFixed = 0;
const report = [];

for (const f of files) {
  const path = join(DATA_DIR, f);
  const raw = readFileSync(path, "utf8");
  let data;
  try { data = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(data) || !data.length || !("dean" in data[0])) continue; // only dean-record arrays

  const missing = data.filter((d) => typeof d.id !== "number");
  if (!missing.length) continue;

  const maxId = data.reduce((m, d) => (typeof d.id === "number" ? Math.max(m, d.id) : m), 0);
  let next = maxId + 1;
  const fixed = data.map((d) => (typeof d.id === "number" ? d : { ...d, id: next++ }));

  report.push({ file: f, total: data.length, backfilled: missing.length, idRange: `${maxId + 1}-${next - 1}` });
  totalFixed += missing.length;

  // Match the file's own existing format (pretty-printed vs minified single
  // line) rather than a fixed style -- reformatting an otherwise-untouched
  // minified file to 2-space-indented JSON would diff every record in it,
  // not just the ones actually backfilled.
  if (APPLY) {
    const isMinified = !raw.slice(0, raw.length - 1).includes("\n");
    writeFileSync(path, (isMinified ? JSON.stringify(fixed) : JSON.stringify(fixed, null, 2)) + "\n");
  }
}

console.log("Files affected:", report.length);
for (const r of report) console.log(`  ${r.file.padEnd(32)} backfilled ${String(r.backfilled).padStart(5)} of ${String(r.total).padStart(5)}  (ids ${r.idRange})`);
console.log("Total records backfilled:", totalFixed);

if (!APPLY) console.log("\nDRY RUN — nothing written. Re-run with --apply.");
else console.log("\nWrote", report.length, "file(s).");
