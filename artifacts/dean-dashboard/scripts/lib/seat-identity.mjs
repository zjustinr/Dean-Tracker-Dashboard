// Seat identity, title evidence, and the rules the succession-panel rebuild turns on.
//
// Split out of export-succession-panel.mjs because each of these is a decision the
// rebuild spec argues for explicitly, and each needs its reasoning next to it.

/**
 * Normalised school name. This is the identity of a seat, and `unit_type` is
 * deliberately NOT part of it.
 *
 * Columbia's School of the Arts appears in `r1-arts-deans.json` (Sarah Cole's 2023
 * interim spell) and in `r1-camd-deans.json` (her 2024 permanent spell). The two
 * strings are identical; what split them was the unit_type each index implies, which
 * fed the old unit_id. Any key containing a classification re-splits the same school
 * every time two collection waves classify it differently, so classification is an
 * attribute of the seat and never an input to its key.
 */
export const normSchool = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(.*?\)/g, " ")
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Uppercase slug for use inside an id. */
export const slug = (s, max = 48) =>
  normSchool(s).replace(/\s+/g, "-").toUpperCase().slice(0, max).replace(/-+$/, "");

/**
 * Titles that name a seat rather than a field of study.
 *
 * The corpus overloads `discipline`: on president rows it holds "Interim President",
 * on many dean rows it holds "Finance" or "Law". Only the former is a title, and only
 * a title can support a re-derivation of `is_interim` (acceptance test 8).
 */
const TITLE_WORD = /\b(dean|president|chancellor|provost|rector|officer in charge|head of school)\b/i;
const INTERIM_WORD = /\b(interim|acting)\b|pro\s*tem/i;

/** The verbatim title where the corpus actually holds one, else "". */
export const titleVerbatim = (r) => {
  const d = String(r.discipline || "").trim();
  return TITLE_WORD.test(d) ? d : "";
};

/**
 * A title that names more than one role.
 *
 * NOTE ON WHAT THIS DOES AND DOES NOT MEAN. This was originally described as
 * detecting "several spells collapsed into one row", and the corpus pass shipped a
 * `titleIsCompound` field and a CI check under that name. Reading all 65 matches
 * shows the description was wrong for most of them:
 *
 *   16  genuinely sequential -- explicit date ranges or "then":
 *       "Acting Provost (1977-1978); Senior Vice President ... and Provost (1978-1983)"
 *   27  slash-joined with no dates -- ONE person, TWO concurrent hats:
 *       "Vice President for Student Life/Dean of Students"
 *   22  semicolon-joined with no dates -- also concurrent:
 *       "Provost; Vice President", "Dean ...; Vice Chancellor for Nursing Affairs"
 *
 * So three quarters of the matches are dual-role titles, not collapsed spells, and
 * splitting them would invent a departure and a re-appointment that never happened.
 * The name stays (a shipped field), the claim does not: this detects "the title names
 * more than one role", which is all the string can support. `titleSpansSeveralSpells`
 * below is the narrow test, and it is the one the integrity check counts.
 *
 * It still gates `deriveInterim`: when a title names two roles, an interim word in it
 * may attach to either, so no derivation is safe from it whichever kind it is.
 */
export const isCompoundTitle = (title) => {
  const s = String(title || "");
  if (!s) return false;
  // Two role phrases separated by ; or /, or a parenthetical year range.
  if (/\(\s*\d{4}\s*[-–]\s*\d{2,4}\s*\)/.test(s)) return true;
  if (/[;\/]/.test(s) && /\b(dean|president|provost|chancellor|rector)\b/i.test(s)) {
    const parts = s.split(/[;\/]/).filter((x) => /\b(dean|president|provost|chancellor|rector)\b/i.test(x));
    return parts.length > 1;
  }
  return false;
};

/**
 * A title that describes a SEQUENCE of appointments, which is the defect the two-row
 * rule exists to prevent: collapsed, it deletes a conversion and biases every interim
 * rate downward.
 *
 * Narrow on purpose. It requires the title to date its own parts, or to say "then" --
 * evidence inside the string that one role ended and another began. A title merely
 * listing two roles is a person wearing two hats, and is not this.
 *
 * Even among the 16 that match, only some are two APPOINTMENTS. Most are a title
 * growing inside one continuous tenure ("Vice President for Academic Affairs
 * (1996-2003); Executive Vice President for Academic Affairs (2003-2010)" is one
 * person who never left the seat). The two that matter are the ones where an acting
 * spell precedes a permanent one, because only those hide an interim appointment --
 * `titleHidesInterimSpell` is that test.
 */
