# ZohnStats — Issues & Roadmap

> Ordered by priority. P1 = broken / crashes. P2 = significant UX gap. P3 = correctness/edge case. P4 = polish/future.
> Each entry has the file:line, severity, and enough context to act without re-investigating.

---

## P1 — Fix Now (Broken / Crashes)

### [P1-001] MLB ticker scrolls too fast
- **File:** `js/mlb.js` (ticker build) + `css/ticker.css:56` (`.ticker` animation)
- **Root cause:** Duration is hardcoded at 50s regardless of how many games are in the strip. MLB can have 10–15 games; the combined item width is 3–4× a typical NBA ticker, so it blurs past unreadably.
- **Fix:** After rendering ticker items, read the rendered `scrollWidth` and set `animationDuration = scrollWidth / 80 + 's'` (80px/s is comfortable reading speed). Apply the same dynamic calc to the NBA ticker too.

### [P1-002] MLB scores not loading correctly
- **File:** `js/mlb.js:87` (schedule fetch), `js/mlb.js:61` (mlbFetch)
- **Root cause (two issues):**
  1. `mlbFetch` does not validate the JSON response — a non-JSON error body throws an unhandled TypeError instead of a clean failure.
  2. The date string passed to the schedule endpoint is computed in local time but the MLB API expects ET/UTC; off-by-one on the date late at night shows the wrong day's games.
- **Fix:** Wrap `res.json()` in a try/catch in `mlbFetch`; use a consistent UTC-to-ET date helper for all MLB date params.

### [P1-003] MLB stats API crashes player tab on load
- **File:** `js/mlb.js:101-119` (`fetchMLBLeagueStats`)
- **Root cause:** `data.stats[0]` is accessed without checking if `data.stats` exists or has entries. If the API returns an unexpected shape, a TypeError is thrown and the entire MLB Players tab never renders.
- **Fix:** Guard with `if (!data?.stats?.[0]?.splits)` and surface an empty-state instead of crashing.

### [P1-004] Silent fetch failures — no global unhandled rejection handler
- **File:** `js/app.js:58-93`, `js/navigation.js:144`
- **Root cause:** Top-level promise chains have no `.catch()`. `fetchMLBSchedule(7)` in the sport switcher also has no `.catch()`. If any API call fails, the user sees nothing — no error toast, no empty state, no indication of failure.
- **Fix:** Add `window.addEventListener('unhandledrejection', ...)` in `errorHandler.js` to at minimum fire a toast. Add `.catch()` to the sport-switcher fetch in `navigation.js`.

### [P1-005] NBA Teams — no drill-down (team → recent games → game detail → player)
- **File:** `js/teams.js:114-178`, `js/games.js`, `js/playerDetail.js`
- **Root cause:** `showTeamDetail` renders a roster but there is no navigation to recent games, no game box score view, and no link from team context into a player's stat page.
- **Fix:** Add three sub-views:
  1. `team-detail`: roster + last-N-games sidebar (BDL games endpoint filtered by team ID, already used in `games.js`)
  2. `game-detail`: box score with quarter scores + top performers (expand existing game card component)
  3. Player links on roster rows that fire the same navigation event used in the Players view

---

## P1 — Newly Found

### [P1-006] Box score stats show for DNP/inactive players — **Fixed**
- `_boxScoreTable` now filters out rows where `min` is null/`'00'`/`0` and all counting stats are zero.
- `js/teams.js`

### [P1-007] Team recent-games list empty during off-season — **Fixed**
- `fetchTeamGamesAPI` now falls back to `CURRENT_SEASON - 1` if the primary fetch returns 0 games.
- `js/api.js`

---

## P2 — High Priority (Significant UX Degradation)

### [P2-001] NBA stats map crash on malformed response shapes — **Fixed**
- Added `resultSet?.headers` + `Array.isArray(resultSet?.rowSet)` validation before destructuring. Throws a descriptive error instead of a TypeError if the NBA.com endpoint changes shape.
- `js/api.js`

### [P2-002] Player detail — league ranks wrong until page refresh — **Fixed**
- `showPlayerDetail` now awaits `fetchNBAStatsMap` in parallel with `fetchPlayerGamesAPI` using `Promise.all`. If the map is already cached, resolves instantly.
- `js/playerDetail.js`

