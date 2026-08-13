import { useState, useRef } from "react";

/**
 * Generic English + job-posting boilerplate we never want surfaced as a
 * "distinctive" keyword (institution/HR filler, not a signal about the role
 * or the ideal candidate). Kept lowercase; extraction lowercases first.
 */
const STOPWORDS = new Set([
  "the","and","for","are","but","not","you","your","with","this","that","from","have","has","had",
  "will","shall","should","would","could","can","may","might","must","its","it's","their","they","them",
  "our","ours","who","whom","which","what","when","where","how","why","all","any","both","each","few",
  "more","most","other","some","such","only","own","same","than","too","very","just","about","above",
  "after","again","against","because","before","being","below","between","during","further","into",
  "once","over","under","while","then","there","here","also","within","without","upon","per",
  "position","candidate","candidates","applicant","applicants","application","applications","apply",
  "applying","university","college","school","institution","institutions","dean","deanship","director",
  "provost","president","chancellor","office","department","division","committee","search","searches",
  "seeking","seeks","looking","invites","invited","invite","welcome","welcomes","opportunity","role",
  "qualifications","qualified","qualification","responsibilities","responsibility","requirements",
  "required","requires","requiring","preferred","preference","minimum","maximum","years","year",
  "including","include","includes","included","experience","experienced","skills","skill","ability",
  "abilities","strong","excellent","demonstrated","proven","successful","success","ideal","plus",
  "please","review","reviews","reviewed","salary","benefits","compensation","apply","resume","resumes",
  "cover","letter","letters","references","reference","submit","submitted","submission","deadline",
  "review","interview","interviews","committee","process","processes","email","phone","contact",
  "equal","employer","employment","opportunity","affirmative","action","diversity","inclusion","policy",
  "policies","statement","statements","information","additional","further","details","detail","about",
  "join","joining","seeking","seeks","new","current","currently","serves","serve","serving","served",
]);

/**
 * Optional job-description input for Scout Assistant: paste text, upload a
 * plain-text file, or point at a URL, then extract distinctive keywords from
 * the text itself (see extractKeywords below) plus any of this index's known
 * expertise/discipline tags that literally appear in it. The result is a soft
 * keyword-match score bonus at every stringency tier, and a hard requirement
 * (at least one match) at the strictest tier only -- see ScoutAssistantPage.
 *
 * The extraction used to ONLY check the pasted text against the closed
 * `vocabulary` list (expertise tags already present on some candidate in this
 * index), so a real, substantive term in a posting -- "trans-disciplinary",
 * "entrepreneurial", "global", "shared-governance" -- was invisible unless it
 * happened to already be a tag on file. `extractKeywords` below runs a plain
 * stopword-filtered frequency extraction over the pasted text directly, so
 * novel posting language shows up too; the closed-vocabulary hits are unioned
 * in on top since they're still useful (multi-word tags like "human-computer
 * interaction" that the single-token extractor below won't catch whole).
 *
 * Scope note: only .txt/.md files are parsed directly (native FileReader, no
 * new dependencies). PDF/Word uploads are not parsed in-browser -- this is a
 * deliberate scope cut (this repo is one package in a large shared monorepo,
 * and adding a PDF/DOCX parsing library means a workspace-wide dependency
 * install we can't fully verify in one sitting) rather than a silent gap: the
 * UI says so and asks for pasted text instead. URL fetching is best-effort
 * (server-side fetch + tag-strip, see api/parse-jd-url.js) and will yield
 * little or nothing on a JS-rendered job board -- also disclosed inline.
 */
export function extractKeywords(raw: string, vocabulary: string[], max = 32): string[] {
  const lower = raw.toLowerCase();

  // Known multi-word expertise/discipline tags already on file, that appear
  // verbatim in the text -- catches compound phrases single-token extraction
  // below can't (e.g. "human-computer interaction").
  const vocabHits = vocabulary.filter((kw) => lower.includes(kw.toLowerCase()));

  // General extraction: words and hyphenated compounds (>= 4 letters), minus
  // stopwords/boilerplate, ranked by frequency in this specific text.
  const tokens = lower.match(/[a-z][a-z-]{2,}[a-z]/g) || [];
  const freq = new Map<string, number>();
  for (const t of tokens) {
    const term = t.replace(/^-+|-+$/g, "");
    if (term.length < 4 || STOPWORDS.has(term)) continue;
    freq.set(term, (freq.get(term) || 0) + 1);
  }
  const extracted = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t);

  const seen = new Set(vocabHits.map((v) => v.toLowerCase()));
  const merged = [...vocabHits];
  for (const t of extracted) {
    if (seen.has(t)) continue;
    seen.add(t);
    merged.push(t);
    if (merged.length >= max) break;
  }
  return merged;
}

