// Hardening Step 2/3 — precompute the header corpus totals.
//
// Since Step 3, dataset JSON is served on demand from src/data (by the gated
// serverless function in prod and the vite dev server locally), so there is no
// data artifact to generate — only corpus-stats.json, which is small and stays
// bundled (App.tsx imports it). Re-run after a data refresh (wired into the
// build + local pre-dev/pre-build):
//
//   node scripts/gen-public-data.mjs        (or: pnpm gen-data)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { computeCorpus } from "../../../lib/dataset-assembly.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");

const stats = computeCorpus(SRC);
writeFileSync(join(SRC, "corpus-stats.json"), JSON.stringify(stats, null, 2) + "\n");
console.log("Corpus stats -> src/data/corpus-stats.json:", stats);
