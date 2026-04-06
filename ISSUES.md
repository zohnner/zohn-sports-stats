# ZohnStats — Issues & Roadmap

> Track bugs, UX gaps, and planned features here. Add new items as they come up.
> Format: brief description + enough context to act on it without re-investigating.

---

## Bugs

### [BUG-001] MLB ticker scrolls too fast
- **Status:** Open
- **File:** `css/ticker.css` → `.ticker` animation duration
- **Detail:** `animation: tickerScroll 50s linear infinite` — 50s is tuned for NBA which has fewer
  games on a given day. MLB can have 10–15 games, making the strip much longer, so it
  blows past at the same 50s regardless of content length. Either increase duration for
  MLB or calculate duration dynamically in JS based on item count.
- **Fix ideas:**
  - JS approach: after rendering ticker items, measure `.ticker` scrollWidth and set
    `style.animationDuration` proportionally (e.g. `px / 80` seconds).
  - CSS-only fallback: bump to ~120s and accept it's not perfectly tuned.

### [BUG-002] MLB scores not loading correctly
- **Status:** Open
- **File:** `js/mlb.js`
- **Detail:** Scores display incorrectly or fail to load. Needs investigation — could be
  API response shape mismatch, incorrect game status mapping, or a date/timezone issue
  causing the wrong day's schedule to be fetched.
- **Steps to investigate:**
  1. Open browser DevTools → Network tab, filter to `statsapi.mlb.com`
  2. Check response shape against what the render function expects
  3. Verify the date string passed to the schedule endpoint matches today's local date

---

## UX / Feature Gaps

### [UX-001] NBA Teams view — missing drill-down
- **Status:** Open
- **Files:** `js/teams.js`, `js/games.js`, `js/playerDetail.js`
- **Detail:** Clicking a team shows the team card but there is no deeper navigation.
  Three sub-features needed:
  1. **Recent scores** — show last N games for that team (scoreline + opponent + date)
  2. **Game detail view** — click a game to see box score (quarter-by-quarter, top
     performers, final stats)
  3. **Player drill-down** — click a player name/card within the team roster to load
     their existing player stat page (already built in `playerDetail.js`, just needs
     a navigation hook from the team context)
- **Suggested approach:**
  - Add a `teams` sub-view state: `teams → team-detail → game-detail`
  - Reuse the BDL games endpoint (already used in `games.js`) filtered by team ID
  - Game detail can reuse the game card component with an expanded layout
  - Player links: emit the same navigation event that the Players view already uses

---

## Future Sports Expansion

### [PLAN-001] NFL support — architecture prep
- **Status:** Planning
- **Target:** After MLB bugs are resolved
- **API candidates:**
  - ESPN public API (`site.api.espn.com/apis/site/v2/sports/football/nfl/...`) — same
    domain already in CSP, free, no key required
  - Sportradar NFL (paid, best data quality)
  - The Athletic / nfl.com scrape (fragile, avoid)
- **New files needed:**
  - `js/nfl.js` — NFL data layer (mirror of `mlb.js` structure)
  - `js/nflTeams.js` or extend `js/teams.js` with a sport param
- **Index.html changes:**
  - Add NFL nav tab (remove `disabled` from the existing placeholder button)
  - Add NFL mobile nav
- **CSS:** No new CSS files expected — all components already sport-agnostic via tokens.
  Add `--color-nfl` token to `variables.css` if a sport-specific accent is needed.
- **State management:** The `currentSport` global in `app.js` already has a pattern;
  add `'nfl'` as a valid value and wire up the switcher.

### [PLAN-002] NHL support — architecture prep
- **Status:** Planning (after NFL)
- **API candidates:**
  - NHL Stats API (`api-web.nhle.com`) — official, free, no key, well-documented
  - ESPN public API (`site.api.espn.com/apis/site/v2/sports/hockey/nhl/...`)
- **New files needed:** `js/nhl.js`
- **CSP update required:** add `https://api-web.nhle.com` to `connect-src` in both
  `_headers` and the meta-tag in `index.html` when NHL goes live
- **Logo source:** `https://assets.nhle.com/logos/nhl/svg/{teamAbbr}_light.svg`
  — add `https://assets.nhle.com` to `img-src` in CSP at that time

### [PLAN-003] Multi-sport shared infrastructure
- **Status:** Thinking
- **Goal:** Avoid copy-pasting the same patterns into nfl.js and nhl.js
- **Ideas:**
  - Abstract a `SportModule` interface: `{ init(), loadPlayers(), loadGames(),
    loadStandings(), loadLeaders(), getLogoUrl(id) }` — each sport file exports one.
  - `app.js` calls the active sport module's methods instead of sport-specific globals.
  - Shared ticker rendering: `js/ticker.js` (currently inline in each sport file)
    becomes a standalone module that accepts a normalized game array.
  - Shared standings table: parameterize by sport so one component handles all four.

---

## Notes

- Remove `'unsafe-inline'` from CSP `script-src` once inline `onclick`/`onkeydown`
  handlers in `index.html` and `onerror`/`onload` strings in `games.js` are migrated
  to `addEventListener` calls. Tracked here as a reminder, not a separate issue.
- All new sport modules must pass their logo domains through CSP review before launch.
