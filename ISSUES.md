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

## P2 — High Priority (Significant UX Degradation)

### [P2-001] NBA stats map crash on malformed response shapes
- **File:** `js/api.js:307-374` (`fetchNBAStatsMap`)
- **Detail:** Assumes `json.resultSet.headers` and `rowSet` exist. No null guards. If `stats.nba.com` changes shape, all player season stats fail silently and every card shows "No season stats available".
- **Fix:** Add optional chaining + a structure validation check before processing.

### [P2-002] Player detail — league ranks wrong until page refresh
- **File:** `js/playerDetail.js:239-259` (`_computeLeagueRanks`)
- **Detail:** Reads `AppState.nbaStatsMap` synchronously. If called before `fetchNBAStatsMap` resolves, returns empty ranks `{}` and all rank badges are missing. Per-36 toggle hits the same stale map.
- **Fix:** Await `fetchNBAStatsMap` before computing ranks, or re-compute when the map resolves and the detail page is still open.

### [P2-003] Per-36 button loses its click handler after first toggle
- **File:** `js/playerDetail.js:123-130`
- **Detail:** `outerHTML =` replaces the DOM node, destroying all attached event listeners. The re-attach on line 129 has a race against chart rendering.
- **Fix:** Update button text/classes without replacing the node (use `textContent` / `classList.toggle`), or re-query and re-attach after the DOM write.

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

### [P2-007] db.js team lookup fails on case mismatch
- **File:** `js/db.js:194`
- **Detail:** `getTeamByAbbr` uppercases the input but stored abbreviations may be mixed case depending on which API wrote them. Ask engine team lookups silently return null.
- **Fix:** Normalize to uppercase at write time in `db.js`, or do a case-insensitive index scan.

### [P2-008] Leaderboard only shows top 8 — no way to see rank 9+
- **File:** `js/leaderboards.js:71`
- **Detail:** `slice(0, 8)` is hardcoded. Users have no way to expand or paginate.
- **Fix:** Default to 10, add a "Show more" button that reveals to 25, then 50.

---

## P3 — Medium Priority (Correctness / Edge Cases)

### [P3-001] BDL fetch silent partial failure on chunked player loads
- **File:** `js/api.js:209-230` (`fetchPlayerStatsAPI`)
- **Detail:** Chunk errors are silently swallowed. Calling code receives partial data with no indication that some players are missing stats.
- **Fix:** Collect chunk errors; after all chunks complete, if any failed, fire a warning toast: "Some player stats failed to load."

### [P3-002] Quarter scores show blank if API shape changes
- **File:** `js/games.js:83-114`
- **Detail:** Assumes `game.home_q1`, `game.home_q2`, etc. — specific BDL field names. Defaults to `—` on missing fields but no logging. Shape changes are invisible.
- **Fix:** Document expected shape in a comment; add a dev-mode console.warn if expected fields are absent.

### [P3-003] Rank badges computed on every render (O(n log n) per search keystroke)
- **File:** `js/players.js:119-124`
- **Detail:** `ppgRankMap` is rebuilt by sorting all players on every call to `displayPlayerCards`, which is called on every search keystroke.
- **Fix:** Compute ranks once when player data is loaded; cache in `AppState`.

### [P3-004] Stat Builder formula replacement — collision between similar stat names
- **File:** `js/statBuilder.js:143-166`
- **Detail:** String replace order matters. `pts` can match inside `3pts` if the replacement regex isn't bounded. Produces wrong formula evaluations for any formula mixing both.
- **Fix:** Use word-boundary regex (`\bpts\b`) for all stat key replacements.

### [P3-005] localStorage cache failure is silent
- **File:** `js/cache.js:58`
- **Detail:** `setItem` errors (quota exceeded, private mode) are caught but not surfaced. User on mobile/incognito gets slower loads with no explanation.
- **Fix:** On first write failure, toast "Cache unavailable — stats will reload each visit."

### [P3-006] Formula Builder evaluates against only first player
- **File:** `js/statBuilder.js:113`
- **Detail:** Validation uses `playersWithStats[0]`. If that player has any zero or missing stat, valid formulas fail validation with a misleading error.
- **Fix:** Validate against a player with the most complete stat profile, or try first 5 players and pass if any succeeds.

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

### [P4-007] Stat formula evaluation not cached — slow on 300+ players
- **File:** `js/statBuilder.js:154-172`
- **Detail:** `math.evaluate()` called per player per formula run. No parsed-AST cache.
- **Fix:** Pre-compile the formula once with `math.compile()` and call `.evaluate(scope)` per player.

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

## Closed

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

