import { useState, useMemo, useEffect, useCallback } from "react";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import jobData from "@/data/jobmarket.json";
import breakingData from "@/data/breaking-news.json";
import r1SchoolsGeo from "@/data/r1-bschool-schools.json";
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

type StatusKey = "active" | "firm" | "interim" | "underway" | "opening" | "newhire";

function getStatusInfo(listing: JobListing): { label: string; color: string; bgClass: string; markerColor: string; key: StatusKey } {
  if ((listing as JobListing & { _fromNews?: boolean })._fromNews) {
    return { label: "New Appointment", color: "text-purple-700 dark:text-purple-400", bgClass: "bg-purple-100 dark:bg-purple-900/40", markerColor: "#a855f7", key: "newhire" };
  }
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
  { color: "#a855f7", label: "New Appointment (from news)" },
];

function getBubbleRadius(faculty: number | null, isSelected: boolean): number {
  if (!faculty) return isSelected ? 11 : 9;
  const minR = 9, maxR = 20;
  const minF = 50, maxF = 200;
  const clamped = Math.max(minF, Math.min(maxF, faculty));
  const r = minR + ((clamped - minF) / (maxF - minF)) * (maxR - minR);
  return isSelected ? r + 3 : r;
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
          <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
            <svg width="14" height="14"><circle cx="7" cy="7" r="5" fill="#9ca3af" /></svg>
            <svg width="22" height="22"><circle cx="11" cy="11" r="10" fill="#9ca3af" /><text x="11" y="11" textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize="7" fontWeight="bold">#</text></svg>
            <span className="text-[10px] text-muted-foreground">Faculty size (rank in circle)</span>
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
              const isNewsHire = status.key === "newhire";
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
                    stroke={isSelected ? "#000" : isNewsHire ? "#7c3aed" : "#fff"}
                    strokeWidth={isSelected ? 2.5 : isNewsHire ? 2 : 1.5}
                    opacity={0.85}
                  />
                  {listing.rank && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={r > 12 ? 9 : 7}
                      fontWeight="bold"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {listing.rank}
                    </text>
                  )}
                  {isNewsHire && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#fff"
                      fontSize={listing.rank ? 7 : 9}
                      fontWeight="bold"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                      dy={listing.rank ? r * 0.9 : 0}
                    >
                      ★
                    </text>
                  )}
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

type ArticleCategory = "hiring" | "departure" | "search" | "general";

interface PQArticle {
  title: string;
  url: string;
  date: string;
  summary: string;
  category?: ArticleCategory;
  extractedSchool?: string | null;
  extractedDean?: string | null;
}

interface PQNewsState {
  articles: PQArticle[];
  fetchedAt: string | null;
  loading: boolean;
  error: string | null;
}

