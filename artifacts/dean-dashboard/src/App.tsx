import { useState, useRef, useCallback } from "react";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import IndividualSearch, { DeanSearchPrefill } from "@/components/IndividualSearch";
import MeetTheDean from "@/components/MeetTheDean";
import type { Dean } from "@/data/types";
import LiveJobMarket from "@/components/LiveJobMarket";
import DisciplineSearch from "@/components/DisciplineSearch";
import BreakingNews from "@/components/BreakingNews";
import { DatasetProvider, useDataset } from "@/data/DatasetContext";

interface TabDef {
  value: string;
  label: string;
  desc: string;
}

// Descriptions deliberately say "leader" rather than "dean": the app spans deans,
// provosts and presidents, so the generic term reads correctly on every dataset.
// `relabel` below leaves these untouched (it only rewrites "dean"), so they stay
// uniform across the dataset switcher.
const DEFAULT_TABS: TabDef[] = [
  { value: "explorer", label: "School Explorer", desc: "Browse leader histories by school with interactive tenure timelines and list/map views." },
  { value: "trends", label: "Aggregate Trends", desc: "Analyze leadership trends across eras, tiers, and demographics — including interim appointments." },
  { value: "discipline", label: "Discipline Search", desc: "Map leader disciplines by school and watch their composition evolve over time." },
  { value: "search", label: "Individual Search", desc: "Search and explore individual leader profiles and career paths." },
  { value: "jobmarket", label: "Leadership News & Market", desc: "Stay updated with the latest leadership news and market activity." },
  { value: "analysis", label: "Build Your Own Analysis", desc: "Create custom cross-tabulations with pivot tables and dynamic charts." },
];

export interface SchoolPrefill { university: string; school: string; token: number; }

function buildTabContent(
  deanPrefill: DeanSearchPrefill | null,
  schoolPrefill: SchoolPrefill | null,
  onOpenSchool: (university: string, school: string) => void,
): Record<string, React.ReactNode> {
  return {
    explorer: <SchoolExplorer prefill={schoolPrefill} />,
    trends: <AggregateTrends />,
    analysis: <CrossSchoolAnalysis />,
    search: <IndividualSearch prefill={deanPrefill} onOpenSchool={onOpenSchool} />,
    jobmarket: <LiveJobMarket />,
    discipline: <DisciplineSearch />,
  };
}

