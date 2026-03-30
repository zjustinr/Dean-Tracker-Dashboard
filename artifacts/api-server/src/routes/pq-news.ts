import { Router, type IRouter } from "express";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../lib/logger";

const router: IRouter = Router();

interface PQArticle {
  title: string;
  url: string;
  date: string;
  summary: string;
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

function isDeanRelated(title: string, summary: string): boolean {
  const combined = `${title} ${summary}`.toLowerCase();
  return DEAN_KEYWORDS.some((kw) => combined.includes(kw));
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
      summary = stripHtml(desc).substring(0, 300);
    }

    if (!title || !link) continue;

    if (isDeanRelated(title, summary)) {
      let isoDate = "";
      try {
        isoDate = new Date(pubDate).toISOString().split("T")[0];
      } catch {
        isoDate = pubDate;
      }

      articles.push({
        title,
        url: link,
        date: isoDate,
        summary: summary.length > 250 ? summary.substring(0, 250) + "…" : summary,
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
      const waitSec = Math.ceil((REFRESH_COOLDOWN_MS - (now - lastRefreshAt)) / 1000);
      if (cache) {
        res.json({
          articles: cache.articles,
          fetchedAt: new Date(cache.fetchedAt).toISOString(),
          cached: true,
          cooldown: waitSec,
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
