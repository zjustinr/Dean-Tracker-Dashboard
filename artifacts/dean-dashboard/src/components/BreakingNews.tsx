import { useMemo, useState } from "react";
import breaking from "@/data/breaking-news.json";

interface BreakingItem {
  id: string;
  type: "applied" | "question";
  date: string;
  headline: string;
  question?: string;
  university?: string;
  dean?: string;
  url: string;
  issueUrl?: string;
  /** Story identity written by scripts/news-dedupe.mjs — see storyKeysForEvent. */
  storyKeys?: string[];
}

const SHOW_DAYS = 14;
const LS_KEY = "deantracker.breakingDismissed";

function loadDismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}

export default function BreakingNews() {
  const [dismissed, setDismissed] = useState<string[]>(loadDismissed);

  const items = useMemo(() => {
    const cutoff = Date.now() - SHOW_DAYS * 86400e3;
    // One appointment gets written up by a dozen outlets, so the scout collapses
    // that coverage to a single item before it writes the feed (news-dedupe.mjs).
    // This is the last line of defence for anything already in the file: a story
    // never gets two lines in the banner, whatever the data says.
    const seen = new Set<string>();
    return ((breaking.items || []) as BreakingItem[]).filter((it) => {
      if (new Date(it.date).getTime() < cutoff || dismissed.includes(it.id)) return false;
      const keys = it.storyKeys?.length
        ? it.storyKeys
        : [(it.question || it.headline || it.url).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()];
      if (keys.some((k) => seen.has(k))) return false;
      for (const k of keys) seen.add(k);
      return true;
    });
  }, [dismissed]);

  if (!items.length) return null;

  const dismiss = (id: string) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div className="bg-gradient-to-r from-red-700 via-red-600 to-red-700 text-white shadow-md">
      <div className="max-w-[1400px] mx-auto px-4 py-1.5 space-y-1">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 text-sm">
            <span className="shrink-0 inline-flex items-center gap-1.5 bg-white text-red-700 font-extrabold text-[11px] tracking-widest px-2 py-0.5 rounded uppercase">
              <span className="inline-block w-2 h-2 rounded-full bg-red-600 animate-pulse" />
              {it.type === "question" ? "Confirm" : "Breaking"}
            </span>
            <span className="min-w-0 truncate font-medium">
              {it.type === "question" ? it.question : it.headline}
            </span>
            <a
              href={it.type === "question" ? it.issueUrl || it.url : it.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 underline underline-offset-2 font-semibold hover:text-red-100"
            >
              {it.type === "question" ? "Answer →" : "Story →"}
            </a>
            <span className="shrink-0 text-red-100/80 text-xs hidden sm:inline">{it.date}</span>
            <button
              onClick={() => dismiss(it.id)}
              aria-label="Dismiss"
              className="ml-auto shrink-0 rounded px-1.5 hover:bg-red-800/60 font-bold"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
