import { useState, useMemo, useEffect } from "react";
import { useAllDeans } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import { DATASETS } from "@/data/datasets";
import type { Dean } from "@/data/types";
import DeanProfile from "@/components/DeanProfile";
import deanPhotos from "@/data/dean-photos.json";

export interface DeanSearchPrefill {
  fullName: string;
  first: string;
  last: string;
  token: number;
}

const PHOTOS = deanPhotos as Record<string, { photo: string; source?: string }>;
const pkey = (dean: string, uni: string) => `${dean.trim().toLowerCase()}|${uni.trim().toLowerCase()}`;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CAP = 2000;
const NOW = 2026;
const SLATE_KEY = "bi_slate_v1";

const REGIONS: Record<string, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};

/**
 * Slate Builder — the flagship view.
 *
 * Filters a cohort (tenure window, 5+ years in seat, school, discipline,
 * state/region, name), checks people into a shortlist that persists across
 * sessions (localStorage), compares or exports that shortlist, and expands a
 * full profile inline between rows. Mobile-first: plain input + native
 * <select> + tappable rows, no custom dropdown to mis-tap.
 */
export default function IndividualSearch({ prefill, onOpenSchool }: { prefill?: DeanSearchPrefill | null; onOpenSchool?: (university: string, school: string) => void }) {
  const { datasetId, noun, nounLower, nounPluralLower } = useDataset();
  const allDeans = useAllDeans();

  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [school, setSchool] = useState("");
  const [tenureWin, setTenureWin] = useState<"sitting" | "5" | "10" | "any">("sitting");
  const [longTenure, setLongTenure] = useState(false);
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "tenure" | "recent">("name");
  const [slate, setSlate] = useState<Dean[]>(() => {
    try { const r = localStorage.getItem(SLATE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [compareOpen, setCompareOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(SLATE_KEY, JSON.stringify(slate)); } catch { /* quota / private mode */ }
  }, [slate]);

  const stateOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of (DATASETS[datasetId].schools as unknown as { university?: string; state?: string }[])) {
      if (s.university && s.state) m.set(s.university.toLowerCase(), s.state);
    }
    return m;
  }, [datasetId]);

  useEffect(() => {
    if (!prefill) return;
    setQuery(prefill.fullName);
    setLetter(""); setDiscipline(""); setSchool(""); setTenureWin("any");
    setLongTenure(false); setRegions(new Set()); setStates(new Set());
    const matches = allDeans.filter((d) => d.dean.toLowerCase() === prefill.fullName.toLowerCase());
    const best = matches.find((d) => d.endYear == null) || matches[0] || null;
    setExpandedId(best ? best.id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token]);

  const { disciplines, schoolList, stateList } = useMemo(() => {
    const dSet = new Set<string>(), sSet = new Set<string>(), stSet = new Set<string>();
    for (const d of allDeans) {
      if (d.disciplineBroad && d.disciplineBroad !== "Unknown") dSet.add(d.disciplineBroad);
      if (d.university) sSet.add(d.university);
    }
    for (const st of stateOf.values()) stSet.add(st);
    return {
      disciplines: [...dSet].sort((a, b) => a.localeCompare(b)),
      schoolList: [...sSet].sort((a, b) => a.localeCompare(b)),
      stateList: [...stSet].sort(),
    };
  }, [allDeans, stateOf]);

  const effectiveStates = useMemo(() => {
    const s = new Set(states);
    for (const r of regions) for (const st of REGIONS[r]) s.add(st);
    return s;
  }, [states, regions]);

  const hasFilter = query.trim() !== "" || !!letter || !!discipline || !!school ||
    tenureWin !== "any" || longTenure || effectiveStates.size > 0;

  // Base cohort with every filter EXCEPT location, so region chips can show counts.
  const locBase = useMemo(() => {
    if (!hasFilter) return [];
    const q = query.trim().toLowerCase();
    const seen = new Set<string>();
    return allDeans.filter((d) => {
      const last = (d.dean.split(/\s+/).pop() || "").toLowerCase();
      if (tenureWin === "sitting" && d.endYear != null) return false;
      if (tenureWin === "5" && d.endYear != null && d.endYear < NOW - 5) return false;
      if (tenureWin === "10" && d.endYear != null && d.endYear < NOW - 10) return false;
      if (longTenure && !(d.tenureLength && d.tenureLength >= 5)) return false;
      if (q && !d.dean.toLowerCase().includes(q)) return false;
      if (letter && last[0] !== letter.toLowerCase()) return false;
      if (discipline && d.disciplineBroad !== discipline) return false;
      if (school && d.university !== school) return false;
      const key = d.dean + "|" + d.university + "|" + d.school;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allDeans, query, letter, discipline, school, tenureWin, longTenure, hasFilter]);

  const regionCounts = useMemo(() => {
    const c: Record<string, number> = { Northeast: 0, Midwest: 0, South: 0, West: 0 };
    for (const d of locBase) {
      const st = stateOf.get(d.university.toLowerCase());
      if (!st) continue;
      for (const r of Object.keys(REGIONS)) if (REGIONS[r].includes(st)) c[r]++;
    }
    return c;
  }, [locBase, stateOf]);

  const results = useMemo(() => {
    const rows = effectiveStates.size
      ? locBase.filter((d) => { const st = stateOf.get(d.university.toLowerCase()); return !!st && effectiveStates.has(st); })
      : locBase.slice();
    rows.sort((a, b) => {
      if (sortBy === "tenure") return (b.tenureLength || 0) - (a.tenureLength || 0);
      if (sortBy === "recent") return (b.startYear || 0) - (a.startYear || 0);
      const cmp = (a.dean.split(/\s+/).pop() || "").localeCompare(b.dean.split(/\s+/).pop() || "");
      return cmp !== 0 ? cmp : a.dean.localeCompare(b.dean);
    });
    return rows;
  }, [locBase, effectiveStates, stateOf, sortBy]);

  const shown = results.slice(0, CAP);
  const inSlate = (id: number) => slate.some((d) => d.id === id);
  const toggleSlate = (d: Dean) => setSlate((cur) => inSlate(d.id) ? cur.filter((x) => x.id !== d.id) : [...cur, d]);
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter((cur) => { const n = new Set(cur); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const clearAll = () => {
    setQuery(""); setLetter(""); setDiscipline(""); setSchool("");
    setLongTenure(false); setRegions(new Set()); setStates(new Set()); setExpandedId(null);
  };

  // Export the SHORTLIST only (the user's hand-picked few), not the dataset.
  const exportSlate = () => {
    const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ["Name", "School", "University", "State", "Discipline", "Appointed", "Left", "Tenure (yrs)", "Interim", "Source"];
    const lines = [head.join(",")];
    for (const d of slate) {
      lines.push([d.dean, d.school, d.university, stateOf.get(d.university.toLowerCase()) || "", d.disciplineBroad || "",
        d.startYear || "", d.endYear || "Present", d.tenureLength ?? "", d.isInterim ? "Yes" : "No", d.sourceUrl || ""]
        .map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "baton-index-slate.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sel = "w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30";
  const chip = (active: boolean) =>
    ["px-2.5 h-8 rounded text-xs font-semibold transition-colors", active ? "bg-[#011F5B] text-white" : "bg-muted/60 text-foreground hover:bg-muted"].join(" ");

  function Avatar({ d }: { d: Dean }) {
    const p = PHOTOS[pkey(d.dean, d.university)];
    if (p?.photo) return <img src={p.photo} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />;
    return (
      <div className="w-9 h-9 rounded-full bg-[#011F5B]/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-[#011F5B]">{d.dean.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4 sm:p-6">
        <h2 className="text-lg font-bold mb-1">Slate Builder</h2>
        <p className="text-sm text-muted-foreground mb-4">Filter the cohort, check candidates into your slate, then compare or export.</p>

        <input
          type="text" inputMode="search" value={query}
          onChange={(e) => { setQuery(e.target.value); setExpandedId(null); }}
          placeholder={`Type a ${nounLower}'s name…`}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className={sel} value={tenureWin} onChange={(e) => { setTenureWin(e.target.value as "sitting" | "5" | "10" | "any"); setExpandedId(null); }} aria-label="Tenure window">
            <option value="sitting">Sitting now</option>
            <option value="5">Served in last 5 yrs</option>
            <option value="10">Served in last 10 yrs</option>
            <option value="any">Any time</option>
          </select>
          <select className={sel} value={discipline} onChange={(e) => { setDiscipline(e.target.value); setExpandedId(null); }} aria-label="Discipline">
            <option value="">All disciplines</option>
            {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className={sel} value={school} onChange={(e) => { setSchool(e.target.value); setExpandedId(null); }} aria-label="School">
            <option value="">All schools</option>
            {schoolList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className={sel} value={sortBy} onChange={(e) => setSortBy(e.target.value as "name" | "tenure" | "recent")} aria-label="Sort by">
            <option value="name">Sort: name</option>
            <option value="tenure">Sort: longest tenure</option>
            <option value="recent">Sort: most recently appointed</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
          <button onClick={() => { setLongTenure(!longTenure); setExpandedId(null); }} className={chip(longTenure)}>5+ yrs in seat</button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-0.5">Region</span>
            {Object.keys(REGIONS).map((r) => (
              <button key={r} onClick={() => { toggleSet(setRegions, r); setExpandedId(null); }} className={chip(regions.has(r))}>
                {r}<span className={regions.has(r) ? "text-white/70 ml-1" : "text-muted-foreground ml-1"}>{regionCounts[r]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <span className="text-xs font-medium text-muted-foreground">States</span>
          <div className="mt-1 flex flex-wrap gap-1 max-h-24 overflow-y-auto rounded-lg border border-border p-2">
            {stateList.map((st) => (
              <button key={st} onClick={() => { toggleSet(setStates, st); setExpandedId(null); }} className={["w-9 h-7 rounded text-[11px] font-semibold", states.has(st) ? "bg-[#011F5B] text-white" : "bg-muted/60 hover:bg-muted"].join(" ")}>{st}</button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-3">
          {LETTERS.map((L) => (
            <button key={L} onClick={() => { setLetter(letter === L ? "" : L); setExpandedId(null); }} aria-pressed={letter === L}
              className={["w-8 h-8 rounded text-xs font-semibold transition-colors", letter === L ? "bg-[#011F5B] text-white" : "bg-muted/60 text-foreground hover:bg-muted"].join(" ")}>{L}</button>
          ))}
          <button onClick={clearAll} className="h-8 px-3 rounded text-xs font-semibold border border-border hover:bg-muted ml-1">Reset filters</button>
        </div>
      </div>

      {slate.length > 0 && (
        <div className="bg-[#011F5B]/5 border border-[#011F5B]/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <p className="text-sm font-semibold text-[#011F5B]">Your slate — {slate.length}</p>
            <div className="flex items-center gap-2">
              <button onClick={exportSlate} className="text-xs font-semibold px-2.5 py-1 rounded border border-[#011F5B]/40 text-[#011F5B] hover:bg-[#011F5B]/10">Export CSV</button>
              <button onClick={() => setSlate([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">Clear</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {slate.map((d) => (
              <span key={d.id} className="inline-flex items-center gap-1.5 bg-card border border-border rounded-full pl-3 pr-1 py-1 text-xs">
                <button onClick={() => setExpandedId(d.id)} className="font-medium hover:underline">{d.dean}</button>
                <span className="text-muted-foreground">· {d.university}</span>
                <button onClick={() => toggleSlate(d)} aria-label={`Remove ${d.dean}`} className="w-4 h-4 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground">×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {shown.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{results.length} result{results.length !== 1 ? "s" : ""}</p>
            {slate.length >= 2 && (
              <button onClick={() => setCompareOpen(true)} className="text-xs font-semibold px-3 py-1.5 rounded bg-[#011F5B] text-white shadow-sm hover:brightness-110">
                Compare slate ({slate.length})
              </button>
            )}
          </div>
          <div className="divide-y divide-border">
            {shown.map((d) => {
              const isOpen = expandedId === d.id;
              return (
                <div key={d.id}>
                  <div className={["flex items-center gap-2 px-3 sm:px-4 py-2.5 transition-colors", isOpen ? "bg-[#011F5B]/5" : "hover:bg-accent/40"].join(" ")}>
                    <input type="checkbox" checked={inSlate(d.id)} onChange={() => toggleSlate(d)} aria-label={`Add ${d.dean} to slate`} className="accent-[#011F5B] w-4 h-4 shrink-0" />
                    <button onClick={() => setExpandedId(isOpen ? null : d.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar d={d} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{d.dean}</p>
                        <p className="text-xs text-muted-foreground truncate">{d.school}, {d.university}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-[#011F5B] tabular-nums">{d.startYear || "?"}–{d.endYear || "Now"}</p>
                        {d.tenureLength ? <span className="text-[10px] text-muted-foreground">{d.tenureLength} yr{d.tenureLength !== 1 ? "s" : ""}</span> : d.isInterim ? <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Interim</span> : null}
                      </div>
                      <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-3 sm:px-4 pb-4 pt-1 bg-[#011F5B]/5 border-l-2 border-[#011F5B]">
                      <DeanProfile dean={d} onClose={() => setExpandedId(null)} onOpenSchool={onOpenSchool} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {results.length > CAP && (
            <div className="px-5 py-2 text-xs text-muted-foreground border-t border-border">
              Showing first {CAP.toLocaleString()} of {results.length.toLocaleString()} — narrow the filters to see the rest.
            </div>
          )}
        </div>
      )}

      {results.length === 0 && hasFilter && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No {nounPluralLower} match these filters.</p>
        </div>
      )}

      {compareOpen && slate.length >= 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Compare slate" onClick={() => setCompareOpen(false)}>
          <div className="w-full max-w-4xl max-h-[85vh] overflow-auto rounded-xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card">
              <p className="font-semibold">Compare — {slate.length}</p>
              <button onClick={() => setCompareOpen(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground text-lg leading-none px-1">×</button>
            </div>
            <div className="overflow-x-auto">
              <table className="text-sm min-w-full">
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3 font-medium text-muted-foreground align-top w-32">Candidate</td>
                    {slate.map((d) => (
                      <td key={d.id} className="p-3 align-top min-w-[180px]">
                        <div className="flex items-center gap-2">
                          <Avatar d={d} />
                          <span className="font-semibold">{d.dean}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                  {([
                    ["School", (d: Dean) => d.school],
                    ["University", (d: Dean) => d.university],
                    ["State", (d: Dean) => stateOf.get(d.university.toLowerCase()) || "—"],
                    ["Discipline", (d: Dean) => (d.disciplineBroad && d.disciplineBroad !== "Unknown" ? d.disciplineBroad : "—")],
                    ["Appointed", (d: Dean) => d.startYear || "—"],
                    ["Status", (d: Dean) => (d.endYear == null ? "Sitting" : `Left ${d.endYear}`)],
                    ["Tenure", (d: Dean) => (d.tenureLength ? `${d.tenureLength} yr${d.tenureLength !== 1 ? "s" : ""}` : "—")],
                    ["Prior role", (d: Dean) => d.priorTitle || "—"],
                  ] as [string, (d: Dean) => React.ReactNode][]).map(([label, fn]) => (
                    <tr key={label} className="border-b border-border">
                      <td className="p-3 font-medium text-muted-foreground align-top">{label}</td>
                      {slate.map((d) => <td key={d.id} className="p-3 align-top">{fn(d)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
