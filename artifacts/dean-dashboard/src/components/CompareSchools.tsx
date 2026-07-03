import React, { useState, useMemo, useRef, useEffect } from "react";

import { useSchoolList, useAllDeans, makeSchoolKey, parseSchoolKey, useBSQ } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import type { Dean } from "@/data/types";

interface BSQSchool {
  university: string;
  school: string;
  rank: number | null;
  tier: string | null;
  control: string | null;
  bsq: Record<string, number | string | null>;
}

function makeFindBSQ(bsqSchools: BSQSchool[]) {
  return (university: string, school: string): BSQSchool | null =>
    bsqSchools.find(s => s.university === university && s.school === school) || null;
}

function n(v: number | string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const x = Number(v);
  return isNaN(x) ? null : x;
}

function fb(bsq: Record<string, number | string | null> | undefined, key: string): number | null {
  if (!bsq) return null;
  return n(bsq[key]) ?? n(bsq[key + "Start"]) ?? n(bsq[key + "Avg"]);
}

function fmt(val: number | null | undefined, decimals = 0): string {
  if (val == null) return "\u2014";
  if (Math.abs(val) >= 1000) return val.toLocaleString("en-US", { maximumFractionDigits: decimals });
  return val.toFixed(decimals);
}

function pctStr(val: number | null | undefined): string {
  if (val == null) return "\u2014";
  return `${val.toFixed(1)}%`;
}

const SCHOOL_COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b"];

interface SchoolMetrics {
  key: string;
  label: string;
  shortLabel: string;
  rank: number | null;
  tier: string | null;
  control: string | null;
  totalDeans: number;
  avgTenure: number | null;
  femalePct: number | null;
  internalPct: number | null;
  externalPct: number | null;
  interimPct: number | null;
  firstTimeDeanPct: number | null;
  phdPct: number | null;
  industryExpPct: number | null;
  priorDeanExpPct: number | null;
  totalHeadcount: number | null;
  ugTotal: number | null;
  mbaTotal: number | null;
  studentFacultyRatio: number | null;
  ugAvgSAT: number | null;
  ugYieldPct: number | null;
  ugApplicants: number | null;
  ugAdmitted: number | null;
  ugEntrants: number | null;
  ugAcceptanceRate: number | null;
  ugMeanSalary: number | null;
  ugMedianSalary: number | null;
  ugEmployedByGrad: number | null;
  ugEmployedBy3Mo: number | null;
  meanClassSizeUG: number | null;
  meanClassSizeMasters: number | null;
  nCoursesUG: number | null;
  nCoursesMasters: number | null;
  ugDegreesMalePct: number | null;
  ugDegreesFemalePct: number | null;
  mbaFTPct: number | null;
  instTotal: number | null;
}

