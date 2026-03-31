import { Router, type IRouter } from "express";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

const DEAN_KEYWORDS = [
  "dean",
  "appointed",
  "named",
  "step down",
  "stepping down",
  "departure",
  "search committee",
  "interim dean",
  "new leader",
  "business school leader",
  "provost",
  "running its business school",
  "will lead",
  "tapped to lead",
  "chosen to lead",
  "next leader",
  "head of",
];

const HIRING_KEYWORDS = [
  "named",
  "appointed",
  "new dean",
  "will be the new dean",
  "tapped to lead",
  "chosen to lead",
  "next dean",
  "hired as dean",
  "running its business school",
  "will lead",
  "takes over as dean",
  "becomes dean",
  "selected as dean",
  "picked to lead",
];

const DEPARTURE_KEYWORDS = [
  "step down",
  "stepping down",
  "departure",
  "leaving",
  "resign",
  "retiring",
  "departs",
];

const SEARCH_KEYWORDS = [
  "search committee",
  "dean search",
  "looking for",
  "seeking",
  "search firm",
  "open position",
];

const KNOWN_SCHOOLS: Array<{
  patterns: string[];
  university: string;
  school: string | null;
  lat: number;
  lng: number;
}> = [
  { patterns: ["wharton"], university: "University of Pennsylvania", school: "Wharton School", lat: 39.9522, lng: -75.1932 },
  { patterns: ["harvard business", "hbs"], university: "Harvard University", school: "Harvard Business School", lat: 42.3656, lng: -71.1228 },
  { patterns: ["booth", "chicago booth"], university: "University of Chicago", school: "Booth School of Business", lat: 41.7886, lng: -87.5987 },
  { patterns: ["kellogg"], university: "Northwestern University", school: "Kellogg School of Management", lat: 42.0565, lng: -87.6753 },
  { patterns: ["mit sloan", "sloan school"], university: "MIT", school: "Sloan School of Management", lat: 42.3601, lng: -71.0942 },
  { patterns: ["stanford gsb", "stanford graduate school of business", "stanford business"], university: "Stanford University", school: "Graduate School of Business", lat: 37.4275, lng: -122.1697 },
  { patterns: ["columbia business"], university: "Columbia University", school: "Columbia Business School", lat: 40.8075, lng: -73.9626 },
  { patterns: ["ross school", "michigan ross"], university: "University of Michigan", school: "Ross School of Business", lat: 42.2732, lng: -83.7384 },
  { patterns: ["haas", "berkeley haas"], university: "UC Berkeley", school: "Haas School of Business", lat: 37.8719, lng: -122.2585 },
  { patterns: ["yale school of management", "yale som"], university: "Yale University", school: "Yale School of Management", lat: 41.3115, lng: -72.9260 },
  { patterns: ["stern", "nyu stern"], university: "NYU", school: "Stern School of Business", lat: 40.7295, lng: -73.9965 },
  { patterns: ["fuqua", "duke fuqua"], university: "Duke University", school: "Fuqua School of Business", lat: 36.0014, lng: -78.9382 },
  { patterns: ["darden", "uva darden"], university: "University of Virginia", school: "Darden School of Business", lat: 38.0336, lng: -78.5080 },
  { patterns: ["anderson school", "ucla anderson"], university: "UCLA", school: "Anderson School of Management", lat: 34.0736, lng: -118.4420 },
  { patterns: ["johnson graduate", "cornell johnson"], university: "Cornell University", school: "Johnson Graduate School of Management", lat: 42.4440, lng: -76.4749 },
  { patterns: ["tuck", "dartmouth tuck"], university: "Dartmouth College", school: "Tuck School of Business", lat: 43.7044, lng: -72.2887 },
  { patterns: ["marshall", "usc marshall"], university: "University of Southern California", school: "Marshall School of Business", lat: 34.0195, lng: -118.2863 },
  { patterns: ["tepper", "cmu tepper"], university: "Carnegie Mellon University", school: "Tepper School of Business", lat: 40.4406, lng: -79.9959 },
  { patterns: ["mccombs", "ut mccombs"], university: "University of Texas at Austin", school: "McCombs School of Business", lat: 30.2849, lng: -97.7341 },
  { patterns: ["kenan-flagler", "unc kenan"], university: "University of North Carolina", school: "Kenan-Flagler Business School", lat: 35.9049, lng: -79.0469 },
  { patterns: ["mcdonough", "georgetown mcdonough"], university: "Georgetown University", school: "McDonough School of Business", lat: 38.9076, lng: -77.0723 },
  { patterns: ["foster school", "uw foster"], university: "University of Washington", school: "Foster School of Business", lat: 47.6553, lng: -122.3035 },
  { patterns: ["goizueta", "emory goizueta"], university: "Emory University", school: "Goizueta Business School", lat: 33.7927, lng: -84.3233 },
  { patterns: ["kelley", "indiana kelley"], university: "Indiana University", school: "Kelley School of Business", lat: 39.1682, lng: -86.5232 },
  { patterns: ["jones graduate", "rice jones"], university: "Rice University", school: "Jones Graduate School of Business", lat: 29.7174, lng: -95.4018 },
  { patterns: ["olin business", "washu olin"], university: "Washington University in St. Louis", school: "Olin Business School", lat: 38.6488, lng: -90.3108 },
  { patterns: ["owen graduate", "vanderbilt owen"], university: "Vanderbilt University", school: "Owen Graduate School of Management", lat: 36.1446, lng: -86.8032 },
  { patterns: ["scheller", "georgia tech scheller"], university: "Georgia Institute of Technology", school: "Scheller College of Business", lat: 33.7756, lng: -84.3963 },
  { patterns: ["carlson school", "minnesota carlson"], university: "University of Minnesota", school: "Carlson School of Management", lat: 44.9740, lng: -93.2277 },
  { patterns: ["mendoza", "notre dame mendoza"], university: "University of Notre Dame", school: "Mendoza College of Business", lat: 41.7030, lng: -86.2388 },
  { patterns: ["fisher college", "ohio state fisher"], university: "Ohio State University", school: "Fisher College of Business", lat: 40.0013, lng: -83.0156 },
  { patterns: ["wisconsin school of business"], university: "University of Wisconsin-Madison", school: "Wisconsin School of Business", lat: 43.0731, lng: -89.4012 },
  { patterns: ["carroll school", "boston college carroll"], university: "Boston College", school: "Carroll School of Management", lat: 42.3355, lng: -71.1685 },
  { patterns: ["questrom", "bu questrom"], university: "Boston University", school: "Questrom School of Business", lat: 42.3496, lng: -71.1003 },
  { patterns: ["warrington", "florida warrington"], university: "University of Florida", school: "Warrington College of Business", lat: 29.6516, lng: -82.3248 },
  { patterns: ["carey school", "asu carey", "w. p. carey"], university: "Arizona State University", school: "W. P. Carey School of Business", lat: 33.4484, lng: -111.9260 },
  { patterns: ["smith school", "maryland smith"], university: "University of Maryland", school: "Robert H. Smith School of Business", lat: 38.9869, lng: -76.9426 },
  { patterns: ["mays business", "texas a&m mays"], university: "Texas A&M University", school: "Mays Business School", lat: 30.6187, lng: -96.3365 },
  { patterns: ["terry college", "uga terry"], university: "University of Georgia", school: "Terry College of Business", lat: 33.9519, lng: -83.3763 },
  { patterns: ["smeal", "penn state smeal"], university: "Penn State University", school: "Smeal College of Business", lat: 40.7982, lng: -77.8599 },
  { patterns: ["broad college", "msu broad"], university: "Michigan State University", school: "Broad College of Business", lat: 42.7325, lng: -84.4822 },
  { patterns: ["gies", "illinois gies"], university: "University of Illinois", school: "Gies College of Business", lat: 40.1164, lng: -88.2434 },
  { patterns: ["marriott school", "byu marriott"], university: "Brigham Young University", school: "Marriott School of Business", lat: 40.2519, lng: -111.6493 },
  { patterns: ["d'amore-mckim", "northeastern"], university: "Northeastern University", school: "D'Amore-McKim School of Business", lat: 42.3398, lng: -71.0892 },
  { patterns: ["katz graduate", "pitt katz"], university: "University of Pittsburgh", school: "Katz Graduate School of Business", lat: 40.4406, lng: -79.9559 },
  { patterns: ["tippie", "iowa tippie"], university: "University of Iowa", school: "Tippie College of Business", lat: 41.6611, lng: -91.5302 },
  { patterns: ["fox school", "temple fox"], university: "Temple University", school: "Fox School of Business", lat: 39.9812, lng: -75.1553 },
  { patterns: ["miami herbert"], university: "University of Miami", school: "Miami Herbert Business School", lat: 25.7215, lng: -80.2784 },
  { patterns: ["babson"], university: "Babson College", school: "F.W. Olin Graduate School of Business", lat: 42.2988, lng: -71.2648 },
  { patterns: ["insead"], university: "INSEAD", school: null, lat: 48.4065, lng: 2.6985 },
  { patterns: ["london business school", "lbs"], university: "London Business School", school: null, lat: 51.5266, lng: -0.1622 },
  { patterns: ["imd"], university: "IMD", school: null, lat: 46.5197, lng: 6.6323 },
  { patterns: ["ie business school"], university: "IE University", school: "IE Business School", lat: 40.4168, lng: -3.7038 },
  { patterns: ["hec paris"], university: "HEC Paris", school: null, lat: 48.7556, lng: 2.1679 },
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

function extractSchool(title: string, summary: string): typeof KNOWN_SCHOOLS[number] | null {
  const combined = `${title} ${summary}`.toLowerCase();
  for (const school of KNOWN_SCHOOLS) {
    if (school.patterns.some((p) => combined.includes(p))) {
      return school;
    }
  }
  return null;
}

function extractDeanName(title: string, summary: string): string | null {
  const combined = `${title} ${summary}`;
  const patterns = [
    /has named\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:as|the new|dean)/i,
    /(?:named|appointed|tapped|chosen|selected|picked)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:as|to be|the new|dean)/i,
    /([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)\s+(?:will be the new dean|named dean|appointed dean|becomes dean|takes over as dean)/i,
    /new dean[^.]{0,30}(?:is|will be)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-z]+)/i,
  ];
  for (const pattern of patterns) {
    const match = combined.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      const skipWords = ["the", "a", "an", "its", "their", "new", "dean", "school", "college"];
      if (!skipWords.includes(name.toLowerCase().split(" ")[0])) {
        return name;
      }
    }
  }
  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

