import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useAllDeans, isAlbersUsaMappable } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { yearsLabel, genderNorm } from "@/data/types";
import DeanProfile from "@/components/DeanProfile";
import RegionMap from "@/components/RegionMap";
import {
  FilterRow, FilterGroup, SegGroup, PillGroup, PillToggles, ActiveFilterBar, type ActiveChip,
} from "@/components/FilterControls";
import ResultsMap from "@/components/ResultsMap";
import { CareerAssessment, type Root } from "@/components/CareerMap";
import careerRoots from "@/data/career-roots.json";
import { usePhotoMap, useResearchMap, enrichKey, loadAffinity, getAffinityCache, useNonAcademicExperience, type AffEntry, type AffMap } from "@/data/enrichment";
import ScoutAssistant from "@/components/ScoutAssistant";
import { useTrial } from "@/data/TrialContext";

// Cross-index AFFINITY selector kinds (see @/data/enrichment for the fetch/cache
// itself, shared with ScoutAssistant's candidate pool).
const AFF_KINDS: [keyof AffEntry, string][] = [
  ["undergrad", "Undergraduate"], ["grad", "Master or PhD"], ["faculty", "Faculty"], ["admin", "Administration"],
];

export interface DeanSearchPrefill {
  fullName: string;
  first: string;
  last: string;
  token: number;
}

// Debounced, best-effort search-term logging (see api/log.js, kind: "search").
// Fires only once a value settles for SEARCH_LOG_DELAY_MS, so normal typing
// sends one event per pause rather than one per keystroke. The client tag is
// derived server-side from the trial cookie, not sent here.
const SEARCH_LOG_DELAY_MS = 700;
function useSearchLog(source: "slate-name" | "slate-keyword" | "slate-school", value: string) {
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const q = value.trim();
    if (!q) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "search", q, source }),
      }).catch(() => { /* best-effort, never block the UI */ });
    }, SEARCH_LOG_DELAY_MS);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [value, source]);
}

const pkey = (dean: string, uni: string) => `${dean.trim().toLowerCase()}|${uni.trim().toLowerCase()}`;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CAP = 2000;
const NOW = 2026;
const SERVED_CAP = 40;
const SLATE_KEY = "bi_slate_v1";

// Years a leader has held the seat: elapsed time for sitting leaders (whose
// tenureLength is null by construction, since it needs an end year), full tenure
// for past ones. Uniform across indices, unlike the raw tenureLength field.
const elapsedYears = (d: Dean): number | null =>
  d.endYear == null
    ? (d.startYear ? NOW - d.startYear : null)
    : (d.tenureLength ?? (d.startYear && d.endYear ? d.endYear - d.startYear : null));

// Single-track, two-thumb range. More legible than two separate sliders. Built
// from two overlaid native range inputs so keyboard access and accessibility come
// free; only the thumbs take pointer events, so they never block each other.
function DualRange({ min, max, low, high, onLow, onHigh, ariaLow, ariaHigh }: {
  min: number; max: number; low: number; high: number;
  onLow: (v: number) => void; onHigh: (v: number) => void; ariaLow: string; ariaHigh: string;
}) {
  const span = Math.max(1, max - min);
  const lp = ((low - min) / span) * 100;
  const hp = ((high - min) / span) * 100;
  const thumb =
    "pointer-events-none absolute inset-x-0 top-0 h-5 w-full appearance-none bg-transparent m-0 " +
    "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-card [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#011F5B] [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-card [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#011F5B] [&::-moz-range-thumb]:cursor-pointer";
  return (
    <div className="relative h-5">
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-muted-foreground/20" />
      <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-[#011F5B]" style={{ left: `${lp}%`, right: `${100 - hp}%` }} />
      {/* low thumb rides higher z near the top so it stays grabbable when both meet */}
      <input type="range" min={min} max={max} value={low} aria-label={ariaLow} onChange={(e) => onLow(+e.target.value)} className={thumb} style={{ zIndex: low > max - span * 0.12 ? 5 : 3 }} />
      <input type="range" min={min} max={max} value={high} aria-label={ariaHigh} onChange={(e) => onHigh(+e.target.value)} className={thumb} style={{ zIndex: 4 }} />
    </div>
  );
}

const REGIONS: Record<string, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Midwest: ["IL", "IN", "MI", "OH", "WI", "IA", "KS", "MN", "MO", "NE", "ND", "SD"],
  South: ["DE", "DC", "FL", "GA", "MD", "NC", "SC", "VA", "WV", "AL", "KY", "MS", "TN", "AR", "LA", "OK", "TX"],
  West: ["AZ", "CO", "ID", "MT", "NV", "NM", "UT", "WY", "AK", "CA", "HI", "OR", "WA"],
};

// Institution-tier display order (Carnegie-driven, plus a couple of buckets for
// institutions Carnegie doesn't classify as a single doctoral/baccalaureate
// campus). Sparsely populated indices with only one tier still work fine — the
// toggle just renders one button. See bundle.schools[].carnegie for the source.
const TIER_ORDER = ["R1", "R2", "R3 / Other Doctoral", "Regional / Master's", "Liberal Arts College", "Community College", "Specialized / Professional School", "System Office / Consortium"];

/**
 * Slate Builder — the flagship view.
 *
 * Filters a cohort (tenure window, 5+ years in seat, school, discipline,
 * state/region, name), checks people into a shortlist that persists across
 * sessions (localStorage), compares or exports that shortlist, and expands a
 * full profile inline between rows. Mobile-first: plain input + native
 * <select> + tappable rows, no custom dropdown to mis-tap.
 */
