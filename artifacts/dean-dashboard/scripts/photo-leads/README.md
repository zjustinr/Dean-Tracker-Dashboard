# Photo leads

`grad-college-leads.json` is a list of `{university, leadUrls}` entries — staff-
directory / "meet the team" pages for ~65 of the universities in the Graduate
College index, gathered during the Aug 2026 career-background research pass.
These are **page URLs, not image URLs**: they were surfaced via search-result
summaries, not by fetching the pages themselves (this session's network
egress policy blocked direct fetches to external hosts entirely — confirmed
by testing curl/WebFetch/node fetch against several hosts, all 403).

## How to use this once fetch access is available

For each `{university, leadUrls}` entry:

1. Fetch each URL in `leadUrls`.
2. For each Graduate College dean/associate/assistant dean at that
   university still missing a photo (cross-reference against
   `dean-photos.json` — key is `dean|university`, lowercased), find their
   headshot `<img>` on the page and note the `src` and the person's name as
   it appears there.
3. Append `{dean, university, imageUrl, pageUrl}` rows to a JSON array.
4. Normalize with `node scripts/prep-photo-urls.mjs <out.json> <urls.json>`.
5. Download with `node scripts/download-photos.mjs <out.json>` — this
   validates real image bytes, writes to `public/deans/`, and updates
   `dean-photos.json`.

Not every university in the Graduate College index has a lead here — this
list only covers the schools researched in the Aug 2026 pass. The remaining
schools would need a fresh search pass first.

## `leadership-office-leads.json` (Aug 2026 pass — vice/associate/interim leaders)

Same `{university, leadUrls}` shape, plus an informational `missingSubdeanCount`
(how many `roleType: "subdean"` records — vice/associate/assistant/interim
deans and similar — for that university had no `dean-photos.json` entry when
this pass ran; `null` means the university wasn't in that specific slice but
still has other missing photos worth covering opportunistically).

Covers the **109 highest-impact universities** (by missing-subdean-photo
count) out of 585 total universities with at least one missing subdean photo
— about 1,221 of the 4,534 missing subdean photos tracked at the time. These
are **office-of-the-president / provost "senior leadership" staff pages**,
found via one web-search per university (not per person) to keep the research
step cheap — the same page typically lists several vice/associate leaders at
once. URLs are page leads, not image URLs; they haven't been fetched yet.

**Known blocker:** the session that built this list had its network egress
policy locked down to an allowlist (npm/pypi/GitHub/etc.) — `curl`, Node
`fetch`, and even the `WebFetch` tool returned `403`/`EGRESS_BLOCKED` for
every external `.edu` domain tried. Only the hosted `WebSearch` tool (which
returns search snippets, not full page fetches) worked, so these leads could
only be *found*, not resolved into actual image URLs or downloaded — the
`download-photos.mjs` bytes-fetch step needs a session with normal internet
egress. If you hit the same wall, check your environment's network policy
before re-running the research step.

### How to continue

1. In a session with normal web access, fetch each `leadUrls` page for a
   university, cross-reference names against `dean-photos.json` (same
   `dean|university` key, lowercased) for that university's still-missing
   subdean records, and note each headshot `<img src>`.
2. Append `{dean, university, imageUrl, pageUrl}` rows to a JSON array.
3. `node scripts/prep-photo-urls.mjs <out.json> <urls.json>`
4. `node scripts/download-photos.mjs <out.json>`
5. Commit `public/deans/*` + `src/data/dean-photos.json` and deploy — do
   this in small, frequent batches (e.g. per university or per ~20 photos)
   rather than one giant batch, so progress ships continuously.
6. The remaining ~476 universities (outside this 109-university slice) still
   need a first search pass — repeat the one-search-per-university approach
   above using the full missing-subdean-by-university list, or re-derive it
   with the same `roleType === "subdean"` + `dean-photos.json` cross-reference
   logic described above.
