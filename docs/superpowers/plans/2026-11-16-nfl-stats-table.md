# NFL Stats Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NFL Players (ADP bio cards) and Leaders (top-5 cards) pages with one sortable, filterable, percentile-shaded stats table per category, read from ESPN's `byathlete` endpoint in the browser.

**Architecture:** A DOM-free module, `js/nflStatsTable.js` (`NFLStatsTable`), owns column definitions, parsing, sorting, filtering, per-game math, percentiles and hash parsing; it is unit-tested in Node via `vm`. `js/nfl.js` fetches, caches and renders. The page is the existing `nfl-leaders` view (label "Stats"), so `/nfl/leaders`, `failSafeRoute`, `_viewPath` and the audit matrix keep working. `nfl-players` redirects to it.

**Tech Stack:** vanilla JS (classic `<script defer>`, shared globals), CSS custom properties, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-16-nfl-stats-table-design.md`

**Deviation from spec (deliberate):** the spec named the view `nfl-stats`. The plan keeps the existing id `nfl-leaders`: `tools/audit/matrix.cjs` detects a sport's Leaders capability from that view, and `functions/nfl/leaders.js`, `functions/_shell.js`, `_PATH_SINGLE_VIEWS` and two tests already map it. Variant views are `nfl-leaders-<cat>` and `nfl-leaders[-<cat>]~<group.field>-<asc|desc>`.

## Global Constraints

- No framework, bundler or build step. One `innerHTML` write per render. Escape every API string with `_escHtml()`.
- A new js file goes in `index.html` (before `js/nfl.js`) and `sw.js` STATIC_ASSETS, with a `CACHE_NAME` bump (check open PRs for a colliding version first).
- Image errors use `data-hide-on-error`, never inline `onerror`.
- Colors from tokens only (`css/variables.css`).
- `Logger`, never `console.log`.
- Endpoint: `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete`, params `region=us&lang=en&contentorigin=espn&seasontype=2&season=YYYY&limit=1000&isqualified=true|false&category=…&sort=…:desc`. Kicking is `specialTeams:kicking`.
- Shading: percentile within qualified players with GP ≥ 5; everyone else unshaded.
- A mirrored fetch needs its contract in the same commit (`tools/contracts/nfl.cjs`).
- Never push or merge; work ends at a clean local branch.

---

### Task 1: `NFLStatsTable` pure module + tests

**Files:**
- Create: `js/nflStatsTable.js`
- Create: `tests/fixtures/nfl-byathlete-passing-trim.json`
- Create: `tests/nflStatsTable.test.js`

**Interfaces:**
- Produces: global `NFLStatsTable` with `ENDPOINT`, `GP_KEY` (`'general.gamesPlayed'`), `MIN_GP` (5), `CATEGORIES`, `category(id)`, `url(catId, season, qualified)`, `num(v)`, `parse(json, catId) → {cols, dropped, rows}` (row = `{id, name, team, pos, headshot, v: {'group.field': number|null}}`), `filterRows(rows, {q, team, pos, cat})`, `perGame(rows, cols)`, `sortRows(rows, key, dir)`, `defaultDir(col)`, `percentiles(rows, cols, poolIds:Set) → {[id]: {[key]: 0..1}}`, `tier(p) → ''|'hi2'|'hi1'|'lo1'|'lo2'`, `leaders(rows, catId, poolIds) → [{col, top}]`, `parseView(view) → {cat, sort, dir}|null`, `viewFor({cat, sort, dir})`, `fmt(col, x, perGame)`.
- Column shape: `{k: 'group.field', l: 'LABEL', rate?: not divided per game, low?: lower is better, d?: decimals, noShade?: bool}`.

- [ ] **Step 1: Capture the fixture** (trimmed real 2026 response: top 6 passers, full `categories` metadata):

```bash
node -e "
fetch('https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete?region=us&lang=en&contentorigin=espn&seasontype=2&season=2026&limit=6&isqualified=true&category=offense%3Apassing&sort=passing.passingYards%3Adesc')
 .then(r=>r.json()).then(j=>{const out={categories:j.categories,athletes:j.athletes.map(a=>({athlete:{id:a.athlete.id,displayName:a.athlete.displayName,teamShortName:a.athlete.teamShortName,position:{abbreviation:a.athlete.position.abbreviation},headshot:{href:a.athlete.headshot&&a.athlete.headshot.href}},categories:a.categories.map(c=>({name:c.name,totals:c.totals}))}))};
 require('fs').writeFileSync('tests/fixtures/nfl-byathlete-passing-trim.json',JSON.stringify(out,null,1));console.log(out.athletes.length)})"
