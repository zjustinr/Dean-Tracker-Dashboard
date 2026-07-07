#!/usr/bin/env node
import XLSX from "xlsx";
import { writeFileSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, "../../../attached_assets/Dean_Data_Collection_R1_v8_userverified.xlsx");
const OUT_DIR = resolve(__dirname, "../src/data");

const wb = XLSX.readFile(SRC);
const bsRows = XLSX.utils.sheet_to_json(wb.Sheets["B-School"], { defval: null });
const esRows = XLSX.utils.sheet_to_json(wb.Sheets["E-School"], { defval: null });

// Pull existing top-100 schools.ts coordinate list to seed lat/lng for shared universities
let existingSchoolsTs;
try {
  existingSchoolsTs = readFileSync(resolve(OUT_DIR, "schools.ts"), "utf8");
} catch {
  existingSchoolsTs = "";
}

// Crude parser: extract { fullName: "Univ - School", ..., lat, lng, type }
const UNIV_GEO = new Map(); // university name -> {lat,lng,state,city,type}
const FULLNAME_GEO = new Map(); // "Univ - School" -> same
const SCHOOL_RE = /\{[^}]*?fullName:\s*"([^"]+)"[^}]*?type:\s*"([^"]+)"[^}]*?lat:\s*([\-\d.]+)[^}]*?lng:\s*([\-\d.]+)[^}]*?city:\s*"([^"]+)"[^}]*?state:\s*"([^"]+)"[^}]*?\}/g;
let m;
while ((m = SCHOOL_RE.exec(existingSchoolsTs)) !== null) {
  const [_, fullName, type, lat, lng, city, state] = m;
  const obj = { lat: +lat, lng: +lng, type, city, state };
  FULLNAME_GEO.set(fullName, obj);
  // university name = portion before " – " or " - "
  const split = fullName.split(/\s[–-]\s/);
  if (split.length >= 1) UNIV_GEO.set(split[0].trim(), obj);
}

