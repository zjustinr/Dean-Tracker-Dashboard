import { useState, useMemo } from "react";
import { useSchoolList, useSchoolDeans, parseSchoolKey } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from "recharts";
import USMap from "./USMap";
import bsqData from "@/data/schools-bsq.json";

type SortMode = "rank" | "alpha";

interface BSQSchool {
  university: string;
  school: string;
  rank: number | null;
  tier: string | null;
  unitid: number | null;
  control: string | null;
  enrollment: {
    universityStart: number | null;
    universityEnd: number | null;
    gradStart: number | null;
    gradEnd: number | null;
    bizPctStart: number | null;
    bizPctEnd: number | null;
    estBizStart: number | null;
    estBizEnd: number | null;
    bizDegreesLatest: number | null;
  };
  bsq: Record<string, number | null>;
}

const schools: BSQSchool[] = bsqData as BSQSchool[];

function findBSQ(university: string, school: string): BSQSchool | null {
  return schools.find(s => s.university === university && s.school === school) || null;
}

const PIE_COLORS = ["#3b82f6", "#ec4899", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

function fmt(val: number | null | undefined, decimals = 0): string {
  if (val == null) return "—";
  if (Math.abs(val) >= 1000) return val.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return val.toFixed(decimals);
}

function pctChange(start: number | null | undefined, end: number | null | undefined): { text: string; color: string } | null {
  if (start == null || end == null || start === 0) return null;
  const pct = ((end - start) / start) * 100;
  const arrow = pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const color = pct > 0 ? "text-green-600" : pct < 0 ? "text-red-600" : "text-muted-foreground";
  return { text: `${arrow} ${Math.abs(pct).toFixed(1)}%`, color };
}

function KPICard({ label, value, sub, change }: { label: string; value: string; sub?: string; change?: { text: string; color: string } | null }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 text-center">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-primary">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {change && <p className={`text-xs font-semibold mt-1 ${change.color}`}>{change.text}</p>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-primary border-b border-border pb-1 mb-4">{children}</h3>;
}

export default function SchoolResearch() {
  const schoolList = useSchoolList();
  const [selectedKey, setSelectedKey] = useState(schoolList[0]?.key || "");
  const [sortMode, setSortMode] = useState<SortMode>("rank");

  const sortedSchools = useMemo(() => {
    const list = [...schoolList];
    if (sortMode === "alpha") {
      list.sort((a, b) => a.university.localeCompare(b.university) || a.school.localeCompare(b.school));
    }
    return list;
  }, [schoolList, sortMode]);

  const parsed = useMemo(() => parseSchoolKey(selectedKey), [selectedKey]);
  const selectedInfo = useMemo(() => schoolList.find(s => s.key === selectedKey), [schoolList, selectedKey]);
  const bsq = useMemo(() => findBSQ(parsed.university, parsed.school), [parsed]);
  const deans = useSchoolDeans(selectedKey);

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
                <Select value={selectedKey} onValueChange={setSelectedKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a school..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {sortedSchools.map(s => (
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
                <Select value={sortMode} onValueChange={v => setSortMode(v as SortMode)}>
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
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{parsed.university}</Badge>
                {selectedInfo.rank && <Badge variant="secondary">Rank #{selectedInfo.rank}</Badge>}
                {selectedInfo.tier && <Badge variant="secondary">{selectedInfo.tier}</Badge>}
                <Badge variant="outline">{deans.length} deans on record</Badge>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <USMap selectedSchoolKey={selectedKey} onSelectSchool={setSelectedKey} />
        </TabsContent>
      </Tabs>

      {bsq ? (
        <SchoolInfographic bsq={bsq} deanCount={deans.length} />
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p className="text-lg font-medium">No AACSB data available for this school</p>
            <p className="text-sm mt-1">BSQ data is available for {schools.filter(s => s.bsq.totalHeadcount != null).length} of {schools.length} schools in the dataset.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SchoolInfographic({ bsq, deanCount }: { bsq: BSQSchool; deanCount: number }) {
  const b = bsq.bsq;
  const e = bsq.enrollment;

  const ugGenderData = useMemo(() => {
    if (b.ugMale == null && b.ugFemale == null) return null;
    return [
      { name: "Male", value: b.ugMale || 0 },
      { name: "Female", value: b.ugFemale || 0 },
    ].filter(d => d.value > 0);
  }, [b]);

  const mbaGenderData = useMemo(() => {
    if (b.mbaMale == null && b.mbaFemale == null) return null;
    return [
      { name: "Male", value: b.mbaMale || 0 },
      { name: "Female", value: b.mbaFemale || 0 },
    ].filter(d => d.value > 0);
  }, [b]);

  const enrollmentCompare = useMemo(() => {
    const items = [];
    if (b.ugTotal != null) items.push({ name: "UG", value: b.ugTotal });
    if (b.mbaTotal != null) items.push({ name: "MBA", value: b.mbaTotal });
    const other = (b.totalHeadcount || 0) - (b.ugTotal || 0) - (b.mbaTotal || 0);
    if (other > 0) items.push({ name: "Other", value: other });
    return items.length > 0 ? items : null;
  }, [b]);

  const ugFTPTData = useMemo(() => {
    if (b.ugFT == null && b.ugPT == null) return null;
    return [
      { name: "Full-Time", value: b.ugFT || 0 },
      { name: "Part-Time", value: b.ugPT || 0 },
    ].filter(d => d.value > 0);
  }, [b]);

  const mbaFTPTData = useMemo(() => {
    if (b.mbaFT == null && b.mbaPT == null) return null;
    return [
      { name: "Full-Time", value: b.mbaFT || 0 },
      { name: "Part-Time", value: b.mbaPT || 0 },
    ].filter(d => d.value > 0);
  }, [b]);

  const admissionsFunnel = useMemo(() => {
    if (b.ugApplicants == null) return null;
    return [
      { name: "Applicants", value: b.ugApplicants || 0, fill: "#3b82f6" },
      { name: "Admitted", value: b.ugAdmitted || 0, fill: "#8b5cf6" },
      { name: "Entrants", value: b.ugEntrants || 0, fill: "#10b981" },
    ];
  }, [b]);

  const degreeGenderData = useMemo(() => {
    if (b.ugDegreesMale == null && b.ugDegreesFemale == null) return null;
    return [
      { name: "Male", value: b.ugDegreesMale || 0 },
      { name: "Female", value: b.ugDegreesFemale || 0 },
    ].filter(d => d.value > 0);
  }, [b]);

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
        <CardContent className="py-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-primary">{bsq.university}</h2>
              <p className="text-sm text-muted-foreground">{bsq.school}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {bsq.rank && <Badge className="bg-blue-600 text-white">Rank #{bsq.rank}</Badge>}
              {bsq.tier && <Badge variant="secondary">{bsq.tier}</Badge>}
              {bsq.control && <Badge variant="outline">{bsq.control}</Badge>}
              <Badge variant="outline">{deanCount} deans recorded</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            <KPICard
              label="Total Headcount"
              value={fmt(b.totalHeadcount)}
              change={pctChange(b.totalHeadcountStart, b.totalHeadcount)}
            />
            <KPICard
              label="UG Enrollment"
              value={fmt(b.ugTotal)}
              change={pctChange(b.ugTotalStart, b.ugTotal)}
            />
            <KPICard
              label="MBA Enrollment"
              value={fmt(b.mbaTotal)}
              change={pctChange(b.mbaTotalStart, b.mbaTotal)}
            />
            <KPICard
              label="Student:Faculty"
              value={b.studentFacultyRatio != null ? b.studentFacultyRatio.toFixed(1) : "—"}
              sub={b.studentFacultyRatioAvg != null ? `avg ${b.studentFacultyRatioAvg.toFixed(1)}` : undefined}
            />
            <KPICard
              label="Avg SAT"
              value={b.ugAvgSAT != null ? fmt(b.ugAvgSAT) : b.ugAvgSATStart != null ? fmt(b.ugAvgSATStart) : "—"}
              change={pctChange(b.ugAvgSATStart, b.ugAvgSAT)}
            />
            <KPICard
              label="UG Yield Rate"
              value={b.ugYieldPct != null ? `${b.ugYieldPct}%` : "—"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {enrollmentCompare && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Enrollment Composition</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={enrollmentCompare}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                    label={({ name, value, percent }) => `${name}: ${fmt(value)} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {enrollmentCompare.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {admissionsFunnel && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">UG Admissions Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={admissionsFunnel} layout="vertical" margin={{ left: 20, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={80} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {admissionsFunnel.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {b.ugApplicants && b.ugAdmitted && (
                <div className="flex justify-center gap-6 mt-2 text-xs text-muted-foreground">
                  <span>Acceptance Rate: <strong className="text-primary">{((b.ugAdmitted / b.ugApplicants) * 100).toFixed(1)}%</strong></span>
                  {b.ugEntrants && <span>Yield: <strong className="text-primary">{((b.ugEntrants / b.ugAdmitted) * 100).toFixed(1)}%</strong></span>}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {ugGenderData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">UG Gender (FT)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ugGenderData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                    {ugGenderData.map((_, i) => <Cell key={i} fill={i === 0 ? "#3b82f6" : "#ec4899"} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                {ugGenderData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? "#3b82f6" : "#ec4899" }} />
                    {d.name}: {fmt(d.value)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {mbaGenderData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">MBA Gender</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={mbaGenderData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                    {mbaGenderData.map((_, i) => <Cell key={i} fill={i === 0 ? "#3b82f6" : "#ec4899"} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                {mbaGenderData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? "#3b82f6" : "#ec4899" }} />
                    {d.name}: {fmt(d.value)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {ugFTPTData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">UG Full vs Part-Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={ugFTPTData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                    {ugFTPTData.map((_, i) => <Cell key={i} fill={i === 0 ? "#10b981" : "#f59e0b"} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                {ugFTPTData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? "#10b981" : "#f59e0b"}} />
                    {d.name}: {fmt(d.value)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {mbaFTPTData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">MBA Full vs Part-Time</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={mbaFTPTData} cx="50%" cy="50%" innerRadius={35} outerRadius={65} paddingAngle={3} dataKey="value">
                    {mbaFTPTData.map((_, i) => <Cell key={i} fill={i === 0 ? "#10b981" : "#f59e0b"} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 text-xs">
                {mbaFTPTData.map((d, i) => (
                  <span key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: i === 0 ? "#10b981" : "#f59e0b"}} />
                    {d.name}: {fmt(d.value)}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {degreeGenderData && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">UG Degrees Awarded by Gender</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={degreeGenderData} cx="50%" cy="50%" innerRadius={40} outerRadius={75} paddingAngle={3} dataKey="value">
                      {degreeGenderData.map((_, i) => <Cell key={i} fill={i === 0 ? "#3b82f6" : "#ec4899"} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total UG Degrees</p>
                    <p className="text-2xl font-bold text-primary">{fmt(b.ugDegreesTotal)}</p>
                    {b.ugDegreesTotalStart != null && b.ugDegreesTotal != null && (
                      <p className={`text-xs font-semibold ${pctChange(b.ugDegreesTotalStart, b.ugDegreesTotal)?.color}`}>
                        {pctChange(b.ugDegreesTotalStart, b.ugDegreesTotal)?.text} from start
                      </p>
                    )}
                  </div>
                  {b.mbaDegrees != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">MBA Degrees</p>
                      <p className="text-lg font-bold text-primary">{fmt(b.mbaDegrees)}</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Classroom & Faculty</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/40 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Mean UG Class Size</p>
                <p className="text-3xl font-bold text-primary">{b.meanClassSizeUG != null ? b.meanClassSizeUG : "—"}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Mean Masters Class Size</p>
                <p className="text-3xl font-bold text-primary">{b.meanClassSizeMasters != null ? b.meanClassSizeMasters : "—"}</p>
              </div>
              <div className="bg-muted/40 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Student:Faculty Ratio</p>
                <p className="text-3xl font-bold text-primary">{b.studentFacultyRatio != null ? b.studentFacultyRatio.toFixed(1) : "—"}</p>
                {b.studentFacultyRatioAvg != null && (
                  <p className="text-xs text-muted-foreground">avg: {b.studentFacultyRatioAvg.toFixed(1)}</p>
                )}
              </div>
              <div className="bg-muted/40 rounded-lg p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Avg ACT Score</p>
                <p className="text-3xl font-bold text-primary">{b.ugAvgACT != null ? Math.round(b.ugAvgACT as number) : "—"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {e.universityStart != null && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">University-Level Enrollment Context</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground">University Enrollment (Start)</p>
                <p className="text-lg font-bold">{fmt(e.universityStart)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">University Enrollment (End)</p>
                <p className="text-lg font-bold">{fmt(e.universityEnd)}</p>
                {pctChange(e.universityStart, e.universityEnd) && (
                  <p className={`text-xs font-semibold ${pctChange(e.universityStart, e.universityEnd)!.color}`}>
                    {pctChange(e.universityStart, e.universityEnd)!.text}
                  </p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Business % of University</p>
                <p className="text-lg font-bold">{e.bizPctEnd != null ? `${(e.bizPctEnd * 100).toFixed(1)}%` : "—"}</p>
                {e.bizPctStart != null && e.bizPctEnd != null && (
                  <p className="text-xs text-muted-foreground">was {(e.bizPctStart * 100).toFixed(1)}%</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground">Business Degrees (Latest)</p>
                <p className="text-lg font-bold">{fmt(e.bizDegreesLatest)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