### [P2-003] Per-36 button loses its click handler after first toggle — **Fixed**
- Replaced `card.outerHTML =` with `card.insertAdjacentHTML('afterend', ...) + card.remove()`. New node is inserted in the correct DOM position before the old one is removed, eliminating any race with chart renders.
- `js/playerDetail.js`

### [P2-004] Game status detection fragile — misses HALFTIME, OT, PPD
- **File:** `js/games.js:70-72`
- **Detail:** Live detection is `status.includes('Q')`. Does not match "HALFTIME", "2ND HALF", "OT", or "PPD" (postponed). Wrong badge shown on those games.
- **Fix:** Expand status map: `HALFTIME|HALF` → live, `OT` → live, `PPD|POSTPONED` → own pill, `FINAL/F/` → final.

### [P2-005] Standings crash if any team has null streak value
- **File:** `js/standings.js:54`
- **Detail:** `streak.startsWith('W')` throws if `streak` is null/undefined.
- **Fix:** `const isWin = streak?.startsWith?.('W') ?? false;`

### [P2-006] mlbFetch has no JSON validation — malformed response crashes app
- **File:** `js/mlb.js:61-76`
- **Detail:** `res.json()` is called unconditionally. A 5xx plain-text error body throws a SyntaxError that propagates uncaught.
- **Fix:** Check `res.ok` first; use `try/catch` around `res.json()` and return a normalized error object.

### [P2-007] db.js team lookup fails on case mismatch — **Fixed**
- `syncStandings` and `syncPlayers` now normalize `teamAbbr` to uppercase at write time so all IDB lookups consistently match the uppercase input in `getTeamByAbbr`.
- `js/db.js`

### [P2-008] Leaderboard only shows top 8 — no way to see rank 9+
- **File:** `js/leaderboards.js:71`
- **Detail:** `slice(0, 8)` is hardcoded. Users have no way to expand or paginate.
- **Fix:** Default to 10, add a "Show more" button that reveals to 25, then 50.

---

## P3 — Medium Priority (Correctness / Edge Cases)

### [P3-001] BDL fetch silent partial failure on chunked player loads — **Fixed**
- `fetchPlayerStatsAPI` now counts failed chunks; if any fail, fires a warn toast "X stat batches failed to load — some players may show incomplete stats."
- `js/api.js`

### [P3-002] Quarter scores show blank if API shape changes
- **File:** `js/games.js:83-114`
- **Detail:** Assumes `game.home_q1`, `game.home_q2`, etc. — specific BDL field names. Defaults to `—` on missing fields but no logging. Shape changes are invisible.
- **Fix:** Document expected shape in a comment; add a dev-mode console.warn if expected fields are absent.

### [P3-003] Rank badges O(n log n) per search keystroke — **Fixed**
- `loadStatsForPlayers` now builds and caches `AppState.ppgRankMap` once after stats load. `displayPlayerCards` reads it directly — no sort on every keystroke.
- `js/players.js`, `js/api.js`

### [P3-004] Stat Builder formula word-boundary — **Non-issue / Already Fixed**
- Code already uses `new RegExp('\\b' + k + '\\b', 'g')` for all stat replacements. `\b` prevents `pts` from matching inside `3pts` since `3` is `\w`. Audit finding was incorrect.

### [P3-005] localStorage cache failure silent — **Fixed**
- `ApiCache.set` now fires a one-time toast "Cache unavailable — stats will reload each visit" on the first write failure. Subsequent failures are logged only. Uses `requestAnimationFrame` to ensure `ErrorHandler` is ready.
- `js/cache.js`

### [P3-006] Formula validated against only first player — **Fixed**
- `_tryFormula` now accepts the full player array and tries up to 5 samples, returning `ok: true` as soon as one succeeds. False rejections from a single player's zero/null stat are eliminated.
- `js/statBuilder.js`

### [P3-007] ESPN headshot/athlete map fails silently — all headshots fall back
- **File:** `js/api.js:251-281`, `js/api.js:291`
- **Detail:** On any ESPN API error, returns `{}` map. Every player then gets initials fallback with no log. Hard to detect ESPN being down.
- **Fix:** Log a console.warn with the error so it's visible in DevTools; consider a lightweight retry.

### [P3-008] Ask engine — no .catch() on IndexedDB pattern handlers
- **File:** `js/ask.js` (throughout pattern handlers)
- **Detail:** `.then()` chains have no `.catch()`. If IndexedDB is unavailable, ask engine returns nothing silently.
- **Fix:** Add `.catch(err => AskEngine.showError('Could not query local database'))` to each handler chain.

