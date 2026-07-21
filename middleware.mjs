// Baton Index — edge middleware gate (Hardening Step 3).
//
// Runs before /data/*.json is served and enforces the trial token: verifies the
// HMAC, rejects tampered/expired tokens, and blocks datasets outside the token's
// scope. Delegates the decision to lib/trial-gate.mjs (Web Crypto, edge-safe),
// which is the single source of truth the mint CLI and gate test also use.
//
// Plain-JS .mjs on purpose: non-framework Vercel projects use .mjs middleware,
// which sidesteps any TypeScript compile of the .mjs import chain (an earlier
// middleware.ts failed the Vercel build for exactly that reason).
//
// Armed by TRIAL_SECRET. Until that env var is set in Vercel (Step 5) the gate is
// inert (fail-open), so deploying this changes nothing on the live site.
//
// Continue semantics: Vercel's next() just returns a Response carrying
// `x-middleware-next: 1`, so we build that directly and take no dependency.
import { gate } from "./lib/trial-gate.mjs";

export const config = { matcher: "/data/:path*" };

export default async function middleware(request) {
  const url = new URL(request.url);

  const decision = await gate({
    pathname: url.pathname,
    cookieHeader: request.headers.get("cookie") || "",
    queryK: url.searchParams.get("k") || "",
    secret: process.env.TRIAL_SECRET,
  });

  if (decision.status === "deny") {
    return new Response(JSON.stringify({ error: "access_denied", reason: decision.reason }), {
      status: 403,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  // x-bi-gate confirms the middleware actually ran on a deploy (it appears on the
  // /data response). "disarmed" = no TRIAL_SECRET yet (Step 5 arms it).
  const headers = {
    "x-middleware-next": "1",
    "x-bi-gate": decision.reason === "disarmed" ? "disarmed" : "armed",
  };
  if (decision.setCookie) headers["set-cookie"] = decision.setCookie;
  return new Response(null, { headers });
}
