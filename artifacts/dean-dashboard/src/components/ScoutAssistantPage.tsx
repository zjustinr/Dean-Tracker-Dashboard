import { useState, useMemo, useEffect, useCallback } from "react";
import { useAllDeans, isAlbersUsaMappable } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { genderNorm } from "@/data/types";
import { usePhotoMap, useResearchMap, enrichKey } from "@/data/enrichment";
import { useScoutCandidateEngine, affKey } from "@/data/useScoutCandidates";
import { Methodology } from "@/components/ScoutAssistant";
import ScoutCandidateList from "@/components/ScoutCandidateList";
import StringencyToggle, { STRINGENCY_LEVELS } from "@/components/StringencyToggle";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import ResultsMap from "@/components/ResultsMap";
import RegionMap from "@/components/RegionMap";
import careerRoots from "@/data/career-roots.json";

const REGIONS: Record<string, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};

const DOCT_RE = /\b(ph\.?\s?d|d\.?\s?phil|ed\.?\s?d|sc\.?\s?d|d\.?sc|dr\.?p\.?h|d\.?n\.?p|d\.?b\.?a|dvm|m\.?d|j\.?d|doctora)\b/i;
const PROF_RE = /\b(professor|faculty)\b/i;

const PAGE_SIZE = 50;

/**
 * Scout Assistant, elevated to a standalone module alongside Slate Builder:
 * pick a target school, dial how wide a net to cast with the stringency
 * slider (same combined model as the embedded section, just showing deeper
 * into the ranked list as stringency loosens -- see useScoutCandidateEngine),
 * optionally match against a position announcement, apply the same roster
 * filters Slate Builder offers, and see the candidate pool on a map.
 */
