#!/usr/bin/env node
/**
 * Daily leadership-appointment news scout — every VISIBLE index (see
 * assertDatasetCoverage() in news-lib.mjs, which fails this script loudly if a
 * new index ships without a schoolType entry below).
 *
 * Scans Google News RSS + a few higher-ed trade-press RSS feeds for leadership
 * events (deans of any school, provosts, presidents/chancellors, advancement
 * VPs/CDOs), matches them against tracked universities/schools across ALL
 * datasets, and:
 *   - AUTO-APPLIES high-confidence appointments directly to that index's own
 *     <id>-deans.json (via applyEvent -> applyAppointmentGeneric in news-lib.mjs)
 *     and banners them.
 *   - For every other matched leadership event (any index), adds a display-only
 *     "breaking" banner item + a latest-news entry. No data mutation.
 *   - Medium-confidence events go to the review queue -> daily email digest.
 *
 * Usage: node news-scout.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ROOT, applyEvent, enqueueEnrichment, updateJobMarket, logCSV, loadBreaking, saveBreaking, today, assertDatasetCoverage } from "./news-lib.mjs";

// Fail loudly (non-zero exit, visible in the Actions run) rather than silently
// missing a whole index the way usgrad/uscreativearts/usadvancement went
// uncovered for weeks after shipping. See assertDatasetCoverage's own comment.
await assertDatasetCoverage();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../src/data");
const STATE_PATH = resolve(ROOT, "attached_assets/news_scout_state.json");
const REVIEW_PATH = resolve(ROOT, "attached_assets/news_scout_review.json");

const DRY = process.argv.includes("--dry-run");
const MAX_AUTO_PER_RUN = 5; // safety valve against a bad feed/regex day (business auto-apply only)
const MAX_BANNER_PER_RUN = 12; // cap non-business banner items per run
const RECENT_DAYS = 30;
const NOW = new Date();

// id -> [schoolType, schoolsFile]. schoolType "business" is the only auto-apply path.
const DATASETS = [
  ["business", "r1-bschool-schools.json"],
  ["engineering", "r1-eschool-schools.json"],
  ["university", "r1-university-schools.json"],
  ["medical", "r1-medschool-schools.json"],
  ["law", "r1-lawschool-schools.json"],
  ["provost", "r1-provost-schools.json"],
  ["agriculture", "r1-agschool-schools.json"],
  ["nursing", "r1-nursing-schools.json"],
  ["pharmacy", "r1-pharmacy-schools.json"],
  ["education", "r1-education-schools.json"],
  ["arts", "r1-arts-schools.json"],
  ["r2university", "r1-r2public-schools.json"],
  ["system", "r1-system-schools.json"],
  ["liberalarts", "r1-lac-schools.json"],
  ["publichealth", "r1-publichealth-schools.json"],
  ["veterinary", "r1-vet-schools.json"],
  ["grad", "r1-grad-schools.json"],
  ["creativearts", "r1-camd-schools.json"],
  ["advancement", "r1-advancement-schools.json"],
];

const FEEDS = [
  // business (drives the auto-apply path)
  "https://news.google.com/rss/search?q=%22named%20dean%22%20%22business%20school%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22new%20dean%22%20%22college%20of%20business%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=dean%20%22school%20of%20business%22%20(appointed%20OR%20named%20OR%20%22steps%20down%22)&hl=en-US&gl=US&ceid=US:en",
  "https://poetsandquants.com/feed/",
  // other professional-school deans (banner + news feed only)
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22school%20of%20public%20health%22%20OR%20%22college%20of%20public%20health%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22school%20of%20nursing%22%20OR%20%22college%20of%20nursing%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22school%20of%20law%22%20OR%20%22law%20school%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22school%20of%20medicine%22%20OR%20%22medical%20school%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20engineering%22%20OR%20%22school%20of%20engineering%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20pharmacy%22%20OR%20%22school%20of%20pharmacy%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20education%22%20OR%20%22school%20of%20education%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20agriculture%22%20OR%20%22college%20of%20arts%20and%20sciences%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20veterinary%20medicine%22%20OR%20%22school%20of%20veterinary%20medicine%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22graduate%20school%22%20OR%20%22graduate%20college%22%20OR%20%22vice%20provost%20for%20graduate%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22named%20dean%22%20(%22college%20of%20fine%20arts%22%20OR%20%22school%20of%20the%20arts%22%20OR%20%22college%20of%20arts%2C%20media%22%20OR%20%22visual%20and%20performing%20arts%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=university%20(%22vice%20president%20for%20advancement%22%20OR%20%22chief%20advancement%20officer%22%20OR%20%22chief%20development%20officer%22)%20(named%20OR%20appointed%20OR%20named%20interim)&hl=en-US&gl=US&ceid=US:en",
  // university leadership: provosts + presidents/chancellors
  "https://news.google.com/rss/search?q=university%20(%22named%20provost%22%20OR%20%22new%20provost%22%20OR%20%22interim%20provost%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=university%20(%22named%20president%22%20OR%20%22next%20president%22%20OR%20%22named%20chancellor%22)&hl=en-US&gl=US&ceid=US:en",
  // broad higher-ed trade press -- not personnel-specific, but the classify()/
  // extractName() pipeline below already filters any feed down to leadership
  // stories, so a general feed adds coverage the targeted Google News queries
  // above can miss (wording variants, smaller schools, etc.).
  "https://www.insidehighered.com/rss.xml",
  "https://www.highereddive.com/feeds/news/",
];

// ---------- rss helpers ----------
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

// ---------- extraction ----------
const STOP_NAME_TOKENS = new Set([
  "The","A","An","New","Next","Interim","Acting","Dean","Provost","President","Chancellor",
  "Business","School","College","University","State","Its","His","Her","Their","First","Former",
  "Names","Announces","Welcomes","Appoints","As","At","Of","For","To",
]);

function extractName(text) {
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

// ---------- tracked schools (all 12 datasets, indexed by type) ----------
// A bare university name ("Harvard University") is a key in EVERY dataset, so we
// never trust a loose cross-dataset match to pick the target index. Instead the
// target dataset is resolved from the role + an explicit unit phrase (below), and
// the university is then confirmed against THAT dataset's tracked entries.
const trackedByType = {};   // schoolType -> [{ university, school, keys }]
const tracked = [];         // flat list, used only for a fallback banner label
const rawByType = [];
for (const [schoolType, file] of DATASETS) {
  const rows = JSON.parse(readFileSync(resolve(DATA, file), "utf8"));
  rawByType.push([schoolType, rows]);
  const seen = new Set();
  const list = (trackedByType[schoolType] = []);
  for (const s of rows) {
    const tag = `${s.university}|${s.school}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    const entry = { university: s.university, school: s.school, key: s.university.toLowerCase(), schoolType };
    list.push(entry);
    tracked.push(entry);
  }
}

// Advancement titles ("VP for Advancement", "chief development officer") never
// contain dean/provost/president/chancellor, so classify() below needs its own
// gate for them. Shared with the "advancement" UNIT_PHRASES entry so the two
// can't drift apart and leave a detected-but-unroutable event.
const ADVANCEMENT_TITLE_RE = /\b(vice\s+president\s+for\s+advancement|vice\s+president\s+of\s+(?:university\s+)?advancement|chief\s+advancement\s+officer|chief\s+development\s+officer)\b/i;

// Explicit unit phrases that pin a DEAN story to one dataset. Order = specificity.
const UNIT_PHRASES = [
  ["business",     /business\s+school|school\s+of\s+business|college\s+of\s+business|(?:graduate\s+)?school\s+of\s+management|b-school/i],
  ["medical",      /school\s+of\s+medicine|medical\s+school|college\s+of\s+medicine/i],
  ["law",          /law\s+school|school\s+of\s+law|college\s+of\s+law/i],
  ["nursing",      /school\s+of\s+nursing|college\s+of\s+nursing/i],
  ["pharmacy",     /school\s+of\s+pharmacy|college\s+of\s+pharmacy/i],
  ["r2university", /\bR2\b|high\s+research\s+activity/i],
  ["system", /university\s+system|state\s+system\s+of\s+higher\s+education|system\s+office/i],
  ["liberalarts", /liberal\s+arts\s+college/i],
  ["publichealth", /school\s+of\s+public\s+health|college\s+of\s+public\s+health/i],
  ["veterinary",   /college\s+of\s+veterinary\s+medicine|school\s+of\s+veterinary\s+medicine|veterinary\s+college/i],
  ["education",    /(?:graduate\s+)?school\s+of\s+education|college\s+of\s+education/i],
  ["engineering",  /college\s+of\s+engineering|school\s+of\s+engineering/i],
  ["agriculture",  /college\s+of\s+agriculture|school\s+of\s+agriculture|college\s+of\s+forestry|agricultural\s+sciences|natural\s+resources/i],
  ["arts",         /college\s+of\s+arts\s+and\s+sciences|school\s+of\s+arts\s+and\s+sciences|college\s+of\s+liberal\s+arts|arts\s+(?:&|and)\s+sciences/i],
  ["grad",         /graduate\s+school|graduate\s+college|vice\s+provost\s+for\s+graduate/i],
  ["creativearts", /college\s+of\s+fine\s+arts|school\s+of\s+the\s+arts|college\s+of\s+arts(?:,|\s+and)\s+media|visual\s+and\s+performing\s+arts|school\s+of\s+visual\s+arts/i],
  ["advancement",  ADVANCEMENT_TITLE_RE],
];

/** Resolve which dataset an event targets, from its role + unit phrase. */
function resolveType(text, role) {
  if (role === "provost") return "provost";
  if (role === "president") return "university";
  for (const [type, re] of UNIT_PHRASES) if (re.test(text)) return type;
  return null; // a dean story with no recognizable unit -> untargeted (banner only)
}

