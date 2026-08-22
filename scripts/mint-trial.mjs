#!/usr/bin/env node
// Baton Index — mint a trial access link (Hardening Step 1).
//
//   node scripts/mint-trial.mjs            interactive: recipient, indices, expiry
//   node scripts/mint-trial.mjs --selftest verify the token round-trips & rejects tampering
//
// Nothing user-facing ships in Step 1. This CLI produces a signed URL
// (…/?k=<token>) whose scope + expiry the Step 3 edge middleware will enforce.
// The signing secret must match TRIAL_SECRET in Vercel (set in Step 5); until
// then a link validates locally against .trial-secret but not in production.

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { sign, verify, b64url } from "../lib/trial-token.mjs";
import { INDEX_LABEL } from "../artifacts/dean-dashboard/scripts/lib/indices.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET_FILE = join(ROOT, ".trial-secret");
const LOG_FILE = join(ROOT, "trials.log");
const DEFAULT_DOMAIN = process.env.BI_DOMAIN || "https://batonindex.com";
const DEFAULT_EXPIRY_DAYS = 21;

// The sellable indices, taken from the shared registry rather than a local list.
//
// This WAS a hand-maintained literal, and it drifted exactly the way
// lib/indices.mjs was created to stop: PR #132 added `usadvancement` and
// `uscreativearts` to the registry, api/data.js and the UI, but not here -- so
// "all indices" quietly meant 18 of 20, and a Project/Firm client who opened
// Advancement in the switcher got a 403 for an index they had paid for.
// Deriving it means an index added next year is sellable the day it is
// registered, with nothing here to remember.
//
// top100 is deliberately absent from the registry (UNREGISTERED_BY_DESIGN), so
// it stays out of every trial scope for free.
const INDICES = Object.entries(INDEX_LABEL);
const ALL_IDS = INDICES.map(([id]) => id);

// Paid-tier presets — the enforceable scope guard. The $99 Day Pass is a limited
// 3-index taster (Business + Presidents + Provost) so a cheap 24h pass can't pull
// the whole database; api/data.js 403s anything outside a token's scope. Project/
// Firm get all 12. Mint:  node scripts/mint-trial.mjs --tier day --client acme
const TIERS = {
  day:     { label: "Day Pass",     scope: ["r1bschool", "r1university", "r1provost"], days: 1 },
  project: { label: "Project Pass", scope: ALL_IDS,                                    days: 30 },
  firm:    { label: "Firm Plan",    scope: ALL_IDS,                                    days: 365 },
  // Owner link: "*" wildcard = every index, present AND future, so new indices
  // never need a re-mint. api/data.js + TrialContext.tsx grant all access on "*".
  owner:   { label: "Owner (all indices + future)", scope: ["*"],                      days: 3650 },
};

// Human-readable scope for the console — wildcard prints as an ALL notice.
function scopeLabel(scope) {
  if (scope.includes("*")) return "ALL indices (wildcard — includes any future index)";
  return scope.map((id) => (INDICES.find(([x]) => x === id) || [id, id])[1]).join(", ");
}

function loadSecret() {
  if (process.env.TRIAL_SECRET) return process.env.TRIAL_SECRET.trim();
  if (existsSync(SECRET_FILE)) return readFileSync(SECRET_FILE, "utf8").trim();
  const secret = b64url.fromBytes(crypto.getRandomValues(new Uint8Array(32)));
  writeFileSync(SECRET_FILE, secret + "\n");
  console.warn(
    "\n⚠  No TRIAL_SECRET set — generated a new signing secret at .trial-secret" +
    "\n   (gitignored). In Step 5 set this SAME value as TRIAL_SECRET in Vercel," +
    "\n   or links minted now will not validate in production.\n",
  );
  return secret;
}

