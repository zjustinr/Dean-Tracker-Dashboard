import { memo, useMemo, useState } from "react";
import * as RSM from "react-simple-maps";
import type { Dean } from "@/data/types";

// A live map of the current Slate Builder results: one headshot pin per school,
// placed at that school's location. Hover lists the candidates there; clicking a
// name opens that profile in the results column. Reuses the same us-atlas topojson
// + geoAlbersUsa projection as the other maps. Only schools with coordinates that
// geoAlbersUsa can project are passed in (the parent filters via isAlbersUsaMappable),
// so no null-projection crash.
const { ComposableMap, Geographies, Geography, Marker } = RSM;
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

export interface MapPoint { lat: number; lng: number }
interface Props {
  results: Dean[];
  geoOf: Map<string, MapPoint>;
  photoOf: (d: Dean) => string | undefined;
  activeId: number | null;
  onSelect: (id: number) => void;
}

const initials = (name: string) =>
  name.split(/\s+/).map((n) => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();

interface Group { uni: string; pt: MapPoint; people: Dean[] }

function ResultsMapBase({ results, geoOf, photoOf, activeId, onSelect }: Props) {
  const { groups, unmapped } = useMemo(() => {
    const m = new Map<string, Group>();
    let un = 0;
    for (const d of results) {
      const pt = geoOf.get(d.university.toLowerCase());
      if (!pt) { un++; continue; }
      const g = m.get(d.university.toLowerCase());
      if (g) g.people.push(d);
      else m.set(d.university.toLowerCase(), { uni: d.university, pt, people: [d] });
    }
    return { groups: [...m.values()], unmapped: un };
  }, [results, geoOf]);

  // hovered/pinned school tooltip, positioned at the cursor (viewport-fixed)
  const [tip, setTip] = useState<{ uni: string; x: number; y: number; pinned: boolean } | null>(null);
  const tipGroup = tip ? groups.find((g) => g.uni === tip.uni) : null;

  const mapped = results.length - unmapped;

  return (
    <div className="relative">
      <h3 className="text-sm font-bold mb-0.5">Candidate map</h3>
      <p className="text-[11px] text-muted-foreground mb-1.5 leading-snug">
        {mapped} of {results.length} on the map · {groups.length} school{groups.length === 1 ? "" : "s"}
        {unmapped > 0 ? ` · ${unmapped} without a location` : ""}
      </p>
      <div className="rounded-lg border border-muted-foreground/20 bg-muted/20 overflow-hidden">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 380 }}
          width={340} height={214}
          style={{ width: "100%", height: "auto" }}
          aria-label="Map of candidate school locations"
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey || geo.id}
                  geography={geo}
                  fill="hsl(var(--muted))"
                  stroke="hsl(var(--card))"
                  strokeWidth={0.5}
                  style={{ default: { outline: "none" }, hover: { outline: "none", fill: "hsl(var(--muted))" }, pressed: { outline: "none" } }}
                />
              ))
            }
          </Geographies>
          {groups.map((g, i) => {
            const rep = g.people.find((p) => p.id === activeId) || g.people[0];
            const isActive = g.people.some((p) => p.id === activeId);
            const photo = photoOf(rep);
            const r = isActive ? 12 : 9.5;
            const cid = `rm-clip-${i}`;
            return (
              <Marker key={g.uni} coordinates={[g.pt.lng, g.pt.lat]}>
                <g
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => setTip({ uni: g.uni, x: e.clientX, y: e.clientY, pinned: false })}
                  onMouseMove={(e) => setTip((t) => (t && !t.pinned ? { ...t, x: e.clientX, y: e.clientY } : t))}
                  onMouseLeave={() => setTip((t) => (t && !t.pinned ? null : t))}
                  onClick={(e) => {
                    if (g.people.length === 1) { onSelect(g.people[0].id); setTip(null); }
                    else setTip({ uni: g.uni, x: e.clientX, y: e.clientY, pinned: true });
                  }}
                >
                  <defs>
                    <clipPath id={cid}><circle cx={0} cy={0} r={r} /></clipPath>
                  </defs>
                  <circle r={r + 1.5} fill={isActive ? "#A31F34" : "#011F5B"} />
                  {photo ? (
                    <image href={photo} x={-r} y={-r} width={r * 2} height={r * 2} clipPath={`url(#${cid})`} preserveAspectRatio="xMidYMid slice" />
                  ) : (
                    <>
                      <circle r={r} fill="#e2e8f0" />
                      <text textAnchor="middle" dy={r * 0.35} fontSize={r * 0.9} fontWeight={700} fill="#011F5B">{initials(rep.dean)}</text>
                    </>
                  )}
                  {g.people.length > 1 && (
                    <g transform={`translate(${r - 1}, ${-r + 1})`}>
                      <circle r={6.5} fill="#A31F34" stroke="#fff" strokeWidth={1} />
                      <text textAnchor="middle" dy={2.6} fontSize={8} fontWeight={700} fill="#fff">{g.people.length}</text>
                    </g>
                  )}
                </g>
              </Marker>
            );
          })}
        </ComposableMap>
      </div>

      {tipGroup && tip && (
        <div
          className="fixed z-50 max-w-[240px] rounded-lg border border-border bg-card shadow-lg p-1.5 text-xs"
          style={{ left: Math.min(tip.x + 12, (typeof window !== "undefined" ? window.innerWidth : 9999) - 250), top: tip.y + 12 }}
          onMouseLeave={() => setTip((t) => (t && !t.pinned ? null : t))}
        >
          <div className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground truncate">{tipGroup.uni}</div>
          <div className="max-h-48 overflow-y-auto">
            {tipGroup.people.map((p) => (
              <button
                key={p.id}
                onClick={() => { onSelect(p.id); setTip(null); }}
                className={["w-full text-left px-1.5 py-1 rounded hover:bg-accent flex items-center gap-1.5", p.id === activeId ? "bg-[#011F5B]/10" : ""].join(" ")}
              >
                <span className="font-semibold truncate">{p.dean}</span>
                {(p as { roleType?: string }).roleType === "subdean" && <span className="text-[9px] text-muted-foreground shrink-0">assoc/vice</span>}
                {p.isInterim && <span className="text-[9px] text-[#A31F34] shrink-0">interim</span>}
              </button>
            ))}
          </div>
          {tip.pinned && (
            <button onClick={() => setTip(null)} className="w-full mt-0.5 text-[10px] text-muted-foreground hover:text-foreground">close</button>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ResultsMapBase);
