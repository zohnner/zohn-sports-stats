# Upstream Contract Monitor — Design

**Date:** 2026-09-28 · **Status:** design approved in brainstorm, awaiting spec review · **Scope:** first of the agent/automation pipeline (see "Context")

## Problem

SportStrata's data layer sits on undocumented upstreams (ESPN site/core APIs, Sleeper, MLB Stats API) reached through `/api/*` Pages Function proxies. The client parsers are written to degrade silently: every field read carries a fallback (`home?.team?.abbreviation || '?'`, `status?.type?.shortDetail || ... || ''` in `js/nfl.js`'s scoreboard parser). That is the right UX choice, and it means an upstream change never throws. It renders `?` or a blank, and nobody is told.

Two failure classes follow, and this monitor targets both:

1. **Upstream drift.** A field the client reads is renamed, removed, or the proxy starts receiving an HTML block page instead of JSON (the Akamai/Cloudflare-egress WAF issue, D-062, is the one confirmed real instance so far).
2. **Silent subsets.** The response is well-formed but quietly incomplete. The canonical case is D-135: `fetchNCAAFScoreboard` omitted `groups=80`, so every scoreboard returned ~25 of up to 99 real games for weeks. A field-presence check cannot catch this; a count invariant can.

**Honest limit, stated up front:** most of this repo's historical data bugs (`groups=80`, the missing `situation.text`, `STATUS_END_PERIOD`) were the client misreading a *stable* API from day one. A contract that encodes what the code reads would have encoded those same wrong assumptions. The monitor catches class 2 only through invariants, and does not replace rendered-page QA (the release-QA agent, a separate spec).

## Non-goals

- Live-only fields (`situation`, in-progress `drives`, win-probability ticks). No nightly run can observe them; they belong on the release-QA agent's live-window checklist.
- Rendered-page, layout, or copy bugs.
- Full-shape snapshot diffing. Rejected: ESPN adds fields constantly and offseason sports return empty arrays, so a shape diff would be noise within a week.
- Migrating `ISSUES.md` to GitHub issues. Originally bundled here; dropped after inspection showed `ISSUES.md` is mostly session journal, gated specs and shipped history (its active P2 table is empty), not a tracker. Triage of its handful of genuinely open items is a separate, human-judgment task.

## Architecture

```
.github/workflows/contract-check.yml   daily 11:00 UTC + workflow_dispatch
        │
        ▼
tools/contract-check.cjs <site-base-url>     zero deps, Node 20 built-in fetch
        │  loads
        ▼
tools/contracts/{nfl,ncaaf,mlb}.cjs          one contract list per sport
        │  hits (production, same routes the client uses)
        ▼
https://sportstrata.cc/api/*
```

Sibling of `tools/join-health.cjs` (D-037) and follows its conventions: takes the site base URL as argv, no dependencies, prints a human-readable report, exit codes `0` pass / `1` warn / `2` fail. Runs against the deployed site, never localhost, so it tests the proxies as users actually reach them.

## Contract format

Each contract file exports an array of route contracts:

```js
module.exports = [
  {
    id: 'nfl-scoreboard',
    route: d => `/api/nfl?path=/scoreboard&dates=${d.yyyymmdd}`,
    mirrors: 'js/nfl.js fetchNFLScoreboard',
    paths: [
      'events[].id',
      'events[].status.type.state',
      'events[].status.type.shortDetail',
      'events[].competitions[0].competitors[].team.abbreviation',
      'events[].competitions[0].competitors[].team.displayName',
      'events[].competitions[0].competitors[].score',
      'events[].competitions[0].competitors[].records[].summary',
      'events[].competitions[0].competitors[].linescores[].value',
    ],
    invariants: [ minCount('events', 8) ],
  },
];
```

- **`route`** is a function of the resolved probe date (see "Season awareness") and must use the same query params the mirrored client call sends. That is the only way a count invariant can catch a missing-param bug.
- **`mirrors`** names the client call site. It is documentation for humans and for the future release-QA agent, which will flag diffs that change a mirrored call without touching its contract.
- **`paths`** use a minimal dotted syntax: `a.b` for keys, `[0]` for a fixed index, `[]` for "every element". A path passes when the resolved value is present and non-null for every element. An empty array at a `[]` step passes vacuously; emptiness is policed by invariants, not paths.
- **Paths are authored from the parsers themselves**, not from memory: each path corresponds to a real property read in the mirrored function.

## Invariants

A small fixed library in `contract-check.cjs`:

| Invariant | Catches |
|---|---|
| `isJson()` (implicit, every route) | HTML block pages from WAF/egress blocks. Reported as "upstream returned HTML (likely WAF block)", not as a confusing missing-path failure |
| `minCount(path, n)` | Silent subsets (`groups=80` class) |
| `exactCount(path, n)` | Standings completeness (32 NFL teams, 30 MLB teams) |
| `numeric(path)` | Scores/stats that stop parsing as numbers |

## Initial route set (12)

