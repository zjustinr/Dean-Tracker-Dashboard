import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SchoolExplorer from "@/components/SchoolExplorer";
import CrossSchoolAnalysis from "@/components/CrossSchoolAnalysis";
import AggregateTrends from "@/components/AggregateTrends";
import InterimAnalysis from "@/components/InterimAnalysis";
import IndividualSearch from "@/components/IndividualSearch";

function App() {
  const [darkMode, setDarkMode] = useState(false);

  return (
    <div className={darkMode ? "dark" : ""}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="border-b border-border bg-card">
          <div className="max-w-[1400px] mx-auto px-4 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Business School Dean Leadership Dashboard</h1>
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
          <Tabs defaultValue="explorer" className="space-y-6">
            <TabsList className="grid w-full max-w-3xl grid-cols-5">
              <TabsTrigger value="explorer">School Explorer</TabsTrigger>
              <TabsTrigger value="trends">Aggregate Trends</TabsTrigger>
              <TabsTrigger value="analysis">Correlation Analysis</TabsTrigger>
              <TabsTrigger value="interim">Interim Analysis</TabsTrigger>
              <TabsTrigger value="search">Individual Search</TabsTrigger>
            </TabsList>

            <TabsContent value="explorer">
              <SchoolExplorer />
            </TabsContent>
            <TabsContent value="trends">
              <AggregateTrends />
            </TabsContent>
            <TabsContent value="analysis">
              <CrossSchoolAnalysis />
            </TabsContent>
            <TabsContent value="interim">
              <InterimAnalysis />
            </TabsContent>
            <TabsContent value="search">
              <IndividualSearch />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}

export default App;
