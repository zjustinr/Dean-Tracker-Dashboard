/**
 * Download portraits from an ETL photo manifest into public/deans/, then register
 * them in dean-photos.json (keyed dean|university, the existing convention).
 * Rejects non-images, tiny files, and any Wikipedia/Wikimedia URL.
 *
 *   node research/fetch_photos.mjs --manifest <scratchpad>/r2/photo_manifest_r1-r2public.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const APP = "C:/Users/ren/BOSTON UNIVERSITY Dropbox/Justin Z. Ren/00 Spring 2026/Dean Research/App/Dean-Tracker-Dashboard/artifacts/dean-dashboard/";
const PUB = APP + "public/deans/";
const PHOTOS = APP + "src/data/dean-photos.json";
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const MANIFEST = arg("manifest", "");
if (!MANIFEST) { console.error("need --manifest <path>"); process.exit(1); }

const slug = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const key = (d, u) => `${String(d).trim().toLowerCase()}|${String(u).trim().toLowerCase()}`;

if (!existsSync(PUB)) mkdirSync(PUB, { recursive: true });
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const photos = JSON.parse(readFileSync(PHOTOS, "utf8"));

let added = 0, already = 0, skipped = 0, failed = 0;
const fails = [];

for (const m of manifest) {
  const k = key(m.dean, m.university);
  if (photos[k]) { already++; continue; }
  if (!m.photoUrl || /wikipedia|wikimedia/i.test(m.photoUrl)) { skipped++; continue; }
  const name = `${slug(m.dean)}-${slug(m.university)}.jpg`;
  try {
    const r = await fetch(m.photoUrl, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; BatonIndex/1.0)", accept: "image/*" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const ct = r.headers.get("content-type") || "";
    if (!/^image\//i.test(ct)) throw new Error(`not an image (${ct.slice(0, 30)})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 2500) throw new Error(`too small (${buf.length}b)`);
    writeFileSync(PUB + name, buf);
    photos[k] = { photo: `/deans/${name}`, page: m.bioPage || "", source: m.photoUrl };
    added++;
  } catch (e) { failed++; fails.push(`${m.dean} @ ${m.university}: ${e.message}`); }
}

writeFileSync(PHOTOS, JSON.stringify(photos, null, 1));
console.log(`portraits added ${added} | already had ${already} | no usable url ${skipped} | failed ${failed}`);
if (fails.length) { console.log("\nfirst failures:"); fails.slice(0, 20).forEach((f) => console.log("  " + f)); }
