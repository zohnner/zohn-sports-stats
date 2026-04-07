# ZohnStats — NBA & MLB Analytics

A client-side multi-sport statistics dashboard. No build step, no framework, no backend — vanilla HTML, CSS, and JavaScript served as a static site.

**Live sports:** NBA · MLB  
**Planned:** NFL · NHL  
**Hosting target:** Cloudflare Pages

---

## Features

### NBA

#### Players
- Browse and search all active NBA players (live from Ball Don't Lie API)
- Position filter: All / G / F / C
- Card view and sortable table view toggle
- Conference colour accents (East = blue, West = red)
- Skeleton loading cards during fetch

#### Player Detail
- Full season averages: PPG, RPG, APG, FG%, 3P%, FT%, SPG, BPG, TOV, MIN
- League rank badges per stat
- Per-36 minutes toggle
- Shooting stats with visual progress bars
- Performance charts (Chart.js 4.4.4):
  - Radar stat profile (PTS / REB / AST / STL / BLK)
  - Horizontal bar shooting splits
  - Line trend over last 10 games (PTS / REB / AST)
- Player comparison: overlay any two players on the radar chart

#### Leaderboards
- Top 10 per category: PPG, RPG, APG, SPG, BPG, FG%, 3P%, FT%, TOV, MIN
- "Show more / Show less" toggle reveals the full ranked list
- Gold / silver / bronze rank medals
- Click any leader to open their player detail

#### Teams
- All 30 NBA teams with conference, division, record, streak
- Team detail page:
  - Last 12 game results (W/L, date, opponent, score) — click any game
  - Game box score with per-player stats for both teams (PTS / REB / AST / S/B / FG%)
  - Full roster with season averages; click any player to open their stat page
- Team colour accents from the `js/config.js` palette

#### Games
- Recent results grid (last 14 days) with winner highlighting and quarter scores
- Off-season fallback: latest games of the current season
- Status detection: Q1–Q4, Halftime, OT, PPD, Final

#### Standings
- Eastern and Western conference tables
- Playoff / play-in / eliminated zone separators
- Win %, GB, last-10, streak, clinch badges

#### Stat Builder
- Write custom formulas using any season-average variable
- Safe evaluation via math.js (no `eval()`)
- Save, rename, and delete custom stats with localStorage persistence

#### Ask ZohnStats
- Natural language query panel ("Who leads in points?", "Lakers record?")
- Queries live NBA data: players, leaders, standings, team records

### MLB

#### Players
- Hitting and pitching splits via MLB Stats API
- Card and table views with key stats
- Search / filter by name or team

#### Leaderboards
- Hitting: BA, HR, RBI, SB, OPS
- Pitching: ERA, SO, WHIP, W

#### Teams
- All 30 MLB teams with logo and division info

#### Games
- Schedule with live scores, inning indicator, final results

### Score Ticker
- Sticky banner below the header — live scores for the active sport
- Scroll speed is proportional to the number of games (60 px/s)
- NBA: live quarter/period detection; MLB: inning + top/bottom indicator

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES2022+), HTML5, CSS3 |
| Styling | CSS custom properties design token system (`css/variables.css`) |
| NBA data | [Ball Don't Lie API v1](https://www.balldontlie.io/) + NBA.com stats + ESPN public API |
| MLB data | [MLB Stats API](https://statsapi.mlb.com/api/v1) (official, free) |
| Visualisation | [Chart.js 4.4.4](https://www.chartjs.org/) via CDN with SRI hash |
| Formula engine | [math.js 11](https://mathjs.org/) via CDN with SRI hash |
| Local DB | IndexedDB wrapper (`js/db.js`) for persistent cross-session caching |
| Memory cache | `ApiCache` — localStorage with per-entry TTL |
| Observability | `Logger` — structured console output with levels, timestamps, 200-entry history |
| Security | Cloudflare Pages `_headers` (CSP, X-Frame-Options, nosniff, Permissions-Policy) |

---

## Project Structure

```
zohn-sports-stats/
├── index.html
├── _headers                # Cloudflare Pages edge security headers (CSP etc.)
├── ISSUES.md               # Bug tracker and feature roadmap
├── css/
│   ├── variables.css       # All design tokens — single source of truth
│   ├── animations.css      # All @keyframes — no duplicates elsewhere
│   ├── main.css            # Layout, header, nav, grid, responsive breakpoints
│   ├── components.css      # Cards, player detail, charts, toasts, skeletons
│   └── ticker.css          # Scrolling score banner
└── js/
    ├── config.js           # NBA team colour palette (30 teams)
    ├── errorHandler.js     # Logger + ErrorHandler (toasts, error/empty states, global rejection handler)
    ├── cache.js            # ApiCache — localStorage TTL cache
    ├── db.js               # IndexedDB wrapper for persistent player/team data
    ├── schema.js           # JSON-LD structured data helpers
    ├── api.js              # AppState, bdlFetch (retry + cache), all NBA API functions
    ├── mlb.js              # All MLB data, views, ticker
    ├── players.js          # NBA player grid, card/table views, filters
    ├── leaderboards.js     # Stat leaders panels with medal ranks and show-more
    ├── teams.js            # Teams grid → team detail → recent games → box score
    ├── games.js            # NBA games grid, score ticker
    ├── charts.js           # StatsCharts — Chart.js wrapper (radar, bars, trend line)
    ├── playerDetail.js     # Player detail view, per-36 toggle, comparison picker
    ├── statBuilder.js      # Custom formula builder
    ├── standings.js        # NBA standings with conference/zone view
    ├── ask.js              # Natural language Q&A engine over live data
    ├── navigation.js       # Tab routing, hash history, view switching, breadcrumb
    └── app.js              # Bootstrap, season selector, ResizeObserver ticker fix
```

---

## Getting Started

1. **Get a free API key** at [balldontlie.io](https://www.balldontlie.io/)
2. Open `js/api.js` and replace `BDL_API_KEY` with your key
3. Serve from any static file server:

```bash
# Node.js
npx serve .

# Python
python -m http.server 8080
```

No npm install, no build step.

---

## Deploying to Cloudflare Pages

1. Push the repo to GitHub
2. In Cloudflare Pages, connect the repo — build command: *(none)*, output directory: `/`
3. The `_headers` file is picked up automatically and applies CSP + security headers at the edge

---

## API Caching

| Tier | TTL | Used for |
|---|---|---|
| SHORT | 5 min | Game scores, MLB schedule, team recent games |
| MEDIUM | 30 min | Player list, season averages |
| LONG | 60 min | Teams, box scores |

---

## Stat Builder Variables

| Variable | Stat |
|---|---|
| `pts` | Points per game |
| `reb` | Rebounds per game |
| `ast` | Assists per game |
| `stl` | Steals per game |
| `blk` | Blocks per game |
| `turnover` | Turnovers per game |
| `min` | Minutes per game (decimal) |
| `fgm` / `fga` / `fg_pct` | Field goals made / attempted / % |
| `fg3m` / `fg3a` / `fg3_pct` | 3-pointers made / attempted / % |
| `ftm` / `fta` / `ft_pct` | Free throws made / attempted / % |

Example formulas:
```
(pts + reb + ast + stl + blk - turnover) / min   # Player Efficiency
pts / (2 * (fga + 0.44 * fta)) * 100             # True Shooting %
ast / turnover                                     # Assist-to-Turnover Ratio
```
