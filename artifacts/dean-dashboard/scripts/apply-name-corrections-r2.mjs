// Round 2 of the data-quality audit: applies the verified corrections from
// three independent re-verification agents (2026-08-10) to eschool,
// bschool, nursing, agschool, and grad datasets. Each correction was
// cross-checked against a live, citable source before being included here
// -- see the commit message for the audit trail.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");

function writeDeansJson(path, rawBefore, arr) {
  const m = /^\[\r?\n( *)/.exec(rawBefore);
  const indent = m ? m[1].length : 0;
  writeFileSync(path, indent ? JSON.stringify(arr, null, indent) : JSON.stringify(arr));
}

function load(file) {
  const path = join(SRC, file);
  const raw = readFileSync(path, "utf8");
  return { path, raw, arr: JSON.parse(raw) };
}

// --- eschool: 12 renames, 3 removals ---
{
  const { path, raw, arr } = load("r1-eschool-deans.json");
  const renames = {
    80: ["Robert L. Clark", "https://today.duke.edu/2007/07/rob_clark.html"],
    112: ["Venkatesh Narayanamurti", "https://seas.harvard.edu/office-dean/history-office/venkatesh-narayanamurti"],
    158: ["Theodore A. Bickart", "https://engineering.msu.edu/about/history-of-the-college"],
    258: ["Bradley J. Strait", "https://ecs.syracuse.edu/about/news/a-lifetime-of-service-remembering-dean-emeritus-bradley-strait-58-g60-g65"],
    272: ["James L. Smith", "http://resources.swco.ttu.edu/university-archive/tech-people.php"],
    281: ["George C. Lee", "https://www.buffalo.edu/ubnow/stories/2026/03/george-lee-obituary.html"],
    287: ["Robert F. Barfield", "https://engrhof.org/aehofmembers/robert-f-barfield/"],
    291: ["James H. Woodward", "https://inside.charlotte.edu/news-features/2016-01-27/woodward-hall-honors-chancellor-who-engineered-universitye28099s-maturation/"],
    484: ["Ralph E. White", "https://sc.edu/study/colleges_schools/engineering_and_computing/faculty-staff/whiteralph.php"],
    485: ["Anthony (Tony) Ambler", "https://www.scetv.org/stories/2015/qa-anthony-ambler-dean-college-engineering-and-computing-usc"],
    507: ["Richard T. Schoephoerster", "http://engineering.utep.edu/news071307.htm"],
    537: ["Edward A. Parrish Jr.", "https://engineering.vanderbilt.edu/2026/06/10/early-pioneer-in-pattern-recognition-and-engineering-education-former-dean-edward-parrish-has-died/"],
  };
  const removeIds = new Set([123, 159, 515]);
  let renamed = 0;
  const kept = arr.filter((r) => {
    if (removeIds.has(r.id)) return false;
    const fix = renames[r.id];
    if (fix) {
      const [newDean, url] = fix;
      console.log(`eschool#${r.id}: "${r.dean}" -> "${newDean}"`);
      r.dean = newDean;
      r.sourceUrl = url;
      renamed++;
    }
    return true;
  });
  writeDeansJson(path, raw, kept);
  console.log(`eschool: ${renamed} renamed, ${arr.length - kept.length} removed, ${kept.length} remain\n`);
}

// --- bschool: 2 renames, 1 retitle ---
{
  const { path, raw, arr } = load("r1-bschool-deans.json");
  const renames = {
    279: ["Glenn E. Corlett", "https://www.ohio.edu/business/about/college-history"],
    292: ["Sabah Randhawa", "https://en.wikipedia.org/wiki/Sabah_Randhawa"],
  };
  const retitles = {
    1266: ["Associate Dean for Undergraduate and Graduate Programs", "https://business.wvu.edu/news-and-events/news/2021/07/20/hall-prepares-for-new-academic-year-with-new-leaders-associate-dean-team-reorganization"],
  };
  let changed = 0;
  for (const r of arr) {
    if (renames[r.id]) {
      const [newDean, url] = renames[r.id];
      console.log(`bschool#${r.id}: "${r.dean}" -> "${newDean}"`);
      r.dean = newDean;
      r.sourceUrl = url;
      changed++;
    } else if (retitles[r.id]) {
      const [newRole, url] = retitles[r.id];
      console.log(`bschool#${r.id}: "${r.discipline}" -> "${newRole}"`);
      r.discipline = newRole;
      if (!r.sourceUrl) r.sourceUrl = url;
      changed++;
    }
  }
  writeDeansJson(path, raw, arr);
  console.log(`bschool: ${changed} changed\n`);
}

// --- nursing: 2 renames (a name swap), 1 retitle ---
{
  const { path, raw, arr } = load("r1-nursing-deans.json");
  const renames = {
    1118: ["John Dolan", "https://nursing.georgetown.edu/school-of-nursing-leadership/"],
    1119: ["Debora M. Dole", "https://nursing.georgetown.edu/profiles/debora-dole-phd-cnm-facnm/"],
  };
  const retitles = {
    1169: ["Associate Dean for Academics", "https://nursing.musc.edu/about/leadership"],
  };
  let changed = 0;
  for (const r of arr) {
    if (renames[r.id]) {
      const [newDean, url] = renames[r.id];
      console.log(`nursing#${r.id}: "${r.dean}" -> "${newDean}"`);
      r.dean = newDean;
      r.sourceUrl = url;
      changed++;
    } else if (retitles[r.id]) {
      const [newRole, url] = retitles[r.id];
      console.log(`nursing#${r.id}: "${r.discipline}" -> "${newRole}"`);
      r.discipline = newRole;
      if (!r.sourceUrl) r.sourceUrl = url;
      changed++;
    }
  }
  writeDeansJson(path, raw, arr);
  console.log(`nursing: ${changed} changed\n`);
}

// --- agschool: 2 updates (honorific-title/successor cases) ---
{
  const { path, raw, arr } = load("r1-agschool-deans.json");
  const updates = {
    869: ["James Hunt", "https://cales.arizona.edu/person/james-hunt"],
    870: ["Zelieann Craig", "https://research.alvsce.arizona.edu/person/zelieann-craig-phd"],
  };
  let changed = 0;
  for (const r of arr) {
    const fix = updates[r.id];
    if (!fix) continue;
    const [newDean, url] = fix;
    console.log(`agschool#${r.id}: "${r.dean}" -> "${newDean}"`);
    r.dean = newDean;
    r.sourceUrl = url;
    changed++;
  }
  writeDeansJson(path, raw, arr);
  console.log(`agschool: ${changed} changed\n`);
}

// grad: id 901129 (Fernando Pérez Muñoz) reconfirmed correct -- no change needed.
console.log("grad: 0 changed (901129 reconfirmed correct, no action)");
