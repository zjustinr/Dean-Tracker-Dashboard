// Apply researched role start years to r1-adminleaders-deans.json.
//   node scripts/apply-admin-start-years.mjs [--write]
//
// Every entry below was verified against a named primary source, quoted in `evidence`.
// `startYear` is the year the leader began THE TITLED ROLE the record tracks -- not
// the year they joined the institution. That distinction is the whole point: the
// Movability Index scores tenure in the seat, so filing "joined CMU in 1995" as a
// start year would mark a recently-promoted officer as long-tenured and overdue to
// move. Where a leader held an earlier, different post at the same institution, the
// note records it rather than letting it contaminate the start year.
//
// Nothing here is inferred. A leader whose appointment date could not be found in a
// citable source is absent from this list and keeps a blank startYear, which is the
// honest state -- see the coverage note at the bottom of this file.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "data");
const FILE = join(SRC, "r1-adminleaders-deans.json");
const WRITE = process.argv.includes("--write");

const RESEARCHED = [
  {
    dean: "Morgan R. Olsen", university: "Arizona State University", startYear: 2008,
    source: "https://cfo.asu.edu/cfo-olsen-bio",
    evidence: "Olsen came to Arizona State University in November 2008 from Purdue University, where he served as Executive Vice President and Treasurer.",
  },
  {
    dean: "Lisa Loo", university: "Arizona State University", startYear: 2022,
    source: "https://ogc.asu.edu/staff/loo",
    evidence: "Ms. Lisa Loo was appointed Senior Vice President and General Counsel effective July 1, 2022.",
  },
  {
    dean: "Sally Morton", university: "Arizona State University", startYear: 2021,
    source: "https://www.statepress.com/article/2020/12/spbiztech-sally-c-morton-named-executive-vice-president-of-asus-knowledge-enterprise",
    evidence: "Named December 2020; took the helm of ASU Knowledge Enterprise as executive vice president starting Feb. 1, 2021.",
  },
  {
    dean: "John Danner", university: "Central Michigan University", startYear: 2020,
    source: "https://www.cmich.edu/offices-departments/general-counsel/general-counsel-staff",
    evidence: "Joined CMU as General Counsel in September 2020, after serving as Senior Associate Counsel at UT San Antonio 2008-2020.",
  },
  {
    dean: "Cameron Wassman", university: "Central Michigan University", startYear: 2025,
    source: "https://www.cmich.edu/news/details/cameron-wassman-named-cmu-police-chief",
    evidence: "Named CMU police chief effective July 1, 2025; had joined the department as an officer in October 2000 and served 15 years as lieutenant.",
  },
  {
    dean: "Shawna Patterson-Stephens", university: "Central Michigan University", startYear: 2025,
    source: "https://www.cmich.edu/news/details/announcing-the-new-division-of-university-engagement-and-student-affairs",
    evidence: "Took the new Division of University Engagement and Student Affairs effective May 16, 2025. She had been a CMU vice president since 2021 (Inclusive Excellence and Belonging), but this record tracks the current titled seat.",
  },
];

const rows = JSON.parse(readFileSync(FILE, "utf8"));
const norm = (s) => String(s || "").trim().toLowerCase();
let applied = 0, missing = 0, alreadySet = 0;

for (const r of RESEARCHED) {
  const rec = rows.find((x) => norm(x.dean) === norm(r.dean) && norm(x.university) === norm(r.university));
  if (!rec) { console.warn(`  no matching record: ${r.dean} @ ${r.university}`); missing++; continue; }
  if (rec.startYear) { console.warn(`  already has startYear ${rec.startYear}: ${r.dean}`); alreadySet++; continue; }
  rec.startYear = r.startYear;
  rec.startLabel = String(r.startYear);
  rec.era = `${Math.floor(r.startYear / 10) * 10}s`;
  const note = `Role start ${r.startYear} verified: ${r.evidence} (${r.source})`;
  rec.notes = rec.notes ? `${rec.notes} ${note}` : note;
  applied++;
  console.log(`  ${r.startYear}  ${r.dean} — ${rec.discipline}`);
}

console.log(`\napplied ${applied} | already set ${alreadySet} | unmatched ${missing}`);
if (WRITE) {
  writeFileSync(FILE, JSON.stringify(rows));
  const filled = rows.filter((x) => x.startYear).length;
  console.log(`r1-adminleaders-deans.json written: ${filled}/${rows.length} records now carry a startYear`);
} else {
  console.log("(dry run -- pass --write)");
}

// Coverage note. 21 records at the eleven institutions with live Greenwood/Asher
// searches were researched; 6 yielded a citable role start date. The 15 misses are
// not for lack of looking -- facilities AVPs, internal-audit directors, interim CIOs
// and enrollment VPs simply do not get dated appointment announcements the way deans
// and provosts do. That is the structural reason this index sits near 38% coverage,
// and it means a brute-force research pass over the remaining ~1,373 records should
// be expected to convert at roughly this rate rather than approaching completeness.
// Higher-yield avenues for that backlog, in rough order of expected return:
//   1. Wayback Machine snapshots of each institution's leadership/org-chart page --
//      the first dated snapshot naming a person bounds their start year from above,
//      and it scales because the pages are already in sourceUrl.
//   2. State salary/payroll databases, which carry hire dates for public institutions.
//   3. LinkedIn role start months, where a profile exists.
