import { useMemo, useState } from "react";
import { useAllDeans } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { CHART_COLORS, ORIGIN_LABELS } from "@/data/types";
import { completedTenure, completedTenures } from "@/data/tenure";
import { departureBreakdown, departureCategory, DEPARTURE_CATEGORIES } from "@/data/departure";
import { useDataset } from "@/data/DatasetContext";

export default function AggregateTrends() {
  const { noun, nounPlural, nounLower, nounPluralLower } = useDataset();
  const allDeans = useAllDeans();
  const [interimOnly, setInterimOnly] = useState(false);
  const data = useMemo(
    () => (interimOnly ? allDeans.filter((d) => d.isInterim) : allDeans),
    [allDeans, interimOnly]
  );

  const appointmentsByDecade = useMemo(() => {
    const decades: Record<string, { total: number; female: number; internal: number; external: number; interim: number; firstTime: number }> = {};
    for (const d of data) {
      if (!d.startYear) continue;
      const decade = `${Math.floor(d.startYear / 10) * 10}s`;
      if (!decades[decade]) decades[decade] = { total: 0, female: 0, internal: 0, external: 0, interim: 0, firstTime: 0 };
      decades[decade].total++;
      if (d.isFemale) decades[decade].female++;
      if (d.isInterim) decades[decade].interim++;
      else if (d.isInternal) decades[decade].internal++;
      else if (d.isExternal) decades[decade].external++;
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
        interimPct: v.total ? Math.round((v.interim / v.total) * 100) : 0,
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

  // Completed spells only, via the shared guard (src/data/tenure.ts). Reading
  // `tenureLength` directly mixed in sitting leaders -- four indices freeze a
  // tenure onto people who never left -- and let impossible spans through.
  const tenureByEra = useMemo(() => {
    const eras: Record<string, number[]> = {};
    for (const d of data) {
      const t = completedTenure(d);
      if (!d.era || !t) continue;
      if (!eras[d.era]) eras[d.era] = [];
      eras[d.era].push(t);
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

  // One closed set of destinations, not the raw `nextRole` strings: those are ten
  // canonical codes (two of which overlap) plus 58 free-text job titles, so the
  // chart used to end in a tail of singleton bars and a label-less
  // "Retired_or_emeritus". See src/data/departure.ts for the categories and the
  // coverage caveat -- 62% of completed spells record no destination at all, and
  // that bar is shown rather than dropped, because a distribution over the
  // recorded third would read as a distribution over everyone.
  const nextRoleDist = useMemo(
    () => departureBreakdown(data).map((b) => ({ name: b.label, value: b.value })),
    [data],
  );
  const departureRecorded = useMemo(() => {
    const completed = data.filter((d) => d.endYear != null);
    const known = completed.filter((d) => departureCategory(d) !== "unknown").length;
    return { completed: completed.length, known };
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
    const tenures = completedTenures(data, { includeInterims: true });
    const avgTenure = tenures.length ? Math.round((tenures.reduce((s, v) => s + v, 0) / tenures.length) * 10) / 10 : 0;
    const femalePct = data.length ? Math.round((data.filter((d) => d.isFemale).length / data.length) * 100) : 0;
    const internalPct = data.length ? Math.round((data.filter((d) => d.isInternal && !d.isInterim).length / data.length) * 100) : 0;
    const interimPct = data.length ? Math.round((data.filter((d) => d.isInterim).length / data.length) * 100) : 0;
    const firstTimePct = data.length ? Math.round((data.filter((d) => d.isFirstTimeDean).length / data.length) * 100) : 0;
    return { total: data.length, avgTenure, femalePct, internalPct, interimPct, firstTimePct };
  }, [data]);

  // Conversions come off the stored flag now (scripts/derive-departures.mjs), not
  // a lookup rebuilt here. The old lookup matched on dean + SCHOOL with no
  // university, counted any later permanent spell as a conversion (a return years
  // after somebody else held the seat is a re-appointment, not a conversion), and
  // could not see the 33 conversions recorded only in a spell's own notes. One
  // definition, derived once, is also what makes the number quotable.
  const interimConversion = useMemo(() => {
    const interims = data.filter((d) => d.isInterim);
    const converted = interims.filter((interim) => interim.convertedToPermanent);
    const total = interims.length;
    const convertedCount = converted.length;
    const rate = total ? Math.round((convertedCount / total) * 1000) / 10 : 0;

    const byEra: Record<string, { interims: number; converted: number }> = {};
    for (const interim of interims) {
      const era = interim.era || "Unknown";
      if (!byEra[era]) byEra[era] = { interims: 0, converted: 0 };
      byEra[era].interims++;
      if (interim.convertedToPermanent) {
        byEra[era].converted++;
      }
    }
    const byEraData = Object.entries(byEra)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([era, v]) => ({
        era,
        interims: v.interims,
        converted: v.converted,
        notConverted: v.interims - v.converted,
        rate: v.interims ? Math.round((v.converted / v.interims) * 1000) / 10 : 0,
      }));

    const byTier: Record<string, { interims: number; converted: number }> = {};
    for (const interim of interims) {
      const tier = interim.tier || "Unknown";
      if (!byTier[tier]) byTier[tier] = { interims: 0, converted: 0 };
      byTier[tier].interims++;
      if (interim.convertedToPermanent) {
        byTier[tier].converted++;
      }
    }
    const byTierData = Object.entries(byTier)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, v]) => ({
        tier: tier.replace(/\s*\(.*\)/, ""),
        interims: v.interims,
        converted: v.converted,
        notConverted: v.interims - v.converted,
        rate: v.interims ? Math.round((v.converted / v.interims) * 1000) / 10 : 0,
      }));

    const byGender: Record<string, { interims: number; converted: number }> = {};
    for (const interim of interims) {
      const g = interim.gender || "Unknown";
      if (!byGender[g]) byGender[g] = { interims: 0, converted: 0 };
      byGender[g].interims++;
      if (interim.convertedToPermanent) {
        byGender[g].converted++;
      }
    }
    const byGenderData = Object.entries(byGender)
      .filter(([g]) => g !== "Unknown")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([gender, v]) => ({
        gender,
        interims: v.interims,
        converted: v.converted,
        notConverted: v.interims - v.converted,
        rate: v.interims ? Math.round((v.converted / v.interims) * 1000) / 10 : 0,
      }));

    return { total, convertedCount, rate, byEraData, byTierData, byGenderData };
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch id="interimagg" checked={interimOnly} onCheckedChange={setInterimOnly} />
        <Label htmlFor="interimagg" className="text-sm">Interim appointments only</Label>
      </div>
      {interimOnly && (
        <p className="text-xs text-muted-foreground -mt-3">
          Showing only interim appointments. Conversion metrics below compare interims who moved into
          the permanent role against those who did not.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <KPICard label={`Total ${nounPlural}`} value={String(kpis.total)} />
        <KPICard label="Avg Completed Tenure" value={`${kpis.avgTenure} yrs`} hint="Finished appointments only. Leaders still in the seat have no completed tenure and are excluded." />
        <KPICard label="Female" value={`${kpis.femalePct}%`} />
        <KPICard label="Internal Hire" value={`${kpis.internalPct}%`} />
        <KPICard label="Interim" value={`${kpis.interimPct}%`} />
        <KPICard label={`First-Time ${noun}`} value={`${kpis.firstTimePct}%`} />
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
          <CardHeader><CardTitle className="text-base">Average completed tenure by era</CardTitle></CardHeader>
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
          <CardHeader><CardTitle className="text-base">Internal / External / Interim by Decade</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={appointmentsByDecade} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="decade" fontSize={11} />
                <YAxis fontSize={11} unit="%" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="internalPct" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} name="% Internal" />
                <Bar dataKey="externalPct" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="% External" />
                <Bar dataKey="interimPct" fill={CHART_COLORS[5]} radius={[4, 4, 0, 0]} name="% Interim" />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">{noun} Disciplines</CardTitle></CardHeader>
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
          <CardHeader>
            <CardTitle className="text-base">Where they went next</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {departureRecorded.completed
                ? <>Destination recorded for {departureRecorded.known.toLocaleString()} of {departureRecorded.completed.toLocaleString()} completed appointments ({Math.round((departureRecorded.known / departureRecorded.completed) * 100)}%). “{DEPARTURE_CATEGORIES.unknown.label}” is a gap in the record, not a voluntary exit.</>
                : <>No completed appointments in this view yet.</>}
            </p>
          </CardHeader>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interim-to-Permanent {noun} Conversion</CardTitle>
          <p className="text-sm text-muted-foreground">
            How often do interim {nounPluralLower} get appointed as the permanent {nounLower} at the same school?
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard label={`Total Interim ${nounPlural}`} value={String(interimConversion.total)} />
            <KPICard label="Converted to Permanent" value={String(interimConversion.convertedCount)} />
            <KPICard label="Not Converted" value={String(interimConversion.total - interimConversion.convertedCount)} />
            <KPICard label="Conversion Rate" value={`${interimConversion.rate}%`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-dashed">
              <CardHeader><CardTitle className="text-sm">Conversion Rate by Era</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={interimConversion.byEraData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="era" fontSize={10} />
                    <YAxis fontSize={11} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(value: number, name: string) => {
                        if (name === "Conversion Rate") return [`${value}%`, name];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="rate" fill={CHART_COLORS[6]} radius={[4, 4, 0, 0]} name="Conversion Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader><CardTitle className="text-sm">Conversion Rate by Tier</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={interimConversion.byTierData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="tier" fontSize={10} />
                    <YAxis fontSize={11} unit="%" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                      formatter={(value: number, name: string) => {
                        if (name === "Conversion Rate") return [`${value}%`, name];
                        return [value, name];
                      }}
                    />
                    <Bar dataKey="rate" fill={CHART_COLORS[2]} radius={[4, 4, 0, 0]} name="Conversion Rate" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-dashed">
              <CardHeader><CardTitle className="text-sm">Conversion by Gender</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={interimConversion.byGenderData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="gender" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="converted" stackId="a" fill={CHART_COLORS[2]} name="Converted" />
                    <Bar dataKey="notConverted" stackId="a" fill={CHART_COLORS[3]} radius={[4, 4, 0, 0]} name="Not Converted" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KPICard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4 text-center" title={hint}>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
