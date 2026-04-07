const DEAN_KEYWORDS = [
  "dean", "appointed", "named", "step down", "stepping down", "departure",
  "search committee", "interim dean", "new leader", "business school leader",
  "provost", "running its business school", "will lead", "tapped to lead",
  "chosen to lead", "next leader", "head of",
];

const HIRING_KEYWORDS = [
  "named", "appointed", "new dean", "will be the new dean", "tapped to lead",
  "chosen to lead", "next dean", "hired as dean", "running its business school",
  "will lead", "takes over as dean", "becomes dean", "selected as dean", "picked to lead",
];

const DEPARTURE_KEYWORDS = [
  "step down", "stepping down", "departure", "leaving", "resign", "retiring", "departs",
];

const SEARCH_KEYWORDS = [
  "search committee", "dean search", "looking for", "seeking", "search firm", "open position",
];

function isDeanRelated(title, summary) {
  const combined = `${title} ${summary}`.toLowerCase();
  return DEAN_KEYWORDS.some((kw) => combined.includes(kw));
}

function classifyArticle(title, summary) {
  const combined = `${title} ${summary}`.toLowerCase();
  if (HIRING_KEYWORDS.some((kw) => combined.includes(kw))) return "hiring";
  if (DEPARTURE_KEYWORDS.some((kw) => combined.includes(kw))) return "departure";
  if (SEARCH_KEYWORDS.some((kw) => combined.includes(kw))) return "search";
  return "general";
}
function extractDeanName(title, summary) {
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

const KNOWN_SCHOOLS = [
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
  { patterns: ["mcdonough", "georgetown mcdonough"], university: "Georgetown University" },
  { patterns: ["foster school", "uw foster"], university: "University of Washington" },
  { patterns: ["goizueta", "emory goizueta"], university: "Emory University" },
  { patterns: ["kelley", "indiana kelley"], university: "Indiana University" },
  { patterns: ["jones graduate", "rice jones"], university: "Rice University" },
  { patterns: ["olin business", "washu olin"], university: "Washington University in St. Louis" },
  { patterns: ["owen graduate", "vanderbilt owen"], university: "Vanderbilt University" },
  { patterns: ["scheller", "georgia tech scheller"], university: "Georgia Institute of Technology" },
  { patterns: ["carlson school", "minnesota carlson"], university: "University of Minnesota" },
  { patterns: ["mendoza", "notre dame mendoza"], university: "University of Notre Dame" },
  { patterns: ["fisher college", "ohio state fisher"], university: "Ohio State University" },
  { patterns: ["wisconsin school of business"], university: "University of Wisconsin-Madison" },
  { patterns: ["carroll school", "boston college carroll"], university: "Boston College" },
  { patterns: ["questrom", "bu questrom"], university: "Boston University" },
  { patterns: ["warrington", "florida warrington"], university: "University of Florida" },
  { patterns: ["carey school", "asu carey", "w. p. carey"], university: "Arizona State University" },
  { patterns: ["smith school", "maryland smith"], university: "University of Maryland" },
  { patterns: ["mays business", "texas a&m mays"], university: "Texas A&M University" },
  { patterns: ["terry college", "uga terry"], university: "University of Georgia" },
  { patterns: ["smeal", "penn state smeal"], university: "Penn State University" },
  { patterns: ["broad college", "msu broad"], university: "Michigan State University" },
  { patterns: ["gies", "illinois gies"], university: "University of Illinois" },
  { patterns: ["marriott school", "byu marriott"], university: "Brigham Young University" },
  { patterns: ["d'amore-mckim", "northeastern"], university: "Northeastern University" },
  { patterns: ["katz graduate", "pitt katz"], university: "University of Pittsburgh" },
  { patterns: ["tippie", "iowa tippie"], university: "University of Iowa" },
  { patterns: ["fox school", "temple fox"], university: "Temple University" },
  { patterns: ["miami herbert"], university: "University of Miami" },
  { patterns: ["babson"], university: "Babson College" },
  { patterns: ["insead"], university: "INSEAD" },
  { patterns: ["london business school", "lbs"], university: "London Business School" },
  { patterns: ["imd"], university: "IMD" },
  { patterns: ["ie business school"], university: "IE University" },
  { patterns: ["hec paris"], university: "HEC Paris" },
];
function extractSchool(title, summary) {
  const combined = `${title} ${summary}`.toLowerCase();
  for (const school of KNOWN_SCHOOLS) {
    if (school.patterns.some((p) => combined.includes(p))) {
      return school.university;
    }
  }
  return null;
}

function decodeEntities(text) {
  return text
    .replace(/&#8217;/g, "'").replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "\u2013").replace(/&#8212;/g, "\u2014")
    .replace(/&#038;/g, "&").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

async function fetchPQFeed() {
  const res = await fetch("https://poetsandquants.com/feed/");
  if (!res.ok) throw new Error(`P&Q feed returned ${res.status}`);

  const xml = await res.text();

  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const getTag = (tag) => {
      const m = itemXml.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?<\\/${tag}>`, "s"));
      return m ? m[1].trim() : "";
    };
    items.push({
      title: getTag("title"),
      link: getTag("link"),
      pubDate: getTag("pubDate"),
      description: getTag("description") || getTag("content:encoded"),
    });
  }

  const articles = [];
  for (const item of items) {
    const title = decodeEntities(item.title);
    const link = item.link;
    const summary = stripHtml(item.description).substring(0, 500);

    if (!title || !link) continue;
    if (!isDeanRelated(title, summary)) continue;

    let isoDate = "";
    try { isoDate = new Date(item.pubDate).toISOString().split("T")[0]; }
    catch (e) { isoDate = item.pubDate; }

    articles.push({
      title,
      url: link,
      date: isoDate,
      summary: summary.length > 250 ? summary.substring(0, 250) + "\u2026" : summary,
      category: classifyArticle(title, summary),
      extractedSchool: extractSchool(title, summary),
      extractedDean: extractDeanName(title, summary),
    });
  }

  return articles;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");

  try {
    const articles = await fetchPQFeed();
    res.json({
      articles,
      fetchedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (err) {
    console.error("Failed to fetch P&Q news:", err);
    res.status(502).json({ error: "Failed to fetch news feed" });
  }
};
