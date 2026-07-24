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

  if (!kvCreds().url || !kvCreds().tok) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send("<body style='font-family:sans-serif;padding:40px'><h2>Usage logging not enabled yet</h2><p>Create a Vercel KV store (Storage tab) to switch it on — it auto-injects the KV_REST_API_* env vars, then this page fills in.</p></body>");
    return;
  }

  let events = [], clients = [], hashes = [];
  try {
    const [ev, cl] = await kv([["LRANGE", "bi:events", "0", "300"], ["SMEMBERS", "bi:clients"]]);
    events = (ev || []).map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    clients = cl || [];
    if (clients.length) hashes = await kv(clients.map((c) => ["HGETALL", `bi:client:${c}`]));
  } catch (e) {
    res.status(502).send("KV read failed: " + esc(e.message));
    return;
  }

  // Per-client summary (HGETALL returns a flat [field,val,...] array).
  const rows = clients.map((c, i) => {
    const flat = hashes[i] || [];
    const h = {};
    for (let j = 0; j < flat.length; j += 2) h[flat[j]] = flat[j + 1];
    return { c, hits: Number(h.hits || 0), last: Number(h.last || 0), lastEvent: h.lastEvent || "", lastFile: h.lastFile || "" };
  }).sort((a, b) => b.last - a.last);

  const summary = rows.map((r) => `<tr>
    <td><b>${esc(r.c)}</b></td><td style="text-align:right">${r.hits}</td>
    <td>${r.last ? ago(r.last) : "—"}</td><td>${esc(r.lastEvent)}</td><td style="color:#5B6B7B">${esc(r.lastFile)}</td>
  </tr>`).join("") || `<tr><td colspan="5" style="color:#98A2AF">No activity logged yet.</td></tr>`;

  const feed = events.slice(0, 200).map((e) => `<tr>
    <td style="white-space:nowrap;color:#5B6B7B">${hhmm(e.t)}</td>
    <td><b>${esc(e.c)}</b></td><td>${esc(e.ev)}</td><td style="color:#5B6B7B">${esc(e.f || "")}</td>
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
    <table><tr><th>Client</th><th style="text-align:right">Hits</th><th>Last seen</th><th>Last event</th><th>Last file</th></tr>${summary}</table>
    <h2>Recent activity</h2>
    <table><tr><th>Time (UTC)</th><th>Client</th><th>Event</th><th>File</th><th>IP</th></tr>${feed}</table>
  </div></body></html>`);
};
