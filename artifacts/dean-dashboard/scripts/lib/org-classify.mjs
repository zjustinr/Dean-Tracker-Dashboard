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
// its own CATEGORY_PATTERNS, and gen-nonacademic-experience.mjs had a fuller one.
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
  // Short and informal school names in the corpus
  "rutgers\\b", "pitt\\b", "pitt business", "pitt medicine", "sacramento state",
  "missouri s&t", "missouri s\\.?&?t", "tuskegee\\b", "vinuniversity", "vin university",
  "mcgill", "williston northampton", "hotchkiss", "chautauqua", "berklee\\b",
  "fermilab", "augustine institute", "cal arts", "california institute", "art institute",
  "new hampshire institute", "lutheran high", "high school", "secondary school",
  // Higher-education sector bodies, by acronym. Their spelled-out names carry a
  // school word and are caught above; the acronym alone matches nothing, and the
  // nonprofit rule would otherwise count a seat on one as a tie outside academia.
  // It is not one -- the constituency is colleges, so the network is the same
  // higher-education network the university seat already carries.
  "aacsb\\b", "aacu\\b", "aac&u\\b", "naspa\\b", "cupa\\b", "nacubo\\b",
  "educause\\b", "aascu\\b", "acenet\\b", "nitle\\b",
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
  "usda\\b", "state department", "department of state", "state (?:of |department)",
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
  // State legislatures, county commissions, and local government bodies
  "legislature\\b", "general assembly", "legislative budget", "board of commissioners",
  "county commission", "county board", "county judge", "state supreme court",
  "judicial court", "railroad commission", "defense (?:advanced|department)",
  "armed forces", "military (?:district|division|command)", "special operations",
  "infantry (?:division|brigade|battalion)", "brigade combat team",
  // More government entities
  "county (?:board|court|commission|administration|government|clerk)", "government of",
]);
// A US-flavoured entity name ending in a corporate-sounding word is still
// federal: the DFC, the TVA, the USPS. Checked alongside GOVT.
const BARE_COUNTY = /^[a-z][a-z .'-]{2,30} county$/i;
const US_ENTITY = /(?:\bu\.?s\.?\b|\bunited states\b|\bnational\b|\bfederal\b).{0,40}\b(?:corporation|authority|administration|agency|commission|bureau|service|committee|board)\b/i;
const NONPROFIT = stems([
  "foundation", "nonprofit", "non-profit", "ngo\\b", "charitable", "philanthrop",
  "association", "society", "council", "institute for", "museum", "public library",
  "ymca\\b", "red cross", "united way", "think tank", "brookings", "rand corporation",
  "urban institute", "aspen institute", "carnegie (?:corporation|endowment)",
  "ford foundation", "gates foundation", "acls\\b", "naacp\\b",
  "girl scouts", "boy scouts", "goodwill", "habitat for humanity", "church",
  "diocese", "archdiocese", "synagogue", "ministries", "sisters of", "congregation",
  // Research institutes and labs. NOT a bare "laborator" stem -- that claimed
  // Abbott Laboratories and Bell Laboratories, which are a pharma company and a
  // corporate R&D arm, before the industry rules ever ran.
  "research institute", "research center", "research lab",
  "jackson laboratory", "scripps research", "national renewable energy",
  "southwest research", "fermi lab", "lawrence (?:berkeley|livermore|national)",
  "oak ridge", "sandia national", "argonne national", "brookhaven national",
  "dana[- ]farber",
  // Environmental and advocacy nonprofits
  "environmental (?:defense|fund)", "trust for public land", "resources for the future",
  // Education nonprofits and research organizations
  "southern regional education", "ruffalo noel levitz", "ecsi\\b",
  "world learning", "synergis education", "duke corporate education",
  // Arts and cultural organizations
  "symphony orchestra", "opera company", "theater", "arts center", "arts council",
  "mark taper", "american ibsen", "san diego opera", "toronto symphony",
  "lighthouse (?:catholic|media)", "people concern", "philabund",
  // Other nonprofits from corpus
  "center for the homeless", "civic education", "children international",
  "communication service for the deaf", "deaf services", "disabled people",
]);
// A hospital or health system is its own thing: often nonprofit, frequently
// university-affiliated, and in the nursing / medical / pharmacy indices it is
// the normal place a clinical academic works. It keeps a distinct sector so a
// consumer can still tell a health system from a pharma company -- but it is no
// longer excluded from the tie pool. Chairing a multi-billion-dollar health
// system board is a real, current, named relationship, and the earlier rule
// scored it at zero.
const HEALTH_PROVIDER = stems([
  "hospital", "health system", "healthcare system", "medical cent", "health cent",
  "clinic\\b", "clinics\\b", "infirmary", "vamc\\b", "veterans affairs",
  "adventhealth", "commonspirit", "beaumont health", "loma linda university health",
  "uconn health", "johns hopkins medicine", "mass general brigham", "baystate health",
  "partners healthcare", "atrium health", "university hospitals",
  // Large health systems appearing in the unclassified list
  "jefferson health", "washU medicine", "wamu medicine", "ochsner health",
  "st\\. luke's health", "froedtert health", "emory healthcare", "penn medicine",
  "hca healthcare", "university health", "advocate (?:health|aurora)",
  "allegheny health", "wellmark", "health and human services",
  "va(?:mc)?\\b", "department of veterans", "veterans (?:health|affairs)",
  "clinical (?:practice|center)", "physicians (?:group|network)",
  "medical affairs", "health division", "healthcare provider",
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
    // Additional consultants from corpus
    "andersen consulting", "duke corporate", "world learning",
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
    // Additional financial services from corpus
    "scudder kemper", "encova", "credit union", "title (?:company|insurance)",
    "chicago title", "community america",
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
    // Additional tech companies from corpus
    "verizon", "ellucian", "techstars\\b", "leafly", "software (?:company|firm|startup)",
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
    // Additional retailers from corpus
    "toys r us", "suncorp", "hunt consolidated", "forest city",
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
    // Additional media from corpus
    "pbs\\b", "hollywood reporter", "scientific american", "cox communications",
  ])],
  ["Law (private practice)", stems([
    "llp\\b", "law firm", "pllc\\b", "p\\.c\\.\\b", "p\\.c\\.\\s", "attorney", "counsel\\b",
    "jones day", "latham ?(?:&|and) ?watkins", "skadden",
    "sidley austin", "kirkland ?(?:&|and) ?ellis", "covington ?(?:&|and) ?burling",
    "wilmerhale", "wilmer cutler", "cravath", "sullivan ?(?:&|and) ?cromwell",
    "davis polk", "debevoise", "gibson dunn", "paul weiss", "arnold ?(?:&|and) ?porter",
    "morrison ?(?:&|and) ?foerster", "baker mckenzie", "hogan lovells", "dla piper",
    "greenberg traurig", "k&l gates", "burr ?(?:&|and) ?forman", "attorneys at law",
    // Firms named in the corpus's own prior-institution cells. Each carries
    // enough of the partnership name to identify the firm: a bare surname here
    // matches any organisation that merely STARTS with the word, which filed
    // Barnes & Noble, Archer Daniels Midland and the Winston-Salem Journal as
    // law practices. Commas are optional because the corpus spells these both
    // ways ("Munger, Tolles & Olson" and "Munger Tolles & Olson").
    "steptoe ?(?:&|and) ?johnson", "gray plant mooty", "munger,? ?tolles",
    "lathrop gpm", "wyatt,? ?tarrant", "shea ?(?:&|and) ?gardner",
    "archer ?(?:&|and) ?greiner", "mcgrath north", "nelson ?\\| ?williams",
    "baker botts", "baker ?(?:&|and) ?mckenzie", "baker donelson", "bakerhostetler",
    "baker,? donelson", "barnes ?(?:&|and) ?thornburg", "bass,? ?berry",
    "bradley arant", "alston ?(?:&|and) ?bird", "anglin reichmann",
    "allen norton ?(?:&|and) ?blue", "zimmerman kiser", "winston ?(?:&|and) ?strawn",
    "waller lansden", "wallace jordan", "sutherland asbill", "thompson ?(?:&|and) ?knight",
    "vorys,? ?sater", "akerman senterfitt", "ziemer,? ?stayman", "kahn,? ?dees",
    // Attested in the administrative wave. Named in full for the same reason as
    // the block above: the corpus writes many of these without an LLP suffix,
    // so the generic entity markers do not reach them.
    "vinson ?(?:&|and) ?elkins", "king ?(?:&|and) ?spalding", "seyfarth shaw",
    "saul ewing", "whiteman osterman", "middleton reutlinger", "caplin ?(?:&|and) ?drysdale",
    "hoagland,? fitzgerald", "calareso law", "lex politica", "gray plant",
  ])],
];

