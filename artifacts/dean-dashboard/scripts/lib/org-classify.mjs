// The organization taxonomy -- the single place that decides what KIND of place
// an employer string names, how senior a role is, and whether a career stop is
// employment or a board seat.
//
// SYSTEM-WIDE BY DESIGN
// ---------------------
// Nothing in this module knows about a specific index. It takes org strings and
// role strings and returns sectors and seniority bands, so an index added next
// year inherits the whole taxonomy by existing -- there is no per-index rule to
// write, and no second copy to keep in sync. When the vocabulary needs to grow
// (a firm nobody has hired from before, a new school brand), it grows HERE and
// every consumer picks it up on its next run.
//
// It replaces two divergent copies of this logic: gen-employer-affinity.mjs had
// its own CATEGORY_PATTERNS, and gen-industry-experience.mjs had a fuller one.
// `affinityCategory()` maps this module's fine-grained sectors onto the coarse
// category names employer-affinity.json already publishes, so that file's shape
// and its validated numbers survive the consolidation.
//
// TWO BUGS THIS MODULE EXISTS TO NOT REPEAT
// -----------------------------------------
// 1. Word boundaries. Every pattern here is compiled through `stems`, which
//    anchors a boundary at the START of a term and leaves the END open. The
//    obvious spelling -- `/\b(universit|pricewaterhouse|technolog)\b/i` -- is
//    wrong in a way that fails silently: the trailing \b applies to every
//    branch, so a stem only matches when the next character is a non-word one.
//    "universit" never matches "University"; "technolog" never matches
//    "Technology". Terms that genuinely need a closing boundary -- bare
//    abbreviations like `mit`, `ge`, `bcg`, where an open end would swallow
//    "mitigate" or "general" -- carry an explicit \b of their own.
// 2. Gazetteer provenance. career-geo.json looks like a list of schools and is
//    not -- it is a general ORGANIZATION geocoder and contains "mckinsey &
//    company", "goldman sachs" and "boeing" alongside the alma maters. Seeding
//    an academic gazetteer from all its keys marks those firms academic.
//    `buildAcademicIndex` takes only academically-worded entries from any
//    extra name source for exactly this reason.
import { snorm, vkey, ALIAS, MERGE } from "./school-canon.mjs";

/**
 * Compile a term list into a case-insensitive alternation anchored at a word
 * START only. See note 1 above -- this is not a stylistic preference.
 */
export const stems = (terms) => new RegExp(`\\b(?:${terms.join("|")})`, "i");

// ---------------------------------------------------------------------------
// academic recognition
// ---------------------------------------------------------------------------

