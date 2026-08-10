// Baton Index — consolidated client-activity logging endpoint.
//
// Combines what were three separate functions (search-log.js, consent.js,
// slate.js) into one, dispatched by body.kind. They were split apart for
// clarity while each was being built, but merging them is free: they're all
// small, fire-and-forget, best-effort writes to the same usage KV, and they
// shared near-identical client-verification code. The merge also frees up
// Serverless Function slots -- the Vercel Hobby plan caps a deployment at 12
// functions, and this project was about to exceed it.
//
// kind: "search" -- log a Slate Builder search term (name/keyword/school).
// kind: "consent" -- record click-through agreement to the ToS/Privacy Policy.
// kind: "slate" -- mirror the Slate Builder shortlist to KV (mode: "sync" |
//   "export"), so the owner can watch a client's candidate list take shape
//   live, not just at export time. An "export" call also embeds the exact
//   exported items in the event record itself, not just a count -- bi:slate:
//   is a mutable current-state mirror that later syncs overwrite, so it can't
//   answer "what did they export on <date>" on its own.
// kind: "filter" -- snapshot of the Individual Search filter panel (sort,
//   discipline, states, tenure window, etc.) once it settles after a change.
//   Sent as a sparse object (only non-default values) to keep events small.
// kind: "detail" -- a candidate's expanded detail row was opened.
//
// Same fail-safe KV design throughout: a no-op until KV_REST_API_* env vars
// exist, and never throws back to the client. Self-contained CommonJS,
// mirroring api/data.js.
const crypto = require("crypto");
const MAX_QUERY_CHARS = 200;
const SOURCES = new Set(["slate-name", "slate-keyword", "slate-school"]);
const MAX_ITEMS = 200;
const MAX_FIELD_CHARS = 200;
const CONSENT_VERSION = "1";
const MAX_FILTER_KEYS = 20;
const MAX_FILTER_ARRAY_ITEMS = 50;

// The client tag must come from the signed bi_trial cookie, never from the
// request body -- otherwise anyone who guesses a client name (e.g.
// "opus-associate") could POST fake activity, a fake consent record, or a
// fabricated candidate list attributed to them. Same HMAC verify as
// api/data.js / api/trial.js.
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

function kvCreds() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    tok: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}
async function kv(commands) {
  const { url, tok } = kvCreds();
  if (!url || !tok) return;
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(commands),
    });
  } catch { /* logging is best-effort; never fail the request */ }
}

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ITEMS).map((it) => ({
    name: String((it && it.name) || "").slice(0, MAX_FIELD_CHARS),
    school: String((it && it.school) || "").slice(0, MAX_FIELD_CHARS),
    university: String((it && it.university) || "").slice(0, MAX_FIELD_CHARS),
  })).filter((it) => it.name);
}

// Keep only scalar/array-of-scalar values, capped in count and length, so a
// malformed or hostile body can't blow up the event record or the KV write.
function sanitizeFilters(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(raw)) {
    if (n >= MAX_FILTER_KEYS) break;
    const key = String(k).slice(0, 40);
    const v = raw[k];
    if (Array.isArray(v)) {
      out[key] = v.slice(0, MAX_FILTER_ARRAY_ITEMS).map((x) => String(x).slice(0, MAX_FIELD_CHARS));
    } else if (typeof v === "string") {
      out[key] = v.slice(0, MAX_FIELD_CHARS);
    } else if (typeof v === "number" || typeof v === "boolean") {
      out[key] = v;
    } else {
      continue;
    }
    n++;
  }
  return out;
}
function summarizeFilters(filters) {
  return Object.keys(filters).map((k) => `${k}=${Array.isArray(filters[k]) ? filters[k].join("/") : filters[k]}`).join("; ").slice(0, MAX_FIELD_CHARS);
}
function summarizeItems(items) {
  const names = items.map((it) => it.name).filter(Boolean);
  const shown = names.slice(0, 5).join(", ");
  return names.length > 5 ? `${shown} +${names.length - 5} more` : shown;
}

