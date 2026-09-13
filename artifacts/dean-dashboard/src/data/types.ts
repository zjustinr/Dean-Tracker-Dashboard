export interface Dean {
  id: number;
  university: string;
  school: string;
  dean: string;
  startYear: number | null;
  endYear: number | null;
  startLabel: string;
  endLabel: string;
  priorTitle: string;
  priorInstitution: string;
  origin: string;
  originV2: string;
  apptOrigin4: string;
  isInternal: boolean;
  isExternal: boolean;
  isInterim: boolean;
  careerBackground: string;
  hasIndustryExp: boolean;
  gender: string;
  isFemale: boolean;
  isFirstTimeDean: boolean;
  discipline: string;
  disciplineBroad: string;
  phdField: string;
  phdInstitution?: string;
  phdYear?: number | null; // doctorate award year; sourced from bio pages, see docs/data-provenance.md
  hasPriorDeanExp: boolean;
  priorAssocOrAsstDean: boolean;
  hadAssocDeanRole: boolean;
  hadDeptChairRole: boolean;
  hasConsultingBg: boolean;
  hasPhd: boolean;
  rank: number | null;
  tier: string;
  inTop50: boolean;
  inTop100: boolean;
  fromEliteInstitution: boolean;
  priorInstitutionElite: boolean;
  tenureLength: number | null;
  era: string;
  notes: string;
  nextRole: string;
  nextRoleCode: number | null;
  nextRoleDetail?: string; // optional free-text specifics of the post-role (e.g. "Professor of Law at Columbia")
  roleType?: string; // "subdean" tags an associate/vice dean feeder-bench row (not a dean); excluded from dean lists + tenure norms
  roleTier?: string; // candidate tier for feeder-pool indices: "Dean" | "Associate Dean" | "School Director" | "Department Chair"
  // Which seat in the hierarchy this row is, stamped by scripts/backfill-corpus-fields.mjs
  // on every dated row: "chief_executive" | "provost" | "dean" | "subordinate" | "cabinet",
  // or "" where the title could not be resolved. Distinct from roleTier, which is a BENCH
  // label the scout scoring reads -- see the header of scripts/lib/seat-role.mjs for why
  // this is a separate field rather than a reuse. Declared here for readers; no consumer
  // selects on it yet (the UI still uses roleType !== "subdean"), and adopting it is a
  // separate change with its own risk.
  seatRole?: string;
  // The end date is the ETL's extract year written where the real one was never found,
  // on a spell long enough that it cannot be a genuine departure. NOT nulled: in this
  // corpus endYear === null means "still sitting", so nulling these would invent
  // currently-serving leaders. Consumers that care about durations should treat the end
  // date as unknown rather than as recorded.
  endYearUnverified?: boolean;
  // The title names several appointments at once ("Acting Provost (1977-78); Provost
  // (1978-83)"). That is two spells in one row, and neither interim value describes it,
  // so it is flagged for splitting at source rather than coerced.
  titleIsCompound?: boolean;
  involuntary: boolean;
  hadPriorConnection: boolean;
  hasInstitutionalLink: boolean;
  fromSameUniversityDiffSchool: boolean;
  surpriseDeparture: boolean;
  surpriseEvidence: string;
  sourceUrl: string;
  enrollmentStart: number | null;   // institution at APPOINTMENT year (exact year match; see docs/data-provenance.md)
  businessPctStart: number | null;
  businessDegreesStart: number | null;
  enrollmentEnd: number | null;
  enrollmentAvg: number | null;
  businessPctEnd: number | null;
  businessDegreesLatest: number | null;
  convertedToPermanent: boolean;
  connectionType: string;
}

export type CategoricalField =
  | "gender"
  | "origin"
  | "disciplineBroad"
  | "careerBackground"
  | "era"
  | "tier"
  | "nextRole";

export type NumericField =
  | "tenureLength"
  | "rank";

