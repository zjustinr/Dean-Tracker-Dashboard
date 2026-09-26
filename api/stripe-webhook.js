// Baton Index — Stripe webhook: issues the $49 day pass on payment, and keeps
// $99/month subscriptions (the Monthly pass) in sync with Stripe billing.
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
//   Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
//           customer.subscription.updated, customer.subscription.deleted
//   Copy the resulting signing secret into Vercel as STRIPE_WEBHOOK_SECRET.
//
// Monthly pass. A subscription's state lives at bi:sub:<email>
//   { email, status: active|past_due|canceled, until, cancelAtPeriodEnd,
//     subscription, customer, provisional, createdAt, updatedAt }
// and is read live by api/trial.js + api/data.js (liveAccess), so a renewal,
// failed card or cancellation takes effect on the subscriber's next request.
// bi:sub-id:<subscription id> maps back to the email, because later billing
// events carry the subscription id but not always the email.
//   checkout (mode=subscription) -> provisional 32-day record + sign-in email
//   invoice.paid                 -> until = end of the paid period, active
//   invoice.payment_failed       -> past_due (Stripe retries; grace applies)
//   subscription.updated         -> cancelAtPeriodEnd / status
//   subscription.deleted         -> canceled; access ends at ended_at
//
// Self-contained CommonJS (no `stripe` SDK, no `raw-body` package -- plain
// crypto + a manual stream read), mirroring the rest of api/*.js.
const crypto = require("crypto");

// Event log, three layers (readers and the nightly archive live in api/usage.js):
//   bi:events       short live feed (last 2,000) for the recent-activity list
//   bi:ev:<day>     every event of one UTC day; expires after EVENT_DAY_TTL and
//                   is copied nightly to a private GitHub repo before then
//   bi:daily:<day>  per-day counts keyed "<client>|<event>", kept indefinitely
// Keep this helper identical in every api/*.js file that logs events.
const EVENT_DAY_TTL = 92 * 86400;
function eventCmds(rec) {
  let o = {};
  try { o = JSON.parse(rec) || {}; } catch { o = {}; }
  const day = new Date(Number(o.t) || Date.now()).toISOString().slice(0, 10);
  return [
    ["LPUSH", "bi:events", rec], ["LTRIM", "bi:events", "0", "1999"],
    ["RPUSH", `bi:ev:${day}`, rec], ["EXPIRE", `bi:ev:${day}`, String(EVENT_DAY_TTL)],
    ["HINCRBY", `bi:daily:${day}`, `${o.c || "public"}|${o.ev || "unknown"}`, "1"],
  ];
}

// Must match scripts/mint-trial.mjs's TIERS.day exactly, or a webhook-minted
// link would grant different access than one minted by hand.
// "*" = every index, including ones added later -- a day pass is all-access
// for 24 hours.
const DAY_TIER_SCOPE = ["*"];
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
    <p style="color:#5B6B7B;font-size:13px">Access expires ${expiryISO}. Covers every Baton Index index, including any added during your pass.</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: "Your Baton Index day pass", html }),
    });
    return r.ok;
  } catch { return false; }
}

// --- monthly pass ------------------------------------------------------------
const SUB_EVENTS = new Set(["invoice.paid", "invoice.payment_failed", "customer.subscription.updated", "customer.subscription.deleted"]);
const PROVISIONAL_DAYS = 32;   // until invoice.paid reports the real period end

function subStatus(stripeStatus) {
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  return "active";
}
async function readSub(email) {
  const r = await kv([["GET", `bi:sub:${email}`]]);
  try { return r && r[0] ? JSON.parse(r[0]) : null; } catch { return null; }
}
async function writeSub(sub) {
  sub.updatedAt = Date.now();
  const cmds = [["SET", `bi:sub:${sub.email}`, JSON.stringify(sub)], ["SADD", "bi:subs", sub.email]];
  if (sub.subscription) cmds.push(["SET", `bi:sub-id:${sub.subscription}`, sub.email]);
  return kv(cmds);
}
// Stripe moved an invoice's subscription id under `parent` in newer API
// versions; accept both shapes.
function invoiceSubscriptionId(inv) {
  return inv.subscription
    || (inv.parent && inv.parent.subscription_details && inv.parent.subscription_details.subscription)
    || (inv.lines && inv.lines.data && inv.lines.data.map((l) => l.subscription || (l.parent && l.parent.subscription_item_details && l.parent.subscription_item_details.subscription)).find(Boolean))
    || null;
}
async function emailForSubscription(subId, fallback) {
  if (fallback) return String(fallback).trim().toLowerCase();
  if (!subId) return null;
  const r = await kv([["GET", `bi:sub-id:${subId}`]]);
  return r && r[0] ? r[0] : null;
}
function logSub(req, email, ev, detail) {
  const t = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return kv([
    ...eventCmds(JSON.stringify({ c: email, ev, f: detail || null, t, ip })),
    ["SADD", "bi:clients", email],
    ["HSET", `bi:client:${email}`, "last", String(t), "lastEvent", ev],
  ]);
}

