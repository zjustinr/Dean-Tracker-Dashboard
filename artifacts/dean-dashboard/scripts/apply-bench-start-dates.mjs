#!/usr/bin/env node
/**
 * Apply the brackets that bench-start-dates.mjs found to the datasets.
 *
 * Separate from the crawl on purpose: the crawl is long, interruptible and
 * network-bound, and its ledger is the reviewable artifact. This step is fast,
 * deterministic, and reads only the ledger -- so a person can read what the
 * pipeline concluded before any of it reaches the corpus, and re-run this after
 * every crawl session.
 *
 *   node scripts/apply-bench-start-dates.mjs [--dry-run] [--max-months N]
 *
 * WHAT GETS WRITTEN, AND WHAT DOES NOT
 * Only `bracketed` findings: absent from the leadership page at one snapshot,
 * present at the next. Those carry `startYear` plus `startPrecision:
 * "bracketed"` and a `startLabel` naming the window, because a bracketed year is
 * NOT the same kind of fact as a year read off an announcement and the corpus
 * must not pretend otherwise -- D1's estimator treats every year as exact, and
 * silently feeding it inferred years is the failure F15 is about.
 *
 * Everything else stays undated:
 *   open-bracket        present in the oldest snapshot held -- an upper bound
 *                       ("no later than"), not a start date.
 *   not-found           the page never names them in any snapshot.
 *   page-yields-no-names the page archives but renders its names in JavaScript,
 *                       or in a shape the matcher cannot read -- triage the page.
 *   unsupported-format  a PDF; the crawler does not read those.
 *   non-monotonic       appears, disappears and reappears; no reliable first
 *                       appearance to take.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { benchKey, isBenchRow } from "./lib/bench.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const LEDGER = join(HERE, "..", "research", "bench-start-dates.json");

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const mIdx = argv.indexOf("--max-months");
/** Widest bracket still worth writing a year for. A window wider than this says
 *  little more than the decade. */
const MAX_MONTHS = mIdx >= 0 ? parseInt(argv[mIdx + 1], 10) : 18;

if (!existsSync(LEDGER)) { console.error(`No ledger at ${LEDGER}. Run scripts/bench-start-dates.mjs first.`); process.exit(1); }
const ledger = JSON.parse(readFileSync(LEDGER, "utf8"));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pretty = (m) => { const [y, mo] = m.split("-"); return `${MONTHS[parseInt(mo, 10) - 1]} ${y}`; };
const monthNum = (m) => { const [y, mo] = m.split("-").map(Number); return y * 12 + mo; };

// Natural key -> finding, for every bracket narrow enough to use. Bench rows have
// no usable id (see lib/bench.mjs); keying on one matched 1,340 records for 29
// findings in testing, i.e. it would have written most of them onto a stranger.
const byRef = new Map();
const skipped = {};
for (const rec of Object.values(ledger.urls ?? {})) {
  for (const p of Object.values(rec.people ?? {})) {
    if (p.outcome !== "bracketed") { skipped[p.outcome] = (skipped[p.outcome] ?? 0) + 1; continue; }
    const width = monthNum(p.presentAt) - monthNum(p.absentAt);
    if (width > MAX_MONTHS) { skipped["bracket-too-wide"] = (skipped["bracket-too-wide"] ?? 0) + 1; continue; }
    for (const ref of p.refs ?? []) byRef.set(ref.key, { ...p, width });
  }
}

const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
let written = 0, straddling = 0, alreadyDated = 0;
const widths = [];
for (const f of files) {
  const path = join(SRC, f);
  const raw = readFileSync(path, "utf8");
  let rows;
  try { rows = JSON.parse(raw); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  let changed = false;
  for (const r of rows) {
    if (!isBenchRow(r)) continue;
    const found = byRef.get(benchKey(f, r));
    if (!found) continue;
    if (r.startYear) { alreadyDated++; continue; }
    // The year of the first snapshot they actually appear in. When the bracket
    // straddles New Year the true start may be the previous year -- counted and
    // reported, and the label carries the window so the reader can see it.
    const year = parseInt(found.presentAt.slice(0, 4), 10);
    if (found.absentAt.slice(0, 4) !== found.presentAt.slice(0, 4)) straddling++;
    r.startYear = year;
    r.startLabel = `between ${pretty(found.absentAt)} and ${pretty(found.presentAt)}`;
    r.startPrecision = "bracketed";
    widths.push(found.width);
    written++;
    changed = true;
  }
  if (changed && !DRY) {
    const minified = /^\[\s*\{"/.test(raw);
    const indent = minified ? 0 : /^\[\s*\n(\s+)/.exec(raw)?.[1].length ?? 2;
    writeFileSync(path, JSON.stringify(rows, null, indent) + (raw.endsWith("\n") ? "\n" : ""));
  }
}

widths.sort((a, b) => a - b);
console.log(`${DRY ? "[dry run] " : ""}${written} bench records dated from brackets of at most ${MAX_MONTHS} months.`);
if (widths.length) console.log(`Bracket width: median ${widths[Math.floor(widths.length / 2)]} months, widest ${widths[widths.length - 1]}.`);
if (straddling) console.log(`${straddling} brackets straddle a year boundary — the true start may fall in the previous calendar year. startLabel carries the window.`);
if (alreadyDated) console.log(`${alreadyDated} already carried a start year and were left alone.`);
console.log("Left undated:", skipped);
