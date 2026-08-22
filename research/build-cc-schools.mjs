/**
 * Turn the community-college census into the app's schools table.
 *
 *   node research/build-cc-schools.mjs [--dry-run]
 *
 * Writes `artifacts/dean-dashboard/src/data/r1-communitycollege-schools.json`
 * in the same shape as every other `*-schools.json`, so the index only needs its
 * dean file and a line in `scripts/lib/indices.mjs` to come alive. Nothing loads
 * this file until `datasets.ts` names it, so shipping it early is inert.
 *
 * BOTH SEATS, NOT ONE (settled 21 Aug 2026)
 * -----------------------------------------
 * 92 of the 1,077 colleges sit inside a multi-college district, and each of
 * those districts has a chancellor ABOVE the campus presidents. Both seats are
 * searched nationally and the move between them is the career step this product
 * exists to show, so the table carries both and marks which is which:
 *
 *   seatType "standalone" -- the president IS the top seat
 *   seatType "campus"     -- president reports to a district chancellor
 *   seatType "district"   -- the chancellorship itself
 *
 * Collapsing to campus-only would delete the biggest jobs in the sector;
 * collapsing to district-only would delete the bench those jobs recruit from.
 * A pure campus-level table is not even available: Dallas College, Houston CC,
 * Lone Star and Tarrant County already report to IPEDS as single units, so
 * "campus level" would silently mean "whatever IPEDS happens to report".
 *
 * COORDINATES ARE LOAD-BEARING
 * ----------------------------
 * CareerMap renders with geoAlbersUsa, which returns null outside the
 * contiguous states plus the Alaska/Hawaii insets -- and a null coordinate
 * throws inside react-simple-maps' <Marker>, blanking the whole page. Bounds
 * are copied from `projectableUS`/`inAlbersUsa` in CareerMap.tsx; anything
 * outside them ships as lat/lng null rather than a number that takes the page
 * down. Puerto Rico and the territories are the live case here -- community
 * colleges there are numerous, and IPEDS gives them real coordinates.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "artifacts", "dean-dashboard", "src", "data");
const RAW = join(HERE, ".cc-raw");   // shared with build-cc-universe.mjs
const DRY = process.argv.includes("--dry-run");
const BASE = "https://educationdata.urban.org/api/v1/college-university/ipeds";

// Same bounds as CareerMap.tsx. Keep in step if that file ever changes.
const US_TERRITORIES = new Set(["PR", "GU", "VI", "MP", "AS"]);
const inAlbersUsa = (lat, lng) =>
  (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66.5) ||
  (lat >= 51 && lat <= 72 && lng >= -170 && lng <= -129) ||
  (lat >= 18.8 && lat <= 22.5 && lng >= -160.5 && lng <= -154.5);

/**
 * Districts the census flags that do NOT get their own chancellor row.
 *
 * Recorded rather than silently skipped, so the seat count is explainable --
 * the same convention `excluded` uses in the universe file.
 */
const NO_DISTRICT_SEAT = {
  "Delaware Technical Community College (single president, four campuses)":
    "Not a district. One president leads all four campuses, which IPEDS happens to report separately. Its campuses are folded to seatType standalone.",
  "City University of New York":
    "CUNY's chancellor leads a full university system of senior and community colleges, not a community-college district. That seat belongs to the ussystem index; duplicating it here would double-count one person.",
};

// curl, not node fetch: agent proxies in these environments 403 undici but pass
// curl through. build-cc-universe.mjs does the same, for the same reason.
const get = (url) =>
  JSON.parse(execFileSync("curl", ["-sS", "-m", "180", url], { maxBuffer: 1 << 28, encoding: "utf8" }));

function pages(url) {
  const rows = [];
  let next = url;
  while (next) {
    const j = get(next);
    rows.push(...j.results);
    next = j.next;
  }
  return rows;
}

