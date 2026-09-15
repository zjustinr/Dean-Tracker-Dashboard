#!/usr/bin/env node
// When does each trial link expire?
//
//   node scripts/check-link-expiry.mjs                 read trials.log, list every link
//   node scripts/check-link-expiry.mjs '<url-or-token>'  decode one link
//
// The usage dashboard cannot answer this: expiry lives inside the token and is
// never written to KV, so a link's remaining life is invisible from the server
// side. trials.log (gitignored, local to whoever minted) is the only record of
// a CLI-minted link, and a dashboard-minted one is recorded nowhere at all
// beyond an audit event.
//
// No secret needed. A trial token is `<base64url payload>.<hmac>` -- signed,
// not encrypted, so the expiry reads out of the payload directly. That also
// means anyone holding a link can read its expiry; the signature is what stops
// them changing it.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_FILE = join(ROOT, "trials.log");
const now = Date.now() / 1000;

const fmt = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
function life(expSec) {
  const days = (expSec - now) / 86400;
  if (days < 0) return { label: `EXPIRED ${Math.abs(days).toFixed(0)}d ago`, mark: "x" };
  if (days < 7) return { label: `expires in ${days.toFixed(0)}d`, mark: "!" };
  return { label: `${days.toFixed(0)}d left`, mark: " " };
}

function decode(raw) {
  const s = String(raw).trim();
  const tok = s.includes("k=") ? decodeURIComponent(s.split("k=")[1].split("&")[0]) : s;
  if (!tok.includes(".")) throw new Error("not a token (no '.' separator)");
  const body = tok.slice(0, tok.indexOf("."));
  const json = Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  return JSON.parse(json);              // { c: client, s: scope[], x: expiry, i: issued }
}

const arg = process.argv[2];
if (arg) {
  const p = decode(arg);
  const l = life(p.x);
  console.log(`client  : ${p.c}`);
  console.log(`scope   : ${Array.isArray(p.s) ? (p.s.includes("*") ? "ALL indices (wildcard)" : `${p.s.length} indices`) : "?"}`);
  if (p.i) console.log(`issued  : ${fmt(p.i)}`);
  console.log(`expires : ${fmt(p.x)}  (${l.label})`);
  process.exit(0);
}

if (!existsSync(LOG_FILE)) {
  console.error(`No ${LOG_FILE}.`);
  console.error("It is gitignored, so it only exists on the machine that minted the links.");
  console.error("Either run this there, or pass a link:  node scripts/check-link-expiry.mjs '<url>'");
  console.error("Links minted from the usage dashboard are not in trials.log at all.");
  process.exit(1);
}

const rows = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// One link per client: the newest mint wins, since that is the live one.
const latest = new Map();
for (const r of rows) {
  const prev = latest.get(r.client);
  if (!prev || (r.expiry || 0) > (prev.expiry || 0)) latest.set(r.client, r);
}

console.log(`${rows.length} mint(s) logged, ${latest.size} distinct link(s)\n`);
console.log(`${" "}${"client".padEnd(26)}${"tier".padEnd(9)}${"issued".padEnd(12)}${"expires".padEnd(12)}status`);
for (const r of [...latest.values()].sort((a, b) => (a.expiry || 0) - (b.expiry || 0))) {
  const l = life(r.expiry);
  console.log(`${l.mark} ${String(r.client).padEnd(26)}${String(r.tier || "custom").padEnd(9)}${fmt(r.issued).padEnd(12)}${fmt(r.expiry).padEnd(12)}${l.label}`);
}
const dead = [...latest.values()].filter((r) => r.expiry < now);
console.log(`\n${dead.length} expired, ${latest.size - dead.length} still live.`);
if (dead.length) console.log(`Re-mint:  ${dead.map((r) => r.client).join(", ")}`);
