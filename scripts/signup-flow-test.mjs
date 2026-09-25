#!/usr/bin/env node
// Work-email signup, end to end, against an in-memory KV and a fake Resend.
//
// Drives api/trial.js (request -> emailed link -> confirm page -> verify ->
// cookie -> status), then checks the per-person and per-domain block switches
// in api/trial.js and api/data.js and the org form in api/usage.js.
//
//   node scripts/signup-flow-test.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

process.env.TRIAL_SECRET = "test-secret";
process.env.KV_REST_API_URL = "https://kv.test";
process.env.KV_REST_API_TOKEN = "t";
process.env.RESEND_API_KEY = "re_test";
process.env.USAGE_SECRET = "owner";

// --- in-memory KV speaking the Upstash /pipeline dialect --------------------
const store = new Map();
const ttl = new Map();
function run([cmd, key, ...a]) {
  const get = () => store.get(key);
  switch (cmd) {
    case "GET": return get() ?? null;
    case "SET": {
      if (a.includes("NX") && store.has(key)) return null;
      store.set(key, a[0]);
      const ex = a.indexOf("EX"); if (ex >= 0) ttl.set(key, Number(a[ex + 1]));
      return "OK";
    }
    case "DEL": return store.delete(key) ? 1 : 0;
    case "INCR": { const n = Number(get() || 0) + 1; store.set(key, String(n)); return n; }
    case "SADD": { const s = get() || new Set(); a.forEach((m) => s.add(m)); store.set(key, s); return 1; }
    case "SREM": { const s = get(); if (s) a.forEach((m) => s.delete(m)); return 1; }
    case "SMEMBERS": return [...(get() || [])];
    case "HSET": { const h = get() || {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; store.set(key, h); return 1; }
    case "HSETNX": { const h = get() || {}; if (!(a[0] in h)) h[a[0]] = a[1]; store.set(key, h); return 1; }
    case "HINCRBY": { const h = get() || {}; h[a[0]] = String(Number(h[a[0]] || 0) + Number(a[1])); store.set(key, h); return 1; }
    case "HGETALL": return Object.entries(get() || {}).flat();
    case "LPUSH": { const l = get() || []; l.unshift(...a); store.set(key, l); return l.length; }
    case "LTRIM": return "OK";
    case "LRANGE": return get() || [];
    default: throw new Error("unmocked KV command " + cmd);
  }
}
const mail = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith("https://kv.test")) {
    const cmds = JSON.parse(init.body);
    return { ok: true, json: async () => cmds.map((c) => ({ result: run(c) })) };
  }
  if (String(url) === "https://api.resend.com/emails") { mail.push(JSON.parse(init.body)); return { ok: true }; }
  throw new Error("unexpected fetch " + url);
};

// --- minimal req/res ---------------------------------------------------------
function call(handler, { method = "GET", query = {}, body, cookie = "", ip = "203.0.113.5" } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, headers, json: o }); },
      send(b) { resolve({ status: this.statusCode, headers, body: b }); },
    };
    Promise.resolve(handler({ method, query, body, headers: { cookie, "x-forwarded-for": ip, "user-agent": "test" } }, res));
  });
}

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fails++; };

const trial = require(join(ROOT, "api/trial.js"));
const usage = require(join(ROOT, "api/usage.js"));
const data = require(join(ROOT, "api/data.js"));

// Owner enrolls the domain with a shared end date.
let r = await call(usage, { query: { key: "owner", org: "SummitSearchSolutions.com", label: "Summit", scope: "all", until: "2099-09-30" } });
ok(r.status === 302, "owner can enroll an org");
const org = JSON.parse(store.get("bi:org:summitsearchsolutions.com"));
ok(org.scope[0] === "*" && org.until === Date.parse("2099-09-30T23:59:59Z") / 1000, "org stored with wildcard scope and shared end date");
r = await call(usage, { query: { key: "owner", org: "x.com", until: "2001-01-01" } });
ok(r.status === 400, "past end date rejected");

