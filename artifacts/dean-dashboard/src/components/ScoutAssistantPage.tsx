import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAllDeans, isAlbersUsaMappable } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { genderNorm } from "@/data/types";
import { usePhotoMap, useResearchMap, enrichKey, useNonAcademicExperience } from "@/data/enrichment";
import { useScoutCandidateEngine, affKey } from "@/data/useScoutCandidates";
import { matchKeywords, type Keyword } from "@/data/keywordMatch";
import { Methodology } from "@/components/ScoutAssistant";
import ScoutCandidateList from "@/components/ScoutCandidateList";
import StringencyToggle, { STRINGENCY_LEVELS } from "@/components/StringencyToggle";
import JobDescriptionInput from "@/components/JobDescriptionInput";
import ResultsMap from "@/components/ResultsMap";
import RegionMap from "@/components/RegionMap";
import {
  FilterRow, FilterGroup, SegGroup, PillGroup, PillToggles, ActiveFilterBar, type ActiveChip,
} from "@/components/FilterControls";
import careerRoots from "@/data/career-roots.json";
import careerGeo from "@/data/career-geo.json";

interface GeoEntry { lat: number; lng: number; state?: string | null; city?: string; country?: string }
const CAREER_GEO = careerGeo as unknown as Record<string, GeoEntry>;

const REGIONS: Record<string, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};

