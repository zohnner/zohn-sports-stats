# SportStrata — Roadmap

> **Focus: MLB broadcast & analytics.** NBA/NFL/NHL are preview features — no new investment until MLB depth goals are met.  
> Priority order: MLB depth → Security → Announcer tools → Infrastructure.

---

## Completed Phases

| Phase | Description | Status |
|---|---|---|
| 0 | Stabilize core (NBA players, scores, standings) | ✅ |
| 1 | MLB charts & advanced stats | ✅ |
| 2 | MLB navigation parity | ✅ |
| 3 | Arcade expansion (4 games) | ✅ |
| 4 | Waffle nav, home landing, global search, light/dark mode | ✅ |
| T1 | UX excellence (skeletons, favorites, search, comparison, recently viewed) | ✅ |
| T2 | Analytics depth (advanced stats, career view, power rankings, head-to-head) | ✅ |
| T5 (partial) | Fantasy overlay, CSV export, glossary tooltips, accessibility pass | ✅ |

---

## T-Security — Critical Fixes (Do First)

| ID | Task | Effort | Notes |
|---|---|---|---|
| SEC-001 | Deploy `worker/bdl-proxy.js` via Wrangler; set `BDL_PROXY_URL` in `api.js` | S | Rotate key first |
| SEC-002 | Update CSP `connect-src` in `_headers` + `index.html` to remove direct `api.balldontlie.io` | XS | After Worker is live |
| SEC-003 | Replace all inline `onerror="..."` image handlers with `addEventListener` | XS | Eliminates inline handler XSS vector |
| SEC-004 | Audit all `innerHTML` writes — replace user-facing data with `textContent` | S | `playerDetail.js` draft_year/college are the known cases |

---

## T-Debt — Technical Debt (Before New Features)

| ID | Task | Effort | Notes |
|---|---|---|---|
| DEBT-001 | Add `fetch` timeout (10s) to `bdlFetch` and `mlbFetch` | XS | Prevent silent hangs |
| DEBT-002 | Fix season-change race: clear `AppState.mlbPlayers/mlbTeams/mlbStandings` on season switch | XS | `app.js:34-42` |
| DEBT-003 | Fuzzy player name matching (`"PJ"` ↔ `"P.J."`) in stats lookup | S | `players.js:110`, `playerDetail.js:181` |
| DEBT-004 | Extract shared helpers: `getTeamLogoUrl(abbr)`, `_handleLoadError(grid, err, retryFn)` | S | Eliminates logo URL duplication across 4+ files |
| DEBT-005 | Validate `localStorage` before JSON.parse in `_loadRecents()` and all other reads | XS | `search.js:20` — corrupted storage crashes silently |
| DEBT-006 | Replace `innerHTML +=` with fragment appends in `search.js:176` | XS | Prevents full re-render flash |
| DEBT-007 | Chart re-init optimization: update `.data` in-place instead of destroy+recreate on compare | S | ✅ Canvas preserved on subsequent compare changes |
| DEBT-008 | Clarify `ask.js` status: wire into search OR delete it | M | ✅ Deleted — confirmed not loaded in index.html |
| DEBT-009 | Remove unused `AppState` fields: `nbaFantasyOverlay` | XS | ✅ Confirmed in use by leaderboards.js — kept |
| DEBT-010 | Add schema validation wrapper on all API responses (use existing `schema.js`) | M | ✅ `ApiShape` added to schema.js; wired into players/stats/games fetches |

---

## T3 — NFL / NHL *(Preview — No New Investment Until MLB Depth Complete)*

> Functional preview features. No new features planned until MLB goals (T-MLB) are met.

### NFL (`js/nfl.js`)
| Task | Notes |
|---|---|
| Leaders by category (passing/rushing/receiving/sacks/INT) | ✅ ESPN public API |
| Team cards grid | ✅ ESPN public API |
| Scores + scoreboard | ✅ ESPN public API |
| Standings (AFC/NFC divisions) | ✅ ESPN public API |
| NFL button in header enabled | ✅ `data-coming-soon` removed |
| Player drill-down | ⬜ Future — needs ESPN athlete stats endpoint |
| Advanced stats (DVOA, EPA) | ⬜ TBD — may require custom Worker |

### NHL (`js/nhl.js`)
| Task | Notes |
|---|---|
| Skater + goalie leaders (G/A/PTS/SV%/GAA) | ✅ `api-web.nhle.com` |
| Team cards grid (from standings) | ✅ `api-web.nhle.com` |
| Scores + date navigation | ✅ `api-web.nhle.com` |
| Standings (all 4 divisions) | ✅ `api-web.nhle.com` |
| NHL button in header enabled | ✅ `data-coming-soon` removed |
| Player drill-down | ⬜ Future — NHLe `/player/{id}/landing` |

