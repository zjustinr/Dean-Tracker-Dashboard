#!/usr/bin/env node
// Build a compact IPEDS panel (enrolment + completions by UNITID by year) for
// the institutions the corpus actually references, plus the name->UNITID
// crosswalk and a vintage record.
//
// The school covariates were previously present on ~2% of rows with no recorded
// provenance, and they do not reproduce under any single IPEDS definition, so
// they cannot be extended or audited. This rebuilds them from published IPEDS
// survey files and writes down exactly which files were used.
//
// Downloads are processed one year at a time and the extracted CSVs are deleted
// straight after aggregation -- the raw files run to ~2GB, the panel to a few MB.
//
//   node scripts/src/fetch-ipeds-panel.mjs --work DIR --out DIR [--from 2000] [--to 2024]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readCsv, scanCsv, buildIndex, resolve } from './lib/ipeds.mjs';

const args = process.argv.slice(2);
const getOpt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const work = getOpt('--work', null);
const outDir = getOpt('--out', null);
const fromYear = Number(getOpt('--from', '2000'));
const toYear = Number(getOpt('--to', '2024'));
if (!work || !outDir) { console.error('--work DIR and --out DIR are required'); process.exit(1); }
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const DATA = 'artifacts/dean-dashboard/src/data';
const BASE = 'https://nces.ed.gov/ipeds/datacenter/data';

