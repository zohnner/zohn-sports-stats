# SportStrata — Claude Code Instructions

## Identity
**Brand:** SportStrata | **Tagline:** "Serious stats for serious fans"
**Product:** Free MLB analytics dashboard for broadcast professionals, fantasy players, and data fans. Every core feature works fully signed-out, forever (D-034); an optional free account (D-031, additive-only) adds cross-device sync for follows/prefs — it is never required to use the site.
All user-facing text uses "SportStrata". Never revert to "ZohnStats".

---

## Sport Focus — READ THIS FIRST
**MLB is the primary product; NFL is now a live public-beta surface (as of 2026-06-14).** Per D-012/D-013/D-014, NFL was promoted from preview to beta. Shipped: a header sport switcher, NFL Scores / Standings / Teams (ESPN via the `/api/nfl` Pages Function proxy), an offseason state, and a no-login **Mock Draft simulator** (`js/fantasy.js`, Sleeper data via `/api/sleeper`, ADP + Monte Carlo). NFL feature work is in scope and expected.

**NBA and NHL remain preview-only** — do not propose NBA/NHL feature work unprompted. **NCAA Football is a live surface (D-042, 2026-07-06):** Scores (offseason-aware), Rankings (AP/Coaches/CFP), conference-grouped Standings + Teams, and the home sport-picker band all shipped. Player leaders/detail were deferred (CFB player data too sparse). **Live game viewer Phase 2 shipped (D-120, 2026-08-29):** the 2026 season's first game (SJSU @ USC, Week 0, event 401864494) went final on 2026-08-29, giving the live check D-118's Phase 1 skeleton was waiting on. `data.drives`/`winprobability`/`leaders`/`boxscore`/`standings` all verified against that real game to carry the same shapes NFL's `/summary` does (down to the same "standings entries[].team is a bare location string" quirk) — so `js/ncaafLiveGame.js` now ships the tabbed body too: Summary/Play-by-Play/Box Score/Team Stats/Analytics tabs plus a sidebar (win probability, game leaders, game flow, conference standings), cloned from `js/nflLiveGame.js`'s D-080 architecture. No Fantasy tab (no NCAAF fantasy feature exists). **Still deferred:** the live field-position graphic (down & distance, ball spot) — ESPN's `/scoreboard` `situation` field needs a genuinely in-progress game to verify, and none was live during this check (next kickoff: Sept 3). Do not build that piece on the NFL shape as an assumption — verify it live first, the way D-105 did for NFL. NCAAF feature work is in scope.

**Men's College Basketball (NCAAB) is a live 5th surface (D-052, ratified 2026-08-10):** Scores (offseason-aware), conference-grouped Standings + Teams, Rankings (AP/Coaches). Same ESPN-proxy-clone pattern as NCAAF. Player leaders/detail data-checked as viable but not built (owner decision pending). NCAAB feature work is in scope. **[Doc-sync catch-up 2026-08-10 — this file had not been updated when NCAAB shipped; corrected in the same pass as the WNBA addition below per the standing doc-sync rule.]**

