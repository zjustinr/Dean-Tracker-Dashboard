# Phase 3: Top-25 Universities — 1996-2026 Historical Research

## Objective
Establish a 30-year leadership history baseline for the 25 largest research universities, enabling long-term trend analysis and career-pattern research from 1996 to present.

## Target Universities (by total dean positions across disciplines)
1. University of Florida (235)
2. Michigan State University (234)
3. University of Pennsylvania (201)
4. University of Arizona (200)
5. Yale University (199)
6. Duke University (192)
7. University of Michigan (187)
8. Cornell University (185)
9. Texas A&M University (185)
10. Stanford University (180)
11. University of Southern California (176)
12. University of Cincinnati (175)
13. University of Texas at Austin (169)
14. New York University (167)
15. University of Connecticut (167)
16. Boston University (166)
17. Temple University (166)
18. University of Pittsburgh (164)
19. University of South Carolina (164)
20. Pennsylvania State University (163)
21. Texas Tech University (163)
22. Purdue University (163)
23. Johns Hopkins University (162)
24. Wayne State University (162)
25. University of Washington (160)

## Research Strategy

### By Discipline Tier
1. **Tier 1 (highest coverage):** Arts, Sciences, Engineering deans — search university archives and web.archive.org for leadership history
2. **Tier 2 (medium coverage):** Professional school deans (law, business, medicine) — use university press release archives
3. **Tier 3 (institutional):** Provosts, chancellors, presidents — use university governance records and Sec. 1002(c) federal data

### Data Sources (in priority order)
1. University's own leadership history pages or institutional archives
2. Web Archive (archive.org) snapshots of dean biography pages from 2000-present
3. University press release archives (often indexed by date)
4. Chronicle of Higher Education archives (subscription; covers 1996-present)
5. Faculty/professional network sites (LinkedIn, ResearchGate) showing tenure history
6. Accreditation reports (AACSB, ABA, LCME) which often list leadership history

### Timeline Strategy
- **2010-present:** Most sources readily available; aim for 100% coverage
- **2000-2010:** Requires archive.org and press releases; aim for 80%+ coverage
- **1996-2000:** Sparse sources; look for accreditation reports, faculty bios mentioning prior leadership
- **Earlier than 1996:** Out of scope; note in `moreHistoryExists` flag if records suggest earlier leaders exist

## Estimated Scope

- **Universities:** 25
- **Average positions per university:** 179
- **Total positions to research:** ~4,475
- **Historical span:** 30 years (1996-2026)
- **Estimated records:** 8,000-12,000 (accounting for multiple spells per person)

## Token Cost Estimate

Based on phase 2 arts deans pilot (147 schools, ~15-20M tokens estimated):
- Top-25 full research: ~30-40M tokens
- Recommended execution: 2-3 parallel batch runs of 8-10 universities each

## Output Format

Same as phase 2 (arts deans):

```json
{
  "seats": [
    {
      "university": "University Name",
      "state": "ST",
      "school": "College/School Name",
      "leaderTitle": "Dean",
      "moreHistoryExists": true,
      "records": [
        {
          "name": "Person Name",
          "startYear": 2010,
          "endYear": 2020,
          "priorTitle": "Associate Dean",
          "priorInstitution": "Same or different university",
          "isInterim": false,
          "convertedToPermanent": false,
          "sourceUrl": "https://...",
          "notes": "Historical notes, source limitations, etc."
        }
      ]
    }
  ]
}
```

## Key Differences from Phase 2

1. **Historical depth:** 30 years vs. 5-10 years; expect sparser data pre-2005
2. **Archive.org reliance:** Many leader bios only exist via web snapshots
3. **Interim/acting roles:** More common in historical records; must be carefully flagged
4. **Career tracing:** Many leaders have moved through multiple institutions; document priorInstitution for career patterns
5. **End dates:** Many leaders pre-2000 have unclear departure dates (retired? unknown? died?); note in `notes`

## Next Steps

1. Decide execution timing (parallel with phase 2 pilot or after)
2. Assign university batches to research agents (e.g., 8 universities per agent, 3-4 batches)
3. Set up archive.org bulk lookups for dean biography pages
4. Prepare data merge and validation infrastructure