function decodeHtmlEntities(text: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

const CATEGORY_BADGE: Record<ArticleCategory, { label: string; color: string; bgClass: string }> = {
  hiring: { label: "New Hire", color: "text-purple-700 dark:text-purple-400", bgClass: "bg-purple-100 dark:bg-purple-900/40" },
  departure: { label: "Departure", color: "text-red-700 dark:text-red-400", bgClass: "bg-red-100 dark:bg-red-900/40" },
  search: { label: "Search", color: "text-blue-700 dark:text-blue-400", bgClass: "bg-blue-100 dark:bg-blue-900/40" },
  general: { label: "News", color: "text-gray-700 dark:text-gray-400", bgClass: "bg-gray-100 dark:bg-gray-800" },
};

const SCHOOL_COORDS: Record<string, { lat: number; lng: number; school: string | null; rank: number | null; totalFaculty: number | null; city: string; state: string; type: string }> = {
  "University of Pennsylvania": { lat: 39.9522, lng: -75.1932, school: "Wharton School", rank: 1, totalFaculty: 246, city: "Philadelphia", state: "PA", type: "Private" },
  "Harvard University": { lat: 42.3656, lng: -71.1228, school: "Harvard Business School", rank: 2, totalFaculty: 209, city: "Boston", state: "MA", type: "Private" },
  "University of Chicago": { lat: 41.7886, lng: -87.5987, school: "Booth School of Business", rank: 3, totalFaculty: 144, city: "Chicago", state: "IL", type: "Private" },
  "Northwestern University": { lat: 42.0565, lng: -87.6753, school: "Kellogg School of Management", rank: 4, totalFaculty: 141, city: "Evanston", state: "IL", type: "Private" },
  "MIT": { lat: 42.3601, lng: -71.0942, school: "Sloan School of Management", rank: 5, totalFaculty: 129, city: "Cambridge", state: "MA", type: "Private" },
  "Stanford University": { lat: 37.4275, lng: -122.1697, school: "Graduate School of Business", rank: 6, totalFaculty: 122, city: "Stanford", state: "CA", type: "Private" },
  "Columbia University": { lat: 40.8075, lng: -73.9626, school: "Columbia Business School", rank: 7, totalFaculty: 123, city: "New York", state: "NY", type: "Private" },
  "University of Michigan": { lat: 42.2732, lng: -83.7384, school: "Ross School of Business", rank: 8, totalFaculty: 149, city: "Ann Arbor", state: "MI", type: "Public" },
  "UC Berkeley": { lat: 37.8719, lng: -122.2585, school: "Haas School of Business", rank: 9, totalFaculty: 90, city: "Berkeley", state: "CA", type: "Public" },
  "Yale University": { lat: 41.3115, lng: -72.9260, school: "Yale School of Management", rank: 10, totalFaculty: 85, city: "New Haven", state: "CT", type: "Private" },
  "NYU": { lat: 40.7295, lng: -73.9965, school: "Stern School of Business", rank: 11, totalFaculty: 140, city: "New York", state: "NY", type: "Private" },
  "Duke University": { lat: 36.0014, lng: -78.9382, school: "Fuqua School of Business", rank: 12, totalFaculty: 91, city: "Durham", state: "NC", type: "Private" },
  "University of Virginia": { lat: 38.0336, lng: -78.5080, school: "Darden School of Business", rank: 13, totalFaculty: 70, city: "Charlottesville", state: "VA", type: "Public" },
  "UCLA": { lat: 34.0736, lng: -118.4420, school: "Anderson School of Management", rank: 14, totalFaculty: 105, city: "Los Angeles", state: "CA", type: "Public" },
  "Cornell University": { lat: 42.4440, lng: -76.4749, school: "Johnson Graduate School of Management", rank: 15, totalFaculty: 66, city: "Ithaca", state: "NY", type: "Private" },
  "Dartmouth College": { lat: 43.7044, lng: -72.2887, school: "Tuck School of Business", rank: 16, totalFaculty: 54, city: "Hanover", state: "NH", type: "Private" },
  "University of Southern California": { lat: 34.0195, lng: -118.2863, school: "Marshall School of Business", rank: 17, totalFaculty: 103, city: "Los Angeles", state: "CA", type: "Private" },
  "Carnegie Mellon University": { lat: 40.4406, lng: -79.9959, school: "Tepper School of Business", rank: 18, totalFaculty: 97, city: "Pittsburgh", state: "PA", type: "Private" },
  "University of Texas at Austin": { lat: 30.2849, lng: -97.7341, school: "McCombs School of Business", rank: 19, totalFaculty: 164, city: "Austin", state: "TX", type: "Public" },
  "University of North Carolina": { lat: 35.9049, lng: -79.0469, school: "Kenan-Flagler Business School", rank: 20, totalFaculty: 100, city: "Chapel Hill", state: "NC", type: "Public" },
  "Georgetown University": { lat: 38.9076, lng: -77.0723, school: "McDonough School of Business", rank: 21, totalFaculty: 84, city: "Washington", state: "DC", type: "Private" },
  "University of Washington": { lat: 47.6553, lng: -122.3035, school: "Foster School of Business", rank: 22, totalFaculty: 96, city: "Seattle", state: "WA", type: "Public" },
  "Emory University": { lat: 33.7927, lng: -84.3233, school: "Goizueta Business School", rank: 23, totalFaculty: 72, city: "Atlanta", state: "GA", type: "Private" },
  "Indiana University": { lat: 39.1682, lng: -86.5232, school: "Kelley School of Business", rank: 24, totalFaculty: 128, city: "Bloomington", state: "IN", type: "Public" },
  "Rice University": { lat: 29.7174, lng: -95.4018, school: "Jones Graduate School of Business", rank: 25, totalFaculty: 58, city: "Houston", state: "TX", type: "Private" },
  "Washington University in St. Louis": { lat: 38.6488, lng: -90.3108, school: "Olin Business School", rank: 26, totalFaculty: 76, city: "St. Louis", state: "MO", type: "Private" },
  "Vanderbilt University": { lat: 36.1446, lng: -86.8032, school: "Owen Graduate School of Management", rank: 27, totalFaculty: 57, city: "Nashville", state: "TN", type: "Private" },
  "Georgia Institute of Technology": { lat: 33.7756, lng: -84.3963, school: "Scheller College of Business", rank: 28, totalFaculty: 88, city: "Atlanta", state: "GA", type: "Public" },
  "University of Minnesota": { lat: 44.9740, lng: -93.2277, school: "Carlson School of Management", rank: 29, totalFaculty: 97, city: "Minneapolis", state: "MN", type: "Public" },
  "University of Notre Dame": { lat: 41.7030, lng: -86.2388, school: "Mendoza College of Business", rank: 30, totalFaculty: 94, city: "Notre Dame", state: "IN", type: "Private" },
  "Babson College": { lat: 42.2988, lng: -71.2648, school: "F.W. Olin Graduate School of Business", rank: null, totalFaculty: null, city: "Wellesley", state: "MA", type: "Private" },
};

function newsToListing(article: PQArticle, idx: number): (JobListing & { _fromNews: true }) | null {
  if ((article.category || "general") !== "hiring" || !article.extractedSchool) return null;

  const alreadyInData = listings.some(l =>
    l.university.toLowerCase() === article.extractedSchool!.toLowerCase()
  );
  if (alreadyInData) return null;

  const coords = SCHOOL_COORDS[article.extractedSchool];

  return {
    id: 10000 + idx,
    university: article.extractedSchool,
    school: coords?.school ?? null,
    notes: `New dean: ${article.extractedDean || "See article"}`,
    searchFirm: null,
    dateStarted: article.date,
    newsUrl: article.url,
    positionDescription: article.title,
    positionUrl: null,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    departingDean: null,
    reason: article.extractedDean ? `${article.extractedDean} appointed` : "New appointment",
    city: coords?.city ?? null,
    state: coords?.state ?? null,
    type: coords?.type ?? null,
    rank: coords?.rank ?? null,
    totalFaculty: coords?.totalFaculty ?? null,
    _fromNews: true as const,
  };
}

// Appointments auto-applied by the daily news scout (breaking-news.json) become
// "New Appointment" listings, with coordinates from SCHOOL_COORDS or the R1 geo list.
interface BreakingApplied { id: string; type: string; date: string; headline: string; university?: string; dean?: string; url: string }
function scoutToListings(existing: JobListing[]): (JobListing & { _fromNews: true })[] {
  const cutoff = Date.now() - 60 * 86400e3;
  const out: (JobListing & { _fromNews: true })[] = [];
  let idx = 0;
  for (const it of (breakingData.items || []) as BreakingApplied[]) {
    if (it.type !== "applied" || !it.university || new Date(it.date).getTime() < cutoff) continue;
    if (existing.some((l) => l.university.toLowerCase() === it.university!.toLowerCase())) continue;
    const coords = SCHOOL_COORDS[it.university];
    const geo = coords ? null : (r1SchoolsGeo as { university: string; school: string; lat: number | null; lng: number | null; city: string; state: string; type: string; rank: number | null; totalFaculty: number }[]).find((s) => s.university.toLowerCase() === it.university!.toLowerCase());
    out.push({
      id: 20000 + idx++,
      university: it.university,
      school: coords?.school ?? geo?.school ?? null,
      notes: `New dean: ${it.dean || "see story"}`,
      searchFirm: null,
      dateStarted: it.date,
      newsUrl: it.url,
      positionDescription: it.headline,
      positionUrl: null,
      lat: coords?.lat ?? geo?.lat ?? null,
      lng: coords?.lng ?? geo?.lng ?? null,
      departingDean: null,
      reason: it.dean ? `${it.dean} appointed` : "New appointment",
      city: coords?.city ?? geo?.city ?? null,
      state: coords?.state ?? geo?.state ?? null,
      type: coords?.type ?? geo?.type ?? null,
      rank: coords?.rank ?? geo?.rank ?? null,
      totalFaculty: coords?.totalFaculty ?? geo?.totalFaculty ?? null,
      _fromNews: true as const,
    });
  }
  return out;
}

function PQNewsFeed({ state, fetchNews }: { state: PQNewsState; fetchNews: (force?: boolean) => void }) {
  const [expanded, setExpanded] = useState(true);

  const timeSince = useMemo(() => {
    if (!state.fetchedAt) return "";
    const diff = Date.now() - new Date(state.fetchedAt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }, [state.fetchedAt]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
            <path d="M18 14h-8" /><path d="M15 18h-5" /><path d="M10 6h8v4h-8V6Z" />
          </svg>
          <span className="text-sm font-semibold">Latest Dean News</span>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Poets &amp; Quants</span>
          {state.articles.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{state.articles.length}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {state.fetchedAt && (
            <span className="text-[10px] text-muted-foreground">Updated {timeSince}</span>
          )}
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border">
          {state.loading && (
            <div className="px-5 py-4 flex items-center gap-2">
              <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">Scanning Poets &amp; Quants RSS feed...</span>
            </div>
          )}

          {state.error && !state.articles.length && (
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-red-500">Could not load news: {state.error}</p>
              <button onClick={() => fetchNews()} className="text-xs text-primary hover:underline mt-1">Retry</button>
            </div>
          )}

          {!state.loading && state.articles.length === 0 && !state.error && (
            <div className="px-5 py-4 text-center">
              <p className="text-xs text-muted-foreground">No dean-related articles found in recent P&amp;Q coverage.</p>
            </div>
          )}

          {state.articles.length > 0 && (
            <div className="divide-y divide-border">
              {state.articles.map((article, i) => {
                const catBadge = CATEGORY_BADGE[article.category || "general"];
                return (
                  <a
                    key={i}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-5 py-3 hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <Badge className={`${catBadge.bgClass} ${catBadge.color} border-0 text-[10px] px-1.5 py-0`}>{catBadge.label}</Badge>
                          {article.extractedSchool && (
                            <span className="text-[10px] text-muted-foreground">{article.extractedSchool}</span>
                          )}
                          {(article.category || "general") === "hiring" && article.extractedSchool && (
                            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">→ Added to map</span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-primary hover:underline leading-snug">
                          {decodeHtmlEntities(article.title)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{decodeHtmlEntities(article.summary)}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-0.5">
                        {article.date}
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          <div className="px-5 py-2 border-t border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Auto-scans every 24 hours from P&amp;Q RSS feed · Hiring news auto-added to map</span>
            <button
              onClick={() => fetchNews(true)}
              disabled={state.loading}
              className="text-[10px] text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
              Refresh now
            </button>
          </div>
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
  const [newsState, setNewsState] = useState<PQNewsState>({ articles: [], fetchedAt: null, loading: true, error: null });

  const fetchNews = useCallback(async (force = false) => {
    setNewsState(s => ({ ...s, loading: true, error: null }));
    try {
      const endpoint = force ? "/api/pq-news/refresh" : "/api/pq-news";
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNewsState({
        articles: data.articles || [],
        fetchedAt: data.fetchedAt || null,
        loading: false,
        error: null,
      });
    } catch (e: unknown) {
      setNewsState(s => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Failed to load" }));
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const newsListings = useMemo(() => {
    return newsState.articles
      .map((article, i) => newsToListing(article, i))
      .filter((l): l is NonNullable<typeof l> => l !== null);
  }, [newsState.articles]);

  const allListings = useMemo(() => {
    const scout = scoutToListings(listings).filter(
      (s) => !newsListings.some((n) => n.university.toLowerCase() === s.university.toLowerCase())
    );
    return [...listings, ...newsListings, ...scout];
  }, [newsListings]);

  const firms = useMemo(() => {
    const set = new Set<string>();
    allListings.forEach(l => { if (l.searchFirm) set.add(l.searchFirm); });
    return [...set].sort();
  }, [allListings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allListings.filter(l => {
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
        if (statusFilter === "newhire" && status.label !== "New Appointment") return false;
      }
      return true;
    });
  }, [search, firmFilter, statusFilter, allListings]);

  const withFirm = allListings.filter(l => l.searchFirm).length;
  const withNews = allListings.filter(l => l.newsUrl).length;
  const recentSearches = allListings.filter(l => {
    if (!l.dateStarted) return false;
    const days = daysSince(l.dateStarted);
    return days !== null && days < 180;
  }).length;
  const newHires = newsListings.length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
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
        {newHires > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{newHires}</p>
            <p className="text-xs text-muted-foreground mt-1">New Appointments (news)</p>
          </div>
        )}
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
              {newHires > 0 && <option value="newhire">New Appointment</option>}
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

      <p className="text-xs text-muted-foreground -mt-2">
        Positions and appointments refresh daily via the automated news scout · data as of {breakingData.updated}
      </p>

      {view === "map" && (
        <JobMarketMap
          filtered={filtered}
          onSelect={l => setExpandedId(expandedId === l.id ? null : l.id)}
          selectedId={expandedId}
        />
      )}

      {(view === "map" && expandedId) && (() => {
        const listing = allListings.find(l => l.id === expandedId);
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

      <PQNewsFeed state={newsState} fetchNews={fetchNews} />

      <div className="text-xs text-muted-foreground text-center">
        Data sourced from Poets & Quants, Chronicle of Higher Education, AACSB, university announcements, and other public sources. Last updated: March 2026.
      </div>
    </div>
  );
}
