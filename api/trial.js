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
    res.status(200).json({ armed: true, status: "expired", expiry: v.payload.x, client: v.payload.c });
    return;
  }
  if (!v.ok) { res.status(200).json({ armed: true, status: "invalid" }); return; }

  // Valid — persist the cookie if the token arrived via ?k= so refreshes work.
  if (!cookieTok && queryK) {
    const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
  }
  res.status(200).json({ armed: true, status: "valid", scope: v.payload.s, expiry: v.payload.x, client: v.payload.c });
};
