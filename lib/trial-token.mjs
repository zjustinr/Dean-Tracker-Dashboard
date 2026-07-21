// Baton Index — trial token (Hardening Step 1).
//
// A self-contained, stateless access token: HMAC-SHA256 over a small JSON
// payload, no database. The same module is imported by the mint CLI (Node) and,
// in Step 3, by the edge middleware that gates /data/*.json — so it is written
// against the Web Crypto API (crypto.subtle) and standard globals only
// (TextEncoder/TextDecoder, btoa/atob, crypto.getRandomValues), which exist in
// both Node 18+ and the Vercel Edge runtime. No Node-only APIs (no Buffer).
//
// Token shape:   base64url(payload) + "." + base64url(HMAC(payload, secret))
// Payload:       { c: <client label>, s: [<dataset ids>], x: <unix expiry s>, i: <unix issued s> }

/** base64url helpers that work on both bytes and UTF-8 strings, no Buffer. */
export const b64url = {
  fromBytes(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  toBytes(str) {
    let s = str.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  encStr(str) { return this.fromBytes(new TextEncoder().encode(str)); },
  decStr(str) { return new TextDecoder().decode(this.toBytes(str)); },
};

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return b64url.fromBytes(new Uint8Array(sig));
}

/** Constant-time string compare (avoids leaking where a forged sig diverges). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Sign a payload into a token.
 * @param {{ c: string, s: string[], x: number, i?: number }} payload
 * @param {string} secret
 * @returns {Promise<string>} the token
 */
export async function sign(payload, secret) {
  if (!secret) throw new Error("sign: missing secret");
  const body = b64url.encStr(JSON.stringify(payload));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}

/**
 * Verify a token. Returns { ok, reason, payload }.
 *   reason ∈ "malformed" | "bad-signature" | "expired" | null(ok)
 * `nowSec` is injectable for tests; defaults to the wall clock.
 * @param {string} token
 * @param {string} secret
 * @param {number} [nowSec]
 */
export async function verify(token, secret, nowSec) {
  if (!secret) throw new Error("verify: missing secret");
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed", payload: null };
  }
  const dot = token.indexOf(".");
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try {
    payload = JSON.parse(b64url.decStr(body));
  } catch {
    return { ok: false, reason: "malformed", payload: null };
  }
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(sig, expected)) {
    return { ok: false, reason: "bad-signature", payload: null };
  }
  if (!payload || !Array.isArray(payload.s) || typeof payload.x !== "number") {
    return { ok: false, reason: "malformed", payload: null };
  }
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  if (now >= payload.x) {
    return { ok: false, reason: "expired", payload };
  }
  return { ok: true, reason: null, payload };
}

/** True if a verified token's scope permits the given dataset id. */
export function scopeAllows(payload, datasetId) {
  return !!payload && Array.isArray(payload.s) && payload.s.includes(datasetId);
}