---

## P4 — Low Priority / Polish

### [P4-001] API key exposed in client-side source
- **File:** `js/api.js:6`
- **Detail:** `BDL_API_KEY` is visible in source. If the repo is public or the site is inspected, the key can be scraped and rate-limited.
- **Fix:** Cloudflare Worker proxy that holds the key server-side; see PLAN-003 below.

### [P4-002] Live search result ordering not guaranteed under slow network
- **File:** `js/players.js:389-425`
- **Detail:** Uses Symbol to cancel stale renders but relies on Promise resolution order. Under a slow network, results for "AB" can arrive after "ABC".
- **Fix:** Use AbortController on the fetch, or tag each render with a monotonic counter and discard out-of-order results.

### [P4-003] Hash parsing too permissive — malformed hash silently falls to home
- **File:** `js/navigation.js:329`
- **Detail:** `#player-123-extra` doesn't match the regex and user gets the home view with no feedback.
- **Fix:** If hash starts with `#player-` but doesn't match, show a "Player not found" toast before redirecting.

### [P4-004] Leaderboard bar division by zero
- **File:** `js/leaderboards.js:95`
- **Detail:** `barPct = (val / topVal) * 100` — if all players have 0 for a stat, `NaN%` bar widths render.
- **Fix:** `const barPct = topVal > 0 ? (val / topVal) * 100 : 0;`

### [P4-005] Ticker flickers on first load before games fetch resolves
- **File:** `js/app.js:73-75`
- **Detail:** "Loading scores…" placeholder is replaced once games arrive. On fast connections it's a flash; on slow it lingers.
- **Fix:** Skeleton shimmer items instead of a single text placeholder.

### [P4-006] Team color fallback is always gray — typos in abbreviations invisible
- **File:** `js/config.js:44-45`
- **Detail:** Any unknown abbreviation silently gets gray. A one-character typo in a team abbr is indistinguishable from a valid team with that color.
- **Fix:** In dev mode, console.warn on unknown abbreviations.

### [P4-007] Stat formula re-parsed per player — **Fixed**
- `_runFormula` now calls `math.compile(formula)` once to get a compiled AST, then calls `compiled.evaluate(scope)` with a per-player scope object. Also pre-filters stat keys that appear in the formula to minimize scope construction.
- `js/statBuilder.js`

### [P4-008] Ask engine regex matching is O(n×m) per query
- **File:** `js/ask.js` (pattern matching loop)
- **Detail:** 30+ patterns × 3 regexes each = 90+ regex tests per query. Fine now but will slow as patterns grow.
- **Fix:** Group patterns by first-word keyword to reduce tests per query.

---

## Future Sports Expansion

### [PLAN-001] NFL support — architecture prep
- **Status:** Planning (after MLB bugs resolved)
- **API:** ESPN public API (`site.api.espn.com`) — same domain already in CSP, free, no key
- **New files:** `js/nfl.js` (mirror of `mlb.js` structure)
- **HTML:** Remove `disabled` from the existing NFL nav placeholder button
- **State:** `currentSport = 'nfl'` — pattern already exists in `app.js`

### [PLAN-002] NHL support — architecture prep
- **Status:** Planning (after NFL)
- **API:** NHL Stats API (`api-web.nhle.com`) — official, free, no key
- **CSP additions:** `connect-src += https://api-web.nhle.com`, `img-src += https://assets.nhle.com`
- **New files:** `js/nhl.js`

### [PLAN-003] Multi-sport shared infrastructure
- **Goal:** Prevent copy-paste pattern across nfl.js / nhl.js
- **Ideas:**
  - `SportModule` interface: `{ init, loadPlayers, loadGames, loadStandings, loadLeaders, getLogoUrl }`
  - `js/ticker.js` standalone module accepting a normalized game array (all sports share one ticker renderer)
  - Shared standings table parameterized by sport
  - Cloudflare Worker proxy for all keyed API calls (solves P4-001 too)

### [PLAN-004] Remove `'unsafe-inline'` from CSP
- **Blocker:** Inline `onclick`/`onkeydown` in `index.html` + `onerror`/`onload` strings in `games.js`
- **Fix:** Migrate all to `addEventListener`; then drop `'unsafe-inline'` from both `_headers` and the meta-tag CSP

---

## MLB Improvements — Stats & Visualizations