export const titleSpansSeveralSpells = (title) => {
  const s = String(title || "");
  if (!s || !isCompoundTitle(s)) return false;
  return /\(\s*\d{4}\s*[-\u2013]\s*\d{2,4}\s*\)/.test(s) || /\b(then|later|subsequently)\b/i.test(s);
};

/**
 * A row recorded as PERMANENT whose own title says it began as an acting spell.
 *
 * This is the only compound-title case that biases an interim rate, and it is the
 * only one that can be split without a new source: the title states both spells and
 * dates them, so splitting is transcription rather than invention.
 */
export const titleHidesInterimSpell = (record) => {
  const t = titleVerbatim(record);
  if (!titleSpansSeveralSpells(t)) return false;
  if (record.isInterim) return false;
  const first = t.split(/[;,]/)[0];
  return INTERIM_WORD.test(first);
};

/**
 * Narrative triage: what an interim word in `notes` is actually talking about.
 *
 * The corpus stores narrative at SEAT level, not appointment level. A first attempt
 * derived TRUE from any interim word in `notes` and flipped 1,292 permanent rows --
 * the word was there, but it belonged to another seat, another person, another
 * decade, or to a remark about the source rather than the appointment.
 *
 * The conclusion drawn from that -- that the evidence is absent -- was wrong, and the
 * research team was right to reject it. 2,610 of 2,958 interim spells carry the word
 * in a real text field. The evidence EXISTS; a blob-level keyword match simply cannot
 * say which spell it belongs to. The defect is allocation, not absence.
 *
 * So this classifies the sentence instead of matching the field, and allocates the
 * mention to this appointment only when nothing in the sentence points elsewhere. The
 * classes below were written by reading the narrative text, not by iterating against
 * the legacy flag; the flag is then used as an out-of-sample CHECK, and the check is
 * reported rather than optimised (see `succession-panel/qc_report.txt`, test 8). At the
 * stopping point every class has a stated linguistic rationale, 340 appointments
 * allocate, and 91.5% of them agree with the legacy flag.
 *
 * The remaining 8.5% are worth being specific about, because they are not noise: 25 of
 * the 29 are appointments starting 2023 or later and 23 are still sitting -- current
 * interim leaders the ETL never flagged ("Interim dean from July 2025" on a row the
 * corpus records as permanent). An independent check says which side is right. The
 * allocated rows have a median closed tenure of 1 year with 98.2% at two years or
 * less, which is the profile of the rows whose TITLE says interim (median 1 year,
 * 93.1%); rows the corpus calls permanent run a median of 7 years. The allocation
 * lands on spells that look like interim spells by a measure it never consults.
 *
 * Each rejecting class is returned by name, so a row the panel cannot derive carries a
 * recorded reason rather than a shrug.
 */
const SOURCE_NOTE =
  /\b(not documented|undocumented|not resolved|sources? (consulted|found)|no [a-z]+ (information|record|source)|omitted|not verified|not established|could not be|unconfirmed|not confirmed|not sourced|not explain|year ranges only|no named|no interim|for context)\b/i;
/**
 * Hedged or not-yet-real. The anticipatory verbs were added after an audit caught a
 * false positive: "(An earlier step-down notice had anticipated a one-year interim for
 * 2026-27" was allocated as a recorded interim spell. An interim that was planned,
 * expected or anticipated is not one that happened.
 */
const HEDGE =
  /\b(likely|probabl[ye]|appears? to|presumabl[ye]|may have|might have|if any|unidentified|unnamed|roughly|unclear|believed|possibl[ye]|assumed to|anticipated?|expected|planned|proposed|was to|would (?:be|serve))\b/i;
/** Wording that puts the interim episode on somebody else. */
const OTHER_PERSON = /\b(succeed(ing|ed)?|preced(ing|ed)|predecessor|successor|between [A-Z]|after [A-Z][a-z]+'s|during [A-Z][a-z]+'s)\b/;
/** Wording that says this one row collapses an interim spell and a permanent one. */
const CONVERSION = /\b(initially|at first|started as|began as|first served as|originally|later confirmed|then confirmed|formally installed)\b/i;
/** The office the interim word attaches to, where it attaches to one. */
const ATTACHED =
  /\b(interim|acting|co)[- ]?((?:[a-z]+\s+){0,3}?)(dean|president|chancellor|provost|rector|vice president|vp|vcaa|director|head|leadership|rectorship|basis|office)\b/i;
