// Baton Index — trial status endpoint (Hardening Step 4).
//
// The UI calls this once on load to decide what to render: the full app (gate
// disarmed, or a valid token), the locked landing (no/invalid token), or the
// end-of-trial screen (expired). The real enforcement is still api/data.js — this
// only drives the UX. Self-contained CommonJS, mirroring api/pq-news.js / data.js.
//
// Returns:
//   { armed: false }                                         gate off (no secret)
//   { armed: true, status: "none" }                          no token
//   { armed: true, status: "invalid" }                       bad/tampered token
//   { armed: true, status: "expired", expiry, client }       past expiry
//   { armed: true, status: "valid", scope, expiry, client }  good token
const crypto = require("crypto");

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function hmac(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function timingSafe(a, b) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
function verify(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return { ok: false, reason: "malformed" }; }
  if (!timingSafe(sig, hmac(secret, body))) return { ok: false, reason: "bad-signature" };
  if (!payload || !Array.isArray(payload.s) || typeof payload.x !== "number") return { ok: false, reason: "malformed" };
  if (Math.floor(Date.now() / 1000) >= payload.x) return { ok: false, reason: "expired", payload };
  return { ok: true, payload };
}

// Lightweight usage logging to Vercel KV / Upstash (fail-safe: a no-op until the
// KV_REST_API_* env vars exist, so it never affects the app). Keyed by the token's
// client tag `c`, so every trial/paid link is attributable with no per-link setup.
async function logUsage(req, ev, client, file) {
  const url = process.env.KV_REST_API_URL, tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return;
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rec = JSON.stringify({ c, ev, f: file || null, t: Date.now(), ip });
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["LPUSH", "bi:events", rec],
        ["LTRIM", "bi:events", "0", "1999"],
        ["SADD", "bi:clients", c],
        ["HSET", `bi:client:${c}`, "last", String(Date.now()), "lastEvent", ev, "lastFile", file || ""],
        ["HINCRBY", `bi:client:${c}`, "hits", "1"],
      ]),
    });
  } catch { /* logging is best-effort; never fail the request */ }
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const secret = process.env.TRIAL_SECRET;
  if (!secret) { res.status(200).json({ armed: false }); return; }

  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)bi_trial=([^;]+)/);
  const cookieTok = m ? decodeURIComponent(m[1]) : "";
  const queryK = (req.query && req.query.k) || "";
  const token = cookieTok || queryK || "";
  if (!token) { res.status(200).json({ armed: true, status: "none" }); return; }

  const v = verify(token, secret);
  if (!v.ok && v.reason === "expired") {
    await logUsage(req, "expired-open", v.payload && v.payload.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: v.payload.x, client: v.payload.c });
    return;
  }
  if (!v.ok) { res.status(200).json({ armed: true, status: "invalid" }); return; }
  await logUsage(req, "open", v.payload.c, null);

  // Valid — persist the cookie if the token arrived via ?k= so refreshes work.
  if (!cookieTok && queryK) {
    const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
  }
  res.status(200).json({ armed: true, status: "valid", scope: v.payload.s, expiry: v.payload.x, client: v.payload.c });
};
