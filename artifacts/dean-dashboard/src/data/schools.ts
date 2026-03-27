export interface SchoolInfo {
  rank: number;
  fullName: string;
  shortName: string;
  type: string;
  departments: number;
  totalFaculty: number;
  lat: number;
  lng: number;
  city: string;
  state: string;
}

export const SCHOOL_INFO: SchoolInfo[] = [
  { rank: 1, fullName: "University of Pennsylvania – Wharton School", shortName: "Wharton", type: "Private", departments: 10, totalFaculty: 246, lat: 39.9522, lng: -75.1932, city: "Philadelphia", state: "PA" },
  { rank: 2, fullName: "Harvard University – Harvard Business School", shortName: "Harvard HBS", type: "Private", departments: 10, totalFaculty: 209, lat: 42.3656, lng: -71.1228, city: "Boston", state: "MA" },
  { rank: 3, fullName: "University of Chicago – Booth School of Business", shortName: "Chicago Booth", type: "Private", departments: 11, totalFaculty: 144, lat: 41.7886, lng: -87.5987, city: "Chicago", state: "IL" },
  { rank: 4, fullName: "Northwestern University – Kellogg School of Management", shortName: "Kellogg", type: "Private", departments: 7, totalFaculty: 141, lat: 42.0565, lng: -87.6753, city: "Evanston", state: "IL" },
  { rank: 5, fullName: "MIT – Sloan School of Management", shortName: "MIT Sloan", type: "Private", departments: 11, totalFaculty: 129, lat: 42.3601, lng: -71.0942, city: "Cambridge", state: "MA" },
  { rank: 6, fullName: "Stanford University – Graduate School of Business", shortName: "Stanford GSB", type: "Private", departments: 7, totalFaculty: 122, lat: 37.4275, lng: -122.1697, city: "Stanford", state: "CA" },
  { rank: 7, fullName: "Columbia University – Columbia Business School", shortName: "Columbia CBS", type: "Private", departments: 6, totalFaculty: 123, lat: 40.8075, lng: -73.9626, city: "New York", state: "NY" },
  { rank: 8, fullName: "University of Michigan – Ross School of Business", shortName: "Michigan Ross", type: "Public", departments: 7, totalFaculty: 149, lat: 42.2732, lng: -83.7384, city: "Ann Arbor", state: "MI" },
  { rank: 9, fullName: "UC Berkeley – Haas School of Business", shortName: "Berkeley Haas", type: "Public", departments: 7, totalFaculty: 90, lat: 37.8719, lng: -122.2585, city: "Berkeley", state: "CA" },
  { rank: 10, fullName: "Yale University – Yale School of Management", shortName: "Yale SOM", type: "Private", departments: 8, totalFaculty: 85, lat: 41.3115, lng: -72.9260, city: "New Haven", state: "CT" },
  { rank: 11, fullName: "NYU – Stern School of Business", shortName: "NYU Stern", type: "Private", departments: 8, totalFaculty: 140, lat: 40.7295, lng: -73.9965, city: "New York", state: "NY" },
  { rank: 12, fullName: "Duke University – Fuqua School of Business", shortName: "Duke Fuqua", type: "Private", departments: 8, totalFaculty: 91, lat: 36.0014, lng: -78.9382, city: "Durham", state: "NC" },
  { rank: 13, fullName: "University of Virginia – Darden School of Business", shortName: "UVA Darden", type: "Public", departments: 5, totalFaculty: 70, lat: 38.0336, lng: -78.5080, city: "Charlottesville", state: "VA" },
  { rank: 14, fullName: "UCLA – Anderson School of Management", shortName: "UCLA Anderson", type: "Public", departments: 7, totalFaculty: 105, lat: 34.0736, lng: -118.4420, city: "Los Angeles", state: "CA" },
  { rank: 15, fullName: "Cornell University – Johnson Graduate School of Management", shortName: "Cornell Johnson", type: "Private", departments: 6, totalFaculty: 66, lat: 42.4440, lng: -76.4749, city: "Ithaca", state: "NY" },
  { rank: 16, fullName: "Dartmouth College – Tuck School of Business", shortName: "Dartmouth Tuck", type: "Private", departments: 5, totalFaculty: 54, lat: 43.7044, lng: -72.2887, city: "Hanover", state: "NH" },
  { rank: 17, fullName: "University of Southern California – Marshall School of Business", shortName: "USC Marshall", type: "Private", departments: 7, totalFaculty: 103, lat: 34.0195, lng: -118.2863, city: "Los Angeles", state: "CA" },
  { rank: 18, fullName: "Carnegie Mellon University – Tepper School of Business", shortName: "CMU Tepper", type: "Private", departments: 6, totalFaculty: 97, lat: 40.4406, lng: -79.9959, city: "Pittsburgh", state: "PA" },
  { rank: 19, fullName: "University of Texas at Austin – McCombs School of Business", shortName: "UT McCombs", type: "Public", departments: 7, totalFaculty: 164, lat: 30.2849, lng: -97.7341, city: "Austin", state: "TX" },
  { rank: 20, fullName: "University of North Carolina – Kenan-Flagler Business School", shortName: "UNC KF", type: "Public", departments: 7, totalFaculty: 100, lat: 35.9049, lng: -79.0469, city: "Chapel Hill", state: "NC" },
  { rank: 21, fullName: "Georgetown University – McDonough School of Business", shortName: "Georgetown McD", type: "Private", departments: 6, totalFaculty: 84, lat: 38.9076, lng: -77.0723, city: "Washington", state: "DC" },
  { rank: 22, fullName: "University of Washington – Foster School of Business", shortName: "UW Foster", type: "Public", departments: 6, totalFaculty: 96, lat: 47.6553, lng: -122.3035, city: "Seattle", state: "WA" },
  { rank: 23, fullName: "Emory University – Goizueta Business School", shortName: "Emory Goizueta", type: "Private", departments: 5, totalFaculty: 72, lat: 33.7927, lng: -84.3233, city: "Atlanta", state: "GA" },
  { rank: 24, fullName: "Indiana University – Kelley School of Business", shortName: "Indiana Kelley", type: "Public", departments: 6, totalFaculty: 128, lat: 39.1682, lng: -86.5232, city: "Bloomington", state: "IN" },
  { rank: 25, fullName: "Rice University – Jones Graduate School of Business", shortName: "Rice Jones", type: "Private", departments: 5, totalFaculty: 58, lat: 29.7174, lng: -95.4018, city: "Houston", state: "TX" },
  { rank: 26, fullName: "Washington University in St. Louis – Olin Business School", shortName: "WashU Olin", type: "Private", departments: 6, totalFaculty: 76, lat: 38.6488, lng: -90.3108, city: "St. Louis", state: "MO" },
  { rank: 27, fullName: "Vanderbilt University – Owen Graduate School of Management", shortName: "Vanderbilt Owen", type: "Private", departments: 4, totalFaculty: 57, lat: 36.1446, lng: -86.8032, city: "Nashville", state: "TN" },
  { rank: 28, fullName: "Georgia Institute of Technology – Scheller College of Business", shortName: "Georgia Tech Scheller", type: "Public", departments: 5, totalFaculty: 88, lat: 33.7756, lng: -84.3963, city: "Atlanta", state: "GA" },
  { rank: 29, fullName: "University of Minnesota – Carlson School of Management", shortName: "Minnesota Carlson", type: "Public", departments: 6, totalFaculty: 97, lat: 44.9740, lng: -93.2277, city: "Minneapolis", state: "MN" },
  { rank: 30, fullName: "University of Notre Dame – Mendoza College of Business", shortName: "Notre Dame Mendoza", type: "Private", departments: 5, totalFaculty: 94, lat: 41.7030, lng: -86.2388, city: "Notre Dame", state: "IN" },
  { rank: 31, fullName: "Ohio State University – Fisher College of Business", shortName: "Ohio State Fisher", type: "Public", departments: 6, totalFaculty: 117, lat: 40.0013, lng: -83.0156, city: "Columbus", state: "OH" },
  { rank: 32, fullName: "University of Wisconsin–Madison – Wisconsin School of Business", shortName: "Wisconsin WSB", type: "Public", departments: 6, totalFaculty: 95, lat: 43.0731, lng: -89.4012, city: "Madison", state: "WI" },
  { rank: 33, fullName: "Boston College – Carroll School of Management", shortName: "BC Carroll", type: "Private", departments: 5, totalFaculty: 94, lat: 42.3355, lng: -71.1685, city: "Chestnut Hill", state: "MA" },
  { rank: 34, fullName: "Boston University – Questrom School of Business", shortName: "BU Questrom", type: "Private", departments: 6, totalFaculty: 92, lat: 42.3496, lng: -71.1003, city: "Boston", state: "MA" },
  { rank: 35, fullName: "University of Florida – Warrington College of Business", shortName: "Florida Warrington", type: "Public", departments: 6, totalFaculty: 104, lat: 29.6516, lng: -82.3248, city: "Gainesville", state: "FL" },
  { rank: 36, fullName: "Arizona State University – W. P. Carey School of Business", shortName: "ASU Carey", type: "Public", departments: 7, totalFaculty: 192, lat: 33.4484, lng: -111.9260, city: "Tempe", state: "AZ" },
  { rank: 37, fullName: "University of Maryland – Robert H. Smith School of Business", shortName: "Maryland Smith", type: "Public", departments: 6, totalFaculty: 135, lat: 38.9869, lng: -76.9426, city: "College Park", state: "MD" },
  { rank: 38, fullName: "Texas A&M University – Mays Business School", shortName: "Texas A&M Mays", type: "Public", departments: 5, totalFaculty: 127, lat: 30.6187, lng: -96.3365, city: "College Station", state: "TX" },
  { rank: 39, fullName: "University of Georgia – Terry College of Business", shortName: "UGA Terry", type: "Public", departments: 6, totalFaculty: 102, lat: 33.9519, lng: -83.3763, city: "Athens", state: "GA" },
  { rank: 40, fullName: "Penn State University – Smeal College of Business", shortName: "Penn State Smeal", type: "Public", departments: 7, totalFaculty: 118, lat: 40.7982, lng: -77.8599, city: "University Park", state: "PA" },
  { rank: 41, fullName: "Michigan State University – Broad College of Business", shortName: "MSU Broad", type: "Public", departments: 5, totalFaculty: 109, lat: 42.7325, lng: -84.4822, city: "East Lansing", state: "MI" },
  { rank: 42, fullName: "University of Illinois Urbana-Champaign – Gies College of Business", shortName: "Illinois Gies", type: "Public", departments: 5, totalFaculty: 115, lat: 40.1164, lng: -88.2434, city: "Champaign", state: "IL" },
  { rank: 43, fullName: "Brigham Young University – Marriott School of Business", shortName: "BYU Marriott", type: "Private", departments: 6, totalFaculty: 116, lat: 40.2519, lng: -111.6493, city: "Provo", state: "UT" },
  { rank: 44, fullName: "Northeastern University – D'Amore-McKim School of Business", shortName: "Northeastern DAmore-McKim", type: "Private", departments: 5, totalFaculty: 95, lat: 42.3398, lng: -71.0892, city: "Boston", state: "MA" },
  { rank: 45, fullName: "University of Pittsburgh – Katz Graduate School of Business", shortName: "Pitt Katz", type: "Public", departments: 5, totalFaculty: 59, lat: 40.4406, lng: -79.9559, city: "Pittsburgh", state: "PA" },
  { rank: 46, fullName: "University of Iowa – Tippie College of Business", shortName: "Iowa Tippie", type: "Public", departments: 5, totalFaculty: 76, lat: 41.6611, lng: -91.5302, city: "Iowa City", state: "IA" },
  { rank: 47, fullName: "George Washington University – School of Business", shortName: "GW SoB", type: "Private", departments: 6, totalFaculty: 94, lat: 38.8997, lng: -77.0488, city: "Washington", state: "DC" },
  { rank: 48, fullName: "Wake Forest University – School of Business", shortName: "Wake Forest SoB", type: "Private", departments: 4, totalFaculty: 50, lat: 36.1336, lng: -80.2773, city: "Winston-Salem", state: "NC" },
  { rank: 49, fullName: "Temple University – Fox School of Business", shortName: "Temple Fox", type: "Private", departments: 9, totalFaculty: 79, lat: 39.9812, lng: -75.1553, city: "Philadelphia", state: "PA" },
  { rank: 50, fullName: "University of Miami – Miami Herbert Business School", shortName: "Miami Herbert", type: "Private", departments: 8, totalFaculty: 61, lat: 25.7215, lng: -80.2784, city: "Coral Gables", state: "FL" },
];

