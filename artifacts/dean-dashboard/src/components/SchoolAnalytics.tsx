import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import type { Dean } from "@/data/types";
import { CHART_COLORS, NEXT_ROLE_LABELS } from "@/data/types";
import { SCHOOL_INFO, findSchoolInfo } from "@/data/schools";

export default function SchoolAnalytics({ deans }: { deans: Dean[] }) {
  const schoolInfo = useMemo(() => {
    if (!deans.length) return null;
    return findSchoolInfo(deans[0].school) || findSchoolInfo(deans[0].university);
  }, [deans]);

  const genderData = useMemo(() => {
    const m = deans.filter((d) => d.gender === "M").length;
    const f = deans.filter((d) => d.isFemale).length;
    const u = deans.length - m - f;
    const result = [
      { name: "Male", value: m },
      { name: "Female", value: f },
    ];
    if (u > 0) result.push({ name: "Unknown", value: u });
    return result;
  }, [deans]);

  const originData = useMemo(() => {
    const internal = deans.filter((d) => d.isInternal && !d.isInterim).length;
    const external = deans.filter((d) => d.isExternal && !d.isInterim).length;
    const interim = deans.filter((d) => d.isInterim).length;
    const other = deans.length - internal - external - interim;
    const result = [
      { name: "Internal", value: internal },
      { name: "External", value: external },
      { name: "Interim", value: interim },
    ];
    if (other > 0) result.push({ name: "Other", value: other });
    return result.filter((d) => d.value > 0);
  }, [deans]);

  const disciplineData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deans) {
      const disc = d.disciplineBroad || d.discipline || "Unknown";
      counts[disc] = (counts[disc] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [deans]);

  const nextRoleData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deans) {
      if (!d.nextRole) continue;
      const label = NEXT_ROLE_LABELS[d.nextRole] || d.nextRole;
      counts[label] = (counts[label] || 0) + 1;
    }
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }));
  }, [deans]);

  const tenureData = useMemo(() => {
    return deans
      .filter((d) => d.tenureLength)
      .map((d) => ({
        name: d.dean,
        tenure: d.tenureLength!,
        era: d.era,
      }))
      .sort((a, b) => a.tenure - b.tenure);
  }, [deans]);

  const kpis = useMemo(() => {
    const tenures = deans.filter((d) => d.tenureLength).map((d) => d.tenureLength!);
    const avgTenure = tenures.length ? Math.round((tenures.reduce((s, v) => s + v, 0) / tenures.length) * 10) / 10 : 0;
    const femalePct = deans.length ? Math.round((deans.filter((d) => d.isFemale).length / deans.length) * 100) : 0;
    const internalPct = deans.length ? Math.round((deans.filter((d) => d.isInternal).length / deans.length) * 100) : 0;
    const interimPct = deans.length ? Math.round((deans.filter((d) => d.isInterim).length / deans.length) * 100) : 0;
    return { total: deans.length, avgTenure, femalePct, internalPct, interimPct };
  }, [deans]);

  const originColors: Record<string, string> = {
    Internal: CHART_COLORS[0],
    External: CHART_COLORS[2],
    Interim: CHART_COLORS[5],
    Other: CHART_COLORS[7],
  };

  return (
    <div className="space-y-4">
      {schoolInfo && (
        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{schoolInfo.type}</Badge>
          <Badge variant="outline">{schoolInfo.totalFaculty} T-T Faculty</Badge>
          <Badge variant="outline">{schoolInfo.city}, {schoolInfo.state}</Badge>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniKPI label="Total Deans" value={String(kpis.total)} />
        <MiniKPI label="Avg Tenure" value={`${kpis.avgTenure} yrs`} />
        <MiniKPI label="Female" value={`${kpis.femalePct}%`} />
        <MiniKPI label="Internal" value={`${kpis.internalPct}%`} />
        <MiniKPI label="Interim" value={`${kpis.interimPct}%`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Gender Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                  {genderData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? CHART_COLORS[0] : i === 1 ? CHART_COLORS[4] : CHART_COLORS[7]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Origin: Internal / External / Interim</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={originData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                  {originData.map((entry, i) => (
                    <Cell key={i} fill={originColors[entry.name] || CHART_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Disciplines</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={disciplineData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} innerRadius={35}>
                  {disciplineData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tenure by Dean</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tenureData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" interval={0} height={50} />
                <YAxis fontSize={10} label={{ value: "Years", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="tenure" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} name="Tenure (years)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Post-Dean Roles</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={nextRoleData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={10} />
                <YAxis type="category" dataKey="name" width={100} fontSize={10} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 3, 3, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

      </div>

    </div>
  );
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-2 px-3 text-center">
        <p className="text-lg font-bold">{value}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
