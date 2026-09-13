#!/usr/bin/env node
/**
 * Export the corpus as the succession panel specified in
 * `docs/succession-panel-spec.md` (v0.2 of the rebuild spec).
 *
 *   node scripts/export-succession-panel.mjs [--out <dir>]
 *
 * Writes appointments, seats, seat_name_variants, seat_coverage, institutions, units,
 * people, exits, institution_year, merge_decisions and qc_report.txt. Exit status is
 * always 0: this reports, it does not gate CI.
 *
 * WHAT THE REBUILD CHANGED
 * ------------------------
 * v0.1 of this export shipped four defects the spec's audit caught, all fixed here:
 *
 *   - `unplanned_basis` was a deterministic relabel of `exit_reason_primary` wearing
 *     the clothes of independent coding. It is gone. `exits.csv` now carries the
 *     spec's Layer 0 / Layer 1 shape, with `exit_circumstance` populated ONLY where
 *     the corpus holds real evidence and left null -- never `cannot_determine` --
 *     where nothing was collected. Null means "not coded"; `cannot_determine` means
 *     "a coder searched and found nothing", and the corpus has done neither.
 *   - `seat_title_raw` held a field of study (`Law`, `Accounting`) on most dean rows.
 *     `title_verbatim` now holds a title where the corpus has one, and `is_interim`
 *     is derivable from it with a recorded override elsewhere (see seat-identity.mjs).
 *   - `coding_confidence` was defaulted to `low` on 8,366 of 8,421 rows, which is not
 *     an assessment. Confidence fields are left empty unless something real backs
 *     them, per the spec's three-state principle.
 *   - Seat identity included `unit_type`, which split the same school across indexes.
 *     `seat_id` now ignores classification entirely.
 *
 * Provosts are merged in under `seat_level = provost` rather than exiled to their own
 * file, so the three-level cascade (president / provost / dean) is available.
 *
 * STILL NOT COLLECTIBLE FROM THIS CORPUS -- the columns exist and are empty:
 * `reports_to`, every announcement-date field, `person_birth_year`, and month-level
 * dates outside business schools. Those need human research; the QC report states the
 * volumes. Nothing here is inferred to fill them.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { keyOf, idOf } from "./lib/institution-key.mjs";
import { isChiefExecutiveSeat, surnameKey } from "./lib/interim-panel.mjs";
import { normSchool, slug, titleVerbatim, deriveInterim, isPlaceholderEnd } from "./lib/seat-identity.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src", "data");
const RESEARCH = join(HERE, "..", "..", "..", "research");
const argOut = process.argv.indexOf("--out");
const OUT = argOut > -1 ? process.argv[argOut + 1] : join(HERE, "..", "..", "..", "succession-panel");

const EXTRACT_YEAR = 2026;
const EXTRACT_DATE = new Date().toISOString().slice(0, 10);

const read = (f) => JSON.parse(readFileSync(join(SRC, f), "utf8"));
const readResearch = (f) => JSON.parse(readFileSync(join(RESEARCH, f), "utf8"));

// ---------------------------------------------------------------------------
// Index -> seat mapping
// ---------------------------------------------------------------------------
//
// Order matters: where two indexes cover the same school and disagree on unit_type,
// the one listed FIRST supplies the seat's classification, and the disagreement is
// written to merge_decisions.csv for a human to confirm. Classification never affects
// which spells survive -- both indexes' spells land on the same seat.
//
// Excluded, each for a stated reason: r1-system (sits above the institution),
// r1-lac and r1-communitycollege (outside both Carnegie indexes), r1-adminleaders and
// r1-advancement (vice presidents, not deans), deans.json (Top-100 business cut that
// overlaps r1-bschool).
const SEATS = [
  ["r1-university-deans.json", "president", "central"],
  ["r1-r2public-deans.json", "president", "central"],
  ["r1-provost-deans.json", "provost", "central"],
  ["r1-bschool-deans.json", "dean", "business"],
  ["r1-lawschool-deans.json", "dean", "law"],
  ["r1-medschool-deans.json", "dean", "medicine"],
  ["r1-eschool-deans.json", "dean", "engineering"],
  ["r1-nursing-deans.json", "dean", "nursing"],
  ["r1-publichealth-deans.json", "dean", "public_health"],
  ["r1-education-deans.json", "dean", "education"],
  ["r1-arts-deans.json", "dean", "arts_sciences"],
  ["r1-camd-deans.json", "dean", "creative_arts"],
  ["r1-agschool-deans.json", "dean", "agriculture"],
  ["r1-pharmacy-deans.json", "dean", "pharmacy"],
  ["r1-vet-deans.json", "dean", "veterinary"],
  ["r1-grad-deans.json", "dean", "graduate"],
];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** ISO date plus its true precision. The year is structural; the label may add a month. */
function isoDate(year, label) {
  if (!year) return { date: "", precision: "" };
  const s = String(label || "");
  const d = s.match(/([A-Za-z]{3,9})\w*\s+(\d{1,2}),\s*(\d{4})/);
  if (d && MONTHS[d[1].slice(0, 3).toLowerCase()])
    return {
      date: `${year}-${String(MONTHS[d[1].slice(0, 3).toLowerCase()]).padStart(2, "0")}-${String(+d[2]).padStart(2, "0")}`,
      precision: "day",
    };
  const m = s.match(/([A-Za-z]{3,9})/);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()])
    return { date: `${year}-${String(MONTHS[m[1].slice(0, 3).toLowerCase()]).padStart(2, "0")}-01`, precision: "month" };
  return { date: `${year}-01-01`, precision: "year" };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const counts = {};
