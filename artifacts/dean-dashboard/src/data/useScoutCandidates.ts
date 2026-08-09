import { useState, useEffect, useMemo, useCallback } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useAllDeans } from "@/data/useData";
import {
  useScoutInsights, useEmployerAffinity, loadAffinity, getAffinityCache,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry, type WeakLinkEntry, type EmployerSchoolProfile,
} from "@/data/enrichment";
import type { Dean } from "@/data/types";
import { BOOLEAN_LABELS, CATEGORICAL_LABELS } from "@/data/types";
import { loadDatasetData, type DatasetId } from "@/data/datasets";

// Scout Assistant's candidate-scoring engine -- shared by the section embedded
// in Slate Builder (ScoutAssistant.tsx, fixed at a top-10 cap, no filters) and
// the standalone Scout Assistant module (ScoutAssistantPage.tsx, with a
// stringency slider, roster filters, and optional job-description keywords).
// One engine so both surfaces always rank candidates identically -- adding a
// signal here (or fixing a calibration bug, see gen-scout-insights.mjs) fixes
// both places at once instead of two copies drifting apart.

// Labels for the pre-appointment traits gen-scout-insights.mjs mines (types.ts's
// BOOLEAN_LABELS/CATEGORICAL_LABELS cover most of them already; these are the
// handful specific to Scout Assistant, e.g. connection fields).
const EXTRA_LABELS: Record<string, string> = {
  priorInstitutionElite: "Prior Institution Elite",
  hadDeptChairRole: "Prior Dept. Chair Role",
  hasConsultingBg: "Consulting Background",
  hasInstitutionalLink: "Institutional Link to This School",
  fromSameUniversityDiffSchool: "Moved From a Different School, Same University",
  connectionType: "Connection Type",
};
export const fieldLabel = (f: string): string =>
  (BOOLEAN_LABELS as Record<string, string>)[f] || (CATEGORICAL_LABELS as Record<string, string>)[f] || EXTRA_LABELS[f] || f;

export function pct(x: number): string { return `${Math.round(x * 100)}%`; }

export function traitSentence(t: ScoutTrait): string {
  const label = fieldLabel(t.field);
  const head = typeof t.value === "string" ? `${label}: ${t.value}` : label;
  return t.kind === "promotion"
    ? `${head} — ${pct(t.rate)} of hires here had this, vs. ${pct(t.compareRate)} of the associate/feeder bench (×${t.lift})`
    : `${head} — ${pct(t.rate)} of hires in the last 15 years, vs. ${pct(t.compareRate)} before that (×${t.lift})`;
}

// A candidate-row reasoning label/detail pair for a matched trait, WITHOUT
// double-stating the field: traitSentence already folds a categorical value
// into its head ("Connection Type: Current faculty — 20%..."), so a row that
// shows { label: fieldLabel(field), detail: traitSentence(t) } would render
// "Connection Type — Connection Type: Current faculty — 20%...". This keeps
// the value in the label (where a categorical trait needs it) and the stat
// in the detail only.
export function traitReasoning(t: ScoutTrait): { label: string; detail: string } {
  const base = fieldLabel(t.field);
  const label = typeof t.value === "string" ? `${base}: ${t.value}` : base;
  const detail = t.kind === "promotion"
    ? `${pct(t.rate)} of hires here had this, vs. ${pct(t.compareRate)} of the associate/feeder bench (×${t.lift})`
    : `${pct(t.rate)} of hires in the last 15 years, vs. ${pct(t.compareRate)} before that (×${t.lift})`;
  return { label, detail };
}

// A candidate's fit against every mined trait (promotion-lift AND trend-lift
// alike) -- the same test regardless of which source surfaced the candidate,
// since once we've resolved someone's full record the question is identical:
// "does this person's own history match what our data says predicts a hire
// here?" log(lift) so a ×2 trait and a ×0.5 trait cancel out rather than both
// pushing the same way.
export function traitFitScore(d: Dean, traits: ScoutTrait[]): { score: number; matched: ScoutTrait[] } {
  const matched = traits.filter((t) => (d as unknown as Record<string, unknown>)[t.field] === t.value);
  return { score: matched.reduce((s, t) => s + Math.log(t.lift), 0), matched };
}

