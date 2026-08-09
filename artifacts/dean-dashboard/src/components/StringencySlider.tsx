import { Slider } from "@/components/ui/slider";

export interface StringencyLevel { cap: number; includeBroad: boolean; label: string; desc: string }

// Five tiers from the tightest cut of the combined model down to literally
// every eligible candidate. Two things change together as stringency loosens,
// not just the count:
//   - the CAP (how deep into the ranked list you look), and
//   - whether the BROADER pool (every other currently-sitting leader in this
//     index, scored on trait fit alone -- no tie to this specific school) is
//     even in the running.
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
  { cap: 10, includeBroad: false, label: "Best fit only", desc: "Top 10 from our combined model — feeder bench, direct connections, and shared-background weak links only, the tightest and highest-confidence cut." },
  { cap: 25, includeBroad: false, label: "Strong fit", desc: "Top 25, same sources as Best fit only." },
  { cap: 75, includeBroad: true, label: "Broad shortlist", desc: "Top 75 — starts blending in other currently-sitting leaders with no direct tie to this school, ranked on trait fit alone." },
  { cap: 200, includeBroad: true, label: "Wide net", desc: "Top 200 across every source." },
  { cap: Infinity, includeBroad: true, label: "All eligible", desc: "Every eligible candidate in this index, ranked — the largest pool, for a headhunter to work from." },
];

export default function StringencySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const level = STRINGENCY_LEVELS[value - 1];
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-medium text-muted-foreground">Stringency</span>
        <span className="text-xs font-semibold text-[#011F5B]">{level.label}</span>
      </div>
      <Slider
        min={1} max={5} step={1} value={[value]}
        onValueChange={([v]) => onChange(v)}
        aria-label="Selection stringency"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
        <span>Combined model</span>
        <span>Largest eligible pool</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">{level.desc}</p>
    </div>
  );
}
