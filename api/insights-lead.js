// Baton Index — Insights lead capture endpoint.
//
// The Insights panel POSTs { email } here before revealing the white-paper
// download. This is a soft marketing gate (not access control): we validate the
// address, record the lead to the function log, and return the download URL.
// Self-contained CommonJS, mirroring api/trial.js / api/data.js.
//
// Swap the console.log for a real sink (email/CRM/webhook) when one is wired up;
// the client already treats a 200 as "unlocked" and fails open on network error,
// so the demo never dead-ends.
const DOWNLOAD_URL = "/insights/baton-dean-discipline-brief.pdf";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method_not_allowed" });
    return;
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body && typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  const org = (body && typeof body.org === "string" ? body.org : "").trim().slice(0, 120);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }
  try {
    console.log(JSON.stringify({ evt: "insights_lead", email, org, report: "dean-discipline", ts: new Date().toISOString() }));
  } catch { /* logging is best-effort */ }
  res.status(200).json({ ok: true, downloadUrl: DOWNLOAD_URL });
};