> Research basis: MLB Stats API official docs, Baseball Savant / Statcast glossary, FanGraphs sabermetrics reference (2025).
> Ordered by implementation complexity. All data available from `statsapi.mlb.com` (free, no key) unless noted.

### [MLB-001] Player Detail — Charts (P1 feature gap vs NBA)
- **Status:** Not started
- **Problem:** MLB player detail page has zero charts. NBA detail has radar, bar chart, and 10-game trend line. This is the single biggest quality gap between the two sports.
- **Recommended charts — Hitters:**
  1. **Radar / spider** — 6 axes: AVG (norm to .400), HR (norm to 60), RBI (norm to 140), OBP (norm to .500), SLG (norm to .700), SB (norm to 70). Same `StatsCharts.radar()` pattern as NBA.
  2. **Horizontal bar — hitting profile** — OBP, SLG, OPS, ISO, BABIP, K%, BB%. Visual benchmarks: league average overlay line per bar.
  3. **Line trend — season game log** — PTS/AVG, HR, RBI over last 20 games. Requires `/people/{id}?hydrate=stats(group=hitting,type=gameLog,season={year})`.
- **Recommended charts — Pitchers:**
  1. **Radar** — 5 axes: ERA (inverted, norm 0–6), K/9 (norm to 14), BB/9 (inverted, norm 0–6), WHIP (inverted, norm 0–2), IP (norm to 220).
  2. **Horizontal bar — arsenal summary** — ERA, FIP, WHIP, K/9, BB/9, K/BB with league-average benchmarks.
  3. **Line trend** — ERA, WHIP, K/9 rolling over last 5 starts (game log, `group=pitching`).
- **Files:** `js/mlb.js` (`showMLBPlayerDetail`), `js/charts.js` (reuse `StatsCharts`)
- **API endpoints:**
  - Game log: `GET /people/{id}?hydrate=stats(group=[hitting|pitching],type=gameLog,season={year})`

---

### [MLB-002] Advanced Stats — Hitters (missing from all views)
- **Status:** Phase 1 done — OBP, SLG added to player cards; OBP, SLG leaderboard panels added
- **Currently shown on cards:** AVG, OBP, SLG, OPS, HR, RBI
- **Currently shown on detail:** AVG, OBP, SLG, OPS, HR, RBI, R, H, SB, BB, SO, GP
- **Add to player detail stat grid:**
  - `wOBA` — Weighted On-Base Average; the single best rate stat for overall offensive value. Formula: `(0.69×BB + 0.72×HBP + 0.89×1B + 1.27×2B + 1.62×3B + 2.10×HR) / PA`. MLB Stats API returns it as `wOBA` in season splits.
  - `ISO` — Isolated Power = SLG − AVG. Measures raw power, removes AVG noise.
  - `BABIP` — Batting Average on Balls In Play. Luck/regression indicator. MLB API field: `babip`.
  - `K%` — Strikeout rate = SO / PA. More meaningful than raw SO count.
  - `BB%` — Walk rate = BB / PA.
  - `AB`, `PA` (plate appearances) — context for all rate stats.
  - `2B` (doubles), `3B` (triples) — available in splits, currently hidden.
- **Add to table columns:** wOBA, ISO, BABIP (togglable column group or expandable table)
- **Add to leaderboards:** wOBA (replaces OPS as primary advanced hitting leader), ISO, BABIP
- **File:** `js/mlb.js`

---

### [MLB-003] Advanced Stats — Pitchers (missing from all views)
- **Status:** Phase 1 done — K/9 added to player cards and stat bars; WHIP, K/9, SV leaderboard panels added
- **Currently shown on cards:** ERA, WHIP, W-L, SO, K/9, SV
- **Currently shown on detail:** ERA, W, L, SO, WHIP, IP, BB, GP, GS, SV, HLD, H
- **Add to player detail stat grid:**
  - `FIP` — Fielding Independent Pitching. Removes defense/luck. Formula: `(13×HR + 3×(BB+HBP) − 2×K) / IP + FIP_constant` (~3.10 for 2024). MLB API field: `fieldingIndependentPitching`.
  - `K/9` — Strikeouts per 9 innings = (SO / IP) × 9. MLB API: `strikeoutsPer9Inn`.
  - `BB/9` — Walks per 9 innings = (BB / IP) × 9. MLB API: `walksPer9Inn`.
  - `K/BB` — Strikeout-to-walk ratio. MLB API: `strikeoutWalkRatio`.
  - `HR/9` — Home runs per 9 innings. MLB API: `homeRunsPer9`.
  - `QS` — Quality Starts (6+ IP, ≤3 ER). MLB API: `qualityStarts`.
  - `GO/AO` — Ground ball to fly ball ratio. MLB API: `groundOutsToAirOuts`.
  - `BAA` — Batting average against. MLB API: `avg`.
