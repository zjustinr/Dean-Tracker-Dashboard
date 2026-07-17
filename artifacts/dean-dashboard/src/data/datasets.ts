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

import r1uDeans from "./r1-university-deans.json";
import r1uResearch from "./r1-university-research.json";
import r1uSchools from "./r1-university-schools.json";

import r1mDeans from "./r1-medschool-deans.json";
import r1mResearch from "./r1-medschool-research.json";
import r1mSchools from "./r1-medschool-schools.json";

import r1lDeans from "./r1-lawschool-deans.json";
import r1lResearch from "./r1-lawschool-research.json";
import r1lSchools from "./r1-lawschool-schools.json";

import r1pDeans from "./r1-provost-deans.json";
import r1pResearch from "./r1-provost-research.json";
import r1pSchools from "./r1-provost-schools.json";

import agDeans from "./r1-agschool-deans.json";
import agResearch from "./r1-agschool-research.json";
import agSchools from "./r1-agschool-schools.json";

import nurDeans from "./r1-nursing-deans.json";
import nurResearch from "./r1-nursing-research.json";
import nurSchools from "./r1-nursing-schools.json";

export type DatasetId =
  | "top100" | "r1bschool" | "r1eschool" | "r1university" | "r1medical" | "r1law" | "r1provost"
  | "usag" | "usnursing";

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
  schoolType: "business" | "engineering" | "university" | "medical" | "law" | "provost" | "agriculture" | "nursing";
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
  r1university: {
    meta: {
      id: "r1university",
      label: "R1 University Presidents & Chancellors",
      shortLabel: "R1 University",
      description: "Presidents and chancellors of R1 universities, 1980–2026",
      rankLabel: "—",
      schoolType: "university",
      yearRange: "1980–2026",
    },
    deans: r1uDeans as unknown as Dean[],
    bsq: r1uResearch as unknown as BSQSchool[],
    schools: r1uSchools as unknown as SchoolInfo[],
  },
  r1medical: {
    meta: {
      id: "r1medical",
      label: "R1 University Medical School Deans",
      shortLabel: "R1 Medical",
      description: "Medical school deans across R1 (Carnegie) universities with MD/DO schools",
      rankLabel: "—",
      schoolType: "medical",
      yearRange: "1873–2026",
    },
    deans: r1mDeans as unknown as Dean[],
    bsq: r1mResearch as unknown as BSQSchool[],
    schools: r1mSchools as unknown as SchoolInfo[],
  },
  r1law: {
    meta: {
      id: "r1law",
      label: "R1 University Law School Deans",
      shortLabel: "R1 Law",
      description: "Law school deans across R1 (Carnegie) universities with ABA-accredited J.D. programs",
      rankLabel: "—",
      schoolType: "law",
      yearRange: "1850–2026",
    },
    deans: r1lDeans as unknown as Dean[],
    bsq: r1lResearch as unknown as BSQSchool[],
    schools: r1lSchools as unknown as SchoolInfo[],
  },
  r1provost: {
    meta: {
      id: "r1provost",
      label: "R1 University Provosts",
      shortLabel: "R1 Provost",
      description: "Chief academic officers of R1 universities — the dean-to-president pipeline's middle rung",
      rankLabel: "—",
      schoolType: "provost",
      yearRange: "1945–2026",
    },
    deans: r1pDeans as unknown as Dean[],
    bsq: r1pResearch as unknown as BSQSchool[],
    schools: r1pSchools as unknown as SchoolInfo[],
  },
  // The only dataset not scoped to R1: the universe here is the land-grant system
  // plus non-land-grant publics with an ag/forestry college, so it reaches HBCUs,
  // regional publics, a tribal college and the territorial land-grants. `tier`
  // carries land-grant status (1862/1890/1994) rather than a meaningless rank.
  usag: {
    meta: {
      id: "usag",
      label: "US Agriculture & Forestry School Deans",
      shortLabel: "Ag & Forestry",
      description: "Deans of agriculture and forestry colleges at US public universities — the land-grant system, plus proven private exceptions",
      rankLabel: "Land-grant status",
      schoolType: "agriculture",
      yearRange: "1870–2026",
    },
    deans: agDeans as unknown as Dean[],
    bsq: agResearch as unknown as BSQSchool[],
    schools: agSchools as unknown as SchoolInfo[],
  },
  // Also not scoped to R1. Nursing is the inverse of agriculture: the college is
  // near-universal, so the bar is a STANDALONE, dean-led School/College of Nursing
  // that grants a doctorate (PhD/DNS/DNP) -- that excludes the many nursing
  // departments nested under a College of Health Sciences. Reaches public and
  // private alike (many top schools are private) plus a few for-profits; `tier`
  // carries the Carnegie class since most are non-R1 and carry no US News rank.
  usnursing: {
    meta: {
      id: "usnursing",
      label: "US Nursing School Deans",
      shortLabel: "Nursing",
      description: "Deans of standalone, dean-led Schools & Colleges of Nursing that grant a doctorate — public, private, and for-profit, across all 50 states",
      rankLabel: "Carnegie class",
      schoolType: "nursing",
      yearRange: "1889–2026",
    },
    deans: nurDeans as unknown as Dean[],
    bsq: nurResearch as unknown as BSQSchool[],
    schools: nurSchools as unknown as SchoolInfo[],
  },
};

// R1 Engineering is now enabled in the switcher (dean data refreshed to 2026).
export const DATASET_LIST: DatasetMeta[] = [
  DATASETS.top100.meta,
  DATASETS.r1bschool.meta,
  DATASETS.r1eschool.meta,
  DATASETS.r1university.meta,
  DATASETS.r1medical.meta,
  DATASETS.r1law.meta,
  DATASETS.r1provost.meta,
  DATASETS.usag.meta,
  DATASETS.usnursing.meta,
];
