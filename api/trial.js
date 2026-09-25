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

// Per-client revocation switch, set/cleared by the owner from the usage
// dashboard (api/usage.js ?block=/?unblock=). Stateless HMAC tokens can't be
// revoked individually before their baked-in expiry without rotating
// TRIAL_SECRET (which kills every link at once) -- this KV flag is the
// per-client kill switch. Fail-open (never blocks) until KV is configured.
// A signed-up user's client tag is their email, so the whole org can also be
// cut at once by blocking "@<domain>" -- checked alongside the email itself.
async function isBlocked(client) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok || !client) return false;
  const keys = [client];
  const at = client.lastIndexOf("@");
  if (at > 0) keys.push(client.slice(at));
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(keys.map((k) => ["GET", `bi:blocked:${k}`])),
    });
    if (!r.ok) return false;
    return (await r.json()).some((row) => row && row.result);
  } catch { return false; }
}

// Lightweight usage logging to Vercel KV / Upstash (fail-safe: a no-op until the
// KV_REST_API_* env vars exist, so it never affects the app). Keyed by the token's
// client tag `c`, so every trial/paid link is attributable with no per-link setup.
async function logUsage(req, ev, client, file) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const ua = String(req.headers["user-agent"] || "").slice(0, 200);
  const rec = JSON.stringify({ c, ev, f: file || null, t: Date.now(), ip, ua });
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

// --- work-email signup (org allowlist) --------------------------------------
// Partner firms get access per person rather than per shared link: anyone with
// an address at an allowlisted domain (bi:org:<domain>, managed from the usage
// dashboard) can request a sign-in link, and verifying it mints an ordinary
// trial token whose client tag is their email. Everything downstream -- scope,
// the per-client block switch, usage logging -- then works per person with no
// further changes. Expiry is the org's shared end date, not a per-user clock.
//
//   POST /api/trial?action=signup   { email }  -> emails a 15-minute link
//   GET  /api/trial?verify=<code>              -> confirm page (see below)
//   POST /api/trial?verify=<code>              -> consumes the code, sets cookie
//
// Fails closed: this mints real access, so no KV / no TRIAL_SECRET / no email
// provider means no signup, never an unverified token.
const SITE = (process.env.BI_DOMAIN || "https://batonindex.com").replace(/\/+$/, "");
const LINK_TTL_SEC = 15 * 60;
const RL_WINDOW_SEC = 3600;
const RL_PER_EMAIL = 3;
const RL_PER_IP = 10;