/** Find the tracked university within a specific dataset (canonical name). */
function matchInType(text, schoolType) {
  const t = text.toLowerCase();
  let best = null;
  for (const s of trackedByType[schoolType] || []) {
    if (s.key.length >= 8 && t.includes(s.key) && (!best || s.key.length > best.key.length)) best = s;
  }
  return best;
}

/** Loose match across all datasets — only to label a banner, never to target. */
function matchAny(text) {
  const t = text.toLowerCase();
  let best = null;
  for (const s of tracked) {
    if (s.key.length >= 8 && t.includes(s.key) && (!best || s.key.length > best.key.length)) best = s;
  }
  return best;
}

// ---------- classification ----------
function classify(text) {
  const t = text;
  const isDean = /\bdean\b/i.test(t);
  const isProvost = /\bprovost\b/i.test(t);
  const isPres = /\b(president|chancellor)\b/i.test(t);
  const isAdvancement = ADVANCEMENT_TITLE_RE.test(t);
  if (!(isDean || isProvost || isPres || isAdvancement)) return null;
  if (/\bdean'?s\s+list\b|\bof\s+the\s+year\b|\baward(ed|s)?\b|\bhonor(ed|s)\b/i.test(t)) return null;
  // "vice president for X" is usually noise (student affairs, enrollment, etc.)
  // UNLESS X is advancement/development, which is a tracked role.
  if (/\bvice\s+president\s+for\b/i.test(t) && !isAdvancement) return null;
  // Non-academic-leadership noise: athletics, alumni orgs, and hospital/health-system
  // or association "president/CEO" roles that aren't the campus leadership we track.
  if (/\bbasketball\b|\bfootball\b|\bathletics?\b|head\s+coach|alumni\s+association/i.test(t)) return null;
  if ((isPres && !isDean && !isProvost && !isAdvancement) && /\bmedical\s+center\b|\bhealth\s+system\b|\bhospital\b|\bC\.?E\.?O\.?\b|chief\s+executive|\bassociation\b|\bfoundation\b/i.test(t)) return null;
  // isAdvancement must win first: "Vice President for Advancement" contains the
  // bare word "President", which would otherwise make isPres true and misroute
  // every advancement story into the president/chancellor bucket.
  const role = isAdvancement ? "advancement" : isProvost ? "provost" : isPres ? "president" : "dean";
  const interim = /\binterim\b|\bacting\b/i.test(t);
  const roleWords = "dean|provost|president|chancellor|vice\\s+president\\s+for\\s+advancement|chief\\s+advancement\\s+officer|chief\\s+development\\s+officer";
  const appt = /\b(named|appointed|selected|tapped|chosen|hired\s+as|picked\s+to\s+lead|takes?\s+over\s+as|to\s+lead|to\s+become|to\s+serve\s+as|will\s+(?:lead|serve|become))\b/i.test(t) ||
    new RegExp(`\\b(names?|appoints?|taps?|selects?|welcomes?)\\b[\\s\\S]{0,60}\\b(as\\s+)?(its\\s+)?(new\\s+|next\\s+)?(interim\\s+|acting\\s+)?(${roleWords})\\b`, "i").test(t) ||
    new RegExp(`\\bnext\\s+(${roleWords})\\b`, "i").test(t);
  const dep = /\b(steps?\s+down|stepping\s+down|resigns?|to\s+retire|retiring|departs?|is\s+leaving|concludes?\s+(his|her|their)\s+(tenure|deanship|presidency))\b/i.test(t);
  const search = new RegExp(`\\b(dean|provost|presidential|advancement)\\s+search\\b|\\bsearch\\s+(committee\\s+)?for\\s+(a\\s+)?(new\\s+)?(${roleWords})\\b`, "i").test(t);
  if (appt) return { type: "appointment", interim, role };
  if (dep) return { type: "departure", interim: false, role };
  if (search) return { type: "search", interim: false, role };
  return null;
}

// Medium-confidence items are now surfaced through the daily email digest
// (scripts/news-digest.mjs) with signed Approve/Dismiss links, replacing the old
// per-item GitHub confirmation issues.

// ---------- main ----------
const state = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")) : { seen: {} };
const cutoffSeen = Date.now() - 120 * 86400e3;
for (const [k, v] of Object.entries(state.seen)) if (new Date(v).getTime() < cutoffSeen) delete state.seen[k];

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
      if (!isNaN(pub.getTime()) && NOW.getTime() - pub.getTime() > RECENT_DAYS * 86400e3) continue;
      const name = extractName(it.title) || extractName(text);
      // Resolve the target dataset from role + unit phrase, then confirm the
      // university is tracked in THAT dataset. A match in the target dataset is
      // what makes an item actionable (auto-apply / review); anything else is at
      // most a banner label.
      const targetType = resolveType(text, cls.role);
      const hit = targetType ? matchInType(text, targetType) : null;
      const label = hit || matchAny(text); // for the banner only
      let confidence;
      if (hit && name && cls.type === "appointment") confidence = "high";
      else if (hit) confidence = "medium";
      else confidence = "low";
      events.push({
        ...cls, id, text,
        title: it.title, url: it.link, date: isNaN(pub.getTime()) ? NOW : pub,
        schoolType: hit ? targetType : null,
        university: (hit || label)?.university || null,
        school: (hit || label)?.school || null,
        targeted: !!hit,
        dean: name,
        confidence,
      });
    }
  } catch (e) {
    console.error(`feed error ${feed}: ${e.message}`);
  }
}

