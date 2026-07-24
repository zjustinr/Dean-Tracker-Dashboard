/**
 * Shared helpers for the dean news scout + confirm resolver:
 * applying appointment/closure events to the v7 Excel and Top-100 deans.json,
 * and maintaining the app's breaking-news feed.
 */
import XLSX from "xlsx";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "../../..");
export const DATA_DIR = resolve(__dirname, "../src/data");
export const XLSX_PATH = resolve(ROOT, "attached_assets/Dean_Data_Collection_R1_v7_verified.xlsx");
export const DEANS_JSON = resolve(__dirname, "../src/data/deans.json");
export const BREAKING_JSON = resolve(__dirname, "../src/data/breaking-news.json");
export const LOG_PATH = resolve(ROOT, "attached_assets/news_scout_log.csv");
export const ENRICH_QUEUE = resolve(ROOT, "attached_assets/enrichment_queue.json");

// schoolType (from the scout's dataset table) -> the app dataset it feeds.
// "business" is special: it flows through the Excel + Top-100 deans.json + a
// build step, so it keeps the legacy applyAppointment() path. Every other index
// is a standalone <deans> JSON that is itself the source of truth the app serves,
// so applyAppointmentGeneric() appends to it directly (no Excel, no build step).
export const TYPE_TO_DATASET = {
  business:     { id: "r1bschool",      deans: null,                        excel: true },
  engineering:  { id: "r1eschool",      deans: "r1-eschool-deans.json" },
  university:   { id: "r1university",   deans: "r1-university-deans.json" },
  medical:      { id: "r1medical",      deans: "r1-medschool-deans.json" },
  law:          { id: "r1law",          deans: "r1-lawschool-deans.json" },
  provost:      { id: "r1provost",      deans: "r1-provost-deans.json" },
  agriculture:  { id: "usag",           deans: "r1-agschool-deans.json" },
  nursing:      { id: "usnursing",      deans: "r1-nursing-deans.json" },
  pharmacy:     { id: "uspharmacy",     deans: "r1-pharmacy-deans.json" },
  education:    { id: "useducation",    deans: "r1-education-deans.json" },
  arts:         { id: "r1arts",         deans: "r1-arts-deans.json" },
  r2university: { id: "usr2", deans: "r1-r2public-deans.json" },
  publichealth: { id: "uspublichealth", deans: "r1-publichealth-deans.json" },
  veterinary:   { id: "usvet",          deans: "r1-vet-deans.json" },
};

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

export const JOBMARKET_JSON = resolve(__dirname, "../src/data/jobmarket.json");
const R1_SCHOOLS = resolve(__dirname, "../src/data/r1-bschool-schools.json");

/**
 * Keep the Dean News & Market openings board fresh:
 *  - kind "filled": a dean was appointed -> remove the open position(s) for that university
 *  - kind "search": a dean search was announced -> add/update an opening with a source URL
 * Returns "removed" | "added" | "updated" | "none".
 */
