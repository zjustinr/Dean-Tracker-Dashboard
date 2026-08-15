import { useState, useEffect, useMemo, useCallback } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useAllDeans } from "@/data/useData";
import {
  useScoutInsights, useEmployerAffinity, loadAffinity, getAffinityCache,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry, type WeakLinkEntry, type EmployerSchoolProfile,
  type ScoutOriginCategory,
} from "@/data/enrichment";
import type { Dean } from "@/data/types";
import { BOOLEAN_LABELS, CATEGORICAL_LABELS } from "@/data/types";
import { loadDatasetData, DATASETS_META, type DatasetId } from "@/data/datasets";

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

// gen-affinity.mjs's ADMIN/faculty ties are keyed at the UNIVERSITY level --
// its ADMIN regex just matches generic title keywords (dean, provost, chair,
// director, ...) with no notion of which SCHOOL within that university the
// title belongs to. That's fine for Slate Builder's own "affinity to this
// school" browser (which wants every connection for any reason), but it's a
// real false-positive source for Scout Assistant: a sitting Dean of Medicine
// at a university registers as an "admin" tie to that WHOLE university, so a
// business-school search for that same university would treat them as
// equally "connected" as someone who actually worked in the business school.
// Checked directly against the data before writing this: of 369 real
// external r1bschool hires, zero had any medicine/law/engineering background,
// and even a same-university-DIFFERENT-SCHOOL move at all is rare (3/369,
// 0.8%) -- so a tie whose own evidence text names a different professional
// school than the one being scouted isn't real signal here and shouldn't
// count as a connection. Scoped to schoolTypes that mean "one specific
// school among several at a university" -- deliberately EXCLUDES
// university/provost/r2university/system/liberalarts/advancement, where a
// past deanship of some specific school is a genuine, common, and validated
// path (e.g. a former dean becoming provost or president), not a false
// positive.
const SCHOOL_DOMAIN_RE: Partial<Record<string, RegExp>> = {
  business: /business school|school of business|college of business|school of management/i,
  engineering: /school of engineering|college of engineering|engineering school/i,
  medical: /school of medicine|medical school|college of medicine|health sciences center/i,
  law: /law school|school of law|college of law/i,
  agriculture: /college of agriculture|school of agriculture|\bforestry\b/i,
  nursing: /school of nursing|college of nursing/i,
  pharmacy: /school of pharmacy|college of pharmacy/i,
  education: /school of education|college of education/i,
  arts: /college of arts (?:and|&) sciences|school of arts (?:and|&) sciences/i,
  publichealth: /school of public health/i,
  veterinary: /veterinary medicine|school of veterinary/i,
  creativearts: /school of the arts|school of music|school of fine arts|\bconservatory\b/i,
  graduate: /graduate school|graduate college/i,
};
const SINGLE_SCHOOL_TYPES = new Set(Object.keys(SCHOOL_DOMAIN_RE));
const ANY_SCHOOL_DOMAIN_RE = new RegExp(Object.values(SCHOOL_DOMAIN_RE).filter((r): r is RegExp => !!r).map((r) => r.source).join("|"), "i");

// Admin/faculty evidence with cross-domain lines stripped (grad/undergrad
// untouched -- an alumni tie legitimately spans any later field, that's the
// whole point of an alumni signal, so it isn't subject to this filter).
// Two ways a line gets excluded:
//   1. It explicitly NAMES a different specific school ("...School of
//      Medicine...") -- always dropped, regardless of anything else.
//   2. It's a generic title with no school named at all ("Associate Dean for
//      Faculty Affairs", "Dean ad interim") AND this person's own best-known
//      leadership record (AffEntry.index, e.g. "r1medical") is a DIFFERENT
//      single-school domain than the one being searched. A generic title
//      alone doesn't say which school it belongs to, but knowing the person
//      is, say, a sitting Dean of Medicine elsewhere in her career is enough
//      to infer that a same-university admin line without further detail is
//      almost certainly about medicine too, not business -- catching cases
//      the per-line text match alone would miss (that generic title never
//      says "medicine" anywhere, but the person's whole career does).
// A line that explicitly names OUR OWN domain always survives both checks.
function ownDomainTies(e: AffEntry, datasetId: string): AffEntry {
  const searchType = DATASETS_META[datasetId as DatasetId]?.schoolType;
  if (!searchType || !SINGLE_SCHOOL_TYPES.has(searchType)) return e; // this index isn't "one school among several" -- filter doesn't apply
  const ownDomainRe = SCHOOL_DOMAIN_RE[searchType];
  const entryType = e.index ? DATASETS_META[e.index as DatasetId]?.schoolType : undefined;
  const homeIsDifferentSchool = !!entryType && SINGLE_SCHOOL_TYPES.has(entryType) && entryType !== searchType;
  const keep = (ev: string) => {
    if (ownDomainRe?.test(ev)) return true; // explicitly confirms OUR domain
    if (ANY_SCHOOL_DOMAIN_RE.test(ev)) return false; // explicitly names a DIFFERENT domain
    return !homeIsDifferentSchool; // generic/no domain named -- trust it only if their career isn't rooted in a different single-school domain
  };
  return { ...e, admin: e.admin.filter(keep), faculty: e.faculty.filter(keep) };
}

