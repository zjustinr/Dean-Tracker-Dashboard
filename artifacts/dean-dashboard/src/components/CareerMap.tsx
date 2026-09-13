import { useMemo, useState } from "react";
import * as RSM from "react-simple-maps";
import type { CareerStep } from "@/data/enrichment";
import careerGeo from "@/data/career-geo.json";
import { MOVABILITY_BANDS, MOVABILITY_CHANGELOG, MOVABILITY_COPY, MOVABILITY_EVIDENCE, MOVABILITY_VERSION, movabilityBand } from "@/data/movability";
import type { TenureInfo } from "@/data/movability";
import { MovabilityGaugeIcon } from "./MovabilityGaugeIcon";

const { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } = RSM;
type Hover = { kind: "career"; num: number; role: string; org: string; place: string; years: string } | { kind: "alma"; school: string; level: string; state: string | null };
// Line ships in react-simple-maps v3 at runtime but is missing from the installed types.
const Line = (RSM as unknown as { Line: React.FC<any> }).Line;

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const WORLD_GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type Geo = { city: string; state: string; country: string; lat: number | null; lng: number | null };
const GEO: Record<string, Geo> = careerGeo as unknown as Record<string, Geo>;
const norm = (s: string) => s.toLowerCase().trim();

// geoAlbersUsa only projects the 50 states + DC; US territories and any non-US
// point project to null, which throws inside <Marker>/<Line> and blanks the page.
// Every plotted coordinate (career steps AND alma-mater rings) must pass this.
//
// The country field is NOT enough on its own. `career-roots.json` omits `country`
// on 21,387 of its 22,961 located roots, so `country ?? "US"` reads a Toulouse or
// Mannheim alma mater as American -- 801 roots corpus-wide pass a country-only
// check and then project to null. That is not a cosmetic bug: one such root on
// one profile throws inside <Marker> and blanks the whole page, which is what
// took out the "View full profile" path off Meet a Leader.
//
// So the coordinate itself is the authority. geoAlbersUsa's domain is the
// contiguous states plus the Alaska and Hawaii insets, and these boxes are
// deliberately drawn a little tight: a point wrongly excluded silently goes
// unplotted, a point wrongly included takes the page down.
const US_TERRITORIES = new Set(["PR", "GU", "VI", "MP", "AS"]);
const inAlbersUsa = (lat: number, lng: number) =>
  (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66.5) ||   // contiguous + DC
  (lat >= 51 && lat <= 72 && lng >= -170 && lng <= -129) ||    // Alaska inset
  (lat >= 18.8 && lat <= 22.5 && lng >= -160.5 && lng <= -154.5); // Hawaii inset
const projectableUS = (country: string | null | undefined, state: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined): lat is number =>
  (country ?? "US") === "US" && lat != null && lng != null &&
  !US_TERRITORIES.has((state || "").toUpperCase()) && inAlbersUsa(lat, lng);

interface Located { num: number; role: string; org: string; years: string; geo: Geo; isCurrent: boolean; lat: number; lng: number; x: number; y: number }

// The movability inputs and band definition live in src/data/movability.ts, so
// every surface that shows the chip reads the same bands off the same numbers.
export type { TenureInfo };

// state is null for derived roots whose alma mater has no US state (foreign or
// unresolved institutions) -- career-roots.json started carrying those in Aug 2026,
// and every consumer already guards (.filter(Boolean), projectableUS, hover?.state).
export interface Root { school: string; state: string | null; level: string; country?: string; lat: number | null; lng: number | null }

