// Shared photo-matching and download/archive logic, used by
// scrape-source-pages.mjs, scrape-leadership-images.mjs, download-photos.mjs,
// and the news-scout auto-fetch hook (news-lib.mjs). Single source of truth
// so bulk and automated ingestion paths can never drift from each other.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const SRC = join(HERE, "..", "src", "data");
export const PUBLIC = join(HERE, "..", "public");
export const DEANS_DIR = join(PUBLIC, "deans");
export const ARCHIVE_DIR = join(DEANS_DIR, "archive");
export const PHOTOS_PATH = join(SRC, "dean-photos.json");

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Some CDNs (Akamai/Cloudflare bot managers, e.g. on Harvard/GMU/NYU/etc.)
// fingerprint-block Node's fetch() with a 403 even with a matching User-Agent,
// while curl with identical headers succeeds. Shell out to curl for binary
// image downloads to route around that; caller catches thrown errors.
export function curlFetchBuffer(url) {
  return execFileSync(
    "curl",
    ["-sS", "-f", "-L", "--max-time", "20", "-A", UA, "-H", "Accept: image/avif,image/webp,image/*,*/*", url],
    { maxBuffer: 20 * 1024 * 1024 }
  );
}

// Same fingerprint-block issue as curlFetchBuffer, but for HTML leadership/
// directory pages: several CDNs 403 Node's fetch() while curl with an
// identical UA succeeds. Used as a fallback when fetch() fails.
export function curlFetchText(url) {
  return execFileSync(
    "curl",
    ["-sS", "-f", "-L", "--max-time", "20", "-A", UA, "-H", "Accept: text/html,application/xhtml+xml", url],
    { maxBuffer: 20 * 1024 * 1024 }
  ).toString("utf8");
}

