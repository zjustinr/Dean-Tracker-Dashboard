// Baton Index — gated data endpoint (Hardening Step 3, serverless-function gate).
//
// A rewrite (vercel.json) sends /data/:path* -> /api/data?f=:path*; this function
// verifies the trial token, enforces per-dataset scope, and only then returns the
// JSON. Data is assembled on demand from the committed src/data JSON, pulled in by
// static require() so Vercel's file tracer bundles it (no includeFiles config).
//
// Deliberately self-contained CommonJS, mirroring api/pq-news.js — the one
// function format known to deploy on this static Vercel project. Earlier ESM
// (.mjs) + lib-import + functions-config variants failed the Vercel build.
//
// Armed by TRIAL_SECRET. Until it is set in Vercel (Step 5) the gate is inert
// (fail-open), so this changes nothing user-facing on the live site.
const crypto = require("crypto");

// --- token verify (HMAC-SHA256; compatible with the Web-Crypto mint CLI) ------
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
function verify(token, secret, nowSec) {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  let payload;
  try { payload = JSON.parse(b64urlDecode(body)); } catch { return { ok: false, reason: "malformed" }; }
  if (!timingSafe(sig, hmac(secret, body))) return { ok: false, reason: "bad-signature" };
  if (!payload || !Array.isArray(payload.s) || typeof payload.x !== "number") return { ok: false, reason: "malformed" };
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  if (now >= payload.x) return { ok: false, reason: "expired", payload };
  return { ok: true, payload };
}

// --- dataset assembly (mirrors lib/dataset-assembly.mjs) -----------------------
// Lazy require() thunks with FULLY STATIC literal paths so Vercel's file tracer
// (@vercel/nft) bundles each file exactly (no concat heuristic); require() caches,
// so a file is parsed only on first use of that dataset.
const SPEC = {
  top100:      { deans: () => require("../artifacts/dean-dashboard/src/data/deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/schools-bsq.json"), schools: null, split: true },
  r1bschool:   { deans: () => require("../artifacts/dean-dashboard/src/data/r1-bschool-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-bschool-bsq.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-bschool-schools.json"), split: true },
  r1eschool:   { deans: () => require("../artifacts/dean-dashboard/src/data/r1-eschool-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-eschool-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-eschool-schools.json"), split: true },
  r1university:{ deans: () => require("../artifacts/dean-dashboard/src/data/r1-university-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-university-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-university-schools.json"), split: false },
  r1medical:   { deans: () => require("../artifacts/dean-dashboard/src/data/r1-medschool-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-medschool-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-medschool-schools.json"), split: false },
  r1law:       { deans: () => require("../artifacts/dean-dashboard/src/data/r1-lawschool-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-lawschool-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-lawschool-schools.json"), split: false },
  r1provost:   { deans: () => require("../artifacts/dean-dashboard/src/data/r1-provost-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-provost-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-provost-schools.json"), split: false },
  usag:        { deans: () => require("../artifacts/dean-dashboard/src/data/r1-agschool-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-agschool-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-agschool-schools.json"), split: false },
  usnursing:   { deans: () => require("../artifacts/dean-dashboard/src/data/r1-nursing-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-nursing-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-nursing-schools.json"), split: false },
  uspharmacy:  { deans: () => require("../artifacts/dean-dashboard/src/data/r1-pharmacy-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-pharmacy-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-pharmacy-schools.json"), split: false },
  useducation: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-education-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-education-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-education-schools.json"), split: false },
  r1arts:      { deans: () => require("../artifacts/dean-dashboard/src/data/r1-arts-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-arts-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-arts-schools.json"), split: false },
  usr2: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-r2public-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-r2public-schools.json"), split: false },
  ussystem: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-system-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-system-schools.json"), split: false },
  uslac: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-lac-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-lac-schools.json"), split: false },
  uspublichealth: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-schools.json"), split: false },
  usvet:       { deans: () => require("../artifacts/dean-dashboard/src/data/r1-vet-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-vet-schools.json"), split: false },
  usgrad:      { deans: () => require("../artifacts/dean-dashboard/src/data/r1-grad-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-grad-schools.json"), split: false },
  uscreativearts: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-camd-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-camd-schools.json"), split: false },
  usadvancement: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-advancement-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-advancement-schools.json"), split: false },
};
const ENRICHMENT = {
  "dean-photos.json": () => require("../artifacts/dean-dashboard/src/data/dean-photos.json"),
  "leader-research.json": () => require("../artifacts/dean-dashboard/src/data/leader-research.json"),
  "leader-careers.json": () => require("../artifacts/dean-dashboard/src/data/leader-careers.json"),
  "affinity-by-school.json": () => require("../artifacts/dean-dashboard/src/data/affinity-by-school.json"),
  "scout-insights.json": () => require("../artifacts/dean-dashboard/src/data/scout-insights.json"),
  "employer-affinity.json": () => require("../artifacts/dean-dashboard/src/data/employer-affinity.json"),
};

