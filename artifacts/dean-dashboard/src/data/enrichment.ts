import { useSyncExternalStore } from "react";

// Per-deploy build id (vite.config define). Appended as ?v= to the /data fetch so
// a new deploy always busts any stale browser/CDN cache of the JSON.
declare const __BUILD_ID__: string;

// Hardening Step 2: the global enrichment maps (dean photos, headhunter research)
// used to be bundled JSON imports — together ~5 MB of the JS bundle, and the
// research briefs are exactly the proprietary payload a trial must gate. They now
// live in public/data/*.json and load once at runtime.
//
// Each map is a tiny reactive store: components subscribe via the hook and
// re-render when the fetch resolves. Until then the map is empty, so portraits
// fall back to monograms and the research panel simply isn't shown yet.

// A retired photo for this dean|university slot, kept when a genuinely
// different image replaces it (archived, never deleted). `capturedAt` is the
// date the archive event happened (not when the photo was originally taken).
export interface PhotoHistoryEntry { photo: string; source?: string; page?: string; capturedAt: string; hash?: string }
export interface PhotoRec { photo: string; source?: string; page?: string; hash?: string; capturedAt?: string; history?: PhotoHistoryEntry[] }

export interface NewsItem { title: string; url: string; source?: string; date?: string }
export interface CareerStep { role: string; org?: string; years?: string }
export interface LeaderResearch {
  linkedin?: string;
  summary?: string;      // "why this leader" strengths brief
  expertise?: string[];  // signature themes / domains
  education?: string;    // degrees
  news?: NewsItem[];
  career?: CareerStep[]; // chronological pre-role trajectory (earliest → current)
}

/**
 * Fallback career trajectory for the ~70% of leaders who have never gone
 * through the headhunter research pass and so have no research.career at all
 * -- rather than showing no Career Map, everyone with a known PhD institution
 * gets a minimal two-stop map (where they trained -> the seat they hold now).
 * Only call this when there's no real research.career; never blend synthetic
 * stops into a partially-researched trajectory.
 */
export function syntheticCareerSteps(
  dean: { phdField: string; phdInstitution?: string; university: string; school: string; startYear: number | null; endYear: number | null },
  title: string
): CareerStep[] {
  if (!dean.phdInstitution) return [];
  const years = dean.startYear ? `${dean.startYear}-${dean.endYear ?? "present"}` : "";
  return [
    { role: dean.phdField ? `PhD, ${dean.phdField}` : "PhD", org: dean.phdInstitution, years: "" },
    { role: `${title}, ${dean.school}`, org: dean.university, years },
  ];
}

function makeJsonMap<T>(file: string) {
  let data: Record<string, T> = {};
  let started = false;
  const listeners = new Set<() => void>();

  function ensure() {
    if (started) return;
    started = true;
    fetch(`${import.meta.env.BASE_URL}data/${file}?v=${__BUILD_ID__}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { data = (d ?? {}) as Record<string, T>; listeners.forEach((l) => l()); })
      .catch(() => { started = false; }); // allow a later mount to retry
  }
  function subscribe(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }
  const snapshot = () => data;

  return {
    ensure,
    current: () => data, // non-reactive read (for one-shot lookups outside render)
    useMap(): Record<string, T> {
      ensure();
      return useSyncExternalStore(subscribe, snapshot, snapshot);
    },
  };
}

// A person's leadership rungs across ALL indices (dean/provost/president/system),
// so a profile can show the full ladder even though only one index is loaded.
export interface CareerRung { role: string; uni: string; school?: string; s: number | null; e: number | null; interim?: boolean }
export interface CareerLadder { name: string; roles: CareerRung[] }

const photos = makeJsonMap<PhotoRec>("dean-photos.json");
const research = makeJsonMap<LeaderResearch>("leader-research.json");
const careers = makeJsonMap<CareerLadder>("leader-careers.json");

export const usePhotoMap = photos.useMap;
export const getPhotoMap = photos.current;
export const useResearchMap = research.useMap;
export const useCareerMap = careers.useMap;

// Cross-index AFFINITY: every leader in the database with a tie to a school
// (undergrad / grad / faculty / administration), for ALL schools. Precomputed by
// scripts/gen-affinity.mjs (~4.5 MB), served scope-filtered through the gated
// /data endpoint. Kept as its own promise-cache (not makeJsonMap) rather than a
// reactive store: callers (IndividualSearch's affinity selector, ScoutAssistant's
// candidate pool) only need the resolved map once, not a re-render subscription.
export type AffEntry = {
  name: string; role: string; university: string;
  index: string | null; indexLabel: string | null; enrichKey: string;
  undergrad: string[]; grad: string[]; faculty: string[]; admin: string[];
};
export type AffMap = Record<string, AffEntry[]>;
let AFFINITY_CACHE: AffMap | null = null;
let AFFINITY_PROMISE: Promise<AffMap> | null = null;
/** Synchronous read of whatever's cached so far (no fetch) -- lets a component seed its initial state without a load flash if another consumer already fetched it. */
export function getAffinityCache(): AffMap | null { return AFFINITY_CACHE; }
export function loadAffinity(): Promise<AffMap> {
  if (AFFINITY_CACHE) return Promise.resolve(AFFINITY_CACHE);
  if (!AFFINITY_PROMISE) {
    AFFINITY_PROMISE = fetch(`${import.meta.env.BASE_URL}data/affinity-by-school.json?v=${__BUILD_ID__}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => (AFFINITY_CACHE = d as AffMap))
      .catch(() => (AFFINITY_CACHE = {} as AffMap));
  }
  return AFFINITY_PROMISE;
}

