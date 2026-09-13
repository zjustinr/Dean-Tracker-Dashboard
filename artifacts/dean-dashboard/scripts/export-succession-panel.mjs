#!/usr/bin/env node
/**
 * Export the corpus as the relational succession panel specified in
 * `docs/succession-panel-spec.md` (the hierarchical-vacancy-coupling data request).
 *
 *   node scripts/export-succession-panel.mjs [--out <dir>]
 *
 * Writes appointments.csv, institutions.csv, units.csv, people.csv, exits.csv,
 * institution_year.csv, appointments_provost.csv and qc_report.txt. Exit status is
 * always 0: this reports, it does not gate CI.
 *
 * WHAT THIS CAN AND CANNOT HONOUR
 * ------------------------------
 * The request names three design decisions. Two are met in full; the first is met
 * only where the corpus actually has the resolution, and that gap is the single most
 * consequential thing in this export:
 *
 *   1. **Month-level dates.** Requested as "the single highest-value upgrade", because
 *      H1's ordering test needs them. The corpus stores a `startYear` plus a free-text
 *      `startLabel`, and only the two business-school files ever wrote a month into
 *      that label ("Jul-16"). Across 18,167 spells corpus-wide, 1,076 carry a month
 *      and 2 carry a day; inside this export's scope that comes to 586 month rows and
 *      one day row, 5.7% of the panel, and 585 of the 586 are business schools. So
 *      `start_precision` is honest rather than uniform, and a month-resolution
 *      analysis is possible inside business schools and nowhere else.
 *      No month is inferred, ever: a year-only source becomes YYYY-01-01 with
 *      precision `year`, exactly as the spec prescribes.
 *   2. **An interim later confirmed is two rows.** Honoured, and linked through
 *      `converted_to_permanent` / `linked_permanent_id`. The corpus's own
 *      `convertedToPermanent` field is not used to decide this -- it is set on 9 rows
 *      in the entire corpus, against the 200+ conversions actually present -- so the
 *      link is derived from the spells and the field is ignored.
 *   3. **Appointment rows separated from roster rows.** Honoured, and tightened.
 *      Start-date presence is the spec's separator and it is necessary but not
 *      sufficient: hundreds of rows carry a start year and are associate or assistant
 *      deans (`roleType: "subdean"`, or a title that says so). Those are dropped from
 *      `appointments.csv`, and the QC report counts them rather than letting them pass
 *      silently as deanships.
 *
 * VACANCIES CANNOT BE EXPORTED. The spec asks for a row with `seat_title_raw =
 * "VACANT"` wherever a seat sat genuinely empty. The corpus has no such record: it
 * stores occupants, not seat states, so a gap between one spell's end and the next
 * one's start is indistinguishable from a year nobody researched. Emitting VACANT
 * rows would be fabricating the very observations the analysis turns on, so none are
 * written; the QC report counts the gaps instead so their scale is visible.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, idOf } from "./lib/institution-key.mjs";
import { isChiefExecutiveSeat, surnameKey } from "./lib/interim-panel.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const RESEARCH = join(HERE, "..", "..", "..", "research");
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : join(HERE, "..", "..", "..", "succession-panel");

const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));
const readResearch = (f) => JSON.parse(readFileSync(join(RESEARCH, f), "utf8"));

// ---------------------------------------------------------------------------
// Index -> seat mapping
// ---------------------------------------------------------------------------

/**
 * Which index supplies which seat.
 *
 * `central` is the chief executive. The two president indexes are listed separately
 * because they overlap on eleven dual-Carnegie-vintage institutions, handled below.
 *
 * Deliberately absent, each for a reason the QC report repeats:
 *   - `r1-provost-deans.json`    the spec's `seat_level` enum is president|dean, so
 *                                provosts go to their own file (see PROVOST below).
 *   - `r1-system-deans.json`     system heads sit ABOVE the president; they are a
 *                                governance layer, not an institution's own seat.
 *   - `r1-lac-*`, `r1-communitycollege-*`  liberal-arts colleges and community
 *                                colleges are outside both Carnegie indexes, which the
 *                                spec sets as the inclusion rule.
 *   - `r1-adminleaders-*`, `r1-advancement-*`  vice presidents and advancement
 *                                officers, not deans.
 *   - `deans.json`               the Top-100 business cut, which overlaps
 *                                r1-bschool almost entirely; the corpus's own registry
 *                                marks it unregistered-by-design for this reason.
 */
const SEATS = [
  ["r1-university-deans.json", "president", "central"],
  ["r1-r2public-deans.json", "president", "central"],
  ["r1-bschool-deans.json", "dean", "business"],
  ["r1-lawschool-deans.json", "dean", "law"],
  ["r1-medschool-deans.json", "dean", "medicine"],
  ["r1-eschool-deans.json", "dean", "engineering"],
  ["r1-arts-deans.json", "dean", "arts_sciences"],
  ["r1-education-deans.json", "dean", "education"],
  ["r1-nursing-deans.json", "dean", "nursing"],
  ["r1-publichealth-deans.json", "dean", "public_health"],
  ["r1-agschool-deans.json", "dean", "other"],
  ["r1-pharmacy-deans.json", "dean", "other"],
  ["r1-vet-deans.json", "dean", "other"],
  ["r1-grad-deans.json", "dean", "other"],
  ["r1-camd-deans.json", "dean", "other"],
];
/** Unit-type label for the `other` indexes, so they stay distinguishable in `unit_name`. */
const OTHER_LABEL = {
  "r1-agschool-deans.json": "agriculture",
  "r1-pharmacy-deans.json": "pharmacy",
  "r1-vet-deans.json": "veterinary",
  "r1-grad-deans.json": "graduate",
  "r1-camd-deans.json": "creative_arts",
};
const PROVOST = ["r1-provost-deans.json", "provost", "central"];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Resolve a (year, free-text label) pair into an ISO date and its true precision.
 *
 * The year always comes from the structured `startYear`/`endYear` field, never from
 * the label: labels like "Jul-90" are Excel's rendering of July 1990 and their
 * two-digit year cannot be trusted on its own. The label contributes a month, and
 * only a month, and only when it plainly states one.
 */