**CSP updated:**
```
connect-src: added api-web.nhle.com
img-src: added assets.nhle.com
```

---

## T4 — Infrastructure & Integrations

| ID | Task | Effort | Notes |
|---|---|---|---|
| INFRA-001 | Deploy Cloudflare Pages + custom domain | S | See deployment checklist in ISSUES.md |
| INFRA-002 | GitHub repo created + connected to CF Pages | XS | Pre-req for INFRA-001 |
| INFRA-003 | Kalshi odds via Worker (`worker/kalshi-proxy.js`) | M | `PLAN-001` — win probability chips on game cards |
| INFRA-004 | Division winner % odds on Standings | S | Depends on INFRA-003 |
| INFRA-005 | MVP / award odds on Player Detail | S | Depends on INFRA-003 |
| INFRA-006 | PWA: wire service worker cache strategy (`sw.js`) | M | ✅ Cache-first static, network-first API, nav fallback to offline.html; STATIC_ASSETS updated for all 4 sports |
| INFRA-007 | Offline fallback page for no-network state | S | ✅ `/offline.html` created; sw.js serves it on navigation fetch failure |

---

## T5 — Premium Analytics

| ID | Task | Effort | Notes |
|---|---|---|---|
| PREM-001 | NBA shot zone chart (canvas court diagram) | L | Requires BDL paid tier or NBA.com shot data |
| PREM-002 | MLB spray chart (batted ball direction overlay) | L | MLB Stats API has hit coordinates |
| PREM-003 | Game simulation / what-if box score editor | L | Adjust stats → recalculate scoreline |
| PREM-004 | Multi-player comparison (3+ players side by side) | M | ✅ NBA compare extended to 3 players (radar + stat table, winner highlight); MLB compare card added to player detail with 2–3 player support |
| PREM-005 | Year-over-year trend charts on player detail | M | ✅ `StatsCharts.careerTrend()` added; stat-selector pill buttons (PTS/REB/AST/STL/BLK/FG%/3P%/MIN) below career table |
| PREM-006 | Advanced filter builder: "PGs averaging ≥5 APG and <15% TOV" | M | ✅ Collapsible filter panel in Stat Builder: position pills, compound stat conditions (stat/op/value rows), applied before formula run |
| PREM-007 | Watch alerts: notify when favorited player hits milestone | L | PWA push (requires INFRA-006 first) |

---

## T6 — Announcer Tools

> Features specifically designed for broadcast preparation workflow.

| ID | Task | Effort | Notes |
|---|---|---|---|
| ANN-001 | "Game Prep" view: pre-populated comparison + key stats for tonight's matchup | M | ✅ Today's schedule → game select → matchup header, probable pitchers, team batting/pitching compare, key hitters |
| ANN-002 | Shareable stat snapshot image (canvas → PNG download) | M | ✅ "↓ Card" button on MLB + NBA player detail — 720×400 canvas card with team colors, stats grid, SportStrata brand |
| ANN-003 | Player notes / annotation field (localStorage) | S | ✅ "Announcer Notes" textarea at bottom of player detail, auto-saves to `ss_notes_{id}` with debounce + "Saved" flash |
| ANN-004 | Print-friendly layout (`@media print`) | S | ✅ `@media print` in main.css: hides nav/charts/chrome, single-column layout, white/black palette, page-break hints |
| ANN-005 | "On This Day" historical stat trivia on home page | M | ✅ MLB Stats API — fetches completed games from today's date in past 3 seasons, surfaces top performer (H/HR/RBI), displayed above Today's Games |

---

## Icebox (Hypothetical / Long Term)

- **User accounts** — cross-device sync of favorites and notes (requires backend)
- **Custom leagues** — private leaderboards based on a subset of players
- **Trade machine** — drag-and-drop roster editor with salary/cap data
- **Multi-sport leaderboard** — cross-sport efficiency comparisons (gimmick but fun)
- **API endpoint** — expose SportStrata data as a public JSON API for fan developers
- **Dark mode schedule** — auto-switch at local sunset time

---

## Deployment Checklist (Cloudflare Pages)

| Step | Status |
|---|---|
| GitHub repo created | ☐ |
| Cloudflare Pages connected (build: none, output: `/`) | ☐ |
| BDL Worker deployed + `BDL_PROXY_URL` set | ☐ |
| `_headers` CSP updated (remove direct `api.balldontlie.io`) | ☐ |
| HTTPS redirect enforced in CF dashboard | ☐ |
| Custom domain configured | ☐ |
| Smoke test — NBA + MLB all views | ☐ |
| Mobile smoke test (iOS Safari + Chrome Android) | ☐ |
| Lighthouse audit ≥ 90 | ☐ |