function AppInner() {
  const { datasetId, setDatasetId, list, meta, noun, nounPlural, nounLower, nounPluralLower } = useDataset();
  // Dataset-aware relabel: "Dean(s)" → "Leader(s)" for the university-presidents dataset.
  const relabel = (s: string) => s
    .replace(/Deans/g, nounPlural).replace(/deans/g, nounPluralLower)
    .replace(/Dean/g, noun).replace(/dean/g, nounLower);
  const [darkMode, setDarkMode] = useState(false);
  const [tabs, setTabs] = useState<TabDef[]>(DEFAULT_TABS);
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0].value);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLButtonElement | null>(null);
  const [deanPrefill, setDeanPrefill] = useState<DeanSearchPrefill | null>(null);
  const [schoolPrefill, setSchoolPrefill] = useState<SchoolPrefill | null>(null);

  const openDeanProfile = useCallback((d: Dean) => {
    const parts = d.dean.trim().split(/\s+/);
    setDeanPrefill({ fullName: d.dean, first: parts[0], last: parts[parts.length - 1], token: Date.now() });
    setActiveTab("search");
  }, []);

  const openSchoolHistory = useCallback((university: string, school: string) => {
    setSchoolPrefill({ university, school, token: Date.now() });
    setActiveTab("explorer");
  }, []);

  const tabContent = buildTabContent(deanPrefill, schoolPrefill, openSchoolHistory);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLButtonElement>, idx: number) => {
    setDragIdx(idx);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
    requestAnimationFrame(() => {
      if (dragNode.current) dragNode.current.style.opacity = "0.4";
    });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLButtonElement>, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLButtonElement>, dropIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;
    setTabs(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setOverIdx(null);
  }, [dragIdx]);

  const handleDragEnd = useCallback(() => {
    if (dragNode.current) dragNode.current.style.opacity = "1";
    setDragIdx(null);
    setOverIdx(null);
    dragNode.current = null;
  }, []);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3.5">
                <div className="flex items-center gap-3.5">
                  {/* Square lockup. The wordmark is outlined vector paths, not live text,
                      so it renders identically regardless of which fonts a device has --
                      the previous version relied on Segoe UI resolving, which phones don't
                      have. Plate-backed, so it needs no dark-mode variant. */}
                  <h1 className="leading-none shrink-0">
                    <img
                      src="/logo.svg"
                      alt="Baton Index"
                      width={64}
                      height={64}
                      className="h-16 w-16 block"
                    />
                  </h1>
                  {/* Byline scaled to fill the logo's 64px height: two lines at 32px
                      leading. EB Garamond is already loaded by index.html and is the
                      closest free stand-in for the classical academic serif Wharton
                      uses -- their actual logo face is proprietary. Penn/Wharton blue
                      #011F5B, lightened in dark mode where it would go near-invisible. */}
                  <p
                    className="max-w-[19rem] text-[26px] leading-[32px] tracking-tight text-[#011F5B] dark:text-[#AFC4E8]"
                    style={{ fontFamily: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif", fontWeight: 500 }}
                  >
                    Leadership succession data for higher education
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg border border-border hover:bg-muted text-sm"
              aria-label="Toggle dark mode"
            >
              {darkMode ? "Light" : "Dark"}
            </button>
          </div>
        </header>

        <BreakingNews />

        <main className="max-w-[1400px] mx-auto px-4 py-6">
          <div className="space-y-6">
            {/* Deliberately a couple of steps darker than --muted so the switcher reads
                as its own container against the page and the white dataset chips.
                A uniform grid rather than flex-wrap: chip labels vary a lot in length
                ("R1 Law" vs "Arts & Sciences"), so wrapping produced ragged rows.
                Equal columns keep them aligned; 11 chips land as 6 + 5 on desktop. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 bg-slate-200 dark:bg-slate-800 rounded-xl p-2.5 border border-slate-300 dark:border-slate-700" role="tablist" aria-label="Dataset">
              {list.map(d => {
                const isActive = d.id === datasetId;
                return (
                  <button
                    key={d.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setDatasetId(d.id)}
                    className={[
                      "px-3 py-2 rounded-lg text-sm font-semibold transition-all text-center w-full",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "bg-card text-foreground hover:bg-muted border border-transparent",
                    ].join(" ")}
                  >
                    {d.shortLabel}
                  </button>
                );
              })}
            </div>

            {/* items-stretch on desktop so the module grid and the Meet-a-Dean panel
                end flush; grid-rows-3 lets the six cards share that height evenly
                rather than hugging their text. */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-stretch">
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-rows-3 gap-4 flex-1 w-full"
              role="tablist"
            >
              {tabs.map((tab, idx) => {
                const isActive = activeTab === tab.value;
                const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
                return (
                  <button
                    key={tab.value}
                    role="tab"
                    aria-selected={isActive}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={e => handleDrop(e, idx)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={() => setOverIdx(null)}
                    onClick={() => setActiveTab(tab.value)}
                    className={[
                      "flex flex-col items-start text-left rounded-xl p-5 transition-all",
                      "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "cursor-grab active:cursor-grabbing select-none",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary/70 shadow-lg"
                        : "bg-card text-foreground border-border hover:border-primary/40 hover:shadow-md shadow-sm",
                      isOver ? "ring-2 ring-primary/50" : "",
                    ].join(" ")}
                  >
                    <span className="text-base font-bold">{relabel(tab.label)}</span>
                    <span className={[
                      "text-xs mt-1.5 leading-relaxed",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                    ].join(" ")}>{relabel(tab.desc)}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full lg:w-60 shrink-0">
              <MeetTheDean onOpenProfile={openDeanProfile} />
            </div>
            </div>

            {tabs.map(tab => (
              <div
                key={tab.value}
                role="tabpanel"
                className={activeTab === tab.value ? "" : "hidden"}
              >
                {tabContent[tab.value]}
              </div>
            ))}
          </div>
        </main>
        <footer className="text-right pr-6 pb-4 pt-8">
          <p className="text-xs text-muted-foreground/50">Feedback welcome, justin.ren@gmail.com. Copyright &copy; 2026</p>
        </footer>
      </div>
    </div>
  );
}

function App() {
  return (
    <DatasetProvider>
      <AppInner />
    </DatasetProvider>
  );
}

export default App;