function miles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3959, r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Shared analysis so the map and the assessment can render as separate, adjacent
// components (map on the right, read on the left) while computing from the same data.
// Exported so other surfaces (e.g. ScoutAssistant's compact per-row badge) can pull
// just the `rating` without rendering the full CareerAssessment block.
export function useCareerAnalysis(steps: CareerStep[], tenure: TenureInfo | undefined, roots: Root[] | undefined) {
  const { located, worldLocated, unlocated, useWorld } = useMemo(() => {
    const us: Located[] = [];
    const world: Located[] = [];
    const un: { num: number; org: string }[] = [];
    steps.forEach((s, i) => {
      const org = s.org || "";
      const g = org ? GEO[norm(org)] : undefined;
      const isCurrent = /\b(present|current)\b/i.test(s.years || "") || i === steps.length - 1;
      if (g && g.lat != null && g.lng != null) {
        const base: Located = { num: i + 1, role: s.role, org, years: s.years || "", geo: g, isCurrent, lat: g.lat, lng: g.lng, x: g.lng, y: g.lat };
        world.push({ ...base });
        if (projectableUS(g.country, g.state, g.lat, g.lng)) us.push({ ...base });
      } else if (org) un.push({ num: i + 1, org });
    });
    // Fan out co-located dots so overlapping stops stay legible.
    const jitter = (arr: Located[]) => {
      const groups = new Map<string, Located[]>();
      for (const p of arr) { const key = `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`; (groups.get(key) || groups.set(key, []).get(key)!).push(p); }
      for (const grp of groups.values()) {
        if (grp.length < 2) continue;
        const step = 0.55, cLat = grp[0].lat, cLng = grp[0].lng;
        grp.forEach((p, k) => { const a = (2 * Math.PI * k) / grp.length - Math.PI / 2; p.y = cLat + Math.sin(a) * step; p.x = cLng + Math.cos(a) * step * 1.3; });
      }
    };
    jitter(us); jitter(world);
    // Switch to a world map when a stop can't sit on the US Albers projection
    // (a foreign country, or a US territory like PR/Guam that Albers can't place).
    return { located: us, worldLocated: world, unlocated: un, useWorld: world.length > us.length };
  }, [steps]);

  const stats = useMemo(() => {
    const pts = worldLocated;
    if (!pts.length) return null;
    const key = (p: Located) => `${p.lat.toFixed(1)},${p.lng.toFixed(1)}`;
    const metros = new Set(pts.map(key));
    let relocations = 0;
    for (let i = 1; i < pts.length; i++) if (key(pts[i]) !== key(pts[i - 1])) relocations++;
    let maxDist = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) maxDist = Math.max(maxDist, miles(pts[i], pts[j]));
    const countries = new Set(pts.map((p) => p.geo.country || "US"));
    const stateCount = new Map<string, number>();
    for (const p of pts) if ((p.geo.country || "US") === "US" && p.geo.state) stateCount.set(p.geo.state, (stateCount.get(p.geo.state) || 0) + 1);
    const modalState = [...stateCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
    const intl = countries.size > 1;
    const move = metros.size === 1 ? "Never relocated" : relocations <= 1 ? "Relocated once" : relocations <= 2 ? "Occasional mover" : "Frequent mover";
    const reach = intl ? "International reach" : maxDist < 100 ? "Local footprint" : maxDist < 500 ? "Regional reach" : maxDist < 1500 ? "Multi-region reach" : "Coast-to-coast reach";
    const anchor = intl
      ? `${modalState ? `mostly ${modalState}, ` : ""}spanning ${countries.size} countries`
      : metros.size === 1 ? `${pts[0].geo.city}, ${pts[0].geo.state}` : `mostly ${modalState}, across ${stateCount.size} states`;
    return { metros: metros.size, relocations, states: stateCount.size, maxDist: Math.round(maxDist), move, reach, anchor };
  }, [worldLocated]);

  const rating = useMemo(() => movabilityBand(tenure), [tenure]);

  const ties = useMemo(() => {
    if (!roots || !roots.length || !worldLocated.length) return null;
    const onPath = roots.filter((r) => r.lat != null && r.lng != null && worldLocated.some((p) => miles(p, { lat: r.lat as number, lng: r.lng as number }) < 40));
    const currentState = (worldLocated.find((p) => p.isCurrent) || worldLocated[worldLocated.length - 1]).geo.state;
    const studied = [...new Set(roots.map((r) => r.state).filter(Boolean))];
    let text: string;
    if (onPath.length) text = `Home-turf roots: trained at ${onPath.map((r) => r.school).join(" & ")}, where they also worked`;
    else if (currentState && roots.some((r) => r.state === currentState)) { const r = roots.find((x) => x.state === currentState)!; text = `Alumni ties to ${currentState} (studied at ${r.school})`; }
    else text = studied.length ? `Trained away from current base (studied in ${studied.join(", ")})` : "Trained outside the US";
    return { text };
  }, [roots, worldLocated]);

  return { located, worldLocated, unlocated, useWorld, stats, rating, ties };
}

/**
 * The movement MAP only: numbered dots (earliest = 1), connecting lines in time
 * order, alma-mater rings, zoom, and hover tooltips. The qualitative read is a
 * separate <CareerAssessment> so it can sit flush beside the map.
 */
