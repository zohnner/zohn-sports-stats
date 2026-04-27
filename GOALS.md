# SportsStrata — Vision, Goals & Principles

> **"Serious stats for serious fans."**
> SportsStrata is a free, fast, no-login **MLB analytics dashboard** built for broadcast professionals, fantasy players, and data-obsessed baseball fans.

---

## Vision

Build the best browser-based **baseball stats experience** — no paywalls, no accounts, no clutter.  
Every stat a broadcaster needs should load in under 2 seconds and be shareable as a URL.

MLB is the core product. NBA, NFL, and NHL exist as preview features and will expand once MLB reaches full depth.

---

## Target Audience

| Persona | What they need |
|---|---|
| **Sports announcer** | Quick player bio, current-season rank, head-to-head comparison, career history, game-prep sheet |
| **Fantasy player** | Leaderboards, advanced efficiency metrics (FIP, BABIP, ISO), week-to-week trends |
| **Casual fan** | Scores, standings, beautiful team/player cards, arcade games |
| **Data analyst** | Raw stat tables, CSV export, custom stat formula builder, multi-season history |

---

## Strategic Goals

### G1 — Speed & Reliability
Every view must render a useful state within **2 seconds** on a standard broadband connection.  
Degraded/partial data is acceptable; a broken blank screen is not.

### G2 — MLB Depth First
MLB must reach **full feature parity** before other sports expand.  

**Completed:** players, leaderboards (36 categories), teams, scores (with pitcher matchups), standings (with L10 + power rankings), stat builder, player detail, game prep sheet, starred favorites, live ticker.  
**Remaining:** Statcast metrics (exit velocity, barrel%, xBA, xSLG via Savant proxy), multi-season career charts, player head-to-head comparison.  

Advanced computed stats (FIP, BABIP, ISO, WHIP, FIP, K-BB%, LOB%, RC, SB%) differentiate SportsStrata from ESPN's surface-level scoreboard.

### G3 — Announcer-Ready
Every key fact should be surfaceable in **3 clicks or fewer**.  
Player detail → comparison → export should be a single workflow.  
Print layout (`⌘P`) produces a clean game-prep sheet with no chrome.  

**Completed:** Game Prep view with pitcher matchups, lineup context, print button. Search (⌘K) surfaces players with AVG/ERA hint. Player detail has stat bars, career chart scaffold, team context.  
**Remaining:** Side-by-side player comparison, shareable URL deep-link for player cards.

### G4 — Zero Friction
No login, no cookies banner, no paywall.  
Favorites, notes, and preferences save to `localStorage`; nothing leaves the browser unless the user explicitly shares a link.

### G5 — Maintainable Solo Codebase
No frameworks, no build step, no CI pipeline complexity.  
Vanilla JS + CSS modules. Each sport is one file (or at most two).  
The codebase should be readable by a future contributor in 30 minutes.

### G6 — Other Sports as Preview
NBA, NFL, and NHL are functional preview features — accessible but clearly secondary.  
They receive no new feature investment until MLB depth goals (G2) are met.

---

---

## Revenue & Growth Goals

### R1 — Freemium Conversion
Launch a **Pro tier at $9.99/month** gating:
- Full Statcast metrics (exit velocity, barrel%, xBA, xSLG, xwOBA, sprint speed)
- Historical data — any season back to 2015, season-over-season trend charts
- Unlimited custom Stat Builder formulas with save/share
- CSV/PDF export of any leaderboard or player card
- No ads, priority cache (edge-pinned data)

Free tier stays fully functional for current-season standard stats — never bait-and-switch the core product.

### R2 — Broadcast Professional SaaS
**$499/month Enterprise plan** for regional sports networks, radio stations, and TV production teams:
- 10-seat shared workspace with team logins
- Branded PDF game-prep sheets (station logo, commentator name on header)
- One-click "broadcast card" — oversized stat graphic ready for on-air lower-third
- Scheduled email digests: "Tonight's pitching matchup" delivered 3h before first pitch
- Dedicated Slack/email support channel

Target: sell 10 enterprise seats at launch = $5K MRR on day 1.

### R3 — Developer Data API
**$99/month for 100K requests** to a versioned REST API wrapping the SportsStrata stat engine:
- Returns computed stats (FIP, BABIP, ISO, LOB%, RC, etc.) not available directly from MLB Stats API
- JSON responses with league rank, percentile, and rolling averages
- Powers fantasy app integrations, sports betting research tools, custom dashboards

### R4 — Fantasy Platform Partnerships
Affiliate agreements with **DraftKings, FanDuel, Yahoo Fantasy** for contextual referral links:
- "Build a lineup" button on player cards that deep-links to the platform with the player pre-selected
- Commission per signup: target $15–30 CPA
- DFS lineup optimizer page (Pro feature): optimal 8-man slate using SportsStrata's stat model

