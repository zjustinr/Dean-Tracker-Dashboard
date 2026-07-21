// Baton Index — trial gate decision (Hardening Step 3).
//
// Pure, side-effect-free logic shared by the edge middleware and its test. Given
// a request's path + token sources, decides whether the /data/<id>.json fetch is
// allowed. Reuses Step 1's verify()/scopeAllows(). Edge-safe (Web Crypto only).
import { verify, scopeAllows } from "./trial-token.mjs";

// The real dataset ids. Only these get scope-checked; other /data files are
// enrichment (see below).
export const DATASET_IDS = new Set([
  "top100", "r1bschool", "r1eschool", "r1university", "r1medical", "r1law",
  "r1provost", "usag", "usnursing", "uspharmacy", "useducation", "r1arts",
]);

function tokenCookie(token, payload, nowSec) {
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  const maxAge = Math.max(0, (payload && payload.x ? payload.x : 0) - now);
  // Not HttpOnly on purpose: the Step 4 client also manages this cookie from ?k=.
  return `bi_trial=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; Secure; SameSite=Lax`;
}

/**
 * Decide access for a /data/<file> request.
 * @param {object} o
 * @param {string} o.pathname     e.g. "/data/r1law.json"
 * @param {string} [o.cookieHeader]
 * @param {string} [o.queryK]     the ?k= token, if present
 * @param {string|undefined} o.secret  TRIAL_SECRET (undefined => gate disarmed)
 * @param {number} [o.nowSec]     injectable clock for tests
 * @returns {Promise<{status:"allow"|"deny", reason?:string, setCookie?:string}>}
 */
export async function gate({ pathname, cookieHeader = "", queryK = "", secret, nowSec }) {
  // Disarmed until a secret is configured (Vercel env, Step 5). Ships inert.
  if (!secret) return { status: "allow", reason: "disarmed" };

  const file = (pathname || "").split("/").pop() || "";
  const id = file.replace(/\.json$/, "");

  // The portrait index is deliberately public — the images it points to are
  // public anyway (documented exclusion in the hardening plan).
  if (file === "dean-photos.json") return { status: "allow", reason: "public" };

  // Token: cookie first, then ?k= fallback (deep links / acceptance tests).
  const m = cookieHeader.match(/(?:^|;\s*)bi_trial=([^;]+)/);
  const cookieTok = m ? decodeURIComponent(m[1]) : "";
  const token = cookieTok || queryK || "";
  if (!token) return { status: "deny", reason: "no_token" };

  const res = await verify(token, secret, nowSec);
  if (!res.ok) return { status: "deny", reason: res.reason || "invalid" }; // bad-signature | expired | malformed

  // Per-dataset files enforce scope. The single global research file spans every
  // dataset, so it can't be scoped here — a valid token is required, but it is
  // not scope-limited (documented limitation; split per-dataset to tighten).
  if (DATASET_IDS.has(id) && !scopeAllows(res.payload, id)) {
    return { status: "deny", reason: "out_of_scope" };
  }

  // Valid. If the token came from ?k= (not already a cookie), hand back a cookie
  // so refreshes and deep links keep working.
  const setCookie = (!cookieTok && queryK) ? tokenCookie(token, res.payload, nowSec) : undefined;
  return { status: "allow", setCookie };
}
