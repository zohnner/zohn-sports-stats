# SportsStrata — Issues & Roadmap

> Ordered by priority. P1 = broken / crashes. P2 = significant UX gap. P3 = correctness/edge case. P4 = polish/future.

---

## Open — Active Bugs (Analysis Pass — 2026-04-17)

### [P1-006] API key hardcoded in source — `js/api.js:11`
- **Status:** Open
- **Severity:** CRITICAL / Security
- **Issue:** `BDL_API_KEY` is a plaintext string in `api.js`. Any public GitHub push leaks it.
- **Fix:** Deploy `worker/bdl-proxy.js` (already written), set `BDL_PROXY_URL` in `api.js`, remove the raw key. Rotate the key at balldontlie.io immediately after.

~~### [P2-003] Season change doesn't clear MLB state — `js/app.js:34-42`~~
- **Status:** ✅ Fixed — clears `mlbPlayers`, `mlbPlayerStats`, `mlbTeams`, `mlbGames`, `mlbStandings`, `mlbLeaderSplits` on season change; also calls `setMLBSeason(year)` to update the MLB module variable.

~~### [P2-004] No fetch timeout — `js/api.js` (`bdlFetch`, `mlbFetch`)~~
- **Status:** ✅ Fixed — both fetch helpers now wrap `fetch()` with a 10-second `AbortController` timeout.

~~### [P2-005] Inline `onerror` image handlers — across 10 JS files~~
- **Status:** ✅ Fixed — replaced all `onerror="this.style.display='none'"` with `data-hide-on-error` attribute. Single capture-phase listener in `config.js` handles all images. `onload` in `games.js` moved to post-processing block.

~~### [P3-004] Player name mismatch — `js/players.js:110`, `js/playerDetail.js:181`~~
- **Status:** ✅ Fixed — added `_normName()` to `config.js`: strips dots, strips Jr/Sr/II/III/IV suffixes, collapses whitespace, lowercases. Applied at the NBA.com map-build site (`api.js`) and all three lookup sites (`players.js` ×2, `playerDetail.js`).

~~### [P3-005] `localStorage` reads not validated — `js/search.js:20`~~
- **Status:** ✅ Fixed — `_loadRecents()` now validates the parsed value is an array and filters out malformed entries; `addRecent()` guards against malformed input.

~~### [P3-006] `innerHTML +=` in search results — `js/search.js:176`~~
- **Status:** ✅ Non-issue confirmed — was a string variable (`html +=`), not a DOM mutation. `container.innerHTML` is set once after building the full string.

~~### [P4-004] Disabled NFL/NHL buttons have no explanation~~
- **Status:** ✅ Fixed — removed `disabled` attr; replaced with `aria-disabled` + `data-coming-soon`. Clicking now fires an info toast: "NFL support is in progress — check back soon." CSS styling (opacity, cursor, "soon" badge) unchanged.

~~### [P3-002] MLB Standings — L10 column always shows `—`~~
- **Status:** ✅ Fixed — replaced L10 with **RDIFF** (run differential). Uses `runsScored − runsAllowed` from the standings API. Color-coded green/red.

---

## Open — Feature Gaps


### [FEAT-001] Light / Dark Mode Toggle
- **Status:** ✅ Complete
- **Implementation:** `[data-theme="light"]` override block in `variables.css`; anti-FOWT inline script in `<head>`; toggle button in waffle panel footer; persists to `localStorage`; respects `prefers-color-scheme` on first visit

---

## Integrations

### [PLAN-001] Kalshi Prediction Market Odds
- **Status:** Planning — `.env` has KALSHI_API_KEY + RSA private key
- **Architecture:** Private key CANNOT be client-side. Cloudflare Worker signs requests server-side; static site calls Worker.
- **Kalshi endpoints:** `GET /markets?series_ticker=MLB`, `GET /markets/{ticker}`, `GET /events`
- **Display ideas:** Odds chip on game cards ("NYY 58% · LAD 42%"), division winner % on Standings, MVP odds on player detail
- **Security:** Never commit `.env`. Confirm `.gitignore` includes it.
- **Files:** `worker/kalshi-proxy.js`, `js/odds.js`, CSP update in `index.html`

### [PLAN-002] NFL Support
- **Status:** Planning (after MLB parity)
- **API:** ESPN public API (`site.api.espn.com`) — already in CSP, free, no key
- **New file:** `js/nfl.js` — mirror `mlb.js` structure

### [PLAN-003] NHL Support
- **Status:** Planning (after NFL)
- **API:** `api-web.nhle.com` — official, free, no key
- **CSP:** `connect-src += https://api-web.nhle.com`, `img-src += https://assets.nhle.com`

