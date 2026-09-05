#!/usr/bin/env node
// Merge audited candidates from enrich-from-source-pages.mjs into the datasets.
//
// Defensive by default: dry-run unless --write is passed, never overwrites a
// value that is already there, and re-checks that the row at (file, idx) still
// carries the name the candidate was harvested for -- indices shift whenever a
// dataset is regenerated, and writing a start year onto the wrong person is the
// exact failure this whole pipeline exists to avoid.
//
//   node scripts/src/apply-source-page-enrichment.mjs cands.json [--write]

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const candPath = args.find(a => !a.startsWith('--'));
const write = args.includes('--write');
if (!candPath) { console.error('usage: apply-source-page-enrichment.mjs <candidates.json> [--write]'); process.exit(1); }

const DATA = 'artifacts/dean-dashboard/src/data';
const { hits } = JSON.parse(fs.readFileSync(candPath, 'utf8'));

// Preserve each file's existing indentation so the diff stays reviewable.
function indentOf(src, parsed) {
  for (const ind of [1, 2, 4, '\t']) if (JSON.stringify(parsed, null, ind) === src.trim()) return ind;
  return 1;
}

const byFile = new Map();
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, []);
  byFile.get(h.file).push(h);
}

const norm = s => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const summary = { startYear: 0, phdInstitution: 0, phdYear: 0, skippedNameMismatch: 0, skippedOccupied: 0 };

for (const [file, fileHits] of byFile) {
  const p = path.join(DATA, file);
  const src = fs.readFileSync(p, 'utf8');
  const rows = JSON.parse(src);
  const ind = indentOf(src, rows);
  let touched = 0;

  for (const h of fileHits) {
    const row = rows[h.idx];
    // Guard against index drift: the row must still be the same person.
    if (!row || norm(row.dean) !== norm(h.dean)) { summary.skippedNameMismatch++; continue; }

    if (h.startYear != null) {
      if (row.startYear == null) {
        row.startYear = h.startYear;
        if (!row.startLabel) row.startLabel = String(h.startYear);
        summary.startYear++; touched++;
      } else summary.skippedOccupied++;
    }
    if (h.phdInstitution) {
      if (!row.phdInstitution) { row.phdInstitution = h.phdInstitution; summary.phdInstitution++; touched++; }
      else summary.skippedOccupied++;
    }
    if (h.phdYear != null) {
      if (row.phdYear == null) { row.phdYear = h.phdYear; summary.phdYear++; touched++; }
      else summary.skippedOccupied++;
    }
  }

  console.log(`${file}: ${touched} field(s) filled${write ? '' : ' (dry run)'}`);
  if (write && touched) fs.writeFileSync(p, JSON.stringify(rows, null, ind));
}

console.log('\n' + JSON.stringify(summary, null, 2));
if (!write) console.log('\nDry run -- nothing written. Re-run with --write to apply.');
