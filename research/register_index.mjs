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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ROOT used to be an absolute Windows path, which meant this script -- the one
// place that knows the full registration checklist -- could not run anywhere but
// one laptop. uscommunitycollege was then registered by hand from a grep for
// `uslac`, which found 4 of the 8 anchors and missed DATASET_LIST, so the index
// shipped, deployed green, and was invisible in the switcher. Derive it instead.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..") + "/";
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
    // Hidden from the switcher on purpose: 37 system offices is too small a
    // corpus to carry its own slot. Still fully wired into every other pass.
    switcher: false,
  },
  uscommunitycollege: {
    prefix: "r1-communitycollege",
    label: "Community College Presidents",
    shortLabel: "Community College",
    description: "Presidents of the largest US community colleges and the chancellors of the multi-college districts above them, covering both the campus seat and the district seat that headhunters recruit for separately.",
    rankLabel: "Enrollment rank",
    schoolType: "communitycollege",
    yearRange: "1970-2026",
    newsType: "communitycollege",
    unitPhrase: String.raw`community\s+college|junior\s+college|technical\s+college`,
    sellLabel: "Community Colleges",
    // PILOT: holds 20 of 224 seats, so it is deliberately left out of VISIBLE
    // (corpus tally + news-scout coverage) until the collection wave lands.
    visible: false,
    // The news classifier has no community-college role words yet; adding the
    // id to the news pipeline before that would make the daily cron throw.
    news: false,
  },

  uslac: {
    prefix: "r1-lac",
    label: "Liberal Arts College Presidents",
    shortLabel: "LAC Presidents",
    description: "Presidents of small, primarily-undergraduate liberal arts colleges, traced from 1996 to today, spanning US News-ranked national liberal arts colleges and public liberal arts colleges nationwide.",
    rankLabel: "US News rank",
    schoolType: "liberalarts",
    yearRange: "1996-2026",
    newsType: "liberalarts",
    unitPhrase: String.raw`liberal\s+arts\s+college`,
    sellLabel: "Liberal Arts Colleges",
  },
};

const S = SPECS[ID];
if (!S) { console.error(`unknown id ${ID}; known: ${Object.keys(SPECS).join(", ")}`); process.exit(1); }

const log = [];

/**
 * @param {string} path
 * @param {string} find    anchor to insert before
 * @param {string} replace anchor with the new entry prepended
 * @param {string} label
 * @param {string} [already] text proving the entry EXISTS AT ALL, anywhere in
 *   the file. Defaults to `replace`, which only proves it exists *adjacent to
 *   the anchor* -- so an entry added by hand somewhere else in the same object
 *   does not count as present and gets inserted a second time. That is not
 *   theoretical: re-running this script over a hand-registered index produced a
 *   duplicate key in both api/data.js and lib/dataset-assembly.mjs. A duplicate
 *   key is silently legal in JS (last wins), so nothing would have failed until
 *   the two copies drifted apart. Pass a key-shaped marker for object edits.
 */
function edit(path, find, replace, label, already) {
  const s = rd(path);
  if (s.includes(already ?? replace)) { log.push(`skip (already) ${label}`); return; }
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

// 4. DATASET_LIST -- the switcher. This is the one that decides whether the index
// is VISIBLE TO A USER AT ALL; every other anchor here is plumbing behind it.
// Some ids are deliberately kept out (top100 is a subset of r1bschool; ussystem
// is too small a corpus to earn a slot) -- opt out with `switcher: false` rather
// than relying on the run to be inspected, since this step reporting "ok" against
// a hidden index silently publishes it.
{
  const s = rd(DS);
  if (S.switcher === false) log.push("skip (switcher:false) DATASET_LIST");
  else if (s.includes(`DATASETS_META.${ID},`)) log.push("skip (already) DATASET_LIST");
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
  "api/data.js SPEC",
  `\n  ${ID}: { deans:`);

// 6. lib/dataset-assembly.mjs SPEC + VISIBLE (dev server + corpus tally)
edit("lib/dataset-assembly.mjs",
  `  uspublichealth: [`,
  `  ${ID}: ["${S.prefix}-deans.json", null, "${S.prefix}-schools.json", false],\n  uspublichealth: [`,
  "dataset-assembly SPEC",
  `\n  ${ID}: [`);
{
  const p = "lib/dataset-assembly.mjs";
  const s = rd(p);
  // VISIBLE is NOT the switcher list -- DATASET_LIST is. VISIBLE gates the
  // corpus tally and news-scout's coverage assertion, so an index whose data is
  // still partial belongs in the switcher and out of VISIBLE. Opt out with
  // `visible: false` rather than by hand-editing afterwards.
  if (S.visible === false) log.push("skip (visible:false) VISIBLE");
  else if (s.includes(`"${ID}"]`) || s.includes(`"${ID}",`)) log.push("skip (already) VISIBLE");
  else {
    const m = s.match(/export const VISIBLE = \[[^\]]*\];/);
    if (!m) log.push("MISS VISIBLE");
    else { wr(p, s.replace(m[0], m[0].replace(/\];$/, `, "${ID}"];`))); log.push("ok   VISIBLE"); }
  }
}