async function handleSearch(req, res, client, body) {
  const q = (typeof body.q === "string" ? body.q : "").trim().slice(0, MAX_QUERY_CHARS);
  const source = SOURCES.has(body.source) ? body.source : "slate-name";
  if (!q) { res.status(200).json({ ok: true, logged: false }); return; }

  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rec = JSON.stringify({ c, ev: "search", src: source, q, t: Date.now(), ip });
  await kv([
    ["LPUSH", "bi:events", rec],
    ["LTRIM", "bi:events", "0", "1999"],
    ["SADD", "bi:clients", c],
    ["HSET", `bi:client:${c}`, "last", String(Date.now()), "lastEvent", "search", "lastQuery", `${source}: ${q}`],
    ["HINCRBY", `bi:client:${c}`, "hits", "1"],
  ]);
  res.status(200).json({ ok: true, logged: true });
}

async function handleConsent(req, res, client) {
  if (!client) { res.status(200).json({ ok: true, recorded: false }); return; }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  const rec = JSON.stringify({ c: client, ev: "consent", v: CONSENT_VERSION, t, ip });
  await kv([
    ["LPUSH", "bi:events", rec],
    ["LTRIM", "bi:events", "0", "1999"],
    ["SADD", "bi:clients", client],
    ["HSET", `bi:client:${client}`, "consentedAt", String(t), "consentVersion", CONSENT_VERSION],
  ]);
  res.status(200).json({ ok: true, recorded: true, version: CONSENT_VERSION });
}

async function handleSlate(req, res, client, body) {
  if (!client) { res.status(200).json({ ok: true, logged: false }); return; }
  const { url, tok } = kvCreds();
  if (!url || !tok) { res.status(200).json({ ok: true, logged: false }); return; }

  const items = sanitizeItems(body.items);
  const mode = body.mode === "export" ? "export" : "sync";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();

  const cmds = [
    ["SET", `bi:slate:${client}`, JSON.stringify(items)],
    ["SADD", "bi:clients", client],
    ["HSET", `bi:client:${client}`, "last", String(t), "lastEvent", mode === "export" ? "export" : "slate-sync", "slateCount", String(items.length), "lastDetail", summarizeItems(items)],
  ];
  if (mode === "export") {
    // Embed the exact exported items in the event itself -- bi:slate:<c> above
    // is a live mirror a later sync will overwrite, so it can't reconstruct
    // what a specific past export actually contained.
    const rec = JSON.stringify({ c: client, ev: "export", n: items.length, items, t, ip });
    cmds.push(["LPUSH", "bi:events", rec], ["LTRIM", "bi:events", "0", "1999"], ["HINCRBY", `bi:client:${client}`, "hits", "1"]);
  }
  await kv(cmds);
  res.status(200).json({ ok: true, logged: true });
}

async function handleFilter(req, res, client, body) {
  const filters = sanitizeFilters(body.filters);
  if (!Object.keys(filters).length) { res.status(200).json({ ok: true, logged: false }); return; }
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  const rec = JSON.stringify({ c, ev: "filter", filters, t, ip });
  await kv([
    ["LPUSH", "bi:events", rec],
    ["LTRIM", "bi:events", "0", "1999"],
    ["SADD", "bi:clients", c],
    ["HSET", `bi:client:${c}`, "last", String(t), "lastEvent", "filter", "lastDetail", summarizeFilters(filters)],
  ]);
  res.status(200).json({ ok: true, logged: true });
}

async function handleDetail(req, res, client, body) {
  const name = String(body.name || "").trim().slice(0, MAX_FIELD_CHARS);
  const university = String(body.university || "").trim().slice(0, MAX_FIELD_CHARS);
  if (!name) { res.status(200).json({ ok: true, logged: false }); return; }
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  const rec = JSON.stringify({ c, ev: "detail", name, university, t, ip });
  await kv([
    ["LPUSH", "bi:events", rec],
    ["LTRIM", "bi:events", "0", "1999"],
    ["SADD", "bi:clients", c],
    ["HSET", `bi:client:${c}`, "last", String(t), "lastEvent", "detail", "lastDetail", university ? `${name} — ${university}` : name],
  ]);
  res.status(200).json({ ok: true, logged: true });
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const client = trustedClient(req);

  if (body.kind === "consent") { await handleConsent(req, res, client); return; }
  if (body.kind === "slate") { await handleSlate(req, res, client, body); return; }
  if (body.kind === "filter") { await handleFilter(req, res, client, body); return; }
  if (body.kind === "detail") { await handleDetail(req, res, client, body); return; }
  await handleSearch(req, res, client, body);
};
