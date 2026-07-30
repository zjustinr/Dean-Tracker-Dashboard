import { useState, useCallback, useEffect } from "react";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import IndividualSearch, { DeanSearchPrefill } from "@/components/IndividualSearch";
import MeetTheDean from "@/components/MeetTheDean";
import type { Dean } from "@/data/types";
import LiveJobMarket from "@/components/LiveJobMarket";
import DisciplineSearch from "@/components/DisciplineSearch";
import Insights from "@/components/Insights";
import { useFreeMeter, MeterBadge, Paywall, FreeTierNotice } from "@/components/FreeTierMeter";
import BreakingNews from "@/components/BreakingNews";
import ContactDialog from "@/components/ContactDialog";
import AboutDialog from "@/components/AboutDialog";
import FeatureRequestWidget from "@/components/FeatureRequestWidget";
import ModuleIcon from "@/components/ModuleIcons";
import { DatasetProvider, useDataset } from "@/data/DatasetContext";
import { TrialProvider, useTrial } from "@/data/TrialContext";
import { DATASET_LIST } from "@/data/datasets";
import corpusStats from "@/data/corpus-stats.json";

// Build timestamp, injected by vite.config.ts. Reflects when the site was last
// deployed, which for a static data app is when the data last changed.
declare const __BUILT_ON__: string;
const BUILT_ON = __BUILT_ON__;

// Corpus-wide totals for the header strip. Step 2 moved the dean records out of
// the bundle, so these are precomputed by scripts/gen-public-data.ts (re-run on
// every data refresh) rather than tallied from the datasets at load. Counts only
// DATASET_LIST — excludes hidden Top-100 (a strict subset of R1 B-school) — and
// dedupes on (dean, university, school, startYear).
const CORPUS = corpusStats as { appts: number; sitting: number; schools: number; from: number };

interface TabDef {
  value: string;
  label: string;
  desc: string;
}

// Descriptions deliberately say "leader" rather than "dean": the app spans deans,
// provosts and presidents, so the generic term reads correctly on every dataset.
// `relabel` below leaves these untouched (it only rewrites "dean"), so they stay
// uniform across the dataset switcher.
// Individual Search leads: it is the flagship view, so it takes the top-left
// slot (the most prominent by reading order) and is the default open tab.
const DEFAULT_TABS: TabDef[] = [
  { value: "search", label: "Slate Builder", desc: "Filter sitting leaders by school, discipline, or tenure — then assemble a shortlist and open any profile." },
  { value: "explorer", label: "School Explorer", desc: "Browse leader histories by school with interactive tenure timelines and list/map views." },
  { value: "trends", label: "Aggregate Trends", desc: "Analyze leadership trends across eras, tiers, and demographics — including interim appointments." },
  { value: "discipline", label: "Discipline Search", desc: "Map leader disciplines by school and watch their composition evolve over time." },
  { value: "jobmarket", label: "Leadership News & Market", desc: "Stay updated with the latest leadership news and market activity." },
  { value: "analysis", label: "Build Your Own Analysis", desc: "Create custom cross-tabulations with pivot tables and dynamic charts." },
];

export interface SchoolPrefill { university: string; school: string; token: number; }

function buildTabContent(
  deanPrefill: DeanSearchPrefill | null,
  schoolPrefill: SchoolPrefill | null,
  onOpenSchool: (university: string, school: string) => void,
  onOpenLeader: (index: string | null, fullName: string) => void,
): Record<string, React.ReactNode> {
  return {
    explorer: <SchoolExplorer prefill={schoolPrefill} />,
    trends: <AggregateTrends />,
    analysis: <CrossSchoolAnalysis />,
    search: <IndividualSearch prefill={deanPrefill} onOpenSchool={onOpenSchool} onOpenLeader={onOpenLeader} />,
    jobmarket: <LiveJobMarket />,
    discipline: <DisciplineSearch />,
  };
}

