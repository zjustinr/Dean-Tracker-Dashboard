// Baton Index — employer sector classifier.
//
// Decides whether a free-text employer name is PRIVATE SECTOR ("industry") or
// one of the non-industry sectors. Used by backfill-industry-exp.mjs to set
// `hasIndustryExp` on the admin-leaders index, and by check-industry-exp.mjs to
// re-audit it. Kept in its own module so the taxonomy is reviewed in one place.
//
// The point of the split is that "not a university" is NOT the same as
// "industry": the admin index is full of officers hired out of city and state
// government, the military, hospital systems, foundations and associations.
// Flagging those as industry experience would be wrong, and wrong in the
// direction a client notices -- a search consultant filtering for private-sector
// candidates does not want a police chief from a city government in the results.
//
// Precision over recall, deliberately. An employer that matches nothing lands in
// UNKNOWN and is left alone rather than guessed at.

/** Sector constants. Only INDUSTRY sets hasIndustryExp. */
export const SECTOR = {
  INDUSTRY: "industry",
  EDUCATION: "education",
  GOVERNMENT: "government",
  MILITARY: "military",
  NONPROFIT: "nonprofit",
  HEALTHCARE: "healthcare",
  UNKNOWN: "unknown",
};

// Order matters: the first list to match wins. Education/government/military/
// nonprofit/healthcare are all checked BEFORE the corporate patterns, because a
// corporate-looking token can appear inside a public body ("Department of
// Technology Services") far more often than a public token appears inside a real
// company name.

// NOTE on the patterns below: never write \b directly after a truncated stem
// ("universit\b" can never match "University", because t/y is not a word
// boundary), and give plural-capable nouns an explicit s? -- "Health System\b"
// silently misses "Health Systems". Both mistakes fail open into UNKNOWN, which
// is quiet and easy to miss -- "universit\b" sent every single university to
// UNKNOWN and the only symptom was a suspiciously large review pile. Run
// `node employer-sector.mjs --selftest` after touching any pattern here.
const EDUCATION = [
  /\buniversit(y|ies)\b/i,
  /\b(school district|public schools|k-12)\b/i,
  /\b(college|school|seminary|academy|polytechnic|conservatory)s?\b/i,
  /\binstitute of technology\b/i,
  /\b(campus|provost|registrar)\b/i,
  /\b(SUNY|CUNY|Cal State|Texas A&M|Virginia Tech|MIT|Caltech)\b/,
  /\b(community college|technical college|junior college)\b/i,
  /\beducational testing service\b/i,
  // "(internal)" marks a promotion from within the same institution, so the
  // prior employer IS the university -- these are not outside hires at all.
  /\(internal\)/i,
  // Campus shorthand the full-name patterns above cannot see. UC/CSU campuses
  // are spelled out because a bare /\bUC\b/ would also catch company acronyms.
  /\bUC\s?(Berkeley|Davis|Irvine|Los Angeles|Merced|Riverside|San Diego|San Francisco|Santa Barbara|Santa Cruz)\b/i,
  /\b(UCLA|UCSD|UCSF|UCSB|UCSC|UCI|UCR|UCM)\b/,
  /\b(CSU|Cal Poly|SDSU|SFSU|SJSU)\b/,
  /\b(UAB|UNC|USC|NYU|LSU|TCU|SMU|BYU|VCU|ODU|JMU|GMU|RIT|RPI|WPI|NJIT|UMBC|UMKC|UTSA|UTEP|FIU|FAU|UCF|USF|UNLV|UNM|UIC|UIUC|UMass|UConn|UGA|UF|FSU)\b/,
  /\b(Ohio State|Penn State|Virginia Tech|Georgia Tech|UT Austin|Texas A&M)\b/i,
  // Statewide systems and governing boards. Without these, "Nevada System of
  // Higher Education" hits the INDUSTRY "System" pattern and reads as a company.
  /\b(Higher Education|Board of Regents|Board of Trustees|Board of Governors)\b/i,
];

const MILITARY = [
  /\bU\.?S\.?\s*(Army|Navy|Air Force|Marine Corps|Marines|Coast Guard|Space Force)\b/i,
  /\b(Army|Navy|Air Force|Marine Corps|Coast Guard|Space Force)\b(?!.*\b(contractor|systems|technologies)\b)/i,
  /\b(National Guard|Department of Defense|DoD|Pentagon|Joint Chiefs)\b/i,
  /\bmilitary (office|academy|command)\b/i,
  /\bWest Point\b/i,
];