// An affinity candidate's strongest tie category (admin > faculty > grad >
// undergrad -- a working tie beats a merely alumni one) and its log-lift score
// from gen-scout-insights.mjs's tieLift: how often THIS category shows up
// among this index's real external hires, vs. corpus-wide. Only scored where
// that comparison actually validated (idx.tieLift is null otherwise) -- an
// unvalidated index contributes exactly 0, not a guess.
export function affinityTieFit(e: AffEntry, idx: ScoutIndexInsights): { score: number; category: "admin" | "faculty" | "grad" | "undergrad" | null } {
  const category = e.admin.length ? "admin" : e.faculty.length ? "faculty" : e.grad.length ? "grad" : e.undergrad.length ? "undergrad" : null;
  if (!category) return { score: 0, category: null };
  const cat = idx.tieLift?.categories[category];
  if (!cat) return { score: 0, category };
  return { score: Math.log(cat.lift), category };
}

// A weak-link candidate's shared-employer-background fit -- already a sum of
// log(lift) over matched categories (see gen-employer-affinity.mjs), so it's
// already on the same scale as traitFitScore/affinityTieFit above.
export function employerMatchScore(w: WeakLinkEntry): number {
  return w.matchedCategories.reduce((s, c) => s + Math.log(c.lift), 0);
}

// Cabinet-level titles within an "admin" tie (dean/provost/president/chancellor)
// vs. lower-level administrative roles the broader ADMIN match in gen-affinity.mjs
// also catches (chair, director, coordinator, ...).
const CABINET_RE = /\b(dean|provost|chancellor|president)\b/i;
const isCurrentEvidence = (evidence: string[]) => evidence.some((e) => /present/i.test(e));

// A short, intuitive label for why this person is connected to the school --
// "current cabinet member" / "alum" / "former faculty" -- rather than dumping
// the raw tie-evidence string. Priority: admin > faculty > grad > undergrad
// (a stronger tie wins), paired with the single most relevant evidence line.
export function tieDescriptor(e: AffEntry): { label: string; detail: string } {
  if (e.admin.length) {
    const cabinetEvidence = e.admin.find((x) => CABINET_RE.test(x));
    const current = isCurrentEvidence(e.admin);
    return {
      label: `${current ? "Current" : "Former"} ${cabinetEvidence ? "cabinet member" : "administrator"}`,
      detail: cabinetEvidence ?? e.admin[0],
    };
  }
  if (e.faculty.length) {
    return { label: isCurrentEvidence(e.faculty) ? "Current faculty" : "Former faculty", detail: e.faculty[0] };
  }
  if (e.grad.length) return { label: "Graduate alum", detail: e.grad[0] };
  if (e.undergrad.length) return { label: "Undergraduate alum", detail: e.undergrad[0] };
  return { label: "Connected to this school", detail: "" };
}

// Reasoning line for a weak-link candidate: which shared-background category
// matched, and the specific piece of their record that earned it.
export function weakLinkDescriptor(w: WeakLinkEntry): { label: string; detail: string } {
  const top = w.matchedCategories[0];
  return { label: `${top.category} background`, detail: top.evidence };
}

// AffEntry and WeakLinkEntry are otherwise differently shaped (tie-evidence
// arrays vs. matched-category list), but both carry enough to resolve and open
// a profile -- so the click/expand/resolve machinery works on either.
export type ResolvableEntry = { name: string; enrichKey: string; index: string | null; university: string };