const LEVEL_OF = { dean: "dean", president: "president", chancellor: "president", rector: "president", provost: "provost" };
/** Remove every "interim <office>" phrase; what survives is a SECOND appointment. */
const stripInterim = (s) =>
  s
    .replace(/\b(interim|acting|co)[- ]?(?:[a-z]+\s+){0,3}?(dean|president|chancellor|provost|rector|head|director)\b/gi, " ")
    .replace(/\b(interim|acting)\b/gi, " ");
const BARE_TITLE = /\b(dean|president|chancellor|provost|rector)\b/i;
const PERMANENCE = /\bpermanent(ly)?\b|\bappointment\b|\bconfirmed\b|\bfull[- ]time\b/i;
const yearsIn = (s) => [...String(s).matchAll(/\b(1[89]\d\d|20[0-5]\d)\b/g)].map((m) => +m[1]);

/**
 * Classify the interim sentence. Returns an evidence name; `narrative_allocated` is
 * the only one that licenses a derivation.
 *
 * `ctx` carries what the ROW knows about itself -- which seat it is and how long it
 * ran -- because two of the tests are comparisons against it: a mention naming a
 * different seat level is about a different seat, and a row that runs years past the
 * end of the narrated interim period is a conversion collapsed into one row, where
 * neither TRUE nor FALSE describes the row as it stands.
 */
function classifyNarrative(sentence, ctx) {
  const q = sentence;
  if (SOURCE_NOTE.test(q)) return "narrative_source_note";
  if (HEDGE.test(q)) return "narrative_hedged";

  const m = q.match(ATTACHED);
  if (m) {
    const level = LEVEL_OF[m[3].toLowerCase()];
    if (level && ctx.seatLevel && level !== ctx.seatLevel) return "narrative_other_seat";
    if (!level) return "narrative_other_office";
  }
  if (OTHER_PERSON.test(q)) return "narrative_other_person";
  if (CONVERSION.test(q)) return "narrative_conversion";

  const residue = stripInterim(q);
  if (BARE_TITLE.test(residue) || PERMANENCE.test(residue)) return "narrative_two_appointments";

  // Anchoring. The mention must name the year this appointment began, or it is
  // describing some other stretch of the seat's history.
  const ys = yearsIn(q);
  if (!ys.includes(ctx.startYear)) return "narrative_unanchored";

  // And the row must not outrun the interim period the sentence describes. "Interim
  // dean from July 2024" on a row still sitting in 2026 is a conversion the corpus
  // never split, not a two-year interim spell.
  if (ctx.rowEndYear !== null && ctx.rowEndYear - Math.max(...ys) > 1) return "narrative_outruns";

  return "narrative_allocated";
}

/**
 * Derive `is_interim` from source evidence, WITHOUT consulting the legacy ETL flag.
 *
 * Acceptance test 14 asks for an independent derivation so the legacy ETL flag can be
 * audited. The previous build failed it silently -- `is_interim` was copied from
 * `is_interim_legacy`, so "zero rows disagree" was guaranteed by construction. This
 * derives honestly, from two kinds of appointment-scoped evidence:
 *
 * 1. **The title**, where the corpus records one -- but ONLY POSITIVELY. A title
 *    naming an interim role derives TRUE. A title that merely omits the word derives
 *    NOTHING, because `discipline` holds the generic seat name: the string is
 *    "President" whether the appointment was interim or not, so its silence is the
 *    default, not a finding.
 *
 *    This took two attempts to get right and the second was still wrong. The first
 *    read any bare title as permanence and flipped 494 president rows, reversing R1
 *    from 28% to 8%. The fix was to require the narrative to be silent too -- which
 *    cut the damage to 29 rows but kept the same broken inference. Review caught it,
 *    and the duration test settles it, because the derivation never consults duration:
 *
 *      the 29 demoted rows          median 1y,  96.6% at two years or less
 *      titles that SAY interim      median 1y,  93.1%
 *      titles the ETL calls permanent  median 7y,   9.4%
 *
 *    The demoted rows are indistinguishable from real interim spells. Their titles are
 *    "President", "Chancellor", "Rector", "Dean". 16 were R3 presidents, which dragged
 *    the published R3 rate from 20.1% to 17.5% on nothing at all.
 *
 *    A search settles the general case: of 13,499 dated rows whose `discipline` holds
 *    a title, ZERO state permanence explicitly -- no "permanent", "confirmed",
 *    "installed", "inaugurated", "full term". The corpus holds no positive evidence of
 *    permanence anywhere in the field. So there is nothing to derive FALSE from, and
 *    the honest `derived` value for a silent title is null.
 *
 * 2. **The narrative, allocated to a spell** -- see `classifyNarrative` above. Where
 *    the sentence points at another seat, another person, another period, or at the
 *    source rather than the appointment, it is recorded by name and derives nothing.
 *
 * Everything else is left underivable, `derived: null`, with the legacy flag carrying
 * the row and `interim_evidence` naming the reason the source could not settle it.
 *
 * CONSEQUENCE WORTH STATING: the derivation is now ONE-DIRECTIONAL. It can find an
 * interim spell the ETL missed; it can never rule one out, because the corpus holds no
 * positive evidence of permanence. That is a real limit on what test 14 can audit, and
 * it is the limit the source actually imposes -- the alternative is manufacturing
 * permanence out of a default string, which is what produced the 494-row and then the
 * 29-row error.
 */
