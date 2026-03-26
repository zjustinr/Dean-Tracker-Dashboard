import { useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker } from "react-simple-maps";
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
    <div className="w-full border border-border rounded-lg overflow-hidden bg-card">
      <ComposableMap
        projection="geoAlbersUsa"
        projectionConfig={{ scale: 1000 }}
        style={{ width: "100%", height: "auto" }}
        viewBox="0 0 800 500"
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
          return (
            <Marker
              key={marker.shortName}
              coordinates={[marker.lng, marker.lat]}
              onClick={() => onSelectSchool(marker.deanSchoolName)}
              style={{ cursor: "pointer" }}
            >
              <circle
                r={marker.radius}
                fill={isSelected ? CHART_COLORS[4] : CHART_COLORS[0]}
                opacity={isSelected ? 1 : 0.7}
                stroke={isSelected ? "hsl(var(--foreground))" : "white"}
                strokeWidth={isSelected ? 2 : 1}
              />
              {isSelected && (
                <text
                  textAnchor="middle"
                  y={-marker.radius - 4}
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    fill: "hsl(var(--foreground))",
                  }}
                >
                  {marker.shortName}
                </text>
              )}
            </Marker>
          );
        })}
      </ComposableMap>
      <div className="px-3 pb-2 flex gap-4 text-xs text-muted-foreground justify-center">
        <span>Circle size = faculty count</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} /> School</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[4] }} /> Selected</span>
      </div>
    </div>
  );
}