const ACAD_RE = stems([
  "universit", "college", "institute of technolog", "polytechnic", "school of",
  "business school", "law school", "medical school", "graduate school", "academy",
  "seminary", "conservator", "campus", "suny\\b", "cuny\\b", "community college",
  "higher education", "board of (?:regents|trustees|governors)", "insead\\b",
  "imd\\b", "caltech", "georgia tech", "virginia tech", "mit\\b",
]);
const SCHOOL_BRAND = stems([
  "gsb\\b", "stern\\b", "booth\\b", "wharton", "kellogg school", "haas\\b", "anderson school",
  "fuqua", "darden", "ross school", "sloan\\b", "tuck\\b", "johnson school", "marshall school",
  "mccombs", "kenan[- ]flagler", "owen graduate", "goizueta", "olin business", "tepper",
  "smeal", "foster school", "carlson school", "broad college", "krannert", "mendoza",
  "cox school", "jones graduate", "leavey", "argyros", "graziadio", "lerner college",
  "kogod", "questrom", "mays business", "terry college", "warrington", "eller\\b",
  "katz graduate", "simon business", "weatherhead", "freeman school", "scheller",
  "kelley school", "gies\\b", "farmer school", "lundquist", "rady school", "merage",
  "bauer college", "neeley", "jindal school", "trulaske", "isenberg", "d'amore[- ]mckim",
  "carey business", "smith school", "robins school",
  // Named without a school-word in the corpus's own prior-institution cells.
  "vanderbilt owen", "kennedy school", "the citadel", "william ?(?:&|and) ?mary",
  "institutions of higher learning", "cal ?arts", "juilliard", "pratt institute",
]);
const ACAD_ABBREV = stems([
  "uab\\b", "uah\\b", "unlv\\b", "umbc\\b", "utsa\\b", "utep\\b", "unc\\b", "ucf\\b",
  "usf\\b", "fiu\\b", "fau\\b", "vcu\\b", "vt\\b", "wvu\\b", "lsu\\b", "tcu\\b",
  "smu\\b", "byu\\b", "rpi\\b", "njit\\b", "iupui\\b", "ou\\b", "osu\\b", "psu\\b",
  "cu boulder", "cu denver", "uc [a-z]", "ut [a-z]", "um[a-z]{2,}\\b", "unsw",
  "nyu\\b", "ucla", "ucsd", "ucsf", "ucsb", "uf-ifas", "stevens institute", "cornell\\b",
]);
/**
 * Build the academic recognizer over a corpus.
 *
 * The single biggest failure mode of a pattern-only categorizer on this data is
 * informal school names: "UCLA", "Stanford GSB", "NYU Stern", "Haas UC Berkeley"
 * match no academic keyword, land in the residual bucket, and are then read as
 * companies by any for-profit-marker rule. Checking the corpus's own institution
 * spellings first removes them before a firm rule ever runs.
 *
 * @param {object} opts
 * @param {Array<{university?: string, school?: string}>} opts.records every dean row
 * @param {string[]} [opts.extraNames] additional names from a source that MAY contain
 *   non-academic organizations (career-geo.json). Only academically-worded entries
 *   are taken -- see note 2 in the module header.
 */
export function buildAcademicIndex({ records = [], extraNames = [] } = {}) {
  const ACAD = new Set();
  const add = (s) => { const k = vkey(snorm(s)); if (k && k.length > 2) ACAD.add(k); };

  for (const r of records) { add(r.university); add(r.school); }
  for (const [a, b] of Object.entries(ALIAS)) { add(a); add(b); }
  for (const [a, b] of Object.entries(MERGE)) { add(a); add(b); }
  for (const n of extraNames) if (ACAD_RE.test(n)) add(n);

  // Longest-first, for the substring pass. Short entries are excluded because a
  // 4-character name matches inside far too many unrelated strings.
  const LONG = [...ACAD].filter((k) => k.length >= 9).sort((a, b) => b.length - a.length);

  const isAcademic = (s) =>
    ACAD.has(vkey(snorm(s))) || ACAD_RE.test(s) || SCHOOL_BRAND.test(s) || ACAD_ABBREV.test(s);

  /**
   * Last-resort check: does a known institution name appear anywhere inside this
   * string? Catches informal spellings carrying a real school name plus
   * decoration -- "Haas UC Berkeley", "Wharton School, University of
   * Pennsylvania". Run only after every other rule declines: it is the most
   * expensive and the loosest.
   */
  const containsKnownSchool = (s) => {
    const n = vkey(snorm(s));
    return n.length >= 6 && LONG.some((k) => n.includes(k));
  };

  return { isAcademic, containsKnownSchool, size: ACAD.size };
}

// ---------------------------------------------------------------------------
// sector rules
// ---------------------------------------------------------------------------
// Values that are research bookkeeping rather than an employer name. These are
// real strings in the data ("Uncertain -- not Franklin Financial Corp per
// available sources") and would otherwise be read as firms on the strength of
// the word "Corp".
const NON_ORG = /^(?:unknown|n\/a|none|external|internal|private sector|private practice|industry|various|design|tbd|-+)$/i;
const BOOKKEEPING = stems([
  "uncertain", "unclear", "not confirmed", "unconfirmed", "per available sources",
  "no further bio", "same institution", "not applicable",
]);