async function fetchPQFeed(): Promise<PQArticle[]> {
  const res = await fetch("https://poetsandquants.com/feed/");
  if (!res.ok) {
    throw new Error(`P&Q feed returned ${res.status}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: true,
  });
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item;
  if (!Array.isArray(items)) {
    logger.warn("No items found in P&Q RSS feed");
    return [];
  }

  const articles: PQArticle[] = [];

  for (const item of items) {
    const title = typeof item.title === "string" ? decodeEntities(item.title.trim()) : "";
    const link = typeof item.link === "string" ? item.link.trim() : "";
    const pubDate = typeof item.pubDate === "string" ? item.pubDate.trim() : "";

    let summary = "";
    const desc = item.description || item["content:encoded"] || "";
    if (typeof desc === "string") {
      summary = stripHtml(desc).substring(0, 500);
    }

    if (!title || !link) continue;

    if (isDeanRelated(title, summary)) {
      let isoDate = "";
      try {
        isoDate = new Date(pubDate).toISOString().split("T")[0];
      } catch {
        isoDate = pubDate;
      }

      const category = classifyArticle(title, summary);
      const school = extractSchool(title, summary);
      const dean = extractDeanName(title, summary);

      articles.push({
        title,
        url: link,
        date: isoDate,
        summary: summary.length > 250 ? summary.substring(0, 250) + "…" : summary,
        category,
        extractedSchool: school ? school.university : null,
        extractedDean: dean,
      });
    }
  }

  return articles;
}

router.get("/pq-news", async (_req, res) => {
  try {
    const now = Date.now();

    if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
      logger.info({ cached: true, count: cache.articles.length }, "Serving cached P&Q news");
      res.json({
        articles: cache.articles,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        cached: true,
      });
      return;
    }

    logger.info("Fetching fresh P&Q RSS feed");
    const articles = await fetchPQFeed();

    cache = { articles, fetchedAt: now };

    res.json({
      articles,
      fetchedAt: new Date(now).toISOString(),
      cached: false,
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch P&Q news");
    if (cache) {
      res.json({
        articles: cache.articles,
        fetchedAt: new Date(cache.fetchedAt).toISOString(),
        cached: true,
        stale: true,
      });
      return;
    }
    res.status(502).json({ error: "Failed to fetch news feed" });
  }
});

router.get("/pq-news/refresh", async (_req, res) => {
  try {
    const now = Date.now();
    if (now - lastRefreshAt < REFRESH_COOLDOWN_MS) {
      if (cache) {
        res.json({
          articles: cache.articles,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          cached: true,
          cooldown: Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefreshAt)) / 1000),
        });
        return;
      }
    }

    logger.info("Force-refreshing P&Q RSS feed");
    const articles = await fetchPQFeed();
    lastRefreshAt = now;
    cache = { articles, fetchedAt: now };

    res.json({
      articles,
      fetchedAt: new Date(now).toISOString(),
      cached: false,
    });
  } catch (err) {
    logger.error({ err }, "Failed to refresh P&Q news");
    res.status(502).json({ error: "Failed to fetch news feed" });
  }
});

export default router;
