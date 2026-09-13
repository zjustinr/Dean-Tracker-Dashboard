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
 * How `is_interim` is evidenced on a row, as a four-state value.
 *
 * The rebuild spec asks for `is_interim` to be reproducible from `title_verbatim`,
 * with an override for the exceptions. Measured against the corpus that is not a
 * small exception set: of 2,958 interim spells, the word sits in a title on 1,347,
 * in narrative `notes` on a further 1,215, in `priorTitle` only on 48, and nowhere at
 * all on 348. Treating 1,611 rows as manual overrides would be wrong -- the evidence
 * exists and is machine-readable, it is simply prose rather than a title.
 *
 * So the override is split by where the evidence lives:
 *   `title`     the title says interim/acting. Derivable; no override needed.
 *   `narrative` a sentence in the source notes says so. Override, reason auto-filled
 *               with that sentence verbatim, so a reader can audit it.
 *   `etl_only`  only the ETL's own origin coding says so. Override, reason records
 *               the origin code. This is an assertion by a previous pass, not source
 *               evidence, and the analysis should be able to discount it.
 *   `none`      the flag is set and nothing supports it. Override with no reason;
 *               these are the rows that genuinely need a human.
 */
export function interimEvidence(r) {
  if (!r.isInterim) return { evidence: "", quote: "" };
  const title = titleVerbatim(r);
  if (INTERIM_WORD.test(title)) return { evidence: "title", quote: "" };
  const notes = String(r.notes || "");
  const sentence = notes
    .split(/(?<=[.;])\s+/)
    .find((s) => INTERIM_WORD.test(s));
  if (sentence) return { evidence: "narrative", quote: sentence.trim().slice(0, 300) };
  const prior = String(r.priorTitle || "");
  if (INTERIM_WORD.test(prior)) return { evidence: "narrative", quote: prior.slice(0, 300) };
  const origin = `${r.origin || ""} ${r.originV2 || ""}`.trim();
  if (INTERIM_WORD.test(origin)) return { evidence: "etl_only", quote: `origin coding: ${origin}` };
  return { evidence: "none", quote: "" };
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
