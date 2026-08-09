import { useState, useEffect, useMemo } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useAllDeans } from "@/data/useData";
import {
  useScoutInsights, useEmployerAffinity, loadAffinity, getAffinityCache, usePhotoMap, useResearchMap, enrichKey,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry, type WeakLinkEntry, type EmployerSchoolProfile,
} from "@/data/enrichment";
import type { Dean } from "@/data/types";
import { BOOLEAN_LABELS, CATEGORICAL_LABELS } from "@/data/types";
import { loadDatasetData, type DatasetId } from "@/data/datasets";
import DeanProfile from "@/components/DeanProfile";
import { CareerAssessment, useCareerAnalysis, type Root } from "@/components/CareerMap";
import { MovabilityGaugeIcon } from "@/components/MovabilityGaugeIcon";
import careerRoots from "@/data/career-roots.json";

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
const fieldLabel = (f: string): string =>
  (BOOLEAN_LABELS as Record<string, string>)[f] || (CATEGORICAL_LABELS as Record<string, string>)[f] || EXTRA_LABELS[f] || f;

function pct(x: number): string { return `${Math.round(x * 100)}%`; }

function traitSentence(t: ScoutTrait): string {
  const label = fieldLabel(t.field);
  const head = typeof t.value === "string" ? `${label}: ${t.value}` : label;
  return t.kind === "promotion"
    ? `${head} — ${pct(t.rate)} of hires here had this, vs. ${pct(t.compareRate)} of the associate/feeder bench (×${t.lift})`
    : `${head} — ${pct(t.rate)} of hires in the last 15 years, vs. ${pct(t.compareRate)} before that (×${t.lift})`;
}

// A candidate's fit against every mined trait (promotion-lift AND trend-lift
// alike) -- the same test whether the candidate comes from the feeder bench or
// a cross-index affinity/weak-link tie, since once we've resolved someone's
// full record the question is identical either way: "does this person's own
// history match what our data says predicts a hire here?" log(lift) so a ×2
// trait and a ×0.5 trait cancel out rather than both pushing the same way.
function traitFitScore(d: Dean, traits: ScoutTrait[]): { score: number; matched: ScoutTrait[] } {
  const matched = traits.filter((t) => (d as unknown as Record<string, unknown>)[t.field] === t.value);
  return { score: matched.reduce((s, t) => s + Math.log(t.lift), 0), matched };
}

// An affinity candidate's strongest tie category (admin > faculty > grad >
// undergrad -- a working tie beats a merely alumni one, same priority order
// as tieDescriptor below) and its log-lift score from gen-scout-insights.mjs's
// tieLift: how often THIS category shows up among this index's real external
// hires, vs. how often it shows up among external hires corpus-wide. Only
// scored where that comparison actually validated (idx.tieLift is null
// otherwise) -- an unvalidated index contributes exactly 0, not a guess. Two
// earlier designs guessed here (a connectionType cross-mapping starved of
// data, then a baseline pool dominated by this corpus's own leader-heavy
// composition) and both produced a scoring bias; see gen-scout-insights.mjs's
// tieCategoryLiftForIndex for why this version doesn't.
function affinityTieFit(e: AffEntry, idx: ScoutIndexInsights): { score: number; category: "admin" | "faculty" | "grad" | "undergrad" | null } {
  const category = e.admin.length ? "admin" : e.faculty.length ? "faculty" : e.grad.length ? "grad" : e.undergrad.length ? "undergrad" : null;
  if (!category) return { score: 0, category: null };
  const cat = idx.tieLift?.categories[category];
  if (!cat) return { score: 0, category };
  return { score: Math.log(cat.lift), category };
}

