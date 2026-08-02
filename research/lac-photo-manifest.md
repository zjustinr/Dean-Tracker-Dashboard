# LAC portrait manifest

`lac-photo-manifest.json` lists the 205 sitting Liberal Arts College
presidents (`uslac` index) who have no entry in
`artifacts/dean-dashboard/src/data/dean-photos.json` yet. Generated
2026-08-02 from `r1-lac-deans.json` (records with `endYear: null`).

Each row is `{dean, university, slug, imageUrl, pageUrl}` with `imageUrl`
and `pageUrl` empty -- this session's network policy blocks WebFetch/curl,
so no bio pages could be opened to pull a portrait `<img>` src, only
WebSearch (which doesn't reliably surface direct image URLs).

## To finish, in an environment with outbound fetch access

1. For each row, find the official bio-page photo (skip Wikipedia/Wikimedia
   -- `download-photos.mjs` rejects those) and fill in `imageUrl` + `pageUrl`.
   Batch 4-5 people per research agent (see main `research/README.md` for
   why: ~37k tokens/person batched vs. ~92k unbatched).
2. Run from `artifacts/dean-dashboard/`:
   ```
   node scripts/prep-photo-urls.mjs <merged.json> research/lac-photo-manifest.json
   node scripts/download-photos.mjs <merged.json>
   ```
   (`prep-photo-urls.mjs` expects `imageUrl`/`pageUrl` already filled in;
   re-run it after each research batch to fold results into one file, or
   skip straight to `download-photos.mjs` once every row has an `imageUrl`.)
3. `download-photos.mjs` validates real image bytes (magic-number + min
   size) and rejects anything that doesn't parse as an image, so a bad URL
   fails loud rather than silently.
4. Vision-QC each downloaded portrait against the person's name before
   committing -- a past wave (`c079534`) caught a wrong image this way
   (a school mascot instead of the person).
