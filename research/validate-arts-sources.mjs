#!/usr/bin/env node
import fs from 'fs';

// Validate that all arts deans records have sourceUrl values
// Run after ETL to ensure data quality before commit

const artsDeansPath = './artifacts/dean-dashboard/src/data/r1-arts-deans.json';
const data = JSON.parse(fs.readFileSync(artsDeansPath, 'utf-8'));

let missingSource = [];
let recordCount = 0;

data.forEach((dean, idx) => {
  if (dean.sourceUrl === undefined || dean.sourceUrl === null || dean.sourceUrl === '') {
    missingSource.push({
      id: dean.id,
      name: dean.dean,
      school: dean.school,
      years: `${dean.startYear}-${dean.endYear}`
    });
  }
  recordCount++;
});

console.log(`Arts deans validation:`);
console.log(`  Total records: ${recordCount}`);
console.log(`  Missing sourceUrl: ${missingSource.length}`);

if (missingSource.length > 0) {
  console.log(`\n❌ Records need source URLs:`);
  missingSource.slice(0, 20).forEach(r => {
    console.log(`  ID ${r.id}: ${r.name} at ${r.school} (${r.years})`);
  });
  if (missingSource.length > 20) {
    console.log(`  ... and ${missingSource.length - 20} more`);
  }
  process.exit(1);
} else {
  console.log(`\n✓ All records have source URLs`);
}