// Comprehensive R1 university lat/lng overrides for common R1 schools not in top-100
const R1_GEO = {
  "American University": { lat: 38.9375, lng: -77.0892, city: "Washington", state: "DC", type: "Private" },
  "Arizona State University": { lat: 33.4242, lng: -111.9281, city: "Tempe", state: "AZ", type: "Public" },
  "Auburn University": { lat: 32.601, lng: -85.4876, city: "Auburn", state: "AL", type: "Public" },
  "Baylor University": { lat: 31.5489, lng: -97.1131, city: "Waco", state: "TX", type: "Private" },
  "Binghamton University": { lat: 42.0872, lng: -75.9692, city: "Binghamton", state: "NY", type: "Public" },
  "Boston College": { lat: 42.335, lng: -71.1685, city: "Chestnut Hill", state: "MA", type: "Private" },
  "Boston University": { lat: 42.3505, lng: -71.1054, city: "Boston", state: "MA", type: "Private" },
  "Brandeis University": { lat: 42.366, lng: -71.2592, city: "Waltham", state: "MA", type: "Private" },
  "Brigham Young University": { lat: 40.2338, lng: -111.6585, city: "Provo", state: "UT", type: "Private" },
  "Brown University": { lat: 41.8268, lng: -71.4025, city: "Providence", state: "RI", type: "Private" },
  "California Institute of Technology": { lat: 34.1377, lng: -118.1253, city: "Pasadena", state: "CA", type: "Private" },
  "Carnegie Mellon University": { lat: 40.4433, lng: -79.9436, city: "Pittsburgh", state: "PA", type: "Private" },
  "Case Western Reserve University": { lat: 41.5043, lng: -81.6079, city: "Cleveland", state: "OH", type: "Private" },
  "Catholic University of America": { lat: 38.9367, lng: -76.9981, city: "Washington", state: "DC", type: "Private" },
  "City University of New York-The City College": { lat: 40.8201, lng: -73.9495, city: "New York", state: "NY", type: "Public" },
  "Clark University": { lat: 42.2511, lng: -71.8231, city: "Worcester", state: "MA", type: "Private" },
  "Clarkson University": { lat: 44.6634, lng: -74.9779, city: "Potsdam", state: "NY", type: "Private" },
  "Clemson University": { lat: 34.6783, lng: -82.8395, city: "Clemson", state: "SC", type: "Public" },
  "Colorado School of Mines": { lat: 39.7508, lng: -105.2233, city: "Golden", state: "CO", type: "Public" },
  "Colorado State University": { lat: 40.5734, lng: -105.0865, city: "Fort Collins", state: "CO", type: "Public" },
  "Columbia University": { lat: 40.8075, lng: -73.9626, city: "New York", state: "NY", type: "Private" },
  "Cornell University": { lat: 42.4534, lng: -76.4735, city: "Ithaca", state: "NY", type: "Private" },
  "Dartmouth College": { lat: 43.7044, lng: -72.2887, city: "Hanover", state: "NH", type: "Private" },
  "DePaul University": { lat: 41.9244, lng: -87.6553, city: "Chicago", state: "IL", type: "Private" },
  "Drexel University": { lat: 39.9566, lng: -75.1899, city: "Philadelphia", state: "PA", type: "Private" },
  "Duke University": { lat: 36.0014, lng: -78.9382, city: "Durham", state: "NC", type: "Private" },
  "Duquesne University": { lat: 40.4361, lng: -79.9931, city: "Pittsburgh", state: "PA", type: "Private" },
  "East Carolina University": { lat: 35.6063, lng: -77.3669, city: "Greenville", state: "NC", type: "Public" },
  "Emory University": { lat: 33.7925, lng: -84.3235, city: "Atlanta", state: "GA", type: "Private" },
  "Florida Atlantic University": { lat: 26.3712, lng: -80.1019, city: "Boca Raton", state: "FL", type: "Public" },
  "Florida International University": { lat: 25.7572, lng: -80.3735, city: "Miami", state: "FL", type: "Public" },
  "Florida State University": { lat: 30.4419, lng: -84.2985, city: "Tallahassee", state: "FL", type: "Public" },
  "Fordham University": { lat: 40.8615, lng: -73.886, city: "Bronx", state: "NY", type: "Private" },
  "George Mason University": { lat: 38.8315, lng: -77.3107, city: "Fairfax", state: "VA", type: "Public" },
  "George Washington University": { lat: 38.8997, lng: -77.0486, city: "Washington", state: "DC", type: "Private" },
  "Georgetown University": { lat: 38.9076, lng: -77.0723, city: "Washington", state: "DC", type: "Private" },
  "Georgia Institute of Technology": { lat: 33.7756, lng: -84.3963, city: "Atlanta", state: "GA", type: "Public" },
  "Georgia State University": { lat: 33.753, lng: -84.3863, city: "Atlanta", state: "GA", type: "Public" },
  "Harvard University": { lat: 42.3656, lng: -71.1228, city: "Cambridge", state: "MA", type: "Private" },
  "Howard University": { lat: 38.9229, lng: -77.0194, city: "Washington", state: "DC", type: "Private" },
  "Illinois Institute of Technology": { lat: 41.8358, lng: -87.6266, city: "Chicago", state: "IL", type: "Private" },
  "Indiana University": { lat: 39.1653, lng: -86.5264, city: "Bloomington", state: "IN", type: "Public" },
  "Indiana University-Bloomington": { lat: 39.1653, lng: -86.5264, city: "Bloomington", state: "IN", type: "Public" },
  "Iowa State University": { lat: 42.0266, lng: -93.6465, city: "Ames", state: "IA", type: "Public" },
  "Johns Hopkins University": { lat: 39.3299, lng: -76.6205, city: "Baltimore", state: "MD", type: "Private" },
  "Kansas State University": { lat: 39.1974, lng: -96.5847, city: "Manhattan", state: "KS", type: "Public" },
  "Kent State University": { lat: 41.1486, lng: -81.342, city: "Kent", state: "OH", type: "Public" },
  "Lehigh University": { lat: 40.607, lng: -75.3785, city: "Bethlehem", state: "PA", type: "Private" },
  "Louisiana State University": { lat: 30.4133, lng: -91.18, city: "Baton Rouge", state: "LA", type: "Public" },
  "Loyola University Chicago": { lat: 42.0001, lng: -87.6585, city: "Chicago", state: "IL", type: "Private" },
  "Marquette University": { lat: 43.0389, lng: -87.9305, city: "Milwaukee", state: "WI", type: "Private" },
  "Massachusetts Institute of Technology": { lat: 42.3601, lng: -71.0942, city: "Cambridge", state: "MA", type: "Private" },
  "Miami University": { lat: 39.5098, lng: -84.7326, city: "Oxford", state: "OH", type: "Public" },
  "Michigan State University": { lat: 42.7018, lng: -84.4822, city: "East Lansing", state: "MI", type: "Public" },
  "Michigan Technological University": { lat: 47.1188, lng: -88.5469, city: "Houghton", state: "MI", type: "Public" },
  "Mississippi State University": { lat: 33.4504, lng: -88.7892, city: "Starkville", state: "MS", type: "Public" },
  "Missouri University of Science and Technology": { lat: 37.9558, lng: -91.7745, city: "Rolla", state: "MO", type: "Public" },
  "Montana State University": { lat: 45.6671, lng: -111.0466, city: "Bozeman", state: "MT", type: "Public" },
  "Naval Postgraduate School": { lat: 36.5938, lng: -121.8722, city: "Monterey", state: "CA", type: "Public" },
  "New Jersey Institute of Technology": { lat: 40.7424, lng: -74.1784, city: "Newark", state: "NJ", type: "Public" },
  "New Mexico State University": { lat: 32.2818, lng: -106.7467, city: "Las Cruces", state: "NM", type: "Public" },
  "New York University": { lat: 40.7295, lng: -73.9965, city: "New York", state: "NY", type: "Private" },
  "North Carolina A&T State University": { lat: 36.0726, lng: -79.7733, city: "Greensboro", state: "NC", type: "Public" },
  "North Carolina State University": { lat: 35.7847, lng: -78.6821, city: "Raleigh", state: "NC", type: "Public" },
  "North Dakota State University": { lat: 46.8985, lng: -96.8019, city: "Fargo", state: "ND", type: "Public" },
  "Northeastern University": { lat: 42.3398, lng: -71.0892, city: "Boston", state: "MA", type: "Private" },
  "Northern Arizona University": { lat: 35.1853, lng: -111.6613, city: "Flagstaff", state: "AZ", type: "Public" },
  "Northern Illinois University": { lat: 41.9335, lng: -88.7787, city: "DeKalb", state: "IL", type: "Public" },
  "Northwestern University": { lat: 42.0565, lng: -87.6753, city: "Evanston", state: "IL", type: "Private" },
  "Oakland University": { lat: 42.6717, lng: -83.2154, city: "Rochester", state: "MI", type: "Public" },
  "Ohio State University": { lat: 40.0067, lng: -83.0305, city: "Columbus", state: "OH", type: "Public" },
  "Ohio University": { lat: 39.3245, lng: -82.1013, city: "Athens", state: "OH", type: "Public" },
  "Oklahoma State University": { lat: 36.1252, lng: -97.072, city: "Stillwater", state: "OK", type: "Public" },
  "Old Dominion University": { lat: 36.8855, lng: -76.305, city: "Norfolk", state: "VA", type: "Public" },
  "Oregon State University": { lat: 44.5638, lng: -123.2794, city: "Corvallis", state: "OR", type: "Public" },
  "Pennsylvania State University": { lat: 40.7982, lng: -77.86, city: "University Park", state: "PA", type: "Public" },
  "Princeton University": { lat: 40.3431, lng: -74.6551, city: "Princeton", state: "NJ", type: "Private" },
  "Purdue University": { lat: 40.4237, lng: -86.9212, city: "West Lafayette", state: "IN", type: "Public" },
  "Rensselaer Polytechnic Institute": { lat: 42.7298, lng: -73.6789, city: "Troy", state: "NY", type: "Private" },
  "Rice University": { lat: 29.7174, lng: -95.4018, city: "Houston", state: "TX", type: "Private" },
  "Rochester Institute of Technology": { lat: 43.0844, lng: -77.6749, city: "Rochester", state: "NY", type: "Private" },
  "Rowan University": { lat: 39.7088, lng: -75.1175, city: "Glassboro", state: "NJ", type: "Public" },
  "Rutgers University": { lat: 40.5008, lng: -74.4474, city: "New Brunswick", state: "NJ", type: "Public" },
  "Rutgers University-New Brunswick": { lat: 40.5008, lng: -74.4474, city: "New Brunswick", state: "NJ", type: "Public" },
  "Rutgers University-Newark": { lat: 40.7414, lng: -74.1742, city: "Newark", state: "NJ", type: "Public" },
  "Saint Louis University": { lat: 38.6366, lng: -90.2348, city: "St. Louis", state: "MO", type: "Private" },
  "San Diego State University": { lat: 32.7757, lng: -117.0719, city: "San Diego", state: "CA", type: "Public" },
  "Santa Clara University": { lat: 37.3496, lng: -121.9389, city: "Santa Clara", state: "CA", type: "Private" },
  "South Dakota State University": { lat: 44.319, lng: -96.7843, city: "Brookings", state: "SD", type: "Public" },
  "Southern Methodist University": { lat: 32.8412, lng: -96.7844, city: "Dallas", state: "TX", type: "Private" },
  "Stanford University": { lat: 37.4275, lng: -122.1697, city: "Stanford", state: "CA", type: "Private" },
  "Stevens Institute of Technology": { lat: 40.7453, lng: -74.0236, city: "Hoboken", state: "NJ", type: "Private" },
  "Stony Brook University": { lat: 40.9159, lng: -73.1232, city: "Stony Brook", state: "NY", type: "Public" },
  "SUNY Albany": { lat: 42.6862, lng: -73.8235, city: "Albany", state: "NY", type: "Public" },
  "SUNY Binghamton": { lat: 42.0872, lng: -75.9692, city: "Binghamton", state: "NY", type: "Public" },
  "SUNY Buffalo": { lat: 43.0008, lng: -78.789, city: "Buffalo", state: "NY", type: "Public" },
  "Syracuse University": { lat: 43.0379, lng: -76.1351, city: "Syracuse", state: "NY", type: "Private" },
  "Temple University": { lat: 39.9806, lng: -75.1556, city: "Philadelphia", state: "PA", type: "Public" },
  "Tennessee Technological University": { lat: 36.1751, lng: -85.5031, city: "Cookeville", state: "TN", type: "Public" },
  "Texas A&M University": { lat: 30.6118, lng: -96.3415, city: "College Station", state: "TX", type: "Public" },
  "Texas Christian University": { lat: 32.7095, lng: -97.3622, city: "Fort Worth", state: "TX", type: "Private" },
  "Texas State University": { lat: 29.8884, lng: -97.9381, city: "San Marcos", state: "TX", type: "Public" },
  "Texas Tech University": { lat: 33.5846, lng: -101.8803, city: "Lubbock", state: "TX", type: "Public" },
  "The University of Alabama": { lat: 33.2098, lng: -87.5418, city: "Tuscaloosa", state: "AL", type: "Public" },
  "Tufts University": { lat: 42.4075, lng: -71.1190, city: "Medford", state: "MA", type: "Private" },
  "Tulane University": { lat: 29.9402, lng: -90.1218, city: "New Orleans", state: "LA", type: "Private" },
  "University at Albany": { lat: 42.6862, lng: -73.8235, city: "Albany", state: "NY", type: "Public" },
  "University at Buffalo": { lat: 43.0008, lng: -78.789, city: "Buffalo", state: "NY", type: "Public" },
  "University of Akron": { lat: 41.0762, lng: -81.5103, city: "Akron", state: "OH", type: "Public" },
  "University of Alabama": { lat: 33.2098, lng: -87.5418, city: "Tuscaloosa", state: "AL", type: "Public" },
  "University of Alabama at Birmingham": { lat: 33.5054, lng: -86.8027, city: "Birmingham", state: "AL", type: "Public" },
  "University of Alabama in Huntsville": { lat: 34.7256, lng: -86.6403, city: "Huntsville", state: "AL", type: "Public" },
  "University of Alaska Fairbanks": { lat: 64.857, lng: -147.8233, city: "Fairbanks", state: "AK", type: "Public" },
  "University of Arizona": { lat: 32.2319, lng: -110.9501, city: "Tucson", state: "AZ", type: "Public" },
  "University of Arkansas": { lat: 36.0686, lng: -94.1738, city: "Fayetteville", state: "AR", type: "Public" },
  "University of California Berkeley": { lat: 37.8719, lng: -122.2585, city: "Berkeley", state: "CA", type: "Public" },
  "University of California Davis": { lat: 38.5382, lng: -121.7617, city: "Davis", state: "CA", type: "Public" },
  "University of California Irvine": { lat: 33.6405, lng: -117.8443, city: "Irvine", state: "CA", type: "Public" },
  "University of California Los Angeles": { lat: 34.0689, lng: -118.4452, city: "Los Angeles", state: "CA", type: "Public" },
  "University of California Merced": { lat: 37.3651, lng: -120.4233, city: "Merced", state: "CA", type: "Public" },
  "University of California Riverside": { lat: 33.9737, lng: -117.3281, city: "Riverside", state: "CA", type: "Public" },
  "University of California San Diego": { lat: 32.8801, lng: -117.234, city: "La Jolla", state: "CA", type: "Public" },
  "University of California Santa Barbara": { lat: 34.4133, lng: -119.8489, city: "Santa Barbara", state: "CA", type: "Public" },
  "University of California Santa Cruz": { lat: 36.9914, lng: -122.0609, city: "Santa Cruz", state: "CA", type: "Public" },
  "University of California, Berkeley": { lat: 37.8719, lng: -122.2585, city: "Berkeley", state: "CA", type: "Public" },
  "University of California-Berkeley": { lat: 37.8719, lng: -122.2585, city: "Berkeley", state: "CA", type: "Public" },
  "University of California-Davis": { lat: 38.5382, lng: -121.7617, city: "Davis", state: "CA", type: "Public" },
  "University of California-Irvine": { lat: 33.6405, lng: -117.8443, city: "Irvine", state: "CA", type: "Public" },
  "University of California-Los Angeles": { lat: 34.0689, lng: -118.4452, city: "Los Angeles", state: "CA", type: "Public" },
  "University of California-Riverside": { lat: 33.9737, lng: -117.3281, city: "Riverside", state: "CA", type: "Public" },
  "University of California-San Diego": { lat: 32.8801, lng: -117.234, city: "La Jolla", state: "CA", type: "Public" },
  "University of California-Santa Barbara": { lat: 34.4133, lng: -119.8489, city: "Santa Barbara", state: "CA", type: "Public" },
  "University of California-Santa Cruz": { lat: 36.9914, lng: -122.0609, city: "Santa Cruz", state: "CA", type: "Public" },
  "University of Central Florida": { lat: 28.6024, lng: -81.2001, city: "Orlando", state: "FL", type: "Public" },
  "University of Chicago": { lat: 41.7886, lng: -87.5987, city: "Chicago", state: "IL", type: "Private" },
  "University of Cincinnati": { lat: 39.1329, lng: -84.515, city: "Cincinnati", state: "OH", type: "Public" },
  "University of Colorado Boulder": { lat: 40.0076, lng: -105.2659, city: "Boulder", state: "CO", type: "Public" },
  "University of Colorado Denver": { lat: 39.7434, lng: -104.9967, city: "Denver", state: "CO", type: "Public" },
  "University of Connecticut": { lat: 41.8077, lng: -72.2540, city: "Storrs", state: "CT", type: "Public" },
  "University of Dayton": { lat: 39.7404, lng: -84.1798, city: "Dayton", state: "OH", type: "Private" },
  "University of Delaware": { lat: 39.6781, lng: -75.7522, city: "Newark", state: "DE", type: "Public" },
  "University of Denver": { lat: 39.6766, lng: -104.9619, city: "Denver", state: "CO", type: "Private" },
  "University of Florida": { lat: 29.6436, lng: -82.3549, city: "Gainesville", state: "FL", type: "Public" },
  "University of Georgia": { lat: 33.948, lng: -83.3773, city: "Athens", state: "GA", type: "Public" },
  "University of Hawaii at Manoa": { lat: 21.2969, lng: -157.8163, city: "Honolulu", state: "HI", type: "Public" },
  "University of Houston": { lat: 29.7199, lng: -95.3422, city: "Houston", state: "TX", type: "Public" },
  "University of Idaho": { lat: 46.7298, lng: -117.0156, city: "Moscow", state: "ID", type: "Public" },
  "University of Illinois at Chicago": { lat: 41.8708, lng: -87.6505, city: "Chicago", state: "IL", type: "Public" },
  "University of Illinois Chicago": { lat: 41.8708, lng: -87.6505, city: "Chicago", state: "IL", type: "Public" },
  "University of Illinois Urbana-Champaign": { lat: 40.1019, lng: -88.2272, city: "Urbana", state: "IL", type: "Public" },
  "University of Illinois at Urbana-Champaign": { lat: 40.1019, lng: -88.2272, city: "Urbana", state: "IL", type: "Public" },
  "University of Iowa": { lat: 41.6611, lng: -91.5302, city: "Iowa City", state: "IA", type: "Public" },
  "University of Kansas": { lat: 38.9543, lng: -95.2558, city: "Lawrence", state: "KS", type: "Public" },
  "University of Kentucky": { lat: 38.0309, lng: -84.5037, city: "Lexington", state: "KY", type: "Public" },
  "University of Louisiana at Lafayette": { lat: 30.2138, lng: -92.0193, city: "Lafayette", state: "LA", type: "Public" },
  "University of Louisville": { lat: 38.2127, lng: -85.7585, city: "Louisville", state: "KY", type: "Public" },
  "University of Maine": { lat: 44.8983, lng: -68.6717, city: "Orono", state: "ME", type: "Public" },
  "University of Maryland": { lat: 38.9869, lng: -76.9426, city: "College Park", state: "MD", type: "Public" },
  "University of Maryland Baltimore County": { lat: 39.2546, lng: -76.7115, city: "Baltimore", state: "MD", type: "Public" },
  "University of Maryland, Baltimore County": { lat: 39.2546, lng: -76.7115, city: "Baltimore", state: "MD", type: "Public" },
  "University of Massachusetts Amherst": { lat: 42.3868, lng: -72.5301, city: "Amherst", state: "MA", type: "Public" },
  "University of Massachusetts Boston": { lat: 42.3138, lng: -71.0382, city: "Boston", state: "MA", type: "Public" },
  "University of Massachusetts Lowell": { lat: 42.6549, lng: -71.3253, city: "Lowell", state: "MA", type: "Public" },
  "University of Memphis": { lat: 35.1188, lng: -89.9367, city: "Memphis", state: "TN", type: "Public" },
  "University of Miami": { lat: 25.7211, lng: -80.2799, city: "Coral Gables", state: "FL", type: "Private" },
  "University of Michigan": { lat: 42.2732, lng: -83.7384, city: "Ann Arbor", state: "MI", type: "Public" },
  "University of Minnesota": { lat: 44.974, lng: -93.2277, city: "Minneapolis", state: "MN", type: "Public" },
  "University of Mississippi": { lat: 34.3647, lng: -89.537, city: "University", state: "MS", type: "Public" },
  "University of Missouri": { lat: 38.9404, lng: -92.3277, city: "Columbia", state: "MO", type: "Public" },
  "University of Nebraska": { lat: 40.8202, lng: -96.7005, city: "Lincoln", state: "NE", type: "Public" },
  "University of Nebraska-Lincoln": { lat: 40.8202, lng: -96.7005, city: "Lincoln", state: "NE", type: "Public" },
  "University of Nevada, Las Vegas": { lat: 36.1078, lng: -115.143, city: "Las Vegas", state: "NV", type: "Public" },
  "University of Nevada, Reno": { lat: 39.5419, lng: -119.8156, city: "Reno", state: "NV", type: "Public" },
  "University of New Hampshire": { lat: 43.1349, lng: -70.9341, city: "Durham", state: "NH", type: "Public" },
  "University of New Mexico": { lat: 35.0844, lng: -106.6198, city: "Albuquerque", state: "NM", type: "Public" },
  "University of North Carolina": { lat: 35.9049, lng: -79.0469, city: "Chapel Hill", state: "NC", type: "Public" },
  "University of North Carolina at Chapel Hill": { lat: 35.9049, lng: -79.0469, city: "Chapel Hill", state: "NC", type: "Public" },
  "University of North Carolina at Charlotte": { lat: 35.3071, lng: -80.7349, city: "Charlotte", state: "NC", type: "Public" },
  "University of North Dakota": { lat: 47.9216, lng: -97.0731, city: "Grand Forks", state: "ND", type: "Public" },
  "University of North Texas": { lat: 33.2098, lng: -97.1485, city: "Denton", state: "TX", type: "Public" },
  "University of Notre Dame": { lat: 41.7002, lng: -86.2379, city: "Notre Dame", state: "IN", type: "Private" },
  "University of Oklahoma": { lat: 35.2058, lng: -97.4457, city: "Norman", state: "OK", type: "Public" },
  "University of Oregon": { lat: 44.0448, lng: -123.0726, city: "Eugene", state: "OR", type: "Public" },
  "University of Pennsylvania": { lat: 39.9522, lng: -75.1932, city: "Philadelphia", state: "PA", type: "Private" },
  "University of Pittsburgh": { lat: 40.4444, lng: -79.9608, city: "Pittsburgh", state: "PA", type: "Public" },
  "University of Rhode Island": { lat: 41.4807, lng: -71.531, city: "Kingston", state: "RI", type: "Public" },
  "University of Rochester": { lat: 43.1289, lng: -77.6289, city: "Rochester", state: "NY", type: "Private" },
  "University of San Diego": { lat: 32.7716, lng: -117.1893, city: "San Diego", state: "CA", type: "Private" },
  "University of South Carolina": { lat: 33.994, lng: -81.0274, city: "Columbia", state: "SC", type: "Public" },
  "University of South Florida": { lat: 28.0587, lng: -82.4139, city: "Tampa", state: "FL", type: "Public" },
  "University of Southern California": { lat: 34.0224, lng: -118.2851, city: "Los Angeles", state: "CA", type: "Private" },
  "University of Southern Mississippi": { lat: 31.3294, lng: -89.3367, city: "Hattiesburg", state: "MS", type: "Public" },
  "University of Tennessee": { lat: 35.9544, lng: -83.9295, city: "Knoxville", state: "TN", type: "Public" },
  "University of Texas at Arlington": { lat: 32.7299, lng: -97.1140, city: "Arlington", state: "TX", type: "Public" },
  "University of Texas at Austin": { lat: 30.2849, lng: -97.7341, city: "Austin", state: "TX", type: "Public" },
  "University of Texas at Dallas": { lat: 32.9858, lng: -96.7501, city: "Richardson", state: "TX", type: "Public" },
  "University of Texas at El Paso": { lat: 31.7688, lng: -106.5076, city: "El Paso", state: "TX", type: "Public" },
  "University of Texas at San Antonio": { lat: 29.5832, lng: -98.6203, city: "San Antonio", state: "TX", type: "Public" },
  "University of Toledo": { lat: 41.6587, lng: -83.6131, city: "Toledo", state: "OH", type: "Public" },
  "University of Tulsa": { lat: 36.1517, lng: -95.945, city: "Tulsa", state: "OK", type: "Private" },
  "University of Utah": { lat: 40.7649, lng: -111.8421, city: "Salt Lake City", state: "UT", type: "Public" },
  "University of Vermont": { lat: 44.4779, lng: -73.1953, city: "Burlington", state: "VT", type: "Public" },
  "University of Virginia": { lat: 38.0336, lng: -78.508, city: "Charlottesville", state: "VA", type: "Public" },
  "University of Washington": { lat: 47.6553, lng: -122.3035, city: "Seattle", state: "WA", type: "Public" },
  "University of Wisconsin": { lat: 43.0766, lng: -89.4125, city: "Madison", state: "WI", type: "Public" },
  "University of Wisconsin-Madison": { lat: 43.0766, lng: -89.4125, city: "Madison", state: "WI", type: "Public" },
  "University of Wisconsin-Milwaukee": { lat: 43.0788, lng: -87.8819, city: "Milwaukee", state: "WI", type: "Public" },
  "University of Wyoming": { lat: 41.3149, lng: -105.5666, city: "Laramie", state: "WY", type: "Public" },
  "Utah State University": { lat: 41.7456, lng: -111.8104, city: "Logan", state: "UT", type: "Public" },
  "Vanderbilt University": { lat: 36.1447, lng: -86.8027, city: "Nashville", state: "TN", type: "Private" },
  "Villanova University": { lat: 40.0376, lng: -75.3416, city: "Villanova", state: "PA", type: "Private" },
  "Virginia Commonwealth University": { lat: 37.5481, lng: -77.4519, city: "Richmond", state: "VA", type: "Public" },
  "Virginia Polytechnic Institute and State University": { lat: 37.2284, lng: -80.4234, city: "Blacksburg", state: "VA", type: "Public" },
  "Virginia Tech": { lat: 37.2284, lng: -80.4234, city: "Blacksburg", state: "VA", type: "Public" },
  "Wake Forest University": { lat: 36.1351, lng: -80.2782, city: "Winston-Salem", state: "NC", type: "Private" },
  "Washington State University": { lat: 46.7319, lng: -117.1542, city: "Pullman", state: "WA", type: "Public" },
  "Washington University in St. Louis": { lat: 38.6488, lng: -90.3108, city: "St. Louis", state: "MO", type: "Private" },
  "Wayne State University": { lat: 42.3578, lng: -83.0701, city: "Detroit", state: "MI", type: "Public" },
  "West Virginia University": { lat: 39.6473, lng: -79.9700, city: "Morgantown", state: "WV", type: "Public" },
  "Western Michigan University": { lat: 42.2829, lng: -85.6147, city: "Kalamazoo", state: "MI", type: "Public" },
  "Wichita State University": { lat: 37.7186, lng: -97.293, city: "Wichita", state: "KS", type: "Public" },
  "William & Mary": { lat: 37.2710, lng: -76.7080, city: "Williamsburg", state: "VA", type: "Public" },
  "Worcester Polytechnic Institute": { lat: 42.2746, lng: -71.8063, city: "Worcester", state: "MA", type: "Private" },
  "Wright State University": { lat: 39.7806, lng: -84.0625, city: "Dayton", state: "OH", type: "Public" },
  "Yale University": { lat: 41.3115, lng: -72.926, city: "New Haven", state: "CT", type: "Private" },
  "Indiana University Indianapolis": { lat: 39.7726, lng: -86.1764, city: "Indianapolis", state: "IN", type: "Public" },
  "Indiana University Bloomington": { lat: 39.1653, lng: -86.5264, city: "Bloomington", state: "IN", type: "Public" },
  "University of Nebraska Lincoln": { lat: 40.8202, lng: -96.7005, city: "Lincoln", state: "NE", type: "Public" },
  "University of Nevada Las Vegas": { lat: 36.1078, lng: -115.143, city: "Las Vegas", state: "NV", type: "Public" },
  "University of Nevada Reno": { lat: 39.5419, lng: -119.8156, city: "Reno", state: "NV", type: "Public" },
  "Boise State University": { lat: 43.6034, lng: -116.2003, city: "Boise", state: "ID", type: "Public" },
  "University of Maryland College Park": { lat: 38.9869, lng: -76.9426, city: "College Park", state: "MD", type: "Public" },
  "University of Minnesota Twin Cities": { lat: 44.974, lng: -93.2277, city: "Minneapolis", state: "MN", type: "Public" },
  "University of Wisconsin Madison": { lat: 43.0766, lng: -89.4125, city: "Madison", state: "WI", type: "Public" },
};