### [PLAN-004] BDL API Key → Cloudflare Worker
- **Status:** ✅ Complete — `worker/bdl-proxy.js` + `worker/wrangler.toml` created; `api.js` routes through `BDL_PROXY_URL` when set
- **Remaining:** Set `BDL_PROXY_URL` in `api.js` after `wrangler deploy`, then update CSP `connect-src` in `_headers` + `index.html`

---

## Roadmap

### Phase 0 — Stabilize ✅ Complete
### Phase 1 — MLB Charts & Stats ✅ Complete
### Phase 2 — MLB Navigation Parity ✅ Complete
### Phase 3 — Arcade Expansion ✅ Complete
Ballpark Blueprint, Statline Shuffle, Trade Tree all shipped.

### Phase 4 — Nav + Landing ✅ Complete
| Task | Status |
|---|---|
| Waffle nav (replace busy header) | ✅ Done |
| Home landing page | ✅ Done |
| MLB AVG leading-zero fix | ✅ Done |

---

### T1 — UX Excellence (active)
| ID | Task | Effort | Status |
|---|---|---|---|
| UX-001 | View fade transitions | XS | ✅ Done |
| UX-002 | Favorites / Watchlist (NBA + MLB) | S | ✅ Done |
| UX-003 | Home page animated stats strip | XS | ✅ Done |
| UX-004 | "Who Am I?" NBA daily arcade game | M | ✅ Done |
| UX-005 | Player head-to-head comparison view | M | ✅ Done (radar + butterfly stat table) |
| UX-006 | Recently viewed players (localStorage) | S | ✅ Done |
| UX-007 | Global search from header (⌘K) | M | ✅ Done |
| UX-008 | Skeleton loaders for all views | S | ✅ Done — all views have skeletons; standings upgraded to table-shaped skeleton |

### T2 — Analytics Depth
| ID | Task | Effort | Status |
|---|---|---|---|
| STAT-001 | NBA advanced stats: TS%, eFG%, TOV%, AST/TO, 3PAr, FTr | M | ✅ Done |
| STAT-002 | MLB advanced: ISO, BABIP, K%, BB%, FIP, K-BB% | M | ✅ Done |
| STAT-003 | Career multi-season player view | L | ✅ Done (NBA + MLB year-by-year) |
| STAT-004 | Power rankings (streak-weighted standings) | M | ✅ Done |
| STAT-005 | Head-to-head player comparison radar | M | ✅ Done (Compare card in NBA detail) |

### T3 — NFL / NHL
| Task | API | Status |
|---|---|---|
| `js/nfl.js` — Players, Teams, Scores, Standings | ESPN public | Backlog |
| `js/nhl.js` — Players, Teams, Scores, Standings | api-web.nhle.com | Backlog |
| Home sport cards go live (remove "Soon") | — | Backlog |

### T4 — Infrastructure & Odds
| ID | Task | Effort |
|---|---|---|
| PLAN-001 | Cloudflare Worker: Kalshi + BDL proxy | M |
| PLAN-001 | Kalshi odds chips on game cards | S |
| PLAN-001 | Division winner % on Standings | S |
| PLAN-004 | Move BDL API key to Worker | S |
| FEAT-001 | Light/Dark mode toggle | S | ✅ Done |
| INFRA-001 | PWA manifest + service worker (offline) | M | ✅ Done |

### T5 — Premium Analytics
| Task | Notes | Status |
|---|---|---|
| NBA shot zone chart | Canvas-based court diagram | Backlog |
| MLB spray chart | Batted ball direction overlay | Backlog |
| Game simulation / what-if | Adjust box score, see scoreline impact | Backlog |
| Fantasy scoring overlay | DK scoring toggle + FP panel on NBA leaderboards | ✅ Done |
| Stats Glossary tooltips | Hover/tap stat labels for definition (NBA + MLB) | ✅ Done |
| CSV export | Download leaderboard + career stats tables as CSV | ✅ Done |
| Global search (⌘K) | Search NBA/MLB players + teams, keyboard nav | ✅ Done |
| Accessibility pass | focus-visible rings, aria-labels, keyboard nav on leaderboard rows | ✅ Done |

---

## Deployment Checklist — Cloudflare Pages

| Step | Status |
|---|---|
| Repo on GitHub | ☐ |
| Cloudflare Pages connected (build: none, output: `/`) | ☐ |
| `_headers` verified (CSP, X-Frame-Options, nosniff) | ☐ |
| Custom domain configured | ☐ |
| BDL API key moved to Worker | ☐ |
| Smoke test — NBA + MLB all views | ☐ |
| Mobile smoke test (iOS Safari + Chrome Android) | ☐ |

---

## Closed

