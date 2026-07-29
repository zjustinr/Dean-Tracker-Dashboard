// Cross-index leadership ladders. The datasets are loaded one index at a time, so
// a profile viewed in (say) the B-school index cannot see that the same person
// later became a provost and then a president in two OTHER indices. This scans
// every index, groups appearances by person, and emits a small map the profile
// card reads to show the full ladder (dept chair is added client-side from flags;
// this file supplies the dean -> provost -> president rungs).
//
// Keyed by normalized name. Only people with 2+ appearances are included, so the
// file stays small and single-role leaders keep their existing prior-history view.
//
//   node scripts/gen-careers.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");

// file -> { role rung, ladder order }. Order rises dept-chair(1) .. system head(6).
const IDX = {
  "r1-bschool-deans.json": ["Dean", 3], "r1-eschool-deans.json": ["Dean", 3],
  "r1-medschool-deans.json": ["Dean", 3], "r1-lawschool-deans.json": ["Dean", 3],
  "r1-nursing-deans.json": ["Dean", 3], "r1-pharmacy-deans.json": ["Dean", 3],
  "r1-education-deans.json": ["Dean", 3], "r1-arts-deans.json": ["Dean", 3],
  "r1-agschool-deans.json": ["Dean", 3], "r1-publichealth-deans.json": ["Dean", 3],
  "r1-vet-deans.json": ["Dean", 3], "r1-camd-deans.json": ["Dean", 3],
  "r1-grad-deans.json": ["Graduate Dean", 3],
  "r1-advancement-deans.json": ["Advancement", 2],
  "r1-provost-deans.json": ["Provost", 4],
  "r1-university-deans.json": ["President", 5], "r1-r2public-deans.json": ["President", 5],
  "r1-system-deans.json": ["System President", 6],
};

// Must match careerKey() in enrichment.ts exactly.
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

const byName = {};
for (const [file, [role, ord]] of Object.entries(IDX)) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(SRC, file), "utf8")); } catch { continue; }
  for (const r of rows) {
    const k = norm(r.dean);
    if (!k) continue;
    (byName[k] = byName[k] || []).push({
      name: String(r.dean).trim(), role, ord,
      uni: r.university, school: r.school || "",
      s: typeof r.startYear === "number" ? r.startYear : null,
      e: typeof r.endYear === "number" ? r.endYear : null,
      interim: !!r.isInterim,
    });
  }
}

const out = {};
let dropped = 0;
for (const [k, recs] of Object.entries(byName)) {
  recs.sort((a, b) => (a.s || 0) - (b.s || 0) || a.ord - b.ord);
  // Homonym guard: two people with the same name serving at the same time at
  // different institutions are not one career. Drop a rung that overlaps an
  // already-accepted rung by 2+ years at a different university.
  const kept = [];
  for (const r of recs) {
    const clash = kept.some((p) => {
      if (p.uni === r.uni) return false;
      const overlap = Math.min(r.e ?? 9999, p.e ?? 9999) - Math.max(r.s ?? -9999, p.s ?? -9999);
      return overlap >= 2;
    });
    if (clash) { dropped++; continue; }
    kept.push(r);
  }
  if (kept.length < 2) continue;
  out[k] = {
    name: kept[kept.length - 1].name,
    roles: kept.map((r) => ({ role: r.role, uni: r.uni, school: r.school, s: r.s, e: r.e, interim: r.interim })),
  };
}

writeFileSync(join(SRC, "leader-careers.json"), JSON.stringify(out) + "\n");
const crossIdx = Object.values(out).filter((p) => new Set(p.roles.map((r) => r.role)).size >= 2).length;
console.log(`leader-careers.json: ${Object.keys(out).length} people (${crossIdx} span 2+ role types), ${dropped} homonym rungs dropped`);
