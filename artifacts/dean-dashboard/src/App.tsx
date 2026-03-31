import { useState, useRef, useCallback } from "react";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import InterimAnalysis from "@/components/InterimAnalysis";
import IndividualSearch from "@/components/IndividualSearch";
import LiveJobMarket from "@/components/LiveJobMarket";

interface TabDef {
  value: string;
  label: string;
}

const DEFAULT_TABS: TabDef[] = [
  { value: "explorer", label: "School Explorer" },
  { value: "trends", label: "Aggregate Trends" },
  { value: "analysis", label: "Correlation Analysis" },
  { value: "interim", label: "Interim Analysis" },
  { value: "search", label: "Individual Search" },
  { value: "jobmarket", label: "Dean News & Market" },
];

const TAB_CONTENT: Record<string, React.ReactNode> = {
  explorer: <SchoolExplorer />,
  trends: <AggregateTrends />,
  analysis: <CrossSchoolAnalysis />,
  interim: <InterimAnalysis />,
  search: <IndividualSearch />,
  jobmarket: <LiveJobMarket />,
};

function App() {
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
              <h1 className="text-3xl font-bold tracking-tight">Business School Dean Leadership Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Exploring leadership change at top business schools (1967–2026)</p>
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
            <div
              className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground w-full max-w-4xl"
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
                      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      "cursor-grab active:cursor-grabbing select-none flex-1",
                      isActive
                        ? "bg-background text-foreground shadow-sm"
                        : "hover:bg-background/50",
                      isOver ? "ring-2 ring-primary/50" : "",
                      tab.value === "jobmarket" ? "text-[11px] sm:text-sm" : "",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-1">
                      <svg className="w-3 h-3 opacity-30 shrink-0" viewBox="0 0 12 12" fill="currentColor">
                        <circle cx="3" cy="3" r="1.2" />
                        <circle cx="3" cy="6" r="1.2" />
                        <circle cx="3" cy="9" r="1.2" />
                        <circle cx="7" cy="3" r="1.2" />
                        <circle cx="7" cy="6" r="1.2" />
                        <circle cx="7" cy="9" r="1.2" />
                      </svg>
                      {tab.label}
                    </span>
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
      </div>
    </div>
  );
}

export default App;
