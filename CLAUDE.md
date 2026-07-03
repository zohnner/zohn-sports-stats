# SportStrata — Claude Code Instructions

## Identity
**Brand:** SportStrata | **Tagline:** "Serious stats for serious fans"
**Product:** Free, no-login MLB analytics dashboard for broadcast professionals, fantasy players, and data fans.
All user-facing text uses "SportStrata". Never revert to "ZohnStats".

---

## Sport Focus — READ THIS FIRST
**MLB is the primary product; NFL is now a live public-beta surface (as of 2026-06-14).** Per D-012/D-013/D-014, NFL was promoted from preview to beta. Shipped: a header sport switcher, NFL Scores / Standings / Teams (ESPN via the `/api/nfl` Pages Function proxy), an offseason state, and a no-login **Mock Draft simulator** (`js/fantasy.js`, Sleeper data via `/api/sleeper`, ADP + Monte Carlo). NFL feature work is in scope and expected.

**NBA and NHL remain preview-only** — do not propose NBA/NHL feature work unprompted.

Both MLB depth and NFL beta build-out count as forward progress. NFL roadmap (leaderboards, player cards/detail reusing MLB component patterns; later fantasy grades + league import behind an accounts tier) lives in DECISIONS.md D-012/D-014.

---

## Response Standards

These rules govern how you respond in all interactions, not just code tasks.

**Confidence flagging:** Before answering, flag any claim you're less than 90% confident in. Say "I'm not sure about this" explicitly rather than stating uncertain things as fact. If you don't know, say so.

**Push back on bad premises:** Do not validate a premise just because it was stated confidently. If the user's assumption is wrong or their approach has a real flaw, say so directly and explain why. Agreeing to be polite is more harmful than a clear correction.

**Concrete recommendations:** When asked for a recommendation, pick one and defend it. Do not list options with pros and cons and leave the decision to the user unless the choice genuinely depends on information you don't have. Take a position.

**Synthesize, don't compress:** When summarizing, go beyond compressing what was said — explain what it means and what the one thing to walk away with is. A summary that just restates the points in fewer words is not useful.

**Flag conflicting instructions:** If any part of the user's instructions conflict with each other or with producing a good result, flag the conflict explicitly and ask which takes priority. Do not silently resolve it by picking one.

**Plain prose by default:** Respond in plain prose with no bullet points, no headers, and no bold text unless the user asks for them or the content is genuinely a list or reference table.

**Distinctive voice:** Write with a strong, specific voice. Avoid clichés, generic phrasing, and AI-sounding sentences. Before finalizing a response, read it back and cut anything that sounds flat or interchangeable.

**Non-obvious examples:** When using examples, make them specific and vivid. No "imagine a bakery" or "think of a sports team" placeholders — use real, precise illustrations that actually clarify the point.

**No repetition:** Before sending a response, scan for any sentence that repeats an idea already stated. Cut or consolidate it.

**Show reasoning:** When working through a non-trivial problem, show the reasoning step by step before reaching a conclusion. Don't just assert the answer — demonstrate how you got there so the user can spot where they might disagree.

---

## Architecture

Vanilla JS/CSS/HTML, ES2022+, no bundler, no framework, no build step. Scripts share global scope via classic `<script>` tags in `index.html` — there is no module system.

**Script load order matters** (see `index.html`): `config.js` → `errorHandler.js` → `cache.js` → `schema.js` → `api.js` → `glossary.js` → `players.js` → `leaderboards.js` → `teams.js` → `games.js` → `charts.js` → `playerDetail.js` → `statBuilder.js` → `mlb.js` → `scorecard.js` → `liveGame.js` → `shareCard.js` → `nfl.js` → `nflLiveGame.js` → `nflStandings.js` → `fantasy.js` → `sos.js` → `nhl.js` → `arcade.js` → `standings.js` → `db.js` → `search.js` → `navigation.js` → `news.js` → `app.js`. Each file can reference globals defined by files loaded before it.

---

## Global State

`AppState` in `api.js` holds all runtime state. Key fields:

