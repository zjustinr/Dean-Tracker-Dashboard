#!/usr/bin/env node
// Event history: the three-layer log (feed / per-day lists / daily summaries)
// and the nightly archive of finished days to a private GitHub repo.
//
// Drives the real api/* handlers against an in-memory KV and a fake GitHub
// contents API.
//
//   node scripts/event-history-test.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

Object.assign(process.env, {
  TRIAL_SECRET: "test-secret", KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "t",
  USAGE_SECRET: "owner", CRON_SECRET: "cron",
});

// --- in-memory KV --------------------------------------------------------------
const store = new Map();
const ttl = new Map();
function run([cmd, key, ...a]) {
  const get = () => store.get(key);
  switch (cmd) {
    case "GET": return get() ?? null;
    case "SET": if (a.includes("NX") && store.has(key)) return null; store.set(key, a[0]); return "OK";
    case "DEL": return store.delete(key) ? 1 : 0;
    case "EXPIRE": ttl.set(key, Number(a[0])); return 1;
    case "LPUSH": { const l = get() || []; l.unshift(...a); store.set(key, l); return l.length; }
    case "RPUSH": { const l = get() || []; l.push(...a); store.set(key, l); return l.length; }
    case "LTRIM": { const l = get() || []; store.set(key, l.slice(Number(a[0]), Number(a[1]) + 1)); return "OK"; }
    case "LRANGE": { const l = get() || []; return a[1] === "-1" ? l.slice(Number(a[0])) : l.slice(Number(a[0]), Number(a[1]) + 1); }
    case "SADD": { const s = get() || new Set(); a.forEach((m) => s.add(m)); store.set(key, s); return 1; }
    case "SMEMBERS": return [...(get() || [])];
    case "HSET": { const h = get() || {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; store.set(key, h); return 1; }
    case "HINCRBY": { const h = get() || {}; h[a[0]] = String(Number(h[a[0]] || 0) + Number(a[1])); store.set(key, h); return 1; }
    case "HDEL": { const h = get() || {}; a.forEach((f) => delete h[f]); store.set(key, h); return 1; }
    case "HGETALL": return Object.entries(get() || {}).flat();
    default: throw new Error("unmocked KV command " + cmd);
  }
}

// --- fake GitHub contents API ------------------------------------------------------
const repoFiles = new Map();          // path -> { content, sha }
let ghWrites = 0, ghFail = false;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://kv.test")) {
    // Run eagerly, like the real server: logUsage never reads the response.
    const results = JSON.parse(init.body).map((c) => ({ result: run(c) }));
    return { ok: true, json: async () => results };
  }
  const m = url.match(/^https:\/\/api\.github\.com\/repos\/me\/archive\/contents\/(.+)$/);
  if (m) {
    const path = m[1];
    if (!/^Bearer gh-token$/.test(init.headers.authorization)) return { ok: false, status: 401 };
    if (!init.method || init.method === "GET") {
      const f = repoFiles.get(path);
      return f ? { ok: true, status: 200, json: async () => ({ sha: f.sha }) } : { ok: false, status: 404 };
    }
    if (ghFail) return { ok: false, status: 500 };
    const body = JSON.parse(init.body);
    const existing = repoFiles.get(path);
    if (existing && body.sha !== existing.sha) return { ok: false, status: 409 };   // real API rejects a stale/missing sha
    ghWrites++;
    repoFiles.set(path, { content: Buffer.from(body.content, "base64").toString("utf8"), sha: `sha${ghWrites}` });
    return { ok: true, status: 201, json: async () => ({}) };
  }
  throw new Error("unexpected fetch " + url);
};

function call(handler, { method = "GET", query = {}, body, cookie = "", auth } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, headers, json: o }); },
      send(b) { resolve({ status: this.statusCode, headers, body: b }); },
    };
    Promise.resolve(handler({ method, query, body, headers: { cookie, "x-forwarded-for": "203.0.113.9", "user-agent": "Mozilla/5.0 test", ...(auth ? { authorization: auth } : {}) } }, res));
  });
}

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fails++; };

const DAY = 86400000;
const dayStr = (ms) => new Date(ms).toISOString().slice(0, 10);
const today = dayStr(Date.now()), yesterday = dayStr(Date.now() - DAY);

const trial = require(join(ROOT, "api/trial.js"));
const data = require(join(ROOT, "api/data.js"));
const usage = require(join(ROOT, "api/usage.js"));
const { sign } = await import(join(ROOT, "lib/trial-token.mjs"));

// --- writes: every logged event lands in all three layers -------------------------
// A pre-existing legacy event in the old capped feed (before per-day lists).
store.set("bi:events", [JSON.stringify({ c: "old-link", ev: "open", t: Date.now() - 40 * DAY, ip: "1.1.1.1" })]);