export default function CareerMap({ steps, roots }: { steps: CareerStep[]; roots?: Root[] }) {
  const { located, worldLocated, unlocated, useWorld } = useCareerAnalysis(steps, undefined, roots);
  const points = useWorld ? worldLocated : located;
  const almaRoots = (roots || []).filter((r) => useWorld ? r.lat != null && r.lng != null : projectableUS(r.country, r.state, r.lat, r.lng));
  const home: [number, number] = useWorld ? [10, 25] : [-96, 38];
  const [pos, setPos] = useState<{ coordinates: [number, number]; zoom: number }>({ coordinates: home, zoom: 1 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  if (!points.length) return null;
  const z = pos.zoom;
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="relative" onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: e.clientX - r.left, y: e.clientY - r.top }); }}>
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1">
          <button onClick={() => setPos((p) => ({ ...p, zoom: Math.min(p.zoom * 1.6, 12) }))} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom in">+</button>
          <button onClick={() => setPos((p) => ({ ...p, zoom: Math.max(p.zoom / 1.6, 1) }))} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-sm font-bold shadow-sm" aria-label="Zoom out">&minus;</button>
          <button onClick={() => setPos({ coordinates: home, zoom: 1 })} className="w-6 h-6 rounded bg-card border border-border text-foreground hover:bg-muted flex items-center justify-center text-xs shadow-sm" aria-label="Reset">&#8635;</button>
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
        <ComposableMap projection={useWorld ? "geoEqualEarth" : "geoAlbersUsa"} projectionConfig={{ scale: useWorld ? 150 : 620 }} style={{ width: "100%", height: "auto" }} viewBox="0 0 800 500">
          <ZoomableGroup center={pos.coordinates} zoom={pos.zoom} minZoom={1} maxZoom={12} onMoveEnd={setPos}>
            <Geographies geography={useWorld ? WORLD_GEO_URL : GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => (
                  <Geography key={geo.rsmKey || geo.id} geography={geo} fill="#94a3b8" stroke="hsl(var(--card))" strokeWidth={0.6 / z}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }} />
                ))
              }
            </Geographies>
            {points.slice(1).map((p, i) => (
              <Line key={`l${i}`} from={[points[i].x, points[i].y]} to={[p.x, p.y]}
                stroke="hsl(var(--primary))" strokeWidth={1.8 / z} strokeOpacity={0.6} strokeLinecap="round" strokeDasharray={`${5 / z} ${3 / z}`} />
            ))}
            {almaRoots.map((r, i) => (
              <Marker key={`alma${i}`} coordinates={[r.lng as number, r.lat as number]}
                onMouseEnter={() => setHover({ kind: "alma", school: r.school, level: r.level, state: r.state })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle r={7 / z} fill="white" fillOpacity={0.01} stroke="#E8A33D" strokeWidth={2 / z} />
              </Marker>
            ))}
            {points.map((p) => (
              <Marker key={p.num} coordinates={[p.x, p.y]}
                onMouseEnter={() => setHover({ kind: "career", num: p.num, role: p.role, org: p.org, place: `${p.geo.city}, ${p.geo.state || p.geo.country}`, years: p.years })} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
                <circle r={9 / z} fill={p.isCurrent ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"} stroke="white" strokeWidth={1.5 / z} />
                <text textAnchor="middle" dominantBaseline="central" style={{ fontSize: 10 / z, fontWeight: 700, fill: "white", pointerEvents: "none" }}>{p.num}</text>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <div className="px-3 py-2 border-t border-border text-left">
        <p className="text-[10px] text-muted-foreground leading-snug">
          {points.length} career stop{points.length === 1 ? "" : "s"}, numbered by step, on a {useWorld ? "world" : "US"} map. Hover a dot for role and years; zoom with +/&minus;{roots && roots.length ? "; amber ring = alma mater" : ""}.
          {unlocated.length > 0 && ` Not shown: ${unlocated.map((u) => `#${u.num} ${u.org}`).join(", ")}.`}
        </p>
      </div>
    </div>
  );
}

/** "2026-09-06" -> "6 Sep 2026". Dates are stamps, not prose, so they stay short. */
function formatStampDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * The band definitions and the departure rate measured for each, one click from
 * any chip. A reader who wants to know what "at or past median" is worth should
 * never have to ask us for the number.
 */
function MovabilityBandTable() {
  return (
    <details className="mt-2 group">
      <summary className="text-xs font-semibold cursor-pointer text-primary hover:underline list-none">
        How the bands are measured
      </summary>
      <div className="mt-1.5 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="font-semibold pr-2 pb-1">Band</th>
              <th className="font-semibold pr-2 pb-1">Definition</th>
              <th className="font-semibold pb-1 whitespace-nowrap">Departed in 5 yrs</th>
            </tr>
          </thead>
          <tbody>
            {MOVABILITY_BANDS.map((b) => (
              <tr key={b.key} className="align-top border-t border-border">
                <td className="pr-2 py-1 font-medium whitespace-nowrap">{b.longLabel}</td>
                <td className="pr-2 py-1 text-muted-foreground">{b.definition}</td>
                <td className="py-1 tabular-nums whitespace-nowrap">{b.departedPct}</td>
              </tr>
            ))}
            <tr className="align-top border-t border-border">
              <td className="pr-2 py-1 font-medium whitespace-nowrap">All sitting leaders</td>
              <td className="pr-2 py-1 text-muted-foreground">Base rate across the measured cohort.</td>
              <td className="py-1 tabular-nums whitespace-nowrap">{MOVABILITY_EVIDENCE.baseRatePct}%</td>
            </tr>
          </tbody>
        </table>
        <p className="text-[11px] font-semibold mt-2.5 mb-1">Definition history</p>
        <ul className="text-[11px] text-muted-foreground space-y-1">
          {MOVABILITY_CHANGELOG.map((c) => (
            <li key={c.version}>
              <span className="font-medium text-foreground">v{c.version}</span>{" "}
              <span className="tabular-nums" title={c.dateNote}>
                {formatStampDate(c.date)}{c.dateNote ? "*" : ""}
              </span>{" "}
              — {c.summary}
            </li>
          ))}
        </ul>
        {MOVABILITY_CHANGELOG.some((c) => c.dateNote) && (
          <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
            * {MOVABILITY_CHANGELOG.filter((c) => c.dateNote).map((c) => `v${c.version}: ${c.dateNote}`).join("; ")}.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground mt-2 leading-snug">
          {MOVABILITY_EVIDENCE.study}: {MOVABILITY_EVIDENCE.cohortN.toLocaleString()} sitting leaders followed for{" "}
          {MOVABILITY_EVIDENCE.horizonYears} years. The one boundary is the cohort median, because that is the only one the
          measurement supports: the product used to split the upper half again at the 75th percentile, and the two halves
          it made departed at {MOVABILITY_BANDS[1].departedPct} — too close to tell apart.
        </p>
      </div>
    </details>
  );
}

/**
 * The qualitative read: movability rating, mobility, center of gravity, and
 * alma-mater ties. Rendered next to the map for immediate feedback.
 */
export function CareerAssessment({ steps, tenure, roots }: { steps: CareerStep[]; tenure?: TenureInfo; roots?: Root[] }) {
  const { located, stats, rating, ties } = useCareerAnalysis(steps, tenure, roots);
  if (!located.length) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-left">
      {rating && (
        <div className="mb-2">
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Movability Index</div>
          <div className="flex items-center gap-2.5">
            <MovabilityGaugeIcon tone={rating.tone} size={40} className="shrink-0" />
            <div className="min-w-0">
              <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${rating.cls}`}>{rating.label}</span>
              {/* The definition has moved twice, and a reading quoted last month may
                  not be the reading today. The stamp travels with the reading so the
                  difference is visible without having to ask us. */}
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                Definition v{MOVABILITY_VERSION} · {formatStampDate(MOVABILITY_CHANGELOG[0].date)}
              </p>
            </div>
          </div>
          <p className="text-sm text-foreground mt-1.5 leading-snug">{rating.reason}</p>
          {/* What the band is, what it is not, and what it is worth -- in that
              order, because the second line is the one a reader most often
              supplies wrongly for themselves. */}
          <dl className="mt-2 text-xs leading-snug space-y-0.5">
            <div><dt className="inline font-semibold">What this is: </dt><dd className="inline text-muted-foreground">{MOVABILITY_COPY.whatItIs}</dd></div>
            <div><dt className="inline font-semibold">What it is not: </dt><dd className="inline text-muted-foreground">{MOVABILITY_COPY.whatItIsNot}</dd></div>
            <div><dt className="inline font-semibold">What it is worth: </dt><dd className="inline text-muted-foreground">{MOVABILITY_COPY.whatItIsWorth}</dd></div>
          </dl>
          <MovabilityBandTable />
        </div>
      )}
      {stats && (
        <div className="text-sm text-foreground space-y-1.5">
          <p><span className="font-semibold">Moves:</span> {stats.move} ({stats.relocations} relocation{stats.relocations === 1 ? "" : "s"})</p>
          <p><span className="font-semibold">Reach:</span> {stats.reach} (~{stats.maxDist.toLocaleString()} mi)</p>
          <p><span className="font-semibold">Center of gravity:</span> {stats.anchor}</p>
          {ties && <p><span className="font-semibold">Roots &amp; ties:</span> {ties.text}</p>}
        </div>
      )}
      {rating && (
        <p className="text-xs text-muted-foreground mt-2 italic leading-snug">Statistical signal only. Ignores personal circumstances, satisfaction, and unadvertised opportunities.</p>
      )}
    </div>
  );
}
