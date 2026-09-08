#!/usr/bin/env node
// Revisit source/bio pages and harvest the fields the original passes never
// asked for: the year a feeder-bench member entered their role, and doctoral
// institution/year.
//
// Why these are empty in the first place: the bench was harvested as a roster
// snapshot (name + title off a leadership directory), so 11,893 of 11,930
// subdean rows carry no start date; phdInstitution was only ever filled
// opportunistically (16.3%) and phdYear was never a field at all.
//
// This writes CANDIDATES ONLY -- nothing touches the datasets here. Every hit
// carries the sentence it came from, so apply-source-page-enrichment.mjs (and a
// human) can audit before anything lands. Precision is the whole game: a wrong
// value is worse than the null already on the row.
//
//   node scripts/src/enrich-from-source-pages.mjs --out cands.json
//     [--index r1-bschool] [--limit N] [--offset N] [--concurrency 8]
//     [--cache DIR] [--no-follow]

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  htmlToText, extractStartYear, extractPhd, personSection, nameTokens, lastOf, firstOf,
} from './lib/bio-extract.mjs';

const args = process.argv.slice(2);
const getOpt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const outPath = getOpt('--out', null);
const indexFilter = getOpt('--index', null);
const limit = Number(getOpt('--limit', 'Infinity')) || Infinity;
const offset = Number(getOpt('--offset', '0')) || 0;
const concurrency = Number(getOpt('--concurrency', '8')) || 8;
const cacheDir = getOpt('--cache', null);
const followBios = !args.includes('--no-follow');

if (!outPath) { console.error('--out <candidates.json> is required'); process.exit(1); }
if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });

const DATA = 'artifacts/dean-dashboard/src/data';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// ------------------------------------------------------------------- fetching
const cachePathFor = url => (cacheDir
  ? path.join(cacheDir, crypto.createHash('sha1').update(url).digest('hex') + '.html')
  : null);

async function fetchPage(url) {
  const cp = cachePathFor(url);
  if (cp && fs.existsSync(cp)) return fs.readFileSync(cp, 'utf8');
  let body = '';
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
      redirect: 'follow', signal: ctl.signal,
    });
    clearTimeout(timer);
    const ct = res.headers.get('content-type') || '';
    if (res.ok && /html|text/i.test(ct)) body = (await res.text()).slice(0, 3_000_000);
  } catch { /* unreachable -- the row keeps its null */ }
  if (cp) fs.writeFileSync(cp, body);
  return body;
}

const hostLast = new Map();
async function politeFetch(url) {
  let host = '';
  try { host = new URL(url).host; } catch { return ''; }
  const wait = (hostLast.get(host) || 0) + 700 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  hostLast.set(host, Date.now());
  return fetchPage(url);
}

const looksPersonal = (url, name) => {
  const last = lastOf(nameTokens(name));
  return last.length >= 4 && decodeURIComponent(url).toLowerCase().includes(last);
};

// From a roster page, find the bio link belonging to this person.
function findBioLink(html, pageUrl, name) {
  const t = nameTokens(name);
  const last = lastOf(t), first = firstOf(t);
  if (last.length < 3) return null;
  const aRe = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi;
  let m; const found = [];
  while ((m = aRe.exec(html)) !== null) {
    const href = m[1];
    if (/\.(pdf|jpe?g|png|gif|docx?|xlsx?|zip|mp4)(\?|$)/i.test(href)) continue;
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    const label = htmlToText(m[2]).toLowerCase().trim();
    const hrefL = decodeURIComponent(href).toLowerCase();
    const labelHit = label.includes(last) && (label.includes(first) || last.length >= 5);
    const hrefHit = hrefL.includes(last) && (hrefL.includes(first) || last.length >= 5);
    if (!labelHit && !hrefHit) continue;
    try { found.push({ url: new URL(href, pageUrl).href, score: labelHit ? 0 : 1 }); } catch { /* bad href */ }
  }
  if (!found.length) return null;
  found.sort((a, b) => a.score - b.score);
  return found[0].url;
}

// ----------------------------------------------------------------------- load
const files = fs.readdirSync(DATA)
  .filter(f => /-deans\.json$/.test(f) || f === 'deans.json')
  .filter(f => !indexFilter || f.startsWith(indexFilter));
if (!files.length) { console.error(`no dataset files match --index ${indexFilter}`); process.exit(1); }

