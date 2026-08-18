// Industry-experience derivation pass.
//
//   node scripts/gen-industry-experience.mjs                       # write src/data/industry-experience.json
//   node scripts/gen-industry-experience.mjs --report              # print the coverage report only
//   node scripts/gen-industry-experience.mjs --dump-unclassified   # list orgs no rule matched
//
// `--dump-unclassified` is the tuning loop: every org in that list is one the
// pass could not call either way, so it is both the recall ceiling and the
// worklist for extending the gazetteers below.
//
// WHY THIS EXISTS
// ---------------
// `hasIndustryExp` is already a field on every dean record and already drives a
// badge in DeanProfile/DeanTimeline, a KPI in CompareSchools, and a boolean
// filter in Correlation Analysis. It is also, in 17 of the 21 indices, wholly
// unpopulated: build-publichealth.mjs and news-lib.mjs hardcode `false`, and the
// committed JSONs for the admin / nursing / medical / university / law waves
// carry zero `true` values even on rows whose priorInstitution plainly names a
// company. A boolean cannot say "nobody asked" -- so today's `false` reads as a
// researched No when it is really an unfilled cell, and every percentage built
// on top of it (CompareSchools' industryExpPct, the correlation cross-tabs)
// silently understates.
//
// This pass derives what the corpus can actually support, and -- critically --
// keeps "no industry found" separate from "no evidence to look at". It never
// writes back into the dean JSONs; it emits a sidecar keyed the same way
// leader-research.json and dean-photos.json are (`"<name lower>|<university
// lower>"`), so it can be regenerated, diffed, and thrown away without touching
// the datasets.
//
// WHAT IT READS
// -------------
//   priorInstitution + priorTitle   every index, ~12.9k of 29.6k rows
//   leader-research.json .career    ~2.3k people, ~8.2k dated career stops
//   careerBackground                free-text label, occasionally "Industry"
//   hasConsultingBg                 existing boolean, business/engineering only
//
// It deliberately does NOT mine `notes` or research `summary` prose. That was
// measured: a phrase-level regex over all 14.6k people with free text returned
// 125 hits, and hand-checking those showed real false positives ("the KPMG
// Academic Research Panel", "Walton's Walmart-anchored strength in retail") --
// prose mentions a firm for many reasons other than employment. Low yield at
// visibly poor precision is not worth the maintenance.
//
// THE ORG->SECTOR CALL
// --------------------
// Same pragmatic keyword approach as gen-employer-affinity.mjs's categorizer,
// with one important addition: an academic gazetteer built from the corpus's own
// institution names. That matters because the single biggest failure mode of a
// pattern-only categorizer here is informal school names -- "UCLA", "Stanford
// GSB", "NYU Stern", "Haas UC Berkeley" match no academic keyword and would land
// in the residual bucket, where a for-profit-marker rule would then read them as
// firms. Of the 1,611 priorInstitution values that gen-employer-affinity.mjs
// files as "Other", most are exactly that. Checking the corpus's own ~2.4k
// institution spellings (plus school-canon's ALIAS/MERGE maps, and the
// academically-worded slice of career-geo.json) first removes them before any
// firm rule runs.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { snorm, vkey, ALIAS, MERGE } from "./lib/school-canon.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const OUT = join(SRC, "industry-experience.json");
const REPORT_ONLY = process.argv.includes("--report");
const DUMP_UNCLASSIFIED = process.argv.includes("--dump-unclassified");
const UNCLASSIFIED = new Map(); // org -> times seen, for --dump-unclassified

const read = (f) => { try { return JSON.parse(readFileSync(join(SRC, f), "utf8")); } catch { return null; } };
const nkey = (s) => String(s || "").trim().toLowerCase();
const ekey = (name, uni) => `${nkey(name)}|${nkey(uni)}`;

// ---------------------------------------------------------------------------
// academic gazetteer
// ---------------------------------------------------------------------------
// Every institution the corpus knows about, under every spelling it uses, keyed
// through school-canon so "University of California, Berkeley" and "University
// of California Berkeley" collapse to one entry. Anything in here is Academic,
// full stop, no matter what company-like words its name contains.
const ACAD = new Set();
const addAcad = (s) => { const k = vkey(snorm(s)); if (k && k.length > 2) ACAD.add(k); };

