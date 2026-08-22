/**
 * Downscale freshly-mirrored portraits to the repo's 320px JPEG convention.
 *
 *   node research/thumbnail-cc-photos.mjs [--dry-run] [--width 320] [--quality 82]
 *
 * WHY THIS IS A SEPARATE PASS
 * ---------------------------
 * `downloadAndRecordPhoto` stores whatever the college serves, which is a
 * full-resolution hero image often enough that the community-college run
 * averaged ~350 KB a head -- roughly 30x the ~12 KB the existing 244 mirrors
 * average, and all of it committed to git and shipped to the CDN. Resizing
 * inside the fetcher would have meant a hard dependency on `sharp` for a script
 * whose real job is network I/O, so the two stay split: fetch stores the
 * original, this normalises it.
 *
 * `sharp` is NOT a repo dependency -- it is installed into the session
 * scratchpad, since nothing in the app needs it at build or run time. Point
 * SHARP_PATH at another install if the scratchpad one is gone.
 *
 * Rewrites dean-photos.json in step with the files: a converted .webp/.png
 * becomes .jpg on disk, so the recorded `photo` path has to follow or the app
 * fetches a 404 and silently falls back to a monogram.
 */
import { readFileSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { PUBLIC, DEANS_DIR, PHOTOS_PATH } from "../artifacts/dean-dashboard/scripts/photo-lib.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const DRY = process.argv.includes("--dry-run");
const WIDTH = Number(arg("width", 320));
const QUALITY = Number(arg("quality", 82));

const SHARP_PATH = process.env.SHARP_PATH
  || "/tmp/claude-0/-home-user-Dean-Tracker-Dashboard/416ebf2a-a5b6-5da7-b56c-2e126854d0a9/scratchpad/node_modules/sharp/dist/index.cjs";
const { default: sharp } = await import(SHARP_PATH);

// Only touch what this run added. Files already committed were normalised by an
// earlier pass; re-encoding them would churn the diff and lose a little quality
// for nothing.
const untracked = execSync("git ls-files --others --exclude-standard -- public/deans", {
  cwd: join(PUBLIC, ".."), encoding: "utf8",
}).split("\n").map((s) => s.trim()).filter(Boolean);

if (!untracked.length) { console.error("no new portraits to thumbnail"); process.exit(0); }

const photos = JSON.parse(readFileSync(PHOTOS_PATH, "utf8"));
// "/deans/x.webp" -> the key that points at it, so a rename can update the record.
const byPath = new Map();
for (const [k, v] of Object.entries(photos)) if (v?.photo) byPath.set(v.photo, k);

let before = 0, after = 0, converted = 0, renamed = 0;
for (const rel of untracked) {
  const abs = join(PUBLIC, "..", rel);
  const webPath = "/" + rel.replace(/^public\//, "");
  const srcBytes = statSync(abs).size;
  before += srcBytes;

  let buf;
  try {
    buf = await sharp(abs, { animated: false })
      .resize({ width: WIDTH, withoutEnlargement: true })
      .jpeg({ quality: QUALITY, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    console.error(`  skip ${rel}: ${e.message}`);
    after += srcBytes;
    continue;
  }

  // Never trade a smaller file for a bigger one -- a already-tiny source
  // re-encoded can come out heavier than it went in.
  if (buf.length >= srcBytes && abs.endsWith(".jpg")) { after += srcBytes; continue; }

  const jpgAbs = abs.replace(/\.(webp|png|gif|avif|jpeg)$/i, ".jpg");
  const jpgWeb = webPath.replace(/\.(webp|png|gif|avif|jpeg)$/i, ".jpg");
  after += buf.length;
  converted++;

  if (DRY) continue;
  writeFileSync(jpgAbs, buf);
  if (jpgAbs !== abs) {
    unlinkSync(abs);
    const key = byPath.get(webPath);
    if (key) { photos[key].photo = jpgWeb; renamed++; }
    else console.error(`  ! ${webPath} has no dean-photos.json entry; file renamed, record not updated`);
  }
}

if (!DRY) writeFileSync(PHOTOS_PATH, JSON.stringify(photos));

const mb = (n) => (n / 1024 / 1024).toFixed(1) + " MB";
console.error(
  `${DRY ? "[dry-run] " : ""}${converted}/${untracked.length} portraits -> ${WIDTH}px jpeg` +
  `${renamed ? `, ${renamed} paths rewritten` : ""}\n` +
  `${mb(before)} -> ${mb(after)} (${Math.round(100 - (100 * after) / before)}% smaller), ` +
  `avg ${Math.round(after / untracked.length / 1024)} KB`
);
console.error(`portraits dir: ${DEANS_DIR}`);
