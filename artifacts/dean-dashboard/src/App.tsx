import { useState, useCallback } from "react";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import IndividualSearch, { DeanSearchPrefill } from "@/components/IndividualSearch";
import MeetTheDean from "@/components/MeetTheDean";
import type { Dean } from "@/data/types";
import LiveJobMarket from "@/components/LiveJobMarket";
import DisciplineSearch from "@/components/DisciplineSearch";
import BreakingNews from "@/components/BreakingNews";
import ContactDialog from "@/components/ContactDialog";
import { DatasetProvider, useDataset } from "@/data/DatasetContext";
import { DATASETS, DATASET_LIST } from "@/data/datasets";

// Build timestamp, injected by vite.config.ts. Reflects when the site was last
// deployed, which for a static data app is when the data last changed.
declare const __BUILT_ON__: string;
const BUILT_ON = __BUILT_ON__;

/**
 * Corpus-wide totals for the header strip, computed once at module load.
 *
 * Counts only the datasets in DATASET_LIST. That deliberately excludes the
 * hidden Top-100 bundle, which is not merely hidden but a strict *subset* of
 * R1 B-school -- all 603 of its rows appear there too, so including it would
 * double-count. Rows are additionally deduped on
 * (dean, university, school, startYear) as a guard against future overlap
 * between datasets.
 */
const CORPUS = (() => {
  const seen = new Set<string>();
  const schools = new Set<string>();
  let sitting = 0;
  let minYear = Infinity;
  for (const meta of DATASET_LIST) {
    for (const d of DATASETS[meta.id].deans) {
      const k = `${(d.dean || "").trim().toLowerCase()}|${(d.university || "").trim().toLowerCase()}|${(d.school || "").trim().toLowerCase()}|${d.startYear}`;
      if (seen.has(k)) continue;
      seen.add(k);
      schools.add(`${d.university}|${d.school}`);
      if (d.endYear == null) sitting++;
      if (d.startYear && d.startYear < minYear) minYear = d.startYear;
    }
  }
  return { appts: seen.size, sitting, schools: schools.size, from: minYear };
})();

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
  const [contactOpen, setContactOpen] = useState(false);
  const tabs = DEFAULT_TABS;
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0].value);
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
              {/* Scale is the credential for a research-derived product: state the
                  size of the corpus before anyone has to go looking for it. */}
              <p className="mt-3 text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{CORPUS.appts.toLocaleString()}</span> appointments
                <span className="mx-1.5 text-border">|</span>
                <span className="font-semibold text-foreground">{CORPUS.sitting.toLocaleString()}</span> sitting leaders
                <span className="mx-1.5 text-border">|</span>
                <span className="font-semibold text-foreground">{CORPUS.schools.toLocaleString()}</span> schools
                <span className="mx-1.5 text-border">|</span>
                <span className="font-semibold text-foreground">{DATASET_LIST.length}</span> indices
                <span className="mx-1.5 text-border">|</span>
                {CORPUS.from}&ndash;2026
                <span className="mx-1.5 text-border">|</span>
                updated {BUILT_ON}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setContactOpen(true)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
            >
              Contact
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg border border-border hover:bg-muted text-sm"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
            </div>
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

            {/* items-stretch on desktop so the module grid and the Meet-a-Leader panel
                end flush; grid-rows-3 lets the six cards share that height evenly
                rather than hugging their text. */}
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-stretch">
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-rows-3 gap-4 flex-1 w-full"
              role="tablist"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.value;

                return (
                  <button
                    key={tab.value}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab.value)}
                    className={[
                      "flex flex-col items-start text-left rounded-xl p-4 transition-all",
                      "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "cursor-pointer select-none",
                      isActive
                        ? "bg-primary text-primary-foreground border-primary/70 shadow-lg"
                        : "bg-card text-foreground border-border hover:border-primary/40 hover:bg-muted/40",

                    ].join(" ")}
                  >
                    <span className="text-sm font-semibold">{relabel(tab.label)}</span>
                    <span className={[
                      "text-xs mt-1 leading-snug",
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
          <p className="text-xs text-muted-foreground/60">
            &copy; 2026 Baton Index &middot; Leadership succession data for higher education
            <span className="mx-1.5">&middot;</span>
            <button onClick={() => setContactOpen(true)} className="underline underline-offset-2 hover:text-foreground">
              Contact
            </button>
          </p>
        </footer>
        {contactOpen && <ContactDialog onClose={() => setContactOpen(false)} />}
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