export function deriveInterim(r, ctx = {}) {
  const title = titleVerbatim(r);
  const notes = String(r.notes || "");
  const notesMention = INTERIM_WORD.test(notes);

  if (isCompoundTitle(title))
    return { derived: null, evidence: "compound_title", quote: title.slice(0, 300), compound: true };

  // Conclusive interim: the title of this seat names an interim role.
  if (title && INTERIM_WORD.test(title))
    return { derived: true, evidence: "title", quote: title.slice(0, 300), compound: false };

  // A title that does not name an interim role. NOT a derivation of permanence -- see
  // the header. The legacy flag carries the row, and the evidence name says why.
  if (title && !notesMention)
    return { derived: null, evidence: "title_silent", quote: title.slice(0, 300), compound: false };

  if (notesMention) {
    const sentence = (notes.split(/(?<=[.;])\s+/).find((x) => INTERIM_WORD.test(x)) || "").trim();
    const klass = classifyNarrative(sentence, {
      seatLevel: ctx.seatLevel || "",
      startYear: ctx.startYear ?? r.startYear ?? null,
      rowEndYear: ctx.rowEndYear ?? null,
    });
    const quote = sentence.slice(0, 300);

    if (klass === "narrative_allocated")
      return { derived: true, evidence: "narrative_allocated", quote, compound: false };

    // Where the sentence is provably about a DIFFERENT seat, or is a remark about the
    // source rather than about anyone's appointment, the narrative is silent on this
    // row. That leaves the title, which derives nothing on its own -- so this class is
    // recorded (it says the mention was allocated away, not ignored) and derives
    // nothing either. It used to derive permanence, and five of the 29 wrongly demoted
    // rows came through here.
    if (title && (klass === "narrative_source_note" || klass === "narrative_other_seat"))
      return { derived: null, evidence: "title_silent_narrative_elsewhere", quote, compound: false };

    return { derived: null, evidence: klass, quote, compound: false };
  }

  // `priorTitle` names the PREVIOUS post, often at another institution -- "Dean,
  // Suffolk University Law School" on an American University appointment -- so it can
  // never describe this seat and is deliberately not consulted.
  const origin = `${r.origin || ""} ${r.originV2 || ""}`.trim();
  if (INTERIM_WORD.test(origin))
    return { derived: null, evidence: "etl_only", quote: `origin coding: ${origin}`, compound: false };

  return { derived: null, evidence: "none", quote: "", compound: false };
}

/**
 * Is this end date an ETL placeholder rather than a real departure?
 *
 * The ETL wrote the extract year as an end year where the true one was never found.
 * Most 2026 ends are genuine, but a spell that runs more than 15 years and happens to
 * stop exactly at the extract year is almost certainly one of these -- the University
 * of Tennessee's founding law dean is recorded 1890 to 2026. A fabricated end date
 * corrupts every duration and overlap downstream, so it is dropped and `is_current`
 * carries the distinction: empty end date with is_current FALSE means "ended, date
 * unknown", which is honest; empty with TRUE means "still sitting".
 */
export const isPlaceholderEnd = (startYear, endYear, extractYear, minRun = 15) =>
  endYear === extractYear && startYear && endYear - startYear > minRun;
