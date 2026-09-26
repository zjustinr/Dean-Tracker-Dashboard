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
  uscommunitycollege: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-communitycollege-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-communitycollege-schools.json"), split: false },
  uslac: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-lac-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-lac-schools.json"), split: false },
  uspublichealth: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-deans.json"), bsq: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-research.json"), schools: () => require("../artifacts/dean-dashboard/src/data/r1-publichealth-schools.json"), split: false },
  usvet:       { deans: () => require("../artifacts/dean-dashboard/src/data/r1-vet-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-vet-schools.json"), split: false },
  usgrad:      { deans: () => require("../artifacts/dean-dashboard/src/data/r1-grad-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-grad-schools.json"), split: false },
  uscreativearts: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-camd-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-camd-schools.json"), split: false },
  usadvancement: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-advancement-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-advancement-schools.json"), split: false },
  usadminleaders: { deans: () => require("../artifacts/dean-dashboard/src/data/r1-adminleaders-deans.json"), bsq: null, schools: () => require("../artifacts/dean-dashboard/src/data/r1-adminleaders-schools.json"), split: false },
};
const ENRICHMENT = {
  "dean-photos.json": () => require("../artifacts/dean-dashboard/src/data/dean-photos.json"),
  "leader-research.json": () => require("../artifacts/dean-dashboard/src/data/leader-research.json"),
  "leader-careers.json": () => require("../artifacts/dean-dashboard/src/data/leader-careers.json"),
  "affinity-by-school.json": () => require("../artifacts/dean-dashboard/src/data/affinity-by-school.json"),
  "scout-insights.json": () => require("../artifacts/dean-dashboard/src/data/scout-insights.json"),
  "employer-affinity.json": () => require("../artifacts/dean-dashboard/src/data/employer-affinity.json"),
  "nonacademic-experience.json": () => require("../artifacts/dean-dashboard/src/data/nonacademic-experience.json"),
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
// access to its own scope; the day pass grants every index ("*"). Keep in sync
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
// nonacademic-experience.json is a WRAPPED document ({asOf, scoring, industries,
// counts, people}) rather than a bare person map -- the meta rides outside the
// map so no consumer ever trips over a reserved key. Scope-gate only the
// `people` map (same leader-key filter as research); the meta and corpus-wide
// counts are aggregate numbers, not per-leader payload, so they pass through.
function filteredNonAcademic(scope) {
  const full = ENRICHMENT["nonacademic-experience.json"]();
  const keys = leaderKeysForScope(scope);
  const people = {};
  for (const k in full.people) if (keys.has(k)) people[k] = full.people[k];
  return Object.assign({}, full, { people });
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
// Plans. For a signed-in person (token claim `o` = firm domain, or `k` = "sub")
// the token only says WHO you are; WHAT you get is read live, per request, from
// every plan that person could have, and the best one wins:
//   * firm plan  -- bi:org:<domain> + membership in bi:org-users:<domain>
//   * own plan   -- bi:sub:<email>, the Monthly Pass, kept in sync by
//                   api/stripe-webhook.js from Stripe billing events
// Order: an active firm plan, then an active Monthly Pass, then either one in
// its grace window. So when a firm enrolls, its subscribers move onto it; when
// a firm plan ends, anyone still paying for their own pass carries on with it
// -- nobody signs in again either way. After a plan's end date there is a
// GRACE_DAYS window (renewal banner, or Stripe retrying a failed card) before
// "ended"; a Monthly Pass the customer cancelled has no grace.
//
// Returns { blocked, state, org, plan, sub, overlap, claimable }:
//   plan      { kind: "org"|"sub", name, scope, until, graceUntil } in use
//   org       the firm record when the firm plan is the one in use
//   sub       the Monthly Pass record, if any (whether or not it's in use)
//   overlap   covered by the firm AND still paying for a renewing pass
//   claimable not yet a member, but the firm has a free seat and the owner
//             hasn't removed them -- api/trial.js moves them onto it
// state is null for tokens without a plan (owner-minted links, day passes) or
// if the lookup failed -- callers then fall back to the token's own s/x claims.
// Fail-open throughout until KV is configured, matching the rest of the gate.
const GRACE_DAYS = 14;
function planState(until, noGrace) {
  const now = Math.floor(Date.now() / 1000);
  if (now < until) return "active";
  return !noGrace && now < until + GRACE_DAYS * 86400 ? "grace" : "ended";
}
async function liveAccess(payload) {
  const out = { blocked: false, state: null, org: null, plan: null, sub: null, overlap: false, claimable: false };
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const client = payload && payload.c;
  if (!url || !tok || !client) return out;
  const orgClaim = typeof payload.o === "string" ? payload.o : null;
  const signedIn = !!orgClaim || payload.k === "sub";
  const at = client.lastIndexOf("@");
  const domain = orgClaim || (at > 0 ? client.slice(at + 1) : null);
  const keys = [client];
  if (at > 0) keys.push(client.slice(at));
  const cmds = keys.map((k) => ["GET", `bi:blocked:${k}`]);
  if (signedIn) {
    cmds.push(
      ["GET", `bi:org:${domain}`], ["SISMEMBER", `bi:org-users:${domain}`, client], ["SCARD", `bi:org-users:${domain}`],
      ["GET", `bi:sub:${client}`], ["HGET", `bi:user:${client}`, "removedFrom"],
    );
  }
  try {
    const r = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) return out;
    const rows = await r.json();
    out.blocked = rows.slice(0, keys.length).some((row) => row && row.result);
    if (!signedIn) return out;
    const val = (i) => (rows[keys.length + i] || {}).result;
    const json = (i) => { try { return JSON.parse(val(i) || "null"); } catch { return null; } };
    const org = json(0), member = Number(val(1)) === 1, used = Number(val(2)) || 0, sub = json(3), removedFrom = val(4);

    const orgOk = !!org && Array.isArray(org.scope) && typeof org.until === "number";
    const subOk = !!sub && typeof sub.until === "number";
    out.sub = subOk ? sub : null;
    const cands = [];
    if (orgOk && member) {
      cands.push({ state: planState(org.until), plan: { kind: "org", name: org.label || domain, scope: org.scope, until: org.until, graceUntil: org.until + GRACE_DAYS * 86400 } });
    }
    if (subOk) {
      const noGrace = sub.status === "canceled";
      cands.push({ state: planState(sub.until, noGrace), plan: { kind: "sub", name: "Monthly Pass", scope: ["*"], until: sub.until, graceUntil: noGrace ? sub.until : sub.until + GRACE_DAYS * 86400 } });
    }
    const rank = { active: 0, grace: 1, ended: 2 };
    const best = cands.slice().sort((a, b) => rank[a.state] - rank[b.state])[0];   // stable: firm first on ties
    out.claimable = orgOk && !member && planState(org.until) === "active" && removedFrom !== domain && (!org.seats || used < org.seats);

    if (best && best.state !== "ended") {
      out.state = best.state;
      out.plan = best.plan;
    } else if (orgClaim && orgOk && !member && !out.claimable) {
      out.state = "removed";               // seat released by the owner, nothing else to fall back on
    } else {
      out.state = "ended";                 // plan(s) ran out, or none on record
      out.plan = best ? best.plan : null;  // kept for the end date / firm name
    }
    if (out.plan && out.plan.kind === "org") out.org = org;
    out.overlap = !!(out.plan && out.plan.kind === "org" && out.state === "active" && subOk
      && sub.status !== "canceled" && !sub.cancelAtPeriodEnd && planState(sub.until, false) !== "ended");
    return out;
  } catch { return out; }
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
  const isNonAcademic = f === "nonacademic-experience.json";

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
    const live = v.ok ? await liveAccess(v.payload) : {};
    const blocked = !!live.blocked;
    const lapsed = live.state === "ended" || live.state === "removed";
    if (v.ok && !blocked && !lapsed) {
      // UNION, not replace. A token widens access on top of the free tier -- it
      // must never narrow it, or a trial link ends up with LESS than an
      // anonymous visitor: every scoped link 403'd on r1bschool while the UI
      // (TrialContext.allowed(), which does union PUBLIC_SCOPE) showed it as
      // open, so the switcher advertised an index the API refused.
      // Signed-in users get their plan's live scope, not the token's copy.
      const granted = live.plan ? live.plan.scope : (v.payload.s || []);
      scope = new Set([...PUBLIC_SCOPE, ...granted]);
      reason = "armed";
      client = v.payload.c || null;
      if (!cookieTok && queryK) {
        const maxAge = Math.max(0, (v.payload.x || 0) - Math.floor(Date.now() / 1000));
        setCookie = `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
      }
    } else {
      // No / invalid / expired / blocked / lapsed token -> the public free tier.
      if (blocked || lapsed) client = v.payload.c || null;
      scope = new Set(PUBLIC_SCOPE);
      reason = blocked ? "blocked" : lapsed ? "lapsed" : "public";
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
    else if (isNonAcademic) body = JSON.stringify(scope && !scope.has("*") ? filteredNonAcademic(scope) : ENRICHMENT[f]());
    else if (ENRICHMENT[f]) body = JSON.stringify(ENRICHMENT[f]());
    else if (SPEC[id]) body = JSON.stringify(assemble(id));
    else { res.status(404).json({ error: "not_found" }); return; }
  } catch (e) {
    console.error("data assemble failed:", f, e && e.message);
    res.status(500).json({ error: "server_error" }); return;
  }

  await logUsage(req, isResearch ? "research" : isAffinity ? "affinity" : isScoutInsights ? "scout-insights" : isEmployerAffinity ? "employer-affinity" : isNonAcademic ? "nonacademic-experience" : isPhotos ? "photos" : "data", client, f);
  if (setCookie) res.setHeader("set-cookie", setCookie);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-bi-gate", reason);
  res.status(200).send(body);
};
