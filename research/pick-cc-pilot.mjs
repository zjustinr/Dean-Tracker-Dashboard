/**
 * Choose the 20-college pilot wave, stratified so the cost it measures is the
 * cost of the real wave.
 *
 *   node research/pick-cc-pilot.mjs [--n 20]
 *
 * WHY STRATIFY RATHER THAN TAKE THE TOP 20
 * ----------------------------------------
 * The pilot exists to price the other 180, so it must not sample only the easy
 * ones. Three axes drive research cost, and the top 20 by enrollment is biased
 * on all three:
 *
 *  - SEAT TYPE. A district chancellorship has no IPEDS row and no incumbent
 *    name at all; a campus presidency sits under one. Both cost more than a
 *    standalone college, and the top 20 is thick with districts.
 *  - SIZE. Big colleges have press offices, archived announcements and
 *    Wikipedia pages. A rank-180 college may have none of that, and its
 *    predecessors may exist only in local news.
 *  - VERIFIABILITY. 82 of the 200 could not be confirmed by either automated
 *    pass. Those are exactly the sites that will be hard to trace backwards,
 *    and a pilot drawn only from the confirmed 118 would under-price the wave.
 *
 * So the sample is quota-filled across size band, seat type and verification
 * status, and deterministic -- no RNG, so re-running reproduces the same twenty
 * and a re-priced wave is comparable to the first.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const N = Number(arg("n", 20));

const universe = JSON.parse(readFileSync(join(HERE, "universe", "universe_communitycollege.json"), "utf8"));
const schools = JSON.parse(readFileSync(join(HERE, "..", "artifacts", "dean-dashboard", "src", "data", "r1-communitycollege-schools.json"), "utf8"));
const verify = JSON.parse(readFileSync(join(HERE, "universe", "cc-leader-verification.json"), "utf8"));

const seatKey = (o) => `${o.university || o.name}|${o.state}`;
const seatTypeOf = new Map(schools.map((s) => [`${s.fullName}|${s.state}`, s.seatType]));
const verdictOf = new Map(verify.colleges.map((c) => [seatKey(c), c.verdict === "confirmed" || c.photoConfirmed ? "verified" : "unverified"]));

const band = (rank) => (rank <= 10 ? "1-10" : rank <= 50 ? "11-50" : rank <= 120 ? "51-120" : "121-200");

/**
 * District chancellorships are NOT in the universe file -- districts are not
 * IPEDS reporting units, so they exist only in the schools table. Left out, the
 * pilot would contain zero of them and would therefore price everything EXCEPT
 * the most expensive cell: a district seat has no IPEDS row, no incumbent name,
 * and no college website of its own to crawl. The first attempt at this sample
 * did exactly that, and only the short-quota warning gave it away.
 */
// 22 of the 24 districts are Californian, so a size-ordered pick returns three
// California districts and the pilot never sees how a district outside that
// state's governance model behaves. Order by size but promote the first
// district of each new state, so the cell spans states before it spans sizes.
const byState = new Set();
const districtSeats = schools
  .filter((s) => s.seatType === "district")
  .sort((a, b) => (b.enrollmentFall2024 ?? 0) - (a.enrollmentFall2024 ?? 0))
  .map((s) => ({ s, firstOfState: byState.has(s.state) ? 1 : (byState.add(s.state), 0) }))
  .sort((a, b) => a.firstOfState - b.firstOfState || (b.s.enrollmentFall2024 ?? 0) - (a.s.enrollmentFall2024 ?? 0))
  .map(({ s }) => ({
    rank: null,
    university: s.university,
    state: s.state,
    enrollmentFall2024: s.enrollmentFall2024,
    district: s.university,
    seatType: "district",
    verification: "unverified",       // no name to verify in the first place
    leaderNameUnverified: "",
    website: "",
    band: "district",
  }));

const pool = universe.institutions.map((c) => ({
  rank: c.rank,
  university: c.name,
  state: c.state,
  enrollmentFall2024: c.enrollmentFall2024,
  district: c.multiCollegeDistrict || "",
  seatType: seatTypeOf.get(`${c.name}|${c.state}`) || "standalone",
  verification: verdictOf.get(seatKey(c)) || "unverified",
  leaderNameUnverified: c.leaderNameUnverified || "",
  website: c.website || "",
  band: band(c.rank),
}));