// ---------- latest-news feed for the app (all classified events, any confidence) ----------
const LATEST_PATH = resolve(DATA, "latest-news.json");
if (!DRY) {
  let latest = existsSync(LATEST_PATH) ? JSON.parse(readFileSync(LATEST_PATH, "utf8")) : [];
  const cut = Date.now() - 30 * 86400e3;
  latest = latest.filter((i) => new Date(i.date).getTime() >= cut);
  for (const e of events) {
    if (latest.some((i) => i.id === e.id)) continue;
    const srcMatch = e.title.match(/\s[-–|]\s([^-–|]{2,45})$/);
    const source = srcMatch ? srcMatch[1].trim() : e.url.includes("poetsandquants") ? "Poets&Quants" : "News";
    latest.unshift({
      id: e.id,
      date: e.date.toISOString().slice(0, 10),
      title: srcMatch ? e.title.slice(0, srcMatch.index).trim() : e.title,
      source, url: e.url, type: e.type, role: e.role,
    });
  }
  latest.sort((a, b) => b.date.localeCompare(a.date));
  writeFileSync(LATEST_PATH, JSON.stringify(latest.slice(0, 40), null, 1));
}

console.log(`scanned feeds: ${FEEDS.length}, leadership items: ${events.length}`);
for (const e of events) console.log(`  [${e.confidence}] ${e.role}/${e.type}${e.interim ? "/interim" : ""} | ${e.schoolType || "?"} | ${e.university || "?"} | ${e.dean || "?"} | ${e.title}`);