// Government before any firm rule: "U.S. International Development Finance
// Corporation" and "Tennessee Valley Authority" are federal, not industry.
const GOVT = stems([
  "department of", "dept\\.? of", "u\\.?s\\.? (?:army|navy|air force|marine corps|coast guard|government)",
  "united states (?:army|navy|air force|marine corps|coast guard)", "federal (?:government|agency|reserve|bureau)",
  "white house", "congress", "senate", "house of representatives", "pentagon",
  "nasa\\b", "nih\\b", "cdc\\b", "darpa\\b", "fda\\b", "epa\\b", "nsf\\b", "sec\\b", "gao\\b",
  "centers for disease control", "national institutes of health", "world bank",
  "international monetary fund", "united nations", "city of", "state of",
  "commonwealth of", "county of", "ministry of", "census bureau",
  "national laborator", "sandia", "los alamos", "oak ridge", "argonne",
  "lawrence livermore", "public schools", "school district", "embassy",
  "governor's office", "attorney general", "district attorney", "highway patrol",
  "police department", "peace corps", "pcaob\\b", "regional authority",
  // A judicial clerkship or a seat on the bench is public service, not private
  // practice -- and without these the law indices file every court as a firm on
  // the strength of nothing more than the residual marker rules.
  "supreme court", "court of appeals", "district court", "circuit court",
  "federal court", "u\\.?s\\.? courts", "judiciary", "public health service",
]);
// A US-flavoured entity name ending in a corporate-sounding word is still
// federal: the DFC, the TVA, the USPS. Checked alongside GOVT.
const US_ENTITY = /(?:\bu\.?s\.?\b|\bunited states\b|\bnational\b|\bfederal\b).{0,40}\b(?:corporation|authority|administration|agency|commission|bureau|service|committee|board)\b/i;
const NONPROFIT = stems([
  "foundation", "nonprofit", "non-profit", "ngo\\b", "charitable", "philanthrop",
  "association", "society", "council", "institute for", "museum", "public library",
  "ymca\\b", "red cross", "united way", "think tank", "brookings", "rand corporation",
  "urban institute", "aspen institute", "carnegie (?:corporation|endowment)",
  "ford foundation", "gates foundation", "acls\\b", "aacsb\\b", "naacp\\b",
  "girl scouts", "boy scouts", "goodwill", "habitat for humanity", "church",
  "diocese", "archdiocese", "synagogue", "ministries", "sisters of", "congregation",
]);
// A hospital or health system is its own thing: often nonprofit, frequently
// university-affiliated, and in the nursing / medical / pharmacy indices it is
// the normal place a clinical academic works. Counting it as industry would flip
// a large share of those indices on a definition their own users would dispute,
// so it gets a distinct sector. `makeClassifier` takes a flag to change that for
// a caller whose reading of "industry" is "worked outside the university" rather
// than "worked in a company".
const HEALTH_PROVIDER = stems([
  "hospital", "health system", "healthcare system", "medical cent", "health cent",
  "clinic\\b", "clinics\\b", "infirmary", "vamc\\b", "veterans affairs",
  "adventhealth", "commonspirit", "beaumont health", "loma linda university health",
  "uconn health", "johns hopkins medicine", "mass general brigham", "baystate health",
  "partners healthcare", "atrium health", "university hospitals",
]);
// Named industries. First match wins, so specific lists precede generic ones.
// Firms are named explicitly wherever the sector word alone would be ambiguous
// in this corpus -- "bank" is safe, "capital" and "equity" are not ("capital
// campaign", "diversity, equity, and inclusion").
const INDUSTRY = [
  ["Consulting", stems([
    "mckinsey", "bain (?:&|and) (?:company|co\\b)", "boston consulting", "bcg\\b",
    "deloitte", "accenture", "booz allen", "booz ?(?:&|and) ?co", "a\\.?t\\.? kearney",
    "oliver wyman", "pwc\\b", "pricewaterhouse", "price waterhouse", "kpmg",
    "ernst ?(?:&|and) ?young", "arthur andersen", "arthur d\\.? little", "mercer\\b",
    "towers watson", "willis towers", "gartner", "forrester", "management consult",
    "strategy consult", "consultancy", "consulting (?:group|firm|services|llc|inc|partners)",
    "bentz whaley flessner", "ccs fundraising", "grenzebach glier", "marts ?(?:&|and) ?lundy",
  ])],
  ["Financial Services", stems([
    "goldman sachs", "morgan stanley", "j\\.?p\\.? ?morgan", "jpmorgan", "chase manhattan",
    "merrill lynch", "lehman", "bear stearns", "salomon brothers", "smith barney",
    "citigroup", "citibank", "credit suisse", "first boston", "ubs\\b", "barclays",
    "deutsche bank", "hsbc", "wells fargo", "bank of america", "bankers trust",
    "blackstone", "blackrock", "kkr\\b", "kohlberg kravis", "carlyle group",
    "apollo global", "bain capital", "tpg capital", "warburg pincus", "vanguard",
    "fidelity investments", "pimco", "state street", "charles schwab", "american express",
    "visa inc", "mastercard", "prudential", "metlife", "aetna", "allstate", "geico",
    "berkshire hathaway", "federal reserve bank", "private equity", "venture capital",
    "hedge fund", "investment bank", "investment management", "asset management",
    "wealth management", "bank\\b", "banking", "capital (?:partners|management|group|markets)",
    "equity (?:partners|firm)", "securities", "brokerage", "insurance (?:company|group|co\\b)",
    "actuarial", "trust company", "westpac",
  ])],
  ["Technology", stems([
    "google", "alphabet inc", "microsoft", "amazon(?:\\.com| web services)?\\b",
    "apple (?:inc|computer)", "meta\\b", "facebook", "ibm\\b", "intel\\b", "oracle\\b",
    "cisco\\b", "adobe\\b", "salesforce", "sap\\b", "tesla\\b", "spacex", "nvidia",
    "qualcomm", "broadcom", "hewlett[- ]?packard", "hp inc\\b", "dell\\b", "compaq",
    "motorola", "nokia", "ericsson", "texas instruments", "bell lab", "at&t",
    "xerox", "parc\\b", "sun microsystems", "siemens", "samsung", "lg electronics",
    "panasonic", "uber\\b", "lyft\\b", "airbnb", "netflix", "spotify", "linkedin",
    "twitter", "palantir", "stripe\\b", "paypal", "ebay", "yahoo", "aol\\b", "dynetics",
    "software", "semiconductor", "telecommunications", "information technology (?:services|consult)",
  ])],
  ["Healthcare & Pharma", stems([
    "pfizer", "merck\\b", "johnson ?(?:&|and) ?johnson", "j&j\\b", "novartis",
    "astrazeneca", "glaxosmithkline", "gsk\\b", "sanofi", "roche\\b", "bayer\\b",
    "abbvie", "abbott labor", "bristol[- ]myers", "eli lilly", "lilly and company",
    "genentech", "amgen", "biogen", "moderna", "gilead", "regeneron",
    "vertex pharmaceutical", "medtronic", "boston scientific", "stryker\\b",
    "becton dickinson", "baxter (?:international|healthcare)", "cardinal health",
    "mckesson", "cvs health", "walgreens", "unitedhealth", "humana\\b", "cigna\\b",
    "kaiser permanente", "biotech", "pharmaceutic", "life sciences (?:company|inc)",
  ])],
  ["Energy & Industrials", stems([
    "exxon", "mobil corp", "chevron", "conocophillips", "schlumberger", "halliburton",
    "baker hughes", "royal dutch", "bp (?:p\\.?l\\.?c|america)", "shell oil",
    "marathon (?:oil|petroleum)", "duke energy", "southern company", "exelon",
    "ge\\b", "general electric", "westinghouse", "boeing", "lockheed", "raytheon",
    "northrop", "general dynamics", "bae systems", "honeywell", "united technologies",
    "pratt ?(?:&|and) ?whitney", "rolls[- ]royce", "3m\\b", "caterpillar",
    "deere ?(?:&|and) ?company", "john deere", "dow chemical", "dupont", "monsanto",
    "basf", "air products", "alcoa", "us steel", "nucor", "ford motor", "general motors",
    "chrysler", "stellantis", "toyota", "honda motor", "nissan", "volkswagen",
    "daimler", "bmw group", "bechtel", "fluor corp", "jacobs engineering", "aecom",
    "briggs ?(?:&|and) ?stratton", "aerospace (?:corp|company)", "manufactur",
    "utility company",
  ])],
  ["Consumer & Retail", stems([
    "procter ?(?:&|and) ?gamble", "p&g\\b", "unilever", "colgate[- ]palmolive",
    "kimberly[- ]clark", "nestl", "pepsico", "pepsi[- ]cola", "coca[- ]cola",
    "anheuser[- ]busch", "kraft", "mondelez", "sara lee", "general mills",
    "kellogg company", "conagra", "tyson foods", "cargill", "mars, incorporated",
    "walmart", "wal[- ]mart", "target corp", "costco", "kroger", "home depot",
    "lowe's companies", "best buy", "macy's", "nordstrom", "gap inc", "nike\\b",
    "adidas", "under armour", "levi strauss", "starbucks", "mcdonald's", "yum! brands",
    "darden restaurants", "sodexo", "aramark", "compass group", "marriott",
    "hilton (?:worldwide|hotels)", "hyatt", "delta air", "united airlines",
    "american airlines", "southwest airlines", "fedex", "ups\\b", "united parcel",
  ])],
  ["Media & Entertainment", stems([
    "walt disney", "disney\\b", "warner (?:bros|media|communications)", "time warner",
    "comcast", "nbc\\b", "cbs\\b", "abc (?:news|television)", "fox (?:news|corporation)",
    "viacom", "paramount pictures", "sony (?:pictures|music)", "universal (?:studios|music)",
    "lionsgate", "blockbuster", "broadcasting (?:company|system|corp)", "new york times",
    "washington post", "wall street journal", "los angeles times", "daily press",
    "bloomberg\\b", "reuters", "associated press", "conde nast", "hearst",
    "mcgraw[- ]hill", "pearson (?:plc|education)", "houghton mifflin", "wiley\\b",
    "elsevier", "springer nature", "publishing (?:company|house|group)",
    "advertising agency", "ogilvy", "wpp\\b", "omnicom",
  ])],
  ["Law (private practice)", stems([
    "llp\\b", "law firm", "jones day", "latham ?(?:&|and) ?watkins", "skadden",
    "sidley austin", "kirkland ?(?:&|and) ?ellis", "covington ?(?:&|and) ?burling",
    "wilmerhale", "wilmer cutler", "cravath", "sullivan ?(?:&|and) ?cromwell",
    "davis polk", "debevoise", "gibson dunn", "paul weiss", "arnold ?(?:&|and) ?porter",
    "morrison ?(?:&|and) ?foerster", "baker mckenzie", "hogan lovells", "dla piper",
    "greenberg traurig", "k&l gates", "burr ?(?:&|and) ?forman", "attorneys at law",
  ])],
];