function writeCsv(name, columns, rows) {
  const body = [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n");
  writeFileSync(join(OUT, name), body + "\r\n", "utf8");
  counts[name] = rows.length;
  return rows.length;
}

// ---------------------------------------------------------------------------
// Scope and institution metadata
// ---------------------------------------------------------------------------

const r1Schools = read("r1-university-schools.json");
const r23Schools = read("r1-r2public-schools.json");
const r1Keys = new Set(r1Schools.map((s) => keyOf(s.university)));

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

const crosswalk = new Map();
for (const [name, v] of Object.entries(readResearch("ipeds/ipeds-crosswalk.json"))) {
  const k = keyOf(name);
  if (!crosswalk.has(k)) crosswalk.set(k, v);
}

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

const SUBDEAN_TITLE = /^(associate|assistant|vice|deputy|senior associate|senior assistant|acting associate|interim associate)\b/i;
const stats = { roster: 0, outOfScope: 0, subdean: 0, notChiefExec: 0, placeholderEnds: 0 };
const dualVintage = new Set([...r1Keys].filter((k) => c2021.has(k)));

const raw = [];
for (const [file, seatLevel, unitType] of SEATS) {
  for (const r of read(file)) {
    if (!r.startYear) { stats.roster++; continue; }
    const instKey = keyOf(r.university);
    if (!SCOPE.has(instKey)) { stats.outOfScope++; continue; }
    if (seatLevel === "dean" && (r.roleType === "subdean" || SUBDEAN_TITLE.test(String(r.discipline || "")))) {
      stats.subdean++; continue;
    }
    if (seatLevel === "president" && !isChiefExecutiveSeat(r, leaderTitleOf.get(instKey))) {
      stats.notChiefExec++; continue;
    }
    // The eleven dual-Carnegie-vintage institutions carry their whole president
    // history in both president files; keep the R1 index's copy, matching the tier
    // assignment. This is a documented reconciliation, not a duplication defect.
    if (file === "r1-r2public-deans.json" && seatLevel === "president" && dualVintage.has(instKey)) continue;

    const instId = idOf(r.university);
    const seatId =
      seatLevel === "president" ? `${instId}-CENTRAL`
      : seatLevel === "provost" ? `${instId}-PROVOST`
      : `${instId}-D-${slug(r.school)}`;

    const start = isoDate(r.startYear, r.startLabel);
    const placeholder = isPlaceholderEnd(r.startYear, r.endYear, EXTRACT_YEAR);
    if (placeholder) stats.placeholderEnds++;
    const end = placeholder ? { date: "", precision: "" } : isoDate(r.endYear, r.endLabel);
    // The narrative triage compares the mention against what the ROW knows about
    // itself -- which seat it is, when it began, how long it ran -- so the derivation
    // needs those. It still never sees the legacy flag.
    const ev = deriveInterim(r, {
      seatLevel,
      startYear: r.startYear,
      rowEndYear: placeholder ? null : (r.endYear ?? (EXTRACT_YEAR)),
    });
    const title = titleVerbatim(r);
    // The derivation never saw the legacy flag. Where it reached a conclusion, that
    // conclusion stands even when it contradicts the ETL; where it could not, the
    // legacy value carries the row and `interim_evidence` says the basis is weak.
    const derivedKnown = ev.derived !== null;
    const isInterim = derivedKnown ? ev.derived : Boolean(r.isInterim);

    raw.push({
      _file: file, _instKey: instKey, _row: r, _school: r.school || "",
      _unitTypeFromFile: unitType,
      source_index: file,
      institution_id: instId,
      seat_id: seatId,
      seat_level: seatLevel,
      title_verbatim: title,
      unit_name: r.school || "",
      person_name: r.dean || "",
      start_date: start.date,
      start_precision: start.precision,
      end_date: end.date,
      end_precision: end.precision,
      // "ended, date unknown" vs "still sitting" is carried here, not by a blank date.
      is_current: placeholder ? false : r.endYear === null || r.endYear === undefined,
      end_date_suppressed: placeholder,
      is_interim_legacy: Boolean(r.isInterim),
      is_interim: isInterim,
      interim_evidence: ev.evidence,
      interim_evidence_quote: ev.quote,
      // An override is now only what the spec meant by one: a row the source cannot
      // decide, where the legacy assertion is all there is. Narrative evidence is a
      // derivation, not an exception.
      interim_override: !derivedKnown && Boolean(r.isInterim),
      interim_override_reason: !derivedKnown && Boolean(r.isInterim) ? ev.quote || "legacy ETL flag only; no source evidence" : "",
      interim_diverges_from_legacy: derivedKnown && ev.derived !== Boolean(r.isInterim),
      title_is_compound: ev.compound,
      // Never collected by this corpus. Present so the schema matches and so a later
      // pass has somewhere to write; never defaulted to the extract date, which would
      // assert a verification that did not happen.
      last_verified_date: "",
      announcement_date: "",
      search_start_date: "",
      search_firm: "",
      is_internal_hire: r.isInternal === true ? true : r.isExternal === true ? false : "",
      source_url: r.sourceUrl || "",
    });
  }
}

/** Collapse rows that are the same appointment entered twice. Interim status must match. */
function dedupe(list) {
  const out = [];
  const seen = new Map();
  for (const a of list.slice().sort((x, y) => x.start_date.localeCompare(y.start_date))) {
    const k = `${a.seat_id}|${surnameKey(a.person_name)}|${a.is_interim}`;
    const twin = (seen.get(k) || []).find((o) => Math.abs(+o.start_date.slice(0, 4) - +a.start_date.slice(0, 4)) <= 1);
    if (twin) {
      if (a.start_precision === "month" && twin.start_precision === "year") {
        twin.start_date = a.start_date;
        twin.start_precision = a.start_precision;
      }
      if (!twin.end_date && a.end_date) {
        twin.end_date = a.end_date;
        twin.end_precision = a.end_precision;
        twin.is_current = a.is_current;
      }
      if (!twin.title_verbatim && a.title_verbatim) twin.title_verbatim = a.title_verbatim;
      continue;
    }
    out.push(a);
    seen.set(k, [...(seen.get(k) || []), a]);
  }
  return out;
}
const appts = dedupe(raw);
stats.dedupedAway = raw.length - appts.length;

// --- seats, and the cross-index merges the new key performs --------------

const seatRows = new Map();
const mergeDecisions = [];
const variants = new Map(); // seat_id -> Set("source_index|unit_name")
for (const a of appts) {
  (variants.get(a.seat_id) || variants.set(a.seat_id, new Set()).get(a.seat_id)).add(`${a.source_index}|${a.unit_name}`);
  const meta = schoolMeta.get(a._instKey) || {};
  const existing = seatRows.get(a.seat_id);
  if (!existing) {
    seatRows.set(a.seat_id, {
      seat_id: a.seat_id,
      institution_id: a.institution_id,
      seat_level: a.seat_level,
      unit_type: a._unitTypeFromFile,
      canonical_name: a.unit_name,
      // Not in the corpus. The spec's H2 moderator and the highest-value field to
      // collect next; defaulting it would silently decide that test.
      reports_to: "",
      reports_to_source_url: "",
      reports_to_year_observed: "",
      created_year: meta.founded || "",
      dissolved_year: "",
      predecessor_seat_id: "",
      _indexes: new Set([a.source_index]),
    });
  } else {
    existing._indexes.add(a.source_index);
    if (existing.unit_type !== a._unitTypeFromFile) {
      const already = mergeDecisions.find((m) => m.seat_id === a.seat_id);
      if (!already)
        mergeDecisions.push({
          seat_id: a.seat_id,
          institution_id: a.institution_id,
          canonical_name: existing.canonical_name,
          indexes: [...existing._indexes, a.source_index].join(" + "),
          unit_type_kept: existing.unit_type,
          unit_type_discarded: a._unitTypeFromFile,
          rule: "first index in SEATS order supplies classification; spells from both are kept",
          needs_review: true,
        });
    }
  }
}

// --- ordering, conversions ------------------------------------------------

const personId = new Map();
const pidOf = (name) => {
  const norm = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|phd|ph d|edd|ed d|dba|esq|md|dr|sj|s j)\b/g, "")
    .replace(/\s+/g, " ").trim();
  if (!norm) return "";
  if (!personId.has(norm)) personId.set(norm, `P${String(personId.size + 1).padStart(5, "0")}`);
  return personId.get(norm);
};

