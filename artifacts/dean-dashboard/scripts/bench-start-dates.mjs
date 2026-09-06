#!/usr/bin/env node
/**
 * F14 — feeder-bench start dates, as a pipeline.
 *
 * 11,930 associate/vice-dean records carry 37 start dates between them. Until
 * that changes, any tenure or movability claim about the feeder bench is
 * unsupported, which is half the product. Nobody announces an associate dean's
 * appointment, so the announcement-based sources that work for deans do not
 * scale here. Archived leadership pages do: a person who is absent from a
 * school's leadership page in March 2019 and present in June 2020 started
 * between those dates, and no announcement had to exist for the archive to
 * record it.
 *
 * This is a PIPELINE, not a sprint. It will not finish in one sitting: 6,233
 * distinct leadership pages, a few archive fetches each, at a rate the archive
 * is happy to serve. So it is built to be run repeatedly and interrupted freely
 *   - every URL's result is written to the ledger as soon as it is known,
 *   - a URL already in the ledger is skipped on the next run,
 *   - URLs are worked in descending order of how many people they cover, so the
 *     first hours deliver the most records (922 pages cover half the bench).
 *
 *   node scripts/bench-start-dates.mjs [--limit N] [--concurrency C] [--index ID] [--stats]
 *
 * Writes research/bench-start-dates.json. Nothing here touches the datasets --
 * apply-bench-start-dates.mjs does that, separately and reviewably.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { snapshots, snapshotText, normalizeText, nameVariants, pageNamesPerson, tsToMonth } from "./lib/wayback.mjs";
import { FILE_ID } from "./lib/indices.mjs";
import { benchKey, isBenchRow } from "./lib/bench.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const LEDGER_DIR = join(HERE, "..", "research");
const LEDGER = join(LEDGER_DIR, "bench-start-dates.json");

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const LIMIT = parseInt(flag("limit", "0"), 10) || 0;
const CONCURRENCY = Math.max(1, Math.min(4, parseInt(flag("concurrency", "2"), 10) || 2));
const ONLY_INDEX = flag("index", null);
const STATS_ONLY = argv.includes("--stats");

// ---- the work list ---------------------------------------------------------
const files = readdirSync(SRC).filter((f) => /deans.*\.json$/.test(f) && !/schools/.test(f) && f !== "dean-photos.json");
const byUrl = new Map();
for (const f of files) {
  const id = FILE_ID[f];
  if (ONLY_INDEX && id !== ONLY_INDEX) continue;
  let rows;
  try { rows = JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { continue; }
  if (!Array.isArray(rows)) continue;
  for (const r of rows) {
    if (!isBenchRow(r) || !r.sourceUrl || !r.dean) continue;
    if (r.startYear) continue; // already dated; nothing to bracket
    if (!byUrl.has(r.sourceUrl)) byUrl.set(r.sourceUrl, new Map());
    // Keyed by NAME so one page fetch answers for every record of that person,
    // and every one of those records carried as an explicit {file, key} ref --
    // see lib/bench.mjs for why a bench row cannot be addressed by its id.
    const nameKey = r.dean.trim().toLowerCase();
    const perName = byUrl.get(r.sourceUrl);
    if (!perName.has(nameKey)) perName.set(nameKey, { dean: r.dean, university: r.university, refs: [] });
    perName.get(nameKey).refs.push({ file: f, key: benchKey(f, r) });
  }
}
// Most people first: the pipeline is long, so its early hours should be its most
// productive ones. Ties broken by URL so a run is reproducible.
const workList = [...byUrl.entries()]
  .map(([url, perName]) => [url, [...perName.values()]])
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, "utf8")) : { generated: null, urls: {} };
const pending = workList.filter(([url]) => !ledger.urls[url]);

if (STATS_ONLY) {
  const done = workList.length - pending.length;
  const peopleTotal = workList.reduce((s, [, p]) => s + p.length, 0);
  const peopleDone = workList.filter(([url]) => ledger.urls[url]).reduce((s, [, p]) => s + p.length, 0);
  console.log(`Pages: ${done}/${workList.length} done (${pending.length} pending).`);
  console.log(`People covered by done pages: ${peopleDone}/${peopleTotal}.`);
  const outcomes = {};
  for (const rec of Object.values(ledger.urls)) for (const p of Object.values(rec.people ?? {})) outcomes[p.outcome] = (outcomes[p.outcome] ?? 0) + 1;
  console.log("Outcomes so far:", outcomes);
  process.exit(0);
}

mkdirSync(LEDGER_DIR, { recursive: true });
const save = () => {
  ledger.generated = new Date().toISOString();
  writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + "\n");
};

/**
 * Bracket every person listed on one page.
 *
 * The search is adaptive rather than exhaustive, because the cheap cases are the
 * common ones. Nearly everybody on the bench is currently in post, so they are in
 * the newest snapshot; the question is when they first appear. If they are also
 * in the OLDEST snapshot the archive holds, there is nothing to find -- the
 * answer is "no later than that", an open bracket, in two fetches. Only when
 * somebody appears between the two is a binary search worth its ~4 extra fetches.
 * Snapshot text is fetched once and shared by everyone on the page.
 */
