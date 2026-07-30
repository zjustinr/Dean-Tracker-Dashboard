import type { Dean } from "./types";

// Per-deploy build id (vite.config define). Appended as ?v= to the /data fetch so
// a new deploy always busts any stale browser/CDN cache of the JSON.
declare const __BUILD_ID__: string;

// Hardening Step 2: the dean/bsq/school arrays no longer ship in the JS bundle.
// They live in public/data/<id>.json and are fetched at runtime (see
// loadDatasetData) — regenerate with scripts/gen-public-data.ts after a refresh.
// Only the lightweight metadata below stays bundled, so the app shell and the
// dataset switcher render synchronously with no data in memory.

export type DatasetId =
  | "top100" | "r1bschool" | "r1eschool" | "r1university" | "r1medical" | "r1law" | "r1provost"
  | "usag" | "usnursing" | "uspharmacy" | "useducation" | "r1arts" | "uspublichealth" | "usvet" | "usr2" | "ussystem" | "usgrad" | "uscreativearts" | "usadvancement";

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
  schoolType: "business" | "engineering" | "university" | "medical" | "law" | "provost" | "agriculture" | "nursing" | "pharmacy" | "education" | "arts" | "publichealth" | "veterinary" | "r2university" | "system" | "graduate" | "creativearts" | "advancement";
  yearRange: string;
}

/** The heavy, fetched-at-runtime half of a dataset. */
export interface DatasetData {
  deans: Dean[];
  bsq: BSQSchool[];
  schools: SchoolInfo[];
}

export interface DatasetBundle extends DatasetData {
  meta: DatasetMeta;
}

