# Arts Deans Research Batch

Research appointment history for the dean/director of the arts/humanities school at these universities.

## Instructions

For each school:
1. **Current leader**: Search the college's website for the current dean/director name and start date
2. **Prior leaders**: Research previous deans/directors using:
   - College's leadership history page or archives
   - University press releases and news archives
   - LinkedIn profiles showing tenure at this institution
   - Faculty.com or similar academic leadership databases
   - Chronicle of Higher Education article mentions
3. **Appointment dates**: Document year started and ended (if applicable)
4. **Interim roles**: Flag interim or acting appointments
5. **Prior positions**: Note where the leader came from before this dean role
6. **Source URL**: Cite the specific article, press release, or page confirming each appointment

## Target schools:

{SCHOOLS_JSON}

## Output format

Return a JSON object with this structure:

```json
{
  "seats": [
    {
      "university": "School Name",
      "state": "XX",
      "school": "College of Arts and Sciences",
      "leaderTitle": "Dean",
      "moreHistoryExists": true,
      "records": [
        {
          "name": "Jane Smith",
          "startYear": 2020,
          "endYear": null,
          "priorTitle": "Associate Dean",
          "priorInstitution": "Same University",
          "isInterim": false,
          "convertedToPermanent": false,
          "sourceUrl": "https://example.edu/news/...",
          "notes": "Current dean; promoted from within."
        }
      ]
    }
  ]
}
```

## Notes

- If a school's website is inaccessible or has minimal leadership info, use news archives and external databases
- For schools with deep history, trace back at least 2-3 previous deans if available
- Flag where history becomes unclear or sources thin out
- moreHistoryExists: true if earlier deans likely existed but records are too scarce to research

## Batch: {BATCH_NUM} of {TOTAL_BATCHES}

Schools in this batch: {BATCH_START} to {BATCH_END}
