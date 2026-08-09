// Download dean headshots from researched image URLs, validate them, save to
// public/deans/<slug>.<ext>, and update src/data/dean-photos.json.
//
//   node scripts/download-photos.mjs <urls1.json> [urls2.json ...]
// Each input file is an array of {dean, university, slug, imageUrl, pageUrl}.
// Skips entries with empty imageUrl; validates real image bytes + min size;
// leaves a report of successes and failures.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const DEANS_DIR = join(HERE, "..", "public", "deans");
const PHOTOS = join(SRC, "dean-photos.json");

const inputs = process.argv.slice(2);
if (!inputs.length) { console.error("usage: download-photos.mjs <urls.json> ..."); process.exit(1); }

const rows = [];
for (const f of inputs) { if (existsSync(f)) rows.push(...JSON.parse(readFileSync(f, "utf8"))); }
const seen = new Set();
const targets = rows.filter((r) => r.imageUrl && r.slug && !seen.has(r.slug) && seen.add(r.slug));
console.log(`${rows.length} rows, ${targets.length} with an image URL to fetch`);

// Detect image type from magic bytes -> extension, or null if not an image.
function imgExt(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "png";
  if (buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  if (buf.slice(0, 3).toString("ascii") === "GIF") return "gif";
  // ISO-BMFF: bytes 4-7 "ftyp", major brand at 8-11 (avif / heic / heif)
  if (buf.slice(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.slice(8, 16).toString("ascii");
    if (/avif|avis/.test(brand)) return "avif";
    if (/heic|heix|heif|mif1/.test(brand)) return "heic";
  }
  return null;
}

const photos = JSON.parse(readFileSync(PHOTOS, "utf8"));
const key = (d, u) => `${d.trim().toLowerCase()}|${u.trim().toLowerCase()}`;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const DELAY_MS = parseInt(process.env.DOWNLOAD_DELAY_MS || "300", 10);

const PLACEHOLDER_RE = /placeholder|no[-_]?photo|no[-_]?image|default[-_]?avatar|silhouette|generic[-_]?(user|person|avatar)|blank[-_]?(profile|avatar)|missing[-_]?photo|avatar[-_]?default|person[-_]?default/i;

const PUBLIC = join(HERE, "..", "public");
let ok = 0, skipped = 0; const fails = [];
for (const t of targets) {
  try {
    if (PLACEHOLDER_RE.test(t.imageUrl)) { fails.push(`${t.slug}: placeholder image URL`); continue; }
    const kk = key(t.dean, t.university);
    if (photos[kk]?.photo && existsSync(join(PUBLIC, photos[kk].photo.replace(/^\//, "")))) { skipped++; continue; }
    await sleep(DELAY_MS);
    const r = await fetch(t.imageUrl, { headers: { "User-Agent": UA, "Accept": "image/avif,image/webp,image/*,*/*" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!r.ok) { fails.push(`${t.slug}: HTTP ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const ext = imgExt(buf);
    if (!ext) { fails.push(`${t.slug}: not an image (${buf.slice(0, 16).toString("ascii").replace(/[^ -~]/g, ".")})`); continue; }
    if (buf.length < 3000) { fails.push(`${t.slug}: too small (${buf.length}b)`); continue; }
    const file = `${t.slug}.${ext}`;
    writeFileSync(join(DEANS_DIR, file), buf);
    photos[key(t.dean, t.university)] = { photo: `/deans/${file}`, page: t.pageUrl || "", source: t.imageUrl };
    ok++;
  } catch (e) { fails.push(`${t.slug}: ${e.message}`); }
}

writeFileSync(PHOTOS, JSON.stringify(photos));
console.log(`\nDownloaded ${ok}, skipped ${skipped} (already had), of ${targets.length}. dean-photos.json now ${Object.keys(photos).length} entries.`);
if (fails.length) { console.log(`\nFailures (${fails.length}):`); fails.forEach((f) => console.log("  " + f)); }
