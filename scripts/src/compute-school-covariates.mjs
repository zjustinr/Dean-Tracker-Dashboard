#!/usr/bin/env node
// Compute the school covariates (enrollmentEnd, enrollmentAvg, businessPctEnd,
// businessDegreesLatest) for every dean row from the IPEDS panel.
//
// Definitions, fixed here and mirrored in docs/data-provenance.md:
//
//   endRef                 tenure end year; for a sitting dean (endYear null),
//                          the most recent panel year for that institution.
//   enrollmentEnd          total enrolment at endRef (EF<year>A, EFALEVEL=1).
//   enrollmentAvg          mean total enrolment over startYear..endRef, across
//                          the panel years actually available in that window.
//   businessPctEnd         business completions / all completions at endRef
//                          (C<year>_A, MAJORNUM=1, CIP 52.* over CIP 99).
//   businessDegreesLatest  business completions in the latest panel year for
//                          the institution; constant across that university's
//                          deans, matching how the field was used before.
//
// Rows resolve to null, on purpose and on the record, when the university is a
// multi-campus system office (no IPEDS institution exists), when the name does
// not resolve, or when the tenure window falls outside the panel's year range.
//
// Pre-existing values are PRESERVED by default: this project's decision is that
// the covariates already on file stay as they are and the pass only fills what
// is empty. Pass --supersede-legacy to recompute every row from the panel
// instead (they do not reproduce under any single IPEDS definition, so that
// genuinely changes values -- see docs/data-provenance.md).
//
//   node scripts/src/compute-school-covariates.mjs --panel DIR [--index r1-bschool]
//     [--write] [--supersede-legacy]

import fs from 'node:fs';
import path from 'node:path';
import { readDataset, writeDataset } from './lib/dataset-io.mjs';

const args = process.argv.slice(2);
const getOpt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const panelDir = getOpt('--panel', null);
const indexFilter = getOpt('--index', null);
const write = args.includes('--write');
// Preserving what is already on file is the default, so that re-running this
// pass can never silently rewrite values a human decided to keep.
const keepLegacy = !args.includes('--supersede-legacy');
if (!panelDir) { console.error('--panel DIR is required'); process.exit(1); }

const DATA = 'artifacts/dean-dashboard/src/data';
const panel = JSON.parse(fs.readFileSync(path.join(panelDir, 'ipeds-panel.json'), 'utf8'));
const crosswalk = JSON.parse(fs.readFileSync(path.join(panelDir, 'ipeds-crosswalk.json'), 'utf8'));

const yearsFor = unitid => Object.keys(panel[unitid] || {}).map(Number).sort((a, b) => a - b);
const cell = (unitid, year) => (panel[unitid] || {})[year] || null;

const round4 = v => (v == null ? null : Math.round(v * 10000) / 10000);

const files = fs.readdirSync(DATA)
  .filter(f => /-deans\.json$/.test(f) || f === 'deans.json')
  .filter(f => !indexFilter || f.startsWith(indexFilter));

const totals = {
  rows: 0, resolved: 0, systemOffice: 0, unmatched: 0, outOfRange: 0,
  enrollmentEnd: 0, enrollmentAvg: 0, businessPctEnd: 0, businessDegreesLatest: 0,
  legacyChanged: 0, legacyMatched: 0,
};
const legacyDeltas = [];

for (const file of files) {
  const p = path.join(DATA, file);
  const { rows, indent } = readDataset(p);
  let touched = 0;

  for (const row of rows) {
    totals.rows++;
    // Rows the method cannot serve are cleared only when superseding; under the
    // default, anything already on file is left exactly as it is.
    const clear = () => {
      if (keepLegacy) return;
      for (const k of ['enrollmentEnd', 'enrollmentAvg', 'businessPctEnd', 'businessDegreesLatest']) {
        if (row[k] !== null && row[k] !== undefined) { row[k] = null; touched++; }
      }
    };
    const cw = crosswalk[row.university];
    if (!cw || !cw.unitid) {
      if (cw && cw.reason === 'system-office') totals.systemOffice++; else totals.unmatched++;
      clear();
      continue;
    }
    const unitid = cw.unitid;
    const ys = yearsFor(unitid);
    if (!ys.length) { totals.unmatched++; clear(); continue; }
    totals.resolved++;

    const latest = ys[ys.length - 1];
    const endRef = row.endYear != null ? row.endYear : latest;
    const start = row.startYear != null ? row.startYear : endRef;
    if (endRef < ys[0] && start < ys[0]) { totals.outOfRange++; clear(); continue; }

    const before = {
      enrollmentEnd: row.enrollmentEnd, enrollmentAvg: row.enrollmentAvg,
      businessPctEnd: row.businessPctEnd, businessDegreesLatest: row.businessDegreesLatest,
    };

    // Nearest available panel year at or before endRef, resolved per metric:
    // IPEDS publishes the surveys on different schedules (2024 completions are
    // out while 2024 enrolment is not), so a single reference year would drop
    // whichever series is currently behind.
    const refFor = key => ys.filter(y => y <= endRef && (cell(unitid, y) || {})[key] != null).pop() ?? null;

    const next = {
      enrollmentEnd: null, enrollmentAvg: null, businessPctEnd: null, businessDegreesLatest: null,
    };

    const enrolYear = refFor('enrol');
    if (enrolYear != null) next.enrollmentEnd = cell(unitid, enrolYear).enrol || null;

    const degYear = refFor('totDeg');
    if (degYear != null) {
      const c = cell(unitid, degYear);
      if (c.totDeg) next.businessPctEnd = round4((c.bizDeg || 0) / c.totDeg);
    }

    // Mean over the enrolment-bearing panel years inside the tenure window. A
    // sitting dean with no recorded start has a zero-length window (and the
    // newest panel year may have completions but not yet enrolment), so fall
    // back to the same reference year enrollmentEnd uses rather than nulling.
    const enrols = ys.filter(y => y >= start && y <= endRef)
      .map(y => (cell(unitid, y) || {}).enrol)
      .filter(v => v > 0);
    if (enrols.length) next.enrollmentAvg = Math.round(enrols.reduce((a, b) => a + b, 0) / enrols.length);
    else if (next.enrollmentEnd != null) next.enrollmentAvg = next.enrollmentEnd;

    const latestBiz = ys.slice().reverse().map(y => (cell(unitid, y) || {}).bizDeg).find(v => v != null);
    if (latestBiz != null) next.businessDegreesLatest = latestBiz;

    for (const k of Object.keys(next)) {
      if (before[k] != null && keepLegacy) continue;
      if (next[k] == null) {
        if (row[k] !== null && row[k] !== undefined) { row[k] = null; touched++; }
        continue;
      }
      if (before[k] != null) {
        if (before[k] === next[k]) totals.legacyMatched++;
        else {
          totals.legacyChanged++;
          if (legacyDeltas.length < 8) legacyDeltas.push(`${row.university} / ${row.dean}: ${k} ${before[k]} -> ${next[k]}`);
        }
      }
      row[k] = next[k];
      totals[k]++;
      touched++;
    }
  }
  console.log(`${file}: ${touched} covariate value(s)${write ? '' : ' (dry run)'}`);
  if (write && touched) writeDataset(p, rows, indent);
}

console.log('\n' + JSON.stringify(totals, null, 2));
if (legacyDeltas.length) {
  console.log('\nsample legacy -> recomputed changes:');
  legacyDeltas.forEach(d => console.log('  ' + d));
}
if (!write) console.log('\nDry run -- nothing written. Re-run with --write to apply.');