```js
AppState.currentSport   // 'nba' | 'mlb' | 'nfl' | 'nhl'  (default: 'mlb')
AppState.currentView    // current route string e.g. 'mlb-players'
// MLB
AppState.mlbTeams       // array of team objects
AppState.mlbPlayers     // { hitting: [], pitching: [] }
AppState.mlbPlayerStats // { hitting: { [playerId]: statsObj }, pitching: { [playerId]: statsObj } }
AppState.mlbGames       // array of game objects
AppState.mlbStandings   // standings data or null
AppState.mlbLeaderSplits// leaderboard splits data or null
AppState.mlbStatsGroup  // 'hitting' | 'pitching' (active tab in players view)
// NBA
AppState.allPlayers     // array
AppState.filteredPlayers// array
AppState.playerStats    // { [playerId]: statsObj }
AppState.allTeams       // array
AppState.allGames       // array
AppState.nbaStatsMap    // from fetchNBAStatsMap
AppState._nbaStatsSeason// season year that nbaStatsMap was fetched for
// Seasons
CURRENT_SEASON          // NBA start year (global, not on AppState)
MLB_SEASON              // defined in mlb.js — auto-detects: Mar–Oct=current, Nov–Feb=previous
```

---

## Key Files

| File | Purpose |
|---|---|
| `index.html` | Static shell: `<script>` load order (defines global scope), 3-row header structure, nav markup, CSP `<meta>` |
| `js/config.js` | Shared utilities: `_escHtml()`, `_normName()` + NBA team colors, `getTeamColors()`, `getNBATeamLogoUrl()` |
| `js/mlb.js` | All MLB logic: team colors/logos, API calls, all MLB view renderers, `MLB_SEASON`, `MLB_LEADER_CATS`, `_computeBattingRates`, `_computePitchingRates` |
| `js/liveGame.js` | Live game expanded view (P3-025): `showMLBLiveGame()`, `openLiveGamePanel()`, diff-based linescore polling, pitch zone, box score. Loads after `scorecard.js` |
| `js/scorecard.js` | Baseball scorecard (P3-022): historical + live modes, 9×9 grid render, html2canvas PNG export |
| `js/shareCard.js` | Shareable stat cards (P3-027): `shareStatCard()`, offscreen 600×315 card → 2× PNG via html2canvas, Web Share / download. Reuses `_scLoadHtml2Canvas()` from scorecard.js |
| `js/math.min.js` | Vendored math.js (formula evaluation). **Not in the script chain** — lazy-loaded by `statBuilder.js` on Builder open (D-011) |
| `js/api.js` | BDL API via Worker proxy (`BDL_PROXY_URL`) + `fetchNBAStatsMap()` (NBA.com) + ESPN headshot map. P1-006 resolved 2026-06-09 — key removed from source |
| `js/navigation.js` | `setupNavigation()`, `navigateTo()`, `renderCurrentView()`, `switchSport()`, `_applySportUI()`, `_loadFromHash()` |
| `js/app.js` | Bootstrap: ticker, season selector, cache-bust on season change, `setupNavigation()`, `loadHome()` (landing page) |
| `js/cache.js` | `ApiCache` — localStorage cache with TTL buckets (SHORT 5m, MEDIUM 30m, LONG 60m, DAILY 12h) |
| `js/players.js` | NBA player list/cards; `loadStatsForPlayers()` uses `fetchNBAStatsMap` |
| `js/leaderboards.js` | NBA leaderboards |
| `js/playerDetail.js` | NBA player detail + compare; `fetchNBAStatsMap` backed |
| `js/statBuilder.js` | Custom stat formula builder (MLB + NBA) |
| `js/standings.js` | Standings views (all sports) |
| `js/teams.js` | Team drill-down views |
| `js/games.js` | NBA/scores views |
| `js/search.js` | `initGlobalSearch()` — ⌘K overlay |
| `js/charts.js` | `StatsCharts` — Chart.js wrappers; always call `StatsCharts.destroyAll()` before re-rendering |
| `js/schema.js` | `ApiShape` — API response validation helpers |
| `js/errorHandler.js` | Global error boundary; exposes `Logger` |
| `js/glossary.js` | Stat definition tooltips |
| `js/arcade.js` | Mini-games |
| `js/db.js` | IndexedDB persistence layer (favorites, recents) |
| `js/nfl.js` | NFL preview (ESPN public API) |
| `js/nhl.js` | NHL preview (api-web.nhle.com) |
| `functions/api/mlb.js` | Cloudflare Pages Function — D1 edge cache proxy for `statsapi.mlb.com` + Savant |

