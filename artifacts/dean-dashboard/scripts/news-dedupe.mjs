/**
 * Story-level dedupe for the news pipeline.
 *
 * One appointment is reported by a dozen outlets, and the wire copy keeps
 * arriving for days afterwards, so article-id dedupe (news_scout_state.seen)
 * only ever stops the SAME url twice -- it can't stop the 20 banner lines that
 * U-M's Aug 2026 presidential pick produced. Everything here collapses articles
 * to the STORY they describe: a person + role + institution, matched within a
 * rolling window, so a follow-up piece three days later folds into the item
 * already on the banner instead of adding another one.
 *
 * Dependency-free on purpose (no xlsx/dataset imports): it is pure text logic,
 * imported by news-lib.mjs and runnable on its own.
 */
import { pathToFileURL } from "url";

/** Days two articles can be apart and still be treated as the same story. */
export const STORY_WINDOW_DAYS = 21;

export const slugify = (s) =>
  String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Who a story is about. Lives here rather than in news-scout.mjs because the
// person is half of a story's identity -- the scout uses it to name a new
// record, the dedupe path uses it to recognise the same event under a
// different outlet's headline.
const STOP_NAME_TOKENS = new Set([
  "The","A","An","New","Next","Interim","Acting","Dean","Provost","President","Chancellor",
  "Business","School","College","University","State","Its","His","Her","Their","First","Former",
  "Names","Announces","Welcomes","Appoints","As","At","Of","For","To",
]);

