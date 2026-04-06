import { useState, useMemo } from "react";
import { useSchoolList, useSchoolDeans, parseSchoolKey } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import USMap from "./USMap";
import SchoolAnalytics from "./SchoolAnalytics";
import DeanTimeline from "./DeanTimeline";
import { SchoolInfographic, findBSQ } from "./SchoolResearch";
import ResearchMap from "./ResearchMap";

type SortMode = "rank" | "alpha";

export default function SchoolExplorer() {
  const schools = useSchoolList();
  const [selectedKey, setSelectedKey] = useState(schools[0]?.key || "");
  const [sortMode, setSortMode] = useState<SortMode>("rank");
  const deans = useSchoolDeans(selectedKey);

  const sortedSchools = useMemo(() => {
    const list = [...schools];
    if (sortMode === "alpha") {
      list.sort((a, b) => a.university.localeCompare(b.university) || a.school.localeCompare(b.school));
    }
    return list;
  }, [schools, sortMode]);

  const selectedInfo = useMemo(() => schools.find((s) => s.key === selectedKey), [schools, selectedKey]);
  const parsed = useMemo(() => parseSchoolKey(selectedKey), [selectedKey]);

  const currentDeanIdx = useMemo(() => {
    if (!deans.length) return null;
    const idx = deans.findIndex((d) => !d.endYear || d.endYear >= 2025);
    return idx >= 0 ? idx : deans.length - 1;
  }, [deans]);

  const handleSchoolChange = (key: string) => {
    setSelectedKey(key);
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="dropdown">
        <div className="flex justify-center">
          <TabsList>
            <TabsTrigger value="dropdown">List View</TabsTrigger>
            <TabsTrigger value="map">Map View</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="dropdown" className="mt-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex gap-2 items-end">
              <div className="w-[480px]">
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Select a Business School</label>
                <Select value={selectedKey} onValueChange={handleSchoolChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a school..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {sortedSchools.map((s) => (
                      <SelectItem key={s.key} value={s.key}>
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
          <USMap selectedSchoolKey={selectedKey} onSelectSchool={handleSchoolChange} />
          {selectedInfo && (
            <div className="flex gap-2 flex-wrap mt-3">
              <Badge variant="secondary">{selectedInfo.university}</Badge>
              <Badge variant="secondary">{parsed.school}</Badge>
              {selectedInfo.rank && <Badge variant="outline">Rank #{selectedInfo.rank}</Badge>}
              <Badge variant="outline">{selectedInfo.tier}</Badge>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          {selectedInfo && (
            <p className="text-xl font-bold">
              {selectedInfo.university} – {parsed.school}
            </p>
          )}
          <CardTitle className="text-lg">Dean Tenure Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">Click a dean to view their full profile. Hover over a bar for a quick summary.</p>
        </CardHeader>
        <CardContent>
          <DeanTimeline
            deans={deans}
            selectedIdx={currentDeanIdx}
          />
        </CardContent>
      </Card>

      {deans.length > 0 && (
        <>
          <h3 className="text-lg font-semibold mt-8">School-Level Analytics</h3>
          <SchoolAnalytics deans={deans} />
        </>
      )}

      {parsed && (() => {
        const bsq = findBSQ(parsed.university, parsed.school);
        return bsq ? (
          <>
            <h3 className="text-lg font-semibold mt-8">AACSB Business School Questionnaire (BSQ) Profile</h3>
            <SchoolInfographic bsq={bsq} deanCount={deans.length} />
          </>
        ) : (
          <Card className="mt-8">
            <CardContent className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No AACSB BSQ data available for this school.</p>
            </CardContent>
          </Card>
        );
      })()}

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-3">Research Map — All Schools</h3>
        <ResearchMap selectedSchoolKey={selectedKey} onSelectSchool={handleSchoolChange} />
      </div>
    </div>
  );
}
