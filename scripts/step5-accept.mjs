#!/usr/bin/env node
// Hardening Step 5 — production acceptance test.
//
// Run AFTER TRIAL_SECRET is set in Vercel (using the same value in .trial-secret):
//   node scripts/step5-accept.mjs [https://your-domain]
//
// Mints scoped/expired tokens with the local secret and checks the live gate:
//   1. No token           -> /api/trial "none"  AND /data/* 403 no_token   (locked)
//   2. Valid, in-scope     -> /data/<in>.json 200
//   3. Valid, OUT-of-scope -> /data/<out>.json 403 out_of_scope   ← the one that matters
//   4. Expired token       -> /api/trial "expired"
//   5. Public photo index  -> /data/dean-photos.json 200 (no token)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sign } from "../lib/trial-token.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN = (process.argv[2] || process.env.BI_DOMAIN || "https://deantracker.vercel.app").replace(/\/+$/, "");
const secret = (process.env.TRIAL_SECRET || readFileSync(join(ROOT, ".trial-secret"), "utf8")).trim();

const IN_SCOPE = ["r1bschool", "usnursing", "r1university"];
const OUT_OF_SCOPE = "r1law";
const now = Math.floor(Date.now() / 1000);

async function get(path, cookie) {
  const r = await fetch(`${DOMAIN}${path}`, {
    headers: cookie ? { cookie: `bi_trial=${encodeURIComponent(cookie)}` } : {},
    redirect: "manual",
  });
  let body = null;
  try { body = await r.json(); } catch { /* non-json (e.g. a real dataset) */ }
  return { status: r.status, gate: r.headers.get("x-bi-gate"), reason: body?.reason, armed: body?.armed, tstatus: body?.status };
}

console.log(`Target: ${DOMAIN}\n`);

// Gate must be armed, or the whole test is moot.
const probe = await get("/api/trial");
if (probe.armed === false) {
  console.error("✗ Gate is NOT armed (/api/trial reports armed:false).");
  console.error("  Set TRIAL_SECRET in Vercel (to the value in .trial-secret) and redeploy, then re-run.");
  process.exit(2);
}

const valid = await sign({ c: "acceptance", s: IN_SCOPE, x: now + 21 * 86400, i: now }, secret);
const expired = await sign({ c: "acceptance", s: IN_SCOPE, x: now - 60, i: now - 120 }, secret);

const checks = [];
const add = (name, ok, detail) => { checks.push([name, ok, detail]); };

const t1a = await get("/api/trial");
add("1a. no token -> /api/trial 'none'", t1a.tstatus === "none", `status=${t1a.tstatus}`);
const t1b = await get(`/data/${OUT_OF_SCOPE}.json`);
add("1b. no token -> /data 403 no_token", t1b.status === 403 && t1b.reason === "no_token", `${t1b.status}/${t1b.reason}`);

const t2 = await get(`/data/${IN_SCOPE[0]}.json`, valid);
add("2. valid in-scope -> 200", t2.status === 200, `${t2.status} gate=${t2.gate}`);

const t3 = await get(`/data/${OUT_OF_SCOPE}.json`, valid);
add("3. valid OUT-of-scope -> 403 out_of_scope", t3.status === 403 && t3.reason === "out_of_scope", `${t3.status}/${t3.reason}`);

const t4 = await get("/api/trial", expired);
add("4. expired token -> 'expired'", t4.tstatus === "expired", `status=${t4.tstatus}`);

const t5 = await get("/data/dean-photos.json");
add("5. photo index public -> 200", t5.status === 200, `${t5.status}`);

let pass = true;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? "✓" : "✗"} ${name}  [${detail}]`);
  if (!ok) pass = false;
}
console.log(pass ? "\nACCEPTANCE PASS — the gate is live and enforcing." : "\nACCEPTANCE FAIL");
process.exit(pass ? 0 : 1);
