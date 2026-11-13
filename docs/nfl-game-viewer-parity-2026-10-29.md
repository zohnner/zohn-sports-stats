# NFL game viewer: competitor parity audit (D-194)

2026-10-29. Branch `nfl-game-viewer-parity`. Audited live during CAR @ GB (TNF, event 401873023) on the production site and on a local build of this branch.

## How this was measured, and the limits of it

Our side of every row was checked twice: in code and on screen during a real game, in all three states. Live was 401873023 in Q2. Pregame was ARI @ DAL, 401873024. Final was CAR @ ARI, 401873271, a completed preseason game. Every field this branch reads was confirmed in a real payload. The confirmation ran on the browser-fallback path, which is the path production readers are on: the `/api/nfl` proxy answered 403 from both Cloudflare egress (D-176) and from this machine during the session, so the proxy path could not be exercised. Its payload is the same ESPN `site.web.api` `/summary` response, passed through unchanged (`functions/api/nfl.js`). The fallback is that same URL fetched directly.

Competitor columns are from working knowledge of those products as of mid-2026. **I did not re-verify them page by page this session** (no competitor game page was captured). Treat a competitor cell as a claim to spot-check, not as evidence. Where the "Source" column says a gap is not buildable, that claim *was* checked against the payload.

The Oct 27 competitive review (`workspace/research_notes/sportstrata-ux-competitive-review-20261027/`) is not on this machine or in the repo. Its positioning, as quoted in the brief, set the bar: dense, fast, free, no login; parity in data depth, not clutter.

Process note: the build started while the live window was open (a TNF game is the scarcest verification resource in the week), from audit notes taken first. This document was written up after, from those notes.

## Gap matrix

Key: **C** = competitors generally ship it. **Us (before)** = what production showed on 2026-10-29. **Now** = this branch. "Source" = whether ESPN `/summary` carries the data (checked).

| Feature | C | Us (before) | Now | Source |
|---|---|---|---|---|
| Win-probability chart | ESPN interactive, per-play hover; others static or none | Static sparkline, quarter ticks, top-5 swing dots linked to Key Plays | Interactive: hover, drag or arrow keys step through every play (quarter/clock, WP, swing, play text); away line dashed, labels carry line-style keys | `winprobability[]` keyed by `playId`, 1 entry per play (56/56 on 401873023) |
| Per-play WP swing | ESPN (in chart hover) | Key Plays top 5 only | Every play shows its swing (≥1 pt), labeled with the team it moved toward; administrative non-snaps excluded | Same |
| Drive chart | ESPN, CBS, NFL.com | Per-drive start→end bar in Play-by-Play | Unchanged, plus quarter + clock on each drive header | `drives[].start/end.yardLine`, `start.period/clock` |
| Play-by-play: down & distance, yard line | All | Yes | Yes | `plays[].start.downDistanceText` |
| Play-by-play: quarter/clock per play | All | No | Yes | `plays[].period.number`, `clock.displayValue` |
| Play-by-play: scoring / turnover / penalty flags | ESPN, CBS, Yahoo | Scoring tint only | TD/FG/TO/PEN tags | `scoringPlay`, `isTurnover`, `isPenalty`, `type.abbreviation` |
| Play-by-play filters | ESPN (scoring), NFL.com | None | All / Scoring / Turnovers / Big swings; survives polls | Derived |
| Scoring summary | All | Yes | Yes | `scoringPlays[]` |
| Team stats depth | ESPN ~20 rows | 8 rows | All 24 distinct stats ESPN sends, 5 sections, share bars | `boxscore.teams[].statistics` (25 incl. a duplicate) |
| Box score: defense, kicking, returns | ESPN, CBS, NFL.com | **Already had it** (all 10 groups) | Unchanged | `boxscore.players[].statistics` |
| Pregame: matchup stats | ESPN, CBS | None | Season averages card (8 per-game stats per team) | `boxscore.teams[]` pregame = season averages (401873024) |
| Pregame: records, recent form, injuries | All | Yes (form strip, injuries, win projection) | Unchanged | `lastFiveGames`, `injuries`, `predictor` |
| Pregame/live: venue, weather, TV, officials | ESPN, CBS | Venue + TV in a footnote | Game Info card: kickoff, venue + city, surface, outside temp/gusts, TV, attendance (final), referee | `gameInfo.venue/weather/attendance/officials` |
| Pregame leaders labeled correctly | n/a | **Bug**: season totals titled "Game Leaders" | "Season Leaders" pregame | `leaders[]` holds season totals pregame |
| Postgame recap stats / leaders | All | Leaders, key plays, WP chart, scoring | Plus Game Info (attendance, referee) | Same |
| Postgame written recap | ESPN, Yahoo (wire/AP) | None | None | `article` only appears pregame (preview); none post on 401873271. Not buildable without a writer. |
| Freshness signaling | Mostly implicit ("LIVE") | None on the page (ticker only) | "Updated Xs ago" receipt in the header while polling; turns loss-color after 3 missed polls | Fetch time via `noteFetched('nfl/summary')` |
| Shareable URLs | Per game; tabs mostly not | Per game; tab lost on share/refresh | Tab deep-links: `#nfl-game-{id}-{pbp,box,team,analytics,fantasy}`, honored on edge paths too | n/a |
| Structured data | ESPN, CBS (SportsEvent) | **Missing in production**: the edge template's ESPN fetch is blocked (D-176), so `/nfl/game/{id}` fell back to the shell with only the Organization graph | Client emits SportsEvent from the rendered payload; edge block shares its element id and shape | n/a |
| Color-collision safety | Mixed | Hue only (pair-resolved by `_matchupTeamColors`) | Second channel: dashed away line + line-style keys; Game Flow end-score labels | n/a |
| Mobile layout | All | Stacked below 900px | Unchanged; new rows stack at 640px, no horizontal overflow | n/a |
| Live video / autoplay highlights | ESPN, NFL.com, FOX | None | **None by design** | `videos[]` empty on 401873023 |
| Odds on the game page | ESPN, CBS, FOX | Pregame Odds card + odds in footnote | Unchanged (flagged below) | `pickcenter` |
| EPA / CPOE / success rate | ESPN (some), NFL.com NGS | Success rate + drive efficiency (computed) | Unchanged | Not in `/summary`; see Phase 3 |

