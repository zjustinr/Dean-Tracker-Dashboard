import { useState, useMemo } from "react";
import { useAllDeans, computeCrosstab } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  BarChart, Bar, Legend,
} from "recharts";
import type { Dean, CategoricalField, NumericField } from "@/data/types";
import { CATEGORICAL_LABELS, NUMERIC_LABELS, CHART_COLORS, NEXT_ROLE_LABELS, ORIGIN_LABELS } from "@/data/types";

const catFields = Object.entries(CATEGORICAL_LABELS) as [CategoricalField, string][];
const numFields = Object.entries(NUMERIC_LABELS) as [NumericField, string][];

function prettyLabel(field: string, val: string): string {
  if (field === "nextRole") return NEXT_ROLE_LABELS[val] || val;
  if (field === "origin") return ORIGIN_LABELS[val] || val;
  return val;
}

export default function CrossSchoolAnalysis() {
  const allDeans = useAllDeans();
  const [top50Only, setTop50Only] = useState(false);
  const data = useMemo(() => (top50Only ? allDeans.filter((d) => d.inTop50) : allDeans), [allDeans, top50Only]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Switch id="top50" checked={top50Only} onCheckedChange={setTop50Only} />
        <Label htmlFor="top50" className="text-sm">Top 50 schools only</Label>
      </div>
      <Tabs defaultValue="crosstab">
        <TabsList>
          <TabsTrigger value="crosstab">Cross-Tabulation</TabsTrigger>
          <TabsTrigger value="grouped">Grouped Bar Chart</TabsTrigger>
          <TabsTrigger value="scatter">Scatter Plot</TabsTrigger>
        </TabsList>
        <TabsContent value="crosstab"><CrosstabView data={data} /></TabsContent>
        <TabsContent value="grouped"><GroupedBarView data={data} /></TabsContent>
        <TabsContent value="scatter"><ScatterView data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ScatterView({ data }: { data: Dean[] }) {
  const [xField, setXField] = useState<NumericField>("rank");
  const [yField, setYField] = useState<NumericField>("tenureLength");
  const [colorField, setColorField] = useState<CategoricalField>("gender");

  const scatterData = useMemo(() => {
    return data
      .filter((d) => d[xField] != null && d[yField] != null)
      .map((d) => ({
        x: d[xField] as number,
        y: d[yField] as number,
        color: String(d[colorField] ?? "Unknown"),
        name: d.dean,
        school: d.school,
      }));
  }, [data, xField, yField, colorField]);

  const colorCategories = useMemo(() => [...new Set(scatterData.map((d) => d.color))].sort(), [scatterData]);
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    colorCategories.forEach((c, i) => { map[c] = CHART_COLORS[i % CHART_COLORS.length]; });
    return map;
  }, [colorCategories]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Scatter Plot Explorer</CardTitle>
        <p className="text-sm text-muted-foreground">Choose numeric variables for axes and a categorical variable for color</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <FieldSelect label="X Axis" value={xField} onChange={(v) => setXField(v as NumericField)} options={numFields} />
          <FieldSelect label="Y Axis" value={yField} onChange={(v) => setYField(v as NumericField)} options={numFields} />
          <FieldSelect label="Color By" value={colorField} onChange={(v) => setColorField(v as CategoricalField)} options={catFields} />
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              type="number"
              dataKey="x"
              name={NUMERIC_LABELS[xField]}
              fontSize={12}
              label={{ value: NUMERIC_LABELS[xField], position: "bottom", offset: 10, fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={NUMERIC_LABELS[yField]}
              fontSize={12}
              label={{ value: NUMERIC_LABELS[yField], angle: -90, position: "insideLeft", offset: 10, fontSize: 12 }}
            />
            <ZAxis range={[40, 40]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-card border border-border rounded-lg p-3 text-sm max-w-xs">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-muted-foreground">{d.school}</p>
                    <p>{NUMERIC_LABELS[xField]}: {d.x}</p>
                    <p>{NUMERIC_LABELS[yField]}: {d.y}</p>
                    <p>{CATEGORICAL_LABELS[colorField]}: {prettyLabel(colorField, d.color)}</p>
                  </div>
                );
              }}
            />
            <Scatter data={scatterData}>
              {scatterData.map((entry, i) => (
                <Cell key={i} fill={colorMap[entry.color]} opacity={0.7} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="flex gap-3 flex-wrap mt-3 justify-center">
          {colorCategories.map((cat) => (
            <span key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block w-3 h-3 rounded-full" style={{ background: colorMap[cat] }} />
              {prettyLabel(colorField, cat)}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CrosstabView({ data }: { data: Dean[] }) {
  const [rowField, setRowField] = useState<CategoricalField>("gender");
  const [colField, setColField] = useState<CategoricalField>("origin");

  const cross = useMemo(() => computeCrosstab(data, rowField, colField), [data, rowField, colField]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Cross-Tabulation</CardTitle>
        <p className="text-sm text-muted-foreground">Compare two categorical variables across all deans</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <FieldSelect label="Row Variable" value={rowField} onChange={(v) => setRowField(v as CategoricalField)} options={catFields} />
          <FieldSelect label="Column Variable" value={colField} onChange={(v) => setColField(v as CategoricalField)} options={catFields} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-2 font-medium text-muted-foreground">{CATEGORICAL_LABELS[rowField]} \ {CATEGORICAL_LABELS[colField]}</th>
                {cross.cols.map((c) => (
                  <th key={c} className="text-center p-2 font-medium text-muted-foreground text-xs">{prettyLabel(colField, c)}</th>
                ))}
                <th className="text-center p-2 font-semibold text-xs">Total</th>
              </tr>
            </thead>
            <tbody>
              {cross.rows.map((row, ri) => (
                <tr key={row} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="p-2 font-medium text-sm">{prettyLabel(rowField, row)}</td>
                  {cross.matrix[ri].map((val, ci) => (
                    <td key={ci} className="text-center p-2">
                      <span className="text-sm">{val}</span>
                      {cross.totals.row[ri] > 0 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((val / cross.totals.row[ri]) * 100)}%)
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="text-center p-2 font-semibold">{cross.totals.row[ri]}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-border font-semibold">
                <td className="p-2">Total</td>
                {cross.totals.col.map((v, ci) => (
                  <td key={ci} className="text-center p-2">{v}</td>
                ))}
                <td className="text-center p-2">{cross.totals.grand}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupedBarView({ data }: { data: Dean[] }) {
  const [groupField, setGroupField] = useState<CategoricalField>("tier");
  const [metricField, setMetricField] = useState<CategoricalField>("gender");

  const chartData = useMemo(() => {
    const groups = [...new Set(data.map((d) => String(d[groupField] ?? "Unknown")))].sort();
    const categories = [...new Set(data.map((d) => String(d[metricField] ?? "Unknown")))].sort();

    return groups.map((g) => {
      const groupDeans = data.filter((d) => String(d[groupField] ?? "Unknown") === g);
      const row: Record<string, number | string> = { group: prettyLabel(groupField, g) };
      for (const cat of categories) {
        row[cat] = groupDeans.filter((d) => String(d[metricField] ?? "Unknown") === cat).length;
      }
      return row;
    });
  }, [data, groupField, metricField]);

  const categories = useMemo(() => [...new Set(data.map((d) => String(d[metricField] ?? "Unknown")))].sort(), [data, metricField]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Grouped Bar Chart</CardTitle>
        <p className="text-sm text-muted-foreground">Compare distributions across groups</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <FieldSelect label="Group By" value={groupField} onChange={(v) => setGroupField(v as CategoricalField)} options={catFields} />
          <FieldSelect label="Break Down By" value={metricField} onChange={(v) => setMetricField(v as CategoricalField)} options={catFields} />
        </div>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={chartData} margin={{ top: 10, right: 30, bottom: 40, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="group" fontSize={11} angle={-20} textAnchor="end" interval={0} />
            <YAxis fontSize={12} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend
              formatter={(value) => prettyLabel(metricField, value)}
              wrapperStyle={{ fontSize: 12 }}
            />
            {categories.map((cat, i) => (
              <Bar key={cat} dataKey={cat} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} name={cat} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function FieldSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, lbl]) => (
            <SelectItem key={key} value={key}>{lbl}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
