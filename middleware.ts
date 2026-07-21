// Baton Index — edge middleware gate (Hardening Step 3).
//
// Runs before /data/*.json is served and enforces the trial token: verifies the
// HMAC, rejects tampered/expired tokens, and blocks datasets outside the token's
// scope. Reuses the shared verify()/scopeAllows() (Web Crypto, edge-safe).
//
// Armed by the TRIAL_SECRET env var. Until that is set in Vercel (Step 5) the
// gate is inert (fail-open), so deploying this changes nothing on the live site.
//
// Continue semantics: Vercel's next() simply returns a Response carrying
// `x-middleware-next: 1`, so we build that directly and take no dependency
// (learned from Step 2 — build steps must not rely on maybe-missing packages).
import { gate } from "./lib/trial-gate.mjs";

export const config = { matcher: "/data/:path*" };

export default async function middleware(request: Request): Promise<Response> {
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

  // x-bi-gate lets us confirm the middleware actually ran on a deploy (it shows
  // up on the /data response). "disarmed" = no TRIAL_SECRET set yet (Step 5).
  const headers: Record<string, string> = {
    "x-middleware-next": "1",
    "x-bi-gate": decision.reason === "disarmed" ? "disarmed" : "armed",
  };
  if (decision.setCookie) headers["set-cookie"] = decision.setCookie;
  return new Response(null, { headers });
}