---

## Data Sources

### MLB (primary)
- **MLB Stats API:** `https://statsapi.mlb.com/api/v1/` — free, no auth, no CORS restrictions
  - Teams: `/teams?sportId=1&season={year}`
  - Schedule: `/schedule?sportId=1&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&hydrate=linescore`
  - Stats: `/stats?stats=season&season={year}&group=hitting|pitching&sportId=1`
  - Player detail: `/people/{id}?hydrate=stats(group=[hitting,pitching],type=season,season={year})`
  - Fielding: `/stats?stats=season&group=fielding&sportId=1&season={year}`
- **All MLB fetches go through `mlbFetch('/endpoint', params, ttl)`** in `mlb.js`, which handles caching, edge-proxy routing, and error handling. Never call `fetch(statsapi.mlb.com/...)` directly.
- **MLB team logos:** `https://www.mlbstatic.com/team-logos/{teamId}.svg`
- **MLB player headshots:** `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/{playerId}/headshot/67/current`
- **Edge cache proxy:** `functions/api/mlb.js` — Cloudflare Pages Function D1 cache

### MLB Helper Functions (in `mlb.js`)
- `getMLBTeamColors(abbr)` → `{ primary, secondary }` (falls back to grey)
- `getMLBTeamLogoByAbbr(abbr)` → SVG URL string
- `getMLBTeamLogoById(teamId)` → SVG URL string
- `fetchMLBSchedule(daysBack)` → array of game objects for today ± daysBack
- `mlbFetch(path, params, ttl)` → cached fetch against MLB Stats API

### NBA (preview)
- **Ball Don't Lie v1:** `/players`, `/teams`, `/games` — free tier. `/season_averages` and `/stats` are **paid (401)** — do not use.
- **NBA.com stats:** `https://stats.nba.com/stats/leagueLeaders` — requires `Referer: https://www.nba.com/` header.
- **ESPN headshots:** `https://a.espncdn.com/i/headshots/nba/players/full/{espn_id}.png`

### NFL / NHL (preview)
- **NFL:** ESPN public API — `https://site.api.espn.com/apis/site/v2/sports/football/nfl/`
- **NHL:** `https://api-web.nhle.com/`

---

## Nav / Routing

Hash-based routing. `navigateTo(view)` → updates `AppState.currentView`, syncs `.active` on all `.nav-tab[data-view]`, calls `renderCurrentView(view)`, pushes history state.

**Active state sync:** `navigateTo` calls `document.querySelectorAll('.nav-tab[data-view="${view}"]').forEach(t => t.classList.add('active'))`. Every nav button across all three surfaces uses the `.nav-tab` class and `data-view`, so active state stays in sync automatically — no per-surface code needed.

**`renderCurrentView(view)` dispatch logic:**
- `view.startsWith('mlb-')` → `_renderMLBView(view)`
- `view.startsWith('nfl-')` → `_renderNFLView(view)`
- `view.startsWith('nhl-')` → `_renderNHLView(view)`
- All other views (including `'home'`) → NBA/shared switch statement

**MLB views → functions called:**

| View | Function |
|---|---|
| `mlb-players` | `loadMLBPlayers()` or `displayMLBPlayers(group)` |
| `mlb-leaders` | `loadMLBLeaderboards()` |
| `mlb-teams` | `loadMLBTeams()` or `displayMLBTeams(teams)` |
| `mlb-games` | `loadMLBGames()` |
| `mlb-standings` | `loadMLBStandings()` or `displayMLBStandings()` |
| `mlb-builder` | `displayStatBuilder()` |
| `mlb-prep` | `displayGamePrep()` |
| `mlb-player-{id}` | handled via `_loadFromHash` → `showMLBPlayerDetail(id)` |
| `mlb-team-{id}` | handled via `_loadFromHash` → `_restoreMLBTeamDetail(id)` |