### R5 — Shareable Stat Cards (Viral Growth)
Auto-generated **branded PNG/SVG cards** shareable to Twitter, Instagram, and iMessage:
- "Share this stat" button on any leaderboard entry → generates a SportsStrata-watermarked graphic
- Cards show: player photo, stat rank (#1 in MLB), sparkline of last 30 days
- Each shared card links back to the live view — organic acquisition funnel

---

## Game-Changing Feature Goals

### F1 — AI Stat Narratives (Broadcast-Ready Context)
Use Claude API to generate a **2-sentence broadcast blurb** for any player on demand:
> *"Aaron Judge is batting .382 over his last 14 games with 6 HR, placing him 1st in MLB in OPS (.1.187) over that span. He's historically been a .310 hitter in April, but 2025 has been his best April since 2022."*

Trigger: "Broadcast Blurb" button on player detail page → streams response inline.  
Infrastructure: Cloudflare Worker calling Anthropic API with stat context injected as system prompt.  
This is the single feature that makes SportsStrata irreplaceable for announcers.

### F2 — Real-Time Statcast Layer
Full **Baseball Savant integration** via Cloudflare Worker proxy:
- Exit velocity, launch angle, barrel%, hard hit%, sprint speed on every hitter card
- Whiff%, chase%, spin rate, extension on every pitcher card
- Statcast leaderboards alongside standard stat leaderboards (12 new categories)
- Heat-map zone charts: where each hitter hits the ball, where pitchers locate their fastball

This bridges the gap between SportsStrata and Fangraphs/Baseball Savant — in one UI.

### F3 — Predictive Analytics Engine
A **regression/breakout model** surfaced as a badge on player cards:
- "Breakout Candidate" — BABIP significantly below career norm, solid exit velocity, high xBA vs AVG gap
- "Regression Risk" — sky-high BABIP, mediocre exit velo, unsustainable HR/FB%
- "Sell High" / "Buy Low" — fantasy-friendly framing of the model output
- Model inputs: current vs career BABIP, xBA vs AVG gap, barrel%, K%, BB%, LOB%

No ML infrastructure needed at first — rules-based scoring computable client-side from Statcast + standard stats.

### F4 — Historical Database (2015–Present)
Store multi-season data in **Cloudflare D1** and surface it in the UI:
- Season-over-season stat tables on every player card
- Career trajectory chart: OPS, ERA, WAR-proxy plotted year-by-year
- "Player Comparison" with career arcs side-by-side for any two players
- All-time single-season leaderboards: "Greatest HR seasons since 2015"

This makes SportsStrata useful 365 days a year, not just in-season.

### F5 — Installable PWA with Push Notifications
Convert to a **Progressive Web App** with:
- "Add to Home Screen" prompt after 2nd visit
- Push notifications for: player milestones (HR #50, no-hitter in progress), game-start alerts for favorited teams
- Offline mode: last-fetched standings/leaderboards available without network
- App-store-quality experience without app store distribution

### F6 — Multi-Sport Full Parity
Once MLB goals are met, bring **NBA, NFL, and NHL** to the same depth:
- NBA: play-by-play splits, lineup net ratings, shot charts, advanced box scores
- NFL: PFF-style grades, target share, DVOA-proxy, snap count trends
- NHL: advanced stats (xGF%, HDCA, zone entry data), goalie save percentage by shot type

Unified player search across all sports — type any name, get any sport.

---

## Non-Goals

- **Not a real-time broadcast tool** — 5-minute polling is sufficient; sub-second WebSocket feeds are out of scope unless a specific broadcaster partnership requires it
- **Not a social platform** — no comments, follows, or user-generated content
- **Not a pure betting site** — odds as contextual reference only; partner referrals are acceptable
- **Not a native app** — PWA covers the mobile use case; no React Native or Electron

---

## Success Metrics

| Metric | Current | Target |
|---|---|---|
| MLB features complete | ~90% | 100% (Statcast, career multi-season charts, player comparison) |
| Leaderboard categories | ✅ 36 (hitting + pitching, incl. RC, LOB%, K/BB, SB%, TB) | Statcast: EV, Barrel%, xBA, xSLG |
| Advanced computed stats | ✅ ISO, BABIP, FIP, K-BB%, LOB%, RC, SB%, BB%, K% | Statcast, wRC+ (needs league constants) |
| Time to first meaningful paint | ~1.5s cached | < 1s cached, < 3s cold |
| Stat Builder covers MLB | ✅ Hitting + pitching, 36-stat palette | Full formula examples pre-loaded |
| Announcer workflow (3 clicks) | ✅ Player → detail → Game Prep (print button live) | Player → compare → share URL |
| Starred favorites system | ✅ Heart on cards, home page chip section, localStorage | |
| Live scores + ticker | ✅ Header ticker + live polling home page | |
| Brand identity | ✅ Orange/gold palette, SportsStrata icon in header | |
| API key in source code | ⚠️ BDL key hardcoded (P1-006) | Worker proxy — blocks public launch |
| Lighthouse Performance | Unknown | ≥ 90 |
| WCAG AA accessibility | Partial | Full pass on MLB views |

---

## Design Principles

1. **Data accuracy over data volume** — fewer stats shown correctly beats many stats shown wrong
2. **Progressive disclosure** — home page is simple; drill-down reveals depth
3. **Dark mode first** — default is dark; light mode is the toggle, not the reverse
4. **Fail gracefully** — every view has a skeleton, an error state, and a retry button
5. **No magic strings** — all team names, abbreviations, and IDs live in `config.js`
6. **Cache aggressively, invalidate clearly** — TTL buckets (5m/30m/60m) documented in `cache.js`
