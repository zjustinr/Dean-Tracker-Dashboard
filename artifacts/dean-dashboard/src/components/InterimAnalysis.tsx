import { useMemo } from "react";
import type { Dean } from "@/data/types";
import { useAllDeans } from "@/data/useData";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid,
  PieChart, Pie, Legend,
} from "recharts";

const COLORS = {
  coral: "#E8634D",
  navy: "#1B2A4B",
  teal: "#2AA198",
  purple: "#7B68EE",
  orange: "#F5A623",
  green: "#27AE60",
  blue: "#3B82F6",
  red: "#DC2626",
  pink: "#EC4899",
  gray: "#6B7280",
};

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function pct(num: number, den: number): string {
  if (!den) return "0%";
  return (num / den * 100).toFixed(1) + "%";
}

export default function InterimAnalysis() {
  const allDeans = useAllDeans();

  const analysis = useMemo(() => {
    const interims = allDeans.filter(d => d.isInterim);
    const nonInterims = allDeans.filter(d => !d.isInterim);

    const converted: Dean[] = [];
    const convertedInterimIds = new Set<number>();
    for (const d of interims) {
      const perm = allDeans.find(p => !p.isInterim && p.dean === d.dean && p.university === d.university && p.school === d.school);
      if (perm) {
        converted.push(perm);
        convertedInterimIds.add(d.id);
      }
    }
    const convertedIds = new Set(converted.map(c => c.id));

    const externals = nonInterims.filter(d => d.isExternal && !convertedIds.has(d.id));
    const internals = nonInterims.filter(d => d.isInternal && !convertedIds.has(d.id));
    const nonConvInterims = interims.filter(d => !convertedInterimIds.has(d.id));

    const byEra: Record<string, { total: number; interim: number }> = {};
    const eraOrder = ["pre-2000", "1990s", "2000s", "2010s", "2020s"];
    for (const d of allDeans) {
      const era = d.era || "Unknown";
      if (!byEra[era]) byEra[era] = { total: 0, interim: 0 };
      byEra[era].total++;
      if (d.isInterim) byEra[era].interim++;
    }
    const eraData = eraOrder.filter(e => byEra[e]).map(e => ({
      era: e, pct: byEra[e].interim / byEra[e].total * 100, count: byEra[e].interim, total: byEra[e].total,
    }));

    function surpriseRate(records: Dean[]): number {
      const valid = records.filter(d => d.endYear);
      if (!valid.length) return 0;
      return valid.filter(d => d.surpriseDeparture).length / valid.length * 100;
    }

    function avgTenure(records: Dean[]): number {
      const valid = records.filter(d => d.tenureLength && d.tenureLength > 0);
      if (!valid.length) return 0;
      return valid.reduce((a, b) => a + (b.tenureLength || 0), 0) / valid.length;
    }

    function bizEnrollGrowth(records: Dean[]): number | null {
      const valid = records.filter(d => d.estBizEnrollmentStart && d.estBizEnrollmentEnd && d.tenureLength && d.tenureLength > 0 && d.estBizEnrollmentStart > 0);
      if (!valid.length) return null;
      const growths = valid.map(d => ((d.estBizEnrollmentEnd! - d.estBizEnrollmentStart!) / d.estBizEnrollmentStart! * 100) / d.tenureLength!);
      return growths.reduce((a, b) => a + b, 0) / growths.length;
    }

    function totalEnrollGrowth(records: Dean[]): number | null {
      const valid = records.filter(d => d.enrollmentStart && d.enrollmentEnd && d.tenureLength && d.tenureLength > 0 && d.enrollmentStart > 0);
      if (!valid.length) return null;
      const growths = valid.map(d => ((d.enrollmentEnd! - d.enrollmentStart!) / d.enrollmentStart! * 100) / d.tenureLength!);
      return growths.reduce((a, b) => a + b, 0) / growths.length;
    }

    const surpriseData = [
      { label: "Converted Interim", rate: surpriseRate(converted), color: COLORS.teal },
      { label: "Non-conv. Interim", rate: surpriseRate(nonConvInterims), color: COLORS.gray },
      { label: "External Hire", rate: surpriseRate(externals), color: COLORS.orange },
      { label: "Internal Hire", rate: surpriseRate(internals), color: COLORS.coral },
    ];

    const enrollData = [
      {
        label: "Converted Interim",
        total: totalEnrollGrowth(converted),
        biz: bizEnrollGrowth(converted),
        color: COLORS.teal,
      },
      {
        label: "External Hire",
        total: totalEnrollGrowth(externals),
        biz: bizEnrollGrowth(externals),
        color: COLORS.orange,
      },
      {
        label: "Internal Hire",
        total: totalEnrollGrowth(internals),
        biz: bizEnrollGrowth(internals),
        color: COLORS.coral,
      },
      {
        label: "Non-conv. Interim",
        total: totalEnrollGrowth(nonConvInterims),
        biz: bizEnrollGrowth(nonConvInterims),
        color: COLORS.gray,
      },
    ];

    const deptChairInterims = interims.filter(d => d.hadDeptChairRole);
    const deptChairConverted = deptChairInterims.filter(d => convertedInterimIds.has(d.id) || converted.some(c => c.dean === d.dean && c.university === d.university));

    const discInterim: Record<string, number> = {};
    interims.forEach(d => {
      const disc = d.disciplineBroad || "Unknown";
      discInterim[disc] = (discInterim[disc] || 0) + 1;
    });
    const discConv: Record<string, number> = {};
    converted.forEach(d => {
      const disc = d.disciplineBroad || "Unknown";
      discConv[disc] = (discConv[disc] || 0) + 1;
    });

    const successStories = converted
      .filter(d => d.tenureLength && d.tenureLength >= 4)
      .sort((a, b) => (b.tenureLength || 0) - (a.tenureLength || 0))
      .slice(0, 8);

    const conversionByDiscipline = Object.entries(discInterim)
      .filter(([k]) => k !== "Unknown")
      .map(([disc, count]) => ({
        discipline: disc,
        interim: count,
        converted: discConv[disc] || 0,
        rate: ((discConv[disc] || 0) / count * 100),
      }))
      .sort((a, b) => b.rate - a.rate);

    const genderInterim = {
      male: interims.filter(d => d.gender === "M").length,
      female: interims.filter(d => d.gender === "F").length,
    };
    const genderConverted = {
      male: converted.filter(d => d.gender === "M").length,
      female: converted.filter(d => d.gender === "F").length,
    };

    return {
      total: allDeans.length,
      schools: new Set(allDeans.map(d => d.university + "|||" + d.school)).size,
      interimCount: interims.length,
      interimPct: interims.length / allDeans.length * 100,
      convertedCount: converted.length,
      conversionRate: converted.length / interims.length * 100,
      era2020InterimPct: byEra["2020s"] ? byEra["2020s"].interim / byEra["2020s"].total * 100 : 0,
      surpriseConverted: surpriseRate(converted),
      eraData,
      surpriseData,
      enrollData,
      deptChairConvRate: deptChairInterims.length ? deptChairConverted.length / deptChairInterims.length * 100 : 0,
      avgTenureConverted: avgTenure(converted),
      avgTenureExternal: avgTenure(externals),
      avgTenureInternal: avgTenure(internals),
      successStories,
      conversionByDiscipline,
      genderInterim,
      genderConverted,
    };
  }, [allDeans]);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-b from-[#1B2A4B] to-[#2C3E6B] rounded-2xl text-white p-8 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight">Try Before You Buy</h2>
        <p className="text-blue-200 mt-1 text-sm italic">The Rise of Interim Leadership in U.S. Business Schools</p>
        <div className="mt-4 inline-block bg-white/10 rounded-lg px-6 py-2 text-sm font-semibold">
          {analysis.total} Dean Appointments &nbsp;|&nbsp; {analysis.schools} Top-100 Schools &nbsp;|&nbsp; 1967–2026
        </div>

        <div className="grid grid-cols-3 gap-6 mt-8 max-w-2xl mx-auto">
          <KpiCircle value={fmt(analysis.era2020InterimPct) + "%"} label="of 2020s appointments are interim" color="#E8634D" />
          <KpiCircle value={fmt(analysis.conversionRate) + "%"} label="of interim deans convert to permanent" color="#2AA198" />
          <KpiCircle value={fmt(analysis.surpriseConverted) + "%"} label="surprise departures among converted interims" color="#27AE60" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Interim Appointments Are Rising" color={COLORS.coral} subtitle="Share of interim appointments by era">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.eraData} layout="vertical" margin={{ left: 60, right: 60, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" domain={[0, 50]} tickFormatter={v => v + "%"} fontSize={11} />
                <YAxis type="category" dataKey="era" fontSize={12} width={55} />
                <Tooltip formatter={(v: number) => fmt(v) + "%"} labelFormatter={l => `Era: ${l}`} />
                <Bar dataKey="pct" radius={[0, 6, 6, 0]} barSize={22}>
                  {analysis.eraData.map((entry, i) => (
                    <Cell key={i} fill={i === analysis.eraData.length - 1 ? COLORS.coral : "#E8634D88"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Conversion by Discipline" color={COLORS.purple} subtitle="Interim → permanent conversion rate by academic field">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.conversionByDiscipline} layout="vertical" margin={{ left: 120, right: 60, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" domain={[0, 60]} tickFormatter={v => v + "%"} fontSize={11} />
                <YAxis type="category" dataKey="discipline" fontSize={11} width={115} />
                <Tooltip formatter={(v: number) => fmt(v) + "%"} />
                <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={18}>
                  {analysis.conversionByDiscipline.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? COLORS.purple : "#7B68EE88"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Screening Effectiveness: Surprise Departure Rates" color={COLORS.teal} subtitle="Lower surprise departure rates indicate better person-school fit">
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analysis.surpriseData} layout="vertical" margin={{ left: 120, right: 80, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" domain={[0, 30]} tickFormatter={v => v + "%"} fontSize={11} />
              <YAxis type="category" dataKey="label" fontSize={12} width={115} />
              <Tooltip formatter={(v: number) => fmt(v) + "%"} />
              <Bar dataKey="rate" radius={[0, 6, 6, 0]} barSize={22}>
                {analysis.surpriseData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <SectionCard title="Performance: Business Enrollment Growth" color={COLORS.green} subtitle="Avg. annual percentage-point growth in estimated business enrollment per year of tenure">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={analysis.enrollData.map(d => ({
                label: d.label,
                total: d.total ?? 0,
                biz: d.biz ?? 0,
              }))}
              layout="vertical"
              margin={{ left: 120, right: 80, top: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tickFormatter={v => "+" + v.toFixed(1) + "pp/yr"} fontSize={11} />
              <YAxis type="category" dataKey="label" fontSize={12} width={115} />
              <Tooltip formatter={(v: number) => "+" + v.toFixed(2) + "pp/yr"} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="total" name="Total Enrollment" fill={COLORS.orange} radius={[0, 4, 4, 0]} barSize={14} />
              <Bar dataKey="biz" name="Business Enrollment" fill={COLORS.green} radius={[0, 4, 4, 0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Gender in Interim Appointments" color={COLORS.pink} subtitle="How gender differs between interim and converted deans">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-center mb-1">All Interims</p>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Male", value: analysis.genderInterim.male },
                        { name: "Female", value: analysis.genderInterim.female },
                      ]}
                      cx="50%" cy="50%" outerRadius={55} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      <Cell fill={COLORS.blue} />
                      <Cell fill={COLORS.pink} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-center mb-1">Converted to Permanent</p>
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Male", value: analysis.genderConverted.male },
                        { name: "Female", value: analysis.genderConverted.female },
                      ]}
                      cx="50%" cy="50%" outerRadius={55} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                      fontSize={10}
                    >
                      <Cell fill={COLORS.blue} />
                      <Cell fill={COLORS.pink} />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Tenure Comparison" color={COLORS.navy} subtitle="Average tenure length by appointment type (years)">
          <div className="space-y-4 py-4">
            <TenureBar label="Converted Interim" value={analysis.avgTenureConverted} max={12} color={COLORS.teal} />
            <TenureBar label="External Hire" value={analysis.avgTenureExternal} max={12} color={COLORS.orange} />
            <TenureBar label="Internal Hire" value={analysis.avgTenureInternal} max={12} color={COLORS.coral} />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Success Stories: Interim to Permanent" color={COLORS.teal} subtitle="Longest-serving deans who started as interim appointments">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {analysis.successStories.map((d, i) => (
            <div key={d.id} className="flex gap-3 items-start p-3 rounded-lg bg-accent/40 border border-border">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: i < 3 ? COLORS.teal : COLORS.gray }}>
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{d.dean}</p>
                <p className="text-xs text-muted-foreground">{d.school}</p>
                <p className="text-xs text-muted-foreground">{d.university}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-bold text-primary">{d.startYear}–{d.endYear || "Present"}</span>
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">{d.tenureLength} years</span>
                  {d.isFemale && <span className="text-[10px] bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200 px-1.5 py-0.5 rounded">Female</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="bg-gradient-to-r from-[#1B2A4B] to-[#2C3E6B] rounded-2xl text-white p-6 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-lg font-bold">Key Insight: Interim appointments function as a real-options mechanism</p>
          <p className="text-blue-200 text-sm mt-2 italic">
            Schools "try before they buy," reducing selection risk while preserving flexibility.
            Converted interims show the strongest business enrollment growth and zero involuntary departures,
            suggesting the trial period effectively identifies strong leaders.
          </p>
        </div>
      </div>
    </div>
  );
}

function KpiCircle({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-24 h-24 rounded-full flex items-center justify-center border-4" style={{ borderColor: color, background: color + "22" }}>
        <span className="text-2xl font-extrabold" style={{ color }}>{value}</span>
      </div>
      <p className="text-xs text-blue-200 mt-2 max-w-[140px] leading-tight">{label}</p>
    </div>
  );
}

function SectionCard({ title, subtitle, color, children }: { title: string; subtitle?: string; color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-3" style={{ borderBottom: `3px solid ${color}` }}>
        <h3 className="text-base font-bold" style={{ color }}>{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function TenureBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium w-[120px] text-right shrink-0">{label}</span>
      <div className="flex-1 bg-muted rounded-full h-5 relative overflow-hidden">
        <div className="h-full rounded-full flex items-center justify-end pr-2" style={{ width: `${(value / max) * 100}%`, background: color }}>
          <span className="text-[10px] font-bold text-white">{value.toFixed(1)} yrs</span>
        </div>
      </div>
    </div>
  );
}
