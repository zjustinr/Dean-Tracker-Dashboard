# Data provenance: bench start years, PhD fields, school covariates

This records where three groups of previously-empty fields now come from, how
they were derived, and where they are still null. It exists because the fields
it covers were either absent or present on so few rows that anything estimated
on them would have been fitted to a small, unexplained subsample.

## What changed

| Field | Before | After | Source |
|---|---|---|---|
| `startYear` on feeder bench (`roleType: "subdean"`) | 37 of 11,930 (0.3%) | 579 (4.9%) | source/bio pages |
| `phdInstitution` | 5,500 of 33,664 (16.3%) | 6,817 (20.3%) | source/bio pages |
| `phdYear` | **field did not exist** | 1,094 (3.2%) | source/bio pages |
| `enrollmentEnd` | 2.3% | 88.5% | IPEDS |
| `enrollmentAvg` | 2.5% | 88.5% | IPEDS |
| `businessPctEnd` | 2.3% | 87.2% | IPEDS |
| `businessDegreesLatest` | 2.3% | 84.1% | IPEDS |

`phdYear` read 0.0% because it was never a field: it was absent from
`types.ts` and from all 33,664 records. It is now declared and populated.

## Why the bench had no dates

The feeder bench was harvested as a **roster snapshot** — name and title taken
off leadership directory pages — not as appointment events. Roughly 68% of
bench `sourceUrl`s point at staff directories that print a name and a title and
no date at all. Dean rows, by contrast, largely come from appointment
announcements, which is why 81% of them carry a start year.

The ceiling here is low and it is a property of the sources, not the method:
even among bench rows whose `sourceUrl` is a news announcement, fewer than 1%
stated when the person entered the role. Most pages simply never say when
somebody became an associate dean.

## Method: source and bio pages

`scripts/src/enrich-from-source-pages.mjs` re-visits each row's `sourceUrl`,
and where that is a shared roster, follows the link to the person's own bio
page. `scripts/src/lib/bio-extract.mjs` does the extraction, sentence by
sentence. `scripts/src/apply-source-page-enrichment.mjs` merges the results.

The standard throughout is **precision over recall**: a wrong value is worse
than the null already on the row. Nothing is written unless a sentence ties the
value to this person explicitly. Guards were added for failure modes found by
auditing real pages:

- **Cross-person contamination.** On a shared roster or a news story, a
  sentence that never names the person is skipped — a year was otherwise read
  off a sentence about a different dean entirely.
- **Career-arc sentences.** "joined in 2018 … and now serves as associate dean"
  dates the arrival, not the role.
- **Employer tenure.** "has been working at UNF since 1999 … including
  associate vice president" dates the job at the institution, not the role.
- **Junior-role mentions.** The role named in the sentence must match the head
  noun of the person's own recorded title, so "joined in 2004 as associate
  *director*" is not read onto someone whose title is Vice *President*.
- **Credential-suffix sentences.** "Szymanski, Ph.D., will join Baylor … 2025"
  is a start date, not a degree year; a job-move verb between the degree and a
  value disqualifies it.
- **Multi-degree sentences.** The institution is scoped to the text following
  the doctoral token, so a bachelor's school is not recorded as the doctorate's.

Every candidate carries the evidence sentence it came from, so any value can be
audited against its source. The apply step is dry-run by default, never
overwrites an existing value, and re-checks the name at `(file, idx)` before
writing so index drift cannot put a value on the wrong person.

**Measured accuracy.** Hand-audits of random samples of the accepted output ran
at roughly 8 in 10 correct for both start years and PhD institutions after the
guards above. That is not clean enough to treat as gold data: treat these
fields as good-faith derived values with an audit trail, not as verified facts.

**Reach.** Of 25,276 rows with a URL worth revisiting, 22,112 pages were
fetched and 3,164 were unreachable — dead links and bot-blocked hosts, an
inherent loss on a corpus of links harvested over time.

## Method: school covariates from IPEDS

`scripts/src/fetch-ipeds-panel.mjs` builds a per-institution, per-year panel
from published IPEDS survey files; `scripts/src/compute-school-covariates.mjs`
derives the four fields from it. The panel, the name→UNITID crosswalk and the
vintage record are committed under `research/ipeds/` so the covariates can be
audited without re-downloading roughly 400MB of source files.

### Vintage

Recorded in `research/ipeds/ipeds-vintage.json`, which lists every survey file
used, by year. In summary:

- **Source:** IPEDS Data Center complete data files (`nces.ed.gov/ipeds/datacenter`).
- **Crosswalk base:** `HD2023` (directory) and `EF2023A` (enrolment, for campus tie-breaks).
- **Enrolment:** `EF<year>A`, 2000–2023.
- **Completions:** `C<year>_A`, 2002–2024.
- Where IPEDS publishes a revised (`_rv`) file, the revised file is used.

### Definitions