const deanFiles = readdirSync(SRC).filter((f) => /^(r1-.*-deans|deans)\.json$/.test(f)).sort();
const ROWS = {};
for (const f of deanFiles) {
  ROWS[f] = read(f) || [];
  for (const r of ROWS[f]) { addAcad(r.university); addAcad(r.school); }
}
for (const [a, b] of Object.entries(ALIAS)) { addAcad(a); addAcad(b); }
for (const [a, b] of Object.entries(MERGE)) { addAcad(a); addAcad(b); }
// career-geo.json is a general organization geocoder, NOT a list of schools: it
// carries "mckinsey & company", "goldman sachs", "boeing" and "bell labs"
// alongside the alma maters, because it also geocodes non-academic career stops.
// Seeding the gazetteer from all 2,365 of its keys marked those firms Academic
// and made "McKinsey & Company" read as a school. Only its academically-worded
// entries are trustworthy here, and they are added after ACAD_RE is defined.

// Every pattern in this file is compiled through `stems`, which anchors a word
// boundary at the START of each term and deliberately leaves the END open.
//
// The obvious spelling -- `/\b(universit|pricewaterhouse|semiconductor)\b/i` --
// is wrong in a way that fails silently: the trailing \b applies to every
// branch, so a stem only matches when the next character is a non-word one.
// "universit" never matches "University", "pricewaterhouse" never matches
// "PricewaterhouseCoopers", "semiconductor" never matches "semiconductors".
// This file's first draft was written that way, which is why plain
// "<X> University" strings were landing in the residual bucket.
// gen-employer-affinity.mjs's categorizer has the same shape; most of its terms
// are complete words and unaffected, but `technolog` and `philanthrop` are stems
// and do misfire there today. Terms that genuinely need a closing boundary -- bare
// abbreviations like `mit`, `ge`, `bcg`, where an open end would match "mitigate"
// or "general" -- carry an explicit \b of their own.
const stems = (terms) => new RegExp(`\\b(?:${terms.join("|")})`, "i");

// Generic academic wording, for institutions outside the corpus (foreign
// universities, community colleges, a leader's undergraduate college).
const ACAD_RE = stems([
  "universit", "college", "institute of technolog", "polytechnic", "school of",
  "business school", "law school", "medical school", "graduate school", "academy",
  "seminary", "conservator", "campus", "suny\\b", "cuny\\b", "community college",
  "higher education", "board of (?:regents|trustees|governors)", "insead\\b",
  "imd\\b", "caltech", "georgia tech", "virginia tech", "mit\\b",
]);

// Now that the academic-wording test exists, fold in the schools career-geo does
// know about (foreign universities and small colleges the dean indices never
// name as an employer), and rebuild the substring list over the combined set.
for (const k of Object.keys(read("career-geo.json") || {})) if (ACAD_RE.test(k)) addAcad(k);
// Longest-first, for the substring pass in containsKnownSchool. Short entries are
// excluded because a 4-character name matches inside far too many unrelated strings.
const ACAD_LONG = [...ACAD].filter((k) => k.length >= 9).sort((a, b) => b.length - a.length);

// Business-, law- and engineering-school brand names. In this corpus these are
// never anything but a school: "Stanford GSB", "UCLA Anderson", "Vanderbilt
// Owen", "UNC Kenan-Flagler" carry no academic keyword at all, and several
// ("Anderson", "Owen", "Johnson", "Marshall") read as surnames or companies to
// any generic rule.
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

// Bare abbreviations for institutions the corpus refers to informally. These
// carry no academic keyword and are too short for the substring gazetteer, so
// they need naming outright. school-canon's ALIAS map covers the ones that show
// up in degree free text; these are the extras seen in priorInstitution.
const ACAD_ABBREV = stems([
  "uab\\b", "uah\\b", "unlv\\b", "umbc\\b", "utsa\\b", "utep\\b", "unc\\b", "ucf\\b",
  "usf\\b", "fiu\\b", "fau\\b", "vcu\\b", "vt\\b", "wvu\\b", "lsu\\b", "tcu\\b",
  "smu\\b", "byu\\b", "rpi\\b", "njit\\b", "iupui\\b", "ou\\b", "osu\\b", "psu\\b",
  "cu boulder", "cu denver", "uc [a-z]", "ut [a-z]", "um[a-z]{2,}\\b", "unsw",
  "nyu\\b", "ucla", "ucsd", "ucsf", "ucsb", "uf-ifas", "stevens institute", "cornell\\b",
]);

