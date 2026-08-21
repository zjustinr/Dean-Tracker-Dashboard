/**
 * Verify the sitting leader of each community college against the college's
 * own website. Step 3 of the sequence in COMMUNITY-COLLEGE-INDEX.md.
 *
 *   node research/verify-cc-leaders.mjs [--all] [--concurrency N] [--limit N]
 *
 * WHY THIS REACHES FURTHER THAN THE PHOTO PASS
 * --------------------------------------------
 * `fetch-cc-photos.mjs` confirmed 73 of 200 names, but only as a side effect of
 * needing an <img> whose alt text or filename carried the name. Most of its 120
 * misses were `no-name-match`: the page names the president perfectly well in
 * prose, it just renders the portrait as a CSS background or a JS-hydrated card.
 *
 * Verification does not need the picture. It needs the NAME IN THE TEXT, which
 * is a far lower bar and survives every one of those rendering choices.
 *
 * WHAT A VERDICT MEANS
 * --------------------
 *   confirmed  the IPEDS name appears in the leadership page's text
 *   differs    the page names a DIFFERENT person in a "President <Name>" or
 *              "<Name>, President" construction. `siteName` is a CANDIDATE, not
 *              a correction -- see below.
 *   unresolved the page could not be read, or names nobody recognisably
 *
 * `differs` is deliberately not treated as truth. Leadership pages list deans
 * and vice presidents beside the president, interim titles blur, and a
 * "President's Cabinet" page is full of other people's names. So a differs row
 * carries the evidence (the matched phrase, the URL) and stays a research lead.
 * Nothing here writes back into the universe files; a human or a collection
 * wave decides. That is the same posture `leaderNameUnverified` takes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPage, leadershipPages, pageText, parseName, normText } from "./lib/cc-pages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const has = (n) => process.argv.includes(`--${n}`);
const CONCURRENCY = Number(arg("concurrency", 8));
const LIMIT = Number(arg("limit", 0));

const TITLE = "(?:president|chancellor|superintendent(?:\\s*/\\s*president)?)";
const NAME = "([A-Z][a-zA-Z'\\-]+(?:\\s+[A-Z][a-zA-Z'\\-.]+){0,3})";
// "President Jane Q. Smith" and "Jane Q. Smith, President" -- the two ways a
// leadership page states the holder. Interim/Acting/Vice are matched so the
// Vice President next to the President does not get read as the President.
const AFTER = new RegExp(`\\b(?:(interim|acting|vice|assistant|associate|deputy)\\s+)?${TITLE}\\s+(?:of\\s+the\\s+college\\s+)?(?:is\\s+)?${NAME}`, "gi");
const BEFORE = new RegExp(`${NAME}\\s*,?\\s*(?:is\\s+(?:the\\s+)?)?(?:serves\\s+as\\s+)?(?:the\\s+)?(?:(interim|acting|vice|assistant|associate|deputy)\\s+)?${TITLE}\\b`, "gi");
// Page furniture that sits next to the title and reads like a name once the
// regex has had its way: "President Biography Dr. Martin", "President's Message
// Welcome". Anything containing one of these is not a person.
const STOP = new Set([
  "the", "our", "college", "office", "message", "welcome", "about", "meet", "contact", "search",
  "board", "district", "cabinet", "team", "staff", "new", "former", "current", "dr", "his", "her",
  "their", "biography", "bio", "profile", "home", "menu", "skip", "main", "news", "events", "story",
  "vision", "mission", "leadership", "administration", "university", "campus", "students", "faculty",
  "of", "and", "for", "from", "with", "is", "was", "will", "has", "who", "that", "this",
]);

// The candidate must be capitalised IN THE ORIGINAL TEXT. The match regexes carry
// the `i` flag so the TITLE alternation matches any casing -- which also makes
// `[A-Z]` in NAME match lowercase, so "President of Infinite Unlearning" parsed
// as a person. Checking the raw capture is what actually enforces name-shape.
const looksLikeName = (raw) => {
  const words = raw.trim().split(/\s+/);
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][a-zA-Z'.\-]*$/.test(w));
};

/** Does this page's text contain the person we expect? */
function findsName(text, want) {
  if (!want) return false;
  const t = normText(text);
  if (want.last.length < 3) return false;
  if (!t.includes(` ${want.last} `)) return false;
  // Last name alone is too weak -- "Smith" appears on any college's site. Require
  // the first name too, or a first initial adjacent to the surname.
  if (t.includes(` ${want.first} `) && t.includes(` ${want.last} `)) {
    return new RegExp(`\\b${want.first}\\b[^.]{0,40}\\b${want.last}\\b`).test(t) || t.includes(`${want.first} ${want.last}`);
  }
  return new RegExp(`\\b${want.first[0]}\\b[.\\s]{0,3}${want.last}\\b`).test(t);
}