- **Add to leaderboards:** FIP (replaces or joins ERA), K/9, K/BB
- **File:** `js/mlb.js`

---

### [MLB-004] MLB Team Drill-down — Full Parity with NBA Teams (P1 feature gap)
- **Status:** Not started
- **Problem:** MLB Teams page shows a static info card only. NBA has: roster + season averages → recent 12 games → game box score → player detail navigation. MLB needs the same.
- **Sub-views to build:**
  1. **`mlb-team-detail`** — roster (active 26-man) + last 12 game results (W/L, date, opponent, runs, click to expand)
     - Roster API: `GET /teams/{id}/roster?rosterType=active&season={year}&hydrate=person(stats(group=hitting,type=season))`
     - Games API: reuse `fetchMLBSchedule` filtered by team ID, or `GET /schedule?teamId={id}&startDate=...&endDate=...`
  2. **`mlb-team-game-detail`** — full linescore by inning + both team batting/pitching box scores
     - Linescore: `GET /game/{gamePk}/linescore`
     - Box score: `GET /game/{gamePk}/boxscore`
     - Show: inning-by-inning run grid (R/H/E), batting order with AB/R/H/RBI/BB/SO/AVG, pitching with IP/H/R/ER/BB/SO/ERA
  3. **Player links** — clicking any batter/pitcher in box score or roster opens `showMLBPlayerDetail`
- **Hash routing:** `#mlb-team-{id}`, `#mlb-team-{id}-game-{gamePk}`
- **File:** `js/mlb.js`, `js/navigation.js`
- **CSP:** `connect-src` already includes `statsapi.mlb.com`

---

### [MLB-005] MLB Standings — Not Implemented
- **Status:** Not started
- **Problem:** NBA has full standings with playoff zones, win %, GB, last-10, streak, clinch badges. MLB has nothing.
- **Build:**
  - AL East / AL Central / AL West / NL East / NL Central / NL West division tables
  - Columns: Team, W, L, PCT, GB, L10, Streak, Home, Away, RS, RA, DIFF
  - Playoff zone separators: Division leader (top 1), Wild Card (next 2), Play-in (N/A in MLB), Eliminated
  - API: `GET /standings?leagueId=103,104&season={year}&standingsTypes=regularSeason&hydrate=team,league,division,sport,conference`
- **File:** `js/mlb.js` (new `loadMLBStandings` + `displayMLBStandings`)
- **Nav:** Add "Standings" tab to MLB nav (mirror of NBA pattern in `index.html`)

---

### [MLB-006] MLB Game Detail — Linescore + Box Score
- **Status:** Not started
- **Problem:** Clicking an MLB game card does nothing. NBA game cards open a full box score. MLB needs inning-by-inning scoring and player stat lines.
- **Build:**
  - Click any game card → `showMLBGameDetail(gamePk)`
  - Linescore table: innings 1–9 (+ extras) for both teams, totals R/H/E
  - Pitching summary: starting pitcher, W/L/S decision, final line
  - Batting box: both teams' order with AB/R/H/RBI/HR/BB/SO
  - Player name links fire `showMLBPlayerDetail`
- **API:** `GET /game/{gamePk}/linescore` + `GET /game/{gamePk}/boxscore`
- **File:** `js/mlb.js`

---

### [MLB-007] MLB Position Filter on Players Page
- **Status:** Not started
- **Problem:** NBA player grid has position filters (All / G / F / C). MLB has only Hitters / Pitchers toggle, no position sub-filter.
- **Add for Hitters:** All / C / 1B / 2B / 3B / SS / LF / CF / RF / OF / DH
- **Add for Pitchers:** All / SP (Starter) / RP (Reliever) / CL (Closer)
- **Data available:** `split.position.abbreviation` already in `AppState.mlbPlayers` as `position`
- **File:** `js/mlb.js`

---

### [MLB-008] MLB Radar Chart — Positional Normalization
- **Status:** Not started (depends on MLB-001)
- **Problem:** Normalizing HR to 60 is unfair to catchers and middle infielders. Speed/contact players (SB leaders) look poor on power axes.
- **Fix:** Apply position-aware normalization constants for the radar chart:
  - Power positions (1B/3B/DH/OF): HR max=55, RBI max=130
  - Contact/speed positions (2B/SS): HR max=25, SB max=50, AVG max=.350
  - Catchers: HR max=30, RBI max=90
