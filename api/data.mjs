// Baton Index — gated data endpoint (Hardening Step 3, serverless-function gate).
//
// Edge Middleware is ignored on this static Vercel project, so the /data gate is
// a Vercel Function instead (functions deploy reliably here). A rewrite in
// vercel.json sends /data/:path* -> /api/data?f=:path*; this function verifies
// the trial token, enforces per-dataset scope, and only then returns the JSON —
// assembled on demand from the committed src/data files (included via the
// functions.includeFiles config), so a news-scout refresh serves fresh with
// nothing else to regenerate.
//
// Armed by TRIAL_SECRET. Until that env var is set in Vercel (Step 5) the gate is
// inert (fail-open), so this changes nothing user-facing on the live site.
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gate } from "../lib/trial-gate.mjs";
import { SPEC, ENRICHMENT, assembleDataset, readEnrichment } from "../lib/dataset-assembly.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
// src/data is bundled via functions.includeFiles; try the likely locations.
const SRC_CANDIDATES = [
  join(process.cwd(), "artifacts", "dean-dashboard", "src", "data"),
  join(HERE, "..", "artifacts", "dean-dashboard", "src", "data"),
];
const SRC_DIR = SRC_CANDIDATES.find((p) => existsSync(p)) || SRC_CANDIDATES[0];

export default async function handler(req, res) {
  // The rewrite passes the filename as ?f=; also tolerate a raw path.
  let f = (req.query && (req.query.f || req.query.path)) || "";
  if (Array.isArray(f)) f = f[0];
  f = String(f).replace(/^\/?(data\/)?/, "");            // strip any leading /data/
  f = f.replace(/[^a-zA-Z0-9._-]/g, "");                  // sanitize (no path traversal)
  if (!f.endsWith(".json")) { res.status(400).json({ error: "bad_request" }); return; }

  const decision = await gate({
    pathname: `/data/${f}`,
    cookieHeader: req.headers.cookie || "",
    queryK: (req.query && req.query.k) || "",
    secret: process.env.TRIAL_SECRET,
  });

  if (decision.status === "deny") {
    res.setHeader("cache-control", "no-store");
    res.status(403).json({ error: "access_denied", reason: decision.reason });
    return;
  }

  const id = f.replace(/\.json$/, "");
  let body;
  try {
    if (ENRICHMENT.has(f)) body = readEnrichment(f, SRC_DIR);
    else if (SPEC[id]) body = JSON.stringify(assembleDataset(id, SRC_DIR));
    else { res.status(404).json({ error: "not_found" }); return; }
  } catch {
    res.status(404).json({ error: "not_found" }); return;
  }
  if (body == null) { res.status(404).json({ error: "not_found" }); return; }

  if (decision.setCookie) res.setHeader("set-cookie", decision.setCookie);
  res.setHeader("content-type", "application/json; charset=utf-8");
  // `private` keeps it out of any shared/CDN cache (so the gate always runs);
  // the browser may still cache briefly.
  res.setHeader("cache-control", "private, max-age=300");
  res.setHeader("x-bi-gate", decision.reason === "disarmed" ? "disarmed" : "armed");
  res.status(200).send(body);
}