// Outside domain is refused, and nothing is emailed.
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "someone@gmail.com" } });
ok(r.json.ok === false && r.json.error === "not_eligible" && mail.length === 0, "non-enrolled domain is refused");
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "not an email" } });
ok(r.status === 400, "malformed email rejected");

// Enrolled person requests a link.
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "  Lyndi@SummitSearchSolutions.com " } });
ok(r.json.ok === true && mail.length === 1, "enrolled email gets a sign-in email");
ok(mail[0].to[0] === "lyndi@summitsearchsolutions.com", "address is normalised");
const code = mail[0].html.match(/verify=([A-Za-z0-9_-]+)/)[1];
ok([...ttl.entries()].some(([k, v]) => k.startsWith("bi:signup:") && v === 900), "code expires in 15 minutes");

// A mail scanner's GET must not spend the code.
r = await call(trial, { method: "GET", query: { verify: code } });
ok(r.status === 200 && /<form method="post"/.test(r.body), "GET renders a confirm button");
ok([...store.keys()].some((k) => k.startsWith("bi:signup:")), "...and does not consume the code");

// Confirming mints a token bound to the person, expiring on the org date.
r = await call(trial, { method: "POST", query: { verify: code } });
ok(r.status === 303 && r.headers.location === "/?signup=ok", "POST verifies and redirects");
const setCookie = r.headers["set-cookie"];
ok(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie), "cookie is HttpOnly + Secure");
const cookie = setCookie.split(";")[0];
r = await call(trial, { method: "POST", query: { verify: code } });
ok(r.headers.location === "/?signup=expired", "code works only once");

r = await call(trial, { cookie });
ok(r.json.status === "valid" && r.json.client === "lyndi@summitsearchsolutions.com", "status is valid, client = email");
ok(r.json.expiry === org.until, "expiry is the org's shared end date");
ok(store.get("bi:org-users:summitsearchsolutions.com").has("lyndi@summitsearchsolutions.com"), "user recorded under org");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 200, "signed-up user can open a non-free index");

// Per-person block.
await call(usage, { query: { key: "owner", block: "lyndi@summitsearchsolutions.com" } });
r = await call(trial, { cookie });
ok(r.json.status === "expired", "blocking the email cuts that person off");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 403, "...in the data API too");
await call(usage, { query: { key: "owner", unblock: "lyndi@summitsearchsolutions.com" } });

// Domain block cuts off existing tokens and new signups.
await call(usage, { query: { key: "owner", block: "@summitsearchsolutions.com" } });
r = await call(trial, { cookie });
ok(r.json.status === "expired", "blocking @domain cuts off already-issued tokens");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 403, "...in the data API too");
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "colleague@summitsearchsolutions.com" } });
ok(r.json.error === "not_eligible", "...and stops new signups");
await call(usage, { query: { key: "owner", unblock: "@summitsearchsolutions.com" } });

// Dashboard renders the org section.
r = await call(usage, { query: { key: "owner" } });
ok(/Organizations — work-email signup/.test(r.body) && r.body.includes("lyndi@summitsearchsolutions.com"), "usage page lists org and user");
r = await call(usage, { query: { key: "owner", json: "1" } });
ok(r.json.orgs[0].users[0].email === "lyndi@summitsearchsolutions.com", "JSON twin includes orgs");

// Rate limit per email.
for (let i = 0; i < 3; i++) await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "spam@summitsearchsolutions.com" }, ip: `198.51.100.${i}` });
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "spam@summitsearchsolutions.com" }, ip: "198.51.100.9" });
ok(r.status === 429, "4th request for one email within an hour is rate-limited");

console.log(fails ? `\nSIGNUP TEST FAIL (${fails})` : "\nSIGNUP TEST PASS");
process.exit(fails ? 1 : 0);