/** The industry labels this module can return, in the order rules are tried. */
export const INDUSTRY_NAMES = INDUSTRY.map(([name]) => name).concat("Other industry");

// Non-academic sectors that are not companies. They are categories in their own
// right rather than a residual bucket, because for a connections thesis they are
// not lesser: a foundation program officer, a state budget director and a health
// system trustee each carry a network a school can tap. The earlier taxonomy
// counted only companies and therefore scored all three at zero.
export const SECTOR_CATEGORY = {
  Government: "Government & Public Sector",
  Nonprofit: "Nonprofit & Foundations",
  "Healthcare Provider": "Healthcare Providers",
};

/** Every category a tie can carry: the industry sub-sectors plus the three above. */
export const CATEGORY_NAMES = INDUSTRY_NAMES.concat(Object.values(SECTOR_CATEGORY));

/** Sectors that count as a tie. Academic is the baseline; Unclassified means no
 *  rule matched, which is an open question rather than a finding. */
export const TIE_SECTORS = new Set(["Industry", ...Object.keys(SECTOR_CATEGORY)]);

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
 * @param {(org: string) => void} [opts.onUnclassified] called for every org no rule matched;
 *   this list is the recall ceiling and the worklist for extending the vocabulary above
 * @returns {(org: string) => ({sector: string, category?: string, firm?: string}|null)}
 *   null means "not an organization name at all" (blank, placeholder, research note)
 */
