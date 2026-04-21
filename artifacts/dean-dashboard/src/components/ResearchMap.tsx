import { useMemo, useState, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { makeSchoolKey, useBSQ, useSchoolsInfo } from "@/data/useData";
import { useDataset } from "@/data/DatasetContext";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const CLUSTER_THRESHOLD = 0.15;

const PIE_COLORS = {
  ug: "#3b82f6",
  mba: "#8b5cf6",
  other: "#10b981",
};

interface BSQEntry {
  university: string;
  school: string;
  bsq: Record<string, number | string | null>;
}

function spreadOverlappingMarkers<T extends { lat: number; lng: number; shortName: string }>(
  markers: T[]
) {
  const result = markers.map((m) => ({ ...m, adjLat: m.lat, adjLng: m.lng }));
  const clusters: number[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < result.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [i];
    visited.add(i);
    for (let j = i + 1; j < result.length; j++) {
      if (visited.has(j)) continue;
      const dLat = Math.abs(result[i].lat - result[j].lat);
      const dLng = Math.abs(result[i].lng - result[j].lng);
      if (dLat < CLUSTER_THRESHOLD && dLng < CLUSTER_THRESHOLD) {
        cluster.push(j);
        visited.add(j);
      }
    }
    if (cluster.length > 1) clusters.push(cluster);
  }

  for (const cluster of clusters) {
    const centerLat = cluster.reduce((s, i) => s + result[i].lat, 0) / cluster.length;
    const centerLng = cluster.reduce((s, i) => s + result[i].lng, 0) / cluster.length;
    const angleStep = (2 * Math.PI) / cluster.length;
    const spread = 0.4 + cluster.length * 0.1;
    cluster.forEach((idx, ci) => {
      const angle = angleStep * ci - Math.PI / 2;
      result[idx].adjLat = centerLat + Math.sin(angle) * spread;
      result[idx].adjLng = centerLng + Math.cos(angle) * spread * 1.3;
    });
  }

  return result;
}

function pieArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  if (endAngle - startAngle >= Math.PI * 2 - 0.001) {
    return [
      `M ${cx + r} ${cy}`,
      `A ${r} ${r} 0 1 1 ${cx - r} ${cy}`,
      `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,
      "Z",
    ].join(" ");
  }
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

interface Props {
  selectedSchoolKey: string;
  onSelectSchool: (key: string) => void;
}

export default function ResearchMap({ selectedSchoolKey, onSelectSchool }: Props) {
  const [position, setPosition] = useState<{ coordinates: [number, number]; zoom: number }>({
    coordinates: [-96, 38],
    zoom: 1,
  });
  const [hoveredSchool, setHoveredSchool] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMoveEnd = useCallback((pos: { coordinates: [number, number]; zoom: number }) => {
    setPosition(pos);
  }, []);

  const handleZoomIn = useCallback(() => {
    setPosition((p) => ({ ...p, zoom: Math.min(p.zoom * 1.5, 8) }));
  }, []);

  const handleZoomOut = useCallback(() => {
    setPosition((p) => ({ ...p, zoom: Math.max(p.zoom / 1.5, 1) }));
  }, []);

  const handleReset = useCallback(() => {
    setPosition({ coordinates: [-96, 38], zoom: 1 });
  }, []);

  const SCHOOL_INFO = useSchoolsInfo();
  const allBSQ = useBSQ() as BSQEntry[];
  const isEngineering = useDataset().meta.schoolType === "engineering";
  const bsqLookup = useMemo(() => {
    const m = new Map<string, BSQEntry>();
    for (const s of allBSQ) m.set(s.university + "|||" + s.school, s);
    return m;
  }, [allBSQ]);

  const schoolMarkers = useMemo(() => {
    const raw = SCHOOL_INFO.filter(s => s.lat != null && s.lng != null).map((s) => {
      const deanUniversity = s.university;
      const deanSchoolName = s.school;
      const schoolKey = makeSchoolKey(deanUniversity, deanSchoolName);

      const bsq = bsqLookup.get(deanUniversity + "|||" + deanSchoolName) || null;
      const bb = bsq?.bsq;
      const fb = (key: string) => {
        if (!bb) return null;
        const v = bb[key] ?? bb[key + "Start"] ?? bb[key + "Avg"];
        return v != null ? Number(v) : null;
      };

      let totalHeadcount: number | null;
      let ugTotal: number;
      let mbaTotal: number;
      let otherTotal: number;
      if (isEngineering) {
        // For engineering: use total HERD R&D ($K) as the size metric;
        // pie segments = federal / industry / state / other
        totalHeadcount = fb("herdEngrTotal");
        const fed = fb("herdEngrFederal") ?? 0;
        const ind = fb("herdEngrIndustry") ?? 0;
        const state = fb("herdEngrState") ?? 0;
        ugTotal = fed;
        mbaTotal = ind;
        otherTotal = totalHeadcount != null ? Math.max(0, totalHeadcount - fed - ind - state) + state : 0;
      } else {
        totalHeadcount = fb("totalHeadcount");
        ugTotal = fb("ugTotal") ?? 0;
        mbaTotal = fb("mbaTotal") ?? 0;
        otherTotal = totalHeadcount != null ? Math.max(0, totalHeadcount - (ugTotal || 0) - (mbaTotal || 0)) : 0;
      }

      return {
        ...s,
        lat: s.lat as number,
        lng: s.lng as number,
        deanSchoolName,
        schoolKey,
        totalHeadcount,
        ugTotal: ugTotal || 0,
        mbaTotal: mbaTotal || 0,
        otherTotal,
        hasBSQ: totalHeadcount != null && totalHeadcount > 0,
        radius: 0,
      };
    });

    const headcounts = raw.filter(m => m.hasBSQ).map(m => m.totalHeadcount as number);
    const minHC = headcounts.length ? Math.min(...headcounts) : 0;
    const maxHC = headcounts.length ? Math.max(...headcounts) : 1;
    const range = maxHC - minHC || 1;
    const MIN_R = 3;
    const MAX_R = 22;

    for (const m of raw) {
      if (m.hasBSQ && m.totalHeadcount != null) {
        m.radius = MIN_R + ((m.totalHeadcount - minHC) / range) * (MAX_R - MIN_R);
      } else {
        m.radius = MIN_R;
      }
    }

    return spreadOverlappingMarkers(raw);
  }, [SCHOOL_INFO, bsqLookup, isEngineering]);

  const hoveredMarker = useMemo(
    () => (hoveredSchool ? schoolMarkers.find((m) => m.schoolKey === hoveredSchool) : null),
    [hoveredSchool, schoolMarkers]
  );

  return (
    <div
      className="w-full max-w-3xl mx-auto border border-border rounded-lg overflow-hidden bg-card relative"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button onClick={handleZoomIn} className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom in">+</button>
        <button onClick={handleZoomOut} className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom out">−</button>
        <button onClick={handleReset} className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-xs font-medium shadow-sm" aria-label="Reset zoom">⟲</button>
      </div>

      {hoveredMarker && (
        <div
          className="absolute z-20 pointer-events-none bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-sm max-w-xs"
          style={{
            left: tooltipPos.x + 12,
            top: tooltipPos.y - 10,
            transform: tooltipPos.x > 500 ? "translateX(-110%)" : undefined,
          }}
        >
          <p className="font-semibold">{hoveredMarker.fullName}</p>
          <p className="text-muted-foreground text-xs mb-1">
            Rank #{hoveredMarker.rank}
          </p>
          {hoveredMarker.hasBSQ ? (
            <div className="space-y-0.5">
              <p className="text-xs font-medium">{isEngineering ? "HERD Engr R&D" : "Total Headcount"}: {hoveredMarker.totalHeadcount?.toLocaleString()}{isEngineering ? "K" : ""}</p>
              <div className="flex gap-3 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS.ug }} />
                  {isEngineering ? "Federal" : "UG"}: {hoveredMarker.ugTotal.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS.mba }} />
                  {isEngineering ? "Industry" : "MBA"}: {hoveredMarker.mbaTotal.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS.other }} />
                  {isEngineering ? "State/Other" : "Other"}: {hoveredMarker.otherTotal.toLocaleString()}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No {isEngineering ? "research" : "BSQ"} data available</p>
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
          onMoveEnd={handleMoveEnd}
          minZoom={1}
          maxZoom={8}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }: { geographies: any[] }) =>
              geographies.map((geo: any) => (
                <Geography
                  key={geo.rsmKey || geo.id}
                  geography={geo}
                  fill="#5a5a5a"
                  stroke="#ffffff"
                  strokeWidth={0.8}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#6e6e6e" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          {schoolMarkers.map((marker) => {
            const isSelected = marker.schoolKey === selectedSchoolKey;
            const isHovered = marker.schoolKey === hoveredSchool;
            const r = marker.radius / position.zoom;
            const fontSize = Math.max(5, 9 / position.zoom);
            const strokeW = (isSelected || isHovered ? 2 : 0.5) / position.zoom;

            if (!marker.hasBSQ) {
              return (
                <Marker
                  key={marker.schoolKey}
                  coordinates={[marker.adjLng, marker.adjLat]}
                  onClick={() => onSelectSchool(marker.schoolKey)}
                  onMouseEnter={() => setHoveredSchool(marker.schoolKey)}
                  onMouseLeave={() => setHoveredSchool(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    r={r * 0.6}
                    fill="#9ca3af"
                    opacity={0.6}
                    stroke={isSelected ? "hsl(var(--foreground))" : "white"}
                    strokeWidth={strokeW}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize, fontWeight: 700, fill: "white", pointerEvents: "none" }}
                  >
                    {marker.rank}
                  </text>
                </Marker>
              );
            }

            const total = marker.ugTotal + marker.mbaTotal + marker.otherTotal;
            const slices: { value: number; color: string }[] = [];
            if (marker.ugTotal > 0) slices.push({ value: marker.ugTotal, color: PIE_COLORS.ug });
            if (marker.mbaTotal > 0) slices.push({ value: marker.mbaTotal, color: PIE_COLORS.mba });
            if (marker.otherTotal > 0) slices.push({ value: marker.otherTotal, color: PIE_COLORS.other });

            let startAngle = -Math.PI / 2;
            const paths = slices.map((slice) => {
              const sweepAngle = (slice.value / total) * Math.PI * 2;
              const endAngle = startAngle + sweepAngle;
              const d = pieArcPath(0, 0, r, startAngle, endAngle);
              startAngle = endAngle;
              return { d, color: slice.color };
            });

            return (
              <Marker
                key={marker.schoolKey}
                coordinates={[marker.adjLng, marker.adjLat]}
                onClick={() => onSelectSchool(marker.schoolKey)}
                onMouseEnter={() => setHoveredSchool(marker.schoolKey)}
                onMouseLeave={() => setHoveredSchool(null)}
                style={{ cursor: "pointer" }}
              >
                {paths.map((p, i) => (
                  <path
                    key={i}
                    d={p.d}
                    fill={p.color}
                    opacity={isSelected || isHovered ? 1 : 0.85}
                    stroke="white"
                    strokeWidth={0.3 / position.zoom}
                  />
                ))}
                <circle
                  r={r}
                  fill="transparent"
                  stroke={isSelected ? "hsl(var(--foreground))" : isHovered ? "hsl(var(--foreground))" : "rgba(255,255,255,0.4)"}
                  strokeWidth={strokeW}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize,
                    fontWeight: 700,
                    fill: "white",
                    pointerEvents: "none",
                    textShadow: "0 0 3px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.9)",
                  }}
                >
                  {marker.rank}
                </text>
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      <div className="px-3 pb-2 flex gap-4 text-xs text-muted-foreground justify-center flex-wrap items-center">
        <span>Drag to pan · Scroll to zoom · Bubble size = {isEngineering ? "HERD Engr R&D" : "total headcount"} · Number = rank</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: PIE_COLORS.ug }} />
            <span className="text-[10px]">{isEngineering ? "Federal R&D" : "Undergraduate"}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: PIE_COLORS.mba }} />
            <span className="text-[10px]">{isEngineering ? "Industry R&D" : "MBA"}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: PIE_COLORS.other }} />
            <span className="text-[10px]">{isEngineering ? "State/Other R&D" : "Other Grad"}</span>
          </span>
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full bg-gray-400 opacity-60" />
          <span className="text-[10px]">No {isEngineering ? "research" : "BSQ"} data</span>
        </span>
      </div>
    </div>
  );
}