export default function IndividualSearch({ prefill, onOpenSchool, onOpenLeader }: { prefill?: DeanSearchPrefill | null; onOpenSchool?: (university: string, school: string) => void; onOpenLeader?: (index: string | null, fullName: string) => void }) {
  const { datasetId, bundle, noun, nounLower, nounPluralLower } = useDataset();
  const allDeans = useAllDeans();
  const PHOTOS = usePhotoMap();
  // Does this index carry an associate/vice-dean feeder bench (roleType "subdean")?
  // If so, the Appointment "Interim" tab becomes "Assoc/Vice/Interim" and shows the
  // bench alongside interims — same treatment the Graduate College index gets.
  const hasBench = useMemo(() => allDeans.some((d) => (d as { roleType?: string }).roleType === "subdean"), [allDeans]);

  const [query, setQuery] = useState("");
  const [letter, setLetter] = useState("");
  // Function/discipline filter (disciplineBroad). Multi-select like regions/states
  // -- empty set = no narrowing, pick one for the old single-value behavior, pick
  // several to browse across functions at once. Most indices only ever have a
  // handful of distinct values; it earns its keep most on messier, cross-function
  // indices like Senior Administrative Leaders (11 buckets: HR, Legal, Finance...).
  const [disciplines, setDisciplines] = useState<Set<string>>(new Set());
  const [school, setSchool] = useState("");
  const [tenureWin, setTenureWin] = useState<"sitting" | "5" | "10" | "any">("sitting");
  // Permanent vs interim. "interim" among sitting leaders = institutions in
  // transition right now, i.e. open/imminent searches — a lead list, not just a
  // candidate filter.
  const [apptType, setApptType] = useState<"all" | "perm" | "interim">("all");
  // Years-in-seat range. Replaces the old boolean "5+ yrs" chip, which matched
  // nothing on the newer indices: it filtered on tenureLength, which is null for
  // sitting leaders, so "Sitting now" + "5+ yrs" returned an empty cohort.
  const [servedMin, setServedMin] = useState(0);
  const [servedMax, setServedMax] = useState(SERVED_CAP);
  // Era window for the tenure-benchmark histogram (null = full data range).
  const [yrFrom, setYrFrom] = useState<number | null>(null);
  const [yrTo, setYrTo] = useState<number | null>(null);
  const [regions, setRegions] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Set<string>>(new Set());
  // Institution-tier toggle (carnegie), same multi-select shape as disciplines
  // above. Sparsely populated indices (one tier) still work fine -- a single
  // button. Earns its keep on cross-tier indices spanning R1s down to community
  // colleges, like Senior Administrative Leaders.
  const [tiers, setTiers] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "tenure" | "recent" | "sofar">("name");
  // Credential screens (Ph.D. / Professor). Off by default across every index —
  // they narrow the slate, so a searcher opts in rather than discovering
  // candidates got filtered out silently.
  const [requirePhd, setRequirePhd] = useState(false);
  const [requireProf, setRequireProf] = useState(false);
  // "Has an industry tie" -- a NAMED-FIRM tie from nonacademic-experience.json, not
  // the legacy hasIndustryExp boolean (unpopulated in most indices, so filtering
  // on it would silently empty the list). Filters to people the derivation can
  // actually point at an employer for.
  const [requireIndustryTie, setRequireIndustryTie] = useState(false);
  // Widen-the-pool control for building a diverse slate, not an exclusionary
  // screen: defaults to "all" and is framed as "Include", the same posture as
  // an affinity filter that surfaces candidates rather than filters them out.
  const [includeGender, setIncludeGender] = useState<"all" | "women" | "men">("all");
  const [affinity, setAffinity] = useState<Set<string>>(new Set());
  // Overlay the departure hazard rate on the tenure histogram (off by default).
  const [showHazard, setShowHazard] = useState(false);
  const [slate, setSlate] = useState<Dean[]>(() => {
    try { const r = localStorage.getItem(SLATE_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
  });
  const [compareOpen, setCompareOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchFocus, setSearchFocus] = useState(false);
  const [keyword, setKeyword] = useState("");
  const researchMap = useResearchMap();
  const openRowRef = useRef<HTMLDivElement | null>(null);

  const { client: trialClient } = useTrial();
  useSearchLog("slate-name", query);
  useSearchLog("slate-keyword", keyword);
  useSearchLog("slate-school", school);

  // Debounced snapshot of the filter panel (see api/log.js, kind: "filter"),
  // sent whenever the active combination settles. Sparse by design — only
  // non-default values are included — so clearing back to defaults doesn't
  // itself read as a fresh filter action, and idle browsing stays quiet.
  const filterSnapshot = useMemo(() => {
    const f: Record<string, string | number | boolean | string[]> = {};
    if (disciplines.size) f.discipline = Array.from(disciplines);
    if (tiers.size) f.tier = Array.from(tiers);
    if (sortBy !== "name") f.sort = sortBy;
    if (includeGender !== "all") f.gender = includeGender;
    if (apptType !== "all") f.apptType = apptType;
    if (regions.size) f.regions = Array.from(regions);
    if (states.size) f.states = Array.from(states);
    if (tenureWin !== "sitting") f.tenureWin = tenureWin;
    if (servedMin !== 0 || servedMax !== SERVED_CAP) f.served = `${servedMin}-${servedMax}`;
    if (yrFrom != null || yrTo != null) f.years = `${yrFrom ?? ""}-${yrTo ?? ""}`;
    if (requirePhd) f.requirePhd = true;
    if (requireProf) f.requireProf = true;
    if (requireIndustryTie) f.requireIndustryTie = true;
    if (letter) f.letter = letter;
    if (showHazard) f.showHazard = true;
    if (affinity.size) f.affinity = Array.from(affinity);
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disciplines, tiers, sortBy, includeGender, apptType, regions, states, tenureWin, servedMin, servedMax, yrFrom, yrTo, requirePhd, requireProf, requireIndustryTie, letter, showHazard, affinity]);
  const filterLogTimer = useRef<number | null>(null);
  const filterLogSig = useRef<string>("{}");
  useEffect(() => {
    const sig = JSON.stringify(filterSnapshot);
    if (sig === filterLogSig.current) return;
    if (filterLogTimer.current) window.clearTimeout(filterLogTimer.current);
    filterLogTimer.current = window.setTimeout(() => {
      filterLogSig.current = sig;
      if (Object.keys(filterSnapshot).length === 0) return;
      fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "filter", filters: filterSnapshot }),
      }).catch(() => { /* best-effort, never block the UI */ });
    }, 800);
    return () => { if (filterLogTimer.current) window.clearTimeout(filterLogTimer.current); };
  }, [filterSnapshot]);

  // A candidate's detail row opened — log which one (see api/log.js, kind:
  // "detail"). Fires only on open, not close, so toggling a row shut isn't a
  // second event.
  const detailLogged = useRef<number | null>(null);
  useEffect(() => {
    if (expandedId == null || detailLogged.current === expandedId) return;
    detailLogged.current = expandedId;
    const d = allDeans.find((x) => x.id === expandedId);
    if (!d) return;
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "detail", name: d.dean, university: d.university }),
    }).catch(() => { /* best-effort, never block the UI */ });
  }, [expandedId, allDeans]);

  // Mirror the shortlist to the server for real (trial/paid) clients only — not
  // the anonymous free tier, which never sees the consent gate. Debounced sync
  // keeps bi:slate:<client> current as candidates are added/removed; exportSlate()
  // below fires an immediate, undebounced "export" call so the dashboard shows
  // exactly when and how many candidates were exported. The client tag itself
  // is derived server-side from the trial cookie (see api/log.js); trialClient
  // here only gates whether we bother sending anything at all.
  const postSlate = (mode: "sync" | "export") => {
    if (!trialClient) return;
    const items = slate.map((d) => ({ name: d.dean, school: d.school, university: d.university }));
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "slate", items, mode }),
    }).catch(() => { /* best-effort */ });
  };
  const slateSyncTimer = useRef<number | null>(null);
  useEffect(() => {
    if (!trialClient) return;
    if (slateSyncTimer.current) window.clearTimeout(slateSyncTimer.current);
    slateSyncTimer.current = window.setTimeout(() => postSlate("sync"), 800);
    return () => { if (slateSyncTimer.current) window.clearTimeout(slateSyncTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slate, trialClient]);

  // Credential detection for the Ph.D. / Professor screens. Broad recall so the
  // default (both on) does not hide legitimate candidates on data-thin rows.
  const DOCT_RE = /\b(ph\.?\s?d|d\.?\s?phil|ed\.?\s?d|sc\.?\s?d|d\.?sc|dr\.?p\.?h|d\.?n\.?p|d\.?b\.?a|dvm|m\.?d|j\.?d|doctora)\b/i;
  const PROF_RE = /\b(professor|faculty)\b/i;
  const hasDoctorate = (d: Dean): boolean => {
    if (d.hasPhd) return true;
    const f = `${d.dean} ${d.discipline || ""} ${d.priorTitle || ""} ${d.careerBackground || ""}`;
    if (DOCT_RE.test(f)) return true;
    const roots = (careerRoots as Record<string, { level?: string }[]>)[enrichKey(d.dean, d.university)];
    return !!roots && roots.some((r) => DOCT_RE.test(r.level || ""));
  };
  const wasProfessor = (d: Dean): boolean => {
    // Dean-level roles require a professorship by definition; only the associate/
    // vice-dean bench (which mixes in staff-track administrators) needs a signal.
    if ((d as { roleType?: string }).roleType !== "subdean") return true;
    const f = `${d.discipline || ""} ${d.priorTitle || ""} ${d.careerBackground || ""}`;
    if (PROF_RE.test(f)) return true;
    const car = researchMap[enrichKey(d.dean, d.university)]?.career;
    return !!car && car.some((s) => PROF_RE.test(s.role || ""));
  };

  // Named-firm industry tie (nonacademic-experience.json). Deliberately requires
  // confidence "high": a flag-only yes has no employer to show, so filtering on
  // it would return people whose row cannot explain why they matched.
  const industryPeople = useNonAcademicExperience()?.people ?? null;
  const hasIndustryTie = useCallback((d: Dean): boolean => {
    const rec = industryPeople?.[enrichKey(d.dean, d.university)];
    return !!rec && rec.status === "yes" && rec.confidence === "high" && !!rec.ties?.length;
  }, [industryPeople]);

  // Tenure inputs for the movability assessment shown in the results-map column.
  // Mirrors DeanProfile's computation (cohort tenure distribution + this leader's
  // own past average) so the rating reads identically.
  function tenureFor(dn: Dean) {
    const NOW = 2026;
    const lens = allDeans.filter((x) => x.endYear != null && !x.isInterim && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number).sort((a, b) => a - b);
    const pct = (p: number) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(p * lens.length))] : null);
    const past = allDeans.filter((x) => x.dean === dn.dean && x.id !== dn.id && x.endYear != null && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number);
    const personalAvg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
    return {
      sitting: dn.endYear == null,
      currentTenure: dn.endYear == null && dn.startYear ? NOW - dn.startYear : dn.tenureLength ?? null,
      median: pct(0.5), p75: pct(0.75), personalAvg, cohortN: lens.length,
    };
  }

  // When a profile opens (a row click, a typeahead pick, or a "View full profile"
  // prefill from the Meet a Leader box), bring its card into view. Without this the
  // prefilled card renders far down the results list and stays off-screen. We poll
  // until the row is laid out and visible (a tab-switch prefill mounts the row a
  // frame or two late), then animate the scroll ourselves with window.scrollTo:
  // native scrollIntoView({behavior:"smooth"}) is a silent no-op in some embedded
  // browsers. Everything is driven by setTimeout, not requestAnimationFrame, so it
  // still runs when the tab is backgrounded (rAF is paused while not compositing).
  useEffect(() => {
    if (expandedId == null) return;
    let cancelled = false;
    let tries = 0;
    const animateTo = (targetY: number) => {
      const startY = window.scrollY;
      const dist = targetY - startY;
      if (Math.abs(dist) < 4) return;
      const steps = 22, stepMs = 18;
      let i = 0;
      const step = () => {
        if (cancelled) return;
        i += 1;
        const p = Math.min(1, i / steps);
        const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
        window.scrollTo(0, startY + dist * ease);
        if (p < 1) setTimeout(step, stepMs);
      };
      step();
    };
    const tick = () => {
      if (cancelled) return;
      const el = (openRowRef.current ?? document.querySelector<HTMLElement>('[data-open-row="1"]'));
      if (el && el.offsetParent !== null) {
        animateTo(Math.max(0, window.scrollY + el.getBoundingClientRect().top - 72)); // clear sticky chrome
        return;
      }
      if (tries++ < 90) setTimeout(tick, 16);
    };
    setTimeout(tick, 16);
    return () => { cancelled = true; };
  }, [expandedId]);

  useEffect(() => {
    try { localStorage.setItem(SLATE_KEY, JSON.stringify(slate)); } catch { /* quota / private mode */ }
  }, [slate]);

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

  // University -> map point, for the candidate map. Only schools geoAlbersUsa can
  // project (excludes territories / missing coords) so a Marker never gets a null.
  const geoOf = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const s of (bundle.schools as unknown as { university?: string; state?: string; lat?: number | null; lng?: number | null }[])) {
      if (s.university && isAlbersUsaMappable(s) && s.lat != null && s.lng != null) {
        m.set(s.university.toLowerCase(), { lat: s.lat, lng: s.lng });
      }
    }
    return m;
  }, [bundle.schools]);

  // Reset every filter when the active dataset changes. A discipline, school, or
  // state chosen for one index does not exist in another, so a leftover filter
  // silently empties the results — this was the "Slate Builder only works for
  // b-schools" bug (filter in B-school, switch index, see nothing). Defined
  // before the prefill effect so a prefill arriving in the same commit still wins.
  useEffect(() => {
    setQuery(""); setLetter(""); setDisciplines(new Set()); setTiers(new Set()); setSchool(""); setKeyword(""); setAffinity(new Set());
    setTenureWin("sitting"); setServedMin(0); setServedMax(SERVED_CAP);
    setApptType("all"); setYrFrom(null); setYrTo(null);
    setRegions(new Set()); setStates(new Set()); setExpandedId(null);
  }, [datasetId]);

  useEffect(() => {
    if (!prefill) return;
    setQuery(prefill.fullName);
    setLetter(""); setDisciplines(new Set()); setTiers(new Set()); setSchool(""); setTenureWin("any");
    setServedMin(0); setServedMax(SERVED_CAP); setApptType("all"); setRegions(new Set()); setStates(new Set());
    // Clear every narrowing filter too, so the requested person is never filtered
    // out of results (which would leave "View full profile" opening nothing) — e.g.
    // a non-doctorate leader while the credential screens are on.
    setKeyword(""); setAffinity(new Set()); setRequirePhd(false); setRequireProf(false);
    const matches = allDeans.filter((d) => d.dean.toLowerCase() === prefill.fullName.toLowerCase());
    const best = matches.find((d) => d.endYear == null) || matches[0] || null;
    // Only open on a hit. A cross-index open switches datasetId first, so allDeans
    // for the new index may not be loaded yet on the token commit; adding allDeans
    // to the deps lets this retry (and land the open) once the data arrives.
    if (best) setExpandedId(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.token, allDeans]);

  const { disciplineOptions, schoolList, stateList, tierOptions } = useMemo(() => {
    const dSet = new Set<string>(), sSet = new Set<string>(), stSet = new Set<string>(), tSet = new Set<string>();
    for (const d of allDeans) {
      if (d.disciplineBroad && d.disciplineBroad !== "Unknown") dSet.add(d.disciplineBroad);
      if (d.university) sSet.add(d.university);
      const t = tierOf.get(d.university.toLowerCase());
      if (t) tSet.add(t);
    }
    for (const st of stateOf.values()) stSet.add(st);
    return {
      disciplineOptions: [...dSet].sort((a, b) => a.localeCompare(b)),
      schoolList: [...sSet].sort((a, b) => a.localeCompare(b)),
      stateList: [...stSet].sort(),
      tierOptions: TIER_ORDER.filter((t) => tSet.has(t)),
    };
  }, [allDeans, stateOf, tierOf]);

  const effectiveStates = useMemo(() => {
    const s = new Set(states);
    for (const r of regions) for (const st of REGIONS[r]) s.add(st);
    return s;
  }, [states, regions]);

  const hasFilter = query.trim() !== "" || !!letter || disciplines.size > 0 || tiers.size > 0 || !!school || keyword.trim() !== "" ||
    tenureWin !== "any" || apptType !== "all" || servedMin > 0 || servedMax < SERVED_CAP || effectiveStates.size > 0;

  // Keyword universe for the current index: every distinct expertise tag on a
  // leader's research brief, most common first. Feeds the keyword filter's
  // typeahead. Keyed per person so someone with two records isn't double counted.
  const keywordOptions = useMemo(() => {
    // Keyed by lowercase so "Academic administration" and "academic administration"
    // collapse to one suggestion; keep the first-seen casing for display.
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

  // Base cohort with every filter EXCEPT location, so region chips can show counts.
  const locBase = useMemo(() => {
    if (!hasFilter) return [];
    const q = query.trim().toLowerCase();
    const kw = keyword.trim().toLowerCase();
    const seen = new Set<string>();
    return allDeans.filter((d) => {
      if (kw) {
        const exp = researchMap[enrichKey(d.dean, d.university)]?.expertise;
        if (!exp || !exp.some((t) => String(t).toLowerCase().includes(kw))) return false;
      }
      const last = (d.dean.split(/\s+/).pop() || "").toLowerCase();
      if (tenureWin === "sitting" && d.endYear != null) return false;
      if (tenureWin === "5" && d.endYear != null && d.endYear < NOW - 5) return false;
      if (tenureWin === "10" && d.endYear != null && d.endYear < NOW - 10) return false;
      // Appointment facet. "All" is the true superset: every permanent dean, every
      // interim dean, AND the associate/vice-dean feeder bench. "Permanent" is
      // permanent deans only (no interims, no bench). "Assoc/Vice/Interim" is the
      // interim deans plus the bench.
      const isSub = (d as { roleType?: string }).roleType === "subdean";
      if (apptType === "perm" && (isSub || d.isInterim)) return false;
      if (apptType === "interim" && !isSub && !d.isInterim) return false;
      if (requirePhd && !hasDoctorate(d)) return false;
      if (requireProf && !wasProfessor(d)) return false;
      if (requireIndustryTie && !hasIndustryTie(d)) return false;
      if (includeGender !== "all") {
        const g = genderNorm(d.gender);
        if (includeGender === "women" && g !== "F") return false;
        if (includeGender === "men" && g !== "M") return false;
      }
      if (servedMin > 0 || servedMax < SERVED_CAP) {
        const yrs = elapsedYears(d);
        if (yrs == null || yrs < servedMin || yrs > servedMax) return false;
      }
      if (q && !d.dean.toLowerCase().includes(q)) return false;
      if (letter && last[0] !== letter.toLowerCase()) return false;
      if (disciplines.size && !disciplines.has(d.disciplineBroad || "")) return false;
      if (tiers.size) {
        const t = tierOf.get(d.university.toLowerCase());
        if (!t || !tiers.has(t)) return false;
      }
      if (school && d.university !== school) return false;
      const key = d.dean + "|" + d.university + "|" + d.school;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allDeans, query, keyword, researchMap, letter, disciplines, tiers, tierOf, school, tenureWin, apptType, servedMin, servedMax, requirePhd, requireProf, requireIndustryTie, hasIndustryTie, includeGender, hasFilter]);

  const regionCounts = useMemo(() => {
    const c: Record<string, number> = { Northeast: 0, Midwest: 0, South: 0, West: 0 };
    for (const d of locBase) {
      const st = stateOf.get(d.university.toLowerCase());
      if (!st) continue;
      for (const r of Object.keys(REGIONS)) if (REGIONS[r].includes(st)) c[r]++;
    }
    return c;
  }, [locBase, stateOf]);

  const yearBounds = useMemo(() => {
    let lo = NOW, hi = 1900;
    for (const d of allDeans) {
      if (!d.startYear) continue;
      lo = Math.min(lo, d.startYear);
      hi = Math.max(hi, d.endYear ?? d.startYear);
    }
    if (lo > hi) lo = 1980;
    return { lo, hi: Math.max(hi, NOW) };
  }, [allDeans]);
  const yFrom = yrFrom ?? yearBounds.lo;
  const yTo = yrTo ?? NOW;

  // Tenure-benchmark histogram. Built from COMPLETED tenures only: sitting leaders
  // are right-censored (a 2-year-in dean who will serve 10 would drag the
  // distribution short), so including them biases the "normal duration" a client
  // sees. Reflects the discipline + location filters and the era window, so it
  // reads as the norm for THIS cohort, not the whole index. Independent of the
  // years-in-seat screen — that only shades which bars are highlighted.
  const hist = useMemo(() => {
    const TMAX = 30, NB = TMAX + 1; // domain 0..30 yrs; the extra tail lets the fitted hazard show its full decline
    const bins = new Array(NB).fill(0); // completed-tenure distribution (departed only)
    const vals: number[] = [];
    // Life-table inputs for the departure hazard. events[t] = leaders who left in
    // year t. atRisk[t] = leaders still in the seat at the START of year t — this
    // must include people STILL SERVING (right-censored), not only those who have
    // already left, or the probability of moving is badly overstated.
    const events = new Array(NB).fill(0);
    const atRisk = new Array(NB).fill(0);
    for (const d of allDeans) {
      if (!d.startYear) continue;
      if (d.isInterim) continue; // interims serve ~1 yr and skew the norm
      if ((d as { roleType?: string }).roleType === "subdean") continue; // feeder bench, not deans
      if (disciplines.size && !disciplines.has(d.disciplineBroad || "")) continue;
      if (tiers.size) {
        const t = tierOf.get(d.university.toLowerCase());
        if (!t || !tiers.has(t)) continue;
      }
      if (effectiveStates.size) {
        const st = stateOf.get(d.university.toLowerCase());
        if (!st || !effectiveStates.has(st)) continue;
      }
      if (d.startYear < yFrom || d.startYear > yTo) continue;
      const departed = d.endYear != null;
      const raw = departed ? (d.tenureLength ?? (d.endYear! - d.startYear)) : (NOW - d.startYear);
      if (raw == null || raw < 0) continue;
      const t = Math.min(TMAX, Math.floor(raw));
      for (let j = 0; j <= t; j++) atRisk[j]++; // in the seat through the start of every year up to t
      if (departed) { events[t]++; bins[t]++; vals.push(raw); } // a completed departure at year t
    }
    vals.sort((a, b) => a - b);
    const median = vals.length ? vals[Math.floor((vals.length - 1) / 2)] : 0;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    let mode = 0, best = -1, lastBin = 0;
    for (let i = 0; i < bins.length; i++) { if (bins[i] > best) { best = bins[i]; mode = i; } if (bins[i] > 0) lastBin = i; }
    // Raw per-year life-table hazard: h(t) = P(leaves in year t | still in seat at
    // the start of year t). Unbiased but noisy at long tenures where few remain at
    // risk (one departure on a denominator of 2–3 spikes it), so we don't plot it
    // directly. Instead we fit the smooth unimodal reliability curve it estimates.
    const hazard = events.map((e, t) => (atRisk[t] > 0 ? e / atRisk[t] : 0));
    // Kaplan–Meier survival past year t, then a log-logistic fit (hazard is
    // unimodal when shape β>1). Scale α = censoring-aware median tenure; shape from
    // the 50th/75th survival quantiles. This is the reliability-style hazard curve.
    const surv = new Array(NB).fill(1);
    { let s = 1; for (let t = 0; t < NB; t++) { s *= 1 - hazard[t]; surv[t] = s; } }
    const quantile = (p: number) => { for (let t = 0; t < NB; t++) if (1 - surv[t] >= p) return t + 0.5; return NaN; };
    const m50 = quantile(0.5), m75 = quantile(0.75);
    let fit: number[] | null = null; // fitted hazard sampled every 0.5 yr over 0..TMAX
    if (vals.length >= 8 && isFinite(m50) && isFinite(m75) && m75 > m50 && m50 > 0) {
      const alpha = m50, beta = Math.log(3) / Math.log(m75 / m50);
      if (beta > 0) {
        fit = [];
        for (let k = 0; k <= TMAX * 2; k++) {
          const t = k * 0.5;
          if (t <= 0) { fit.push(0); continue; }
          const z = Math.pow(t / alpha, beta);
          fit.push((beta / alpha) * Math.pow(t / alpha, beta - 1) / (1 + z));
        }
      }
    }
    // Peak of whichever hazard series we plot (fitted curve, else the raw
    // fallback). Used to auto-scale the curve to fill the panel and to label the
    // right-hand axis with the actual probability at the peak.
    const hazSeries = fit ?? hazard.slice(0, lastBin + 1);
    const hazPeak = hazSeries.length ? Math.max(...hazSeries) : 0;
    return { bins, bw: 252 / NB, tmax: TMAX, max: Math.max(1, ...bins), median, mean, mode, n: vals.length, hazard, fit, hazPeak, lastBin, atRiskN: atRisk[0] };
  }, [allDeans, disciplines, tiers, tierOf, effectiveStates, stateOf, yFrom, yTo]);

  // Narrow, recent windows read short: long tenures started in that window have
  // not finished, so only the quick exits are counted. Flag it honestly.
  const recentWindow = yTo - yFrom <= 12 && yTo >= NOW - 3 && (yFrom > yearBounds.lo || yTo < NOW);

  const results = useMemo(() => {
    const rows = effectiveStates.size
      ? locBase.filter((d) => { const st = stateOf.get(d.university.toLowerCase()); return !!st && effectiveStates.has(st); })
      : locBase.slice();
    rows.sort((a, b) => {
      if (sortBy === "tenure") return (b.tenureLength || 0) - (a.tenureLength || 0);
      if (sortBy === "sofar") return (elapsedYears(b) || 0) - (elapsedYears(a) || 0);
      if (sortBy === "recent") return (b.startYear || 0) - (a.startYear || 0);
      const cmp = (a.dean.split(/\s+/).pop() || "").localeCompare(b.dean.split(/\s+/).pop() || "");
      return cmp !== 0 ? cmp : a.dean.localeCompare(b.dean);
    });
    return rows;
  }, [locBase, effectiveStates, stateOf, sortBy]);

  // Name typeahead: unique people in the current index whose name matches, best
  // (sitting, else latest) record per person, prefix matches first.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const byName = new Map<string, Dean>();
    for (const d of allDeans) {
      if (!d.dean.toLowerCase().includes(q)) continue;
      const k = d.dean.toLowerCase();
      const prev = byName.get(k);
      if (!prev || (d.endYear == null && prev.endYear != null) || (prev.endYear != null && (d.startYear || 0) > (prev.startYear || 0))) byName.set(k, d);
    }
    return [...byName.values()]
      .sort((a, b) => {
        const ap = a.dean.toLowerCase().startsWith(q) ? 0 : 1, bp = b.dean.toLowerCase().startsWith(q) ? 0 : 1;
        return ap !== bp ? ap - bp : a.dean.localeCompare(b.dean);
      })
      .slice(0, 8);
  }, [allDeans, query]);

  const pickSuggestion = (d: Dean) => {
    setQuery(d.dean);
    setTenureWin("any");
    setSearchFocus(false);
    const matches = allDeans.filter((x) => x.dean === d.dean);
    const best = matches.find((x) => x.endYear == null) || matches[0] || d;
    setExpandedId(best.id);
  };

  const shown = results.slice(0, CAP);

  // Affinity: cross-index leaders tied to the selected school, filtered to the
  // checked kinds. The selector shows for any single chosen school; the ~4 MB map
  // loads lazily the first time a kind is checked.
  const affinityOn = !!school;

  // Collapsed groups still say what they are doing, so a shut group is never
  // somewhere a filter can hide.
  const GENDER_LABEL = { all: "All", women: "Women", men: "Men" } as const;
  const APPT_LABEL = { all: "All", perm: "Permanent", interim: hasBench ? "Assoc/Vice/Interim" : "Interim" } as const;
  const TENURE_LABEL = { sitting: "Sitting now", "5": "Last 5 yrs", "10": "Last 10 yrs", any: "Any time" } as const;
  const AFF_LABEL = Object.fromEntries(AFF_KINDS.map(([k, l]) => [k as string, l]));

  const roleSummary = [disciplines.size ? [...disciplines].join(", ") : null,
                       apptType !== "all" ? APPT_LABEL[apptType] : null,
                       TENURE_LABEL[tenureWin]].filter(Boolean).join(" · ");
  const personSummary = [includeGender !== "all" ? GENDER_LABEL[includeGender] : null,
                         requirePhd ? "Ph.D." : null, requireProf ? "Professor" : null,
                         requireIndustryTie ? "Non-academic tie" : null,
                         keyword.trim() ? `“${keyword.trim()}”` : null].filter(Boolean).join(" · ") || "Anyone";
  const institutionSummary = [tiers.size ? [...tiers].join(", ") : null, school || null,
                              affinity.size ? `${affinity.size} affinity` : null].filter(Boolean).join(" · ") || "All schools";
  const locationSummary = regions.size || states.size ? [...regions, ...states].join(", ") : "Anywhere";

  // The active bar is the answer to "why am I seeing this many". Each chip
  // removes exactly one thing, so undoing never means hunting for the control.
  const activeChips: ActiveChip[] = [
    ...[...disciplines].map((d) => ({ id: `disc:${d}`, label: d, onRemove: () => { toggleSet(setDisciplines, d); setExpandedId(null); } })),
    ...(apptType !== "all" ? [{ id: "appt", label: APPT_LABEL[apptType], onRemove: () => setApptType("all") }] : []),
    ...(tenureWin !== "sitting" ? [{ id: "tenure", label: TENURE_LABEL[tenureWin], onRemove: () => setTenureWin("sitting") }] : []),
    ...(includeGender !== "all" ? [{ id: "gender", label: GENDER_LABEL[includeGender], onRemove: () => setIncludeGender("all") }] : []),
    ...(requirePhd ? [{ id: "phd", label: "Ph.D.", onRemove: () => setRequirePhd(false) }] : []),
    ...(requireProf ? [{ id: "prof", label: "Professor", onRemove: () => setRequireProf(false) }] : []),
    ...(requireIndustryTie ? [{ id: "na", label: "Non-academic tie", accent: "teal" as const, onRemove: () => setRequireIndustryTie(false) }] : []),
    ...(keyword.trim() ? [{ id: "kw", label: `“${keyword.trim()}”`, onRemove: () => { setKeyword(""); setExpandedId(null); } }] : []),
    ...[...tiers].map((t) => ({ id: `tier:${t}`, label: t, onRemove: () => { toggleSet(setTiers, t); setExpandedId(null); } })),
    ...(school ? [{ id: "school", label: school, onRemove: () => { setSchool(""); setExpandedId(null); } }] : []),
    ...[...affinity].map((a) => ({ id: `aff:${a}`, label: AFF_LABEL[a] ?? a, accent: "maroon" as const, onRemove: () => { toggleSet(setAffinity, a); setExpandedId(null); } })),
    ...[...regions].map((r) => ({ id: `region:${r}`, label: r, onRemove: () => { toggleSet(setRegions, r); setExpandedId(null); } })),
    ...[...states].map((st) => ({ id: `state:${st}`, label: st, onRemove: () => { toggleSet(setStates, st); setExpandedId(null); } })),
  ];

  // The interim/bench explainer used to sit inside the Appointment flex row and
  // wrap under it; it is the Appointment row's hint now.
  const apptSubline = (() => {
    if (apptType !== "interim") return undefined;
    if (hasBench) {
      const sub = results.filter((r) => (r as { roleType?: string }).roleType === "subdean").length;
      return `${sub} associate/vice ${nounPluralLower} (feeder bench) + ${results.length - sub} interim. Both count under All; only Permanent is limited to sitting permanent ${nounPluralLower}.`;
    }
    return tenureWin === "sitting" ? "Schools in transition — open searches." : undefined;
  })();
  const [affinityMap, setAffinityMap] = useState<AffMap | null>(getAffinityCache());
  useEffect(() => {
    if (affinity.size === 0 || affinityMap) return;
    let alive = true;
    loadAffinity().then((m) => { if (alive) setAffinityMap(m); });
    return () => { alive = false; };
  }, [affinity.size, affinityMap]);
  const affinityLoading = affinityOn && affinity.size > 0 && !affinityMap;
  const affinityList = affinityMap ? affinityMap[school] : undefined;
  const affinityResults = useMemo(() => {
    if (!affinityList || affinity.size === 0) return [] as AffEntry[];
    return affinityList.filter((e) => [...affinity].some((k) => (e[k as keyof AffEntry] as string[])?.length));
  }, [affinityList, affinity]);
  const inSlate = (id: number) => slate.some((d) => d.id === id);
  const toggleSlate = (d: Dean) => setSlate((cur) => inSlate(d.id) ? cur.filter((x) => x.id !== d.id) : [...cur, d]);
  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) =>
    setter((cur) => { const n = new Set(cur); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const clearAll = () => {
    setQuery(""); setLetter(""); setDisciplines(new Set()); setTiers(new Set()); setSchool(""); setKeyword(""); setAffinity(new Set());
    setServedMin(0); setServedMax(SERVED_CAP); setApptType("all"); setRegions(new Set()); setStates(new Set()); setExpandedId(null);
    setRequirePhd(false); setRequireProf(false); setIncludeGender("all"); setYrFrom(null); setYrTo(null);
    // Both were missing: "Reset filters" used to leave the non-academic tie
    // switched on and the tenure window wherever it was, so the list did not
    // return to the state the button promises.
    setRequireIndustryTie(false); setTenureWin("sitting");
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
    postSlate("export");
  };

  const sel = "w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30";
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
    <>
    <div className="space-y-4">
      <div className="bg-[#011F5B]/[0.05] dark:bg-[#011F5B]/15 border border-[#011F5B]/40 rounded-xl p-4 sm:p-6">
        <div className="-mx-4 sm:-mx-6 -mt-4 sm:-mt-6 mb-4 px-4 sm:px-6 py-3.5 bg-gradient-to-r from-[#011F5B] to-[#0a3a8f] rounded-t-xl">
          <h2 className="text-lg font-bold text-white leading-tight">Slate Builder</h2>
          <p className="text-sm text-white/75">Filter the cohort, check candidates into your slate, then compare or export.</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3 min-w-0">
            <div className="relative">
              <input
                type="text" inputMode="search" value={query} autoComplete="off"
                onChange={(e) => { setQuery(e.target.value); setExpandedId(null); }}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
                placeholder={`Type a ${nounLower}'s name…`}
                className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
              />
              {searchFocus && suggestions.length > 0 && (
                <ul className="absolute z-30 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-64 overflow-auto py-1">
                  {suggestions.map((d) => (
                    <li key={d.id}>
                      <button type="button" onMouseDown={(e) => { e.preventDefault(); pickSuggestion(d); }}
                        className="w-full text-left px-3 py-1.5 hover:bg-[#011F5B]/5 flex items-center gap-2">
                        <span className="text-sm font-medium shrink-0">{d.dean}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{d.school}, {d.university}</span>
                        {d.endYear == null
                          ? <span className="ml-auto text-[9px] text-[#011F5B] font-semibold shrink-0">SITTING</span>
                          : <span className="ml-auto text-[9px] text-muted-foreground shrink-0 tabular-nums">{d.startYear}–{d.endYear}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <ActiveFilterBar
              chips={activeChips}
              onClearAll={clearAll}
              resultCount={results.length}
              noun={nounPluralLower}
            />

            <div className="flex flex-col gap-2">
              <FilterGroup title="Role" summary={roleSummary} defaultOpen>
                {disciplineOptions.length > 1 && (
                  <FilterRow label="Position">
                    <PillGroup ariaLabel="Position" options={disciplineOptions} selected={disciplines}
                      onToggle={(v) => { toggleSet(setDisciplines, v); setExpandedId(null); }}
                      onClear={() => { setDisciplines(new Set()); setExpandedId(null); }} />
                  </FilterRow>
                )}
                <FilterRow label="Appointment" hint={apptSubline}>
                  <SegGroup ariaLabel="Appointment type" value={apptType}
                    onChange={(v) => { setApptType(v); setExpandedId(null); }}
                    options={[["all", "All"], ["perm", "Permanent"], ["interim", hasBench ? "Assoc/Vice/Interim" : "Interim"]]} />
                </FilterRow>
                <FilterRow label="Tenure window">
                  <SegGroup ariaLabel="Tenure window" value={tenureWin}
                    onChange={(v) => { setTenureWin(v); setExpandedId(null); }}
                    options={[["sitting", "Sitting now"], ["5", "Last 5 yrs"], ["10", "Last 10 yrs"], ["any", "Any time"]]} />
                </FilterRow>
              </FilterGroup>

              <FilterGroup title="Person" summary={personSummary}
                defaultOpen={includeGender !== "all" || requirePhd || requireProf || requireIndustryTie || keyword.trim() !== ""}>
                <FilterRow label="Include" hint="Widen the pool for a defensible diverse slate.">
                  <SegGroup ariaLabel="Include" value={includeGender}
                    onChange={(v) => { setIncludeGender(v); setExpandedId(null); }}
                    options={[["all", "All"], ["women", "Women"], ["men", "Men"]]} />
                </FilterRow>
                <FilterRow label="Credentials" hint="Held a doctorate · faculty rank · a named organisation outside the academy.">
                  <PillToggles items={[
                    { key: "phd", label: "Ph.D.", on: requirePhd, onToggle: () => { setRequirePhd(!requirePhd); setExpandedId(null); } },
                    { key: "prof", label: "Professor", on: requireProf, onToggle: () => { setRequireProf(!requireProf); setExpandedId(null); } },
                    { key: "na", label: "Non-academic tie", on: requireIndustryTie, accent: "teal", onToggle: () => { setRequireIndustryTie(!requireIndustryTie); setExpandedId(null); } },
                  ]} />
                </FilterRow>
                <FilterRow label="Keyword" hint={`Signature expertise themes from the brief — scholarly field, professional background, leadership focus. ${keywordOptions.length} keyword${keywordOptions.length === 1 ? "" : "s"} in this index.`}>
                  <input
                    type="text" list="kw-options" value={keyword}
                    onChange={(e) => { setKeyword(e.target.value); setExpandedId(null); }}
                    placeholder="e.g. health equity, strategic planning…"
                    className="w-full rounded-lg border border-muted-foreground/30 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#011F5B]/30"
                  />
                  <datalist id="kw-options">
                    {keywordOptions.slice(0, 400).map((k) => <option key={k} value={k} />)}
                  </datalist>
                </FilterRow>
              </FilterGroup>

              <FilterGroup title="Institution" summary={institutionSummary}
                defaultOpen={tiers.size > 0 || !!school || affinity.size > 0}>
                {tierOptions.length > 1 && (
                  <FilterRow label="Tier">
                    <PillGroup ariaLabel="Institution tier" options={tierOptions} selected={tiers}
                      onToggle={(v) => { toggleSet(setTiers, v); setExpandedId(null); }}
                      onClear={() => { setTiers(new Set()); setExpandedId(null); }} />
                  </FilterRow>
                )}
                <FilterRow label="School">
                  <select className={`${sel} max-w-md`} value={school}
                    onChange={(e) => { setSchool(e.target.value); setExpandedId(null); }} aria-label="School">
                    <option value="">All schools</option>
                    {schoolList.map((sc) => <option key={sc} value={sc}>{sc}</option>)}
                  </select>
                </FilterRow>
                {affinityOn && (
                  <FilterRow label="Affinity" hint={`Everyone in the database connected to ${school}, across all indices.`}>
                    <PillToggles items={AFF_KINDS.map(([key, label]) => ({
                      key: key as string, label, accent: "maroon" as const,
                      on: affinity.has(key as string),
                      onToggle: () => { toggleSet(setAffinity, key as string); setExpandedId(null); },
                    }))} />
                  </FilterRow>
                )}
              </FilterGroup>

              <FilterGroup title="Location" summary={locationSummary} defaultOpen={regions.size > 0 || states.size > 0}>
                <FilterRow label="Region">
                  <PillGroup ariaLabel="Region" options={Object.keys(REGIONS)} selected={regions} counts={regionCounts}
                    onToggle={(v) => { toggleSet(setRegions, v); setExpandedId(null); }}
                    onClear={() => { setRegions(new Set()); setExpandedId(null); }} />
                </FilterRow>
                <FilterRow label="States" hint={effectiveStates.size ? undefined : "Pick a region above, or individual states here."}>
                  <div className="flex gap-3 items-start w-full">
                    <div className="flex-1 min-w-0 flex flex-wrap gap-1 max-h-44 overflow-y-auto rounded-lg border border-muted-foreground/30 p-2">
                      {stateList.map((st) => (
                        <button key={st} type="button" aria-pressed={states.has(st)}
                          onClick={() => { toggleSet(setStates, st); setExpandedId(null); }}
                          className={["w-9 h-7 rounded text-[11px] font-semibold", states.has(st) ? "bg-[#011F5B] text-white" : "bg-muted/60 hover:bg-muted"].join(" ")}>{st}</button>
                      ))}
                    </div>
                    <div className="shrink-0 w-[38%] max-w-[220px]">
                      <RegionMap selected={effectiveStates} />
                    </div>
                  </div>
                </FilterRow>
              </FilterGroup>
            </div>

            <FilterRow label="Sort by">
              <SegGroup ariaLabel="Sort by" value={sortBy} onChange={setSortBy}
                options={[["name", "Name"], ["tenure", "Longest tenure"], ["sofar", "Tenure so far"], ["recent", "Most recent"]]} />
            </FilterRow>

            <div>
              <button onClick={clearAll} className="h-8 px-3 rounded text-xs font-semibold border border-muted-foreground/40 hover:bg-muted">Reset filters</button>
            </div>
          </div>

          {/* Upper-right: tenure benchmark, with the two range sliders directly under the histogram. */}
          <div className="lg:border-l lg:border-[#011F5B]/15 lg:pl-4">
            <h3 className="text-sm font-bold mb-0.5">Tenure benchmark</h3>
            <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
              {hist.n
                ? <>{hist.n} completed permanent {hist.n === 1 ? "tenure" : "tenures"}{disciplines.size ? ` · ${Array.from(disciplines).join(", ")}` : ""}</>
                : "No completed permanent tenures in this range yet."}
              {(datasetId === "usgrad" || datasetId === "usadvancement") && hist.n < 5 && (
                <span className="block mt-0.5 text-muted-foreground/80">
                  Current-roster index: the distribution needs leaders who have both started and left. It fills in as departed-leader succession history is added.
                </span>
              )}
            </p>
            {hist.n > 0 && (
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {([["Mean", hist.mean.toFixed(1)], ["Median", String(hist.median)], ["Mode", String(hist.mode)]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-muted/50 border border-muted-foreground/15 py-1 text-center">
                    <div className="text-base font-bold text-[#011F5B] tabular-nums leading-none">{v}</div>
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground mt-0.5">{k}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-lg bg-muted/40 border border-muted-foreground/15 p-2">
              <svg viewBox="-15 0 285 92" className="w-full" role="img" aria-label="Distribution of completed tenure lengths, in years">
                {/* Left axis: bar counts. Ticks at 0, mid, max of the tallest bar. */}
                {hist.n > 0 && (() => {
                  const ticks = [...new Set(hist.max <= 1 ? [0, hist.max] : [0, Math.round(hist.max / 2), hist.max])];
                  return <>
                    <line x1={0} y1={8} x2={0} y2={78} stroke="currentColor" className="text-muted-foreground/30" strokeWidth={0.5} />
                    {ticks.map((v) => {
                      const y = 78 - (v / hist.max) * 70;
                      return <g key={v}>
                        <line x1={-2} y1={y} x2={0} y2={y} stroke="currentColor" className="text-muted-foreground/40" strokeWidth={0.5} />
                        <text x={-3.5} y={y + 2} textAnchor="end" fill="currentColor" className="text-muted-foreground" style={{ fontSize: 6 }}>{v}</text>
                      </g>;
                    })}
                  </>;
                })()}
                {hist.bins.map((c: number, i: number) => {
                  const bw = hist.bw, bh = (c / hist.max) * 70;
                  const inBand = i >= servedMin && i <= Math.min(hist.tmax, servedMax);
                  return <rect key={i} x={i * bw + 0.5} y={78 - bh} width={bw - 1} height={bh} rx={1}
                    fill="currentColor" className={inBand ? "text-[#011F5B]" : "text-muted-foreground/40"} />;
                })}
                {hist.n > 0 && (() => {
                  const mx = (Math.min(hist.tmax, hist.median) + 0.5) * hist.bw;
                  return <line x1={mx} x2={mx} y1={2} y2={78} stroke="currentColor" className="text-[#E8A33D]" strokeWidth={1.5} strokeDasharray="2 2" />;
                })()}
                {showHazard && hist.n > 0 && hist.hazPeak > 0 && (() => {
                  // Auto-scale the hazard to its own peak so the curve fills ~92% of
                  // the panel height; the right axis shows the real probability.
                  const fill = 0.92 * 70, yTop = 78 - fill;
                  const y = (h: number) => 78 - (h / hist.hazPeak) * fill;
                  const pts = (hist.fit
                    ? hist.fit.map((h: number, k: number) => `${(k * 0.5 + 0.5) * hist.bw},${y(h)}`)
                    : hist.hazard.slice(0, hist.lastBin + 1).map((h: number, i: number) => `${(i + 0.5) * hist.bw},${y(h)}`)
                  ).join(" ");
                  return <>
                    <polyline points={pts} fill="none" stroke="currentColor" className="text-[#A31F34]" strokeWidth={1.3} />
                    <line x1={253} y1={yTop} x2={255} y2={yTop} stroke="currentColor" className="text-[#A31F34]" strokeWidth={0.5} />
                    <line x1={253} y1={78} x2={255} y2={78} stroke="currentColor" className="text-[#A31F34]" strokeWidth={0.5} />
                    <text x={256} y={yTop + 2} textAnchor="start" fill="currentColor" className="text-[#A31F34]" style={{ fontSize: 6 }}>{(hist.hazPeak * 100).toFixed(0)}%</text>
                    <text x={256} y={78} textAnchor="start" fill="currentColor" className="text-[#A31F34]" style={{ fontSize: 6 }}>0</text>
                  </>;
                })()}
                {[0, 5, 10, 15, 20, 25, 30].map((t) => (
                  <text key={t} x={(t + 0.5) * hist.bw} y={90} textAnchor="middle" fill="currentColor" className="text-muted-foreground" style={{ fontSize: 7 }}>{t === hist.tmax ? "30+" : t}</text>
                ))}
              </svg>
            </div>
            <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
              <p className="text-[10px] text-muted-foreground">Years served · left axis = count · amber = median{showHazard ? ` · red = P(move), fitted (peak ${(hist.hazPeak * 100).toFixed(0)}%)` : ""}</p>
              <label className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none" title="Probability a leader leaves in year t given they are still in the seat at the start of year t. Smooth log-logistic fit to the cohort's censored tenures (the reliability-style unimodal hazard); the raw per-year rate is too noisy at long tenures, where few remain at risk, to plot directly.">
                <input type="checkbox" checked={showHazard} onChange={(e) => setShowHazard(e.target.checked)} className="accent-[#A31F34] w-3 h-3" />
                Probability of Moving (Hazard rate)
              </label>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">
                  Years in seat
                  <span className="text-[#011F5B] font-semibold"> · {servedMin}–{servedMax === SERVED_CAP ? "∞" : servedMax}</span>
                </span>
                <div className="flex gap-1">
                  <button onClick={() => { setServedMin(6); setServedMax(10); setExpandedId(null); }} className={chip(servedMin === 6 && servedMax === 10)} title="Accomplished but not entrenched — the placeable band">Ripe 6–10</button>
                  <button onClick={() => { setServedMin(10); setServedMax(SERVED_CAP); setExpandedId(null); }} className={chip(servedMin === 10 && servedMax === SERVED_CAP)}>Overdue 10+</button>
                </div>
              </div>
              <DualRange min={0} max={SERVED_CAP} low={servedMin} high={servedMax}
                onLow={(v) => { setServedMin(Math.min(v, servedMax)); setExpandedId(null); }}
                onHigh={(v) => { setServedMax(Math.max(v, servedMin)); setExpandedId(null); }}
                ariaLow="Minimum years in seat" ariaHigh="Maximum years in seat" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0</span><span>{SERVED_CAP}+</span></div>
              {(servedMin > 0 || servedMax < SERVED_CAP) && (
                <button onClick={() => { setServedMin(0); setServedMax(SERVED_CAP); setExpandedId(null); }} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">Reset</button>
              )}
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <span className="text-muted-foreground font-medium">Appointed between</span>
                <span className="tabular-nums font-semibold text-foreground">{yFrom}–{yTo}</span>
              </div>
              <DualRange min={yearBounds.lo} max={NOW} low={yFrom} high={yTo}
                onLow={(v) => setYrFrom(Math.min(v, yTo))} onHigh={(v) => setYrTo(Math.max(v, yFrom))}
                ariaLow="Benchmark from year" ariaHigh="Benchmark to year" />
              {(yrFrom !== null || yrTo !== null) && (
                <button onClick={() => { setYrFrom(null); setYrTo(null); }} className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2">Reset</button>
              )}
            </div>

            {recentWindow && (
              <p className="text-[10px] mt-2 text-amber-700 dark:text-amber-500 leading-snug">
                Recent window: long tenures are still in progress, so the average reads short.
              </p>
            )}
            {(servedMin > 0 || servedMax < SERVED_CAP) && (
              <p className="text-[10px] mt-2 text-[#011F5B] font-medium leading-snug">
                Shaded bars = your years-in-seat screen ({servedMin}–{servedMax === SERVED_CAP ? "∞" : servedMax} yrs).
              </p>
            )}
          </div>
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

      {affinityOn && affinity.size > 0 && (
        <div className="mb-4 rounded-xl border border-[#8C1D40]/30 bg-[#8C1D40]/5 p-3 sm:p-4">
          <p className="text-sm font-semibold text-[#8C1D40]">
            {affinityLoading
              ? "Loading affinity data…"
              : `${affinityResults.length} leader${affinityResults.length !== 1 ? "s" : ""} across all indices with an affinity to ${school}`}
          </p>
          <p className="text-[11px] text-muted-foreground mb-2.5">
            {AFF_KINDS.filter(([k]) => affinity.has(k as string)).map(([, l]) => l).join(" · ")}
          </p>
          {affinityLoading ? (
            <p className="text-xs text-muted-foreground">Fetching every leader connected to {school} across all indices…</p>
          ) : affinityResults.length === 0 ? (
            <p className="text-xs text-muted-foreground">No leaders in the database have that tie to {school} yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {affinityResults.slice(0, 60).map((e) => {
                const photo = PHOTOS[e.enrichKey]?.photo;
                return (
                  <button key={e.enrichKey + e.name} type="button"
                    onClick={() => onOpenLeader?.(e.index, e.name)}
                    title={`Open ${e.name}'s profile`}
                    className="flex gap-2.5 rounded-lg border border-border bg-card p-2 text-left hover:border-[#8C1D40]/50 hover:bg-[#8C1D40]/[0.04] transition-colors">
                    {photo ? (
                      <img src={photo} alt={e.name} loading="lazy" className="w-10 h-10 rounded-full object-cover border shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground shrink-0">
                        {e.name.split(/\s+/).map((t) => t[0]).filter(Boolean).slice(0, 2).join("")}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-xs font-semibold truncate">{e.name}</p>
                        {e.indexLabel && <span className="text-[9px] px-1 py-px rounded bg-[#011F5B]/10 text-[#011F5B] shrink-0">{e.indexLabel}</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{e.role}{e.university ? `, ${e.university}` : ""}</p>
                      <div className="mt-0.5 space-y-0.5">
                        {AFF_KINDS.filter(([k]) => affinity.has(k as string) && (e[k as keyof AffEntry] as string[])?.length).map(([k, label]) => (
                          <p key={k as string} className="text-[10px] leading-tight">
                            <span className="font-semibold text-[#8C1D40]">{label}:</span>{" "}
                            <span className="text-muted-foreground">{(e[k as keyof AffEntry] as string[])[0]}</span>
                          </p>
                        ))}
                      </div>
                    </div>
                    <span className="self-center text-[#8C1D40] text-base shrink-0 pr-0.5" aria-hidden="true">›</span>
                  </button>
                );
              })}
            </div>
          )}
          {affinityResults.length > 60 && (
            <p className="text-[10px] text-muted-foreground mt-2">Showing first 60 of {affinityResults.length}.</p>
          )}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
            <p className="text-sm font-medium">{results.length} result{results.length !== 1 ? "s" : ""}</p>
            {/* Always visible as an action cue: muted until 2+ candidates are
                checked into the slate, then it lights up and opens the compare view. */}
            <button
              onClick={() => setCompareOpen(true)}
              disabled={slate.length < 2}
              title={slate.length < 2 ? "Check 2 or more candidates to compare them" : undefined}
              className={[
                "mt-1.5 inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded transition-colors",
                slate.length >= 2
                  ? "bg-[#011F5B] text-white shadow-sm hover:brightness-110"
                  : "bg-muted text-muted-foreground border border-border cursor-not-allowed",
              ].join(" ")}
            >
              Select <span className="inline-block w-3.5 h-3.5 border-2 border-current rounded-[3px]" aria-hidden="true" /> to compare{slate.length >= 2 ? ` (${slate.length})` : ""}
            </button>
            <div className="flex flex-wrap gap-1 mt-2.5">
              {LETTERS.map((L) => (
                <button key={L} onClick={() => { setLetter(letter === L ? "" : L); setExpandedId(null); }} aria-pressed={letter === L}
                  className={["w-7 h-7 rounded text-[11px] font-semibold transition-colors", letter === L ? "bg-[#011F5B] text-white" : "bg-muted/60 text-foreground hover:bg-muted"].join(" ")}>{L}</button>
              ))}
              {letter && <button onClick={() => { setLetter(""); setExpandedId(null); }} className="h-7 px-2 rounded text-[11px] font-semibold text-muted-foreground hover:bg-muted">clear</button>}
            </div>
          </div>
          <div className="divide-y divide-border">
            {shown.map((d) => {
              const isOpen = expandedId === d.id;
              return (
                <div key={d.id} ref={isOpen ? openRowRef : undefined} data-open-row={isOpen ? "1" : undefined} className="scroll-mt-20">
                  <div className={["flex items-center gap-2 px-3 sm:px-4 py-2.5 transition-colors", isOpen ? "bg-[#011F5B]/5" : "hover:bg-accent/40"].join(" ")}>
                    <input type="checkbox" checked={inSlate(d.id)} onChange={() => toggleSlate(d)} aria-label={`Add ${d.dean} to slate`} className="accent-[#011F5B] w-4 h-4 shrink-0" />
                    <button onClick={() => setExpandedId(isOpen ? null : d.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <Avatar d={d} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{d.dean}</p>
                        <p className="text-xs text-muted-foreground truncate">{d.school}, {d.university}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-[#011F5B] tabular-nums">{yearsLabel(d.startYear, d.endYear, "Now")}</p>
                        {d.tenureLength ? <span className="text-[10px] text-muted-foreground">{d.tenureLength} yr{d.tenureLength !== 1 ? "s" : ""}</span> : d.isInterim ? <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Interim</span> : null}
                      </div>
                      <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
                    </button>
                  </div>
                  {isOpen && (
                    <div className="px-3 sm:px-4 pb-4 pt-1 bg-[#011F5B]/5 border-l-2 border-[#011F5B]">
                      <DeanProfile dean={d} onClose={() => setExpandedId(null)} onOpenSchool={onOpenSchool} hideAssessment />
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
        <div className="hidden lg:block">
          <div className="sticky top-4 space-y-3">
            <ResultsMap results={shown} geoOf={geoOf} photoOf={(d) => PHOTOS[enrichKey(d.dean, d.university)]?.photo} activeId={expandedId} onSelect={setExpandedId} />
            {/* The open candidate's movability assessment lives here, in the map column. */}
            {(() => {
              const d = expandedId != null ? shown.find((x) => x.id === expandedId) : null;
              const career = d ? researchMap[enrichKey(d.dean, d.university)]?.career : null;
              if (!d || !career || !career.length) return null;
              return (
                <div className="rounded-xl border border-border bg-card p-3">
                  <div className="text-[11px] font-semibold text-muted-foreground mb-1.5 truncate">{d.dean}</div>
                  <CareerAssessment steps={career} tenure={tenureFor(d)} roots={(careerRoots as Record<string, Root[]>)[enrichKey(d.dean, d.university)]} />
                </div>
              );
            })()}
          </div>
        </div>
        </div>
      )}

      {results.length === 0 && hasFilter && (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <p className="text-muted-foreground text-sm">No {nounPluralLower} match these filters.</p>
        </div>
      )}

      {/* As soon as a specific school is picked, not gated on the results list
          above having any matches -- Scout Assistant draws from the feeder bench
          and cross-index affinity ties, independent of the other filters. */}
      {affinityOn && <ScoutAssistant university={school} onOpenSchool={onOpenSchool} />}
    </div>



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
    </>
  );
}