export function makeClassifier(academic, { onUnclassified } = {}) {
  // Every non-academic sector carries the organisation's name in `firm`, not
  // just the company ones. The name IS the asset -- "the Ford Foundation" and
  // "the Ohio Department of Higher Education" are as specific and as
  // door-opening as "McKinsey & Company", and dropping them left a Government
  // or Nonprofit classification with nothing a profile could display.
  const nonAcademic = (sector, s) => ({ sector, category: SECTOR_CATEGORY[sector], firm: s });
  return function classifyOrg(raw) {
    const s = String(raw || "").trim().replace(/\s+/g, " ").replace(ANNOTATION, "").trim();
    if (!s || s.length < 2 || NON_ORG.test(s) || BOOKKEEPING.test(s)) return null;
    if (academic.isAcademic(s)) return { sector: "Academic" };
    if (GOVT.test(s) || US_ENTITY.test(s) || BARE_COUNTY.test(s)) return nonAcademic("Government", s);
    if (NONPROFIT.test(s)) return nonAcademic("Nonprofit", s);
    if (HEALTH_PROVIDER.test(s)) return nonAcademic("Healthcare Provider", s);
    for (const [category, re] of INDUSTRY) if (re.test(s)) return { sector: "Industry", category, firm: s };
    // Substring gazetteer before the firm marker, not after: "Johns Hopkins
    // University Applied Physics Laboratory" carries "Laboratories"-shaped
    // wording and would otherwise be filed as a company.
    if (academic.containsKnownSchool(s)) return { sector: "Academic" };
    if (FIRM_MARKER.test(s)) return { sector: "Industry", category: "Other industry", firm: s };
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
  if (cls.sector === "Industry") return AFFINITY_BY_INDUSTRY[cls.category] || "Other";
  return AFFINITY_BY_SECTOR[cls.sector] || "Other";
}
