#!/usr/bin/env node
// Stripe webhook: a paid checkout mints a 24-hour, all-indices day pass.
//
// Signs a checkout.session.completed event the way Stripe does, drives
// api/stripe-webhook.js, then checks the emailed token against api/data.js.
//
//   node scripts/stripe-webhook-test.mjs
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

Object.assign(process.env, {
  STRIPE_WEBHOOK_SECRET: "whsec_test", TRIAL_SECRET: "test-secret", RESEND_API_KEY: "re_test",
  KV_REST_API_URL: "https://kv.test", KV_REST_API_TOKEN: "t",
});

const store = new Map();
const mail = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith("https://kv.test")) {
    const results = JSON.parse(init.body).map(([cmd, key, ...a]) => {
      if (cmd === "SET") { if (a.includes("NX") && store.has(key)) return { result: null }; store.set(key, a[0]); return { result: "OK" }; }
      if (cmd === "GET") return { result: store.get(key) ?? null };
      return { result: null };
    });
    return { ok: true, json: async () => results };
  }
  if (url === "https://api.resend.com/emails") { mail.push(JSON.parse(init.body)); return { ok: true }; }
  throw new Error("unexpected fetch " + url);
};

function signedRequest(event, secret = "whsec_test") {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  const req = Readable.from([Buffer.from(body)]);
  Object.assign(req, { method: "POST", headers: { "stripe-signature": `t=${t},v1=${sig}` }, query: {} });
  return req;
}
function call(handler, req) {
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

const webhook = require(join(ROOT, "api/stripe-webhook.js"));
const data = require(join(ROOT, "api/data.js"));
const event = { type: "checkout.session.completed", data: { object: { id: "cs_test_1", customer_details: { email: "Buyer@Example.com" } } } };

let r = await call(webhook, signedRequest(event, "whsec_wrong"));
ok(r.status === 400 && mail.length === 0, "unsigned/forged event is rejected");

r = await call(webhook, signedRequest(event));
ok(r.json.ok && r.json.emailed && mail.length === 1, "paid checkout emails an access link");
const token = mail[0].html.match(/\?k=([\w.-]+)/)[1];
const payload = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
ok(payload.c === "buyer@example.com", "pass is tagged with the buyer's email");
ok(JSON.stringify(payload.s) === '["*"]', "pass covers every index, including future ones");
ok(payload.x - payload.i === 86400, "pass lasts 24 hours");
ok(/every Baton Index index/.test(mail[0].html) && !/R1 Provost/.test(mail[0].html), "email describes all-index access");

// The token really opens non-free indices, including ones outside the old 3.
for (const f of ["r1law.json", "usnursing.json", "r1provost.json"]) {
  r = await call(data, { query: { f }, headers: { cookie: `bi_trial=${token}` } });
  ok(r.status === 200, `day pass opens ${f}`);
}

r = await call(webhook, signedRequest(event));
ok(r.json.skipped === "duplicate" && mail.length === 1, "a redelivered event doesn't issue a second pass");

console.log(fails ? `\nSTRIPE WEBHOOK TEST FAIL (${fails})` : "\nSTRIPE WEBHOOK TEST PASS");
process.exit(fails ? 1 : 0);
