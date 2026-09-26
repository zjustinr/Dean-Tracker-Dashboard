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
// Signed-up users also get `org` (its name), `expiry` = the org's live end date,
// and `graceUntil` while the org is in its post-expiry grace window.
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

// Live access check, run on every request that carries a valid token.
//
// Blocks: a per-client revocation switch, set/cleared by the owner from the
// usage dashboard (api/usage.js ?block=/?unblock=). Stateless HMAC tokens can't
// be revoked individually before their baked-in expiry without rotating
// TRIAL_SECRET (which kills every link at once) -- this KV flag is the
// per-client kill switch. A signed-up user's client tag is their email, so the
// whole org can also be cut at once by blocking "@<domain>".
//
// Org entitlement: a token from work-email signup carries its org domain `o`,
// and for those the token only says WHO you are. WHAT you get -- scope and end
// date -- is read from the org's live record (bi:org:<domain>), so extending or
// shortening an org's end date takes effect on the next request, with nobody
// signing in again. After the end date there is a GRACE_DAYS window in which
// access continues (the UI shows a renewal banner); after that, "ended".
// Membership is live too: removing someone from bi:org-users:<domain> (which
// frees their seat) ends their access -- state "removed".
//
// state: null for tokens without an org (owner-minted links, day passes) or if
// the lookup failed -- callers then fall back to the token's own s/x claims.
// Fail-open throughout until KV is configured, matching the rest of the gate.
const GRACE_DAYS = 14;
async function liveAccess(payload) {
  const out = { blocked: false, state: null, org: null };
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const client = payload && payload.c;
  const domain = payload && typeof payload.o === "string" ? payload.o : null;
  if (!url || !tok || !client) return out;
  const keys = [client];
  const at = client.lastIndexOf("@");
  if (at > 0) keys.push(client.slice(at));
  const cmds = keys.map((k) => ["GET", `bi:blocked:${k}`]);
  if (domain) cmds.push(["GET", `bi:org:${domain}`], ["SISMEMBER", `bi:org-users:${domain}`, client]);
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) return out;
    const rows = await r.json();
    out.blocked = rows.slice(0, keys.length).some((row) => row && row.result);
    if (domain) {
      let org = null;
      try { org = JSON.parse((rows[keys.length] || {}).result || "null"); } catch { org = null; }
      const member = Number((rows[keys.length + 1] || {}).result) === 1;
      if (!org || !Array.isArray(org.scope) || typeof org.until !== "number") {
        out.state = "ended";               // org removed: its members have no plan
      } else if (!member) {
        out.state = "removed";             // seat released by the owner
      } else {
        const now = Math.floor(Date.now() / 1000);
        out.org = org;
        out.state = now < org.until ? "active" : now < org.until + GRACE_DAYS * 86400 ? "grace" : "ended";
      }
    }
    return out;
  } catch { return out; }
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
//
// The token is a rolling SESSION_DAYS login, re-issued on use (see the status
// handler). Access itself comes from the org's live record (liveAccess), so
// renewing an org is just changing its end date.
const SITE = (process.env.BI_DOMAIN || "https://batonindex.com").replace(/\/+$/, "");
const LINK_TTL_SEC = 15 * 60;
const RL_WINDOW_SEC = 3600;
const RL_PER_EMAIL = 3;
const RL_PER_IP = 10;
const SESSION_DAYS = 90;
const REFRESH_AFTER_SEC = 86400;  // re-issue the session cookie at most daily

function sessionCookie(email, domain, secret) {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = SESSION_DAYS * 86400;
  // `s` is informational only for org tokens -- the live org record decides.
  const token = mintToken({ c: email, s: [], x: now + maxAge, i: now, o: domain }, secret);
  // HttpOnly, unlike the ?k= cookie: nothing client-side needs to read it
  // (TrialContext asks /api/trial).
  return `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

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
    if (org.seats) {
      // Existing members can always sign in again (new device, cleared cookies).
      const [member, used] = await kv([["SISMEMBER", `bi:org-users:${domain}`, email], ["SCARD", `bi:org-users:${domain}`]]);
      if (!Number(member) && Number(used) >= org.seats) { res.status(200).json({ ok: false, error: "no_seats" }); return; }
    }
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
    if (!org || (await liveAccess({ c: email })).blocked) { back("ineligible"); return; }

    // Claim a seat. Adding first and checking after means two people racing
    // for the last seat can't both win: the one who pushed it over backs out.
    const members = `bi:org-users:${domain}`;
    const [added, used] = await kv([["SADD", members, email], ["SCARD", members]]);
    if (Number(added) && org.seats && Number(used) > org.seats) {
      await kv([["SREM", members, email]]);
      back("full"); return;
    }
    const ms = String(Date.now());
    await kv([
      ["HSETNX", `bi:user:${email}`, "createdAt", ms],
      ["HSET", `bi:user:${email}`, "email", email, "domain", domain, "org", org.label || domain, "verifiedAt", ms],
    ]);
    await logUsage(req, "signup-verified", email, domain);
    res.setHeader("set-cookie", sessionCookie(email, domain, secret));
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

  const p = v.payload;
  const live = await liveAccess(p);
  const nowSec = Math.floor(Date.now() / 1000);
  const orgName = live.org ? live.org.label || p.o : undefined;
  if (live.blocked) {
    await logUsage(req, "blocked-open", p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: nowSec - 1, client: p.c });
    return;
  }
  // The org's plan ran out (grace included). Keep the cookie: if the org is
  // renewed, this same login is valid again with nothing for the user to do.
  if (live.state === "removed") {
    await logUsage(req, "removed-open", p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: nowSec - 1, client: p.c });
    return;
  }
  if (live.state === "ended") {
    await logUsage(req, "expired-open", p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: live.org ? live.org.until : nowSec - 1, client: p.c, org: orgName });
    return;
  }
  await logUsage(req, "open", p.c, null);

  if (p.o && live.state) {
    // Rolling session: an active user never hits the 90-day login limit.
    if (nowSec - (p.i || 0) > REFRESH_AFTER_SEC) res.setHeader("set-cookie", sessionCookie(p.c, p.o, secret));
  } else if (!cookieTok && queryK) {
    // Valid — persist the cookie if the token arrived via ?k= so refreshes work.
    const maxAge = Math.max(0, (p.x || 0) - nowSec);
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
  }
  res.status(200).json({
    armed: true, status: "valid", client: p.c,
    scope: live.org ? live.org.scope : p.s,
    expiry: live.org ? live.org.until : p.x,
    org: orgName,
    graceUntil: live.state === "grace" ? live.org.until + GRACE_DAYS * 86400 : undefined,
  });
};
