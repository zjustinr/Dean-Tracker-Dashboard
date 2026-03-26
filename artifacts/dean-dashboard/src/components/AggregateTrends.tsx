import { useMemo, useState } from "react";
import { useAllDeans } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { CHART_COLORS, NEXT_ROLE_LABELS, ORIGIN_LABELS } from "@/data/types";

export default function AggregateTrends() {
  const allDeans = useAllDeans();
  const [top50Only, setTop50Only] = useState(false);
  const data = useMemo(() => (top50Only ? allDeans.filter((d) => d.inTop50) : allDeans), [allDeans, top50Only]);

  const appointmentsByDecade = useMemo(() => {
    const decades: Record<string, { total: number; female: number; internal: number; external: number; interim: number; firstTime: number }> = {};
    for (const d of data) {
      if (!d.startYear) continue;
      const decade = `${Math.floor(d.startYear / 10) * 10}s`;
      if (!decades[decade]) decades[decade] = { total: 0, female: 0, internal: 0, external: 0, interim: 0, firstTime: 0 };
      decades[decade].total++;
      if (d.isFemale) decades[decade].female++;
      if (d.isInternal) decades[decade].internal++;
      if (d.isExternal) decades[decade].external++;
      if (d.isInterim) decades[decade].interim++;
      if (d.isFirstTimeDean) decades[decade].firstTime++;
    }
    return Object.entries(decades)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([decade, v]) => ({
        decade,
        ...v,
        femalePct: v.total ? Math.round((v.female / v.total) * 100) : 0,
        internalPct: v.total ? Math.round((v.internal / v.total) * 100) : 0,
        externalPct: v.total ? Math.round((v.external / v.total) * 100) : 0,
      }));
  }, [data]);

  const yearlyTrend = useMemo(() => {
    const years: Record<number, { total: number; female: number; male: number }> = {};
    for (const d of data) {
      if (!d.startYear || d.startYear < 1980) continue;
      if (!years[d.startYear]) years[d.startYear] = { total: 0, female: 0, male: 0 };
      years[d.startYear].total++;
      if (d.isFemale) years[d.startYear].female++;
      else years[d.startYear].male++;
    }
    return Object.entries(years)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, v]) => ({ year: Number(year), ...v }));
  }, [data]);

  const tenureByEra = useMemo(() => {
    const eras: Record<string, number[]> = {};
    for (const d of data) {
      if (!d.era || !d.tenureLength) continue;
      if (!eras[d.era]) eras[d.era] = [];
      eras[d.era].push(d.tenureLength);
    }
    return Object.entries(eras)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([era, lengths]) => ({
        era,
        avg: Math.round((lengths.reduce((s, v) => s + v, 0) / lengths.length) * 10) / 10,
        median: lengths.sort((a, b) => a - b)[Math.floor(lengths.length / 2)],
        count: lengths.length,
      }));
  }, [data]);

  const disciplineDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of data) {
      const disc = d.disciplineBroad || "Unknown";
      counts[disc] = (counts[disc] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [data]);

  const originDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of data) {
      const o = d.origin || "Unknown";
      counts[o] = (counts[o] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name: ORIGIN_LABELS[name] || name, value }));
  }, [data]);

  const nextRoleDist = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of data) {
      if (!d.nextRole) continue;
      counts[d.nextRole] = (counts[d.nextRole] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name: NEXT_ROLE_LABELS[name] || name, value }));
  }, [data]);

  const genderByTier = useMemo(() => {
    const tiers: Record<string, { total: number; female: number }> = {};
    for (const d of data) {
      if (!d.tier) continue;
      if (!tiers[d.tier]) tiers[d.tier] = { total: 0, female: 0 };
      tiers[d.tier].total++;
      if (d.isFemale) tiers[d.tier].female++;
    }
    return Object.entries(tiers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, v]) => ({
        tier: tier.replace(/\s*\(.*\)/, ""),
        total: v.total,
        female: v.female,
        male: v.total - v.female,
        femalePct: Math.round((v.female / v.total) * 100),
      }));
  }, [data]);

  const kpis = useMemo(() => {
    const tenures = data.filter((d) => d.tenureLength).map((d) => d.tenureLength!);
    const avgTenure = tenures.length ? Math.round((tenures.reduce((s, v) => s + v, 0) / tenures.length) * 10) / 10 : 0;
    const femalePct = data.length ? Math.round((data.filter((d) => d.isFemale).length / data.length) * 100) : 0;
    const internalPct = data.length ? Math.round((data.filter((d) => d.isInternal).length / data.length) * 100) : 0;
    const firstTimePct = data.length ? Math.round((data.filter((d) => d.isFirstTimeDean).length / data.length) * 100) : 0;
    return { total: data.length, avgTenure, femalePct, internalPct, firstTimePct };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch id="top50agg" checked={top50Only} onCheckedChange={setTop50Only} />
        <Label htmlFor="top50agg" className="text-sm">Top 50 schools only</Label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KPICard label="Total Deans" value={String(kpis.total)} />
        <KPICard label="Avg Tenure" value={`${kpis.avgTenure} yrs`} />
        <KPICard label="Female" value={`${kpis.femalePct}%`} />
        <KPICard label="Internal Hire" value={`${kpis.internalPct}%`} />
        <KPICard label="First-Time Dean" value={`${kpis.firstTimePct}%`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Annual Appointments by Gender</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={yearlyTrend} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="year" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="male" stackId="1" fill={CHART_COLORS[0]} stroke={CHART_COLORS[0]} fillOpacity={0.6} name="Male" />
                <Area type="monotone" dataKey="female" stackId="1" fill={CHART_COLORS[4]} stroke={CHART_COLORS[4]} fillOpacity={0.6} name="Female" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Average Tenure by Era</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={tenureByEra} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="era" fontSize={11} />
                <YAxis fontSize={11} label={{ value: "Years", angle: -90, position: "insideLeft", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="avg" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="Avg Tenure" />
                <Bar dataKey="median" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} name="Median Tenure" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Female Representation by Decade</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={appointmentsByDecade} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="decade" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(value: number) => [`${value}%`, ""]}
                />
                <Bar dataKey="femalePct" fill={CHART_COLORS[4]} radius={[4, 4, 0, 0]} name="% Female" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Internal vs External by Decade</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={appointmentsByDecade} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="decade" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="internalPct" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="% Internal" />
                <Bar dataKey="externalPct" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="% External" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Dean Disciplines</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={disciplineDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} fontSize={11}>
                  {disciplineDist.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Origin Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={originDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={2} fontSize={11}>
                  {originDist.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Post-Dean Career Paths</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={nextRoleDist} layout="vertical" margin={{ top: 10, right: 30, bottom: 0, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={140} fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Gender Distribution by School Tier</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={genderByTier} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="tier" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="male" stackId="a" fill={CHART_COLORS[0]} name="Male" />
                <Bar dataKey="female" stackId="a" fill={CHART_COLORS[4]} name="Female" radius={[4, 4, 0, 0]} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