// Scout Assistant mining output (scripts/gen-scout-insights.mjs), keyed by
// dataset id. Small enough to load eagerly via the same reactive-map pattern as
// photos/research/careers above.
export interface ScoutTrait {
  field: string; value: string | boolean; kind: "promotion" | "trend";
  rate: number; compareRate: number; lift: number; n: number; confidence: "low" | "medium" | "high";
}
export interface ScoutConnectionBucket {
  n: number; connectionType: { value: string; rate: number; n: number }[]; flags: Record<string, number>;
}
export interface ScoutBacktest { auc: number; pairs: number; folds: number; hireN: number; benchN: number }
export interface ScoutTieCategory { globalRate: number; hireRate: number; lift: number; n: number }
export interface ScoutTieLift {
  categories: Partial<Record<"admin" | "faculty" | "grad" | "undergrad", ScoutTieCategory>>;
  validation: { hitRate: number; baselineHitRate: number; n: number };
  hireN: number; withTieN: number;
}
export interface ScoutIndexInsights {
  sampleSize: number; benchSize: number; hasFeederBench: boolean; lowConfidence: boolean;
  connectionPatterns: { all: ScoutConnectionBucket | null; external: ScoutConnectionBucket | null };
  traits: ScoutTrait[];
  backtest: ScoutBacktest | null;
  tieLift: ScoutTieLift | null;
}
const scoutInsights = makeJsonMap<ScoutIndexInsights>("scout-insights.json");
export const useScoutInsights = scoutInsights.useMap;

// Scout Assistant "weak link" mining output (scripts/gen-employer-affinity.mjs),
// keyed by dataset id. A discipline-level (not per-school -- too thin a sample)
// shared-employer-background signal, complementary to affinity-by-school.json's
// direct ties. Only indices where a held-out validation actually beat chance
// appear here at all -- most indices won't, and that's an honest result of the
// mining pass, not a bug.
export interface EmployerCategory { category: string; n: number; rate: number; indexRate: number; lift: number }
export interface EmployerMatchedCategory { category: string; lift: number; evidence: string }
export interface WeakLinkEntry {
  name: string; enrichKey: string; index: string | null; indexLabel: string | null;
  university: string; role: string; matchedCategories: EmployerMatchedCategory[];
}
export interface EmployerSchoolProfile {
  categories: EmployerCategory[]; weakLinks: WeakLinkEntry[]; group: string; sampleSize: number; lowConfidence: boolean;
}
export interface EmployerIndexAffinity {
  validation: { hitRate: number; baselineHitRate: number; n: number } | null;
  schools: Record<string, EmployerSchoolProfile>;
}
const employerAffinity = makeJsonMap<EmployerIndexAffinity>("employer-affinity.json");
export const useEmployerAffinity = employerAffinity.useMap;

export const enrichKey = (dean: string, university: string) =>
  `${dean.trim().toLowerCase()}|${university.trim().toLowerCase()}`;

// Must match norm() in scripts/gen-careers.mjs exactly.
export const careerKey = (dean: string) =>
  dean.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
