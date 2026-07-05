#!/usr/bin/env node
/**
 * Daily dean-appointment news scout.
 *
 * Scans Google News RSS + Poets&Quants RSS for business-school dean events,
 * matches them against the tracked universities/schools in the dataset, and
 * auto-applies HIGH-confidence appointment events to:
 *   - attached_assets/Dean_Data_Collection_R1_v7_verified.xlsx (B-School sheet)
 *   - src/data/deans.json (Top-100 dataset) when the school is tracked there
 * Lower-confidence hits are written to attached_assets/news_scout_review.json.
 * Every action is logged to attached_assets/news_scout_log.csv.
 *
 * After running, regenerate the R1 JSONs with scripts/build-r1-data.mjs.
 * Usage: node news-scout.mjs [--dry-run]
 */
import XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
const XLSX_PATH = resolve(ROOT, "attached_assets/Dean_Data_Collection_R1_v7_verified.xlsx");
const DEANS_JSON = resolve(__dirname, "../src/data/deans.json");
const R1_SCHOOLS_JSON = resolve(__dirname, "../src/data/r1-bschool-schools.json");
const STATE_PATH = resolve(ROOT, "attached_assets/news_scout_state.json");
const REVIEW_PATH = resolve(ROOT, "attached_assets/news_scout_review.json");
const LOG_PATH = resolve(ROOT, "attached_assets/news_scout_log.csv");

const DRY = process.argv.includes("--dry-run");
const MAX_AUTO_PER_RUN = 5; // safety valve against a bad feed/regex day
const RECENT_DAYS = 30; // only act on news published within this window
const NOW = new Date();

const FEEDS = [
  "https://news.google.com/rss/search?q=%22named%20dean%22%20%22business%20school%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22new%20dean%22%20%22college%20of%20business%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22interim%20dean%22%20business&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=dean%20%22school%20of%20business%22%20(appointed%20OR%20named%20OR%20%22steps%20down%22)&hl=en-US&gl=US&ceid=US:en",
  "https://poetsandquants.com/feed/",
];

// ---------- helpers ----------
const decode = (s) =>
  (s || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "'").replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"')
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function parseRSS(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const grab = (tag) => {
      const mm = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return mm ? decode(mm[1]) : "";
    };
    items.push({ title: grab("title"), link: grab("link"), pubDate: grab("pubDate"), description: grab("description") });
  }
  return items;
}

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return String(h >>> 0);
};

