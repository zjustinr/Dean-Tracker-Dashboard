// Emit the un-researched slice of one stratum, with the context a researcher
// needs to search WITH: a title and a prior employer beat a bare name.
//
// Usage: node scripts/build-research-worklist.mjs leadership [--limit N]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FILE_ID } from "./lib/indices.mjs";
import { STRATA } from "./lib/strata.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const stratum = process.argv[2];
const li = process.argv.indexOf("--limit");
const LIMIT = li > -1 ? Number(process.argv[li + 1]) : Infinity;
if (!STRATA[stratum]) throw new Error(`unknown stratum: ${stratum}. one of ${Object.keys(STRATA)}`);
const IN_STRATUM = new Set(STRATA[stratum]);

const doc = JSON.parse(readFileSync(join(SRC, "nonacademic-experience.json"), "utf8"));
const ekey = (n, u) => `${String(n).trim().toLowerCase()}|${String(u).trim().toLowerCase()}`;

const done = new Set();
try {
  for (const l of readFileSync(join(HERE, "..", "research", "nonacademic-ties.jsonl"), "utf8").split("\n"))
    if (l.trim()) done.add(JSON.parse(l).key);
} catch { /* first wave */ }

// Richest surviving row per person, for search context.
const CTX = new Map();
for (const f of Object.keys(FILE_ID).concat(["deans.json"])) {
  const p = join(SRC, f);
  if (!existsSync(p)) continue;
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const rows = Array.isArray(raw) ? raw : Object.values(raw).find(Array.isArray) || [];
  for (const r of rows) {
    const name = r.dean || r.name || r.leader;
    if (!name || !r.university) continue;
    const c = {
      school: r.school || "", startYear: r.startYear ?? null,
      priorTitle: r.priorTitle || "", priorInstitution: r.priorInstitution || "",
    };
    const score = (o) => Object.values(o).filter(Boolean).length;
    const k = ekey(name, r.university);
    const prev = CTX.get(k);
    if (!prev || score(c) > score(prev)) CTX.set(k, c);
  }
}

const out = [];
for (const [key, p] of Object.entries(doc.people)) {
  if (!p.sitting) continue;
  if (p.ties && p.ties.length) continue;   // already has a named organisation
  if (done.has(key)) continue;             // a previous wave covered them
  if (!IN_STRATUM.has((p.indices || [])[0])) continue;
  const c = CTX.get(key) || {};
  out.push({ key, name: p.name, university: p.university, index: (p.indices || [])[0],
             school: c.school || "", startYear: c.startYear ?? null,
             priorTitle: c.priorTitle || "", priorInstitution: c.priorInstitution || "" });
}
out.sort((a, b) => a.key.localeCompare(b.key));
const slice = out.slice(0, LIMIT);
const path = join(HERE, "..", "research", `worklist-${stratum}.json`);
writeFileSync(path, JSON.stringify({ stratum, total: out.length, emitted: slice.length, people: slice }, null, 1));
console.log(`${stratum}: ${out.length} un-researched sitting leaders -> ${path} (${slice.length} emitted)`);
