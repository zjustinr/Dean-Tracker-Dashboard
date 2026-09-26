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
// Plans. For a signed-in person the token only says WHO you are; WHAT you get
// -- scope and end date -- is read live on every request, so renewals,
// cancellations and changes apply at once with nobody signing in again:
//   * org member (token `o` = domain): the org record bi:org:<domain>, plus
//     live membership in bi:org-users:<domain> (removing someone frees their
//     seat and ends their access -- state "removed").
//   * monthly subscriber (token `k` = "sub"): bi:sub:<email>, kept current by
//     api/stripe-webhook.js from Stripe's billing events.
// After a plan's end date there is a GRACE_DAYS window (renewal banner, or
// Stripe retrying a failed card) before "ended". A subscription the customer
// cancelled has no grace: it simply ends when the paid month runs out.
//
// Returns { blocked, state, org, plan } where plan = { kind, name, scope,
// until, graceUntil, sub } for signed-in people. state is null for tokens
// without a plan (owner-minted links, day passes) or if the lookup failed --
// callers then fall back to the token's own s/x claims.
// Fail-open throughout until KV is configured, matching the rest of the gate.
const GRACE_DAYS = 14;
function planState(until, noGrace) {
  const now = Math.floor(Date.now() / 1000);
  if (now < until) return "active";
  return !noGrace && now < until + GRACE_DAYS * 86400 ? "grace" : "ended";
}
async function liveAccess(payload) {
  const out = { blocked: false, state: null, org: null, plan: null };
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const client = payload && payload.c;
  const domain = payload && typeof payload.o === "string" ? payload.o : null;
  const isSub = !domain && payload && payload.k === "sub";
  if (!url || !tok || !client) return out;
  const keys = [client];
  const at = client.lastIndexOf("@");
  if (at > 0) keys.push(client.slice(at));
  const cmds = keys.map((k) => ["GET", `bi:blocked:${k}`]);
  if (domain) cmds.push(["GET", `bi:org:${domain}`], ["SISMEMBER", `bi:org-users:${domain}`, client]);
  if (isSub) cmds.push(["GET", `bi:sub:${client}`]);
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) return out;
    const rows = await r.json();
    out.blocked = rows.slice(0, keys.length).some((row) => row && row.result);
    const rec = (i) => { try { return JSON.parse((rows[keys.length + i] || {}).result || "null"); } catch { return null; } };
    if (domain) {
      const org = rec(0);
      const member = Number((rows[keys.length + 1] || {}).result) === 1;
      if (!org || !Array.isArray(org.scope) || typeof org.until !== "number") {
        out.state = "ended";               // org removed: its members have no plan
      } else if (!member) {
        out.state = "removed";             // seat released by the owner
      } else {
        out.org = org;
        out.state = planState(org.until);
        out.plan = { kind: "org", name: org.label || domain, scope: org.scope, until: org.until, graceUntil: org.until + GRACE_DAYS * 86400 };
      }
    } else if (isSub) {
      const sub = rec(0);
      if (!sub || typeof sub.until !== "number") {
        out.state = "ended";               // no subscription on record
      } else {
        const noGrace = sub.status === "canceled";
        out.state = planState(sub.until, noGrace);
        out.plan = { kind: "sub", name: "Monthly pass", scope: ["*"], until: sub.until, graceUntil: noGrace ? sub.until : sub.until + GRACE_DAYS * 86400, sub };
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
        ...eventCmds(rec),
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

// planClaim is { o: domain } for an org member or { k: "sub" } for a monthly
// subscriber -- it tells liveAccess which live record to read.
function sessionCookie(email, secret, planClaim) {
  const now = Math.floor(Date.now() / 1000);
  const maxAge = SESSION_DAYS * 86400;
  // `s` is informational only for these tokens -- the live plan record decides.
  const token = mintToken(Object.assign({ c: email, s: [], x: now + maxAge, i: now }, planClaim), secret);
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

// A monthly subscriber may sign in while their pass is current, or in the
// grace window while Stripe retries a failed card.
async function activeSub(email) {
  const [raw, b1, b2] = await kv([["GET", `bi:sub:${email}`], ["GET", `bi:blocked:${email}`], ["GET", `bi:blocked:${email.slice(email.lastIndexOf("@"))}`]]);
  if (!raw || b1 || b2) return null;
  let sub;
  try { sub = JSON.parse(raw); } catch { return null; }
  if (!sub || typeof sub.until !== "number") return null;
  return planState(sub.until, sub.status === "canceled") === "ended" ? null : sub;
}

// Counts toward a limit and reports whether it has been exceeded.
async function overLimit(key, max) {
  const [, n] = await kv([["SET", key, "0", "EX", String(RL_WINDOW_SEC), "NX"], ["INCR", key]]);
  return Number(n) > max;
}

// --- the sign-in email ----------------------------------------------------------
// Table layout + inline styles, because that is all Gmail/Outlook reliably
// render: no SVG (hence the PNG logo), no web fonts (Georgia stands in for the
// site's EB Garamond), no flex. Colours match the app: Penn navy #011F5B for
// type, crimson #A31F34 for the brand bar and button. A plain-text part rides
// along -- HTML-only mail scores worse with spam filters.
// target: { kind: "org", org } or { kind: "sub", sub }.
function signInEmail({ link, target, firstName, ttlSec = LINK_TTL_SEC }) {
  const isSub = target.kind === "sub";
  const plan = isSub ? target.sub : target.org;
  const until = new Date(plan.until * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  const hi = firstName ? `Hi ${esc(firstName)},` : "Hello,";
  const label = isSub ? "" : plan.label || "";
  const orgLine = isSub ? " with your <b>monthly pass</b>" : label ? ` with your <b>${esc(label)}</b> account` : "";
  const ttl = ttlSec >= 86400 ? "24 hours" : "15 minutes";
  const note = isSub ? `Your monthly pass is active through ${until}.` : label ? `${label}'s access runs through ${until}.` : "";
  const serif = "Georgia,'Times New Roman',serif";
  const sans = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Sign in to Baton Index</title></head>
<body style="margin:0;padding:0;background:#EEF1F6">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">Your one-time sign-in link — it expires in 15 minutes.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF1F6"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background:#FFFFFF;border-radius:12px;border-top:4px solid #A31F34">
    <tr><td align="center" style="padding:32px 32px 8px">
      <a href="${SITE}" style="text-decoration:none"><img src="${SITE}/email-logo.png" width="72" height="72" alt="Baton Index" style="display:block;border:0;border-radius:10px"></a>
      <p style="margin:16px 0 0;font-family:${serif};font-size:20px;line-height:26px;color:#011F5B">Leadership succession, decoded.</p>
    </td></tr>
    <tr><td style="padding:24px 40px 0;font-family:${sans};font-size:15px;line-height:23px;color:#1F2A3C">
      <p style="margin:0 0 12px">${hi}</p>
      <p style="margin:0">Use the button below to sign in to Baton Index${orgLine}.</p>
    </td></tr>
    <tr><td align="center" style="padding:28px 40px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#A31F34" style="border-radius:8px">
        <a href="${link}" style="display:inline-block;padding:14px 36px;font-family:${sans};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:8px">Sign in to Baton Index</a>
      </td></tr></table>
    </td></tr>
    <tr><td style="padding:0 40px;font-family:${sans};font-size:13px;line-height:20px;color:#5B6B7B">
      <p style="margin:0 0 12px">This link works once and expires in ${ttl}.${note ? ` ${esc(note)}` : ""}</p>
      <p style="margin:0 0 4px">Button not working? Paste this address into your browser:</p>
      <p style="margin:0;word-break:break-all"><a href="${link}" style="color:#011F5B">${link}</a></p>
    </td></tr>
    <tr><td style="padding:28px 40px 32px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #E6E9EE;padding-top:16px;font-family:${sans};font-size:12px;line-height:18px;color:#98A2AF">
        You're receiving this because this address was entered at batonindex.com. If that wasn't you, ignore this email — nothing happens without the link.
      </td></tr></table>
    </td></tr>
  </table>
  <p style="margin:16px 0 0;font-family:${sans};font-size:12px;color:#98A2AF"><a href="${SITE}" style="color:#98A2AF;text-decoration:none">batonindex.com</a></p>
</td></tr></table>
</body></html>`;
  const text = [
    firstName ? `Hi ${firstName},` : "Hello,",
    "",
    `Use this link to sign in to Baton Index${isSub ? " with your monthly pass" : label ? ` with your ${label} account` : ""}:`,
    link,
    "",
    `The link works once and expires in ${ttl}.${note ? ` ${note}` : ""}`,
    "",
    "If you didn't ask for this, ignore this email — nothing happens without the link.",
    "— Baton Index · batonindex.com",
  ].join("\n");
  return { html, text };
}

async function sendSignInEmail(to, link, target, firstName, ttlSec) {
  const RESEND_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_KEY) { console.log(`trial signup: RESEND_API_KEY unset -- sign-in link for ${to} not emailed.`); return false; }
  const FROM = process.env.FEATURE_REQUEST_FROM || "Baton Index <alerts@batonindex.com>";
  const { html, text } = signInEmail({ link, target, firstName, ttlSec });
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject: "Your Baton Index sign-in link", html, text }),
    });
    return r.ok;
  } catch { return false; }
}

// Creates a one-time sign-in code and emails the link. Also used by
// api/stripe-webhook.js to send a new subscriber their link right after
// payment (with a 24-hour life, since they may not open it straight away).
async function issueSignInLink(email, target, ttlSec = LINK_TTL_SEC) {
  const code = crypto.randomBytes(24).toString("base64url");
  const record = { email, kind: target.kind, domain: target.kind === "org" ? target.domain : null, t: Date.now() };
  await kv([["SET", `bi:signup:${sha256(code)}`, JSON.stringify(record), "EX", String(ttlSec)]]);
  const [firstName] = await kv([["HGET", `bi:user:${email}`, "firstName"]]);
  return sendSignInEmail(email, `${SITE}/api/trial?verify=${code}`, target, firstName || "", ttlSec);
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
    // Eligible if the email's domain is an enrolled firm, or the email itself
    // has a current monthly pass. A firm plan wins if both apply.
    const org = await activeOrg(domain);
    const sub = org ? null : await activeSub(email);
    if (!org && !sub) { res.status(200).json({ ok: false, error: "not_eligible" }); return; }
    if (org && org.seats) {
      // Existing members can always sign in again (new device, cleared cookies).
      const [member, used] = await kv([["SISMEMBER", `bi:org-users:${domain}`, email], ["SCARD", `bi:org-users:${domain}`]]);
      if (!Number(member) && Number(used) >= org.seats) { res.status(200).json({ ok: false, error: "no_seats" }); return; }
    }
    const sent = await issueSignInLink(email, org ? { kind: "org", domain, org } : { kind: "sub", sub });
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
// GET only renders a page; the POST behind its button -- which scanners don't
// submit -- is what spends the code.
//
// That page is also where a first-time user gives their name. Asking there
// keeps the first step a single email field, and it lands after the person has
// already committed by opening the email. Returning users just see Continue.
const cleanName = (v) => String(v || "").replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

function page(res, status, title, inner) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(status).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex"><title>${esc(title)} · Baton Index</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500&display=swap" rel="stylesheet">
  <style>
    body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;box-sizing:border-box;
      font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1F2A3C;background:linear-gradient(#F6F8FB,#E7EBF2)}
    .card{background:#fff;border-radius:14px;border-top:4px solid #A31F34;box-shadow:0 1px 3px rgba(1,31,91,.08);padding:32px 28px;width:100%;max-width:380px;box-sizing:border-box;text-align:center}
    .tag{font-family:'EB Garamond',Georgia,serif;font-size:20px;color:#011F5B;margin:14px 0 20px}
    h1{font-size:18px;color:#011F5B;margin:0 0 6px}
    p{font-size:14px;color:#5B6B7B;margin:0 0 18px;line-height:1.5}
    .row{display:flex;gap:10px;text-align:left}.row label{flex:1}
    label{display:block;font-size:12px;font-weight:600;color:#1F2A3C;margin-bottom:12px}
    input{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px 11px;border:1px solid #CBD2DC;border-radius:8px;font-size:14px}
    input:focus{outline:2px solid rgba(1,31,91,.25);border-color:#011F5B}
    .btn{display:block;width:100%;padding:12px;border:0;border-radius:8px;background:#A31F34;color:#fff;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box}
    .btn:hover{background:#8C1A2C}.err{color:#A31F34;font-size:13px;margin:-4px 0 12px}
    .who{font-size:13px;color:#5B6B7B;margin:0 0 18px}.who b{color:#1F2A3C}
  </style></head>
  <body><div class="card"><img src="/logo.svg" width="64" height="64" alt="Baton Index" style="display:block;margin:0 auto">
  <div class="tag">Leadership succession, decoded.</div>${inner}</div></body></html>`);
}

async function confirmPage(res, code, error) {
  let email = null, needName = false;
  try {
    if (kvCreds().url && kvCreds().tok) {
      const [raw] = await kv([["GET", `bi:signup:${sha256(code)}`]]);   // read, never consume
      if (raw) {
        email = JSON.parse(raw).email;
        const [first] = await kv([["HGET", `bi:user:${email}`, "firstName"]]);
        needName = !first;
      }
    }
  } catch { email = null; }
  if (!email) {
    page(res, 200, "Link expired", `<h1>This sign-in link has expired</h1>
      <p>Links work once and last 15 minutes. You can request a new one in a few seconds.</p>
      <a class="btn" href="/?join">Get a new link</a>`);
    return;
  }
  const action = `/api/trial?verify=${encodeURIComponent(code)}`;
  if (!needName) {
    page(res, 200, "Sign in", `<h1>Welcome back</h1>
      <p class="who">Signing in as <b>${esc(email)}</b></p>
      <form method="post" action="${action}"><button class="btn" type="submit">Continue</button></form>`);
    return;
  }
  page(res, 200, "Finish signing in", `<h1>Finish signing in</h1>
    <p class="who">Signing in as <b>${esc(email)}</b></p>
    <form method="post" action="${action}">
      <div class="row">
        <label>First name<input name="firstName" autocomplete="given-name" required maxlength="60" autofocus></label>
        <label>Last name<input name="lastName" autocomplete="family-name" required maxlength="60"></label>
      </div>
      ${error ? `<div class="err">${esc(error)}</div>` : ""}
      <button class="btn" type="submit">Continue</button>
    </form>`);
}

function formBody(req) {
  const b = req.body;
  if (b && typeof b === "object") return b;
  if (typeof b === "string") {
    try { return JSON.parse(b); } catch { /* not JSON */ }
    return Object.fromEntries(new URLSearchParams(b));
  }
  return {};
}

async function handleVerify(req, res, secret) {
  const code = String(req.query.verify || "").slice(0, 100);
  if (req.method === "GET") { await confirmPage(res, code); return; }
  if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }
  const back = (result) => { res.setHeader("location", `/?signup=${result}`); res.status(303).send(""); };
  if (!secret || !kvCreds().url || !kvCreds().tok) { back("unavailable"); return; }
  try {
    const key = `bi:signup:${sha256(code)}`;
    const [raw] = await kv([["GET", key]]);
    if (!raw) { back("expired"); return; }
    const { email, domain, kind } = JSON.parse(raw);

    // First sign-in must carry a name. Check before spending the code, so a
    // blank submit just shows the form again with the same link still good.
    const body = formBody(req);
    const firstName = cleanName(body.firstName), lastName = cleanName(body.lastName);
    const [haveFirst] = await kv([["HGET", `bi:user:${email}`, "firstName"]]);
    if (!haveFirst && (!firstName || !lastName)) { await confirmPage(res, code, "Please enter your first and last name."); return; }

    const [still] = await kv([["GET", key], ["DEL", key]]);
    if (!still) { back("expired"); return; }            // lost a race with another tab
    const ms = String(Date.now());
    const names = haveFirst ? [] : ["firstName", firstName, "lastName", lastName];

    if (kind === "sub") {
      // Monthly subscriber: access comes from bi:sub:<email>, no seats.
      if (!(await activeSub(email))) { back("ineligible"); return; }
      await kv([["HSETNX", `bi:user:${email}`, "createdAt", ms], ["HSET", `bi:user:${email}`, "email", email, "plan", "monthly", "verifiedAt", ms, ...names]]);
      await logUsage(req, "signup-verified", email, "monthly");
      res.setHeader("set-cookie", sessionCookie(email, secret, { k: "sub" }));
      back("ok");
      return;
    }

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
    const fields = ["email", email, "domain", domain, "org", org.label || domain, "verifiedAt", ms, ...names];
    await kv([["HSETNX", `bi:user:${email}`, "createdAt", ms], ["HSET", `bi:user:${email}`, ...fields]]);
    await logUsage(req, "signup-verified", email, domain);
    res.setHeader("set-cookie", sessionCookie(email, secret, { o: domain }));
    back("ok");
  } catch (e) {
    console.error("trial verify failed:", e && e.message);
    back("unavailable");
  }
}

// --- session resolution (shared by status, account, profile) -----------------
// Verifies the bi_trial token and applies the live checks. Returns one of:
//   { kind: "none" | "invalid" }
//   { kind: "expired", p, expiry }                         token past its own x
//   { kind: "blocked" | "removed", p }
//   { kind: "ended", p, live }                             org plan + grace over
//   { kind: "valid", p, live, token, cookieTok, queryK }
async function resolveSession(req, secret) {
  const cookie = req.headers.cookie || "";
  const m = cookie.match(/(?:^|;\s*)bi_trial=([^;]+)/);
  const cookieTok = m ? decodeURIComponent(m[1]) : "";
  const queryK = (req.query && req.query.k) || "";
  const token = cookieTok || queryK || "";
  if (!token) return { kind: "none" };
  const v = verify(token, secret);
  if (!v.ok && v.reason === "expired") return { kind: "expired", p: v.payload, expiry: v.payload.x };
  if (!v.ok) return { kind: "invalid" };
  const p = v.payload;
  const live = await liveAccess(p);
  if (live.blocked) return { kind: "blocked", p };
  if (live.state === "removed") return { kind: "removed", p };
  if (live.state === "ended") return { kind: "ended", p, live };
  return { kind: "valid", p, live, token, cookieTok, queryK };
}

const CLEAR_COOKIE = "bi_trial=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax";

// GET ?action=account -- everything the Account page shows.
async function handleAccount(req, res, secret) {
  if (!secret) { res.status(200).json({ ok: false, error: "disarmed" }); return; }
  const sess = await resolveSession(req, secret);
  if (sess.kind === "none" || sess.kind === "invalid") { res.status(200).json({ ok: false, error: "signed_out" }); return; }
  const p = sess.p || {};
  const isEmail = typeof p.c === "string" && p.c.includes("@");
  let user = {}, seatsUsed = null;
  if (isEmail && kvCreds().url && kvCreds().tok) {
    try {
      const cmds = [["HGETALL", `bi:user:${p.c}`]];
      if (p.o) cmds.push(["SCARD", `bi:org-users:${p.o}`]);
      const [flat, n] = await kv(cmds);
      for (let j = 0; j < (flat || []).length; j += 2) user[flat[j]] = flat[j + 1];
      if (n !== undefined) seatsUsed = Number(n);
    } catch { user = {}; }
  }
  const org = sess.live && sess.live.org;
  const lp = sess.live && sess.live.plan;          // org or monthly plan, when there is one
  const sub = lp && lp.sub;
  const scope = lp ? lp.scope : (p.s || []);
  const state = { valid: sess.live && sess.live.state === "grace" ? "grace" : "active", ended: "ended", expired: "ended", blocked: "suspended", removed: "removed" }[sess.kind];
  res.status(200).json({
    ok: true,
    email: isEmail ? p.c : null,
    client: p.c,
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    memberSince: user.createdAt ? Number(user.createdAt) : null,
    plan: {
      kind: p.o ? "org" : p.k === "sub" ? "sub" : "link",
      org: org ? org.label || p.o : p.o || null,
      state,
      allIndices: scope.includes("*"),
      indices: scope.includes("*") ? null : scope.length,
      expiry: lp ? lp.until : (sess.expiry || p.x || null),
      graceUntil: state === "grace" && lp ? lp.graceUntil : null,
      seats: org && org.seats ? org.seats : null,
      seatsUsed,
      // Monthly pass only: whether it renews, and whether Stripe is retrying a card.
      renews: sub ? sub.status !== "canceled" && !sub.cancelAtPeriodEnd : null,
      paymentProblem: sub ? sub.status === "past_due" : false,
    },
  });
}

// POST ?action=profile { firstName, lastName } -- only for signed-up users.
async function handleProfile(req, res, secret) {
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }
  if (!secret || !kvCreds().url || !kvCreds().tok) { res.status(503).json({ ok: false, error: "unavailable" }); return; }
  const sess = await resolveSession(req, secret);
  if (sess.kind !== "valid" || !(sess.p.o || sess.p.k === "sub")) { res.status(403).json({ ok: false, error: "not_signed_in" }); return; }
  const body = formBody(req);
  const firstName = cleanName(body.firstName), lastName = cleanName(body.lastName);
  if (!firstName || !lastName) { res.status(400).json({ ok: false, error: "name_required" }); return; }
  await kv([["HSET", `bi:user:${sess.p.c}`, "firstName", firstName, "lastName", lastName]]);
  res.status(200).json({ ok: true, firstName, lastName });
}

module.exports = handler;
module.exports.issueSignInLink = issueSignInLink;
module.exports.planState = planState;

async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const secret = process.env.TRIAL_SECRET;
  const action = req.query && req.query.action;
  if (action === "signup") { await handleSignupRequest(req, res, secret); return; }
  if (action === "account") { await handleAccount(req, res, secret); return; }
  if (action === "profile") { await handleProfile(req, res, secret); return; }
  if (action === "signout") {
    if (req.method !== "POST") { res.status(405).json({ ok: false }); return; }
    res.setHeader("set-cookie", CLEAR_COOKIE);
    res.status(200).json({ ok: true });
    return;
  }
  if (req.query && req.query.verify) { await handleVerify(req, res, secret); return; }

  if (!secret) { res.status(200).json({ armed: false }); return; }

  const sess = await resolveSession(req, secret);
  const nowSec = Math.floor(Date.now() / 1000);
  if (sess.kind === "none") { res.status(200).json({ armed: true, status: "none" }); return; }
  if (sess.kind === "invalid") { res.status(200).json({ armed: true, status: "invalid" }); return; }
  const p = sess.p;
  if (sess.kind === "expired") {
    await logUsage(req, "expired-open", p && p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: sess.expiry, client: p.c });
    return;
  }
  if (sess.kind === "blocked" || sess.kind === "removed") {
    await logUsage(req, `${sess.kind}-open`, p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: nowSec - 1, client: p.c });
    return;
  }
  // The org's plan ran out (grace included). Keep the cookie: if the org is
  // renewed, this same login is valid again with nothing for the user to do.
  const live = sess.live;
  const orgName = live.plan && live.plan.kind === "org" ? live.plan.name : undefined;
  if (sess.kind === "ended") {
    await logUsage(req, "expired-open", p.c, null);
    res.status(200).json({ armed: true, status: "expired", expiry: live.plan ? live.plan.until : nowSec - 1, client: p.c, org: orgName, plan: live.plan ? live.plan.kind : undefined });
    return;
  }
  await logUsage(req, "open", p.c, null);

  let firstName;
  if ((p.o || p.k === "sub") && live.state) {
    // Rolling session: an active user never hits the 90-day login limit.
    if (nowSec - (p.i || 0) > REFRESH_AFTER_SEC) res.setHeader("set-cookie", sessionCookie(p.c, secret, p.o ? { o: p.o } : { k: "sub" }));
    try { [firstName] = await kv([["HGET", `bi:user:${p.c}`, "firstName"]]); } catch { firstName = undefined; }
  } else if (!sess.cookieTok && sess.queryK) {
    // Valid — persist the cookie if the token arrived via ?k= so refreshes work.
    const maxAge = Math.max(0, (p.x || 0) - nowSec);
    res.setHeader("set-cookie", `bi_trial=${encodeURIComponent(sess.token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`);
  }
  res.status(200).json({
    armed: true, status: "valid", client: p.c,
    scope: live.plan ? live.plan.scope : p.s,
    expiry: live.plan ? live.plan.until : p.x,
    plan: live.plan ? live.plan.kind : undefined,
    org: orgName,
    firstName: firstName || undefined,
    graceUntil: live.state === "grace" && live.plan ? live.plan.graceUntil : undefined,
  });
};
