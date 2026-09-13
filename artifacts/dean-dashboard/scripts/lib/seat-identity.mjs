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
 * A title that has had several spells collapsed into it.
 *
 * The corpus sometimes records a person's whole run in one row:
 * "Acting Provost (1977-1978); Senior Vice President for Academic Affairs and
 * Provost (1978-1983)". That is two appointments, and the two-row rule exists
 * precisely to keep them apart -- collapsed, it deletes a conversion and biases the
 * interim rate downward. Such a title must never be allowed to flip `is_interim`,
 * because neither value is right for the row as it stands; it needs splitting first.
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
 * Derive `is_interim` from source evidence, WITHOUT consulting the legacy ETL flag.
 *
 * Acceptance test 14 asks for an independent derivation so the legacy ETL flag can be
 * audited. The previous build failed it silently -- `is_interim` was copied from
 * `is_interim_legacy`, so "zero rows disagree" was guaranteed by construction. This
 * derives honestly, and the honest answer is that **most rows cannot be derived at
 * all**. Two measurements establish why, and both are worth keeping in view:
 *
 * 1. **A title that omits the word is not evidence of permanence.** A first attempt
 *    treated it as such and flipped 494 president rows to permanent on the strength of
 *    a `discipline` reading "President" -- that field holds the generic seat name, not
 *    the appointment-specific title. It reversed R1 from 28% to 8% on an artefact.
 *
 * 2. **`notes` is not appointment-scoped, so keyword matching on it is unusable.** A
 *    second attempt derived TRUE from any interim word in the narrative and flipped
 *    1,292 permanent rows. Reading them: "Also served as Baylor's acting president for
 *    a year", "afterward served as interim president in 1948-49", "Acting dean 1925,
 *    permanent dean from 1926" (this row being the permanent spell), and notes
 *    describing the SOURCE -- "year ranges only, no [interim] information". The word
 *    is present; the claim is about another seat, another period, or nothing at all.
 *
 * So derivation is restricted to what is genuinely appointment-scoped: the title.
 * Everything else is left underivable, `derived: null`, with the legacy flag carrying
 * the row and `interim_evidence` recording that its basis is weak. That is a smaller
 * claim than the spec hoped for, and it is the one the corpus supports.
 */
export function deriveInterim(r) {
  const title = titleVerbatim(r);
  const notesMention = INTERIM_WORD.test(String(r.notes || ""));

  if (isCompoundTitle(title))
    return { derived: null, evidence: "compound_title", quote: title.slice(0, 300), compound: true };

  // Conclusive interim: the title of this seat names an interim role.
  if (title && INTERIM_WORD.test(title))
    return { derived: true, evidence: "title", quote: title.slice(0, 300), compound: false };

  // Conclusive permanent: a title is recorded, it names the seat plainly, and nothing
  // anywhere in the row's narrative raises the question. Requiring the narrative to be
  // silent is what keeps this from repeating failure mode 1 above.
  if (title && !notesMention)
    return { derived: false, evidence: "title_plain", quote: title.slice(0, 300), compound: false };

  // A narrative mention with no confirming title: the word is there, but it may belong
  // to another seat or another decade. Recorded for a human, never derived from.
  if (notesMention) {
    const sentence = String(r.notes || "").split(/(?<=[.;])\s+/).find((x) => INTERIM_WORD.test(x)) || "";
    return { derived: null, evidence: "narrative_unscoped", quote: sentence.trim().slice(0, 300), compound: false };
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
