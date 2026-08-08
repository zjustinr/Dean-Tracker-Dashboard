import { useState, useEffect, useMemo } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useAllDeans } from "@/data/useData";
import {
  useScoutInsights, loadAffinity, getAffinityCache,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry,
} from "@/data/enrichment";
import type { Dean } from "@/data/types";
import { BOOLEAN_LABELS, CATEGORICAL_LABELS } from "@/data/types";

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

type TieKey = "admin" | "faculty" | "grad" | "undergrad";
const AFF_LABELS: [TieKey, string][] = [
  ["admin", "Administration"], ["faculty", "Faculty"], ["grad", "Graduate Degree"], ["undergrad", "Undergraduate"],
];
// Admin/faculty ties mean they actually worked there; alumni ties are a weaker
// signal. Simple weighted count, not a calibrated model -- just an ordering.
function tieScore(e: AffEntry): number {
  return e.admin.length * 2 + e.faculty.length * 1.5 + e.grad.length + e.undergrad.length;
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
 */
export default function ScoutAssistant({ university, onOpenLeader }: { university: string; onOpenLeader?: (index: string | null, fullName: string) => void }) {
  const { datasetId, meta } = useDataset();
  const allDeans = useAllDeans();
  const allInsights = useScoutInsights();
  const idx = allInsights[datasetId];

  const [affinityMap, setAffinityMap] = useState<AffMap | null>(getAffinityCache());
  useEffect(() => {
    if (affinityMap) return;
    let alive = true;
    loadAffinity().then((m) => { if (alive) setAffinityMap(m); });
    return () => { alive = false; };
  }, [affinityMap]);

  const schoolDeans = useMemo(() => allDeans.filter((d) => d.university === university), [allDeans, university]);
  const sittingKeys = useMemo(() => new Set(
    schoolDeans.filter((d) => d.endYear == null && d.roleType !== "subdean").map((d) => `${d.dean.trim().toLowerCase()}|${d.university.trim().toLowerCase()}`)
  ), [schoolDeans]);

  const benchCandidates = useMemo(() => {
    if (!idx || !idx.hasFeederBench) return [];
    return schoolDeans
      .filter((d) => d.roleType === "subdean" && !sittingKeys.has(`${d.dean.trim().toLowerCase()}|${d.university.trim().toLowerCase()}`))
      .map((d) => ({ dean: d, ...scoreBench(d, idx.traits) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [schoolDeans, sittingKeys, idx]);

  const affinityCandidates = useMemo(() => {
    const list = affinityMap?.[university] || [];
    return list
      .filter((e) => !sittingKeys.has(e.enrichKey))
      .map((e) => ({ entry: e, score: tieScore(e) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [affinityMap, university, sittingKeys]);

  if (!idx) return null; // no mined patterns for this index yet -- nothing useful to show

  const totalCandidates = benchCandidates.length + affinityCandidates.length;

  return (
    <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Scout Assistant — {university}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Candidates scored against patterns mined from our own {meta.label.toLowerCase()} appointment history — a
            fit to this school's historical pattern, not a recommendation. See Methodology below.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
          Experimental
        </span>
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
            <div className="px-4 sm:px-5 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">From the feeder bench</p>
              <div className="space-y-2">
                {benchCandidates.map(({ dean, matched }) => (
                  <button
                    key={dean.id}
                    onClick={() => onOpenLeader?.(datasetId, dean.dean)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2 hover:border-[#A31F34]/50 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-sm font-semibold">{dean.dean}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{dean.discipline || dean.priorTitle}</span>
                    </div>
                    {matched.length > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">{traitSentence(matched[0])}</p>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground italic">No strong pattern match — included as a current bench member.</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {affinityCandidates.length > 0 && (
            <div className="px-4 sm:px-5 py-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Connected across our database</p>
              <div className="space-y-2">
                {affinityCandidates.map(({ entry }) => (
                  <button
                    key={entry.enrichKey}
                    onClick={() => onOpenLeader?.(entry.index, entry.name)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2 hover:border-[#A31F34]/50 hover:bg-accent/40 transition-colors"
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="text-sm font-semibold">{entry.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{entry.role}{entry.university ? ` · ${entry.university}` : ""}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {AFF_LABELS.filter(([k]) => entry[k].length).map(([k, label]) => `${label}: ${entry[k][0]}`).join(" · ")}
                    </p>
                  </button>
                ))}
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