/** The industry labels this module can return, in the order rules are tried. */
export const INDUSTRY_NAMES = INDUSTRY.map(([name]) => name).concat("Other industry");

// Residual for-profit markers, applied only after every rule above has passed.
// An org that survives to here is not a school, not a government body, not a
// nonprofit, not a hospital, and carries a legal-entity or company-shaped
// suffix -- e.g. "TETRA Technologies", "Westpac Banking Corporation".
const FIRM_MARKER = /(?:^|[\s,(])(?:inc\.?|incorporated|corp\.?|corporation|company|co\.|llc|l\.l\.c\.|ltd\.?|limited|plc|gmbh|s\.a\.|a\.g\.|n\.v\.|holdings|group|partners|ventures|technologies|systems|solutions|labs|laboratories|industries|enterprises|associates|worldwide)(?:$|[\s,.)])/i;

// Trailing collection annotations, not part of the employer's name:
// "UAB (internal)", "Cleveland State University (internal promotion)",
// "University of Puerto Rico (same system)". Left in place they defeat the
// exact-match gazetteer, since snorm turns them into extra tokens.
const ANNOTATION = /\s*\((internal|external|same (system|institution|university)|internal (promotion|appointment)|interim|acting|now [^)]*|\d[^)]*)\)\s*$/i;

