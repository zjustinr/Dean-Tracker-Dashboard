import { useState } from "react";
import { useScoutCandidateEngine, pct, traitSentence } from "@/data/useScoutCandidates";
import type { ScoutIndexInsights, ScoutOriginCategory } from "@/data/enrichment";
import type { EmployerSchoolProfile } from "@/data/enrichment";
import ScoutCandidateList from "@/components/ScoutCandidateList";

const ORIGIN_CATEGORY_LABEL: Record<ScoutOriginCategory, string> = {
  "dean-same-type": "already a dean at another school like this one",
  "dean-other-type": "already a dean at a different kind of school",
  "assoc-vice-dean": "an associate or vice dean",
  "dept-chair": "a department chair",
  industry: "straight from industry",
  "faculty-only": "faculty with no administrative title on file",
};

export function Methodology({
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
          {idx.originLift && (
            <div>
              <p className="font-semibold">What they were doing right before</p>
              <p className="mt-1 text-muted-foreground">
                Among {idx.originLift.hireN.toLocaleString()} external hires here, {Object.entries(idx.originLift.categories)
                  .sort((a, b) => b[1].adjustedLift - a[1].adjustedLift)
                  .map(([cat, c]) => `being ${ORIGIN_CATEGORY_LABEL[cat as ScoutOriginCategory]} runs ×${c.adjustedLift} the base rate`)
                  .join("; ")}. That figure already discounts a category for a shorter-than-average tenure once
                hired (and credits one for a longer one) — see the "Insights" research brief on prior positions
                for the full picture. It's why the broader pool (every other sitting leader here) and the
                associate-dean / department-chair bench below get a small score adjustment on top of trait fit.
              </p>
              <p className="mt-1 text-muted-foreground">
                Validated leave-one-hire-out: the most-distinctive category predicted the held-out hire's actual
                prior position {pct(idx.originLift.validation.hitRate)} of the time, vs. {pct(idx.originLift.validation.baselineHitRate)} by
                chance (n={idx.originLift.validation.n}).
              </p>
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

const EMBEDDED_CAP = 10;

/**
 * Embedded in Slate Builder (IndividualSearch.tsx), directly below the results
 * list, as soon as the user narrows to a single school -- not a standalone tab.
 * A fixed top-10, no-filters, no-broader-pool view (the most stringent tier of
 * the full model); the standalone Scout Assistant module (ScoutAssistantPage.tsx)
 * exposes the adjustable stringency slider, roster filters, job-description
 * matching, and map over the same underlying engine (useScoutCandidateEngine).
 * Deliberately styled with the same plain-div/Tailwind card chrome as the
 * results section above it (bg-card border rounded-xl, muted header bar,
 * divide-y rows) rather than the shadcn Card primitives used elsewhere in the
 * app, so it reads as part of the same list rather than a bolted-on module.
 */
export default function ScoutAssistant({
  university, onOpenSchool,
}: {
  university: string;
  onOpenSchool?: (university: string, school: string) => void;
}) {
  const { idx, meta, datasetId, employerProfile, employerValidation, candidates, resolvedProfiles, resolveProfile, allDeans } =
    useScoutCandidateEngine({ university, cap: EMBEDDED_CAP, includeBroad: false });

  if (!idx) return null; // no mined patterns for this index yet -- nothing useful to show

  return (
    <div className="mt-4 bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-border bg-muted/30">
        <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span>Scout Assistant</span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300/60 dark:border-amber-700/60">
            AI - Experimental
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Candidates scored against patterns mined from our own {meta.label.toLowerCase()} appointment history — a
          fit to this school's historical pattern, not a recommendation. See Methodology below. For the full
          adjustable model (stringency slider, filters, job-description matching, map), open the Scout Assistant module.
        </p>
      </div>

      {idx.lowConfidence && (
        <p className="px-4 sm:px-5 pt-3 text-xs text-amber-700 dark:text-amber-500">
          {meta.label} has only {idx.sampleSize} recorded appointments — these patterns are preliminary.
        </p>
      )}

      <ScoutCandidateList
        candidates={candidates}
        resolvedProfiles={resolvedProfiles}
        resolveProfile={resolveProfile}
        allDeans={allDeans}
        onOpenSchool={onOpenSchool}
        emptyMessage={`No feeder-bench or cross-index connections on file for ${university} yet.`}
      />

      <div className="border-t border-border">
        <Methodology idx={idx} label={meta.label} employerProfile={employerProfile} validation={employerValidation} />
      </div>
    </div>
  );
}