function splitOpsFromIS(deans) {
  return deans.map((d) => {
    let b = d.disciplineBroad;
    if (b === "Operations & IS") b = /information/i.test(d.discipline || "") ? "Information Systems" : "Operations Management";
    else if (b === "Operations") b = "Operations Management";
    return b === d.disciplineBroad ? d : Object.assign({}, d, { disciplineBroad: b });
  });
}
function assemble(id) {
  const s = SPEC[id];
  let deans = s.deans();
  if (s.split) deans = splitOpsFromIS(deans);
  return { deans, bsq: s.bsq ? s.bsq() : [], schools: s.schools ? s.schools() : [] };
}

// --- gate (mirrors lib/trial-gate.mjs) ----------------------------------------
const DATASET_IDS = new Set(Object.keys(SPEC));

// Freemium: these indices are open to everyone (no token). A valid token widens
// access to its own scope; the paywall/day-pass grants all twelve. Keep in sync
// with PUBLIC_SCOPE in src/data/TrialContext.tsx.
const PUBLIC_SCOPE = ["r1bschool"];

// Union of dean|university keys across the datasets a scope can see — used to
// filter the shared leader-research enrichment so a scoped visitor (public tier
// included) only receives research for leaders they're allowed to see.
function leaderKeysForScope(scope) {
  const keys = new Set();
  for (const id of scope) {
    const s = SPEC[id];
    if (!s || !s.deans) continue;
    let deans;
    try { deans = s.deans(); } catch { continue; }
    for (const d of deans) {
      if (d && d.dean && d.university) {
        keys.add(`${String(d.dean).trim().toLowerCase()}|${String(d.university).trim().toLowerCase()}`);
      }
    }
  }
  return keys;
}
function filteredResearch(scope) {
  const full = ENRICHMENT["leader-research.json"]();
  const keys = leaderKeysForScope(scope);
  const out = {};
  for (const k in full) if (keys.has(k)) out[k] = full[k];
  return out;
}
// Same scope gate for the affinity map: keep only the leaders (by display-record
// key) the visitor is allowed to see, per school. A scoped visitor gets ties from
// their indices; the owner ("*") gets everything.
function filteredAffinity(scope) {
  const full = ENRICHMENT["affinity-by-school.json"]();
  const keys = leaderKeysForScope(scope);
  const out = {};
  for (const school in full) {
    const kept = full[school].filter((e) => keys.has(e.enrichKey));
    if (kept.length) out[school] = kept;
  }
  return out;
}
// scout-insights.json is keyed by dataset id at the top level, so the scope
// gate is a plain key filter -- a scoped visitor only sees the mined patterns
// for indices they're already allowed to browse.
function filteredScoutInsights(scope) {
  const full = ENRICHMENT["scout-insights.json"]();
  const out = {};
  for (const id in full) if (scope.has(id)) out[id] = full[id];
  return out;
}
// Same shape/gate as scout-insights.json (keyed by dataset id at the top level).
function filteredEmployerAffinity(scope) {
  const full = ENRICHMENT["employer-affinity.json"]();
  const out = {};
  for (const id in full) if (scope.has(id)) out[id] = full[id];
  return out;
}