export const norm = (s) => (s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
export const lastName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[parts.length - 1] || ""; };
export const firstName = (full) => { const parts = norm(full).split(" ").filter(Boolean); return parts[0] || ""; };
export const photoKey = (d, u) => `${d.trim().toLowerCase()}|${u.trim().toLowerCase()}`;
export const slugify = (d, u) => `${d} ${u}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const PLACEHOLDER_RE = /place[-_]?holder|no[-_]?photo|no[-_]?image|default[-_]?avatar|silhouette|generic[-_]?(user|person|avatar)|blank[-_]?(profile|avatar)|missing[-_]?photo|avatar[-_]?default|person[-_]?default/i;

// Pull the filename (minus extension and common size suffixes like -300x300)
// as a fallback text source, since many sites leave alt="" but encode the
// person's name in the image filename (e.g. "Chris-Storm-300x300.jpg").
export function filenameText(src) {
  try {
    const p = new URL(src).pathname;
    const base = p.split("/").pop() || "";
    return base.replace(/\.(jpe?g|png|webp|gif|avif)$/i, "").replace(/-\d{2,4}x\d{2,4}$/i, "").replace(/[-_]+/g, " ");
  } catch { return ""; }
}

export function extractImgs(html, pageUrl) {
  const imgs = [];
  const re = /<img\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const alt = /\balt\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] || "";
    if (!src) continue;
    let abs;
    try { abs = new URL(src, pageUrl).href; } catch { continue; }
    if (/\.(svg)(\?|$)/i.test(abs)) continue;
    // Grab a window of surrounding HTML (often a name/title sits in a
    // <h3>/<p> right after a card's image) and strip tags to plain text.
    const context = html.slice(m.index, Math.min(html.length, m.index + 500)).replace(/<[^>]+>/g, " ");
    imgs.push({ src: abs, alt, filename: filenameText(abs), context });
  }
  return imgs;
}

// candidates: [{dean, university, ...}]. Matches by last+first name against
// alt text, filename, and surrounding HTML context. Deliberately no "single
// lone image on the page" fallback for unmatched candidates — tried and
// dropped this session, it mostly grabbed department logos/crests.
export function matchByName(img, candidates) {
  const sources = [norm(img.alt), norm(img.filename), norm(img.context)];
  for (const c of candidates) {
    const ln = lastName(c.dean), fn = firstName(c.dean);
    if (ln.length < 3) continue;
    for (const s of sources) {
      if (!s) continue;
      if (s.includes(ln) && (s.includes(fn) || fn.length < 3)) return c;
    }
  }
  return null;
}

// Detect image type from magic bytes -> extension, or null if not an image.
export function imgExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.slice(0, 3).toString("ascii") === "GIF") return "gif";
  if (buf.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.slice(8, 16).toString("ascii");
    if (/avif|avis/.test(brand)) return "avif";
    if (/heic|heix|heif|mif1/.test(brand)) return "heic";
  }
  return null;
}

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
export const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

export function loadPhotos() { return JSON.parse(readFileSync(PHOTOS_PATH, "utf8")); }
export function savePhotos(photos) { writeFileSync(PHOTOS_PATH, JSON.stringify(photos)); }

/**
 * Fetch + validate a candidate image and write it into `photos` (the
 * in-memory dean-photos.json map) at the dean|university key. If a photo
 * already exists there and the new one is genuinely different content
 * (by sha256, not just URL), the old file is archived to
 * public/deans/archive/ and prepended to `history` — never deleted, never
 * silently overwritten. If the new URL just points to the same image bytes
 * under a different CDN path, only the pointer fields update (no archive
 * event, no re-download noise from routine re-scrapes).
 *
 * Returns "added" | "updated" | "unchanged" | a string starting with
 * "fail:" on failure. Does NOT write dean-photos.json to disk — call
 * savePhotos() once after a batch of these.
 */
export async function downloadAndRecordPhoto({ dean, university, imageUrl, pageUrl, photos }) {
  if (!imageUrl) return "fail:no-image-url";
  if (PLACEHOLDER_RE.test(imageUrl)) return "fail:placeholder-url";
  const kk = photoKey(dean, university);
  const existing = photos[kk];

  if (existing?.photo && existing.source === imageUrl && existsSync(join(PUBLIC, existing.photo.replace(/^\//, "")))) {
    return "unchanged"; // same candidate URL already recorded — no network call
  }

  let buf;
  try {
    const r = await fetch(imageUrl, { headers: { "User-Agent": UA, Accept: "image/avif,image/webp,image/*,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) {
      if (r.status !== 403) return `fail:HTTP ${r.status}`;
      try { buf = curlFetchBuffer(imageUrl); } catch { return `fail:HTTP ${r.status}`; }
    } else {
      buf = Buffer.from(await r.arrayBuffer());
    }
  } catch (e) {
    try { buf = curlFetchBuffer(imageUrl); } catch { return `fail:${e.message}`; }
  }

  const ext = imgExt(buf);
  if (!ext) return "fail:not-an-image";
  if (buf.length < 3000) return `fail:too-small(${buf.length}b)`;

  const newHash = sha256(buf);
  const slug = slugify(dean, university);
  const file = `${slug}.${ext}`;

  if (existing?.photo) {
    const existingPath = join(PUBLIC, existing.photo.replace(/^\//, ""));
    const existingHash = existing.hash || (existsSync(existingPath) ? sha256(readFileSync(existingPath)) : null);

    if (existingHash && existingHash === newHash) {
      photos[kk] = { ...existing, source: imageUrl, page: pageUrl || existing.page, hash: newHash };
      return "unchanged"; // same image content, just a different URL
    }

    if (existsSync(existingPath)) {
      mkdirSync(ARCHIVE_DIR, { recursive: true });
      const oldExt = existing.photo.split(".").pop();
      const archiveFile = `${slug}-${today()}-${(existingHash || "unknown").slice(0, 8)}.${oldExt}`;
      writeFileSync(join(ARCHIVE_DIR, archiveFile), readFileSync(existingPath));
      const history = existing.history || [];
      history.unshift({
        photo: `/deans/archive/${archiveFile}`,
        source: existing.source,
        page: existing.page,
        capturedAt: existing.capturedAt || today(),
        hash: existingHash || undefined,
      });
      writeFileSync(join(DEANS_DIR, file), buf);
      photos[kk] = { photo: `/deans/${file}`, page: pageUrl || "", source: imageUrl, hash: newHash, capturedAt: today(), history };
      return "updated";
    }
  }

  writeFileSync(join(DEANS_DIR, file), buf);
  photos[kk] = { photo: `/deans/${file}`, page: pageUrl || "", source: imageUrl, hash: newHash, capturedAt: today() };
  return existing ? "updated" : "added";
}

/**
 * Used by the news-scout auto-apply loop right after a brand-new record is
 * added: fetch the record's own sourceUrl (the article/bio page just cited),
 * look for that one person's headshot on it via the same name-matching used
 * by the bulk scrapers, and record it if found. A single-page, single-
 * candidate version of scrape-source-pages.mjs's batch flow.
 *
 * Returns "added" | "updated" | "unchanged" | "fail:no-match" | a string
 * starting with "fail:" on fetch/validation failure. Does NOT write
 * dean-photos.json to disk — call savePhotos() after the caller's batch.
 */
export async function autoFetchPhotoForRecord({ dean, university, sourceUrl, photos }) {
  if (photos[photoKey(dean, university)]) return "unchanged"; // already have a photo for this exact role
  let html;
  try {
    const r = await fetch(sourceUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return `fail:HTTP ${r.status}`;
    html = await r.text();
  } catch (e) { return `fail:${e.message}`; }

  const img = extractImgs(html, sourceUrl).find((i) => matchByName(i, [{ dean, university }]));
  if (!img) return "fail:no-match";
  return downloadAndRecordPhoto({ dean, university, imageUrl: img.src, pageUrl: sourceUrl, photos });
}
