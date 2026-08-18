// Baton Index — owner-only usage dashboard.
//
// Reads the client-tagged usage events that api/trial.js + api/data.js write to
// Vercel KV / Upstash, and renders a simple per-client summary + recent feed.
// Gated by ?key=<APPROVE_SECRET> (reuses an existing owner secret — no new env).
// Self-contained CommonJS, mirroring the other api/* functions.
//
// Enable by provisioning a Vercel KV store (Storage tab) — it auto-injects
// KV_REST_API_URL + KV_REST_API_TOKEN. Until then this reports "not enabled".
const crypto = require("crypto");

function eq(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// --- owner mint (?mint=<tier>&client=<slug>[&days=N]) ------------------------
// Server-side twin of scripts/mint-trial.mjs, so the owner can mint from the
// usage dashboard without a local checkout + .trial-secret. Signs with the
// production TRIAL_SECRET, so links are always valid in production. Keep
// ALL_IDS + TIERS in sync with scripts/mint-trial.mjs, or a dashboard-minted
// link would grant different access than one minted by hand.
const ALL_IDS = [
  "r1bschool", "r1eschool", "r1university", "r1medical", "r1law", "r1provost",
  "usag", "usnursing", "uspharmacy", "useducation", "r1arts", "uspublichealth",
  "uslac", "ussystem", "usr2", "usvet", "usgrad", "usadminleaders",
];
const TIERS = {
  day:     { label: "Day Pass",     scope: ["r1bschool", "r1university", "r1provost"], days: 1 },
  project: { label: "Project Pass", scope: ALL_IDS,                                    days: 30 },
  firm:    { label: "Firm Plan",    scope: ALL_IDS,                                    days: 365 },
  owner:   { label: "Owner (all indices + future)", scope: ["*"],                      days: 3650 },
};
const MINT_DOMAIN = (process.env.BI_DOMAIN || "https://batonindex.com").replace(/\/+$/, "");

// Trial-token signing, matching lib/trial-token.mjs's format exactly (same
// Node-crypto reimplementation as api/stripe-webhook.js's mintDayPassToken).
function b64urlEncode(str) { return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function hmacToken(secret, msg) { return crypto.createHmac("sha256", secret).update(msg).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function mintToken(client, scope, days, secret) {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + days * 86400;
  const payload = { c: client, s: scope, x: expSec, i: nowSec };
  const body = b64urlEncode(JSON.stringify(payload));
  return { token: `${body}.${hmacToken(secret, body)}`, expSec };
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

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function ago(ms) {
  const s = Math.max(0, Math.floor((Date.now() - Number(ms)) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
const hhmm = (t) => new Date(Number(t)).toISOString().replace("T", " ").slice(0, 16) + "Z";

// Human-readable one-liner for an event record, across every kind api/log.js
// (search, filter, detail, export, consent) and api/data.js (dataset views,
// which stamp `f` for the file/dataset name) can produce.
function describeEvent(e) {
  if (e.ev === "search") return `${e.src || ""}: ${e.q || ""}`;
  if (e.ev === "filter") return Object.keys(e.filters || {}).map((k) => `${k}=${Array.isArray(e.filters[k]) ? e.filters[k].join("/") : e.filters[k]}`).join("; ");
  if (e.ev === "detail") return e.university ? `${e.name} — ${e.university}` : (e.name || "");
  if (e.ev === "export") return (e.items || []).map((it) => it && it.name).filter(Boolean).join(", ");
  if (e.ev === "consent") return `v${e.v || ""}`;
  return e.f || "";
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  const secret = process.env.APPROVE_SECRET;
  const key = (req.query && (req.query.key || req.query.k)) || "";
  if (!secret || !eq(key, secret)) { res.status(403).send("Forbidden"); return; }

  // Owner reset: ?key=...&reset=1 wipes the usage log (destructive, owner-only).
  if (req.query && req.query.reset === "1") {
    if (!kvCreds().url || !kvCreds().tok) { res.status(200).send("KV not enabled."); return; }
    try {
      const [clients] = await kv([["SMEMBERS", "bi:clients"]]);
      const cmds = [["DEL", "bi:events"], ["DEL", "bi:clients"]];
      for (const c of clients || []) cmds.push(["DEL", `bi:client:${c}`]);
      await kv(cmds);
      res.status(200).send("Usage log cleared.");
    } catch (e) { res.status(502).send("clear failed: " + esc(e.message)); }
    return;
  }

  // Per-client revocation switch — instantly cuts one client's access without
  // rotating TRIAL_SECRET (which would kill every trial/paid link at once).
  // Checked by api/data.js + api/trial.js on every request.
  const blockTarget = req.query && (req.query.block || req.query.unblock);
  if (blockTarget) {
    if (!kvCreds().url || !kvCreds().tok) { res.status(200).send("KV not enabled."); return; }
    const c = String(blockTarget).slice(0, 80);
    try {
      if (req.query.block) await kv([["SET", `bi:blocked:${c}`, "1"]]);
      else await kv([["DEL", `bi:blocked:${c}`]]);
      res.setHeader("location", `/api/usage?key=${encodeURIComponent(key)}`);
      res.status(302).send("");
    } catch (e) { res.status(502).send("update failed: " + esc(e.message)); }
    return;
  }

  // Owner mint: ?key=...&mint=<tier>&client=<slug>[&days=N] — returns the link.
  if (req.query && req.query.mint) {
    const tierKey = String(req.query.mint);
    const tier = TIERS[tierKey];
    const client = String(req.query.client || "").trim().slice(0, 80);
    const days = Math.min(3650, Math.max(1, parseInt(req.query.days, 10) || (tier ? tier.days : 0)));
    const fail = (code, msg) => { res.setHeader("content-type", "text/html; charset=utf-8"); res.status(code).send(`<body style='font-family:sans-serif;padding:40px'><h2>Mint failed</h2><p>${esc(msg)}</p><p><a href="/api/usage?key=${encodeURIComponent(key)}">← back to usage</a></p></body>`); };
    if (!tier) { fail(400, `Unknown tier "${tierKey}". Use one of: ${Object.keys(TIERS).join(", ")}.`); return; }
    if (!client) { fail(400, "A client tag is required (e.g. opus-associate)."); return; }
    const trialSecret = process.env.TRIAL_SECRET;
    if (!trialSecret) { fail(503, "TRIAL_SECRET is not set in Vercel, so a production-valid link can't be signed."); return; }

    const { token, expSec } = mintToken(client, tier.scope, days, trialSecret);
    const link = `${MINT_DOMAIN}/?k=${token}`;
    const expiryISO = new Date(expSec * 1000).toISOString().slice(0, 10);
    const scopeLabel = tier.scope.includes("*") ? "ALL indices (wildcard — includes any future index)" : `all ${tier.scope.length} indices`;
    // Audit trail only: record the mint in the event feed, but don't touch the
    // bi:client:<c> hash — hits/last-seen must stay pure client activity.
    if (kvCreds().url && kvCreds().tok) {
      try { await kv([["LPUSH", "bi:events", JSON.stringify({ c: client, ev: "mint", f: `${tierKey} · ${days}d`, t: Date.now() })], ["LTRIM", "bi:events", "0", "1999"]]); } catch { /* best-effort */ }
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(`<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:40px;max-width:760px">
      <h2 style="color:#A31F34">Link minted</h2>
      <p><b>Client:</b> ${esc(client)}<br><b>Tier:</b> ${esc(tier.label)}<br><b>Indices:</b> ${esc(scopeLabel)}<br><b>Expires:</b> ${esc(expiryISO)} (${days} days)</p>
      <p><input readonly value="${esc(link)}" onclick="this.select()" style="width:100%;padding:10px;font-size:13px;border:1px solid #E6E9EE;border-radius:8px"></p>
      <p style="color:#5B6B7B;font-size:13px">Click the field to select, then copy. The link is stateless — it is not stored anywhere, so copy it now.</p>
      <p><a href="/api/usage?key=${encodeURIComponent(key)}">← back to usage</a></p></body>`);
    return;
  }

  if (!kvCreds().url || !kvCreds().tok) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send("<body style='font-family:sans-serif;padding:40px'><h2>Usage logging not enabled yet</h2><p>Create a Vercel KV store (Storage tab) to switch it on — it auto-injects the KV_REST_API_* env vars, then this page fills in.</p></body>");
    return;
  }

  let events = [], clients = [], hashes = [], blockedFlags = [], slateBlobs = [];
  try {
    const [ev, cl] = await kv([["LRANGE", "bi:events", "0", "300"], ["SMEMBERS", "bi:clients"]]);
    events = (ev || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    clients = cl || [];
    if (clients.length) {
      [hashes, blockedFlags, slateBlobs] = await Promise.all([
        kv(clients.map((c) => ["HGETALL", `bi:client:${c}`])),
        kv(clients.map((c) => ["GET", `bi:blocked:${c}`])),
        kv(clients.map((c) => ["GET", `bi:slate:${c}`])),
      ]);
    }
  } catch (e) {
    res.status(502).send("KV read failed: " + esc(e.message));
    return;
  }

  // Per-client summary (HGETALL returns a flat [field,val,...] array).
  const rows = clients.map((c, i) => {
    const flat = hashes[i] || [];
    const h = {};
    for (let j = 0; j < flat.length; j += 2) h[flat[j]] = flat[j + 1];
    let slate = [];
    try { slate = JSON.parse(slateBlobs[i] || "[]"); } catch { slate = []; }
    return {
      c, hits: Number(h.hits || 0), last: Number(h.last || 0), lastEvent: h.lastEvent || "",
      lastFile: h.lastFile || "", lastQuery: h.lastQuery || "", lastDetail: h.lastDetail || "",
      consentedAt: Number(h.consentedAt || 0), blocked: !!blockedFlags[i], slate,
    };
  }).sort((a, b) => b.last - a.last);

  const summary = rows.map((r) => `<tr>
    <td><b>${esc(r.c)}</b>${r.blocked ? ' <span style="color:#A31F34;font-weight:700">· blocked</span>' : ""}</td>
    <td style="text-align:right">${r.hits}</td>
    <td>${r.last ? ago(r.last) : "—"}</td><td>${esc(r.lastEvent)}</td>
    <td style="color:#5B6B7B">${esc(r.lastQuery || r.lastFile || r.lastDetail)}</td>
    <td>${r.consentedAt ? ago(r.consentedAt) : "—"}</td>
    <td>${r.slate.length
      ? `<details><summary style="cursor:pointer;color:#011F5B">${r.slate.length} candidate(s)</summary>` +
        `<div style="margin-top:4px;color:#5B6B7B">${r.slate.map((s) => esc(`${s.name}${s.university ? " — " + s.university : ""}`)).join("<br>")}</div></details>`
      : "—"}</td>
    <td>
      <a href="/api/usage?key=${encodeURIComponent(key)}&${r.blocked ? "unblock" : "block"}=${encodeURIComponent(r.c)}"
         style="color:${r.blocked ? "#1a7f4b" : "#A31F34"};font-weight:600;text-decoration:none">
        ${r.blocked ? "Unblock" : "Block"}
      </a>
    </td>
  </tr>`).join("") || `<tr><td colspan="8" style="color:#98A2AF">No activity logged yet.</td></tr>`;

  const feed = events.slice(0, 200).map((e) => `<tr>
    <td style="white-space:nowrap;color:#5B6B7B">${hhmm(e.t)}</td>
    <td><b>${esc(e.c)}</b></td><td>${esc(e.ev)}</td>
    <td style="color:#5B6B7B">${esc(describeEvent(e))}</td>
    <td style="color:#98A2AF">${esc(e.ip || "")}</td>
  </tr>`).join("");

  res.setHeader("content-type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Baton Index — usage</title>
  <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#F4F6F8;color:#16233A}
  .wrap{max-width:900px;margin:0 auto;padding:28px 20px}h1{color:#A31F34;font-size:20px;margin:0 0 4px}
  h2{font-size:14px;color:#5B6B7B;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.04em}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;font-size:13px}
  th,td{padding:8px 12px;border-bottom:1px solid #E6E9EE;text-align:left}th{background:#fafbfc;color:#5B6B7B;font-size:11px;text-transform:uppercase}</style></head>
  <body><div class="wrap">
    <h1>Baton Index — usage</h1><div style="font-size:13px;color:#5B6B7B">${rows.length} client(s) · ${events.length} recent events</div>
    <h2>Clients</h2>
    <table><tr><th>Client</th><th style="text-align:right">Hits</th><th>Last seen</th><th>Last event</th><th>Detail</th><th>Consented</th><th>Slate</th><th>Access</th></tr>${summary}</table>
    <h2>Recent activity</h2>
    <table><tr><th>Time (UTC)</th><th>Client</th><th>Event</th><th>Detail</th><th>IP</th></tr>${feed}</table>
    <h2>Mint a link</h2>
    <form method="get" action="/api/usage" style="background:#fff;border-radius:10px;padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;font-size:13px">
      <input type="hidden" name="key" value="${esc(key)}">
      <label>Client<br><input name="client" placeholder="opus-associate" required style="padding:7px;border:1px solid #E6E9EE;border-radius:7px"></label>
      <label>Tier<br><select name="mint" style="padding:7px;border:1px solid #E6E9EE;border-radius:7px">
        <option value="project">Project Pass (all indices)</option><option value="day">Day Pass (3 indices)</option>
        <option value="firm">Firm Plan (all indices)</option><option value="owner">Owner (wildcard)</option>
      </select></label>
      <label>Days (blank = tier default)<br><input name="days" type="number" min="1" max="3650" placeholder="21" style="width:90px;padding:7px;border:1px solid #E6E9EE;border-radius:7px"></label>
      <button style="padding:8px 14px;background:#A31F34;color:#fff;border:none;border-radius:7px;font-weight:600;cursor:pointer">Mint</button>
    </form>
  </div></body></html>`);
};
