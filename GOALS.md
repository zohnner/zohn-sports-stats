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
MLB must reach **full feature parity** (players, leaderboards, teams, scores, standings, builder, player detail, career charts) before other sports expand.  
Advanced stats (FIP, BABIP, ISO, WHIP) differentiate SportsStrata from ESPN's surface-level scoreboard.

### G3 — Announcer-Ready
Every key fact should be surfaceable in **3 clicks or fewer**.  
Player detail → comparison → export should be a single workflow.  
Print layout (`⌘P`) produces a clean game-prep sheet with no chrome.

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

## Non-Goals

- **Not a real-time broadcast tool** — 5-minute polling is sufficient; sub-second WebSocket feeds are out of scope
- **Not a social platform** — no comments, follows, or user-generated content
- **Not a betting site** — odds integrations are informational context only, not a primary feature
- **Not a mobile app** — responsive web is the target; no React Native, no Electron

---

## Success Metrics

| Metric | Current | Target |
|---|---|---|
| MLB features complete | ~80% | 100% (player detail, Stat Builder, career charts, print) |
| Time to first meaningful paint | ~1.5s cached | < 1s cached, < 3s cold |
| Stat Builder covers MLB | ✅ Hitting + pitching | Full formula examples + filter |
| Announcer workflow (3 clicks) | Partial | Full: player → compare → print/export |
| API key in source code | Yes (BDL key) | No — Worker proxy only |
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
