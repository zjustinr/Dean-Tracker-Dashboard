import { useMemo, useState, useEffect, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useAllDeans, useSchoolsInfo, makeSchoolKey } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";
import type { Dean } from "@/data/types";
import { CHART_COLORS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import DeanProfile from "./DeanProfile";
import { spreadOverlappingMarkers } from "./USMap";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
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
      const row: Record<string, number | string> = { year: y };
      for (const g of legendGroups) {
        row[g] = total ? ((counts[g] || 0) / total) * 100 : 0;
      }
      rows.push(row);
    }
    return rows;
  }, [minYear, schools, deansBySchool, groupOf, legendGroups]);

  const hoveredMarker = useMemo(
    () => (hoveredKey ? markers.find((m) => m.schoolKey === hoveredKey) : null),
    [hoveredKey, markers]
  );

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
        <CardHeader>
          <CardTitle className="text-base">Discipline Composition Over Time</CardTitle>
          <p className="text-sm text-muted-foreground">
            Share of sitting deans by discipline, {minYear}–{MAX_YEAR}. The vertical line tracks the slider year.
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={composition} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
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
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
