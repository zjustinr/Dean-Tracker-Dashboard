import { useState, useMemo } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import jobData from "@/data/jobmarket.json";
import { Badge } from "@/components/ui/badge";

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

interface JobListing {
  id: number;
  university: string;
  school: string | null;
  notes: string | null;
  searchFirm: string | null;
  dateStarted: string | null;
  newsUrl: string | null;
  positionDescription: string | null;
  positionUrl: string | null;
  lat: number | null;
  lng: number | null;
  departingDean: string | null;
  reason: string | null;
  city: string | null;
  state: string | null;
  type: string | null;
  rank: number | null;
  totalFaculty: number | null;
}

const listings: JobListing[] = jobData as JobListing[];

function formatDate(d: string | null): string {
  if (!d) return "–";
  try {
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return d;
  }
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  try {
    const start = new Date(d + "T00:00:00").getTime();
    const now = Date.now();
    return Math.floor((now - start) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

type StatusKey = "active" | "firm" | "interim" | "underway" | "opening";

function getStatusInfo(listing: JobListing): { label: string; color: string; bgClass: string; markerColor: string; key: StatusKey } {
  if (listing.searchFirm && listing.dateStarted) {
    const days = daysSince(listing.dateStarted);
    if (days !== null && days < 90) return { label: "Active Search", color: "text-green-700 dark:text-green-400", bgClass: "bg-green-100 dark:bg-green-900/40", markerColor: "#22c55e", key: "active" };
    return { label: "Active Search", color: "text-blue-700 dark:text-blue-400", bgClass: "bg-blue-100 dark:bg-blue-900/40", markerColor: "#3b82f6", key: "active" };
  }
  if (listing.searchFirm) return { label: "Search Firm Engaged", color: "text-blue-700 dark:text-blue-400", bgClass: "bg-blue-100 dark:bg-blue-900/40", markerColor: "#3b82f6", key: "firm" };
  if (listing.notes?.toLowerCase().includes("interim")) return { label: "Interim in Place", color: "text-amber-700 dark:text-amber-400", bgClass: "bg-amber-100 dark:bg-amber-900/40", markerColor: "#f59e0b", key: "interim" };
  if (listing.dateStarted) return { label: "Search Underway", color: "text-green-700 dark:text-green-400", bgClass: "bg-green-100 dark:bg-green-900/40", markerColor: "#22c55e", key: "underway" };
  return { label: "Opening", color: "text-gray-700 dark:text-gray-400", bgClass: "bg-gray-100 dark:bg-gray-800", markerColor: "#9ca3af", key: "opening" };
}

const LEGEND_ITEMS = [
  { color: "#22c55e", label: "Active Search" },
  { color: "#3b82f6", label: "Search Firm Engaged" },
  { color: "#f59e0b", label: "Interim in Place" },
  { color: "#9ca3af", label: "Opening" },
];

function getBubbleRadius(faculty: number | null, isSelected: boolean): number {
  if (!faculty) return isSelected ? 7 : 5;
  const minR = 5, maxR = 14;
  const minF = 50, maxF = 200;
  const clamped = Math.max(minF, Math.min(maxF, faculty));
  const r = minR + ((clamped - minF) / (maxF - minF)) * (maxR - minR);
  return isSelected ? r + 2 : r;
}

function JobMarketMap({ filtered, onSelect, selectedId }: { filtered: JobListing[]; onSelect: (l: JobListing) => void; selectedId: number | null }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; listing: JobListing } | null>(null);

  const mappable = filtered.filter(l => l.lat !== null && l.lng !== null);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm font-medium">{mappable.length} of {filtered.length} positions on map</p>
        <div className="flex gap-3 flex-wrap items-center">
          {LEGEND_ITEMS.map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: item.color }} />
              <span className="text-[10px] text-muted-foreground">{item.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-2 pl-2 border-l border-border">
            <svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="#9ca3af" /></svg>
            <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#9ca3af" /></svg>
            <span className="text-[10px] text-muted-foreground">Faculty size</span>
          </div>
        </div>
      </div>
      <div className="relative" style={{ height: 420 }}>
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 900 }}
          width={800}
          height={420}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rpiKey || geo.properties?.name}
                    geography={geo}
                    fill="#e5e7eb"
                    stroke="#fff"
                    strokeWidth={0.5}
                    style={{ default: { outline: "none" }, hover: { outline: "none" }, pressed: { outline: "none" } }}
                  />
                ))
              }
            </Geographies>
            {mappable.map(listing => {
              const status = getStatusInfo(listing);
              const isSelected = selectedId === listing.id;
              const r = getBubbleRadius(listing.totalFaculty, isSelected);
              return (
                <Marker
                  key={listing.id}
                  coordinates={[listing.lng!, listing.lat!]}
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
                    if (rect) {
                      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10, listing });
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onSelect(listing)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    r={r}
                    fill={status.markerColor}
                    stroke={isSelected ? "#000" : "#fff"}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                    opacity={0.85}
                  />
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-card border border-border rounded-lg shadow-lg px-3 py-2.5 z-50 min-w-[200px]"
            style={{ left: tooltip.x, top: tooltip.y, transform: "translate(-50%, -100%)" }}
          >
            <p className="text-xs font-bold">{tooltip.listing.university}</p>
            {tooltip.listing.school && <p className="text-[10px] text-muted-foreground">{tooltip.listing.school}</p>}
            <div className="mt-1.5 space-y-0.5">
              <p className="text-[10px]" style={{ color: getStatusInfo(tooltip.listing).markerColor }}>
                {getStatusInfo(tooltip.listing).label}
              </p>
              {tooltip.listing.city && tooltip.listing.state && (
                <p className="text-[10px] text-muted-foreground">{tooltip.listing.city}, {tooltip.listing.state}</p>
              )}
              {tooltip.listing.type && (
                <p className="text-[10px] text-muted-foreground">{tooltip.listing.type}{tooltip.listing.rank ? ` · Rank #${tooltip.listing.rank}` : ""}</p>
              )}
              {tooltip.listing.totalFaculty && (
                <p className="text-[10px] text-muted-foreground">{tooltip.listing.totalFaculty} faculty</p>
              )}
              {tooltip.listing.departingDean && (
                <p className="text-[10px] text-muted-foreground">Departing: {tooltip.listing.departingDean}</p>
              )}
              {tooltip.listing.reason && (
                <p className="text-[10px] text-muted-foreground italic">{tooltip.listing.reason}</p>
              )}
              {tooltip.listing.searchFirm && (
                <p className="text-[10px] text-muted-foreground">Firm: {tooltip.listing.searchFirm}</p>
              )}
              {tooltip.listing.dateStarted && (
                <p className="text-[10px] text-muted-foreground">Search started: {formatDate(tooltip.listing.dateStarted)}</p>
              )}
            </div>
          </div>
        )}
      </div>
      {filtered.length > mappable.length && (
        <div className="px-5 py-2 border-t border-border bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {filtered.length - mappable.length} position{filtered.length - mappable.length !== 1 ? "s" : ""} not shown (international):
            {" "}{filtered.filter(l => l.lat === null).map(l => l.university).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LiveJobMarket() {
  const [search, setSearch] = useState("");
  const [firmFilter, setFirmFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [view, setView] = useState<"map" | "list">("map");

  const firms = useMemo(() => {
    const set = new Set<string>();
    listings.forEach(l => { if (l.searchFirm) set.add(l.searchFirm); });
    return [...set].sort();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return listings.filter(l => {
      if (q) {
        const text = `${l.university} ${l.school || ""} ${l.notes || ""} ${l.searchFirm || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      if (firmFilter !== "all") {
        if (firmFilter === "none" && l.searchFirm) return false;
        if (firmFilter !== "none" && l.searchFirm !== firmFilter) return false;
      }
      if (statusFilter !== "all") {
        const status = getStatusInfo(l);
        if (statusFilter === "active" && status.label !== "Active Search" && status.label !== "Search Underway") return false;
        if (statusFilter === "interim" && status.label !== "Interim in Place") return false;
        if (statusFilter === "opening" && status.label !== "Opening") return false;
      }
      return true;
    });
  }, [search, firmFilter, statusFilter]);

  const withFirm = listings.filter(l => l.searchFirm).length;
  const withNews = listings.filter(l => l.newsUrl).length;
  const recentSearches = listings.filter(l => {
    if (!l.dateStarted) return false;
    const days = daysSince(l.dateStarted);
    return days !== null && days < 180;
  }).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-primary">{listings.length}</p>
          <p className="text-xs text-muted-foreground mt-1">Open Positions</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{withFirm}</p>
          <p className="text-xs text-muted-foreground mt-1">Search Firm Engaged</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{recentSearches}</p>
          <p className="text-xs text-muted-foreground mt-1">Searches Started (6 mo)</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{withNews}</p>
          <p className="text-xs text-muted-foreground mt-1">With News Coverage</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Search</label>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by university, school, or notes..."
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Search Firm</label>
            <select
              value={firmFilter}
              onChange={e => setFirmFilter(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All</option>
              {firms.map(f => <option key={f} value={f}>{f}</option>)}
              <option value="none">No Firm Listed</option>
            </select>
          </div>
          <div className="min-w-[140px]">
            <label className="text-xs font-medium text-muted-foreground block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">All</option>
              <option value="active">Active Search</option>
              <option value="interim">Interim in Place</option>
              <option value="opening">Opening</option>
            </select>
          </div>
          <div className="flex items-end gap-1">
            <button
              onClick={() => setView("map")}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${view === "map" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            >
              Map
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors ${view === "list" ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
            >
              List
            </button>
          </div>
          {(search || firmFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => { setSearch(""); setFirmFilter("all"); setStatusFilter("all"); }}
              className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {view === "map" && (
        <JobMarketMap
          filtered={filtered}
          onSelect={l => setExpandedId(expandedId === l.id ? null : l.id)}
          selectedId={expandedId}
        />
      )}

      {(view === "map" && expandedId) && (() => {
        const listing = listings.find(l => l.id === expandedId);
        if (!listing) return null;
        const status = getStatusInfo(listing);
        return (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold">{listing.university}</h3>
                {listing.school && <p className="text-sm text-muted-foreground">{listing.school}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`${status.bgClass} ${status.color} border-0 text-[11px]`}>{status.label}</Badge>
                <button onClick={() => setExpandedId(null)} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="grid grid-cols-[130px_1fr] gap-y-1.5">
                {listing.departingDean && (
                  <>
                    <span className="text-muted-foreground font-medium">Departing Dean</span>
                    <span>{listing.departingDean}</span>
                  </>
                )}
                {listing.reason && (
                  <>
                    <span className="text-muted-foreground font-medium">Reason</span>
                    <span>{listing.reason}</span>
                  </>
                )}
                <span className="text-muted-foreground font-medium">Search Firm</span>
                <span>{listing.searchFirm || "Not stated"}</span>
                <span className="text-muted-foreground font-medium">Search Started</span>
                <span>{formatDate(listing.dateStarted)}</span>
              </div>
              <div className="grid grid-cols-[130px_1fr] gap-y-1.5">
                {listing.city && listing.state && (
                  <>
                    <span className="text-muted-foreground font-medium">Location</span>
                    <span>{listing.city}, {listing.state}</span>
                  </>
                )}
                {listing.type && (
                  <>
                    <span className="text-muted-foreground font-medium">Type</span>
                    <span>{listing.type}{listing.rank ? ` · Rank #${listing.rank}` : ""}</span>
                  </>
                )}
                {listing.totalFaculty && (
                  <>
                    <span className="text-muted-foreground font-medium">Faculty Size</span>
                    <span>{listing.totalFaculty}</span>
                  </>
                )}
                {listing.notes && (
                  <>
                    <span className="text-muted-foreground font-medium">Notes</span>
                    <span className="text-xs">{listing.notes}</span>
                  </>
                )}
              </div>
            </div>
            {(listing.newsUrl || listing.positionUrl || listing.positionDescription) && (
              <div className="flex gap-3 mt-3 flex-wrap">
                {listing.newsUrl && (
                  <a href={listing.newsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                    News Article
                  </a>
                )}
                {listing.positionUrl && (
                  <a href={listing.positionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                    Position Description
                  </a>
                )}
                {listing.positionDescription && !listing.positionUrl && (
                  <span className="text-xs text-muted-foreground italic">{listing.positionDescription}</span>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {view === "list" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
            <p className="text-sm font-medium">{filtered.length} position{filtered.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">Click a row to expand details</p>
          </div>
          <div className="divide-y divide-border">
            {filtered.map(listing => {
              const status = getStatusInfo(listing);
              const isExpanded = expandedId === listing.id;

              return (
                <div key={listing.id}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : listing.id)}
                    className="w-full text-left px-5 py-4 hover:bg-accent/30 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold">{listing.university}</h3>
                          {listing.school && (
                            <span className="text-sm text-muted-foreground">– {listing.school}</span>
                          )}
                        </div>
                        {listing.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{listing.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={`${status.bgClass} ${status.color} border-0 text-[11px]`}>
                          {status.label}
                        </Badge>
                        <svg
                          width="16" height="16" viewBox="0 0 16 16" fill="none"
                          className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        >
                          <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4 bg-accent/10">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm pt-1">
                        <div className="grid grid-cols-[130px_1fr] gap-y-1.5">
                          <span className="text-muted-foreground font-medium">University</span>
                          <span className="font-semibold">{listing.university}</span>
                          <span className="text-muted-foreground font-medium">School</span>
                          <span>{listing.school || "–"}</span>
                          {listing.departingDean && (
                            <>
                              <span className="text-muted-foreground font-medium">Departing Dean</span>
                              <span>{listing.departingDean}</span>
                            </>
                          )}
                          {listing.reason && (
                            <>
                              <span className="text-muted-foreground font-medium">Reason</span>
                              <span>{listing.reason}</span>
                            </>
                          )}
                          <span className="text-muted-foreground font-medium">Search Firm</span>
                          <span>{listing.searchFirm || "Not stated"}</span>
                          <span className="text-muted-foreground font-medium">Search Started</span>
                          <span>{formatDate(listing.dateStarted)}</span>
                        </div>
                        <div className="grid grid-cols-[130px_1fr] gap-y-1.5">
                          <span className="text-muted-foreground font-medium">Status</span>
                          <span className={status.color}>{status.label}</span>
                          {listing.city && listing.state && (
                            <>
                              <span className="text-muted-foreground font-medium">Location</span>
                              <span>{listing.city}, {listing.state}</span>
                            </>
                          )}
                          {listing.type && (
                            <>
                              <span className="text-muted-foreground font-medium">Type</span>
                              <span>{listing.type}{listing.rank ? ` · Rank #${listing.rank}` : ""}</span>
                            </>
                          )}
                          {listing.totalFaculty && (
                            <>
                              <span className="text-muted-foreground font-medium">Faculty Size</span>
                              <span>{listing.totalFaculty}</span>
                            </>
                          )}
                          {listing.notes && (
                            <>
                              <span className="text-muted-foreground font-medium">Notes</span>
                              <span className="text-xs">{listing.notes}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-3 mt-3 flex-wrap">
                        {listing.newsUrl && (
                          <a href={listing.newsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
                            News Article
                          </a>
                        )}
                        {listing.positionUrl && (
                          <a href={listing.positionUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                            Position Description
                          </a>
                        )}
                        {listing.positionDescription && !listing.positionUrl && (
                          <span className="text-xs text-muted-foreground italic">{listing.positionDescription}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">No positions match your filters.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center">
        Data sourced from Poets & Quants, Chronicle of Higher Education, AACSB, university announcements, and other public sources. Last updated: March 2026.
      </div>
    </div>
  );
}