// A weak-link candidate's shared-employer-background fit -- already a sum of
// log(lift) over matched categories (see gen-employer-affinity.mjs), so it's
// already on the same scale as traitFitScore/affinityTieFit above.
function employerMatchScore(w: WeakLinkEntry): number {
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
function tieDescriptor(e: AffEntry): { label: string; detail: string } {
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
function weakLinkDescriptor(w: WeakLinkEntry): { label: string; detail: string } {
  const top = w.matchedCategories[0];
  return { label: `${top.category} background`, detail: top.evidence };
}

// AffEntry and WeakLinkEntry are otherwise differently shaped (tie-evidence
// arrays vs. matched-category list), but both carry enough to resolve and open
// a profile -- so the click/expand/resolve machinery below works on either.
type ResolvableEntry = { name: string; enrichKey: string; index: string | null; university: string };

type SourceKind = "bench" | "affinity" | "weak";
const SOURCE_THEME: Record<SourceKind, { pill: string; row: string; border: string; text: string; label: string }> = {
  bench: { pill: "bg-[#011F5B]/10 text-[#011F5B]", row: "bg-[#011F5B]/5", border: "border-[#011F5B]", text: "text-[#011F5B]", label: "Feeder bench" },
  affinity: { pill: "bg-[#8C1D40]/10 text-[#8C1D40]", row: "bg-[#8C1D40]/5", border: "border-[#8C1D40]", text: "text-[#8C1D40]", label: "Connected" },
  weak: { pill: "bg-amber-500/10 text-amber-700 dark:text-amber-500", row: "bg-amber-500/5", border: "border-amber-500", text: "text-amber-700 dark:text-amber-500", label: "Weak link" },
};

// A single row shape every candidate -- feeder bench, direct affinity, or weak
// link -- normalizes into, so all three sources can be ranked and rendered as
// one list instead of three separate ones. `dean` is already on hand for bench
// candidates; affinity/weak candidates only carry `resolvable` until their full
// record streams in (see resolveAffinityProfile), at which point their score
// picks up a traitFitScore bonus and the list re-sorts.
interface Candidate {
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

function Methodology({
  idx, label, employerProfile, validation,
}: {
  idx: ScoutIndexInsights;
  label: string;
  employerProfile?: EmployerSchoolProfile;
  validation: { hitRate: number; baselineHitRate: number; n: number } | null;
}) {
  const [open, setOpen] = useState(false);
  const promo = idx.traits.filter((t) => t.kind === "promotion");
  const trend = idx.traits.filter((t) => t.kind === "trend");
  return (
    <div className="px-4 sm:px-5 py-3">
      <button onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5">
        <span>{open ? "▾" : "▸"}</span> Methodology — {label}
      </button>
      {open && (
        <div className="mt-2.5 space-y-3 text-xs">
          <p className="text-muted-foreground">
            Mined from {idx.sampleSize.toLocaleString()} recorded appointments{idx.hasFeederBench ? ` and ${idx.benchSize.toLocaleString()} feeder-bench roles (associate deans / dept. chairs)` : ""}.
            {idx.lowConfidence && " This index is small — treat every stat below as a lead, not a settled finding."}
          </p>
          {idx.backtest && (
            <p className="text-muted-foreground">
              Backtested by holding out a fifth of the record at a time: these traits separated actual hires from the
              never-promoted feeder bench with an AUC of <strong>{idx.backtest.auc.toFixed(2)}</strong> (0.50 is no
              better than a coin flip, 1.00 is perfect separation).
            </p>
          )}
          {idx.connectionPatterns.external && (
            <div>
              <p className="font-semibold">Connection patterns (external hires)</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>{pct(idx.connectionPatterns.external.flags.hadPriorConnection ?? 0)} had some prior connection to the hiring institution.</li>
                {idx.connectionPatterns.external.connectionType.slice(0, 4).map((c) => (
                  <li key={c.value}>{c.value}: {pct(c.rate)} (n={c.n})</li>
                ))}
              </ul>
            </div>
          )}
          {idx.tieLift ? (
            <div>
              <p className="font-semibold">What kind of tie predicts a hire here</p>
              <p className="mt-1 text-muted-foreground">
                Among {idx.tieLift.hireN.toLocaleString()} external hires, {idx.tieLift.withTieN} had a documented pre-existing
                tie to the hiring school; {Object.entries(idx.tieLift.categories).map(([cat, c]) => `${cat} ties are ×${c.lift} as common as the typical external hire's (n=${c.n})`).join("; ")}.
                That's what ranks "Connected" candidates below.
              </p>
              <p className="mt-1 text-muted-foreground">
                Validated leave-one-hire-out: the most-distinctive tie type predicted the held-out hire's actual tie{" "}
                {pct(idx.tieLift.validation.hitRate)} of the time, vs. {pct(idx.tieLift.validation.baselineHitRate)} by
                chance (n={idx.tieLift.validation.n}).
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">
              Not enough external hires with a documented pre-existing tie to calibrate a tie-type weighting for{" "}
              {label.toLowerCase()} — "Connected" candidates below are still shown and ranked by trait fit, just
              without a tie-type score bonus.
            </p>
          )}
          {promo.length > 0 && (
            <div>
              <p className="font-semibold">What predicts promotion from the bench here</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground list-disc pl-4">
                {promo.slice(0, 6).map((t, i) => <li key={i}>{traitSentence(t)}</li>)}
              </ul>
            </div>
          )}
          {trend.length > 0 && (
            <div>
              <p className="font-semibold">How recent hires differ from the historical record</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground list-disc pl-4">
                {trend.slice(0, 6).map((t, i) => <li key={i}>{traitSentence(t)}</li>)}
              </ul>
            </div>
          )}
          {employerProfile && (
            <div>
              <p className="font-semibold">Weak links — shared-background signal</p>
              <p className="mt-1 text-muted-foreground">
                {employerProfile.group} appointments here draw from {employerProfile.categories.map((c) => `${c.category} (×${c.lift} vs. this index's average)`).join(", ")},
                based on {employerProfile.sampleSize} external hires with that discipline.
                {employerProfile.lowConfidence && " That's a modest sample — treat this as a lead, not a settled finding."}
              </p>
              {validation && (
                <p className="mt-1 text-muted-foreground">
                  Validated by holding out one hire at a time across the whole index: a flagged category predicted the
                  held-out hire's actual background {pct(validation.hitRate)} of the time, vs. {pct(validation.baselineHitRate)} if
                  you'd guessed that category blindly (n={validation.n}). Rare backgrounds are hard to call in absolute
                  terms even with real signal — the ratio between those two numbers is what to look at, not the raw hit rate.
                </p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground italic">
                This reflects the discipline broadly, not this specific school — every school sharing this discipline's
                hiring history will show the same categories and, often, the same candidates.
              </p>
            </div>
          )}
          <p className="text-muted-foreground">
            Feeder-bench, connected, and weak-link candidates are ranked together in one list: bench members and anyone
            whose full record we've resolved are scored against every trait above (promotion and trend alike), and that
            score is added on top of the connection- or background-fit score for that source — so a well-connected
            candidate who also matches this school's hiring pattern outranks one who only has one or the other.
          </p>
          <p className="text-[11px] text-muted-foreground italic">
            These are historical associations mined from our own dataset, not causal findings and not a hiring
            recommendation — small indices and data-collection gaps can both produce misleading lift numbers.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Embedded in Slate Builder (IndividualSearch.tsx), directly below the results
 * list, as soon as the user narrows to a single school -- not a standalone tab.
 * Deliberately styled with the same plain-div/Tailwind card chrome as the
 * results section above it (bg-card border rounded-xl, muted header bar,
 * divide-y rows) rather than the shadcn Card primitives used elsewhere in the
 * app, so it reads as part of the same list rather than a bolted-on module.
 * Every candidate row -- feeder bench or cross-index affinity tie -- expands
 * inline into its full DeanProfile on click, same as the results list; nothing
 * here navigates the user away from the section.
 */
export default function ScoutAssistant({
  university, onOpenSchool,
}: {
  university: string;
  onOpenSchool?: (university: string, school: string) => void;
}) {
  const { datasetId, meta } = useDataset();
  const allDeans = useAllDeans();
  const allInsights = useScoutInsights();
  const idx = allInsights[datasetId];
  const allEmployerAffinity = useEmployerAffinity();
  const employerProfile = allEmployerAffinity[datasetId]?.schools[university];
  const photos = usePhotoMap();
  const researchMap = useResearchMap();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Cohort tenure distribution for the Movability Index, mirroring IndividualSearch's
  // own tenureFor (same cohort-wide percentiles, so the rating reads identically
  // whether it's shown here or in the results list).
  function tenureFor(dn: Dean) {
    const NOW = 2026;
    const lens = allDeans.filter((x) => x.endYear != null && !x.isInterim && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number).sort((a, b) => a - b);
    const p = (q: number) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(q * lens.length))] : null);
    const past = allDeans.filter((x) => x.dean === dn.dean && x.id !== dn.id && x.endYear != null && (x.tenureLength ?? 0) > 0).map((x) => x.tenureLength as number);
    const personalAvg = past.length ? past.reduce((a, b) => a + b, 0) / past.length : null;
    return {
      sitting: dn.endYear == null,
      currentTenure: dn.endYear == null && dn.startYear ? NOW - dn.startYear : dn.tenureLength ?? null,
      median: p(0.5), p75: p(0.75), personalAvg, cohortN: lens.length,
    };
  }

  // Compact per-row indicator: just the gauge + label, no map/stats. Used to the
  // right of every row where a full Dean record is already on hand.
  function MovabilityBadge({ dean }: { dean: Dean }) {
    const career = researchMap[enrichKey(dean.dean, dean.university)]?.career;
    const roots = (careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)];
    const { rating } = useCareerAnalysis(career || [], tenureFor(dean), roots);
    if (!rating) return null;
    return (
      <div className="flex flex-col items-center gap-0.5 shrink-0 w-14" title={`Movability Index: ${rating.label}`}>
        <MovabilityGaugeIcon tone={rating.tone} size={22} />
        <span className={`text-[9px] font-semibold px-1 py-0.5 rounded leading-none whitespace-nowrap ${rating.cls}`}>{rating.label}</span>
      </div>
    );
  }

  // Expanded row content: the profile on the left, the full Movability Index
  // module in its own column on the right -- same split IndividualSearch uses
  // between its results list and its sticky map/assessment column, just brought
  // inline per-row here instead of living in a page-level sidebar.
  function ExpandedProfile({ dean, onClose }: { dean: Dean; onClose: () => void }) {
    const career = researchMap[enrichKey(dean.dean, dean.university)]?.career;
    const roots = (careerRoots as Record<string, Root[]>)[enrichKey(dean.dean, dean.university)];
    return (
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
        <DeanProfile dean={dean} onClose={onClose} onOpenSchool={onOpenSchool} hideAssessment />
        {career && career.length > 0 && (
          <div className="lg:sticky lg:top-4">
            <CareerAssessment steps={career} tenure={tenureFor(dean)} roots={roots} />
          </div>
        )}
      </div>
    );
  }

  // Affinity/weak-link candidates only carry tie evidence, not a full Dean
  // record, and may live in an index that isn't currently loaded. To expand
  // them inline (same as bench candidates) rather than navigating away,
  // resolve their full record on click: reuse allDeans if they're in the
  // current index, otherwise fetch their home index's dataset on demand and
  // cache the result so re-opening -- or re-scoring once resolved -- is instant.
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, Dean | "not-found">>({});
  const affKey = (entry: ResolvableEntry) => `${entry.enrichKey}|${entry.index ?? ""}`;

  async function resolveAffinityProfile(entry: ResolvableEntry) {
    const key = affKey(entry);
    if (resolvedProfiles[key]) return;
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
    setResolvedProfiles((p) => ({ ...p, [key]: best ?? "not-found" }));
  }

  function CandidateAvatar({ enrichKeyStr, name, theme }: { enrichKeyStr: string; name: string; theme: SourceKind }) {
    const p = photos[enrichKeyStr];
    if (p?.photo) return <img src={p.photo} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />;
    const dotColor = theme === "bench" ? "#011F5B" : theme === "affinity" ? "#8C1D40" : "#B45309";
    return (
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${dotColor}1A` }}>
        <span className="text-xs font-bold" style={{ color: dotColor }}>{name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2)}</span>
      </div>
    );
  }

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
  // role at this school (any non-bench spell, current or past) is excluded
  // from every candidate pool. Matched by name only: schoolDeans is already
  // scoped to this university within the currently-loaded index, so this
  // correctly catches a former titleholder surfacing via an affinity tie whose
  // home identity is elsewhere, not just the person currently sitting in the seat.
  const everHeldNames = useMemo(() => new Set(
    schoolDeans.filter((d) => d.roleType !== "subdean").map((d) => d.dean.trim().toLowerCase())
  ), [schoolDeans]);

  // Pre-filtered shortlists, sorted by each source's synchronous score (no
  // resolved record needed yet) -- keeps the number of profiles we go fetch to
  // a bounded ~12 per source instead of resolving an entire affinity pool that
  // can run into the hundreds.
  const benchShortlist = useMemo<Candidate[]>(() => {
    if (!idx || !idx.hasFeederBench) return [];
    return schoolDeans
      .filter((d) => d.roleType === "subdean" && !everHeldNames.has(d.dean.trim().toLowerCase()))
      .map((d) => {
        const { score, matched } = traitFitScore(d, idx.traits);
        return {
          key: `bench:${d.id}`, source: "bench" as const, name: d.dean, university: d.university,
          subtitle: d.discipline || d.priorTitle || "",
          dean: d,
          reasoning: matched.length > 0 ? { label: fieldLabel(matched[0].field), detail: traitSentence(matched[0]) } : null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
  }, [schoolDeans, everHeldNames, idx]);

  const affinityShortlist = useMemo<Candidate[]>(() => {
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
      .slice(0, 12);
  }, [affinityMap, university, everHeldNames, idx]);

  // Weak links: leaders with a career background matching what this school's
  // DISCIPLINE tends to draw from (see gen-employer-affinity.mjs) -- a much
  // looser signal than a direct alumni/faculty/admin tie, so anyone already
  // surfaced by name above (feeder bench, direct affinity, or who's already
  // held the role) is excluded here on purpose: this source exists to add NEW
  // possibilities, not repeat ones already shown.
  const weakLinkShortlist = useMemo<Candidate[]>(() => {
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
      .slice(0, 12);
  }, [employerProfile, affinityMap, university, everHeldNames, schoolDeans]);

  // Resolve every shortlisted affinity/weak-link candidate's full record in the
  // background (not just on click) so the Movability badge, the expand panel,
  // AND the unified trait-fit score bonus below are all ready without an extra
  // wait. resolveAffinityProfile's own cache means this is at most one fetch per
  // distinct home index represented across both shortlists, not one per candidate.
  useEffect(() => {
    for (const c of affinityShortlist) if (c.resolvable) resolveAffinityProfile(c.resolvable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affinityShortlist]);
  useEffect(() => {
    for (const c of weakLinkShortlist) if (c.resolvable) resolveAffinityProfile(c.resolvable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weakLinkShortlist]);

  // The one ranked list: bench + affinity + weak-link shortlists merged, each
  // candidate's score topped up with a traitFitScore bonus once its full record
  // has resolved (bench already has its record, so its score never changes
  // here). Re-sorts as resolutions stream in -- a well-connected candidate who
  // also matches this school's hiring pattern surfaces above one with only one
  // signal or the other.
  const candidates = useMemo<Candidate[]>(() => {
    if (!idx) return [];
    const withBonus = (c: Candidate): Candidate => {
      if (!c.resolvable) return c;
      const resolved = resolvedProfiles[affKey(c.resolvable)];
      if (!resolved || resolved === "not-found") return c;
      return { ...c, score: c.score + traitFitScore(resolved, idx.traits).score };
    };
    return [...benchShortlist, ...affinityShortlist.map(withBonus), ...weakLinkShortlist.map(withBonus)]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchShortlist, affinityShortlist, weakLinkShortlist, resolvedProfiles, idx]);

  if (!idx) return null; // no mined patterns for this index yet -- nothing useful to show

  return (
    <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span>Scout Assistant</span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
            Experimental
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Candidates scored against patterns mined from our own {meta.label.toLowerCase()} appointment history — a
          fit to this school's historical pattern, not a recommendation. See Methodology below.
        </p>
      </div>

      {idx.lowConfidence && (
        <p className="px-4 sm:px-5 pt-3 text-xs text-amber-700 dark:text-amber-500">
          {meta.label} has only {idx.sampleSize} recorded appointments — these patterns are preliminary.
        </p>
      )}

      {candidates.length === 0 ? (
        <p className="px-4 sm:px-5 py-4 text-sm text-muted-foreground">No feeder-bench or cross-index connections on file for {university} yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {candidates.map((c) => {
            const theme = SOURCE_THEME[c.source];
            const isOpen = expandedKey === c.key;
            const resolved = c.dean ?? (c.resolvable ? resolvedProfiles[affKey(c.resolvable)] : undefined);
            return (
              <div key={c.key}>
                <button
                  onClick={() => {
                    setExpandedKey(isOpen ? null : c.key);
                    if (!isOpen && c.resolvable) resolveAffinityProfile(c.resolvable);
                  }}
                  className={["w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors", isOpen ? theme.row : "hover:bg-accent/40"].join(" ")}
                >
                  <CandidateAvatar enrichKeyStr={c.dean ? enrichKey(c.dean.dean, c.dean.university) : c.resolvable!.enrichKey} name={c.name} theme={c.source} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{c.name}</span>
                      <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${theme.pill}`}>{theme.label}</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{c.subtitle}</p>
                    {c.reasoning ? (
                      <p className={`text-xs mt-0.5 truncate ${theme.text}`}>
                        <span className="font-semibold">{c.reasoning.label}</span>{c.reasoning.detail ? ` — ${c.reasoning.detail}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground italic mt-0.5">No strong pattern match — included as a current bench member.</p>
                    )}
                  </div>
                  {resolved && resolved !== "not-found" && <MovabilityBadge dean={resolved} />}
                  <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
                </button>
                {isOpen && (
                  <div className={`px-4 sm:px-5 pb-4 pt-1 border-l-2 ${theme.row} ${theme.border}`}>
                    {!resolved ? (
                      <p className="text-xs text-muted-foreground py-3">Loading profile…</p>
                    ) : resolved === "not-found" ? (
                      <p className="text-xs text-muted-foreground py-3">No detailed profile on file for {c.name} yet.</p>
                    ) : (
                      <ExpandedProfile dean={resolved} onClose={() => setExpandedKey(null)} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border">
        <Methodology idx={idx} label={meta.label} employerProfile={employerProfile} validation={allEmployerAffinity[datasetId]?.validation ?? null} />
      </div>
    </div>
  );
}
