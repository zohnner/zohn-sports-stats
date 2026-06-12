# SportStrata — Vision, Goals & Principles

> **"Serious stats for serious fans."**
> SportStrata is a free, fast, no-login **MLB analytics dashboard** built for broadcast professionals, fantasy players, and data-obsessed baseball fans.

---

## Vision

Build the best browser-based **baseball stats experience** — no paywalls, no accounts, no clutter.  
Every stat a broadcaster needs should load in under 2 seconds and be shareable as a URL.

MLB is the core product. NBA, NFL, and NHL exist as preview features and will expand once MLB reaches full depth.

---

## Current Milestone — Public Beta

**Definition of done:** the product is ready for a public repo and public link without risk or embarrassment.

| Gate | Status | Owner |
|---|---|---|
| P1-006 resolved — BDL key out of source, Worker deployed | ✅ Resolved — key rotated, Worker deployed, BDL_PROXY_URL wired. Git history scrub (optional hygiene) remains available but non-blocking since old key is dead. | Axiom |
| Skeleton coverage on 3 P2 loading gaps (player deep-link, home hot strip, home starters) | ✅ Verified correct — Vera behavior check complete 2026-06-01. All three states (loading, error, not-found) implemented per spec. | Axiom + Vera |
| Data freshness timestamp visible on players and leaders views | ✅ Complete — leaders view `aria-label` added 2026-06-01. Kael to decide >60min format (non-blocking). | Finn + Vera |
| First-visit value statement on home page (renders once for new visitors) | ✅ Complete — dismiss button ruled unnecessary by Vera 2026-06-01. Kael to confirm accent vs surface background (non-blocking). | Finn + Vera |
| Scorecard Phase 1 shipped and smoke-tested | ✅ Shipped — smoke test passed 2026-06-01. Full 10-inning render, correct notation + diamond fills, paper texture, nav routing all verified. P3: header scores show `—` on cold deep-link (boxscore `runs` field path). See ISSUES.md. | Axiom |

**All five gates closed 2026-06-01. Public Beta milestone complete.**

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

**Completed:** players, leaderboards (47 categories including Statcast), teams, scores (with pitcher matchups), standings (with L10 + power rankings), stat builder, player detail, game prep sheet, starred favorites, live ticker, Statcast metrics (exit velocity, barrel%, xBA, xSLG, xwOBA, sprint speed via Savant), career year-by-year stats table with trend chart, player H2H comparison (P3-001, P3-003), live game expanded panel with pitch zone + base diagram (P3-025 Phases 1–2), baseball scorecard Phases 1–4.  
**Remaining:** All G2 depth targets met. ✅ wRC+ shipped 2026-06-08 (hardcoded FanGraphs guts constants, 2025 preliminary).  

Advanced computed stats (FIP, BABIP, ISO, WHIP, FIP, K-BB%, LOB%, RC, SB%) differentiate SportStrata from ESPN's surface-level scoreboard.

### G3 — Announcer-Ready
Every key fact should be surfaceable in **3 clicks or fewer**.  
Player detail → comparison → export should be a single workflow.  
Print layout (`⌘P`) produces a clean game-prep sheet with no chrome.  

**Completed:** Game Prep view with pitcher matchups, lineup context, print button. Search (⌘K) surfaces players with AVG/ERA hint. Player detail with full stat bars, career chart, Statcast percentile card, predictive analytics badge (Breakout/Regression/Sell High/Buy Low). Side-by-side comparison with shareable URL (P3-001). Broadcast Blurb button on player detail (Cloudflare Worker, needs deployment — P2-005). All G3 depth targets met.  
**Remaining:** Broadcast Blurb Worker deployment (P2-005 — authorization pending).

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
**$99/month for 100K requests** to a versioned REST API wrapping the SportStrata stat engine:
- Returns computed stats (FIP, BABIP, ISO, LOB%, RC, etc.) not available directly from MLB Stats API
- JSON responses with league rank, percentile, and rolling averages
- Powers fantasy app integrations, sports betting research tools, custom dashboards

### R4 — Fantasy Platform Partnerships
Affiliate agreements with **DraftKings, FanDuel, Yahoo Fantasy** for contextual referral links:
- "Build a lineup" button on player cards that deep-links to the platform with the player pre-selected
- Commission per signup: target $15–30 CPA
- DFS lineup optimizer page (Pro feature): optimal 8-man slate using SportStrata's stat model

