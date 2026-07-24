/**
 * Register a new leadership index across the app. Idempotent.
 *
 *   node research/register_index.mjs --id usr2
 *   node research/register_index.mjs --id ussystem
 *
 * Fixes the guard bug from register_vet.mjs, which tested "does the file mention
 * the new id anywhere" and so skipped later edits once the first one landed.
 * Each edit now checks for its OWN replacement text.
 */
import { readFileSync, writeFileSync } from "fs";
const ROOT = "C:/Users/ren/BOSTON UNIVERSITY Dropbox/Justin Z. Ren/00 Spring 2026/Dean Research/App/Dean-Tracker-Dashboard/";
const rd = (p) => readFileSync(ROOT + p, "utf8");
const wr = (p, s) => writeFileSync(ROOT + p, s);
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };

const ID = arg("id", "usr2");

const SPECS = {
  usr2: {
    prefix: "r1-r2public",
    label: "R2 University Presidents & Chancellors",
    shortLabel: "R2 Universities",
    description: "Presidents and chancellors of Carnegie R2 public universities, the doctoral institutions ranked just below R1, traced from 1996 to today. Private R2 institutions are being added.",
    rankLabel: "Carnegie class",
    schoolType: "r2university",
    yearRange: "1996-2026",
    newsType: "r2university",
    unitPhrase: String.raw`\bR2\b|high\s+research\s+activity`,
    sellLabel: "R2 Universities",
  },
  ussystem: {
    prefix: "r1-system",
    label: "US Public University System Heads",
    shortLabel: "University Systems",
    description: "Presidents and chancellors of US public university system offices, the executives sitting above campus leadership, traced from 1996 to today",
    rankLabel: "Campuses",
    schoolType: "system",
    yearRange: "1996-2026",
    newsType: "system",
    unitPhrase: String.raw`university\s+system|state\s+system\s+of\s+higher\s+education|system\s+office`,
    sellLabel: "University Systems",
  },
};

const S = SPECS[ID];
if (!S) { console.error(`unknown id ${ID}; known: ${Object.keys(SPECS).join(", ")}`); process.exit(1); }

const log = [];
function edit(path, find, replace, label) {
  const s = rd(path);
  if (s.includes(replace)) { log.push(`skip (already) ${label}`); return; }
  if (!s.includes(find)) { log.push(`MISS ${label}: anchor not found`); return; }
  wr(path, s.replace(find, replace));
  log.push(`ok   ${label}`);
}

const DS = "artifacts/dean-dashboard/src/data/datasets.ts";

// 1. DatasetId union
{
  const s = rd(DS);
  const m = s.match(/export type DatasetId =[\s\S]*?;/);
  if (!m) log.push("MISS DatasetId union");
  else if (m[0].includes(`"${ID}"`)) log.push("skip (already) DatasetId");
  else { wr(DS, s.replace(m[0], m[0].replace(/;$/, ` | "${ID}";`))); log.push("ok   DatasetId"); }
}

// 2. schoolType union
{
  const s = rd(DS);
  const m = s.match(/ {2}schoolType: [^;]*;/);
  if (!m) log.push("MISS schoolType union");
  else if (m[0].includes(`"${S.schoolType}"`)) log.push("skip (already) schoolType");
  else { wr(DS, s.replace(m[0], m[0].replace(/;$/, ` | "${S.schoolType}";`))); log.push("ok   schoolType"); }
}