export const DATASETS_META: Record<DatasetId, DatasetMeta> = {
  top100: {
    id: "top100",
    label: "Top-100 Business School Deans",
    shortLabel: "Top-100 B-school",
    description: "Exploring leadership change at top-100 US business schools",
    rankLabel: "US News B-School Rank (2025)",
    schoolType: "business",
    yearRange: "1967–2026",
  },
  r1bschool: {
    id: "r1bschool",
    label: "R1 University Business School Deans",
    shortLabel: "R1 B-school",
    description: "Business school deans across all R1 (Carnegie 2021) universities",
    rankLabel: "US News B-School Rank (2025)",
    schoolType: "business",
    yearRange: "1967–2026",
  },
  r1eschool: {
    id: "r1eschool",
    label: "R1 University Engineering School Deans",
    shortLabel: "R1 Engineering",
    description: "Engineering school deans across all R1 (Carnegie 2021) universities",
    rankLabel: "US News Engineering Rank (2025)",
    schoolType: "engineering",
    yearRange: "1967–2026",
  },
  r1university: {
    id: "r1university",
    label: "R1 University Presidents & Chancellors",
    shortLabel: "R1 Presidents",
    description: "Presidents and chancellors of R1 universities, 1980–2026",
    rankLabel: "—",
    schoolType: "university",
    yearRange: "1980–2026",
  },
  r1medical: {
    id: "r1medical",
    label: "R1 University Medical School Deans",
    shortLabel: "R1 Medical",
    description: "Medical school deans across R1 (Carnegie) universities with MD/DO schools",
    rankLabel: "—",
    schoolType: "medical",
    yearRange: "1873–2026",
  },
  r1law: {
    id: "r1law",
    label: "R1 University Law School Deans",
    shortLabel: "R1 Law",
    description: "Law school deans across R1 (Carnegie) universities with ABA-accredited J.D. programs",
    rankLabel: "—",
    schoolType: "law",
    yearRange: "1850–2026",
  },
  r1provost: {
    id: "r1provost",
    label: "R1 University Provosts",
    shortLabel: "R1 Provost",
    description: "Chief academic officers of R1 universities — the dean-to-president pipeline's middle rung",
    rankLabel: "—",
    schoolType: "provost",
    yearRange: "1945–2026",
  },
  // The only dataset not scoped to R1: the universe here is the land-grant system
  // plus non-land-grant publics with an ag/forestry college, so it reaches HBCUs,
  // regional publics, a tribal college and the territorial land-grants. `tier`
  // carries land-grant status (1862/1890/1994) rather than a meaningless rank.
  usag: {
    id: "usag",
    label: "US Agriculture & Forestry School Deans",
    shortLabel: "Ag & Forestry",
    description: "Deans of agriculture and forestry colleges at US public universities — the land-grant system, plus proven private exceptions",
    rankLabel: "Land-grant status",
    schoolType: "agriculture",
    yearRange: "1870–2026",
  },
  // Also not scoped to R1. Nursing is the inverse of agriculture: the college is
  // near-universal, so the bar is a STANDALONE, dean-led School/College of Nursing
  // that grants a doctorate (PhD/DNS/DNP) -- that excludes the many nursing
  // departments nested under a College of Health Sciences.
  usnursing: {
    id: "usnursing",
    label: "US Nursing School Deans",
    shortLabel: "Nursing",
    description: "Deans of standalone, dean-led Schools & Colleges of Nursing that grant a doctorate — public, private, and for-profit, across all 50 states",
    rankLabel: "Carnegie class",
    schoolType: "nursing",
    yearRange: "1889–2026",
  },
  // Also not R1-scoped. The bar mirrors nursing: an ACPE-accredited, dean-led
  // standalone College/School of Pharmacy granting the PharmD.
  uspharmacy: {
    id: "uspharmacy",
    label: "US Pharmacy School Deans",
    shortLabel: "Pharmacy",
    description: "Deans of ACPE-accredited, dean-led Colleges & Schools of Pharmacy granting the PharmD — public, private, and for-profit, across all 50 states",
    rankLabel: "Carnegie class",
    schoolType: "pharmacy",
    yearRange: "1866–2026",
  },
  // Also not R1-scoped. A STANDALONE, dean-led College/School of Education
  // (education the lead unit) granting a doctorate (PhD/EdD).
  useducation: {
    id: "useducation",
    label: "US Education School Deans",
    shortLabel: "Education",
    description: "Deans of standalone, dean-led Schools & Colleges of Education that grant a doctorate (PhD/EdD) — public and private, across all 50 states",
    rankLabel: "Carnegie class",
    schoolType: "education",
    yearRange: "1906–2026",
  },
  // Back to R1-scoped. The unit of analysis is (university, COLLEGE): a university
  // may run one College of Arts & Sciences or partition it across several colleges,
  // so a single university can appear as several rows.
  r1arts: {
    id: "r1arts",
    label: "R1 University Arts & Sciences Deans",
    shortLabel: "Arts & Sciences",
    description: "Deans of the Arts & Sciences colleges at R1 universities — the largest, oldest college on most campuses, counted per college where a university splits it",
    rankLabel: "—",
    schoolType: "arts",
    yearRange: "1873–2026",
  },
  // CEPH-accredited, dean-led standalone Schools/Colleges of Public Health granting
  // a doctorate (PhD/DrPH) — public and private, concentrated at R1s but not R1-scoped
  // (mirrors nursing/pharmacy). Completes the health-professions cluster.
  uspublichealth: {
    id: "uspublichealth",
    label: "US Public Health School Deans",
    shortLabel: "Public Health",
    description: "Deans of CEPH-accredited, dean-led Schools & Colleges of Public Health granting a doctorate — public and private, across 36 states",
    rankLabel: "Carnegie class",
    schoolType: "publichealth",
    yearRange: "1981–2026",
  },

  // Every US college of veterinary medicine: AVMA COE-accredited, provisionally
  // accredited, and the newly established programs still seeking accreditation.
  // Each school carries an avmaStatus field, so the tier is explicit rather than
  // implied. A complete, closed universe.
  usvet: {
    id: "usvet",
    label: "US Veterinary School Deans",
    shortLabel: "Veterinary",
    description: "Deans of every US college of veterinary medicine, AVMA-accredited plus provisional and newly established programs, from each college's founding to today",
    rankLabel: "AVMA status",
    schoolType: "veterinary",
    yearRange: "1879–2026",
  },

  usr2: {
    id: "usr2",
    label: "R2/R3 University Presidents & Chancellors",
    shortLabel: "R2/R3 Presidents",
    description: "Presidents and chancellors of every Carnegie R2 and R3 university, public and private -- the regional and comprehensive doctoral institutions ranked just below R1 -- each traced from 1996 to today",
    rankLabel: "Carnegie class",
    schoolType: "r2university",
    yearRange: "1996-2026",
  },

  ussystem: {
    id: "ussystem",
    label: "US Public University System Heads",
    shortLabel: "University Systems",
    description: "Presidents and chancellors of US public university system offices, the executives sitting above campus leadership, traced from 1996 to today",
    rankLabel: "Campuses",
    schoolType: "system",
    yearRange: "1996-2026",
  },

  // The chief graduate-education officer (Vice Provost and Dean of the Graduate
  // College/School) at major US research universities. First slice: Arizona State
  // (an active national search) plus a set of large public peers, so a recruiter
  // can see the search in context. Titles vary widely, so the officeholder's real
  // title rides in `discipline` (like the president/provost datasets).
  usgrad: {
    id: "usgrad",
    label: "US Graduate College Deans",
    shortLabel: "Graduate College",
    description: "Vice Provosts and Deans of the Graduate College/School at major US research universities — the chief graduate-education officers. First slice: ASU (active search) plus national public peers.",
    rankLabel: "—",
    schoolType: "graduate",
    yearRange: "1990–2026",
  },

  // Deans of US colleges/schools of the creative arts — fine & performing arts,
  // art & design, music, theatre, film, communication, journalism, architecture —
  // at research universities plus dedicated art/design/music schools. Built for
  // creative-arts leadership searches (anchor: Northeastern's CAMD dean search).
  // Tier 1 = sitting deans; roleTier is stamped so a feeder bench can drop in.
  uscreativearts: {
    id: "uscreativearts",
    label: "US Creative Arts, Media & Design Deans",
    shortLabel: "Creative Arts",
    description: "Deans of US colleges and schools of the creative arts — fine & performing arts, art & design, music, theatre, film, communication, journalism, and architecture — at research universities plus dedicated art, design, and music schools. First slice: sitting deans.",
    rankLabel: "—",
    schoolType: "creativearts",
    yearRange: "1991–2026",
  },
  // Cabinet-level advancement leaders (title rides in `discipline`, like provost/
  // president). One top fundraising/development officer per institution.
  usadvancement: {
    id: "usadvancement",
    label: "US University Advancement Leaders",
    shortLabel: "Advancement",
    description: "Chief advancement officers of US research universities — the top fundraising, development, and alumni-relations leaders (VP for Advancement / Chief Development Officer, or the university foundation CEO). First slice: sitting R1 leaders.",
    rankLabel: "—",
    schoolType: "advancement",
    yearRange: "1990–2026",
  },
};

