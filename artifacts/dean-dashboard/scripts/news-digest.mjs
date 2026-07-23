#!/usr/bin/env node
/**
 * Daily review digest — emails the owner the pending (medium-confidence) leader
 * appointments the scout couldn't auto-apply, each with a signed Approve / Dismiss
 * link. Approve -> /api/news-approve fires a repository_dispatch that adds the
 * record and queues it for enrichment; Dismiss just drops it from the queue.
 *
 * Read-only over the queue: the decision workflow removes acted items, and the
 * scout ages the rest out at 14 days, so it is safe to re-send pending items
 * every day (the signed links are stateless and stable).
 *
 * Env:
 *   RESEND_API_KEY   required to actually send (absent -> preview to stdout, no-op)
 *   APPROVE_SECRET   required to sign the links (absent -> no-op)
 *   PUBLIC_BASE_URL  e.g. https://batonindex.com   (default: https://batonindex.com)
 *   DIGEST_TO        recipient (default: justin.ren@gmail.com)
 *   DIGEST_FROM      sender    (default: "Baton Index <alerts@batonindex.com>")
 * Flags: --print  render the HTML to stdout without sending.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { signAction } from "./news-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEW_PATH = resolve(__dirname, "../../..", "attached_assets/news_scout_review.json");

const PRINT = process.argv.includes("--print");
const SECRET = process.env.APPROVE_SECRET || "";
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const BASE = (process.env.PUBLIC_BASE_URL || "https://batonindex.com").replace(/\/$/, "");
const TO = process.env.DIGEST_TO || "justin.ren@gmail.com";
const FROM = process.env.DIGEST_FROM || "Baton Index <alerts@batonindex.com>";
const LINK_TTL = 14 * 86400; // seconds; matches the queue age-out window

const INDEX_LABEL = {
  business: "R1 Business", engineering: "R1 Engineering", university: "R1 University (President)",
  medical: "R1 Medical", law: "R1 Law", provost: "R1 Provost", agriculture: "Agriculture & Forestry",
  nursing: "Nursing", pharmacy: "Pharmacy", education: "Education", arts: "Arts & Sciences",
  publichealth: "Public Health",
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function link(id, act) {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL;
  return `${BASE}/api/news-approve?t=${encodeURIComponent(signAction(String(id), act, exp, SECRET))}`;
}

function card(it) {
  const idx = INDEX_LABEL[it.schoolType] || it.schoolType || "—";
  const when = (it.date || "").slice(0, 10);
  const who = it.dean ? esc(it.dean) : "<i>name not detected — research on approve</i>";
  const kind = it.type === "departure" ? "Departure" : "New appointment";
  const interim = it.interim ? " (interim)" : "";
  return `
  <tr><td style="padding:16px 0;border-bottom:1px solid #E6E9EE;">
    <div style="font:600 12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#A31F34;text-transform:uppercase;letter-spacing:.04em;">${esc(idx)} · ${kind}${interim}</div>
    <div style="font:700 17px/1.35 -apple-system,Segoe UI,Roboto,sans-serif;color:#16233A;margin:4px 0 2px;">${who}</div>
    <div style="font:400 14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#16233A;">${esc(it.university)}${it.school ? ` — ${esc(it.school)}` : ""}</div>
    <div style="font:400 13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#5B6B7B;margin-top:6px;">${esc(it.title)} <span style="color:#98A2AF;">· ${when}</span></div>
    <div style="margin-top:6px;"><a href="${esc(it.url)}" style="font:400 13px -apple-system,Segoe UI,Roboto,sans-serif;color:#011F5B;">Read the source →</a></div>
    <div style="margin-top:12px;">
      <a href="${link(it.id, "approve")}" style="display:inline-block;background:#A31F34;color:#fff;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;padding:9px 20px;border-radius:8px;margin-right:8px;">✓ Approve &amp; add</a>
      <a href="${link(it.id, "dismiss")}" style="display:inline-block;background:#fff;color:#5B6B7B;font:600 14px -apple-system,Segoe UI,Roboto,sans-serif;text-decoration:none;padding:8px 18px;border-radius:8px;border:1px solid #C7CDD6;">Dismiss</a>
    </div>
  </td></tr>`;
}

function render(items) {
  return `<!doctype html><html><body style="margin:0;background:#F4F6F8;padding:24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;padding:28px 32px;">
      <tr><td>
        <div style="font:800 20px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:#A31F34;">Baton Index</div>
        <div style="font:700 22px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:#16233A;margin-top:6px;">${items.length} leadership ${items.length === 1 ? "change" : "changes"} awaiting your OK</div>
        <div style="font:400 14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#5B6B7B;margin-top:6px;">The scout flagged these but wasn't confident enough to add them automatically. Approve to add the record and enrich it; dismiss to drop it. Links are private to you and expire in 14 days.</div>
      </td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items.map(card).join("")}</table></td></tr>
      <tr><td style="padding-top:18px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#98A2AF;">High-confidence appointments are added automatically and don't appear here. You're seeing this because you own the Baton Index data pipeline.</td></tr>
    </table>
  </td></tr></table>
  </body></html>`;
}

// ---- main ----
const all = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, "utf8")) : [];
const items = all.filter((r) => r && r.id != null && r.university && r.schoolType);

if (!items.length) { console.log("digest: no pending items — nothing to send."); process.exit(0); }
if (!SECRET) { console.log("digest: APPROVE_SECRET unset — cannot sign links, skipping send."); process.exit(0); }

const html = render(items);
const subject = `Baton Index — ${items.length} leadership ${items.length === 1 ? "change" : "changes"} to review`;

if (PRINT || !RESEND_KEY) {
  if (!RESEND_KEY && !PRINT) console.log("digest: RESEND_API_KEY unset — preview only (no send).");
  console.log(html);
  console.log(`\n[preview] to=${TO} from=${FROM} subject="${subject}" items=${items.length}`);
  process.exit(0);
}

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { authorization: `Bearer ${RESEND_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ from: FROM, to: [TO], subject, html }),
});
if (!res.ok) { console.error(`digest: Resend send failed ${res.status}: ${await res.text()}`); process.exit(1); }
console.log(`digest: sent ${items.length} item(s) to ${TO}.`);
