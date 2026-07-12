import type { Dean } from "./types";
import top100Deans from "./deans.json";
import top100BSQ from "./schools-bsq.json";
import { SCHOOL_INFO as TOP100_SCHOOLS, SCHOOL_DEAN_MAP } from "./schools";

import r1bsDeans from "./r1-bschool-deans.json";
import r1bsBSQ from "./r1-bschool-bsq.json";
import r1bsSchools from "./r1-bschool-schools.json";

import r1esDeans from "./r1-eschool-deans.json";
import r1esResearch from "./r1-eschool-research.json";
import r1esSchools from "./r1-eschool-schools.json";

export type DatasetId = "top100" | "r1bschool" | "r1eschool";

export interface SchoolInfo {
  university: string;
  school: string;
  rank: number | null;
  fullName: string;
  shortName: string;
  type: string;
  totalFaculty: number;
  lat: number | null;
  lng: number | null;
  city: string;
  state: string;
}

export interface BSQSchool {
  university: string;
  school: string;
  rank: number | null;
  tier: string | null;
  unitid?: number | null;
  control: string | null;
  bsq: Record<string, number | string | null>;
}

export interface DatasetMeta {
  id: DatasetId;
  label: string;
  shortLabel: string;
  description: string;
  rankLabel: string;
  schoolType: "business" | "engineering";
  yearRange: string;
}

export interface DatasetBundle {
  meta: DatasetMeta;
  deans: Dean[];
  bsq: BSQSchool[];
  schools: SchoolInfo[];
}

// Operations Management and Information Systems are separate disciplines
// throughout the dataset. The source data now carries them as distinct
// categories; this guard re-splits any legacy bundled values that slip in.
function splitOperationsFromIS(deans: Dean[]): Dean[] {
  return deans.map(d => {
    let b = d.disciplineBroad;
    if (b === "Operations & IS") {
      b = /information/i.test(d.discipline || "") ? "Information Systems" : "Operations Management";
    } else if (b === "Operations") {
      b = "Operations Management";
    }
    return b === d.disciplineBroad ? d : { ...d, disciplineBroad: b };
  });
}

const TOP100_SCHOOL_INFOS: SchoolInfo[] = TOP100_SCHOOLS.map(s => {
  const mapping = SCHOOL_DEAN_MAP[s.shortName];
  const university = mapping?.university || s.fullName.split(/\s[–-]\s/)[0] || "";
  const school = mapping?.school || s.shortName;
  return {
    university,
    school,
    rank: s.rank,
    fullName: s.fullName,
    shortName: s.shortName,
    type: s.type,
    totalFaculty: s.totalFaculty,
    lat: s.lat,
    lng: s.lng,
    city: s.city,
    state: s.state,
  };
});

export const DATASETS: Record<DatasetId, DatasetBundle> = {
  top100: {
    meta: {
      id: "top100",
      label: "Top-100 Business School Deans",
      shortLabel: "Top-100 B-school",
      description: "Exploring leadership change at top-100 US business schools",
      rankLabel: "US News B-School Rank (2025)",
      schoolType: "business",
      yearRange: "1967\u20132026",
    },
    deans: splitOperationsFromIS(top100Deans as unknown as Dean[]),
    bsq: top100BSQ as unknown as BSQSchool[],
    schools: TOP100_SCHOOL_INFOS,
  },
  r1bschool: {
    meta: {
      id: "r1bschool",
      label: "R1 University Business School Deans",
      shortLabel: "R1 B-school",
      description: "Business school deans across all R1 (Carnegie 2021) universities",
      rankLabel: "US News B-School Rank (2025)",
      schoolType: "business",
      yearRange: "1967\u20132026",
    },
    deans: splitOperationsFromIS(r1bsDeans as unknown as Dean[]),
    bsq: r1bsBSQ as unknown as BSQSchool[],
    schools: r1bsSchools as unknown as SchoolInfo[],
  },
  r1eschool: {
    meta: {
      id: "r1eschool",
      label: "R1 University Engineering School Deans",
      shortLabel: "R1 Engineering",
      description: "Engineering school deans across all R1 (Carnegie 2021) universities",
      rankLabel: "US News Engineering Rank (2025)",
      schoolType: "engineering",
      yearRange: "1967\u20132026",
    },
    deans: splitOperationsFromIS(r1esDeans as unknown as Dean[]),
    bsq: r1esResearch as unknown as BSQSchool[],
    schools: r1esSchools as unknown as SchoolInfo[],
  },
};

// R1 Engineering is now enabled in the switcher (dean data refreshed to 2026).
// Planned future expansion: law and medical schools.
export const DATASET_LIST: DatasetMeta[] = [
  DATASETS.top100.meta,
  DATASETS.r1bschool.meta,
  DATASETS.r1eschool.meta,
];