function kvCreds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
async function kv(commands) {
  const { url, tok } = kvCreds();
  const r = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`kv ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

function b64urlEncode(str) { return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function mintToken(payload, secret) {
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${hmac(secret, body)}`;
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clientIp = (req) => String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();

function normEmail(raw) {
  const e = String(raw || "").trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@"<>,;]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  return e;
}

// An org is usable when it exists, its shared end date is still ahead, and the
// whole domain hasn't been blocked.
async function activeOrg(domain) {
  const [raw, blocked] = await kv([["GET", `bi:org:${domain}`], ["GET", `bi:blocked:@${domain}`]]);
  if (!raw || blocked) return null;
  let org;
  try { org = JSON.parse(raw); } catch { return null; }
  if (!org || !Array.isArray(org.scope) || typeof org.until !== "number") return null;
  if (Math.floor(Date.now() / 1000) >= org.until) return null;
  return org;
}

// Counts toward a limit and reports whether it has been exceeded.
async function overLimit(key, max) {
  const [, n] = await kv([["SET", key, "0", "EX", String(RL_WINDOW_SEC), "NX"], ["INCR", key]]);
  return Number(n) > max;
}

async function sendSignInEmail(to, link, org) {
  const RESEND_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_KEY) { console.log(`trial signup: RESEND_API_KEY unset -- sign-in link for ${to} not emailed.`); return false; }
  const FROM = process.env.FEATURE_REQUEST_FROM || "Baton Index <alerts@batonindex.com>";
  const until = new Date(org.until * 1000).toISOString().slice(0, 10);
  const html = `
    <p>Here is your Baton Index sign-in link${org.label ? ` for <b>${esc(org.label)}</b>` : ""}:</p>
    <p><a href="${link}">Sign in to Baton Index</a></p>
    <p style="color:#5B6B7B;font-size:13px">The link works once and expires in 15 minutes. Your access runs through ${until}.
    If you didn't ask for this, you can ignore this email.</p>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: "Your Baton Index sign-in link", html }),
    });
    return r.ok;
  } catch { return false; }
}

async function handleSignupRequest(req, res, secret) {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  if (!secret || !kvCreds().url || !kvCreds().tok) { res.status(503).json({ ok: false, error: "unavailable" }); return; }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = normEmail(body && body.email);
  if (!email) { res.status(400).json({ ok: false, error: "invalid_email" }); return; }
  const domain = email.slice(email.lastIndexOf("@") + 1);
  try {
    if (await overLimit(`bi:rl:signup-ip:${clientIp(req) || "unknown"}`, RL_PER_IP) ||
        await overLimit(`bi:rl:signup-email:${email}`, RL_PER_EMAIL)) {
      res.status(429).json({ ok: false, error: "rate_limited" }); return;
    }
    const org = await activeOrg(domain);
    if (!org) { res.status(200).json({ ok: false, error: "not_eligible" }); return; }
    const code = crypto.randomBytes(24).toString("base64url");
    await kv([["SET", `bi:signup:${sha256(code)}`, JSON.stringify({ email, domain, t: Date.now() }), "EX", String(LINK_TTL_SEC)]]);
    const sent = await sendSignInEmail(email, `${SITE}/api/trial?verify=${code}`, org);
    if (!sent) { res.status(503).json({ ok: false, error: "email_failed" }); return; }
    await logUsage(req, "signup-request", email, domain);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("trial signup failed:", e && e.message);
    res.status(502).json({ ok: false, error: "server_error" });
  }
}

// Mail-security gateways (Safe Links, Proofpoint, ...) open every URL in an
// email before the recipient does. If a GET consumed the one-time code, the
// scanner would burn it and the person would click a dead link. So the emailed
// GET only renders a button; the POST behind it -- which scanners don't submit
// -- is what spends the code.
function confirmPage(res, code) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex"><title>Sign in · Baton Index</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F6F8;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <form method="post" action="/api/trial?verify=${encodeURIComponent(code)}" style="background:#fff;border-radius:12px;padding:32px;max-width:360px;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.08)">
    <h1 style="font-size:18px;color:#011F5B;margin:0 0 8px">Sign in to Baton Index</h1>
    <p style="font-size:14px;color:#5B6B7B;margin:0 0 20px">Confirm to finish signing in on this device.</p>
    <button type="submit" style="width:100%;padding:11px;border:none;border-radius:8px;background:#A31F34;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Continue</button>
  </form></body></html>`);
}

async function handleVerify(req, res, secret) {
  const code = String(req.query.verify || "").slice(0, 100);
  if (req.method === "GET") { confirmPage(res, code); return; }
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  const back = (result) => { res.setHeader("location", `/?signup=${result}`); res.status(303).send(""); };
  if (!secret || !kvCreds().url || !kvCreds().tok) { back("unavailable"); return; }
  try {
    const key = `bi:signup:${sha256(code)}`;
    const [raw] = await kv([["GET", key], ["DEL", key]]);
    if (!raw) { back("expired"); return; }
    const { email, domain } = JSON.parse(raw);
    const org = await activeOrg(domain);
    if (!org || (await isBlocked(email))) { back("ineligible"); return; }

    const now = Math.floor(Date.now() / 1000);
    const token = mintToken({ c: email, s: org.scope, x: org.until, i: now, o: domain }, secret);
    const ms = String(Date.now());
    await kv([
      ["HSETNX", `bi:user:${email}`, "createdAt", ms],
      ["HSET", `bi:user:${email}`, "email", email, "domain", domain, "org", org.label || domain, "verifiedAt", ms],
      ["SADD", `bi:org-users:${domain}`, email],
    ]);
    await logUsage(req, "signup-verified", email, domain);
    // HttpOnly, unlike the ?k= cookie: this one is a year-long credential and
    // nothing client-side needs to read it (TrialContext asks /api/trial).
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.max(0, org.until - now)}; Secure; HttpOnly; SameSite=Lax`);
    back("ok");
  } catch (e) {
    console.error("trial verify failed:", e && e.message);
    back("unavailable");
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const secret = process.env.TRIAL_SECRET;
  if (req.query && req.query.action === "signup") { await handleSignupRequest(req, res, secret); return; }
  if (req.query && req.query.verify) { await handleVerify(req, res, secret); return; }

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

  if (await isBlocked(v.payload.c)) {
    await logUsage(req, "blocked-open", v.payload.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: Math.floor(Date.now() / 1000) - 1, client: v.payload.c });
    return;
  }
  await logUsage(req, "open", v.payload.c, null);

  // Valid — persist the cookie if the token arrived via ?k= so refreshes work.
  if (!cookieTok && queryK) {
    const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
  }
  res.status(200).json({ armed: true, status: "valid", scope: v.payload.s, expiry: v.payload.x, client: v.payload.c });
};