function sh(cmd, cmdArgs) {
  return execFileSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// Fetch a survey zip and return the path of the extracted primary CSV, or null.
// IPEDS ships a revised "_rv" copy alongside the original; the revised file is
// the better source where it exists.
function grab(stem) {
  const zip = path.join(work, `${stem}.zip`);
  if (!fs.existsSync(zip)) {
    try {
      sh('curl', ['-sS', '--max-time', '300', '-f', '-o', zip, `${BASE}/${stem}.zip`]);
    } catch { return null; }
  }
  let names = [];
  try {
    names = sh('unzip', ['-Z1', zip]).split('\n').map(s => s.trim()).filter(s => s.endsWith('.csv'));
  } catch { return null; }
  if (!names.length) return null;
  const revised = names.find(n => /_rv\.csv$/i.test(n));
  const pick = revised || names[0];
  try { sh('unzip', ['-o', '-q', zip, pick, '-d', work]); } catch { return null; }
  return path.join(work, pick);
}

const num = v => {
  const n = Number(String(v ?? '').replace(/"/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------- crosswalk (2023 base)
console.log('building crosswalk from HD2023 / EF2023A ...');
const hdCsv = grab('HD2023');
const efCsv = grab('EF2023A');
if (!hdCsv || !efCsv) { console.error('could not fetch HD2023 / EF2023A'); process.exit(1); }
const hd = readCsv(hdCsv);
const enrol2023 = new Map();
scanCsv(efCsv, ['UNITID', 'EFALEVEL', 'EFTOTLT'], get => {
  if (get('EFALEVEL').trim() === '1') enrol2023.set(get('UNITID').trim(), num(get('EFTOTLT')));
});
const index = buildIndex(hd, enrol2023);

const universities = new Map(); // corpus name -> row count
for (const f of fs.readdirSync(DATA).filter(f => /-deans\.json$/.test(f) || f === 'deans.json')) {
  const j = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  const arr = Array.isArray(j) ? j : (j.deans || []);
  for (const r of arr) if (r.university) universities.set(r.university, (universities.get(r.university) || 0) + 1);
}

const crosswalk = {};
const needed = new Set();
let matched = 0, systemLevel = 0, unmatched = 0;
for (const [name, rowCount] of universities) {
  const hit = resolve(index, name);
  if (!hit) { crosswalk[name] = { unitid: null, reason: 'unmatched', rowCount }; unmatched++; continue; }
  if (hit.systemLevel) { crosswalk[name] = { unitid: null, reason: 'system-office', rowCount }; systemLevel++; continue; }
  crosswalk[name] = { unitid: hit.unitid, ipedsName: hit.name, state: hit.state, matchedBy: hit.how, rowCount };
  needed.add(hit.unitid);
  matched++;
}
console.log(`  universities ${universities.size}: matched ${matched}, system-office ${systemLevel}, unmatched ${unmatched}`);
console.log(`  distinct UNITIDs needed: ${needed.size}`);

// ------------------------------------------------------------------ the panel
// panel[unitid][year] = { enrol, bizDeg, totDeg }
const panel = {};
const sources = [];
const setCell = (unitid, year, key, value) => {
  if (!panel[unitid]) panel[unitid] = {};
  if (!panel[unitid][year]) panel[unitid][year] = {};
  panel[unitid][year][key] = value;
};

for (let year = fromYear; year <= toYear; year++) {
  // ---- enrolment: EF<year>A, "all students total" line
  const ef = grab(`EF${year}A`);
  if (ef) {
    // Two eras of schema. Modern files carry EFALEVEL/EFTOTLT; the 2000-2003
    // files instead key the grand total on line 29 / section 3 and split it
    // across efrace15 (men) and efrace16 (women).
    let n = 0;
    scanCsv(ef, ['UNITID', 'EFALEVEL', 'EFTOTLT', 'LINE', 'SECTION', 'EFRACE15', 'EFRACE16'], get => {
      const u = get('UNITID').trim();
      if (!needed.has(u)) return;
      let total = null;
      if (get.has('EFTOTLT')) {
        if (get('EFALEVEL').trim() !== '1') return;
        total = num(get('EFTOTLT'));
      } else if (get.has('EFRACE15')) {
        if (get('LINE').trim() !== '29' || get('SECTION').trim() !== '3') return;
        total = num(get('EFRACE15')) + num(get('EFRACE16'));
      } else return;
      setCell(u, year, 'enrol', total);
      n++;
    });
    sources.push({ year, survey: `EF${year}A`, file: path.basename(ef), institutions: n });
    fs.rmSync(ef, { force: true });
    console.log(`  ${year} enrolment: ${n} institutions`);
  } else console.log(`  ${year} enrolment: unavailable`);

  // ---- completions: C<year>_A
  // Three schema eras ship under this name, so nothing here may assume one
  // layout. The value column is CTOTALT in later years and CRACE15+CRACE16
  // (men + women) before that; the CIPCODE 99 grand-total row is present in
  // some years and absent from others. Summing the 6-digit CIP rows at
  // MAJORNUM=1 is the one method that works across all of them -- it reproduces
  // the CIPCODE 99 total exactly wherever that row exists (checked for 2005,
  // 2006 and 2019) and still yields a figure in the years where it does not.
  //
  // MAJORNUM=1 is what keeps each award counted once. The 2000-2003 files have
  // no such column and come out at roughly twice the 2005 level for the same
  // institution, so they are skipped rather than silently inflating the series.
  const c = grab(`C${year}_A`);
  if (c) {
    const biz = new Map(), tot = new Map();
    const sixDigit = /^\d\d\.\d{4}$/;
    let usable = false;
    scanCsv(c, ['UNITID', 'MAJORNUM', 'CIPCODE', 'CTOTALT', 'CRACE15', 'CRACE16', 'CRACE24'], get => {
      // MAJORNUM is what keeps each award counted once (2 = second majors).
      if (!get.has('MAJORNUM')) return;
      // Of the two crace layouts, only the 24-column one (2002+) puts the row
      // total in CRACE15/CRACE16. The 16-column files (2000-2001) use those
      // columns differently and come out at about twice the neighbouring year
      // for the same institution (Alabama 2001: 8,228 against 4,183 in 2002),
      // so they are skipped rather than silently inflating the series.
      if (!get.has('CTOTALT') && !get.has('CRACE24')) return;
      usable = true;
      const u = get('UNITID').trim();
      if (!needed.has(u)) return;
      if (get('MAJORNUM').trim() !== '1') return;
      const cip = get('CIPCODE').trim();
      if (!sixDigit.test(cip)) return;           // skip 2- and 4-digit rollups
      const v = get.has('CTOTALT')
        ? num(get('CTOTALT'))
        : num(get('CRACE15')) + num(get('CRACE16'));
      tot.set(u, (tot.get(u) || 0) + v);
      if (cip.startsWith('52.')) biz.set(u, (biz.get(u) || 0) + v);
    });
    for (const [u, v] of tot) setCell(u, year, 'totDeg', v);
    for (const [u, v] of biz) setCell(u, year, 'bizDeg', v);
    sources.push({
      year, survey: `C${year}_A`, file: path.basename(c), institutions: tot.size,
      ...(usable ? {} : { skipped: 'pre-2002 schema: no MAJORNUM, or 16-column crace layout' }),
    });
    fs.rmSync(c, { force: true });
    console.log(`  ${year} completions: ${tot.size} institutions${usable ? '' : ' (skipped: pre-2002 schema)'}`);
  } else console.log(`  ${year} completions: unavailable`);
}

const years = sources.map(s => s.year);
const meta = {
  generatedAt: new Date().toISOString(),
  source: 'IPEDS Data Center complete data files (nces.ed.gov/ipeds/datacenter)',
  crosswalkBase: 'HD2023 (institutional directory), EF2023A (enrolment, for campus tie-breaks)',
  surveys: {
    enrolment: 'EF<year>A, EFALEVEL=1 ("all students total"), field EFTOTLT',
    completions: 'C<year>_A, MAJORNUM=1; CIPCODE 99 = all programs, CIPCODE 52.* = business',
  },
  yearsCovered: years.length ? `${Math.min(...years)}-${Math.max(...years)}` : 'none',
  files: sources,
};

fs.writeFileSync(path.join(outDir, 'ipeds-panel.json'), JSON.stringify(panel));
fs.writeFileSync(path.join(outDir, 'ipeds-crosswalk.json'), JSON.stringify(crosswalk, null, 1));
fs.writeFileSync(path.join(outDir, 'ipeds-vintage.json'), JSON.stringify(meta, null, 2));
console.log(`\npanel institutions: ${Object.keys(panel).length}`);
console.log(`wrote ipeds-panel.json, ipeds-crosswalk.json, ipeds-vintage.json to ${outDir}`);
