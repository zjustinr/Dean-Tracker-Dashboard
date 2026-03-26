import { useMemo, useState, useRef } from "react";
import type { Dean } from "@/data/types";
import { CHART_COLORS, ORIGIN_LABELS, NEXT_ROLE_LABELS } from "@/data/types";

interface Props {
  deans: Dean[];
  selectedIdx: number | null;
  onSelect?: (idx: number) => void;
}

function getBarColor(gender: string, isInterim: boolean): string {
  if (isInterim) return "hsl(var(--muted-foreground))";
  if (gender === "F") return CHART_COLORS[4];
  return CHART_COLORS[0];
}

export default function DeanTimeline({ deans, selectedIdx, onSelect }: Props) {
  const { minYear, maxYear, yearSpan } = useMemo(() => {
    const starts = deans.map((d) => d.startYear).filter(Boolean) as number[];
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

  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  if (deans.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No data available for this school.</p>;
  }

  const hoveredDean = hoveredIdx !== null ? deans[hoveredIdx] : null;

  return (
    <div className="space-y-0 relative" ref={containerRef}>
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
          dean.priorInstitution || "",
          dean.disciplineBroad || dean.discipline || "",
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={dean.id}
            className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer transition-all hover:bg-accent/40"
            onClick={() => onSelect?.(idx)}
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
                  outline: isSelected ? "3px solid hsl(var(--foreground))" : "none",
                  outlineOffset: 2,
                  boxShadow: isSelected ? "0 0 0 1px hsl(var(--background))" : "none",
                }}
                onMouseEnter={(e) => {
                  setHoveredIdx(idx);
                  if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseMove={(e) => {
                  if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }
                }}
                onMouseLeave={() => setHoveredIdx(null)}
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

      {hoveredDean && (
        <div
          className="absolute z-50 pointer-events-none bg-card border border-border rounded-xl shadow-xl px-4 py-3 text-sm max-w-sm"
          style={{
            left: Math.min(tooltipPos.x + 16, (containerRef.current?.offsetWidth || 800) - 340),
            top: tooltipPos.y - 120,
          }}
        >
          <p className="font-bold text-base">{hoveredDean.dean}</p>
          <div className="flex gap-1.5 flex-wrap mt-1 mb-2">
            {hoveredDean.gender === "F" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 font-medium">Female</span>}
            {hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border font-medium">Interim</span>}
            {hoveredDean.isInternal && !hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium">Internal</span>}
            {hoveredDean.isExternal && !hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 font-medium">External</span>}
            {hoveredDean.isFirstTimeDean && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">First-Time Dean</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span className="text-muted-foreground">Tenure</span>
            <span>{hoveredDean.startYear || "?"} – {hoveredDean.endYear || "Present"} ({hoveredDean.tenureLength ? `${hoveredDean.tenureLength} yrs` : "ongoing"})</span>
            <span className="text-muted-foreground">Origin</span>
            <span>{ORIGIN_LABELS[hoveredDean.origin] || hoveredDean.origin}</span>
            <span className="text-muted-foreground">Discipline</span>
            <span>{hoveredDean.disciplineBroad || hoveredDean.discipline || "–"}</span>
            <span className="text-muted-foreground">Prior Position</span>
            <span>{hoveredDean.priorTitle || "–"}</span>
            <span className="text-muted-foreground">Prior Institution</span>
            <span>{hoveredDean.priorInstitution || "–"}</span>
            <span className="text-muted-foreground">Background</span>
            <span>{hoveredDean.careerBackground || "–"}</span>
            <span className="text-muted-foreground">PhD</span>
            <span>{hoveredDean.hasPhd ? "Yes" : "No"}</span>
            <span className="text-muted-foreground">Post-Dean</span>
            <span>{NEXT_ROLE_LABELS[hoveredDean.nextRole] || hoveredDean.nextRole || "–"}</span>
          </div>
          {(hoveredDean.avgAnnualGifts || hoveredDean.avgEndowment) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2 pt-2 border-t border-border">
              {hoveredDean.avgAnnualGifts && <><span className="text-muted-foreground">Avg Gifts/yr</span><span>${(hoveredDean.avgAnnualGifts / 1e6).toFixed(1)}M</span></>}
              {hoveredDean.avgEndowment && <><span className="text-muted-foreground">Avg Endowment</span><span>${(hoveredDean.avgEndowment / 1e9).toFixed(2)}B</span></>}
            </div>
          )}
          {hoveredDean.notes && (
            <p className="text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border italic">{hoveredDean.notes}</p>
          )}
        </div>
      )}

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
