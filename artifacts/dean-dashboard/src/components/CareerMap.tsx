import { useMemo } from "react";
import * as RSM from "react-simple-maps";
import type { CareerStep } from "@/data/enrichment";
import careerGeo from "@/data/career-geo.json";

const { ComposableMap, Geographies, Geography, Marker } = RSM;
// Line ships in react-simple-maps v3 at runtime but is missing from the installed types.
const Line = (RSM as unknown as { Line: React.FC<any> }).Line;

// Same US topojson the School Explorer map uses.
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Geo = { city: string; state: string; country: string; lat: number; lng: number };
const GEO: Record<string, Geo> = careerGeo as Record<string, Geo>;

const norm = (s: string) => s.toLowerCase().trim();

interface Located {
  num: number;          // chronological step number (1 = earliest)
  role: string;
  org: string;
  years: string;
  geo: Geo;
  isCurrent: boolean;
  x: number;            // jittered lng for display
  y: number;            // jittered lat for display
}

/**
 * A leader's career movement across the US: each located step is a numbered dot,
 * consecutive steps are connected in time order, so you can see at a glance
 * whether someone stayed regional or ranged widely. Steps we cannot place (no
 * geocode yet, or a non-US location) are listed below the map rather than dropped.
 */
export default function CareerMap({ steps }: { steps: CareerStep[] }) {
  const { located, unlocated } = useMemo(() => {
    const loc: Located[] = [];
    const un: { num: number; role: string; org: string }[] = [];
    steps.forEach((s, i) => {
      const org = s.org || "";
      const g = org ? GEO[norm(org)] : undefined;
      const isCurrent = /\b(present|current)\b/i.test(s.years || "") || i === steps.length - 1;
      if (g && g.country === "US") {
        loc.push({ num: i + 1, role: s.role, org, years: s.years || "", geo: g, isCurrent, x: g.lng, y: g.lat });
      } else if (org) {
        un.push({ num: i + 1, role: s.role, org });
      }
    });
    // Fan out markers that share a location so overlapping steps stay readable.
    const groups = new Map<string, Located[]>();
    for (const p of loc) {
      const key = `${p.geo.lat.toFixed(1)},${p.geo.lng.toFixed(1)}`;
      (groups.get(key) || groups.set(key, []).get(key)!).push(p);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const step = 0.55, cLat = g[0].geo.lat, cLng = g[0].geo.lng;
      g.forEach((p, k) => {
        const angle = (2 * Math.PI * k) / g.length - Math.PI / 2;
        p.y = cLat + Math.sin(angle) * step;
        p.x = cLng + Math.cos(angle) * step * 1.3;
      });
    }
    return { located: loc, unlocated: un };
  }, [steps]);

  if (!located.length) return null;

  const states = new Set(located.map((p) => p.geo.state));

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 620 }} style={{ width: "100%", height: "auto" }} viewBox="0 0 800 500">
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo: any) => (
              <Geography key={geo.rsmKey || geo.id} geography={geo} fill="hsl(215 20% 88%)" stroke="#ffffff" strokeWidth={0.6}
                style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
            ))
          }
        </Geographies>

        {/* Connect consecutive located steps in time order. */}
        {located.slice(1).map((p, i) => (
          <Line key={`l${i}`} from={[located[i].x, located[i].y]} to={[p.x, p.y]}
            stroke="hsl(var(--primary))" strokeWidth={1.6} strokeOpacity={0.55} strokeLinecap="round" strokeDasharray="4 3" />
        ))}

        {located.map((p) => (
          <Marker key={p.num} coordinates={[p.x, p.y]}>
            <circle r={9} fill={p.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} stroke="white" strokeWidth={1.5} />
            <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10, fontWeight: 700, fill: "white", pointerEvents: "none" }}>{p.num}</text>
          </Marker>
        ))}
      </ComposableMap>

      <div className="px-3 py-2 border-t border-border">
        <p className="text-[11px] text-muted-foreground">
          Career movement · {located.length} US stop{located.length === 1 ? "" : "s"} across {states.size} state{states.size === 1 ? "" : "s"} · numbered by career step, line follows time
        </p>
        {unlocated.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-1">
            Not shown (no location yet): {unlocated.map((u) => `#${u.num} ${u.org}`).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}
