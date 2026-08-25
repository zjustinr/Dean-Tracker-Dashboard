#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node apply-source-url-by-name.mjs <deans-file> <results.json> [--dry-run]');
  process.exit(1);
}

const [deansPath, resultsPath] = args;
const isDryRun = args.includes('--dry-run');

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function makeCompositeKey(dean, university, roleTitle) {
  return `${dean}|${university}|${roleTitle}`.toLowerCase();
}

const deans = readJSON(deansPath);
const results = readJSON(resultsPath);

if (!results.verified || !Array.isArray(results.verified)) {
  console.error('Invalid results file - missing verified array');
  process.exit(1);
}

let applied = 0;
let skipped = 0;

// Build map of composite keys for quick lookup
const resultsByKey = {};
results.verified.forEach(record => {
  const key = makeCompositeKey(record.dean, record.university, record.discipline);
  resultsByKey[key] = record;
});

// Apply results to deans
deans.forEach(dean => {
  // Use discipline if available, otherwise use title
  const roleTitle = dean.discipline || dean.title;
  const key = makeCompositeKey(dean.dean, dean.university, roleTitle);
  const result = resultsByKey[key];

  if (result) {
    if (dean.sourceUrl) {
      skipped++;
    } else {
      dean.sourceUrl = result.sourceUrl;
      applied++;
    }
  }
});

console.log(`Applied: ${applied} sourceUrls`);
console.log(`Skipped: ${skipped} (already had sourceUrl)`);

if (!isDryRun) {
  writeJSON(deansPath, deans);
  console.log(`Updated: ${deansPath}`);
} else {
  console.log('(dry-run - no changes written)');
}