// 7. news pipeline. Skipped when `news: false` -- news-lib's assertDatasetCoverage
// throws if a VISIBLE id has no classifier entry, and adding a classifier entry
// with no role words tuned for the sector silently misroutes appointments into
// the new index. Both are worse than a documented gap.
if (S.news === false) log.push("skip (news:false) news pipeline");
else edit("artifacts/dean-dashboard/scripts/news-lib.mjs",
  `  publichealth: {`,
  `  ${S.newsType}: { id: "${ID}", deans: "${S.prefix}-deans.json" },\n  publichealth: {`,
  "news-lib TYPE_TO_DATASET",
  `\n  ${S.newsType}: { id: "${ID}"`);
if (S.news !== false) edit("artifacts/dean-dashboard/scripts/news-scout.mjs",
  `  ["publichealth", "r1-publichealth-schools.json"],`,
  `  ["${S.newsType}", "${S.prefix}-schools.json"],\n  ["publichealth", "r1-publichealth-schools.json"],`,
  "news-scout DATASETS",
  `["${S.newsType}", "${S.prefix}-schools.json"]`);
if (S.news !== false) edit("artifacts/dean-dashboard/scripts/news-scout.mjs",
  `  ["publichealth", /school\\s+of\\s+public\\s+health`,
  `  ["${S.newsType}", /${S.unitPhrase}/i],\n  ["publichealth", /school\\s+of\\s+public\\s+health`,
  "news-scout UNIT_PHRASES",
  `["${S.newsType}", /`);

// 8. the shared index registry. mint-trial.mjs reads INDEX_LABEL for its
// sellable-index list, so this covers the paid tiers too -- the old step 8 patched
// a literal INDICES array in mint-trial.mjs that no longer exists, and would now
// report MISS forever.
edit("artifacts/dean-dashboard/scripts/lib/indices.mjs",
  `};\n\n/** Dataset id -> human label`,
  `  "${S.prefix}-deans.json": "${ID}",\n};\n\n/** Dataset id -> human label`,
  "indices.mjs FILE_ID",
  `"${S.prefix}-deans.json": "${ID}"`);
{
  const p = "artifacts/dean-dashboard/scripts/lib/indices.mjs";
  const s = rd(p);
  if (new RegExp(`\\n {2}${ID}: `).test(s)) log.push("skip (already) indices.mjs INDEX_LABEL");
  else {
    const m = s.match(/export const INDEX_LABEL = \{[\s\S]*?\n\};/);
    if (!m) log.push("MISS indices.mjs INDEX_LABEL");
    else { wr(p, s.replace(m[0], m[0].replace(/\n\};$/, `\n  ${ID}: "${S.shortLabel}",\n};`))); log.push("ok   indices.mjs INDEX_LABEL"); }
  }
}

// 9. api/usage.js -- the owner's per-index usage dashboard.
{
  const p = "api/usage.js";
  const s = rd(p);
  if (s.includes(`"${ID}"`)) log.push("skip (already) usage.js");
  else {
    const m = s.match(/"usadminleaders",/);
    if (!m) log.push("MISS usage.js index list");
    else { wr(p, s.replace(m[0], `"usadminleaders", "${ID}",`)); log.push("ok   usage.js"); }
  }
}

console.log(`registering ${ID} (${S.prefix})\n`);
console.log(log.join("\n"));

// The noun a dataset uses is a judgement call, not an anchor: a presidency index
// wants "Leader" and its real title out of `discipline`, a dean index wants the
// "Dean" fallback. DatasetContext.tsx defaults to "Dean" for any schoolType it
// has not been taught, silently, so print the reminder rather than guess.
{
  const dc = rd("artifacts/dean-dashboard/src/data/DatasetContext.tsx");
  if (!dc.includes(`"${S.schoolType}"`)) {
    console.log(
      `\n!  DatasetContext.tsx does not know schoolType "${S.schoolType}", so every\n` +
      `   ${ID} officeholder will be labelled "Dean". If that is wrong, add it to\n` +
      `   the noun/nounPlural/titleVaries expressions there.`,
    );
  }
}

const missed = log.filter((l) => l.startsWith("MISS"));
if (missed.length) { console.log(`\n${missed.length} ANCHOR(S) MISSED, fix before shipping`); process.exit(1); }