// Controls which datasets appear in the switcher. DATASETS_META still holds every
// meta -- omitting one here only hides it from the UI. top100 is hidden (it is a
// strict subset of r1bschool); r1bschool is the default (see DatasetContext).
export const DATASET_LIST: DatasetMeta[] = [
  DATASETS_META.r1bschool,
  DATASETS_META.r1eschool,
  DATASETS_META.r1university,
  DATASETS_META.r1medical,
  DATASETS_META.r1law,
  DATASETS_META.r1provost,
  DATASETS_META.usag,
  DATASETS_META.usnursing,
  DATASETS_META.uspharmacy,
  DATASETS_META.useducation,
  DATASETS_META.r1arts,
  DATASETS_META.uspublichealth,
  DATASETS_META.usvet,
  DATASETS_META.usr2,
  DATASETS_META.ussystem,
  DATASETS_META.usgrad,
  DATASETS_META.uscreativearts,
  DATASETS_META.usadvancement,
];

// Runtime loader: fetch a dataset's heavy arrays from public/data/<id>.json,
// caching the in-flight promise so concurrent callers and repeat switches share
// one request. The bundle is assembled by pairing the fetched data with the
// bundled meta.
const cache = new Map<DatasetId, Promise<DatasetData>>();

export function loadDatasetData(id: DatasetId): Promise<DatasetData> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${id}.json?v=${__BUILD_ID__}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load dataset ${id}: ${r.status}`);
        return r.json() as Promise<DatasetData>;
      })
      .catch((e) => {
        cache.delete(id); // let a later attempt retry rather than caching the failure
        throw e;
      });
    cache.set(id, p);
  }
  return p;
}

export async function loadDatasetBundle(id: DatasetId): Promise<DatasetBundle> {
  const data = await loadDatasetData(id);
  return { meta: DATASETS_META[id], ...data };
}
