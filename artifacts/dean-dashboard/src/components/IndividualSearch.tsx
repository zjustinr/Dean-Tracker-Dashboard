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
 * Slate Builder — the flagship view.
 *
 * A search consultant's core job is assembling a *slate* of candidates, not
 * looking up one known person. So this filters a cohort (sitting-only by
 * default, by school / discipline / tenure), lets the user check people into a
 * shortlist that persists at the top while they browse, and still opens any
 * individual profile on click.
 *
 * Mobile-first, no custom dropdown: the earlier combobox closed on blur before
 * a touch tap registered. Plain input + native <select> + tappable rows means a
 * tap always lands.
 */
export default function IndividualSearch({ prefill, onOpenSchool }: { prefill?: DeanSearchPrefill | null; onOpenSchool?: (university: string, school: string) => void }) {
  const { noun, nounLower, nounPluralLower } = useDataset();
  const allDeans = useAllDeans();

  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [school, setSchool] = useState("");
  const [sittingOnly, setSittingOnly] = useState(true);
  const [sortBy, setSortBy] = useState<"name" | "tenure" | "recent">("name");
  const [slate, setSlate] = useState<Dean[]>([]);
  const [selectedDean, setSelectedDean] = useState<Dean | null>(null);

  useEffect(() => {
    if (!prefill) return;
    setQuery(prefill.fullName);
    setLetter(""); setDiscipline(""); setSchool(""); setSittingOnly(false);
    const matches = allDeans.filter((d) => d.dean.toLowerCase() === prefill.fullName.toLowerCase());
    setSelectedDean(matches.find((d) => d.endYear == null) || matches[0] || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token]);

  const { disciplines, schools } = useMemo(() => {
    const dSet = new Set<string>(), sSet = new Set<string>();
    for (const d of allDeans) {
      if (d.disciplineBroad && d.disciplineBroad !== "Unknown") dSet.add(d.disciplineBroad);
      if (d.university) sSet.add(d.university);
    }
    return {
      disciplines: [...dSet].sort((a, b) => a.localeCompare(b)),
      schools: [...sSet].sort((a, b) => a.localeCompare(b)),
    };
  }, [allDeans]);

  const hasFilter = Boolean(query.trim() || letter || discipline || school || sittingOnly);

  const results = useMemo(() => {
    if (!hasFilter) return [];
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    const rows = allDeans.filter((d) => {
      const last = (d.dean.split(/\s+/).pop() || "").toLowerCase();
      if (sittingOnly && d.endYear != null) return false;
      if (q && !d.dean.toLowerCase().includes(q)) return false;
      if (letter && last[0] !== letter.toLowerCase()) return false;
      if (discipline && d.disciplineBroad !== discipline) return false;
      if (school && d.university !== school) return false;
      const key = d.dean + "|" + d.university + "|" + d.school;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    rows.sort((a, b) => {
      if (sortBy === "tenure") return (b.tenureLength || 0) - (a.tenureLength || 0);
      if (sortBy === "recent") return (b.startYear || 0) - (a.startYear || 0);
      const cmp = (a.dean.split(/\s+/).pop() || "").localeCompare(b.dean.split(/\s+/).pop() || "");
      return cmp !== 0 ? cmp : a.dean.localeCompare(b.dean);
    });
    return rows;
  }, [allDeans, query, letter, discipline, school, sittingOnly, sortBy, hasFilter]);

  const inSlate = (id: number) => slate.some((d) => d.id === id);
  const toggleSlate = (d: Dean) =>
    setSlate((cur) => inSlate(d.id) ? cur.filter((x) => x.id !== d.id) : [...cur, d]);

  const clearAll = () => { setQuery(""); setLetter(""); setDiscipline(""); setSchool(""); setSelectedDean(null); };
  const sel = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30";

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-1">Slate Builder</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Filter the cohort, check candidates into your slate, and open any profile.
        </p>

        <input
          type="text" inputMode="search" value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedDean(null); }}
          placeholder={`Type a ${nounLower}'s name…`}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select className={sel} value={discipline} onChange={(e) => { setDiscipline(e.target.value); setSelectedDean(null); }} aria-label="Discipline">
            <option value="">All disciplines</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={sel} value={school} onChange={(e) => { setSchool(e.target.value); setSelectedDean(null); }} aria-label="School">
            <option value="">All schools</option>
            {schools.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={sel} value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "tenure" | "recent")} aria-label="Sort by">
            <option value="name">Sort: name</option>
            <option value="tenure">Sort: longest tenure</option>
            <option value="recent">Sort: most recently appointed</option>
          </select>
        </div>

        <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer select-none w-fit">
          <input type="checkbox" checked={sittingOnly} onChange={(e) => setSittingOnly(e.target.checked)} className="accent-[#011F5B] w-4 h-4" />
          Sitting {nounPluralLower} only
        </label>

        <div className="flex flex-wrap gap-1 mt-3">
          {LETTERS.map((L) => (
            <button key={L} onClick={() => { setLetter(letter === L ? "" : L); setSelectedDean(null); }}
              aria-pressed={letter === L}
              className={["w-8 h-8 rounded text-xs font-semibold transition-colors",
                letter === L ? "bg-[#011F5B] text-white" : "bg-muted/60 text-foreground hover:bg-muted"].join(" ")}>
              {L}
            </button>
          ))}
          {(query || letter || discipline || school) && (
            <button onClick={clearAll} className="h-8 px-3 rounded text-xs font-semibold border border-border hover:bg-muted ml-1">Clear</button>
          )}
        </div>
      </div>

      {/* Slate tray: persists while browsing */}
      {slate.length > 0 && (
        <div className="bg-[#011F5B]/5 border border-[#011F5B]/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-[#011F5B]">Your slate — {slate.length}</p>
            <button onClick={() => setSlate([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear slate</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {slate.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 bg-card border border-border rounded-full pl-3 pr-1 py-1 text-xs">
                <button onClick={() => setSelectedDean(d)} className="font-medium hover:underline">{d.dean}</button>
                <span className="text-muted-foreground">· {d.university}</span>
                <button onClick={() => toggleSlate(d)} aria-label={`Remove ${d.dean}`} className="w-4 h-4 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && !selectedDean && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-medium">{results.length} result{results.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
            {results.slice(0, 300).map((d) => (
              <div key={d.id} className="flex items-center gap-2 px-3 sm:px-4 py-2.5 hover:bg-accent/40 transition-colors">
                <input
                  type="checkbox" checked={inSlate(d.id)} onChange={() => toggleSlate(d)}
                  aria-label={`Add ${d.dean} to slate`} className="accent-[#011F5B] w-4 h-4 shrink-0"
                />
                <button onClick={() => setSelectedDean(d)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-9 h-9 rounded-full bg-[#011F5B]/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-[#011F5B]">{d.dean.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{d.dean}</p>
                    <p className="text-xs text-muted-foreground truncate">{d.school}, {d.university}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-[#011F5B] tabular-nums">{d.startYear || "?"}–{d.endYear || "Now"}</p>
                    {d.tenureLength ? <span className="text-[10px] text-muted-foreground">{d.tenureLength} yr{d.tenureLength !== 1 ? "s" : ""}</span> : d.isInterim ? <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Interim</span> : null}
                  </div>
                </button>
              </div>
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