export default function ScoutAssistantPage({ onOpenSchool }: { onOpenSchool?: (university: string, school: string) => void }) {
  const { datasetId, bundle, meta } = useDataset();
  const allDeans = useAllDeans();
  const researchMap = useResearchMap();
  const PHOTOS = usePhotoMap();

  const [university, setUniversity] = useState("");
  const [stringency, setStringency] = useState(1);
  const [includeGender, setIncludeGender] = useState<"all" | "women" | "men">("all");
  const [requirePhd, setRequirePhd] = useState(false);
  const [requireProf, setRequireProf] = useState(false);
  const [apptType, setApptType] = useState<"all" | "perm" | "interim">("all");
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  const [jdKeywords, setJdKeywords] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [mapExpandedId, setMapExpandedId] = useState<number | null>(null);

  // Reset everything when the active dataset (index) changes -- a school,
  // state, or JD match chosen for one index doesn't carry meaning in another.
  useEffect(() => {
    setUniversity(""); setStringency(1); setIncludeGender("all"); setRequirePhd(false); setRequireProf(false);
    setApptType("all"); setRegions(new Set()); setStates(new Set()); setJdKeywords([]); setVisibleCount(PAGE_SIZE);
  }, [datasetId]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [university, stringency]);

  const universities = useMemo(() => [...new Set(allDeans.map((d) => d.university))].sort((a, b) => a.localeCompare(b)), [allDeans]);

  const stateOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of (bundle.schools as unknown as { university?: string; state?: string }[])) {
      if (s.university && s.state) m.set(s.university.toLowerCase(), s.state);
    }
    return m;
  }, [bundle.schools]);
  const geoOf = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const s of (bundle.schools as unknown as { university?: string; state?: string; lat?: number | null; lng?: number | null }[])) {
      if (s.university && isAlbersUsaMappable(s) && s.lat != null && s.lng != null) m.set(s.university.toLowerCase(), { lat: s.lat, lng: s.lng });
    }
    return m;
  }, [bundle.schools]);

  const hasDoctorate = useCallback((d: Dean): boolean => {
    if (d.hasPhd) return true;
    const f = `${d.dean} ${d.discipline || ""} ${d.priorTitle || ""} ${d.careerBackground || ""}`;
    if (DOCT_RE.test(f)) return true;
    const roots = (careerRoots as Record<string, { level?: string }[]>)[enrichKey(d.dean, d.university)];
    return !!roots && roots.some((r) => DOCT_RE.test(r.level || ""));
  }, []);
  const wasProfessor = useCallback((d: Dean): boolean => {
    if ((d as { roleType?: string }).roleType !== "subdean") return true;
    const f = `${d.discipline || ""} ${d.priorTitle || ""} ${d.careerBackground || ""}`;
    if (PROF_RE.test(f)) return true;
    const car = researchMap[enrichKey(d.dean, d.university)]?.career;
    return !!car && car.some((s) => PROF_RE.test(s.role || ""));
  }, [researchMap]);

  const effectiveStates = useMemo(() => {
    const s = new Set(states);
    for (const r of regions) for (const st of REGIONS[r]) s.add(st);
    return s;
  }, [states, regions]);

  // Keyword vocabulary for job-description matching: every distinct expertise
  // tag on a leader's research brief in this index, same source Slate
  // Builder's own keyword search draws from.
  const keywordVocabulary = useMemo(() => {
    const c = new Map<string, { display: string; n: number }>();
    const seenPeople = new Set<string>();
    for (const d of allDeans) {
      const pk = d.dean + "|" + d.university;
      if (seenPeople.has(pk)) continue;
      seenPeople.add(pk);
      const exp = researchMap[enrichKey(d.dean, d.university)]?.expertise;
      if (exp) for (const t of exp) {
        const display = String(t).trim();
        if (!display) continue;
        const k = display.toLowerCase();
        const cur = c.get(k);
        if (cur) cur.n += 1; else c.set(k, { display, n: 1 });
      }
    }
    return [...c.values()].sort((a, b) => b.n - a.n || a.display.localeCompare(b.display)).map((v) => v.display);
  }, [allDeans, researchMap]);

  const rosterFilter = useCallback((d: Dean): boolean => {
    if (requirePhd && !hasDoctorate(d)) return false;
    if (requireProf && !wasProfessor(d)) return false;
    if (includeGender !== "all") {
      const g = genderNorm(d.gender);
      if (includeGender === "women" && g !== "F") return false;
      if (includeGender === "men" && g !== "M") return false;
    }
    const isSub = (d as { roleType?: string }).roleType === "subdean";
    if (apptType === "perm" && (isSub || d.isInterim)) return false;
    if (apptType === "interim" && !isSub && !d.isInterim) return false;
    if (effectiveStates.size) {
      const st = stateOf.get(d.university.toLowerCase());
      if (!st || !effectiveStates.has(st)) return false;
    }
    return true;
  }, [requirePhd, requireProf, includeGender, apptType, effectiveStates, stateOf, hasDoctorate, wasProfessor]);

  // Job-description keyword boost: a heuristic overlap score against the
  // person's own expertise tags / discipline / career text, NOT a validated
  // statistical lift like the rest of the model -- kept as a soft additive
  // score at every tier, and promoted to a HARD requirement (>=1 match) only
  // at the strictest tier, matching "mine the posting for the tightest fit."
  const keywordMatchCount = useCallback((dean: Dean | undefined): number => {
    if (!jdKeywords.length || !dean) return 0;
    const expertise = researchMap[enrichKey(dean.dean, dean.university)]?.expertise || [];
    const text = `${dean.discipline || ""} ${dean.careerBackground || ""} ${dean.priorTitle || ""} ${expertise.join(" ")}`.toLowerCase();
    let n = 0;
    for (const kw of jdKeywords) if (text.includes(kw.toLowerCase())) n++;
    return n;
  }, [jdKeywords, researchMap]);

  const combinedFilter = useCallback((d: Dean): boolean => {
    if (!rosterFilter(d)) return false;
    if (jdKeywords.length > 0 && stringency === 1 && keywordMatchCount(d) === 0) return false;
    return true;
  }, [rosterFilter, jdKeywords, stringency, keywordMatchCount]);

  const keywordScore = useCallback((dean: Dean | undefined) => keywordMatchCount(dean) * 0.5, [keywordMatchCount]);

  const level = STRINGENCY_LEVELS[stringency - 1];
  const engine = useScoutCandidateEngine({
    university, cap: level.cap, includeBroad: level.includeBroad,
    filter: university ? combinedFilter : undefined,
    keywordScore: jdKeywords.length > 0 ? keywordScore : undefined,
  });

  const shown = engine.candidates.slice(0, visibleCount);
  const mapDeans = useMemo(() => {
    const out: Dean[] = [];
    for (const c of shown) {
      const resolved = c.dean ?? (c.resolvable ? engine.resolvedProfiles[affKey(c.resolvable)] : undefined);
      if (resolved && resolved !== "not-found") out.push(resolved);
    }
    return out;
  }, [shown, engine.resolvedProfiles]);

  const sel = "w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30";
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter((cur) => { const n = new Set(cur); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const stateList = useMemo(() => [...new Set(stateOf.values())].sort(), [stateOf]);

  return (
    <div className="space-y-4">
      <div className="bg-[#011F5B]/[0.05] dark:bg-[#011F5B]/15 border border-[#011F5B]/40 rounded-xl p-4 sm:p-6">
        <div className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-4 px-4 sm:px-6 py-3.5 bg-gradient-to-r from-[#011F5B] to-[#0a3a8f] rounded-t-xl">
          <h2 className="text-lg font-bold text-white leading-tight flex items-center gap-2 flex-wrap">
            <span>Scout Assistant</span>
          </h2>
          <p className="text-sm text-white/75">
            Pick a school, dial how wide a net to cast, optionally match a position announcement, and filter the pool
            — the same combined model throughout, just showing deeper into the ranked list as stringency loosens.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="text-xs font-medium text-muted-foreground">School with the opening</span>
            <select className={`${sel} mt-1`} value={university} onChange={(e) => setUniversity(e.target.value)} aria-label="Target school">
              <option value="">Select a school…</option>
              {universities.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      </div>

      {!university ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">Pick a school above to see scouted candidates.</p>
        </div>
      ) : !engine.idx ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No mined patterns for {meta.label.toLowerCase()} yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl p-4 sm:p-6 space-y-4">
            <StringencyToggle value={stringency} onChange={setStringency} />
            <JobDescriptionInput vocabulary={keywordVocabulary} onKeywords={setJdKeywords} />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-medium text-muted-foreground">Include</span>
              <div className="inline-flex rounded-lg border border-muted-foreground/30 overflow-hidden text-xs font-semibold">
                {([["all", "All"], ["women", "Women"], ["men", "Men"]] as ["all" | "women" | "men", string][]).map(([v, label], i) => (
                  <button key={v} onClick={() => setIncludeGender(v)}
                    className={["px-3 py-1.5 transition-colors", i > 0 ? "border-l border-muted-foreground/30" : "", includeGender === v ? "bg-[#011F5B] text-white" : "bg-background hover:bg-muted"].join(" ")}>{label}</button>
                ))}
              </div>
              <span className="text-xs font-medium text-muted-foreground ml-2">Tenure type</span>
              <div className="inline-flex rounded-lg border border-muted-foreground/30 overflow-hidden text-xs font-semibold">
                {([["all", "All"], ["perm", "Permanent"], ["interim", "Assoc/Vice/Interim"]] as ["all" | "perm" | "interim", string][]).map(([v, label], i) => (
                  <button key={v} onClick={() => setApptType(v)}
                    className={["px-3 py-1.5 transition-colors", i > 0 ? "border-l border-muted-foreground/30" : "", apptType === v ? "bg-[#011F5B] text-white" : "bg-background hover:bg-muted"].join(" ")}>{label}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Credentials</span>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                <input type="checkbox" checked={requirePhd} onChange={(e) => setRequirePhd(e.target.checked)} className="accent-[#011F5B] w-3.5 h-3.5" />
                Ph.D.
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none">
                <input type="checkbox" checked={requireProf} onChange={(e) => setRequireProf(e.target.checked)} className="accent-[#011F5B] w-3.5 h-3.5" />
                Professor
              </label>
            </div>

            <div className="flex gap-3 items-start">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Region</span>
                  <div className="inline-flex rounded-lg border border-muted-foreground/30 overflow-hidden text-xs font-semibold">
                    <button onClick={() => setRegions(new Set())} className={["px-3 py-1.5 transition-colors", regions.size === 0 ? "bg-[#011F5B] text-white" : "bg-background hover:bg-muted"].join(" ")}>All</button>
                    {Object.keys(REGIONS).map((r) => (
                      <button key={r} onClick={() => toggleSet(setRegions, r)} className={["px-3 py-1.5 border-l border-muted-foreground/30 transition-colors", regions.has(r) ? "bg-[#011F5B] text-white" : "bg-background hover:bg-muted"].join(" ")}>{r}</button>
                    ))}
                  </div>
                </div>
                <span className="text-xs font-medium text-muted-foreground">States</span>
                <div className="mt-1 flex flex-wrap gap-1 max-h-32 overflow-y-auto rounded-lg border border-muted-foreground/30 p-2">
                  {stateList.map((st) => (
                    <button key={st} onClick={() => toggleSet(setStates, st)} className={["w-9 h-7 rounded text-[11px] font-semibold", states.has(st) ? "bg-[#011F5B] text-white" : "bg-muted/60 hover:bg-muted"].join(" ")}>{st}</button>
                  ))}
                </div>
              </div>
              <div className="shrink-0 w-[38%] max-w-[220px] pt-6">
                <RegionMap selected={effectiveStates} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
                <p className="text-sm font-medium">
                  {engine.totalRanked === 0 ? "No" : Math.min(shown.length, engine.totalRanked).toLocaleString()} of {engine.totalRanked.toLocaleString()} eligible candidate{engine.totalRanked === 1 ? "" : "s"} shown
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Scored against patterns mined from our own {meta.label.toLowerCase()} appointment history for {university} — a fit to this school's historical pattern, not a recommendation.
                </p>
              </div>
              <ScoutCandidateList
                candidates={shown}
                resolvedProfiles={engine.resolvedProfiles}
                resolveProfile={engine.resolveProfile}
                allDeans={engine.allDeans}
                onOpenSchool={onOpenSchool}
                emptyMessage={`No eligible candidates found for ${university} at this stringency/filter combination yet.`}
              />
              {engine.candidates.length > visibleCount && (
                <div className="px-4 sm:px-5 py-3 border-t border-border">
                  <button onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="text-xs font-semibold px-3 py-1.5 rounded border border-muted-foreground/40 hover:bg-muted">
                    Show {Math.min(PAGE_SIZE, engine.candidates.length - visibleCount)} more
                  </button>
                </div>
              )}
              <div className="border-t border-border">
                <Methodology idx={engine.idx} label={meta.label} employerProfile={engine.employerProfile} validation={engine.employerValidation} />
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="sticky top-4">
                <ResultsMap results={mapDeans} geoOf={geoOf} photoOf={(d) => PHOTOS[enrichKey(d.dean, d.university)]?.photo} activeId={mapExpandedId} onSelect={setMapExpandedId} />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
