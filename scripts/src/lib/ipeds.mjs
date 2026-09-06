// IPEDS helpers: CSV reading, institution-name normalisation, and the
// name -> UNITID crosswalk.
//
// The crosswalk is the whole ballgame for the school covariates. IPEDS lists
// every branch campus as its own institution ("Pennsylvania State
// University-Penn State Erie-Behrend College" and twenty siblings), so a naive
// substring match silently attaches a flagship dean to a satellite campus with
// a twentieth of the enrolment. Matching therefore prefers, in order: an exact
// normalised name, a recorded alias, then a campus variant -- and among campus
// variants the main campus, falling back to the largest by enrolment.

import fs from 'node:fs';

// ------------------------------------------------------------------ CSV input
// IPEDS ships quoted fields containing commas, so this needs a real parser.
export function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const rows = [];
  let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length > 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i]; });
    return o;
  });
}

/**
 * Fast reader for the numeric survey files (EF*, C*). Those carry only coded and
 * numeric fields -- no quoted institution names -- so a plain split is safe, and
 * it matters: the completions files run to ~60MB each across 25 years, where the
 * quote-aware parser above is far too slow.
 *
 * Calls back per row with a field lookup rather than building an object, to
 * avoid allocating millions of short-lived objects.
 */
export function scanCsv(file, wanted, onRow) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\ufeff/, '');
  let nl = text.indexOf('\n');
  if (nl < 0) return;
  // Header case changed across IPEDS eras: the 2000-2003 files use lowercase
  // column names ("unitid", "cipcode") where later files shout them.
  const header = text.slice(0, nl).replace(/\r$/, '').split(',')
    .map(h => h.trim().replace(/"/g, '').toLowerCase());
  const col = {};
  for (const w of wanted) col[w] = header.indexOf(w.toLowerCase());
  const has = name => col[name] >= 0;
  const strip = v => (v === undefined ? '' : (v.charCodeAt(0) === 34 ? v.replace(/"/g, '') : v));
  let start = nl + 1;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.charCodeAt(end - 1) === 13 ? text.slice(start, end - 1) : text.slice(start, end);
    start = end + 1;
    if (!line) continue;
    const parts = line.split(',');
    const get = name => strip(parts[col[name]]);
    get.has = has;
    onRow(get);
  }
}

// ------------------------------------------------------------- normalisation
const STOP = /\b(the|at|of|and)\b/g;

export function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // Rio Piedras == Río Piedras
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'’()]/g, '')
    .replace(/[-–—/]/g, ' ')
    .replace(STOP, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The same institution written either way round.
function variants(name) {
  const n = normName(name);
  const out = new Set([n]);
  let m = n.match(/^university (.+)$/);           // "university of X" -> "X university"
  if (m) out.add(`${m[1]} university`);
  m = n.match(/^(.+) university$/);
  if (m) out.add(`university ${m[1]}`);
  out.add(n.replace(/\buniv\b/g, 'university'));
  const noParen = normName(String(name).replace(/\s*\([^)]*\)\s*/g, ' '));
  if (noParen) out.add(noParen);
  return [...out];
}

// Multi-campus system offices are not institutions: they have no UNITID and no
// enrolment of their own, so their covariates stay null by design rather than
// being silently attached to a flagship campus.
export const SYSTEM_LEVEL = /\b(system|systems)\b|state colleges and universities|state system of higher education|city university of new york$|universities of wisconsin|board of regents|community college district|colleges district/i;

// Short forms and local usages the IPEDS directory does not carry as aliases.
// Values are searched as ordinary names, so they stay readable and keep the
// campus-preference logic below rather than pinning a bare UNITID.
export const ALIASES = new Map(Object.entries({
  'mit': 'Massachusetts Institute of Technology',
  'ucla': 'University of California-Los Angeles',
  'penn state university': 'Pennsylvania State University-Main Campus',
  'college of william and mary': 'William & Mary',
  'cuny baruch college': 'CUNY Bernard M Baruch College',
  'baruch college cuny': 'CUNY Bernard M Baruch College',
  'hunter college cuny': 'CUNY Hunter College',
  'university albany suny': 'University at Albany',
  'university buffalo suny': 'University at Buffalo',
  'university buffalo state university new york': 'University at Buffalo',
  'binghamton university suny': 'Binghamton University',
  'rutgers state university new jersey': 'Rutgers University-New Brunswick',
  'washington university st louis': 'Washington University in St Louis',
  'umass chan medical school': 'University of Massachusetts Chan Medical School',
  'east texas a and m university': 'Texas A & M University-Commerce',
  'north carolina agricultural and technical state university': 'North Carolina A & T State University',
  'state university new york upstate medical university': 'SUNY Upstate Medical University',
  'state university new york geneseo': 'SUNY College at Geneseo',
  'state university new york college environmental science and forestry suny esf': 'SUNY College of Environmental Science and Forestry',
  'university puerto rico rio piedras': 'University of Puerto Rico-Rio Piedras',
  'universidad de puerto rico': 'University of Puerto Rico-Rio Piedras',
  'university colorado anschutz medical campus': 'University of Colorado Denver/Anschutz Medical Campus',
  'university st thomas houston': 'University of St Thomas',
  'university st thomas minnesota': 'University of St Thomas',
  'mount saint joseph university': 'Mount St Joseph University',
  'university mississippi medical center': 'University of Mississippi Medical Center',
  'university kansas medical center': 'University of Kansas Medical Center',
  'lsu health sciences center new orleans': 'Louisiana State University Health Sciences Center-New Orleans',
  'university texas health science center houston uthealth houston': 'The University of Texas Health Science Center at Houston',
  'university texas health science center san antonio ut health san antonio': 'The University of Texas Health Science Center at San Antonio',
  'massachusetts college pharmacy and health sciences': 'Massachusetts College of Pharmacy and Health Sciences',
  'uniformed services university health sciences': 'Uniformed Services University of the Health Sciences',
  'university arizona global campus': 'University of Arizona Global Campus',
  'westminster college missouri': 'Westminster College',
  'college of william & mary': 'William & Mary',
  'north carolina agricultural and technical state university': 'North Carolina A & T State University',
  'east texas a&m university': 'Texas A & M University-Commerce',
  'oregon health & science university-portland state university': 'Oregon Health & Science University',
  'the new school (parsons school of design)': 'The New School',
  'stony brook university (suny)': 'Stony Brook University',
  'lehman college (cuny)': 'CUNY Lehman College',
  'university of texas medical branch at galveston (utmb)': 'The University of Texas Medical Branch',
  'state university of new york college of environmental science and forestry (suny-esf)': 'SUNY College of Environmental Science and Forestry',
  'lake erie college of osteopathic medicine (lecom)': 'Lake Erie College of Osteopathic Medicine',
  'university of the sciences': 'University of the Sciences',
}));

// Keyed by normalised name so the readable table above cannot drift out of sync
// with the normaliser (which folds "&" to "and" and then drops it as a stopword).
const ALIAS_INDEX = new Map([...ALIASES].map(([k, v]) => [normName(k), v]));

const MAIN_CAMPUS = /main campus|campus immersion|ann arbor|twin cities|college park|chapel hill|columbus|urbana|madison|berkeley|austin|amherst|boulder|athens|knoxville|bloomington|west lafayette|tempe/i;
const NOT_A_SCHOOL = /system office|central office|board of|state system of higher education/i;

/**
 * Build a normalised-name -> institution index from an IPEDS HD (directory)
 * file, with per-UNITID enrolment for tie-breaking.
 */
export function buildIndex(hdRows, enrolByUnitid = new Map()) {
  const index = new Map(); // normalised name -> [institution, ...]
  const add = (key, inst) => {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(inst);
  };
  for (const r of hdRows) {
    const unitid = String(r.UNITID || '').trim();
    const name = r.INSTNM || '';
    if (!unitid || !name) continue;
    if (NOT_A_SCHOOL.test(name)) continue;
    const inst = {
      unitid, name, state: r.STABBR || '',
      enrol: enrolByUnitid.get(unitid) ?? 0,
      isMain: MAIN_CAMPUS.test(name),
    };
    for (const v of variants(name)) add(v, inst);
    // Strip a campus qualifier: "X University-Main Campus" also answers to "X University".
    const base = normName(name.replace(/\s*[-–]\s*[^-–]+$/, ''));
    if (base && base !== normName(name)) add(base, inst);
    for (const alias of String(r.IALIAS || '').split('|')) {
      const a = normName(alias);
      if (a.length > 4) add(a, inst);
    }
  }
  return index;
}

/** Pick the best institution among candidates for a corpus name. */
function pick(cands) {
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  const main = cands.filter(c => c.isMain);
  const pool = main.length ? main : cands;
  return pool.slice().sort((a, b) => b.enrol - a.enrol)[0];
}

/**
 * Resolve a corpus university name to an IPEDS institution.
 * Returns { unitid, name, state, how } or null.
 */
export function resolve(index, corpusName) {
  // A system office has no institution-level IPEDS record; say so explicitly so
  // the caller records a documented null instead of an unexplained gap.
  if (SYSTEM_LEVEL.test(String(corpusName || ''))) return { systemLevel: true, how: 'system' };
  const alias = ALIAS_INDEX.get(normName(corpusName));
  if (alias) {
    for (const v of variants(alias)) {
      const hit = pick(index.get(v) || []);
      if (hit) return { ...hit, how: 'alias' };
    }
  }
  for (const v of variants(corpusName)) {
    const hit = pick(index.get(v) || []);
    if (hit) return { ...hit, how: 'name' };
  }
  // Last resort: a unique institution whose name begins with the corpus name.
  const n = normName(corpusName);
  if (n.length >= 8) {
    const starts = [];
    for (const [key, list] of index) {
      if (key.startsWith(n + ' ')) starts.push(...list);
    }
    const uniq = new Map(starts.map(i => [i.unitid, i]));
    const hit = pick([...uniq.values()]);
    if (hit) return { ...hit, how: 'prefix' };
  }
  return null;
}
