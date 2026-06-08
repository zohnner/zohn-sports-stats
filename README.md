# SportStrata

**Serious stats for serious fans.**

A free, no-login MLB analytics dashboard built for broadcast professionals, fantasy players, and data-obsessed baseball fans. Vanilla JavaScript, HTML, and CSS — no frameworks, no build step, deploys anywhere.

**Live:** [https://zohn-sports-stats.pages.dev/](https://zohn-sports-stats.pages.dev/)

---

## MLB Features

### Players & Leaderboards
- **Players** — hitters and pitchers with ISO, BABIP, FIP, K-BB%, wOBA computed client-side; position filter, favorites, recently viewed
- **Leaderboards** — 36 categories across hitting and pitching; active hitting streak panel; Statcast leaderboards (xBA, xSLG, xwOBA, EV, Barrel%, HH%, SS%, Whiff%, CSW%, K%, BB%)
- **League rank badges** — top-30 MLB rank shown on individual player stats (#N MLB), green for top 5

### Player Detail
- Season stats + computed advanced rates (ISO, BABIP, FIP, K-BB%, RC, LOB%)
- Statcast percentile card — exit velocity, barrel rate, hard-hit%, xBA, xSLG, xwOBA (via Baseball Savant)
- Predictive analytics badge — Breakout Candidate / Regression Risk / Sell High / Buy Low (rules-based F3 model)
- Pitch arsenal card for pitchers — type badge, usage %, velo, spin, BAA
- Career year-by-year stats table with interactive trend chart
- Hitting/pitching splits by L/R, Home/Away, L7/L14/L30, month-by-month (Apr–Oct)
- Spray chart from last-20-game play-by-play data
- Savant visual card — pitch zone heatmap and spray chart tabs (opens Savant)
- Player bio strip — age, bat/throw, height/weight, hometown, debut year
- Head-to-head H2H matchup card (career PA/H/HR/K/BB/AVG/OBP vs any opposing pitcher or hitter)
- Two-player side-by-side compare view (stat bars, radar overlay, shareable URL)
- Monthly splits toggle appended after L7/L14/L30

### Game Prep (Broadcast)
- Today's game selector with probable pitcher info, team colors, and records
- Side-by-side probable pitcher cards — ERA, FIP, WHIP, K/9, BB/9, QS
- Team batting comparison — AVG/OBP/SLG/OPS/HR/K across every stat row with winner highlight
- Team pitching comparison — ERA/WHIP/K9/BB9/FIP/QS
- Handedness splits — lineup OPS vs opposing starter's hand (L/R)
- Park factor badge (hitter/pitcher-friendly indicator)
- Key hitters card — top 5 by OPS with AVG/HR/ISO
- Bullpen tracker — last-3-game reliever usage with IP/ER
- Weather card — temp + wind for outdoor parks, "Dome" for covered
- Pitcher vs. team historical line — ERA/IP/WHIP/BAA vs. tonight's opponent
- Printable layout (`⌘P`) — clean game-prep sheet with no chrome

### Scores & Live Games
- Date navigation, linescore, box score, probable pitchers
- **Live Game Expanded View** — in-place accordion on live game cards: scoreline, linescore, play-by-play with scoring animations, box score (batting + pitching per team), score-change flash
- **Baseball Scorecard** — interactive play-by-play scorecard for completed and live games:
  - Paper-texture grid with diamond fill states, run-scored glow animation
  - Phase 2: pitch sequence tooltip (desktop) + bottom sheet (mobile), player-name drill-down
  - Phase 3: live mode — 20s polling, active at-bat pulse, B•S count badge, tab visibility pause/resume
  - Phase 4: "Download ↓" PNG export via html2canvas

### Teams & Standings
- Team drill-down — roster, aggregate stats (AVG/OBP/SLG/OPS/ERA/FIP/WHIP/K9), upcoming 7-day schedule, IL status
- Standings with L10 form, run differential, power rankings (Win% + L10 + streak)
- Moves tab — last 7 days of transactions (trades, IL, call-ups, DFAs) with headshots and team badges

### Home Page
- Tonight's Starters section — probable SPs with ERA/WHIP/K9/W-L, home/away ERA split, clickable to pitcher detail
- Hot Strip — current top performers across key stat categories

### Search & Navigation
- Global search `⌘K` — players and teams across all sports, with headshots and team logo gradients
- Hash-based routing — every view is deep-linkable
- Data freshness timestamp on players and leaders views

---

## Preview Sports

NBA, NFL, and NHL are functional preview features — accessible but not the focus. They receive no new feature investment until MLB depth goals are met.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Vanilla JS / HTML / CSS — ES2022+, no build step |
| Charts | Chart.js 4 |
| Math | math.js (Stat Builder formula evaluation) |
| MLB data | MLB Stats API (statsapi.mlb.com) — free, no key |
| Statcast | Baseball Savant — percentiles, leaderboards, pitch arsenal, spray charts |
| NBA data | balldontlie.io + NBA.com Stats API |
| NFL/NHL data | ESPN public API + api-web.nhle.com |
| Player headshots | MLB Static CDN + ESPN CDN |
| Export | html2canvas 1.4 (dynamic load, scorecard PNG) |
| API proxy | Cloudflare Worker — BDL key + Savant proxy |
| Edge cache | Cloudflare Pages Function (D1) — MLB Stats API + Savant |
| Hosting | Cloudflare Pages |

---

## Getting Started

No build step. Open `index.html` in a browser or serve with any static server:

```bash
npx serve .
# or
python -m http.server 3001
```

MLB features work entirely without configuration — the MLB Stats API is free and requires no key. NBA features require the BDL proxy worker to be deployed (see below).

---

## Project Structure

```
/
├── index.html              # Single-page shell, script load order, CSP meta tag
├── _headers                # Cloudflare Pages: CSP, X-Frame-Options, security headers
├── manifest.json           # PWA manifest
├── css/
│   ├── variables.css       # All design tokens — colors, spacing, radii (dark + light + CC themes)
│   ├── main.css            # Layout, header (3-row), nav surfaces, home page, responsive
│   ├── components.css      # Cards, tables, leaderboards, player detail, skeletons
│   ├── scorecard.css       # Baseball scorecard — paper texture, grid, Phase 2–4 overlays
│   ├── liveGame.css        # Live game expanded panel
│   ├── ticker.css          # Score ticker
│   ├── animations.css      # @keyframes only
│   └── arcade.css          # Arcade game styles
├── js/
│   ├── config.js           # _escHtml, team colors, shared utilities
│   ├── errorHandler.js     # Global error boundary, Logger
│   ├── cache.js            # ApiCache — localStorage TTL cache (SHORT 5m / MEDIUM 30m / LONG 60m)
│   ├── schema.js           # ApiShape — API response validation
│   ├── api.js              # AppState, BDL fetch, NBA.com stats map, ESPN headshots
│   ├── glossary.js         # Stat definition tooltips
│   ├── mlb.js              # All MLB logic — views, API calls, computed stats, Statcast, game prep
│   ├── scorecard.js        # Baseball scorecard — Phases 1–4 (build, render, interact, export)
│   ├── liveGame.js         # Live game expanded panel — Phase 1 (linescore, PBP, box score)
│   ├── players.js          # NBA player grid
│   ├── leaderboards.js     # NBA leaderboards
│   ├── teams.js            # Team drill-down (NBA)
│   ├── games.js            # NBA scores
│   ├── playerDetail.js     # NBA player detail + compare
│   ├── statBuilder.js      # Custom stat formula builder
│   ├── standings.js        # Standings — all sports
│   ├── charts.js           # StatsCharts — Chart.js wrappers
│   ├── nfl.js              # NFL preview (ESPN API)
│   ├── nhl.js              # NHL preview (NHLe API)
│   ├── arcade.js           # Daily arcade games (4 game types)
│   ├── db.js               # IndexedDB — favorites, recents
│   ├── search.js           # ⌘K global search overlay
│   ├── navigation.js       # Hash routing, nav sync, sport switcher
│   └── app.js              # Bootstrap, ticker, home page, theme toggle
├── functions/
│   └── api/mlb.js          # Cloudflare Pages Function — D1 edge cache proxy for MLB Stats API
├── worker/
│   ├── bdl-proxy.js        # Cloudflare Worker — BDL API key proxy + Savant CORS proxy
│   ├── broadcast-blurb.js  # Cloudflare Worker — Anthropic API for AI stat narratives
│   ├── wrangler.toml       # BDL proxy deployment config
│   └── wrangler-blurb.toml # Broadcast blurb deployment config
└── assets/
    └── themes/             # CC theme images
```

---

## Deployment

### Cloudflare Pages (static site)

1. Push to GitHub
2. Cloudflare Pages → Create project → Connect repo
3. Build command: *(none)*, output directory: `/`
4. `_headers` handles CSP and security headers automatically

### Cloudflare Worker (API key proxy)

```bash
cd worker
npm install -g wrangler
wrangler secret put BDL_API_KEY     # balldontlie.io key
wrangler deploy
```

Copy the deployed Worker URL into `BDL_PROXY_URL` in `js/api.js`.

---

## License

MIT