- **File:** `js/mlb.js`, `js/charts.js`

---

### [MLB-009] MLB Hitting Splits — vs L / vs R / Home / Away
- **Status:** Not started
- **Problem:** No split-level breakdown for hitters. This is a core baseball analytical lens.
- **Data:** `GET /people/{id}?hydrate=stats(group=hitting,type=vsLeft,season={year})` and `vsRight`, `homeAndAway`
- **Build:** Tabbed sub-section in player detail: Overall / vs LHP / vs RHP / Home / Away
- **Visualize as:** Horizontal bar comparison (AVG/OBP/SLG side by side per split) — same `_mlbStatBar` pattern
- **File:** `js/mlb.js`

---

### [MLB-010] Ask ZohnStats — MLB Support
- **Status:** Not started
- **Problem:** Ask ZohnStats only queries NBA data. Switching to MLB and asking "Who leads in ERA?" returns nothing.
- **Add patterns:**
  - `"who leads in [stat]"` → query `AppState.mlbLeaderSplits`
  - `"[team] record"` → query `AppState.mlbStandings`
  - `"[player name] stats"` → look up in `AppState.mlbPlayerStats`
  - `"games today"` / `"yesterday's scores"` → query `AppState.mlbGames`
- **Gate by `AppState.currentSport`** so patterns activate for the correct sport
- **File:** `js/ask.js`

---

## Product Roadmap

> Phases are ordered by dependency and user value. Each phase is independently deployable.

---

### Phase 0 — Stabilize (Current Sprint)
**Goal:** Zero P1/P2 crashes. Every existing feature works reliably.

| ID | Task | File(s) | Effort |
|---|---|---|---|
| [P2-006] | mlbFetch JSON validation | `js/mlb.js:61` | XS |
| [P3-005] | localStorage quota toast | `js/cache.js:58` | XS |
| [P3-006] | Formula builder — test against best-stat player | `js/statBuilder.js:113` | XS |
| [P4-004] | Leaderboard bar division by zero | `js/leaderboards.js:95` | XS |
| [P4-002] | AbortController on stale search fetches | `js/players.js:389` | S |
| [P3-003] | Rank badge computation caching | `js/players.js:119` | S |
| [P3-008] | Ask engine `.catch()` on IDB handlers | `js/ask.js` | S |

**Exit criteria:** No uncaught exceptions during normal use on NBA + MLB tabs.

---

### Phase 1 — MLB Parity: Stats & Detail
**Goal:** MLB player detail matches NBA player detail in depth. Every stat card is informative.

| ID | Task | Effort |
|---|---|---|
| [MLB-002] | Add wOBA, ISO, BABIP, K%, BB%, PA to hitting stat grid | S |
| [MLB-003] | Add FIP, K/9, BB/9, K/BB, QS, GO/AO to pitching stat grid | S |
| [MLB-001] | Hitter radar chart (AVG/HR/RBI/OBP/SLG/SB) | M |
| [MLB-001] | Pitcher radar chart (ERA/K9/BB9/WHIP/IP inverted axes) | M |
| [MLB-001] | Horizontal bar — hitter profile with league-avg benchmarks | M |
| [MLB-001] | Horizontal bar — pitcher arsenal summary | M |
| [MLB-007] | Position filter on MLB players page | S |
| [MLB-002] | Add wOBA + ISO to MLB leaderboard categories | S |
| [MLB-003] | Add FIP + K/9 to MLB leaderboard categories | S |

**Exit criteria:** Opening any MLB player shows a radar chart and 8+ advanced stats with visual progress bars.

---

### Phase 2 — MLB Parity: Navigation & Games
**Goal:** MLB achieves full drill-down parity with NBA (team → games → box score → player).

| ID | Task | Effort |
|---|---|---|
| [MLB-005] | MLB Standings page (6 division tables, playoff zones) | M |
| [MLB-004] | MLB Team detail — roster + last 12 games | L |
| [MLB-006] | MLB Game detail — linescore by inning + box score | L |
| [MLB-004] | Player links from MLB box score → player detail | S |
| Navigation | `#mlb-team-{id}`, `#mlb-team-{id}-game-{pk}` hash routing | S |