function geoFor(university, school) {
  // try fullname combos used in existing schools.ts
  const candidates = [
    `${university} – ${school}`,
    `${university} - ${school}`,
  ];
  for (const c of candidates) if (FULLNAME_GEO.has(c)) return FULLNAME_GEO.get(c);
  if (UNIV_GEO.has(university)) return UNIV_GEO.get(university);
  if (R1_GEO[university]) return R1_GEO[university];
  // fuzzy fallback: strip trailing words
  const norm = university.replace(/^The\s+/, "").trim();
  if (R1_GEO[norm]) return R1_GEO[norm];
  return null;
}

// --- Helpers ---
function bool(v) {
  if (v == null || v === "") return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "yes" || s === "true" || s === "y";
}
function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
function str(v) {
  if (v == null) return "";
  return String(v);
}
function nullStr(v) {
  if (v == null || v === "") return null;
  return String(v);
}

function deriveEra(year) {
  if (!year) return "Unknown";
  if (year < 1980) return "Pre-1980";
  if (year < 1990) return "1980s";
  if (year < 2000) return "1990s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  return "2020s";
}

function nextRoleNorm(v) {
  if (!v || v === "") return "Unknown";
  const s = String(v).trim();
  // map to existing key vocabulary used in app
  const lower = s.toLowerCase();
  if (lower.includes("emeritus") || lower.includes("faculty")) return "Faculty_emeritus";
  if (lower.includes("dean")) return "Another_deanship";
  if (lower.includes("retire")) return "Full_retirement";
  if (lower.includes("provost") || lower.includes("president") || lower.includes("chancellor")) return "Provost_president_chancellor";
  if (lower.includes("industry") || lower.includes("nonprofit") || lower.includes("govt") || lower.includes("government")) return "Industry_nonprofit_govt";
  if (lower.includes("still")) return "Still_serving";
  if (lower.includes("decease")) return "Deceased";
  return s.replace(/\s+/g, "_");
}

