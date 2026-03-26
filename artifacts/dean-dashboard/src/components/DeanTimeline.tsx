import { useMemo } from "react";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";

interface Props {
  deans: Dean[];
  selectedIdx: number | null;
  onSelect: (idx: number) => void;
}

function getBarColor(gender: string, isInterim: boolean): string {
  if (isInterim) return "hsl(var(--muted-foreground))";
  if (gender === "F") return CHART_COLORS[4];
  return CHART_COLORS[0];
}


export default function DeanTimeline({ deans, selectedIdx, onSelect }: Props) {
  const { minYear, maxYear, yearSpan } = useMemo(() => {
    const starts = deans.map((d) => d.startYear).filter(Boolean) as number[];
    const ends = deans.map((d) => d.endYear || 2026);
    const min = starts.length ? Math.min(...starts) - 1 : 1990;
    const max = 2026;
    return { minYear: min, maxYear: max, yearSpan: max - min };
  }, [deans]);

  const yearTicks = useMemo(() => {
    const ticks: number[] = [];
    const start = Math.ceil(minYear / 5) * 5;
    for (let y = start; y <= maxYear; y += 5) ticks.push(y);
    if (ticks[ticks.length - 1] !== maxYear) ticks.push(maxYear);
    return ticks;
  }, [minYear, maxYear]);

  if (deans.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No data available for this school.</p>;
  }

  return (
    <div className="space-y-0">
      {deans.map((dean, idx) => {
        const startY = dean.startYear || minYear;
        const endY = dean.endYear || 2026;
        const duration = endY - startY;
        const leftPct = ((startY - minYear) / yearSpan) * 100;
        const widthPct = (duration / yearSpan) * 100;
        const isSelected = selectedIdx === idx;
        const barColor = getBarColor(dean.gender, dean.isInterim);

        const subtitle = [
          dean.priorTitle || "",
          dean.disciplineBroad || dean.discipline || "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={dean.id}
            className={`flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer transition-all hover:bg-accent/40 ${isSelected ? "bg-accent/60 ring-2 ring-primary/40" : ""}`}
            onClick={() => onSelect(idx)}
          >
            <div className="shrink-0 w-56 min-w-0">
              <p
                className="text-sm font-semibold leading-tight truncate"
                style={{ color: isSelected ? "hsl(var(--primary))" : undefined }}
              >
                {dean.dean}
              </p>
              {subtitle && (
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>

            <div className="flex-1 relative h-8 min-w-0">
              <div
                className="absolute top-0 h-full rounded-md transition-all flex items-center overflow-hidden"
                style={{
                  left: `${leftPct}%`,
                  width: `${Math.max(widthPct, 2)}%`,
                  background: barColor,
                  opacity: isSelected ? 1 : 0.8,
                  outline: isSelected ? "2px solid hsl(var(--foreground))" : "none",
                  outlineOffset: 1,
                }}
              >
                <span
                  className="text-[10px] text-white font-medium px-2 whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}
                >
                  {`${startY}–${endY === 2026 ? "Present" : endY}`}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="relative h-5 ml-[236px] mt-1">
        {yearTicks.map((y) => {
          const pct = ((y - minYear) / yearSpan) * 100;
          return (
            <span
              key={y}
              className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {y}
            </span>
          );
        })}
      </div>

      <div className="flex gap-5 mt-3 text-xs text-muted-foreground justify-center pt-1">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: CHART_COLORS[0] }} /> Male
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded" style={{ background: CHART_COLORS[4] }} /> Female
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded bg-muted-foreground" /> Interim
        </span>
      </div>
    </div>
  );
}
