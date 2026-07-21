#!/usr/bin/env node
// Acceptance test for the Step 3 edge gate (scripts/trial-gate-test.mjs).
// The one that matters: a token scoped to three indices is allowed for those and
// 403'd for a fourth. Also covers expiry, tampering, missing token, the public
// photo file, cookie auth, and the disarmed (no-secret) fail-open path.
import { sign } from "../lib/trial-token.mjs";
import { gate } from "../lib/trial-gate.mjs";

const SECRET = "gate-test-secret";
const NOW = 1_700_000_000;
const SCOPE = ["r1bschool", "usnursing", "r1university"];
const token = await sign({ c: "acme-search", s: SCOPE, x: NOW + 21 * 86400, i: NOW }, SECRET);
const expired = await sign({ c: "acme-search", s: SCOPE, x: NOW - 10, i: NOW - 100 }, SECRET);
const tampered = token.slice(0, -3) + (token.endsWith("zzz") ? "aaa" : "zzz");

const g = (opts) => gate({ secret: SECRET, nowSec: NOW, ...opts });

const cases = [
  ["in-scope dataset (?k=) allowed",        await g({ pathname: "/data/r1bschool.json", queryK: token }),        "allow"],
  ["another in-scope dataset allowed",       await g({ pathname: "/data/usnursing.json", queryK: token }),        "allow"],
  ["OUT-OF-SCOPE 4th dataset denied",        await g({ pathname: "/data/r1law.json", queryK: token }),            "deny", "out_of_scope"],
  ["out-of-scope pharmacy denied",           await g({ pathname: "/data/uspharmacy.json", queryK: token }),       "deny", "out_of_scope"],
  ["no token denied",                        await g({ pathname: "/data/r1bschool.json" }),                       "deny", "no_token"],
  ["expired token denied",                   await g({ pathname: "/data/r1bschool.json", queryK: expired }),      "deny", "expired"],
  ["tampered token denied",                  await g({ pathname: "/data/r1bschool.json", queryK: tampered }),     "deny", "bad-signature"],
  ["cookie auth (in-scope) allowed",         await g({ pathname: "/data/usnursing.json", cookieHeader: `bi_trial=${encodeURIComponent(token)}` }), "allow"],
  ["cookie auth out-of-scope denied",        await g({ pathname: "/data/r1law.json", cookieHeader: `bi_trial=${encodeURIComponent(token)}` }),     "deny", "out_of_scope"],
  ["photo index public (no token)",          await g({ pathname: "/data/dean-photos.json" }),                     "allow"],
  ["research needs a valid token — denied",  await g({ pathname: "/data/leader-research.json" }),                 "deny", "no_token"],
  ["research with valid token allowed",      await g({ pathname: "/data/leader-research.json", queryK: token }),  "allow"],
  ["disarmed (no secret) fails open",        await gate({ pathname: "/data/r1law.json", nowSec: NOW }),           "allow"],
];

let pass = true;
for (const [name, res, wantStatus, wantReason] of cases) {
  const ok = res.status === wantStatus && (!wantReason || res.reason === wantReason);
  if (!ok) pass = false;
  console.log(`${ok ? "✓" : "✗"} ${name}  -> ${res.status}${res.reason ? "/" + res.reason : ""}`);
}

// The ?k= allow path should hand back a Set-Cookie so refreshes persist.
const withCookie = await g({ pathname: "/data/r1bschool.json", queryK: token });
const cookieOk = typeof withCookie.setCookie === "string" && /bi_trial=/.test(withCookie.setCookie);
console.log(`${cookieOk ? "✓" : "✗"} ?k= allow returns a bi_trial Set-Cookie`);
if (!cookieOk) pass = false;

console.log(pass ? "\nGATE TEST PASS" : "\nGATE TEST FAIL");
process.exit(pass ? 0 : 1);
