#!/usr/bin/env node
/**
 * Applies (or dismisses) a review item the owner approved from the digest email.
 * Triggered by the news-decision workflow (repository_dispatch) with:
 *   DECISION_ID   the review item's id
 *   DECISION_ACT  "approve" | "dismiss"
 *
 * approve:
 *   - name known  -> add the record now via applyEvent + queue it for enrichment.
 *   - name unknown -> queue a "resolve from source" job so the enrichment task
 *                     reads the article, finds the new leader, and adds them.
 * dismiss: drop it (and its banner) with no mutation.
 *
 * Prints RESULT=<applied|queued|dismissed|notfound|error> and MESSAGE= for the
 * workflow. Removes the item from the review queue in every non-error case.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { applyEvent, enqueueEnrichment, updateJobMarket, loadBreaking, saveBreaking, logCSV, today } from "./news-lib.mjs";
import { pushBreaking, storyKeysForEvent } from "./news-dedupe.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEW_PATH = resolve(__dirname, "../../..", "attached_assets/news_scout_review.json");

const id = String(process.env.DECISION_ID || "").trim();
const act = String(process.env.DECISION_ACT || "").trim() === "dismiss" ? "dismiss" : "approve";
const out = (result, message) => { console.log(`RESULT=${result}`); console.log(`MESSAGE=${message}`); process.exit(0); };

if (!id) out("error", "No decision id supplied.");
const queue = existsSync(REVIEW_PATH) ? JSON.parse(readFileSync(REVIEW_PATH, "utf8")) : [];
const item = queue.find((r) => String(r.id) === id);
if (!item) out("notfound", `Item ${id} is no longer in the review queue (already handled or aged out).`);

const dropFromQueue = () => writeFileSync(REVIEW_PATH, JSON.stringify(queue.filter((r) => String(r.id) !== id), null, 1));
const breaking = loadBreaking();
const dropBanner = () => { breaking.items = breaking.items.filter((it) => String(it.id) !== id); };

if (act === "dismiss") {
  dropBanner(); dropFromQueue(); saveBreaking(breaking);
  logCSV([[today(), "digest_dismiss", item.university || "", item.dean || "", `${item.schoolType}/${item.type}`, "owner", item.url || ""]]);
  out("dismissed", `Dismissed ${item.university} (${item.schoolType}). Removed from the queue.`);
}

// approve
const e = {
  schoolType: item.schoolType, university: item.university, school: item.school,
  dean: item.dean, interim: !!item.interim, role: item.role,
  date: new Date(item.date || Date.now()), url: item.url, title: item.title, id: item.id,
};

// No resolved name -> defer the add itself to the enrichment task.
if (!e.dean || item.type !== "appointment") {
  enqueueEnrichment({
    dataset: item.schoolType, university: e.university, school: e.school,
    url: e.url, title: e.title, resolveFromSource: true,
  });
  dropBanner(); dropFromQueue(); saveBreaking(breaking);
  logCSV([[today(), "digest_queued", e.university || "", e.dean || "", `${item.schoolType}/${item.type}`, "owner", e.url || ""]]);
  out("queued", `Queued ${e.university} (${item.schoolType}) for research — the enrichment task will find the leader and add them.`);
}

// Name known -> add now + queue enrichment.
try {
  const { status, dataset, deansFile, id: recordId } = applyEvent(e);
  if (status === "added") {
    enqueueEnrichment({ dataset, deansFile, recordId, university: e.university, school: e.school, dean: e.dean, url: e.url, title: e.title });
    if (e.schoolType === "business") updateJobMarket({ kind: "filled", university: e.university });
    dropBanner(); // the pending-confirmation line this decision answers
    pushBreaking(breaking, {
      id: `${id}-applied`, type: "applied", date: today(),
      headline: `${e.dean} named ${e.interim ? "interim " : ""}${e.role} at ${e.university}${e.school ? ` (${e.school})` : ""}`,
      university: e.university, dean: e.dean, url: e.url,
      storyKeys: storyKeysForEvent({ ...e, type: "appointment" }),
    }); dropFromQueue(); saveBreaking(breaking);
    logCSV([[today(), "digest_applied", e.university, e.dean, `${e.schoolType}/appointment${e.interim ? "/interim" : ""}`, "owner", e.url]]);
    out("applied", `Added ${e.dean} as ${e.interim ? "interim " : ""}${e.role} at ${e.university} and queued enrichment.`);
  } else {
    // duplicate / no_sibling -> still queue enrichment so the task can reconcile.
    enqueueEnrichment({ dataset: item.schoolType, university: e.university, school: e.school, dean: e.dean, url: e.url, title: e.title, resolveFromSource: status !== "duplicate" });
    dropBanner(); dropFromQueue(); saveBreaking(breaking);
    logCSV([[today(), `digest_${status}`, e.university, e.dean, `${e.schoolType}/appointment`, "owner", e.url]]);
    out("queued", `${e.dean} at ${e.university}: apply returned "${status}"; queued for the enrichment task to reconcile.`);
  }
} catch (err) {
  out("error", `Apply failed for ${e.university}: ${err && err.message}`);
}