function computeMetrics(key: string, deans: Dean[], bsq: BSQSchool | null): SchoolMetrics {
  const parsed = parseSchoolKey(key);
  const total = deans.length;
  const withTenure = deans.filter(d => d.tenureLength != null);
  const avgTenure = withTenure.length > 0 ? withTenure.reduce((s, d) => s + (d.tenureLength || 0), 0) / withTenure.length : null;
  const pctOf = (pred: (d: Dean) => boolean) => total > 0 ? (deans.filter(pred).length / total) * 100 : null;

  const b = bsq?.bsq;
  const ugDegMale = fb(b, "ugDegreesMale");
  const ugDegFemale = fb(b, "ugDegreesFemale");
  const ugDegTotal = ugDegMale != null && ugDegFemale != null ? ugDegMale + ugDegFemale : null;
  const mbaFT = fb(b, "mbaFT");
  const mbaTot = fb(b, "mbaTotal");
  const ugApplicants = fb(b, "ugApplicants");
  const ugAdmitted = fb(b, "ugAdmitted");

  return {
    key,
    label: `${parsed.university} \u2013 ${parsed.school}`,
    shortLabel: parsed.school,
    rank: bsq?.rank ?? deans[0]?.rank ?? null,
    tier: bsq?.tier ?? deans[0]?.tier ?? null,
    control: bsq?.control ?? null,
    totalDeans: total,
    avgTenure: avgTenure != null ? Math.round(avgTenure * 10) / 10 : null,
    femalePct: pctOf(d => d.isFemale),
    internalPct: pctOf(d => d.isInternal),
    externalPct: pctOf(d => d.isExternal),
    interimPct: pctOf(d => d.isInterim),
    firstTimeDeanPct: pctOf(d => d.isFirstTimeDean),
    phdPct: pctOf(d => d.hasPhd),
    industryExpPct: pctOf(d => d.hasIndustryExp),
    priorDeanExpPct: pctOf(d => d.hasPriorDeanExp),
    totalHeadcount: fb(b, "totalHeadcount"),
    ugTotal: fb(b, "ugTotal"),
    mbaTotal: fb(b, "mbaTotal"),
    studentFacultyRatio: fb(b, "studentFacultyRatio"),
    ugAvgSAT: fb(b, "ugAvgSAT"),
    ugYieldPct: fb(b, "ugYieldPct"),
    ugApplicants,
    ugAdmitted,
    ugEntrants: fb(b, "ugEntrants"),
    ugAcceptanceRate: ugApplicants && ugAdmitted ? (ugAdmitted / ugApplicants) * 100 : null,
    ugMeanSalary: fb(b, "ugMeanSalary"),
    ugMedianSalary: fb(b, "ugMedianSalary"),
    ugEmployedByGrad: fb(b, "ugEmployedByGrad"),
    ugEmployedBy3Mo: fb(b, "ugEmployedBy3Mo"),
    meanClassSizeUG: fb(b, "meanClassSizeUG"),
    meanClassSizeMasters: fb(b, "meanClassSizeMasters"),
    nCoursesUG: fb(b, "nCoursesUG"),
    nCoursesMasters: fb(b, "nCoursesMasters"),
    ugDegreesMalePct: ugDegTotal && ugDegTotal > 0 ? ((ugDegMale || 0) / ugDegTotal) * 100 : null,
    ugDegreesFemalePct: ugDegTotal && ugDegTotal > 0 ? ((ugDegFemale || 0) / ugDegTotal) * 100 : null,
    mbaFTPct: mbaTot && mbaTot > 0 && mbaFT != null ? (mbaFT / mbaTot) * 100 : null,
    instTotal: fb(b, "instTotal"),
  };
}

type BarType = "number" | "pct" | "none";

interface MetricRow {
  key: string;
  label: string;
  category: string;
  format: (m: SchoolMetrics) => string;
  getValue: (m: SchoolMetrics) => number | null;
  barType: BarType;
  lowerIsBetter?: boolean;
}

