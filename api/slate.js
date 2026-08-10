// Baton Index — server-side mirror of the Slate Builder shortlist.
//
// The client already persists the slate to localStorage for the visitor's own
// use; this endpoint additionally mirrors it to KV so the owner can see a
// trial/paid client's candidate list take shape live (bi:slate:<client>), not
// just at export time. Debounced "sync" calls keep that mirror current;
// "export" calls additionally drop a discrete event so the dashboard shows
// exactly when and how many candidates were exported. Same fail-safe design
// as the rest of the usage log. Self-contained CommonJS, mirroring
// api/search-log.js.
const MAX_ITEMS = 200;
const MAX_FIELD_CHARS = 200;

function sanitizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_ITEMS).map((it) => ({
    name: String((it && it.name) || "").slice(0, MAX_FIELD_CHARS),
    school: String((it && it.school) || "").slice(0, MAX_FIELD_CHARS),
    university: String((it && it.university) || "").slice(0, MAX_FIELD_CHARS),
  })).filter((it) => it.name);
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "method_not_allowed" }); return; }

  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) { res.status(200).json({ ok: true, logged: false }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const c = typeof body.client === "string" && body.client ? body.client.slice(0, 80) : "public";
  const items = sanitizeItems(body.items);
  const action = body.action === "export" ? "export" : "sync";
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const t = Date.now();

  const cmds = [
    ["SET", `bi:slate:${c}`, JSON.stringify(items)],
    ["SADD", "bi:clients", c],
    ["HSET", `bi:client:${c}`, "last", String(t), "lastEvent", action === "export" ? "export" : "slate-sync", "slateCount", String(items.length)],
  ];
  if (action === "export") {
    const rec = JSON.stringify({ c, ev: "export", n: items.length, t, ip });
    cmds.push(["LPUSH", "bi:events", rec], ["LTRIM", "bi:events", "0", "1999"], ["HINCRBY", `bi:client:${c}`, "hits", "1"]);
  }

  try {
    await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" },
      body: JSON.stringify(cmds),
    });
  } catch { /* best-effort; never fail the request */ }

  res.status(200).json({ ok: true, logged: true });
};