/**
 * Quotas. Deliberately over-weights the hard cells relative to their share of
 * the 200: unverified colleges are 41% of the universe but half the pilot,
 * because an under-priced wave is the expensive mistake here.
 */
const QUOTAS = [
  // No top-10 quota asks for a `campus` seat: none exists. The ten largest are
  // either standalone colleges or districts that report to IPEDS as one unit
  // (Lone Star, Dallas, Houston), so a campus-under-a-chancellor first appears
  // at rank 12. Campus seats still enter through the band quotas below.
  // `head: true` -- take the top of the ordered cell rather than striding it.
  // districtSeats is already ordered to put the first district of each state
  // first, and spread() would stride straight past that and return three
  // Californian districts again.
  { name: "district chancellorship", n: 3, head: true, pick: (r) => r.seatType === "district" },
  { name: "top-10 standalone", n: 2, pick: (r) => r.band === "1-10" && r.seatType === "standalone" },
  { name: "11-50 verified", n: 3, pick: (r) => r.band === "11-50" && r.verification === "verified" },
  { name: "11-50 unverified", n: 3, pick: (r) => r.band === "11-50" && r.verification === "unverified" },
  { name: "51-120 verified", n: 3, pick: (r) => r.band === "51-120" && r.verification === "verified" },
  { name: "51-120 unverified", n: 3, pick: (r) => r.band === "51-120" && r.verification === "unverified" },
  { name: "121-200 verified", n: 1, pick: (r) => r.band === "121-200" && r.verification === "verified" },
  { name: "121-200 unverified", n: 2, pick: (r) => r.band === "121-200" && r.verification === "unverified" },
];
// Quotas sum to N. A short quota is therefore a real signal, not slack to absorb.

// Deterministic spread within a cell: walk the cell at an even stride rather
// than taking its head, so a quota does not collapse onto one state.
const spread = (rows, k) => {
  if (rows.length <= k) return rows;
  const step = rows.length / k;
  return Array.from({ length: k }, (_, i) => rows[Math.floor(i * step)]);
};

const chosen = [];
const taken = new Set();
for (const q of QUOTAS) {
    const cell = [...pool, ...districtSeats]
    .filter((r) => q.pick(r) && !taken.has(r.rank ?? `d:${r.university}`))
    .sort((a, b) => (a.rank ?? -1) - (b.rank ?? -1));
  const got = q.head ? cell.slice(0, q.n) : spread(cell, q.n);
  for (const r of got) { taken.add(r.rank ?? `d:${r.university}`); chosen.push({ ...r, quota: q.name }); }
  if (got.length < q.n) console.error(`  ! quota "${q.name}" short: ${got.length}/${q.n}`);
}

// Top up to N from whatever is left, widest rank spread first.
if (chosen.length < N) {
  const rest = pool.filter((r) => !taken.has(r.rank)).sort((a, b) => a.rank - b.rank);
  for (const r of spread(rest, N - chosen.length)) { taken.add(r.rank); chosen.push({ ...r, quota: "top-up" }); }
}

chosen.sort((a, b) => (a.rank ?? -1) - (b.rank ?? -1));

const tally = (key) => chosen.reduce((a, r) => ((a[r[key]] = (a[r[key]] || 0) + 1), a), {});
writeFileSync(
  join(HERE, "universe", "cc-pilot-wave.json"),
  JSON.stringify({
    generated: universe.generated,
    depthRule: "current + 3 predecessors (4 spells per seat); stop earlier only if the seat has no further predecessor",
    purpose:
      "Price the remaining 180. Stratified by size band, seat type and verification status so the measured cost " +
      "is not the cost of the easy colleges only. Deterministic -- re-running reproduces the same twenty.",
    composition: { band: tally("band"), seatType: tally("seatType"), verification: tally("verification"), state: tally("state") },
    colleges: chosen,
  }, null, 1) + "\n"
);

console.error(`pilot wave: ${chosen.length} colleges`);
console.error(`  band:         ${JSON.stringify(tally("band"))}`);
console.error(`  seatType:     ${JSON.stringify(tally("seatType"))}`);
console.error(`  verification: ${JSON.stringify(tally("verification"))}`);
console.error(`  states:       ${Object.keys(tally("state")).length} distinct`);