| Field | Definition |
|---|---|
| `endRef` | tenure end year; for a sitting dean, the most recent panel year |
| `enrollmentEnd` | total enrolment at the latest panel year at or before `endRef` |
| `enrollmentAvg` | mean total enrolment over the panel years within `startYear..endRef` |
| `businessPctEnd` | business completions ÷ all completions, at the latest panel year at or before `endRef` |
| `businessDegreesLatest` | business completions in the latest panel year for the institution (constant across that university's deans) |

Enrolment is the "all students total" line (`EFALEVEL=1`, field `EFTOTLT`; in
the 2000–2003 layout, `line 29 / section 3` with `EFRACE15+EFRACE16`).
Completions are summed over 6-digit CIP rows at `MAJORNUM=1`, with business as
CIP `52.*`. `MAJORNUM=1` is what keeps each award counted once.

Three schema eras ship under the same file names, so the reader detects the
layout rather than assuming one. Summing 6-digit CIP detail rows was chosen
because it is the one method that works across all of them: it reproduces the
`CIPCODE 99` grand-total row *exactly* wherever that row exists (verified for
2005, 2006 and 2019) and still yields a figure for the years where IPEDS omits
it.

### The crosswalk

IPEDS lists every branch campus as its own institution — Pennsylvania State
University alone has about twenty UNITIDs — so a loose name match would attach
a flagship dean to a satellite campus. Matching prefers, in order: an exact
normalised name, a recorded IPEDS alias, then a campus variant, choosing the
main campus and falling back to the largest by enrolment. A hand-maintained
alias table in `scripts/src/lib/ipeds.mjs` covers short forms the directory
does not carry (MIT, UCLA, CUNY Baruch, William & Mary, and others).

Of 2,112 distinct university names covering 33,664 rows: 2,007 resolve, 76 are
multi-campus **system offices**, and 29 do not resolve.

### Where covariates are null, and why

- **System offices (499 rows).** "The Texas A&M University System" and the like
  have no IPEDS institution and no enrolment of their own. These are null by
  design, not by failure — attaching a flagship campus's figures to a system
  leader would invent data.
- **Unresolved names (96 rows).** Mostly institutions that have since closed,
  merged or been renamed.
- **Out of panel range (3,280 rows).** Tenures ending before the panel starts.
- **Pre-2002 completions.** The 2000–2001 completions files use a 16-column
  `crace` layout in which the total columns are not comparable to later years —
  summing them yields roughly twice the neighbouring year for the same
  institution (Alabama 2001: 8,228 against 4,183 in 2002). Rather than ship a
  silently doubled business share, those two years are excluded, so
  `businessPctEnd` is unavailable for tenures ending 2000–2001. Enrolment for
  those years is present and was validated across the schema boundary.

### Legacy values were superseded

The ~2% of rows that already carried covariates were computed on an unrecorded
basis and **do not reproduce** under any IPEDS definition tried: recomputation
matched the old value 14 times out of 2,348. For one worked example, American
University's recorded `businessDegreesLatest` of 702 matches no year, and its
recorded `businessPctEnd` for a 2022 tenure end (0.1747) matches IPEDS *2021*
completions (0.1745) rather than 2022 (0.1609).

Because these are derived covariates rather than observed facts, they were
recomputed for every row from the single vintage above rather than left in
place. Leaving 2% on an unknown basis beside 98% on a documented one would
reproduce the original problem in a subtler form. Pass `--keep-legacy` to
preserve pre-existing values instead.

## Reproducing

```sh
# 1. Build the IPEDS panel, crosswalk and vintage record (~400MB downloaded,
#    processed a year at a time and deleted; the outputs are a few MB).
node scripts/src/fetch-ipeds-panel.mjs --work /tmp/ipeds --out research/ipeds

# 2. Recompute the school covariates (omit --write for a dry run).
node scripts/src/compute-school-covariates.mjs --panel research/ipeds --write

# 3. Re-crawl source/bio pages (--cache makes re-runs cheap; --index limits scope).
node scripts/src/enrich-from-source-pages.mjs --out /tmp/cands.json --cache /tmp/htmlcache

# 4. Merge the candidates (dry run first; add --write to apply).
node scripts/src/apply-source-page-enrichment.mjs /tmp/cands.json --write
```

## Known limitations

- Bench start years remain sparse (4.9%) and will stay that way: the pages
  mostly do not state the date. Materially better coverage needs a different
  source — CVs, press-release archives, or manual research — not a better parser.
- Extraction accuracy is about 8 in 10 on audit, so these fields carry noise.
  Anything sensitive to that should use the evidence trail to verify first.
- `enrollmentAvg` averages the panel years available inside the tenure window,
  which for a tenure starting before 2000 covers only its later part.
- The crosswalk is pinned to the `HD2023` directory, so institutions that
  closed or merged before 2023 may not resolve.