/**
 * Build the org -> sector classifier.
 *
 * @param {{isAcademic: Function, containsKnownSchool: Function}} academic from buildAcademicIndex
 * @param {object} [opts]
 * @param {boolean} [opts.countHealthProviderAsIndustry] treat hospitals/health systems as industry
 * @param {(org: string) => void} [opts.onUnclassified] called for every org no rule matched;
 *   this list is the recall ceiling and the worklist for extending the vocabulary above
 * @returns {(org: string) => ({sector: string, industry?: string, firm?: string}|null)}
 *   null means "not an organization name at all" (blank, placeholder, research note)
 */
export function makeClassifier(academic, { countHealthProviderAsIndustry = false, onUnclassified } = {}) {
  return function classifyOrg(raw) {
    const s = String(raw || "").trim().replace(/\s+/g, " ").replace(ANNOTATION, "").trim();
    if (!s || s.length < 2 || NON_ORG.test(s) || BOOKKEEPING.test(s)) return null;
    if (academic.isAcademic(s)) return { sector: "Academic" };
    if (GOVT.test(s) || US_ENTITY.test(s)) return { sector: "Government" };
    if (NONPROFIT.test(s)) return { sector: "Nonprofit" };
    if (HEALTH_PROVIDER.test(s)) {
      return countHealthProviderAsIndustry
        ? { sector: "Industry", industry: "Healthcare & Pharma", firm: s }
        : { sector: "Healthcare Provider" };
    }
    for (const [industry, re] of INDUSTRY) if (re.test(s)) return { sector: "Industry", industry, firm: s };
    // Substring gazetteer before the firm marker, not after: "Johns Hopkins
    // University Applied Physics Laboratory" carries "Laboratories"-shaped
    // wording and would otherwise be filed as a company.
    if (academic.containsKnownSchool(s)) return { sector: "Academic" };
    if (FIRM_MARKER.test(s)) return { sector: "Industry", industry: "Other industry", firm: s };
    onUnclassified?.(s);
    return { sector: "Unclassified" };
  };
}