**WNBA is a live 6th surface (D-092, 2026-08-10, owner override of D-052's calendar-gap recommendation — see DECISIONS.md D-092 for the full trade-off record):** Scores (offseason-aware, Apr-Oct season), conference-grouped Standings (Eastern/Western, flat — no divisions), Teams, and Leaders (PPG/RPG/APG/SPG/BPG/FG%/FT%) + player detail (D-092 Resolution 5, same-day follow-up — a live data-depth check undeferred this). A Live/Final Game panel (`showWNBAGame`, `wnba-game-{id}`) and a standings-derived Playoff Picture (`wnba-playoffs`, top-8-overall snapshot, no per-conference bracket) shipped D-092 Resolution 6, 2026-08-10/12 — the game panel combines scoreboard score/status with `/summary`'s season-context stats (ESPN's WNBA `/summary` has no top-level score header the way NFL's does; its `boxscore.teams[].statistics`/`leaders[]` are season averages, labeled as such in the UI, not this-game's box score). No Rankings (no poll exists for a pro league — this is a real, permanent gap, not a deferral). No team roster/team-detail page yet. WNBA feature work is in scope.

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

**Script load order matters** (see `index.html`): `config.js` → `detailFrame.js` → `errorHandler.js` → `cache.js` → `schema.js` → `api.js` → `glossary.js` → `players.js` → `leaderboards.js` → `teams.js` → `games.js` → `charts.js` → `playerDetail.js` → `statBuilder.js` → `mlb.js` → `odds.js` → `scorecard.js` → `liveGame.js` → `shareCard.js` → `highlightCard.js` → `nfl.js` → `nflLiveGame.js` → `nflStandings.js` → `fantasy.js` → `sos.js` → `nhl.js` → `ncaaf.js` → `ncaafLiveGame.js` → `ncaab.js` → `wnba.js` → `arcade.js` → `standings.js` → `db.js` → `query.js` → `search.js` → `navigation.js` → `auth.js` → `news.js` → `scorebug.js` → `app.js`. Each file can reference globals defined by files loaded before it. **(Corrected 2026-08-10, D-092 doc-sync pass — this line had drifted stale before NCAAB/WNBA were added; verify against `index.html` directly if it drifts again.)**

---

## Global State

`AppState` in `api.js` holds all runtime state. Key fields:

```js
AppState.currentSport   // 'nba' | 'mlb' | 'nfl' | 'nhl' | 'ncaaf' | 'ncaab' | 'wnba'  (default: 'mlb')
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
| `DESIGN.md` | **The house style constitution (D-040)** — posture, color language, type ramp, the four house patterns (receipts, border=identity/badge=state, skeletons, category-color discipline), copy voice, motion rules. Visual review checks against it |
| `index.html` | Static shell: `<script>` load order (defines global scope), 3-row header structure, nav markup, CSP `<meta>` |
| `js/config.js` | Shared utilities: `_escHtml()`, `_normName()` + NBA team colors, `getTeamColors()`, `getNBATeamLogoUrl()` |
| `js/mlb.js` | All MLB logic: team colors/logos, API calls, all MLB view renderers, `MLB_SEASON`, `MLB_LEADER_CATS`, `_computeBattingRates`, `_computePitchingRates` |
| `js/liveGame.js` | Live game expanded view (P3-025): `showMLBLiveGame()`, `openLiveGamePanel()`, diff-based linescore polling, pitch zone, box score. Loads after `scorecard.js` |
| `js/scorecard.js` | Baseball scorecard (P3-022): historical + live modes, 9×9 grid render, html2canvas PNG export |
| `js/shareCard.js` | Shareable stat cards (P3-027): `shareStatCard()`, offscreen 600×315 card → 2× PNG via html2canvas, Web Share / download. Reuses `_scLoadHtml2Canvas()` from scorecard.js. **D-049:** reusable `shareCardElement({cardEl,...})` generalizes the render+share plumbing for any feature card (used by the mock-draft result card in `fantasy.js`). **D-101 (2026-08-16):** `navigator.share()` failures other than `AbortError` (user-cancel) now fall back to a direct download via `_shcDownloadBlob()` instead of failing the whole export — `canShare()` can report true while `share()` itself still throws (e.g. OS permission denial), and the PNG had already rendered successfully by that point. Covers all 5 call sites: `shareStatCard()` (MLB leaderboard, `mlb.js`) and `shareCardElement()` (MLB+NFL Highlight Card Studio in `highlightCard.js`, fantasy mock-draft card in `fantasy.js`) |
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
| `js/query.js` | Ask Bar (D-039): `parseStatQuery()` grammar + `runStatQuery()` over `mlbLeaderSplits`; renders the answer panel inside ⌘K. Entity tables only — no model, no inference |
| `js/odds.js` | October Odds (D-039 2c): seeded Monte Carlo playoff odds (`_mlbOddsSim` pure core, `_mlbOddsEnsure` fetch+sim, `_mlbOddsCell` render hook) — standings DIV%/OCT% columns |
| `js/charts.js` | `StatsCharts` — Chart.js wrappers; always call `StatsCharts.destroyAll()` before re-rendering |
| `js/schema.js` | `ApiShape` — API response validation helpers |
| `js/errorHandler.js` | Global error boundary; exposes `Logger` |
| `js/glossary.js` | Stat definition tooltips |
| `js/arcade.js` | Mini-games |
| `js/db.js` | IndexedDB persistence layer (favorites, recents) |
| `js/nfl.js` | NFL preview (ESPN public API) |
| `js/nhl.js` | NHL preview (api-web.nhle.com) |
| `js/ncaaf.js` | NCAA Football (D-042) — ESPN college-football via `/api/ncaaf` (+ `/api/ncaafstandings`); season model, Scores (offseason-aware), Rankings (AP/Coaches/CFP), conference-grouped Standings + Teams |
| `js/ncaafLiveGame.js` | NCAAF live game viewer (D-118 Phase 1 2026-08-22, D-120 Phase 2 2026-08-29) — `showNCAAFGame(eventId)` reads `/api/ncaaf?path=/summary`. Score header (Phase 1) plus a tabbed body: Summary (linescore/scoring feed/CFB news), Play-by-Play (drives), Box Score (all stat groups), Team Stats, Analytics (success rate/drive efficiency) — and a sidebar (win probability, game leaders, game flow, conference standings). Cloned from `js/nflLiveGame.js`'s D-080 tab architecture (mount-once shell, poll only touches header/sidebar/active tab so tab state survives a live re-render) and reuses its `.nlg-*`/`.gv-*` CSS verbatim — no CSS file of its own. No Fantasy tab. **Still deferred:** the live field-position graphic — ESPN's `/scoreboard` `situation` shape is unverified for NCAAF (no live game existed during the D-120 check); do not build it without a live check the way D-105 did for NFL |
| `functions/api/ncaaf.js` | Pages Function — same-origin ESPN college-football proxy (clone of `nfl.js`), allowlisted paths, no keys/D1 |
| `functions/api/ncaafstandings.js` | Pages Function — CFB standings via `site.web.api` (the `site.api` standings feed is a stub, same as NFL/D-029); season-parameterized conference tree, no keys/D1 |
| `js/ncaab.js` | Men's College Basketball (D-052) — ESPN via `/api/ncaab` (+ `/api/ncaabstandings`); season model (end-year labeled), Scores (offseason-aware), Rankings (AP/Coaches), conference-grouped Standings + Teams. Player leaders/detail deferred |
| `functions/api/ncaab.js` | Pages Function — same-origin ESPN men's college basketball proxy (clone of `ncaaf.js`), allowlisted paths, no keys/D1 |
| `functions/api/ncaabstandings.js` | Pages Function — CBB standings via `site.web.api`; season-parameterized conference tree (flatter than NCAAF's — same recursive collector, fewer nesting levels), no keys/D1 |
| `js/wnba.js` | WNBA (D-092, owner override of D-052) — ESPN via `/api/wnba` (+ `/api/wnbastandings`, `/api/wnbastats`, `/api/wnbaathlete`); single-calendar-year season model (Apr-Oct), Scores (offseason-aware), Standings (Eastern/Western, flat — no divisions), Teams, Leaders + player detail (Resolution 5). **Resolution 6 (2026-08-12):** `showWNBAGame(id)`/`wnba-game-{id}` — Live/Final Game panel combining scoreboard score/status with `/summary`'s season-context stats, leaders, venue, broadcasts (labeled "season," never implied as this-game's box score — ESPN's WNBA `/summary` has no score header block, unlike NFL's); `displayWNBAPlayoffPicture()`/`wnba-playoffs` — standings-derived top-8-overall playoff snapshot (no per-conference bracket, no odds model), games-back-of-8th-seed math, "if the season ended today" framing. No Rankings (no poll for a pro league). Self-contained ticker — deliberately does not call `Scorebug.normalizeNCAAFGame` (see `js/scorebug.js` note below) |
| `functions/api/wnba.js` | Pages Function — same-origin ESPN WNBA proxy (clone of `ncaab.js`), allowlisted paths, no keys/D1 |
| `functions/api/wnbastandings.js` | Pages Function — WNBA standings via `site.web.api`; flat two-conference tree (Eastern/Western, no division nesting), no keys/D1 |
| `functions/api/wnbastats.js` | Pages Function — WNBA statistical leaders (D-092 Resolution 5) via `sports.core.api.espn.com`; resolves top-5-per-category athlete $refs server-side (clone of `nflstats.js`/`ncaafstats.js`), 7 categories (PPG/RPG/APG/SPG/BPG/FG%/FT%), no keys/D1 |
| `functions/api/wnbaathlete.js` | Pages Function — per-player WNBA bio + season stats (D-092 Resolution 5) via `sports.core.api.espn.com` (clone of `ncaafathlete.js`), 3 stat groups (Offense/Defense \& Rebounding/General), no keys/D1 |
| `functions/api/mlb.js` | Cloudflare Pages Function — D1 edge cache proxy for `statsapi.mlb.com` + Savant |
| `js/detailFrame.js` | Shared cross-sport detail-page chrome (D-044 P1): `detailHeader()`, `detailSection()`. One source of truth for the player/team detail header so MLB/NFL/NCAAF stay in visual parity — sports differ only in the config object passed in, never a forked template. Loads right after `config.js` |
| `js/scorebug.js` | Shared cross-sport scorebug builder (D-047 S2): normalizes each sport's game data once, then renders it through one identical anatomy (pill/state, mono scores, team-color edge, logo slot). Loads after `news.js`, before `app.js`. **Known gap (found D-092):** NCAAB (`js/ncaab.js`) is not migrated to this model — its ticker calls `Scorebug.normalizeNCAAFGame`, which hardcodes `sport:'ncaaf'`, so NCAAB ticker items have carried the wrong league glyph and `data-sport` value since D-052 shipped. Not fixed yet (out of scope for D-092); WNBA (`js/wnba.js`) avoids the bug with its own self-contained, non-Scorebug ticker rather than reproducing the same mis-call |
| `js/auth.js` | Accounts (D-031, optional/additive — every page still works fully signed-out). `AuthState` (session + `follows` Set), sign-in sheet, account control, Turnstile-gated magic-link/Google/passkey flows. Owns the unified follow system: `AuthState.follows` is a local-first (`localStorage` key `zs_follows`) Set of `"sport:entityType:entityId"` keys; `toggleFollow()` is local-first-optimistic with best-effort background sync when signed in and dispatches `ss:follow-changed`; `renderFollowStar(sport, entityType, entityId, opts)` is the one favorite/follow UI across MLB/NFL/NCAAF/NBA cards and detail headers — do not reintroduce a per-sport heart button. `_migrateLegacyFavorites()` one-time-folds the old `zs_fav_teams`/`zs_mlb_favs`/`zs_favs` keys in. Loads after `navigation.js`, before `news.js` |
| `css/auth.css` | `.auth-*` namespaced styles: sign-in sheet, account control, account page, and the `.auth-follow-star` component (`--card-corner` and `--hgc` position variants) |
| `functions/api/auth/[[route]].js` | better-auth catch-all — session, magic-link, Google OAuth, passkey |
| `functions/api/follows.js` | GET/POST/DELETE a signed-in user's follows; session-scoped, D1-backed. `VALID_SPORTS` must be kept in sync with every sport the client-side follow star supports — it silently 400s (swallowed client-side, no visible error) for any sport missing from this set, which is exactly how NBA follows went unsynced until caught in a 2026-08-05 review |
| `functions/api/prefs.js` | GET/POST a signed-in user's preferences, session-scoped D1 |
| `functions/api/me.js` | Current-session user info + export/hard-delete account endpoints |
| `functions/api/pushSubscribe.js` | GET/POST/DELETE a signed-in user's Web Push subscriptions (D-079, F5); session-scoped, D1-backed, modeled on `follows.js`. Consumed by `worker/push-game-alerts.js`, not by any Pages Function |
| `migrations/` | D1 schema migrations for the accounts/follows/prefs tables (better-auth canonical schema + `follows`/`prefs`/`rateLimit`/`push_subscriptions`/`push_sent_log`) |
| `functions/api/youtube.js` | (D-083) Owner-only YouTube channel insight endpoint — gated by a timing-safe-compared shared secret header (`X-YouTube-Dashboard-Key`, same pattern as `worker/push-game-alerts.js`'s `/__run`), not the accounts system. Fetch-on-visit, `YT_CACHE` KV-cached 3h. Requires `YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN/CHANNEL_ID` (same four as `bot/youtube_stats.py`, D-082) plus `YOUTUBE_DASHBOARD_KEY` |
| `youtube-insights.html` | (D-083) The hidden page `functions/api/youtube.js` serves — unlinked, `noindex`, not in `index.html`/`sw.js`/`_routes.json`/`sitemap.xml` on purpose (needs none of them). Reached via a private bookmark: `youtube-insights.html?key=YOUR_YOUTUBE_DASHBOARD_KEY` |

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

### NFL / NHL / NCAAF / NCAAB / WNBA (NHL preview; NFL/NCAAF/NCAAB/WNBA live)
- **NFL:** ESPN public API — `https://site.api.espn.com/apis/site/v2/sports/football/nfl/`
- **NHL:** `https://api-web.nhle.com/` (preview only — do not extend unprompted)
- **NCAAF (D-042):** ESPN college-football — `https://site.api.espn.com/apis/site/v2/sports/football/college-football/` via `/api/ncaaf` (scoreboard, rankings). Same host as NFL → no CSP change. Standings + conference-grouped Teams read `site.web.api.espn.com/.../college-football/standings` via `/api/ncaafstandings` (season-parameterized; the `site.api` standings feed is a stub). Shipped: Scores, Rankings, Standings, Teams. Player leaders/detail deferred (CFB player data too sparse — D-042).
- **NCAAB (D-052):** ESPN men's college basketball — `site.web.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball` via `/api/ncaab` (site.api's version is Cloudflare-egress-blocked, same WAF issue D-062 found for NFL). Standings + Teams read `/api/ncaabstandings` (recursive conference/division collector — ~32 conferences, mostly flat). Shipped: Scores, Rankings, Standings, Teams. Player leaders/detail data-checked as viable, not built (owner decision pending).
- **WNBA (D-092):** ESPN WNBA — `site.web.api.espn.com/apis/site/v2/sports/basketball/wnba` via `/api/wnba`. Standings read `/api/wnbastandings` — a flat two-conference tree (Eastern/Western, no division nesting), the simplest of any sport's standings feed. Leaders/player detail (Resolution 5) resolve via `sports.core.api.espn.com` through `/api/wnbastats` + `/api/wnbaathlete`. Game panel (Resolution 6) reads `/summary?event={id}` for season-context stats/venue/broadcasts — that endpoint has no score/status block, so score/status comes from the existing scoreboard fetch instead. Shipped: Scores, Standings, Teams, Leaders + player detail, Live/Final Game panel, Playoff Picture. No Rankings (no poll for a pro league).

---

## Nav / Routing

Hash-based routing. `navigateTo(view)` → updates `AppState.currentView`, syncs `.active` on all `.nav-tab[data-view]`, calls `renderCurrentView(view)`, pushes history state.

**Active state sync:** `navigateTo` calls `document.querySelectorAll('.nav-tab[data-view="${view}"]').forEach(t => t.classList.add('active'))`. Every nav button across all three surfaces uses the `.nav-tab` class and `data-view`, so active state stays in sync automatically — no per-surface code needed.

**`renderCurrentView(view)` dispatch logic:**
- `view.startsWith('mlb-')` → `_renderMLBView(view)`
- `view.startsWith('nfl-')` → `_renderNFLView(view)`
- `view.startsWith('nhl-')` → `_renderNHLView(view)`
- `view.startsWith('ncaaf-')` → `_renderNCAAFView(view)`
- `view.startsWith('ncaab-')` → `_renderNCAABView(view)`
- `view.startsWith('wnba-')` → `_renderWNBAView(view)`
- All other views (including `'home'`) → NBA/shared switch statement
(Corrected 2026-08-15, NAV/SEO doc-sync pass — `ncaab-`/`wnba-` dispatch has existed since D-052/D-092 shipped; this list hadn't been updated for either.)

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

**`home` view — CRITICAL RULE (amended by D-042):** `home` is the sport-agnostic front door. `loadHome()` in `app.js` **must** call `_applySportUI('home')` as its first line (was `'mlb'` before D-042) — never remove or move that call. `_applySportUI('home')` sets a neutral SportStrata brand, renders the sport-picker band as the launchpad, and highlights no sport in the switcher; the sub-nav still defaults to MLB context so it is never empty.

**Home Data-Story hero + live game states (D-046 P1/P2):** `loadHome()` renders a `#homeHero` host (above the search bar) populated by `_renderHomeHero(games)` in `app.js` — one focal narrative per load chosen by real signal: highest-**leverage live game** → **marquee upcoming** game (combined win% + division-rivalry) → fallback to the **tightest division race** (`_heroFromStandings`). **Cross-sport since D-100 (2026-08-15):** `_renderHomeHero` no longer defaults to MLB unconditionally — it also fetches the NFL scoreboard every home load and scores NFL's best live/upcoming candidate on the same currency (`_nflLeverage`/`_nflMarquee` in `app.js`, calibrated to MLB's existing numeric range; `_nflGameHasFav` mirrors the P5 favorite-team bonus described below), then renders whichever sport's candidate scores higher — live always beats upcoming, within and across sports. This replaced a fixed Nov–Feb calendar gate (`_homeHeroSport()`, now superseded and unused — left in place as historical record, do not call it) that had kept NFL out of the hero for most of the year, preseason included. When NFL wins the hero slot, `_heroFromNFLGame()` renders D-099's reused live-detail markup (`.game-situation`/`.game-leaders` inside `.hero-live-detail`, the same classes the NFL Scores grid uses) plus a broadcast-network kicker, matching MLB's own hero detail treatment — one recipe, not a forked one. No licensed photos — generated matchup board + logo lockups only. The Today's Games cards (`_gameCard(g)`) render UPCOMING/LIVE/FINAL from the schedule **linescore hydrate** (`fetchMLBSchedule` now hydrates `linescore`): inning tag (▲/▼/MID/END), outs dots, base-state diamond (`linescore.offense.first/second/third`, shown only during an active Top/Bottom half), and live pitcher·batter. Live games sort to the front. `setupMLBLivePolling` runs at 30s (guarded — only fetches when a game is live). The same linescore hydrate gives the ticker (`updateMLBTicker`) live inning parity. Live state never claims the card border (D-038 K2) — badge/kicker + glow only. A tabbed **Headlines + Insights rail** (D-046 P3, `#homeRail`) sits after Today's Games: `_renderHomeHeadlines()` pulls the `/api/news` MLB feed (relative timestamps via `_newsTimeAgo`, link-out) and `_renderHomeInsights()` renders templated leader-plus-margin bullets from `AppState.mlbLeaderSplits` (K, RBI, SB, WHIP — categories the Hot Strip doesn't already show) — no editorial staff; re-rendered when leader splits load. `_wireRailTabs()` toggles the two panels. Freshness (D-046 P4): `#homeUpdatedAt` shows "Updated Nm ago" from `AppState._homeGamesFetchedAt` (set in `_loadHomeTodayGames`, refreshed on the poll + a 30s ticker via `_updateHomeFreshness`). Pennant Races (in `_renderHomeMoment`) render as a division-win% **bar viz** (`.pennant-viz` — Monte Carlo `divOdds` width, leader logo, gap label) rather than the old chip row. **Team favorites (D-046 P5, merged into the unified follow system 2026-08-05):** favoriting a team is now the same `AuthState.follows`/`renderFollowStar` system used everywhere else (see `js/auth.js` in Key Files) — the original standalone `zs_fav_teams`/`_getFavTeams`/`_isFavTeam`/`_toggleFavTeam`/`.hgc-star` implementation was removed, not extended; do not reintroduce it. `_gameHasFav(g)` in `app.js` now calls `_isFollowed('mlb', 'team', abbr)` and still pins favorite-team games first in the Today's Games grid (rank 0 → live → rest), in the ticker (`updateMLBTicker` favorite-first sort), and adds a +100 bonus in the hero leverage/marquee scoring. An `ss:follow-changed` listener in `app.js` re-sorts games/ticker and re-renders the Starred rail whenever an `mlb`/`team` follow toggles, since favoriting can now also happen from a team card or team detail page, not just the home game card.