// Lightweight usage logging to Vercel KV / Upstash (fail-safe: a no-op until the
// KV_REST_API_* env vars exist). Keyed by the token's client tag `c`, so every
// trial/paid link is attributable with no per-link setup.
async function logUsage(req, ev, client, file) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
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
  let f = (req.query && (req.query.f || req.query.path)) || "";
  if (Array.isArray(f)) f = f[0];
  f = String(f).replace(/^\/?(data\/)?/, "").replace(/[^a-zA-Z0-9._-]/g, ""); // sanitize
  if (!f.endsWith(".json")) { res.status(400).json({ error: "bad_request" }); return; }
  const id = f.replace(/\.json$/, "");
  const isPhotos = f === "dean-photos.json";
  const isResearch = f === "leader-research.json";
  const isAffinity = f === "affinity-by-school.json";
  const isScoutInsights = f === "scout-insights.json";
  const isEmployerAffinity = f === "employer-affinity.json";

  const secret = process.env.TRIAL_SECRET;
  let reason = "disarmed", setCookie = null;
  let scope = null; // null = disarmed (unrestricted); otherwise a Set of allowed dataset ids
  let client = null; // token's client tag, for usage logging

  if (secret) {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(/(?:^|;\s*)bi_trial=([^;]+)/);
    const cookieTok = m ? decodeURIComponent(m[1]) : "";
    const queryK = (req.query && req.query.k) || "";
    const token = cookieTok || queryK || "";
    const v = token ? verify(token, secret) : { ok: false, reason: "no_token" };
    if (v.ok) {
      scope = new Set(v.payload.s || []);
      reason = "armed";
      client = v.payload.c || null;
      if (!cookieTok && queryK) {
        const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
        setCookie = `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
      }
    } else {
      // No / invalid / expired token -> the public free tier.
      scope = new Set(PUBLIC_SCOPE);
      reason = "public";
    }
    // Enforce dataset scope. Photos are public; research is served filtered below.
    // A "*" wildcard scope (owner link) grants every index, present and future.
    if (!isPhotos && !isResearch && SPEC[id] && !scope.has("*") && !scope.has(id)) {
      await logUsage(req, "denied", client, f);
      res.setHeader("cache-control", "no-store");
      res.status(403).json({ error: "access_denied", reason: "out_of_scope" });
      return;
    }
  }

  let body;
  try {
    if (isResearch) body = JSON.stringify(scope && !scope.has("*") ? filteredResearch(scope) : ENRICHMENT[f]());
    else if (isAffinity) body = JSON.stringify(scope && !scope.has("*") ? filteredAffinity(scope) : ENRICHMENT[f]());
    else if (isScoutInsights) body = JSON.stringify(scope && !scope.has("*") ? filteredScoutInsights(scope) : ENRICHMENT[f]());
    else if (isEmployerAffinity) body = JSON.stringify(scope && !scope.has("*") ? filteredEmployerAffinity(scope) : ENRICHMENT[f]());
    else if (ENRICHMENT[f]) body = JSON.stringify(ENRICHMENT[f]());
    else if (SPEC[id]) body = JSON.stringify(assemble(id));
    else { res.status(404).json({ error: "not_found" }); return; }
  } catch (e) {
    console.error("data assemble failed:", f, e && e.message);
    res.status(500).json({ error: "server_error" }); return;
  }

  await logUsage(req, isResearch ? "research" : isAffinity ? "affinity" : isScoutInsights ? "scout-insights" : isEmployerAffinity ? "employer-affinity" : isPhotos ? "photos" : "data", client, f);
  if (setCookie) res.setHeader("set-cookie", setCookie);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-bi-gate", reason);
  res.status(200).send(body);
};