async function processUrl(url, people) {
  const rec = { checkedAt: new Date().toISOString(), people: {} };
  const snap = await snapshots(url);
  if (!snap.ok) { rec.error = snap.error; rec.transient = true; return rec; }
  rec.snapshotCount = snap.list.length;
  if (snap.list.length === 0) { rec.error = "never archived"; return rec; }

  const cache = new Map();
  const pageAt = async (i) => {
    const ts = snap.list[i].ts;
    if (!cache.has(ts)) {
      const body = await snapshotText(url, ts);
      cache.set(ts, body == null ? null : normalizeText(body.replace(/<[^>]*>/g, " ")));
    }
    return cache.get(ts);
  };

  // A PDF is archived fine and strips to nothing useful, so every name on it
  // reads as absent. Say that, rather than emit 19 "not-found" rows that look
  // like 19 individually unresolvable people.
  if (/\.pdf(\?|$)/i.test(url)) {
    rec.error = "unsupported-format: pdf";
    for (const p of people) rec.people[p.dean] = { outcome: "unsupported-format", refs: p.refs };
    return rec;
  }

  const lastI = snap.list.length - 1;
  const newest = await pageAt(lastI);
  const oldest = snap.list.length > 1 ? await pageAt(0) : newest;
  if (newest == null) { rec.error = "newest snapshot unreadable"; rec.transient = true; return rec; }

  for (const p of people) {
    const variants = nameVariants(p.dean);
    if (!variants.length) { rec.people[p.dean] = { outcome: "unparseable-name", refs: p.refs }; continue; }
    const inNewest = pageNamesPerson(newest, variants);
    const inOldest = oldest == null ? false : pageNamesPerson(oldest, variants);

    if (!inNewest && !inOldest) {
      // Never on this page in any snapshot we hold. Could be a page that changed
      // shape, a name written differently, or a record sourced from elsewhere on
      // the site. Not a date, and not guessed at.
      rec.people[p.dean] = { outcome: "not-found", refs: p.refs };
      continue;
    }
    if (inOldest) {
      rec.people[p.dean] = {
        outcome: "open-bracket",
        presentBy: tsToMonth(snap.list[0].ts),
        note: "present in the oldest snapshot held; started at or before it",
        refs: p.refs,
      };
      continue;
    }
    // Present now, absent at the start: binary search the transition.
    let lo = 0, hi = lastI; // absent at lo, present at hi
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const page = await pageAt(mid);
      if (page == null) break; // unreadable snapshot: stop narrowing, keep the bracket we have
      if (pageNamesPerson(page, variants)) hi = mid; else lo = mid;
    }
    // Binary search assumes that once somebody appears they stay -- and a
    // leadership page that is reorganised, or briefly drops a section, breaks
    // that assumption and hands back a transition that is not the first one.
    // One extra fetch halfway down the "absent" side catches it. A person found
    // there gets no date at all rather than a plausible wrong one.
    let nonMonotonic = false;
    if (lo > 0) {
      const probe = await pageAt(Math.floor(lo / 2));
      if (probe != null && pageNamesPerson(probe, variants)) nonMonotonic = true;
    }
    rec.people[p.dean] = nonMonotonic
      ? { outcome: "non-monotonic", note: "appears, disappears and reappears across snapshots; no reliable first appearance", refs: p.refs }
      : {
        outcome: "bracketed",
        absentAt: tsToMonth(snap.list[lo].ts),
        presentAt: tsToMonth(snap.list[hi].ts),
        refs: p.refs,
      };
  }
  // Nobody on the page matched, though the page archived fine: the page almost
  // certainly renders its names with JavaScript, or lists them in a shape the
  // matcher does not read. A page-level problem to triage once, not N people to
  // chase individually.
  const outcomes = Object.values(rec.people).map((o) => o.outcome);
  if (outcomes.length > 2 && outcomes.every((o) => o === "not-found")) {
    rec.error = "page-yields-no-names";
    for (const k of Object.keys(rec.people)) rec.people[k].outcome = "page-yields-no-names";
  }
  rec.fetches = cache.size;
  return rec;
}

