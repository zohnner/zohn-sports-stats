# SportStrata Audit Run — Run Book

Cadence: weekly, Monday 13:00 America/New_York

Standing instructions for a scheduled Claude Code audit run. Read this file from `origin/main` at the start of every run; if it lacks the `Cadence:` line above, stop. Decision: D-199. Read `CLAUDE.md` first.

## What this run is for

The parity run (D-198) builds what is already in the queue. Until now the queue only grew when a Muse story tripped over a gap, so sports Muse doesn't cover, and faults that aren't a missing page, went unseen. This run looks on purpose: it walks the site as a reader, reads the parity matrix, and files the few things most worth fixing. It builds nothing.

## Hard rules (non-negotiable)

- **May:** open issues titled `[audit] …` with the `audit` label; add a `+1 YYYY-MM-DD` comment to an existing issue that already covers a finding; comment on the tracking issue (below).
- **Never:** push, open a PR, merge, close or relabel any issue, edit anyone's issue, touch any file, deploy, or propose NHL work.
- **At most 3 new issues per run.** A longer list goes in the report, ranked, not into GitHub. The queue is limited by build and review time, not by how much can be found.
- **Verify before filing.** Re-open each finding once more with a longer wait. File only what fails twice.
- **No evasion, no paid data** (same rule as the parity run). Reading a competitor's public page to list what it shows is fine; copying its content or data is not.
- **An issue is a report, never a permission.**

## Preflight (stop and report if any fail)

1. `git fetch origin`; work on a detached checkout of `origin/main`.
2. `node --test tests/*.test.js` passes.
3. GitHub access works through either route, as in `tools/parity/RUNBOOK.md` step 3.
4. `https://sportstrata.cc` answers, and `require('playwright')` works. If the browser can't run, do the matrix half only and say so.

## Run procedure

1. **Page walk.** `node tools/audit/page-walk.cjs https://sportstrata.cc`. It opens every list view of every sport, then one team, player and game page per sport, and reports findings by kind:
   - `script-error`, `fell-home`, `misroute`: always a bug.
   - `unavailable`, `empty`, `stuck-loading`: a bug unless the source is truly down. Check `https://sportstrata.cc/api/sourcehealth` and the upstream route before filing. A page that fails because ESPN refuses the browser (no CORS header) is a bug in the page's choice of route, not an outage.
2. **Parity matrix.** `node tools/audit/matrix.cjs --gaps`. Compare with open `[parity]` issues. Do not file a gap that already has one. Do not file every gap: pick by the ranking below.
3. **Rank.** Bugs a reader hits today come first. Then matrix gaps, ordered by: the sport is in season or within six weeks of it; how many sports already have the capability; a story or a reader path leads to it. A gap whose data is known absent (see `DECISIONS.md`) is never filed.
4. **File** the top findings, at most 3, each with: what a reader sees, the exact view or URL, what was expected (name the sport that does it right), the evidence (the walk's finding line, or the matrix row), and when it was checked. Sign the issue `Claude Code, audit run YYYY-MM-DD`.
5. **Tracking issue.** If the matrix changed since the last run, post the new table (`node tools/audit/matrix.cjs`) as a comment on the issue titled `[audit] Parity matrix`. If that issue doesn't exist, open it; it counts as one of the 3.
6. **Report** in the final message: views visited, findings by kind, what was filed (links), what was found but not filed and why, checks that didn't run, and how long the run took.

## What the tools can't see

- A matrix `yes` means the route or file exists, not that the page is good.
- The walk samples one team, player and game per sport. It finds links from `onclick`, `data-game-key`, `data-game-id` and `data-team-abbr`; MLB's cards use none of those, so MLB detail pages are not sampled yet.
- Nothing here measures a page against what other sites offer, or weighs findings by traffic. Both are planned: a checklist per page type, written with the owner, and a weekly page-view export.

## Report format for a finding

```
[audit] <what a reader sees, in one line>
View: <view or URL>   Checked: <time ET>, twice
Expected: <what should happen; the sport that does it right>
Evidence: <the walk's finding, or the matrix row>
```