export function extractName(text) {
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

/**
 * The role an appointment points at. "Michigan hires Vanderbilt provost
 * C. Cybele Raver as next president" is a PRESIDENT story: reading it as a
 * provost story (the first title the sentence mentions) both files it under the
 * wrong index and splits one event into two banner lines ("New provost at
 * Michigan?" + "New president at Michigan?"), which is where a good share of
 * the duplicates came from.
 *
 * Three rules, most reliable first, because the person's CURRENT title is
 * usually the one nearest the verb:
 *   1. "...as (its) (next) president"   -- the role being moved into
 *   2. "next/new/incoming president"    -- adjacent only, so "new executive
 *      committee, reviews president's goals" isn't read as a president story
 *   3. "named/appointed ... president"  -- nearest role after the verb
 * Returns null when nothing is pointed at, so callers keep their own fallback.
 */
const ROLE_WORD = "dean|provost|president|chancellor";
const ROLE_RULES = [
  new RegExp(`\\bas\\s+(?:its\\s+|the\\s+|their\\s+)?(?:next\\s+|new\\s+|incoming\\s+|first\\s+|permanent\\s+|interim\\s+|acting\\s+)*(${ROLE_WORD})\\b(?!\\s+(?:search|committee))`, "i"),
  new RegExp(`\\b(?:next|new|incoming)\\s+(?:interim\\s+|acting\\s+|permanent\\s+|first\\s+)*(${ROLE_WORD})\\b`, "i"),
  new RegExp(`\\b(?:names?|named|appoints?|appointed|taps?|tapped|selects?|selected|chosen|hired\\s+as|picked\\s+(?:to\\s+lead|as)|takes?\\s+over\\s+as|to\\s+(?:lead|become|serve\\s+as)|will\\s+(?:lead|serve|become))\\b[^.;]{0,40}?\\b(${ROLE_WORD})\\b`, "i"),
];

export function appointedRole(text) {
  const t = String(text || "");
  for (const re of ROLE_RULES) {
    const m = t.match(re);
    if (!m) continue;
    const role = m[1].toLowerCase();
    return role === "chancellor" ? "president" : role;  // one bucket, as classify() has always had it
  }
  return null;
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md", "edd", "dr", "prof"]);

/**
 * Surname + first initial ("raver-c"), so the same person survives the way
 * outlets differ on middle names and honorifics: "C. Cybele Raver",
 * "Cybele Raver" and "Dr. Cybele Raver" all key the same.
 */
export function personKey(name) {
  const toks = String(name || "").toLowerCase()
    .replace(/[^a-z\s'.-]/g, " ").split(/\s+/)
    .map((t) => t.replace(/[.']/g, ""))
    .filter((t) => t && !NAME_SUFFIXES.has(t));
  if (toks.length < 2) return null;
  return `${toks[toks.length - 1]}-${toks[0][0]}`;
}

/**
 * Keys that identify the story behind an event. Two events are the same story
 * if any key matches:
 *   p: the person + what happened to them  (survives role/institution wording)
 *   u: institution + role + target index   (catches the many name-less items --
 *      "5 things to know about Michigan's next president" extracts no name)
 * The u-key carries schoolType so two different deanships announced at one
 * university in the same week stay separate stories; "*" means the scout
 * couldn't target an index, and wildcard-matches a known one (see keyMatches).
 */
export function storyKeysForEvent(e) {
  const kind = e.type === "departure" ? "departure" : e.type === "search" ? "search" : "appointment";
  const keys = [];
  const person = personKey(e.dean);
  const univ = slugify(e.university);
  if (person) keys.push(`p:${kind}:${person}`);
  if (univ) keys.push(`u:${kind}:${e.role || "any"}:${e.schoolType || "*"}:${univ}`);
  return keys;
}

function keyMatches(a, b) {
  if (a === b) return true;
  if (!a.startsWith("u:") || !b.startsWith("u:")) return false;
  const A = a.split(":"), B = b.split(":");
  return A[1] === B[1] && A[2] === B[2] && A[4] === B[4] && (A[3] === "*" || B[3] === "*");
}

const TITLE_STOP = new Set([
  "the","a","an","of","at","in","to","for","as","its","his","her","their","and","is","was","will",
  "be","new","next","named","names","appointed","appoints","announce","announces","announced",
  "university","college","school","says","after","from","with","who","that","this","it","on","by",
]);

function titleTokens(s) {
  return new Set(
    String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((t) => t.length > 2 && !TITLE_STOP.has(t))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Union-find over entries { keys, date (ms), title, person, universitySlug }.
 * Returns an array of group ids, one per entry (index of the group's first
 * member). Beyond key matching there's a headline-similarity bridge for the
 * items that carry no usable key -- never between two entries that name
 * DIFFERENT people, so "X named law dean" and "Y named medical dean" can't be
 * folded together.
 */
export function groupStories(entries, opts = {}) {
  const windowMs = (opts.windowDays ?? STORY_WINDOW_DAYS) * 86400e3;
  const threshold = opts.similarity ?? 0.6;
  const parent = entries.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  const tokens = entries.map((e) => titleTokens(e.title));

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (Math.abs((a.date || 0) - (b.date || 0)) > windowMs) continue;
      let same = (a.keys || []).some((ka) => (b.keys || []).some((kb) => keyMatches(ka, kb)));
      if (!same && threshold > 0 && !(a.person && b.person && a.person !== b.person)) {
        // Headline bridge for items that carry no usable key: same school, or
        // neither school recognised -- where a stricter bar applies, because a
        // local-TV rewrite of one wire story is near-identical to it and two
        // unrelated stories are not.
        const sameUniversity = a.universitySlug && a.universitySlug === b.universitySlug;
        const neitherKnown = !a.universitySlug && !b.universitySlug;
        if (sameUniversity || neitherKnown) {
          same = jaccard(tokens[i], tokens[j]) >= (sameUniversity ? threshold : Math.max(threshold, 0.75));
        }
      }
      if (same) union(i, j);
    }
  }
  return entries.map((_, i) => find(i));
}

const CONFIDENCE_RANK = { high: 4, medium: 2, low: 0 };

/** How much a duplicate is worth keeping: the most actionable, best-named one. */
function eventScore(e) {
  return (e.targeted ? 8 : 0) + (CONFIDENCE_RANK[e.confidence] ?? 0) + (e.dean ? 2 : 0) + (e.university ? 1 : 0);
}

/**
 * Collapse a run's events to one per story, and flag the ones that continue a
 * story a previous run already handled.
 *
 * @param events  this run's classified events
 * @param prior   stories seen by earlier runs: [{ keys, date, title, university }]
 * @returns { events, dropped } -- `events` keeps one event per story (each
 *   carrying storyKeys, and repeatOfPrior=true when an earlier run already
 *   banner/queued that story); `dropped` are the same-run losers.
 */
export function dedupeEvents(events, prior = []) {
  const priorEntries = (prior || []).map((p) => ({
    keys: p.keys || [], date: +new Date(p.date || 0), title: p.title || "",
    person: personKey(p.dean), universitySlug: slugify(p.university), prior: true,
  }));
  const liveEntries = events.map((e) => ({
    keys: storyKeysForEvent(e), date: +new Date(e.date), title: e.title || "",
    person: personKey(e.dean), universitySlug: slugify(e.university), event: e,
  }));
  const entries = [...priorEntries, ...liveEntries];
  const groups = groupStories(entries);

  const byGroup = new Map();
  entries.forEach((entry, i) => {
    const g = groups[i];
    if (!byGroup.has(g)) byGroup.set(g, { keys: new Set(), hadPrior: false, live: [] });
    const bucket = byGroup.get(g);
    for (const k of entry.keys) bucket.keys.add(k);
    if (entry.prior) bucket.hadPrior = true;
    else bucket.live.push(entry.event);
  });

  const keep = new Set(), dropped = [];
  for (const bucket of byGroup.values()) {
    if (!bucket.live.length) continue;
    const winner = bucket.live.reduce((best, e) => (eventScore(e) > eventScore(best) ? e : best));
    for (const e of bucket.live) {
      e.storyKeys = [...bucket.keys];
      if (e === winner) { e.repeatOfPrior = bucket.hadPrior; keep.add(e); }
      else dropped.push(e);
    }
  }
  return { events: events.filter((e) => keep.has(e)), dropped };
}

/** Story keys for an item already sitting in breaking-news.json. */
export function breakingItemKeys(it) {
  if (Array.isArray(it.storyKeys) && it.storyKeys.length) return it.storyKeys;
  // Items written before storyKeys existed: recover role/university from the
  // sentences the scout composes ("New provost at X? (pending confirmation)",
  // "Jane Doe named interim dean at X (School)").
  const text = it.question || it.headline || "";
  let kind = "appointment", role = null, university = it.university || null;
  let m = text.match(/^New\s+([a-z]+)\s+at\s+(.+?)\?/i);
  if (m) { role = m[1].toLowerCase(); university = university || m[2]; }
  if (!m && (m = text.match(/^([a-z]+)\s+departure\s+at\s+(.+?)\?/i))) {
    kind = "departure"; role = m[1].toLowerCase(); university = university || m[2];
  }
  if (!role) {
    const r = text.match(/\bnamed\s+(?:the\s+)?(?:new\s+|next\s+|interim\s+|acting\s+)*(dean|provost|president|chancellor)\b/i);
    if (r) role = r[1].toLowerCase();
  }
  // Items the scout bannered raw carry no dean field, but their headline names
  // the person often enough to be worth reading -- that person key is what ties
  // "New provost at X?" to "Jane Doe named president at X" when one story got
  // filed under two roles.
  const dean = it.dean || extractName(it.headline || "") || extractName(it.question || "");
  return storyKeysForEvent({ type: kind, role, university, dean, schoolType: null });
}

const BANNER_RANK = (it) => (it.type === "applied" ? (it.dean ? 3 : 2) : 1);

/**
 * Collapse banner items to one per story. Order is preserved and, within a
 * story, the most informative item wins -- so a confirmed "Jane Doe named dean
 * at X" replaces the "New dean at X? (pending confirmation)" line it resolves.
 */
export function dedupeBreakingItems(items) {
  const list = items || [];
  const entries = list.map((it) => ({
    keys: breakingItemKeys(it), date: +new Date(it.date), title: it.question || it.headline || "",
    person: personKey(it.dean), universitySlug: slugify(it.university),
  }));
  const groups = groupStories(entries);
  const winnerOf = new Map();
  list.forEach((it, i) => {
    const g = groups[i];
    const cur = winnerOf.get(g);
    if (cur == null || BANNER_RANK(it) > BANNER_RANK(list[cur])) winnerOf.set(g, i);
  });
  const keep = new Set(winnerOf.values());
  return list.filter((_, i) => keep.has(i));
}

/**
 * Add a banner item unless its story is already on the banner. A better item
 * (a confirmed appointment) replaces the weaker one in place rather than
 * stacking on top of it. Returns "added" | "replaced" | "duplicate".
 */
export function pushBreaking(breaking, item) {
  const keys = breakingItemKeys(item);
  const withKeys = { ...item, storyKeys: keys };
  const date = +new Date(item.date);
  const windowMs = STORY_WINDOW_DAYS * 86400e3;
  const tokens = titleTokens(item.question || item.headline || "");
  const person = personKey(item.dean);
  const univ = slugify(item.university);

  const idx = breaking.items.findIndex((it) => {
    if (String(it.id) === String(item.id)) return true;
    const d = +new Date(it.date);
    if (Math.abs(d - date) > windowMs) return false;
    const otherKeys = breakingItemKeys(it);
    if (keys.some((k) => otherKeys.some((o) => keyMatches(k, o)))) return true;
    const otherPerson = personKey(it.dean);
    if (person && otherPerson && person !== otherPerson) return false;
    if (!univ || univ !== slugify(it.university)) return false;
    return jaccard(tokens, titleTokens(it.question || it.headline || "")) >= 0.6;
  });

  if (idx === -1) { breaking.items.unshift(withKeys); return "added"; }
  if (BANNER_RANK(item) > BANNER_RANK(breaking.items[idx])) {
    breaking.items.splice(idx, 1);
    breaking.items.unshift(withKeys);
    return "replaced";
  }
  return "duplicate";
}

// ---------------------------------------------------------------------------
// CLI: node scripts/news-dedupe.mjs [--dry-run]
// ---------------------------------------------------------------------------
// Collapses the stories already sitting in the shipped feeds. The scout only
// dedupes what it writes from here on, so this is what clears a backlog like
// the 20 U-M presidential-pick lines the banner was carrying, and it is safe to
// re-run at any time.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { readFileSync, writeFileSync, existsSync, readdirSync } = await import("fs");
  const { resolve, dirname } = await import("path");
  const { fileURLToPath } = await import("url");
  const here = dirname(fileURLToPath(import.meta.url));
  const DATA = resolve(here, "../src/data");
  const ROOT_DIR = resolve(here, "../../..");
  const dry = process.argv.includes("--dry-run");
  const write = (p, v) => { if (!dry) writeFileSync(p, v); };

  // latest-news rows carry no university field, so recover it the way the scout
  // does -- longest tracked school name mentioned in the headline.
  const universities = [];
  for (const f of readdirSync(DATA)) {
    if (!/^r1-.*-schools\.json$/.test(f)) continue;
    for (const s of JSON.parse(readFileSync(resolve(DATA, f), "utf8"))) {
      if (s.university && s.university.length >= 8) universities.push(s.university);
    }
  }
  const uniq = [...new Set(universities)].sort((a, b) => b.length - a.length);
  const universityIn = (title) => {
    const t = String(title || "").toLowerCase();
    return uniq.find((u) => t.includes(u.toLowerCase())) || null;
  };

  // Rows written before appointedRole() existed can carry the wrong role --
  // "hire Vanderbilt provost as next president" was filed as a provost story --
  // and a story split across two roles is a story that shows up twice. Correct
  // the stored role first, so the grouping below sees one story, not two.
  const correctedRole = (row) => {
    if (row.type !== "appointment") return null;
    if (row.role !== "provost" && row.role !== "president") return null;
    const pointed = appointedRole(row.title || row.headline || "");
    return (pointed === "provost" || pointed === "president") && pointed !== row.role ? pointed : null;
  };

  const banner = resolve(DATA, "breaking-news.json");
  if (existsSync(banner)) {
    const data = JSON.parse(readFileSync(banner, "utf8"));
    const before = (data.items || []).length;
    for (const it of data.items || []) {
      const m = /^New\s+(provost|president)\s+at\s+(.+?)\?/i.exec(it.question || "");
      if (!m) continue;
      const pointed = correctedRole({ type: "appointment", role: m[1].toLowerCase(), headline: it.headline });
      if (pointed) { it.question = `New ${pointed} at ${m[2]}? (pending confirmation)`; delete it.storyKeys; }
    }
    data.items = dedupeBreakingItems(data.items || [])
      .map((it) => ({ ...it, storyKeys: breakingItemKeys(it) }));
    write(banner, JSON.stringify(data, null, 2));
    console.log(`breaking-news.json: ${before} -> ${data.items.length}`);
  }

  const latestPath = resolve(DATA, "latest-news.json");
  if (existsSync(latestPath)) {
    const rows = JSON.parse(readFileSync(latestPath, "utf8"));
    for (const r of rows) { const pointed = correctedRole(r); if (pointed) r.role = pointed; }
    const entries = rows.map((r) => {
      const university = universityIn(r.title);
      const dean = extractName(r.title);
      return {
        keys: storyKeysForEvent({ type: r.type, role: r.role, university, dean, schoolType: null }),
        date: +new Date(r.date), title: r.title, person: personKey(dean), universitySlug: slugify(university),
      };
    });
    const groups = groupStories(entries);
    const first = new Map();
    groups.forEach((g, i) => { if (!first.has(g)) first.set(g, i); });
    const kept = rows.filter((_, i) => first.get(groups[i]) === i);
    write(latestPath, JSON.stringify(kept, null, 1));
    console.log(`latest-news.json: ${rows.length} -> ${kept.length}`);
  }

  const reviewPath = resolve(ROOT_DIR, "attached_assets/news_scout_review.json");
  if (existsSync(reviewPath)) {
    const rows = JSON.parse(readFileSync(reviewPath, "utf8"));
    for (const r of rows) {
      const pointed = correctedRole(r);
      // schoolType follows the role, the way the scout's resolveType() picks it:
      // an approved row must not add a president to the provost index.
      if (pointed) { r.role = pointed; r.schoolType = pointed === "provost" ? "provost" : "university"; }
    }
    const kept = [];
    for (const r of rows) {
      const [survivor] = dedupeEvents([r], kept.map((k) => ({
        keys: storyKeysForEvent(k), date: k.date, title: k.title, university: k.university, dean: k.dean,
      }))).events;
      if (survivor && !survivor.repeatOfPrior) kept.push(r);
    }
    write(reviewPath, JSON.stringify(kept, null, 1));
    console.log(`news_scout_review.json: ${rows.length} -> ${kept.length}`);
  }
  if (dry) console.log("(dry run -- nothing written)");
}
