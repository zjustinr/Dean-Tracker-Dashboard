import { useMemo, useState } from "react";
import * as RSM from "react-simple-maps";
import type { CareerStep } from "@/data/enrichment";
import careerGeo from "@/data/career-geo.json";

const { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } = RSM;
type Hover = { kind: "career"; num: number; role: string; org: string; place: string; years: string } | { kind: "alma"; school: string; level: string; state: string };
// Line ships in react-simple-maps v3 at runtime but is missing from the installed types.
const Line = (RSM as unknown as { Line: React.FC<any> }).Line;

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

type Geo = { city: string; state: string; country: string; lat: number | null; lng: number | null };
const GEO: Record<string, Geo> = careerGeo as unknown as Record<string, Geo>;
const norm = (s: string) => s.toLowerCase().trim();

interface Located { num: number; role: string; org: string; years: string; geo: Geo; isCurrent: boolean; lat: number; lng: number; x: number; y: number }

export interface TenureInfo {
  sitting: boolean;
  currentTenure: number | null;
  median: number | null;
  p75: number | null;
  personalAvg: number | null;
  cohortN: number;
}

export interface Root { school: string; state: string; level: string; lat: number | null; lng: number | null }

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3959, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * A leader's career movement across the US plus a qualitative read for headhunters:
 * how often they relocate, how far they range, where their center of gravity sits,
 * and a tenure-based movability rating (current time in role vs the cohort's
 * completed-tenure distribution). All statistical, no map coordinate is invented.
 */
