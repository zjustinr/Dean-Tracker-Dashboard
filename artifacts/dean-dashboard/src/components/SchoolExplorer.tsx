import { useState, useMemo } from "react";
import { useSchoolList, useSchoolDeans } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHART_COLORS, NEXT_ROLE_LABELS, ORIGIN_LABELS } from "@/data/types";
import USMap from "./USMap";
import SchoolAnalytics from "./SchoolAnalytics";
import DeanTimeline from "./DeanTimeline";

type SortMode = "rank" | "alpha";

export default function SchoolExplorer() {
  const schools = useSchoolList();
  const [selectedSchool, setSelectedSchool] = useState(schools[0]?.school || "");
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const deans = useSchoolDeans(selectedSchool);

  const sortedSchools = useMemo(() => {
    const list = [...schools];
    if (sortMode === "alpha") {
      list.sort((a, b) => a.school.localeCompare(b.school));
    }
    return list;
  }, [schools, sortMode]);

  const selectedInfo = useMemo(() => schools.find((s) => s.school === selectedSchool), [schools, selectedSchool]);

  const currentDeanIdx = useMemo(() => {
    if (!deans.length) return null;
    const idx = deans.findIndex((d) => !d.endYear || d.endYear >= 2025);
    return idx >= 0 ? idx : deans.length - 1;
  }, [deans]);

  const [selectedDeanIdx, setSelectedDeanIdx] = useState<number | null>(null);
  const displayIdx = selectedDeanIdx ?? currentDeanIdx;
  const selectedDean = displayIdx !== null ? deans[displayIdx] : null;

  const handleSchoolChange = (school: string) => {
    setSelectedSchool(school);
    setSelectedDeanIdx(null);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dropdown">
        <TabsList>
          <TabsTrigger value="dropdown">List View</TabsTrigger>
          <TabsTrigger value="map">Map View</TabsTrigger>
        </TabsList>

        <TabsContent value="dropdown" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex gap-2 items-end">
              <div className="w-[480px]">
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Select a Business School</label>
                <Select value={selectedSchool} onValueChange={handleSchoolChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a school..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {sortedSchools.map((s) => (
                      <SelectItem key={s.school} value={s.school}>
                        {sortMode === "rank" && s.rank ? `#${s.rank} ` : ""}
                        {s.university} – {s.school}
                        {sortMode === "alpha" && s.rank ? ` (#${s.rank})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Sort</label>
                <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rank">By Rank</SelectItem>
                    <SelectItem value="alpha">A–Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selectedInfo && (
              <div className="flex gap-2 flex-wrap">
                <Badge variant="secondary">{selectedInfo.university}</Badge>
                {selectedInfo.rank && <Badge variant="outline">Rank #{selectedInfo.rank}</Badge>}
                <Badge variant="outline">{selectedInfo.tier}</Badge>
                <Badge variant="outline">{deans.length} deans on record</Badge>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <p className="text-sm text-muted-foreground mb-3">Click a school on the map to select it. Circle size reflects faculty count.</p>
          <USMap selectedSchool={selectedSchool} onSelectSchool={handleSchoolChange} />
          {selectedInfo && (
            <div className="flex gap-2 flex-wrap mt-3">
              <Badge variant="secondary">{selectedInfo.university}</Badge>
              <Badge variant="secondary">{selectedSchool}</Badge>
              {selectedInfo.rank && <Badge variant="outline">Rank #{selectedInfo.rank}</Badge>}
              <Badge variant="outline">{selectedInfo.tier}</Badge>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dean Tenure Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">Click a row to view the dean's full profile. Bars show prior title and discipline.</p>
        </CardHeader>
        <CardContent>
          <DeanTimeline
            deans={deans}
            selectedIdx={displayIdx}
            onSelect={setSelectedDeanIdx}
          />
        </CardContent>
      </Card>

      {selectedDean && (
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-3">
              {selectedDean.dean}
              <div className="flex gap-1.5 flex-wrap">
                {selectedDean.gender === "F" && <Badge className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200">Female</Badge>}
                {selectedDean.isInterim && <Badge variant="outline">Interim</Badge>}
                {selectedDean.isFirstTimeDean && <Badge variant="secondary">First-Time Dean</Badge>}
                {selectedDean.isInternal && !selectedDean.isInterim && <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Internal</Badge>}
                {selectedDean.isExternal && !selectedDean.isInterim && <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">External</Badge>}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <ProfileField label="Tenure" value={`${selectedDean.startYear || "?"} – ${selectedDean.endYear || "Present"} (${selectedDean.tenureLength ? selectedDean.tenureLength + " years" : "ongoing"})`} />
              <ProfileField label="Origin" value={ORIGIN_LABELS[selectedDean.origin] || selectedDean.origin} />
              <ProfileField label="Discipline" value={selectedDean.disciplineBroad || selectedDean.discipline} />
              <ProfileField label="Prior Position" value={selectedDean.priorTitle || "Unknown"} />
              <ProfileField label="Prior Institution" value={selectedDean.priorInstitution || "Unknown"} />
              <ProfileField label="Career Background" value={selectedDean.careerBackground} />
              <ProfileField label="Has PhD" value={selectedDean.hasPhd ? "Yes" : "No"} />
              <ProfileField label="Industry Experience" value={selectedDean.hasIndustryExp ? "Yes" : "No"} />
              <ProfileField label="Prior Dean Experience" value={selectedDean.hasPriorDeanExp ? "Yes" : "No"} />
              <ProfileField label="Prior Assoc. Dean" value={selectedDean.hadAssocDeanRole ? "Yes" : "No"} />
              <ProfileField label="From Elite Institution" value={selectedDean.fromEliteInstitution ? "Yes" : "No"} />
              <ProfileField label="Post-Dean Role" value={NEXT_ROLE_LABELS[selectedDean.nextRole] || selectedDean.nextRole || "Unknown"} />
              {selectedDean.involuntary && <ProfileField label="Departure" value="Involuntary" />}
            </div>
            {(selectedDean.avgAnnualGifts || selectedDean.avgEndowment) && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 p-3 bg-muted rounded-lg">
                <ProfileField label="Avg Annual Gifts" value={selectedDean.avgAnnualGifts ? `$${(selectedDean.avgAnnualGifts / 1e6).toFixed(1)}M` : "–"} />
                <ProfileField label="Total Gifts During Tenure" value={selectedDean.totalGifts ? `$${(selectedDean.totalGifts / 1e6).toFixed(1)}M` : "–"} />
                <ProfileField label="Avg Endowment" value={selectedDean.avgEndowment ? `$${(selectedDean.avgEndowment / 1e9).toFixed(2)}B` : "–"} />
              </div>
            )}
            {selectedDean.notes && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{selectedDean.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {deans.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-8">School-Level Analytics</h3>
          <SchoolAnalytics deans={deans} />
        </>
      )}
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value}</p>
    </div>
  );
}
