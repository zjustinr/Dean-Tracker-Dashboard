import { useMemo, useState, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useAllDeans, makeSchoolKey, useSchoolsInfo } from "@/data/useData";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const CLUSTER_THRESHOLD = 0.15;


const DEAN_TIERS = [
  { min: 1, max: 5, color: "#22c55e", label: "1–5" },
  { min: 6, max: 10, color: "#eab308", label: "6–10" },
  { min: 11, max: 15, color: "#f97316", label: "11–15" },
  { min: 16, max: Infinity, color: "#ef4444", label: "15+" },
];

function getDeanCountColor(count: number): string {
  if (count === 0) return "hsl(0, 0%, 75%)";
  for (const tier of DEAN_TIERS) {
    if (count >= tier.min && count <= tier.max) return tier.color;
  }
  return DEAN_TIERS[DEAN_TIERS.length - 1].color;
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
  selectedSchoolKey: string;
  onSelectSchool: (key: string) => void;
}

export default function USMap({ selectedSchoolKey, onSelectSchool }: Props) {
  const allDeans = useAllDeans();
  const SCHOOL_INFO = useSchoolsInfo();
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
    const universityForSchool = new Map<string, string>();
    const deanCounts = new Map<string, number>();
    for (const d of allDeans) {
      const key = makeSchoolKey(d.university, d.school);
      deanCounts.set(key, (deanCounts.get(key) || 0) + 1);
      if (!universityForSchool.has(d.school)) {
        universityForSchool.set(d.school, d.university);
      }
    }

    const raw = SCHOOL_INFO.filter(s => s.lat != null && s.lng != null).map((s) => {
      const deanUniversity = s.university;
      const deanSchoolName = s.school;
      const schoolKey = makeSchoolKey(deanUniversity, deanSchoolName);
      const deanCount = deanCounts.get(schoolKey) || 0;
      return {
        ...s,
        lat: s.lat as number,
        lng: s.lng as number,
        deanSchoolName,
        schoolKey,
        deanCount,
        radius: Math.max(8, Math.min(22, 6 + (s.totalFaculty / 20))),
      };
    });

    return spreadOverlappingMarkers(raw);
  }, [allDeans, SCHOOL_INFO]);

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
            const scaledRadius = marker.radius / position.zoom;
            const fillColor = getDeanCountColor(marker.deanCount);
            const fontSize = Math.max(5, 9 / position.zoom);
            const ringGap = 2.5 / position.zoom;
            const ringWidth = 2 / position.zoom;

            return (
              <Marker
                key={marker.schoolKey}
                coordinates={[marker.adjLng, marker.adjLat]}
                onClick={() => onSelectSchool(marker.schoolKey)}
                onMouseEnter={() => setHoveredSchool(marker.schoolKey)}
                onMouseLeave={() => setHoveredSchool(null)}
                style={{ cursor: "pointer" }}
              >
                {isSelected && (
                  <>
                    <circle
                      r={scaledRadius + ringGap + ringWidth * 2}
                      fill="none"
                      stroke="hsl(330, 81%, 60%)"
                      strokeWidth={ringWidth}
                    />
                    <circle
                      r={scaledRadius + ringGap}
                      fill="none"
                      stroke="white"
                      strokeWidth={ringWidth}
                    />
                  </>
                )}
                <circle
                  r={scaledRadius}
                  fill={fillColor}
                  opacity={isSelected || isHovered ? 1 : 0.85}
                  stroke={isHovered ? "hsl(var(--foreground))" : "white"}
                  strokeWidth={isHovered ? 2 / position.zoom : 0.5 / position.zoom}
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
        <span>Drag to pan · Scroll to zoom · Bubble size = faculty count · Number = US News rank</span>
        <span className="flex items-center gap-1">
          <span className="text-xs">Deans:</span>
          {DEAN_TIERS.map((tier) => (
            <span key={tier.label} className="flex items-center gap-0.5">
              <span
                className="inline-block w-3 h-3 rounded-full border border-white/50"
                style={{ background: tier.color }}
              />
              <span className="text-[10px]">{tier.label}</span>
            </span>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-4 h-4 rounded-full"
            style={{
              background: "hsl(var(--muted))",
              boxShadow: "0 0 0 2px white, 0 0 0 4px hsl(330, 81%, 60%)",
            }}
          />
          <span className="ml-1">Selected</span>
        </span>
      </div>
    </div>
  );
}