/** Names the page presents as holding the top seat, best-effort. */
function extractHolders(text) {
  const out = [];
  for (const re of [AFTER, BEFORE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const modifier = (m[1] || m[2] || "").toLowerCase();
      if (/^(vice|assistant|associate|deputy)$/.test(modifier)) continue;  // not the top seat
      const raw = (re === AFTER ? m[2] : m[1]) || "";
      if (!looksLikeName(raw)) continue;
      const p = parseName(raw);
      if (!p || p.parts.length < 2) continue;
      if (p.parts.some((w) => STOP.has(w))) continue;
      out.push({
        name: raw.trim(),
        interim: /^(interim|acting)$/.test(modifier),
        phrase: m[0].trim().slice(0, 120),
        pattern: re === AFTER ? "after" : "before",
      });
    }
  }
  return out;
}

async function verify(college) {
  const want = parseName(college.leaderNameUnverified);
  const base = { rank: college.rank, university: college.name, state: college.state, ipedsName: college.leaderNameUnverified };
  if (!want) return { ...base, verdict: "unresolved", reason: "no-ipeds-name" };

  let home = (college.website || "").trim();
  if (!home) return { ...base, verdict: "unresolved", reason: "no-website" };
  if (!/^https?:\/\//i.test(home)) home = `https://${home}`;

  const pages = leadershipPages(home);
  const holders = [];
  let read = 0;

  for (const url of pages) {
    let text;
    try { text = pageText(getPage(url).html); } catch { continue; }
    if (text.length < 200) continue;
    read++;
    if (findsName(text, want)) {
      return { ...base, verdict: "confirmed", pageUrl: url };
    }
    for (const h of extractHolders(text)) holders.push({ ...h, url });
  }

  if (!read) return { ...base, verdict: "unresolved", reason: "no-page-readable", triedPages: pages.length };

  // Prefer a holder seen on more than one page -- a name repeated across the
  // president page and the leadership index is far likelier to be the incumbent
  // than one picked up from a single stray sentence.
  const tally = {};
  for (const h of holders) {
    const t = (tally[h.name] ||= { ...h, n: 0, patterns: new Set() });
    t.n++;
    t.patterns.add(h.pattern);
  }
  const best = Object.values(tally).sort((a, b) => b.n - a.n)[0];
  if (!best) return { ...base, verdict: "unresolved", reason: "no-holder-found", pagesRead: read };

  // A single sighting from a single phrasing is not enough to say the IPEDS name
  // is wrong. Corroboration = seen more than once, or stated both ways round
  // ("President Jane Smith" AND "Jane Smith, President"). Anything weaker stays
  // unresolved rather than becoming a lead someone might trust.
  if (best.n < 2 && best.patterns.size < 2) {
    return { ...base, verdict: "unresolved", reason: "holder-uncorroborated", weakCandidate: best.name, evidence: best.phrase, pageUrl: best.url, pagesRead: read };
  }

  return {
    ...base,
    verdict: "differs",
    siteName: best.name,
    siteNameIsInterim: best.interim,
    seenOnPages: best.n,
    statedBothWays: best.patterns.size > 1,
    evidence: best.phrase,
    pageUrl: best.url,
  };
}

const file = has("all") ? "universe_communitycollege_all.json" : "universe_communitycollege.json";
const universe = JSON.parse(readFileSync(join(HERE, "universe", file), "utf8"));
let colleges = universe.institutions;
if (LIMIT) colleges = colleges.slice(0, LIMIT);

const results = [];
let done = 0, cursor = 0;
async function worker() {
  while (cursor < colleges.length) {
    const c = colleges[cursor++];
    let r;
    try { r = await verify(c); }
    catch (e) { r = { rank: c.rank, university: c.name, state: c.state, ipedsName: c.leaderNameUnverified, verdict: "unresolved", reason: `threw:${e.message}` }; }
    results.push(r);
    if (++done % 25 === 0) console.error(`  ${done}/${colleges.length}`);
  }
}
console.error(`verifying ${colleges.length} incumbents (concurrency ${CONCURRENCY})...`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

results.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
const counts = results.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});

writeFileSync(
  join(HERE, "universe", "cc-leader-verification.json"),
  JSON.stringify({
    generated: universe.generated,
    method:
      "Each college's own leadership page, reached from its homepage. confirmed = the IPEDS " +
      "name appears in the page text. differs = the page names someone else in a " +
      "'President <Name>' construction; siteName is a RESEARCH LEAD, not a correction -- " +
      "leadership pages list cabinets and vice presidents too. unresolved = unreadable or " +
      "no recognisable holder. Nothing here is written back into the universe files.",
    counts,
    colleges: results,
  }, null, 1) + "\n"
);

console.error(`\n${JSON.stringify(counts)}`);
const reasons = results.filter((r) => r.verdict === "unresolved").reduce((a, r) => ((a[r.reason] = (a[r.reason] || 0) + 1), a), {});
console.error(`unresolved reasons: ${JSON.stringify(reasons)}`);
