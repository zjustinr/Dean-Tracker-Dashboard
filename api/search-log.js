// Baton Index — search-query logging endpoint.
//
// The Slate Builder's name/keyword/school inputs POST here (debounced) so
// trial usage shows not just *which dataset* a visitor opened (api/data.js's
// logUsage) but *what they searched for* within it. Same fail-safe KV design
// as the rest of the usage log: a no-op until KV_REST_API_* env vars exist,
// and never throws back to the client. Self-contained CommonJS, mirroring
// api/feature-request.js / api/data.js.
const MAX_QUERY_CHARS = 200;
const SOURCES = new Set(["slate-name", "slate-keyword", "slate-school"]);

async function logSearch(req, client, source, q) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) return;
  const c = client || "public";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rec = JSON.stringify({ c, ev: "search", src: source, q, t: Date.now(), ip });
  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify([
        ["LPUSH", "bi:events", rec],
        ["LTRIM", "bi:events", "0", "1999"],
        ["SADD", "bi:clients", c],
        ["HSET", `bi:client:${c}`, "last", String(Date.now()), "lastEvent", "search", "lastQuery", `${source}: ${q}`],
        ["HINCRBY", `bi:client:${c}`, "hits", "1"],
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

  const q = (typeof body.q === "string" ? body.q : "").trim().slice(0, MAX_QUERY_CHARS);
  const source = SOURCES.has(body.source) ? body.source : "slate-name";
  const client = typeof body.client === "string" ? body.client.slice(0, 80) : null;

  if (!q) { res.status(200).json({ ok: true, logged: false }); return; }

  await logSearch(req, client, source, q);
  res.status(200).json({ ok: true, logged: true });
};