async function handleSubscriptionCheckout(req, res, session, email) {
  const now = Math.floor(Date.now() / 1000);
  const existing = await readSub(email);
  const sub = Object.assign({ email, createdAt: Date.now() }, existing || {}, {
    status: "active",
    subscription: session.subscription || (existing && existing.subscription) || null,
    customer: session.customer || (existing && existing.customer) || null,
    cancelAtPeriodEnd: false,
  });
  // Grant access now; invoice.paid (usually seconds later) sets the real end.
  if (!existing || !(existing.until > now)) { sub.until = now + PROVISIONAL_DAYS * 86400; sub.provisional = true; }
  await writeSub(sub);
  // Their first sign-in link, good for 24 hours. Later they can ask for a new
  // one at /?join with the same email.
  let emailed = false;
  try { emailed = await require("./trial.js").issueSignInLink(email, { kind: "sub", sub }, 86400); } catch (e) { console.error("stripe-webhook: sign-in email failed:", e && e.message); }
  await logSub(req, email, "subscription-started", emailed ? "emailed" : "email-failed");
  res.status(200).json({ ok: true, subscription: true, emailed });
}

async function handleSubscriptionEvent(req, res, event) {
  const obj = event.data && event.data.object || {};
  const isInvoice = event.type.startsWith("invoice.");
  const subId = isInvoice ? invoiceSubscriptionId(obj) : obj.id;
  if (!subId) { res.status(200).json({ ok: true, skipped: "not_a_subscription" }); return; }
  const email = await emailForSubscription(subId, isInvoice ? obj.customer_email : null);
  if (!email) { res.status(200).json({ ok: true, skipped: "unknown_subscription" }); return; }
  const sub = (await readSub(email)) || { email, createdAt: Date.now(), until: 0 };
  sub.subscription = subId;
  if (obj.customer) sub.customer = typeof obj.customer === "string" ? obj.customer : obj.customer.id;

  if (event.type === "invoice.paid") {
    const ends = ((obj.lines && obj.lines.data) || []).map((l) => l.period && l.period.end).filter(Number.isFinite);
    const periodEnd = ends.length ? Math.max(...ends) : 0;
    if (periodEnd && (sub.provisional || !(sub.until >= periodEnd))) sub.until = periodEnd;
    sub.provisional = false;
    sub.status = "active";
  } else if (event.type === "invoice.payment_failed") {
    if (sub.status !== "canceled") sub.status = "past_due";
  } else if (event.type === "customer.subscription.updated") {
    sub.status = subStatus(obj.status);
    sub.cancelAtPeriodEnd = !!obj.cancel_at_period_end;
  } else if (event.type === "customer.subscription.deleted") {
    sub.status = "canceled";
    sub.cancelAtPeriodEnd = false;
    const endedAt = Number(obj.ended_at) || Math.floor(Date.now() / 1000);
    if (!(sub.until <= endedAt)) sub.until = endedAt;   // never extends; an immediate cancel ends now
  }
  await writeSub(sub);
  await logSub(req, email, event.type.replace("customer.", ""), sub.status);
  res.status(200).json({ ok: true, subscription: sub.status, until: sub.until });
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

  // Idempotency for billing events: Stripe can deliver the same event twice.
  if (SUB_EVENTS.has(event.type)) {
    const seenEvt = await kv([["SET", `bi:stripe-evt:${event.id}`, "1", "NX", "EX", "2592000"]]);
    if (!seenEvt) { res.status(503).json({ ok: false, error: "storage_unavailable" }); return; }   // Stripe retries
    if (seenEvt[0] !== "OK") { res.status(200).json({ ok: true, skipped: "duplicate" }); return; }
    await handleSubscriptionEvent(req, res, event);
    return;
  }

  // Acknowledge every other event type quickly; only checkout.session.completed
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

  // A Monthly-pass checkout: set up the subscription, never a day pass.
  if (session.mode === "subscription") {
    if (!seen) { res.status(503).json({ ok: false, error: "storage_unavailable" }); return; }   // Stripe retries
    await handleSubscriptionCheckout(req, res, session, email);
    return;
  }

  const { token, expSec } = mintDayPassToken(email, trialSecret);
  const link = `${DOMAIN}/?k=${token}`;
  const expiryISO = new Date(expSec * 1000).toISOString().slice(0, 10);

  const emailed = await sendPassEmail(email, link, expiryISO);

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  await kv([
    ...eventCmds(JSON.stringify({ c: email, ev: "daypass-issued", f: emailed ? "emailed" : "email-failed", t, ip })),
    ["SADD", "bi:clients", email],
    ["HSET", `bi:client:${email}`, "last", String(t), "lastEvent", "daypass-issued"],
    ["HINCRBY", `bi:client:${email}`, "hits", "1"],
  ]);

  res.status(200).json({ ok: true, emailed });
};

module.exports.config = { api: { bodyParser: false } };