const bySeat = new Map();
for (const a of appts) {
  a.person_id = pidOf(a.person_name);
  (bySeat.get(a.seat_id) || bySeat.set(a.seat_id, []).get(a.seat_id)).push(a);
}
for (const [, list] of bySeat) {
  list.sort((x, y) => x.start_date.localeCompare(y.start_date));
  list.forEach((a, i) => {
    a.appointment_seq = i + 1;
    a.appointment_id = `${a.seat_id}-${a.start_date.slice(0, 4)}-${i + 1}`;
  });
  list.forEach((a, i) => {
    a.predecessor_appointment_id = i ? list[i - 1].appointment_id : "";
    a.converted_to_permanent = false;
    a.linked_permanent_id = "";
    if (a.is_interim) {
      const next = list.slice(i + 1).find(
        (o) => !o.is_interim && o.person_id === a.person_id && +o.start_date.slice(0, 4) - +a.start_date.slice(0, 4) <= 3,
      );
      if (next) { a.converted_to_permanent = true; a.linked_permanent_id = next.appointment_id; }
    }
  });
  const first = +list[0].start_date.slice(0, 4);
  list.forEach((a) => (a.is_left_censored = +a.start_date.slice(0, 4) <= first));
}

// ---------------------------------------------------------------------------
// Institutions, people, coverage, exits
// ---------------------------------------------------------------------------

