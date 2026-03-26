import { useMemo, useState, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useAllDeans } from "@/data/useData";
import { SCHOOL_INFO, SCHOOL_NAME_MAP } from "@/data/schools";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const CLUSTER_THRESHOLD = 0.15;

function getDeanCountColor(count: number, maxCount: number): string {
  if (count === 0) return "hsl(0, 0%, 75%)";
  const t = Math.min(count / maxCount, 1);
  const h = 220 - t * 180;
  const s = 50 + t * 40;
  const l = 65 - t * 30;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function spreadOverlappingMarkers(
  markers: { lat: number; lng: number; shortName: string; [k: string]: any }[]
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
    const spread = 0.3 + cluster.length * 0.08;

    cluster.forEach((idx, ci) => {
      const angle = angleStep * ci - Math.PI / 2;
      result[idx].adjLat = centerLat + Math.sin(angle) * spread;
      result[idx].adjLng = centerLng + Math.cos(angle) * spread * 1.3;
    });
  }

  return result;
}

interface Props {
  selectedSchool: string;
  onSelectSchool: (school: string) => void;
}

export default function USMap({ selectedSchool, onSelectSchool }: Props) {
  const allDeans = useAllDeans();
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

  const schoolMarkers = useMemo(() => {
    const deanCounts = new Map<string, number>();
    for (const d of allDeans) {
      deanCounts.set(d.school, (deanCounts.get(d.school) || 0) + 1);
    }

    const raw = SCHOOL_INFO.map((s) => {
      const deanSchoolName = SCHOOL_NAME_MAP[s.shortName] || s.shortName;
      const deanCount = deanCounts.get(deanSchoolName) || 0;
      return {
        ...s,
        deanSchoolName,
        deanCount,
        radius: Math.max(6, Math.min(14, 6 + deanCount * 0.6)),
      };
    });

    return spreadOverlappingMarkers(raw);
  }, [allDeans]);

  const maxDeanCount = useMemo(
    () => Math.max(...schoolMarkers.map((m) => m.deanCount), 1),
    [schoolMarkers]
  );

  const hoveredMarker = useMemo(
    () => (hoveredSchool ? schoolMarkers.find((m) => m.shortName === hoveredSchool) : null),
    [hoveredSchool, schoolMarkers]
  );

  const legendSteps = useMemo(() => {
    const steps = [1, Math.round(maxDeanCount / 3), Math.round((maxDeanCount * 2) / 3), maxDeanCount];
    return [...new Set(steps)].map((count) => ({
      count,
      color: getDeanCountColor(count, maxDeanCount),
    }));
  }, [maxDeanCount]);

  return (
    <div
      className="w-full max-w-3xl mx-auto border border-border rounded-lg overflow-hidden bg-card relative"
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }}
    >
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="w-7 h-7 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-xs font-medium shadow-sm"
          aria-label="Reset zoom"
        >
          ⟲
        </button>
      </div>

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
          <p className="text-muted-foreground text-xs">
            Rank #{hoveredMarker.rank} · {hoveredMarker.deanCount} deans on record
          </p>
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
                  fill="hsl(var(--muted))"
                  stroke="hsl(var(--border))"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "hsl(var(--accent))" },
                    pressed: { outline: "none" },
                  }}
                />
              ))
            }
          </Geographies>
          {schoolMarkers.map((marker) => {
            const isSelected = marker.deanSchoolName === selectedSchool;
            const isHovered = marker.shortName === hoveredSchool;
            const scaledRadius = marker.radius / position.zoom;
            const fillColor = isSelected
              ? "hsl(330, 81%, 60%)"
              : getDeanCountColor(marker.deanCount, maxDeanCount);
            const fontSize = Math.max(4, 7 / position.zoom);

            return (
              <Marker
                key={marker.shortName}
                coordinates={[marker.adjLng, marker.adjLat]}
                onClick={() => onSelectSchool(marker.deanSchoolName)}
                onMouseEnter={() => setHoveredSchool(marker.shortName)}
                onMouseLeave={() => setHoveredSchool(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={scaledRadius}
                  fill={fillColor}
                  opacity={isSelected || isHovered ? 1 : 0.85}
                  stroke={isSelected ? "hsl(var(--foreground))" : isHovered ? "hsl(var(--foreground))" : "white"}
                  strokeWidth={isSelected || isHovered ? 2 / position.zoom : 0.5 / position.zoom}
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  style={{
                    fontSize,
                    fontWeight: 700,
                    fill: "white",
                    pointerEvents: "none",
                    textShadow: "0 0 2px rgba(0,0,0,0.5)",
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
        <span>Drag to pan · Scroll to zoom</span>
        <span className="flex items-center gap-1">
          <span className="text-xs">Deans:</span>
          {legendSteps.map((s) => (
            <span key={s.count} className="flex items-center gap-0.5">
              <span
                className="inline-block w-3 h-3 rounded-full border border-white/50"
                style={{ background: s.color }}
              />
              <span className="text-[10px]">{s.count}</span>
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-full border border-white/50"
            style={{ background: "hsl(330, 81%, 60%)" }}
          />
          Selected
        </span>
      </div>
    </div>
  );
}
