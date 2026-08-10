// Baton Index — records click-through agreement to the Terms of Service /
// Privacy Policy for trial and paid clients. Fired once by ConsentGate.tsx
// when a valid access link is first used in a browser. Same fail-safe KV
// design as the rest of the usage log: a no-op until KV_REST_API_* env vars
// exist, and never throws back to the client. Self-contained CommonJS,
// mirroring api/search-log.js / api/data.js.
const crypto = require("crypto");
const CONSENT_VERSION = "1";

// The client tag must come from the signed bi_trial cookie, never from the
// request body -- this record is meant to serve as proof a specific client
// agreed to the Terms/Privacy Policy, so it must not be spoofable by anyone
// who guesses a client name. Same HMAC verify as api/data.js / api/trial.js.
function b64urlDecode(s) { return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"); }
function hmac(secret, msg) { return crypto.createHmac("sha256", secret).update(msg).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function timingSafe(a, b) { const ba = Buffer.from(a), bb = Buffer.from(b); return ba.length === bb.length && crypto.timingSafeEqual(ba, bb); }
function trustedClient(req) {
  const secret = process.env.TRIAL_SECRET;
  if (!secret) return null;
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)bi_trial=([^;]+)/);
  const token = m ? decodeURIComponent(m[1]) : "";
  if (!token || !token.includes(".")) return null;
  const dot = token.indexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return null; }
  if (!timingSafe(sig, hmac(secret, body))) return null;
  if (!payload || typeof payload.c !== "string") return null;
  return payload.c;
}

async function logConsent(req, client) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  const c = client;
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  const rec = JSON.stringify({ c, ev: "consent", v: CONSENT_VERSION, t, ip });
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["LPUSH", "bi:events", rec],
        ["LTRIM", "bi:events", "0", "1999"],
        ["SADD", "bi:clients", c],
        ["HSET", `bi:client:${c}`, "consentedAt", String(t), "consentVersion", CONSENT_VERSION],
      ]),
    });
  } catch { /* logging is best-effort; never fail the request */ }
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

  const client = trustedClient(req);
  if (!client) { res.status(200).json({ ok: true, recorded: false }); return; }

  await logConsent(req, client);
  res.status(200).json({ ok: true, recorded: true, version: CONSENT_VERSION });
};