**`_loadFromHash` behavior:** On first load, reads `location.hash`, matches against regex patterns for player/team detail views, then falls through to view arrays. `home` is in the `nbaViews` legacy array — navigating to it does NOT auto-call `_applySportUI`.

**`home` view — CRITICAL RULE:** `home` is in `nbaViews` in `_loadFromHash`. This means loading the home view does NOT automatically call `_applySportUI('mlb')`. `loadHome()` in `app.js` **must** call `_applySportUI('mlb')` as its first line — never remove or move that call.

**`_applySportUI(sport)` — what it does:**
Updates `#brandIcon` and `#brandSub` text only. Falls back to mlb brand if sport is unrecognized — always pass a valid sport string.

---

## Header Layout (3-row structure)

The `<header>` element has 3 stacked rows (all within the sticky header band):

1. **`.header-inner`** (`--header-height` = 60px) — brand logo/name, search button, theme toggle, menu button (`.menu-btn`, mobile only)
2. **`.header-ticker`** (`--ticker-height` = 38px) — live scores marquee with SCORES button
3. **`.sub-nav`** (`--header-sub-h` = 36px) — MLB nav tabs (hidden on mobile ≤768px)

Total header height on desktop: `calc(var(--header-height) + var(--ticker-height) + var(--header-sub-h))` = 134px.

---

## Nav System (Three Surfaces)

All three surfaces use `.nav-tab` + `data-view` on every button. `navigateTo()` syncs `.active` across all of them automatically.

### 1. Sub-nav (`#subNav`, `.sub-nav`) — desktop only (hidden ≤768px)
Sticky row in header. 8 items: Players | Leaders | Teams | Standings | [divider] | Builder | Prep | Arcade. (Scores was removed — the ticker SCORES button handles that nav destination with `class="nav-tab" data-view="mlb-games"`.)

### 2. Menu panel (`#menuPanel`, `.menu-panel`) — mobile only (`display:none` ≥769px)
`position: fixed; top: calc(var(--header-height) + var(--ticker-height))` — drops from under the header+ticker. 4-column grid of 8 tile buttons (all MLB views + Arcade). Opened/closed by `#menuBtn` (`.menu-btn`). JS: `initMenu()` / `_closeMenu()` in `navigation.js`.

### 3. Bottom tab bar (`#bottomNav`, `.bottom-nav`) — mobile only (`display:none` ≥769px)
`position: fixed; bottom: 0`. 5 primary destinations: Players | Leaders | Scores | Standings | Builder.

### Rules
- **Never remove `.nav-tab` from any nav button** — it's how active state sync works.
- **Never remove `data-view` from any nav button** — it's how click routing works.
- **Menu panel is `position: fixed`** (not sticky) — do not change this; sticky is unreliable under a fixed header.
- **`#seasonSelect`** is kept hidden in the DOM (outside the menu panel) for `app.js` season logic compatibility.

---

## Code Style Rules

1. **No framework, no bundler** — vanilla JS only
2. **Batch DOM writes** — build full HTML strings and inject once with `innerHTML`; never piecemeal `appendChild`
3. **CSS over JS for visuals** — transitions, animations, and layout via CSS; avoid JS-driven style calculations
4. **No deep nesting** — keep functions short and single-purpose
5. **Escape user-facing data** — use `_escHtml()` from `config.js` before any `innerHTML` write of API data
6. **`position: sticky` over `position: fixed`** where possible (avoids repaints)
7. **CSS custom properties** over runtime JS calculations
8. **No comments** unless the WHY is non-obvious (hidden constraint, subtle invariant, known bug workaround). Never document what the code plainly shows.
9. **CSS cascade safety** — before editing `main.css`, grep for every selector you plan to add or change and confirm nothing else in the file already sets the same property on those elements. Cascading overrides from later rules are the most common source of visual regressions in this project.

---

## Security Rules