const rows = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
  const arr = Array.isArray(j) ? j : (j.deans || j.rows || j.data || []);
  arr.forEach((r, idx) => {
    const isBench = r.roleType === 'subdean';
    const needStart = isBench && r.startYear == null;
    const needPhd = (r.hasPhd !== false) && (!r.phdInstitution || r.phdYear == null);
    if (!needStart && !needPhd) return;
    if (!r.sourceUrl) return;
    rows.push({ file: f, idx, needStart, needPhd, ...r });
  });
}
const selected = rows.slice(offset, offset + limit);
console.log(`files: ${files.join(', ')}`);
console.log(`rows needing enrichment: ${rows.length}; selected: ${selected.length}`);

// ------------------------------------------------------------------ the crawl
const hits = [];
const stats = {
  processed: 0, fetched: 0, unreachable: 0, bioFollowed: 0,
  startYear: 0, phdInstitution: 0, phdYear: 0, rowsWithSomething: 0,
};

async function harvest(row) {
  const html = await politeFetch(row.sourceUrl);
  if (!html) { stats.unreachable++; return null; }
  stats.fetched++;

  const personal = looksPersonal(row.sourceUrl, row.dean);
  const text = htmlToText(html);
  // On a roster page, never read past this person's own block.
  const scope = personal ? text : (personSection(text, row.dean) || '');
  let usedUrl = row.sourceUrl;
  // On a shared roster or a news story, require the sentence to name this person.
  let start = row.needStart && scope ? extractStartYear(scope, { row, requireName: !personal, name: row.dean }) : null;
  let phd = row.needPhd && scope ? extractPhd(scope, {}) : null;

  // Roster page yielded nothing: try the person's own bio page.
  if ((!start && row.needStart) || (!phd && row.needPhd)) {
    if (!personal && followBios) {
      const bio = findBioLink(html, row.sourceUrl, row.dean);
      if (bio && bio !== row.sourceUrl) {
        const bhtml = await politeFetch(bio);
        if (bhtml) {
          stats.bioFollowed++;
          const btext = htmlToText(bhtml);
          // Only trust a page that actually names this person.
          if (btext.toLowerCase().includes(lastOf(nameTokens(row.dean)))) {
            if (!start && row.needStart) start = extractStartYear(btext, { row, name: row.dean });
            if (!phd && row.needPhd) phd = extractPhd(btext, {});
            if (start || phd) usedUrl = bio;
          }
        }
      }
    }
  }
  if (!start && !phd) return null;

  const hit = {
    file: row.file, idx: row.idx, dean: row.dean, university: row.university,
    school: row.school, title: row.discipline || row.roleTier || '',
    roleType: row.roleType || '', sourceUrl: row.sourceUrl, foundOn: usedUrl,
  };
  if (start) {
    hit.startYear = start.year;
    hit.startYearPattern = start.pattern;
    hit.startYearEvidence = start.evidence.replace(/\s+/g, ' ').slice(0, 300);
    stats.startYear++;
  }
  if (phd) {
    if (phd.institution && !row.phdInstitution) { hit.phdInstitution = phd.institution; stats.phdInstitution++; }
    if (phd.year != null) { hit.phdYear = phd.year; stats.phdYear++; }
    if (hit.phdInstitution || hit.phdYear != null) {
      hit.phdEvidence = phd.evidence.replace(/\s+/g, ' ').slice(0, 300);
    }
  }
  if (hit.startYear == null && hit.phdInstitution == null && hit.phdYear == null) return null;
  stats.rowsWithSomething++;
  return hit;
}

async function worker(queue) {
  while (queue.length) {
    const row = queue.pop();
    stats.processed++;
    try {
      const hit = await harvest(row);
      if (hit) hits.push(hit);
    } catch { /* one bad page must not kill the run */ }
    if (stats.processed % 100 === 0) {
      console.log(`  ${stats.processed}/${selected.length} | start=${stats.startYear} phdInst=${stats.phdInstitution} phdYr=${stats.phdYear} unreachable=${stats.unreachable}`);
      fs.writeFileSync(outPath, JSON.stringify({ stats, hits }, null, 2));
    }
  }
}

const queue = selected.slice().reverse();
await Promise.all(Array.from({ length: concurrency }, () => worker(queue)));
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), stats, hits }, null, 2));
console.log(`\nDone. ${JSON.stringify(stats)}`);
console.log(`Candidates: ${outPath}`);
