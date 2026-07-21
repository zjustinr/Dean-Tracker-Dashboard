import { useState, useMemo, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import DeanProfile from "@/components/DeanProfile";

export interface DeanSearchPrefill {
  fullName: string;
  first: string;
  last: string;
  token: number; // changes on every request so repeated clicks re-trigger
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/**
 * Rewritten mobile-first. The previous version used a custom combobox whose
 * dropdown closed on input blur; on touch devices the blur fires before the
 * option's tap registers, so selection silently failed. This version has no
 * custom overlay:
 *   - one plain text box that filters the list live (no dropdown to mis-close),
 *   - native <select> for discipline and school (the OS renders these as proper
 *     mobile pickers),
 *   - an A-Z strip to jump by last-name initial.
 * The result list itself does the selecting, so a tap always lands.
 */
export default function IndividualSearch({ prefill, onOpenSchool }: { prefill?: DeanSearchPrefill | null; onOpenSchool?: (university: string, school: string) => void }) {
  const { noun, nounLower, nounPluralLower } = useDataset();
  const allDeans = useAllDeans();

  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [school, setSchool] = useState("");
  const [selectedDean, setSelectedDean] = useState<Dean | null>(null);

  // Prefill from "Meet a Leader": fill the box and open that person's profile.
  useEffect(() => {
    if (!prefill) return;
    setQuery(prefill.fullName);
    setLetter("");
    setDiscipline("");
    setSchool("");
    const matches = allDeans.filter((d) => d.dean.toLowerCase() === prefill.fullName.toLowerCase());
    setSelectedDean(matches.find((d) => d.endYear == null) || matches[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token]);

  const { disciplines, schools } = useMemo(() => {
    const dSet = new Set<string>();
    const sSet = new Set<string>();
    for (const d of allDeans) {
      if (d.disciplineBroad && d.disciplineBroad !== "Unknown") dSet.add(d.disciplineBroad);
      if (d.university) sSet.add(d.university);
    }
    return {
      disciplines: [...dSet].sort((a, b) => a.localeCompare(b)),
      schools: [...sSet].sort((a, b) => a.localeCompare(b)),
    };
  }, [allDeans]);

  const hasFilter = Boolean(query.trim() || letter || discipline || school);

  const results = useMemo(() => {
    if (!hasFilter) return [];
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    return allDeans
      .filter((d) => {
        const last = (d.dean.split(/\s+/).pop() || "").toLowerCase();
        if (q && !d.dean.toLowerCase().includes(q)) return false;
        if (letter && last[0] !== letter.toLowerCase()) return false;
        if (discipline && d.disciplineBroad !== discipline) return false;
        if (school && d.university !== school) return false;
        const key = d.dean + "|" + d.university + "|" + d.school;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const cmp = (a.dean.split(/\s+/).pop() || "").localeCompare(b.dean.split(/\s+/).pop() || "");
        return cmp !== 0 ? cmp : a.dean.localeCompare(b.dean);
      });
  }, [allDeans, query, letter, discipline, school, hasFilter]);

  const clearAll = () => { setQuery(""); setLetter(""); setDiscipline(""); setSchool(""); setSelectedDean(null); };
  const sel = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30";

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-1">Individual {noun} Search</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Search by name, or filter by discipline, school, or last-name initial.
        </p>

        {/* name box: plain input, filters the list live */}
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedDean(null); }}
          placeholder={`Type a ${nounLower}'s name…`}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
        />

        {/* native selects render as OS pickers on mobile -- no custom overlay to mis-tap */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select className={sel} value={discipline} onChange={(e) => { setDiscipline(e.target.value); setSelectedDean(null); }} aria-label="Discipline">
            <option value="">All disciplines</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={sel} value={school} onChange={(e) => { setSchool(e.target.value); setSelectedDean(null); }} aria-label="School">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* A-Z strip: wraps and stays tappable at 44px targets on mobile */}
        <div className="flex flex-wrap gap-1 mt-3">
          {LETTERS.map((L) => (
            <button
              key={L}
              onClick={() => { setLetter(letter === L ? "" : L); setSelectedDean(null); }}
              className={[
                "w-8 h-8 rounded text-xs font-semibold transition-colors",
                letter === L ? "bg-[#011F5B] text-white" : "bg-muted/60 text-foreground hover:bg-muted",
              ].join(" ")}
              aria-pressed={letter === L}
            >
              {L}
            </button>
          ))}
          {hasFilter && (
            <button onClick={clearAll} className="h-8 px-3 rounded text-xs font-semibold border border-border hover:bg-muted ml-1">
              Clear
            </button>
          )}
        </div>
      </div>

      {results.length > 0 && !selectedDean && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-medium">{results.length} result{results.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {results.slice(0, 300).map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDean(d)}
                className="w-full text-left px-4 sm:px-5 py-3 hover:bg-accent/40 transition-colors flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-[#011F5B]/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-[#011F5B]">{d.dean.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{d.dean}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.school}, {d.university}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#011F5B] tabular-nums">{d.startYear || "?"}–{d.endYear || "Now"}</p>
                  {d.isInterim && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Interim</span>}
                </div>
              </button>
            ))}
          </div>
          {results.length > 300 && (
            <div className="px-5 py-2 text-xs text-muted-foreground border-t border-border">
              Showing first 300 — narrow the filters to see more.
            </div>
          )}
        </div>
      )}

      {results.length === 0 && hasFilter && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No {nounPluralLower} match these filters.</p>
        </div>
      )}

      {selectedDean && (
        <DeanProfile dean={selectedDean} onClose={() => setSelectedDean(null)} onOpenSchool={onOpenSchool} />
      )}
    </div>
  );
}
