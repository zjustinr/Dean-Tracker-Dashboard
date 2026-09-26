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
process.env.CRON_SECRET = "cron";

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
    case "SADD": { const s = get() || new Set(); const n = s.size; a.forEach((m) => s.add(m)); store.set(key, s); return s.size - n; }
    case "SREM": { const s = get(); if (s) a.forEach((m) => s.delete(m)); return 1; }
    case "SISMEMBER": return get() && get().has(a[0]) ? 1 : 0;
    case "SCARD": return get() ? get().size : 0;
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
function call(handler, { method = "GET", query = {}, body, cookie = "", ip = "203.0.113.5", auth } = {}) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, headers, json: o }); },
      send(b) { resolve({ status: this.statusCode, headers, body: b }); },
    };
    Promise.resolve(handler({ method, query, body, headers: { cookie, "x-forwarded-for": ip, "user-agent": "test", ...(auth ? { authorization: auth } : {}) } }, res));
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
ok(/Max-Age=7776000;/.test(setCookie), "login is a 90-day session, not the org end date");
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

// --- renewal: the org's live record decides access ---------------------------
const DAY = 86400, nowSec = () => Math.floor(Date.now() / 1000);
const orgKey = "bi:org:summitsearchsolutions.com";
const setOrg = (patch) => store.set(orgKey, JSON.stringify(Object.assign(JSON.parse(store.get(orgKey)), patch)));

setOrg({ scope: ["usnursing"] });
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 403, "narrowing the org's scope applies to existing logins");
r = await call(data, { query: { f: "usnursing.json" }, cookie });
ok(r.status === 200, "...and the new scope is granted");
setOrg({ scope: ["*"] });

setOrg({ until: nowSec() - DAY });
r = await call(trial, { cookie });
ok(r.json.status === "valid" && r.json.graceUntil === nowSec() - DAY + 14 * DAY && r.json.org === "Summit", "just past the end date: still valid, with graceUntil for the banner");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 200, "...and data still flows during grace");

setOrg({ until: nowSec() - 15 * DAY });
r = await call(trial, { cookie });
ok(r.json.status === "expired" && r.json.org === "Summit", "after grace: expired, with the org named");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 403, "...and back to the free tier in the data API");

setOrg({ until: nowSec() + 365 * DAY });
r = await call(trial, { cookie });
ok(r.json.status === "valid" && r.json.expiry === nowSec() + 365 * DAY && !r.json.graceUntil, "renewing the org restores the SAME login, no re-sign-in");

// Rolling session: an older login is re-issued on use.
const { sign } = await import(join(ROOT, "lib/trial-token.mjs"));
const oldTok = await sign({ c: "lyndi@summitsearchsolutions.com", s: [], x: nowSec() + 30 * DAY, i: nowSec() - 2 * DAY, o: "summitsearchsolutions.com" }, "test-secret");
r = await call(trial, { cookie: `bi_trial=${oldTok}` });
ok(r.json.status === "valid" && /Max-Age=7776000;/.test(r.headers["set-cookie"] || ""), "a day-old login is refreshed to a fresh 90 days");
r = await call(trial, { cookie });
ok(!r.headers["set-cookie"], "a fresh login is not re-issued on every request");

// Renewal reminders (daily cron) go to the owner, once per stage.
mail.length = 0;
r = await call(usage, { auth: "Bearer wrong" });
ok(r.status === 403 && mail.length === 0, "cron path needs CRON_SECRET");
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.ok && r.json.sent.length === 0, "nothing due a year out");
setOrg({ until: nowSec() + 20 * DAY });
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.sent[0] === "summitsearchsolutions.com:30d" && mail.length === 1, "30-day reminder sent");
ok(mail[0].to[0] === "justin.ren@gmail.com" && /ends in 20 days/.test(mail[0].subject), "...to the owner, with days left");
ok(/1 seat\(s\) taken/.test(mail[0].html) && !/key=/.test(mail[0].html), "...with usage numbers and no secret in the email");
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.sent.length === 0 && mail.length === 1, "same stage is not re-sent the next day");
setOrg({ until: nowSec() - DAY });
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.sent[0] === "summitsearchsolutions.com:ended" && /grace period/.test(mail[1].subject), "end-date reminder mentions the grace period");
setOrg({ until: nowSec() + 25 * DAY });
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.sent[0] === "summitsearchsolutions.com:30d", "a new end date re-arms the reminders");

r = await call(usage, { query: { key: "owner" } });
ok(/25 days left/.test(r.body), "dashboard shows days left");