| ID | Description | Fix location |
|---|---|---|
| P4-003 | Ask engine catch handlers | `js/ask.js` — handlers use async/await inside query-level try/catch (was already done) |
| P2-001 | mlbFetch JSON validation | `js/mlb.js` — `res.ok` guard + `res.json()` try/catch (was already done) |
| FEAT-003 | Ballpark Blueprint | `js/arcade.js` + `css/arcade.css` + `data/stadiums.json` — clue-reveal game, 30 stadiums |
| MLB-003 | MLB Team Drill-down | `js/mlb.js` + `css/components.css` — roster + recent games with clickable rows → game detail |
| MLB-002 | MLB Hitting Splits | `js/mlb.js` + `css/components.css` — vs L/R/Home/Away tabbed stats card in player detail |
| MLB-001 | MLB Player Detail charts | `js/charts.js` + `js/mlb.js` — radar (hitter+pitcher) + game log trend line |
| P2-002 | MLB Game Detail unstyled | `css/components.css` — added all linescore + box score classes |
| P3-001 | `_mlbGamesDateOffset` dead variable | `js/mlb.js` — declaration + writes removed |
| P4-001 | Leaderboard bar NaN% | `js/leaderboards.js` — `topVal > 0` guard (was already fixed) |
| P4-002 | Ticker z-index | `css/ticker.css` — `position:relative; z-index:1` (was already fixed) |
| P1-001 | MLB ticker scrolls too fast | `js/games.js`, `js/mlb.js` — dynamic `scrollWidth/60` duration |
| P1-002 | MLB scores date off-by-one after 8pm local | `js/mlb.js` — `_mlbDateString()` ET-anchored helper |
| P1-003 | mlbFetch crashes on non-JSON response | `js/mlb.js` — try/catch around `res.json()` |
| P1-004 | Unhandled promise rejections silent | `js/errorHandler.js` — `window.unhandledrejection` toast |
| P1-005 | NBA Teams — no drill-down | `js/teams.js` — roster + recent games + box score + player links |
| MLB-013 | MLB Scores no date navigation | `js/mlb.js` — Prev/Next nav + `_fetchMLBGamesForDate` |
| MLB-014 | MLB Standings empty (2026 season) | `js/mlb.js` — `_MLB_DIV_ID_MAP` + team name fallback |
| Arcade-001 | Statline Shuffle box scores empty | `js/arcade.js` — `data.home` → `data.teams.home` |
| Arcade-002 | Game detail box scores empty | `js/mlb.js` — same `data.teams` fix in `_battingTable` / `_pitchingTable` |
| Arcade-003 | Trade Tree data bugs (trades #5, #13) | `data/trades.json` — fixed `fromTeamAbbr`, flipped Sandberg trade framing |
| Arcade-004 | Arcade raw `fetch()` bypassing cache | `js/arcade.js` — replaced with `mlbFetch()` |
| Various | P2 through P4 stats/UI bugs | See git log — `d7f7e1f` through current |
| P3-003 | Player headshots not centered (face cropped out) | `css/components.css` — added `object-position: top center` to `.player-headshot` and `.lb-avatar img`; removed redundant `--detail` modifier |
| NAV-001 | NBA/MLB standings rows not clickable | `js/standings.js` + `js/mlb.js` — added `onclick` to `<tr>` rows; NBA uses `_nbaStandingsTeamClick(abbr)` helper with lazy team load |
| NAV-002 | NBA/MLB power ranking rows not clickable | `js/standings.js` + `js/mlb.js` — added `onclick` to `.power-row` divs |
| NAV-003 | NBA game cards — no navigation from team sections | `js/games.js` — team divs get `data-team-id` + `showTeamDetail` click; score area → `showTeamGameDetail` |
| NAV-004 | MLB game cards — team sections not clickable | `js/mlb.js` — added `data-team-id` + `showMLBTeamDetail` click with stopPropagation |
| NAV-005 | MLB game detail header — team logos not clickable | `js/mlb.js` — added `onclick="showMLBTeamDetail(id)"` to `.mlb-gh-team` divs |
| NAV-006 | NBA/MLB player detail — team name plain text | `js/playerDetail.js` + `js/mlb.js` — team name rendered as clickable `<button>` → team detail |
| NAV-007 | Team logo `object-position: top center` regression | `js/teams.js` — added `object-position:center` to all `object-fit:contain` logo inline styles |
| NAV-008 | Roster headshots missing `object-position` | `js/teams.js` + `js/mlb.js` — added `object-position:top center` to roster row headshot inline styles |
| NAV-009 | NBA box score — opponent team logo not clickable | `js/teams.js` — added `onclick="showTeamDetail(opp.id)"` to opponent avatar in game detail header |
