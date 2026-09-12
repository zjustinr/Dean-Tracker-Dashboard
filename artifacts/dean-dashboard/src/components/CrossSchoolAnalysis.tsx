import { useState, useMemo } from "react";
import { useAllDeans, computeCrosstab } from "@/data/useData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
  BarChart, Bar, Legend, PieChart, Pie,
} from "recharts";
import type { Dean, CategoricalField, NumericField } from "@/data/types";
import { completedTenure } from "@/data/tenure";
import { CATEGORICAL_LABELS, NUMERIC_LABELS, CHART_COLORS, NEXT_ROLE_LABELS, ORIGIN_LABELS } from "@/data/types";
import CompareSchools from "./CompareSchools";

const catFields = Object.entries(CATEGORICAL_LABELS) as [CategoricalField, string][];
const numFields = Object.entries(NUMERIC_LABELS) as [NumericField, string][];

function prettyLabel(field: string, val: string): string {
  if (field === "nextRole") return NEXT_ROLE_LABELS[val] || val;
  if (field === "origin") return ORIGIN_LABELS[val] || val;
  return val;
}

export default function CrossSchoolAnalysis() {
  const allDeans = useAllDeans();
  const data = allDeans;

  return (
    <div className="space-y-6">
      <Tabs defaultValue="crosstab">
        <TabsList>
          <TabsTrigger value="crosstab">Pivot Table</TabsTrigger>
          <TabsTrigger value="grouped">Grouped Bar Chart</TabsTrigger>
          <TabsTrigger value="scatter">Scatter Plot</TabsTrigger>
          <TabsTrigger value="compare">Compare Schools</TabsTrigger>
        </TabsList>
        <TabsContent value="crosstab"><CrosstabView data={data} /></TabsContent>
        <TabsContent value="grouped"><GroupedBarView data={data} /></TabsContent>
        <TabsContent value="scatter"><ScatterView data={data} /></TabsContent>
        <TabsContent value="compare"><CompareSchools /></TabsContent>
      </Tabs>
    </div>
  );
}

// Tenure is never read off the record directly: a sitting leader has no completed
// tenure, and several indices still store one on people who never left (see
// src/data/tenure.ts).
const numValue = (d: Dean, f: NumericField): number | null =>
  f === "tenureLength" ? completedTenure(d) : (d[f] as number | null);