export default function JobDescriptionInput({
  vocabulary, onKeywords, onMatch,
}: {
  vocabulary: string[];
  onKeywords: (keywords: string[], rawText: string) => void;
  /** Fired when "Match Candidates" is clicked -- an explicit, visible confirmation
   *  that the algorithm ran, since the auto-match-on-keystroke behavior alone gave
   *  no clear signal anything had happened. */
  onMatch?: (keywordCount: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [urlStatus, setUrlStatus] = useState<"idle" | "loading" | "error">("idle");
  const [urlError, setUrlError] = useState("");
  const [fileError, setFileError] = useState("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [justMatched, setJustMatched] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const extract = (raw: string) => {
    const hits = extractKeywords(raw, vocabulary);
    setKeywords(hits);
    onKeywords(hits, raw);
    return hits;
  };

  const handleMatchClick = () => {
    const hits = extract(text);
    setOpen(true);
    setJustMatched(true);
    onMatch?.(hits.length);
    window.setTimeout(() => setJustMatched(false), 2500);
  };

  const applyText = (raw: string) => {
    setText(raw);
    setFileError("");
    extract(raw);
  };

  const handleFile = async (file: File) => {
    setFileError("");
    const isPlain = /\.(txt|md)$/i.test(file.name) || file.type === "text/plain";
    if (!isPlain) {
      setFileError("Only .txt/.md files are parsed automatically right now — paste the text below instead of uploading a PDF or Word doc.");
      return;
    }
    const raw = await file.text();
    applyText(raw);
  };

  const handleUrl = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setUrlStatus("loading");
    setUrlError("");
    try {
      const res = await fetch("/api/parse-jd-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (!data.ok) {
        const messages: Record<string, string> = {
          no_text_extracted: "Fetched the page but couldn't find readable text — it's likely rendered by JavaScript. Paste the text instead.",
          unsupported_content_type: "That URL didn't return a web page. Paste the text instead.",
          fetch_failed: "Couldn't load that URL.",
          timeout: "That page took too long to load.",
          blocked_host: "That URL isn't allowed.",
          invalid_url: "That doesn't look like a valid URL.",
        };
        setUrlError(messages[data.error] || "Couldn't fetch that page — paste the text instead.");
        setUrlStatus("error");
        return;
      }
      setUrlStatus("idle");
      applyText(data.text as string);
    } catch {
      setUrlError("Couldn't reach that URL — paste the text instead.");
      setUrlStatus("error");
    }
  };

  const clear = () => {
    setText(""); setUrl(""); setKeywords([]); setFileError(""); setUrlError(""); setUrlStatus("idle");
    onKeywords([], "");
  };

  return (
    <div className="rounded-lg border border-muted-foreground/30 bg-background">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-semibold">
          Optional: match against a position announcement
          {keywords.length > 0 && (
            <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[#011F5B]/10 text-[#011F5B]">
              {keywords.length} keyword{keywords.length === 1 ? "" : "s"} matched
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-muted-foreground/20 pt-2.5">
          <p className="text-[11px] text-muted-foreground leading-snug">
            Paste the posting text, upload a .txt file, or fetch a URL (best-effort — many job boards render text via
            JavaScript and won't yield anything; paste is the reliable option), then click Match Candidates. We pull
            the distinctive terms out of the posting itself (not just this index's known expertise tags), then
            re-score candidates by overlap — it's a heuristic boost, not a validated statistical signal like the rest
            of the model.
          </p>
          <textarea
            value={text}
            onChange={(e) => applyText(e.target.value)}
            placeholder="Paste the position announcement text here…"
            rows={4}
            className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="h-8 px-3 rounded text-xs font-semibold border border-muted-foreground/40 hover:bg-muted"
            >
              Upload .txt/.md
            </button>
            <input
              ref={fileRef} type="file" accept=".txt,.md,text/plain" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            <span className="text-muted-foreground text-xs">or</span>
            <input
              type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="flex-1 min-w-[160px] rounded-lg border border-muted-foreground/30 bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
            />
            <button
              onClick={handleUrl}
              disabled={!url.trim() || urlStatus === "loading"}
              className="h-8 px-3 rounded text-xs font-semibold bg-[#011F5B] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110"
            >
              {urlStatus === "loading" ? "Fetching…" : "Fetch"}
            </button>
            {(text || keywords.length > 0) && (
              <button onClick={clear} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear</button>
            )}
          </div>
          <div>
            <button
              onClick={handleMatchClick}
              disabled={!text.trim()}
              className="h-9 px-4 rounded-lg text-sm font-bold bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 inline-flex items-center gap-1.5"
            >
              {justMatched ? "✓ Matched" : "🔎 Match Candidates"}
            </button>
            {!text.trim() && (
              <span className="ml-2 text-[11px] text-muted-foreground">Paste, upload, or fetch text above first</span>
            )}
          </div>
          {fileError && <p className="text-[11px] text-amber-700 dark:text-amber-500">{fileError}</p>}
          {urlError && <p className="text-[11px] text-amber-700 dark:text-amber-500">{urlError}</p>}
          {text && keywords.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No distinctive keywords found in this text yet — try pasting more of the posting, or click Match Candidates once you have.</p>
          )}
          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {keywords.map((k) => (
                <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-[#011F5B]/10 text-[#011F5B] font-medium">{k}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