- Always use `_escHtml()` for any API string going into `innerHTML`
- Image error handlers use `data-hide-on-error` or `data-logo-fallback` attributes + the capture-phase listener in `config.js` — never use inline `onerror=` attributes
- No secrets in committed source, ever — the BDL key goes through the Worker proxy, all other secrets through `wrangler secret` (P1-006, resolved 2026-06-09)
- All `/api/*` Pages Functions are rate-limited by `functions/api/_middleware.js` (120 req/min/IP best-effort) — do not add an unthrottled route outside `/api/`

---

## Cache Pattern

```js
const cached = ApiCache.get(cacheKey);
if (cached) return cached;
const data = await fetch(...);
ApiCache.set(cacheKey, data, ApiCache.TTL.MEDIUM);
```

TTL guidance: `SHORT` (5m) for scores/games, `MEDIUM` (30m) for season stats/players, `LONG` (60m) for teams, `DAILY` (12h) for Savant once-a-day data (percentile rankings, sprint speed).

`ApiCache.invalidate('')` clears all cache entries (prefix-match on empty string).

---

## CSS Files

| File | Purpose |
|---|---|
| `css/variables.css` | Design tokens — **all** colors, spacing, typography, layout dimensions as CSS custom properties. Always use vars, never hardcode values. Both `:root` (dark) and `[data-theme="light"]` are defined here. |
| `css/main.css` | Global layout: reset, body, header (3-row), sub-nav, menu panel, bottom nav, main content area, search bar, home page, responsive breakpoints, print styles |
| `css/components.css` | Reusable components: player/game/team cards, leaderboards, tables, player detail, headshots, skeletons, stat builder |
| `css/ticker.css` | Score ticker — `.ticker-title`, `.ticker`, `.ticker__item`, status pills, animations |
| `css/animations.css` | View fade transitions and shared `@keyframes` |
| `css/arcade.css` | Arcade game-specific styles |
| `css/scorecard.css` | Scorecard grid, diamond SVG fills, paper texture |
| `css/liveGame.css` | Live game panel (`.lg-*` selectors only) |
| `css/shareCard.css` | Stat share card (`.shc-*`). Card colors are intentionally fixed hex — exported PNGs must be theme-invariant (P3-027) |

**Key design tokens:**
- Surfaces: `--bg-base`, `--bg-surface`, `--bg-raised`, `--bg-card`, `--bg-card-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-subtle`, `--text-disabled`
- Accent (brand orange-gold): `--accent` (`#ff8100`), `--accent-light` (`#ffd200`), `--accent-dark`, `--accent-subtle`, `--accent-border`
- Borders: `--border-default`, `--border-mid`, `--border-strong`, `--border-accent`
- Semantic: `--color-win` (green), `--color-loss` (red), `--color-live` (amber), `--color-error`
- Stat colors: `--color-pts` (amber), `--color-reb` (emerald), `--color-ast` (sky), `--color-stl` (violet), `--color-blk` (pink), `--color-pct` (orange), `--color-min` (indigo), `--color-tov` (red-light)
- Layout: `--header-height` (60px), `--ticker-height` (38px), `--header-sub-h` (36px), `--sidebar-w` (280px)
- Radii: `--radius-xs` through `--radius-full`
- Shadows: `--shadow-sm/md/lg`, `--shadow-card`, `--shadow-card-hov`, `--shadow-live`

---

## Logger

```js
Logger.info('message', optionalData, 'MODULE_TAG');
Logger.debug('message', optionalData, 'MODULE_TAG');
Logger.warn('message', optionalData, 'MODULE_TAG');
Logger.error('message', optionalData, 'MODULE_TAG');
await Logger.time('label', asyncFn, 'MODULE_TAG'); // wraps async fn, logs timing
```

Module tags in use: `'APP'`, `'MLB'`, `'NAV'`, `'API'`, `'CACHE'`, `'CONFIG'`, `'PERF'`, `'SEARCH'`.
Use `Logger` everywhere — never bare `console.log`.

---

## MLB Leaderboard Category Shape

Categories live in `MLB_LEADER_CATS` array in `mlb.js`. Shape:

```js
{ key: 'fieldName',   // field name in AppState.mlbPlayerStats[id]
  label: 'Full Name', // display label in leaderboard header
  unit: 'SHORT',      // short unit badge (e.g. 'AVG', 'ERA', 'HR')
  color: '#hex',      // accent color for the panel left-border and unit badge
  group: 'hitting',   // 'hitting' | 'pitching' — which stat group this belongs to
  desc: true,         // true = higher is better (sort desc); false = lower is better (ERA, WHIP, FIP)
  decimals: 3 }       // 0 for counting stats (HR, K), 1 for rates, 2-3 for averages
```

`desc: false` is required for ERA, WHIP, FIP, and any rate where lower = better.

---

## MLB Computed Stats Helpers

`_computeBattingRates(s)` and `_computePitchingRates(s)` in `mlb.js` are called after parsing `/stats` responses. They add derived fields to `AppState.mlbPlayerStats`.

Key formulas (follow this pattern when adding new derived stats):
- **ISO** = `slg - avg`
- **BABIP** = `(H - HR) / (AB - SO - HR + SF)`
- **BB%** = `baseOnBalls / plateAppearances * 100`
- **K%** = `strikeOuts / plateAppearances * 100`
- **FIP** = `(13*HR + 3*(BB+HBP) - 2*SO) / IP + 3.10`
- **K-BB%** = `(SO - BB) / battersFaced * 100`

**wRC+ league constants are self-healing (2026-07-01):** `_MLB_WRC_CONSTANTS` holds static FanGraphs guts entries (2024 final, 2025 preliminary). For any other season, `_ensureWrcConstants(season)` derives `lgwOBA`/`lgR/PA` from MLB Stats API league hitting totals (`/teams/stats`, DAILY cache) using the same 2024 linear weights as player wOBA — self-consistent, and it can never silently fall back to a stale year again. Derived or preliminary constants render wRC+ with a `†` (see `_wrcDagger()`). IP strings like `"100.2"` mean 100⅔ — always convert with `_mlbIpToNum()`, never `parseFloat`. Tests: `tests/stats.test.js`.

---

## MLB Stats API Field Reference

Complete fields from `/stats?stats=season&group=hitting` → `splits[*].stat`:
```
gamesPlayed, groundOuts, airOuts, runs, doubles, triples, homeRuns,
strikeOuts, baseOnBalls, intentionalWalks, hits, hitByPitch, avg, atBats,
obp, slg, ops, caughtStealing, stolenBases, stolenBasePercentage,
groundIntoDoublePlay, numberOfPitches, plateAppearances, totalBases, rbi,
leftOnBase, sacBunts, sacFlies, babip, groundOutsToAirouts, atBatsPerHomeRun
```

Complete fields from `/stats?stats=season&group=pitching` → `splits[*].stat`:
```
gamesPlayed, gamesStarted, groundOuts, airOuts, runs, doubles, triples,
homeRuns, strikeOuts, baseOnBalls, intentionalWalks, hits, hitByPitch, avg,
atBats, obp, slg, ops, stolenBases, caughtStealing, groundIntoDoublePlay,
numberOfPitches, era, inningsPitched, wins, losses, saves, saveOpportunities,
holds, blownSaves, earnedRuns, whip, battersFaced, gamesPitched,
completeGames, shutouts, strikes, strikePercentage, hitBatsmen, balks,
wildPitches, pickoffs, groundOutsToAirouts, rbi, winPercentage,
pitchesPerInning, gamesFinished, strikeoutWalkRatio, strikeoutsPer9Inn,
walksPer9Inn, hitsPer9Inn, runsScoredPer9, homeRunsPer9, inheritedRunners,
inheritedRunnersScored, qualityStarts, qualityStartPercentage
```

Fielding stats: `/stats?stats=season&group=fielding&sportId=1&season=YYYY`
Key fields: `errors`, `fielding` (FPCT), `chances`, `assists`, `putOuts`, `rangeFactorPerGame`

---

## MLB Team Abbreviation Aliases

The Stats API uses some non-standard abbreviations. Known aliases handled by `_MLB_ABBR_ALIASES` in `mlb.js`:

