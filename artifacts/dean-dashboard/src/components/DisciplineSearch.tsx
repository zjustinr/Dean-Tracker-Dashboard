import { useMemo, useState, useEffect, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useAllDeans, useSchoolsInfo, makeSchoolKey } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import DeanProfile from "./DeanProfile";
import { spreadOverlappingMarkers } from "./USMap";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Customized,
} from "recharts";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const MAX_YEAR = 2026;
const OTHER_COLOR = "#94a3b8";
const UNKNOWN_COLOR = "#cbd5e1";
const NO_DEAN_COLOR = "hsl(0, 0%, 78%)";
const MAX_LEGEND_DISCIPLINES = 9;

function lastName(fullName: string): string {
  const suffixes = new Set(["Jr.", "Jr", "Sr.", "Sr", "II", "III", "IV"]);
  const parts = fullName.trim().split(/\s+/).filter((p) => !suffixes.has(p));
  return parts[parts.length - 1] || fullName;
}

function sittingDean(deans: Dean[], year: number): Dean | null {
  let best: Dean | null = null;
  for (const d of deans) {
    if (d.startYear == null || d.startYear > year) continue;
    const end = d.endYear ?? MAX_YEAR;
    if (year > end) continue;
    if (!best || d.startYear > (best.startYear ?? -Infinity)) best = d;
  }
  return best;
}