const METRIC_ROWS: MetricRow[] = [
  { key: "rank", label: "US News Rank", category: "Overview", format: m => m.rank != null ? `#${m.rank}` : "\u2014", getValue: m => m.rank, barType: "none", lowerIsBetter: true },
  { key: "control", label: "Control", category: "Overview", format: m => m.control || "\u2014", getValue: () => null, barType: "none" },
  { key: "totalDeans", label: "Total Deans", category: "Dean Leadership", format: m => String(m.totalDeans), getValue: m => m.totalDeans, barType: "number" },
  { key: "avgTenure", label: "Avg Tenure (yrs)", category: "Dean Leadership", format: m => fmt(m.avgTenure, 1), getValue: m => m.avgTenure, barType: "number" },
  { key: "femalePct", label: "Female Deans %", category: "Dean Leadership", format: m => pctStr(m.femalePct), getValue: m => m.femalePct, barType: "pct" },
  { key: "internalPct", label: "Internal Hires %", category: "Dean Leadership", format: m => pctStr(m.internalPct), getValue: m => m.internalPct, barType: "pct" },
  { key: "externalPct", label: "External Hires %", category: "Dean Leadership", format: m => pctStr(m.externalPct), getValue: m => m.externalPct, barType: "pct" },
  { key: "interimPct", label: "Interim Deans %", category: "Dean Leadership", format: m => pctStr(m.interimPct), getValue: m => m.interimPct, barType: "pct" },
  { key: "firstTimeDeanPct", label: "First-Time Deans %", category: "Dean Leadership", format: m => pctStr(m.firstTimeDeanPct), getValue: m => m.firstTimeDeanPct, barType: "pct" },
  { key: "phdPct", label: "PhD Holders %", category: "Dean Leadership", format: m => pctStr(m.phdPct), getValue: m => m.phdPct, barType: "pct" },
  { key: "industryExpPct", label: "Industry Exp %", category: "Dean Leadership", format: m => pctStr(m.industryExpPct), getValue: m => m.industryExpPct, barType: "pct" },
  { key: "priorDeanExpPct", label: "Prior Dean Exp %", category: "Dean Leadership", format: m => pctStr(m.priorDeanExpPct), getValue: m => m.priorDeanExpPct, barType: "pct" },
  { key: "totalHeadcount", label: "Total Headcount", category: "Enrollment", format: m => fmt(m.totalHeadcount), getValue: m => m.totalHeadcount, barType: "number" },
  { key: "ugTotal", label: "UG Enrollment", category: "Enrollment", format: m => fmt(m.ugTotal), getValue: m => m.ugTotal, barType: "number" },
  { key: "mbaTotal", label: "MBA Enrollment", category: "Enrollment", format: m => fmt(m.mbaTotal), getValue: m => m.mbaTotal, barType: "number" },
  { key: "instTotal", label: "Univ. Total Enrollment", category: "Enrollment", format: m => fmt(m.instTotal), getValue: m => m.instTotal, barType: "number" },
  { key: "studentFacultyRatio", label: "Student:Faculty Ratio", category: "Academics", format: m => fmt(m.studentFacultyRatio, 1), getValue: m => m.studentFacultyRatio, barType: "number", lowerIsBetter: true },
  { key: "ugAvgSAT", label: "Avg SAT Score", category: "Academics", format: m => fmt(m.ugAvgSAT), getValue: m => m.ugAvgSAT, barType: "number" },
  { key: "meanClassSizeUG", label: "Mean Class Size (UG)", category: "Academics", format: m => fmt(m.meanClassSizeUG, 1), getValue: m => m.meanClassSizeUG, barType: "number", lowerIsBetter: true },
  { key: "meanClassSizeMasters", label: "Mean Class Size (Masters)", category: "Academics", format: m => fmt(m.meanClassSizeMasters, 1), getValue: m => m.meanClassSizeMasters, barType: "number", lowerIsBetter: true },
  { key: "nCoursesUG", label: "# Courses (UG)", category: "Academics", format: m => fmt(m.nCoursesUG), getValue: m => m.nCoursesUG, barType: "number" },
  { key: "nCoursesMasters", label: "# Courses (Masters)", category: "Academics", format: m => fmt(m.nCoursesMasters), getValue: m => m.nCoursesMasters, barType: "number" },
  { key: "ugApplicants", label: "UG Applicants", category: "Admissions", format: m => fmt(m.ugApplicants), getValue: m => m.ugApplicants, barType: "number" },
  { key: "ugAdmitted", label: "UG Admitted", category: "Admissions", format: m => fmt(m.ugAdmitted), getValue: m => m.ugAdmitted, barType: "number" },
  { key: "ugEntrants", label: "UG Entrants", category: "Admissions", format: m => fmt(m.ugEntrants), getValue: m => m.ugEntrants, barType: "number" },
  { key: "ugAcceptanceRate", label: "Acceptance Rate", category: "Admissions", format: m => pctStr(m.ugAcceptanceRate), getValue: m => m.ugAcceptanceRate, barType: "pct", lowerIsBetter: true },
  { key: "ugYieldPct", label: "Yield Rate", category: "Admissions", format: m => pctStr(m.ugYieldPct), getValue: m => m.ugYieldPct, barType: "pct" },
  { key: "ugDegreesMalePct", label: "UG Degrees Male %", category: "Degrees", format: m => pctStr(m.ugDegreesMalePct), getValue: m => m.ugDegreesMalePct, barType: "pct" },
  { key: "ugDegreesFemalePct", label: "UG Degrees Female %", category: "Degrees", format: m => pctStr(m.ugDegreesFemalePct), getValue: m => m.ugDegreesFemalePct, barType: "pct" },
  { key: "mbaFTPct", label: "MBA Full-Time %", category: "Degrees", format: m => pctStr(m.mbaFTPct), getValue: m => m.mbaFTPct, barType: "pct" },
  { key: "ugMeanSalary", label: "UG Mean Salary", category: "Employment", format: m => m.ugMeanSalary != null ? `$${fmt(m.ugMeanSalary)}` : "\u2014", getValue: m => m.ugMeanSalary, barType: "number" },
  { key: "ugMedianSalary", label: "UG Median Salary", category: "Employment", format: m => m.ugMedianSalary != null ? `$${fmt(m.ugMedianSalary)}` : "\u2014", getValue: m => m.ugMedianSalary, barType: "number" },
  { key: "ugEmployedByGrad", label: "Employed by Graduation", category: "Employment", format: m => m.ugEmployedByGrad != null ? fmt(m.ugEmployedByGrad) : "\u2014", getValue: m => m.ugEmployedByGrad, barType: "number" },
  { key: "ugEmployedBy3Mo", label: "Employed within 3 Mo", category: "Employment", format: m => m.ugEmployedBy3Mo != null ? fmt(m.ugEmployedBy3Mo) : "\u2014", getValue: m => m.ugEmployedBy3Mo, barType: "number" },
];