// --- Build B-School deans ---
function buildBSchool() {
  const deans = [];
  let id = 1;
  const schoolsMap = new Map(); // key -> info for schools-info
  const bsqMap = new Map(); // key -> bsq merged
  const seen = new Set();
  for (const r of bsRows) {
    if (bool(r.is_duplicate_row)) continue;
    const university = str(r.university_name).trim();
    const school = str(r.business_school_name).trim();
    if (!university || !school) continue;
    const dean = str(r.dean_name).trim();
    const startYear = num(r.appointment_start_year);
    const endYear = num(r.appointment_end_year);
    const dedupKey = `${university}|||${school}|||${dean}|||${startYear}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const rank = num(r.usnews_rank_2025);
    const tier = str(r.tier) || "Unranked";
    const apptOrigin4 = str(r.origin_category_v2 || r.origin_category).toLowerCase().replace(/[\s-]/g, "_") || "external";
    const isInterim = bool(r.is_interim);
    const isInternal = bool(r.is_internal);
    const isExternal = bool(r.is_external);
    let originV2;
    if (isInterim && isInternal) originV2 = "nonconverted_interim";
    else if (isInterim) originV2 = "nonconverted_interim";
    else if (isInternal) originV2 = "internal_perm";
    else originV2 = "external";

    deans.push({
      id: id++,
      university,
      school,
      dean,
      startYear,
      endYear,
      startLabel: str(r.appointment_start_month_year || startYear || ""),
      endLabel: str(r.appointment_end_month_year || endYear || ""),
      priorTitle: str(r.prior_position_title),
      priorInstitution: str(r.prior_institution),
      origin: str(r.origin_category) || "Unknown",
      originV2: str(r.origin_category_v2) || str(r.origin_category) || "Unknown",
      apptOrigin4,
      isInternal,
      isExternal,
      isInterim,
      careerBackground: str(r.career_background) || "Unknown",
      hasIndustryExp: bool(r.has_industry_exp),
      gender: str(r.gender) || "Unknown",
      isFemale: bool(r.is_female),
      isFirstTimeDean: bool(r.is_first_time_dean),
      discipline: str(r.discipline) || "Unknown",
      disciplineBroad: str(r.discipline_broad) || "Unknown",
      phdField: str(r.phd_field) || "Unknown",
      hasPriorDeanExp: bool(r.has_prior_dean_exp),
      priorAssocOrAsstDean: bool(r.prior_assoc_or_asst_dean),
      hadAssocDeanRole: bool(r.had_assoc_dean_role),
      hadDeptChairRole: bool(r.had_dept_chair_role),
      hasConsultingBg: bool(r.has_consulting_bg),
      hasPhd: bool(r.has_phd),
      rank,
      tier,
      inTop50: bool(r.in_top50_sample),
      inTop100: bool(r.in_top100_sample),
      fromEliteInstitution: bool(r.from_elite_institution),
      priorInstitutionElite: bool(r.prior_institution_elite),
      tenureLength: num(r.tenure_length),
      era: str(r.appointment_era) || deriveEra(startYear),
      notes: str(r.notes),
      nextRole: nextRoleNorm(r.next_role),
      nextRoleCode: num(r.next_role_code),
      involuntary: bool(r.involuntary),
      hadPriorConnection: bool(r.had_prior_connection),
      hasInstitutionalLink: bool(r.has_any_institutional_link),
      fromSameUniversityDiffSchool: bool(r.from_same_university_diff_school),
      surpriseDeparture: bool(r.surprise_departure),
      surpriseEvidence: str(r.surprise_evidence),
      sourceUrl: str(r.source_url),
      enrollmentEnd: num(r.enrollment_end),
      enrollmentAvg: num(r.enrollment_avg),
      businessPctEnd: num(r.business_pct_end),
      businessDegreesLatest: num(r.business_degrees_latest),
      convertedToPermanent: false,
      connectionType: str(r.connection_type),
    });

    // Build BSQ map (merge across rows)
    const skey = `${university}|||${school}`;
    if (!bsqMap.has(skey)) {
      bsqMap.set(skey, {
        university, school,
        rank,
        tier,
        unitid: num(r.unitid),
        control: nullStr(r.BSQ_Institutional_Control),
        bsq: {},
      });
    }
    const bsq = bsqMap.get(skey).bsq;
    // Map BSQ_* columns to short keys
    const bsqMappings = [
      ["BSQ_Institution_Total_Enrollment", "instTotal"],
      ["BSQ_Institution_UG_Enrollment", "instUG"],
      ["BSQ_Institution_Masters_Enrollment", "instMasters"],
      ["BSQ_Institution_Doctoral_Enrollment", "instDoctoral"],
      ["BSQ_BizSchool_Total_Headcount", "totalHeadcount"],
      ["BSQ_UG_Total_Enrollment", "ugTotal"],
      ["BSQ_UG_FT_Enrollment", "ugFT"],
      ["BSQ_UG_PT_Enrollment", "ugPT"],
      ["BSQ_UG_Enrollment_Male", "ugMale"],
      ["BSQ_UG_Enrollment_Female", "ugFemale"],
      ["BSQ_UG_Male_Female_Ratio", "ugMaleFemaleRatio"],
      ["BSQ_UG_Applicants", "ugApplicants"],
      ["BSQ_UG_Admitted", "ugAdmitted"],
      ["BSQ_UG_Entrants", "ugEntrants"],
      ["BSQ_UG_Yield_Pct", "ugYieldPct"],
      ["BSQ_UG_Pct_Applicants_Entering", "ugPctApplicantsEntering"],
      ["BSQ_UG_Avg_SAT", "ugAvgSAT"],
      ["BSQ_UG_Avg_ACT", "ugAvgACT"],
      ["BSQ_UG_Degrees_Total", "ugDegreesTotal"],
      ["BSQ_UG_Degrees_Male", "ugDegreesMale"],
      ["BSQ_UG_Degrees_Female", "ugDegreesFemale"],
      ["BSQ_UG_Degrees_Accounting", "ugDegreesAccounting"],
      ["BSQ_UG_Degrees_Finance", "ugDegreesFinance"],
      ["BSQ_UG_Degrees_Marketing", "ugDegreesMarketing"],
      ["BSQ_UG_Degrees_Management", "ugDegreesManagement"],
      ["BSQ_UG_Degrees_Economics", "ugDegreesEconomics"],
      ["BSQ_UG_Degrees_DataAnalytics", "ugDegreesDataAnalytics"],
      ["BSQ_UG_Degrees_CIS_MIS", "ugDegreesCIS"],
      ["BSQ_MBA_Total_Enrollment", "mbaTotal"],
      ["BSQ_MBA_FT_Enrollment", "mbaFT"],
      ["BSQ_MBA_PT_Enrollment", "mbaPT"],
      ["BSQ_MBA_Degrees_Total", "mbaDegrees"],
      ["BSQ_MBA_Enrollment_Male", "mbaMale"],
      ["BSQ_MBA_Enrollment_Female", "mbaFemale"],
      ["BSQ_Mean_Class_Size_UG", "meanClassSizeUG"],
      ["BSQ_Mean_Class_Size_Masters", "meanClassSizeMasters"],
      ["BSQ_Median_Class_Size_UG", "medianClassSizeUG"],
      ["BSQ_N_Courses_UG", "nCoursesUG"],
      ["BSQ_N_Courses_Masters", "nCoursesMasters"],
      ["BSQ_Student_Faculty_Ratio", "studentFacultyRatio"],
      ["BSQ_UG_Mean_Salary", "ugMeanSalary"],
      ["BSQ_UG_Median_Salary", "ugMedianSalary"],
      ["BSQ_UG_Employed_By_Graduation", "ugEmployedByGrad"],
      ["BSQ_UG_Employed_By_3Mo", "ugEmployedBy3Mo"],
    ];
    for (const [src, dst] of bsqMappings) {
      const v_end = num(r[`${src}_end`]);
      const v_start = num(r[`${src}_start`]);
      const v_avg = num(r[`${src}_avg`]);
      if (v_end != null && bsq[dst] == null) bsq[dst] = v_end;
      if (v_start != null && bsq[`${dst}Start`] == null) bsq[`${dst}Start`] = v_start;
      if (v_avg != null && bsq[`${dst}Avg`] == null) bsq[`${dst}Avg`] = v_avg;
    }
    if (r.BSQ_Institutional_Control && bsq.institutionalControl == null) {
      bsq.institutionalControl = String(r.BSQ_Institutional_Control);
    }

    // Build school-info entry
    if (!schoolsMap.has(skey)) {
      const geo = geoFor(university, school);
      const headcount = num(r.BSQ_BizSchool_Total_Headcount_end) || num(r.BSQ_BizSchool_Total_Headcount_avg) || num(r.BSQ_BizSchool_Total_Headcount_start);
      const ratio = num(r.BSQ_Student_Faculty_Ratio_end) || num(r.BSQ_Student_Faculty_Ratio_avg) || num(r.BSQ_Student_Faculty_Ratio_start);
      const totalFaculty = headcount && ratio ? Math.round(headcount / ratio) : 50;
      schoolsMap.set(skey, {
        university, school,
        rank: rank,
        fullName: `${university} – ${school}`,
        shortName: school.length > 25 ? school.slice(0, 22) + "..." : school,
        type: nullStr(r.BSQ_Institutional_Control)?.toLowerCase().includes("private") ? "Private" : (geo?.type || "Public"),
        totalFaculty: Math.max(32, Math.min(314, totalFaculty)),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        city: geo?.city ?? "",
        state: geo?.state ?? "",
      });
    }
  }
  return {
    deans,
    bsq: Array.from(bsqMap.values()),
    schoolsInfo: Array.from(schoolsMap.values()),
  };
}

// --- Build E-School ---
function buildESchool() {
  const deans = [];
  let id = 1;
  const schoolsMap = new Map();
  const researchMap = new Map();
  const seen = new Set();
  for (const r of esRows) {
    const university = str(r.university_name).trim();
    const school = str(r.engineering_school_name).trim();
    if (!university || !school) continue;
    const dean = str(r.dean_name).trim();
    const startYear = num(r.appointment_start_year);
    const dedupKey = `${university}|||${school}|||${dean}|||${startYear}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const rank = num(r.usnews_engr_rank_2025);
    const tier = str(r.tier) || (rank == null ? "Unranked" : rank <= 25 ? "T1 (1-25)" : rank <= 50 ? "T2 (26-50)" : rank <= 75 ? "T3 (51-75)" : "T4 (76+)");
    const apptOrigin4 = str(r.appt_origin_4) || str(r.origin_category).toLowerCase().replace(/[\s-]/g, "_") || "external";
    const isInterim = bool(r.is_interim);
    const isInternal = bool(r.is_internal);
    const isExternal = bool(r.is_external);

    deans.push({
      id: id++,
      university,
      school,
      dean,
      startYear,
      endYear: num(r.appointment_end_year),
      startLabel: str(r.appointment_start_month_year || startYear || ""),
      endLabel: str(r.appointment_end_month_year || r.appointment_end_year || ""),
      priorTitle: str(r.prior_position_title),
      priorInstitution: str(r.prior_institution),
      origin: str(r.origin_category) || "Unknown",
      originV2: str(r.origin_category) || "Unknown",
      apptOrigin4,
      isInternal,
      isExternal,
      isInterim,
      careerBackground: str(r.career_background) || "Unknown",
      hasIndustryExp: bool(r.has_industry_exp),
      gender: str(r.gender) || "Unknown",
      isFemale: bool(r.is_female),
      isFirstTimeDean: bool(r.is_first_time_dean),
      discipline: str(r.discipline) || "Unknown",
      disciplineBroad: str(r.discipline_broad) || "Unknown",
      phdField: str(r.phd_field) || "Unknown",
      hasPriorDeanExp: bool(r.has_prior_dean_exp),
      priorAssocOrAsstDean: bool(r.prior_assoc_or_asst_dean),
      hadAssocDeanRole: bool(r.had_assoc_dean_role),
      hadDeptChairRole: bool(r.had_dept_chair_role),
      hasConsultingBg: false,
      hasPhd: bool(r.has_phd),
      rank,
      tier,
      inTop50: rank != null && rank <= 50,
      inTop100: rank != null && rank <= 100,
      fromEliteInstitution: bool(r.from_elite_institution),
      priorInstitutionElite: bool(r.prior_institution_elite),
      tenureLength: num(r.tenure_length),
      era: str(r.appointment_era) || deriveEra(startYear),
      notes: str(r.notes),
      nextRole: nextRoleNorm(r.next_role),
      nextRoleCode: num(r.next_role_code),
      involuntary: bool(r.involuntary),
      hadPriorConnection: false,
      hasInstitutionalLink: false,
      fromSameUniversityDiffSchool: false,
      surpriseDeparture: bool(r.surprise_departure),
      surpriseEvidence: "",
      sourceUrl: str(r.source_url),
      enrollmentEnd: num(r.IPEDS_Institution_Total_Enrollment_end),
      enrollmentAvg: num(r.IPEDS_Institution_Total_Enrollment_avg),
      businessPctEnd: null,
      businessDegreesLatest: num(r.IPEDS_Engr_UG_Degrees_Total_end),
      convertedToPermanent: bool(r.converted_to_permanent),
      connectionType: "",
    });

    const skey = `${university}|||${school}`;
    if (!researchMap.has(skey)) {
      researchMap.set(skey, {
        university, school, rank, tier,
        unitid: num(r.unitid),
        control: nullStr(r.control),
        bsq: {},
      });
    }
    const bsq = researchMap.get(skey).bsq;
    const eMappings = [
      ["HERD_Engr_Total_RD", "herdEngrTotal"],
      ["HERD_Engr_Federal_RD", "herdEngrFederal"],
      ["HERD_Engr_Industry_RD", "herdEngrIndustry"],
      ["HERD_Engr_State_RD", "herdEngrState"],
      ["HERD_CS_Total_RD", "herdCSTotal"],
      ["IPEDS_Engr_UG_Degrees_Total", "engrUGDegrees"],
      ["IPEDS_Engr_Masters_Degrees", "engrMastersDegrees"],
      ["IPEDS_Engr_Doctoral_Degrees", "engrDoctoralDegrees"],
      ["IPEDS_Engr_Faculty_Total", "engrFaculty"],
      ["IPEDS_Institution_Total_Enrollment", "instTotal"],
      ["IPEDS_Institution_RD_Total", "instRD"],
    ];
    for (const [src, dst] of eMappings) {
      const v_end = num(r[`${src}_end`]);
      const v_start = num(r[`${src}_start`]);
      const v_avg = num(r[`${src}_avg`]);
      if (v_end != null && bsq[dst] == null) bsq[dst] = v_end;
      if (v_start != null && bsq[`${dst}Start`] == null) bsq[`${dst}Start`] = v_start;
      if (v_avg != null && bsq[`${dst}Avg`] == null) bsq[`${dst}Avg`] = v_avg;
    }

    if (!schoolsMap.has(skey)) {
      const geo = geoFor(university, school);
      const faculty = num(r.IPEDS_Engr_Faculty_Total_end) || num(r.IPEDS_Engr_Faculty_Total_avg) || num(r.IPEDS_Engr_Faculty_Total_start);
      schoolsMap.set(skey, {
        university, school,
        rank,
        fullName: `${university} – ${school}`,
        shortName: school.length > 25 ? school.slice(0, 22) + "..." : school,
        type: nullStr(r.control) || geo?.type || "Public",
        totalFaculty: Math.max(32, Math.min(400, faculty || 50)),
        lat: geo?.lat ?? null,
        lng: geo?.lng ?? null,
        city: geo?.city ?? "",
        state: geo?.state ?? "",
      });
    }
  }
  return {
    deans,
    bsq: Array.from(researchMap.values()),
    schoolsInfo: Array.from(schoolsMap.values()),
  };
}

