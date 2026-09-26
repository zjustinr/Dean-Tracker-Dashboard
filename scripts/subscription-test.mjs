#!/usr/bin/env node
// Monthly Pass ($99/month subscription), end to end: signed Stripe events ->
// api/stripe-webhook.js -> bi:sub:<email> -> sign-in -> live access in
// api/trial.js + api/data.js, through renewal, cancellation, failed payment
// and the end of the subscription.
//
//   node scripts/subscription-test.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

Object.assign(process.env, {
  STRIPE_WEBHOOK_SECRET: "whsec_test", TRIAL_SECRET: "test-secret", RESEND_API_KEY: "re_test",
  KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "t", USAGE_SECRET: "owner", CRON_SECRET: "cron",
});

// --- in-memory KV (runs eagerly, like the real server) ---------------------------
const store = new Map();
function run([cmd, key, ...a]) {
  const get = () => store.get(key);
  switch (cmd) {
    case "GET": return get() ?? null;
    case "SET": if (a.includes("NX") && store.has(key)) return null; store.set(key, a[0]); return "OK";
    case "DEL": return store.delete(key) ? 1 : 0;
    case "INCR": { const n = Number(get() || 0) + 1; store.set(key, String(n)); return n; }
    case "EXPIRE": return 1;
    case "LPUSH": { const l = get() || []; l.unshift(...a); store.set(key, l); return l.length; }
    case "RPUSH": { const l = get() || []; l.push(...a); store.set(key, l); return l.length; }
    case "LTRIM": return "OK";
    case "LRANGE": return get() || [];
    case "SADD": { const s = get() || new Set(); const n = s.size; a.forEach((m) => s.add(m)); store.set(key, s); return s.size - n; }
    case "SREM": { const s = get(); if (s) a.forEach((m) => s.delete(m)); return 1; }
    case "SISMEMBER": return get() && get().has(a[0]) ? 1 : 0;
    case "SCARD": return get() ? get().size : 0;
    case "SMEMBERS": return [...(get() || [])];
    case "HSET": { const h = get() || {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = a[i + 1]; store.set(key, h); return 1; }
    case "HSETNX": { const h = get() || {}; if (!(a[0] in h)) h[a[0]] = a[1]; store.set(key, h); return 1; }
    case "HGET": return (get() || {})[a[0]] ?? null;
    case "HINCRBY": { const h = get() || {}; h[a[0]] = String(Number(h[a[0]] || 0) + Number(a[1])); store.set(key, h); return 1; }
    case "HDEL": { const h = get() || {}; a.forEach((f) => delete h[f]); store.set(key, h); return 1; }
    case "HGETALL": return Object.entries(get() || {}).flat();
    default: throw new Error("unmocked KV command " + cmd);
  }
}
const mail = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://kv.test")) {
    const results = JSON.parse(init.body).map((c) => ({ result: run(c) }));
    return { ok: true, json: async () => results };
  }
  if (url === "https://api.resend.com/emails") { mail.push(JSON.parse(init.body)); return { ok: true }; }
  throw new Error("unexpected fetch " + url);
};

