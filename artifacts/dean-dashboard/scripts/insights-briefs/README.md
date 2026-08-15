# Insights research-brief maintenance

Tools for keeping `src/components/Insights.tsx`'s published research briefs
honest as the underlying `src/data/*.json` datasets keep growing.

## The problem this solves

Every brief's PDF and its `Insights.tsx` findings bullets are written once,
as prose with numbers baked in. The data keeps growing (new appointment
waves land through other PRs every week or so), so those numbers silently
drift out of date -- and in one real case (the original "Law School Dean
Pipeline" brief), drifted data plus a classifier bug produced a headline
claim that was off by roughly 2x. See git history for that incident.

## The two-step workflow

**1. Detect drift (safe, automated, read-only).**

```
node scripts/insights-briefs/compute-stats.mjs
```

Recomputes every brief's key headline claims directly from current
`src/data/*.json` and diffs against what's currently published, per claim,
with a tolerance. Flags anything that's moved too far. This is the piece
that's safe to run unsupervised on a schedule -- it never writes anything.

**2. Regenerate (deliberate, NOT automatic).**

```
python3 scripts/insights-briefs/gen_prior_position_brief.py
python3 scripts/insights-briefs/gen_lateral_divide_brief.py
```

These write the cover image + PDF straight into `public/insights/`. They
are **snapshot generators** -- every number in them (chart data and prose
alike) is a literal, not something computed live. Re-running one as-is just
reproduces the same PDF; it does not refresh anything. If `compute-stats.mjs`
flags a brief, a human (or an agent working through it deliberately) needs
to:

  1. Read the flagged claim(s) and decide whether the underlying prose still
     holds. A number moving 3 points can flip an ordering ("X is the largest
     category") or invalidate a superlative ("more than 3-to-1") -- these
     need a sentence rewritten, not just a digit swapped. This is exactly
     the failure mode `compute-stats.mjs` exists to catch before it ships.
  2. Update the relevant constants (chart data arrays, inline prose numbers)
     in the script.
  3. Re-run the script and visually review every page (render to PNG, check
     for layout overflow -- this has happened before, see git history).
  4. Update the matching `findings` bullets and `pages` count in
     `Insights.tsx` if the page count changed.
  5. Typecheck, verify in a dev server, commit, and open a **draft PR**
     summarizing exactly what changed. Never auto-merge a brief refresh.

**Only two of the five published briefs have a generator here yet**
("The Path Before the Deanship" and "The Lateral Dean Divide" -- both built
in this repo's history). "The Discipline Behind the Dean", "Gendered
Pathways in Academic Leadership", and "The Graduate Deanship Clock" were
built in earlier sessions whose generator scripts were never committed, so
`compute-stats.mjs` can only detect drift in their cheaply-recomputable
claims (see the script's `unverifiable(...)` entries for exactly what it
can't check and why) -- it cannot regenerate their PDFs. If one of those
three gets flagged, treat it as a prompt to rebuild that brief's generator
from scratch (matching its existing content/design) as part of the fix,
not just something to skip.

## The weekly Routine

A scheduled Routine runs `compute-stats.mjs` weekly in a fresh session and
opens a draft PR **only when something is flagged**, with the flagged
claims listed in the PR description so the follow-up regeneration is
targeted. A clean run does nothing -- no PR, no noise. It never merges
anything and never touches a brief with drift beyond what a generator
script here can fix.

## Adding a new brief later

Give it its own `gen_<id>_brief.py` following the pattern in the two
existing ones (reuses `cover_template.py`; keeps its own copy of the
chart/layout helpers standalone, matching every other generator script in
this repo -- see `gen-scout-insights.mjs`'s comment on why), and add its
headline claims to `compute-stats.mjs` so the weekly check covers it too.