async function selftest() {
  const secret = "test-secret-do-not-ship";
  const now = 1_700_000_000;
  const payload = { c: "selftest", s: ["r1bschool", "usnursing"], x: now + 3600, i: now };
  const token = await sign(payload, secret);

  const good = await verify(token, secret, now);
  const tamperedSig = await verify(token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa"), secret, now);
  const tamperedBody = await verify("x" + token, secret, now);
  const wrongSecret = await verify(token, "other-secret", now);
  const expired = await verify(token, secret, now + 7200);

  // api/usage.js mints the same links from the browser but is CommonJS, so it
  // cannot import the registry and carries a literal instead. Check it here --
  // this is the drift that made "all indices" mean 18 of 20.
  const usageSrc = readFileSync(join(ROOT, "api", "usage.js"), "utf8");
  const m = usageSrc.match(/const ALL_IDS = \[([\s\S]*?)\];/);
  const usageIds = m ? [...m[1].matchAll(/"([a-z0-9]+)"/g)].map((x) => x[1]) : [];
  const registryIds = Object.keys(INDEX_LABEL);
  const idsMatch = JSON.stringify(usageIds) === JSON.stringify(registryIds);

  const checks = [
    ["api/usage.js ALL_IDS matches the index registry",
      idsMatch, `usage=${usageIds.length} registry=${registryIds.length}`],
    ["valid token accepted", good.ok === true && good.payload.c === "selftest"],
    ["tampered signature rejected", tamperedSig.ok === false && tamperedSig.reason === "bad-signature"],
    ["tampered payload rejected", tamperedBody.ok === false],
    ["wrong secret rejected", wrongSecret.ok === false && wrongSecret.reason === "bad-signature"],
    ["expired token rejected", expired.ok === false && expired.reason === "expired"],
  ];
  let pass = true;
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${name}${detail && !ok ? `  [${detail}]` : ""}`);
    if (!ok) pass = false;
  }
  console.log(pass ? "\nSELFTEST PASS" : "\nSELFTEST FAIL");
  process.exit(pass ? 0 : 1);
}

async function interactive() {
  const secret = loadSecret();
  const rl = createInterface({ input: stdin, output: stdout });
  const ask = async (q, dflt) => {
    const a = (await rl.question(dflt ? `${q} [${dflt}]: ` : `${q}: `)).trim();
    return a || dflt || "";
  };

  const client = await ask("Recipient (firm slug or email, e.g. greenwood-asher)");
  if (!client) { console.error("A recipient is required."); rl.close(); process.exit(1); }

  console.log("\nWhich indices? Enter numbers comma-separated, or 'all':");
  INDICES.forEach(([, label], i) => console.log(`  ${String(i + 1).padStart(2)}  ${label}`));
  const pickRaw = await ask("Indices", "all");
  let scope;
  if (/^all$/i.test(pickRaw)) {
    scope = INDICES.map(([id]) => id);
  } else {
    const nums = pickRaw.split(/[,\s]+/).map((n) => parseInt(n, 10)).filter((n) => n >= 1 && n <= INDICES.length);
    scope = [...new Set(nums)].map((n) => INDICES[n - 1][0]);
  }
  if (!scope.length) { console.error("No valid indices selected."); rl.close(); process.exit(1); }

  const days = parseInt(await ask("Expiry (days)", String(DEFAULT_EXPIRY_DAYS)), 10) || DEFAULT_EXPIRY_DAYS;
  const domain = (await ask("Domain", DEFAULT_DOMAIN)).replace(/\/+$/, "");
  rl.close();

  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + days * 86400;
  const payload = { c: client, s: scope, x: expSec, i: nowSec };
  const token = await sign(payload, secret);
  const link = `${domain}/?k=${token}`;

  // Prove the freshly minted token verifies before handing it over.
  const check = await verify(token, secret);
  if (!check.ok) { console.error("Internal error: minted token failed verification:", check.reason); process.exit(1); }

  const expiryISO = new Date(expSec * 1000).toISOString().slice(0, 10);
  const labels = scopeLabel(scope);
  console.log("\n────────────────────────────────────────────────────────");
  console.log(`Client:  ${client}`);
  console.log(`Indices: ${labels}`);
  console.log(`Expires: ${expiryISO}  (${days} days)`);
  console.log(`\n${link}\n`);
  console.log("────────────────────────────────────────────────────────");

  appendFileSync(LOG_FILE, JSON.stringify({ client, scope, issued: nowSec, expiry: expSec, expiryISO, domain }) + "\n");
  console.log(`Logged to ${LOG_FILE}`);
}

// Non-interactive tier mint: node scripts/mint-trial.mjs --tier <day|project|firm> --client <slug> [--days N] [--domain URL]
function getArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function tierMode() {
  const tierKey = getArg("tier");
  const tier = TIERS[tierKey];
  if (!tier) { console.error(`Unknown tier "${tierKey}". Use one of: ${Object.keys(TIERS).join(", ")}`); process.exit(1); }
  const client = getArg("client");
  if (!client) { console.error("A --client <slug> is required."); process.exit(1); }

  const secret = loadSecret();
  const days = parseInt(getArg("days") || "", 10) || tier.days;
  const domain = (getArg("domain") || DEFAULT_DOMAIN).replace(/\/+$/, "");
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = nowSec + days * 86400;
  const payload = { c: client, s: tier.scope, x: expSec, i: nowSec };
  const token = await sign(payload, secret);
  const link = `${domain}/?k=${token}`;

  const check = await verify(token, secret);
  if (!check.ok) { console.error("Internal error: minted token failed verification:", check.reason); process.exit(1); }

  const expiryISO = new Date(expSec * 1000).toISOString().slice(0, 10);
  const labels = scopeLabel(tier.scope);
  console.log("\n────────────────────────────────────────────────────────");
  console.log(`Tier:    ${tier.label}  (${tierKey})`);
  console.log(`Client:  ${client}`);
  console.log(`Indices: ${labels}`);
  console.log(`Expires: ${expiryISO}  (${days} days)`);
  console.log(`\n${link}\n`);
  console.log("────────────────────────────────────────────────────────");

  appendFileSync(LOG_FILE, JSON.stringify({ tier: tierKey, client, scope: tier.scope, issued: nowSec, expiry: expSec, expiryISO, domain }) + "\n");
  console.log(`Logged to ${LOG_FILE}`);
}

if (process.argv.includes("--selftest")) {
  await selftest();
} else if (process.argv.includes("--tier")) {
  await tierMode();
} else {
  await interactive();
}
