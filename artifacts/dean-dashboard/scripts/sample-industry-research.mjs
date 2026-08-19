// Draw a stratified, reproducible research sample of SITTING leaders whose
// industry ties the derivation pass could not name.
//
// WHY STRATIFIED, AND WHY THESE STRATA
// ------------------------------------
// A hit rate means nothing without a baseline. Most academic leaders have no
// industry background at all, so a sample drawn only where hits are likely
// measures the sampler, not the population. The strata below encode the prior
// we are actually testing -- administrative and professional-school seats
// should carry ties, discipline deanships should be near zero -- so the pilot
// can report a LIFT rather than a bare percentage.
//
// Usage: node scripts/sample-industry-research.mjs [--per 30] [--seed 20260819]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { FILE_ID } from "./lib/indices.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");

/** Index-id -> stratum. Every registered index belongs to exactly one. */
export const STRATA = {
  administrative: ["usadminleaders", "usadvancement", "ussystem"],
  professional: ["r1bschool", "r1law", "r1eschool", "uspharmacy"],
  discipline: [
    "r1arts", "useducation", "usnursing", "r1medical", "uspublichealth",
    "usag", "usvet", "usgrad", "uscreativearts",
  ],
  leadership: ["r1university", "r1provost", "uslac", "usr2"],
};
const STRATUM_OF = {};
for (const [s, ids] of Object.entries(STRATA)) for (const id of ids) STRATUM_OF[id] = s;

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const PER = Number(arg("--per", 30));
const SEED = Number(arg("--seed", 20260819));

// Deterministic LCG -- a fixed seed means the sample is auditable and a rerun
// with the same seed extends rather than reshuffles.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const doc = JSON.parse(readFileSync(join(SRC, "industry-experience.json"), "utf8"));
const enrichKey = (n, u) => `${String(n).trim().toLowerCase()}|${String(u).trim().toLowerCase()}`;

// Pull the richest surviving row per person so the researcher has something to
// search WITH: a title and a prior employer beat a bare name every time.
const CTX = new Map();
for (const file of Object.keys(FILE_ID).concat(["deans.json"])) {
  const p = join(SRC, file);
  if (!existsSync(p)) continue;
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
  for (const r of rows) {
    const name = r.dean || r.name || r.leader;
    if (!name || !r.university) continue;
    const k = enrichKey(name, r.university);
    const cand = {
      school: r.school || "",
      title: r.title || r.role || "",
      startYear: r.startYear ?? null,
      priorTitle: r.priorTitle || "",
      priorInstitution: r.priorInstitution || "",
      careerBackground: typeof r.careerBackground === "string" && r.careerBackground.length <= 80
        ? r.careerBackground : "",
      sourceUrl: r.sourceUrl || "",
    };
    const prev = CTX.get(k);
    const score = (o) => Object.values(o).filter(Boolean).length;
    if (!prev || score(cand) > score(prev)) CTX.set(k, cand);
  }
}

// The frame: sitting leaders the derivation could NOT name a firm for. Anyone
// who already has a named tie is excluded -- the pilot measures what research
// ADDS, not what it re-confirms.
const frame = { administrative: [], professional: [], discipline: [], leadership: [] };
for (const [key, p] of Object.entries(doc.people)) {
  if (!p.sitting) continue;
  if (p.ties && p.ties.length) continue;
  const stratum = STRATUM_OF[(p.indices || [])[0]];
  if (!stratum) continue;
  frame[stratum].push({ key, ...p, ctx: CTX.get(key) || null });
}

const rand = rng(SEED);
const out = [];
for (const [stratum, pool] of Object.entries(frame)) {
  const shuffled = pool
    .map((p) => [rand(), p])
    .sort((a, b) => a[0] - b[0])
    .map(([, p]) => p);
  for (const p of shuffled.slice(0, PER)) {
    out.push({
      key: p.key,
      stratum,
      index: (p.indices || [])[0] || null,
      name: p.name,
      university: p.university,
      school: p.ctx?.school || "",
      startYear: p.ctx?.startYear ?? null,
      priorTitle: p.ctx?.priorTitle || "",
      priorInstitution: p.ctx?.priorInstitution || "",
      careerBackground: p.ctx?.careerBackground || "",
      derived: { status: p.status, confidence: p.confidence, stops: p.stops ?? 0, sectors: p.sectors || [] },
    });
  }
}

// Same directory as the research ledger the generator reads, so a sample and
// the findings it produced sit next to each other.
const path = join(HERE, "..", "research", "industry-pilot-sample.json");
writeFileSync(path, JSON.stringify({ seed: SEED, per: PER, strata: STRATA, frameSizes:
  Object.fromEntries(Object.entries(frame).map(([k, v]) => [k, v.length])), sample: out }, null, 2));
console.log(`frame: ${Object.entries(frame).map(([k, v]) => `${k}=${v.length}`).join("  ")}`);
console.log(`sampled ${out.length} -> ${path}`);
