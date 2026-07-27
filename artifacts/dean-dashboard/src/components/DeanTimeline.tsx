import { useMemo, useState, useRef } from "react";
import type { Dean } from "@/data/types";
import { CHART_COLORS, ORIGIN_LABELS, NEXT_ROLE_LABELS, genderNorm, yearsLabel } from "@/data/types";
import { useDeanCareer } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import { Badge } from "@/components/ui/badge";
import { MiniPortrait, FullPortrait } from "./DeanPortrait";

interface Props {
  deans: Dean[];
  selectedIdx: number | null;
  onSelect?: (idx: number) => void;
}

function getBarColor(gender: string): string {
  if (genderNorm(gender) === "F") return CHART_COLORS[4];
  return CHART_COLORS[0];
}

function formatMoney(val: number | null): string {
  if (!val) return "–";
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  return `$${(val / 1e3).toFixed(0)}K`;
}

export default function DeanTimeline({ deans, selectedIdx, onSelect }: Props) {
  const { titleOf } = useDataset();
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
  const [clickedIdx, setClickedIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const clickedDean = clickedIdx !== null ? deans[clickedIdx] : null;
  const careerPositions = useDeanCareer(clickedDean?.dean ?? null);

  if (deans.length === 0) {
    return <p className="text-muted-foreground text-sm py-8 text-center">No data available for this school.</p>;
  }

  const hoveredDean = hoveredIdx !== null ? deans[hoveredIdx] : null;

  const handleBarClick = (idx: number) => {
    setClickedIdx(clickedIdx === idx ? null : idx);
    onSelect?.(idx);
  };

  return (
    <div className="space-y-0">
      <div className="relative" ref={containerRef}>
        {deans.map((dean, idx) => {
          const startY = dean.startYear || minYear;
          const endY = dean.endYear || 2026;
          const duration = endY - startY;
          const leftPct = ((startY - minYear) / yearSpan) * 100;
          const widthPct = (duration / yearSpan) * 100;
          const isSelected = clickedIdx === idx;
          const barColor = getBarColor(dean.gender);

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
              onClick={() => handleBarClick(idx)}
            >
              <div className="shrink-0 w-56 min-w-0 flex items-center gap-2">
                <MiniPortrait dean={dean} />
                <div className="min-w-0">
                  <p
                    className="text-sm font-semibold leading-tight truncate"
                    style={{ color: isSelected ? "hsl(var(--primary))" : undefined }}
                  >
                    {dean.dean}
                  </p>
                  {subtitle && (
                    <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1 relative h-10 min-w-0">
                {dean.isInterim ? (
                  <div
                    className="absolute top-0 h-full transition-all"
                    style={{
                      left: `${leftPct}%`,
                      width: `${Math.max(widthPct, 2)}%`,
                      filter: isSelected ? "drop-shadow(0 0 2px hsl(var(--foreground)))" : "none",
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
                    <svg
                      width="100%"
                      height="100%"
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      className="block"
                    >
                      <polygon
                        points="0,0 100,0 50,100"
                        fill={barColor}
                        opacity={isSelected ? 1 : 0.8}
                        stroke={isSelected ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={isSelected ? 3 : 0}
                      />
                    </svg>
                    <span
                      className="absolute inset-0 flex items-start justify-center text-[10px] text-white font-medium whitespace-nowrap pt-1"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {`${startY}–${endY === 2026 ? "Present" : endY}`}
                    </span>
                  </div>
                ) : (
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
                )}
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
              {genderNorm(hoveredDean.gender) === "F" && <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 font-medium">Female</span>}
              {hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded border border-border font-medium">Interim</span>}
              {hoveredDean.isInternal && !hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 font-medium">Internal</span>}
              {hoveredDean.isExternal && !hoveredDean.isInterim && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 font-medium">External</span>}
              {hoveredDean.isFirstTimeDean && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">First-Time Dean</span>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Tenure</span>
              <span>{yearsLabel(hoveredDean.startYear, hoveredDean.endYear)} ({hoveredDean.tenureLength ? `${hoveredDean.tenureLength} yrs` : "ongoing"})</span>
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
              <span className="text-muted-foreground">Post-{titleOf(hoveredDean)}</span>
              <span>{NEXT_ROLE_LABELS[hoveredDean.nextRole] || hoveredDean.nextRole || "–"}</span>
            </div>
            {hoveredDean.notes && (
              <p className="text-[10px] text-muted-foreground mt-2 pt-1 border-t border-border italic">{hoveredDean.notes}</p>
            )}
          </div>
        )}
      </div>

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
          <span className="text-foreground text-xs leading-none">▼</span> Interim
        </span>
      </div>

      {clickedDean && (
        <div className="mt-6 border-t border-border pt-5">
          <div className="bg-accent/30 rounded-xl p-5">
            <div className="flex gap-5 items-start">
            <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">{clickedDean.dean}</h3>
                <p className="text-sm text-muted-foreground">
                  {yearsLabel(clickedDean.startYear, clickedDean.endYear)}
                  {clickedDean.tenureLength ? ` · ${clickedDean.tenureLength} years` : ""}
                </p>
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap mb-4">
              {genderNorm(clickedDean.gender) === "F" && <Badge className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200 border-0">Female</Badge>}
              {genderNorm(clickedDean.gender) === "M" && <Badge variant="secondary">Male</Badge>}
              {clickedDean.isInterim && <Badge variant="outline">Interim</Badge>}
              {clickedDean.isInternal && !clickedDean.isInterim && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">Internal</Badge>}
              {clickedDean.isExternal && !clickedDean.isInterim && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">External</Badge>}
              {clickedDean.isFirstTimeDean && <Badge variant="secondary">First-Time Dean</Badge>}
              {clickedDean.hasPriorDeanExp && <Badge variant="secondary">Prior Dean Experience</Badge>}
              {clickedDean.hasPhd && <Badge variant="secondary">PhD</Badge>}
              {clickedDean.hasIndustryExp && <Badge variant="secondary">Industry Experience</Badge>}
              {clickedDean.hasConsultingBg && <Badge variant="secondary">Consulting Background</Badge>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
                <span className="text-muted-foreground font-medium">Origin</span>
                <span>{ORIGIN_LABELS[clickedDean.origin] || clickedDean.origin}</span>
                <span className="text-muted-foreground font-medium">Background</span>
                <span>{clickedDean.careerBackground || "–"}</span>
                <span className="text-muted-foreground font-medium">Discipline</span>
                <span>{clickedDean.disciplineBroad || clickedDean.discipline || "–"}</span>
                <span className="text-muted-foreground font-medium">PhD Field</span>
                <span>{clickedDean.phdField || "–"}</span>
                <span className="text-muted-foreground font-medium">Prior Position</span>
                <span>{clickedDean.priorTitle || "–"}</span>
                <span className="text-muted-foreground font-medium">Prior Institution</span>
                <span>{clickedDean.priorInstitution || "–"}</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-y-1.5">
                <span className="text-muted-foreground font-medium">Post-{titleOf(clickedDean)} Role</span>
                <span>{NEXT_ROLE_LABELS[clickedDean.nextRole] || clickedDean.nextRole || "–"}</span>
                <span className="text-muted-foreground font-medium">Involuntary Exit</span>
                <span>{clickedDean.involuntary ? "Yes" : "No"}</span>
                <span className="text-muted-foreground font-medium">Had Prior Link</span>
                <span>{clickedDean.hadPriorConnection ? "Yes" : "No"}</span>
              </div>
            </div>

            {(clickedDean.priorAssocOrAsstDean || clickedDean.hadDeptChairRole || clickedDean.priorTitle) && (
              <div className="mt-4 pt-3 border-t border-border">
                <h4 className="text-sm font-bold mb-3">Prior Leadership History</h4>
                {(() => {
                  const steps: { label: string; detail: string; year: string; isCurrent: boolean }[] = [];
                  const earliest = careerPositions.length > 0 ? careerPositions[0] : clickedDean;

                  if (clickedDean.hadAssocDeanRole || clickedDean.priorAssocOrAsstDean) {
                    const assocInst = earliest.priorTitle?.toLowerCase().includes("associate") || earliest.priorTitle?.toLowerCase().includes("assistant")
                      ? earliest.priorInstitution || ""
                      : "";
                    const assocTitle = earliest.priorTitle?.toLowerCase().includes("associate") || earliest.priorTitle?.toLowerCase().includes("assistant")
                      ? earliest.priorTitle
                      : "Associate / Assistant Dean";
                    steps.push({ label: assocTitle, detail: assocInst, year: "", isCurrent: false });
                  }

                  if (clickedDean.hadDeptChairRole) {
                    const chairInst = earliest.priorTitle?.toLowerCase().includes("chair")
                      ? earliest.priorInstitution || ""
                      : "";
                    const chairTitle = earliest.priorTitle?.toLowerCase().includes("chair")
                      ? earliest.priorTitle
                      : "Department Chair";
                    steps.push({ label: chairTitle, detail: chairInst, year: "", isCurrent: false });
                  }

                  if (careerPositions.length > 1) {
                    const currentIdx = careerPositions.findIndex(p => p.id === clickedDean.id);
                    careerPositions.forEach((pos, i) => {
                      if (i === currentIdx) return;
                      steps.push({
                        label: `${titleOf(pos)}, ${pos.school}`,
                        detail: pos.university,
                        year: `${pos.startYear || "?"} – ${pos.endYear || "?"}`,
                        isCurrent: false,
                      });
                    });
                  } else if (!clickedDean.hadAssocDeanRole && !clickedDean.priorAssocOrAsstDean && !clickedDean.hadDeptChairRole && clickedDean.priorTitle) {
                    steps.push({
                      label: clickedDean.priorTitle,
                      detail: clickedDean.priorInstitution || "",
                      year: "",
                      isCurrent: false,
                    });
                  }

                  steps.push({
                    label: `${titleOf(clickedDean)}, ${clickedDean.school}`,
                    detail: clickedDean.university,
                    year: `${clickedDean.startYear || "?"} – ${clickedDean.endYear || "Present"}`,
                    isCurrent: true,
                  });

                  return (
                    <div className="relative ml-1">
                      {steps.map((step, i) => {
                        const isLast = i === steps.length - 1;
                        return (
                          <div key={i} className="flex items-start gap-3 relative">
                            <div className="flex flex-col items-center shrink-0" style={{ width: 28 }}>
                              <div
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold z-10 border-2"
                                style={{
                                  background: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                                  color: "white",
                                  borderColor: step.isCurrent ? "hsl(var(--primary))" : "hsl(var(--border))",
                                }}
                              >
                                {i + 1}
                              </div>
                              {!isLast && (
                                <svg width="2" height="32" className="my-0.5">
                                  <line x1="1" y1="0" x2="1" y2="24" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" strokeDasharray="3 2" />
                                  <polygon points="0,24 2,24 1,30" fill="hsl(var(--muted-foreground))" />
                                </svg>
                              )}
                            </div>
                            <div className="pb-2 min-h-[44px]">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className={`text-sm font-semibold ${step.isCurrent ? "text-primary" : ""}`}>{step.label}</span>
                                {step.year && (
                                  <span className="text-sm font-bold bg-primary/10 text-primary px-2 py-0.5 rounded">{step.year}</span>
                                )}
                              </div>
                              {step.detail && (
                                <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {clickedDean.notes && (
              <p className="text-xs text-muted-foreground mt-3 pt-2 border-t border-border italic">{clickedDean.notes}</p>
            )}
            </div>

            <div className="flex flex-col items-end gap-2 shrink-0">
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setClickedIdx(null)}
              >
                ✕ Close
              </button>
              <div className="max-sm:hidden">
                <FullPortrait
                  dean={clickedDean}
                  onSchoolHistory={() => containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                />
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
