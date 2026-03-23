# ZohnStats — NBA Analytics

A client-side NBA statistics dashboard powered by the live Ball Don't Lie API. No build step, no framework, no backend — just HTML, CSS, and vanilla JavaScript.

**Current league:** NBA (2024–25 season)
**Planned:** NFL, MLB, NHL, EPL

---

## Features

### Players
- Browse and search active NBA players (live from BDL API)
- Position filter: All / G / F / C
- Card view and sortable table view toggle
- Conference colour accents (East = blue, West = red)
- Skeleton loading cards during fetch

### Player Detail
- Full season averages: PPG, RPG, APG, FG%, 3P%, FT%, SPG, BPG, TOV, MIN
- Shooting stats with visual progress bars (FG / 3PT / FT)
- Performance charts (Chart.js 4.4.4):
  - Radar stat profile (PTS / REB / AST / STL / BLK)
  - Horizontal bar shooting splits
  - Line trend over last 10 games (PTS / REB / AST)
- Player comparison: select any other player to overlay both on the radar chart

### Leaderboards
- Top 5 per category: PPG, RPG, APG, SPG, BPG, FG%
- Gold / silver / bronze rank medals
- Click a leader to jump to their player detail view

### Teams
- All 30 NBA teams with conference and division info
- Team colour accents derived from the `js/config.js` palette

### Games
- Recent game results (last 14 days) with winner highlighting
- Score ticker banner at the top of every page (auto-refreshed)
- Off-season fallback: shows latest games of the current season

### Stat Builder
- Write custom basketball formulas using any season-average variable
- Safe evaluation via math.js (no `eval()`)
- Save, rename, and delete custom stats with localStorage persistence

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS (ES2022+), HTML5, CSS3 |
| Styling | CSS custom properties design token system |
| Data | [Ball Don't Lie API v1](https://www.balldontlie.io/) (live, via `fetch()`) |
| Visualisation | [Chart.js 4.4.4](https://www.chartjs.org/) (CDN) |
| Formula engine | [math.js 11](https://mathjs.org/) (CDN) |
| Caching | `ApiCache` — localStorage with per-entry TTL (SHORT 5m / MEDIUM 30m / LONG 60m) |
| Observability | `Logger` — structured console output with levels, timestamps, circular history buffer |

---

## Project Structure

```
zohn-sports-stats/
├── index.html
├── css/
│   ├── variables.css       # Design tokens: colours, spacing, radii, blur, shadows, chart theme
│   ├── main.css            # Layout, header, nav, grid, responsive breakpoints
│   ├── components.css      # Cards, player detail, charts, toasts, skeletons, error states
│   └── ticker.css          # Scrolling score banner
└── js/
    ├── config.js           # NBA team colours palette (30 teams)
    ├── errorHandler.js     # Logger class + ErrorHandler (toasts, error/empty states)
    ├── cache.js            # ApiCache — localStorage TTL cache
    ├── api.js              # AppState, bdlFetch (retry + cache), all API functions
    ├── players.js          # Player grid, skeleton loading, card/table views, filters
    ├── leaderboards.js     # Stat leaders panels with medal ranks
    ├── teams.js            # Teams grid, team detail/roster view
    ├── games.js            # Games grid, score ticker
    ├── charts.js           # StatsCharts — Chart.js wrapper (radar, bars, trend line)
    ├── playerDetail.js     # Player detail view, comparison picker
    ├── statBuilder.js      # Custom formula builder
    ├── navigation.js       # Tab routing, search debounce, view switching
    └── app.js              # Bootstrap, ResizeObserver ticker fix
```

---

## Getting Started

1. **Get a free API key** at [balldontlie.io](https://www.balldontlie.io/)
2. Open `js/api.js` and replace the `BDL_API_KEY` value with your key
3. Serve the project from any static file server:

```bash
# Node.js
npx serve .

# Python
python -m http.server 8080
```

No npm install, no build step. The app runs entirely in the browser.

---

## API Caching

All API responses are cached in `localStorage` using `ApiCache`:

| Tier | TTL | Used for |
|---|---|---|
| SHORT | 5 minutes | Game scores, player game logs |
| MEDIUM | 30 minutes | Player list, season averages |
| LONG | 60 minutes | Teams |

Cache is read-through on every request. Stale entries are evicted lazily on next read.

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

---

## Roadmap

- [ ] NFL, MLB, NHL, EPL support
- [ ] Season selector (switch between seasons)
- [ ] Export custom stats to CSV
- [ ] Player headshot images
- [ ] Team schedule and standings view
