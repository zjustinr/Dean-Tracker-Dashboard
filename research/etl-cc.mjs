/**
 * Community-college ETL: pilot research JSON -> r1-communitycollege-deans.json
 * on the standard 54-key leadership schema.
 *
 *   node research/etl-cc.mjs [--dry-run]
 *
 * WHY NOT etl_leaders.mjs
 * -----------------------
 * The generic ETL hardcodes absolute Windows paths for its input and output
 * directories, so it cannot run here. This one reads
 * `universe/cc-pilot-results.json` and writes into the app's data directory
 * directly. It carries forward the same rules that ETL established, plus the
 * two this index needs.
 *
 * RULES CARRIED FORWARD
 * ---------------------
 *  - Origin is derived AT APPOINTMENT TIME and never defaulted to External.
 *    Unknown prior employer means unknown origin, not external.
 *  - A leader is "sitting" only if they are the LAST record for that seat.
 *  - Interim is its own category, never folded into internal/external, and an
 *    interim who then won the job carries `convertedToPermanent`.
 *
 * TWO RULES THIS INDEX ADDS
 * -------------------------
 *  - `truncated` comes from the researcher's `moreHistoryExists`, NOT from
 *    comparing historyFrom against a founding year. Every row in the schools
 *    table has `founded: null`, so the generic derivation would return false
 *    everywhere and the index would claim complete history for every seat while
 *    holding at most four spells. 18 of the 20 pilot seats have more history
 *    than was traced; that has to be visible.
 *  - The join key is name + state, never the bare name. Seven college names are
 *    shared across two states, and the schools table suffixes those with `(ST)`
 *    while the research data carries the plain IPEDS name.
 *
 * THE ROSTER PASS
 * ---------------
 * The pilot traced 20 seats. Shipping only those meant the index showed 20
 * sitting leaders against 1,101 seats, because the app reads sitting leaders
 * from the deans file and nothing reads the schools table's
 * `leaderNameUnverified`. That conflated two things with very different costs:
 * the appointment HISTORY is a per-seat research wave, but the CURRENT
 * officeholder is already known for every college -- IPEDS names one for all
 * 1,077 of them, at no research cost. Gating the roster behind the history wave
 * gated the free thing behind the expensive one.
 *
 * So every seat with an IPEDS name and no traced history gets one sitting
 * record. These are explicitly ROSTER records, not spells:
 *
 *  - `rosterOnly: true` and no startYear. A roster record says who holds the
 *    seat now; it does NOT claim to know when they took it. Tenure and origin
 *    statistics must exclude these or they will read a null start as a short
 *    tenure. (Null starts are already routine in this corpus -- 795 of 1,803
 *    LAC records have one -- so the app handles them; the flag is what stops
 *    them being mistaken for researched spells.)
 *  - `nameVerified` carries whether the college's own site corroborated the
 *    name. This is load-bearing, not decoration: the pilot found FIVE of its
 *    twenty IPEDS names stale or wrong in kind, a 25% error rate on the field.
 *    118 of the top 200 are independently confirmed; the rest are IPEDS's word
 *    alone and are labelled as such rather than presented as fact.
 *  - Pilot records always win. A seat the pilot traced never gets a roster
 *    record -- the pilot is what CAUGHT the stale IPEDS names.
 *
 * The 24 district chancellorships get nothing here: districts are not IPEDS
 * reporting units, so there is no name to carry. Three were researched in the
 * pilot; the other 21 need research, and showing them empty is the honest state.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "artifacts", "dean-dashboard", "src", "data");
const DRY = process.argv.includes("--dry-run");

const pilot = JSON.parse(readFileSync(join(HERE, "universe", "cc-pilot-results.json"), "utf8"));
const schools = JSON.parse(readFileSync(join(DATA, "r1-communitycollege-schools.json"), "utf8"));
const verification = JSON.parse(readFileSync(join(HERE, "universe", "cc-leader-verification.json"), "utf8"));
const census = JSON.parse(readFileSync(join(HERE, "universe", "universe_communitycollege_all.json"), "utf8"));

/**
 * unitid -> the college's own homepage. The schools table carries no website
 * column, and CI (validate-source-urls.mjs) requires a sourceUrl on every new
 * record -- a roster record asserting who holds a seat has to say on whose
 * authority. IPEDS stores these bare ("www.ivytech.edu/"), so add the scheme.
 */
