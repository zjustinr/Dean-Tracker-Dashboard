/**
 * Finding a community college's leadership page, and reading names off it.
 *
 * Used by `verify-cc-leaders.mjs`.
 *
 * NOT YET used by `fetch-cc-photos.mjs`, which still carries its own copy of the
 * same homepage -> leadership-page walk. That duplication is deliberate and
 * temporary, and it is worth being honest about why rather than pretending the
 * consolidation already happened:
 *
 *  - The photo fetcher reaches college sites with node's `fetch` and gets 80
 *    hits doing it. This module uses `curl` instead, because the verifier also
 *    talks to the Urban Institute API path where agent proxies 403 undici. The
 *    two transports do not behave identically against a few hundred college
 *    sites, and swapping one for the other is a change with results attached.
 *  - A scheduled routine re-runs the photo pass on 25 Aug 2026. Rewriting its
 *    crawl days beforehand would mean the next run is the first test of the new
 *    code, with nobody watching.
 *
 * So: consolidate `fetch-cc-photos.mjs` onto this module AFTER that run lands,
 * and diff the hit count across the change rather than assuming it holds.
 */
import { execFileSync } from "node:child_process";

export const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

/**
 * Leadership-page paths to try when the homepage yields no usable link.
 * Community colleges are far more uniform here than universities, but
 * "Chancellor" appears wherever the college is a district.
 */
export const PATHS = [
  "/president", "/about/president", "/office-of-the-president", "/about/office-of-the-president",
  "/chancellor", "/about/chancellor", "/leadership", "/about/leadership",
  "/administration", "/about/administration", "/about-us/leadership", "/about/presidents-office",
];

const LINK_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi;
const LEAD_RE = /\b(president|chancellor|leadership|administration)\b/i;
const SKIP_RE = /\b(search|news|calendar|scholarship|award|student government|club|login)\b/i;

/**
 * Fetch a page via curl.
 *
 * curl, not node fetch: agent proxies in these environments 403 undici but pass
 * curl through -- the same reason build-cc-universe.mjs shells out.
 * `-L` follows redirects, `-w` appends the final URL so relative links resolve
 * against where we actually landed rather than where we aimed.
 */
export function getPage(url, timeoutSec = 20) {
  const out = execFileSync(
    "curl",
    ["-sSL", "-m", String(timeoutSec), "-A", UA, "-H", "Accept: text/html", "-w", "\n__FINAL__%{url_effective}", url],
    { maxBuffer: 1 << 27, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const i = out.lastIndexOf("\n__FINAL__");
  return i < 0 ? { html: out, url } : { html: out.slice(0, i), url: out.slice(i + 10).trim() || url };
}

/** Candidate leadership pages for a college, best first. */
export function leadershipPages(home, max = 6) {
  const out = [];
  let base = home;
  try {
    const { html, url } = getPage(home);
    base = url;
    let m;
    while ((m = LINK_RE.exec(html))) {
      const [, href, text] = m;
      const label = text.replace(/<[^>]+>/g, " ");
      if (!LEAD_RE.test(label) && !LEAD_RE.test(href)) continue;
      if (SKIP_RE.test(label)) continue;
      try { out.push(new URL(href, url).href); } catch { /* malformed href */ }
    }
    // Prefer a link naming the office over a generic "about" landing page.
    out.sort((a, b) => (/president|chancellor/i.test(b) ? 1 : 0) - (/president|chancellor/i.test(a) ? 1 : 0));
  } catch { /* homepage unreachable -- fall through to the fixed paths */ }
  for (const p of PATHS) { try { out.push(new URL(p, base).href); } catch { /* bad base */ } }
  return [...new Set(out)].slice(0, max);
}

/** Visible text of a page, with script/style/nav chrome stripped. */
export function pageText(html) {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const HONORIFIC = /\b(dr|mr|mrs|ms|prof|professor|rev|sr|jr|ii|iii|iv|phd|ph\.?d|edd|ed\.?d|dba|jd|mba|mfa|msn|dnp|ma|ms|mpa|cpa|esq)\b\.?/gi;

/** "Dr. Anne M. Kress, Ph.D." -> {first:"anne", last:"kress", full:"anne m kress"} */
export function parseName(raw) {
  const cleaned = (raw || "")
    .replace(/\(.*?\)/g, " ")
    .split(/,/)[0]                    // drop ", Ph.D." style suffixes
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(HONORIFIC, " ")
    .replace(/[^A-Za-z'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const parts = cleaned.split(" ").filter((p) => p.length > 1);
  if (!parts.length) return null;
  return { first: parts[0], last: parts[parts.length - 1], full: cleaned, parts };
}

/** Normalise page text the same way, so name comparison is like-for-like. */
export const normText = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z'\-\s]/g, " ").replace(/\s+/g, " ").toLowerCase();
