import { useMemo } from "react";
import rawData from "./deans.json";
import type { Dean } from "./types";

const allDeans: Dean[] = rawData as Dean[];

export function useAllDeans(): Dean[] {
  return allDeans;
}

export function useSchoolList() {
  return useMemo(() => {
    const schoolMap = new Map<string, { university: string; school: string; rank: number | null; tier: string }>();
    for (const d of allDeans) {
      if (!schoolMap.has(d.school)) {
        schoolMap.set(d.school, { university: d.university, school: d.school, rank: d.rank, tier: d.tier });
      }
    }
    return Array.from(schoolMap.values()).sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.school.localeCompare(b.school);
    });
  }, []);
}

export function useSchoolDeans(schoolName: string): Dean[] {
  return useMemo(() => {
    return allDeans
      .filter((d) => d.school === schoolName)
      .sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
  }, [schoolName]);
}

export function useFilteredDeans(options: { top50Only?: boolean; top100Only?: boolean } = {}) {
  return useMemo(() => {
    let filtered = allDeans;
    if (options.top50Only) filtered = filtered.filter((d) => d.inTop50);
    if (options.top100Only) filtered = filtered.filter((d) => d.inTop100);
    return filtered;
  }, [options.top50Only, options.top100Only]);
}

export function computeCrosstab(
  data: Dean[],
  rowField: keyof Dean,
  colField: keyof Dean
): { rows: string[]; cols: string[]; matrix: number[][]; totals: { row: number[]; col: number[]; grand: number } } {
  const rowValues = [...new Set(data.map((d) => String(d[rowField] ?? "Unknown")))].sort();
  const colValues = [...new Set(data.map((d) => String(d[colField] ?? "Unknown")))].sort();

  const matrix = rowValues.map(() => colValues.map(() => 0));
  for (const d of data) {
    const ri = rowValues.indexOf(String(d[rowField] ?? "Unknown"));
    const ci = colValues.indexOf(String(d[colField] ?? "Unknown"));
    if (ri >= 0 && ci >= 0) matrix[ri][ci]++;
  }

  const rowTotals = matrix.map((row) => row.reduce((s, v) => s + v, 0));
  const colTotals = colValues.map((_, ci) => matrix.reduce((s, row) => s + row[ci], 0));
  const grand = rowTotals.reduce((s, v) => s + v, 0);

  return { rows: rowValues, cols: colValues, matrix, totals: { row: rowTotals, col: colTotals, grand } };
}
