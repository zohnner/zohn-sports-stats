# SportsStrata

**Serious stats for serious fans.**

A fast, zero-dependency sports analytics dashboard built with vanilla JavaScript, HTML, and CSS. Real-time NBA and MLB stats, live scores, daily arcade games, and deep player breakdowns — no frameworks, no build step, deploys anywhere.

---

## Features

### NBA
- **Players** — full roster with search, position filter, favorites, and recently viewed
- **Leaderboards** — top 25 across every major stat category with visual bars
- **Teams** — drill-down with roster, recent games, standings position, and box scores
- **Scores** — live game cards with auto-poll during live games
- **Standings** — East / West tables with clinch indicators + **⚡ Power Rankings** (Win% + L10 form + streak)
- **Stat Builder** — custom formula editor using any combination of stats
- **Player Detail** — headshot, bio, shooting splits, advanced efficiency (TS%, eFG%, TOV%, AST/TO, 3PAr, FTr), performance charts, head-to-head radar comparison

### MLB
- **Players** — hitters and pitchers with ISO, BABIP, FIP, K-BB% computed client-side
- **Leaderboards** — hitting and pitching with configurable minimum GP filter
- **Teams** — roster + recent games + game detail
- **Scores** — date navigation, full linescore, box score
- **Standings** — AL / NL division tables
- **Player Detail** — radar chart, batting/pitching splits (vs L/R, Home/Away), game log trend

### Platform
- **Global search** — `⌘K` to search players and teams across both sports instantly
- **Recently viewed** — last 10 players accessible from the search overlay
- **Favorites / Watchlist** — star any player, filter to starred only
- **Daily Arcade** — four games: *Who Am I?*, *Ballpark Blueprint*, *Statline Shuffle*, *Trade Tree*
- **Light / Dark mode** — respects `prefers-color-scheme`, toggle in the menu, persists across sessions
- **Live score ticker** — embedded in the header, auto-updates during live games

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vanilla JS / HTML / CSS | Zero build step, instant deploy, full control |
| Fonts | Inter (Google Fonts) | Clean, legible at small sizes |
| Charts | Chart.js 4 | Lightweight radar + bar charts |
| Math | math.js | Safe formula evaluation in Stat Builder (no `eval`) |
| NBA data | [balldontlie.io](https://www.balldontlie.io) | Reliable, generous free tier |
| NBA stats | NBA.com Stats API | Advanced stats, standings, game logs |
| MLB data | MLB Stats API (statsapi.mlb.com) | Official, free, no key required |
| Images | ESPN CDN + MLB Static | Team logos and player headshots |
| API proxy | Cloudflare Worker | Keeps BDL API key server-side |
| Hosting | Cloudflare Pages | Global CDN, instant deploy from GitHub |

---

## Getting Started

No build step required. Open `index.html` in a browser or serve with any static server.

```bash
# Option 1 — any static server
npx serve .

# Option 2 — Python
python -m http.server 8080
```

The app runs entirely client-side. The BDL API key is configured in `js/api.js`. For local development the key can stay there; for production deploy through the Cloudflare Worker.

---

## Configuration

`js/api.js` — top of file:

```js
const BDL_API_KEY   = 'your-key-here';  // free key at balldontlie.io
const BDL_PROXY_URL = '';               // set to Worker URL in production
```

When `BDL_PROXY_URL` is set, the client sends no Authorization header — the Worker adds it server-side so the key is never exposed.

---

## Deployment

### Cloudflare Pages (static site)

1. Push to GitHub
2. Cloudflare Pages → Create project → Connect GitHub repo
3. Build command: *(none)*, output directory: `/`
4. `_headers` handles CSP and security headers automatically

### Cloudflare Worker (API key proxy)

```bash
cd worker
npm install -g wrangler
wrangler secret put BDL_API_KEY     # paste your balldontlie.io key
wrangler deploy
```

Copy the deployed Worker URL into `BDL_PROXY_URL` in `js/api.js`, then update `connect-src` in `_headers` and `index.html` to use the Worker URL.

---

## Project Structure

```
/
├── index.html              # Single-page shell — all views render into #playersGrid
├── _headers                # Cloudflare Pages security headers (CSP, X-Frame-Options…)
├── css/
│   ├── variables.css       # Design tokens — colors, spacing, radii, shadows (light + dark)
│   ├── animations.css      # @keyframes only
│   ├── main.css            # Layout, header, waffle nav, home page, search overlay
│   ├── components.css      # Cards, tables, toasts, skeletons, power rankings, advanced stats
│   ├── ticker.css          # Score ticker
│   └── arcade.css          # Arcade-specific styles
├── js/
│   ├── config.js           # Logger, global constants
│   ├── api.js              # AppState, ApiCache, bdlFetch, ESPN/NBA.com/MLB fetchers
│   ├── players.js          # NBA player grid, search, filters, favorites
│   ├── playerDetail.js     # NBA player detail — bio, stats, advanced efficiency, charts
│   ├── leaderboards.js     # NBA leaderboards
│   ├── teams.js            # NBA team drill-down
│   ├── games.js            # NBA scores and game cards
│   ├── standings.js        # NBA standings + ⚡ power rankings
│   ├── charts.js           # Chart.js wrappers (radar, shooting bars, trend)
│   ├── statBuilder.js      # Custom stat formula builder
│   ├── mlb.js              # All MLB views (players, leaders, teams, scores, standings)
│   ├── arcade.js           # Four daily arcade games
│   ├── search.js           # Global search overlay (⌘K) + recently viewed
│   ├── navigation.js       # Hash routing, waffle panel, breadcrumbs
│   └── app.js              # Bootstrap, sport switcher, home page, theme toggle
├── data/
│   ├── stadiums.json       # Ballpark Blueprint game data (30 stadiums)
│   └── trades.json         # Trade Tree game data
└── worker/
    ├── bdl-proxy.js        # Cloudflare Worker — BDL API proxy (Kalshi stub)
    └── wrangler.toml       # Worker deployment config
```

---

## Roadmap

| Phase | Status |
|---|---|
| Phase 0 — Stabilise | ✅ Complete |
| Phase 1 — MLB Charts & Stats | ✅ Complete |
| Phase 2 — MLB Navigation Parity | ✅ Complete |
| Phase 3 — Arcade Expansion | ✅ Complete |
| Phase 4 — Nav + Landing Page | ✅ Complete |
| T1 — UX Excellence | ✅ Mostly complete |
| T2 — Analytics Depth | 🔄 In progress |
| T3 — NFL / NHL | ⏳ Planned |
| T4 — Infrastructure & Odds | 🔄 In progress |

Full backlog: [ISSUES.md](ISSUES.md)

---

## License

MIT