// 3. DATASETS_META entry, inserted before the closing brace of the object
{
  const s = rd(DS);
  if (new RegExp(`\\n {2}${ID}: \\{`).test(s)) log.push("skip (already) DATASETS_META");
  else {
    // Match the DATASETS_META object itself and insert before its closing brace.
    // Anchoring on "};\n\nexport const DATASET_LIST" is brittle: a comment block
    // sits between them.
    const m = s.match(/export const DATASETS_META[\s\S]*?\n\};/);
    if (!m) log.push("MISS DATASETS_META anchor");
    else {
      const entry = `\n\n  ${ID}: {\n    id: "${ID}",\n    label: "${S.label}",\n    shortLabel: "${S.shortLabel}",\n    description: "${S.description}",\n    rankLabel: "${S.rankLabel}",\n    schoolType: "${S.schoolType}",\n    yearRange: "${S.yearRange}",\n  },\n};`;
      wr(DS, s.replace(m[0], m[0].replace(/\n\};$/, entry)));
      log.push("ok   DATASETS_META");
    }
  }
}

// 4. DATASET_LIST
{
  const s = rd(DS);
  if (s.includes(`DATASETS_META.${ID},`)) log.push("skip (already) DATASET_LIST");
  else {
    const m = s.match(/(export const DATASET_LIST[\s\S]*?)\n\];/);
    if (!m) log.push("MISS DATASET_LIST");
    else { wr(DS, s.replace(m[0], `${m[1]}\n  DATASETS_META.${ID},\n];`)); log.push("ok   DATASET_LIST"); }
  }
}

// 5. api/data.js SPEC (self-contained CommonJS; the deployed one)
edit("api/data.js",
  `  uspublichealth: {`,
  `  ${ID}: { deans: () => require("../artifacts/dean-dashboard/src/data/${S.prefix}-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/${S.prefix}-schools.json"), split: false },\n  uspublichealth: {`,
  "api/data.js SPEC");

// 6. lib/dataset-assembly.mjs SPEC + VISIBLE (dev server + corpus tally)
edit("lib/dataset-assembly.mjs",
  `  uspublichealth: [`,
  `  ${ID}: ["${S.prefix}-deans.json", null, "${S.prefix}-schools.json", false],\n  uspublichealth: [`,
  "dataset-assembly SPEC");
{
  const p = "lib/dataset-assembly.mjs";
  const s = rd(p);
  if (s.includes(`"${ID}"]`) || s.includes(`"${ID}",`)) log.push("skip (already) VISIBLE");
  else {
    const m = s.match(/export const VISIBLE = \[[^\]]*\];/);
    if (!m) log.push("MISS VISIBLE");
    else { wr(p, s.replace(m[0], m[0].replace(/\];$/, `, "${ID}"];`))); log.push("ok   VISIBLE"); }
  }
}

// 7. news pipeline
edit("artifacts/dean-dashboard/scripts/news-lib.mjs",
  `  publichealth: {`,
  `  ${S.newsType}: { id: "${ID}", deans: "${S.prefix}-deans.json" },\n  publichealth: {`,
  "news-lib TYPE_TO_DATASET");
edit("artifacts/dean-dashboard/scripts/news-scout.mjs",
  `  ["publichealth", "r1-publichealth-schools.json"],`,
  `  ["${S.newsType}", "${S.prefix}-schools.json"],\n  ["publichealth", "r1-publichealth-schools.json"],`,
  "news-scout DATASETS");
edit("artifacts/dean-dashboard/scripts/news-scout.mjs",
  `  ["publichealth", /school\\s+of\\s+public\\s+health`,
  `  ["${S.newsType}", /${S.unitPhrase}/i],\n  ["publichealth", /school\\s+of\\s+public\\s+health`,
  "news-scout UNIT_PHRASES");

// 8. sellable indices
edit("scripts/mint-trial.mjs",
  `  ["uspublichealth", "Public Health"],`,
  `  ["uspublichealth", "Public Health"],\n  ["${ID}", "${S.sellLabel}"],`,
  "mint-trial INDICES");

console.log(`registering ${ID} (${S.prefix})\n`);
console.log(log.join("\n"));
const missed = log.filter((l) => l.startsWith("MISS"));
if (missed.length) { console.log(`\n${missed.length} ANCHOR(S) MISSED, fix before shipping`); process.exit(1); }