const tok = await sign({ c: "acme", s: ["*"], x: Math.floor(Date.now() / 1000) + 86400, i: Math.floor(Date.now() / 1000) }, "test-secret");
const cookie = `bi_trial=${tok}`;
await call(trial, { cookie });                                 // "open"
await call(data, { query: { f: "r1law.json" }, cookie });       // "data"
ok(store.get("bi:events").length === 3, "live feed still gets every event");
ok((store.get(`bi:ev:${today}`) || []).length === 2, "today's per-day list gets every event");
ok(ttl.get(`bi:ev:${today}`) === 92 * 86400, "per-day list expires after ~90 days");
const daily = store.get(`bi:daily:${today}`) || {};
ok(daily["acme|open"] === "1" && daily["acme|data"] === "1", "daily summary counts per client and event");
ok(!ttl.has(`bi:daily:${today}`), "daily summary never expires");

// Simulate a busy yesterday so there is a finished day to archive.
for (let i = 0; i < 3; i++) {
  const rec = JSON.stringify({ c: "acme", ev: "search", q: `q${i}`, t: Date.now() - DAY - i * 1000, ip: "203.0.113.9" });
  run(["RPUSH", `bi:ev:${yesterday}`, rec]);
  run(["HINCRBY", `bi:daily:${yesterday}`, "acme|search", "1"]);
}

// --- dashboard reads the per-day lists and the long-term table --------------------
let r = await call(usage, { query: { key: "owner" } });
ok(/Monthly activity — last 12 months/.test(r.body) && /<b>acme<\/b>/.test(r.body), "dashboard shows the monthly table");
ok(/GitHub archive not configured/.test(r.body), "dashboard says when the archive isn't set up");
r = await call(usage, { query: { key: "owner", json: "1" } });
ok(r.json.daily[today].acme.open === 1 && r.json.daily[yesterday].acme.search === 3, "JSON twin exposes daily summaries");
const acme = r.json.clients.find((c) => c.client === "acme");
ok(acme && acme.last30d.events === 5, "engagement window reads the per-day lists (5 events over 2 days)");

// --- archive: not configured -> skipped, never an error ---------------------------
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.ok && r.json.archive.status === "not_configured" && repoFiles.size === 0, "cron skips the archive when unconfigured");

// --- archive: configured ------------------------------------------------------------
process.env.ARCHIVE_GITHUB_REPO = "me/archive";
process.env.ARCHIVE_GITHUB_TOKEN = "gh-token";
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.archive.status === "ok" && r.json.archive.archived.includes(yesterday), "cron archives yesterday");
ok(!r.json.archive.archived.includes(today), "today is not archived until it is over");
const [y, m] = yesterday.split("-");
const evFile = repoFiles.get(`events/${y}/${m}/${yesterday}.jsonl`);
ok(evFile && evFile.content.trim().split("\n").length === 3, "raw events written as JSONL, one per line");
const lines = evFile.content.trim().split("\n").map((l) => JSON.parse(l));
ok(lines[0].t <= lines[1].t && lines[1].t <= lines[2].t, "...in time order");
const dailyFile = JSON.parse(repoFiles.get(`daily/${y}/${m}/${yesterday}.json`).content);
ok(dailyFile.counts.acme.search === 3, "daily counts written alongside");
const legacy = [...repoFiles.keys()].find((k) => k.startsWith("events/legacy/"));
ok(legacy && repoFiles.get(legacy).content.includes("old-link"), "one-time snapshot of the old capped log");
ok(store.get("bi:archive:last") === yesterday, "progress recorded");

// Running again does nothing new.
const writesBefore = ghWrites;
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.archive.archived.length === 0 && r.json.archive.legacy === null && ghWrites === writesBefore, "a second run the same day writes nothing");

// Re-archiving a day overwrites (needs the existing sha) instead of failing.
store.set("bi:archive:last", dayStr(Date.now() - 2 * DAY));
r = await call(usage, { query: { key: "owner", archive: "1" } });
ok(r.json.status === "ok" && r.json.archived.includes(yesterday), "manual ?archive=1 works and can overwrite a day");

// A GitHub failure stops the run without losing progress or hiding reminders.
store.set("bi:archive:last", dayStr(Date.now() - 2 * DAY));
ghFail = true;
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.ok && r.json.archive.status === "error" && store.get("bi:archive:last") === dayStr(Date.now() - 2 * DAY), "GitHub error is reported; the day is retried next run");
ghFail = false;

// Long gaps catch up a few days per run.
store.delete("bi:archive:last");
for (let d = 2; d <= 12; d++) run(["RPUSH", `bi:ev:${dayStr(Date.now() - d * DAY)}`, JSON.stringify({ c: "acme", ev: "open", t: Date.now() - d * DAY })]);
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.archive.archived.length === 5 && r.json.archive.upTo === "catching up", "a backlog is archived 5 days per run");

r = await call(usage, { query: { key: "owner" } });
ok(/archived to GitHub through/.test(r.body), "dashboard shows how far the archive has got");

console.log(fails ? `\nEVENT HISTORY TEST FAIL (${fails})` : "\nEVENT HISTORY TEST PASS");
process.exit(fails ? 1 : 0);
