import { useState, useRef } from "react";
import { extractKeywords, type Keyword } from "@/data/keywordMatch";

/**
 * Optional job-description input for Scout Assistant: paste text, upload a
 * plain-text file, or point at a URL, then extract a broad set of candidate
 * keywords from the text itself (see extractKeywords in data/keywordMatch.ts)
 * plus any of this index's known expertise/discipline tags that literally
 * appear in it. Matching against candidates is fuzzy (stemmed word roots),
 * not exact-substring -- this stage is meant to cast a wide net; the
 * stringency dial is what narrows it. See ScoutAssistantPage for scoring.
 *
 * The extraction used to ONLY check the pasted text against the closed
 * `vocabulary` list (expertise tags already present on some candidate in this
 * index), so a real, substantive term in a posting -- "trans-disciplinary",
 * "entrepreneurial", "global", "shared-governance" -- was invisible unless it
 * happened to already be a tag on file, and even a literal match like
 * "innovation" wouldn't connect to a candidate's brief that said "innovative."
 * extractKeywords now pulls stemmed single words AND two-word phrases
 * directly out of the pasted text (broad net, not vocabulary-limited), with
 * the closed-vocabulary tags unioned in on top since they still catch
 * multi-word tags the phrase pass won't reassemble (e.g. "human-computer
 * interaction").
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
export default function JobDescriptionInput({
  vocabulary, onKeywords, onMatch,
}: {
  vocabulary: string[];
  onKeywords: (keywords: Keyword[], rawText: string) => void;
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
  const [keywords, setKeywords] = useState<Keyword[]>([]);
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
                <span
                  key={k.stem}
                  title={k.kind === "tag" ? "Known expertise tag on file" : k.kind === "phrase" ? "Two-word phrase from the posting" : "Term from the posting (matched by root, e.g. “innovative” also matches “innovation”)"}
                  className={[
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    k.kind === "tag" ? "bg-[#011F5B]/10 text-[#011F5B]" : k.kind === "phrase" ? "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {k.display}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