// Removing the org now ends its members' access.
const orgBackup = store.get(orgKey);
await call(usage, { query: { key: "owner", org: "summitsearchsolutions.com", remove: "1" } });
r = await call(trial, { cookie });
ok(r.json.status === "expired", "removing the org ends access for its members");
store.set(orgKey, orgBackup);
store.get("bi:orgs").add("summitsearchsolutions.com");

// --- seats -------------------------------------------------------------------
// Save with only domain + end date: name and scope-independent fields are kept.
await call(usage, { query: { key: "owner", org: "summitsearchsolutions.com", scope: "all", until: "2099-09-30", seats: "2" } });
ok(JSON.parse(store.get(orgKey)).seats === 2 && JSON.parse(store.get(orgKey)).label === "Summit", "seats saved; blank name keeps the current one");
await call(usage, { query: { key: "owner", org: "summitsearchsolutions.com", scope: "all", until: "2099-10-31" } });
ok(JSON.parse(store.get(orgKey)).seats === 2, "renewing with blank seats keeps the seat count");

async function signUp(email) {
  const before = mail.length;
  const req = await call(trial, { method: "POST", query: { action: "signup" }, body: { email }, ip: `192.0.2.${mail.length}` });
  if (!req.json.ok) return { request: req.json };
  const c = mail[before].html.match(/verify=([A-Za-z0-9_-]+)/)[1];
  const v = await call(trial, { method: "POST", query: { verify: c } });
  return { request: req.json, location: v.headers.location, cookie: (v.headers["set-cookie"] || "").split(";")[0] };
}
const second = await signUp("colleague@summitsearchsolutions.com");
ok(second.location === "/?signup=ok", "second seat (of 2) can sign up");
const third = await signUp("third@summitsearchsolutions.com");
ok(third.request.error === "no_seats" && !third.location, "third person is refused when seats are full, and no email is sent");
const again = await signUp("lyndi@summitsearchsolutions.com");
ok(again.location === "/?signup=ok", "an existing member can always sign in again when full");

// Race: a code requested while a seat was free, verified after it filled.
await call(usage, { query: { key: "owner", org: "summitsearchsolutions.com", scope: "all", until: "2099-10-31", seats: "3" } });
const pendingBefore = mail.length;
await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "late@summitsearchsolutions.com" }, ip: "192.0.2.200" });
const lateCode = mail[pendingBefore].html.match(/verify=([A-Za-z0-9_-]+)/)[1];
const fourth = await signUp("fourth@summitsearchsolutions.com");
ok(fourth.location === "/?signup=ok", "last seat taken by someone else first");
r = await call(trial, { method: "POST", query: { verify: lateCode } });
ok(r.headers.location === "/?signup=full" && !store.get("bi:org-users:summitsearchsolutions.com").has("late@summitsearchsolutions.com"), "a pending link can't overfill the seats");

// Freeing a seat ends that person's access and lets someone else in.
await call(usage, { query: { key: "owner", unseat: "colleague@summitsearchsolutions.com" } });
r = await call(trial, { cookie: second.cookie });
ok(r.json.status === "expired" && !r.json.org, "removed person loses access (no renewal banner)");
r = await call(data, { query: { f: "r1law.json" }, cookie: second.cookie });
ok(r.status === 403, "...in the data API too");
r = await call(trial, { cookie });
ok(r.json.status === "valid", "other members are unaffected");
const replacement = await signUp("third@summitsearchsolutions.com");
ok(replacement.location === "/?signup=ok", "the freed seat can be taken by someone new");

r = await call(usage, { query: { key: "owner" } });
ok(/3 \/ 3 seats/.test(r.body) && /unseat=/.test(r.body), "dashboard shows seats used and a Remove link");
r = await call(usage, { query: { key: "owner", json: "1" } });
ok(r.json.orgs[0].seats === 3 && r.json.orgs[0].seatsUsed === 3, "JSON twin reports seats");
await call(usage, { query: { key: "owner", org: "summitsearchsolutions.com", scope: "all", until: "2099-10-31", seats: "0" } });
ok(JSON.parse(store.get(orgKey)).seats === null, "seats 0 = unlimited");

// Rate limit per email.
for (let i = 0; i < 3; i++) await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "spam@summitsearchsolutions.com" }, ip: `198.51.100.${i}` });
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "spam@summitsearchsolutions.com" }, ip: "198.51.100.9" });
ok(r.status === 429, "4th request for one email within an hour is rate-limited");

console.log(fails ? `\nSIGNUP TEST FAIL (${fails})` : "\nSIGNUP TEST PASS");
process.exit(fails ? 1 : 0);