### Bugs found during the audit (fixed)

- **Game Flow plotted concatenated strings.** `/summary` linescores carry only a string `displayValue` (no numeric `value`, 401873023), so the cumulative sum built "0"+"3"+"7" = "037". The legend showed "CAR 037" live, and the chart's y-values were wrong for every game. Now coerced.
- **Fantasy Leaders sidebar rows broke into three lines.** The card kept the pre-D-134 row markup after D-134 restyled `.nlg-leader-row`.
- **Pregame "Game Leaders" showed season totals** ("178/273, 1,851 YDS, 13 TD").
- **No SportsEvent JSON-LD in production** (see matrix).
- **`--text-subtle` used for numerals** (down & distance, card sub-labels, leader categories) is unguarded by `check-themes.cjs`, and measures about 1.6:1 on the Monarchs theme. Those viewer classes moved to `--text-muted`.

### Seen, not fixed (out of scope)

- The score ticker lagged the game header by one or more polls on both production and local (header 10:44, ticker 11:20). That's the ticker's own cadence and a separate component.
- ESPN does not flag the opening-kickoff fumble that CAR recovered as `isTurnover`, only the Q2 fumble. The Turnovers filter shows what ESPN flags. Inferring turnovers from text was rejected as guessing.
- `--text-subtle` on Monarchs is low-contrast site-wide, not just here. Adding it to `check-themes.cjs` would surface every use; that's a theme-wide pass, not this one.

## Ranking (fan value per unit of risk)

1. **Team stats depth.** Zero new fields (already fetched), 3x the rows, every competitor has it.
2. **Play-by-play richness + filters.** Verified flags on every play; the WP-per-play join is exact (56/56).
3. **Pregame matchup + game info.** Two cards from fields already in the payload; fills the thinnest state.
4. **Trust fixes** (season-leaders label, Game Flow bug, fantasy rows). Tiny, and each one was visibly wrong.
5. **Interactive WP chart** (hover per play). Built in a second pass after the owner said continue: both chart sizes, pointer + touch drag + keyboard (arrows, Home/End, Escape), position and focus survive the 20s re-render.
6. *Not built:* a written recap. No source.

Items 1-5 shipped. 6 is deferred; reason above.

## Verification log

