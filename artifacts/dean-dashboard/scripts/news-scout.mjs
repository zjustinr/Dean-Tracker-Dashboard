#!/usr/bin/env node
/**
 * Daily dean-appointment news scout.
 *
 * Scans Google News RSS + Poets&Quants RSS for business-school dean events,
 * matches them against tracked universities/schools, and:
 *   - AUTO-APPLIES high-confidence appointments to the Excel + deans.json
 *     (and adds a "breaking news" banner item for the app)
 *   - Opens a GitHub confirmation issue (label: news-review) for ambiguous
 *     events, with numbered choices, and adds a "question" banner item
 * Lower-value hits are appended to attached_assets/news_scout_review.json.
 * Every action logs to attached_assets/news_scout_log.csv.
 *
 * Usage: node news-scout.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ROOT, applyAppointment, updateJobMarket, logCSV, loadBreaking, saveBreaking, today } from "./news-lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const R1_SCHOOLS_JSON = resolve(__dirname, "../src/data/r1-bschool-schools.json");
const STATE_PATH = resolve(ROOT, "attached_assets/news_scout_state.json");
const REVIEW_PATH = resolve(ROOT, "attached_assets/news_scout_review.json");

const DRY = process.argv.includes("--dry-run");
const MAX_AUTO_PER_RUN = 5; // safety valve against a bad feed/regex day
const RECENT_DAYS = 30; // only act on news published within this window
const NOW = new Date();
const GH_TOKEN = process.env.GITHUB_TOKEN;
const GH_REPO = process.env.GITHUB_REPOSITORY || "zjustinr/Dean-Tracker-Dashboard";

const FEEDS = [
  "https://news.google.com/rss/search?q=%22named%20dean%22%20%22business%20school%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22new%20dean%22%20%22college%20of%20business%22&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=%22interim%20dean%22%20business&hl=en-US&gl=US&ceid=US:en",
  "https://news.google.com/rss/search?q=dean%20%22school%20of%20business%22%20(appointed%20OR%20named%20OR%20%22steps%20down%22)&hl=en-US&gl=US&ceid=US:en",
  "https://poetsandquants.com/feed/",
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
  "The","A","An","New","Next","Interim","Acting","Dean","Business","School","College","University",
  "State","Its","His","Her","First","Former","Names","Announces","Welcomes","As","At","Of","For",
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

// ---------- tracked schools ----------
const GENERIC_SCHOOL = /^(the\s+)?((graduate\s+)?(school|college)\s+of\s+(business|management)(\s+administration)?|business\s+school|college\s+of\s+business\s+and\s+economics)$/i;
const r1Schools = JSON.parse(readFileSync(R1_SCHOOLS_JSON, "utf8"));
const schoolNameUnis = {};
for (const s of r1Schools) {
  const k = (s.school || "").toLowerCase();
  (schoolNameUnis[k] = schoolNameUnis[k] || new Set()).add(s.university);
}
const tracked = [];
const seenUni = new Set();
for (const s of r1Schools) {
  if (seenUni.has(s.university + "|" + s.school)) continue;
  seenUni.add(s.university + "|" + s.school);
  const keys = [s.university.toLowerCase()];
  const sk = (s.school || "").toLowerCase();
  if (sk && !GENERIC_SCHOOL.test(s.school) && schoolNameUnis[sk].size === 1) keys.push(sk);
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

// ---------- classification ----------
function classify(text) {
  const t = text;
  if (!(/\bdean\b/i.test(t) && /\b(business|management)\b/i.test(t))) return null;
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
  if (/\bdean\s+search\b|\bsearch\s+for\s+(a\s+)?(new\s+)?dean\b/i.test(t)) return { type: "search", interim: false };
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
  // ensure the label exists (ignore "already exists" failures)
  await fetch(`${api}/labels`, { method: "POST", headers, body: JSON.stringify({ name: "news-review", color: "d73a4a", description: "Dean news awaiting confirmation" }) }).catch(() => {});
  const res = await fetch(`${api}/issues`, { method: "POST", headers, body: JSON.stringify({ title, body, labels: ["news-review"] }) });
  if (!res.ok) { console.error(`issue create failed: ${res.status}`); return null; }
  const issue = await res.json();
  return issue.html_url;
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
        ...cls, id,
        title: it.title, url: it.link, date: isNaN(pub.getTime()) ? NOW : pub,
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

const toApply = events.filter((e) => e.confidence === "high" && e.type === "appointment").slice(0, MAX_AUTO_PER_RUN);
const overflow = events.filter((e) => e.confidence === "high" && e.type === "appointment").slice(MAX_AUTO_PER_RUN);
// ambiguous but valuable: tracked school + (appointment w/o name, or departure)
const toAsk = events.filter((e) => e.confidence === "medium" && (e.type === "appointment" || e.type === "departure"));
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
      `**${question}**`, "",
      `News: [${e.title}](${e.url})`, "",
      "**How to answer (reply with a comment):**",
      ...choices.map((c) => `- ${c}`), "",
      "<!-- news-scout-payload", JSON.stringify(payload), "-->",
    ].join("\n");
    const issueUrl = await createConfirmIssue(`[news-review] ${question}`, body);
    breaking.items.unshift({
      id: e.id, type: "question", date: e.date.toISOString().slice(0, 10),
      headline: e.title, question, url: e.url, issueUrl: issueUrl || e.url,
    });
    logLines.push([today(), issueUrl ? "question_issue" : "review", e.university || "", e.dean || "", e.type, e.confidence, issueUrl || e.url]);
  }

  // dean-search announcements at tracked schools refresh the openings board
  for (const e of events.filter((ev) => ev.type === "search" && ev.university)) {
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

console.log(`applied: ${applied} | questions: ${toAsk.length} | dry-run: ${DRY}`);
if (applied > 0 || (!DRY && toAsk.length > 0)) console.log("CHANGED"); // sentinel for the workflow
