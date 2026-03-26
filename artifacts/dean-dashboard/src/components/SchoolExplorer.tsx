import { useState, useMemo } from "react";
import { useSchoolList, useSchoolDeans } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { CHART_COLORS, NEXT_ROLE_LABELS, ORIGIN_LABELS } from "@/data/types";

export default function SchoolExplorer() {
  const schools = useSchoolList();
  const [selectedSchool, setSelectedSchool] = useState(schools[0]?.school || "");
  const deans = useSchoolDeans(selectedSchool);

  const selectedInfo = useMemo(() => schools.find((s) => s.school === selectedSchool), [schools, selectedSchool]);

  const minYear = useMemo(() => {
    const starts = deans.map(d => d.startYear).filter(Boolean) as number[];
    return starts.length ? Math.min(...starts) - 1 : 1990;
  }, [deans]);
  const maxYear = 2026;

  const timelineData = useMemo(() => {
    return deans.map((d, i) => ({
      name: d.dean,
      start: d.startYear || minYear,
      end: d.endYear || 2026,
      duration: (d.endYear || 2026) - (d.startYear || minYear),
      offset: (d.startYear || minYear) - minYear,
      gender: d.gender,
      isInterim: d.isInterim,
      index: i,
    }));
  }, [deans, minYear]);

  const [selectedDeanIdx, setSelectedDeanIdx] = useState<number | null>(null);
  const selectedDean = selectedDeanIdx !== null ? deans[selectedDeanIdx] : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
        <div className="w-full sm:w-96">
          <label className="text-sm font-medium text-muted-foreground mb-1.5 block">Select a Business School</label>
          <Select value={selectedSchool} onValueChange={(v) => { setSelectedSchool(v); setSelectedDeanIdx(null); }}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a school..." />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {schools.map((s) => (
                <SelectItem key={s.school} value={s.school}>
                  {s.school} {s.rank ? `(#${s.rank})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dean Tenure Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">Click a bar to view the dean's profile below</p>
        </CardHeader>
        <CardContent>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, timelineData.length * 48 + 40)}>
              <BarChart
                data={timelineData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                barCategoryGap={8}
              >
                <XAxis
                  type="number"
                  domain={[0, maxYear - minYear]}
                  tickFormatter={(v) => String(v + minYear)}
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={160}
                  fontSize={12}
                  tick={{ fill: "hsl(var(--foreground))" }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-lg p-3 text-sm">
                        <p className="font-semibold">{d.name}</p>
                        <p>{d.start} – {d.end === 2026 ? "Present" : d.end}</p>
                        <p>{d.duration} years</p>
                        {d.isInterim && <Badge variant="outline" className="mt-1">Interim</Badge>}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="offset" stackId="a" fill="transparent" />
                <Bar
                  dataKey="duration"
                  stackId="a"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(_, idx) => setSelectedDeanIdx(idx)}
                >
                  {timelineData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.isInterim ? "hsl(var(--muted-foreground))" : entry.gender === "F" ? CHART_COLORS[4] : CHART_COLORS[0]}
                      opacity={selectedDeanIdx === i ? 1 : selectedDeanIdx !== null ? 0.4 : 0.85}
                      stroke={selectedDeanIdx === i ? "hsl(var(--foreground))" : "none"}
                      strokeWidth={selectedDeanIdx === i ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">No data available for this school.</p>
          )}
          <div className="flex gap-4 mt-2 text-xs text-muted-foreground justify-center">
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: CHART_COLORS[0] }} /> Male</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded" style={{ background: CHART_COLORS[4] }} /> Female</span>
            <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-muted-foreground" /> Interim</span>
          </div>
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
            {selectedDean.notes && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                <p className="text-sm">{selectedDean.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!selectedDean && deans.length > 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          Click on a bar in the timeline above to view a dean's detailed profile
        </div>
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