| Check | Event | Path | Result |
|---|---|---|---|
| `/summary` keys, play flags, WP join | 401873023 (live, Q2) | ESPN direct (= fallback) | `start/end`, `isTurnover`, `isPenalty`, `scoringPlay`, WP 56/56 |
| Pregame team stats, leaders, weather | 401873024 | ESPN direct | 8 season stats, season-total leaders, `weather.temperature/gust` |
| Final attendance/officials, no weather | 401873271 | ESPN direct | 18,116; 7 officials; `weather` null |
| `/api/nfl` proxy | 401873023 | proxy | 403 (D-176 egress block, ongoing) |
| Production JSON-LD | 401873023 | sportstrata.cc | Organization graph only, no SportsEvent |
| Viewer on this branch, all states | 401873023 / 401873024 / 401873271 | local build, browser fallback | Tabs, filters, receipt, JSON-LD, Game Info, labels all as intended |
| Tab deep-link cold load + hash sync | 401873023 | local | `#nfl-game-401873023-team` opens Team Stats; switching rewrites hash + history state |
| Mobile | 401873023 | local, 500px (window minimum) | No horizontal overflow; Team Stats rows and bars stack |
| WP scrubber | 401873023 (live, Q2 2:00, two-minute warning) | local | Hover, End/ArrowLeft/Escape, re-render keeps index 78 + focus, blur clears; Two-Minute Warning shows no swing |
| Regular-season final | 401873023 (Final, GB 27 CAR 19) | local, browser fallback | Receipt gone, poll timer off; JSON-LD has no `eventStatus`, description ends "Final: Carolina Panthers 19, Green Bay Packers 27."; Game Info drops Outside, shows Attendance 76,957 + referee; Game Flow 19/27 matches the linescore; tabs + hash, filters (195 all / 8 scoring / 3 turnovers / 12 swings) and the full-game scrubber (Home → End) work |
| Key Plays on the final | 401873023 | local | **Bug, fixed:** pre-existing D-169 ranking listed "Official Timeout at 12:12." as Key Play #2 (40% WP swing). `_nlgWpSwings` now skips admin plays, which also covers the chart dots and the break card's biggest play; the game had 23 timeouts. |

Not live-verified: the edge template's new JSON-LD fields. It cannot reach ESPN from Cloudflare today, and its output shape mirrors the client builder, which is tested (`tests/nflGameParity.test.js`).

## Odds (owner call, resolved)

The brief said "no odds injected into the game page". The viewer already shipped a pregame **Odds** card (`_nlgOddsCard`) and a spread/total in the live/final caption, both from before this pass. Owner decision 2026-10-29: keep both. They are data with no sportsbook links; the rule means parity work adds none.

## Phase 3 spike: SportStrata-original analytics (do not build yet)

**Premise change.** D-081 deferred EPA/CPOE because nflverse had no 2026 play-by-play (404 on 2026-08-09), and the Analytics tab caption still says so. As of today that is false. `play_by_play_2026` exists in the nflverse `pbp` release, refreshed 2026-10-29 16:04 UTC: 7.4 MB `.csv.gz` / 8.0 MB `.parquet`, 18,738 plays, 107 games, weeks 1-7 complete. The caption should be corrected when this is picked up.

**Dataset.** 372 columns, including `epa`, `wpa`, `wp`, `cpoe`, `success`, `qb_epa`, `air_epa`, `yac_epa`, `xpass`, `pass_oe`, keyed by `game_id` (`2026_07_TB_CAR`) + `play_id`. The join to our pages is deterministic: nflverse `games.csv` carries an `espn` column (ESPN event id → `game_id`). No name matching like the Sleeper bridge needs.

**Cadence and its consequence.** nflverse refreshes after games, not during them. I'm not sure of the exact schedule; today's file held every completed week, with tonight's game absent. So these numbers can only ever describe **completed** games. For a live game the Analytics tab can honestly show only what it computes today (success rate, drive efficiency). For a final game, once nflverse has it, it could show:

- EPA/play and success rate by team, split pass/rush, from nflverse's own model.
- QB line: dropbacks, EPA/dropback, CPOE.
- WPA leaders: the plays and players that moved the game most, on nflverse's WP model. Label it as a different model from ESPN's chart, or don't show both side by side.
- "Pass rate over expected" (`pass_oe`) per team.

**Where it would live.** The pattern already exists in `functions/api/nfladv.js` / `functions/_nflverse.js`: fetch the release asset through the edge, cache by volatility. One season's CSV is too big to fetch per request. Two workable shapes:

1. A daily GitHub Action (the `tools/nba-standings.cjs` model) reduces the season file to per-game aggregates, a few KB per game, committed to `content/nfl/advanced/{game_id}.json` and read by the viewer. No runtime dependency on GitHub release hosting.
2. A Pages Function that streams `.csv.gz`, aggregates one `game_id`, and caches for days. Simpler to ship, but CPU-bound on a 37 MB uncompressed file per cold miss.

Recommendation: shape 1. It matches how NBA standings already work, keeps CPU off the edge, and makes the "computed by us from nflverse, CC-BY-4.0" credit (`NFLVERSE_CREDIT`) a static fact on each file.

**Effort.** One aggregator script plus tests, one workflow, one Analytics-tab section with a "final games only, via nflverse" receipt. Its own D-number, three-gate review, and a two-week burn-in against real finals before it's trusted.