// ---- run -------------------------------------------------------------------
const queue = LIMIT ? pending.slice(0, LIMIT) : pending;
console.log(`${workList.length} pages hold ${workList.reduce((s, [, p]) => s + p.length, 0)} undated bench records.`);
console.log(`${pending.length} not yet checked; this run will do ${queue.length} at concurrency ${CONCURRENCY}.\n`);

let done = 0, fetches = 0, transientFails = 0;
const started = Date.now();
async function worker() {
  for (;;) {
    const item = queue.shift();
    if (!item) return;
    const [url, people] = item;
    const rec = await processUrl(url, people);
    // A page that failed because the network wobbled is NOT a page that has been
    // checked. Recording it as done would retire it permanently on the first
    // proxy hiccup, and a long crawl over a free service has plenty of those --
    // so transient failures are counted and left pending for the next run, while
    // real answers (including "never archived" and "renders names in JS") are
    // final and never re-fetched.
    if (rec.transient) {
      transientFails++;
      const prior = ledger.retries?.[url] ?? 0;
      (ledger.retries ??= {})[url] = prior + 1;
      // After enough consecutive failures it is the URL, not the network.
      if (prior + 1 >= 5) { ledger.urls[url] = { ...rec, error: `${rec.error} (gave up after 5 attempts)` }; }
      save();
      continue;
    }
    ledger.urls[url] = rec;
    if (ledger.retries?.[url]) delete ledger.retries[url];
    fetches += rec.fetches ?? 1;
    done++;
    save(); // after every page: this pipeline gets interrupted, and losing an
            // hour of archive fetches to an unwritten ledger is the one failure
            // mode that would make a person stop running it.
    const outcomes = Object.values(rec.people ?? {}).map((p) => p.outcome).join(",") || rec.error || "-";
    console.log(`[${done}/${queue.length + done - (queue.length ? 0 : 0)}] ${people.length}p ${url.slice(0, 76)} -> ${outcomes.slice(0, 60)}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const secs = (Date.now() - started) / 1000;
if (transientFails) console.log(`\n${transientFails} page(s) failed transiently (network/rate limit) and stay pending for the next run.`);
const tally = {};
for (const [url] of workList) for (const p of Object.values(ledger.urls[url]?.people ?? {})) tally[p.outcome] = (tally[p.outcome] ?? 0) + 1;
console.log(`\n${done} pages in ${secs.toFixed(0)}s (${(secs / Math.max(1, done)).toFixed(1)}s/page, ${fetches} archive fetches).`);
console.log("Outcomes across the whole ledger:", tally);
const remaining = workList.filter(([url]) => !ledger.urls[url]).length;
if (remaining) {
  const projHours = (remaining * (secs / Math.max(1, done))) / 3600;
  console.log(`${remaining} pages left — about ${projHours.toFixed(1)}h at this rate and concurrency. Re-run to continue; the ledger resumes.`);
}
