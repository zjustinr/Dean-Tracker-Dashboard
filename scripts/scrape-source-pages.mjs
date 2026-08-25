#!/usr/bin/env node

import fs from 'fs';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node scrape-source-pages.mjs <deans-file> --out <results.json> [--limit N] [--offset N]');
  process.exit(1);
}

const deansPath = args[0];
const getOpt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const outPath = getOpt('--out', null);
const limit = parseInt(getOpt('--limit', 'Infinity')) || Infinity;
const offset = parseInt(getOpt('--offset', '0')) || 0;
const registryPath = getOpt('--registry', null);

if (!outPath) {
  console.error('--out <results.json> is required');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const PLACEHOLDER_RE = /placeholder|logo|banner|icon|sprite|badge|seal|crest|default[-_]|avatar[-_]?default|blank|spacer|1x1|pixel/i;

function nameTokens(dean) {
  const cleaned = dean
    .replace(/,?\s+(Jr\.?|Sr\.?|II|III|IV|V|Ph\.?D\.?|M\.?D\.?|Ed\.?D\.?|J\.?D\.?)\s*$/i, '')
    .replace(/["'()]/g, '');
  const parts = cleaned.split(/[\s.]+/).filter(p => p.length > 1 && !/^[A-Z]\.?$/.test(p));
  return parts.map(p => p.toLowerCase().replace(/[^a-z-]/g, '')).filter(Boolean);
}

function matchesName(str, tokens) {
  if (!str) return false;
  const s = decodeURIComponent(str).toLowerCase();
  const last = tokens[tokens.length - 1];
  const first = tokens[0];
  if (!last) return false;
  if (last.length >= 4 && s.includes(last)) return true;
  // short last names need the first name too
  if (s.includes(last) && first && s.includes(first)) return true;
  return false;
}

function resolveUrl(src, pageUrl) {
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return null;
  }
}

const deans = JSON.parse(fs.readFileSync(deansPath, 'utf8'));

let registered = new Set();
if (registryPath) {
  const reg = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registered = new Set(Object.keys(reg).map(k => k.toLowerCase()));
}

const records = deans
  .map((d, idx) => ({ d, idx }))
  .filter(({ d }) => d.sourceUrl && (!d.photoUrl || d.photoUrl === ''))
  .filter(({ d }) => !registered.has(`${d.dean}|${d.university}`.toLowerCase()))
  .slice(offset, offset + limit);

console.log(`Processing ${records.length} records (offset ${offset})...`);

const results = [];
let processed = 0;
let matched = 0;

for (const { d, idx } of records) {
  processed++;
  try {
    let html = '';
    try {
      html = execSync(
        `curl -sL --max-time 8 -A "${UA}" ${JSON.stringify(d.sourceUrl)}`,
        { encoding: 'utf8', timeout: 12000, maxBuffer: 8 * 1024 * 1024 }
      );
    } catch {
      // fetch failed; skip
    }

    if (html) {
      const tokens = nameTokens(d.dean);
      const imgRe = /<img[^>]+>/gi;
      let m;
      let found = null;
      while ((m = imgRe.exec(html)) !== null) {
        const tag = m[0];
        const src = tag.match(/src=["']([^"']+)["']/i)?.[1];
        const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] || '';
        if (!src || !/\.(jpe?g|png|webp)(\?|$)/i.test(src)) continue;
        if (PLACEHOLDER_RE.test(src)) continue;
        if (matchesName(src, tokens) || matchesName(alt, tokens)) {
          found = resolveUrl(src, d.sourceUrl);
          if (found) break;
        }
      }
      if (found) {
        matched++;
        results.push({
          dean: d.dean,
          university: d.university,
          idx,
          sourceUrl: d.sourceUrl,
          photoUrl: found,
        });
      }
    }
  } catch {
    // continue
  }

  if (processed % 25 === 0) {
    console.log(`  ${processed}/${records.length} processed, ${matched} name-matched`);
    fs.writeFileSync(outPath, JSON.stringify({ results }, null, 2));
  }
}

fs.writeFileSync(outPath, JSON.stringify({ results }, null, 2));
console.log(`\nDone: ${processed} processed, ${matched} name-matched photos`);
console.log(`Results: ${outPath}`);
