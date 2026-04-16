# SportsStrata — Issues & Roadmap

> Ordered by priority. P1 = broken / crashes. P2 = significant UX gap. P3 = correctness/edge case. P4 = polish/future.

---

## Open — Active Bugs

### [P3-002] MLB Standings — L10 column always shows `—`
- **File:** `js/mlb.js` — `fetchMLBStandingsFull`
- **Detail:** MLB Stats API `overallRecords` only returns `home` and `away` types — `lastTen` is not present in either 2025 or 2026 seasons. API data gap, not a code bug.
- **Options:** Remove column, compute from game log, or leave `—` with tooltip.

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
| UX-005 | Player head-to-head comparison view | M | Backlog |
| UX-006 | Recently viewed players (localStorage) | S | ✅ Done |
| UX-007 | Global search from header (⌘K) | M | ✅ Done |
| UX-008 | Skeleton loaders for all views | S | Backlog |

### T2 — Analytics Depth
| ID | Task | Effort | Status |
|---|---|---|---|
| STAT-001 | NBA advanced stats: TS%, eFG%, TOV%, AST/TO, 3PAr, FTr | M | ✅ Done |
| STAT-002 | MLB advanced: ISO, BABIP, K%, BB%, FIP, K-BB% | M | ✅ Done |
| STAT-003 | Career multi-season player view | L | Backlog |
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
| INFRA-001 | PWA manifest + service worker (offline) | M |

### T5 — Premium Analytics
| Task | Notes |
|---|---|
| NBA shot zone chart | Canvas-based court diagram |
| MLB spray chart | Batted ball direction overlay |
| Game simulation / what-if | Adjust box score, see scoreline impact |
| Fantasy scoring overlay | Configure league scoring, rank players |

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
