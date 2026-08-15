// One-off: apply the verified corrections from the 2026-08-09 data-quality
// audit (eschool/bschool/grad name mismatches + spurious records), written by
// three independent re-verification agents to scratchpad *-corrections.json
// files. Each correction was cross-checked against a live, citable source
// before being included here -- see the commit message for the audit trail.
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

// --- eschool: 13 renames, 4 removals ---
{
  const { path, raw, arr } = load("r1-eschool-deans.json");
  const renames = {
    93: ["Bruce R. Locke", "https://eng.famu.fsu.edu/cbe/people/locke"],
    103: ["Jason Zara", "https://gwtoday.gwu.edu/jason-zara-named-interim-dean-gw-engineering"],
    110: ["Douglas B. Williams", "https://www.gatech.edu/news/2025/10/27/williams-named-interim-dean-college-engineering"],
    257: ["Andrew Singer", "https://news.stonybrook.edu/newsroom/press-release/general/andrew-singer-appointed-new-dean-of-stony-brooks-college-of-engineering-and-applied-sciences/"],
    262: ["Can Isik", "https://dailyorange.com/2018/12/su-appoints-interim-dean-college-engineering-computer-science/"],
    275: ["Stephen B. Bayne", "https://www.depts.ttu.edu/coe/about/history.php"],
    276: ["Roland Faller", "https://today.ttu.edu/posts/2023/06/Stories/Whitacre-College-of-Engineering-Names-New-Dean"],
    289: ["W. Edward Back", "https://news.ua.edu/2021/08/w-edward-back-named-interim-dean-of-the-college-of-engineering/"],
    290: ["Clifford L. Henderson", "https://news.ua.edu/2022/04/henderson-named-dean-of-ua-college-of-engineering/"],
    294: ["Timothy M. Wick", "https://www.uab.edu/reporter/people/leadership/item/8686-wick-to-become-interim-dean-of-engineering"],
    447: ["David A. Puleo", "https://news.olemiss.edu/david-puleo-named-new-um-engineering-dean/"],
    477: ["Sanjeev G. Shroff", "https://utimes.pitt.edu/news/interim-engineering-dean"],
    511: ["Kenith Meissner", "https://engineering.lehigh.edu/news/article/meissner-87-named-engineering-dean-university-texas-el-paso"],
  };
  const removeIds = new Set([435, 459, 464, 498]);
  let renamed = 0;
  const kept = arr.filter((r) => {
    if (removeIds.has(r.id)) return false;
    const fix = renames[r.id];
    if (fix) {
      const [newDean, url] = fix;
      console.log(`eschool#${r.id}: "${r.dean}" -> "${newDean}"`);
      r.dean = newDean;
      if (!r.sourceUrl) r.sourceUrl = url;
      renamed++;
    }
    return true;
  });
  writeDeansJson(path, raw, kept);
  console.log(`eschool: ${renamed} renamed, ${arr.length - kept.length} removed, ${kept.length} remain\n`);
}

// --- bschool: 9 name/role updates ---
{
  const { path, raw, arr } = load("r1-bschool-deans.json");
  const updates = {
    988: ["Yong Liu", "Vice Dean for Programs and Strategic Initiatives", "https://eller.arizona.edu/people/yong-liu"],
    994: ["Judith Anne Garretson Folse", "Associate Dean for Curriculum Innovation and Teaching Effectiveness", "https://walton.uark.edu/directory/all-faculty/uid/jagfolse/name/Judith+Anne+Folse/"],
    898: ["Joseph M. Hall", "Senior Associate Dean for the MBA Program", "https://tuck.dartmouth.edu/faculty/faculty-directory/joseph-m-hall"],
    1056: ["Pradeep Bhardwaj", "Associate Dean for Faculty, Research and Graduate Programs", "https://business.ucf.edu/person/pradeep-bhardwaj/"],
    1076: ["Vishal Narayan", "Associate Dean of Graduate (Business) Programs", "https://www.business.uconn.edu/person/vishal-narayan/"],
    1088: ["Robin Hadwick", "Assistant Dean for Student Services", "https://shidler.hawaii.edu/directory/robin-hadwick"],
    1087: ["Elizabeth J. Davidson", "Associate Dean for Academic Affairs", "https://shidler.hawaii.edu/itm/directory/elizabeth-j-davidson"],
    1113: ["Scott Kelley", "Executive Associate Dean", "https://gatton.uky.edu/people/scott-kelley"],
    1012: ["Sunil Wattal", "Associate Dean for Research and Doctoral Programs", "https://www.fox.temple.edu/directory/sunil-wattal-swattal"],
  };
  let updated = 0;
  for (const r of arr) {
    const fix = updates[r.id];
    if (!fix) continue;
    const [newDean, newRole, url] = fix;
    console.log(`bschool#${r.id}: "${r.dean}" (${r.discipline || r.roleTier || ""}) -> "${newDean}" (${newRole})`);
    r.dean = newDean;
    if (r.discipline) r.discipline = newRole;
    if (r.roleTier) r.roleTier = newRole;
    if (!r.sourceUrl) r.sourceUrl = url;
    updated++;
  }
  writeDeansJson(path, raw, arr);
  console.log(`bschool: ${updated} updated\n`);
}

// --- grad: 1 rename, 2 sourceUrl-only fills (identity already correct) ---
{
  const { path, raw, arr } = load("r1-grad-deans.json");
  const renames = { 901130: ["Reinaldo Berríos Rivera", "https://graduados.uprrp.edu/acerca-de/directorio-degi/"] };
  const sourceOnly = {
    901117: "https://www.marshall.edu/academic-affairs/profile/dr-carl-mummert/",
    901133: "https://www.linkedin.com/in/melissawebb16/",
  };
  let changed = 0;
  for (const r of arr) {
    if (renames[r.id]) {
      const [newDean, url] = renames[r.id];
      console.log(`grad#${r.id}: "${r.dean}" -> "${newDean}"`);
      r.dean = newDean;
      if (!r.sourceUrl) r.sourceUrl = url;
      changed++;
    } else if (sourceOnly[r.id] && !r.sourceUrl) {
      r.sourceUrl = sourceOnly[r.id];
      console.log(`grad#${r.id}: sourceUrl filled (identity already correct)`);
      changed++;
    }
  }
  writeDeansJson(path, raw, arr);
  console.log(`grad: ${changed} changed\n`);
}