// DECIDE actions. The target dataset + an explicit unit phrase (or the role, for
// provost/president) are already baked into e.schoolType/e.targeted, so a stray
// keyword can never mutate the wrong dataset.
//   high + targeted appointment -> auto-apply to its dataset (per-index cap),
//                                   then queue the new leader for enrichment.
//   medium + targeted           -> review queue -> daily email digest.
//   matched-but-untargeted      -> display-only banner (no mutation).
const perType = {};
const toApply = [], overflow = [];
for (const e of events) {
  if (e.confidence === "high" && e.type === "appointment" && e.targeted) {
    perType[e.schoolType] = (perType[e.schoolType] || 0) + 1;
    (perType[e.schoolType] <= MAX_AUTO_PER_RUN ? toApply : overflow).push(e);
  }
}
const toReview = events.filter((e) => e.confidence === "medium" && e.targeted &&
  (e.type === "appointment" || e.type === "departure"));
const actedIds = new Set([...toApply, ...toReview, ...overflow].map((e) => e.id));
const bannerOnly = events
  .filter((e) => e.university && !actedIds.has(e.id) && (e.type === "appointment" || e.type === "departure"))
  .slice(0, MAX_BANNER_PER_RUN);

let applied = 0;
const logLines = [];
const breaking = loadBreaking();