const GOVERNMENT = [
  /\b(City|County|State|Commonwealth|Town|Village|Borough) of\b/i,
  /\b(U\.?S\.?|United States|Federal|National) (Department|Bureau|Agency|Office|Administration|Commission|Service)\b/i,
  /\bDepartment of (Education|Energy|Justice|State|Labor|Health|Transportation|Treasury|Commerce|Agriculture|Veterans|Homeland)\b/i,
  /\b(NASA|NIH|NSF|EPA|FBI|CIA|NSA|CDC|FDA|GAO|SEC|FDIC|IRS|USAID|FEMA|TSA|DHS)\b/,
  /\b(White House|Congress|Senate|House of Representatives|Legislature|Governor'?s Office)\b/i,
  /\b(Comptroller|Attorney General|District Attorney|Public Defender|Auditor General)\b/i,
  /\b(Municipal|Metropolitan|Regional) (Government|Authority|Transit|Water|Utility)\b/i,
  /\b(Court|Judiciary|Judicial|Supreme Court)\b/i,
  /\b(Sandia|Los Alamos|Oak Ridge|Argonne|Fermilab|Brookhaven|Lawrence Livermore|Jet Propulsion) (National )?Laborator/i,
  /\bnational laborator(y|ies)\b/i,
  // Any "National ... Laboratory" (NREL, NETL, ...) -- federally funded, and
  // otherwise caught by INDUSTRY on words like "Energy".
  /\bNational\b.*\bLaborator(y|ies)\b/i,
  // State/city departments and offices. EDUCATION is matched first, so an
  // academic "Department of ..." never reaches this line.
  /\bDepartment of\b/i,
  /\b(Peace Corps|AmeriCorps|Smithsonian|Library of Congress|Census Bureau)\b/i,
  /\bstate (system|board|department|agency|commission)\b/i,
  /\bpublic (utility|transit|housing|works|safety)\b/i,
];

const NONPROFIT = [
  /\b(Foundation|Trust)\b/i,
  /\b(Association|Society|Council|Alliance|Coalition|Consortium|Federation)\b/i,
  /\b(Museum|Library|Symphony|Orchestra|Theatre|Theater|Botanical)\b/i,
  /\b(Public Media|Public Broadcasting|PBS|NPR|public radio|public television)\b/i,
  /\b(YMCA|YWCA|United Way|Red Cross|Goodwill|Salvation Army|Habitat for Humanity)\b/i,
  /\b(Brookings|RAND|Urban Institute|Pew|Carnegie|Rockefeller|Ford Foundation|Mellon|Kellogg Foundation)\b/i,
  /\b(Church|Diocese|Ministries|Ministry|Synod|Archdiocese|Jesuit|Catholic Charities)\b/i,
  /\b(charitable|philanthropy|philanthropic|nonprofit|non-profit|NGO)\b/i,
  /\binstitution\b/i,
];

const HEALTHCARE = [
  /\b(Hospitals?|Health Systems?|Healthcare Systems?|Medical Centers?|Health Networks?|Clinics?|Infirmary)\b/i,
  /\b(Mayo|Cleveland Clinic|Kaiser Permanente|Johns Hopkins Medicine|MD Anderson|Cedars-Sinai)\b/i,
  /\b(Health Sciences Center|Medical Group|Health Services|Public Health Department|Healthcare)\b/i,
  /\bhealth (systems?|authority|district)\b/i,
];

// Private sector. Legal-entity suffixes are the strongest single signal.
const INDUSTRY = [
  /,?\s*(Inc|Inc\.|LLC|L\.L\.C\.|LLP|L\.L\.P\.|Corp|Corp\.|Corporation|Ltd|Ltd\.|Limited|PLC|GmbH|S\.A\.|N\.V\.|AG|Co\.)\s*$/i,
  /\b(Incorporated|Corporations?|Compan(y|ies)|Holdings|Enterprises|Industries|Ventures|Capital|Partners|Associates|Advisors|Advisory)\b/i,
  /\b(Technolog(y|ies)|Systems?|Solutions?|Software|Robotics|Semiconductors?)\b/i,
  /\b(Consulting|Consultants?|Strategy Group|Management Group)\b/i,
  /\b(Banks?|Banking|Financial|Finance Group|Investments?|Securities|Insurance|Asset Management|Equity|Wealth)\b/i,
  /\b(Pharmaceuticals?|Pharma|Biotech|Biosciences|Therapeutics|Diagnostics)\b/i,
  /\b(Energy|Petroleum|Oil|Gas|Mining|Utilities|Power Company)\b/i,
  /\b(Airlines?|Aerospace|Motors|Automotive|Manufacturing|Logistics|Freight)\b/i,
  /\b(Media Group|Publishing|Broadcasting Company|Entertainment|Studios)\b/i,
  /\b(Law Firm|Attorneys at Law|Counsel LLP|LLP|LLO|PLLC)\b/i,
  /,\s*(P\.?A\.?|P\.?C\.?)\s*$/i,          // law/medical partnership suffixes
  /\b(Inc|Corp|Ltd)\b\.?/i,
  /\b(Group|Holdings?|Agency|Credit Union|Firm)\b/i,
  // Named private-sector employers seen in this dataset and its peers.
  /\b(IBM|Microsoft|Google|Alphabet|Amazon|Apple|Meta|Facebook|Intel|Cisco|Oracle|Dell|Hewlett|HP|SAP|Salesforce|Adobe|Nvidia|Qualcomm)\b/i,
  /\b(Boeing|Lockheed|Raytheon|Northrop|General Dynamics|Leidos|Dynetics|SAIC|Booz Allen|Battelle|MITRE|Aerojet)\b/i,
  /\b(Deloitte|PwC|PricewaterhouseCoopers|KPMG|Ernst & Young|EY|McKinsey|Accenture|Bain|Boston Consulting|Huron|Gartner|Grant Thornton|BDO)\b/i,
  /\b(Goldman Sachs|JPMorgan|J\.P\. Morgan|Morgan Stanley|Wells Fargo|Bank of America|Citigroup|Citibank|BlackRock|Vanguard|Fidelity|Charles Schwab)\b/i,
  /\b(General Electric|Siemens|Honeywell|3M|Johnson & Johnson|Pfizer|Merck|Novartis|AstraZeneca|Genentech|Amgen|Eli Lilly)\b/i,
  /\b(Walmart|Target|Nike|Disney|Comcast|Verizon|AT&T|T-Mobile|Charter|Nielsen|Thomson Reuters|Elsevier|Wiley|Pearson|McGraw)\b/i,
  /\b(ACI Worldwide|Career Education Corporation|Blackbaud|Ellucian|Workday|ServiceNow|Anthology|Instructure|Coursera|2U)\b/i,
];

// Named employers that no general pattern should be stretched to cover. Checked
// FIRST, so a curated decision always beats a heuristic. Every entry here was
// read individually off the admin-leaders review pile; keep it that way rather
// than inventing a regex that happens to catch three of them.
const OVERRIDES = [
  // --- private sector -------------------------------------------------------
  [/\b(Leafly|Sodexo|Barclays|Bacardi|Xerox|Kraft Heinz|Abbott Laboratories|Briggs & Stratton|ExxonMobil|Cox Communications|Gannett|PeopleSoft|Trustpilot|Techstars|Corpay|FLEETCOR|Elevance)\b/i, SECTOR.INDUSTRY],
  [/\b(APCO Worldwide|Rubenstein|Synergis Education|Auto Europe|Valdese Weavers|Rhino Foods|CoverMyMeds|Samson Resources|USA Mobility|Elliott Aviation|Browning Construction|Avolve Sports|LogistiCare|Scientific Atlanta|Smith Meter|AmWINS|Ascendant|LF Distribution)\b/i, SECTOR.INDUSTRY],
  [/\b(Buffalo Bills|NFL|ESPN|The Tennessean|Bound to Stay Bound|The Springs Living|CommunityAmerica Credit Union|Four Score Strategies|Ervin & Smith|The Childress Agency|The Beale Agency)\b/i, SECTOR.INDUSTRY],
  [/^ABC and ESPN$/i, SECTOR.INDUSTRY],
  // Law firms -- partnership names carry no generic marker, so they are listed.
  [/\b(Gray Plant Mooty|Nelson \| Williams|Lex Politica|Jones Day|BakerHostetler|Lathrop GPM|Waller Lansden|Archer & Greiner|Hinckley, Allen|Wyatt, Tarrant|McGrath North|Allen Norton & Blue|McMillan, Turner|Fessenden Firm)\b/i, SECTOR.INDUSTRY],
  [/\bPrivate practice\b/i, SECTOR.INDUSTRY],
  // --- education ------------------------------------------------------------
  [/\b(The Citadel|Middlebury Institute|WashU|William & Mary|Lutheran High)\b/i, SECTOR.EDUCATION],
  // --- nonprofit ------------------------------------------------------------
  [/\b(DigitalC|The People Concern|Communication Service for the Deaf|Upjohn Institute|New Vista|Centerstone|Loomis Communities|Lutheran Social Services|Florida Sheriffs Youth Ranches|Chan Zuckerberg|Republican National Committee|Democratic National Committee)\b/i, SECTOR.NONPROFIT],
  [/\b(Brooklyn Botanic|Metropolitan Opera|March of Dimes|Outward Bound|American Civil Liberties Union|ACLU|World Food Program|Seventh-day Adventists|Christian Union|St\.? Norbert Abbey)\b/i, SECTOR.NONPROFIT],
  // --- healthcare -----------------------------------------------------------
  [/\b(Sutter Health|PruittHealth|AdventHealth|Advocate Health|Wayne Health|Jefferson Health|Baystate Health|Froedtert|Rochester Regional Health|Health New England|Memorial Sloan Kettering)\b/i, SECTOR.HEALTHCARE],
  // --- government -----------------------------------------------------------
  [/\b(Police Department|Sheriff'?s Office|State Police|Highway Patrol|Secret Service|Department of Correction|Department of Sanitation)\b/i, SECTOR.GOVERNMENT],
  [/\b(State Auditor|State Attorney|General Assembly|Legislative|Legislature|Port Authority)\b/i, SECTOR.GOVERNMENT],
  [/\b(National Institutes of Health|National Accelerator Laboratory)\b/i, SECTOR.GOVERNMENT],
  [/\b(Milwaukee County|Government of the|federal government)\b/i, SECTOR.GOVERNMENT],
  [/\bAirport\b/i, SECTOR.GOVERNMENT],
  // Public benefit corporations: legally "Corporation", functionally government.
  // Listed individually rather than by pattern, because plenty of genuine
  // private developers are also called "<Something> Development Corporation".
  [/\b(New York City Economic Development Corporation|Lower Manhattan Development Corporation|Massachusetts Municipal Wholesale Electric)\b/i, SECTOR.GOVERNMENT],
  // Intergovernmental, not a commercial bank.
  [/\bWorld Bank\b/i, SECTOR.NONPROFIT],
];

function anyMatch(patterns, s) {
  return patterns.some((re) => re.test(s));
}

/**
 * Classify an employer name into a SECTOR.
 * @param {string} raw employer / institution name
 * @returns {string} one of SECTOR.*
 */
export function classifyEmployer(raw) {
  const s = String(raw || "").trim();
  if (!s) return SECTOR.UNKNOWN;
  // Curated decisions beat every heuristic below.
  for (const [re, sector] of OVERRIDES) if (re.test(s)) return sector;
  // Non-industry sectors first -- see the note at the top of this file.
  if (anyMatch(EDUCATION, s)) return SECTOR.EDUCATION;
  if (anyMatch(MILITARY, s)) return SECTOR.MILITARY;
  if (anyMatch(GOVERNMENT, s)) return SECTOR.GOVERNMENT;
  if (anyMatch(HEALTHCARE, s)) return SECTOR.HEALTHCARE;
  if (anyMatch(NONPROFIT, s)) return SECTOR.NONPROFIT;
  if (anyMatch(INDUSTRY, s)) return SECTOR.INDUSTRY;
  return SECTOR.UNKNOWN;
}

// Titles that only exist in the private sector. Used as corroboration for an
// employer that classified as INDUSTRY, and to describe the evidence -- never on
// their own, since "President" or "Director" mean nothing without the employer.
const INDUSTRY_TITLE = /\b(Chief Executive Officer|CEO|Chief Operating Officer|COO|Chief Technology Officer|CTO|Chief Financial Officer|CFO|Chief Information Officer|CIO|Managing Director|Managing Partner|Founder|Co-founder|Cofounder|Partner|Principal Consultant|Vice President of Engineering|General Manager)\b/i;

export function hasIndustryTitle(title) {
  return INDUSTRY_TITLE.test(String(title || ""));
}

// --- selftest: node employer-sector.mjs --selftest ---------------------------
// Every case is a real string from the admin-leaders index or its close kin.
// Singular AND plural forms are both asserted, because the failure mode this
// guards against is a pattern that silently matches only one of them.
const CASES = [
  // private sector
  ["Career Education Corporation", SECTOR.INDUSTRY],
  ["Hillspire, LLC", SECTOR.INDUSTRY],
  ["ACI Worldwide", SECTOR.INDUSTRY],
  ["Dynetics/Leidos", SECTOR.INDUSTRY],
  ["Deloitte Consulting LLP", SECTOR.INDUSTRY],
  ["Pfizer Pharmaceutical", SECTOR.INDUSTRY],
  ["Vertex Pharmaceuticals", SECTOR.INDUSTRY],
  ["Cisco System", SECTOR.INDUSTRY],
  ["Cisco Systems", SECTOR.INDUSTRY],
  ["Delta Airlines", SECTOR.INDUSTRY],
  // education -- the regression that started this test
  ["Harvard University", SECTOR.EDUCATION],
  ["Stephen F. Austin State University", SECTOR.EDUCATION],
  ["Boston College", SECTOR.EDUCATION],
  ["Rush University", SECTOR.EDUCATION],
  ["Chicago Public Schools", SECTOR.EDUCATION],
  // government / military
  ["U.S. Air Force", SECTOR.MILITARY],
  ["U.S. Navy / White House Military Office", SECTOR.MILITARY],
  ["City of Midland, Michigan", SECTOR.GOVERNMENT],
  ["NYC Office of the Comptroller", SECTOR.GOVERNMENT],
  ["Sandia National Laboratories", SECTOR.GOVERNMENT],
  // nonprofit / healthcare
  ["Brookings Institution", SECTOR.NONPROFIT],
  ["Wisconsin Public Media", SECTOR.NONPROFIT],
  ["Mayo Clinic", SECTOR.HEALTHCARE],
  ["Geisinger Health System", SECTOR.HEALTHCARE],
  ["Geisinger Health Systems", SECTOR.HEALTHCARE],
  // curated one-offs: no general pattern should be stretched to cover these
  ["DigitalC", SECTOR.NONPROFIT],
  ["Lex Politica", SECTOR.INDUSTRY],
  ["Gray Plant Mooty", SECTOR.INDUSTRY],
  ["Sacramento County Sheriff's Office", SECTOR.GOVERNMENT],
  ["Boston Police Department", SECTOR.GOVERNMENT],
  ["Sutter Health", SECTOR.HEALTHCARE],
  ["The Citadel", SECTOR.EDUCATION],
  // Regressions caught by spot-checking the flagged list. Each of these was
  // wrongly classified INDUSTRY by a single tempting word -- "System",
  // "Financial", "Energy", "Corporation", "Consulting", "Bank".
  ["Nevada System of Higher Education", SECTOR.EDUCATION],
  ["Maine Department of Administrative and Financial Services", SECTOR.GOVERNMENT],
  ["National Renewable Energy Laboratory", SECTOR.GOVERNMENT],
  ["New York City Economic Development Corporation", SECTOR.GOVERNMENT],
  ["Massachusetts Municipal Wholesale Electric Company", SECTOR.GOVERNMENT],
  ["Norton Healthcare (via independent consulting)", SECTOR.HEALTHCARE],
  ["World Bank", SECTOR.NONPROFIT],
  // ...while genuine companies carrying the same words stay INDUSTRY.
  ["Cisco Systems", SECTOR.INDUSTRY],
  ["Encova Insurance", SECTOR.INDUSTRY],
  ["Koch Industries Inc.", SECTOR.INDUSTRY],
  ["Huron Consulting Group", SECTOR.INDUSTRY],
  ["Citizens Business Bank", SECTOR.INDUSTRY],
  // only a genuinely empty employer is UNKNOWN now that the pile is curated
  ["", SECTOR.UNKNOWN],
];

if (process.argv[1] && process.argv[1].endsWith("employer-sector.mjs") && process.argv.includes("--selftest")) {
  let pass = true;
  for (const [name, want] of CASES) {
    const got = classifyEmployer(name);
    const ok = got === want;
    if (!ok) pass = false;
    console.log(`${ok ? "✓" : "✗"} ${(name || "(empty)").padEnd(40)} -> ${got}${ok ? "" : `  (expected ${want})`}`);
  }
  const titles = [["Co-founder and CEO", true], ["Managing Partner", true], ["Associate Provost", false], ["Dean of Students", false]];
  for (const [t, want] of titles) {
    const ok = hasIndustryTitle(t) === want;
    if (!ok) pass = false;
    console.log(`${ok ? "✓" : "✗"} title: ${t.padEnd(33)} -> ${hasIndustryTitle(t)}`);
  }
  console.log(pass ? "\nSELFTEST PASS" : "\nSELFTEST FAIL");
  process.exit(pass ? 0 : 1);
}