```
Expected: `6`.

- [ ] **Step 2: Write the failing tests** in `tests/nflStatsTable.test.js`. They cover:
  - `num`: separators, a trailing `t`, dashes and blanks
  - `parse`: every column read by ESPN `names`, checked against the fixture's raw strings rather than hard-coded numbers
  - a dropped column skipped while the rest stay aligned
  - `sortRows`: both directions, nulls last
  - `defaultDir`: INT ascending first
  - `perGame`: rates and GP left alone
  - `percentiles`: lower-is-better flipped, unqualified and under-5-GP rows skipped, plus tiers
  - `filterRows`: defensive position groups and name search
  - `leaders`: top three
  - view hash round-trip and rejection of unknown categories
  - `url` params
  - `fmt`: dashes, decimals, per-game

  (Full code as committed in the implementing commit; it is the source of truth.)

- [ ] **Step 3:** `node --test tests/nflStatsTable.test.js` — Expected: FAIL (module missing).

- [ ] **Step 4: Implement** `js/nflStatsTable.js`. The column definitions, keyed `group.field`, are:
  - Passing (`offense:passing`, toggle): GP, CMP, ATT, CMP%, YDS, Y/A, YDS/G, TD, INT (low), SACK (low), RTG (`QBRating`), QBR (`adjQBR`)
  - Rushing (toggle; chips RB/QB/WR): GP, CAR, YDS, AVG, YDS/G, LNG, TD, FUM (low), FD
  - Receiving (toggle; chips WR/TE/RB): GP, REC, TGT, YDS, AVG, YDS/G, TD, LNG, YAC, FD
  - Defense (`defense`; chips DL/LB/DB via `posGroups`): GP, TOT, SOLO, SACK, TFL, PD, INT (`defensiveinterceptions.interceptions`), FF (`general.fumblesForced`)
  - Kicking (`specialTeams:kicking`): GP, FGM, FGA, FG%, LNG, 50+ (`fieldGoalsMade50`), XPM, XPA
  - Scoring (`scoring`): GP, TD, FG, PAT, 2PT, PTS, TP/G

  GP, every rate column and every LNG are `rate` (never divided per game).

- [ ] **Step 5:** `node --test tests/nflStatsTable.test.js` — Expected: PASS.

- [ ] **Step 6: Live check of all six categories** (loads the module in a `vm`, fetches each with `isqualified=true` for 2026, prints rows, `dropped`, positions). Expected: every `dropped` empty, rows > 0. Add any defensive abbreviation that `posGroups` lacks.

- [ ] **Step 7: Commit** `feat(nfl): NFLStatsTable pure module for the stats table`.

### Task 2: Fetch, render, style, contract

**Files:**
- Modify: `js/nfl.js`: add the stats-page block after `displayNFLStatLeaders`. `loadNFLStatLeaders(opts)`/`displayNFLStatLeaders(data, opts)` gain a `fallback` note.
- Modify: `css/components.css`: append the `.nst-*` block after the `.nfl-lrow` rules.
- Modify: `index.html`: script tag before `js/nfl.js`.
- Modify: `sw.js`: add to STATIC_ASSETS and bump `CACHE_NAME`.
- Modify: `tools/contracts/nfl.cjs`: new `nfl-stats-byathlete` contract.

**Interfaces:**
- Consumes:
  - from Task 1: `NFLStatsTable.*`
  - existing: `ApiCache`, `noteFetched`, `freshnessHtml`, `fetchNFLSleeperPool`, `_nflPool`, `_nflSleeperAbbr`, `_nflIsOffseason`, `NFL_STATS_SEASON`, `NFL_LEADERS_MIN_SEASON`, `navigateTo`, `setBreadcrumb`
- Produces: `loadNFLStats(view)` (on `window`) and `displayNFLStats()`.

Behaviour:
- **Fetching:**
  - `_nstFetch(cat, season, qualified)` caches per category, season and qualified flag: `TTL.SHORT` for the live season, `TTL.DAILY` otherwise.
  - Each fetch records `noteFetched('nfl/byathlete', fetchedAt)`; a cache hit records the entry's own write time.
  - It throws on non-OK or zero rows.
- **Shading pool:** `_nstLoad` always loads the qualified list, so the "All players" view still shades against qualified players.
- **Season fallback:** with no explicit season chosen, an empty new season falls back to the previous one.
- **Stale responses:** the `_nst.want` key drops any response that returns after the user has switched tabs.
- **ESPN failure:** `loadNFLStatLeaders({ fallback: true })`.
- **Rendering:**
  - The page: head (season title, freshness), tablist, leader strip, controls, table and source footnote.
  - Rows are capped at 150, with a "Show all N players" button.
  - Search and the team filter re-render only the `<tbody>`, so the input keeps focus.
- **Sorting:** a header click sorts; clicking the active column flips it.
- **Hash:** `_nstSyncHash` updates it with `replaceState`.
- **Player links:** the `_nstLinker` name+team join to the Sleeper pool gives `nfl-player-{sleeperId}` on a unique match, else `nfl-player-espn-{id}`.

- [ ] Contract first: it checks every `group.field` the table reads against `categories[].names`, plus `minCount('athletes', 20)`. The floor is 20, not the spec's 32, because early in Week 1 few passers qualify. Run `node --test tests/contract*.test.js` and the live contract for this id.
- [ ] Script tag + sw entry + version bump; `node tools/check-manifest.cjs`.
- [ ] Fallback note on the leader cards.
- [ ] Stats page code.
- [ ] Styles: grep `nst-` in `css/` first (expect none). Confirm each token exists. Run `node tools/check-themes.cjs`.
- [ ] `node --check` both files; `node --test tests/*.test.js`.
- [ ] Commit `feat(nfl): sortable, shaded stats table on the Leaders page`.

### Task 3: Routing, nav, redirects, cleanup

**Files:** `js/navigation.js`, `js/nfl.js`, `js/app.js`, `functions/nfl/player/[id]/[[slug]].js`, `tests/storyLinks.test.js`.

- [ ] Failing test: `_viewPath('nfl-leaders-receiving')` and `_viewPath('nfl-leaders-defense~defensive.sacks-desc')` both return `/nfl/leaders`. Then add `if (/^nfl-leaders[-~]/.test(v)) return '/nfl/leaders';` and see it pass.
- [ ] `_renderNFLView`:
  - prefix branch `/^nfl-leaders(?:$|[-~])/` → `loadNFLStats(view)`
  - `case 'nfl-players'` → `loadNFLStats('nfl-leaders')`, whose hash sync rewrites the URL
  - delete the old `case 'nfl-leaders'`
- [ ] `_loadFromHash`: an `nflStatsMatch` branch for `/^nfl-leaders[-~]/` → `navigateTo(hash, false)` under NFL UI.
- [ ] Nav tables:
  - Sub-nav: Stats replaces Players, and the dropdown is renamed Analytics without Leaders.
  - Menu: one Stats tile.
  - Bottom bar: Scores, Stats, Standings, Teams, More.
  - Breadcrumb: `nfl-leaders` → "NFL Stats"; drop `nfl-players`.
  - Offseason strip: one Stats link.
- [ ] Repoint every other `nfl-players` reference:
  - `js/nfl.js`: breadcrumbs, back buttons and the offseason button
  - `js/app.js`: `defaultViews` and `_SPORT_PLAYERS_VIEW`
  - the NFL player template's fail-safe redirect

  Afterwards `grep -rn "nfl-players" js functions tools tests` should leave only the `nflViews` entry and the redirect case.
- [ ] Remove `loadNFLPlayers`, `displayNFLPlayers` and `_createNFLPlayerCard`, plus any helper only they used (check `_nflPosFilter`, `_NFL_POS_FILTERS`, `ss_nfl_pos_filter` with grep first).
- [ ] Run `node --check` on the touched files, `node --test tests/*.test.js`, `node tools/check-manifest.cjs` and `node tools/audit/matrix.cjs --gaps`; NFL Leaders must still be `yes`.
- [ ] Commit `feat(nfl): Stats replaces Players and Leaders in NFL nav`.

### Task 4: Browser check and docs

- [ ] Serve the worktree locally and open `#nfl-leaders-receiving` at 1280px and 390px. ESPN loads directly; `/api/sleeper` fails locally, so links fall back to ESPN player pages, which is expected. Check:
  - sorting, the arrow and the hash
  - per-game math, and that All players rows are unshaded
  - Defense chips and the 150 cap
  - Kicking loads
  - no page-level sideways scroll, and the name column stays pinned
  - light and dark themes
  - `#nfl-players` lands on `#nfl-leaders`
  - reloading a sorted variant hash restores the tab and sort
- [ ] Update `CLAUDE.md`: add the load-order entry, a Key Files row for `js/nflStatsTable.js` and the NFL nav description. Add a `DECISIONS.md` entry under the next free D-number, re-checking `origin/main` and open PRs first.
- [ ] Final `node --test tests/*.test.js` + manifest check; commit `docs: NFL Stats table (D-xxx)`. Report and don't push.