if (!DRY) {
  for (const e of toApply) {
    const { status, dataset, deansFile, id: recordId } = applyEvent(e);
    if (status === "added") {
      applied++;
      enqueueEnrichment({ dataset, deansFile, recordId, university: e.university, school: e.school, dean: e.dean, url: e.url, title: e.title });
      if (e.schoolType === "business") {
        const jm = updateJobMarket({ kind: "filled", university: e.university });
        if (jm === "removed") logLines.push([today(), "position_filled", e.university, e.dean, "jobmarket", "high", e.url]);
      }
      breaking.items.unshift({
        id: e.id, type: "applied", date: e.date.toISOString().slice(0, 10),
        headline: `${e.dean} named ${e.interim ? "interim " : ""}${e.role} at ${e.university}${e.school ? ` (${e.school})` : ""}`,
        university: e.university, dean: e.dean, url: e.url,
      });
    }
    logLines.push([today(), status === "added" ? "added" : `skip_${status}`, e.university, e.dean, `${e.schoolType}/${e.type}${e.interim ? "/interim" : ""}`, e.confidence, e.url]);
  }

  // Medium items -> review queue (the daily digest signs Approve/Dismiss links
  // from these) + a "pending confirmation" banner so the app still surfaces them.
  const reviewItems = toReview.map((e) => ({
    id: e.id, recorded: today(),
    schoolType: e.schoolType, role: e.role, type: e.type, interim: !!e.interim,
    university: e.university, school: e.school, dean: e.dean || null,
    date: e.date.toISOString(), url: e.url, title: e.title, confidence: e.confidence,
    digested: false,
  }));
  for (const e of toReview) {
    breaking.items.unshift({
      id: e.id, type: "question", date: e.date.toISOString().slice(0, 10),
      headline: e.title,
      question: e.type === "appointment"
        ? `New ${e.role} at ${e.university}? (pending confirmation)`
        : `${e.role} departure at ${e.university}? (pending confirmation)`,
      url: e.url,
    });
    logLines.push([today(), "review", e.university || "", e.dean || "", `${e.schoolType}/${e.type}`, e.confidence, e.url]);
  }

  // Display-only banner for leadership news across all indices (no data mutation).
  for (const e of bannerOnly) {
    if (breaking.items.some((it) => it.id === e.id)) continue;
    breaking.items.unshift({
      id: e.id, type: "applied", date: e.date.toISOString().slice(0, 10),
      headline: e.title, university: e.university, dean: e.dean || undefined, url: e.url,
    });
    logLines.push([today(), "banner", e.university || "", e.dean || "", `${e.role}/${e.type}`, e.confidence, e.url]);
  }

  // dean-search announcements at tracked business schools refresh the openings board
  for (const e of events.filter((ev) => ev.type === "search" && ev.schoolType === "business" && ev.university)) {
    const jm = updateJobMarket({ kind: "search", university: e.university, school: e.school, date: e.date, url: e.url, title: e.title });
    if (jm !== "none") logLines.push([today(), `position_${jm}`, e.university, "", "jobmarket_search", e.confidence, e.url]);
  }

  for (const e of overflow) logLines.push([today(), "skip_overflow", e.university, e.dean, `${e.schoolType}/${e.type}`, e.confidence, e.url]);

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));

  // Merge into the review queue (dedupe by id, age out after 14 days).
  const prev = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, "utf8")) : [];
  const prevIds = new Set(prev.map((r) => r.id));
  const merged = [...prev, ...reviewItems.filter((r) => !prevIds.has(r.id))]
    .filter((r) => r.id != null && Date.now() - new Date(r.recorded || r.date || 0).getTime() < 14 * 86400e3);
  writeFileSync(REVIEW_PATH, JSON.stringify(merged, null, 1));

  saveBreaking(breaking);
  logCSV(logLines);
}

console.log(`applied: ${applied} | review: ${toReview.length} | banner-only: ${bannerOnly.length} | dry-run: ${DRY}`);
if (applied > 0 || (!DRY && (toReview.length > 0 || bannerOnly.length > 0))) console.log("CHANGED");