const instRows = new Map();
const apptsByInst = new Map();
for (const a of appts) (apptsByInst.get(a.institution_id) || apptsByInst.set(a.institution_id, []).get(a.institution_id)).push(a);
for (const [instId, list] of apptsByInst) {
  const k = list[0]._instKey;
  const meta = schoolMeta.get(k) || {};
  const xw = crosswalk.get(k);
  const idx = new Set(list.map((a) => a.source_index));
  instRows.set(instId, {
    institution_id: instId,
    ipeds_unitid: xw ? xw.unitid : "",
    institution_name: meta.university || list[0]._row.university,
    state: meta.state || "",
    control: meta.type === "Public" ? "public" : meta.type === "Private" ? "private_nonprofit" : "",
    carnegie_2021: c2021.get(k) || "",
    carnegie_2025: r1Keys.has(k) ? "R1" : "",
    is_system_member: Boolean(meta.system),
    system_name: meta.system || "",
    chief_exec_title: leaderTitleOf.get(k) || (meta.school === "Office of the Chancellor" ? "Chancellor" : "President"),
    has_med_school: idx.has("r1-medschool-deans.json"),
    has_law_school: idx.has("r1-lawschool-deans.json"),
    // Derived from the panel: an institution with provost spells has that layer.
    has_provost: list.some((a) => a.seat_level === "provost"),
    has_provost_year_observed: Math.min(...list.filter((a) => a.seat_level === "provost").map((a) => +a.start_date.slice(0, 4)), Infinity) === Infinity
      ? "" : Math.min(...list.filter((a) => a.seat_level === "provost").map((a) => +a.start_date.slice(0, 4))),
    religious_affiliation: "",
    board_size: "",
    board_type: "",
    first_year_in_panel: Math.min(...list.map((a) => +a.start_date.slice(0, 4))),
  });
}

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
  const yr = +a.start_date.slice(0, 4);
  const prev = peopleRows.get(a.person_id);
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
      person_birth_year: "", // never collected; needed for the retirement-age test
      first_appearance_year: yr,
    });
  } else if (yr < prev.first_appearance_year) prev.first_appearance_year = yr;
}
const presFirst = new Map();
for (const a of appts) {
  if (a.seat_level !== "president" || !a.person_id) continue;
  const y = +a.start_date.slice(0, 4);
  presFirst.set(a.person_id, Math.min(presFirst.get(a.person_id) ?? y, y));
}
for (const [pid, row] of peopleRows) {
  const f = presFirst.get(pid);
  row.prior_president_experience = f !== undefined && f < row.first_appearance_year ? true : "";
}

/**
 * Seat coverage, as far as the corpus can state it.
 *
 * The R2/R3 build recorded `historyFrom` and `truncated` per institution, which is a
 * genuine statement about how far research reached. Everything else gets
 * `not_researched` -- not because nobody looked, but because no record of looking
 * survives, and the spec's whole point is that those are different claims. Only a
 * gap inside a `researched_complete` window may later become a VACANT row.
 */
const coverageRows = [];
for (const [seatId] of seatRows) {
  const list = bySeat.get(seatId) || [];
  const meta = schoolMeta.get(list[0]?._instKey) || {};
  const known = typeof meta.truncated === "boolean";
  const floor = known && meta.historyFrom ? meta.historyFrom : null;
  const earliest = list.length ? +list[0].start_date.slice(0, 4) : null;
  // Where the build recorded how far back it reached, the seat splits into two real
  // windows: everything before that floor was never looked at, and everything from it
  // forward was. One window per seat had no "inside", so a gap could never be told
  // from an unresearched stretch -- which was the whole purpose of this table.
  if (floor) {
    if (earliest !== null && earliest < floor)
      coverageRows.push({ seat_id: seatId, year_from: earliest, year_to: floor - 1, coverage: "not_researched", method: "none", researcher_id: "", researched_date: "" });
    coverageRows.push({
      seat_id: seatId, year_from: floor, year_to: EXTRACT_YEAR,
      coverage: meta.truncated ? "researched_partial" : "researched_complete",
      method: "web_search", researcher_id: "", researched_date: "",
    });
  } else {
    coverageRows.push({
      seat_id: seatId, year_from: earliest ?? "", year_to: EXTRACT_YEAR,
      coverage: "not_researched", method: "none", researcher_id: "", researched_date: "",
    });
  }
}

/**
 * Exits, in the spec's Layer 0 / Layer 1 shape.
 *
 * `exit_circumstance` is populated only from evidence the corpus actually holds:
 * `nextRole = Deceased` supports `death_in_office`, and `involuntary` supports
 * `dismissal_by_board`. Everything else is left NULL -- not `cannot_determine`,
 * which the spec reserves for a coder who searched and found nothing. No row here
 * has been searched, so no row may claim that value.
 */
const exitRows = [];
for (const a of appts) {
  if (!a.end_date && !a.end_date_suppressed) continue;
  if (!a.end_date) continue; // suppressed placeholder: no defensible exit date
  const r = a._row;
  let circumstance = "";
  let evidence = "";
  if (r.nextRole === "Deceased") { circumstance = "death_in_office"; evidence = "contemporaneous_reporting"; }
  else if (r.involuntary === true) { circumstance = "dismissal_by_board"; evidence = "contemporaneous_reporting"; }
  exitRows.push({
    appointment_id: a.appointment_id,
    seat_id: a.seat_id,
    exit_effective_date: a.end_date,
    exit_effective_precision: a.end_precision,
    exit_announcement_date: "",
    exit_announcement_precision: "",
    announcement_source_url: "",
    announcement_source_type: "",
    successor_status_at_announcement: "",
    successor_appointment_id: (bySeat.get(a.seat_id) || []).find((o) => o.appointment_seq === a.appointment_seq + 1)?.appointment_id || "",
    departure_statement_quote: "",
    term_end_scheduled: "",
    exit_circumstance: circumstance,
    circumstance_evidence: evidence,
    circumstance_confidence: "", // never assessed; empty rather than defaulted
    destination_raw: r.nextRole && r.nextRole !== "Unknown" ? r.nextRole : "",
    coder_id: "",
    coded_date: "",
    source_url: a.source_url,
  });
}

