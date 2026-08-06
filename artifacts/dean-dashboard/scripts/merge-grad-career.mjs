// Merge researched career-background fields into a dean-index dataset file.
// Mirrors merge-education.mjs's match-and-fill convention (dean|university,
// lowercased) but writes into the dataset row itself rather than
// leader-research.json, since priorTitle/priorInstitution/careerBackground/
// phdField/origin live on the dean record, not the enrichment file. Only
// fills fields that are currently blank; never overwrites a value someone
// already entered.
//
//   node scripts/merge-grad-career.mjs [--target=r1-r2public-deans.json] <career1.json> [career2.json ...]
//
// --target defaults to r1-grad-deans.json (its original use). Pass any other
// r1-*-deans.json filename to reuse this same fill-blanks-only merge logic
// for a different index.
//
// Each input is an array of rows:
//   { dean, university, priorTitle, priorInstitution, careerBackground,
//     phdField, origin }   // origin: "Internal" | "External" | "" (unknown)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const argv = process.argv.slice(2);
const targetArg = argv.find((a) => a.startsWith("--target="));
const TARGET = join(SRC, targetArg ? targetArg.slice("--target=".length) : "r1-grad-deans.json");
const files = argv.filter((a) => !a.startsWith("--target="));

const key = (d, u) => `${String(d).trim().toLowerCase()}|${String(u).trim().toLowerCase()}`;
const hasDoc = (s) => /(ph\.?\s?d|dr\.?\s?p\.?\s?h|sc\.?\s?d|ed\.?\s?d|d\.?\s?n\.?\s?p|dph|d\.?sc|d\.?o\b|j\.?d\b|m\.?d\b)/i.test(s || "");
const chairRole = (t) => /\bchair\b/i.test(t || "");
const assocDean = (t) => /(associate|assistant|senior associate|deputy|vice)\s+(dean|provost)/i.test(t || "");
const priorDean = (t) => /(^|[^a-z])dean\b/i.test(t || "") && !assocDean(t);

const deans = JSON.parse(readFileSync(TARGET, "utf8"));
const byKey = new Map(deans.map((d) => [key(d.dean, d.university), d]));

let added = 0, skipped = 0, notFound = 0, blank = 0;
for (const f of files) {
  let rows;
  try { rows = JSON.parse(readFileSync(f, "utf8")); } catch { console.warn("invalid/missing JSON:", f); continue; }
  for (const r of rows) {
    if (!r || !r.dean || !r.university) continue;
    const d = byKey.get(key(r.dean, r.university));
    if (!d) { notFound++; console.warn("no matching row:", r.dean, "|", r.university); continue; }

    let changed = false;
    if (r.priorTitle && !d.priorTitle) { d.priorTitle = r.priorTitle.trim(); changed = true; }
    if (r.priorInstitution && !d.priorInstitution) { d.priorInstitution = r.priorInstitution.trim(); changed = true; }
    if (r.careerBackground && !d.careerBackground) { d.careerBackground = r.careerBackground.trim(); changed = true; }
    if (r.phdField && !d.phdField) { d.phdField = r.phdField.trim(); changed = true; }

    if (r.origin && !d.origin) {
      d.origin = r.origin;
      d.originV2 = r.origin;
      d.apptOrigin4 = r.origin.toLowerCase();
      d.isInternal = r.origin === "Internal";
      d.isExternal = r.origin === "External";
      changed = true;
    }

    // Derived flags recomputed from whichever priorTitle ended up set (existing or new).
    const title = d.priorTitle || "";
    if (title) {
      d.hasPriorDeanExp = d.hasPriorDeanExp || priorDean(title);
      d.priorAssocOrAsstDean = d.priorAssocOrAsstDean || assocDean(title);
      d.hadAssocDeanRole = d.hadAssocDeanRole || assocDean(title);
      d.hadDeptChairRole = d.hadDeptChairRole || chairRole(title);
    }
    if (!d.hasPhd && (hasDoc(d.phdField) || hasDoc(title) || hasDoc(d.careerBackground))) d.hasPhd = true;

    if (changed) added++; else blank++;
  }
}

writeFileSync(TARGET, JSON.stringify(deans, null, 1));
console.log(`career merge: +${added} rows updated | ${blank} rows with nothing new | ${notFound} unmatched | ${targetArg ? targetArg.slice("--target=".length) : "r1-grad-deans.json"} now ${deans.length} records`);
