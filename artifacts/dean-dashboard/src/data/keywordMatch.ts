/**
 * Shared keyword extraction + fuzzy matching for Scout Assistant's "match
 * against a position announcement" feature. Used by JobDescriptionInput.tsx
 * (extraction, as the user types/pastes) and ScoutAssistantPage.tsx (scoring
 * candidates against the extracted keywords) so the two stay in lockstep --
 * same normalization on both sides of the match.
 *
 * Design intent (this is a broad-net triage tool, not a precision filter):
 * extraction should surface a wide spread of attributes from the posting,
 * and matching should be permissive (stemmed word roots, not exact strings)
 * so morphological variants -- "innovation" in the posting, "innovative" on
 * a candidate's brief -- still connect. Getting the shortlist right from
 * there is what the stringency dial is for.
 */

export interface Keyword {
  /** Shown to the user as a chip and in per-candidate match labels. */
  display: string;
  /** Normalized form used for matching: a word's stem, or a phrase verbatim. */
  stem: string;
  /** "tag" = known expertise tag on file; "phrase" = a 2-word phrase pulled
   *  from the posting; "word" = a single stemmed term pulled from the posting. */
  kind: "tag" | "phrase" | "word";
}

// Generic English + job-posting boilerplate we never want surfaced as a
// "distinctive" keyword (institution/HR filler, not a signal about the role
// or the ideal candidate). Kept lowercase; matching lowercases first.
export const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "your", "with", "this", "that", "from", "have", "has", "had",
  "will", "shall", "should", "would", "could", "can", "may", "might", "must", "its", "it's", "their", "they", "them",
  "our", "ours", "who", "whom", "which", "what", "when", "where", "how", "why", "all", "any", "both", "each", "few",
  "more", "most", "other", "some", "such", "only", "own", "same", "than", "too", "very", "just", "about", "above",
  "after", "again", "against", "because", "before", "being", "below", "between", "during", "further", "into",
  "once", "over", "under", "while", "then", "there", "here", "also", "within", "without", "upon", "per",
  "position", "candidate", "candidates", "applicant", "applicants", "application", "applications", "apply",
  "applying", "university", "college", "school", "institution", "institutions", "dean", "deanship", "director",
  "provost", "president", "chancellor", "office", "department", "division", "committee", "search", "searches",
  "seeking", "seeks", "looking", "invites", "invited", "invite", "welcome", "welcomes", "opportunity", "role",
  "qualifications", "qualified", "qualification", "responsibilities", "responsibility", "requirements",
  "required", "requires", "requiring", "preferred", "preference", "minimum", "maximum", "years", "year",
  "including", "include", "includes", "included", "experience", "experienced", "skills", "skill", "ability",
  "abilities", "strong", "excellent", "demonstrated", "proven", "successful", "success", "ideal", "plus",
  "please", "review", "reviews", "reviewed", "salary", "benefits", "compensation", "resume", "resumes",
  "cover", "letter", "letters", "references", "reference", "submit", "submitted", "submission", "deadline",
  "interview", "interviews", "process", "processes", "email", "phone", "contact",
  "equal", "employer", "employment", "affirmative", "action", "diversity", "inclusion", "policy",
  "policies", "statement", "statements", "information", "additional", "further", "details", "detail",
  "join", "joining", "new", "current", "currently", "serves", "serve", "serving", "served",
]);

// Common derivational suffixes, longest-first so "innovations" strips to
// "innovat" via "ations" rather than stopping early at "s". Deliberately
// simple (no Porter-stemmer step rules) -- this only needs to unify obvious
// noun/verb/adjective variants of the same root, not handle every English
// inflection correctly.
const SUFFIXES = [
  "ativeness", "alizations", "alization", "izations", "ization", "ationally",
  "atively", "ability", "ibility", "ational", "ations", "alities", "ation",
  "ative", "alize", "alized", "alizes", "iveness", "ingly", "edly",
  "ality", "ibly", "ably", "ists", "ives", "ical", "isms", "ing",
  "ies", "ied", "ist", "ism", "ity", "ive", "ors", "ers", "er", "or",
  "ed", "es", "ly", "s",
].sort((a, b) => b.length - a.length);