export type SourceKind = "bench" | "affinity" | "weak" | "broad";
export const SOURCE_THEME: Record<SourceKind, { pill: string; row: string; border: string; text: string; label: string }> = {
  bench: { pill: "bg-[#011F5B]/10 text-[#011F5B]", row: "bg-[#011F5B]/5", border: "border-[#011F5B]", text: "text-[#011F5B]", label: "Feeder bench" },
  affinity: { pill: "bg-[#8C1D40]/10 text-[#8C1D40]", row: "bg-[#8C1D40]/5", border: "border-[#8C1D40]", text: "text-[#8C1D40]", label: "Connected" },
  weak: { pill: "bg-amber-500/10 text-amber-700 dark:text-amber-500", row: "bg-amber-500/5", border: "border-amber-500", text: "text-amber-700 dark:text-amber-500", label: "Weak link" },
  broad: { pill: "bg-slate-500/10 text-slate-600 dark:text-slate-400", row: "bg-slate-500/5", border: "border-slate-400", text: "text-slate-600 dark:text-slate-400", label: "Broader pool" },
};

// A single row shape every candidate -- feeder bench, direct affinity, weak
// link, or the broader eligible pool -- normalizes into, so every source can
// be ranked and rendered as one list. `dean` is already on hand for bench/
// broad candidates; affinity/weak candidates only carry `resolvable` until
// their full record streams in, at which point their score picks up a
// traitFitScore bonus and the list re-sorts.
export interface ScoutCandidate {
  key: string;
  source: SourceKind;
  name: string;
  university: string;
  subtitle: string;
  dean?: Dean;
  resolvable?: ResolvableEntry;
  reasoning: { label: string; detail: string } | null;
  score: number;
}

export const affKey = (entry: ResolvableEntry) => `${entry.enrichKey}|${entry.index ?? ""}`;

export interface ScoutEngineOptions {
  university: string;
  /** How many ranked candidates to keep. Pass Infinity for "every eligible candidate." */
  cap: number;
  /** Include every OTHER currently-sitting leader in this index as a candidate (scored by trait fit alone, no tie/employer bonus) -- the source that lets stringency widen all the way to "everyone eligible," not just people with a known connection. Default true. */
  includeBroad?: boolean;
  /** Roster filter (gender/PhD/appointment/region, etc.) -- applied wherever a resolved Dean record is available. Candidates not yet resolved are held out of the filtered view rather than shown-then-removed once resolution lands. */
  filter?: (dean: Dean) => boolean;
  /** Extra score from a job-description keyword match (0 if none), added on top of the base score. */
  keywordScore?: (dean: Dean | undefined, name: string, subtitle: string) => number;
}

const SHORTLIST_CAP = 400; // per-source pre-merge cap -- generous enough that "all eligible" tiers see the real pool, just a guard against a pathological source size