| Sport | Route | Mirrors | Key invariant |
|---|---|---|---|
| NFL | `/api/nfl?path=/scoreboard` (probe date) | `js/nfl.js fetchNFLScoreboard` | `minCount(events, 8)` on a Sunday probe date |
| NFL | `/api/nfl?path=/summary&event={id}` | `js/nflLiveGame.js fetchNFLSummary` | header, boxscore, leaders, drives present on a final |
| NFL | `/api/nflstandings?season={y}` | `js/nflStandings.js fetchNFLStandings` | `exactCount` 32 teams across the tree |
| NFL | `/api/nflstats` | `js/nfl.js` leaders loader | each category non-empty |
| NFL | `/api/sleeper?path=/v1/players/nfl` | `js/fantasy.js` / `js/nfl.js` pool | `minCount` ≥ 1500 active players |
| NFL | `/api/sleeper?path=/v1/players/nfl/trending/add` | `js/nfl.js` trending | non-empty |
| NCAAF | `/api/ncaaf?path=/scoreboard&groups=80` (probe date) | `js/ncaaf.js fetchNCAAFScoreboard` | `minCount(events, 50)` on a Saturday probe date |
| NCAAF | `/api/ncaaf?path=/summary&event={id}` | `js/ncaafLiveGame.js fetchNCAAFSummary` | header, boxscore present on a final |
| NCAAF | `/api/ncaafstandings?season={y}` | `js/ncaaf.js fetchNCAAFStandings` | ≥ 120 teams across the tree |
| NCAAF | `/api/ncaafstats?season={y}` | `js/ncaaf.js` leaders loader | each category non-empty |
| MLB | `/api/mlb?url=…/schedule…&hydrate=linescore` (probe date) | `js/mlb.js fetchMLBSchedule` | `minCount(games, 8)` in season |
| MLB | `/api/mlb?url=…/standings…` | `js/mlb.js fetchMLBStandings` | `exactCount` 30 teams |

Thresholds are deliberately loose floors, not expected values: they exist to catch "a fraction of the real set," not to track the schedule. Exact paths per route are finalized during implementation by reading each mirrored parser.

## Season awareness (no calendar code)

The script does not port any sport's season model (`_nflSeasonPhase`, `MLB_SEASON`, etc.) into Node; a second copy of calendar logic is exactly what drifted in D-063. Instead, per sport:

1. Walk backward from yesterday, up to 10 days, querying that sport's scoreboard/schedule for each date until one has at least one final.
2. That date is the **probe date**. All date-dependent contracts run against it, and one final game's id from it feeds the `/summary` contract.
3. Day-of-week-specific floors (`minCount(events, 50)` for NCAAF) apply only when the probe date is the sport's main game day (Saturday for NCAAF, Sunday for NFL); otherwise the floor drops to `1`.
4. If no final exists within 10 days, the sport is reported **`SKIPPED — offseason`** and does not fail the run. Standings/leaders contracts for that sport still run, but with `minCount`/`exactCount` downgraded to warnings, since some offseason feeds legitimately empty out.

Past dates make results independent of when the job runs, and finals carry nearly every field the client reads.

## Alerting

- The workflow fails (red) on exit code `2`; GitHub's default notification emails the owner. Exit `1` (warn) passes the job but prints warnings in the run summary.
- On any failing route, the workflow opens or updates **one** GitHub issue per route titled `contract-drift: <id>`, labeled `contract-drift`, body = the failing paths/invariants plus the raw status/content-type. A route that fails nightly for a week updates the same issue with a dated comment, never files duplicates. When the route passes again, the workflow comments and closes the issue.
- Workflow permissions: `contents: read`, `issues: write`. Nothing else.

## Error handling

- Network error or non-2xx on a route: route fails with the status code and first 200 chars of the body.
- Probe-date discovery itself failing (the scoreboard is down on every date tried): the sport fails with "could not establish probe date" rather than silently skipping as offseason. Offseason means "reachable, no finals"; unreachable is a failure.
- A malformed contract (bad path syntax) exits `2` immediately with the contract id. A broken monitor must not look like a passing one.
- Request budget ~25 per run, sequential, well under the 120 req/min/IP `/api/*` rate limit (`functions/api/_middleware.js`).

## Testing

- `tests/contractCheck.test.js` (node:test, matching the existing `tests/*.test.js` style) covers the pure parts: path resolver (`[]`, `[0]`, missing keys, null, empty arrays), each invariant, probe-date walk-back against stubbed responses (finds final, offseason skip, unreachable fail), and HTML-response detection.
- Add it to the `/deploy-check` and `ci.yml` unit-test command list, and to CLAUDE.md's Deployment section, in the same commit (doc-sync rule).
- First live run is manual (`workflow_dispatch`), with its output checked against the real site before the cron is trusted.
- Deliberate-failure check before shipping: point one contract at a nonexistent path and confirm the run goes red and opens exactly one issue; fix it and confirm the issue closes.

## Open questions (resolve during implementation, not blocking)

- Whether `/api/nfl`'s path/param allowlist permits `dates=YYYYMMDD` on `/scoreboard` the way NCAAF's does. If not, the NFL probe uses `seasontype`+`week`, which `js/nflStandings.js` already sends.
- The exact `/api/nflstats` response shape for "each category non-empty" (read from `functions/api/nflstats.js` at implementation time).

## Context: where this sits in the automation pipeline

Agreed build order from the 2026-09-27/28 brainstorm: (1) this monitor, (2) release-QA agent + live-data verification ledger (target: live before NBA/NCAAB tip-off in October), (3) sibling-bug propagation across cloned sport files, (4) CLAUDE.md doc-sync + usage-weighted weekly planning from `page_views`. All agents open drafts only; only the owner merges. Each gets its own spec.
