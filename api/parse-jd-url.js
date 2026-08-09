// Best-effort job-posting text fetch for Scout Assistant's job-description
// matching. Many job boards render content via client-side JS and won't yield
// real text to a plain server-side fetch -- this is a best-effort convenience
// for simple static pages, not a guaranteed scraper, and the client UI says so.
// Self-contained CommonJS, mirroring api/feature-request.js.
const MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 8000;

// Basic SSRF guard: a user-supplied URL fetcher should never be able to reach
// loopback, link-local (incl. the 169.254.169.254 cloud-metadata endpoint), or
// private-network addresses. This doesn't defend against DNS-rebinding (fetch
// resolves DNS itself, after this check), but Vercel functions have no route
// to internal/private infrastructure by default, so the residual risk is low;
// this just rules out the obvious, cheap cases.
const BLOCKED_HOST_RE = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|::1$|\[::1\])/i;
function isPrivateHost(hostname) {
  if (BLOCKED_HOST_RE.test(hostname)) return true;
  const m = hostname.match(/^172\.(\d{1,3})\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const url = (typeof body.url === "string" ? body.url : "").trim().slice(0, 2000);
  if (!url) { res.status(400).json({ ok: false, error: "missing_url" }); return; }

  let parsed;
  try { parsed = new URL(url); } catch { res.status(400).json({ ok: false, error: "invalid_url" }); return; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    res.status(400).json({ ok: false, error: "invalid_protocol" });
    return;
  }
  if (isPrivateHost(parsed.hostname)) {
    res.status(400).json({ ok: false, error: "blocked_host" });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; BatonIndexBot/1.0; +https://batonindex.com)" },
    });
    clearTimeout(timer);
    if (!r.ok) { res.status(502).json({ ok: false, error: "fetch_failed", status: r.status }); return; }
    const contentType = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain/i.test(contentType)) {
      res.status(415).json({ ok: false, error: "unsupported_content_type" });
      return;
    }
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) { res.status(413).json({ ok: false, error: "too_large" }); return; }

    const html = Buffer.from(buf).toString("utf8");
    // Naive best-effort text extraction: strip script/style blocks, then tags,
    // then collapse whitespace. Good enough for a static server-rendered
    // posting page; a JS-rendered one will yield little or no usable text,
    // which the client reports plainly rather than pretending it worked.
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&#39;/g, "'").replace(/&quot;/gi, '"')
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 50) {
      res.status(422).json({ ok: false, error: "no_text_extracted" });
      return;
    }
    res.status(200).json({ ok: true, text: text.slice(0, 20000) });
  } catch (e) {
    clearTimeout(timer);
    const timedOut = e && e.name === "AbortError";
    res.status(502).json({ ok: false, error: timedOut ? "timeout" : "fetch_error" });
  }
};