### R5 — Shareable Stat Cards (Viral Growth)
Auto-generated **branded PNG/SVG cards** shareable to Twitter, Instagram, and iMessage:
- "Share this stat" button on any leaderboard entry → generates a SportStrata-watermarked graphic
- Cards show: player photo, stat rank (#1 in MLB), sparkline of last 30 days
- Each shared card links back to the live view — organic acquisition funnel

---

## Game-Changing Feature Goals

### F1 — AI Stat Narratives (Broadcast-Ready Context)
Use Claude API to generate a **2-sentence broadcast blurb** for any player on demand:
> *"Aaron Judge is batting .382 over his last 14 games with 6 HR, placing him 1st in MLB in OPS (.1.187) over that span. He's historically been a .310 hitter in April, but 2025 has been his best April since 2022."*

Trigger: "Broadcast Blurb" button on player detail page → streams response inline.  
Infrastructure: Cloudflare Worker calling Anthropic API with stat context injected as system prompt.  
This is the single feature that makes SportStrata irreplaceable for announcers.

### F2 — Real-Time Statcast Layer
Full **Baseball Savant integration** via Cloudflare Worker proxy:
- Exit velocity, launch angle, barrel%, hard hit%, sprint speed on every hitter card
- Whiff%, chase%, spin rate, extension on every pitcher card
- Statcast leaderboards alongside standard stat leaderboards (12 new categories)
- Heat-map zone charts: where each hitter hits the ball, where pitchers locate their fastball

This bridges the gap between SportStrata and Fangraphs/Baseball Savant — in one UI.

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

This makes SportStrata useful 365 days a year, not just in-season.

### F5 — Installable PWA with Push Notifications
Convert to a **Progressive Web App** with:
- "Add to Home Screen" prompt after 2nd visit
- Push notifications for: player milestones (HR #50, no-hitter in progress), game-start alerts for favorited teams
- Offline mode: last-fetched standings/leaderboards available without network
- App-store-quality experience without app store distribution

### F7 — Interactive Baseball Scorecard
A **play-by-play scorecard view** for any MLB game — historical or live:
- 9×9 CSS Grid with inline SVG diamonds per cell, notation symbols, and base progression fill states
- Historical mode: completed game loads pre-filled from `/game/{gameId}/playByPlay`
- Live mode: 20s polling, active at-bat cell pulses, pitch count updates in real time
- Cell hover shows full pitch sequence; player name links to player detail
- Share card: completed scorecard exported as a branded PNG (team colors, game date, SportStrata watermark)
- Printable via jsPDF if html2canvas spike validates viability

This is the highest-engagement depth feature for the broadcaster audience — a completed scorecard is a shareable artifact with social distribution value that no other stat surface produces.

Implementation is phase-gated. See `DECISIONS.md D-007` and full roadmap in `ISSUES.md`.

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
| MLB features complete | ✅ G2/G3 depth targets met (2026-06-08) | Maintain; new depth via P9/P10 (parked on Savant schema verification) |
| Leaderboard categories | ✅ 47 standard + 11 Statcast (incl. HH%, SS%, Whiff%, CSW%, xBA, xSLG, xwOBA, EV, Barrel%, K%, BB%) — P3-023/P3-024 shipped | — |
| Advanced computed stats | ✅ ISO, BABIP, FIP, K-BB%, LOB%, RC, SB%, BB%, K%, wOBA, wRC+ (Statcast) | — |
| Time to first meaningful paint | ✅ FCP 710ms, LCP 1.72s (Lighthouse, 2026-06-09) | < 1s cached, < 3s cold — met |
| Stat Builder covers MLB | ✅ Hitting + pitching, 36-stat palette | Full formula examples pre-loaded (open) |
| Announcer workflow (3 clicks) | ✅ Player → detail → Game Prep (print button live) | Player → compare → share URL |
| Starred favorites system | ✅ Heart on cards, home page chip section, localStorage | |
| Live scores + ticker | ✅ Header ticker + live polling home page | |
| Brand identity | ✅ Orange/gold palette, SportStrata icon in header | |
| API key in source code | ✅ Resolved — key removed, Worker proxy live, CORS allowlist (P1-006 closed 2026-06-09) | — |
| Lighthouse Performance | ✅ 93 (2026-06-09, D-011 pass: lazy math.js, deferred CSS, icon resize) | ≥ 90 — met |
| WCAG AA accessibility | ✅ 100/100 on players, player detail, leaders (D-004 closed 2026-06-09) | Full pass — met |

---

## Annual Maintenance

- **Park factors refresh (each April):** `_PARK_FACTORS` in `js/mlb.js` reflects 2022–2024 Baseball Reference averages. Re-verify at season start — relocations (Athletics) and park changes shift values. (Relay, 2026-06-04)
- **wRC+ guts constants:** `_MLB_WRC_CONSTANTS` needs each new season's FanGuts values when published; current-season values are preliminary (dagger shown in UI).

---

## Design Principles

1. **Data accuracy over data volume** — fewer stats shown correctly beats many stats shown wrong
2. **Progressive disclosure** — home page is simple; drill-down reveals depth
3. **Dark mode first** — default is dark; light mode is the toggle, not the reverse
4. **Fail gracefully** — every view has a skeleton, an error state, and a retry button
5. **No magic strings** — all team names, abbreviations, and IDs live in `config.js`
6. **Cache aggressively, invalidate clearly** — TTL buckets (5m/30m/60m) documented in `cache.js`
7. **One number, one home** — a stat appears once per view, paired with the context system suited to its type: counting stats get rank badges, rates get percentile bars. Showing the same number in two sections is not reinforcement, it is noise. (Owner + Kael, 2026-06-11)

---

## Design Direction Notes

### Design System Overhaul Must Precede Feature Expansion
**Contributor:** Kael | **Date:** 2026-05-17

The 2026 initiative pairs a design system overhaul with feature gap closure (spray charts, H2H matchups, team leaderboard filters). These two goals are in direct tension and need a sequencing decision before work begins.

The overhaul goes first. Adding spray charts and matchup views onto a partially inconsistent visual system means those components will inherit the inconsistency and need to be revisited when the overhaul eventually lands. That's rework. Do the system once, then build features into it.

What "design system overhaul" concretely means here: audit every component against the `variables.css` token set, eliminate any hardcoded values or one-off color choices that don't map to a token, and establish explicit rules for where each stat-color token applies and where it doesn't. The token system is solid; the discipline of applying it consistently is what's missing.

### Design System Overhaul — Current Status
**Contributor:** Kael | **Date:** 2026-05-29

**Complete:**
- Hero gradient clean — `.home-hero-glow` uses `color-mix` + token vars only, no hardcoded purple/indigo. Confirmed 2026-05-29.
- Three-button system defined: `.btn-primary`, `.btn-secondary`, `.btn-ghost` in `css/components.css`. All token-based, disabled states included.
- Feature card colors unified — single orange accent, SVG icons, no arbitrary per-card border colors.
- Brand gradient fixed — uses `var(--accent-light)` → `var(--accent)` only.
- `--font-display` (Barlow Semi Condensed) applied to feature card titles, leaderboard values, game scores.
- `--color-chip` / `--color-chip-bg` / `--color-chip-border` tokens defined and applied; 8 hardcoded `#818cf8` values eliminated.

**CSS classes written, waiting on Axiom JS wiring:**
- `.mlb-view-btn` / `.mlb-view-btn--active` — Cards/Table toggle. Replaces `_styleMLBViewBtn` inline styles, fixes emerald active-state semantic bug.
- `.mlb-group-btn` / `.mlb-group-btn--active` + `.mlb-group-toggle-row` + `.mlb-group-sep` — Hitters/Pitchers toggle. Replaces `_styleMLBGroupBtn` inline styles.
- `.mlb-pos-btn` / `.mlb-pos-btn--active` — Position filter chips. Replaces `_styleMLBPosBtn` inline styles, promotes hardcoded rgba values to `var(--color-chip-*)` tokens.
- Full implementation spec in ISSUES.md under "Player View Toggles."

**SVG specs written, waiting on Axiom JS update:**
- Three text-only leaderboard section dividers ("Active Hitting Streaks," "Hot Right Now," "Statcast Leaders") need SVG icons added to match the two existing icon-bearing dividers.
- Exact `innerHTML` strings documented in ISSUES.md under "Leaderboard Section Dividers."

**Design system overhaul complete — 2026-06-04 (Kael)**
- Inline `style=` audit complete: `leaderboard-more-btn` (JS hover → CSS `:hover`) and team filter wrapper (`style.cssText` → `.leaderboard-team-filter` class) moved to `css/components.css`. Data-driven color inline styles (team colors, stat category borders) remain intentionally — CSS custom properties are not appropriate for every-render dynamic values.
- Light-mode token verification complete: toggle classes confirmed. `--color-chip-*` tokens added to `[data-theme="light"]` with AA-compliant indigo values.
- `--text-subtle` raised in dark mode (`#6d8fb8`) and light mode (`#64748b`) for WCAG AA compliance.
- Ticker live pill text corrected (`var(--color-live)` → `var(--text-primary)`) for contrast compliance.

---

### Broadcast-Grade Posture Is the North Star — Protect It
**Contributor:** Kael | **Date:** 2026-05-17

SportStrata's intended posture is broadcast-grade authority: dense, legible, trustworthy. The reference point is Baseball Savant crossed with a broadcast lower-third system — not a fantasy sports app, not a consumer scoreboard.

The stat-color palette (amber, emerald, sky, violet, pink per stat category) is a sound semantic system when applied with restraint. The risk is that as the feature set grows, color gets used decoratively rather than categorically — every new component reaching for the palette to "look alive." That's the point where a semantic system becomes a gamification palette, and the product's posture shifts in a direction that undermines its credibility with the broadcast audience.

The rule to hold: stat colors mark category, not importance. Everything else uses the surface and text token hierarchy. No exceptions without a documented rationale.

---

## UX Direction Notes

### Mobile Nav Must Reflect the Announcer's Workflow — Not Implementation Order
**Contributor:** Vera | **Date:** 2026-05-17

The five slots in the bottom tab bar are the most valuable real estate on mobile. Every design decision about what occupies them is a statement about which users and which tasks matter most. The current lineup (Players | Leaders | Scores | Standings | Builder) was assembled by convention, not by audience analysis.

Game Prep is the product's primary differentiator for the broadcast professional persona — it is the feature that delivers on G3 ("every key fact in 3 clicks or fewer") for the audience segment targeted by the Enterprise tier at $499/month. It is currently absent from the tab bar and requires 3 taps to reach on mobile. Builder — a power-user stat-formula tool that most users encounter only after extended product exploration — occupies the tab bar slot that Prep should have.

The principle to hold going forward: the mobile tab bar is ordered by the primary audience's actual workflow, not by feature recency or implementation sequence. Before any new feature is considered for the tab bar, compare it against the announcer workflow: does an announcer need it in real-time conditions? If no, it goes in the menu panel. The tab bar is for what an announcer needs in the booth — not what a developer thought was important when they added it.

---

### Data Freshness Is a Trust Feature, Not a Nice-to-Have
**Contributor:** Vera | **Date:** 2026-05-17

The Enterprise tier (R2) targets broadcast professionals who will cite SportStrata stats on-air. A broadcaster needs to know not just what the stat is, but whether it reflects last night's performance or data from two days ago. Without a freshness signal, SportStrata is asking broadcast professionals to trust the product on faith — which is not how professionals in high-stakes, live environments operate.

"Stats updated [time]" is the minimum viable trust signal. It is also the explanation for stat discrepancies: when a broadcaster sees a different number on SportStrata than on another source, a timestamp tells them whether the difference is a calculation question or a timing question. Without it, the question becomes "is SportStrata wrong?" — which is the worst possible framing.

This feature should be implemented before Enterprise marketing begins. The data is already computed — the cache stores write timestamps. Surfacing it is a display problem, not a data problem. The implementation is small; the trust value is large. For the R2 pitch, being able to say "SportStrata shows when its data was last updated" is a concrete differentiator from tools that do not.

---

### First-Visit Orientation Is Required Before Pro Tier Launch
**Contributor:** Vera | **Date:** 2026-05-17

The home page today is designed for returning users who already understand what SportStrata is. For a first-time visitor arriving via a shared link, a search result, or a referral, the page offers game cards, shortcut tiles, and a hot strip — with no framing that explains the product or its value proposition.

For the free-tier user acquisition that precedes R1 (Pro at $9.99/month), the first-visit experience becomes a conversion variable. A broadcaster who arrives via a Google search for "baseball game prep stats" and sees the home page cold has roughly 10 seconds to answer one question: "Is this worth my time?" Nothing on the current home page answers that question within 10 seconds.

The fix does not need to be a tour or an onboarding flow. It can be as simple as a conditional value statement above the game cards — one or two sentences that render for users with no prior interaction history (detectable via localStorage) and disappear after the user's first navigation. The content: who this is for and why it is better than ESPN. It does not need to be permanent or prominent — it needs to exist for the user who needs it.

This is a pre-Pro-tier launch requirement, not a backlog item. Acquisition-at-scale without a first-visit hook is a funnel with a large hole at the top.

---

## Engineering Direction Notes

### P1-006 Is a Launch Prerequisite, Not a Backlog Item
**Contributor:** Axiom | **Date:** 2026-05-17

The BDL API key at `js/api.js:11` is plaintext in source. That's the single item that has to be resolved before any public push — full stop. The fix is already written: `worker/bdl-proxy.js` exists, the deployment path is documented in `ISSUES.md`. This isn't a complex engineering problem. It's an execution gap. It needs to be treated with the same urgency as a production incident, because the moment this repo goes public it becomes one.

Until it's fixed, no other launch-readiness work matters. Lighthouse scores don't matter. WCAG audits don't matter. A live API key in a public repo is an incident waiting for a timestamp.

### Scorecard Feature — Architecture Constraints and Risk Flags
**Contributor:** Axiom | **Date:** 2026-05-17

The scorecard introduces the first DOM-heavy, stateful, multi-phase feature we've built on this stack. Three architectural decisions are locked before Finn touches any code.

First: the play-by-play data model. The MLB Stats API `allPlays` array is more complex than it looks — mid-inning base advances (stolen bases, wild pitches during an active at-bat) are embedded as `playEvents` within the enclosing play object, not as separate play entries. The diamond fill state for any given batter is derived from the accumulated `runners` array across all events in the half-inning, not just the batter's outcome. Phase 0 exists to map this precisely. Skipping it produces incorrect base state rendering on anything more complex than a strikeout or clean hit.

Second: live mode interval lifecycle. `setInterval()` in a hash-based SPA without a cleanup hook is a background-polling leak. The interval handle lives in `scorecard.js` module scope. The cleanup lives in `navigateTo()` in `navigation.js` as a pre-navigation check against `AppState.mlbLiveGameId`. This is a shared-routing-logic touch — Axiom reviews that specific change before it ships.

Third: html2canvas is unproven in our rendering context. The scorecard design uses CSS `transform: rotate(45deg)` on the diamond, inline SVG, and CSS custom properties throughout. html2canvas has documented issues with all three. The spike in Phase 4 is not optional — it gates whether the export feature ships at all and in what form.

D3 is not entering this codebase. Diamond animations are CSS. Any proposal to add D3 for base-path animations gets declined without further discussion.

### AppState Is Load-Bearing — Treat Its Growth as a Structural Decision
**Contributor:** Axiom | **Date:** 2026-05-17

`AppState` in `api.js` is the entire runtime data model. It's working well and the pattern is sound: fields are populated lazily, views check for existing data before fetching, `mlbFetch()` centralizes caching. The architecture earns its simplicity.

The risk going into the 2026 feature push is that AppState grows by accretion rather than by design. Each new feature adds a field, and the "check if populated, fetch if not, then render" pattern gets repeated across more views against more interdependent fields. That's fine until two views race to populate the same field and either double-fetch or render on stale data. No confirmed incidents yet — but `mlbLeaderSplits`, `mlbHotStats`, and `mlbSavantLeaderboard` are already three heavyweight async dependencies that several views share. Adding more without auditing the fetch coordination will eventually produce a timing bug that's hard to reproduce.

The goal before the feature push: document which AppState fields each view depends on, identify any fields that multiple views independently fetch, and consolidate those fetches to a single call site. This doesn't require a rewrite — it requires deliberate accounting.
