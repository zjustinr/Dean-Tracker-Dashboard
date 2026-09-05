// Shared extraction for bio/roster pages: role start years and PhD provenance.
//
// Everything here is deliberately conservative. These fields feed candidate
// screening, so a wrong value is worse than the null already on the row -- when
// a page is ambiguous the right answer is to return nothing and leave the row
// alone. Every hit carries the sentence it came from so it can be audited.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–',
  mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“',
  rdquo: '”', hellip: '...', eacute: 'é', uuml: 'ü',
};

export function decodeEntities(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, g) => {
    if (g[0] === '#') {
      const cp = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m;
    }
    return ENTITIES[g.toLowerCase()] ?? m;
  });
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Block boundaries become sentence boundaries: roster pages lean on markup,
      // not punctuation, to separate one person from the next.
      .replace(/<\/(p|div|li|tr|td|h[1-6]|section|article)>/gi, '. ')
      .replace(/<br\s*\/?>/gi, '. ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

const SUFFIX_RE = /,?\s+(Jr\.?|Sr\.?|I{2,3}|IV|Ph\.?\s?D\.?|M\.?D\.?|Ed\.?D\.?|J\.?D\.?|D\.?V\.?M\.?|R\.?N\.?|M\.?B\.?A\.?|M\.?P\.?H\.?|M\.?S\.?|M\.?A\.?)\s*$/gi;

export function nameTokens(name) {
  let s = String(name || '');
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX_RE, '');
  return s.replace(/["'()]/g, '').replace(/\b(Dr|Prof|Professor)\.?\s+/gi, '')
    .split(/[\s.,]+/)
    .map(p => p.toLowerCase().replace(/[^a-zà-ÿ'-]/g, ''))
    .filter(p => p.length > 1);
}
export const lastOf = t => t[t.length - 1] || '';
export const firstOf = t => t[0] || '';

// Sentence split that tolerates the "Ph.D." / "St." / initials abbreviations
// that riddle these pages. Abbreviation dots are parked on a sentinel across
// the split and restored afterwards so evidence strings read normally.
const DOT = '\u0001';
export function sentences(text) {
  const parked = text
    .replace(/\b(Ph|Ed|J|M|B|D|Sc|St|Mr|Mrs|Ms|Dr|Prof|Jr|Sr|Inc|vs|etc|No|Univ|Dept)\./gi, (m) => m.slice(0, -1) + DOT)
    // Any single-letter initial: "B.A.", "M.S.", "J. Q. Public". Without this a
    // degree list splits mid-sentence and strands the earning verb.
    .replace(/\b([A-Z])\./g, '$1' + DOT);
  return parked.split(/(?<=[.!?])\s+/)
    .map(s => s.split(DOT).join('.').trim())
    .filter(Boolean);
}

// ------------------------------------------------------------- role start year
// Abbreviations matter: pages say "AVC of Development", "named VP for Research".
const ROLE_TOKEN_SRC = "\\b(?:(?:senior|executive|deputy|vice|associate|assistant|interim|acting)\\s+){0,3}(dean|provost|chancellor|president|chair(?:person|man|woman)?|director|rector)\\b|\\b(avc|avp|svp|vpaa|vpr|vp|vc)\\b";
const ROLE_RE = new RegExp(ROLE_TOKEN_SRC, 'i');

// Which office a role phrase belongs to. Pages abbreviate freely ("AVC of
// Development"), so the abbreviations map to the same heads as the spelled-out
// titles.
function headsIn(str) {
  const out = new Set();
  const re = new RegExp(ROLE_TOKEN_SRC, 'gi');
  let m;
  while ((m = re.exec(String(str || ''))) !== null) {
    if (m[1]) {
      const h = m[1].toLowerCase();
      out.add(h.startsWith('chair') ? 'chair' : h);
    } else if (m[2]) {
      const a = m[2].toLowerCase();
      out.add(a === 'avc' || a === 'vc' ? 'chancellor' : 'president');
    }
  }
  return out;
}

// The offices named by the person's own recorded title.
export function roleHeads(row) {
  return headsIn(`${row?.discipline || ''} ${row?.roleTier || ''}`);
}

// A career-history sentence names the junior role someone started in, not the
// one they hold now.
const CAREER_START = /\b(?:began|started|launched)\b[^.]{0,40}\bcareer\b/i;

// A career-arc sentence walks through several roles ("joined in 2018 ... and now
// serves as associate dean"). The year belongs to the arrival, not to the role.
const CAREER_ARC = /\b(?:now (?:serves|leads|as)\b|currently serves|first as\b|later became|subsequently|transition(?:ing|ed|s)\b|is moving|before (?:being|becoming))/i;

// Verbs that mean a job move. Between a degree and a year they turn that year
// into an appointment date rather than a graduation date.
const CAREER_MOVE = /\b(?:join(?:ed|ing|s)?|came to|coming to|arriv(?:ed|ing)|named|appointed|has served|have served|serves as|serving as|became|becoming|begins?|began|started|starting|hired|before|prior to|after|since)\b/i;

// Earning language, for telling "earned a Ph.D. in 1994" from the appositive
// credential form ("Jane Doe, Ph.D., will join us in 2025").
const EARN = /\b(?:earned|received|holds?|held|completed|awarded|obtained|conferred|graduated|studied|took)\b/i;

// A year in one of these sentences is about something other than entering the
// current role.
const RETROSPECTIVE = /\b(?:before|prior to|previously|formerly|earlier|until|left|departed|stepped down|retired|succeed(?:ed|s|ing)|predecessor|first joined)\b|\bfrom\s+\d{4}\s*(?:to|until|-|–)\s*\d{4}\b/i;
const CREDENTIAL = /\b(?:ph\.?\s?d|doctorate|doctoral|b\.?\s?[as]\b|m\.?\s?[as]\b|m\.?b\.?a|ed\.?\s?d|j\.?d\b|bachelor|master|degree|graduated|alumn|born|tenure[- ]track|as an? (?:assistant|associate) professor|professor of|copyright|vol\.|pp\.|issn|isbn|published|grant|award|patent|fellowship)\b|©/i;
const ENTRY_VERB = /\b(?:appointed|named|promoted to|became|assumed|took over as|selected as|tapped as|elevated to|has served as|have served as|serves as|serving as|has been|begins?|began|started|stepped into)\b|\bjoined\b[^.]{0,40}\bas\b/i;

const MIN_YEAR = 1970;

/**
 * Pull the year the person entered their current sub-dean role.
 * Returns { year, pattern, evidence } or null.
 */
export function extractStartYear(text, opts = {}) {
  const maxYear = (opts.now || new Date().getFullYear()) + 2;
  // Gate on the office the person actually holds. Without it, a career-history
  // sentence ("joined in 2004 as associate director of annual giving") gets read
  // onto someone whose recorded title is Vice President -- the wrong year for
  // the wrong role. With no recorded title there is nothing to gate on, so only
  // the unambiguous "since"/"-present" forms are allowed through.
  const heads = opts.row ? roleHeads(opts.row) : new Set();
  const gated = heads.size > 0;
  const cands = [];
  for (const s of sentences(text)) {
    if (!/\b(?:19[7-9]\d|20[0-4]\d)\b/.test(s)) continue;
    if (!ROLE_RE.test(s)) continue;
    if (CREDENTIAL.test(s)) continue;
    if (RETROSPECTIVE.test(s)) continue;
    if (CAREER_START.test(s)) continue;
    if (CAREER_ARC.test(s)) continue;
    // On a page that is not this person's own (a news story, a shared roster),
    // a sentence that never names them is probably about somebody else.
    if (opts.requireName && opts.name) {
      const ln = lastOf(nameTokens(opts.name));
      if (ln && !s.toLowerCase().includes(ln)) continue;
    }
    if (s.length > 600) continue; // run-on blob: too likely to mix people
    if (gated) {
      const inSentence = headsIn(s);
      let shares = false;
      for (const h of inSentence) if (heads.has(h)) { shares = true; break; }
      if (!shares) continue;
    }

    // "... since 2017"
    let m = s.match(/\bsince\s+(?:\w+\s+){0,2}((?:19[7-9]\d|20[0-4]\d))\b/i);
    if (m) { cands.push({ year: +m[1], pattern: 'since', rank: 0, evidence: s }); continue; }
    // "2019-present"
    m = s.match(/\b((?:19[7-9]\d|20[0-4]\d))\s*[-–—]\s*(?:present|current|now)\b/i);
    if (m) { cands.push({ year: +m[1], pattern: 'range-present', rank: 0, evidence: s }); continue; }
    // "appointed ... in 2020" / "In 2020 she was named ..."
    // "appointed ... in 2020" is the loosest form and the easiest to misread off
    // a page covering several people, so it only counts in a sentence that names
    // this person (a pronoun subject is fine -- their own bio page).
    if (ENTRY_VERB.test(s) && gated) {
      const ln = opts.name ? lastOf(nameTokens(opts.name)) : '';
      const namesThem = !ln || s.toLowerCase().includes(ln) || /^(?:he|she|they|dr\.?|prof)\b/i.test(s.trim());
      if (!namesThem) continue;
      m = s.match(/\b(?:in|effective|as of|beginning|starting)\s+(?:\w+\s+){0,3}((?:19[7-9]\d|20[0-4]\d))\b/i);
      if (m) { cands.push({ year: +m[1], pattern: 'entry-in-year', rank: 1, evidence: s }); continue; }
    }
  }
  const ok = cands.filter(c => c.year >= MIN_YEAR && c.year <= maxYear);
  if (!ok.length) return null;
  ok.sort((a, b) => a.rank - b.rank || b.year - a.year);
  const best = ok[0];
  // Equally-strong candidates that disagree mean the page is ambiguous.
  const peers = ok.filter(c => c.rank === best.rank);
  if (new Set(peers.map(c => c.year)).size > 1) return null;
  return { year: best.year, pattern: best.pattern, evidence: best.evidence.slice(0, 300) };
}

// ------------------------------------------------------------------- doctorate
const DEGREE_SRC = '(?:ph\\.?\\s?d\\.?|d\\.?\\s?phil\\.?|doctorate|doctoral degree|ed\\.?\\s?d\\.?|sc\\.?\\s?d\\.?|dr\\.?p\\.?h\\.?|psy\\.?\\s?d\\.?)';
const DEGREE_RE = new RegExp(`\\b${DEGREE_SRC}`, 'i');
const INST_CORE = '(?:University|Universität|Universidad|Université|College|Institute|Polytechnic|Politecnico|Academy|Conservatory)';
// "from the University of Michigan", "at Stanford University"
const INST_RE = new RegExp(
  `\\b(?:from|at)\\s+((?:the\\s+)?(?:[A-Z][\\w&.'’-]*\\s+){0,5}${INST_CORE}(?:\\s+(?:of|at|in)\\s+(?:[A-Z][\\w&.'’-]*[,\\s]*){1,4})?)`,
);
const ACRONYM_RE = /\b(?:from|at)\s+(MIT|Caltech|UCLA|UCSF|UCSD|UC\s+[A-Z][a-z]+|NYU|LSU|CUNY|SUNY|Virginia Tech|Georgia Tech|Texas A&M)\b/;
const NOT_INST = /\b(?:program|student|candidate|committee|dissertation|thesis|level|track|studies|advisor)\b/i;

/**
 * Pull doctoral institution and/or year.
 * Returns { institution, year, evidence } (either field may be null) or null.
 */
export function extractPhd(text, opts = {}) {
  const maxYear = (opts.now || new Date().getFullYear());
  const out = [];
  for (const s of sentences(text)) {
    if (s.length > 500) continue;
    const dm = s.match(DEGREE_RE);
    if (!dm) continue;
    const at = s.indexOf(dm[0]) + dm[0].length;
    // "Ph.D. students", "our Ph.D. program" -- not a credential statement.
    if (NOT_INST.test(s.slice(at, at + 30))) continue;

    // Scope to the span that follows the doctoral token. Bios routinely list
    // several degrees in one sentence ("a bachelor's from X, a master's from Y,
    // and a Ph.D. from Z"); reading the whole sentence attaches the FIRST
    // institution to the doctorate, which is usually the bachelor's.
    let tail = s.slice(at, at + 200);
    // Stop before a following degree or a post-doc clause bleeds in.
    const stop = tail.search(new RegExp(`(?:${DEGREE_SRC}|\\bbachelor|\\bmaster|\\bpostdoc|\\bpost-doc|\\bcompleted\\b|\\bfellowship\\b)`, 'i'));
    if (stop > 0) tail = tail.slice(0, stop);

    let institution = null;
    const im = tail.match(INST_RE) || tail.match(ACRONYM_RE)
      // "Ph.D., Harvard University, 1998" -- the comma form carries no from/at.
      || tail.match(new RegExp(`^[,;]\\s*((?:the\\s+)?(?:[A-Z][\\w&.'\u2019-]*[,\\s]+){0,6}${INST_CORE}(?:\\s+(?:of|at|in)\\s+(?:[A-Z][\\w&.'\u2019-]*[,\\s]*){1,4})?)`));
    // Reject an institution that sits on the far side of a job move or a role
    // title: "Ph.D., vice dean at the University of Miami" names an employer,
    // not the school that granted the doctorate.
    if (im && !(CAREER_MOVE.test(tail.slice(0, im.index)) || ROLE_RE.test(tail.slice(0, im.index)))) {
      institution = im[1];
    }
    if (institution) {
      institution = institution.replace(/\s+/g, ' ').replace(/[,.;:]+$/, '').replace(/^the\s+/i, '').trim();
      // A CV line ("PhD, Logistics, New Mexico State University") puts the field
      // of study ahead of the school; keep only the segment naming the school.
      if (institution.includes(',')) {
        const seg = institution.split(/,\s*/).filter(x => new RegExp(INST_CORE, 'i').test(x));
        if (seg.length) institution = seg[seg.length - 1].trim();
      }
      if (NOT_INST.test(institution) || institution.length < 3 || institution.length > 90) institution = null;
    }

    let year = null;
    const ym = tail.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
    // Same test for the year: "Ph.D. ... joined the faculty in 2012" is a hire
    // date, and "Ph.D., will join Baylor ... 2025" is a start date.
    if (ym && !CAREER_MOVE.test(tail.slice(0, ym.index))) {
      const y = +ym[1];
      if (y >= 1950 && y <= maxYear) year = y;
    }
    const cvForm = /^[,;]\s*(?:[A-Z]|\d)/.test(tail) && !CAREER_MOVE.test(tail.slice(0, 40));
    if (!EARN.test(s) && !cvForm) continue;
    if (institution || year != null) out.push({ institution, year, evidence: s.slice(0, 300) });
  }
  if (!out.length) return null;
  // Prefer the richest statement, but require agreement among those that specify.
  const richness = o => (o.institution ? 1 : 0) + (o.year != null ? 1 : 0);
  out.sort((a, b) => richness(b) - richness(a));
  const insts = new Set(out.filter(o => o.institution).map(o => o.institution.toLowerCase()));
  const years = new Set(out.filter(o => o.year != null).map(o => o.year));
  const best = out[0];
  const institution = insts.size === 1 ? best.institution ?? null : null;
  const year = years.size === 1 ? [...years][0] : null;
  if (!institution && year == null) return null;
  return { institution, year, evidence: best.evidence };
}

// Narrow a roster page to the block about one person, so a neighbour's dates or
// degrees never land on them.
export function personSection(text, name, back = 300, fwd = 1400) {
  const t = nameTokens(name);
  const last = lastOf(t), first = firstOf(t);
  if (!last) return null;
  const lower = text.toLowerCase();
  const hits = [];
  let i = lower.indexOf(last);
  while (i >= 0 && hits.length < 40) { hits.push(i); i = lower.indexOf(last, i + 1); }
  if (!hits.length) return null;
  const scored = hits.map(h => ({ h, near: lower.slice(Math.max(0, h - 60), h + 60).includes(first) ? 0 : 1 }));
  scored.sort((a, b) => a.near - b.near);
  const at = scored[0].h;
  return text.slice(Math.max(0, at - back), Math.min(text.length, at + fwd));
}
