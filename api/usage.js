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
// MUST stay in the registry's order and contents -- `mint-trial.mjs --selftest`
// parses this literal and fails if it has drifted from lib/indices.mjs.
//
// It is a literal rather than an import on purpose: this file is CommonJS and
// the registry is ESM, and require()-ing api/data.js (the CJS list of servable
// indices) would pull every dataset JSON into this function's bundle through
// @vercel/nft's static-path tracing, for a list of twenty strings.
const ALL_IDS = [
  "r1bschool", "r1eschool", "r1university", "r1medical", "r1law", "r1provost",
  "usag", "usnursing", "uspharmacy", "useducation", "r1arts", "usr2",
  "ussystem", "uspublichealth", "usvet", "usgrad", "uscreativearts",
  "usadvancement", "uslac", "usadminleaders", "uscommunitycollege",
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

// --- engagement windows -----------------------------------------------------
// The Clients table below answers "has this link ever been used" -- `hits` is an
// all-time counter and `last` a single timestamp, so neither can answer "who is
// still using their link this month", which is the question that decides
// whether a trial gets a follow-up or an expiry. These roll the raw bi:events
// log into 30- and 7-day windows per client tag.
//
// Two kinds of event are deliberately NOT engagement:
//   * "mint" -- an owner action, logged for audit only. Counting it would make
//     every freshly-minted link look like it had been opened by its recipient.
//   * the reserved "public" tag -- the free open link, which is a crowd rather
//     than a recipient, so it gets its own summary instead of a table row.
// "expired-open"/"blocked-open" DO count: someone still trying a dead link is
// engaged, and is the clearest re-sell signal on the page -- but they are also
// counted separately so a row of nothing but bounces can't read as live usage.
const DAY_MS = 86400000;
const PUBLIC_TAG = "public";
const EVENT_CAP = 2000;          // bi:events LTRIM depth -- the log horizon
const SHARED_LINK_IPS = 4;       // distinct IPs in 30d before a link looks forwarded
const isOwnerAction = (e) => e.ev === "mint";
const isRejected = (e) => e.ev === "expired-open" || e.ev === "blocked-open";
const dayKey = (t) => new Date(Number(t)).toISOString().slice(0, 10);
const blankWin = () => ({ events: 0, rejected: 0, days: new Set(), ips: new Set() });

function rollupClients(events, now) {
  const per = new Map();
  for (const e of events) {
    if (!e || !e.t || isOwnerAction(e)) continue;
    const age = now - Number(e.t);
    if (age < 0) continue;
    const c = e.c || PUBLIC_TAG;
    if (!per.has(c)) per.set(c, { c, w30: blankWin(), w7: blankWin(), last: 0 });
    const s = per.get(c);
    if (Number(e.t) > s.last) s.last = Number(e.t);
    for (const [days, w] of [[30, s.w30], [7, s.w7]]) {
      if (age > days * DAY_MS) continue;
      w.events++;
      if (isRejected(e)) w.rejected++;
      w.days.add(dayKey(e.t));
      if (e.ip) w.ips.add(e.ip);
    }
  }
  return per;
}

function rollupIps(events, now, windowDays) {
  const per = new Map();
  for (const e of events) {
    if (!e || !e.ip || !e.t || isOwnerAction(e)) continue;
    if (now - Number(e.t) > windowDays * DAY_MS) continue;
    if (!per.has(e.ip)) per.set(e.ip, { ip: e.ip, hits: 0, rejected: 0, clients: new Set(), days: new Set(), last: 0 });
    const s = per.get(e.ip);
    s.hits++;
    if (isRejected(e)) s.rejected++;
    s.clients.add(e.c || PUBLIC_TAG);
    s.days.add(dayKey(e.t));
    if (Number(e.t) > s.last) s.last = Number(e.t);
  }
  return per;
}

function engagementStatus(s) {
  if (!s || !s.w30.events) return { label: "Dormant", color: "#98A2AF" };
  if (!s.w7.events) return { label: "Fading", color: "#C77700" };
  if (s.w7.events === s.w7.rejected) return { label: "Locked out", color: "#A31F34" };
  return { label: "Active", color: "#1A7F4B" };
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
    const [ev, cl] = await kv([["LRANGE", "bi:events", "0", "-1"], ["SMEMBERS", "bi:clients"]]);
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

  // Engagement windows. `events` is now the whole retained log, so these are
  // real 30/7-day counts -- subject to the horizon note below.
  const now = Date.now();
  const perClient = rollupClients(events, now);
  const free = perClient.get(PUBLIC_TAG) || { c: PUBLIC_TAG, w30: blankWin(), w7: blankWin(), last: 0 };
  const byTag = new Map(rows.map((r) => [r.c, r]));
  const engagement = Array.from(new Set([...clients, ...perClient.keys()]))
    .filter((c) => c !== PUBLIC_TAG)
    .map((c) => {
      const s = perClient.get(c) || { w30: blankWin(), w7: blankWin(), last: 0 };
      const r = byTag.get(c) || {};
      return { c, s, hits: r.hits || 0, last: r.last || s.last || 0, blocked: !!r.blocked, consentedAt: r.consentedAt || 0, status: engagementStatus(s) };
    })
    .sort((a, b) => b.s.w7.events - a.s.w7.events || b.s.w30.events - a.s.w30.events || b.last - a.last);

  // The log is a capped list, so a 30-day window is only honest if the oldest
  // retained event is actually 30+ days old. Say so rather than quietly
  // under-reporting a busy month.
  const stamps = events.map((e) => Number(e && e.t)).filter((t) => t > 0);
  const oldest = stamps.length ? Math.min(...stamps) : 0;
  const horizonDays = oldest ? (now - oldest) / DAY_MS : 0;
  const truncated = events.length >= EVENT_CAP && horizonDays < 30;

  // IPs. Two things are worth an owner's attention: one link tag arriving from
  // many addresses (forwarded link), and one address arriving under several tags
  // (one person holding several links, or a tag being passed around). Neither is
  // proof on its own -- mobile and corporate networks re-address constantly.
  const ipRows = Array.from(rollupIps(events, now, 30).values()).sort((a, b) => b.hits - a.hits);
  const ipFlags = ipRows.map((s) => {
    const reasons = [];
    if (s.clients.size > 1) reasons.push(`${s.clients.size} link tags: ${Array.from(s.clients).slice(0, 5).join(", ")}`);
    if (s.rejected) reasons.push(`${s.rejected} expired/blocked attempt(s)`);
    return { s, reasons };
  }).filter((x) => x.reasons.length);

  // Machine-readable twin of this page (?key=...&json=1), so the rollup can be
  // charted or diffed without scraping the HTML.
  if (req.query && (req.query.json === "1" || req.query.format === "json")) {
    const win = (w) => ({ events: w.events, rejected: w.rejected, activeDays: w.days.size, distinctIps: w.ips.size });
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.status(200).json({
      generatedAt: new Date(now).toISOString(),
      log: { retained: events.length, cap: EVENT_CAP, oldestEvent: oldest ? new Date(oldest).toISOString() : null, horizonDays: Number(horizonDays.toFixed(1)), truncated },
      clients: engagement.map((r) => ({
        client: r.c, status: r.status.label, blocked: r.blocked,
        last30d: win(r.s.w30), last7d: win(r.s.w7),
        allTimeHits: r.hits, lastSeen: r.last ? new Date(r.last).toISOString() : null,
        consentedAt: r.consentedAt ? new Date(r.consentedAt).toISOString() : null,
        possiblyShared: r.s.w30.ips.size >= SHARED_LINK_IPS,
      })),
      freeOpenLink: { last30d: win(free.w30), last7d: win(free.w7), lastSeen: free.last ? new Date(free.last).toISOString() : null },
      ips: ipRows.slice(0, 50).map((s) => ({ ip: s.ip, hits30d: s.hits, activeDays30d: s.days.size, rejected30d: s.rejected, clients: Array.from(s.clients), lastSeen: new Date(s.last).toISOString() })),
    });
    return;
  }

  const engagementTable = engagement.map((r) => {
    const shared = r.s.w30.ips.size >= SHARED_LINK_IPS;
    return `<tr>
    <td><b>${esc(r.c)}</b>${r.blocked ? ' <span style="color:#A31F34;font-weight:700">· blocked</span>' : ""}</td>
    <td style="color:${r.status.color};font-weight:600">${r.status.label}</td>
    <td style="text-align:right">${r.s.w30.events}${r.s.w30.rejected ? ` <span style="color:#A31F34" title="expired or blocked link attempts">(${r.s.w30.rejected}✕)</span>` : ""}</td>
    <td style="text-align:right">${r.s.w30.days.size}</td>
    <td style="text-align:right${shared ? ';color:#C77700;font-weight:600' : ''}">${r.s.w30.ips.size}${shared ? " ⚑" : ""}</td>
    <td style="text-align:right">${r.s.w7.events}${r.s.w7.rejected ? ` <span style="color:#A31F34">(${r.s.w7.rejected}✕)</span>` : ""}</td>
    <td style="text-align:right">${r.s.w7.days.size}</td>
    <td>${r.last ? ago(r.last) : "—"}</td>
    <td style="text-align:right;color:#5B6B7B">${r.hits}</td>
  </tr>`;
  }).join("") || `<tr><td colspan="9" style="color:#98A2AF">No client links have been used yet.</td></tr>`;

  const ipTable = ipRows.slice(0, 15).map((s) => `<tr>
    <td>${esc(s.ip)}</td><td style="text-align:right">${s.hits}</td><td style="text-align:right">${s.days.size}</td>
    <td>${esc(Array.from(s.clients).join(", "))}</td>
    <td style="text-align:right;color:${s.rejected ? "#A31F34" : "#98A2AF"}">${s.rejected}</td>
    <td>${ago(s.last)}</td>
  </tr>`).join("") || `<tr><td colspan="6" style="color:#98A2AF">No IPs recorded in the last 30 days.</td></tr>`;

  const ipFlagList = ipFlags.length
    ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:13px">${ipFlags.slice(0, 15).map((x) => `<li><b>${esc(x.s.ip)}</b> — ${esc(x.reasons.join("; "))} · ${x.s.hits} hit(s), last ${ago(x.s.last)}</li>`).join("")}</ul>`
    : `<div style="font-size:13px;color:#5B6B7B">Nothing flagged: no address is arriving under more than one link tag, and no expired or blocked links are being retried.</div>`;

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
    <h1>Baton Index — usage</h1><div style="font-size:13px;color:#5B6B7B">${rows.length} client(s) · ${events.length} event(s) retained${oldest ? ` · log reaches back ${horizonDays.toFixed(1)} day(s)` : ""} · <a href="/api/usage?key=${encodeURIComponent(key)}&json=1" style="color:#011F5B">JSON</a></div>
    ${truncated ? `<div style="margin-top:10px;padding:10px 12px;background:#FFF4E5;border:1px solid #F0D9B5;border-radius:8px;font-size:13px;color:#7A5200">The event log is full (${EVENT_CAP} events) and only reaches back ${horizonDays.toFixed(1)} days, so the 30-day column is cut short — real 30-day totals are higher than shown. The 7-day column is unaffected.</div>` : ""}

    <h2>Engagement — customised links</h2>
    <div style="font-size:12px;color:#5B6B7B;margin-bottom:6px">One row per link tag. <b>Active</b> = used in the last 7 days, <b>Fading</b> = used in the last 30 but not 7, <b>Dormant</b> = nothing in 30 days, <b>Locked out</b> = only expired/blocked attempts. ✕ marks those attempts; ⚑ marks ${SHARED_LINK_IPS}+ distinct addresses on one link.</div>
    <table><tr><th>Client</th><th>Status</th><th style="text-align:right">30d events</th><th style="text-align:right">30d days</th><th style="text-align:right">30d IPs</th><th style="text-align:right">7d events</th><th style="text-align:right">7d days</th><th>Last seen</th><th style="text-align:right">All-time</th></tr>${engagementTable}</table>

    <h2>Free open link (public tier)</h2>
    <table><tr><th>Window</th><th style="text-align:right">Events</th><th style="text-align:right">Active days</th><th style="text-align:right">Distinct IPs</th></tr>
      <tr><td>Last 30 days</td><td style="text-align:right">${free.w30.events}</td><td style="text-align:right">${free.w30.days.size}</td><td style="text-align:right">${free.w30.ips.size}</td></tr>
      <tr><td>Last 7 days</td><td style="text-align:right">${free.w7.events}</td><td style="text-align:right">${free.w7.days.size}</td><td style="text-align:right">${free.w7.ips.size}</td></tr></table>
    <div style="font-size:12px;color:#5B6B7B;margin-top:4px">Anyone with no token — or an expired one — lands here, so distinct IPs is the closest thing to a visitor count. It is a floor, not a census: the free meter is per-browser, and one office shares one address.</div>

    <h2>IPs worth attention (last 30 days)</h2>
    ${ipFlagList}
    <table style="margin-top:10px"><tr><th>IP</th><th style="text-align:right">30d hits</th><th style="text-align:right">Days</th><th>Link tag(s)</th><th style="text-align:right">Rejected</th><th>Last seen</th></tr>${ipTable}</table>
    <div style="font-size:12px;color:#5B6B7B;margin-top:4px">Addresses are a weak identifier — mobile and corporate networks re-address constantly, and a VPN moves a person between them — so treat a flag as a prompt to look, never as proof a link was shared.</div>

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
