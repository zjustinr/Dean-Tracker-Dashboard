#!/usr/bin/env node
// Acceptance test for the usage dashboard's engagement rollup (api/usage.js).
//
// The one that matters: an email security gateway sweeping an outreach mail --
// a block of consecutive addresses, one hit per link tag, all on the send date
// -- must NOT read as engagement and must NOT raise the shared-link flag. That
// is what the first version of the flag got wrong: it counted distinct
// addresses and fired on 11 of 13 live links, which made it useless.
//
// Drives the real handler against a stubbed KV, so it covers the classifier,
// the windows and the flag together rather than a reimplementation of them.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

process.env.USAGE_SECRET = "rollup-test-secret";
process.env.KV_REST_API_URL = "https://kv.invalid";
process.env.KV_REST_API_TOKEN = "tok";

const DAY = 86400000;
const now = Date.now();
const ago = (d) => now - d * DAY;
const HUMAN = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const events = [];
const push = (e) => events.push(e);

// 1. gateway sweep: 6 consecutive addresses, one hit each, all on the send day,
//    spread across four different link tags. The exact shape seen in production.
["fastmail-search", "acme-search", "beta-search", "gamma-search"].forEach((c, i) => {
  for (let n = 0; n < 6; n++) push({ c, ev: "open", t: ago(9), ip: `160.79.106.${128 + n}`, ua: "Mozilla/5.0 (compatible; Proofpoint URL Defense)" });
  // and one real human who actually opened it, on two days
  if (i === 0) { push({ c, ev: "detail", t: ago(9), ip: "71.59.250.160", ua: HUMAN }); push({ c, ev: "search", t: ago(8), ip: "71.59.250.160", ua: HUMAN }); }
});

// 2. a genuinely forwarded link: four people, three of them returning on a
//    second day, on four different /24s.
for (const [ip, days] of [["12.0.0.5", [5, 3]], ["13.0.0.9", [5, 2]], ["14.0.0.2", [4, 2]], ["15.0.0.7", [4]]]) {
  for (const d of days) for (let k = 0; k < 3; k++) push({ c: "forwarded", ev: "detail", t: ago(d), ip, ua: HUMAN });
}

// 3. a link only ever touched by a crawler -- no human at all.
for (let n = 0; n < 5; n++) push({ c: "never-opened", ev: "open", t: ago(6), ip: "66.249.75.108", ua: "Googlebot/2.1 (+http://www.google.com/bot.html)" });

// 4. legacy events with NO ua at all -- the back catalogue. Address ranges must
//    still catch the cloud ones.
for (let n = 0; n < 4; n++) push({ c: "legacy", ev: "open", t: ago(10), ip: "34.122.147.229" });
push({ c: "legacy", ev: "detail", t: ago(10), ip: "73.11.101.173" });

// 5. one ordinary engaged client on one address across several days.
for (const d of [1, 2, 4]) for (let k = 0; k < 5; k++) push({ c: "steady", ev: "detail", t: ago(d), ip: "24.60.11.9", ua: HUMAN });

// 6. mint must still never count as engagement.
push({ c: "minted-never-used", ev: "mint", f: "project · 30d", t: ago(3) });

const clients = [...new Set(events.map((e) => e.c))];
const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
// Key-aware KV. The engagement window reads the per-day lists (bi:ev:<day>),
// falling back to the capped feed (bi:events) for days that have none -- run
// the whole scenario both ways, since production has both kinds of day.
let perDayLists = true;
global.fetch = async (_u, o) => ({
  ok: true,
  json: async () => JSON.parse(o.body).map(([op, key]) => {
    if (op === "LRANGE" && key === "bi:events") return { result: events.map((e) => JSON.stringify(e)) };
    if (op === "LRANGE" && key.startsWith("bi:ev:")) {
      return { result: perDayLists ? events.filter((e) => dayOf(e.t) === key.slice(6)).map((e) => JSON.stringify(e)) : [] };
    }
    if (op === "SMEMBERS") return { result: key === "bi:clients" ? clients : [] };
    return { result: null };
  }),
});

const handler = require(join(ROOT, "api/usage.js"));
const fetchJson = () => new Promise((resolve) => {
  const r = { _c: 0, setHeader() {}, status(c) { this._c = c; return this; },
              send(b) { resolve({ code: this._c, body: b }); },
              json(b) { resolve({ code: this._c, body: b }); } };
  handler({ query: { key: process.env.USAGE_SECRET, json: "1" } }, r);
});
let pass = true;
for (const mode of ["per-day lists", "legacy feed fallback"]) {
perDayLists = mode === "per-day lists";
console.log(`-- ${mode}`);
const res = await fetchJson();

const by = Object.fromEntries(res.body.clients.map((c) => [c.client, c]));
const cases = [
  ["gateway sweep is not engagement",   by["acme-search"].last30d.events, 0],
  ["...and is counted as bot",          by["acme-search"].last30d.botEvents, 6],
  ["...and reads 'Bot only'",           by["acme-search"].status, "Bot only"],
  ["...and is NOT flagged shared",      by["acme-search"].possiblyShared, false],
  ["sweep + a real reader: human only", by["fastmail-search"].last30d.events, 2],
  ["...its bot hits kept separate",     by["fastmail-search"].last30d.botEvents, 6],
  ["...one human address, not seven",   by["fastmail-search"].last30d.distinctIps, 1],
  ["...not flagged shared",             by["fastmail-search"].possiblyShared, false],
  ["crawler-only link reads Bot only",  by["never-opened"].status, "Bot only"],
  ["...zero human events",              by["never-opened"].last30d.events, 0],
  ["legacy cloud IP caught w/o ua",     by["legacy"].last30d.botEvents, 4],
  ["...legacy human IP still counts",   by["legacy"].last30d.events, 1],
  ["genuinely forwarded IS flagged",    by["forwarded"].possiblyShared, true],
  ["...recurring addresses counted",    by["forwarded"].last30d.recurringIps, 3],
  ["...across distinct networks",       by["forwarded"].last30d.distinctNets, 4],
  ["steady single-user NOT flagged",    by["steady"].possiblyShared, false],
  ["...but is Active",                  by["steady"].status, "Active"],
  ["...with real events",               by["steady"].last30d.events, 15],
  ["mint-only link stays Dormant",      by["minted-never-used"].status, "Dormant"],
  ["...and has no events",              by["minted-never-used"].last30d.events, 0],
];

for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) pass = false;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  (want ${JSON.stringify(want)}, got ${JSON.stringify(got)})`}`);
}

// The headline regression, stated as the thing it is: the old rule flagged
// every link the sweep touched. Assert the new one flags exactly the real case.
const flagged = res.body.clients.filter((c) => c.possiblyShared).map((c) => c.client);
const flaggedOk = flagged.length === 1 && flagged[0] === "forwarded";
if (!flaggedOk) pass = false;
console.log(`${flaggedOk ? "✓" : "✗"} exactly one link flagged, and it is the forwarded one  (flagged: ${flagged.join(", ") || "none"})`);
}

console.log(pass ? "\nROLLUP TEST PASS" : "\nROLLUP TEST FAIL");
process.exit(pass ? 0 : 1);