function isoDate(year, label) {
  if (!year) return { date: "", precision: "" };
  const s = String(label || "");
  const dayMatch = s.match(/([A-Za-z]{3,9})\w*\s+(\d{1,2}),\s*(\d{4})/);
  if (dayMatch) {
    const m = MONTHS[dayMatch[1].slice(0, 3).toLowerCase()];
    if (m) return { date: `${year}-${String(m).padStart(2, "0")}-${String(+dayMatch[2]).padStart(2, "0")}`, precision: "day" };
  }
  const monMatch = s.match(/([A-Za-z]{3,9})/);
  if (monMatch) {
    const m = MONTHS[monMatch[1].slice(0, 3).toLowerCase()];
    if (m) return { date: `${year}-${String(m).padStart(2, "0")}-01`, precision: "month" };
  }
  return { date: `${year}-01-01`, precision: "year" };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180: quote when the value contains a comma, quote, CR or LF; double inner quotes. */
const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function writeCsv(name, columns, rows) {
  const body = [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
  writeFileSync(join(OUT, name), body + "\r\n", "utf8");
  return rows.length;
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

const r1Schools = read("r1-university-schools.json");
const r23Schools = read("r1-r2public-schools.json");
const r1Keys = new Set(r1Schools.map((s) => keyOf(s.university)));

// Carnegie tier, with R2 winning the one institution the R2 and R3 universes both
// claim (Texas A&M-Commerce, renamed East Texas A&M in 2025 and entered under both
// names). The eleven institutions in BOTH the R1 index and the R2/R3 index keep their
// R1 assignment, per the spec's open item; `carnegie_2021` and `carnegie_2025` are
// exported as separate columns so the requester can re-cut either way.
const RANK = { R2: 2, R3: 1 };
const c2021 = new Map();
const leaderTitleOf = new Map();
const schoolMeta = new Map();
for (const s of r23Schools) {
  const k = keyOf(s.university);
  const prev = c2021.get(k);
  if (!prev || (RANK[s.carnegie] || 0) > (RANK[prev] || 0)) c2021.set(k, s.carnegie);
  if (s.leaderTitle) leaderTitleOf.set(k, s.leaderTitle);
  if (!schoolMeta.has(k)) schoolMeta.set(k, s);
}
for (const s of r1Schools) if (!schoolMeta.has(keyOf(s.university))) schoolMeta.set(keyOf(s.university), s);

const SCOPE = new Set([...r1Keys, ...c2021.keys()]);

// IPEDS crosswalk is keyed by the corpus's own institution spellings, so it is
// re-keyed onto the canonical bucket before lookup.
const crosswalk = new Map();
for (const [name, v] of Object.entries(readResearch("ipeds/ipeds-crosswalk.json"))) {
  const k = keyOf(name);
  if (!crosswalk.has(k)) crosswalk.set(k, v);
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

const SUBDEAN_TITLE = /^(associate|assistant|vice|deputy|senior associate|senior assistant|acting associate|interim associate)\b/i;

/**
 * Distinct `school` values per (institution, index).
 *
 * A university often holds more than one deanship inside a single index: BYU has four
 * colleges in the arts-and-sciences file, Auburn has a College of Agriculture and a
 * College of Forestry in the agriculture file. Keying a unit by index alone folds them
 * into one seat, which then looks like two people holding the same chair at once --
 * it manufactured 465 spurious "overlapping spells" and 94 units with two sitting
 * deans in the first run of this export. So the unit key carries the school name
 * whenever the institution has more than one in that index, and stays clean
 * (`{institution_id}-BUSINESS`) when it does not.
 *
 * `central` is exempt: an institution has exactly one chief executive by definition,
 * so every central row belongs to `{institution_id}-CENTRAL` regardless of how the
 * source names the office.
 */
const schoolsPerUnit = new Map();
for (const [file] of [...SEATS, [PROVOST[0]]]) {
  for (const r of read(file)) {
    if (!r.startYear) continue;
    const k = `${keyOf(r.university)}|${file}`;
    if (!schoolsPerUnit.has(k)) schoolsPerUnit.set(k, new Set());
    schoolsPerUnit.get(k).add(r.school || "");
  }
}

/** Short, stable slug of a school name for use inside a unit id. */
const unitSlug = (s) =>
  String(s || "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 40);

const stats = {
  droppedOutOfScope: 0,
  droppedSubdean: 0,
  droppedRoster: 0,
  droppedNotChiefExec: 0,
  bySeat: {},
};

/** One appointment row per spell, or null if the source row is not an appointment. */
function toAppointment(r, file, seatLevel, unitType) {
  if (!r.startYear) {
    stats.droppedRoster++;
    return null;
  }
  const instKey = keyOf(r.university);
  if (!SCOPE.has(instKey)) {
    stats.droppedOutOfScope++;
    return null;
  }
  if (seatLevel === "dean" && (r.roleType === "subdean" || SUBDEAN_TITLE.test(String(r.discipline || "")))) {
    stats.droppedSubdean++;
    return null;
  }
  if (seatLevel === "president" && !isChiefExecutiveSeat(r, leaderTitleOf.get(instKey))) {
    stats.droppedNotChiefExec++;
    return null;
  }
  const start = isoDate(r.startYear, r.startLabel);
  const end = isoDate(r.endYear, r.endLabel);
  let unitId;
  if (unitType === "central") {
    unitId = `${idOf(r.university)}-CENTRAL`;
  } else {
    const base = `${idOf(r.university)}-${(OTHER_LABEL[file] || unitType).toUpperCase()}`;
    const schools = schoolsPerUnit.get(`${instKey}|${file}`);
    unitId = schools && schools.size > 1 ? `${base}-${unitSlug(r.school)}` : base;
  }
  return {
    _file: file,
    _instKey: instKey,
    _universityRaw: r.university,
    _schoolRaw: r.school || "",
    _row: r,
    institution_id: idOf(r.university),
    unit_id: unitId,
    seat_level: seatLevel,
    seat_title_raw: r.discipline || r.school || "",
    person_name: r.dean || "",
    start_date: start.date,
    start_precision: start.precision,
    end_date: end.date,
    end_precision: end.precision,
    is_current: r.endYear === null || r.endYear === undefined,
    is_interim: Boolean(r.isInterim),
    interim_word: interimWord(r),
    source_url: r.sourceUrl || "",
    record_confidence: r.sourceUrl ? "medium" : "low",
    source_type: sourceType(r.sourceUrl),
    is_internal_hire: r.isInternal === true ? true : r.isExternal === true ? false : "",
  };
}

/**
 * Which word the source used. Kept separate from `is_interim` on the requester's
 * instruction: some institutions reserve "acting" for a short administrative fill and
 * "interim" for a full holding appointment, and they want to test the distinction
 * before pooling. Empty when the flag is set but no word is recoverable from the text,
 * which is most of the corpus -- the flag came from the ETL's own origin coding, not
 * always from a title string.
 */
function interimWord(r) {
  if (!r.isInterim) return "";
  const hay = `${r.discipline || ""} ${r.priorTitle || ""} ${r.origin || ""} ${r.notes || ""}`.toLowerCase();
  if (/pro\s*tem/.test(hay)) return "pro_tempore";
  if (/\bacting\b/.test(hay)) return "acting";
  if (/\binterim\b/.test(hay)) return "interim";
  return "other";
}

/** Derived from the URL host; the corpus does not record a source type of its own. */
function sourceType(url) {
  if (!url) return "other";
  const u = url.toLowerCase();
  if (u.includes("web.archive.org")) return "wayback";
  if (u.includes("nces.ed.gov") || u.includes("ipeds")) return "ipeds";
  if (/\.edu(\/|$|:)/.test(u) || u.includes(".edu/")) return "institution_site";
  if (/(news|times|post|chronicle|insidehighered|poetsandquants|journal|gazette|tribune|herald|axios|reuters|forbes|bloomberg)/.test(u))
    return "news";
  return "other";
}

const raw = [];
for (const [file, seatLevel, unitType] of SEATS) {
  for (const r of read(file)) {
    const a = toAppointment(r, file, seatLevel, unitType);
    if (a) raw.push(a);
  }
}

// The eleven dual-vintage institutions have their whole president history in BOTH
// president files, and the two copies disagree on details. Keep the R1 index's copy,
// matching the tier assignment and the spec's open-item recommendation.
const dualVintage = new Set([...r1Keys].filter((k) => c2021.has(k)));
const deduped = raw.filter(
  (a) => !(a._file === "r1-r2public-deans.json" && dualVintage.has(a._instKey)),
);

/**
 * Collapse rows that are the same appointment entered twice.
 *
 * Interim status must match before two rows merge. An interim later confirmed is two
 * appointments, and folding them would delete a permanent appointment from the
 * denominator while keeping the interim one in the numerator -- the exact bias the
 * request's design decision 2 exists to prevent.
 */
function dedupe(list) {
  const out = [];
  const seen = new Map();
  for (const a of list.slice().sort((x, y) => x.start_date.localeCompare(y.start_date))) {
    const k = `${a.unit_id}|${surnameKey(a.person_name)}|${a.is_interim}`;
    const twin = (seen.get(k) || []).find((o) => Math.abs(+o.start_date.slice(0, 4) - +a.start_date.slice(0, 4)) <= 1);
    if (twin) {
      // Keep the more precise date and the longer-known end.
      if (a.start_precision === "month" && twin.start_precision === "year") {
        twin.start_date = a.start_date;
        twin.start_precision = a.start_precision;
      }
      if (!twin.end_date && a.end_date) {
        twin.end_date = a.end_date;
        twin.end_precision = a.end_precision;
        twin.is_current = a.is_current;
      }
      continue;
    }
    out.push(a);
    seen.set(k, [...(seen.get(k) || []), a]);
  }
  return out;
}
const appts = dedupe(deduped);
stats.dedupedAway = deduped.length - appts.length;

// --- ids, ordering, conversions -------------------------------------------

const personId = new Map();
const pidOf = (name) => {
  const norm = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|phd|ph d|edd|ed d|dba|esq|md|dr|sj|s j)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return "";
  if (!personId.has(norm)) personId.set(norm, `P${String(personId.size + 1).padStart(5, "0")}`);
  return personId.get(norm);
};

const byUnit = new Map();
for (const a of appts) {
  a.person_id = pidOf(a.person_name);
  (byUnit.get(a.unit_id) || byUnit.set(a.unit_id, []).get(a.unit_id)).push(a);
}
for (const [, list] of byUnit) {
  list.sort((x, y) => x.start_date.localeCompare(y.start_date));
  list.forEach((a, i) => {
    a.appointment_seq = i + 1;
    a.appointment_id = `${a.unit_id}-${a.start_date.slice(0, 4)}-${i + 1}`;
  });
  list.forEach((a, i) => {
    a.predecessor_appointment_id = i ? list[i - 1].appointment_id : "";
    // An interim confirmed: the same person's next non-interim spell in the same
    // seat, starting no more than three years later.
    a.converted_to_permanent = false;
    a.linked_permanent_id = "";
    if (a.is_interim) {
      const next = list
        .slice(i + 1)
        .find((o) => !o.is_interim && o.person_id === a.person_id && +o.start_date.slice(0, 4) - +a.start_date.slice(0, 4) <= 3);
      if (next) {
        a.converted_to_permanent = true;
        a.linked_permanent_id = next.appointment_id;
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const unitRows = new Map();
for (const a of appts) {
  const existing = unitRows.get(a.unit_id);
  const yr = +a.start_date.slice(0, 4);
  if (!existing) {
    const meta = schoolMeta.get(a._instKey);
    const typeFromFile = SEATS.find(([f]) => f === a._file);
    unitRows.set(a.unit_id, {
      unit_id: a.unit_id,
      institution_id: a.institution_id,
      unit_type: OTHER_LABEL[a._file] ? "other" : typeFromFile[2],
      unit_name: a._schoolRaw || (typeFromFile[2] === "central" ? "Office of the President" : ""),
      // The corpus records no reporting line. It is the spec's most important single
      // field and its H2 moderator, and inventing a plausible default would silently
      // decide the moderator test, so every row is empty and the QC report says so.
      reports_to: "",
      reports_to_source_url: "",
      reports_to_year_observed: "",
      aacsb_accredited: typeFromFile[2] === "business" ? true : "",
      accreditation_first_year: "",
      unit_founded_year: meta && meta.founded ? meta.founded : "",
      first_year_in_panel: yr,
      last_year_in_panel: yr,
      // `historyFrom` is the year the R2/R3 research actually reached, recorded per
      // institution by that build. Where it exists the depth is knowable; where it
      // does not, it is left empty rather than guessed from the earliest record found,
      // which would confuse "researched and found nothing" with "never researched".
      research_depth: researchDepth(a._instKey, a._file),
      earliest_year_researched: meta && meta.historyFrom ? meta.historyFrom : "",
    });
  } else {
    existing.first_year_in_panel = Math.min(existing.first_year_in_panel, yr);
    existing.last_year_in_panel = Math.max(existing.last_year_in_panel, yr);
  }
}

/**
 * Research depth, from what the build actually recorded rather than from the data's
 * shape. The R2/R3 schools file carries `truncated`, set by that build when its
 * research was capped at roughly 1996. Anything it marks untruncated was traced from
 * founding. Indexes with no such flag get `standard_web`, which is what they are: a
 * web sweep of whatever the institution publishes, with no stated floor.
 */
function researchDepth(instKey, file) {
  const meta = schoolMeta.get(instKey);
  if (meta && typeof meta.truncated === "boolean") return meta.truncated ? "light" : "deep_archival";
  if (file === "r1-university-deans.json") return "deep_archival";
  return "standard_web";
}

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

const instRows = new Map();
for (const a of appts) {
  if (instRows.has(a.institution_id)) continue;
  const k = a._instKey;
  const meta = schoolMeta.get(k) || {};
  const xw = crosswalk.get(k);
  const unitsHere = new Set(appts.filter((x) => x.institution_id === a.institution_id).map((x) => x._file));
  instRows.set(a.institution_id, {
    institution_id: a.institution_id,
    ipeds_unitid: xw ? xw.unitid : "",
    institution_name: meta.university || a._universityRaw,
    state: meta.state || "",
    control: meta.type === "Public" ? "public" : meta.type === "Private" ? "private_nonprofit" : "",
    // The R1 index follows the 2025 vintage and the R2/R3 universe the 2021 vintage,
    // so each column is populated only from the index that actually asserts it. An
    // institution in both carries both, which is what makes the eleven dual cases
    // auditable rather than silently resolved.
    carnegie_2021: c2021.get(k) || "",
    carnegie_2025: r1Keys.has(k) ? "R1" : "",
    carnegie_basic: "",
    is_system_member: Boolean(meta.system),
    system_name: meta.system || "",
    chief_exec_title: leaderTitleOf.get(k) || (meta.school === "Office of the Chancellor" ? "Chancellor" : "President"),
    has_med_school: unitsHere.has("r1-medschool-deans.json"),
    has_law_school: unitsHere.has("r1-lawschool-deans.json"),
    religious_affiliation: "",
    board_size: "",
    board_type: "",
    first_year_in_panel: Math.min(...appts.filter((x) => x.institution_id === a.institution_id).map((x) => +x.start_date.slice(0, 4))),
  });
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

const DEGREE = (r) => {
  const f = `${r.phdField || ""} ${r.discipline || ""}`.toLowerCase();
  if (r.hasPhd) return /\bed\.?d\b|education doctorate/.test(f) ? "edd" : "phd";
  if (/\bj\.?d\b|law/.test(f)) return "jd";
  if (/\bm\.?d\b|medicine/.test(f)) return "md";
  return "";
};
const peopleRows = new Map();
for (const a of appts) {
  if (!a.person_id) continue;
  const r = a._row;
  const prev = peopleRows.get(a.person_id);
  const yr = +a.start_date.slice(0, 4);
  if (!prev) {
    peopleRows.set(a.person_id, {
      person_id: a.person_id,
      full_name: a.person_name,
      gender: r.isFemale === true ? "f" : r.gender === "Male" || r.gender === "M" ? "m" : "unknown",
      highest_degree: DEGREE(r),
      degree_field: r.phdField || "",
      doctoral_institution_id: r.phdInstitution && SCOPE.has(keyOf(r.phdInstitution)) ? idOf(r.phdInstitution) : "",
      prior_position_title: r.priorTitle || "",
      prior_position_institution_id: r.priorInstitution && SCOPE.has(keyOf(r.priorInstitution)) ? idOf(r.priorInstitution) : "",
      prior_dean_experience: r.hasPriorDeanExp === true ? true : "",
      prior_president_experience: "",
      first_appearance_year: yr,
    });
  } else if (yr < prev.first_appearance_year) prev.first_appearance_year = yr;
}
// Prior-president experience is derivable from the panel itself: a president spell
// earlier than this person's first appearance elsewhere.
const presYears = new Map();
for (const a of appts) {
  if (a.seat_level !== "president" || !a.person_id) continue;
  const y = +a.start_date.slice(0, 4);
  presYears.set(a.person_id, Math.min(presYears.get(a.person_id) ?? y, y));
}
for (const [pid, row] of peopleRows) {
  const first = presYears.get(pid);
  row.prior_president_experience = first !== undefined && first < row.first_appearance_year ? true : "";
}

// ---------------------------------------------------------------------------
// Exits
// ---------------------------------------------------------------------------

/**
 * `unplanned_basis` is the H4 instrument, and the corpus barely has it.
 *
 * The request asks for death, incapacitating illness, scandal- or board-driven
 * departure, and abnormally short notice. The corpus has two related flags,
 * `surpriseDeparture` (54 TRUE across 17,563 dated spells) and `involuntary` (16),
 * and no announcement dates at all, so notice length is not derivable. Every row
 * whose flags say nothing therefore gets `undetermined`, per the request's explicit
 * instruction not to back-fill a guess. This is a genuine shortfall against H4 and
 * the QC report states the counts plainly.
 */
const DEST = {
  Still_serving: "",
  Provost_president_chancellor: "presidency_elsewhere",
  Another_deanship: "deanship_elsewhere",
  Faculty_emeritus: "faculty_return",
  Continued_same_college: "faculty_return",
  Full_retirement: "retirement",
  Retired: "retirement",
  Industry_nonprofit_govt: "industry",
  Deceased: "deceased",
  Unknown: "unknown",
};
const exitRows = [];
for (const a of appts) {
  if (!a.end_date) continue;
  const r = a._row;
  const dest = DEST[r.nextRole] ?? (r.nextRole ? "unknown" : "");
  let reason = "unknown";
  if (r.nextRole === "Deceased") reason = "death";
  else if (r.nextRole === "Full_retirement" || r.nextRole === "Retired") reason = "retirement";
  else if (r.nextRole === "Provost_president_chancellor" || r.nextRole === "Another_deanship") reason = "voluntary_upward";
  else if (r.nextRole === "Faculty_emeritus" || r.nextRole === "Continued_same_college") reason = "return_to_faculty";
  if (r.involuntary === true) reason = "forced_resignation";
  let basis = "undetermined";
  if (r.nextRole === "Deceased") basis = "death";
  else if (r.involuntary === true) basis = "board_dismissal";
  else if (r.surpriseDeparture === true) basis = "abrupt_resignation_short_notice";
  else if (reason === "retirement") basis = "not_unplanned";
  exitRows.push({
    appointment_id: a.appointment_id,
    exit_date: a.end_date,
    exit_date_precision: a.end_precision,
    exit_announcement_date: "",
    successor_named_at_announcement: "",
    exit_reason_primary: reason,
    exit_reason_detail: r.surpriseEvidence || r.notes || "",
    destination_type: dest,
    destination_institution_id: "",
    unplanned_basis: basis,
    coding_confidence: r.involuntary === true || r.surpriseDeparture === true ? "medium" : r.nextRole && r.nextRole !== "Unknown" ? "low" : "low",
    source_url: a.source_url,
  });
}

// ---------------------------------------------------------------------------
// Institution-year
// ---------------------------------------------------------------------------

/**
 * Only one of the seventeen requested columns exists.
 *
 * `research/ipeds/ipeds-panel.json` holds total fall enrolment (and degree counts,
 * which the spec does not ask for) for 2000-2024. There is no IPEDS Finance pull in
 * this repository, so endowment, state appropriations, tuition revenue, operating
 * revenue and expenses, private gifts and instructional staff are all absent, and so
 * are admissions. Credit ratings, accreditor actions, scandal and programme cuts were
 * never collected. The file is written with the columns present so the schema matches,
 * and the QC report lists what is empty and why.
 */
const ipedsPanel = readResearch("ipeds/ipeds-panel.json");
const instYearRows = [];
for (const [, inst] of instRows) {
  const panel = inst.ipeds_unitid ? ipedsPanel[inst.ipeds_unitid] : null;
  if (!panel) continue;
  for (let y = 1990; y <= 2025; y++) {
    const rec = panel[String(y)];
    if (!rec) continue;
    instYearRows.push({
      institution_id: inst.institution_id,
      year: y,
      fall_enrollment_total: rec.enrol ?? "",
      fall_enrollment_undergrad: "",
      first_time_freshmen: "",
      applicants: "",
      admits: "",
      endowment_market_value_eoy: "",
      state_appropriations: "",
      tuition_fees_revenue: "",
      total_operating_revenue: "",
      total_operating_expenses: "",
      instruction_expenses: "",
      private_gifts: "",
      fte_instructional_staff: "",
      credit_rating: "",
      rating_action_flag: "",
      accreditor_action_flag: "",
      public_scandal_flag: "",
      program_cuts_flag: "",
    });
  }
}

// ---------------------------------------------------------------------------
// Provost appointments (beyond the requested enum, supplied because H2 turns on it)
// ---------------------------------------------------------------------------

const provostRaw = [];
for (const r of read(PROVOST[0])) {
  const a = toAppointment(r, PROVOST[0], "dean", "central");
  if (a) {
    a.seat_level = "provost";
    a.unit_id = `${a.institution_id}-PROVOST`;
    provostRaw.push(a);
  }
}
const provosts = dedupe(provostRaw);
const provByUnit = new Map();
for (const a of provosts) {
  a.person_id = pidOf(a.person_name);
  (provByUnit.get(a.unit_id) || provByUnit.set(a.unit_id, []).get(a.unit_id)).push(a);
}
for (const [, list] of provByUnit) {
  list.sort((x, y) => x.start_date.localeCompare(y.start_date));
  list.forEach((a, i) => {
    a.appointment_seq = i + 1;
    a.appointment_id = `${a.unit_id}-${a.start_date.slice(0, 4)}-${i + 1}`;
    a.predecessor_appointment_id = i ? list[i - 1].appointment_id : "";
    a.converted_to_permanent = false;
    a.linked_permanent_id = "";
  });
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const APPT_COLS = [
  "appointment_id", "institution_id", "unit_id", "seat_level", "seat_title_raw", "person_id",
  "start_date", "start_precision", "end_date", "end_precision", "is_current", "is_interim",
  "interim_word", "converted_to_permanent", "linked_permanent_id", "predecessor_appointment_id",
  "appointment_seq", "is_left_censored", "announcement_date", "search_start_date", "search_firm",
  "is_internal_hire", "source_type", "source_url", "record_confidence",
];
for (const a of appts.concat(provosts)) {
  const u = unitRows.get(a.unit_id);
  a.is_left_censored = u ? +a.start_date.slice(0, 4) <= u.first_year_in_panel : false;
  a.announcement_date = "";
  a.search_start_date = "";
  a.search_firm = "";
}

const counts = {};
counts["appointments.csv"] = writeCsv("appointments.csv", APPT_COLS, appts);
counts["appointments_provost.csv"] = writeCsv("appointments_provost.csv", APPT_COLS, provosts);
counts["institutions.csv"] = writeCsv(
  "institutions.csv",
  ["institution_id", "ipeds_unitid", "institution_name", "state", "control", "carnegie_2021", "carnegie_2025",
   "carnegie_basic", "is_system_member", "system_name", "chief_exec_title", "has_med_school", "has_law_school",
   "religious_affiliation", "board_size", "board_type", "first_year_in_panel"],
  [...instRows.values()],
);
counts["units.csv"] = writeCsv(
  "units.csv",
  ["unit_id", "institution_id", "unit_type", "unit_name", "reports_to", "reports_to_source_url",
   "reports_to_year_observed", "aacsb_accredited", "accreditation_first_year", "unit_founded_year",
   "first_year_in_panel", "last_year_in_panel", "research_depth", "earliest_year_researched"],
  [...unitRows.values()],
);
counts["people.csv"] = writeCsv(
  "people.csv",
  ["person_id", "full_name", "gender", "highest_degree", "degree_field", "doctoral_institution_id",
   "prior_position_title", "prior_position_institution_id", "prior_dean_experience",
   "prior_president_experience", "first_appearance_year"],
  [...peopleRows.values()],
);
counts["exits.csv"] = writeCsv(
  "exits.csv",
  ["appointment_id", "exit_date", "exit_date_precision", "exit_announcement_date",
   "successor_named_at_announcement", "exit_reason_primary", "exit_reason_detail", "destination_type",
   "destination_institution_id", "unplanned_basis", "coding_confidence", "source_url"],
  exitRows,
);
counts["institution_year.csv"] = writeCsv(
  "institution_year.csv",
  ["institution_id", "year", "fall_enrollment_total", "fall_enrollment_undergrad", "first_time_freshmen",
   "applicants", "admits", "endowment_market_value_eoy", "state_appropriations", "tuition_fees_revenue",
   "total_operating_revenue", "total_operating_expenses", "instruction_expenses", "private_gifts",
   "fte_instructional_staff", "credit_rating", "rating_action_flag", "accreditor_action_flag",
   "public_scandal_flag", "program_cuts_flag"],
  instYearRows,
);

// ---------------------------------------------------------------------------
// QC report -- the nine checks the request asks to be run and returned
// ---------------------------------------------------------------------------

const L = [];
const say = (s = "") => L.push(s);
const tally = (rows, keyFn) => {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

say("QC report - succession panel export");
say(`generated ${new Date().toISOString().slice(0, 10)} from artifacts/dean-dashboard/src/data`);
say("=".repeat(72));
say();

say("1. Key integrity");
const ids = new Set();
let dupIds = 0;
for (const a of appts) (ids.has(a.appointment_id) ? dupIds++ : ids.add(a.appointment_id));
const badFk = appts.filter((a) => !instRows.has(a.institution_id) || !unitRows.get(a.unit_id)).length;
const badPerson = appts.filter((a) => a.person_id && !peopleRows.has(a.person_id)).length;
say(`   duplicate appointment_id: ${dupIds}`);
say(`   appointments with an unresolved institution_id or unit_id: ${badFk}`);
say(`   appointments with an unresolved person_id: ${badPerson}`);
say();

say("2. Every appointment row has a start_date");
say(`   rows without one: ${appts.filter((a) => !a.start_date).length} (roster rows are excluded by construction)`);
say(`   source rows dropped as roster (no start date): ${stats.droppedRoster}`);
say(`   source rows dropped as associate/assistant dean despite a start date: ${stats.droppedSubdean}`);
say(`   source rows dropped as not the chief executive seat: ${stats.droppedNotChiefExec}`);
say(`   source rows dropped as outside the Carnegie scope: ${stats.droppedOutOfScope}`);
say(`   duplicate rows collapsed (same seat, same person, same interim status): ${stats.dedupedAway}`);
say();

say("3. Overlapping permanent spells in the same seat (reported, not resolved)");
let overlaps = 0;
const overlapExamples = [];
for (const [unit, list] of byUnit) {
  const perm = list.filter((a) => !a.is_interim).sort((x, y) => x.start_date.localeCompare(y.start_date));
  for (let i = 0; i + 1 < perm.length; i++) {
    const endY = perm[i].end_date ? +perm[i].end_date.slice(0, 4) : null;
    if (endY === null || endY > +perm[i + 1].start_date.slice(0, 4)) {
      overlaps++;
      if (overlapExamples.length < 10) overlapExamples.push(`${unit}: ${perm[i].person_name} (${perm[i].start_date.slice(0, 4)}-${endY ?? "open"}) vs ${perm[i + 1].person_name} (${perm[i + 1].start_date.slice(0, 4)})`);
    }
  }
}
say(`   count: ${overlaps}`);
overlapExamples.forEach((e) => say(`     ${e}`));
say();

say("4. At most one is_current row per unit");
const multiCurrent = [...byUnit.entries()].filter(([, l]) => l.filter((a) => a.is_current).length > 1);
say(`   units with more than one: ${multiCurrent.length}`);
multiCurrent.slice(0, 10).forEach(([u, l]) => say(`     ${u}: ${l.filter((a) => a.is_current).length}`));
say();

say("5. converted_to_permanent rows link correctly");
const conv = appts.filter((a) => a.converted_to_permanent);
const badLink = conv.filter((a) => {
  const t = appts.find((x) => x.appointment_id === a.linked_permanent_id);
  return !t || t.person_id !== a.person_id || t.start_date < a.start_date;
}).length;
say(`   conversions found: ${conv.length}   malformed links: ${badLink}`);
say(`   of which president seats: ${conv.filter((a) => a.seat_level === "president").length}`);
say();

say("6. Appointments by start_precision  <-- how much of the panel supports month resolution");
tally(appts, (a) => a.start_precision).forEach(([k, v]) => say(`   ${k.padEnd(6)} ${String(v).padStart(6)}  ${((100 * v) / appts.length).toFixed(1)}%`));
say("   month-precision rows by unit type:");
tally(appts.filter((a) => a.start_precision !== "year"), (a) => unitRows.get(a.unit_id)?.unit_type || "?").forEach(([k, v]) => say(`     ${k.padEnd(14)} ${v}`));
say();

say("7. Appointments by decade x research_depth  <-- the H5 diagnostic");
const decades = [...new Set(appts.map((a) => Math.floor(+a.start_date.slice(0, 4) / 10) * 10))].sort();
const depths = ["deep_archival", "standard_web", "light"];
say(`   decade  ${depths.map((d) => d.padStart(14)).join("")}`);
for (const d of decades) {
  const row = depths.map((dep) => String(appts.filter((a) => Math.floor(+a.start_date.slice(0, 4) / 10) * 10 === d && unitRows.get(a.unit_id)?.research_depth === dep).length).padStart(14));
  say(`   ${String(d).padEnd(8)}${row.join("")}`);
}
say();

say("8. is_interim by unit_type and seat_level");
say(`   ${"unit_type".padEnd(16)}${"appts".padStart(8)}${"interim".padStart(9)}${"rate".padStart(8)}`);
for (const [ut] of tally(appts, (a) => unitRows.get(a.unit_id)?.unit_type || "?")) {
  const rows = appts.filter((a) => (unitRows.get(a.unit_id)?.unit_type || "?") === ut);
  const k = rows.filter((a) => a.is_interim).length;
  say(`   ${ut.padEnd(16)}${String(rows.length).padStart(8)}${String(k).padStart(9)}${((100 * k) / rows.length).toFixed(1).padStart(7)}%`);
}
for (const sl of ["president", "dean"]) {
  const rows = appts.filter((a) => a.seat_level === sl);
  const k = rows.filter((a) => a.is_interim).length;
  say(`   seat_level=${sl.padEnd(10)} ${rows.length} appts, ${k} interim = ${((100 * k) / rows.length).toFixed(1)}%`);
}
const biz1996 = appts.filter((a) => unitRows.get(a.unit_id)?.unit_type === "business" && +a.start_date.slice(0, 4) >= 1996);
say(`   cross-check vs the published 32.4% business figure (1996+): ${biz1996.filter((a) => a.is_interim).length}/${biz1996.length} = ${((100 * biz1996.filter((a) => a.is_interim).length) / biz1996.length).toFixed(1)}%`);
say();

say("9. Row counts and deliberate exclusions");
Object.entries(counts).forEach(([f, n]) => say(`   ${f.padEnd(28)} ${String(n).padStart(7)} rows`));
say(`   institutions in scope: ${instRows.size}   units: ${unitRows.size}   people: ${peopleRows.size}`);
say();
say("   Excluded on purpose:");
say("     r1-provost-deans.json        provosts are outside the president|dean enum;");
say("                                  exported separately as appointments_provost.csv");
say("     r1-system-deans.json         system heads sit above the institution");
say("     r1-lac-*, r1-communitycollege-*  outside both Carnegie indexes");
say("     r1-adminleaders-*, r1-advancement-*  vice presidents, not deans");
say("     deans.json                   Top-100 business cut; overlaps r1-bschool");
say();

say("Gaps against the request, stated plainly");
say("-".repeat(72));
const gapYears = [];
for (const [, list] of byUnit) {
  const sorted = list.slice().sort((x, y) => x.start_date.localeCompare(y.start_date));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const e = sorted[i].end_date ? +sorted[i].end_date.slice(0, 4) : null;
    if (e !== null && +sorted[i + 1].start_date.slice(0, 4) - e >= 2) gapYears.push(+sorted[i + 1].start_date.slice(0, 4) - e);
  }
}
say(`  VACANT rows: none. The corpus records occupants, not seat states, so a gap`);
say(`    between spells cannot be told apart from an unresearched stretch. Gaps of two`);
say(`    years or more between consecutive spells in the same seat: ${gapYears.length}.`);
say(`  reports_to: empty on all ${unitRows.size} units. The corpus has no reporting line.`);
say(`    This is the H2 moderator, so it is the highest-value field to collect next.`);
say(`  announcement_date, search_start_date, search_firm: empty. Never collected.`);
say(`  exit_announcement_date, successor_named_at_announcement: empty. Never collected,`);
say(`    so notice length is not derivable and H4 has no short-notice marker.`);
const basis = tally(exitRows, (e) => e.unplanned_basis);
say(`  unplanned_basis distribution across ${exitRows.length} completed spells:`);
basis.forEach(([k, v]) => say(`    ${k.padEnd(34)} ${v}`));
say(`    The corpus flags carry ${exitRows.filter((e) => e.unplanned_basis !== "undetermined" && e.unplanned_basis !== "not_unplanned").length} genuinely unplanned exits. H4 needs new coding.`);
say(`  institution_year.csv: only fall_enrollment_total is populated, 2000-2024, for`);
say(`    ${new Set(instYearRows.map((r) => r.institution_id)).size} institutions. No IPEDS Finance or Admissions pull exists in this`);
say(`    repository, so endowment, appropriations, revenue, expenses, gifts, staff and`);
say(`    admissions are all empty, as are the three hand-coded distress flags.`);
say(`  earliest_year_researched: populated on ${[...unitRows.values()].filter((u) => u.earliest_year_researched).length} of ${unitRows.size} units, from the R2/R3`);
say(`    build's own historyFrom. Empty elsewhere rather than guessed from the earliest`);
say(`    record found, which would confuse "researched, found nothing" with "not researched".`);
// The ETL sometimes writes the extract year as an end year when the true one was
// never found, and says so in the row's notes. Most 2026 ends are genuine, but the
// exceptions land in exits.csv as a real exit date, so their scale is worth stating.
const endsAtExtractYear = appts.filter((a) => a.end_date.startsWith("2026")).length;
const undocumentedEnd = appts.filter(
  (a) => a.end_date.startsWith("2026") && /not (reliably |precisely )?(documented|confirmed|verified)/i.test(String(a._row.notes || "")),
).length;
say(`  exit_date caution: ${endsAtExtractYear} spells end in 2026, the extract year, and ${undocumentedEnd} of those`);
say(`    carry notes saying the end year was never documented -- the ETL used the extract`);
say(`    year as a placeholder. Treat 2026 exits as soft, especially for long-closed spells`);
say(`    (Tennessee's founding law dean is recorded 1890-2026).`);
say(`  person_id is name-derived. Two people with one name merge; one person under two`);
say(`    spellings splits. ${peopleRows.size} people across ${appts.length} appointments.`);

const report = L.join("\n") + "\n";
writeFileSync(join(OUT, "qc_report.txt"), report, "utf8");
console.log(report);
console.log(`wrote ${Object.keys(counts).length + 1} files to ${OUT}`);