/** Reduce a word to a rough root form for fuzzy matching. Short words are
 *  left alone -- stripping suffixes off a 4-letter word is more likely to
 *  cause false matches than catch real variants. */
export function stem(word: string): string {
  const w = word.toLowerCase();
  if (w.length <= 4) return w;
  for (const suf of SUFFIXES) {
    if (w.length - suf.length >= 3 && w.endsWith(suf)) {
      return w.slice(0, w.length - suf.length);
    }
  }
  return w;
}

export function tokenize(raw: string): string[] {
  return raw.toLowerCase().split(/[^a-z-]+/).filter(Boolean);
}

/** Extract a broad set of candidate keywords from free text: known
 *  multi-word vocabulary tags that appear verbatim, plus 2-word phrases and
 *  single stemmed terms pulled directly from the text and ranked by how
 *  often each appears in it. */
export function extractKeywords(raw: string, vocabulary: string[], max = 40): Keyword[] {
  const lower = raw.toLowerCase();
  const vocabHits = vocabulary.filter((kw) => lower.includes(kw.toLowerCase()));

  const rawTokens = tokenize(raw);

  // Single-word terms, bucketed by stem so morphological variants within the
  // posting itself ("innovate" / "innovative") collapse into one keyword.
  const stemBuckets = new Map<string, { count: number; display: string }>();
  for (const t of rawTokens) {
    if (t.length < 4 || STOPWORDS.has(t)) continue;
    const s = stem(t);
    const cur = stemBuckets.get(s);
    if (cur) { cur.count++; if (t.length < cur.display.length) cur.display = t; }
    else stemBuckets.set(s, { count: 1, display: t });
  }
  const words: Keyword[] = [...stemBuckets.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].display.localeCompare(b[1].display))
    .map(([s, v]) => ({ display: v.display, stem: s, kind: "word" as const }));

  // Two-word phrases: adjacent (in the ORIGINAL text) content words, neither
  // a stopword. Catches un-hyphenated compound attributes ("shared
  // governance", "global engagement") a single-token pass would split apart.
  const bigramFreq = new Map<string, number>();
  for (let i = 0; i < rawTokens.length - 1; i++) {
    const a = rawTokens[i], b = rawTokens[i + 1];
    if (a.length < 3 || b.length < 3 || STOPWORDS.has(a) || STOPWORDS.has(b)) continue;
    const phrase = `${a} ${b}`;
    bigramFreq.set(phrase, (bigramFreq.get(phrase) || 0) + 1);
  }
  const phrases: Keyword[] = [...bigramFreq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([phrase]) => ({ display: phrase, stem: phrase, kind: "phrase" as const }));

  const seen = new Set<string>();
  const merged: Keyword[] = [];
  const add = (list: Keyword[]) => {
    for (const k of list) {
      if (seen.has(k.stem)) continue;
      seen.add(k.stem);
      merged.push(k);
      if (merged.length >= max) return;
    }
  };
  add(vocabHits.map((v) => ({ display: v, stem: v.toLowerCase(), kind: "tag" as const })));
  add(phrases);
  add(words);
  return merged;
}

/** Which of `keywords` show up in `text` -- stemmed-token match for single
 *  words, substring match for phrases/tags (they're multi-word, so a token
 *  set can't represent them). */
export function matchKeywords(text: string, keywords: Keyword[]): Keyword[] {
  if (!keywords.length || !text) return [];
  const lower = text.toLowerCase();
  const stems = new Set(tokenize(text).filter((t) => t.length >= 4).map(stem));
  return keywords.filter((kw) => (kw.kind === "word" ? stems.has(kw.stem) : lower.includes(kw.stem)));
}
