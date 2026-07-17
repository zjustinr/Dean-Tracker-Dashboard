import { useMemo } from "react";
import type { Dean } from "./types";
import { useDataset } from "./DatasetContext";

export function makeSchoolKey(university: string, school: string): string {
  return `${university}|||${school}`;
}

export function parseSchoolKey(key: string): { university: string; school: string } {
  const [university, school] = key.split("|||");
  return { university, school };
}

export function useAllDeans(): Dean[] {
  return useDataset().bundle.deans;
}

export function useSchoolList() {
  const allDeans = useAllDeans();
  return useMemo(() => {
    const schoolMap = new Map<string, { university: string; school: string; key: string; rank: number | null; tier: string }>();
    for (const d of allDeans) {
      const key = makeSchoolKey(d.university, d.school);
      if (!schoolMap.has(key)) {
        schoolMap.set(key, { university: d.university, school: d.school, key, rank: d.rank, tier: d.tier });
      }
    }
    return Array.from(schoolMap.values()).sort((a, b) => {
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return a.school.localeCompare(b.school);
    });
  }, [allDeans]);
}

export function useSchoolDeans(schoolKey: string): Dean[] {
  const allDeans = useAllDeans();
  return useMemo(() => {
    const { university, school } = parseSchoolKey(schoolKey);
    return allDeans
      .filter((d) => d.university === university && d.school === school)
      .sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
  }, [schoolKey, allDeans]);
}

export function useDeanCareer(deanName: string | null): Dean[] {
  const allDeans = useAllDeans();
  return useMemo(() => {
    if (!deanName) return [];
    return allDeans
      .filter((d) => d.dean === deanName)
      .sort((a, b) => (a.startYear || 0) - (b.startYear || 0));
  }, [deanName, allDeans]);
}

export function useFilteredDeans(options: { top50Only?: boolean; top100Only?: boolean } = {}) {
  const allDeans = useAllDeans();
  return useMemo(() => {
    let filtered = allDeans;
    if (options.top50Only) filtered = filtered.filter((d) => d.inTop50);
    if (options.top100Only) filtered = filtered.filter((d) => d.inTop100);
    return filtered;
  }, [options.top50Only, options.top100Only, allDeans]);
}

export function useBSQ() {
  return useDataset().bundle.bsq;
}

export function useSchoolsInfo() {
  return useDataset().bundle.schools;
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

/**
 * geoAlbersUsa — the projection every map in this app uses — is defined ONLY for
 * the 50 states + DC. For anything outside it (US territories, foreign campuses)
 * the projection returns `null`, and react-simple-maps then does
 * `const [x, y] = projection(coordinates)` on that null, which throws
 * "Invalid attempt to destructure non-iterable instance" and white-screens the
 * whole page.
 *
 * This bit first with the Ag & Forestry dataset, which is the only one that
 * reaches the territorial land-grants (Puerto Rico Mayagüez, Guam, the Virgin
 * Islands). LiveJobMarket carries Toronto and Oxford listings that are safe today
 * only because their coordinates happen to be null.
 *
 * Any map plotting markers must filter with this.
 */
export const ALBERS_USA_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
]);

export function isAlbersUsaMappable(
  s: { state?: string | null; lat?: number | null; lng?: number | null }
): boolean {
  if (s.lat == null || s.lng == null) return false;
  return ALBERS_USA_STATES.has(String(s.state ?? "").trim().toUpperCase());
}
