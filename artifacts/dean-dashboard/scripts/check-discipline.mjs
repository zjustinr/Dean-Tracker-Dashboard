// QC guard: every SITTING leader must carry a real disciplineBroad, or a
// discipline filter silently drops them from the Slate Builder (this is exactly
// how Staats / Grushka-Cockayne / Mitra went missing after a scout refresh).
//
// Run after any data refresh:  node scripts/check-discipline.mjs
// Exits non-zero and lists offenders if any current leader is uncategorised, so
// it can gate CI or a post-refresh step.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const BAD = new Set(["", "unknown", null, undefined]);

let offenders = [];
for (const f of readdirSync(DATA).filter((n) => /deans.*\.json$/.test(n))) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(DATA, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  for (const d of rows) {
    if (d && d.endYear == null) {
      const v = String(d.disciplineBroad ?? "").trim().toLowerCase();
      if (BAD.has(v)) offenders.push(`${f}  ${d.dean} | ${d.university}`);
    }
  }
}

if (offenders.length) {
  console.error(`✗ ${offenders.length} sitting leader(s) missing disciplineBroad:`);
  for (const o of offenders) console.error("   " + o);
  console.error("\nAssign a real disciplineBroad (not 'Unknown') before deploying.");
  process.exit(1);
}
console.log("✓ every sitting leader has a discipline.");