export type BooleanField =
  | "isFemale"
  | "isInternal"
  | "isExternal"
  | "isInterim"
  | "isFirstTimeDean"
  | "hasIndustryExp"
  | "hasPriorDeanExp"
  | "hadAssocDeanRole"
  | "hasPhd"
  | "fromEliteInstitution"
  | "involuntary"
  | "hadPriorConnection";

export const CATEGORICAL_LABELS: Record<CategoricalField, string> = {
  gender: "Gender",
  origin: "Origin (Internal/External)",
  disciplineBroad: "Discipline",
  careerBackground: "Career Background",
  era: "Appointment Era",
  tier: "School Tier",
  nextRole: "Next Role",
};

export const NUMERIC_LABELS: Record<NumericField, string> = {
  tenureLength: "Tenure Length (years)",
  rank: "US News Rank (2025)",
};

export const BOOLEAN_LABELS: Record<BooleanField, string> = {
  isFemale: "Female",
  isInternal: "Internal Hire",
  isExternal: "External Hire",
  isInterim: "Interim Dean",
  isFirstTimeDean: "First-Time Dean",
  hasIndustryExp: "Industry Experience",
  hasPriorDeanExp: "Prior Dean Experience",
  hadAssocDeanRole: "Prior Assoc. Dean Role",
  hasPhd: "Has PhD",
  fromEliteInstitution: "From Elite Institution",
  involuntary: "Involuntary Departure",
  hadPriorConnection: "Prior Connection to School",
};

export const CHART_COLORS = [
  "hsl(211, 100%, 47%)",
  "hsl(250, 100%, 68%)",
  "hsl(130, 100%, 28%)",
  "hsl(0, 91%, 34%)",
  "hsl(330, 81%, 60%)",
  "hsl(40, 96%, 53%)",
  "hsl(180, 70%, 35%)",
  "hsl(280, 60%, 50%)",
  "hsl(15, 85%, 55%)",
  "hsl(160, 60%, 40%)",
];

// Gender is stored inconsistently across indices: the original b-school index
// uses "M"/"F", every later index uses "Male"/"Female", and the systems index
// even had lowercase "male"/"female". Normalize to "M"/"F"/"" so every gender
// display (profile badge, timeline bar color, analytics counts) works for all
// indices. Use this everywhere instead of comparing dean.gender directly.
// Human-friendly tenure range for a leader. Avoids a bare "?" when the start year
// is unknown: a still-serving leader with no known start reads as "Current"; a
// departed one with only an end year reads as "until <end>".
export function yearsLabel(startYear?: number | null, endYear?: number | null, present = "Present"): string {
  if (startYear) return `${startYear}–${endYear || present}`;
  if (endYear) return `until ${endYear}`;
  return "Current";
}

export function genderNorm(g?: string | null): "M" | "F" | "" {
  const c = (g || "").trim().toLowerCase();
  if (c === "m" || c === "male") return "M";
  if (c === "f" || c === "female") return "F";
  return "";
}

export const NEXT_ROLE_LABELS: Record<string, string> = {
  Faculty_emeritus: "Faculty/Emeritus",
  Another_deanship: "Another Deanship",
  Full_retirement: "Retirement",
  Provost_president_chancellor: "Provost/President",
  Industry_nonprofit_govt: "Industry/Nonprofit/Govt",
  Still_serving: "Still Serving",
  // A spell that ended only on paper: the same person kept leading the same college,
  // almost always an interim confirmed as permanent. Distinct from Still_serving
  // ("holds the role today") and from Another_deanship ("moved to a different college").
  // Kept separate because interim-to-permanent conversion is itself a research variable.
  Continued_same_college: "Continued in Role",
  Unknown: "Unknown",
  Deceased: "Deceased",
};

export const ORIGIN_LABELS: Record<string, string> = {
  External: "External",
  Internal: "Internal",
  "Interim-Internal": "Interim (Internal)",
  "Interim-External": "Interim (External)",
  "Same-University": "Same University",
  Unknown: "Unknown",
};
