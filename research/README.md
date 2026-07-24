# Research staging for the R2 / regional public build

Paused as of 2026-07-24. Nothing here is wired into the app. This directory
exists so the discovery work survives, because rebuilding it costs roughly
460k subagent tokens.

## Why it is paused

The build was started on the premise that both of Greenwood Asher's live
searches sat outside our data. That turned out to be half wrong. "The ASU
search" is **Arizona State University, Vice Provost and Dean of the Graduate
College**, and Arizona State is already covered across nine indices. Only the
UA Little Rock chancellor search was a genuine gap, and wave 1 closed it.

R2 remains a sound product investment (it makes the story "R1 and R2"), but it
was not needed for the July 28 demo, so the fan-out was stopped to conserve
weekly quota.

## What is here

### `universe/universe_r2.json`
All **139** institutions in the 2025 Carnegie R2 classification, 97 public and
42 private, with name, city, state and control. Count matches Carnegie's
published figure. `system`, `leaderTitle` and `founded` are mostly unfilled and
still need a metadata pass.

### `universe/universe_systems.json`
**37** US public university system offices with their sitting leader, title,
campus count and headquarters. The Midwest region was still running when the
build stopped, so expect roughly 8 to 10 more.

Worth knowing before using it: title is not uniform. SUNY and the California
State University put a Chancellor above campus Presidents; the University of
California, the UNC System and UMass put a President above campus Chancellors.
Three sat under interim leadership at capture time (Connecticut State Colleges
and Universities, Southern University System, University of Alaska System), and
Georgia's Sonny Perdue is a retiring lame duck with a national search open.

Excluded deliberately: community-college-only systems, and coordinating bodies
whose chief executive is a Commissioner or Executive Director rather than a
President or Chancellor (Utah, Montana, Mississippi IHL, Kentucky CPE, Arizona
Board of Regents). Kentucky, Virginia, New Jersey, Delaware, Oregon and
Washington have no qualifying four-year system office at all.

### `wave1-arkansas/`
Raw agent output for the four entities traced from founding: UA Little Rock
(1927), Arkansas State Jonesboro (1910), the UA System (1871) and the ASU
System (2006). The processed form is committed as
`src/data/r1-r2public-*.json`, also unregistered.

### `etl_leaders.mjs` and `qc_leaders.mjs`
Generic president and chancellor ETL and QC, carrying forward the rules the
veterinary build established: origin derived at appointment time and never
defaulted, a leader counts as sitting only if they are the last record for that
institution, and interim-then-permanent is flagged. Adds `historyFrom` and
`truncated` per institution, because research after wave 1 was capped at 1996+
appointments.

```
node research/etl_leaders.mjs --glob w --out r1-r2public --label "R2 University"
node research/qc_leaders.mjs --out r1-r2public
```

## Resuming

Research was capped at **appointments from about 1996 onward** to conserve
quota. Pre-1996 backfill is scheduled as the `r2-history-backfill` task firing
2026-08-17.

Batch four or five institutions per agent. One institution per agent ran ~92k
tokens in wave 1 versus ~37k batched on the veterinary build.
