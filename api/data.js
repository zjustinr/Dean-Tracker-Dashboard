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
  uspublichealth: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-schools.json"), split: false },
};
const ENRICHMENT = {
  "dean-photos.json": () => require("../artifacts/dean-dashboard/src/data/dean-photos.json"),
  "leader-research.json": () => require("../artifacts/dean-dashboard/src/data/leader-research.json"),
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

module.exports = async function handler(req, res) {
  let f = (req.query && (req.query.f || req.query.path)) || "";
  if (Array.isArray(f)) f = f[0];
  f = String(f).replace(/^\/?(data\/)?/, "").replace(/[^a-zA-Z0-9._-]/g, ""); // sanitize
  if (!f.endsWith(".json")) { res.status(400).json({ error: "bad_request" }); return; }
  const id = f.replace(/\.json$/, "");

  const secret = process.env.TRIAL_SECRET;
  let reason = "disarmed", setCookie = null;

  if (secret) {
    // dean-photos.json is deliberately public (the images are public anyway).
    if (f !== "dean-photos.json") {
      const cookie = req.headers.cookie || "";
      const m = cookie.match(/(?:^|;\s*)bi_trial=([^;]+)/);
      const cookieTok = m ? decodeURIComponent(m[1]) : "";
      const queryK = (req.query && req.query.k) || "";
      const token = cookieTok || queryK || "";
      if (!token) { res.setHeader("cache-control", "no-store"); res.status(403).json({ error: "access_denied", reason: "no_token" }); return; }
      const v = verify(token, secret);
      if (!v.ok) { res.setHeader("cache-control", "no-store"); res.status(403).json({ error: "access_denied", reason: v.reason }); return; }
      if (DATASET_IDS.has(id) && !(v.payload.s || []).includes(id)) {
        res.setHeader("cache-control", "no-store"); res.status(403).json({ error: "access_denied", reason: "out_of_scope" }); return;
      }
      reason = "armed";
      if (!cookieTok && queryK) {
        const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
        setCookie = `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
      }
    }
  }

  let body;
  try {
    if (ENRICHMENT[f]) body = JSON.stringify(ENRICHMENT[f]());
    else if (SPEC[id]) body = JSON.stringify(assemble(id));
    else { res.status(404).json({ error: "not_found" }); return; }
  } catch (e) {
    console.error("data assemble failed:", f, e && e.message);
    res.status(500).json({ error: "server_error" }); return;
  }

  if (setCookie) res.setHeader("set-cookie", setCookie);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-bi-gate", reason);
  res.status(200).send(body);
};
