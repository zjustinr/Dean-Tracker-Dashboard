// Baton Index — Stripe webhook: auto-issue the $99 day pass on payment.
//
// Closes the gap FreeTierMeter.tsx's own comment calls out ("automatic pass
// issuance after payment... is the planned v2"): today a day-pass buyer pays
// via the Stripe Payment Link, then has to wait for a human to notice and
// hand-mint a token. This listens for checkout.session.completed, mints the
// same "day" tier scripts/mint-trial.mjs would (keep TIER in sync with that
// file's TIERS.day if it ever changes), and emails the access link.
//
// Unlike the rest of the usage-logging endpoints, this one fails CLOSED, not
// open: it mints real paid access as a side effect, so an unconfigured or
// unverifiable request must be rejected, never silently accepted.
//
// Setup (manual, one-time, in the Stripe Dashboard):
//   Developers -> Webhooks -> Add endpoint -> https://batonindex.com/api/stripe-webhook
//   Event: checkout.session.completed
//   Copy the resulting signing secret into Vercel as STRIPE_WEBHOOK_SECRET.
//
// Self-contained CommonJS (no `stripe` SDK, no `raw-body` package -- plain
// crypto + a manual stream read), mirroring the rest of api/*.js.
const crypto = require("crypto");

// Must match scripts/mint-trial.mjs's TIERS.day exactly, or a webhook-minted
// link would grant different access than one minted by hand.
const DAY_TIER_SCOPE = ["r1bschool", "r1university", "r1provost"];
const DAY_TIER_DAYS = 1;
const DOMAIN = (process.env.BI_DOMAIN || "https://batonindex.com").replace(/\/+$/, "");
const SIG_TOLERANCE_SEC = 5 * 60; // reject replayed webhooks older than this

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Stripe-Signature: "t=<unix>,v1=<hex hmac>[,v0=...]" -- HMAC-SHA256 of
// "<t>.<rawBody>" with the endpoint's signing secret. See Stripe's docs on
// verifying webhook signatures; reimplemented here rather than pulling in
// the `stripe` SDK to keep this build's dependency footprint at zero, same
// as the rest of this project's api/*.js functions.
function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; }),
  );
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > SIG_TOLERANCE_SEC) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Trial-token signing, matching lib/trial-token.mjs's format exactly (Node
// crypto instead of Web Crypto, same as api/data.js/api/trial.js's verify()
// side of this same token scheme).
function b64urlEncode(str) { return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function hmacToken(secret, msg) { return crypto.createHmac("sha256", secret).update(msg).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function mintDayPassToken(client, secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + DAY_TIER_DAYS * 86400;
  const payload = { c: client, s: DAY_TIER_SCOPE, x: expSec, i: nowSec };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = hmacToken(secret, body);
  return { token: `${body}.${sig}`, expSec };
}

async function kv(commands) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return null;
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
    if (!r.ok) return null;
    return (await r.json()).map((x) => x.result);
  } catch { return null; }
}

async function sendPassEmail(to, link, expiryISO) {
  const RESEND_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_KEY) { console.log(`stripe-webhook: RESEND_API_KEY unset -- day pass for ${to} not emailed. Link: ${link}`); return false; }
  const FROM = process.env.FEATURE_REQUEST_FROM || "Baton Index <alerts@batonindex.com>";
  const html = `
    <p>Thanks for your Baton Index day pass — you're all set.</p>
    <p><a href="${link}">${link}</a></p>
    <p style="color:#5B6B7B;font-size:13px">Access expires ${expiryISO}. Covers R1 Business, R1 Presidents, and R1 Provost.</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: "Your Baton Index day pass", html }),
    });
    return r.ok;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const trialSecret = process.env.TRIAL_SECRET;
  if (!webhookSecret || !trialSecret) {
    // Fail closed: this endpoint mints real access, so "not configured" must
    // not be treated as "let it through."
    console.error("stripe-webhook: STRIPE_WEBHOOK_SECRET or TRIAL_SECRET not set; refusing to process.");
    res.status(500).json({ ok: false, error: "not_configured" });
    return;
  }

  const rawBody = await readRawBody(req);
  if (!verifyStripeSignature(rawBody, req.headers["stripe-signature"], webhookSecret)) {
    res.status(400).json({ ok: false, error: "bad_signature" });
    return;
  }

  let event;
  try { event = JSON.parse(rawBody.toString("utf8")); } catch { res.status(400).json({ ok: false, error: "bad_json" }); return; }

  // Acknowledge every event type quickly; only checkout.session.completed
  // triggers issuance. Stripe retries on non-2xx, so unhandled types still
  // get a 200.
  if (event.type !== "checkout.session.completed") { res.status(200).json({ ok: true, ignored: event.type }); return; }

  const session = event.data && event.data.object;
  const email = (session && (session.customer_details?.email || session.customer_email) || "").trim().toLowerCase();
  const sessionId = session && session.id;
  if (!email || !sessionId) { res.status(200).json({ ok: true, skipped: "no_email_or_session" }); return; }

  // Idempotency: Stripe redelivers on any non-2xx or timeout, and can send
  // the same event more than once even on success. SET...NX only succeeds
  // the first time this session is seen.
  const seen = await kv([["SET", `bi:stripe-seen:${sessionId}`, "1", "NX", "EX", "2592000"]]);
  if (seen && seen[0] !== "OK") { res.status(200).json({ ok: true, skipped: "duplicate" }); return; }

  const { token, expSec } = mintDayPassToken(email, trialSecret);
  const link = `${DOMAIN}/?k=${token}`;
  const expiryISO = new Date(expSec * 1000).toISOString().slice(0, 10);

  const emailed = await sendPassEmail(email, link, expiryISO);

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  await kv([
    ["LPUSH", "bi:events", JSON.stringify({ c: email, ev: "daypass-issued", f: emailed ? "emailed" : "email-failed", t, ip })],
    ["LTRIM", "bi:events", "0", "1999"],
    ["SADD", "bi:clients", email],
    ["HSET", `bi:client:${email}`, "last", String(t), "lastEvent", "daypass-issued"],
    ["HINCRBY", `bi:client:${email}`, "hits", "1"],
  ]);

  res.status(200).json({ ok: true, emailed });
};

module.exports.config = { api: { bodyParser: false } };
