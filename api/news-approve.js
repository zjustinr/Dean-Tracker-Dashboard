// Baton Index — review-digest decision endpoint.
//
// The daily digest email signs one Approve / Dismiss link per pending item. This
// endpoint verifies that signed link (HMAC-SHA256, same scheme as scripts/
// news-lib.mjs signAction) and, if valid, fires a GitHub repository_dispatch
// (event_type "news-decision") carrying only { id, act }. The news-decision
// workflow then looks the id up in the committed review queue and applies or
// dismisses it — so this function holds no data and cannot mutate anything by
// itself; a forged link fails the signature check.
//
// Self-contained CommonJS (mirrors api/data.js) — the one function format known
// to deploy on this static Vercel project.
//
// Env: APPROVE_SECRET (sign/verify), GITHUB_DISPATCH_TOKEN (fine-grained PAT with
// contents+actions write), GITHUB_REPO (default zjustinr/Dean-Tracker-Dashboard).
const crypto = require("crypto");

function hmac(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function verify(token, secret, nowSec) {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = hmac(secret, body);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  let p;
  try { p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); }
  catch { return { ok: false, reason: "malformed" }; }
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  if (typeof p.x === "number" && now >= p.x) return { ok: false, reason: "expired" };
  return { ok: true, id: p.i, act: p.a };
}

function page(title, body, color) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#F4F6F8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="max-width:460px;margin:12vh auto;background:#fff;border-radius:14px;padding:36px 32px;text-align:center;box-shadow:0 2px 18px rgba(20,35,58,.08);">
    <div style="font:800 20px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#A31F34;">Baton Index</div>
    <div style="width:44px;height:44px;border-radius:50%;background:${color};margin:22px auto 0;"></div>
    <h1 style="font:700 22px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#16233A;margin:18px 0 8px;">${title}</h1>
    <p style="font:400 15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#5B6B7B;margin:0;">${body}</p>
    <a href="https://batonindex.com" style="display:inline-block;margin-top:22px;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;color:#011F5B;text-decoration:none;">Open Baton Index →</a>
  </div></body></html>`;
}
function send(res, status, title, body, color) {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.status(status).send(page(title, body, color));
}

module.exports = async function handler(req, res) {
  const secret = process.env.APPROVE_SECRET;
  if (!secret) return send(res, 503, "Not configured", "The review pipeline isn't armed yet (APPROVE_SECRET is unset).", "#98A2AF");

  const token = (req.query && (req.query.t || req.query.token)) || "";
  const v = verify(String(token), secret);
  if (!v.ok) {
    const msg = v.reason === "expired"
      ? "This link has expired. Open the app to review pending items."
      : "This link is invalid. Please use the buttons in the digest email.";
    return send(res, 400, "Link not valid", msg, "#C7723B");
  }
  const act = v.act === "dismiss" ? "dismiss" : "approve";

  const token2 = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO || "zjustinr/Dean-Tracker-Dashboard";
  if (!token2) return send(res, 503, "Not configured", "GITHUB_DISPATCH_TOKEN is unset, so the decision can't be applied yet.", "#98A2AF");

  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token2}`,
        accept: "application/vnd.github+json",
        "user-agent": "baton-index-news-approve",
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ event_type: "news-decision", client_payload: { id: String(v.id), act } }),
    });
    if (r.status !== 204) {
      console.error("dispatch failed", r.status, await r.text().catch(() => ""));
      return send(res, 502, "Couldn't record that", "GitHub didn't accept the request. Try again in a moment.", "#B23A48");
    }
  } catch (e) {
    console.error("dispatch error", e && e.message);
    return send(res, 502, "Couldn't record that", "Network error reaching GitHub. Try again in a moment.", "#B23A48");
  }

  return act === "approve"
    ? send(res, 200, "Approved ✓", "Adding this leader and queuing enrichment (education, discipline, headshot, research pack). It'll appear in the app within a few minutes.", "#2E7D5B")
    : send(res, 200, "Dismissed", "Got it — this item has been dropped from the queue and won't be added.", "#5B6B7B");
};
