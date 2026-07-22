#!/usr/bin/env node
/**
 * Daily leadership-appointment news scout — all 12 indices.
 *
 * Scans Google News RSS + Poets&Quants RSS for leadership events (deans of any
 * school, provosts, presidents/chancellors), matches them against tracked
 * universities/schools across ALL datasets, and:
 *   - AUTO-APPLIES high-confidence BUSINESS-SCHOOL appointments to the Excel +
 *     Top-100 deans.json (the only auto-mutation path — kept business-only so the
 *     other 11 datasets are never mutated by a heuristic) and banners them.
 *   - For every other matched leadership event (any index), adds a display-only
 *     "breaking" banner item + a latest-news entry. No data mutation.
 *   - Opens a GitHub confirmation issue for ambiguous business events.
 *
 * Usage: node news-scout.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ROOT, applyAppointment, updateJobMarket, logCSV, loadBreaking, saveBreaking, today } from "./news-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "../src/data");
const STATE_PATH = resolve(ROOT, "attached_assets/news_scout_state.json");
const REVIEW_PATH = resolve(ROOT, "attached_assets/news_scout_review.json");

const DRY = process.argv.includes("--dry-run");
const MAX_AUTO_PER_RUN = 5; // safety valve against a bad feed/regex day (business auto-apply only)
const MAX_BANNER_PER_RUN = 12; // cap non-business banner items per run
const RECENT_DAYS = 30;
const NOW = new Date();
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPOSITORY || "zjustinr/Dean-Tracker-Dashboard";

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
  ["publichealth", "r1-publichealth-schools.json"],
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
  // university leadership: provosts + presidents/chancellors
  "https://news.google.com/rss/search?q=university%20(%22named%20provost%22%20OR%20%22new%20provost%22%20OR%20%22interim%20provost%22)&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=university%20(%22named%20president%22%20OR%20%22next%20president%22%20OR%20%22named%20chancellor%22)&hl=en-US&gl=US&ceid=US:en",
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

// ---------- tracked schools (all 12 datasets) ----------
// Over-generic unit names ("School of Nursing") recur across universities, so a
// school-name key is only used when it uniquely identifies one university across
// the whole corpus; otherwise matching falls back to the university name.
const tracked = [];
const schoolNameCount = {};
const rawByType = [];
for (const [schoolType, file] of DATASETS) {
  const rows = JSON.parse(readFileSync(resolve(DATA, file), "utf8"));
  rawByType.push([schoolType, rows]);
  for (const s of rows) {
    const sk = (s.school || "").toLowerCase();
    if (sk) schoolNameCount[sk] = (schoolNameCount[sk] || 0) + 1;
  }
}
const seenUni = new Set();
for (const [schoolType, rows] of rawByType) {
  for (const s of rows) {
    const tag = `${schoolType}|${s.university}|${s.school}`;
    if (seenUni.has(tag)) continue;
    seenUni.add(tag);
    const keys = [s.university.toLowerCase()];
    const sk = (s.school || "").toLowerCase();
    if (sk && sk.length >= 10 && schoolNameCount[sk] === 1) keys.push(sk);
    tracked.push({ university: s.university, school: s.school, schoolType, keys });
  }
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

// ---------- classification ----------
function classify(text) {
  const t = text;
  const isDean = /\bdean\b/i.test(t);
  const isProvost = /\bprovost\b/i.test(t);
  const isPres = /\b(president|chancellor)\b/i.test(t);
  if (!(isDean || isProvost || isPres)) return null;
  if (/\bdean'?s\s+list\b|\bof\s+the\s+year\b|\baward(ed|s)?\b|\bhonor(ed|s)\b|\bvice\s+president\s+for\b/i.test(t)) return null;
  // Non-academic-leadership noise: athletics, alumni orgs, and hospital/health-system
  // or association "president/CEO" roles that aren't the campus leadership we track.
  if (/\bbasketball\b|\bfootball\b|\bathletics?\b|head\s+coach|alumni\s+association/i.test(t)) return null;
  if ((isPres && !isDean && !isProvost) && /\bmedical\s+center\b|\bhealth\s+system\b|\bhospital\b|\bC\.?E\.?O\.?\b|chief\s+executive|\bassociation\b|\bfoundation\b/i.test(t)) return null;
  const role = isProvost ? "provost" : isPres ? "president" : "dean";
  const interim = /\binterim\b|\bacting\b/i.test(t);
  const appt = /\b(named|appointed|selected|tapped|chosen|hired\s+as|picked\s+to\s+lead|takes?\s+over\s+as|to\s+lead|to\s+become|to\s+serve\s+as|will\s+(?:lead|serve|become))\b/i.test(t) ||
    /\b(names?|appoints?|taps?|selects?|welcomes?)\b[\s\S]{0,60}\b(as\s+)?(its\s+)?(new\s+|next\s+)?(interim\s+|acting\s+)?(dean|provost|president|chancellor)\b/i.test(t) ||
    /\bnext\s+(dean|provost|president|chancellor)\b/i.test(t);
  const dep = /\b(steps?\s+down|stepping\s+down|resigns?|to\s+retire|retiring|departs?|is\s+leaving|concludes?\s+(his|her|their)\s+(tenure|deanship|presidency))\b/i.test(t);
  const search = /\b(dean|provost|presidential)\s+search\b|\bsearch\s+(committee\s+)?for\s+(a\s+)?(new\s+)?(dean|provost|president|chancellor)\b/i.test(t);
  if (appt) return { type: "appointment", interim, role };
  if (dep) return { type: "departure", interim: false, role };
  if (search) return { type: "search", interim: false, role };
  return null;
}

// ---------- github issue creation ----------
async function createConfirmIssue(title, body) {
  if (!GH_TOKEN || DRY) return null;
  const api = `https://api.github.com/repos/${GH_REPO}`;
  const headers = {
    authorization: `Bearer ${GH_TOKEN}`,
    accept: "application/vnd.github+json",
    "user-agent": "dean-tracker-news-scout",
    "content-type": "application/json",
  };
  await fetch(`${api}/labels`, { method: "POST", headers, body: JSON.stringify({ name: "news-review", color: "d73a4a", description: "Leadership news awaiting confirmation" }) }).catch(() => {});
  const res = await fetch(`${api}/issues`, { method: "POST", headers, body: JSON.stringify({ title, body, labels: ["news-review"] }) });
  if (!res.ok) { console.error(`issue create failed: ${res.status}`); return null; }
  return (await res.json()).html_url;
}

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
      const school = matchSchool(text);
      const name = extractName(it.title) || extractName(text);
      events.push({
        ...cls, id, text,
        title: it.title, url: it.link, date: isNaN(pub.getTime()) ? NOW : pub,
        university: school?.university || null, school: school?.school || null,
        schoolType: school?.schoolType || null,
        dean: name,
        confidence: school && name && cls.type === "appointment" ? "high" : school ? "medium" : "low",
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

// AUTO-APPLY: business-school dean appointments ONLY (the tested, safe mutation path).
// Auto-apply guard: require an explicit business-school phrase (not just the word
// "business"), so a stray keyword can never mutate the B-School data.
const isBiz = (e) => e.schoolType === "business" &&
  /(business\s+school|school\s+of\s+business|college\s+of\s+business|school\s+of\s+management|graduate\s+school\s+of\s+management|b-school)/i.test(e.text);
const toApply = events.filter((e) => e.confidence === "high" && e.type === "appointment" && e.role === "dean" && isBiz(e)).slice(0, MAX_AUTO_PER_RUN);
const overflow = events.filter((e) => e.confidence === "high" && e.type === "appointment" && e.role === "dean" && isBiz(e)).slice(MAX_AUTO_PER_RUN);
// business ambiguous events -> GitHub confirm issue.
const toAsk = events.filter((e) => e.confidence === "medium" && isBiz(e) && (e.type === "appointment" || e.type === "departure"));
// everything else matched to a tracked institution -> display-only banner (any index).
const applyIds = new Set([...toApply, ...toAsk].map((e) => e.id));
const bannerOnly = events
  .filter((e) => e.university && !applyIds.has(e.id) && (e.type === "appointment" || e.type === "departure"))
  .slice(0, MAX_BANNER_PER_RUN);
const review = [...toAsk, ...events.filter((e) => e.confidence === "medium" && e.type === "search")];

let applied = 0;
const logLines = [];
const breaking = loadBreaking();

if (!DRY) {
  for (const e of toApply) {
    const status = applyAppointment(e);
    if (status === "added") {
      applied++;
      const jm = updateJobMarket({ kind: "filled", university: e.university });
      if (jm === "removed") logLines.push([today(), "position_filled", e.university, e.dean, "jobmarket", "high", e.url]);
      breaking.items.unshift({
        id: e.id, type: "applied", date: e.date.toISOString().slice(0, 10),
        headline: `${e.dean} named ${e.interim ? "interim " : ""}dean at ${e.university}${e.school ? ` (${e.school})` : ""}`,
        university: e.university, dean: e.dean, url: e.url,
      });
    }
    logLines.push([today(), status === "added" ? "added" : "skip_duplicate", e.university, e.dean, e.type + (e.interim ? "/interim" : ""), e.confidence, e.url]);
  }

  for (const e of toAsk) {
    const kind = e.type === "appointment" ? "name" : "close";
    const payload = { kind, university: e.university, school: e.school, interim: !!e.interim, date: e.date.toISOString(), url: e.url, title: e.title, id: e.id };
    const question = kind === "name"
      ? `Who was named ${e.interim ? "interim " : ""}dean at ${e.university}?`
      : `Should I close the sitting dean's tenure at ${e.university} (${e.date.getFullYear()})?`;
    const choices = kind === "name"
      ? ["Reply with the dean's full name", "Reply `skip` to ignore this story"]
      : ["Reply `1` or `yes` to close the tenure", "Reply `2` or `no` to ignore"];
    const body = [
      `**${question}**`, "", `News: [${e.title}](${e.url})`, "",
      "**How to answer (reply with a comment):**", ...choices.map((c) => `- ${c}`), "",
      "<!-- news-scout-payload", JSON.stringify(payload), "-->",
    ].join("\n");
    const issueUrl = await createConfirmIssue(`[news-review] ${question}`, body);
    breaking.items.unshift({
      id: e.id, type: "question", date: e.date.toISOString().slice(0, 10),
      headline: e.title, question, url: e.url, issueUrl: issueUrl || e.url,
    });
    logLines.push([today(), issueUrl ? "question_issue" : "review", e.university || "", e.dean || "", e.type, e.confidence, issueUrl || e.url]);
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
  for (const e of events.filter((ev) => ev.type === "search" && ev.university && isBiz(ev))) {
    const jm = updateJobMarket({ kind: "search", university: e.university, school: e.school, date: e.date, url: e.url, title: e.title });
    if (jm !== "none") logLines.push([today(), `position_${jm}`, e.university, "", "jobmarket_search", e.confidence, e.url]);
  }

  for (const e of overflow) logLines.push([today(), "skip_overflow", e.university, e.dean, e.type, e.confidence, e.url]);

  writeFileSync(STATE_PATH, JSON.stringify(state, null, 1));
  if (review.length) {
    const prev = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, "utf8")) : [];
    writeFileSync(REVIEW_PATH, JSON.stringify([...prev, ...review.map((e) => ({ recorded: today(), ...e }))], null, 1));
  }
  saveBreaking(breaking);
  logCSV(logLines);
}

console.log(`applied: ${applied} | questions: ${toAsk.length} | banner-only: ${bannerOnly.length} | dry-run: ${DRY}`);
if (applied > 0 || (!DRY && (toAsk.length > 0 || bannerOnly.length > 0))) console.log("CHANGED");