export default function CareerMap({ steps, tenure, roots }: { steps: CareerStep[]; tenure?: TenureInfo; roots?: Root[] }) {
  const { located, unlocated } = useMemo(() => {
    const loc: Located[] = [];
    const un: { num: number; org: string }[] = [];
    steps.forEach((s, i) => {
      const org = s.org || "";
      const g = org ? GEO[norm(org)] : undefined;
      const isCurrent = /\b(present|current)\b/i.test(s.years || "") || i === steps.length - 1;
      if (g && g.country === "US" && g.lat != null && g.lng != null) loc.push({ num: i + 1, role: s.role, org, years: s.years || "", geo: g, isCurrent, lat: g.lat, lng: g.lng, x: g.lng, y: g.lat });
      else if (org) un.push({ num: i + 1, org });
    });
    const groups = new Map<string, Located[]>();
    for (const p of loc) {
      const key = `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`;
      (groups.get(key) || groups.set(key, []).get(key)!).push(p);
    }
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;
      const step = 0.55, cLat = grp[0].lat, cLng = grp[0].lng;
      grp.forEach((p, k) => { const a = (2 * Math.PI * k) / grp.length - Math.PI / 2; p.y = cLat + Math.sin(a) * step; p.x = cLng + Math.cos(a) * step * 1.3; });
    }
    return { located: loc, unlocated: un };
  }, [steps]);

  const stats = useMemo(() => {
    if (!located.length) return null;
    const key = (p: Located) => `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`;
    const metros = new Set(located.map(key));
    let relocations = 0;
    for (let i = 1; i < located.length; i++) if (key(located[i]) !== key(located[i - 1])) relocations++;
    let maxDist = 0;
    for (let i = 0; i < located.length; i++) for (let j = i + 1; j < located.length; j++) maxDist = Math.max(maxDist, miles(located[i], located[j]));
    const stateCount = new Map<string, number>();
    for (const p of located) stateCount.set(p.geo.state, (stateCount.get(p.geo.state) || 0) + 1);
    const modalState = [...stateCount.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const move = metros.size === 1 ? "Never relocated" : relocations <= 1 ? "Relocated once" : relocations <= 2 ? "Occasional mover" : "Frequent mover";
    const reach = maxDist < 100 ? "Local footprint" : maxDist < 500 ? "Regional reach" : maxDist < 1500 ? "Multi-region reach" : "Coast-to-coast reach";
    const anchor = metros.size === 1
      ? `${located[0].geo.city}, ${located[0].geo.state}`
      : `mostly ${modalState}, across ${stateCount.size} states`;
    return { metros: metros.size, relocations, states: stateCount.size, maxDist: Math.round(maxDist), move, reach, anchor };
  }, [located]);

  const rating = useMemo(() => {
    const t = tenure;
    if (!t || !t.sitting || t.currentTenure == null || t.median == null) return null;
    const ct = t.currentTenure;
    const own = t.personalAvg != null ? ` · usually stays ~${Math.round(t.personalAvg)} yr${Math.round(t.personalAvg) === 1 ? "" : "s"}` : "";
    if (t.p75 != null && ct >= t.p75)
      return { label: "Ripe to move", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", reason: `${ct} yrs in role, past the 75th-pct (${t.p75} yrs) for this cohort${own}` };
    if (ct >= t.median || (t.personalAvg != null && ct >= t.personalAvg))
      return { label: "Could move", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", reason: `${ct} yrs in role, near the typical ${t.median} yrs${own}` };
    return { label: "Not up to move", cls: "bg-muted text-muted-foreground", reason: `${ct} yrs in role, below the typical ${t.median} yrs${own}` };
  }, [tenure]);

  // Alma-mater / prior-training geography: flag when a leader studied where they
  // later worked (home-turf roots) or has alumni ties to their current base.
  const ties = useMemo(() => {
    if (!roots || !roots.length || !located.length) return null;
    const onPath = roots.filter((r) => r.lat != null && r.lng != null && located.some((p) => miles(p, { lat: r.lat as number, lng: r.lng as number }) < 40));
    const currentState = (located.find((p) => p.isCurrent) || located[located.length - 1]).geo.state;
    const studied = [...new Set(roots.map((r) => r.state))];
    let text: string;
    if (onPath.length) text = `Home-turf roots: trained at ${onPath.map((r) => r.school).join(" & ")}, where they also worked`;
    else if (roots.some((r) => r.state === currentState)) {
      const r = roots.find((x) => x.state === currentState)!;
      text = `Alumni ties to ${currentState} (studied at ${r.school})`;
    } else text = `Trained away from current base (studied in ${studied.join(", ")})`;
    return { text };
  }, [roots, located]);

  const [pos, setPos] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: [-96, 38], zoom: 1 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  if (!located.length) return null;

  const z = pos.zoom;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="relative" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button onClick={() => setPos((p) => ({ ...p, zoom: Math.min(p.zoom * 1.6, 12) }))} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom in">+</button>
          <button onClick={() => setPos((p) => ({ ...p, zoom: Math.max(p.zoom / 1.6, 1) }))} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom out">&minus;</button>
          <button onClick={() => setPos({ coordinates: [-96, 38], zoom: 1 })} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-xs shadow-sm" aria-label="Reset">&#8635;</button>
        </div>
        {hover && (
          <div className="absolute z-20 pointer-events-none bg-card border border-border rounded-md shadow-lg px-2.5 py-1.5 text-[11px] max-w-[220px]"
            style={{ left: tip.x + 12, top: tip.y - 8, transform: tip.x > 340 ? "translateX(-108%)" : undefined }}>
            {hover.kind === "career" ? (
              <>
                <p className="font-semibold leading-tight"><span className="text-[#011F5B] dark:text-[#9db6ee]">{hover.num}.</span> {hover.role}</p>
                <p className="text-muted-foreground leading-tight">{hover.org}</p>
                <p className="text-muted-foreground leading-tight">{hover.place}{hover.years ? ` · ${hover.years}` : ""}</p>
              </>
            ) : (
              <>
                <p className="font-semibold leading-tight"><span className="text-[#E8A33D]">◌</span> {hover.school}</p>
                <p className="text-muted-foreground leading-tight">Alma mater{hover.level ? ` · ${hover.level}` : ""}{hover.state ? ` · ${hover.state}` : ""}</p>
              </>
            )}
          </div>
        )}
        <ComposableMap projection="geoAlbersUsa" projectionConfig={{ scale: 620 }} style={{ width: "100%", height: "auto" }} viewBox="0 0 800 500">
          <ZoomableGroup center={pos.coordinates} zoom={pos.zoom} minZoom={1} maxZoom={12} onMoveEnd={setPos}>
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => (
                  <Geography key={geo.rsmKey || geo.id} geography={geo} fill="#94a3b8" stroke="hsl(var(--card))" strokeWidth={0.6 / z}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
                ))
              }
            </Geographies>
            {located.slice(1).map((p, i) => (
              <Line key={`l${i}`} from={[located[i].x, located[i].y]} to={[p.x, p.y]}
                stroke="hsl(var(--primary))" strokeWidth={1.8 / z} strokeOpacity={0.6} strokeLinecap="round" strokeDasharray={`${5 / z} ${3 / z}`} />
            ))}
            {(roots || []).filter((r) => r.lat != null && r.lng != null).map((r, i) => (
              <Marker key={`alma${i}`} coordinates={[r.lng as number, r.lat as number]}
                onMouseEnter={() => setHover({ kind: "alma", school: r.school, level: r.level, state: r.state })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle r={7 / z} fill="white" fillOpacity={0.01} stroke="#E8A33D" strokeWidth={2 / z} />
              </Marker>
            ))}
            {located.map((p) => (
              <Marker key={p.num} coordinates={[p.x, p.y]}
                onMouseEnter={() => setHover({ kind: "career", num: p.num, role: p.role, org: p.org, place: `${p.geo.city}, ${p.geo.state}`, years: p.years })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle r={9 / z} fill={p.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} stroke="white" strokeWidth={1.5 / z} />
                <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10 / z, fontWeight: 700, fill: "white", pointerEvents: "none" }}>{p.num}</text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>

      <div className="px-3 py-2 border-t border-border text-left">
        {rating && (
          <div className="mb-1.5">
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{rating.reason}</p>
          </div>
        )}
        {stats && (
          <div className="text-[11px] text-foreground/90 space-y-0.5">
            <p><span className="text-muted-foreground">Moves:</span> {stats.move} ({stats.relocations} relocation{stats.relocations === 1 ? "" : "s"})</p>
            <p><span className="text-muted-foreground">Reach:</span> {stats.reach} (~{stats.maxDist.toLocaleString()} mi)</p>
            <p><span className="text-muted-foreground">Center of gravity:</span> {stats.anchor}</p>
            {ties && <p><span className="text-muted-foreground">Roots &amp; ties:</span> {ties.text}</p>}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
          {located.length} US stop{located.length === 1 ? "" : "s"}, numbered by step. Hover a dot for role and years; zoom with +/&minus;{roots && roots.length ? "; amber ring = alma mater" : ""}.
          {unlocated.length > 0 && ` Not shown: ${unlocated.map((u) => `#${u.num} ${u.org}`).join(", ")}.`}
        </p>
        {rating && (
          <p className="text-[9px] text-muted-foreground/80 mt-1 italic leading-snug">
            Statistical signal only. Ignores personal circumstances, satisfaction, and unadvertised opportunities.
          </p>
        )}
      </div>
    </div>
  );
}
