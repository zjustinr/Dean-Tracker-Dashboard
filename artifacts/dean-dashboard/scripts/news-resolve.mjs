#!/usr/bin/env node
/**
 * Resolves a news-review confirmation issue from the repo owner's comment.
 * Env: ISSUE_BODY, COMMENT_BODY, ISSUE_NUMBER
 * Prints RESULT=<applied|closed|ignored|invalid> for the workflow.
 */
import { applyAppointment, closeTenure, updateJobMarket, loadBreaking, saveBreaking, logCSV, today } from "./news-lib.mjs";
import { pushBreaking, storyKeysForEvent } from "./news-dedupe.mjs";

const issueBody = process.env.ISSUE_BODY || "";
const comment = (process.env.COMMENT_BODY || "").trim();

const m = issueBody.match(/<!-- news-scout-payload\s*([\s\S]*?)\s*-->/);
if (!m) { console.log("RESULT=invalid"); console.log("No payload found in issue body."); process.exit(0); }
let payload;
try { payload = JSON.parse(m[1]); } catch { console.log("RESULT=invalid"); process.exit(0); }
payload.date = new Date(payload.date);

const first = comment.split("\n")[0].trim();
const lower = first.toLowerCase().replace(/[.!]/g, "");

const breaking = loadBreaking();
const dropBanner = () => { breaking.items = breaking.items.filter((it) => it.id !== payload.id); };

let result = "invalid";
let message = "";

if (["skip", "no", "2", "ignore"].includes(lower)) {
  dropBanner();
  result = "ignored";
  message = "Understood - ignoring this story. Banner item removed.";
  logCSV([[today(), "confirm_ignored", payload.university, "", payload.kind, "owner", payload.url]]);
} else if (payload.kind === "close" && ["1", "yes", "y", "confirm"].includes(lower)) {
  const status = closeTenure(payload);
  dropBanner();
  result = status === "closed" ? "closed" : "ignored";
  message = status === "closed"
    ? `Done - closed the sitting dean's tenure at ${payload.university} (${payload.date.getFullYear()}).`
    : `No single open tenure found at ${payload.university}; nothing changed. Please update manually if needed.`;
  logCSV([[today(), "confirm_" + status, payload.university, "", "departure", "owner", payload.url]]);
} else if (payload.kind === "name") {
  // treat the first comment line as the dean's full name
  const nameToks = first.replace(/^Dr\.\s+/i, "").split(/\s+/);
  const looksLikeName = nameToks.length >= 2 && nameToks.length <= 4 && nameToks.every((t) => /^[A-Z][\w'.-]*$/.test(t));
  if (looksLikeName) {
    const name = nameToks.join(" ");
    const status = applyAppointment({ ...payload, dean: name });
    dropBanner();
    if (status === "added") {
      updateJobMarket({ kind: "filled", university: payload.university });
      pushBreaking(breaking, {
        id: payload.id + "-applied", type: "applied", date: today(),
        headline: `${name} named ${payload.interim ? "interim " : ""}dean at ${payload.university}`,
        university: payload.university, dean: name, url: payload.url,
        storyKeys: storyKeysForEvent({ type: "appointment", role: "dean", university: payload.university, dean: name }),
      });
      result = "applied";
      message = `Done - added ${name} as ${payload.interim ? "interim " : ""}dean at ${payload.university} and closed the predecessor's open tenure. Deploying.`;
    } else {
      result = "ignored";
      message = `${name} already appears at ${payload.university} around this year - nothing changed.`;
    }
    logCSV([[today(), "confirm_" + status, payload.university, name, "appointment" + (payload.interim ? "/interim" : ""), "owner", payload.url]]);
  } else {
    message = "Could not read that as a name (expected 2-4 capitalized words, or `skip`). Please reply again.";
  }
}

if (result !== "invalid") saveBreaking(breaking);
console.log("RESULT=" + result);
console.log("MESSAGE=" + message);