export function useScoutCandidateEngine({ university, cap, includeBroad = true, filter, keywordScore }: ScoutEngineOptions) {
  const { datasetId, meta } = useDataset();
  const allDeans = useAllDeans();
  const allInsights = useScoutInsights();
  const idx = allInsights[datasetId];
  const allEmployerAffinity = useEmployerAffinity();
  const employerProfile = allEmployerAffinity[datasetId]?.schools[university];
  const employerValidation = allEmployerAffinity[datasetId]?.validation ?? null;

  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, Dean | "not-found">>({});

  const resolveProfile = useCallback(async (entry: ResolvableEntry) => {
    const key = affKey(entry);
    setResolvedProfiles((p) => {
      if (key in p) return p; // already resolved or in flight -- avoid duplicate fetches
      return p;
    });
    let deans: Dean[] | null = null;
    if (!entry.index) {
      deans = null;
    } else if (entry.index === datasetId) {
      deans = allDeans;
    } else {
      try { deans = (await loadDatasetData(entry.index as DatasetId)).deans; } catch { deans = null; }
    }
    const nameL = entry.name.trim().toLowerCase();
    const uniL = entry.university.trim().toLowerCase();
    const matches = (deans || []).filter((d) => d.dean.trim().toLowerCase() === nameL && d.university.trim().toLowerCase() === uniL);
    const best = matches.find((d) => d.endYear == null) ?? matches.sort((a, b) => (b.startYear || 0) - (a.startYear || 0))[0] ?? null;
    setResolvedProfiles((p) => (affKey(entry) in p ? p : { ...p, [key]: best ?? "not-found" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId, allDeans]);

  const [affinityMap, setAffinityMap] = useState<AffMap | null>(getAffinityCache());
  useEffect(() => {
    if (affinityMap) return;
    let alive = true;
    loadAffinity().then((m) => { if (alive) setAffinityMap(m); });
    return () => { alive = false; };
  }, [affinityMap]);

  const schoolDeans = useMemo(() => allDeans.filter((d) => d.university === university), [allDeans, university]);
  // Scout Assistant is for finding the NEXT leader, not re-suggesting a past
  // (or the current) one -- so anyone who has ever actually held this exact
  // role at this school is excluded from every candidate pool.
  const everHeldNames = useMemo(() => new Set(
    schoolDeans.filter((d) => d.roleType !== "subdean").map((d) => d.dean.trim().toLowerCase())
  ), [schoolDeans]);

  const benchShortlist = useMemo<ScoutCandidate[]>(() => {
    if (!idx || !idx.hasFeederBench) return [];
    return schoolDeans
      .filter((d) => d.roleType === "subdean" && !everHeldNames.has(d.dean.trim().toLowerCase()))
      .map((d) => {
        const { score, matched } = traitFitScore(d, idx.traits);
        return {
          key: `bench:${d.id}`, source: "bench" as const, name: d.dean, university: d.university,
          subtitle: d.discipline || d.priorTitle || "",
          dean: d,
          reasoning: matched.length > 0 ? traitReasoning(matched[0]) : null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SHORTLIST_CAP);
  }, [schoolDeans, everHeldNames, idx]);

  const affinityShortlist = useMemo<ScoutCandidate[]>(() => {
    if (!idx) return [];
    const list = affinityMap?.[university] || [];
    return list
      .filter((e) => !everHeldNames.has(e.name.trim().toLowerCase()))
      .map((e) => {
        const { score, category } = affinityTieFit(e, idx);
        const resolvable: ResolvableEntry = { name: e.name, enrichKey: e.enrichKey, index: e.index, university: e.university };
        return {
          key: `aff:${affKey(resolvable)}`, source: "affinity" as const, name: e.name, university: e.university,
          subtitle: `${e.role}${e.university ? ` · ${e.university}` : ""}`,
          resolvable,
          reasoning: category ? tieDescriptor(e) : null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SHORTLIST_CAP);
  }, [affinityMap, university, everHeldNames, idx]);

  const weakLinkShortlist = useMemo<ScoutCandidate[]>(() => {
    if (!employerProfile) return [];
    const affinityNames = new Set((affinityMap?.[university] || []).map((e) => e.name.trim().toLowerCase()));
    const benchNames = new Set(schoolDeans.filter((d) => d.roleType === "subdean").map((d) => d.dean.trim().toLowerCase()));
    return employerProfile.weakLinks
      .filter((w) => {
        const nameL = w.name.trim().toLowerCase();
        return !everHeldNames.has(nameL) && !affinityNames.has(nameL) && !benchNames.has(nameL);
      })
      .map((w) => {
        const resolvable: ResolvableEntry = { name: w.name, enrichKey: w.enrichKey, index: w.index, university: w.university };
        return {
          key: `weak:${affKey(resolvable)}`, source: "weak" as const, name: w.name, university: w.university,
          subtitle: `${w.role}${w.university ? ` · ${w.university}` : ""}`,
          resolvable,
          reasoning: weakLinkDescriptor(w),
          score: employerMatchScore(w),
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, SHORTLIST_CAP);
  }, [employerProfile, affinityMap, university, everHeldNames, schoolDeans]);

  // The broader eligible pool: every OTHER currently-sitting leader tracked by
  // this index, not already surfaced by name above -- scored by trait fit
  // alone (no tie to this specific school, so no tie/employer bonus). This is
  // what lets the stringency dial widen all the way to "everyone eligible,"
  // not just people with a documented connection: a strong trait-fit match who
  // has simply never worked at or near this school can still surface, just
  // ranked on that signal alone.
  const broadShortlist = useMemo<ScoutCandidate[]>(() => {
    if (!idx || !includeBroad) return [];
    const affinityNames = new Set((affinityMap?.[university] || []).map((e) => e.name.trim().toLowerCase()));
    const weakNames = new Set((employerProfile?.weakLinks || []).map((w) => w.name.trim().toLowerCase()));
    const seen = new Set<string>();
    const out: ScoutCandidate[] = [];
    for (const d of allDeans) {
      if (d.roleType === "subdean" || d.endYear != null) continue;
      const nameL = d.dean.trim().toLowerCase();
      if (everHeldNames.has(nameL) || affinityNames.has(nameL) || weakNames.has(nameL) || seen.has(nameL)) continue;
      if (d.university === university) continue; // already covered by bench/everHeld for this school
      seen.add(nameL);
      const { score, matched } = traitFitScore(d, idx.traits);
      out.push({
        key: `broad:${d.id}`, source: "broad", name: d.dean, university: d.university,
        subtitle: `${d.school ? d.school + ", " : ""}${d.university}`,
        dean: d,
        reasoning: matched.length > 0 ? traitReasoning(matched[0]) : null,
        score,
      });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, SHORTLIST_CAP);
  }, [allDeans, idx, includeBroad, affinityMap, university, employerProfile, everHeldNames]);

  useEffect(() => {
    for (const c of affinityShortlist) if (c.resolvable) resolveProfile(c.resolvable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affinityShortlist]);
  useEffect(() => {
    for (const c of weakLinkShortlist) if (c.resolvable) resolveProfile(c.resolvable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakLinkShortlist]);

  // The one ranked list: every source merged, each candidate's score topped up
  // with a traitFitScore bonus once its full record has resolved (bench/broad
  // already have their record, so their score never changes here), then an
  // optional job-description keyword boost, then an optional roster filter,
  // then sorted and capped to the requested stringency depth.
  const { candidates, totalRanked } = useMemo(() => {
    if (!idx) return { candidates: [] as ScoutCandidate[], totalRanked: 0 };
    const withExtras = (c: ScoutCandidate): { c: ScoutCandidate; resolved: Dean | "not-found" | undefined } => {
      const resolved = c.dean ?? (c.resolvable ? resolvedProfiles[affKey(c.resolvable)] : undefined);
      const dean = c.dean ?? (resolved && resolved !== "not-found" ? resolved : undefined);
      let score = c.score;
      if (dean && c.resolvable) score += traitFitScore(dean, idx.traits).score; // bonus only for resolved affinity/weak (bench/broad already scored on their own record)
      if (keywordScore) score += keywordScore(dean, c.name, c.subtitle);
      return { c: { ...c, score }, resolved };
    };
    const all = [...benchShortlist, ...affinityShortlist, ...weakLinkShortlist, ...broadShortlist].map(withExtras);
    const filtered = filter
      ? all.filter(({ c, resolved }) => {
          const dean = c.dean ?? (resolved && resolved !== "not-found" ? resolved : undefined);
          if (!dean) return false; // held out until resolved, rather than shown-then-removed
          return filter(dean);
        })
      : all;
    const sorted = filtered.map(({ c }) => c).sort((a, b) => b.score - a.score);
    return { candidates: sorted.slice(0, cap), totalRanked: sorted.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchShortlist, affinityShortlist, weakLinkShortlist, broadShortlist, resolvedProfiles, idx, cap, filter, keywordScore]);

  return {
    idx, meta, datasetId, employerProfile, employerValidation,
    candidates, totalRanked,
    resolvedProfiles, resolveProfile,
    allDeans,
  };
}
