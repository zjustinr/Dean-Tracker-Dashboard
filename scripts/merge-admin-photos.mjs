#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const DATA = 'artifacts/dean-dashboard/src/data';
const PUB = 'artifacts/dean-dashboard/public/deans';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

const resultFiles = process.argv.slice(2);
if (resultFiles.length === 0) {
  console.error('Usage: node merge-admin-photos.mjs <results1.json> [results2.json ...]');
  process.exit(1);
}

const photos = JSON.parse(fs.readFileSync(path.join(DATA, 'dean-photos.json'), 'utf8'));

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function extOf(url) {
  const m = url.match(/\.(jpe?g|png|webp)(\?|$)/i);
  if (!m) return 'jpg';
  const e = m[1].toLowerCase();
  return e === 'jpeg' ? 'jpg' : e;
}

let seen = new Set();
let added = 0, skippedExisting = 0, dupes = 0, dlFailed = 0;

for (const rf of resultFiles) {
  if (!fs.existsSync(rf)) { console.log(`(missing: ${rf})`); continue; }
  const { results } = JSON.parse(fs.readFileSync(rf, 'utf8'));
  for (const r of results || []) {
    if (!r.dean || !r.university || !r.photoUrl) continue;
    const key = `${r.dean}|${r.university}`.toLowerCase();
    if (seen.has(key)) { dupes++; continue; }
    seen.add(key);
    if (photos[key]) { skippedExisting++; continue; }

    const slug = slugify(`${r.dean}-${r.university}`);
    const ext = extOf(r.photoUrl);
    const outFile = path.join(PUB, `${slug}.${ext}`);

    try {
      execSync(`curl -sL --max-time 10 -A "${UA}" -o ${JSON.stringify(outFile)} ${JSON.stringify(r.photoUrl)}`, { timeout: 15000 });
      const stat = fs.statSync(outFile);
      // reject tiny files (broken images, tracking pixels) and HTML error pages
      const head = fs.readFileSync(outFile).subarray(0, 12);
      const isImage = head[0] === 0xff && head[1] === 0xd8 // jpg
        || head[0] === 0x89 && head[1] === 0x50            // png
        || head.subarray(0, 4).toString() === 'RIFF';       // webp
      if (stat.size < 3000 || !isImage) {
        fs.unlinkSync(outFile);
        dlFailed++;
        continue;
      }
      photos[key] = { photo: `/deans/${slug}.${ext}`, page: r.sourceUrl, source: r.photoUrl };
      added++;
    } catch {
      try { fs.unlinkSync(outFile); } catch {}
      dlFailed++;
    }

    if (added % 100 === 0 && added > 0) {
      fs.writeFileSync(path.join(DATA, 'dean-photos.json'), JSON.stringify(photos, null, 2) + '\n');
      console.log(`  progress: ${added} added, ${dlFailed} failed, ${skippedExisting} already registered`);
    }
  }
}

fs.writeFileSync(path.join(DATA, 'dean-photos.json'), JSON.stringify(photos, null, 2) + '\n');
console.log(`\nMerge complete:`);
console.log(`  Added to registry (downloaded): ${added}`);
console.log(`  Already in registry: ${skippedExisting}`);
console.log(`  Duplicate results: ${dupes}`);
console.log(`  Download/validation failures: ${dlFailed}`);
console.log(`  Registry total: ${Object.keys(photos).length}`);
