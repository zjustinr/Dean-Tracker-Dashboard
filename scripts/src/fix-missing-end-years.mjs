#!/usr/bin/env node
/**
 * Infer missing dean endYear from the successor's startYear at the same school.
 * Boise State's Lynn Russell (start 1997, no end) was rendering as a 29-year
 * tenure on the timeline because her end year was blank in the source xlsx,
 * but Amy J. Moll succeeded her in 2011.
 */
import fs from 'fs';
import path from 'path';
import { MAX_PLAUSIBLE_TENURE_YEARS, normalizeTenureFields } from '../../artifacts/dean-dashboard/scripts/lib/tenure.mjs';

const DATA_DIR = path.resolve('artifacts/dean-dashboard/src/data');
const FILES = ['deans.json', 'r1-bschool-deans.json', 'r1-eschool-deans.json'];

for (const file of FILES) {
  const fp = path.join(DATA_DIR, file);
  const deans = JSON.parse(fs.readFileSync(fp, 'utf8'));
  const bySchool = new Map();
  for (const d of deans) {
    const k = `${d.university}|||${d.school}`;
    if (!bySchool.has(k)) bySchool.set(k, []);
    bySchool.get(k).push(d);
  }
  let fixed = 0;
  for (const list of bySchool.values()) {
    list.sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i], next = list[i + 1];
      const hasNoEnd = cur.endYear == null || cur.endYear === '';
      // An inferred end is only worth asserting if it produces a spell someone
      // could have served. A successor's start decades later means the succession
      // between them is undocumented, not that one person held the seat for it.
      const wouldSpan = cur.startYear && next.startYear ? next.startYear - cur.startYear : 0;
      if (hasNoEnd && next.startYear && wouldSpan <= MAX_PLAUSIBLE_TENURE_YEARS) {
        cur.endYear = next.startYear;
        if (!cur.endLabel) cur.endLabel = String(next.startYear);
        if (cur.startYear) cur.tenureLength = next.startYear - cur.startYear;
        fixed++;
      }
    }
  }
  for (const d of deans) normalizeTenureFields(d);
  fs.writeFileSync(fp, JSON.stringify(deans, null, 2));
  console.log(`${file}: inferred endYear for ${fixed} deans`);
}
