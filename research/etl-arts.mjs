import fs from 'fs';
import { normalizeTenureFields } from "../artifacts/dean-dashboard/scripts/lib/tenure.mjs";

// Additive merge: never remove or overwrite existing records.
// Only add newly-researched records whose person doesn't already appear
// for that university+school in the existing dataset.

const artsDeansPath = './artifacts/dean-dashboard/src/data/r1-arts-deans.json';
const existingDeans = JSON.parse(fs.readFileSync(artsDeansPath, 'utf-8'));

const researchPath = './research/universe/arts-pilot-results.json';
if (!fs.existsSync(researchPath)) {
  console.log('No research results found yet');
  process.exit(1);
}

const researchData = JSON.parse(fs.readFileSync(researchPath, 'utf-8'));
const researchedSeats = researchData.seats || [];
console.log(`Loaded ${researchedSeats.length} researched arts schools`);

// Reduce a name to first-token + last-token, stripping initials, suffixes,
// parentheticals like "(interim)", and punctuation. This catches
// "Jason L. Hicks" == "Jason Hicks" and "Joseph A. Aistrup" == "Joe Aistrup"-style
// nickname/initial variance without over-merging distinct people.
function nameKey(rawName) {
  const cleaned = rawName
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-zA-Z\s'-]/g, ' ')
    .trim();
  const tokens = cleaned.split(/\s+/).filter(t => t.length > 1 || /^[A-Z]$/.test(t));
  const nonInitial = tokens.filter(t => t.length > 1);
  if (nonInitial.length < 2) return cleaned.toLowerCase();
  const first = nonInitial[0].toLowerCase();
  const last = nonInitial[nonInitial.length - 1].toLowerCase();
  return `${first}|${last}`;
}

const NICKNAMES = {
  joe: 'joseph', joseph: 'joe',
  bob: 'robert', robert: 'bob',
  bill: 'william', william: 'bill',
  jim: 'james', james: 'jim',
  dave: 'david', david: 'dave',
  mike: 'michael', michael: 'mike',
  tom: 'thomas', thomas: 'tom',
  rick: 'richard', richard: 'rick', dick: 'richard',
  dan: 'daniel', daniel: 'dan',
  chris: 'christopher', christopher: 'chris',
  steve: 'steven', steven: 'chris',
};

function nameKeyVariants(rawName) {
  const key = nameKey(rawName);
  const [first, last] = key.split('|');
  if (!last) return [key];
  const variants = new Set([key]);
  if (NICKNAMES[first]) variants.add(`${NICKNAMES[first]}|${last}`);
  return [...variants];
}

// Build existing-name index per school (keyed by first|last, nickname-aware)
const existingNamesBySchool = {};
existingDeans.forEach(d => {
  const key = `${d.university}|${d.school}`;
  if (!existingNamesBySchool[key]) existingNamesBySchool[key] = new Set();
  nameKeyVariants(d.dean).forEach(v => existingNamesBySchool[key].add(v));
});

let id = Math.max(...existingDeans.map(d => d.id || 0)) + 1;
const newDeans = [];
let skippedExisting = 0;

researchedSeats.forEach(seat => {
  const key = `${seat.university}|${seat.school}`;
  const existingNames = existingNamesBySchool[key] || new Set();

  seat.records.forEach(record => {
    const variants = nameKeyVariants(record.name);
    const isDuplicate = variants.some(v => existingNames.has(v));
    if (isDuplicate) {
      skippedExisting++;
      return;
    }

    newDeans.push({
      id: id++,
      university: seat.university,
      school: seat.school,
      dean: record.name,
      startYear: record.startYear,
      endYear: record.endYear,
      startLabel: record.startYear ? String(record.startYear) : 'unknown',
      endLabel: record.endYear ? String(record.endYear) : 'present',
      priorTitle: record.priorTitle || '',
      priorInstitution: record.priorInstitution || '',
      origin: record.isInterim ? 'Interim' : 'External',
      originV2: record.isInterim ? 'Interim' : 'External',
      apptOrigin4: record.isInterim ? 'interim' : 'external',
      isInternal: false,
      isExternal: !record.isInterim,
      isInterim: record.isInterim || false,
      careerBackground: '',
      hasIndustryExp: false,
      gender: 'Unknown',
      isFemale: false,
      isFirstTimeDean: false,
      discipline: 'Arts/Humanities Dean',
      disciplineBroad: 'Arts and Humanities',
      phdField: '',
      hasPriorDeanExp: false,
      priorAssocOrAsstDean: false,
      hadAssocDeanRole: false,
      hadDeptChairRole: false,
      hasConsultingBg: false,
      hasPhd: false,
      rank: null,
      tier: 'College',
      inTop50: false,
      inTop100: false,
      fromEliteInstitution: false,
      priorInstitutionElite: false,
      // Never (endYear || NOW) - (startYear || NOW): a record with a known end and
      // no start used to come out NEGATIVE -- 20 such rows shipped. No start year
      // means no span, full stop.
      tenureLength: record.startYear != null && record.endYear != null ? record.endYear - record.startYear : null,
      era: '2020s',
      notes: record.notes || `Researched via ${record.sourceUrl}`,
      nextRole: null,
      nextRoleCode: null,
      involuntary: false,
      hadPriorConnection: false,
      hasInstitutionalLink: false,
      fromSameUniversityDiffSchool: false,
      surpriseDeparture: false,
      surpriseEvidence: '',
      sourceUrl: record.sourceUrl || '',
      enrollmentEnd: null,
      enrollmentAvg: null,
      businessPctEnd: null,
      businessDegreesLatest: null,
      convertedToPermanent: record.convertedToPermanent || false,
      connectionType: '',
      seatType: 'college'
    });

    // Prevent adding the same new name twice if it appears in multiple batches
    variants.forEach(v => existingNames.add(v));
  });
});

const merged = [...existingDeans, ...newDeans];

console.log(`\nMerge stats (additive only):`);
console.log(`  Existing records (untouched): ${existingDeans.length}`);
console.log(`  Researched records skipped (already known): ${skippedExisting}`);
console.log(`  New records added: ${newDeans.length}`);
console.log(`  Final total: ${merged.length}`);

for (const d of merged) normalizeTenureFields(d);
fs.writeFileSync(artsDeansPath, JSON.stringify(merged, null, 1));
console.log(`\nWrote ${merged.length} records to ${artsDeansPath}`);