**Exit criteria:** User can navigate from MLB teams list → any team → any recent game → full inning linescore and batting/pitching box score → any player's stat page.

---

### Phase 3 — MLB Game Log Trend Charts
**Goal:** Show players' performance trajectory over the season, the most compelling "story" feature.

| ID | Task | Effort |
|---|---|---|
| [MLB-001] | Fetch game log for hitters (`type=gameLog`) | S |
| [MLB-001] | Line chart: AVG / HR / RBI rolling over last 20 games | M |
| [MLB-001] | Fetch game log for pitchers | S |
| [MLB-001] | Line chart: ERA / K / IP rolling over last 5 starts | M |
| [MLB-009] | Hitting splits sub-section (vs L / vs R / Home / Away) | M |
| [MLB-008] | Position-aware radar normalization | S |

**Exit criteria:** Every MLB player detail page shows a line trend chart for the last 20 games/5 starts.

---

### Phase 4 — MLB Ask ZohnStats + Stat Builder
**Goal:** Natural language and custom formula support reaches MLB.

| ID | Task | Effort |
|---|---|---|
| [MLB-010] | Ask ZohnStats — MLB patterns (leaders, records, scores) | M |
| Stat Builder | MLB hitter formula variables (avg, obp, slg, hr, rbi, sb, woba, iso) | S |
| Stat Builder | MLB pitcher formula variables (era, fip, k9, bb9, whip, ip, sv) | S |

**Exit criteria:** "Who leads in FIP?" and "Dodgers record?" return accurate answers from the Ask panel when on MLB tab.

---

### Phase 5 — NFL Support
**Goal:** Third sport on the platform; proves the multi-sport architecture.

| Task | File(s) | Notes |
|---|---|---|
| Create `js/nfl.js` (mirror of `mlb.js` structure) | `js/nfl.js` | ESPN public API, no key needed |
| Remove `disabled` from NFL nav button | `index.html` | |
| NFL Players: QB ratings, passing/rushing/receiving leaders | `js/nfl.js` | ESPN `/sports/football/nfl/athletes` |
| NFL Teams: record, division, recent 5 games | `js/nfl.js` | |
| NFL Games: score cards with quarter scores | `js/nfl.js` | |
| NFL Standings: AFC/NFC divisions, playoff seeds | `js/nfl.js` | |
| NFL Player detail: radar (passing yards, TD, INT, QBR) | `js/nfl.js`, `js/charts.js` | |
| Ticker: NFL game scores | `js/nfl.js` | Reuse normalized ticker pattern |
| CSP: `connect-src += site.api.espn.com` (already present) | `_headers` | |

---

### Phase 6 — NHL Support
**Goal:** Fourth sport; completes the original four-sport vision.

| Task | File(s) | Notes |
|---|---|---|
| Create `js/nhl.js` | `js/nhl.js` | NHL Stats API `api-web.nhle.com`, no key |
| NHL Players: G, A, PTS, +/-, PIM, PPG (forwards); GAA, SV%, SO (goalies) | `js/nhl.js` | |
| NHL Teams, Standings, Games, Ticker | `js/nhl.js` | |
| NHL Player detail: radar + trend | `js/nhl.js`, `js/charts.js` | |
| CSP additions | `_headers` | `connect-src += https://api-web.nhle.com` |
| Image CDN | `_headers` | `img-src += https://assets.nhle.com` |

---

### Phase 7 — Infrastructure & Security Hardening
**Goal:** Production-grade security, performance, and maintainability.

| ID | Task | Notes |
|---|---|---|
| [PLAN-004] | Remove `unsafe-inline` from CSP | Migrate all inline handlers to `addEventListener` |
| [P4-001] | Cloudflare Worker proxy for BDL API key | Worker holds key; client calls `/api/bdl/*` |
| [PLAN-003] | `SportModule` interface abstraction | Prevents copy-paste across nfl.js / nhl.js |
| [PLAN-003] | Shared `js/ticker.js` module | All sports feed a normalized game array to one renderer |
| [PLAN-003] | Parameterized standings component | One table renderer handles NBA / MLB / NFL / NHL |
| Performance | Service Worker for offline support | Cache `LONG` tier assets; fallback to cached data when offline |
| Performance | Pre-compile math.js formulas (`math.compile()`) | [P4-007] |
| DevEx | Environment flag (`DEV_MODE`) for verbose logging | Suppress debug toasts in production |

---

