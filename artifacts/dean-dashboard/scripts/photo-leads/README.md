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