// An affinity candidate's strongest tie category (admin > faculty > grad >
// undergrad -- a working tie beats a merely alumni one) and its log-lift score
// from gen-scout-insights.mjs's tieLift: how often THIS category shows up
// among this index's real external hires, vs. corpus-wide. Only scored where
// that comparison actually validated (idx.tieLift is null otherwise) -- an
// unvalidated index contributes exactly 0, not a guess.
export function affinityTieFit(e: AffEntry, idx: ScoutIndexInsights, datasetId: string): { score: number; category: "admin" | "faculty" | "grad" | "undergrad" | null } {
  const own = ownDomainTies(e, datasetId);
  const category = own.admin.length ? "admin" : own.faculty.length ? "faculty" : own.grad.length ? "grad" : own.undergrad.length ? "undergrad" : null;
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

// A candidate's fit against the origin-category lift mined by gen-scout-
// insights.mjs -- "when this index hires from outside, what kind of position
// was the person coming from, and how well did that category tend to work
// out" (see the BatonIndex research brief "The Path Before the Deanship").
// Deliberately scoped to the two sources where a candidate's current-position
// category is unambiguous and safe to infer structurally, without touching
// the affinity/weak-link sources at all:
//   - "broad" candidates are, by construction, someone currently sitting as
//     dean at another school this SAME index tracks (broadShortlist only
//     ever pulls from useAllDeans(), which is scoped to the active dataset) --
//     always "dean-same-type", never "dean-other-type" (this app has no
//     cross-index broader pool, so that category is mined for completeness/
//     transparency but never actually reachable by a candidate here).
//   - "bench" candidates carry their own roleTier ("Associate Dean"/"Vice
//     Dean"/"Assistant Dean" vs. "Department Chair") straight from the data.
// Extending this to affinity/weak-link candidates would require inferring a
// connected person's CURRENT position across index boundaries, which is
// exactly the kind of cross-domain inference that produced the false-positive
// bug ownDomainTies exists to fix above -- left out on purpose rather than
// risk reintroducing that failure mode.
// idx.originLift's "adjustedLift" is already the historical hire-rate lift
// multiplied by a tenure-length factor (that category's average tenure vs.
// this index's overall external-hire average) -- a category that gets picked
// often but tends toward a shorter tenure is dampened, not just rewarded for
// being popular. log() puts it on the same additive scale as every other
// score component here.
export function originFitScore(
  source: SourceKind, dean: Dean | undefined, idx: ScoutIndexInsights
): { score: number; category: ScoutOriginCategory | null } {
  if (!idx.originLift) return { score: 0, category: null };
  let category: ScoutOriginCategory | null = null;
  if (source === "broad") category = "dean-same-type";
  else if (source === "bench") {
    const tier = dean?.roleTier;
    if (tier === "Department Chair") category = "dept-chair";
    else if (tier === "Associate Dean" || tier === "Vice Dean" || tier === "Assistant Dean") category = "assoc-vice-dean";
  }
  if (!category) return { score: 0, category: null };
  const cat = idx.originLift.categories[category];
  if (!cat) return { score: 0, category };
  return { score: Math.log(cat.adjustedLift), category };
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
// Applies the same cross-domain filter affinityTieFit scores against, so the
// displayed reasoning never claims a connection the score didn't actually
// credit (e.g. never captions someone "current cabinet member" on the
// strength of a deanship in a different professional school entirely).
export function tieDescriptor(e: AffEntry, datasetId: string): { label: string; detail: string } {
  const own = ownDomainTies(e, datasetId);
  if (own.admin.length) {
    const cabinetEvidence = own.admin.find((x) => CABINET_RE.test(x));
    const current = isCurrentEvidence(own.admin);
    return {
      label: `${current ? "Current" : "Former"} ${cabinetEvidence ? "cabinet member" : "administrator"}`,
      detail: cabinetEvidence ?? own.admin[0],
    };
  }
  if (own.faculty.length) {
    return { label: isCurrentEvidence(own.faculty) ? "Current faculty" : "Former faculty", detail: own.faculty[0] };
  }
  if (own.grad.length) return { label: "Graduate alum", detail: own.grad[0] };
  if (own.undergrad.length) return { label: "Undergraduate alum", detail: own.undergrad[0] };
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
  /** Job-description keywords (display form) that matched this candidate, if a posting was supplied -- drives the match-label badges under each row. */
  matchedKeywords?: string[];
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
  /** Extra score from a job-description keyword match (0 if none), added on top of the base score, plus which keywords (display form) actually matched. */
  keywordScore?: (dean: Dean | undefined, name: string, subtitle: string) => { score: number; matched: string[] };
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
        const origin = originFitScore("bench", d, idx);
        return {
          key: `bench:${d.id}`, source: "bench" as const, name: d.dean, university: d.university,
          subtitle: d.discipline || d.priorTitle || "",
          dean: d,
          reasoning: matched.length > 0 ? traitReasoning(matched[0]) : null,
          score: score + origin.score,
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
      .map((e) => ({ e, fit: affinityTieFit(e, idx, datasetId) }))
      // A candidate whose only tie evidence was cross-domain (see
      // ownDomainTies -- e.g. a sitting Dean of Medicine's admin tie to a
      // university, surfacing under a business-school search for that same
      // university) has no REAL connection left once that's filtered out.
      // Drop them from the affinity source entirely rather than keep them as
      // a zero-reasoning "Connected" row -- if their trait fit is strong
      // enough on its own, they can still surface through the broader-pool
      // source at the tiers where that source is included.
      .filter(({ fit }) => fit.category !== null)
      .map(({ e, fit }) => {
        const resolvable: ResolvableEntry = { name: e.name, enrichKey: e.enrichKey, index: e.index, university: e.university };
        return {
          key: `aff:${affKey(resolvable)}`, source: "affinity" as const, name: e.name, university: e.university,
          subtitle: `${e.role}${e.university ? ` · ${e.university}` : ""}`,
          resolvable,
          reasoning: tieDescriptor(e, datasetId),
          score: fit.score,
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
  // this index, not already surfaced by name above -- scored by trait fit (no
  // tie to this specific school, so no tie/employer bonus) plus the
  // origin-fit bonus every "broad" candidate qualifies for by construction
  // (they're always a sitting dean at another same-type school -- see
  // originFitScore). This is what lets the stringency dial widen all the way
  // to "everyone eligible," not just people with a documented connection: a
  // strong trait-fit match who has simply never worked at or near this school
  // can still surface, just ranked on that signal alone.
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
      const origin = originFitScore("broad", d, idx);
      out.push({
        key: `broad:${d.id}`, source: "broad", name: d.dean, university: d.university,
        subtitle: `${d.school ? d.school + ", " : ""}${d.university}`,
        dean: d,
        reasoning: matched.length > 0 ? traitReasoning(matched[0]) : null,
        score: score + origin.score,
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
      let matchedKeywords: string[] | undefined;
      if (dean && c.resolvable) score += traitFitScore(dean, idx.traits).score; // bonus only for resolved affinity/weak (bench/broad already scored on their own record)
      if (keywordScore) {
        const r = keywordScore(dean, c.name, c.subtitle);
        score += r.score;
        matchedKeywords = r.matched;
      }
      return { c: { ...c, score, matchedKeywords }, resolved };
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
