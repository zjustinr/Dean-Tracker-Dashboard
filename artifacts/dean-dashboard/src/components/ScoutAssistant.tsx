import { useState, useEffect, useMemo } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useAllDeans } from "@/data/useData";
import {
  useScoutInsights, loadAffinity, getAffinityCache, usePhotoMap, useResearchMap, enrichKey,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry,
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

// A bench candidate's fit score: sum of log(lift) over every promotion trait they
// match. log(lift) so a ×2 trait and a ×0.5 trait cancel out rather than both
// pushing the score the same direction.
function scoreBench(d: Dean, traits: ScoutTrait[]): { score: number; matched: ScoutTrait[] } {
  const matched = traits.filter((t) => t.kind === "promotion" && (d as unknown as Record<string, unknown>)[t.field] === t.value);
  return { score: matched.reduce((s, t) => s + Math.log(t.lift), 0), matched };
}

// Admin/faculty ties mean they actually worked there; alumni ties are a weaker
// signal. Simple weighted count, not a calibrated model -- just an ordering.
function tieScore(e: AffEntry): number {
  return e.admin.length * 2 + e.faculty.length * 1.5 + e.grad.length + e.undergrad.length;
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

function Methodology({ idx, label }: { idx: ScoutIndexInsights; label: string }) {
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
  const photos = usePhotoMap();
  const researchMap = useResearchMap();
  const [expandedBenchId, setExpandedBenchId] = useState<number | null>(null);

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

  // Affinity candidates only carry tie evidence, not a full Dean record, and may
  // live in an index that isn't currently loaded. To expand them inline (same as
  // bench candidates) rather than navigating away, resolve their full record on
  // click: reuse allDeans if they're in the current index, otherwise fetch their
  // home index's dataset on demand and cache the result so re-opening is instant.
  const [expandedAffKey, setExpandedAffKey] = useState<string | null>(null);
  const [resolvedProfiles, setResolvedProfiles] = useState<Record<string, Dean | "not-found">>({});
  const affKey = (entry: AffEntry) => `${entry.enrichKey}|${entry.index ?? ""}`;

  async function resolveAffinityProfile(entry: AffEntry) {
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

  function handleAffinityClick(entry: AffEntry) {
    const key = affKey(entry);
    if (expandedAffKey === key) { setExpandedAffKey(null); return; }
    setExpandedAffKey(key);
    if (!resolvedProfiles[key]) resolveAffinityProfile(entry);
  }

  function Avatar({ dean }: { dean: Dean }) {
    const p = photos[enrichKey(dean.dean, dean.university)];
    if (p?.photo) return <img src={p.photo} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />;
    return (
      <div className="w-9 h-9 rounded-full bg-[#011F5B]/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-[#011F5B]">{dean.dean.split(" ").map((n) => n[0]).join("").slice(0, 2)}</span>
      </div>
    );
  }
  function AffAvatar({ entry }: { entry: AffEntry }) {
    const p = photos[entry.enrichKey];
    if (p?.photo) return <img src={p.photo} alt="" loading="lazy" className="w-9 h-9 rounded-full object-cover shrink-0 border border-border" />;
    return (
      <div className="w-9 h-9 rounded-full bg-[#8C1D40]/10 flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-[#8C1D40]">{entry.name.split(/\s+/).map((n) => n[0]).join("").slice(0, 2)}</span>
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
  // from both candidate pools. Matched by name only: schoolDeans is already
  // scoped to this university within the currently-loaded index, so this
  // correctly catches a former titleholder surfacing in "Connected across our
  // database" via an affinity tie whose home identity is elsewhere, not just
  // the person currently sitting in the seat.
  const everHeldNames = useMemo(() => new Set(
    schoolDeans.filter((d) => d.roleType !== "subdean").map((d) => d.dean.trim().toLowerCase())
  ), [schoolDeans]);

  const benchCandidates = useMemo(() => {
    if (!idx || !idx.hasFeederBench) return [];
    return schoolDeans
      .filter((d) => d.roleType === "subdean" && !everHeldNames.has(d.dean.trim().toLowerCase()))
      .map((d) => ({ dean: d, ...scoreBench(d, idx.traits) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [schoolDeans, everHeldNames, idx]);

  const affinityCandidates = useMemo(() => {
    const list = affinityMap?.[university] || [];
    return list
      .filter((e) => !everHeldNames.has(e.name.trim().toLowerCase()))
      .map((e) => ({ entry: e, score: tieScore(e) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [affinityMap, university, everHeldNames]);

  // Resolve every visible affinity candidate's full record in the background (not
  // just on click) so their Movability Index badge can render without waiting for
  // an expand. resolveAffinityProfile's own cache means this is at most one fetch
  // per distinct home index represented in the list, not one per candidate.
  useEffect(() => {
    affinityCandidates.forEach(({ entry }) => { resolveAffinityProfile(entry); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affinityCandidates]);

  if (!idx) return null; // no mined patterns for this index yet -- nothing useful to show

  const totalCandidates = benchCandidates.length + affinityCandidates.length;

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

      {totalCandidates === 0 ? (
        <p className="px-4 sm:px-5 py-4 text-sm text-muted-foreground">No feeder-bench or cross-index connections on file for {university} yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {benchCandidates.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 sm:px-5 pt-3 pb-1">From the feeder bench</p>
              <div className="divide-y divide-border">
                {benchCandidates.map(({ dean, matched }) => {
                  const isOpen = expandedBenchId === dean.id;
                  return (
                    <div key={dean.id}>
                      <button
                        onClick={() => setExpandedBenchId(isOpen ? null : dean.id)}
                        className={["w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors", isOpen ? "bg-[#011F5B]/5" : "hover:bg-accent/40"].join(" ")}
                      >
                        <Avatar dean={dean} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{dean.dean}</p>
                          <p className="text-xs text-muted-foreground truncate">{dean.discipline || dean.priorTitle}</p>
                          {matched.length > 0 ? (
                            <p className="text-xs text-[#A31F34] mt-0.5">{traitSentence(matched[0])}</p>
                          ) : (
                            <p className="text-xs text-muted-foreground italic mt-0.5">No strong pattern match — included as a current bench member.</p>
                          )}
                        </div>
                        <MovabilityBadge dean={dean} />
                        <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-4 pt-1 bg-[#011F5B]/5 border-l-2 border-[#011F5B]">
                          <ExpandedProfile dean={dean} onClose={() => setExpandedBenchId(null)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {affinityCandidates.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide px-4 sm:px-5 pt-3 pb-1">Connected across our database</p>
              <div className="divide-y divide-border">
                {affinityCandidates.map(({ entry }) => {
                  const key = affKey(entry);
                  const isOpen = expandedAffKey === key;
                  const resolved = resolvedProfiles[key];
                  const { label, detail } = tieDescriptor(entry);
                  return (
                    <div key={key}>
                      <button
                        onClick={() => handleAffinityClick(entry)}
                        className={["w-full flex items-center gap-3 px-4 sm:px-5 py-2.5 text-left transition-colors", isOpen ? "bg-[#8C1D40]/5" : "hover:bg-accent/40"].join(" ")}
                      >
                        <AffAvatar entry={entry} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{entry.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{entry.role}{entry.university ? ` · ${entry.university}` : ""}</p>
                          <p className="text-xs text-[#8C1D40] mt-0.5 truncate">
                            <span className="font-semibold">{label}</span>{detail ? ` — ${detail}` : ""}
                          </p>
                        </div>
                        {resolved && resolved !== "not-found" && <MovabilityBadge dean={resolved} />}
                        <span className="text-muted-foreground text-lg leading-none w-5 text-center shrink-0">{isOpen ? "–" : "+"}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 sm:px-5 pb-4 pt-1 bg-[#8C1D40]/5 border-l-2 border-[#8C1D40]">
                          {!resolved ? (
                            <p className="text-xs text-muted-foreground py-3">Loading profile…</p>
                          ) : resolved === "not-found" ? (
                            <p className="text-xs text-muted-foreground py-3">No detailed profile on file for {entry.name} yet.</p>
                          ) : (
                            <ExpandedProfile dean={resolved} onClose={() => setExpandedAffKey(null)} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-border">
        <Methodology idx={idx} label={meta.label} />
      </div>
    </div>
  );
}