function isAcademic(s) {
  if (ACAD.has(vkey(snorm(s)))) return true;
  return ACAD_RE.test(s) || SCHOOL_BRAND.test(s) || ACAD_ABBREV.test(s);
}

/**
 * Last-resort academic check: does a known institution name appear anywhere
 * inside this string? Catches the informal spellings that carry a real school
 * name plus decoration -- "Haas UC Berkeley", "Cornell University Johnson
 * School", "Wharton School, University of Pennsylvania". Run only after every
 * other rule has declined, because it is the most expensive and the loosest.
 */
function containsKnownSchool(s) {
  const n = vkey(snorm(s));
  if (n.length < 6) return false;
  return ACAD_LONG.some((k) => n.includes(k));
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
const US_ENTITY = /(?:\bu\.?s\.?\b|\bunited states\b|\bnational\b|\bfederal\b).{0,40}\b(?:corporation|authority|administration|agency|commission|bureau|service|committee|board)\b/i;
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
// the normal place a clinical academic works. Counting it as "industry" would
// flip a large share of those indices on a definition their own users would
// dispute, so it gets a distinct sector and does NOT set the boolean. Flip
// COUNT_HEALTH_PROVIDER_AS_INDUSTRY if the intended reading of "industry
// experience" is "worked outside the university", not "worked in a company".
const HEALTH_PROVIDER = stems([
  "hospital", "health system", "healthcare system", "medical cent", "health cent",
  "clinic\\b", "clinics\\b", "infirmary", "vamc\\b", "veterans affairs",
  "adventhealth", "commonspirit", "beaumont health", "loma linda university health",
  "uconn health", "johns hopkins medicine", "mass general brigham", "baystate health",
  "partners healthcare", "atrium health", "university hospitals",
]);
const COUNT_HEALTH_PROVIDER_AS_INDUSTRY = false;

// Named industries. First match wins, so the specific lists precede the generic
// ones. Firms are named explicitly wherever the sector word alone would be
// ambiguous in this corpus -- "bank" is safe, "capital" and "equity" are not
// ("capital campaign", "diversity, equity, and inclusion"), the same trap
// gen-employer-affinity.mjs documents.
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

/** One org string -> { sector, industry?, firm? }, or null if it isn't an org. */
function classifyOrg(raw) {
  const s = String(raw || "").trim().replace(/\s+/g, " ").replace(ANNOTATION, "").trim();
  if (!s || s.length < 2 || NON_ORG.test(s) || BOOKKEEPING.test(s)) return null;
  if (isAcademic(s)) return { sector: "Academic" };
  if (GOVT.test(s)) return { sector: "Government" };
  if (NONPROFIT.test(s)) return { sector: "Nonprofit" };
  if (HEALTH_PROVIDER.test(s)) {
    return COUNT_HEALTH_PROVIDER_AS_INDUSTRY
      ? { sector: "Industry", industry: "Healthcare & Pharma", firm: s }
      : { sector: "Healthcare Provider" };
  }
  for (const [industry, re] of INDUSTRY) if (re.test(s)) return { sector: "Industry", industry, firm: s };
  // Substring gazetteer before the firm marker, not after: "Johns Hopkins
  // University Applied Physics Laboratory" carries "Laboratories"-shaped
  // wording and would otherwise be filed as a company.
  if (containsKnownSchool(s)) return { sector: "Academic" };
  if (FIRM_MARKER.test(s)) return { sector: "Industry", industry: "Other industry", firm: s };
  UNCLASSIFIED.set(s, (UNCLASSIFIED.get(s) || 0) + 1);
  return { sector: "Unclassified" };
}

// Several priorInstitution cells pack two employers into one string --
// "UAB (internal); previously partner at Burr & Forman LLP",
// "Stevens Institute / AT&T Bell Labs". Splitting on the separators recovers
// the buried one; without it the academic half wins and the firm is lost.
//
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
const splitOrgs = (s) =>
  String(s || "")
    .split(/\s*(?:;|\s\/\s|\bpreviously\b|\bformerly\b|\bprior to that\b)\s*/i)
    .map((x) => rebalance(x.trim()).replace(/^\((.*)\)$/, "$1").trim())
    .filter(Boolean);

/**
 * `careerBackground` as a corroborating flag -- but only where it is a LABEL.
 *
 * In the business and engineering indices the field holds a short taxonomy value
 * ("Industry", "Academic/Industry", "Industry/Government"), which is exactly the
 * signal wanted here. In the advancement, nursing and admin indices the same
 * field holds a paragraph-long researched bio, and substring-matching that prose
 * is wrong in both directions: "corporate and foundation relations" is a
 * fundraising job, "board-certified family nurse practitioner" is clinical
 * nursing, and "industry/innovation partnerships" is a university office. Every
 * one of those was flagged as industry experience before this guard existed.
 *
 * So: split on the separators a label uses, and require a WHOLE component to be
 * one of the known industry-ish label values. A paragraph never satisfies that.
 */
const CB_LABELS = new Set([
  "industry", "consulting", "consultant", "corporate", "private sector",
  "practitioner", "business executive", "industry/practitioner", "finance",
]);
function careerBackgroundFlag(raw) {
  const cb = String(raw || "").trim();
  if (!cb || cb.length > 80) return null; // a bio, not a label
  const parts = cb.split(/[/,;&]|\band\b/i).map((x) => x.trim().toLowerCase()).filter(Boolean);
  return parts.some((x) => CB_LABELS.has(x)) ? cb : null;
}

// ---------------------------------------------------------------------------
// evidence assembly
// ---------------------------------------------------------------------------
// One entry per person, keyed name|university the way every other sidecar in
// src/data is. A person who appears in several indices (dean, then provost,
// then president at the same university) pools all their rows.
const P = new Map();
const person = (k) => {
  let p = P.get(k);
  if (!p) { p = { key: k, stops: [], flags: [], indices: new Set() }; P.set(k, p); }
  return p;
};

for (const f of deanFiles) {
  const indexId = f.replace(/^(r1-)?/, "").replace(/-?deans\.json$/, "") || "top100";
  for (const r of ROWS[f]) {
    if (!r.dean || !r.university) continue;
    const p = person(ekey(r.dean, r.university));
    p.indices.add(indexId);
    p.name ||= r.dean;
    p.university ||= r.university;
    for (const org of splitOrgs(r.priorInstitution)) {
      p.stops.push({ org, role: String(r.priorTitle || "").trim(), source: "priorInstitution" });
    }
    if (r.hasConsultingBg === true) p.flags.push("hasConsultingBg");
    if (r.hasIndustryExp === true) p.flags.push("hasIndustryExp (existing)");
    const cbFlag = careerBackgroundFlag(r.careerBackground);
    if (cbFlag) p.flags.push(`careerBackground: ${cbFlag}`);
  }
}

// leader-research career stops: sparser (about 1 person in 11) but multi-stop,
// so it reaches employers a single priorInstitution cell can never show.
for (const [k, rec] of Object.entries(read("leader-research.json") || {})) {
  const p = P.get(k);
  if (!p) continue;
  for (const st of rec.career || []) {
    for (const org of splitOrgs(st.org)) {
      p.stops.push({ org, role: String(st.role || "").trim(), years: st.years || "", source: "leader-research.career" });
    }
  }
}

// ---------------------------------------------------------------------------
// verdicts
// ---------------------------------------------------------------------------
// Three states, because two cannot tell the difference between a researched No
// and an empty cell -- which is the whole reason this pass exists:
//
//   "yes"     at least one stop classified Industry, or a corroborating flag
//   "no"      stops exist and every one of them is academic/government/etc.
//   "unknown" nothing to classify -- no prior institution, no researched career
//
// confidence on a "yes": "high" when a named firm is attached, "low" when only
// a flag (hasConsultingBg / a careerBackground string) supports it with no
// employer to point at.
const out = {};
const stats = {
  people: P.size, yes: 0, no: 0, unknown: 0,
  yesHigh: 0, yesLow: 0, noSingleStop: 0,
  industries: {}, sectors: {}, sources: {},
  firms: new Set(),
};

for (const [k, p] of P) {
  const seen = new Set();
  const classified = [];
  for (const st of p.stops) {
    const c = classifyOrg(st.org);
    if (!c) continue;
    const dedup = `${c.sector}|${nkey(st.org)}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    classified.push({ ...st, ...c });
    stats.sectors[c.sector] = (stats.sectors[c.sector] || 0) + 1;
  }

  const industryStops = classified.filter((c) => c.sector === "Industry");
  const flags = [...new Set(p.flags)];

  let status, confidence;
  if (industryStops.length) { status = "yes"; confidence = "high"; }
  else if (flags.length) { status = "yes"; confidence = "low"; }
  else if (classified.length) { status = "no"; confidence = "medium"; }
  else { status = "unknown"; confidence = "none"; }

  stats[status]++;
  if (status === "yes") stats[confidence === "high" ? "yesHigh" : "yesLow"]++;
  if (status === "no" && classified.length === 1) stats.noSingleStop++;

  const industries = [...new Set(industryStops.map((c) => c.industry))];
  const firms = [...new Set(industryStops.map((c) => c.firm))];
  for (const i of industries) stats.industries[i] = (stats.industries[i] || 0) + 1;
  for (const fm of firms) stats.firms.add(fm);
  for (const c of industryStops) stats.sources[c.source] = (stats.sources[c.source] || 0) + 1;

  // Only people with something to say are written out. A consumer treats a
  // missing key exactly like status "unknown", which keeps the file to the
  // ~13k people the corpus actually has evidence for instead of 26.7k mostly
  // empty records.
  if (status === "unknown") continue;

  out[k] = {
    name: p.name,
    university: p.university,
    status,
    confidence,
    ...(industries.length ? { industries } : {}),
    ...(firms.length ? { firms } : {}),
    ...(flags.length ? { flags } : {}),
    // Full per-stop evidence on a "yes" -- that is the claim a user will want to
    // check, and the firm/role/years are what a profile panel would render.
    // A "no" gets only the sector tally and the stop count: spelling out a dozen
    // universities to justify "no industry found" quadrupled the file (5.6 MB ->
    // this) to say nothing a reader needs.
    ...(status === "yes"
      ? {
          evidence: classified.map((c) => ({
            sector: c.sector,
            ...(c.industry ? { industry: c.industry } : {}),
            org: c.org,
            ...(c.role ? { role: c.role } : {}),
            ...(c.years ? { years: c.years } : {}),
            source: c.source,
          })),
        }
      : { stops: classified.length, sectors: [...new Set(classified.map((c) => c.sector))] }),
  };
}

// ---------------------------------------------------------------------------
const pct = (n) => `${((n / stats.people) * 100).toFixed(1)}%`;
console.log(`people in corpus:          ${stats.people}`);
console.log(`  yes  (industry found):   ${stats.yes}  (${pct(stats.yes)})  high=${stats.yesHigh} low=${stats.yesLow}`);
console.log(`  no   (evidence, no firm):${stats.no}  (${pct(stats.no)})`);
// The number that decides how much this pass is really worth: a "no" resting on
// one career stop only says "the job immediately before this one was academic",
// which is a different claim from "never worked in industry". Anyone who did a
// stint at a firm and then spent fifteen years on a faculty before the deanship
// looks identical to a lifelong academic in this data.
console.log(`         of which single-stop: ${stats.noSingleStop}  (${((stats.noSingleStop / (stats.no || 1)) * 100).toFixed(1)}% of the No bucket -- a weak No)`);
console.log(`  unknown (no evidence):   ${stats.unknown}  (${pct(stats.unknown)})`);
console.log(`distinct firms named:      ${stats.firms.size}`);
console.log(`industries:`, Object.entries(stats.industries).sort((a, b) => b[1] - a[1]));
console.log(`org sectors seen:`, Object.entries(stats.sectors).sort((a, b) => b[1] - a[1]));
console.log(`evidence source of industry stops:`, stats.sources);

if (DUMP_UNCLASSIFIED) {
  const rows = [...UNCLASSIFIED].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`\n=== ${rows.length} distinct orgs no rule matched ===`);
  for (const [org, n] of rows) console.log(String(n).padStart(4), org);
}

if (!REPORT_ONLY && !DUMP_UNCLASSIFIED) {
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`\nwrote ${OUT} (${Object.keys(sorted).length} people)`);
}