| Alias | Canonical |
|---|---|
| `TBR` | `TB` — Tampa Bay Rays |
| `KCR` | `KC` — Kansas City Royals |
| `CHW` | `CWS` — Chicago White Sox |
| `SDP` | `SD` — San Diego Padres |
| `SFG` | `SF` — San Francisco Giants |
| `OAK` | `ATH` — Athletics (Sacramento/Las Vegas 2025+) |
| `WSN` | `WSH` — Washington Nationals |
| `AZ` | `ARI` — Arizona Diamondbacks |

Always use `getMLBTeamColors(abbr)` — it handles aliases via a `Proxy`.

---

## Deployment

Hosted on **Cloudflare Pages**. Key deployment artifacts:

- **`functions/api/mlb.js`** — Cloudflare Pages Function; D1-backed edge cache proxy for `statsapi.mlb.com`. Required for production performance.
- **`_headers`** — Cloudflare Pages headers file; sets CSP and security headers. Must stay in sync with the `<meta http-equiv="Content-Security-Policy">` tag in `index.html`. Adding any new external domain to a fetch or `<img>` requires updating **both**.
- **`worker/`** — Cloudflare Worker for the BDL proxy (P1-006 fix target).

**Before any push:** run `/deploy-check` — it validates the BDL key, CSP consistency, committed state of critical files, unit tests (`node --test tests/stats.test.js tests/vbd.test.js`), delivery-manifest sync (`tools/check-manifest.cjs` — index.html ⇄ sw.js STATIC_ASSETS ⇄ disk), theme contrast (`tools/check-themes.cjs`), and NUL-byte corruption on changed files. After deploy, `tools/join-health.cjs <site-url>` measures the Sleeper⇄nflverse name-join rate (weekly in-season). Never add a js/css file without updating BOTH index.html and sw.js — check #10 fails otherwise.

---

## Secrets Hygiene (P1-006 — RESOLVED 2026-06-09)

The BDL key leak is fixed: `js/api.js` has `BDL_API_KEY = ''`, the Worker proxy is deployed, and `BDL_PROXY_URL` is set. The old key was rotated and is dead.
- The rule stands: no secret ever appears in committed source. Provider/auth/session secrets go through `wrangler secret` (D-031 carries this forward).
- Run `/deploy-check` before any push — it verifies this automatically.
- **Doc-sync rule (Folio, 2026-07-01):** any decision that ships must touch CLAUDE.md in the same commit if it changes architecture, load order, key files, or a rule on this page. Stale instructions here actively misdirect future sessions.

---

## Agent Usage Guide

This is a small vanilla JS/CSS SPA. Most tasks are well-scoped enough to handle inline with Grep, Read, and Edit. Only spawn an agent when the task genuinely needs it — agents start cold and re-derive context, so they're expensive for narrow lookups.

| Task | Best tool | Notes |
|---|---|---|
| Find where a function/symbol is defined | `Grep` directly | Single-file or known-area lookups don't need an agent |
| Open-ended search (unsure of file or name) | `Explore` agent (quick) | Let it range wider than a single grep |
| Search spanning many files or naming variants | `Explore` (very thorough) | E.g. "find every call to mlbFetch" |
| Architectural plan before a non-trivial feature | `Plan` agent | Use before implementing; not during |
| Multi-step research across multiple files | `general-purpose` | E.g. "trace the full standings data pipeline" |
| Questions about Claude Code CLI/SDK/API | `claude-code-guide` | |

**Available slash commands — use these before doing things manually:**

| Command | When to use |
|---|---|
| `/screenshot` | Visually verify layout after any UI change |
| `/syntax-check` | Verify no JS syntax errors before committing |
| `/deploy-check` | Pre-deployment checklist before any push |
| `/mlb-health` | Verify MLB Stats API endpoints are reachable |
| `/new-mlb-stat` | Add a new stat category to MLB leaderboards |
| `/simplify` | Review changed code for quality, reuse, and efficiency |
| `/security-review` | Full security review of pending changes on current branch |

