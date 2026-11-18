# NFL Stats: one sortable table replaces Players and Leaders

Date: 2026-11-16. Status: design approved in chat, awaiting owner review of this file. Decision number: take the next free D-number when this merges (re-check `origin/main` and open PRs first).

## Why

The NFL stats surfaces don't compete with Pro-Football-Reference, ESPN or NFL.com, which all lead with one dense, sortable table per category.

- **Leaders** (`displayNFLStatLeaders`, `js/nfl.js`) is nine cards of five names, one number each. Nobody past fifth, no sorting, no context columns. The cap is structural: `/api/nflstats` resolves five athletes per category.
- **Players** (`displayNFLPlayers`) is the first NFL tab and shows no stats: 120 bio cards (age, height, college) ordered by ADP.

## Data source (verified live 2026-11-15)

`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete`, called from the browser.

- Sends `Access-Control-Allow-Origin: *`, and the host is already in `connect-src` (`_headers`, `index.html`). No proxy, so the D-176 Cloudflare block does not apply.
- Params: `region=us&lang=en&contentorigin=espn&seasontype=2&season=YYYY&limit=1000&isqualified=true|false&category=…&sort=group.field:desc`.
- Categories that answer: `offense:passing`, `offense:rushing`, `offense:receiving`, `defense`, `specialTeams:kicking`, `scoring`. Bare `kicking` returns 400.
- `limit=1000` returns a whole category in one response (449 receivers, `isqualified=false`, 2026).
- Qualified counts in 2026: 48 passers, 60 rushers, 171 receivers (449 total). Defense barely filters: 1,309 of 1,331.
- Seasons back to 2000 return full data (2000 and 2010 passing checked).
- Response: `categories[]` gives each stat group's `names`/`labels`; each `athletes[i]` has `athlete` (id, displayName, teamShortName, position.abbreviation, headshot) and `categories[]` with `totals[]` aligned to that group's `names`. Values are display strings with thousands separators (`"2,618"`); `-` means none.
- ESPN's raw columns repeat QBR, and the return group labels ATT/YDS/AVG/LNG/TD twice. Columns are therefore curated, never rendered raw.

Rejected: a Pages Function proxy (blocked by ESPN, D-176); nflverse player CSVs (have EPA, but multi-megabyte and a week behind).

## The page

One view, `nfl-stats`, with the category in the hash: `#nfl-stats-passing` (default), `-rushing`, `-receiving`, `-defense`, `-kicking`, `-scoring`. Sort column and direction ride along as `#nfl-stats-receiving~receivingYards-desc`, so a shared link reproduces the view.

Top to bottom:

1. **Header:** title, season selector (`NFL_STATS_SEASON` down to `NFL_LEADERS_MIN_SEASON`), freshness receipt via `freshnessHtml` with `noteFetched('nfl/byathlete')`.
2. **Category tabs.**
3. **Leader strip:** top three in each tab's headline stats (Passing: YDS, TD, RTG; Rushing: YDS, TD, YDS/G; Receiving: REC, YDS, TD; Defense: SACK, TOT, INT; Kicking: FGM, FG%, LNG; Scoring: PTS, TD). Read from the same response; no extra request.
4. **Controls:** name search; team dropdown; position chips that fit the tab (Receiving: All/WR/TE/RB; Rushing: All/RB/QB/WR; Defense: All/DL/LB/DB, grouped from ESPN's DE/DT/NT, LB/OLB/ILB/MLB, CB/S/SS/FS); Totals / Per game; Qualified / All players on the offensive tabs only.
5. **Table:**
   - **Rows:** rank, then the pinned name cell (headshot, name, team, position), then the curated columns.
   - **Sorting:** a header click sorts in place. The first click goes in the column's better direction (lower first for INT thrown, sacks taken, fumbles), and a second click reverses it.
   - **Scrolling:** the table scrolls sideways inside its own container, never the page, and the name column stays pinned.
   - **Mobile:** works at 360px with a 16px gutter.
6. **Shading:** each stat cell is tinted by its percentile within the qualified pool for that tab and season, oriented so that better is always the stronger tint. Unqualified rows (All players view) and counting stats under 5 games played are unshaded, so a 1-for-1 backup can't paint as league-best. Uses design tokens with light and dark values; contrast checked by `tools/check-themes.cjs`.
7. **Per game:** counting columns divide by GP; rate columns (CMP%, AVG, RTG, QBR, FG%) are untouched; the column definition flags which is which.

### Curated columns

- Passing: GP, CMP, ATT, CMP%, YDS, AVG, YDS/G, TD, INT, SACK, RTG, QBR
- Rushing: GP, CAR, YDS, AVG, YDS/G, LNG, TD, FUM, FD
- Receiving: GP, REC, TGT, YDS, AVG, YDS/G, TD, LNG, YAC, FD
- Defense: GP, TOT, SOLO, SACK, TFL, PD, INT, FF
- Kicking: GP, FGM, FGA, FG%, LNG, 50+, XPM, XPA
- Scoring: GP, TD, FG, PAT, 2PT, PTS, TP/G

Each column is keyed by ESPN's stable `names` entry (group + field), never by label text. A column ESPN stops sending is dropped and logged, not rendered as blanks.

### Player links

Rows open the full Sleeper-keyed player page (`nfl-player-{sleeperId}`) when a normalized name + team join to the Sleeper pool resolves to exactly one player, the same join `displayNFLStatLeaders` uses today, made team-aware. Otherwise they open `nfl-player-espn-{id}`, which already exists. An ambiguous name is never guessed.

## Failure

If the ESPN request fails, the page falls back to today's leader cards from `/api/nflstats`, with a one-line note saying the full table is unavailable. If that fails too, the standard `ErrorHandler` retry state shows.

Caching is per category, season and qualified flag. `ApiCache.TTL.SHORT` applies to the current season in season, `TTL.DAILY` to completed seasons.

## What changes elsewhere

- **Nav:** `SUB_NAV_TABS.nfl`, `MENU_TABS.nfl` and `BOTTOM_NAV_TABS.nfl` replace Players + Leaders with one "Stats" entry; the bottom bar gains Teams in the freed slot.
- **Redirects:** `nfl-players` and `nfl-leaders` redirect to `nfl-stats` in `_renderNFLView` and `_loadFromHash`.
- **Internal links repointed:**
  - breadcrumb parents and back buttons in `js/nfl.js` (player detail, ESPN player page)
  - the offseason strip in `js/navigation.js`
  - `defaultViews` and `_SPORT_PLAYERS_VIEW` in `js/app.js`
  - `generic` offseason button in `js/nfl.js`
  - `nfl-players`/`nfl-leaders` labels in the breadcrumb table
- **Path URL:** `/nfl/leaders` stays the crawlable page (its snapshot still reads `/api/nflstats`) and now hydrates `nfl-stats`. Update `__SS_ROUTE` in `functions/nfl/leaders.js`, `failSafeRoute` in `functions/_shell.js`, and `_PATH_SINGLE_VIEWS`/`_viewPath` in `js/navigation.js` so `nfl-stats*` maps to `/nfl/leaders`; the existing round-trip test covers it.
- **Removed:** `displayNFLPlayers`, `_createNFLPlayerCard`, `loadNFLPlayers`, plus their CSS if nothing else uses it. `loadNFLStatLeaders`/`displayNFLStatLeaders` stay, unrouted, as the fallback renderer. ADP Rankings already lists players by ADP with tiers, position rank and injury status; height, college and the follow star live on the player page.
- **Kept:** `/api/nflstats`. The NFL landing insights (`js/app.js`), `/nfl/leaders` and the `nfl-leaders` contract read it.

## Code layout

- **`js/nflStatsTable.js` (new, DOM-free):**
  - `NFLStatsTable.CATEGORIES` (column definitions)
  - `parse(json)`: athletes become rows of numbers; strips separators and maps `-` to null
  - `sortRows(rows, key, dir)`
  - `perGame(rows, cols)`
  - `percentiles(rows, cols, qualifiedIds)`
  - `filterRows(rows, {q, team, pos})`
  - `parseHash` / `hashFor`

  It loads before `nfl.js` and needs entries in `index.html`, `sw.js` STATIC_ASSETS, and a `sw.js` cache version bump.
- **`js/nfl.js`:** `loadNFLStats(category)` / `displayNFLStats(state)` render with one `innerHTML` write per render. Control changes re-render from the in-memory rows; only a season, category or qualified change refetches.
- **`css/components.css`:** `.nst-*` styles (sticky first column, shading classes, header sort affordance). Grep for collisions before adding.

## Tests and checks

- **`tests/nflStatsTable.test.js`** runs against a trimmed real response (`tests/fixtures/nfl-byathlete-receiving-trim.json`). It covers:
  - separator and `-` parsing
  - column alignment by `names`
  - sort direction per column
  - per-game math leaving rate columns alone
  - percentile orientation for lower-is-better columns
  - unqualified rows left unshaded
  - hash round-trip
  - a dropped column being skipped
- **Contract:** `nfl-stats-byathlete` in `tools/contracts/nfl.cjs`, `mirrors: 'js/nflStatsTable.js parse'`. It checks the `names` the parser reads for each category and requires at least 32 qualified passers in the regular season; that becomes a warning in the offseason. It is added in the same commit as the fetch.
- **Live check:** the walk tool's NFL views come from the nav matrix, so `nfl-stats` is walked once it is in the nav. Verify on production in Chrome at desktop and 390px wide after deploy.

## Out of scope

Team offense/defense tables, postseason (`seasontype=3`), Next Gen/EPA columns, CSV export, and comparing two players from the table. Each can follow on this table component.