### Phase 8 — UX Polish & Accessibility
**Goal:** Delightful, accessible, and mobile-first experience.

| Task | Notes |
|---|---|
| Mobile responsive audit | Test all views at 375px; fix any overflow/truncation |
| Keyboard navigation | Tab through player cards, arrow keys in tables |
| `aria-label` on all interactive elements | Screen reader compliance |
| Dark / light mode toggle | CSS custom property swap; persist to `localStorage` |
| Skeleton shimmer for ticker ([P4-005]) | Replace "Loading scores…" text placeholder |
| Team color themes on player/team detail backgrounds | Subtle gradient background using team primary color |
| Share button on player detail | Copies `#player-{id}` hash URL to clipboard |
| PWA manifest + app icon | `manifest.json`, 192px + 512px icons; enables "Add to Home Screen" |

---

### Deployment Checklist — Cloudflare Pages

| Step | Status | Notes |
|---|---|---|
| Repo on GitHub | ☐ | Push `main` branch |
| Cloudflare Pages project connected | ☐ | Build cmd: *(none)*, output dir: `/` |
| `_headers` file verified | ☐ | CSP, X-Frame-Options, nosniff, Permissions-Policy applied at edge |
| Custom domain configured | ☐ | DNS CNAME → `<project>.pages.dev` |
| BDL API key moved to Worker | ☐ | Phase 7 prerequisite before public launch |
| Analytics enabled | ☐ | Cloudflare Web Analytics (privacy-first, no cookies) |
| Real User Monitoring baseline | ☐ | Cloudflare RUM — track TTFB + LCP per route |
| Purge cache post-deploy | ☐ | `wrangler pages deployment list` + manual purge |
| Smoke test on live URL | ☐ | NBA: players / teams / games / standings / leaderboards / ask |
| Smoke test MLB | ☐ | Players (hitters + pitchers) / games / leaderboards |
| Mobile smoke test | ☐ | iOS Safari + Chrome Android at 375px |

---

## Closed

### [P1-005] NBA Teams — no drill-down — **Fixed**
- `showTeamDetail` now fetches roster + recent games + stats map in parallel.
- Added `_recentGamesCard`: lists last 12 games with W/L, date, opponent, score, click-to-expand.
- Added `showTeamGameDetail` + `_teamGameDetailHTML` + `_boxScoreTable`: full box score view with both teams' player stats; clicking a player loads their stat page.
- Navigation: `#team-{id}-game-{id}` hash, `team-game` popstate, and `_restoreTeamGameDetail` in `navigation.js`.
- `js/teams.js`, `js/api.js`, `js/navigation.js`

### [P2-004] Game status detection fragile — **Fixed**
- Status regex now handles `Q1–Q4`, `Half`, `:MM`, `OT`, `PPD`/`Postponed` variants.
- `js/games.js`

### [P2-005] Standings crash on null streak — **Fixed**
- `streak.startsWith('W')` → `typeof streak === 'string' && streak.startsWith('W')`.
- `js/standings.js`

### [P2-008] Leaderboard only shows top 8 — **Fixed**
- Now renders top 10 by default; extracted `_buildLeaderboardRow` helper.
- Remaining players hidden with `data-extra`; "Show N more / Show less" toggle button appended to each panel.
- `js/leaderboards.js`

### [P1-001] MLB ticker scrolls too fast — **Fixed**
- Both `updateTicker` (NBA) and `updateMLBTicker` (MLB) now measure `ticker.scrollWidth` after render via double-rAF and set `animationDuration` proportionally at 60px/s (min 15s).
- `js/games.js`, `js/mlb.js`

### [P1-002] MLB scores not loading correctly — **Fixed**
- `fetchMLBSchedule` now uses an ET-anchored date (UTC − 5h) so late-night games don't drift to tomorrow's date.
- `updateMLBTicker` filter now excludes `abstractGameState === 'Preview'` so unplayed 0–0 games don't appear in the ticker.
- `js/mlb.js`

### [P1-003] mlbFetch non-JSON response crashes app — **Fixed**
- `res.json()` is now wrapped in `try/catch`; throws a clean error message on malformed responses.
- `js/mlb.js`

### [P1-004] Silent fetch failures — no global rejection handler — **Fixed**
- `window.addEventListener('unhandledrejection', ...)` added in `errorHandler.js`; fires a warn toast on any uncaught Promise rejection (ignores AbortError).
- `js/errorHandler.js`

