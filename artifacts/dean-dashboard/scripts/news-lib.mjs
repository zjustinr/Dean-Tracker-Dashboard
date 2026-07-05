/**
 * Shared helpers for the dean news scout + confirm resolver:
 * applying appointment/closure events to the v7 Excel and Top-100 deans.json,
 * and maintaining the app's breaking-news feed.
 */
import XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../../..");
export const XLSX_PATH = resolve(ROOT, "attached_assets/Dean_Data_Collection_R1_v7_verified.xlsx");
export const DEANS_JSON = resolve(__dirname, "../src/data/deans.json");
export const BREAKING_JSON = resolve(__dirname, "../src/data/breaking-news.json");
export const LOG_PATH = resolve(ROOT, "attached_assets/news_scout_log.csv");

export const today = () => new Date().toISOString().slice(0, 10);
export const monthLabel = (d) =>
  `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]}-${String(d.getFullYear()).slice(2)}`;
export const lastName = (n) =>
  String(n).split(/\s+/).filter((t) => !["Jr.","Jr","Sr.","II","III"].includes(t)).pop()?.toLowerCase() || "";

export function logCSV(rows) {
  if (!rows.length) return;
  if (!existsSync(LOG_PATH)) appendFileSync(LOG_PATH, "date,action,university,dean,event,confidence,url\n");
  appendFileSync(LOG_PATH, rows.map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n") + "\n");
}

/** Apply an appointment to Excel + deans.json. Returns "added" | "duplicate". */
export function applyAppointment(e) {
  // e: {university, school, dean, interim, date (Date), url, title}
  const yr = e.date.getFullYear();
  const ml = monthLabel(e.date);

  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["B-School"], { defval: null });
  const cols = Object.keys(rows[0]);
  const schoolRows = rows.filter((r) => r.university_name === e.university);
  if (schoolRows.some((r) => r.dean_name && lastName(r.dean_name) === lastName(e.dean) && Math.abs((r.appointment_start_year || 0) - yr) <= 1)) {
    return "duplicate";
  }
  const open = schoolRows.filter((r) => r.appointment_end_year == null || String(r.appointment_end_month_year).toLowerCase() === "present");
  if (open.length === 1) {
    open[0].appointment_end_year = yr;
    open[0].appointment_end_month_year = ml;
    open[0].correction_notes = `${open[0].correction_notes || ""} [news-scout ${today()}: tenure closed, successor ${e.dean} announced, ${e.url}]`.trim();
  }
  const newRow = Object.fromEntries(cols.map((c) => [c, null]));
  Object.assign(newRow, {
    university_name: e.university,
    business_school_name: e.school || schoolRows[0]?.business_school_name || null,
    dean_name: e.dean,
    appointment_start_month_year: ml,
    appointment_start_year: yr,
    appointment_end_month_year: "Present",
    is_interim: e.interim ? 1 : 0,
    origin_category: e.interim ? "Interim-Internal" : "Unknown",
    source_url: e.url,
    notes: `Added automatically from news: ${e.title}`,
    correction_notes: `ADDED by news-scout ${today()} (${e.url}); origin/discipline pending review`,
    verification_sweep_2026: "news-scout",
  });
  rows.push(newRow);
  wb.Sheets["B-School"] = XLSX.utils.json_to_sheet(rows, { header: cols });
  XLSX.writeFile(wb, XLSX_PATH);

  const deans = JSON.parse(readFileSync(DEANS_JSON, "utf8"));
  const sibs = deans.filter((d) => d.university.toLowerCase() === e.university.toLowerCase());
  if (sibs.length && !sibs.some((d) => lastName(d.dean) === lastName(e.dean) && Math.abs((d.startYear || 0) - yr) <= 1)) {
    const openT = sibs.filter((d) => d.endYear == null);
    if (openT.length === 1) { openT[0].endYear = yr; openT[0].endLabel = ml; }
    const sib = sibs[0];
    deans.push({
      ...sib,
      id: Math.max(...deans.map((d) => d.id)) + 1,
      dean: e.dean, startYear: yr, endYear: null,
      startLabel: ml, endLabel: "Present",
      isInterim: !!e.interim, origin: e.interim ? "Interim-Internal" : "Unknown",
      originV2: e.interim ? "Interim-Internal" : "Unknown", apptOrigin4: e.interim ? "Interim-Internal" : "Unknown",
      isInternal: !!e.interim, isExternal: false,
      gender: "Unknown", isFemale: false,
      discipline: "", disciplineBroad: "Unknown", phdField: "",
      priorTitle: "", priorInstitution: "", tenureLength: null,
      notes: `Added automatically from news: ${e.title}`, sourceUrl: e.url,
      nextRole: "Still_serving", nextRoleCode: null,
      isFirstTimeDean: false, hasPriorDeanExp: false,
      surpriseDeparture: false, surpriseEvidence: "", involuntary: false,
      convertedToPermanent: false, connectionType: "", hadPriorConnection: false,
    });
    writeFileSync(DEANS_JSON, JSON.stringify(deans, null, 2));
  }
  return "added";
}

/** Close the sitting dean's open tenure at a university. Returns "closed" | "no_open_spell". */
export function closeTenure(e) {
  // e: {university, date (Date), url, title}
  const yr = e.date.getFullYear();
  const ml = monthLabel(e.date);
  const wb = XLSX.readFile(XLSX_PATH);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets["B-School"], { defval: null });
  const cols = Object.keys(rows[0]);
  const open = rows.filter((r) => r.university_name === e.university &&
    (r.appointment_end_year == null || String(r.appointment_end_month_year).toLowerCase() === "present"));
  if (open.length !== 1) return "no_open_spell";
  open[0].appointment_end_year = yr;
  open[0].appointment_end_month_year = ml;
  open[0].correction_notes = `${open[0].correction_notes || ""} [news-scout ${today()}: departure reported, ${e.url}]`.trim();
  wb.Sheets["B-School"] = XLSX.utils.json_to_sheet(rows, { header: cols });
  XLSX.writeFile(wb, XLSX_PATH);

  const deans = JSON.parse(readFileSync(DEANS_JSON, "utf8"));
  const openT = deans.filter((d) => d.university.toLowerCase() === e.university.toLowerCase() && d.endYear == null);
  if (openT.length === 1) {
    openT[0].endYear = yr;
    openT[0].endLabel = ml;
    writeFileSync(DEANS_JSON, JSON.stringify(deans, null, 2));
  }
  return "closed";
}

/** Load, prune (>30 days), and save the app's breaking-news feed. */
export function loadBreaking() {
  const data = existsSync(BREAKING_JSON) ? JSON.parse(readFileSync(BREAKING_JSON, "utf8")) : { updated: today(), items: [] };
  const cutoff = Date.now() - 30 * 86400e3;
  data.items = (data.items || []).filter((it) => new Date(it.date).getTime() >= cutoff);
  return data;
}
export function saveBreaking(data) {
  data.updated = today();
  writeFileSync(BREAKING_JSON, JSON.stringify(data, null, 2));
}
