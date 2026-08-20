/**
 * Build the community-college universe: the 200 largest US community colleges.
 *
 *   node research/build-cc-universe.mjs            # fetch + build
 *   node research/build-cc-universe.mjs --cache    # reuse the raw pulls
 *
 * Writes research/universe/universe_communitycollege.json.
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND-TYPED LIST
 * ---------------------------------------------
 * "The largest 200 community colleges" sounds like a lookup and is not. Two
 * things make a hand-typed list wrong in ways nobody notices:
 *
 * 1. IPEDS no longer classifies the biggest community colleges as two-year
 *    institutions. 154 public colleges that were sector 4 (public, 2-year) in
 *    2010 are sector 1 (public, 4-year) in 2024 because they added a handful of
 *    applied bachelor's degrees. Among them: Lone Star, Dallas College, Houston
 *    CC, Valencia, Austin CC, Collin, San Jacinto -- seven of the fifteen
 *    largest community colleges in the country. A sector-4 filter, the obvious
 *    way to build this list, silently drops all of them.
 * 2. Florida's colleges converted before 2010, so even the 2010 comparison
 *    misses Miami Dade, Broward, Palm Beach State, St Petersburg and FSCJ.
 *    Those are caught on their degree profile instead: associate + bachelor's
 *    and no graduate degrees is a community college that went baccalaureate;
 *    a real regional university offers master's.
 *
 * Source: IPEDS via the Urban Institute Education Data API (no key required).
 * Enrollment is fall 2024 total headcount, the most recent year IPEDS publishes
 * for every institution. See universe_communitycollege.md for what the ranking
 * metric does and does not capture.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RAW = join(HERE, ".cc-raw");
const OUT = join(HERE, "universe");
const BASE = "https://educationdata.urban.org/api/v1/college-university/ipeds";
const CACHE = process.argv.includes("--cache");
const TOP_N = 200;

// curl, not fetch: node's global fetch ignores HTTPS_PROXY, which some
// collection environments require.
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

function cached(name, fetcher) {
  const path = join(RAW, `${name}.json`);
  if (CACHE && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  const rows = fetcher();
  mkdirSync(RAW, { recursive: true });
  writeFileSync(path, JSON.stringify(rows));
  console.error(`  ${name}: ${rows.length} rows`);
  return rows;
}

console.error("pulling IPEDS...");
const pub2yr = cached("dir24_sector4", () => pages(`${BASE}/directory/2024/?sector=4&limit=10000`));
const pub4yr = cached("dir24_sector1", () => pages(`${BASE}/directory/2024/?sector=1&limit=10000`));
const pub2yr2010 = cached("dir10_sector4", () => pages(`${BASE}/directory/2010/?sector=4&limit=10000`));
const chars = cached("ic24", () => pages(`${BASE}/institutional-characteristics/2024/?limit=10000`));
const enrollment = cached("enr24", () =>
  pages(`${BASE}/fall-enrollment/2024/1/race/sex/?race=99&sex=99&ftpt=99&degree_seeking=99&class_level=99&limit=10000`)
);

const IC = new Map(chars.map((r) => [r.unitid, r]));
const ENR = new Map(enrollment.map((r) => [r.unitid, r.enrollment_fall]));
const WAS_2YR = new Set(pub2yr2010.map((r) => r.unitid));
const active = (r) => r.currently_active_ipeds === 1;
const offersGrad = (c) =>
  !!c && (c.masters_offered === 1 || c.doctors_research_offered === 1 || c.doctors_professional_offered === 1 || c.doctors_other_offered === 1);
const CC_NAME = /\b(community college|junior college|technical college|city colleges)\b/i;

/**
 * Institutions the rules admit that are not community colleges.
 *
 * Every one of these is a judgement call about what the index is FOR: a seat a
 * community-college president is recruited into. A two-year branch campus led
 * by a dean who reports to a university provost is not that seat, however
 * open-access its mission.
 */
const EXCLUDE = {
  190655: "CUNY senior college -- a baccalaureate institution, not a community college (CUNY runs its community colleges as separate campuses)",
  447689: "Founded 2005 as a four-year access college; never a two-year institution",
  201946: "Two-year regional branch campus of the University of Cincinnati, led by a dean reporting to UC",
  201955: "Two-year regional branch campus of the University of Cincinnati, led by a dean reporting to UC",
  244437: "Two-year college absorbed into Georgia State University in 2016; no independent presidency",
};

/**
 * Colleges that report to IPEDS individually but whose president reports to a
 * district chancellor. Both seats are real and both get searched -- the index
 * has to decide which one it tracks. Flagged, not dropped. See the memo.
 */