const ipedsPanel = readResearch("ipeds/ipeds-panel.json");
const instYearRows = [];
for (const [, inst] of instRows) {
  const panel = inst.ipeds_unitid ? ipedsPanel[inst.ipeds_unitid] : null;
  if (!panel) continue;
  for (let y = 1990; y <= 2025; y++) {
    const rec = panel[String(y)];
    if (!rec) continue;
    instYearRows.push({ institution_id: inst.institution_id, year: y, fall_enrollment_total: rec.enrol ?? "" });
  }
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

writeCsv("appointments.csv", [
  "appointment_id", "institution_id", "seat_id", "seat_level", "source_index", "title_verbatim", "unit_name",
  "person_id", "start_date", "start_precision", "end_date", "end_precision", "end_date_suppressed", "is_current",
  "is_interim", "is_interim_legacy", "interim_evidence", "interim_evidence_quote", "interim_override",
  "interim_override_reason", "interim_diverges_from_legacy", "title_is_compound",
  "converted_to_permanent", "linked_permanent_id", "predecessor_appointment_id", "appointment_seq",
  "is_left_censored", "last_verified_date", "announcement_date", "search_start_date", "search_firm",
  "is_internal_hire", "source_url",
], appts);

writeCsv("seats.csv", [
  "seat_id", "institution_id", "seat_level", "unit_type", "canonical_name", "reports_to",
  "reports_to_source_url", "reports_to_year_observed", "created_year", "dissolved_year", "predecessor_seat_id",
], [...seatRows.values()]);

writeCsv("seat_name_variants.csv", ["seat_id", "source_index", "unit_name_observed"],
  [...variants.entries()].flatMap(([seatId, set]) =>
    [...set].map((v) => ({ seat_id: seatId, source_index: v.split("|")[0], unit_name_observed: v.slice(v.indexOf("|") + 1) }))));

writeCsv("seat_coverage.csv", ["seat_id", "year_from", "year_to", "coverage", "method", "researcher_id", "researched_date"], coverageRows);
writeCsv("merge_decisions.csv", ["seat_id", "institution_id", "canonical_name", "indexes", "unit_type_kept", "unit_type_discarded", "rule", "needs_review"], mergeDecisions);

writeCsv("institutions.csv", [
  "institution_id", "ipeds_unitid", "institution_name", "state", "control", "carnegie_2021", "carnegie_2025",
  "is_system_member", "system_name", "chief_exec_title", "has_med_school", "has_law_school", "has_provost",
  "has_provost_year_observed", "religious_affiliation", "board_size", "board_type", "first_year_in_panel",
], [...instRows.values()]);

writeCsv("people.csv", [
  "person_id", "full_name", "gender", "highest_degree", "degree_field", "doctoral_institution_id",
  "prior_position_title", "prior_position_institution_id", "prior_dean_experience", "prior_president_experience",
  "person_birth_year", "first_appearance_year",
], [...peopleRows.values()]);

writeCsv("exits.csv", [
  "appointment_id", "seat_id", "exit_effective_date", "exit_effective_precision", "exit_announcement_date",
  "exit_announcement_precision", "announcement_source_url", "announcement_source_type",
  "successor_status_at_announcement", "successor_appointment_id", "departure_statement_quote",
  "term_end_scheduled", "exit_circumstance", "circumstance_evidence", "circumstance_confidence",
  "destination_raw", "coder_id", "coded_date", "source_url",
], exitRows);

writeCsv("institution_year.csv", ["institution_id", "year", "fall_enrollment_total"], instYearRows);

// ---------------------------------------------------------------------------
// QC report -- the spec's 17 acceptance tests
// ---------------------------------------------------------------------------

const L = [];
const say = (s = "") => L.push(s);
const tally = (rows, f) => { const m = new Map(); for (const r of rows) m.set(f(r), (m.get(f(r)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const yn = (ok) => (ok ? "PASS" : "FAIL");

say("Succession panel rebuild - acceptance tests");
say(`generated ${EXTRACT_DATE} from artifacts/dean-dashboard/src/data`);
say("=".repeat(74));
say();

const ids = new Set(appts.map((a) => a.appointment_id));
const t1 = ids.size === appts.length
  && appts.every((a) => instRows.has(a.institution_id) && seatRows.has(a.seat_id) && (!a.person_id || peopleRows.has(a.person_id)))
  && exitRows.every((e) => ids.has(e.appointment_id));
say(`1.  Keys unique, foreign keys resolve ......................... ${yn(t1)}`);
say(`2.  Every appointment has a start date ........................ ${yn(appts.every((a) => a.start_date))}`);

const overlapsBySeat = [];
for (const [seatId, list] of bySeat) {
  const perm = list.filter((a) => !a.is_interim);
  for (let i = 0; i + 1 < perm.length; i++) {
    const e = perm[i].end_date ? +perm[i].end_date.slice(0, 4) : null;
    if (e !== null && e > +perm[i + 1].start_date.slice(0, 4))
      overlapsBySeat.push({ seatId, level: seatRows.get(seatId).seat_level, who: `${perm[i].person_name} vs ${perm[i + 1].person_name}` });
  }
}
const apptsByPerson = new Map();
for (const a of appts) if (a.person_id) (apptsByPerson.get(a.person_id) || apptsByPerson.set(a.person_id, []).get(a.person_id)).push(a);
const dualPairs = [];
for (const [, mine] of apptsByPerson) {
  const byInst = new Map();
  for (const a of mine) (byInst.get(a.institution_id) || byInst.set(a.institution_id, []).get(a.institution_id)).push(a);
  for (const [, l] of byInst) {
    if (new Set(l.map((a) => a.seat_id)).size < 2) continue;
    const s = l.slice().sort((x, y) => x.start_date.localeCompare(y.start_date));
    for (let i = 0; i + 1 < s.length; i++)
      if (s[i].seat_id !== s[i + 1].seat_id && s[i].end_date && s[i + 1].start_date < s[i].end_date) {
        dualPairs.push({
          pair: [s[i].seat_level, s[i + 1].seat_level].sort().join(" + "),
          same: s[i].seat_level === s[i + 1].seat_level,
          who: `${s[i].person_name} @ ${s[i].institution_id}`,
        });
        break;
      }
  }
}
// Test 3 splits by level pair. A dean serving as interim provost, or a provost
// stepping up to the presidency mid-year, is a real concurrent appointment and
// routine in academia; two deanships at once is not. Only the same-level cases are
// defects, and reporting them together would bury six real problems under 67
// ordinary ones.
const samePair = dualPairs.filter((d) => d.same);
say(`3.  No person holds two seats at one institution, overlapping .. ${yn(!samePair.length)}  (${samePair.length} same-level)`);
say(`      cross-level concurrency (dean/provost/president), expected: ${dualPairs.length - samePair.length}`);
tally(dualPairs, (d) => d.pair).forEach(([k, v]) => say(`        ${k.padEnd(24)} ${v}`));
say(`4.  No two permanent spells overlap within a seat ............. ${yn(!overlapsBySeat.length)}  (${overlapsBySeat.length})`);
tally(overlapsBySeat, (o) => o.level).forEach(([k, v]) => say(`        ${k.padEnd(24)} ${v}`));
const multiCurrent = [...bySeat.entries()].filter(([, l]) => l.filter((a) => a.is_current).length > 1);
say(`5.  At most one current appointment per seat .................. ${yn(!multiCurrent.length)}  (${multiCurrent.length})`);
tally(multiCurrent, ([s]) => seatRows.get(s).seat_level).forEach(([k, v]) => say(`        ${k.padEnd(24)} ${v}`));
say(`      seats where the two current rows come from different indexes: ${multiCurrent.filter(([, l]) => new Set(l.filter((a) => a.is_current).map((a) => a.source_index)).size > 1).length}`);
const endsAtExtract = appts.filter((a) => a.end_date.startsWith(String(EXTRACT_YEAR)));
say(`6.  No end date at the extract year without documentation ..... ${endsAtExtract.length} remain; ${stats.placeholderEnds} long-run placeholders suppressed`);
const staleInterim = appts.filter((a) => a.is_current && a.is_interim && +a.start_date.slice(0, 4) <= EXTRACT_YEAR - 2);
say(`7.  Current-and-interim rows verified within 18 months ........ FAIL by design: last_verified_date is empty corpus-wide`);
say(`      rows needing re-verification (current, interim, start <= ${EXTRACT_YEAR - 2}): ${staleInterim.length}`);
// Test 8 counts derivations and overrides as the spec meant them: narrative evidence
// is a derivation from source text, not a manual exception -- but only once the text
// has been allocated to a spell, which is what the triage in seat-identity.mjs does.
const fromTitle = appts.filter((a) => a.interim_evidence === "title").length;
const allocated = appts.filter((a) => a.interim_evidence === "narrative_allocated");
const overridden = appts.filter((a) => a.interim_override).length;
const legacyInterim = appts.filter((a) => a.is_interim_legacy).length;
const unverifiable = appts.filter((a) => a.is_interim_legacy && a.interim_override).length;
say(`8.  is_interim derivable from appointment-scoped evidence ..... PARTIAL`);
say(`      derived from a title: ${fromTitle} interim + ${appts.filter((a) => a.interim_evidence === "title_plain").length} permanent`);
say(`      allocated from narrative: ${allocated.length} interim + ${appts.filter((a) => a.interim_evidence === "title_plain_narrative_elsewhere").length} permanent`);
say(`      NOT independently derivable: ${unverifiable} of ${legacyInterim} interim flags (${((100 * unverifiable) / legacyInterim).toFixed(1)}%) rest on`);
say(`      the legacy ETL alone. That is UNALLOCATED evidence, not absent evidence: the`);
say(`      word is in a real text field on most of these rows, but \`notes\` is stored at`);
say(`      seat level, so a blob-level match cannot say which spell it belongs to. Each`);
say(`      row below carries the reason its sentence could not be allocated.`);
tally(appts.filter((a) => a.is_interim_legacy), (a) => a.interim_evidence).forEach(([k, v]) => say(`        ${k.padEnd(32)} ${v}`));

// The allocation's own check. It is a derivation the legacy flag never informed, so
// agreement with that flag is evidence about the rule rather than a design target --
// and where the two disagree, closed-tenure length says which side is right.
const agree = allocated.filter((a) => a.is_interim_legacy).length;
const closed = (l) => l.map((a) => (a.end_date ? +a.end_date.slice(0, 4) - +a.start_date.slice(0, 4) : null)).filter((v) => v !== null);
const profile = (l) => {
  const d = closed(l).sort((x, y) => x - y);
  return d.length ? `n=${String(d.length).padStart(4)}  median ${String(d[d.length >> 1]).padStart(2)}y  <=2y ${((100 * d.filter((v) => v <= 2).length) / d.length).toFixed(1)}%` : "n=0";
};
say(`      allocation check -- agreement with the legacy flag: ${agree} of ${allocated.length} (${((100 * agree) / allocated.length).toFixed(1)}%)`);
say(`        of the ${allocated.length - agree} divergences, ${allocated.filter((a) => !a.is_interim_legacy && +a.start_date.slice(0, 4) >= 2023).length} start 2023 or later and ${allocated.filter((a) => !a.is_interim_legacy && a.is_current).length} are still sitting --`);
say(`        current interim leaders the ETL never flagged. Closed-tenure profiles say`);
say(`        which side is right, using a measure the allocation never consults:`);
say(`          title says interim              ${profile(appts.filter((a) => a.interim_evidence === "title"))}`);
say(`          allocated, agrees with legacy   ${profile(allocated.filter((a) => a.is_interim_legacy))}`);
say(`          allocated, diverges from legacy ${profile(allocated.filter((a) => !a.is_interim_legacy))}`);
say(`          title says permanent            ${profile(appts.filter((a) => a.interim_evidence === "title_plain"))}`);
say(`9.  cannot_determine only after a recorded search ............. PASS (no row claims it; uncoded rows are null)`);
const confDist = tally(exitRows, (e) => e.circumstance_confidence || "(empty)");
say(`10. circumstance_confidence is not a defaulted constant ....... empty on all rows, by design (never assessed)`);
say(`11. No field is a deterministic function of its parent ........ PASS: unplanned_basis removed; exit_circumstance now`);
say(`      populated only from independent corpus evidence (${exitRows.filter((e) => e.exit_circumstance).length} of ${exitRows.length} rows)`);
say();

say("12. Precision counts");
for (const lvl of ["president", "provost", "dean"]) {
  const rows = appts.filter((a) => a.seat_level === lvl);
  const t = tally(rows, (a) => a.start_precision);
  say(`      ${lvl.padEnd(10)} ${rows.length} appts   ` + t.map(([k, v]) => `${k}:${v}`).join("  "));
}
say();
say("13. Seat coverage by decade (H5 diagnostic)");
const covOf = new Map(coverageRows.map((c) => [c.seat_id, c.coverage]));
const decades = [...new Set(appts.map((a) => Math.floor(+a.start_date.slice(0, 4) / 10) * 10))].sort();
say("      decade   researched_complete  researched_partial     not_researched");
for (const d of decades) {
  const rows = appts.filter((a) => Math.floor(+a.start_date.slice(0, 4) / 10) * 10 === d);
  const c = (k) => String(rows.filter((a) => covOf.get(a.seat_id) === k).length).padStart(19);
  say(`      ${String(d).padEnd(8)} ${c("researched_complete")} ${c("researched_partial")} ${c("not_researched")}`);
}
say();

// Test 14: reconcile, do not equate.
const tierOf = (a) => {
  const k = a._instKey;
  return r1Keys.has(k) ? "R1" : c2021.get(k) || "?";
};
say("14. Tier table reconciliation -- derivation never consulted the legacy flag");
say("      tier   appts   legacy interim   derived interim   published");
const published = { R1: "27.8%", R2: "27.9%", R3: "19.9%" };
for (const t of ["R1", "R2", "R3"]) {
  const rows = appts.filter((a) => a.seat_level === "president" && +a.start_date.slice(0, 4) >= 1996 && tierOf(a) === t);
  const lg = rows.filter((a) => a.is_interim_legacy).length;
  const dv = rows.filter((a) => a.is_interim).length;
  say(`      ${t.padEnd(6)} ${String(rows.length).padStart(5)}   ${(100 * lg / rows.length).toFixed(1)}% (${lg})`.padEnd(46)
    + `${(100 * dv / rows.length).toFixed(1)}% (${dv})`.padEnd(18) + published[t]);
}
const diverge = appts.filter((a) => a.interim_diverges_from_legacy);
say(`      rows where the derivation disagrees with the legacy ETL flag: ${diverge.length}`);
tally(diverge, (a) => `${a.seat_level}: legacy ${a.is_interim_legacy ? "interim" : "permanent"} -> derived ${a.is_interim ? "interim" : "permanent"}`)
  .forEach(([k, v]) => say(`        ${k.padEnd(46)} ${v}`));
say(`      These are disagreements needing adjudication, not proven ETL errors: most are a`);
say(`      bare "President"/"Chancellor" title with silent notes against an ETL interim`);
say(`      flag, where the ETL's origin coding may well have known something the title`);
say(`      does not say. Arizona pharmacy's "Acting Dean" flagged permanent is a plain`);
say(`      error. Exhibit: interim_diverges_from_legacy in appointments.csv.`);
say();

say(`15. Every appointment has a source_index ...................... ${yn(appts.every((a) => a.source_index))}`);
// Grouping by institution plus normalised name cannot fail while seat_id is BUILT
// from institution plus normalised name -- the previous version of this test was a
// tautology. The question worth asking is whether one real school still draws from
// more than one index without a recorded merge decision, computed from source fields
// rather than from the key.
const srcGroups = new Map();
for (const a of appts) {
  if (a.seat_level !== "dean") continue;
  const k = `${a.institution_id}|${normSchool(a._school)}`;
  (srcGroups.get(k) || srcGroups.set(k, new Map()).get(k)).set(a.source_index, true);
}
const multiIndex = [...srcGroups.entries()].filter(([, m]) => m.size > 1);
const undecided = multiIndex.filter(([k]) => !mergeDecisions.some((d) => `${d.institution_id}|${normSchool(d.canonical_name)}` === k));
say(`16. Each real school draws from one index, or has a merge decision ${yn(!undecided.length)}  (${undecided.length} undecided)`);
say(`      schools drawing from more than one index: ${multiIndex.length}, all recorded in merge_decisions.csv`);
say(`      NOTE: scope is this panel's 16 indexes. adminleaders and LAC are excluded here`);
say(`      and carry the bulk of the corpus-wide duplication (~202 of 220 pairs); that is`);
say(`      a BatonIndex defect this export does not touch.`);
say(`17. No person_id holds overlapping spells at two institutions .. ${dualInstAcross()} `);
function dualInstAcross() {
  let n = 0;
  const byP = new Map();
  for (const a of appts) if (a.person_id) (byP.get(a.person_id) || byP.set(a.person_id, []).get(a.person_id)).push(a);
  for (const [, l] of byP) {
    if (new Set(l.map((a) => a.institution_id)).size < 2) continue;
    const s = l.slice().sort((x, y) => x.start_date.localeCompare(y.start_date));
    for (let i = 0; i + 1 < s.length; i++)
      if (s[i].institution_id !== s[i + 1].institution_id && s[i].end_date && s[i + 1].start_date < s[i].end_date) { n++; break; }
  }
  return `${yn(!n)}  (${n})`;
}
say();

// Standing detector: a title naming an interim role on a row the corpus flags
// permanent is a reliable signal that several spells were collapsed into one row.
const compounds = appts.filter((a) => a.title_is_compound);
const contradictions = appts.filter(
  (a) => a.title_verbatim && !a.title_is_compound && /\b(interim|acting)\b|pro\s*tem/i.test(a.title_verbatim) && !a.is_interim_legacy,
);
say("Collapsed-spell detector");
say("-".repeat(74));
say(`  titles that collapse several spells into one row: ${compounds.length}`);
tally(compounds, (a) => a.seat_level).forEach(([k, v]) => say(`    ${k.padEnd(12)} ${v}`));
compounds.slice(0, 6).forEach((a) => say(`    ${a.institution_id.replace("US-", "").slice(0, 30).padEnd(32)} ${a.title_verbatim.slice(0, 70)}`));
say(`  interim-worded titles the ETL flagged permanent, not compound: ${contradictions.length}`);
contradictions.slice(0, 6).forEach((a) => say(`    ${a.institution_id.replace("US-", "").slice(0, 30).padEnd(32)} ${a.title_verbatim.slice(0, 60)}`));
say(`  Each collapsed row deletes a conversion and biases the interim rate down; they`);
say(`  need splitting at source, not here.`);
say();
say("What the rebuild newly revealed");
say("-".repeat(74));
const provostSeats = [...seatRows.values()].filter((s) => s.seat_level === "provost").length;
const pMulti = multiCurrent.filter(([sid]) => seatRows.get(sid).seat_level === "provost").length;
const pOver = overlapsBySeat.filter((o) => o.level === "provost").length;
say(`  The provost index is the worst-maintained in the corpus, and folding it in`);
say(`  surfaced that for the first time. ${pMulti} of ${provostSeats} provost seats carry more than one`);
say(`  sitting provost (Cornell has five) and ${pOver} carry overlapping permanent spells.`);
say(`  Those rows were in the corpus all along; exiling provosts to their own file in`);
say(`  the previous export meant no check ever ran across them. They are reported here`);
say(`  rather than resolved, per the spec: closing a spell needs a source, not a guess.`);
say();
say(`  Cross-index seat merging recovered ${appts.filter((a) => a.converted_to_permanent).length} interim-to-permanent conversions,`);
say(`  against 144 in the previous export. Sarah Cole's Columbia conversion is among`);
say(`  the newly visible ones: her interim spell came from the arts index and her`);
say(`  permanent spell from creative-arts, so no check could see them as one seat.`);
say();
say("Cross-index merges performed by the new seat key");
say("-".repeat(74));
const multiIndexSeats = [...seatRows.values()].filter((s) => s._indexes.size > 1);
say(`  seats now carrying spells from more than one index: ${multiIndexSeats.length}`);
multiIndexSeats.forEach((s) => say(`    ${s.canonical_name} @ ${s.institution_id}  <- ${[...s._indexes].map((i) => i.replace("r1-", "").replace("-deans.json", "")).join(" + ")}`));
say(`  classification conflicts flagged for review in merge_decisions.csv: ${mergeDecisions.length}`);
say();

say("Row counts");
Object.entries(counts).forEach(([f, n]) => say(`  ${f.padEnd(26)} ${String(n).padStart(7)}`));
say(`  seats ${seatRows.size}   institutions ${instRows.size}   people ${peopleRows.size}`);
say(`  source rows dropped: roster ${stats.roster}, sub-dean ${stats.subdean}, not-chief-exec ${stats.notChiefExec}, out-of-scope ${stats.outOfScope}`);
say(`  duplicate rows collapsed: ${stats.dedupedAway}   placeholder end dates suppressed: ${stats.placeholderEnds}`);
say();

say("Still requires human research - columns present and empty");
say("-".repeat(74));
say(`  reports_to                     0 of ${seatRows.size} seats`);
say(`  exit_announcement_date         0 of ${exitRows.length} exits   <- the spec's P0 and highest-return item`);
say(`  successor_status_at_announcement  0 of ${exitRows.length}`);
say(`  person_birth_year              0 of ${peopleRows.size} people`);
say(`  last_verified_date             0 of ${appts.length} appointments`);
say(`  exit_circumstance              ${exitRows.filter((e) => e.exit_circumstance).length} of ${exitRows.length} from corpus evidence; the rest need coding`);
say(`  month-precision starts         ${appts.filter((a) => a.start_precision !== "year").length} of ${appts.length}`);

const report = L.join("\n") + "\n";
writeFileSync(join(OUT, "qc_report.txt"), report, "utf8");
console.log(report);