**`_applySportUI(sport)` — what it does (corrected 2026-08-15, was badly stale — see Nav System below):**
Not brand-text-only. Sets `#brandIcon`/`#brandSub`, then re-renders all three nav surfaces plus the sport switcher for the given sport: `_renderSubNav(sport)`, `_renderBottomNav(sport)`, `_renderMenuPanel(sport)`, `_renderSportSwitch(sport)`, `_applySportSearchPlaceholder(sport)`. `sport === 'home'` is a special case (D-042): neutral brand, nav surfaces default to `'mlb'` content so they're never empty, sport switcher renders with nothing marked active (`_renderSportSwitch(null)`). Falls back to mlb brand/nav if sport is unrecognized — always pass a valid sport string.

---

## Header Layout (3-row structure)

The `<header>` element has 3 stacked rows (all within the sticky header band):

1. **`.header-inner`** (`--header-height` = 60px) — brand logo/name, search button, theme toggle, menu button (`.menu-btn`, mobile only)
2. **`.header-ticker`** (`--ticker-height` = 38px) — live scores marquee with SCORES button
3. **`.sub-nav`** (`--header-sub-h` = 36px) — per-sport nav tabs, re-rendered on every sport switch (see Nav System below; hidden on mobile ≤768px)

Total header height on desktop: `calc(var(--header-height) + var(--ticker-height) + var(--header-sub-h))` = 134px.