/** unitid -> {lat, lng} from the IPEDS directory, cached alongside the universe build. */
function directory() {
  const cache = join(RAW, "dir24_geo.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const rows = [];
  for (const sector of [1, 4]) rows.push(...pages(`${BASE}/directory/2024/?sector=${sector}&limit=10000`));
  const map = {};
  for (const r of rows) map[r.unitid] = { lat: r.latitude ?? null, lng: r.longitude ?? null };
  mkdirSync(RAW, { recursive: true });
  writeFileSync(cache, JSON.stringify(map));
  console.error(`  directory: ${rows.length} rows geocoded`);
  return map;
}

const shortNameOf = (n) =>
  n
    .replace(/\s+(Community College District|Community Colleges?|Technical and Community College|Technical College|Junior College|College District|College|District)$/i, "")
    .replace(/^CUNY\s+/, "")
    .trim() || n;

const census = JSON.parse(readFileSync(join(HERE, "universe", "universe_communitycollege_all.json"), "utf8"));
const geo = directory();

/**
 * `university` is a JOIN KEY, not a label -- affinity, Scout Assistant, the geo
 * lookups and dean-photos.json all match on the raw string (see the
 * institution-name contract in PROJECT.md). Seven names are used by two
 * different colleges in two different states: Glendale Community College is in
 * both Arizona and California, Clovis Community College in California and New
 * Mexico, and so on. Left alone they would silently fuse into one
 * half-populated entry with no error anywhere.
 *
 * IPEDS does not disambiguate them either -- `inst_name` is byte-identical --
 * so the state goes into the key. Only the colliding names are suffixed; every
 * unique name keeps its plain form.
 */
const nameCount = {};
for (const c of census.institutions) nameCount[c.name] = (nameCount[c.name] || 0) + 1;
const collisions = Object.entries(nameCount).filter(([, n]) => n > 1).map(([n]) => n);
const keyFor = (c) => (nameCount[c.name] > 1 ? `${c.name} (${c.state})` : c.name);

const rows = [];
let dropped = 0;

for (const c of census.institutions) {
  const g = geo[c.unitid] || {};
  const usable =
    g.lat != null && g.lng != null &&
    !US_TERRITORIES.has((c.state || "").toUpperCase()) &&
    inAlbersUsa(g.lat, g.lng);
  if (!usable && g.lat != null) dropped++;

  const district = c.multiCollegeDistrict || "";
  const foldedToStandalone = district && NO_DISTRICT_SEAT[district];
  const seatType = !district || foldedToStandalone ? "standalone" : "campus";

  rows.push({
    university: keyFor(c),
    school: `Office of the ${c.leaderTitleUnverified || "President"}`,
    rank: c.historyPlanned ? c.rank : null,
    fullName: c.name,
    shortName: shortNameOf(c.name),
    type: "Public",
    totalFaculty: null,
    lat: usable ? g.lat : null,
    lng: usable ? g.lng : null,
    city: c.city,
    state: c.state,
    founded: null,
    carnegie: "Community College",
    system: foldedToStandalone ? "" : district,
    leaderTitle: c.leaderTitleUnverified || "President",
    historyFrom: null,
    truncated: false,
    statusNote: "",
    // Community-college specific, beyond the shared schema.
    unitid: c.unitid,
    seatType,
    enrollmentFall2024: c.enrollmentFall2024,
    leaderNameUnverified: c.leaderNameUnverified || "",
    historyPlanned: c.historyPlanned,
  });
}

// One chancellor row per genuine multi-college district, placed at its largest
// campus. The chancellor's NAME is not in IPEDS -- districts are not IPEDS
// reporting units -- so it ships empty and is research, not a lead.
const byDistrict = {};
for (const c of census.institutions) {
  const d = c.multiCollegeDistrict;
  if (!d || NO_DISTRICT_SEAT[d]) continue;
  (byDistrict[d] ||= []).push(c);
}

for (const [district, campuses] of Object.entries(byDistrict).sort()) {
  campuses.sort((a, b) => (b.enrollmentFall2024 ?? 0) - (a.enrollmentFall2024 ?? 0));
  const anchor = campuses[0];
  const g = geo[anchor.unitid] || {};
  const usable =
    g.lat != null && g.lng != null &&
    !US_TERRITORIES.has((anchor.state || "").toUpperCase()) &&
    inAlbersUsa(g.lat, g.lng);

  rows.push({
    university: district,
    school: "Office of the Chancellor",
    rank: null,
    fullName: district,
    shortName: shortNameOf(district),
    type: "Public",
    totalFaculty: null,
    lat: usable ? g.lat : null,
    lng: usable ? g.lng : null,
    city: anchor.city,
    state: anchor.state,
    founded: null,
    carnegie: "Community College",
    system: "",
    leaderTitle: "Chancellor",
    historyFrom: null,
    truncated: false,
    statusNote: `District office. ${campuses.length} member colleges in the census; located at ${anchor.name}, its largest.`,
    unitid: null,
    seatType: "district",
    enrollmentFall2024: campuses.reduce((s, c) => s + (c.enrollmentFall2024 ?? 0), 0),
    leaderNameUnverified: "",
    historyPlanned: campuses.some((c) => c.historyPlanned),
  });
}

rows.sort((a, b) => (b.enrollmentFall2024 ?? 0) - (a.enrollmentFall2024 ?? 0));

const counts = rows.reduce((a, r) => ((a[r.seatType] = (a[r.seatType] || 0) + 1), a), {});
const noGeo = rows.filter((r) => r.lat == null).length;

if (!DRY) writeFileSync(join(OUT, "r1-communitycollege-schools.json"), JSON.stringify(rows, null, 1) + "\n");

console.error(`${DRY ? "[dry-run] " : ""}${rows.length} seats: ${JSON.stringify(counts)}`);
console.error(`districts with a chancellor seat: ${Object.keys(byDistrict).length}`);
console.error(`districts deliberately without one: ${Object.keys(NO_DISTRICT_SEAT).length}`);
console.error(`rows with no plottable coordinate: ${noGeo} (${dropped} had coords outside the Albers domain)`);
console.error(`history-collection targets (historyPlanned): ${rows.filter((r) => r.historyPlanned).length}`);
console.error(`names disambiguated by state (join-key collisions): ${collisions.length} -> ${collisions.join("; ")}`);
const keys = rows.map((r) => r.university);
const stillDup = keys.filter((k, i) => keys.indexOf(k) !== i);
if (stillDup.length) { console.error(`\n!! ${stillDup.length} DUPLICATE join keys remain: ${[...new Set(stillDup)].join("; ")}`); process.exitCode = 1; }
else console.error("join keys unique: yes");