// Splitting can cut through a parenthetical -- "Banking industry (Huntington,
// WV) / University System of West Virginia" separates on the slash and leaves
// the first half with an unclosed "(". Rebalancing afterwards keeps the stored
// firm string readable, since it is what a profile panel would show.
const rebalance = (x) => {
  const open = (x.match(/\(/g) || []).length;
  const close = (x.match(/\)/g) || []).length;
  if (open > close) return x + ")".repeat(open - close);
  if (close > open) return x.replace(/\)+$/, "");
  return x;
};

/**
 * Several prior-institution cells pack two employers into one string --
 * "UAB (internal); previously partner at Burr & Forman LLP", "Stevens Institute
 * / AT&T Bell Labs". Splitting recovers the buried one; without it the academic
 * half wins and the firm is lost.
 */
export const splitOrgs = (s) =>
  String(s || "")
    .split(/\s*(?:;|\s\/\s|\bpreviously\b|\bformerly\b|\bprior to that\b)\s*/i)
    .map((x) => rebalance(x.trim()).replace(/^\((.*)\)$/, "$1").trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// seniority
// ---------------------------------------------------------------------------
// The point of this field, for the connections thesis: a network is carried by
// people, and how much of one someone carries out of a firm depends almost
// entirely on how senior they were inside it. A managing director leaves with a
// rolodex; an analyst leaves with a resume line. `priorTitle` is already on every
// row across every index, so this costs no new research.
//
// Ordered most senior first -- first match wins, which matters because titles
// stack ("Senior Vice President and General Counsel").
const SENIORITY_RULES = [
  ["executive", stems([
    "chief [a-z]+ officer", "\\bceo\\b", "\\bcfo\\b", "\\bcoo\\b", "\\bcto\\b", "\\bcio\\b",
    "\\bcmo\\b", "\\bchro\\b", "chairman", "chairwoman", "\\bchair of the board",
    "president(?: and| &|,|$)", "\\bpresident\\b", "founder", "co-?founder",
    "managing director", "managing partner", "senior partner", "global head",
    "executive vice president", "\\bevp\\b", "board of directors", "board member",
    "independent director", "non-?executive director", "owner\\b", "proprietor",
  ])],
  ["senior", stems([
    "senior vice president", "\\bsvp\\b", "vice president", "\\bvp\\b", "\\bpartner\\b",
    "principal\\b", "general counsel", "head of", "division (?:head|director)",
    "executive director", "senior director", "senior counsel", "senior advisor",
    "senior adviser", "\\bdirector\\b",
  ])],
  ["professional", stems([
    "manager", "associate\\b", "analyst", "consultant\\b", "engineer\\b", "attorney",
    "counsel\\b", "scientist", "researcher", "specialist", "officer\\b", "\\bstaff\\b",
    "intern\\b", "trainee",
  ])],
];

/** Seniority bands, most senior first. "unknown" means the title said nothing usable. */
export const SENIORITY_BANDS = ["executive", "senior", "professional", "unknown"];

/**
 * Which band a role title sits in. Pass every role a person held at one employer
 * joined together -- the most senior wins, which is the right reading of a
 * career that ran analyst -> VP at the same firm.
 */
export function seniorityOf(role) {
  const s = String(role || "");
  if (!s.trim()) return "unknown";
  for (const [band, re] of SENIORITY_RULES) if (re.test(s)) return band;
  return "unknown";
}

// ---------------------------------------------------------------------------
// tie kind
// ---------------------------------------------------------------------------
// Employment is not the only way someone carries a corporate network, and for
// the connections thesis it is not even the strongest: a SITTING board seat is a
// current, direct, named relationship, where a job someone left in 1998 is a
// decayed one. An earlier cut of this taxonomy folded board and advisory service
// in with employment and then excluded all three -- correct for answering "did
// this person work in industry", wrong for answering "can this person open a
// door". They are separated here so a consumer can weigh them differently.
const BOARD = stems([
  "board of directors", "board member", "corporate board", "independent director",
  "non-?executive director", "board of trustees of [a-z]", "serves on the board",
  "director of the board", "board seat", "\\bchair of the board",
]);
const ADVISORY = stems([
  "advisory board", "advisory council", "advisory committee", "\\badvisor\\b",
  "\\badviser\\b", "consultant to", "strategic advisor",
]);

/** "board" | "advisory" | "employment" for a role string. */
export function tieKindOf(role) {
  const s = String(role || "");
  if (BOARD.test(s)) return "board";
  if (ADVISORY.test(s)) return "advisory";
  return "employment";
}

// ---------------------------------------------------------------------------
// employer-affinity compatibility
// ---------------------------------------------------------------------------
// employer-affinity.json publishes coarse category names that reached the client
// (they are rendered as "<category> background" in Scout Assistant) and that its
// recorded leave-one-out validation numbers were computed over. Consolidating on
// this module's finer sectors must not silently rename them, so the fine ->
// coarse mapping is explicit and additive: the fine taxonomy can grow without
// changing what that file publishes.
const AFFINITY_BY_INDUSTRY = {
  "Consulting": "Finance & Consulting",
  "Financial Services": "Finance & Consulting",
  "Technology": "Technology",
  "Healthcare & Pharma": "Healthcare & Biotech",
  "Energy & Industrials": "Industry & Manufacturing",
  "Consumer & Retail": "Industry & Manufacturing",
  "Media & Entertainment": "Media & Entertainment",
  "Law (private practice)": "Law",
  "Other industry": "Other",
};
const AFFINITY_BY_SECTOR = {
  "Academic": "Academic",
  "Government": "Government & Public Sector",
  "Nonprofit": "Nonprofit & Foundation",
  "Healthcare Provider": "Healthcare & Biotech",
  "Unclassified": "Other",
};

/**
 * A classification -> the coarse category name employer-affinity.json publishes.
 * Returns null for a non-org, so callers can skip it the way they always have.
 */
export function affinityCategory(cls) {
  if (!cls) return null;
  if (cls.sector === "Industry") return AFFINITY_BY_INDUSTRY[cls.industry] || "Other";
  return AFFINITY_BY_SECTOR[cls.sector] || "Other";
}
