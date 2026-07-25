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
  involuntary: boolean;
  hadPriorConnection: boolean;
  hasInstitutionalLink: boolean;
  fromSameUniversityDiffSchool: boolean;
  surpriseDeparture: boolean;
  surpriseEvidence: string;
  sourceUrl: string;
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
  nextRole: "Post-Dean Role",
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