const RADAR_METRICS = [
  { key: "femalePct", label: "Female %" },
  { key: "internalPct", label: "Internal %" },
  { key: "interimPct", label: "Interim %" },
  { key: "firstTimeDeanPct", label: "First-Time %" },
  { key: "phdPct", label: "PhD %" },
  { key: "industryExpPct", label: "Industry Exp %" },
];

const BAR_CHART_OPTIONS = METRIC_ROWS.filter(r => r.key !== "control");

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="w-full bg-muted/50 rounded-full h-1.5 mt-0.5">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  );
}

function PctBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-muted/50 rounded-full h-1.5 mt-0.5">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(2, value))}%`, backgroundColor: color }} />
    </div>
  );
}

function SchoolSearchSelect({ available, onSelect }: {
  available: { key: string; university: string; school: string; rank: number | null }[];
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<"rank" | "alpha">("rank");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    let list = available.filter(s =>
      s.university.toLowerCase().includes(q) ||
      s.school.toLowerCase().includes(q)
    );
    if (sortMode === "alpha") {
      list = [...list].sort((a, b) => a.university.localeCompare(b.university));
    }
    return list;
  }, [available, query, sortMode]);

  return (
    <div ref={ref} className="relative">
      <div
        className="flex items-center border border-input rounded-md bg-background hover:bg-accent/50 cursor-text"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        <svg className="w-4 h-4 ml-3 text-muted-foreground shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          className="w-[280px] px-2 py-2 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
          placeholder="Type to search schools..."
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        <button
          className={`px-2 py-1 mr-1 text-xs rounded ${sortMode === "alpha" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          onClick={e => { e.stopPropagation(); setSortMode(sortMode === "rank" ? "alpha" : "rank"); }}
          title={sortMode === "rank" ? "Sort A\u2013Z" : "Sort by Rank"}
        >
          {sortMode === "rank" ? "A\u2013Z" : "#"}
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-64 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">No schools match "{query}"</div>
          )}
          {filtered.map(s => (
            <button
              key={s.key}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2"
              onClick={() => { onSelect(s.key); setQuery(""); setOpen(false); }}
            >
              {s.rank && <span className="text-xs text-muted-foreground w-8 shrink-0">#{s.rank}</span>}
              <span className="truncate">{s.university} \u2013 {s.school}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CompareSchools() {
  const schoolList = useSchoolList();
  const allDeans = useAllDeans();
  const allBSQ = useBSQ() as BSQSchool[];
  const findBSQ = useMemo(() => makeFindBSQ(allBSQ), [allBSQ]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [barMetric, setBarMetric] = useState("totalHeadcount");

  useEffect(() => {
    if (!schoolList.length) return;
    const validKeys = new Set(schoolList.map(s => s.key));
    setSelectedKeys(prev => {
      const filtered = prev.filter(k => validKeys.has(k));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [schoolList]);

  const deansBySchool = useMemo(() => {
    const map = new Map<string, Dean[]>();
    for (const d of allDeans) {
      const key = makeSchoolKey(d.university, d.school);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return map;
  }, [allDeans]);

  const schoolMetrics = useMemo(() => {
    return selectedKeys.map(key => {
      const parsed = parseSchoolKey(key);
      const deans = (deansBySchool.get(key) || []).sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
      const bsq = findBSQ(parsed.university, parsed.school);
      return computeMetrics(key, deans, bsq);
    });
  }, [selectedKeys, deansBySchool, findBSQ]);

  const handleAdd = (val: string) => {
    if (val && !selectedKeys.includes(val) && selectedKeys.length < 4) {
      setSelectedKeys([...selectedKeys, val]);
    }
  };

  const handleRemove = (key: string) => {
    setSelectedKeys(selectedKeys.filter(k => k !== key));
  };

  const availableSchools = useMemo(
    () => schoolList.filter(s => !selectedKeys.includes(s.key)),
    [schoolList, selectedKeys]
  );

  const categories = [...new Set(METRIC_ROWS.map(r => r.category))];

  const rowMaxes = useMemo(() => {
    const maxes: Record<string, number> = {};
    for (const row of METRIC_ROWS) {
      if (row.barType === "number") {
        const vals = schoolMetrics.map(m => row.getValue(m)).filter((v): v is number => v != null);
        maxes[row.key] = vals.length > 0 ? Math.max(...vals) : 0;
      }
    }
    return maxes;
  }, [schoolMetrics]);

  const barChartData = useMemo(() => {
    const metric = BAR_CHART_OPTIONS.find(m => m.key === barMetric) || BAR_CHART_OPTIONS[0];
    return schoolMetrics.map((m, i) => ({
      name: m.shortLabel,
      value: metric.getValue(m),
      fill: SCHOOL_COLORS[i],
    }));
  }, [schoolMetrics, barMetric]);

  const radarData = useMemo(() => {
    return RADAR_METRICS.map(rm => {
      const row: Record<string, string | number | null> = { metric: rm.label };
      schoolMetrics.forEach((m, i) => {
        row[`school${i}`] = (m as unknown as Record<string, unknown>)[rm.key] as number | null;
      });
      return row;
    });
  }, [schoolMetrics]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Select Schools to Compare (up to 4)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-center">
            {selectedKeys.map((key, i) => {
              const parsed = parseSchoolKey(key);
              return (
                <Badge
                  key={key}
                  className="text-sm py-1.5 px-3 cursor-pointer hover:opacity-80"
                  style={{ backgroundColor: SCHOOL_COLORS[i], color: "white" }}
                  onClick={() => handleRemove(key)}
                >
                  {parsed.school} &times;
                </Badge>
              );
            })}
            {selectedKeys.length < 4 && (
              <SchoolSearchSelect available={availableSchools} onSelect={handleAdd} />
            )}
            {selectedKeys.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedKeys([])}>Clear All</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {schoolMetrics.length < 2 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Select at least 2 schools to compare them side by side.</p>
          </CardContent>
        </Card>
      )}

      {schoolMetrics.length >= 2 && (
        <>
          <Card>
            <CardContent className="py-4 overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground w-[200px] sticky left-0 bg-card z-10">Metric</th>
                    {schoolMetrics.map((m, i) => (
                      <th key={m.key} className="text-center py-2 px-3 font-semibold min-w-[160px]" style={{ color: SCHOOL_COLORS[i] }}>
                        {m.shortLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <React.Fragment key={`cat-${cat}`}>
                      <tr>
                        <td colSpan={schoolMetrics.length + 1} className="pt-4 pb-1 px-3 font-semibold text-xs uppercase tracking-wider text-primary border-b border-primary/20">
                          {cat}
                        </td>
                      </tr>
                      {METRIC_ROWS.filter(r => r.category === cat).map((row, ri) => {
                        const values = schoolMetrics.map(m => row.getValue(m)).filter((v): v is number => v != null);
                        const best = values.length > 1 ? (row.lowerIsBetter ? Math.min(...values) : Math.max(...values)) : null;
                        const maxVal = rowMaxes[row.key] || 0;
                        return (
                          <tr key={row.key} className={ri % 2 === 0 ? "bg-muted/30" : ""}>
                            <td className="py-1.5 px-3 text-muted-foreground sticky left-0 bg-inherit z-10">{row.label}</td>
                            {schoolMetrics.map((m, i) => {
                              const val = row.getValue(m);
                              const isBest = best != null && val === best;
                              return (
                                <td key={m.key} className="text-center py-1 px-3">
                                  <div className={`text-sm ${isBest ? "font-bold" : ""}`}>
                                    {row.format(m)}
                                  </div>
                                  {row.barType === "pct" && val != null && (
                                    <PctBar value={val} color={SCHOOL_COLORS[i]} />
                                  )}
                                  {row.barType === "number" && val != null && maxVal > 0 && (
                                    <MiniBar value={val} max={maxVal} color={SCHOOL_COLORS[i]} />
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Bar Comparison</CardTitle>
                  <Select value={barMetric} onValueChange={setBarMetric}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {categories.map(cat => (
                        <div key={cat}>
                          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase">{cat}</div>
                          {BAR_CHART_OPTIONS.filter(r => r.category === cat).map(r => (
                            <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
                          ))}
                        </div>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={barChartData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" fontSize={11} angle={-20} textAnchor="end" />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: number) => fmt(v, 1)} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {barChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dean Profile Radar</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="metric" fontSize={10} />
                    <PolarRadiusAxis fontSize={9} />
                    {schoolMetrics.map((m, i) => (
                      <Radar
                        key={m.key}
                        name={m.shortLabel}
                        dataKey={`school${i}`}
                        stroke={SCHOOL_COLORS[i]}
                        fill={SCHOOL_COLORS[i]}
                        fillOpacity={0.15}
                      />
                    ))}
                    <Legend />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

