import { useMemo, useState, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { useAllDeans } from "@/data/useData";
import { SCHOOL_INFO, SCHOOL_NAME_MAP } from "@/data/schools";
import { CHART_COLORS } from "@/data/types";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

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

    return SCHOOL_INFO.map((s) => {
      const deanSchoolName = SCHOOL_NAME_MAP[s.shortName] || s.shortName;
      const deanCount = deanCounts.get(deanSchoolName) || 0;

      return {
        ...s,
        deanSchoolName,
        deanCount,
        radius: Math.max(4, Math.min(14, s.totalFaculty / 20)),
      };
    });
  }, [allDeans]);

  return (
    <div className="w-full border border-border rounded-lg overflow-hidden bg-card relative">
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-lg font-bold shadow-sm"
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-lg font-bold shadow-sm"
          aria-label="Zoom out"
        >
          −
        </button>
        <button
          onClick={handleReset}
          className="w-8 h-8 rounded-md bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-xs font-medium shadow-sm"
          aria-label="Reset zoom"
        >
          ⟲
        </button>
      </div>
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
            const scaledRadius = marker.radius / position.zoom;
            return (
              <Marker
                key={marker.shortName}
                coordinates={[marker.lng, marker.lat]}
                onClick={() => onSelectSchool(marker.deanSchoolName)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  r={scaledRadius}
                  fill={isSelected ? CHART_COLORS[4] : CHART_COLORS[0]}
                  opacity={isSelected ? 1 : 0.7}
                  stroke={isSelected ? "hsl(var(--foreground))" : "white"}
                  strokeWidth={isSelected ? 2 / position.zoom : 1 / position.zoom}
                />
                {(isSelected || position.zoom >= 3) && (
                  <text
                    textAnchor="middle"
                    y={-scaledRadius - 3 / position.zoom}
                    style={{
                      fontSize: Math.max(6, 10 / position.zoom),
                      fontWeight: 600,
                      fill: "hsl(var(--foreground))",
                      pointerEvents: "none",
                    }}
                  >
                    {marker.shortName}
                  </text>
                )}
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      <div className="px-3 pb-2 flex gap-4 text-xs text-muted-foreground justify-center">
        <span>Drag to pan · Scroll to zoom · Circle size = faculty count</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} /> School</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[4] }} /> Selected</span>
      </div>
    </div>
  );
}
