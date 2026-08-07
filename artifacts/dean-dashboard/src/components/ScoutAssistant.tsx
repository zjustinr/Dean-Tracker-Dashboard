import { useState, useEffect, useMemo } from "react";
import { useDataset } from "@/data/DatasetContext";
import { useSchoolList, useAllDeans, parseSchoolKey } from "@/data/useData";
import {
  useScoutInsights, loadAffinity, getAffinityCache,
  type ScoutIndexInsights, type ScoutTrait, type AffMap, type AffEntry,
} from "@/data/enrichment";
import type { Dean } from "@/data/types";
import { BOOLEAN_LABELS, CATEGORICAL_LABELS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

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

function AucNote({ auc }: { auc: number }) {
  const read = auc >= 0.85 ? "strong" : auc >= 0.7 ? "moderate" : "weak";
  return (
    <p className="text-xs text-muted-foreground">
      Backtested by holding out a fifth of the record at a time: these traits separated actual hires from the
      never-promoted feeder bench with an AUC of <strong>{auc.toFixed(2)}</strong> ({read} — 0.50 is no better than a
      coin flip, 1.00 is perfect separation).
    </p>
  );
}

function Methodology({ idx, label }: { idx: ScoutIndexInsights; label: string }) {
  const [open, setOpen] = useState(false);
  const promo = idx.traits.filter((t) => t.kind === "promotion");
  const trend = idx.traits.filter((t) => t.kind === "trend");
  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <button className="text-left" onClick={() => setOpen((o) => !o)}>
          <CardTitle className="text-sm flex items-center gap-2">
            <span>{open ? "▾" : "▸"}</span> Methodology — {label}
          </CardTitle>
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Mined from {idx.sampleSize.toLocaleString()} recorded appointments{idx.hasFeederBench ? ` and ${idx.benchSize.toLocaleString()} feeder-bench roles (associate deans / dept. chairs)` : ""}.
            {idx.lowConfidence && " This index is small — treat every stat below as a lead, not a settled finding."}
          </p>
          {idx.backtest && <AucNote auc={idx.backtest.auc} />}
          {idx.connectionPatterns.external && (
            <div>
              <p className="font-semibold">Connection patterns (external hires)</p>
              <ul className="mt-1 space-y-1 text-muted-foreground">
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
              <ul className="mt-1 space-y-1 text-muted-foreground list-disc pl-4">
                {promo.slice(0, 6).map((t, i) => <li key={i}>{traitSentence(t)}</li>)}
              </ul>
            </div>
          )}
          {trend.length > 0 && (
            <div>
              <p className="font-semibold">How recent hires differ from the historical record</p>
              <ul className="mt-1 space-y-1 text-muted-foreground list-disc pl-4">
                {trend.slice(0, 6).map((t, i) => <li key={i}>{traitSentence(t)}</li>)}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground italic">
            These are historical associations mined from our own dataset, not causal findings and not a hiring
            recommendation — small indices and data-collection gaps can both produce misleading lift numbers.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export default function ScoutAssistant({ onOpenLeader }: { onOpenLeader?: (index: string | null, fullName: string) => void }) {
  const { datasetId, meta, noun } = useDataset();
  const schools = useSchoolList();
  const allDeans = useAllDeans();
  const allInsights = useScoutInsights();
  const idx = allInsights[datasetId];

  const [selectedKey, setSelectedKey] = useState(schools[0]?.key || "");
  useEffect(() => {
    if (schools.length && !schools.find((s) => s.key === selectedKey)) setSelectedKey(schools[0].key);
  }, [schools, selectedKey]);

  const [affinityMap, setAffinityMap] = useState<AffMap | null>(getAffinityCache());
  useEffect(() => {
    if (affinityMap) return;
    let alive = true;
    loadAffinity().then((m) => { if (alive) setAffinityMap(m); });
    return () => { alive = false; };
  }, [affinityMap]);

  const { university, school } = parseSchoolKey(selectedKey);
  const selectedInfo = useMemo(() => schools.find((s) => s.key === selectedKey), [schools, selectedKey]);

  const schoolDeans = useMemo(() => allDeans.filter((d) => d.university === university && d.school === school), [allDeans, university, school]);
  const sittingKeys = useMemo(() => new Set(
    schoolDeans.filter((d) => d.endYear == null && d.roleType !== "subdean").map((d) => `${d.dean.trim().toLowerCase()}|${d.university.trim().toLowerCase()}`)
  ), [schoolDeans]);

  const benchCandidates = useMemo(() => {
    if (!idx || !idx.hasFeederBench) return [];
    return schoolDeans
      .filter((d) => d.roleType === "subdean" && !sittingKeys.has(`${d.dean.trim().toLowerCase()}|${d.university.trim().toLowerCase()}`))
      .map((d) => ({ dean: d, ...scoreBench(d, idx.traits) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [schoolDeans, sittingKeys, idx]);

  const affinityCandidates = useMemo(() => {
    const list = affinityMap?.[university] || [];
    return list
      .filter((e) => !sittingKeys.has(e.enrichKey))
      .map((e) => ({ entry: e, score: tieScore(e) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [affinityMap, university, sittingKeys]);

  return (
    <div className="max-w-[1000px] mx-auto space-y-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#A31F34]">Scout Assistant</div>
        <h2 className="text-2xl font-bold text-foreground mt-1 leading-tight">Who fits this school's pattern?</h2>
        <p className="text-muted-foreground mt-1.5 leading-relaxed text-sm">
          Pick a school. Every candidate below is scored against patterns mined from our own record of past
          appointments in this index — framed as a fit to the school's <em>historical</em> pattern, not a
          recommendation to hire. Read the Methodology panel before trusting any single number.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="w-full sm:w-[420px]">
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
            {meta.schoolType === "university" ? "Select a University" : "Select a School"}
          </label>
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a school..." />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {schools.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.rank ? `#${s.rank} ` : ""}{s.university} – {s.school}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {selectedInfo && (
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">{selectedInfo.university}</Badge>
            {selectedInfo.rank && <Badge variant="outline">Rank #{selectedInfo.rank}</Badge>}
            {selectedInfo.tier && <Badge variant="outline">{selectedInfo.tier}</Badge>}
          </div>
        )}
      </div>

      {!idx && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          No mined patterns available yet for {meta.label} — either the data hasn't loaded, or this index doesn't
          have enough recorded appointments to mine reliably.
        </CardContent></Card>
      )}

      {idx?.lowConfidence && (
        <p className="text-xs text-amber-700 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          {meta.label} has only {idx.sampleSize} recorded appointments — the patterns behind these scores are preliminary.
        </p>
      )}

      {idx && idx.hasFeederBench && (
        <Card>
          <CardHeader><CardTitle className="text-lg">From the feeder bench at {university}</CardTitle></CardHeader>
          <CardContent>
            {benchCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No associate/vice-{noun.toLowerCase()} or department-chair roles on file for this school.</p>
            ) : (
              <div className="space-y-3">
                {benchCandidates.map(({ dean, matched }) => (
                  <button
                    key={dean.id}
                    onClick={() => onOpenLeader?.(datasetId, dean.dean)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:border-[#A31F34]/50 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-semibold">{dean.dean}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{dean.discipline || dean.priorTitle}</span>
                    </div>
                    {matched.length > 0 ? (
                      <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                        {matched.slice(0, 3).map((t, i) => <li key={i}>• {traitSentence(t)}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-muted-foreground italic">No strong pattern match — included as a current bench member.</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {idx && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Connected to {university} across our database</CardTitle></CardHeader>
          <CardContent>
            {!affinityMap ? (
              <p className="text-sm text-muted-foreground">Loading affinity data…</p>
            ) : affinityCandidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leaders elsewhere in the database have a recorded alumni, faculty, or administrative tie to {university}.</p>
            ) : (
              <div className="space-y-3">
                {affinityCandidates.map(({ entry }) => (
                  <button
                    key={entry.enrichKey}
                    onClick={() => onOpenLeader?.(entry.index, entry.name)}
                    className="w-full text-left rounded-lg border border-border p-3 hover:border-[#A31F34]/50 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex justify-between items-baseline gap-2">
                      <span className="font-semibold">{entry.name}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{entry.role}{entry.university ? ` · ${entry.university}` : ""}</span>
                    </div>
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                      {AFF_LABELS.filter(([k]) => entry[k].length).map(([k, label]) => (
                        <li key={label}>• {label}: {entry[k][0]}{entry[k].length > 1 ? ` (+${entry[k].length - 1} more)` : ""}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {idx && <Methodology idx={idx} label={meta.label} />}
    </div>
  );
}