---

## Nav System (Three Surfaces)

**Rewritten 2026-08-15 (NAV/SEO doc-sync pass) — this section previously described a static, MLB-only, no-dropdown nav. That stopped being true when D-026 made the nav data-driven and has been wrong since at least D-052/D-092 (NCAAB/WNBA) shipped; flagged once already 2026-08-10 (ISSUES.md, "Nav rename" item) and missed in that pass. Below is the actual current system.**

All three surfaces — plus the header sport switcher — are **data-driven per sport**, defined in `js/navigation.js` and re-rendered by `_applySportUI(sport)` on every sport switch (never hand-edit the static per-sport markup in `index.html`; it's pre-JS fallback content only, overwritten on first render). Every rendered button still carries `.nav-tab` + `data-view`, so `navigateTo()`'s active-state sync keeps working automatically regardless of which sport's tab set is currently rendered — this invariant is why adding a sport never requires touching the sync logic itself.

**Source-of-truth tables (`js/navigation.js`):**
- `SPORTS_META` — one entry per sport (id, label, icon, brand sub-text, default view, accent color). `SPORTS` is the ordered subset actually shown in the switcher/picker band: `['mlb', 'nfl', 'ncaaf', 'ncaab', 'wnba']` (nba/nhl stay registered in `SPORTS_META` but omitted from `SPORTS` — preview sports are deliberately not surfaced rather than shipping a broken tab, per the comment at the registry's definition).
- `SUB_NAV_TABS[sport]` → `_renderSubNav(sport)`. Flat items render as a plain `.sub-nav-item` button; an item with `children` renders as a `.sub-nav-cat` dropdown (`.sub-nav-parent` + a `position:fixed` `.sub-nav-menu`, D-026 P2 — fixed because the sub-nav itself is `overflow-x:auto`, which would clip an absolute-positioned menu). Current shape: **mlb** — Players, Teams, Standings, an **Analytics** dropdown (Leaders/Compare/Builder/Prep/Highlight/Arcade), News. **nfl** — Players, Teams, Standings, an **Analytics** dropdown (Leaders/Compare/Highlight), a **Fantasy** dropdown (D-103: two titled columns, 9 items total, Compare excluded — reachable from Stats & Leaders only, one path not two — **Draft Prep**: Draft HQ/ADP Rankings/Schedule/Mock Draft/My Drafts, **In-Season**: My League/Trending/Injury Report/Waiver Wire), News. **ncaaf** / **ncaab** — flat: Scores, Standings, Teams, Rankings, (Leaders for ncaaf only), News. **wnba** — flat: Scores, Standings, Teams, Leaders, Playoff Picture, News. (MLB/NFL omit a standalone "Scores" tab because the ticker's SCORES button already routes there via `data-view="{sport}-games"`; NCAAF/NCAAB/WNBA include it because their ticker doesn't cover them the same way — not an inconsistency, see ISSUES.md D-102.) **(Corrected 2026-08-19, D-111 doc-sync — this line still said "10 items" including Compare and claimed no Draft Prep/In-Season titling, both true before D-103 but not after; D-103 already fixed the dropdown itself, this page just never caught up.)**
- `MENU_TABS[sport]` → `_renderMenuPanel(sport)` — same per-sport data, grouped under `{group:'...'}` section headers; the sub-nav's Fantasy dropdown mirrors the same Draft Prep/In-Season split (D-103) via its own titled `cols`.
- **In-page Draft HQ strip (`_hqStrip()`, `js/fantasy.js`) is a separate, smaller thing from the header dropdown above — don't conflate them.** Rendered at the top of each Draft Prep/In-Season page's own body for quick lateral moves, scoped to one group per page since D-111 (5 Draft Prep tabs or 4 In-Season tabs, never both — it used to render all 10 regardless of the page, duplicating the header dropdown; see DECISIONS.md D-111). `nfl-draftkit` — the actual Draft HQ hub page, renamed from "Value Board" in the same pass — renders no strip at all; a Quick Tools link-card row plus a Bye Week Watch module (real `/api/nflsos` data joined onto the top-40 value board) do that job instead.
- `BOTTOM_NAV_TABS[sport]` → `_renderBottomNav(sport)` — 4 sport-specific destinations + a `More` button per sport (not a fixed 5-item MLB-only list).
- `_renderSportSwitch(sport)` renders the header `.sport-switch` buttons from `SPORTS`; `index.html`'s static two-button (MLB/NFL) markup is only what a client sees before JS executes.

### 1. Sub-nav (`#subNav`, `.sub-nav`) — desktop only (hidden ≤768px)
Sticky row in header, contents per `SUB_NAV_TABS` above.

### 2. Menu panel (`#menuPanel`, `.menu-panel`) — mobile only (`display:none` ≥769px)
`position: fixed; top: calc(var(--header-height) + var(--ticker-height))` — drops from under the header+ticker. Grid of grouped tile buttons per `MENU_TABS` above. Opened/closed by `#menuBtn` (`.menu-btn`). JS: `initMenu()` / `_closeMenu()` in `navigation.js`.

### 3. Bottom tab bar (`#bottomNav`, `.bottom-nav`) — mobile only (`display:none` ≥769px)
`position: fixed; bottom: 0`. 4 primary destinations + `More` per sport, per `BOTTOM_NAV_TABS` above.

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
| `css/auth.css` | `.auth-*` namespaced (D-031): sign-in sheet, account control/page, `.auth-follow-star` (the one favorite/follow UI across every sport and surface — `--card-corner` and `--hgc` position variants) |

**Key design tokens:**
- Surfaces: `--bg-base`, `--bg-surface`, `--bg-raised`, `--bg-card`, `--bg-card-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-subtle`, `--text-disabled`
- Accent (brand orange-gold): `--accent` (`#ff8100`), `--accent-light` (`#ffd200`), `--accent-dark`, `--accent-subtle`, `--accent-border`
- Borders: `--border-default`, `--border-mid`, `--border-strong`, `--border-accent`
- Semantic: `--color-win` (green), `--color-loss` (red), `--color-live` (hot pink/magenta, `#ff006e` — corrected 2026-08-02; was documented as "amber" but never was, caught while designing N-17's injury-status badges), `--color-error`
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
- **`worker/`** — Cloudflare Worker for the BDL proxy (P1-006 fix target), plus `worker/wrangler-auth-purge.toml` (D-031) — a cron Worker that purges expired sessions/`audit_log` rows daily, sharing the same `USER_DB` D1 binding as the Pages Functions. Also `worker/broadcast-blurb.js` (F1, `wrangler-blurb.toml`) — the Broadcast Blurb feature's Worker, calling **Gemini** (`generativelanguage.googleapis.com/v1beta/interactions` — the same contract already proven in the sibling `sportstrata-video` repo's `src/script.js`), TTL-cached in Workers KV (`BLURB_CACHE`, required binding, not optional) so cost is bounded per D-039 rather than metered per click. **Anthropic is not used anywhere on this site** (owner decision, 2026-08-08) — Gemini is the one LLM vendor for the whole project. Deployment still pending owner authorization (P2-005).
- **`worker/push-game-alerts.js`** (D-079, F5, `wrangler-push.toml`) — cron Worker, every 10 minutes, sends Web Push game-start alerts to followed-team subscribers via `@block65/webcrypto-web-push` (`compatibility_flags = ["nodejs_compat"]` required — the package's `node:crypto` fallback needs it). Shares `USER_DB`. Upstream calls to MLB/ESPN must use the same headers already proven by `functions/api/mlb.js`/`nfl.js` (`User-Agent: SportStrata/1.0` for statsapi; a browser-realistic UA + `site.web.api.espn.com` — not `site.api.espn.com`, which is Cloudflare-egress-blocked, see `nfl.js`'s 2026-08-07/08 comment — for ESPN) or it silently gets an HTML block page back instead of JSON, caught live via the shared-secret `/__run` endpoint the first two times this Worker was deployed.
- **`USER_DB`** — the D1 binding backing accounts/follows/prefs (`functions/api/auth/`, `follows.js`, `prefs.js`, `me.js`). Bound via the Cloudflare Pages dashboard (git-integrated build), not `wrangler.toml` directly — see the comment at the top of `wrangler.toml`.
- **Cloudflare Web Analytics** (2026-08-09, live token added same day) — cookieless usage tracking, the prerequisite for any data-driven retention work (nothing measured user behavior before this). Manually embedded (not the dashboard's auto-injection toggle, to keep `index.html` the one source of truth for what loads) via a `<script type="module">` tag before `</body>`, with the owner's real site token in place. CSP allowlists `https://static.cloudflareinsights.com` (script-src) and `https://cloudflareinsights.com` (connect-src) in both `index.html` and `_headers`. Live and collecting as of this commit.
- **`functions/api/youtube.js` + `youtube-insights.html`** (D-083) — owner-only YouTube insight tool, outside the SPA entirely (no `_routes.json`/`sitemap.xml`/script-chain entry needed; the page is a plain static file, `/api/*` already covers the Function). **Owner setup required before this works, cannot be done from a session** (Cloudflare account settings): add `YOUTUBE_DASHBOARD_KEY` (Pages → Settings → Functions → Environment variables, Secret type) alongside the four `YOUTUBE_*` values already used by `bot/youtube_stats.py` (D-082), and create + bind a `YT_CACHE` KV namespace the same way `USER_DB` was bound. Fails closed (503) until both exist.

**Before any push:** run `/deploy-check` — it validates the BDL key, CSP consistency, committed state of critical files, unit tests (`node --test tests/stats.test.js tests/vbd.test.js tests/query.test.js tests/odds.test.js`), delivery-manifest sync (`tools/check-manifest.cjs` — index.html ⇄ sw.js STATIC_ASSETS ⇄ disk), theme contrast (`tools/check-themes.cjs`), and NUL-byte corruption on changed files. After deploy, `tools/join-health.cjs <site-url>` measures the Sleeper⇄nflverse name-join rate (weekly in-season). Never add a js/css file without updating BOTH index.html and sw.js — check #10 fails otherwise.

### Path URLs & Edge Rendering (SEO — D-041 / D-045)

Real crawlable path URLs are served by Cloudflare Pages Functions that prerender the SPA shell with a per-page `<head>` (title/description/canonical/OG/JSON-LD) + a crawlable content snapshot injected into `#playersGrid`, then set `window.__SS_ROUTE` (honored in `js/navigation.js` `_loadFromHash`) so the SPA hydrates the right view on boot. **Same HTML for humans and bots** (no UA sniffing); any error **fails safe** to the untouched app; relative `href`/`src` are absolutized so deep paths resolve.

- **Home edge-render (D-046 P6):** `functions/index.js` → `/`; prerenders the shell with a dynamic-date `<head>` ("MLB Scores, Stats & Analytics — {date}") + a crawlable **today's-MLB-games** snapshot (live statsapi fetch, cf-cached 120s, best-effort — never throws) injected into `#playersGrid`, plus WebSite JSON-LD. No `__SS_ROUTE` (the SPA already boots to `home` and overwrites the snapshot). Any error fails safe to the untouched shell — it's the highest-traffic page. **Requires `/_routes.json`:** the static `index.html` shadows a root Function unless `/` is explicitly in the routes `include` list — so `/_routes.json` enumerates every Function path (`/`, `/api/*`, `/mlb`, `/mlb/*`, `/nfl`, `/nfl/*`, `/ncaaf`, `/ncaaf/*`, `/ncaab`, `/ncaab/*`, `/wnba`, `/wnba/*`, `/glossary`); **any new Function route must be added there** or it won't be invoked.
- **Sport landings (D-045):** `functions/{mlb,nfl,ncaaf,ncaab,wnba}/index.js` → `/mlb` `/nfl` `/ncaaf` `/ncaab` `/wnba`; each sets `__SS_ROUTE={sport}-home` → the clean `_renderSportLanding(sport)` view in `js/app.js` (one hero + seasonal line + entry cards). `SPORTS_META.defaultView` is `{sport}-home`, so entering a sport lands on its landing page (NFL's old `loadNFLHome` is kept but bypassed). **Gap found 2026-08-15 (DECISIONS.md D-102), closed 2026-08-31 (D-121):** NCAAB and WNBA had none of this. `functions/ncaab/index.js` + `functions/ncaab/standings.js` and `functions/wnba/index.js` + `functions/wnba/standings.js` + `functions/wnba/leaders.js` + `functions/wnba/player/[id]/[[slug]].js` now ship, `_routes.json` includes `/ncaab`/`/ncaab/*`/`/wnba`/`/wnba/*`, and `tools/gen-sitemap.cjs` lists them. **Deliberately no `/team/` template for either sport, and no `/player/` template for NCAAB:** verified directly against `js/ncaab.js`/`js/wnba.js`'s `_render{NCAAB,WNBA}View` dispatch before building — neither sport has a client-side per-team route yet (`{sport}-teams` is a grid only), and NCAAB has no player-detail view at all. A crawlable template that sets `__SS_ROUTE` to a view that doesn't exist would hydrate into nothing; build those templates only after the underlying SPA feature ships. WNBA's player template is real because `wnba-player-{id}` (`showWNBAPlayer`, D-092 Resolution 5) already exists.
- **MLB content (D-041 Phase 1):** `functions/mlb/team/[abbr].js`, `functions/mlb/player/[id]/[[slug]].js`, `functions/mlb/standings.js`. **Game pages (D-050):** `functions/mlb/game/[pk].js` → `/mlb/game/{pk}` (statsapi schedule fetch → per-game `<title>`/desc/canonical/OG + `SportsEvent` JSON-LD + crawlable snapshot; `__SS_ROUTE=mlb-live-{pk}` hydrates the SPA game panel via `showMLBLiveGame`). Covered by the existing `/mlb/*` route (no `_routes.json` change). Discovery: the home edge snapshot links each day's games to `/mlb/game/{pk}`. **Leaders (D-051):** `functions/mlb/leaders.js` → `/mlb/leaders` (statsapi `/stats/leaders` for HR/AVG/RBI/ERA/K/W → ranked snapshot + `ItemList` JSON-LD; must filter each category to its `statGroup` since e.g. `homeRuns` returns hitting+catching+pitching blocks). `__SS_ROUTE=mlb-leaders` (single-segment, already routed). Linked from the home edge snapshot for discovery.
- **NCAAB/WNBA content (D-121, 2026-08-31):** `functions/ncaab/standings.js` and `functions/wnba/standings.js` clone `functions/ncaaf/standings.js`'s recursive conference collector verbatim against `/api/ncaabstandings`/`/api/wnbastandings` — WNBA's tree is flatter (two conferences, no divisions) but the same collector handles it without special-casing. `functions/wnba/leaders.js` clones `functions/nfl/leaders.js` against `/api/wnbastats`, linking each leader to `/wnba/player/:id/:slug` but never to a team page (doesn't exist). `functions/wnba/player/[id]/[[slug]].js` clones `functions/nfl/player/[id]/[[slug]].js`, adapted for WNBA being ESPN-native end to end (no Sleeper-id bridge needed) via `/api/wnbaathlete?id=`. All four smoke-tested locally with `wrangler pages dev` against live upstreams before shipping (a real athlete id round-tripped correctly through title/canonical/JSON-LD/`__SS_ROUTE`; an invalid id failed safe to the plain shell, not a crash).
- **NFL standings (2026-08-31, Week 1 readiness pass):** `functions/nfl/standings.js` → `/nfl/standings` — NFL had a live standings feature (`js/nflStandings.js`) but was the one sport of MLB/NFL/NCAAF with no crawlable path for it. Clone of `functions/ncaaf/standings.js` against `/api/nflstandings` (same recursive conference/division collector — AFC/NFC → 4 divisions each is a strict subset of the shape the collector already handles). Covered by the existing `/nfl/*` route, no `_routes.json` change needed.
- `sitemap.xml` lists the path URLs, generated from live data by `node tools/gen-sitemap.cjs` (landings + MLB/NFL/NCAAF teams/players/games/leaders/standings/rankings). **Auto-refreshed daily** by `.github/workflows/sitemap-refresh.yml` (added 2026-08-31, SEO audit finding), which auto-commits the regenerated file straight to `main` if it changed — no more owner-remembers-to-run-it. That workflow enforces a hard floor (currently 800 URLs) before committing, since the generator deliberately fails open per-section (a dead upstream logs and skips rather than throwing) so an ESPN outage during a scheduled run degrades the count instead of erroring — without the floor, a bad day would silently shrink the live sitemap instead of failing the job loud. **Found stale 2026-08-31:** the committed file predated the D-057 commit that added `nfl/leaders`/`ncaaf/standings`/`ncaaf/rankings`/`ncaaf/player` to the generator, so those sections had zero sitemap presence for weeks despite their templates already being live — a one-time regen fixed it, the workflow above prevents recurrence. Hash routes should canonicalize to their path URL. Content templates (player/team) now exist for **MLB, NFL and NCAAF** (`functions/{mlb,nfl,ncaaf}/{team,player}/...`); NCAAB/WNBA are narrower (standings for both, plus leaders/player for WNBA only) per the team/player gap explained above.
- No new external hosts (same-origin `env.ASSETS` + already-allowlisted upstreams) → CSP unaffected. These Functions live outside `/api/`, so they are **not** covered by `functions/api/_middleware.js` rate limiting.

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
- Do not remove the `_applySportUI('home')` call from the top of `loadHome()` in `app.js` (D-042 — was `'mlb'`; the neutral home brand + sport-picker band is intentional, do not revert it to a forced MLB default)
- Do not add a per-sport heart/star favorite button — `renderFollowStar()` in `js/auth.js` is the one favorite/follow UI for every sport and surface (merged 2026-08-05; the old `zs_fav_teams`/`zs_mlb_favs`/`zs_favs` per-sport systems were removed, not just deprecated)
- If a sport is ever wired into `renderFollowStar()` for the first time, add it to `VALID_SPORTS` in `functions/api/follows.js` in the same commit — the server-side allowlist is a separate list from the client and does not update itself; a mismatch here fails silently (400, swallowed client-side) rather than throwing anywhere visible

---

## NFL Data Foundation (D-017/D-018/D-019)

NFL is multi-season and reads live from upstream with Cloudflare edge-caching (no D1 persistence — D-019). Season auto-detects and rolls every year via the model in `js/nfl.js`:
- `NFL_STATS_SEASON` — latest season with completed/accumulating stats (Sep–Feb = current year, else prior). Flips to the live season in September.
- `NFL_FANTASY_SEASON` — the season ADP / drafts / player profiles refer to (Mar onward = current year). Drives the "{season} NFL Season" / "enters {season}" / offseason copy.
- `NFL_LEADERS_MIN_SEASON` = 2000, `NFL_NGS_MIN_SEASON` = 2016.
- `_nflSeasonPhase()` (D-063) — the actual calendar model behind every NFL offseason/preseason UI decision. Returns `'offseason' | 'preseason' | 'regular' | 'postseason'`, not a binary flag. `_nflIsOffseason()` (`phase === 'offseason'`) is the narrow "genuinely nothing to show" signal; `_nflHasNoOfficialRecord()` (`offseason || preseason`) is the broader "records/standings are still 0-0" signal — preseason results never count toward the official record, so these two are not interchangeable. **Do not reintroduce a single Mar–Aug offseason boolean** — that was the exact bug D-063 fixed (August preseason games were being reported as "between seasons").

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
