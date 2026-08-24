#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Consolidate 10 batch results into a single arts-pilot-results.json
// Run this after all 10 agents have returned their results

const batchDir = './research/universe';
const outputPath = path.join(batchDir, 'arts-pilot-results.json');

// Expected batch files: arts-batch-1.json through arts-batch-10.json
const batchFiles = Array.from({ length: 10 }, (_, i) =>
  path.join(batchDir, `arts-batch-${i + 1}.json`)
);

console.log('Consolidating arts deans batch results...\n');

const allSeats = [];
let totalRecords = 0;
let batchesFound = 0;

batchFiles.forEach((file, i) => {
  if (fs.existsSync(file)) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (data.seats) {
        allSeats.push(...data.seats);
        const recordCount = data.seats.reduce((sum, s) => sum + (s.records?.length || 0), 0);
        totalRecords += recordCount;
        batchesFound++;
        console.log(`✓ Batch ${i + 1}: ${data.seats.length} schools, ${recordCount} records`);
      }
    } catch (e) {
      console.error(`✗ Batch ${i + 1}: Failed to parse - ${e.message}`);
    }
  } else {
    console.log(`⏳ Batch ${i + 1}: Not ready yet`);
  }
});

if (batchesFound === 0) {
  console.log('\nNo batch files found. Waiting for agents to complete.');
  process.exit(1);
}

console.log(`\nConsolidated: ${batchesFound}/10 batches`);
console.log(`Total schools: ${allSeats.length}`);
console.log(`Total records: ${totalRecords}`);

// Write consolidated result
const consolidated = { seats: allSeats };
fs.writeFileSync(outputPath, JSON.stringify(consolidated, null, 2));
console.log(`\nWrote to ${outputPath}`);

// If all batches are ready, run ETL
if (batchesFound === 10) {
  console.log('\n✓ All batches complete. Ready to run: node research/etl-arts.mjs');
}