const DISTRICTS = [
  [/^(East Los Angeles|Los Angeles \w+|West Los Angeles) College/i, null, "Los Angeles Community College District"],
  [/^(Rio Salado|Mesa Community|Glendale Community|Chandler-Gilbert|Phoenix College|Estrella Mountain|Scottsdale Community|Paradise Valley Community|GateWay Community|South Mountain Community)/i, "AZ", "Maricopa County Community College District"],
  [/^(Northwest Vista|San Antonio College|St Philip's|Palo Alto College|Northeast Lakeview)/i, "TX", "Alamo Colleges District"],
  [/^(Fresno City|Clovis Community College|Reedley College)/i, "CA", "State Center Community College District"],
  [/^San Diego (Mesa|City|Miramar) College/i, "CA", "San Diego Community College District"],
  [/^(American River|Sacramento City|Cosumnes River|Folsom Lake) College/i, "CA", "Los Rios Community College District"],
  [/^(De Anza|Foothill) College/i, "CA", "Foothill-De Anza Community College District"],
  [/^(Fullerton|Cypress) College/i, "CA", "North Orange County Community College District"],
  [/^(Orange Coast|Golden West|Coastline)/i, "CA", "Coast Community College District"],
  [/^(Santa Ana|Santiago Canyon) College/i, "CA", "Rancho Santiago Community College District"],
  [/^(Riverside City|Moreno Valley|Norco) College/i, "CA", "Riverside Community College District"],
  [/^(Saddleback|Irvine Valley) College/i, "CA", "South Orange County Community College District"],
  [/^(Grossmont|Cuyamaca) College/i, "CA", "Grossmont-Cuyamaca Community College District"],
  [/^(Evergreen Valley|San Jose City) College/i, "CA", "San Jose-Evergreen Community College District"],
  [/^(College of San Mateo|Skyline College|Canada College)/i, "CA", "San Mateo County Community College District"],
  [/^(Moorpark|Ventura|Oxnard) College/i, "CA", "Ventura County Community College District"],
  [/^(Bakersfield|Porterville|Cerro Coso) College/i, "CA", "Kern Community College District"],
  [/^(Modesto Junior|Columbia) College/i, "CA", "Yosemite Community College District"],
  [/^(Diablo Valley|Los Medanos|Contra Costa) College/i, "CA", "Contra Costa Community College District"],
  [/^(Chabot|Las Positas) College/i, "CA", "Chabot-Las Positas Community College District"],
  [/^(San Bernardino Valley|Crafton Hills) College/i, "CA", "San Bernardino Community College District"],
  [/^(Laney|Merritt|Berkeley City|College of Alameda)/i, "CA", "Peralta Community College District"],
  [/^City Colleges of Chicago/i, "IL", "City Colleges of Chicago"],
  [/^(Seattle Central|North Seattle|South Seattle) College/i, "WA", "Seattle Colleges"],
  [/^Delaware Technical Community College-/i, "DE", "Delaware Technical Community College (single president, four campuses)"],
  [/^CUNY /i, "NY", "City University of New York"],
];
const districtOf = (name, state) =>
  (DISTRICTS.find(([re, st]) => re.test(name) && (!st || st === state)) || [null, null, ""])[2];

const pool = [];
const add = (r, rule) => pool.push({ r, rule });
for (const r of pub2yr) if (active(r)) add(r, "A");
for (const r of pub4yr) {
  if (!active(r)) continue;
  const c = IC.get(r.unitid);
  if (WAS_2YR.has(r.unitid)) add(r, "B");
  else if (c && c.assoc_offered === 1 && c.bach_offered === 1 && !offersGrad(c)) add(r, "C");
  else if (CC_NAME.test(r.inst_name)) add(r, "D");
}

const RULE_TEXT = {
  A: "Public two-year institution (IPEDS 2024 sector 4)",
  B: "Public two-year in 2010, now awards bachelor's degrees (IPEDS 2024 sector 1)",
  C: "Public, awards associate and bachelor's degrees but no graduate degrees",
  D: "Public four-year by IPEDS sector, community-college name",
};

const excluded = [];
const ranked = pool
  .filter(({ r }) => {
    if (EXCLUDE[r.unitid]) {
      excluded.push({ unitid: r.unitid, name: r.inst_name, reason: EXCLUDE[r.unitid] });
      return false;
    }
    return true;
  })
  .map(({ r, rule }) => ({
    rank: 0,
    unitid: r.unitid,
    name: r.inst_name,
    city: r.city,
    state: r.state_abbr,
    enrollmentFall2024: ENR.get(r.unitid) ?? null,
    // IPEDS' own chief-administrator field. It is a lead, not a fact: it lags
    // by a year or more and carries the wrong officer at some colleges. Every
    // one of these needs verification against the college before it is used.
    leaderNameUnverified: (r.chief_admin_name || "").trim(),
    leaderTitleUnverified: (r.chief_admin_title || "").trim(),
    multiCollegeDistrict: districtOf(r.inst_name, r.state_abbr),
    website: (r.url_school || "").trim(),
    includedBy: rule,
  }))
  .sort((a, b) => (b.enrollmentFall2024 ?? 0) - (a.enrollmentFall2024 ?? 0));

const top = ranked.slice(0, TOP_N);
top.forEach((o, i) => (o.rank = i + 1));

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, "universe_communitycollege.json"),
  JSON.stringify(
    {
      generated: "IPEDS fall 2024 via educationdata.urban.org",
      metric: "Total fall 2024 headcount enrollment (all students, degree-seeking and not)",
      rules: RULE_TEXT,
      candidatePool: ranked.length,
      cutoffEnrollment: top[top.length - 1].enrollmentFall2024,
      excluded,
      institutions: top,
    },
    null,
    1
  ) + "\n"
);

console.error(`\ncandidate pool ${ranked.length} -> top ${TOP_N}`);
console.error(`cutoff: ${top[top.length - 1].enrollmentFall2024} students (${top[top.length - 1].name})`);
console.error(`excluded by hand: ${excluded.length}`);
const byRule = {};
for (const o of top) byRule[o.includedBy] = (byRule[o.includedBy] || 0) + 1;
console.error(`rules in the top ${TOP_N}: ${JSON.stringify(byRule)}`);
const districted = top.filter((o) => o.multiCollegeDistrict).length;
console.error(`in a multi-college district: ${districted}`);
