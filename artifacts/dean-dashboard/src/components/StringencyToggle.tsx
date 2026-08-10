export interface StringencyLevel { cap: number; includeBroad: boolean; short: string; label: string; desc: string }

// Five tiers from the tightest cut of the combined model down to literally
// every eligible candidate. Two things change together as stringency loosens,
// not just the count:
//   - the CAP (how deep into the ranked list you look), and
//   - whether the BROADER pool (every other currently-sitting leader in this
//     index -- no tie to this specific school, scored on trait fit plus a
//     same-type-dean-elsewhere origin-fit bonus, see originFitScore) is even
//     in the running.
// The broad source has to stay OUT at the tightest settings: it's scored the
// same way bench/connected/weak-link candidates are, so on an index without a
// validated tie-type weighting (most of them -- see gen-scout-insights.mjs),
// a person with a real documented connection to the school but no lift bonus
// for it can legitimately score BELOW a stranger who happens to share one
// generic trend trait. Left unguarded, "Best fit only" would show total
// strangers instead of the well-connected candidates it's supposed to mean.
// This is deliberately NOT a score-threshold dial: a hard score cutoff would
// hide a school with generally weaker signal entirely at tight settings,
// where a count-based cap always surfaces its best available candidates,
// just fewer of them.
export const STRINGENCY_LEVELS: StringencyLevel[] = [
  { cap: 10, includeBroad: false, short: "Best fit", label: "Best fit only", desc: "Top 10 from our combined model — feeder bench, direct connections, and shared-background weak links only, the tightest and highest-confidence cut." },
  { cap: 25, includeBroad: false, short: "Strong fit", label: "Strong fit", desc: "Top 25, same sources as Best fit only — just a deeper cut of the same ranked list." },
  { cap: 75, includeBroad: true, short: "Broad", label: "Broad shortlist", desc: "Top 75 — starts blending in other currently-sitting leaders with no direct tie to this school, ranked on trait fit plus how their current position historically fares here." },
  { cap: 200, includeBroad: true, short: "Wide net", label: "Wide net", desc: "Top 200 across every source." },
  { cap: Infinity, includeBroad: true, short: "All eligible", label: "All eligible", desc: "Every eligible candidate in this index, ranked — the largest pool, for a headhunter to work from." },
];

// A segmented toggle, not a drag slider: consistent with every other control
// on this page (Include, Tenure type, Region), and click targets are far more
// reliable than a 5-position drag thumb. The explanatory line below always
// shows the SELECTED level's meaning, so "what does this setting do" never
// requires a hover or a separate legend.
export default function StringencyToggle({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const level = STRINGENCY_LEVELS[value - 1];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Stringency</span>
        <div className="inline-flex rounded-lg border border-muted-foreground/30 overflow-hidden text-xs font-semibold" role="group" aria-label="Selection stringency">
          {STRINGENCY_LEVELS.map((lvl, i) => (
            <button
              key={lvl.short}
              type="button"
              onClick={() => onChange(i + 1)}
              aria-pressed={value === i + 1}
              title={lvl.desc}
              className={[
                "px-2.5 py-1.5 transition-colors",
                i > 0 ? "border-l border-muted-foreground/30" : "",
                value === i + 1 ? "bg-[#011F5B] text-white" : "bg-background hover:bg-muted",
              ].join(" ")}
            >
              {lvl.short}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{level.desc}</p>
    </div>
  );
}
