import { useMemo, useState } from "react";
import { DATASETS, DATASET_LIST, DatasetId } from "@/data/datasets";
import type { Dean } from "@/data/types";
import { CHART_COLORS, NEXT_ROLE_LABELS } from "@/data/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

const DS_IDS: DatasetId[] = ["top100", "r1bschool", "r1eschool"];

const DS_COLORS: Record<DatasetId, string> = {
  top100: CHART_COLORS[0],
  r1bschool: CHART_COLORS[1],
  r1eschool: CHART_COLORS[2],
};

interface DatasetStats {
  total: number;
  schools: number;
  avgTenure: number;
  medianTenure: number;
  femalePct: number;
  internalPct: number;
  externalPct: number;
  interimPct: number;
  firstTimePct: number;
  phdPct: number;
  industryPct: number;
  priorDeanPct: number;
  conversionRate: number;
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

function computeStats(deans: Dean[]): DatasetStats {
  const total = deans.length;
  const schools = new Set(deans.map((d) => `${d.university}|||${d.school}`)).size;
  const tenures = deans.filter((d) => d.tenureLength).map((d) => d.tenureLength!).sort((a, b) => a - b);
  const avgTenure = tenures.length ? Math.round((tenures.reduce((s, v) => s + v, 0) / tenures.length) * 10) / 10 : 0;
  const medianTenure = tenures.length ? tenures[Math.floor(tenures.length / 2)] : 0;

  const interims = deans.filter((d) => d.isInterim);
  const converted = interims.filter((interim) =>
    deans.some(
      (d) =>
        !d.isInterim &&
        d.dean === interim.dean &&
        d.school === interim.school &&
        d.id !== interim.id &&
        d.startYear != null &&
        interim.startYear != null &&
        d.startYear >= interim.startYear
    )
  );

  return {
    total,
    schools,
    avgTenure,
    medianTenure,
    femalePct: pct(deans.filter((d) => d.isFemale).length, total),
    internalPct: pct(deans.filter((d) => d.isInternal && !d.isInterim).length, total),
    externalPct: pct(deans.filter((d) => d.isExternal && !d.isInterim).length, total),
    interimPct: pct(interims.length, total),
    firstTimePct: pct(deans.filter((d) => d.isFirstTimeDean).length, total),
    phdPct: pct(deans.filter((d) => d.hasPhd).length, total),
    industryPct: pct(deans.filter((d) => d.hasIndustryExp).length, total),
    priorDeanPct: pct(deans.filter((d) => d.hasPriorDeanExp).length, total),
    conversionRate: pct(converted.length, interims.length),
  };
}

type DecadeMetric = "femalePct" | "internalPct" | "externalPct" | "interimPct" | "firstTimePct" | "avgTenure" | "total";

const METRIC_OPTIONS: { value: DecadeMetric; label: string; unit: string }[] = [
  { value: "femalePct", label: "Female %", unit: "%" },
  { value: "internalPct", label: "Internal Hire %", unit: "%" },
  { value: "externalPct", label: "External Hire %", unit: "%" },
  { value: "interimPct", label: "Interim %", unit: "%" },
  { value: "firstTimePct", label: "First-Time Dean %", unit: "%" },
  { value: "avgTenure", label: "Avg Tenure (yrs)", unit: " yrs" },
  { value: "total", label: "Appointments (count)", unit: "" },
];

function decadeStats(deans: Dean[]): Record<string, Record<DecadeMetric, number>> {
  const buckets: Record<string, { total: number; female: number; internal: number; external: number; interim: number; firstTime: number; tenures: number[] }> = {};
  for (const d of deans) {
    if (!d.startYear || d.startYear < 1970) continue;
    const decade = `${Math.floor(d.startYear / 10) * 10}s`;
    if (!buckets[decade]) buckets[decade] = { total: 0, female: 0, internal: 0, external: 0, interim: 0, firstTime: 0, tenures: [] };
    const b = buckets[decade];
    b.total++;
    if (d.isFemale) b.female++;
    if (d.isInterim) b.interim++;
    else if (d.isInternal) b.internal++;
    else if (d.isExternal) b.external++;
    if (d.isFirstTimeDean) b.firstTime++;
    if (d.tenureLength) b.tenures.push(d.tenureLength);
  }
  const out: Record<string, Record<DecadeMetric, number>> = {};
  for (const [decade, b] of Object.entries(buckets)) {
    out[decade] = {
      total: b.total,
      femalePct: pct(b.female, b.total),
      internalPct: pct(b.internal, b.total),
      externalPct: pct(b.external, b.total),
      interimPct: pct(b.interim, b.total),
      firstTimePct: pct(b.firstTime, b.total),
      avgTenure: b.tenures.length ? Math.round((b.tenures.reduce((s, v) => s + v, 0) / b.tenures.length) * 10) / 10 : 0,
    };
  }
  return out;
}

const TABLE_ROWS: { key: keyof DatasetStats; label: string; format: (v: number) => string }[] = [
  { key: "total", label: "Dean Appointments", format: (v) => String(v) },
  { key: "schools", label: "Schools Covered", format: (v) => String(v) },
  { key: "avgTenure", label: "Avg Tenure (yrs)", format: (v) => v.toFixed(1) },
  { key: "medianTenure", label: "Median Tenure (yrs)", format: (v) => String(v) },
  { key: "femalePct", label: "Female %", format: (v) => `${v}%` },
  { key: "internalPct", label: "Internal Hire %", format: (v) => `${v}%` },
  { key: "externalPct", label: "External Hire %", format: (v) => `${v}%` },
  { key: "interimPct", label: "Interim %", format: (v) => `${v}%` },
  { key: "firstTimePct", label: "First-Time Dean %", format: (v) => `${v}%` },
  { key: "phdPct", label: "PhD Holders %", format: (v) => `${v}%` },
  { key: "industryPct", label: "Industry Experience %", format: (v) => `${v}%` },
  { key: "priorDeanPct", label: "Prior Dean Experience %", format: (v) => `${v}%` },
  { key: "conversionRate", label: "Interim → Permanent Conversion %", format: (v) => `${v}%` },
];

const SHARE_BARS: { key: keyof DatasetStats; label: string }[] = [
  { key: "femalePct", label: "Female" },
  { key: "internalPct", label: "Internal" },
  { key: "externalPct", label: "External" },
  { key: "interimPct", label: "Interim" },
  { key: "firstTimePct", label: "First-Time" },
  { key: "phdPct", label: "PhD" },
  { key: "priorDeanPct", label: "Prior Dean Exp" },
];

export default function CompareDatasets() {
  const [metric, setMetric] = useState<DecadeMetric>("femalePct");

  const stats = useMemo(() => {
    const out = {} as Record<DatasetId, DatasetStats>;
    for (const id of DS_IDS) out[id] = computeStats(DATASETS[id].deans);
    return out;
  }, []);

  const decades = useMemo(() => {
    const perDataset = {} as Record<DatasetId, Record<string, Record<DecadeMetric, number>>>;
    for (const id of DS_IDS) perDataset[id] = decadeStats(DATASETS[id].deans);
    const allDecades = [...new Set(DS_IDS.flatMap((id) => Object.keys(perDataset[id])))].sort();
    return allDecades.map((decade) => {
      const row: Record<string, number | string | null> = { decade };
      for (const id of DS_IDS) row[id] = perDataset[id][decade]?.[metric] ?? null;
      return row;
    });
  }, [metric]);

  const shareComparison = useMemo(
    () =>
      SHARE_BARS.map(({ key, label }) => {
        const row: Record<string, number | string> = { metric: label };
        for (const id of DS_IDS) row[id] = stats[id][key];
        return row;
      }),
    [stats]
  );

  const nextRoleComparison = useMemo(() => {
    const roleSets = {} as Record<DatasetId, Record<string, number>>;
    for (const id of DS_IDS) {
      const deans = DATASETS[id].deans;
      const withRole = deans.filter((d) => d.nextRole && d.nextRole !== "Unknown" && d.nextRole !== "Still_serving");
      const counts: Record<string, number> = {};
      for (const d of withRole) counts[d.nextRole] = (counts[d.nextRole] || 0) + 1;
      const shares: Record<string, number> = {};
      for (const [role, n] of Object.entries(counts)) shares[role] = pct(n, withRole.length);
      roleSets[id] = shares;
    }
    const roles = [...new Set(DS_IDS.flatMap((id) => Object.keys(roleSets[id])))];
    return roles
      .map((role) => {
        const row: Record<string, number | string> = { role: NEXT_ROLE_LABELS[role] || role };
        for (const id of DS_IDS) row[id] = roleSets[id][role] ?? 0;
        return row;
      })
      .sort((a, b) => (b.top100 as number) - (a.top100 as number));
  }, []);

  const metricOption = METRIC_OPTIONS.find((m) => m.value === metric)!;
  const tooltipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {DATASET_LIST.map((d) => (
          <span key={d.id} className="flex items-center gap-1.5 text-sm font-medium">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: DS_COLORS[d.id] }} />
            {d.label}
          </span>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Compares all three datasets side by side, regardless of the dataset selected above. Note: the Top-100 and R1 business school
        samples overlap substantially; R1 Engineering is a distinct population.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Head-to-Head Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-semibold">Metric</th>
                  {DATASET_LIST.map((d) => (
                    <th key={d.id} className="py-2 px-4 font-semibold text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: DS_COLORS[d.id] }} />
                        {d.shortLabel}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map(({ key, label, format }) => (
                  <tr key={key} className="border-b border-border/50 hover:bg-muted/40">
                    <td className="py-2 pr-4 text-muted-foreground">{label}</td>
                    {DS_IDS.map((id) => (
                      <td key={id} className="py-2 px-4 text-right font-medium tabular-nums">{format(stats[id][key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-base">Trend by Decade: {metricOption.label}</CardTitle>
          <Select value={metric} onValueChange={(v) => setMetric(v as DecadeMetric)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={decades} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="decade" fontSize={11} />
              <YAxis fontSize={11} unit={metricOption.unit === "%" ? "%" : undefined} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: number, name: string) => [`${value}${metricOption.unit}`, name]}
              />
              {DS_IDS.map((id) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={DS_COLORS[id]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  connectNulls
                  name={DATASETS[id].meta.shortLabel}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground mt-2">Appointments from 1970 onward; the 2020s decade is partial.</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Appointment Shares Compared</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={shareComparison} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="metric" fontSize={10} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
                {DS_IDS.map((id) => (
                  <Bar key={id} dataKey={id} fill={DS_COLORS[id]} radius={[4, 4, 0, 0]} name={DATASETS[id].meta.shortLabel} />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Post-Dean Career Paths (% of known outcomes)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={nextRoleComparison} layout="vertical" margin={{ top: 10, right: 30, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} unit="%" />
                <YAxis type="category" dataKey="role" width={140} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}%`, name]} />
                {DS_IDS.map((id) => (
                  <Bar key={id} dataKey={id} fill={DS_COLORS[id]} radius={[0, 4, 4, 0]} name={DATASETS[id].meta.shortLabel} />
                ))}
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">Excludes deans still serving or with unknown next roles.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