const monthLabel = (d) => `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;

const STOP_NAME_TOKENS = new Set([
  "The","A","An","New","Next","Interim","Acting","Dean","Business","School","College","University",
  "State","Its","His","Her","First","Former","Names","Announces","Welcomes","As","At","Of","For",
]);

function extractName(text) {
  // "<Name> named/appointed/selected/tapped ... dean"  or  "names/appoints/taps/selects <Name>"
  const pats = [
    /([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){1,3})\s+(?:[Hh]as\s+[Bb]een\s+|[Ww]as\s+|[Ii]s\s+)?(?:[Nn]amed|[Aa]ppointed|[Ss]elected|[Tt]apped|[Cc]hosen)\b/,
    /\b(?:[Nn]ames?|[Aa]ppoints?|[Tt]aps?|[Ss]elects?|[Ww]elcomes?)\s+(?:Dr\.\s+)?([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){1,3})/,
    /\b(?:Dr\.\s+)?([A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){1,3})\s+(?:[Ww]ill\s+|[Tt]o\s+)?(?:serve|lead|become|take(?:s)?\s+(?:over|the\s+helm))\b/,
  ];
  for (const p of pats) {
    const m = text.match(p);
    if (!m) continue;
    const toks = m[1].split(/\s+/).filter((t) => !STOP_NAME_TOKENS.has(t));
    if (toks.length >= 2 && toks.length <= 4) return toks.join(" ");
  }
  return null;
}

// ---------- load tracked schools ----------
const r1Schools = JSON.parse(readFileSync(R1_SCHOOLS_JSON, "utf8"));
const deansJson = JSON.parse(readFileSync(DEANS_JSON, "utf8"));
const GENERIC_SCHOOL = /^(the\s+)?((graduate\s+)?(school|college)\s+of\s+(business|management)(\s+administration)?|business\s+school|college\s+of\s+business\s+and\s+economics)$/i;
// school names shared by more than one tracked university (e.g. "Anderson School
// of Management" at both UCLA and UNM) cannot be used as match keys on their own
const schoolNameCount = {};
for (const s of r1Schools) {
  const k = (s.school || "").toLowerCase();
  schoolNameCount[k] = (schoolNameCount[k] || 0) + (schoolNameCount[k + "|" + s.university] ? 0 : 1);
  schoolNameCount[k + "|" + s.university] = 1;
}
const tracked = []; // {university, school, keys: [lowercase strings to search for]}
const seenUni = new Set();
for (const s of r1Schools) {
  if (seenUni.has(s.university + "|" + s.school)) continue;
  seenUni.add(s.university + "|" + s.school);
  const keys = [s.university.toLowerCase()];
  const sk = (s.school || "").toLowerCase();
  // distinctive, UNIQUE named schools ("Kelley School of Business") are strong
  // signals; generic or shared names are not used as match keys.
  if (sk && !GENERIC_SCHOOL.test(s.school) && schoolNameCount[sk] === 1) {
    keys.push(sk);
  }
  tracked.push({ university: s.university, school: s.school, keys });
}

function matchSchool(text) {
  const t = text.toLowerCase();
  let best = null;
  for (const s of tracked) {
    for (const k of s.keys) {
      if (k.length >= 8 && t.includes(k)) {
        if (!best || k.length > best.keyLen) best = { ...s, keyLen: k.length };
      }
    }
  }
  return best;
}

// ---------- classify ----------
function classify(text) {
  const t = text;
  const isDeanContext = /\bdean\b/i.test(t) && /\b(business|management)\b/i.test(t);
  if (!isDeanContext) return null;
  // not a dean appointment: awards, or a dean moving to a presidency/provostship
  if (/\bdean\s+of\s+the\s+year\b|\baward(ed)?\b|\bhonor(ed|s)\b/i.test(t)) return null;
  if (/\b(named|appointed|selected|tapped|chosen)\s+(as\s+)?(the\s+)?(\d+\w*\s+)?(next\s+|new\s+|interim\s+)?(president|provost|chancellor)\b/i.test(t)) {
    return { type: "departure", interim: false };
  }
  if (/\b(named|appointed|selected|tapped|chosen|announces?|welcomes?)\b[\s\S]{0,80}\bdean\b/i.test(t) ||
      /\bdean\b[\s\S]{0,40}\b(named|appointed|selected)\b/i.test(t) ||
      /\b(names?|appoints?|taps?|selects?)\b[\s\S]{0,60}\b(as\s+)?(its\s+)?(new\s+|next\s+)?(interim\s+|acting\s+)?dean\b/i.test(t)) {
    return { type: "appointment", interim: /\binterim\b|\bacting\b/i.test(t) };
  }
  if (/\b(steps?\s+down|stepping\s+down|resigns?|to\s+retire|retiring|departs?|concludes?\s+(his|her|their)\s+(tenure|deanship))\b/i.test(t)) {
    return { type: "departure", interim: false };
  }
  if (/\bdean\s+search\b|\bsearch\s+for\s+(a\s+)?(new\s+)?dean\b/i.test(t)) {
    return { type: "search", interim: false };
  }
  return null;
}

// ---------- main ----------
const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { seen: {} };
// prune state entries older than 120 days
const cutoff = Date.now() - 120 * 86400e3;
for (const [k, v] of Object.entries(state.seen)) if (new Date(v).getTime() < cutoff) delete state.seen[k];

const events = [];
for (const feed of FEEDS) {
  try {
    const res = await fetch(feed, { headers: { "user-agent": "dean-tracker-news-scout/1.0" } });
    if (!res.ok) { console.error(`feed ${res.status}: ${feed}`); continue; }
    const items = parseRSS(await res.text());
    for (const it of items) {
      const id = hash(it.link || it.title);
      if (state.seen[id]) continue;
      state.seen[id] = NOW.toISOString();
      const text = `${it.title}. ${it.description}`;
      const cls = classify(text);
      if (!cls) continue;
      const pub = it.pubDate ? new Date(it.pubDate) : NOW;
      // stale items (Google News surfaces popular old stories) are marked seen but not acted on
      if (!isNaN(pub.getTime()) && NOW.getTime() - pub.getTime() > RECENT_DAYS * 86400e3) continue;
      const school = matchSchool(text);
      const name = extractName(it.title) || extractName(text);
      events.push({
        ...cls,
        title: it.title, url: it.link, pubDate: isNaN(pub.getTime()) ? NOW : pub,
        university: school?.university || null, school: school?.school || null,
        dean: name,
        confidence: school && name && cls.type === "appointment" ? "high" : school ? "medium" : "low",
      });
    }
  } catch (e) {
    console.error(`feed error ${feed}: ${e.message}`);
  }
}

console.log(`scanned feeds: ${FEEDS.length}, new dean-related items: ${events.length}`);
for (const e of events) console.log(`  [${e.confidence}] ${e.type}${e.interim ? "/interim" : ""} | ${e.university || "?"} | ${e.dean || "?"} | ${e.title}`);

// ---------- apply high-confidence appointments ----------
const lastName = (n) => n.split(/\s+/).filter((t) => !["Jr.","Jr","Sr.","II","III"].includes(t)).pop()?.toLowerCase() || "";
const toApply = events.filter((e) => e.confidence === "high" && e.type === "appointment").slice(0, MAX_AUTO_PER_RUN);
const skippedOverflow = events.filter((e) => e.confidence === "high" && e.type === "appointment").slice(MAX_AUTO_PER_RUN);
const review = events.filter((e) => e.confidence === "medium" || (e.confidence === "high" && e.type !== "appointment"));

let applied = 0;
const logLines = [];
if (toApply.length && !DRY) {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets["B-School"];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  const cols = Object.keys(rows[0]);

  for (const e of toApply) {
    const yr = e.pubDate.getFullYear();
    const schoolRows = rows.filter((r) => r.university_name === e.university);
    // dedup: same dean lastname already recorded recently at this university
    if (schoolRows.some((r) => r.dean_name && lastName(String(r.dean_name)) === lastName(e.dean) && Math.abs((r.appointment_start_year || 0) - yr) <= 1)) {
      logLines.push([NOW.toISOString().slice(0, 10), "skip_duplicate", e.university, e.dean, e.type, e.confidence, e.url]);
      continue;
    }
    // close the open spell of the sitting dean if there is exactly one
    const open = schoolRows.filter((r) => r.appointment_end_year == null || String(r.appointment_end_month_year).toLowerCase() === "present");
    if (open.length === 1) {
      open[0].appointment_end_year = yr;
      open[0].appointment_end_month_year = monthLabel(e.pubDate);
      open[0].correction_notes = `${open[0].correction_notes || ""} [news-scout ${NOW.toISOString().slice(0, 10)}: tenure closed, successor ${e.dean} announced, ${e.url}]`.trim();
    }
    const newRow = Object.fromEntries(cols.map((c) => [c, null]));
    Object.assign(newRow, {
      university_name: e.university,
      business_school_name: e.school || schoolRows[0]?.business_school_name || null,
      dean_name: e.dean,
      appointment_start_month_year: monthLabel(e.pubDate),
      appointment_start_year: yr,
      appointment_end_month_year: "Present",
      is_interim: e.interim ? 1 : 0,
      origin_category: e.interim ? "Interim-Internal" : "Unknown",
      source_url: e.url,
      notes: `Added automatically from news: ${e.title}`,
      correction_notes: `ADDED by news-scout ${NOW.toISOString().slice(0, 10)} (${e.url}); origin/discipline pending review`,
      verification_sweep_2026: "news-scout",
    });
    rows.push(newRow);
    applied++;
    logLines.push([NOW.toISOString().slice(0, 10), "added", e.university, e.dean, e.type + (e.interim ? "/interim" : ""), e.confidence, e.url]);

    // mirror into Top-100 deans.json if the school is tracked there
    const sibs = deansJson.filter((d) => d.university.toLowerCase() === e.university.toLowerCase());
    if (sibs.length && !sibs.some((d) => lastName(d.dean) === lastName(e.dean) && Math.abs((d.startYear || 0) - yr) <= 1)) {
      const openT = sibs.filter((d) => d.endYear == null);
      if (openT.length === 1) { openT[0].endYear = yr; openT[0].endLabel = monthLabel(e.pubDate); }
      const sib = sibs[0];
      deansJson.push({
        ...sib,
        id: Math.max(...deansJson.map((d) => d.id)) + 1,
        dean: e.dean, startYear: yr, endYear: null,
        startLabel: monthLabel(e.pubDate), endLabel: "Present",
        isInterim: e.interim, origin: e.interim ? "Interim-Internal" : "Unknown",
        originV2: e.interim ? "Interim-Internal" : "Unknown", apptOrigin4: e.interim ? "Interim-Internal" : "Unknown",
        isInternal: e.interim, isExternal: false,
        gender: "Unknown", isFemale: false,
        discipline: "", disciplineBroad: "Unknown", phdField: "",
        priorTitle: "", priorInstitution: "", tenureLength: null,
        notes: `Added automatically from news: ${e.title}`, sourceUrl: e.url,
        nextRole: "Still_serving", nextRoleCode: null,
        isFirstTimeDean: false, hasPriorDeanExp: false,
        surpriseDeparture: false, surpriseEvidence: "", involuntary: false,
        convertedToPermanent: false, connectionType: "", hadPriorConnection: false,
      });
    }
  }
  if (applied) {
    const newWs = XLSX.utils.json_to_sheet(rows, { header: cols });
    wb.Sheets["B-School"] = newWs;
    XLSX.writeFile(wb, XLSX_PATH);
    writeFileSync(DEANS_JSON, JSON.stringify(deansJson, null, 2));
  }
}
for (const e of skippedOverflow) logLines.push([NOW.toISOString().slice(0, 10), "skip_overflow", e.university, e.dean, e.type, e.confidence, e.url]);
for (const e of review) logLines.push([NOW.toISOString().slice(0, 10), "review", e.university || "", e.dean || "", e.type, e.confidence, e.url]);

if (!DRY) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
  if (review.length) {
    const prev = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, "utf8")) : [];
    writeFileSync(REVIEW_PATH, JSON.stringify([...prev, ...review.map((e) => ({ date: NOW.toISOString().slice(0, 10), ...e }))], null, 1));
  }
  if (logLines.length) {
    if (!existsSync(LOG_PATH)) appendFileSync(LOG_PATH, "date,action,university,dean,event,confidence,url\n");
    appendFileSync(LOG_PATH, logLines.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
  }
}

console.log(`applied: ${applied} | for review: ${review.length} | dry-run: ${DRY}`);
if (applied > 0) console.log("CHANGED"); // sentinel for the workflow
