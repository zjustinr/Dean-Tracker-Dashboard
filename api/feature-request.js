// BatonIndex feature-suggestion widget endpoint.
//
// The floating "Suggest a feature" box POSTs { email?, message, screenshot?,
// pageUrl?, pageTitle? } here. `screenshot` is a data: URL (image/jpeg or
// image/png) produced client-side by rasterizing the current viewport, so this
// function never touches a browser itself. Self-contained CommonJS, mirroring
// api/insights-lead.js / api/trial.js.
//
// Env:
//   RESEND_API_KEY        required to actually send (absent -> log + no-op,
//                          matching insights-lead.js so a demo never dead-ends)
//   FEATURE_REQUEST_TO     recipient   (default: justin.ren@gmail.com)
//   FEATURE_REQUEST_FROM   sender      (default: "Baton Index <alerts@batonindex.com>")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Data-URL payloads inflate ~33% over raw bytes; cap well under Vercel's request
// body limit so an oversized capture fails loudly instead of crashing the function.
const MAX_SCREENSHOT_CHARS = 6_000_000;
const MAX_MESSAGE_CHARS = 4000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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

  const email = (typeof body.email === "string" ? body.email : "").trim().slice(0, 254);
  const message = (typeof body.message === "string" ? body.message : "").trim().slice(0, MAX_MESSAGE_CHARS);
  const pageUrl = (typeof body.pageUrl === "string" ? body.pageUrl : "").trim().slice(0, 500);
  const pageTitle = (typeof body.pageTitle === "string" ? body.pageTitle : "").trim().slice(0, 200);
  const screenshot = typeof body.screenshot === "string" ? body.screenshot : "";

  if (!message) {
    res.status(400).json({ ok: false, error: "empty_message" });
    return;
  }
  if (email && !EMAIL_RE.test(email)) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }
  if (screenshot.length > MAX_SCREENSHOT_CHARS) {
    res.status(413).json({ ok: false, error: "screenshot_too_large" });
    return;
  }

  const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/s.exec(screenshot);
  const attachments = [];
  if (match) {
    const ext = match[1] === "image/png" ? "png" : "jpg";
    attachments.push({ filename: `screenshot.${ext}`, content: match[2] });
  }

  try {
    console.log(JSON.stringify({
      evt: "feature_request", email: email || null, pageUrl, pageTitle,
      messageLen: message.length, hasScreenshot: Boolean(match), ts: new Date().toISOString(),
    }));
  } catch { /* logging is best-effort */ }

  const RESEND_KEY = process.env.RESEND_API_KEY || "";
  if (!RESEND_KEY) {
    // No sink configured: don't dead-end the demo, but say so plainly server-side.
    console.log("feature-request: RESEND_API_KEY unset (logged only, not emailed).");
    res.status(200).json({ ok: true, sent: false });
    return;
  }

  const TO = process.env.FEATURE_REQUEST_TO || "justin.ren@gmail.com";
  const FROM = process.env.FEATURE_REQUEST_FROM || "Baton Index <alerts@batonindex.com>";
  const html = `
    <p><strong>New feature suggestion</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
    <hr />
    <p>
      ${email ? `Reply-to: ${escapeHtml(email)}<br />` : "No email given (visitor opted out of follow-up).<br />"}
      ${pageTitle ? `Page: ${escapeHtml(pageTitle)}<br />` : ""}
      ${pageUrl ? `URL: ${escapeHtml(pageUrl)}<br />` : ""}
      ${attachments.length ? "Screenshot attached." : "No screenshot (capture failed or was skipped)."}
    </p>`;

  try {
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        ...(email ? { reply_to: email } : {}),
        subject: `BatonIndex feature request${pageTitle ? ` (${pageTitle})` : ""}`,
        html,
        attachments,
      }),
    });
    if (!resendRes.ok) {
      console.error(`feature-request: Resend send failed ${resendRes.status}: ${await resendRes.text()}`);
      res.status(502).json({ ok: false, error: "send_failed" });
      return;
    }
  } catch (e) {
    console.error("feature-request: Resend request threw:", e && e.message);
    res.status(502).json({ ok: false, error: "send_failed" });
    return;
  }

  res.status(200).json({ ok: true, sent: true });
};