// Institution-tier display order -- see IndividualSearch.tsx's TIER_ORDER for the
// full rationale. Kept in sync manually (this file duplicates several other small
// constants from IndividualSearch already, e.g. REGIONS/DOCT_RE/PROF_RE).
const TIER_ORDER = ["R1", "R2", "R3 / Other Doctoral", "Regional / Master's", "Liberal Arts College", "Community College", "Specialized / Professional School", "System Office / Consortium"];

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
  // Named-firm industry tie (nonacademic-experience.json), not the legacy
  // hasIndustryExp boolean -- see hasIndustryTie below.
  const [requireIndustryTie, setRequireIndustryTie] = useState(false);
  const [apptType, setApptType] = useState<"all" | "perm" | "interim">("all");
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  // Function (disciplineBroad) and institution-tier (carnegie) toggles -- same
  // multi-select shape and rationale as Slate Builder's. New here (Scout Assistant
  // never had a discipline/function filter before); most indices only have one or
  // a handful of distinct values, so these stay out of the way until an index like
  // Senior Administrative Leaders actually needs them.
  const [functions, setFunctions] = useState<Set<string>>(new Set());
  const [tiers, setTiers] = useState<Set<string>>(new Set());
  const [jdKeywords, setJdKeywords] = useState<Keyword[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [mapExpandedId, setMapExpandedId] = useState<number | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const handleMatch = useCallback((n: number) => {
    setMatchNotice(n > 0 ? `Matched ${n} keyword${n === 1 ? "" : "s"} from the posting -- candidates below are re-scored.` : "No distinctive keywords found in that text -- try pasting more of the posting.");
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => setMatchNotice(null), 5000);
  }, []);

  // Reset everything when the active dataset (index) changes -- a school,
  // state, or JD match chosen for one index doesn't carry meaning in another.
  useEffect(() => {
    setUniversity(""); setStringency(1); setIncludeGender("all"); setRequirePhd(false); setRequireProf(false);
    setApptType("all"); setRegions(new Set()); setStates(new Set()); setFunctions(new Set()); setTiers(new Set()); setRequireIndustryTie(false);
    setJdKeywords([]); setVisibleCount(PAGE_SIZE);
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
  const tierOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of (bundle.schools as unknown as { university?: string; carnegie?: string }[])) {
      if (s.university && s.carnegie) m.set(s.university.toLowerCase(), s.carnegie);
    }
    return m;
  }, [bundle.schools]);
  const { functionOptions, tierOptions } = useMemo(() => {
    const fSet = new Set<string>(), tSet = new Set<string>();
    for (const d of allDeans) {
      if (d.disciplineBroad && d.disciplineBroad !== "Unknown") fSet.add(d.disciplineBroad);
      const t = tierOf.get(d.university.toLowerCase());
      if (t) tSet.add(t);
    }
    return {
      functionOptions: [...fSet].sort((a, b) => a.localeCompare(b)),
      tierOptions: TIER_ORDER.filter((t) => tSet.has(t)),
    };
  }, [allDeans, tierOf]);
  const geoOf = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    // Corpus-wide fallback first -- Scout Assistant draws candidates from every
    // index (affinity/weak-link cross-index matches), so a candidate's
    // university is often outside this index's own schools roster and would
    // otherwise silently drop into "without a location" on the map even
    // though it has real coordinates elsewhere in the corpus. The current
    // index's own schools.json then overrides with its entry where both exist.
    for (const [uni, g] of Object.entries(CAREER_GEO)) {
      if (isAlbersUsaMappable(g)) m.set(uni, { lat: g.lat, lng: g.lng });
    }
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

  // Requires confidence "high" (a named firm): a flag-only yes has no employer,
  // so a candidate row matching on it could not explain itself.
  const industryPeople = useNonAcademicExperience()?.people ?? null;
  const hasIndustryTie = useCallback((d: Dean): boolean => {
    const rec = industryPeople?.[enrichKey(d.dean, d.university)];
    return !!rec && rec.status === "yes" && rec.confidence === "high" && !!rec.ties?.length;
  }, [industryPeople]);

  const rosterFilter = useCallback((d: Dean): boolean => {
    if (requirePhd && !hasDoctorate(d)) return false;
    if (requireProf && !wasProfessor(d)) return false;
    if (requireIndustryTie && !hasIndustryTie(d)) return false;
    if (includeGender !== "all") {
      const g = genderNorm(d.gender);
      if (includeGender === "women" && g !== "F") return false;
      if (includeGender === "men" && g !== "M") return false;
    }
    const isSub = (d as { roleType?: string }).roleType === "subdean";
    if (apptType === "perm" && (isSub || d.isInterim)) return false;
    if (apptType === "interim" && !isSub && !d.isInterim) return false;
    if (functions.size && !functions.has(d.disciplineBroad || "")) return false;
    if (tiers.size) {
      const t = tierOf.get(d.university.toLowerCase());
      if (!t || !tiers.has(t)) return false;
    }
    if (effectiveStates.size) {
      const st = stateOf.get(d.university.toLowerCase());
      if (!st || !effectiveStates.has(st)) return false;
    }
    return true;
  }, [requirePhd, requireProf, requireIndustryTie, hasIndustryTie, includeGender, apptType, functions, tiers, tierOf, effectiveStates, stateOf, hasDoctorate, wasProfessor]);

  // Job-description keyword boost: a heuristic overlap score against a broad
  // text surface for each candidate -- discipline, career background, prior
  // title, researched brief/education, expertise tags, and career-step
  // roles/orgs -- NOT a validated statistical lift like the rest of the
  // model. Matching is fuzzy (stemmed word roots for single-word keywords,
  // substring for phrases/tags), so posting language doesn't have to appear
  // verbatim to connect: a candidate's brief saying "innovative" still
  // matches a posting that said "innovation." The intent at this stage is a
  // broad net -- ANY of the many extracted keywords is enough to surface a
  // candidate -- with the stringency dial doing the real narrowing. Kept as
  // a soft additive score at every tier, and promoted to a HARD requirement
  // (>=1 match) only at the strictest tier, matching "mine the posting for
  // the tightest fit."
  const candidateMatchText = useCallback((dean: Dean | undefined, name: string, subtitle: string): string => {
    const research = dean ? researchMap[enrichKey(dean.dean, dean.university)] : undefined;
    const careerText = research?.career?.flatMap((c) => [c.role, c.org]) || [];
    return [
      dean?.discipline, dean?.careerBackground, dean?.priorTitle,
      research?.summary, research?.education,
      ...(research?.expertise || []),
      ...careerText,
      name, subtitle,
    ].filter(Boolean).join(" ");
  }, [researchMap]);

  const keywordMatch = useCallback((dean: Dean | undefined, name: string, subtitle: string): { score: number; matched: string[] } => {
    if (!jdKeywords.length) return { score: 0, matched: [] };
    const hits = matchKeywords(candidateMatchText(dean, name, subtitle), jdKeywords);
    return { score: hits.length * 0.5, matched: hits.map((k) => k.display) };
  }, [jdKeywords, candidateMatchText]);

  const combinedFilter = useCallback((d: Dean): boolean => {
    if (!rosterFilter(d)) return false;
    if (jdKeywords.length > 0 && stringency === 1 && keywordMatch(d, d.dean, d.priorTitle || "").matched.length === 0) return false;
    return true;
  }, [rosterFilter, jdKeywords, stringency, keywordMatch]);

  const level = STRINGENCY_LEVELS[stringency - 1];
  const engine = useScoutCandidateEngine({
    university, cap: level.cap, includeBroad: level.includeBroad,
    filter: university ? combinedFilter : undefined,
    keywordScore: jdKeywords.length > 0 ? keywordMatch : undefined,
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

  // Collapsed groups must still say what they are doing, so each one gets a
  // one-line summary. A group whose summary is its default reads as "nothing to
  // see here" and stays shut; anything else opens itself.
  const GENDER_LABEL = { all: "All", women: "Women", men: "Men" } as const;
  const APPT_LABEL = { all: "All", perm: "Permanent", interim: "Assoc/Vice/Interim" } as const;
  const roleSummary = [functions.size ? [...functions].join(", ") : null,
                       apptType !== "all" ? APPT_LABEL[apptType] : null].filter(Boolean).join(" · ") || "Any function";
  const personSummary = [includeGender !== "all" ? GENDER_LABEL[includeGender] : null,
                         requirePhd ? "Ph.D." : null, requireProf ? "Professor" : null,
                         requireIndustryTie ? "Non-academic tie" : null].filter(Boolean).join(" · ") || "Anyone";
  const locationSummary = regions.size || states.size
    ? [...regions, ...states].join(", ")
    : "Anywhere";

  // The active bar answers "why am I seeing this many" without making anyone
  // reconstruct it from the controls. Every chip removes exactly one thing.
  const activeChips: ActiveChip[] = [
    ...[...functions].map((f) => ({ id: `fn:${f}`, label: f, onRemove: () => toggleSet(setFunctions, f) })),
    ...(apptType !== "all" ? [{ id: "appt", label: APPT_LABEL[apptType], onRemove: () => setApptType("all") }] : []),
    ...(includeGender !== "all" ? [{ id: "gender", label: GENDER_LABEL[includeGender], onRemove: () => setIncludeGender("all") }] : []),
    ...(requirePhd ? [{ id: "phd", label: "Ph.D.", onRemove: () => setRequirePhd(false) }] : []),
    ...(requireProf ? [{ id: "prof", label: "Professor", onRemove: () => setRequireProf(false) }] : []),
    ...(requireIndustryTie ? [{ id: "na", label: "Non-academic tie", accent: "teal" as const, onRemove: () => setRequireIndustryTie(false) }] : []),
    ...[...tiers].map((t) => ({ id: `tier:${t}`, label: t, onRemove: () => toggleSet(setTiers, t) })),
    ...[...regions].map((r) => ({ id: `region:${r}`, label: r, onRemove: () => toggleSet(setRegions, r) })),
    ...[...states].map((st) => ({ id: `state:${st}`, label: st, onRemove: () => toggleSet(setStates, st) })),
  ];

  const clearAllFilters = () => {
    setFunctions(new Set()); setTiers(new Set()); setRegions(new Set()); setStates(new Set());
    setApptType("all"); setIncludeGender("all");
    setRequirePhd(false); setRequireProf(false); setRequireIndustryTie(false);
  };

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
            {/* Distinguishes Scout Assistant from Slate Builder's "School" dropdown,
                which is just one filter among many for browsing a whole cohort.
                Here the school IS the starting point -- everything below is scored
                against that one target's historical hiring pattern. */}
            <span className="text-xs font-medium text-muted-foreground">If you have a specific school in mind</span>
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
            <JobDescriptionInput vocabulary={keywordVocabulary} onKeywords={setJdKeywords} onMatch={handleMatch} />

            <ActiveFilterBar
              chips={activeChips}
              onClearAll={clearAllFilters}
              resultCount={engine.totalRanked}
              noun="eligible"
            />

            <div className="flex flex-col gap-2">
              <FilterGroup title="Role" summary={roleSummary} defaultOpen>
                {functionOptions.length > 1 && (
                  <FilterRow label="Function">
                    <PillGroup ariaLabel="Function" options={functionOptions} selected={functions}
                      onToggle={(v) => toggleSet(setFunctions, v)} onClear={() => setFunctions(new Set())} />
                  </FilterRow>
                )}
                <FilterRow label="Appointment">
                  <SegGroup ariaLabel="Appointment type" value={apptType} onChange={setApptType}
                    options={[["all", "All"], ["perm", "Permanent"], ["interim", "Assoc/Vice/Interim"]]} />
                </FilterRow>
              </FilterGroup>

              <FilterGroup title="Person" summary={personSummary}
                defaultOpen={includeGender !== "all" || requirePhd || requireProf || requireIndustryTie}>
                <FilterRow label="Include" hint="Widen the pool for a defensible diverse slate.">
                  <SegGroup ariaLabel="Include" value={includeGender} onChange={setIncludeGender}
                    options={[["all", "All"], ["women", "Women"], ["men", "Men"]]} />
                </FilterRow>
                <FilterRow label="Credentials" hint="Held a doctorate · faculty rank · a named organisation outside the academy.">
                  <PillToggles items={[
                    { key: "phd", label: "Ph.D.", on: requirePhd, onToggle: () => setRequirePhd(!requirePhd) },
                    { key: "prof", label: "Professor", on: requireProf, onToggle: () => setRequireProf(!requireProf) },
                    { key: "na", label: "Non-academic tie", on: requireIndustryTie, accent: "teal", onToggle: () => setRequireIndustryTie(!requireIndustryTie) },
                  ]} />
                </FilterRow>
              </FilterGroup>

              {tierOptions.length > 1 && (
                <FilterGroup title="Institution" summary={tiers.size ? [...tiers].join(", ") : "All tiers"} defaultOpen={tiers.size > 0}>
                  <FilterRow label="Tier">
                    <PillGroup ariaLabel="Institution tier" options={tierOptions} selected={tiers}
                      onToggle={(v) => toggleSet(setTiers, v)} onClear={() => setTiers(new Set())} />
                  </FilterRow>
                </FilterGroup>
              )}

              <FilterGroup title="Location" summary={locationSummary} defaultOpen={regions.size > 0 || states.size > 0}>
                <FilterRow label="Region">
                  <PillGroup ariaLabel="Region" options={Object.keys(REGIONS)} selected={regions}
                    onToggle={(v) => toggleSet(setRegions, v)} onClear={() => setRegions(new Set())} />
                </FilterRow>
                <FilterRow label="States" hint={states.size ? undefined : "Pick a region above, or individual states here."}>
                  <div className="flex gap-3 items-start w-full">
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1 max-h-32 overflow-y-auto rounded-lg border border-muted-foreground/30 p-2">
                      {stateList.map((st) => (
                        <button key={st} type="button" onClick={() => toggleSet(setStates, st)} aria-pressed={states.has(st)}
                          className={["w-9 h-7 rounded text-[11px] font-semibold", states.has(st) ? "bg-[#011F5B] text-white" : "bg-muted/60 hover:bg-muted"].join(" ")}>{st}</button>
                      ))}
                    </div>
                    <div className="shrink-0 w-[38%] max-w-[200px]">
                      <RegionMap selected={effectiveStates} />
                    </div>
                  </div>
                </FilterRow>
              </FilterGroup>
            </div>
          </div>

          <div ref={resultsRef} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start scroll-mt-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {matchNotice && (
                <div className="px-4 sm:px-5 py-2 border-b border-border bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 text-xs font-medium flex items-center gap-1.5">
                  <span aria-hidden>✓</span> {matchNotice}
                </div>
              )}
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
