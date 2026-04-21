import { useState, useRef, useCallback } from "react";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import InterimAnalysis from "@/components/InterimAnalysis";
import IndividualSearch from "@/components/IndividualSearch";
import LiveJobMarket from "@/components/LiveJobMarket";
import { DatasetProvider, useDataset } from "@/data/DatasetContext";

interface TabDef {
  value: string;
  label: string;
  desc: string;
}

const DEFAULT_TABS: TabDef[] = [
  { value: "explorer", label: "School Explorer", desc: "Browse dean histories by school with interactive tenure timelines and list/map views." },
  { value: "trends", label: "Aggregate Trends", desc: "Analyze leadership trends across eras, tiers, and demographics." },
  { value: "interim", label: "Interim Analysis", desc: "Track interim dean appointments and leadership transitions." },
  { value: "search", label: "Individual Search", desc: "Search and explore individual dean profiles and career paths." },
  { value: "jobmarket", label: "Dean News & Market", desc: "Stay updated with the latest dean-related news and market activity." },
  { value: "analysis", label: "Build Your Own Analysis", desc: "Create custom cross-tabulations with pivot tables and dynamic charts." },
];

const TAB_CONTENT: Record<string, React.ReactNode> = {
  explorer: <SchoolExplorer />,
  trends: <AggregateTrends />,
  analysis: <CrossSchoolAnalysis />,
  interim: <InterimAnalysis />,
  search: <IndividualSearch />,
  jobmarket: <LiveJobMarket />,
};

function AppInner() {
  const { datasetId, setDatasetId, list, meta } = useDataset();
  const [darkMode, setDarkMode] = useState(false);
  const [tabs, setTabs] = useState<TabDef[]>(DEFAULT_TABS);
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0].value);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const dragNode = useRef<HTMLButtonElement | null>(null);

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
              <h1 className="text-3xl font-bold tracking-tight">{meta.schoolType === "engineering" ? "Engineering" : "Business"} School Dean Leadership Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{meta.description} ({meta.yearRange})</p>
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

        <main className="max-w-[1400px] mx-auto px-4 py-6">
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2 items-center justify-center bg-muted/40 rounded-xl p-2 border border-border" role="tablist" aria-label="Dataset">
              {list.map(d => {
                const isActive = d.id === datasetId;
                return (
                  <button
                    key={d.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setDatasetId(d.id)}
                    className={[
                      "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
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

            <div
              className="grid grid-cols-2 md:grid-cols-3 gap-4"
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
                    <span className="text-base font-bold">{tab.label}</span>
                    <span className={[
                      "text-xs mt-1.5 leading-relaxed",
                      isActive ? "text-primary-foreground/80" : "text-muted-foreground",
                    ].join(" ")}>{tab.desc}</span>
                  </button>
                );
              })}
            </div>

            {tabs.map(tab => (
              <div
                key={tab.value}
                role="tabpanel"
                className={activeTab === tab.value ? "" : "hidden"}
              >
                {TAB_CONTENT[tab.value]}
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