export default function DisciplineSearch() {
  const allDeans = useAllDeans();
  const schools = useSchoolsInfo();
  const { meta } = useDataset();

  const minYear = useMemo(() => {
    let min = MAX_YEAR;
    for (const d of allDeans) {
      if (d.startYear != null && d.startYear < min) min = d.startYear;
    }
    return Math.max(1950, min);
  }, [allDeans]);

  const [year, setYear] = useState(MAX_YEAR);
  const [playing, setPlaying] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [chartStart, setChartStart] = useState(1996);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedDean, setSelectedDean] = useState<Dean | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [-96, 38],
    zoom: 1,
  });

  // Reset the clock when the dataset switches (minYear can differ)
  useEffect(() => {
    setYear(MAX_YEAR);
    setPlaying(false);
    setSelectedDean(null);
  }, [meta.id]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setYear((y) => {
        if (y >= MAX_YEAR) {
          setPlaying(false);
          return y;
        }
        return y + 1;
      });
    }, 350);
    return () => clearInterval(t);
  }, [playing]);

  const handlePlay = useCallback(() => {
    setPlaying((p) => {
      if (!p && year >= MAX_YEAR) setYear(minYear);
      return !p;
    });
  }, [year, minYear]);

  const deansBySchool = useMemo(() => {
    const map = new Map<string, Dean[]>();
    for (const d of allDeans) {
      const key = makeSchoolKey(d.university, d.school);
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return map;
  }, [allDeans]);

  // Top disciplines by overall frequency get a stable color; the rest fold into "Other"
  const disciplineColors = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of allDeans) {
      const disc = d.disciplineBroad || "Unknown";
      counts[disc] = (counts[disc] || 0) + 1;
    }
    const ranked = Object.entries(counts)
      .filter(([name]) => name !== "Unknown")
      .sort(([, a], [, b]) => b - a)
      .map(([name]) => name);
    const colors = new Map<string, string>();
    ranked.slice(0, MAX_LEGEND_DISCIPLINES).forEach((name, i) => colors.set(name, CHART_COLORS[i % CHART_COLORS.length]));
    return colors;
  }, [allDeans]);

  const groupOf = useCallback(
    (disc: string) => {
      if (!disc || disc === "Unknown") return "Unknown";
      return disciplineColors.has(disc) ? disc : "Other";
    },
    [disciplineColors]
  );

  const colorOf = useCallback(
    (group: string) => disciplineColors.get(group) ?? (group === "Unknown" ? UNKNOWN_COLOR : OTHER_COLOR),
    [disciplineColors]
  );

  const markers = useMemo(() => {
    const raw = schools
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => {
        const key = makeSchoolKey(s.university, s.school);
        const dean = sittingDean(deansBySchool.get(key) || [], year);
        const group = dean ? groupOf(dean.disciplineBroad) : null;
        return {
          ...s,
          lat: s.lat as number,
          lng: s.lng as number,
          schoolKey: key,
          dean,
          group,
          fill: dean ? colorOf(group!) : NO_DEAN_COLOR,
        };
      });
    return spreadOverlappingMarkers(raw);
  }, [schools, deansBySchool, year, groupOf, colorOf]);

  const yearCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of markers) {
      if (!m.group) continue;
      counts[m.group] = (counts[m.group] || 0) + 1;
    }
    return counts;
  }, [markers]);

  const legendGroups = useMemo(() => {
    const named = [...disciplineColors.keys()];
    const extras = ["Other", "Unknown"].filter((g) => !named.includes(g));
    return [...named, ...extras];
  }, [disciplineColors]);

  const composition = useMemo(() => {
    const rows: Record<string, number | string>[] = [];
    for (let y = minYear; y <= MAX_YEAR; y++) {
      const counts: Record<string, number> = {};
      let total = 0;
      for (const s of schools) {
        if (s.lat == null || s.lng == null) continue;
        const dean = sittingDean(deansBySchool.get(makeSchoolKey(s.university, s.school)) || [], y);
        if (!dean) continue;
        const g = groupOf(dean.disciplineBroad);
        counts[g] = (counts[g] || 0) + 1;
        total++;
      }
      const row: Record<string, number | string> = { year: y, total };
      for (const g of legendGroups) {
        row[g] = total ? ((counts[g] || 0) / total) * 100 : 0;
        row[`${g} (count)`] = counts[g] || 0;
      }
      rows.push(row);
    }
    return rows;
  }, [minYear, schools, deansBySchool, groupOf, legendGroups]);

  // Chart start-year slicer (default 1996); the CSV export always covers the full range.
  const chartStartOptions = useMemo(
    () => [...new Set([minYear, 1970, 1975, 1980, 1985, 1990, 1996, 2000, 2005, 2010].filter((y) => y >= minYear && y < MAX_YEAR))].sort((a, b) => a - b),
    [minYear]
  );
  const chartData = useMemo(
    () => composition.filter((r) => (r.year as number) >= Math.max(chartStart, minYear)),
    [composition, chartStart, minYear]
  );

  const downloadCSV = useCallback(() => {
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Year",
      "Total Sitting Deans",
      ...legendGroups.map((g) => `${g} %`),
      ...legendGroups.map((g) => `${g} (count)`),
    ];
    const lines = [header.map(esc).join(",")];
    for (const row of composition) {
      lines.push(
        [
          row.year,
          row.total,
          ...legendGroups.map((g) => Math.round((row[g] as number) * 100) / 100),
          ...legendGroups.map((g) => row[`${g} (count)`]),
        ]
          .map((v) => esc(v as string | number))
          .join(",")
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `discipline_composition_${meta.id}_${minYear}-${MAX_YEAR}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [composition, legendGroups, meta.id, minYear]);

  const hoveredMarker = useMemo(
    () => (hoveredKey ? markers.find((m) => m.schoolKey === hoveredKey) : null),
    [hoveredKey, markers]
  );

  // Direct labels drawn inside the composition chart: wide bands get an inline
  // label at their thickest point; thin bands get a leader-line callout in the
  // right margin. Replaces the separate legend below the chart.
  const CALLOUT_ABBR: Record<string, string> = {
    "Finance & Accounting": "Fin & Acctg",
    "Strategy & Management": "Strategy & Mgmt",
    "Economics & Social Science": "Econ & Soc Sci",
    "Operations Management": "Ops Mgmt",
    "Information Systems": "Info Systems",
    "Industry/Practitioner": "Industry/Pract.",
  };
  const renderDirectLabels = (props: Record<string, unknown>) => {
    const offset = props.offset as { left: number; top: number; width: number; height: number } | undefined;
    if (!offset || !chartData.length) return <g />;
    const xMap = props.xAxisMap ? (Object.values(props.xAxisMap as Record<string, unknown>)[0] as { scale?: (v: number) => number }) : null;
    const yMap = props.yAxisMap ? (Object.values(props.yAxisMap as Record<string, unknown>)[0] as { scale?: (v: number) => number }) : null;
    const xPos = (yr: number) => {
      const v = xMap?.scale?.(yr);
      return typeof v === "number" && !Number.isNaN(v) ? v : offset.left + ((yr - Math.max(chartStart, minYear)) / (MAX_YEAR - Math.max(chartStart, minYear))) * offset.width;
    };
    const yPos = (pct: number) => {
      const v = yMap?.scale?.(pct);
      return typeof v === "number" && !Number.isNaN(v) ? v : offset.top + (1 - pct / 100) * offset.height;
    };
    // Per-band, per-year stats. Label placement prefers years with a decent
    // sample size (avoids the noisy early spikes) and stable band width
    // (score = min thickness over a +/-2yr window).
    interface YearStat { yr: number; mid: number; v: number; score: number }
    interface Band { g: string; stats: YearStat[]; lastYear: number; lastMid: number; maxScorePx: number }
    const bands: Band[] = [];
    for (let gi = 0; gi < legendGroups.length; gi++) {
      const g = legendGroups[gi];
      const raw: YearStat[] = [];
      let last: { yr: number; mid: number } | null = null;
      for (const row of chartData) {
        const yr = row.year as number;
        let below = 0;
        for (let k = 0; k < gi; k++) below += (row[legendGroups[k]] as number) || 0;
        const v = (row[g] as number) || 0;
        if (v > 0) last = { yr, mid: below + v / 2 };
        raw.push({ yr, mid: below + v / 2, v, score: 0 });
      }
      if (!last) continue;
      const totalOk = (idx: number) => ((chartData[idx].total as number) || 0) >= 15;
      for (let i = 0; i < raw.length; i++) {
        if (!totalOk(i)) { raw[i].score = 0; continue; }
        let mn = Infinity;
        for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) mn = Math.min(mn, raw[k].v);
        raw[i].score = mn;
      }
      const maxScore = Math.max(...raw.map((s) => s.score));
      bands.push({ g, stats: raw, lastYear: last.yr, lastMid: last.mid, maxScorePx: (maxScore / 100) * offset.height });
    }
    // Greedy inline placement, widest bands first, avoiding label collisions.
    interface Inline { g: string; x: number; y: number }
    const inline: Inline[] = [];
    const callouts: Band[] = [];
    for (const b of [...bands].sort((a, bb) => bb.maxScorePx - a.maxScorePx)) {
      if (b.maxScorePx < 18) { callouts.push(b); continue; }
      const options = b.stats
        .filter((s) => (s.score / 100) * offset.height >= 18)
        .sort((a, bb) => bb.score - a.score);
      let placedOpt: YearStat | null = null;
      for (const o of options) {
        const ox = xPos(o.yr), oy = yPos(o.mid);
        if (ox < offset.left + 55 || ox > offset.left + offset.width - 55) continue;
        if (!inline.some((p) => Math.abs(p.x - ox) < 130 && Math.abs(p.y - oy) < 14)) { placedOpt = o; break; }
      }
      if (placedOpt) inline.push({ g: b.g, x: xPos(placedOpt.yr), y: yPos(placedOpt.mid) });
      else callouts.push(b);
    }
    callouts.sort((a, b) => yPos(a.lastMid) - yPos(b.lastMid));
    // stack callout labels in the right margin without overlaps
    const placed: (Band & { ly: number })[] = [];
    let prevY = offset.top - 13;
    for (const c of callouts) {
      const ly = Math.max(yPos(c.lastMid), prevY + 13);
      placed.push({ ...c, ly });
      prevY = ly;
    }
    for (let i = placed.length - 1, limit = offset.top + offset.height; i >= 0; i--) {
      placed[i].ly = Math.min(placed[i].ly, limit);
      limit = placed[i].ly - 13;
    }
    const labelX = offset.left + offset.width + 8;
    return (
      <g>
        {inline.map((c) => (
          <text
            key={c.g}
            x={c.x}
            y={c.y}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 11, fontWeight: 700, fill: "#fff", paintOrder: "stroke", stroke: "rgba(0,0,0,0.45)", strokeWidth: 2.5, pointerEvents: "none" }}
          >
            {c.g}
          </text>
        ))}
        {placed.map((c) => (
          <g key={c.g} style={{ pointerEvents: "none" }}>
            <circle cx={xPos(c.lastYear)} cy={yPos(c.lastMid)} r={2} fill={colorOf(c.g)} />
            <polyline
              points={`${xPos(c.lastYear)},${yPos(c.lastMid)} ${labelX - 3},${c.ly}`}
              fill="none"
              stroke={colorOf(c.g)}
              strokeWidth={1}
              opacity={0.75}
            />
            <text x={labelX} y={c.ly} dominantBaseline="central" style={{ fontSize: 10, fontWeight: 600, fill: "hsl(var(--foreground))" }}>
              {CALLOUT_ABBR[c.g] || c.g}
            </text>
          </g>
        ))}
      </g>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dean Disciplines Across the Map</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each school is colored by the academic discipline of the dean serving in the selected year. Drag the slider (or press
            Play) to watch the disciplinary composition of {meta.schoolType} school leadership evolve over time. Click a school to
            view the dean&apos;s profile.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handlePlay}
              className="px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-sm font-semibold min-w-[76px]"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <div className="flex-1 min-w-[220px]">
              <Slider
                value={[year]}
                min={minYear}
                max={MAX_YEAR}
                step={1}
                onValueChange={([v]) => {
                  setPlaying(false);
                  setYear(v);
                }}
              />
            </div>
            <span className="text-2xl font-bold tabular-nums w-[70px] text-center">{year}</span>
            <div className="flex items-center gap-2">
              <Switch id="shownames" checked={showNames} onCheckedChange={setShowNames} />
              <Label htmlFor="shownames" className="text-sm">Show names</Label>
            </div>
          </div>

          <div className="flex gap-x-4 gap-y-1 text-xs flex-wrap items-center">
            {legendGroups.map((g) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-full border border-white/50" style={{ background: colorOf(g) }} />
                <span>{g}</span>
                <span className="text-muted-foreground tabular-nums">({yearCounts[g] || 0})</span>
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full border border-white/50" style={{ background: NO_DEAN_COLOR }} />
              <span className="text-muted-foreground">No dean on record</span>
            </span>
          </div>

          <div
            className="w-full border border-border rounded-lg overflow-hidden bg-card relative"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
          >
            {hoveredMarker && (
              <div
                className="absolute z-20 pointer-events-none bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm"
                style={{
                  left: tooltipPos.x + 12,
                  top: tooltipPos.y - 10,
                  transform: tooltipPos.x > 500 ? "translateX(-110%)" : undefined,
                }}
              >
                <p className="font-semibold">{hoveredMarker.fullName}</p>
                {hoveredMarker.dean ? (
                  <>
                    <p className="text-xs">{hoveredMarker.dean.dean}{hoveredMarker.dean.isInterim ? " (interim)" : ""}</p>
                    <p className="text-muted-foreground text-xs">
                      {hoveredMarker.dean.disciplineBroad || "Unknown discipline"} ·{" "}
                      {hoveredMarker.dean.startYear ?? "?"}–{hoveredMarker.dean.endYear ?? "Present"}
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-xs">No dean on record in {year}</p>
                )}
              </div>
            )}

            <ComposableMap
              projection="geoAlbersUsa"
              projectionConfig={{ scale: 1000 }}
              style={{ width: "100%", height: "auto" }}
              viewBox="0 0 800 500"
            >
              <ZoomableGroup
                center={position.coordinates}
                zoom={position.zoom}
                onMoveEnd={setPosition}
                minZoom={1}
                maxZoom={8}
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }: { geographies: any[] }) =>
                    geographies.map((geo: any) => (
                      <Geography
                        key={geo.rsmKey || geo.id}
                        geography={geo}
                        fill="#e5e7eb"
                        stroke="#ffffff"
                        strokeWidth={0.8}
                        style={{
                          default: { outline: "none" },
                          hover: { outline: "none", fill: "#d1d5db" },
                          pressed: { outline: "none" },
                        }}
                      />
                    ))
                  }
                </Geographies>
                {markers.map((m) => {
                  const isHovered = m.schoolKey === hoveredKey;
                  const r = 6.5 / position.zoom;
                  const fontSize = Math.max(3.5, 6.5 / position.zoom);
                  return (
                    <Marker
                      key={m.schoolKey}
                      coordinates={[m.adjLng, m.adjLat]}
                      onClick={() => m.dean && setSelectedDean(m.dean)}
                      onMouseEnter={() => setHoveredKey(m.schoolKey)}
                      onMouseLeave={() => setHoveredKey(null)}
                      style={{ cursor: m.dean ? "pointer" : "default" }}
                    >
                      <circle
                        r={r}
                        fill={m.fill}
                        opacity={isHovered ? 1 : 0.9}
                        stroke={isHovered ? "hsl(var(--foreground))" : "white"}
                        strokeWidth={isHovered ? 1.8 / position.zoom : 0.6 / position.zoom}
                        style={{ cursor: m.dean ? "pointer" : "default" }}
                      />
                      {showNames && m.dean && (
                        <text
                          textAnchor="middle"
                          y={r + fontSize}
                          style={{
                            fontSize,
                            fontWeight: 600,
                            fill: "hsl(var(--foreground))",
                            pointerEvents: "none",
                            paintOrder: "stroke",
                            stroke: "hsl(var(--card))",
                            strokeWidth: 2,
                          }}
                        >
                          {lastName(m.dean.dean)}
                        </text>
                      )}
                    </Marker>
                  );
                })}
              </ZoomableGroup>
            </ComposableMap>
            <div className="px-3 pb-2 text-xs text-muted-foreground text-center">
              Drag to pan · Scroll to zoom · Color = discipline of the dean serving in {year}
            </div>
          </div>

          {selectedDean && <DeanProfile dean={selectedDean} onClose={() => setSelectedDean(null)} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base">Discipline Composition Over Time</CardTitle>
            <p className="text-sm text-muted-foreground mt-1.5">
              Share of sitting deans by discipline, {Math.max(chartStart, minYear)}–{MAX_YEAR}. The vertical line tracks the slider year.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <Label htmlFor="chartstart" className="text-sm text-muted-foreground whitespace-nowrap">From year</Label>
              <Select value={String(chartStart)} onValueChange={(v) => setChartStart(Number(v))}>
                <SelectTrigger id="chartstart" className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {chartStartOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y === minYear ? `${y} (all)` : String(y)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <button
              onClick={downloadCSV}
              className="px-4 py-1.5 rounded-lg border border-border bg-card hover:bg-muted text-sm font-semibold"
            >
              Download CSV
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={chartData} margin={{ top: 10, right: 100, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="year" fontSize={11} />
              <YAxis fontSize={11} unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} allowDataOverflow />
              <Tooltip
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(value: number, name: string) => [`${Math.round(value * 10) / 10}%`, name]}
              />
              <ReferenceLine x={year} stroke="hsl(var(--foreground))" strokeDasharray="4 2" />
              {legendGroups.map((g) => (
                <Area
                  key={g}
                  type="monotone"
                  dataKey={g}
                  stackId="1"
                  fill={colorOf(g)}
                  stroke={colorOf(g)}
                  fillOpacity={0.75}
                  name={g}
                />
              ))}
              <Customized component={renderDirectLabels} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
