/**
 * Wayback Machine access, and the name matching that reads a leadership page.
 *
 * Used by bench-start-dates.mjs to bracket when an associate/vice dean first
 * appeared on their school's leadership page. Snapshots are the only source that
 * scales to 11,930 records: they bracket an appearance window without needing an
 * announcement to exist, which is why almost none of these people have a start
 * date today.
 *
 * WHY curl AND NOT fetch()
 * Node's global fetch does not honour HTTPS_PROXY, and in a sandboxed or
 * proxied environment it fails with an egress-policy error while curl -- which
 * reads the proxy and CA settings from the environment -- succeeds. Shelling out
 * also keeps this dependency-free, which matters in a workspace that deliberately
 * embargoes new npm releases for a day (see pnpm-workspace.yaml).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const USER_AGENT = "BatonIndex-bench-start-dates/1.0 (research pipeline; contact via repository)";

/** One HTTP GET through curl. Returns { ok, status, body }. Never throws on HTTP status. */
async function get(url, { timeout = 45, maxBytes = 8 * 1024 * 1024 } = {}) {
  try {
    const { stdout } = await execFileP("curl", [
      "-sS", "--compressed", "--max-time", String(timeout),
      "--max-filesize", String(maxBytes),
      "-A", USER_AGENT,
      "-w", "\n__STATUS__%{http_code}",
      url,
    ], { maxBuffer: maxBytes + 1024 * 1024, encoding: "utf8" });
    const cut = stdout.lastIndexOf("\n__STATUS__");
    if (cut < 0) return { ok: false, status: 0, body: stdout };
    const status = parseInt(stdout.slice(cut + 11), 10);
    return { ok: status >= 200 && status < 300, status, body: stdout.slice(0, cut) };
  } catch (e) {
    return { ok: false, status: 0, body: "", error: String(e.message ?? e).slice(0, 200) };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with backoff. The archive answers 429 and 5xx under load and it is a free
 * service being asked for tens of thousands of pages -- backing off properly is
 * the difference between a pipeline that finishes and one that gets throttled to
 * a stop.
 */
export async function politeGet(url, { attempts = 4, baseDelayMs = 2000, ...opts } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await get(url, opts);
    if (last.ok) return last;
    if (last.status === 404) return last; // a real answer, not a hiccup
    await sleep(baseDelayMs * 2 ** i);
  }
  return last;
}

/**
 * Every archived snapshot of a URL, oldest first: [{ ts, status }].
 * `collapse=timestamp:6` asks the archive for at most one capture per month,
 * which is the resolution this pipeline can actually use and cuts the list from
 * thousands of rows to tens.
 */
export async function snapshots(url) {
  const q = new URLSearchParams({
    url,
    output: "json",
    fl: "timestamp,statuscode",
    filter: "statuscode:200",
    collapse: "timestamp:6",
    limit: "400",
  });
  const res = await politeGet(`https://web.archive.org/cdx/search/cdx?${q}`);
  if (!res.ok) return { ok: false, error: `cdx ${res.status}`, list: [] };
  let rows;
  try { rows = JSON.parse(res.body || "[]"); } catch { return { ok: false, error: "cdx parse", list: [] }; }
  if (!Array.isArray(rows) || rows.length < 2) return { ok: true, list: [] }; // header only = never archived
  return { ok: true, list: rows.slice(1).map(([ts]) => ({ ts })).sort((a, b) => a.ts.localeCompare(b.ts)) };
}

/** The raw archived page (id_ = as captured, without the archive's own chrome). */
export async function snapshotText(url, ts) {
  const res = await politeGet(`https://web.archive.org/web/${ts}id_/${url}`);
  return res.ok ? res.body : null;
}

// ---- name matching ---------------------------------------------------------

const STRIP_TITLES = /\b(dr|prof|professor|mr|mrs|ms|jr|sr|ii|iii|iv|phd|ph|d|md|edd|dnp|mba|msn|rn|faan|facs)\b/g;

/** Lowercase, unaccent, drop punctuation and honorifics, collapse spaces. */
export function normalizeText(s) {
  return String(s ?? "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(STRIP_TITLES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The name forms to look for. A record's "Chuck (Charles) Lindsey" has to match a
 * page saying either, and "Suzanne M. Murphy" has to match a page saying
 * "Suzanne Murphy" -- which it does, since the matcher below allows up to two
 * tokens between the first and last name rather than requiring the exact string.
 */
export function nameVariants(name) {
  const raw = String(name ?? "");
  const alt = [...raw.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
  const base = raw.replace(/\([^)]*\)/g, " ");
  const out = new Set();
  for (const form of [base, ...alt.map((a) => `${a} ${base.split(/\s+/).filter(Boolean).slice(-1)[0] ?? ""}`)]) {
    const toks = normalizeText(form).split(" ").filter((t) => t.length > 1);
    if (toks.length >= 2) out.add(`${toks[0]}|${toks[toks.length - 1]}`);
  }
  return [...out];
}

/**
 * Does this page name this person? First name, then up to two intervening tokens
 * (a middle name or initial), then last name.
 *
 * Deliberately permissive on the middle and strict on the ends: a page listing
 * "Murphy, Suzanne" in a table would be missed, and that is the right trade --
 * a false NEGATIVE costs one unresolved record, while a false POSITIVE writes a
 * wrong start date into the corpus, which is the failure this whole pipeline
 * exists to avoid.
 */
export function pageNamesPerson(normalizedPage, variants) {
  for (const v of variants) {
    const [first, last] = v.split("|");
    const re = new RegExp(`\\b${first}\\b(?:\\s+\\S+){0,2}\\s+\\b${last}\\b`);
    if (re.test(normalizedPage)) return true;
  }
  return false;
}

/** "20240828161934" -> "2024-08". */
export const tsToMonth = (ts) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}`;
export const tsToYear = (ts) => parseInt(ts.slice(0, 4), 10);
