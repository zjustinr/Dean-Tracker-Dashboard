// Baton Index — records click-through agreement to the Terms of Service /
// Privacy Policy for trial and paid clients. Fired once by ConsentGate.tsx
// when a valid access link is first used in a browser. Same fail-safe KV
// design as the rest of the usage log: a no-op until KV_REST_API_* env vars
// exist, and never throws back to the client. Self-contained CommonJS,
// mirroring api/search-log.js / api/data.js.
const CONSENT_VERSION = "1";

async function logConsent(req, client) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();
  const rec = JSON.stringify({ c, ev: "consent", v: CONSENT_VERSION, t, ip });
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["LPUSH", "bi:events", rec],
        ["LTRIM", "bi:events", "0", "1999"],
        ["SADD", "bi:clients", c],
        ["HSET", `bi:client:${c}`, "consentedAt", String(t), "consentVersion", CONSENT_VERSION],
      ]),
    });
  } catch { /* logging is best-effort; never fail the request */ }
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const client = typeof body.client === "string" ? body.client.slice(0, 80) : null;
  await logConsent(req, client);
  res.status(200).json({ ok: true, version: CONSENT_VERSION });
};