const bs = buildBSchool();
const es = buildESchool();

writeFileSync(resolve(OUT_DIR, "r1-bschool-deans.json"), JSON.stringify(bs.deans, null, 2));
writeFileSync(resolve(OUT_DIR, "r1-bschool-bsq.json"), JSON.stringify(bs.bsq, null, 2));
writeFileSync(resolve(OUT_DIR, "r1-bschool-schools.json"), JSON.stringify(bs.schoolsInfo, null, 2));
writeFileSync(resolve(OUT_DIR, "r1-eschool-deans.json"), JSON.stringify(es.deans, null, 2));
writeFileSync(resolve(OUT_DIR, "r1-eschool-research.json"), JSON.stringify(es.bsq, null, 2));
writeFileSync(resolve(OUT_DIR, "r1-eschool-schools.json"), JSON.stringify(es.schoolsInfo, null, 2));

const bsWithGeo = bs.schoolsInfo.filter(s => s.lat != null).length;
const esWithGeo = es.schoolsInfo.filter(s => s.lat != null).length;
console.log(`B-School: ${bs.deans.length} deans, ${bs.schoolsInfo.length} schools (${bsWithGeo} with geo), ${bs.bsq.length} BSQ entries`);
console.log(`E-School: ${es.deans.length} deans, ${es.schoolsInfo.length} schools (${esWithGeo} with geo), ${es.bsq.length} research entries`);
const bsMissing = bs.schoolsInfo.filter(s => s.lat == null).map(s => s.university);
const esMissing = es.schoolsInfo.filter(s => s.lat == null).map(s => s.university);
if (bsMissing.length) console.log("B-School missing geo:", [...new Set(bsMissing)]);
if (esMissing.length) console.log("E-School missing geo:", [...new Set(esMissing)]);