export function updateJobMarket(e) {
  const listings = existsSync(JOBMARKET_JSON) ? JSON.parse(readFileSync(JOBMARKET_JSON, "utf8")) : [];
  const uni = (e.university || "").toLowerCase();
  if (e.kind === "filled") {
    const before = listings.length;
    const kept = listings.filter((l) => l.university.toLowerCase() !== uni);
    if (kept.length === before) return "none";
    writeFileSync(JOBMARKET_JSON, JSON.stringify(kept, null, 2));
    return "removed";
  }
  if (e.kind === "search") {
    const existing = listings.find((l) => l.university.toLowerCase() === uni);
    if (existing) {
      existing.newsUrl = e.url || existing.newsUrl;
      existing.notes = e.title || existing.notes;
      existing.lastUpdated = today();
      writeFileSync(JOBMARKET_JSON, JSON.stringify(listings, null, 2));
      return "updated";
    }
    const geo = JSON.parse(readFileSync(R1_SCHOOLS, "utf8")).find((s) => s.university.toLowerCase() === uni);
    listings.push({
      id: Math.max(0, ...listings.map((l) => l.id)) + 1,
      university: e.university,
      school: e.school || geo?.school || null,
      notes: e.title || "Dean search announced",
      searchFirm: null,
      dateStarted: (e.date instanceof Date ? e.date : new Date(e.date)).toISOString().slice(0, 10),
      newsUrl: e.url || null,
      positionDescription: null,
      positionUrl: null,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      departingDean: null,
      reason: null,
      city: geo?.city ?? null,
      state: geo?.state ?? null,
      type: geo?.type ?? null,
      rank: geo?.rank ?? null,
      totalFaculty: geo?.totalFaculty ?? null,
      addedBy: "news-scout",
      lastUpdated: today(),
    });
    writeFileSync(JOBMARKET_JSON, JSON.stringify(listings, null, 2));
    return "added";
  }
  return "none";
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

// ---------------------------------------------------------------------------
// Generic apply (the 11 non-business indices) + enrichment queue + signed links
// ---------------------------------------------------------------------------

const decade = (yr) => `${Math.floor(yr / 10) * 10}s`;

/**
 * Append an appointment to a standalone leadership dataset (<index>-deans.json).
 * Copies a sibling record at the same university so school-level fields (rank,
 * tier, geo, school name) are inherited, then overrides the person + tenure
 * fields and marks everything person-specific as "pending enrichment" (blank /
 * Unknown), which the scheduled enrichment task later fills. Closes the one open
 * tenure at that university if there is exactly one.
 * Returns "added" | "duplicate" | "no_sibling".
 */
export function applyAppointmentGeneric(e, deansFile) {
  const yr = e.date.getFullYear();
  const ml = monthLabel(e.date);
  const path = resolve(DATA_DIR, deansFile);
  const deans = JSON.parse(readFileSync(path, "utf8"));
  const sibs = deans.filter((d) => (d.university || "").toLowerCase() === e.university.toLowerCase());
  if (!sibs.length) return "no_sibling"; // university not tracked in this dataset
  if (sibs.some((d) => lastName(d.dean) === lastName(e.dean) && Math.abs((d.startYear || 0) - yr) <= 1)) {
    return "duplicate";
  }
  // Prefer a sibling at the same school unit if the event named one.
  const unit = (e.school || "").toLowerCase();
  const sib = (unit && sibs.find((d) => (d.school || "").toLowerCase() === unit)) || sibs[0];

  const openT = sibs.filter((d) => d.endYear == null);
  if (openT.length === 1) { openT[0].endYear = yr; openT[0].endLabel = ml; }

  const id = Math.max(0, ...deans.map((d) => d.id || 0)) + 1;
  const rec = {
    ...sib,
    id,
    school: e.school || sib.school,
    dean: e.dean,
    startYear: yr, endYear: null, startLabel: ml, endLabel: "",
    priorTitle: "", priorInstitution: "",
    origin: e.interim ? "Interim-Internal" : "Unknown",
    originV2: e.interim ? "Interim-Internal" : "Unknown",
    apptOrigin4: e.interim ? "interim" : "unknown",
    isInternal: !!e.interim, isExternal: false, isInterim: !!e.interim,
    careerBackground: "", hasIndustryExp: false,
    gender: "Unknown", isFemale: false, isFirstTimeDean: false,
    discipline: "", disciplineBroad: "Unknown", phdField: "",
    hasPriorDeanExp: false, priorAssocOrAsstDean: false, hadAssocDeanRole: false,
    hadDeptChairRole: false, hasConsultingBg: false, hasPhd: false,
    fromEliteInstitution: false, priorInstitutionElite: false,
    tenureLength: null, era: decade(yr),
    notes: `Added automatically from news: ${e.title}`,
    nextRole: "Still_serving", nextRoleCode: null, involuntary: false,
    hadPriorConnection: false, hasInstitutionalLink: false, fromSameUniversityDiffSchool: false,
    surpriseDeparture: false, surpriseEvidence: "",
    sourceUrl: e.url, convertedToPermanent: false, connectionType: "",
  };
  deans.push(rec);
  writeFileSync(path, JSON.stringify(deans, null, 2));
  return "added";
}

/**
 * Route an appointment to the right apply path by schoolType. Business keeps the
 * Excel + Top-100 path; every other index appends to its standalone dataset.
 * Returns { status, id? } where id is the new record's id for generic datasets.
 */
export function applyEvent(e) {
  const target = TYPE_TO_DATASET[e.schoolType];
  if (!target) return { status: "no_dataset" };
  if (target.excel) return { status: applyAppointment(e), dataset: target.id };
  const status = applyAppointmentGeneric(e, target.deans);
  let id = null;
  if (status === "added") {
    const deans = JSON.parse(readFileSync(resolve(DATA_DIR, target.deans), "utf8"));
    const hit = deans.find((d) => lastName(d.dean) === lastName(e.dean) && d.endYear == null &&
      (d.university || "").toLowerCase() === e.university.toLowerCase());
    id = hit ? hit.id : null;
  }
  return { status, dataset: target.id, deansFile: target.deans, id };
}

/** Load / save the enrichment queue (new leaders awaiting research). */
export function loadEnrichQueue() {
  return existsSync(ENRICH_QUEUE) ? JSON.parse(readFileSync(ENRICH_QUEUE, "utf8")) : [];
}
export function saveEnrichQueue(q) {
  writeFileSync(ENRICH_QUEUE, JSON.stringify(q, null, 1));
}
/**
 * Queue a newly-added (or to-be-discovered) leader for enrichment. When the
 * record already exists, pass { dataset, deansFile, recordId }. When approval
 * came in without a resolved name, pass { resolveFromSource: true } and the task
 * will read the source article to find and add the person first.
 */
export function enqueueEnrichment(item) {
  const q = loadEnrichQueue();
  const key = item.recordId != null
    ? `${item.deansFile || item.dataset}#${item.recordId}`
    : `${item.dataset}|${(item.university || "").toLowerCase()}|${item.url || ""}`;
  if (q.some((x) => x._key === key)) return false;
  q.push({
    _key: key,
    dataset: item.dataset || null,
    deansFile: item.deansFile || null,
    recordId: item.recordId ?? null,
    university: item.university || null,
    school: item.school || null,
    dean: item.dean || null,
    url: item.url || null,
    title: item.title || null,
    resolveFromSource: !!item.resolveFromSource,
    addedOn: today(),
    status: "pending",
  });
  saveEnrichQueue(q);
  return true;
}

// --- signed action links (HMAC-SHA256; mirrors the trial-token scheme) --------
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function actionHmac(secret, msg) {
  return crypto.createHmac("sha256", secret).update(msg).digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** Sign a decision link payload: { i:id, a:"approve"|"dismiss", x:expirySec }. */
export function signAction(id, act, expirySec, secret) {
  const body = b64url(JSON.stringify({ i: id, a: act, x: expirySec }));
  return `${body}.${actionHmac(secret, body)}`;
}
/** Verify a decision token. Returns { ok, id?, act?, reason? }. */
export function verifyAction(token, secret, nowSec) {
  if (typeof token !== "string" || !token.includes(".")) return { ok: false, reason: "malformed" };
  const dot = token.indexOf(".");
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  const expect = actionHmac(secret, body);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  let p; try { p = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); }
  catch { return { ok: false, reason: "malformed" }; }
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  if (typeof p.x === "number" && now >= p.x) return { ok: false, reason: "expired" };
  return { ok: true, id: p.i, act: p.a };
}
