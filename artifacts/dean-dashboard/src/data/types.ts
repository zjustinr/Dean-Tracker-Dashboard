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
  involuntary: boolean;
  hadPriorConnection: boolean;
  hasInstitutionalLink: boolean;
  priorAssocOrAsstDean: boolean;
  avgAnnualGifts: number | null;
  totalGifts: number | null;
  maxAnnualGifts: number | null;
  avgEndowment: number | null;
  fundraisingYears: number;
  preTenureGifts: number | null;
  giftGrowthVsPre: number | null;
  surpriseDeparture: boolean;
  surpriseEvidence: string;
  enrollmentStart: number | null;
  enrollmentEnd: number | null;
  enrollmentAvg: number | null;
  gradEnrollmentStart: number | null;
  gradEnrollmentEnd: number | null;
  businessPctStart: number | null;
  businessPctEnd: number | null;
  estBizEnrollmentStart: number | null;
  estBizEnrollmentEnd: number | null;
  businessDegreesLatest: number | null;
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
  | "rank"
  | "avgAnnualGifts"
  | "totalGifts"
  | "maxAnnualGifts"
  | "avgEndowment";

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
  avgAnnualGifts: "Avg Annual Gifts ($M)",
  totalGifts: "Total Gifts ($M)",
  maxAnnualGifts: "Max Annual Gifts ($M)",
  avgEndowment: "Avg Endowment ($M)",
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