export const SCHOOL_DEAN_MAP: Record<string, { university: string; school: string }> = {
  "Wharton": { university: "University of Pennsylvania", school: "Wharton School" },
  "Harvard HBS": { university: "Harvard University", school: "Harvard Business School" },
  "Chicago Booth": { university: "University of Chicago", school: "Booth School of Business" },
  "Kellogg": { university: "Northwestern University", school: "Kellogg School of Management" },
  "MIT Sloan": { university: "MIT", school: "Sloan School of Management" },
  "Stanford GSB": { university: "Stanford University", school: "Graduate School of Business" },
  "Columbia CBS": { university: "Columbia University", school: "Columbia Business School" },
  "Michigan Ross": { university: "University of Michigan", school: "Ross School of Business" },
  "Berkeley Haas": { university: "University of California Berkeley", school: "Haas School of Business" },
  "Yale SOM": { university: "Yale University", school: "School of Management" },
  "NYU Stern": { university: "New York University", school: "Stern School of Business" },
  "Duke Fuqua": { university: "Duke University", school: "Fuqua School of Business" },
  "UVA Darden": { university: "University of Virginia", school: "Darden School of Business" },
  "UCLA Anderson": { university: "UCLA", school: "Anderson School of Management" },
  "Cornell Johnson": { university: "Cornell University", school: "Johnson School of Management" },
  "Dartmouth Tuck": { university: "Dartmouth College", school: "Tuck School of Business" },
  "USC Marshall": { university: "University of Southern California", school: "Marshall School of Business" },
  "CMU Tepper": { university: "Carnegie Mellon University", school: "Tepper School of Business" },
  "UT McCombs": { university: "University of Texas at Austin", school: "McCombs School of Business" },
  "UNC KF": { university: "University of North Carolina", school: "Kenan-Flagler Business School" },
  "Georgetown McD": { university: "Georgetown University", school: "McDonough School of Business" },
  "UW Foster": { university: "University of Washington", school: "Foster School of Business" },
  "Emory Goizueta": { university: "Emory University", school: "Goizueta Business School" },
  "Indiana Kelley": { university: "Indiana University", school: "Kelley School of Business" },
  "Rice Jones": { university: "Rice University", school: "Jones Graduate School of Business" },
  "WashU Olin": { university: "Washington University in St. Louis", school: "Olin Business School" },
  "Vanderbilt Owen": { university: "Vanderbilt University", school: "Owen Graduate School of Management" },
  "Georgia Tech Scheller": { university: "Georgia Tech", school: "Scheller College of Business" },
  "Minnesota Carlson": { university: "University of Minnesota", school: "Carlson School of Management" },
  "Notre Dame Mendoza": { university: "University of Notre Dame", school: "Mendoza College of Business" },
  "Ohio State Fisher": { university: "Ohio State University", school: "Fisher College of Business" },
  "Wisconsin WSB": { university: "University of Wisconsin-Madison", school: "Wisconsin School of Business" },
  "BC Carroll": { university: "Boston College", school: "Carroll School of Management" },
  "BU Questrom": { university: "Boston University", school: "Questrom School of Business" },
  "Florida Warrington": { university: "University of Florida", school: "Warrington College of Business" },
  "ASU Carey": { university: "Arizona State University", school: "W.P. Carey School of Business" },
  "Maryland Smith": { university: "University of Maryland", school: "Robert H. Smith School of Business" },
  "Texas A&M Mays": { university: "Texas A&M University", school: "Mays Business School" },
  "UGA Terry": { university: "University of Georgia", school: "Terry College of Business" },
  "Penn State Smeal": { university: "Penn State University", school: "Smeal College of Business" },
  "MSU Broad": { university: "Michigan State University", school: "Broad College of Business" },
  "Illinois Gies": { university: "University of Illinois Urbana-Champaign", school: "College of Business" },
  "BYU Marriott": { university: "Brigham Young University", school: "Marriott School of Business" },
  "Northeastern DAmore-McKim": { university: "Northeastern University", school: "D'Amore-McKim School of Business" },
  "Pitt Katz": { university: "University of Pittsburgh", school: "Katz Graduate School of Business" },
  "Iowa Tippie": { university: "University of Iowa", school: "Ivy College of Business" },
  "GW SoB": { university: "George Washington University", school: "School of Business" },
  "Wake Forest SoB": { university: "Wake Forest University", school: "School of Business" },
  "Temple Fox": { university: "Temple University", school: "School of Business (formerly Howe School of Technology Management)" },
  "Miami Herbert": { university: "University of Miami", school: "School of Business Administration" },
};

export const SCHOOL_NAME_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(SCHOOL_DEAN_MAP).map(([k, v]) => [k, v.school])
);

export function getDeanSchoolName(shortName: string): string {
  return SCHOOL_NAME_MAP[shortName] || shortName;
}

export function findSchoolInfo(schoolName: string): SchoolInfo | undefined {
  for (const s of SCHOOL_INFO) {
    if (SCHOOL_NAME_MAP[s.shortName] === schoolName) return s;
  }
  const lower = schoolName.toLowerCase();
  return SCHOOL_INFO.find(s =>
    lower.includes(s.shortName.toLowerCase()) ||
    s.fullName.toLowerCase().includes(lower)
  );
}
