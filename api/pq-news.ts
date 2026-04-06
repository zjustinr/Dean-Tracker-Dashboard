import type { VercelRequest, VercelResponse } from "@vercel/node";

interface PQArticle {
  title: string;
  url: string;
  date: string;
  summary: string;
  category: "hiring" | "departure" | "search" | "general";
  extractedSchool: string | null;
  extractedDean: string | null;
}

interface CacheEntry {
  articles: PQArticle[];
  fetchedAt: number;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
let lastRefreshAt = 0;

const DEAN_KEYWORDS = ["dean","appointed","named","step down","stepping down","departure","search committee","interim dean","new leader","business school leader","provost","running its business school","will lead","tapped to lead","chosen to lead","next leader","head of"];
const HIRING_KEYWORDS = ["named","appointed","new dean","will be the new dean","tapped to lead","chosen to lead","next dean","hired as dean","running its business school","will lead","takes over as dean","becomes dean","selected as dean","picked to lead"];
const DEPARTURE_KEYWORDS = ["step down","stepping down","departure","leaving","resign","retiring","departs"];
const SEARCH_KEYWORDS = ["search committee","dean search","looking for","seeking","search firm","open position"];

const KNOWN_SCHOOLS: Array<{ patterns: string[]; university: string }> = [
  { patterns: ["wharton"], university: "University of Pennsylvania" },
  { patterns: ["harvard business", "hbs"], university: "Harvard University" },
  { patterns: ["booth", "chicago booth"], university: "University of Chicago" },
  { patterns: ["kellogg"], university: "Northwestern University" },
  { patterns: ["mit sloan", "sloan school"], university: "MIT" },
  { patterns: ["stanford gsb", "stanford graduate school of business", "stanford business"], university: "Stanford University" },
  { patterns: ["columbia business"], university: "Columbia University" },
  { patterns: ["ross school", "michigan ross"], university: "University of Michigan" },
  { patterns: ["haas", "berkeley haas"], university: "UC Berkeley" },
  { patterns: ["yale school of management", "yale som"], university: "Yale University" },
  { patterns: ["stern", "nyu stern"], university: "NYU" },
  { patterns: ["fuqua", "duke fuqua"], university: "Duke University" },
  { patterns: ["darden", "uva darden"], university: "University of Virginia" },
  { patterns: ["anderson school", "ucla anderson"], university: "UCLA" },
  { patterns: ["johnson graduate", "cornell johnson"], university: "Cornell University" },
  { patterns: ["tuck", "dartmouth tuck"], university: "Dartmouth College" },
  { patterns: ["marshall", "usc marshall"], university: "University of Southern California" },
  { patterns: ["tepper", "cmu tepper"], university: "Carnegie Mellon University" },
  { patterns: ["mccombs", "ut mccombs"], university: "University of Texas at Austin" },
  { patterns: ["kenan-flagler", "unc kenan"], university: "University of North Carolina" },
  { patterns: ["questrom", "bu questrom"], university: "Boston University" },
];

function isDeanRelated(title: string, summary: string): boolean {
  const combined = `${title} ${summary}`.toLowerCase();
  return DEAN_KEYWORDS.some((kw) => combined.includes(kw));
}

function classifyArticle(title: string, summary: string): PQArticle["category"] {
  const combined = `${title} ${summary}`.toLowerCase();
  if (HIRING_KEYWORDS.some((kw) => combined.includes(kw))) return "hiring";
  if (DEPARTURE_KEYWORDS.some((kw) => combined.includes(kw))) return "departure";
  if (SEARCH_KEYWORDS.some((kw) => combined.includes(kw))) return "search";
  return "general";
}

function extractSchool(title: string, summary: string): string | null {
  const combined = `${title} ${summary}`.toLowerCase();
  for (const school of KNOWN_SCHOOLS) {
    if (school.patterns.some((p) => combined.includes(p))) return school.university;
  }
  return null;
}

function extractDeanName(title: string, summary: string): string | null {
  const combined = `${title} ${summary}`;
  const patterns = [
    /has named\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:as|the new|dean)/i,
    /(?:named|appointed|tapped|chosen|selected|picked)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:as|to be|the new|dean)/i,
    /([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:will be the new dean|named dean|appointed dean|becomes dean|takes over as dean)/i,
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      const skipWords = ["the","a","an","its","their","new","dean","school","college"];
      if (!skipWords.includes(name.toLowerCase().split(" ")[0])) return name;
    }
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2013/g, "\u2013")
    .replace(/\u2014/g, "\u2014")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

async function fetchPQFeed(): Promise<PQArticle[]> {
  const res = await fetch("https://poetsandquants.com/feed/");
  if (!res.ok) throw new Error(`P&Q feed returned ${res.status}`);
  const xml = await res.text();
  const { XMLParser } = await import("fast-xml-parser");
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: true });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  if (!Array.isArray(items)) return [];
  const articles: PQArticle[] = [];
  for (const item of items) {
    const title = typeof item.title === "string" ? decodeEntities(item.title.trim()) : "";
    const link = typeof item.link === "string" ? item.link.trim() : "";
    const pubDate = typeof item.pubDate === "string" ? item.pubDate.trim() : "";
    let summary = "";
    const desc = item.description || item["content:encoded"] || "";
    if (typeof desc === "string") summary = stripHtml(desc).substring(0, 500);
    if (!title || !link) continue;
    if (isDeanRelated(title, summary)) {
      let isoDate = "";
      try { isoDate = new Date(pubDate).toISOString().split("T")[0]; } catch { isoDate = pubDate; }
      const category = classifyArticle(title, summary);
      const school = extractSchool(title, summary);
      const dean = extractDeanName(title, summary);
      articles.push({ title, url: link, date: isoDate, summary: summary.length > 250 ? summary.substring(0, 250) + "..." : summary, category, extractedSchool: school, extractedDean: dean });
    }
  }
  return articles;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const refresh = req.query.refresh === "true";
  try {
    const now = Date.now();
    if (!refresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      return res.json({ articles: cache.articles, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true });
    }
    if (refresh && now - lastRefreshAt < REFRESH_COOLDOWN_MS && cache) {
      return res.json({ articles: cache.articles, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true, cooldown: Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefreshAt)) / 1000) });
    }
    const articles = await fetchPQFeed();
    if (refresh) lastRefreshAt = now;
    cache = { articles, fetchedAt: now };
    return res.json({ articles, fetchedAt: new Date(now).toISOString(), cached: false });
  } catch (err) {
    if (cache) return res.json({ articles: cache.articles, fetchedAt: new Date(cache.fetchedAt).toISOString(), cached: true, stale: true });
    return res.status(502).json({ error: "Failed to fetch news feed" });
  }
}