**When NOT to spawn an agent:**
- Adding a stat to `MLB_LEADER_CATS` → use `/new-mlb-stat` slash command
- Fixing a bug in a known file → Grep + Read + Edit
- Checking whether a CSS selector already exists → `Grep` on `css/`
- Reading the nav/routing logic → `Read` the file directly
- Screenshots → use `/screenshot` slash command
- Syntax checks → use `/syntax-check` slash command
- Pre-deployment validation → use `/deploy-check` slash command
- MLB API health check → use `/mlb-health` slash command

**Project-specific heuristic:** because all JS shares global scope through flat `<script>` tags, cross-file symbol lookups are cheap and targeted. A single `Grep` call almost always finds it — save agents for genuinely open-ended investigation.

---

## What NOT to Do

- Do not propose NBA, NFL, or NHL feature work unprompted
- Do not add a framework, bundler, or build step
- Do not use `innerHTML +=` (causes full re-render flash) — use fragment or full-replace
- Do not add inline `onerror` handlers on `<img>` tags
- Prefer `position: sticky` over `position: fixed` — use `fixed` only where documented as required (`.menu-panel`, `.bottom-nav` on mobile are intentional exceptions; do not "fix" them to sticky)
- Do not create intermediate planning docs — work from conversation context
- Do not add comments that describe what the code does; only add them when the WHY is non-obvious
- Do not call `fetch(statsapi.mlb.com/...)` directly — always use `mlbFetch()`
- Do not remove `_applySportUI('mlb')` from the top of `loadHome()` in `app.js`

---

## NFL Data Foundation (D-017/D-018/D-019)

NFL is multi-season and reads live from upstream with Cloudflare edge-caching (no D1 persistence — D-019). Season auto-detects and rolls every year via the model in `js/nfl.js`:
- `NFL_STATS_SEASON` — latest season with completed/accumulating stats (Sep–Feb = current year, else prior). Flips to the live season in September.
- `NFL_FANTASY_SEASON` — the season ADP / drafts / player profiles refer to (Mar onward = current year). Drives the "{season} NFL Season" / "enters {season}" / offseason copy.
- `NFL_LEADERS_MIN_SEASON` = 2000, `NFL_NGS_MIN_SEASON` = 2016.

**Never hardcode a season year in NFL client copy — use the model.**

### Source → coverage map

| Data | Source (function) | Seasons | Join key |
|---|---|---|---|
| Players, ADP, metadata, depth, injury | Sleeper (`/api/sleeper`) | current | Sleeper `player_id` |
| Fantasy trending (add/drop) | Sleeper (`/api/sleeper`) | live 24h | Sleeper `player_id` |
| Mock draft (`js/fantasy.js`) | Sleeper ADP | current | Sleeper `player_id` |
| Stat leaders (`/api/nflstats`) | ESPN core API | **2000+** | ESPN athlete id (resolved server-side) |
| Player season stats (`/api/nflplayer`) | ESPN | any | team roster **name match** → ESPN athlete id |
| Game logs (`/api/nflgamelog`) | ESPN gamelog | any played | ESPN athlete id (from `/api/nflplayer`) |
| Advanced / Next Gen Stats (`/api/nfladv`) | **nflverse** (CC-BY-4.0) | **2016+** | name+team → NGS `player_display_name` |
| Scores, schedule, standings, teams (`/api/nfl`) | ESPN | current | ESPN team id/abbr |

**Join note:** Sleeper's own ESPN/gsis ids are sparse (~25–33%), so player stats/logs/advanced bridge by **normalized name (+team)** against the authoritative source, not by Sleeper id. ESPN team-id↔abbr and Sleeper↔ESPN abbr aliases (WSH↔WAS, OAK→LV) live in the functions.

**Caching by volatility:** past seasons are immutable → long cf `cacheTtl`; current-season data → short (scores SHORT, NGS/stats refresh in-season). Client also caches via `ApiCache`.

**Prepared for the upcoming season:** when 2026 kicks off, the season model flips automatically, ESPN scores/standings/stats populate from their live endpoints (the offseason empty-states clear on their own), and incoming weekly stats flow through the same functions with no code change.
