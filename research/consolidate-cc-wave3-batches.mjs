#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

// Consolidate 18 wave-3 batch results into a single cc-wave3-results.json.
// Run this after all 18 agents have written their batch files, then
// node research/etl-cc.mjs to merge into the app data.

const batchDir = './research/universe';
const outputPath = path.join(batchDir, 'cc-wave3-results.json');
const BATCH_COUNT = 18;

const batchFiles = Array.from({ length: BATCH_COUNT }, (_, i) =>
  path.join(batchDir, `cc-wave3-batch-${i + 1}.json`)
);

console.log('Consolidating CC wave 3 batch results...\n');

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
        console.log(`✓ Batch ${i + 1}: ${data.seats.length} colleges, ${recordCount} records`);
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

console.log(`\nConsolidated: ${batchesFound}/${BATCH_COUNT} batches`);
console.log(`Total colleges: ${allSeats.length}`);
console.log(`Total records: ${totalRecords}`);

const consolidated = { seats: allSeats };
fs.writeFileSync(outputPath, JSON.stringify(consolidated, null, 2));
console.log(`\nWrote to ${outputPath}`);

if (batchesFound === BATCH_COUNT) {
  console.log('\n✓ All batches complete. Ready to run: node research/etl-cc.mjs');
}