function stripe(type, object, id = `evt_${crypto.randomBytes(6).toString("hex")}`) {
  const body = JSON.stringify({ id, type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, query: {} });
  return req;
}
function call(handler, req) {
  if (!(req instanceof Readable)) {
    const { method = "GET", query = {}, body, cookie = "", ip = "203.0.113.7", auth } = req;
    req = { method, query, body, headers: { cookie, "x-forwarded-for": ip, "user-agent": "test", ...(auth ? { authorization: auth } : {}) } };
  }
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      status(c) { this.statusCode = c; return this; },
      json(o) { resolve({ status: this.statusCode, headers, json: o }); },
      send(b) { resolve({ status: this.statusCode, headers, body: b }); },
    };
    Promise.resolve(handler(req, res));
  });
}

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? "✓" : "✗"} ${msg}`); if (!cond) fails++; };
const now = () => Math.floor(Date.now() / 1000);
const DAY = 86400;

const webhook = require(join(ROOT, "api/stripe-webhook.js"));
const trial = require(join(ROOT, "api/trial.js"));
const data = require(join(ROOT, "api/data.js"));
const usage = require(join(ROOT, "api/usage.js"));
const EMAIL = "pat@example.com";
const subRec = () => JSON.parse(store.get(`bi:sub:${EMAIL}`));

// --- 1. checkout ------------------------------------------------------------------
let r = await call(webhook, stripe("checkout.session.completed", { id: "cs_sub_1", mode: "subscription", subscription: "sub_1", customer: "cus_1", customer_details: { email: "Pat@Example.com" } }));
ok(r.json.ok && r.json.subscription && r.json.emailed, "subscription checkout is accepted and emails a sign-in link");
ok(subRec().status === "active" && subRec().provisional && subRec().until > now() + 31 * DAY, "access starts at once (provisional until the first invoice)");
ok(store.get("bi:sub-id:sub_1") === EMAIL && store.get("bi:subs").has(EMAIL), "subscription id maps back to the email");
ok(!/\?k=/.test(mail[0].html) && /verify=/.test(mail[0].html), "no day pass is issued — a sign-in link instead");
ok(/monthly pass/i.test(mail[0].html) && /24 hours/.test(mail[0].html), "email mentions the monthly pass and a 24-hour link");

// --- 2. sign in from that email -------------------------------------------------------
const code = mail[0].html.match(/verify=([\w-]+)/)[1];
r = await call(trial, { query: { verify: code } });
ok(/name="firstName"/.test(r.body), "first sign-in asks for a name");
r = await call(trial, { method: "POST", query: { verify: code }, body: { firstName: "Pat", lastName: "Lee" } });
ok(r.headers.location === "/?signup=ok" && /HttpOnly/.test(r.headers["set-cookie"]), "subscriber signs in");
const cookie = r.headers["set-cookie"].split(";")[0];
r = await call(trial, { cookie });
ok(r.json.status === "valid" && r.json.plan === "sub" && r.json.scope[0] === "*" && !r.json.org, "status: valid, Monthly pass, every index, no firm banner");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 200, "subscriber can open a non-free index");

// --- 3. first invoice sets the real period end --------------------------------------
const periodEnd = now() + 30 * DAY;
const paid = { customer: "cus_1", customer_email: "pat@example.com", parent: { subscription_details: { subscription: "sub_1" } }, lines: { data: [{ period: { start: now(), end: periodEnd } }] } };
r = await call(webhook, stripe("invoice.paid", paid, "evt_paid_1"));
ok(r.json.subscription === "active" && subRec().until === periodEnd && !subRec().provisional, "invoice.paid sets access to the paid period's end");
r = await call(webhook, stripe("invoice.paid", paid, "evt_paid_1"));
ok(r.json.skipped === "duplicate", "a redelivered billing event is ignored");

// Older API shape: subscription id directly on the invoice, no email.
const nextEnd = periodEnd + 30 * DAY;
r = await call(webhook, stripe("invoice.paid", { customer: "cus_1", subscription: "sub_1", lines: { data: [{ period: { start: periodEnd, end: nextEnd } }] } }));
ok(subRec().until === nextEnd, "renewal extends access (older invoice shape, email looked up by subscription id)");

r = await call(trial, { query: { action: "account" }, cookie });
ok(r.json.plan.kind === "sub" && r.json.plan.renews === true && r.json.plan.expiry === nextEnd && r.json.firstName === "Pat", "account: Monthly pass, renews on the paid-through date");

// --- 4. signing in again later via /?join ---------------------------------------------
mail.length = 0;
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "pat@example.com" } });
ok(r.json.ok && mail.length === 1 && /Hi Pat,/.test(mail[0].html) && /15 minutes/.test(mail[0].html), "a subscriber can request a new sign-in link at /?join");
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: "stranger@example.com" } });
ok(r.json.error === "not_eligible", "an email with no plan is refused");

// --- 5. cancellation at period end, then failed card ---------------------------------
await call(webhook, stripe("customer.subscription.updated", { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: true }));
r = await call(trial, { query: { action: "account" }, cookie });
ok(r.json.plan.renews === false && r.json.plan.state === "active", "cancel at period end: still active, shown as not renewing");
await call(webhook, stripe("customer.subscription.updated", { id: "sub_1", customer: "cus_1", status: "active", cancel_at_period_end: false }));

await call(webhook, stripe("invoice.payment_failed", { customer: "cus_1", customer_email: EMAIL, subscription: "sub_1", lines: { data: [] } }));
ok(subRec().status === "past_due", "failed payment marks the pass past due");
store.set(`bi:sub:${EMAIL}`, JSON.stringify(Object.assign(subRec(), { until: now() - DAY })));   // period ran out while retrying
r = await call(trial, { cookie });
ok(r.json.status === "valid" && r.json.graceUntil === subRec().until + 14 * DAY, "while Stripe retries: grace period, access continues");
r = await call(trial, { query: { action: "account" }, cookie });
ok(r.json.plan.paymentProblem === true && r.json.plan.state === "grace", "account flags the payment problem");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 200, "data still flows during grace");

// --- 6. subscription ends ------------------------------------------------------------
// The paid period already ran out during the retries above, so deletion must
// keep that earlier end (never extend it to ended_at) and remove the grace.
const lapsedUntil = subRec().until;
r = await call(webhook, stripe("customer.subscription.deleted", { id: "sub_1", customer: "cus_1", status: "canceled", ended_at: now() - 60 }));
ok(subRec().status === "canceled" && subRec().until === lapsedUntil, "deletion ends the pass (keeps the earlier end, no extension)");
r = await call(trial, { cookie });
ok(r.json.status === "expired" && !r.json.org, "after it ends: expired, no grace for a cancelled pass");
r = await call(data, { query: { f: "r1law.json" }, cookie });
ok(r.status === 403, "...and back to the free tier");
r = await call(trial, { method: "POST", query: { action: "signup" }, body: { email: EMAIL } });
ok(r.json.error === "not_eligible", "an ended subscriber can't get a sign-in link");

// A cancel-at-period-end deletion never shortens paid time.
const paidUntil = now() + 5 * DAY;
store.set(`bi:sub:${EMAIL}`, JSON.stringify(Object.assign(subRec(), { status: "active", until: paidUntil })));
await call(webhook, stripe("customer.subscription.deleted", { id: "sub_1", status: "canceled", ended_at: paidUntil + 3600 }));
ok(subRec().until === paidUntil, "a deletion never extends access beyond what was paid");
await call(webhook, stripe("customer.subscription.deleted", { id: "sub_1", status: "canceled", ended_at: paidUntil }));
ok(subRec().until === paidUntil && subRec().status === "canceled", "a deletion at period end keeps the paid days");

// --- 7. owner view ---------------------------------------------------------------------
r = await call(usage, { query: { key: "owner" } });
ok(/Monthly pass subscribers/.test(r.body) && r.body.includes(EMAIL) && r.body.includes("Pat Lee"), "usage page lists subscribers");
r = await call(usage, { query: { key: "owner", json: "1" } });
ok(r.json.subscribers[0].email === EMAIL && r.json.subscribers[0].status === "canceled", "JSON view includes subscribers");

// --- 8. the day pass still works alongside -------------------------------------------------
mail.length = 0;
r = await call(webhook, stripe("checkout.session.completed", { id: "cs_day_1", mode: "payment", customer_details: { email: "dayer@example.com" } }));
ok(r.json.ok && r.json.emailed && /\?k=/.test(mail[0].html) && !store.get("bi:sub:dayer@example.com"), "a one-time checkout is still a day pass, not a subscription");

// --- 9. firm plan arrives / ends while someone has their own pass ---------------------
const tokenClaims = (setCookie) => JSON.parse(Buffer.from(decodeURIComponent(setCookie.split(";")[0].split("=")[1]).split(".")[0], "base64url").toString());
async function subscribe(email, subId) {
  mail.length = 0;
  await call(webhook, stripe("checkout.session.completed", { id: `cs_${subId}`, mode: "subscription", subscription: subId, customer: `cus_${subId}`, customer_details: { email } }));
  await call(webhook, stripe("invoice.paid", { customer_email: email, subscription: subId, lines: { data: [{ period: { end: now() + 30 * DAY } }] } }));
  const c = mail[0].html.match(/verify=([\w-]+)/)[1];
  const v = await call(trial, { method: "POST", query: { verify: c }, body: { firstName: "A", lastName: "B" } });
  return v.headers["set-cookie"].split(";")[0];
}
const AMY = "amy@acme.com";
let amy = await subscribe(AMY, "sub_amy");
r = await call(trial, { cookie: amy });
ok(r.json.plan === "sub", "Amy starts on her own Monthly Pass");

await call(usage, { query: { key: "owner", org: "acme.com", label: "Acme", scope: "all", until: "2099-01-31", seats: "2" } });
r = await call(trial, { cookie: amy });
ok(r.json.status === "valid" && r.json.plan === "org" && r.json.org === "Acme", "firm enrolls: Amy is moved onto the firm plan on her next visit");
ok(store.get("bi:org-users:acme.com").has(AMY) && tokenClaims(r.headers["set-cookie"]).o === "acme.com", "...taking a seat, with her login re-issued as a firm login");
amy = r.headers["set-cookie"].split(";")[0];
ok(r.json.overlap === true, "...and flagged as still paying for her own pass");
r = await call(trial, { query: { action: "account" }, cookie: amy });
ok(r.json.plan.kind === "org" && r.json.plan.overlap === true && r.json.plan.renews === null, "account: firm plan, with the 'cancel your Monthly Pass' notice");

mail.length = 0;
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.overlaps.alerted === 1 && mail.some((m) => m.subject.includes("covered by a firm plan") && m.html.includes(AMY)), "daily job emails the owner about the double charge");
r = await call(usage, { auth: "Bearer cron" });
ok(r.json.overlaps.alerted === 0, "...once");
r = await call(usage, { query: { key: "owner" } });
ok(/also covered by Acme — cancel in Stripe/.test(r.body), "usage page flags the overlap");

// She cancels her own pass at period end: no longer an overlap.
await call(webhook, stripe("customer.subscription.updated", { id: "sub_amy", status: "active", cancel_at_period_end: true }));
r = await call(trial, { cookie: amy });
ok(r.json.plan === "org" && !r.json.overlap, "after she cancels her own pass, only the firm plan remains");
await call(webhook, stripe("customer.subscription.updated", { id: "sub_amy", status: "active", cancel_at_period_end: false }));

// Firm plan ends: her own pass carries on, no sign-in needed.
const orgKey = "bi:org:acme.com";
const setOrg = (patch) => store.set(orgKey, JSON.stringify(Object.assign(JSON.parse(store.get(orgKey)), patch)));
setOrg({ until: now() - 20 * DAY });
r = await call(trial, { cookie: amy });
ok(r.json.status === "valid" && r.json.plan === "sub", "firm plan ends: she carries on with her own Monthly Pass");
r = await call(data, { query: { f: "r1law.json" }, cookie: amy });
ok(r.status === 200, "...with full access");
setOrg({ until: now() - DAY });
r = await call(trial, { cookie: amy });
ok(r.json.plan === "sub" && !r.json.graceUntil, "an active own pass beats a firm plan that's only in grace");
setOrg({ until: now() + 365 * DAY });

// The owner removes her from the firm: never moved back automatically.
await call(usage, { query: { key: "owner", unseat: AMY } });
r = await call(trial, { cookie: amy });
ok(r.json.status === "valid" && r.json.plan === "sub" && !store.get("bi:org-users:acme.com").has(AMY), "removed from the firm: stays on her own pass, not re-added");

// A full firm doesn't absorb a subscriber.
const bob = await subscribe("bob@acme.com", "sub_bob");
store.get("bi:org-users:acme.com").add("carol@acme.com").add("dan@acme.com");
r = await call(trial, { cookie: bob });
ok(r.json.plan === "sub" && !store.get("bi:org-users:acme.com").has("bob@acme.com"), "firm at its seat limit: Bob stays on his own pass");

// Firm ended and her own pass cancelled: expired, with the firm named (UI offers the Monthly Pass).
store.get("bi:org-users:acme.com").add(AMY);
store.set(`bi:sub:${AMY}`, JSON.stringify(Object.assign(JSON.parse(store.get(`bi:sub:${AMY}`)), { status: "canceled", until: now() - DAY })));
setOrg({ until: now() - 20 * DAY });
r = await call(trial, { cookie: amy });
ok(r.json.status === "expired" && r.json.org === "Acme", "both ended: expired, firm named for the 'continue on your own' offer");

console.log(fails ? `\nSUBSCRIPTION TEST FAIL (${fails})` : "\nSUBSCRIPTION TEST PASS");
process.exit(fails ? 1 : 0);