function ScatterView({ data }: { data: Dean[] }) {
  const [xField, setXField] = useState<NumericField>("rank");
  const [yField, setYField] = useState<NumericField>("tenureLength");
  const [colorField, setColorField] = useState<CategoricalField>("gender");

  const scatterData = useMemo(() => {
    return data
      .filter((d) => numValue(d, xField) != null && numValue(d, yField) != null)
      .map((d) => ({
        x: numValue(d, xField) as number,
        y: numValue(d, yField) as number,
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
  const [filterField, setFilterField] = useState<CategoricalField | "__none__">("__none__");
  const [filterValue, setFilterValue] = useState<string>("__all__");

  const filterOptions = useMemo(() => {
    if (filterField === "__none__") return [];
    return [...new Set(data.map(d => String(d[filterField] ?? "Unknown")))].sort();
  }, [data, filterField]);

  const filteredData = useMemo(() => {
    if (filterField === "__none__" || filterValue === "__all__") return data;
    return data.filter(d => String(d[filterField] ?? "Unknown") === filterValue);
  }, [data, filterField, filterValue]);

  const cross = useMemo(() => computeCrosstab(filteredData, rowField, colField), [filteredData, rowField, colField]);

  const stackedBarData = useMemo(() => {
    return cross.rows.map((row, ri) => {
      const entry: Record<string, string | number> = { name: prettyLabel(rowField, row) };
      cross.cols.forEach((col, ci) => {
        entry[prettyLabel(colField, col)] = cross.matrix[ri][ci];
      });
      return entry;
    });
  }, [cross, rowField, colField]);

  const colPieData = useMemo(() => {
    return cross.cols.map((col, ci) => ({
      name: prettyLabel(colField, col),
      value: cross.totals.col[ci],
    })).filter(d => d.value > 0);
  }, [cross, colField]);

  const rowPieData = useMemo(() => {
    return cross.rows.map((row, ri) => ({
      name: prettyLabel(rowField, row),
      value: cross.totals.row[ri],
    })).filter(d => d.value > 0);
  }, [cross, rowField]);

  const prettyColLabels = useMemo(() => cross.cols.map(c => prettyLabel(colField, c)), [cross.cols, colField]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Pivot Table</CardTitle>
          <p className="text-sm text-muted-foreground">Choose row and column variables, then optionally filter by a third dimension</p>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 border border-border rounded-lg p-4 mb-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pivot Configuration</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FieldSelect label="Rows" value={rowField} onChange={(v) => setRowField(v as CategoricalField)} options={catFields} />
              <FieldSelect label="Columns" value={colField} onChange={(v) => setColField(v as CategoricalField)} options={catFields} />
              <FieldSelect
                label="Filter By"
                value={filterField}
                onChange={(v) => { setFilterField(v as CategoricalField | "__none__"); setFilterValue("__all__"); }}
                options={[["__none__", "(No Filter)"] as [string, string], ...catFields]}
              />
              {filterField !== "__none__" && (
                <FieldSelect
                  label={`Filter: ${CATEGORICAL_LABELS[filterField]}`}
                  value={filterValue}
                  onChange={setFilterValue}
                  options={[["__all__", "All"] as [string, string], ...filterOptions.map(v => [v, prettyLabel(filterField, v)] as [string, string])]}
                />
              )}
            </div>
            {filterField !== "__none__" && filterValue !== "__all__" && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded font-medium">
                  Filtered: {CATEGORICAL_LABELS[filterField]} = {prettyLabel(filterField, filterValue)}
                </span>
                <span className="text-xs text-muted-foreground">({filteredData.length} of {data.length} records)</span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-muted/30">
                  <th className="text-left p-2 font-semibold text-muted-foreground">{CATEGORICAL_LABELS[rowField]} \ {CATEGORICAL_LABELS[colField]}</th>
                  {cross.cols.map((c) => (
                    <th key={c} className="text-center p-2 font-semibold text-muted-foreground text-xs">{prettyLabel(colField, c)}</th>
                  ))}
                  <th className="text-center p-2 font-bold text-xs bg-muted/50">Total</th>
                </tr>
              </thead>
              <tbody>
                {cross.rows.map((row, ri) => (
                  <tr key={row} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="p-2 font-medium text-sm">{prettyLabel(rowField, row)}</td>
                    {cross.matrix[ri].map((val, ci) => {
                      const pct = cross.totals.row[ri] > 0 ? Math.round((val / cross.totals.row[ri]) * 100) : 0;
                      const maxInRow = Math.max(...cross.matrix[ri]);
                      const intensity = maxInRow > 0 ? val / maxInRow : 0;
                      return (
                        <td key={ci} className="text-center p-2 relative">
                          <div
                            className="absolute inset-0 bg-primary/10 transition-opacity"
                            style={{ opacity: intensity * 0.6 }}
                          />
                          <span className="relative text-sm font-medium">{val}</span>
                          {cross.totals.row[ri] > 0 && (
                            <span className="relative text-xs text-muted-foreground ml-1">
                              ({pct}%)
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center p-2 font-semibold bg-muted/30">{cross.totals.row[ri]}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border font-semibold bg-muted/30">
                  <td className="p-2">Total</td>
                  {cross.totals.col.map((v, ci) => (
                    <td key={ci} className="text-center p-2">{v}</td>
                  ))}
                  <td className="text-center p-2 font-bold bg-muted/50">{cross.totals.grand}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Stacked Bar: {CATEGORICAL_LABELS[rowField]} by {CATEGORICAL_LABELS[colField]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(250, cross.rows.length * 40 + 80)}>
              <BarChart data={stackedBarData} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={120} fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {prettyColLabels.map((col, i) => (
                  <Bar key={col} dataKey={col} stackId="a" fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Grouped Bar: {CATEGORICAL_LABELS[rowField]} by {CATEGORICAL_LABELS[colField]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(250, cross.rows.length * 40 + 80)}>
              <BarChart data={stackedBarData} margin={{ top: 5, right: 20, bottom: 40, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={10} angle={-20} textAnchor="end" interval={0} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {prettyColLabels.map((col, i) => (
                  <Bar key={col} dataKey={col} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[2, 2, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribution: {CATEGORICAL_LABELS[rowField]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={rowPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {rowPieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Distribution: {CATEGORICAL_LABELS[colField]}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={colPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {colPieData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
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