function AppInner() {
  const { datasetId, setDatasetId, list, meta, noun, nounPlural, nounLower, nounPluralLower } = useDataset();
  const trial = useTrial();
  // Free-tier meter applies only to anonymous public visitors (armed gate, no
  // valid token). Owners and trial/day-pass holders (status "valid") are unmetered.
  const meter = useFreeMeter(trial.armed && trial.status !== "valid");
  // If a trial is scoped and the active dataset falls outside it, jump to the
  // first in-scope index so the app never sits on a locked (403) dataset.
  useEffect(() => {
    if (trial.armed && !trial.allowed(datasetId)) {
      const first = list.find((d) => trial.allowed(d.id));
      if (first) setDatasetId(first.id);
    }
  }, [trial, datasetId, list, setDatasetId]);
  // Dataset-aware relabel: "Dean(s)" → "Leader(s)" for the university-presidents dataset.
  const relabel = (s: string) => s
    .replace(/Deans/g, nounPlural).replace(/deans/g, nounPluralLower)
    .replace(/Dean/g, noun).replace(/dean/g, nounLower);
  const [darkMode, setDarkMode] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const tabs = DEFAULT_TABS;
  const [activeTab, setActiveTab] = useState(DEFAULT_TABS[0].value);
  const [entered, setEntered] = useState(false);
  const openModule = useCallback((value: string) => {
    setActiveTab(value);
    setEntered(true);
  }, []);
  const [deanPrefill, setDeanPrefill] = useState<DeanSearchPrefill | null>(null);
  const [schoolPrefill, setSchoolPrefill] = useState<SchoolPrefill | null>(null);

  const openDeanProfile = useCallback((d: Dean) => {
    if (!meter.tryView()) return; // free-tier quota reached -> paywall
    const parts = d.dean.trim().split(/\s+/);
    setDeanPrefill({ fullName: d.dean, first: parts[0], last: parts[parts.length - 1], token: Date.now() });
    setActiveTab("search");
    setEntered(true);
  }, [meter]);

  const openSchoolHistory = useCallback((university: string, school: string) => {
    if (!meter.tryView()) return; // free-tier quota reached -> paywall
    setSchoolPrefill({ university, school, token: Date.now() });
    setActiveTab("explorer");
    setEntered(true);
  }, [meter]);

  // Open an affinity leader who may live in a DIFFERENT index: switch to their
  // home index, then prefill their name so the search opens their profile once
  // that index's data has loaded (the prefill effect retries on data arrival).
  const openLeaderCrossIndex = useCallback((index: string | null, fullName: string) => {
    if (!meter.tryView()) return;
    if (index && index !== datasetId) setDatasetId(index as Parameters<typeof setDatasetId>[0]);
    const parts = fullName.trim().split(/\s+/);
    setDeanPrefill({ fullName, first: parts[0], last: parts[parts.length - 1], token: Date.now() });
    setActiveTab("search");
    setEntered(true);
  }, [meter, datasetId, setDatasetId]);

  const tabContent = buildTabContent(deanPrefill, schoolPrefill, openSchoolHistory, openLeaderCrossIndex);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-gradient-to-b from-[#F6F8FB] to-[#E7EBF2] dark:from-background dark:to-background text-foreground">
        <header className="border-b border-border bg-card border-t-2 border-t-[#A31F34]">
          <div className="max-w-[1400px] mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
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
                      alt="BatonIndex"
                      width={64}
                      height={64}
                      className="h-16 w-16 block"
                    />
                  </h1>
                  {/* Deliberately domain-agnostic (no "higher education" or
                      "academic") so the wordmark doesn't need a re-launch moment
                      when coverage expands beyond higher ed. Wraps to two lines
                      at 32px leading, filling the logo's 64px height exactly.
                      EB Garamond is already loaded by index.html and is the
                      closest free stand-in for the classical academic serif
                      Wharton uses -- their actual logo face is proprietary.
                      Penn/Wharton blue #011F5B, lightened in dark mode where it
                      would go near-invisible. */}
                  <p
                    className="max-w-[19rem] text-[26px] leading-[32px] tracking-tight text-[#011F5B] dark:text-[#AFC4E8]"
                    style={{ fontFamily: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif", fontWeight: 500 }}
                  >
                    Leadership succession, decoded.
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
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
            <button
              onClick={() => setInsightsOpen(true)}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted"
            >
              Insights
            </button>
            <button
              onClick={() => setAboutOpen(true)}
              className="px-3 py-2 rounded-lg text-sm font-semibold text-foreground hover:bg-muted"
            >
              About
            </button>
            <button
              onClick={() => setContactOpen(true)}
              className="px-4 py-2 rounded-lg bg-gradient-to-b from-[#b02a3f] to-[#8a1a2d] text-white text-sm font-semibold shadow-sm hover:brightness-110"
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 bg-slate-100 dark:bg-slate-800/60 rounded-xl p-2 border border-slate-200 dark:border-slate-700" role="tablist" aria-label="Dataset">
              {list.map(d => {
                const isActive = d.id === datasetId;
                const ok = trial.allowed(d.id);
                return (
                  <button
                    key={d.id}
                    role="tab"
                    aria-selected={isActive}
                    disabled={!ok}
                    onClick={() => ok && setDatasetId(d.id)}
                    title={!ok ? "Included in the full version — reply to unlock" : undefined}
                    className={[
                      "px-3 py-2 rounded-lg text-sm font-semibold transition-all text-center w-full inline-flex items-center justify-center gap-1",
                      !ok
                        ? "bg-card/40 text-muted-foreground/70 border border-transparent opacity-70 cursor-not-allowed"
                        : isActive
                        ? "bg-gradient-to-b from-[#0a2a63] to-[#01143f] text-white shadow-sm"
                        : "bg-card text-foreground hover:bg-muted border border-transparent",
                    ].join(" ")}
                  >
                    {!ok && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className="shrink-0">
                        <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                    )}
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
                const isActive = entered && activeTab === tab.value;
                const isFeatured = tab.value === "search";

                return (
                  <button
                    key={tab.value}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => openModule(tab.value)}
                    className={[
                      "flex flex-col items-start text-left rounded-xl p-4 transition-all",
                      "border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "cursor-pointer select-none",
                      isActive
                        ? "bg-gradient-to-br from-[#0b2c66] to-[#01143d] text-white border-[#01143d] shadow-md"
                        : isFeatured
                        ? "bg-slate-100 dark:bg-slate-800/50 text-foreground border-[#011F5B]/40 ring-1 ring-[#011F5B]/20 hover:border-[#011F5B]/70 shadow-sm"
                        : "bg-slate-100 dark:bg-slate-800/50 text-foreground border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:bg-slate-200/70 shadow-sm",
                    ].join(" ")}
                  >
                    <span className="flex items-center gap-2">
                      <ModuleIcon id={tab.value} className={isActive ? "text-white/90" : "text-[#011F5B]"} />
                      <span className="text-sm font-semibold">{relabel(tab.label)}</span>
                      {isFeatured && (
                        <span className={[
                          "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                          isActive ? "bg-white/20 text-white" : "bg-[#011F5B] text-white",
                        ].join(" ")}>Start here</span>
                      )}
                    </span>
                    <span className={[
                      "text-xs mt-1.5 leading-snug",
                      isActive ? "text-white/75" : "text-muted-foreground",
                    ].join(" ")}>{relabel(tab.desc)}</span>
                  </button>
                );
              })}
            </div>
            <div className="w-full lg:w-60 shrink-0">
              <MeetTheDean onOpenProfile={openDeanProfile} />
            </div>
            </div>

            {entered && (
              <div className="pt-2 border-t border-border">
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
            )}
          </div>
        </main>
        <footer className="text-left pl-6 pb-4 pt-8">
          <p className="text-xs text-muted-foreground/60">
            &copy; 2026 BatonIndex &middot; Leadership succession, decoded.
            <span className="mx-1.5">&middot;</span>
            <button onClick={() => setAboutOpen(true)} className="underline underline-offset-2 hover:text-foreground">
              About
            </button>
            <span className="mx-1.5">&middot;</span>
            <button onClick={() => setContactOpen(true)} className="underline underline-offset-2 hover:text-foreground">
              Contact
            </button>
          </p>
        </footer>
        {insightsOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label="Insights"
            onClick={() => setInsightsOpen(false)}
          >
            <div
              className="w-full max-w-4xl my-8 rounded-xl border border-border bg-card shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-1">
                <h2 className="text-lg font-bold">Insights</h2>
                <button
                  onClick={() => setInsightsOpen(false)}
                  aria-label="Close"
                  className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
                >
                  ×
                </button>
              </div>
              <div className="px-6 pb-6">
                <Insights />
              </div>
            </div>
          </div>
        )}
        {contactOpen && <ContactDialog onClose={() => setContactOpen(false)} />}
        {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} onContact={() => setContactOpen(true)} />}
        <FreeTierNotice meter={meter} />
        <MeterBadge meter={meter} />
        <Paywall meter={meter} />
        <FeatureRequestWidget />
      </div>
    </div>
  );
}

// Renders the app, or the locked / end-of-trial screen when the gate is armed and
// the visitor has no valid, unexpired token. Disarmed (no TRIAL_SECRET) and valid
// tokens both fall through to the full app; the initial pre-check renders the app
// optimistically so the public site never flashes a spinner.
// Freemium model: everyone gets the app with the free R1 Business tier; scope +
// the client-side meter/paywall handle the rest. No hard access-code wall.
function Gate() {
  return (
    <DatasetProvider>
      <AppInner />
    </DatasetProvider>
  );
}

function App() {
  return (
    <TrialProvider>
      <Gate />
    </TrialProvider>
  );
}

export default App;