const siteOf = new Map(
  census.institutions
    .filter((c) => c.website && c.website.trim())
    .map((c) => [c.unitid, /^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`]),
);

// Seats whose IPEDS name the college's own website corroborated, by either the
// text pass or the portrait pass. `confirmedByEitherPass` is the real figure --
// the two crawlers use different transports and land on different pages.
const nameConfirmed = new Set(
  verification.colleges
    .filter((c) => c.verdict === "confirmed" || c.photoConfirmed)
    .map((c) => `${c.university || c.name}|${c.state}`),
);

/**
 * IPEDS stores the courtesy title and the post-nominal inside the name field
 * ("Dr. Justin Lonon", "Anne M. Kress, Ph.D."). 475 of 1,077 carry one. The
 * corpus convention is a bare name -- and `dean` is half of the enrichment join
 * key, so an unstripped honorific silently misses every photo and research
 * lookup for that leader.
 */
const POST_NOMINAL = /,?\s*(Ph\.?\s?D|Ed\.?\s?D|J\.?\s?D|M\.?\s?D|D\.?B\.?A|M\.?B\.?A|C\.?F\.?A|C\.?P\.?A|R\.?N|M\.?S|M\.?A)\.?\s*$/i;
function cleanName(raw) {
  let n = String(raw || "").replace(/^\s*(Dr|Mr|Mrs|Ms|Prof|Professor)\.?\s+/i, "");
  // Loop: post-nominals stack ("Hector Balderas, JD, CFA"), and one pass would
  // strip only the last, leaving a trailing ", JD" inside the join key.
  while (POST_NOMINAL.test(n)) n = n.replace(POST_NOMINAL, "");
  return n.replace(/\s+/g, " ").trim();
}

// name+state -> schools row. See the join-key note above.
const schoolOf = new Map(schools.map((s) => [`${s.fullName}|${s.state}`, s]));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const era = (y) => (y ? `${Math.floor(y / 10) * 10}s` : "");

/**
 * Origin at appointment time. Internal means the prior job was at this same
 * institution, or elsewhere inside the same district. Interim is its own
 * bucket. Unknown stays Unknown -- never defaulted.
 */
function originOf(rec, university, district) {
  if (rec.isInterim) return { origin: "Interim", v4: "interim" };
  const pi = norm(rec.priorInstitution);
  if (!pi) return { origin: "Unknown", v4: "unknown" };
  const u = norm(university);
  if (pi.includes(u) || u.includes(pi)) return { origin: "Internal", v4: "internal" };
  if (district && norm(district) && pi.includes(norm(district))) return { origin: "Internal", v4: "internal_system" };
  return { origin: "External", v4: "external" };
}

const NEXT = (rec) => {
  const t = `${rec.nextRole || ""} ${rec.nextRoleInstitution || ""}`.toLowerCase();
  if (rec.endYear == null) return "Still_serving";
  if (!t.trim()) return "Unknown";
  if (/provost|president|chancellor/.test(t)) return "Provost_president_chancellor";
  if (/dean/.test(t)) return "Another_deanship";
  if (/emerit|faculty|professor|teaching/.test(t)) return "Faculty_emeritus";
  if (/retire/.test(t)) return "Full_retirement";
  if (/died|deceased|passed/.test(t)) return "Deceased";
  if (/industry|company|corp|foundation|government|nonprofit|association|firm|bank/.test(t)) return "Industry_nonprofit_govt";
  return "Unknown";
};

const out = [];
const missingSchool = [];
let id = 1;

for (const seat of pilot.seats) {
  const key = `${seat.university}|${seat.state}`;
  const school = schoolOf.get(key);
  if (!school) missingSchool.push(key);

  const recs = [...seat.records].sort((a, b) => (a.startYear ?? 0) - (b.startYear ?? 0));
  const lastIdx = recs.length - 1;

  recs.forEach((r, i) => {
    const { origin, v4 } = originOf(r, seat.university, school?.system || "");
    const sitting = i === lastIdx && r.endYear == null;
    out.push({
      id: id++,
      // The schools-table key, so every consumer joins on one string.
      university: school ? school.university : seat.university,
      school: seat.school || "Office of the President",
      dean: r.name,
      startYear: r.startYear ?? null,
      endYear: r.endYear ?? null,
      startLabel: r.startYear ? String(r.startYear) : "",
      endLabel: r.endYear ? String(r.endYear) : sitting ? "present" : "",
      priorTitle: r.priorTitle || "",
      priorInstitution: r.priorInstitution || "",
      origin,
      originV2: origin,
      apptOrigin4: v4,
      isInternal: origin === "Internal",
      isExternal: origin === "External",
      isInterim: !!r.isInterim,
      careerBackground: "Community College Administration",
      hasIndustryExp: false,
      gender: "Unknown",
      isFemale: false,
      isFirstTimeDean: false,
      discipline: seat.leaderTitle || "President",
      disciplineBroad: "Community College",
      phdField: "",
      hasPriorDeanExp: false,
      priorAssocOrAsstDean: false,
      hadAssocDeanRole: false,
      hadDeptChairRole: false,
      hasConsultingBg: false,
      hasPhd: false,
      rank: school?.rank ?? null,
      tier: school?.seatType === "district" ? "District" : "Community College",
      inTop50: (school?.rank ?? 9999) <= 50,
      inTop100: (school?.rank ?? 9999) <= 100,
      fromEliteInstitution: false,
      priorInstitutionElite: false,
      tenureLength: r.startYear && r.endYear ? r.endYear - r.startYear : null,
      era: era(r.startYear),
      notes: r.notes || "",
      nextRole: NEXT(r),
      nextRoleCode: null,
      involuntary: false,
      hadPriorConnection: origin === "Internal",
      hasInstitutionalLink: origin === "Internal",
      fromSameUniversityDiffSchool: false,
      surpriseDeparture: false,
      surpriseEvidence: "",
      sourceUrl: r.sourceUrl || "",
      enrollmentEnd: null,
      enrollmentAvg: null,
      businessPctEnd: null,
      businessDegreesLatest: null,
      convertedToPermanent: !!r.convertedToPermanent,
      connectionType: origin === "Internal" ? "Same institution" : "",
      // Community-college specific.
      seatType: school?.seatType || "standalone",
    });
  });

  // Write history horizon back onto the schools row. `truncated` is the
  // researcher's observation, not a founding-year inference -- see the header.
  if (school) {
    const years = recs.map((r) => r.startYear).filter((y) => y > 1900);
    school.historyFrom = years.length ? Math.min(...years) : null;
    school.truncated = !!seat.moreHistoryExists;
    school.spellsTraced = recs.length;
  }
}

// --- roster pass -----------------------------------------------------------
// One sitting record per seat that has an IPEDS name and no traced history.
// See THE ROSTER PASS in the header for why these are not spells.
const tracedSeats = new Set(pilot.seats.map((seat) => `${seat.university}|${seat.state}`));
let rosterAdded = 0;
let rosterConfirmed = 0;

for (const school of schools) {
  const name = cleanName(school.leaderNameUnverified);
  if (!name) continue;                                          // districts: no IPEDS row, no name
  if (tracedSeats.has(`${school.fullName}|${school.state}`)) continue;  // pilot wins
  if (school.spellsTraced) continue;                            // belt and braces

  const verified = nameConfirmed.has(`${school.fullName}|${school.state}`);
  const title = school.leaderTitle || "President";
  rosterAdded++;
  if (verified) rosterConfirmed++;

  out.push({
    id: id++,
    university: school.university,
    school: school.school || "Office of the President",
    dean: name,
    // No startYear: IPEDS names the incumbent, it does not date the appointment.
    startYear: null,
    endYear: null,
    startLabel: "",
    endLabel: "present",
    priorTitle: "",
    priorInstitution: "",
    origin: "Unknown",
    originV2: "Unknown",
    apptOrigin4: "unknown",
    isInternal: false,
    isExternal: false,
    isInterim: false,
    careerBackground: "Community College Administration",
    hasIndustryExp: false,
    gender: "Unknown",
    isFemale: false,
    isFirstTimeDean: false,
    discipline: title,
    disciplineBroad: "Community College",
    phdField: "",
    hasPriorDeanExp: false,
    priorAssocOrAsstDean: false,
    hadAssocDeanRole: false,
    hadDeptChairRole: false,
    hasConsultingBg: false,
    hasPhd: false,
    rank: school.rank ?? null,
    tier: school.seatType === "district" ? "District" : "Community College",
    inTop50: (school.rank ?? 9999) <= 50,
    inTop100: (school.rank ?? 9999) <= 100,
    fromEliteInstitution: false,
    priorInstitutionElite: false,
    tenureLength: null,
    era: "",
    notes: verified
      ? "Sitting leader per IPEDS, corroborated by the college's own website."
      : "Sitting leader per IPEDS fall 2024; not independently corroborated.",
    nextRole: "Still_serving",
    nextRoleCode: null,
    involuntary: false,
    hadPriorConnection: false,
    hasInstitutionalLink: false,
    fromSameUniversityDiffSchool: false,
    surpriseDeparture: false,
    surpriseEvidence: "",
    sourceUrl: siteOf.get(school.unitid) || "",
    enrollmentEnd: null,
    enrollmentAvg: null,
    businessPctEnd: null,
    businessDegreesLatest: null,
    convertedToPermanent: false,
    connectionType: "",
    seatType: school.seatType || "standalone",
    // Roster, not spell. Consumers computing tenure or origin must exclude these.
    rosterOnly: true,
    nameVerified: verified,
  });
}

if (missingSchool.length) {
  console.error(`!! ${missingSchool.length} seat(s) had no schools-table row: ${missingSchool.join("; ")}`);
  process.exitCode = 1;
}

if (!DRY) {
  writeFileSync(join(DATA, "r1-communitycollege-deans.json"), JSON.stringify(out, null, 1) + "\n");
  writeFileSync(join(DATA, "r1-communitycollege-schools.json"), JSON.stringify(schools, null, 1) + "\n");
}

const seated = schools.filter((s) => s.spellsTraced).length;
console.error(`${DRY ? "[dry-run] " : ""}${out.length} records across ${pilot.seats.length} seats`);
console.error(`  interim: ${out.filter((r) => r.isInterim).length} | convertedToPermanent: ${out.filter((r) => r.convertedToPermanent).length}`);
console.error(`  origin: ${JSON.stringify(out.reduce((a, r) => ((a[r.origin] = (a[r.origin] || 0) + 1), a), {}))}`);
console.error(`  sitting (endYear null): ${out.filter((r) => r.endYear == null).length}`);
console.error(`  schools rows with history: ${seated} of ${schools.length} | truncated: ${schools.filter((s) => s.truncated).length}`);
console.error(`  records missing sourceUrl: ${out.filter((r) => !r.sourceUrl).length}`);
console.error(`  roster records: ${rosterAdded} (${rosterConfirmed} name-corroborated, ${rosterAdded - rosterConfirmed} IPEDS-only)`);
console.error(`  sitting leaders total: ${out.filter((r) => r.endYear == null).length} across ${schools.length} seats`);
console.error(`  seats still with no leader at all: ${schools.filter((s) => !s.leaderNameUnverified && !s.spellsTraced).length} (districts needing research)`);
