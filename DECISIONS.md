# SportStrata — Decisions Log

Cross-domain decisions that constrain future work. All personas read this at session start before touching ISSUES.md or GOALS.md. Finn records; seniors decide.

**Statuses:** `open` = decision made, not yet actioned | `in-progress` = work underway | `complete` = fully resolved | `superseded` = replaced by a later decision

---

## D-001 — Design System Overhaul Precedes 2026 Feature Expansion
**Status:** complete
**Contributors:** Kael
**Date opened:** 2026-05-17 | **Date resolved:** 2026-05-17

**Decision needed:**
Whether the 2026 design system overhaul and feature gap closure (spray charts, team leaderboard filter, H2H matchups) happen concurrently or sequentially, and if sequentially, in what order.

**Options considered:**
- Concurrent: build features and overhaul the system in parallel
- Sequential, features first: ship the feature gaps, then clean up the system
- Sequential, overhaul first: complete the design system audit before adding new components

**Decision:**
Overhaul first. New feature components should be built into a resolved system, not onto a partially inconsistent one.

**Rationale:**
Features built before the overhaul will inherit whatever inconsistencies exist today and require a second pass when the system is eventually cleaned up. That's rework. Building into a clean system costs nothing extra and produces components that don't need to be revisited.

**Implications:**
- No new UI components for spray charts, team filter, or H2H matchups should be started until the design system audit in `css/variables.css` and `css/components.css` is complete and signed off by Kael.
- Axiom and Finn should not begin feature implementation on any 2026 gap item until Kael marks the overhaul complete.
- Vera's specs for those features can be written in advance — spec work is not blocked.

---

## D-002 — P1-006 Is a Launch Prerequisite Superseding All Other Readiness Work
**Status:** complete
**Contributors:** Axiom
**Date opened:** 2026-05-17 | **Date resolved:** 2026-06-01

**Decision needed:**
Whether P1-006 (BDL_API_KEY plaintext in `js/api.js:11`) must be resolved before any other launch-readiness work is considered blocking.

**Decision:**
Yes. P1-006 is resolved before any public push, regardless of what else is complete. No other readiness metric (Lighthouse score, WCAG pass, Broadcast Blurb deployment) is relevant until the key is out of source.

**Rationale:**
A live API key in a public repo is an incident. Everything else is polish. The fix is written (`worker/bdl-proxy.js` exists); this is an execution gap, not an engineering problem.

**Implications:**
- Finn must flag immediately if any session involves `js/api.js` and the key is still present.
- No commits that include `js/api.js` in its current state should be pushed.
- Axiom owns the deployment of the BDL worker proxy. No one else executes this step.
- `/deploy-check` must be run before any push and will catch this automatically.

---

## D-003 — AppState Fetch Deduplication Required Before 2026 Feature Push
**Status:** complete
**Contributors:** Axiom
**Date opened:** 2026-05-17 | **Date resolved:** 2026-05-17

**Decision needed:**
Whether AppState race conditions (multiple views independently fetching the same shared field) should be addressed before or after the 2026 feature push adds more async dependencies.

**Decision:**
Before. Fetch deduplication for shared AppState fields (`mlbLeaderSplits`, `mlbHotStats`, `mlbSavantLeaderboard`) must be in place before new features add more shared async fields to the same pattern.

**Rationale:**
The race condition is latent today. Each new feature that depends on a shared AppState field increases the probability of a double-fetch or stale-render timing bug. Fixing the pattern once before the push is cheaper than debugging it after three more features have been built on top of it.

**Implications:**
- Axiom owns this fix. It is scoped to `mlbFetch()` or a thin pending-promise registry around shared field fetches.
- Finn should not implement any feature that introduces a new shared AppState field until this is resolved.
- The fix must be reviewed by Axiom and confirmed with a smoke test across the leaders, player detail, and game prep views before being marked complete.

---

## D-004 — WCAG Audit Required Before Pro or Enterprise Tier Launch
**Status:** complete — closed 2026-06-09. Owner ran manual Lighthouse on `mlb-leaders`: **Accessibility 100/100** (alongside 96 Best Practices, 92 SEO). All three Priority 1 views now at 100. The WCAG launch gate for paid tiers is satisfied; future views inherit the token-level fixes.
**Contributors:** Kael, Vera, Finn
**Date opened:** 2026-05-17 | **Date resolved:** —

**Decision needed:**
Whether a structured WCAG AA accessibility audit is required before any paid tier (Pro or Enterprise) is launched to users.

**Decision:**
Yes. A structured audit — minimum axe-core or Lighthouse accessibility pass — must be completed and findings addressed before any paid tier opens. The audit targets MLB players, leaders, and player detail views first.

**Rationale:**
The current state is "partial" with no audit run. That means the gap is unknown. Selling a Pro tier to broadcast professionals who use keyboard shortcuts and production assistants who may use assistive technology without confirming basic accessibility is not acceptable. The Enterprise plan specifically targets stations and networks where this is a real-world concern.

**Progress as of 2026-06-04:**
- `mlb-players`: **100/100** ✅ — all contrast failures resolved (--text-subtle raised, ticker pill text fixed, compare select labels added)
- `mlb-player-{id}`: **100/100** ✅ — same fixes apply; compare select labels added
- `mlb-leaders`: **pending manual browser run** — headless Lighthouse times out on this view due to Statcast fetch weight. All contrast fixes are already in place from the token changes. Finn must run in Chrome DevTools and document score.

**Remaining to close D-004:**
1. Manual Lighthouse run on `mlb-leaders` in Chrome DevTools — document score in ISSUES.md
2. D-004 resolves when leaders view scores ≥90 and findings are documented

**Implications:**
- Vera owns the audit scope and reviewing findings. Kael owns color contrast remediation. Axiom owns keyboard navigation and focus management fixes.
- Finn can execute the axe-core / Lighthouse run and document findings in ISSUES.md as individual named entries.
- The WCAG pass is a launch gate for revenue tiers only — it does not block free-tier ongoing development.

---

## D-005 — Throttled-Network Verification Pass Required Before 2026 Feature Push
**Status:** open
**Contributors:** Kael
**Date opened:** 2026-05-17 | **Date resolved:** —

**Decision needed:**
Whether all views should be manually verified under throttled network conditions before the 2026 feature push adds more async data dependencies.

**Decision:**
Yes. Every MLB view must be walked in Chrome DevTools with network throttled to "Slow 3G" before the feature push begins. The goal is to confirm that skeleton states appear correctly, partial data failures produce graceful error states (not blank containers), and no view silently breaks under a cold cache.

**Rationale:**
Skeleton states exist but coverage has not been verified. Each new feature adds async dependencies. If a skeleton gap exists today, it compounds with every new data dependency added on top of it. Confirming coverage now is cheaper than discovering it after the push.

**Implications:**
- Finn executes the verification pass across all MLB views and documents any gaps in ISSUES.md.
- Vera reviews gaps for UX spec requirements. Axiom reviews gaps for implementation.
- Any view that shows a blank container on partial failure — rather than a skeleton + error message — is a P2 bug before the feature push is approved.

---

## D-007 — Baseball Scorecard Feature Approved — Phase-Gated Implementation
**Status:** open
**Contributors:** Axiom
**Date opened:** 2026-05-17 | **Date resolved:** —

**Decision needed:**
Whether to proceed with the baseball scorecard feature (as documented in `Documentation/baseball-scorecard-docs.md`), and if so, in what phases and with what constraints.

**Options considered:**
- Full feature set (all 6 phases) approved and implemented sequentially
- Phase-gated: approve Phase 1 only, each subsequent phase requires the previous to ship and be reviewed
- Defer entirely until MLB depth goals are met

**Decision:**
Proceed, phase-gated. Phase 1 (historical static render) is approved in principle. Each subsequent phase requires the previous phase to ship and be reviewed before starting.

**Rationale:**
The feature maps directly to the target audience (broadcasters, statheds), the MLB Stats API play-by-play endpoint is free and already in scope, and the architecture fits the existing vanilla JS/CSS pattern. Phase-gating manages scope risk — the full feature set is 3–4 months of work; Phase 1 alone proves the concept and delivers a genuinely differentiated artifact. Phase 5 (annotation mode, custom notation) is parked indefinitely — insufficient evidence of demand to justify the complexity.

**Implications:**
- Implementation is blocked on D-001 (design system overhaul complete) and D-003 (fetch deduplication). No code written before both close.
- Kael must produce the visual design — grid layout, diamond SVG, new CSS token additions — before Phase 1 starts. New tokens go through the normal Kael → variables.css review process.
- Vera must produce the behavioral spec — all interaction states (active PA, hover, empty, error, mobile) — before Phase 1 starts.
- Axiom owns: Phase 0 API verification, the html2canvas spike in Phase 4, AppState field additions in Phase 3, and review of all Finn output before any phase is marked complete.
- D3.js is not approved for use in any phase. Diamond animations are vanilla CSS/SVG.
- html2canvas and jsPDF are not approved until the Phase 4 spike assesses viability on the actual rendered scorecard. If html2canvas fails, Axiom escalates the alternative (Cloudflare Worker + headless screenshot) to the project owner before any Phase 4 work proceeds.
- Phase 5 (annotation mode, custom notation) is parked — no spec, no implementation until Phases 1–4 ship and adoption is validated.
- Full per-phase task breakdown lives in ISSUES.md under "Scorecard Feature — Phased Implementation Roadmap."

---

## D-006 — Broadcast Blurb Worker Deployment Requires Explicit Authorization
**Status:** complete — owner ruling 2026-06-09: deployment **deliberately deferred**. The worker stays undeployed by choice (Anthropic API cost), not by oversight. F1 remains inert in production until the owner reopens this. Do not re-list as a pending action.
**Contributors:** Axiom
**Date opened:** 2026-05-17 | **Date resolved:** —

**Decision needed:**
Whether the Broadcast Blurb Cloudflare Worker (`worker/wrangler-blurb.toml`, P2-005) should be deployed, and who authorizes the deployment.

**Decision:**
Deployment requires explicit authorization from the project owner. Axiom owns the technical deployment when authorized. No other persona executes this step.

**Rationale:**
The worker calls the Anthropic API, which has real cost implications. The `ANTHROPIC_API_KEY` must be set as a secret before deployment. No blocker has been documented in ISSUES.md explaining why this hasn't shipped — if there is a reason (cost concern, rate limit, key not available), it must be documented before this decision can be marked complete.

**Implications:**
- Finn documents any new information about this blocker in ISSUES.md but does not attempt deployment.
- Axiom executes the two deployment commands when authorized: `wrangler secret put ANTHROPIC_API_KEY` + `wrangler deploy`.
- Until deployed, the F1 AI Stat Narratives feature (GOALS.md) is inert in production regardless of how it's described in the goals document.

---

## D-008 — MLB Statistical Bot for X: Sequencing, Voice, and Scope
**Status:** open
**Contributors:** Kael
**Date opened:** 2026-05-31 | **Date resolved:** —

**Decision needed:**
Three separate questions that must be answered before any bot implementation begins:

1. **Sequencing:** Does the bot launch before the `/unprecedented/[id]` landing pages exist on SportStrata, or must those pages ship first?
2. **Voice:** What tone governs the tweet templates — high-energy consumer hype ("RARE AIR 🚨") or broadcast-grade precision (stat + claim + link, no emoji)?
3. **Scope:** Is this a SportStrata companion project (separate Python repo, separate deployment) or an in-scope feature that sits in the SportStrata repo?

**Options considered:**

Sequencing: (a) Bot first, link to existing player detail pages as proxy; (b) Landing pages first, bot launches with real destinations; (c) Build both simultaneously.

Voice: (a) Hype/viral — emoji, exclamation, Bleacher Report register; (b) Precision/authority — stat-first, no decoration, broadcaster register.

Scope: (a) Separate Python repo, entirely independent; (b) Add bot logic as a Cloudflare Worker alongside the existing SportStrata Worker stack; (c) Hybrid — Python bot, but landing pages are new SportStrata views.

**Kael's position:**
Landing pages must precede bot launch. Sending traffic from a credible stat claim to a 404 damages the brand. Voice must be precision/authority — hype templates conflict with SportStrata's broadcast-grade posture. Scope is naturally a separate Python project, but the landing pages it links to are SportStrata views and must be designed before the bot posts publicly.

**Vera's position (2026-05-31):**
Bridge sequencing — Phase A links to existing player detail routes, Phase B links to unprecedented pages once they ship and are smoke-tested. Voice: one word of signal ("Unprecedented", "Never in MLB history") plus stat line plus link — no emoji beyond a single non-decorative marker, no exclamation. Scope: Python bot is separate; landing pages are SportStrata views.

**Axiom's position (2026-05-31):**
Agrees with bridge sequencing and separate scope. Key feasibility note: historical frequency counts ("38 games with 19+ TB since 2000") cannot be computed from MLB Stats API alone — the Python bot must pre-compute and expose a JSON API endpoint (`GET /api/unprecedented/{id}`) that SportStrata fetches for Phase B pages. The bot API domain will require CSP update in `_headers` and `index.html` (same pattern as BDL Worker). Phase B is otherwise feasible within existing vanilla JS/CSS/HTML constraints.

**Decision:**
Split path (2026-06-01). Bot architecture proceeds immediately. Landing pages remain parked — no unprecedented/rare/drought pages are designed or built until the owner reopens that item. Bot links to existing SportStrata routes (`#mlb-player-{id}`, `#mlb-leaders`) during Phase A.

Bot scope: Python project scaffolded in `bot/` subdirectory of the SportStrata repo. Can be extracted to its own repo at any point.
Bot voice: precision over hype — Kael's spec enforced in tweet templates.
Bot data: Axiom's JSON API endpoint approach deferred with landing pages — not needed for Phase A.

**Implications:**
- Axiom builds the Python bot architecture in `bot/`.
- Tweet templates use precision voice — stat + claim + existing SportStrata link.
- No new SportStrata views are created as part of this work.
- Landing pages and bot JSON API revisit when owner says so.

**Implications:**
- No Python bot implementation begins until all three questions are resolved here.
- If landing-pages-first sequencing is accepted: Vera specs the unprecedented/rare/drought landing pages as new SportStrata views; Kael designs them; Axiom confirms feasibility; Finn implements. Only then does the bot go live.
- If bot-first sequencing is accepted: tweet templates must link to existing SportStrata routes (player detail, leaderboards) — no 404s allowed under any path.
- Tweet template voice must be approved by Kael before any public post. A hype template rejected by Kael blocks that tweet format from shipping.

---

## D-009 — Live Game Expanded View: Approved, Phase-Gated, Architecture Decisions
**Status:** complete — owner ruling 2026-06-09: full-page view accepted as the intended direction. Architecture decision #2 (inline accordion) is superseded by the shipped `showMLBLiveGame` full-page pattern; `openLiveGamePanel` remains exported for potential future accordion use but is not wired. ISSUES.md "Architecture Deviation" entry closes with this ruling.
**Contributors:** Vera, Relay, Kael, Axiom
**Date opened:** 2026-06-04 | **Date resolved:** —

**Decision needed:**
Whether to proceed with the Live Game Expanded View feature (as documented in `sportsstrata_live_game_expanded_view.md`), and if so, in what phases, what architecture, and with what constraints.

**Options considered:**
- Full feature set in one implementation pass
- Phase-gated: Phase 1 core, Phase 2 pitch zone + matchup, post-MVP enhancements deferred
- Defer until scorecard phases 2–4 complete

**Decision:**
Proceed, phase-gated. Phase 1 approved. Each subsequent phase requires Phase 1 to ship and be smoke-tested.

**Architecture decisions resolved by the team (all binding):**

1. **New file: `js/liveGame.js`** — not added to `mlb.js`. Loaded after `mlb.js` in `index.html` script chain. No module exports — functions called directly from `navigation.js` and `mlb.js` game card click handlers. (Axiom)

2. **Entry pattern: inline accordion** — the live game expanded view opens in-place within the scores list, not a modal or overlay. A "Fullscreen" affordance may be added in Phase 2. (Vera)

3. **Polling: diff-based** — poll `/game/{gamePk}/linescore` (tiny, ~2KB) every 8–10s. Only fetch `/game/{gamePk}/feed/live` (heavy, 200–500KB) when `currentInning`, `inningState`, or run totals change. Cuts heavy fetch rate ~70% vs. polling `feed/live` every interval. (Relay)

4. **No ApiCache for live polls** — live polling bypasses `mlbFetch()` entirely. Uses `fetch(_mlbProxyUrl(url))` directly. No cache read or write on poll responses. (Relay + Axiom)

5. **Interval lifecycle: module-scoped** — `let _liveGameInterval` and `let _liveGamePk` in `liveGame.js` module scope. `navigateTo()` in `navigation.js` checks `_liveGamePk` and calls `clearInterval` before routing. Same pattern as scorecard live mode. (Axiom)

6. **Pitch dots: result-coded colors, not team colors** — Ball (`--color-ast`), Called Strike (`--color-loss`), Swinging Strike (`--accent`), Foul (`--text-muted`), In Play (`--color-win`). All existing tokens. Team colors on pitch dots carry no useful information. (Kael)

7. **Win probability: removed from MVP** — MLB Stats API does not expose win probability. No reliable free-tier source exists. Post-MVP if a dedicated computation layer is built. (Relay)

8. **vsPlayer endpoint: confirmed working** — `/people/{id}/stats?stats=vsPlayer&opposingPlayerId={id}&group=hitting` returns per-season splits + `vsPlayerTotal` career aggregate. Present in Matchup Stats tab. Handle empty `splits` array gracefully (players who've never faced each other). (Axiom)

9. **Strike zone: batter-specific bounds** — use `matchup.batterStrikeZoneTop` and `matchup.batterStrikeZoneBottom` from `feed/live`, not a fixed rectangle. pX/pZ coordinate-to-SVG mapping: viewBox `0 0 100 140`, pX maps to `(pX + 1.5) * (100/3)`, pZ maps to `(4.5 - pZ) * (140/4.5)`. (Kael + Relay)

10. **Tab state: module-scoped Map, not localStorage** — `Map<gamePk, activeTab>` in `liveGame.js`. Persists within session; resets on reload. (Vera)

**Phase scope:**

| Phase | Scope | Gate |
|---|---|---|
| Phase 1 | Accordion container, game header bar, linescore, play-by-play tab, box score tab, diff-based polling | Phase 1 smoke-tested |
| Phase 2 | Pitch zone SVG, base runner diagram, matchup stats tab (vs. pitcher H2H, arsenal) | Phase 1 complete |
| Post-MVP | Win probability chart, pitch trajectory animation, heat map overlay, share card | Deferred indefinitely |

**Implications:**
- Finn does not begin Phase 1 implementation until all three gates exist in ISSUES.md: Kael visual spec, Vera behavioral spec (all states), Axiom feasibility sign-off. All three are in progress as of 2026-06-04.
- `js/liveGame.js` added to script load order in `index.html` after `mlb.js` — Axiom confirms position.
- Kael must complete Phase 1 visual spec before Finn starts. Phase 2 visual spec (pitch zone proportions, dot interaction) may be drafted in parallel.
- Vera's behavioral spec covers all state transitions including: poll failure / reconnecting, delay → live transition, extra innings, pitching change banner, and tab memory.
- WCAG note: pitch dots require `aria-label` on each plotted point (pitch number, type, result) for keyboard/screen reader users. Vera specs the keyboard interaction on the zone in Phase 2.
- Mobile layout order (Vera ruling): game header → count/outs → base diagram → linescore → pitch sequence log → zone plot. Zone drops below fold on mobile; this is intentional.

---

## D-010 — Service Worker Update Strategy: Stale-While-Revalidate for Static Assets
**Status:** accepted
**Contributors:** Axiom, Vera, Cipher (review)
**Date opened:** 2026-06-09 | **Date resolved:** 2026-06-09

**Decision needed:**
How the service worker should serve same-origin JS/CSS so that production deploys actually reach returning users, without sacrificing offline support or first-paint speed.

**Options considered:**
- Keep cache-first, enforce a manual `CACHE_NAME` bump on every deploy (process discipline — the failure mode is the default)
- Network-first for JS/CSS (always fresh, but every load pays full network latency)
- Stale-while-revalidate: serve cached instantly, refresh in background

**Decision:**
Stale-while-revalidate for all same-origin static assets. `CACHE_NAME` bumped to `sportstrata-v3` to evict existing cache-first clients once. Navigation requests stay network-first with `offline.html` fallback. Precache list completed (`math.min.js`, `scorecard.js`, `liveGame.js`, `scorecard.css`, `liveGame.css` added).

**Rationale:**
Cache-first plus a static version string meant every deploy silently shipped to nobody who had visited before — the worst possible failure mode for a product whose pitch is data trust. SWR keeps the instant first paint and offline capability while bounding staleness to a single page load. A manual bump-on-deploy rule was rejected because it fails silently the first time someone forgets.

**Implications:**
- Deploys no longer require a `CACHE_NAME` bump to propagate JS/CSS changes.
- Returning users may run one-load-old code immediately after a deploy — acceptable; freshness-critical data is API-fetched, not in static assets.
- Any future file added to the script chain in `index.html` must also be added to `STATIC_ASSETS` in `sw.js` — Folio adds this to the deploy checklist documentation.


---

## D-011 — Performance Pass Approved: Lighthouse 58 → ≥90 Target (G1)
**Status:** complete — owner re-ran Lighthouse post-deploy 2026-06-09: **Performance 93** (FCP 710ms, LCP 1.72s, TBT 77ms, CLS 0, SI 868ms), SEO **100** (robots.txt fix), Best Practices 96. Target met without minification — G5 no-build constraint holds. Watch item: Accessibility read 96 on this run vs 100 previously — likely run variance or a new element; re-check on next audit pass, not a gate regression (≥90 threshold still satisfied).
**Contributors:** Axiom, Relay, Kael (consulted), owner (Lighthouse run)
**Date opened:** 2026-06-09 | **Date resolved:** —

**Decision needed:**
Owner's Lighthouse run on `mlb-leaders`: Performance **58** — FCP 4.6s, LCP 4.6s, Speed Index 6.3s. G1 promises a useful render within 2 seconds. The score breakdown identifies: render-blocking requests (~2,240ms est), unused JS 135KiB, image delivery 96KiB, missing robots.txt (335 SEO errors), no HSTS.

**Decision:**
Performance pass approved with these specific measures, in order of measured impact:

1. **math.min.js (664KB) leaves the critical script chain** — lazy-loaded by `statBuilder.js` when the Builder view first opens. This is a documented load-order change: `math.min.js` is no longer position 1; the existing `typeof math === 'undefined'` guard plus an async loader covers the gap. Stat Builder shows its loading state until the library arrives.
2. **View-specific CSS deferred** — `arcade.css`, `scorecard.css`, `liveGame.css`, `shareCard.css` and the Google Fonts stylesheet load non-blocking (`media="print"` + onload swap, with `<noscript>` fallback). Core path keeps variables → animations → main → components → ticker.
3. **Header icon right-sized** — 96KB `Icon.PNG` replaced in the header/A2HS by a generated 64px version; original retained for manifest/large uses.
4. **robots.txt added** (was missing — SPA fallback served HTML to crawlers, producing 335 parse errors).
5. **HSTS + COOP headers added** to `_headers` (Best Practices findings).
6. Minification (16KiB CSS / 10KiB JS) **rejected for now** — conflicts with G5 (no build step) for modest gain. Revisit only if ≥90 is not reached without it.

**Implications:**
- CLAUDE.md load-order doc updates (math.min.js no longer first).
- `sw.js` precache keeps math.min.js (offline Builder still works once cached).
- Re-run Lighthouse after deploy to verify the ≥90 target; FCP/LCP should drop by roughly the render-blocking estimate on broadband.

---

## D-009 — Amendment (2026-06-12): Owner Reactivates Pitch Heat Map; Trajectory Stays Gated
**Contributors:** owner (direction), Kael (color), Vera (toggle + mobile), Axiom (feasibility)

D-009 deferred the live pitch heat map and pitch-trajectory animation "post-MVP, indefinitely." Owner reactivated both. Team split them by data certainty:

- **Heat map — SHIPPED.** Built on the already-confirmed `pitchData.coordinates.pX/pZ` fields (same source as the dots view and the spray chart). Aggregates every pitch the current pitcher has thrown **this game** (`liveData.plays.allPlays`, filtered by `matchup.pitcher.id`) into a binned density grid over the zone. Kael: one hue (`--accent`), opacity encodes count — no new palette, same data-intensity language as P9/P3-028. Vera: a Dots/Heat pill toggle above the zone, Dots default, Heat disabled until ≥1 game pitch exists, session-scoped per gamePk. No refetch on toggle — re-renders from `_lgFeedCache`.
- **Trajectory animation — STILL GATED.** Needs per-pitch physics fields (movement/break, e.g. `pfxX/pfxZ`, `breaks.*`) that are **not** confirmed in the live `feed/live` payload. Per the Relay/Axiom precedent (P9/P6 schema verification), this stays parked until the owner supplies a real `feed/live` sample so the fields can be verified. No code written against unverified fields.

Mobile order (Vera, ties off a D-009 open item): on ≤768px the zone column drops below the play-by-play log via flex `order` — the spatial zone is the lower-priority view on a phone; the log leads.

---

## D-012 — NFL Promoted from Preview to Public Beta (Phase 2)
**Status:** open — owner direction 2026-06-14; v1 scope pending owner ruling
**Contributors:** owner (direction), Vera, Kael, Axiom, Relay, Cipher, Folio

**Direction (owner):** Add NFL as a real, surfaced product in the next public-beta phase. This **amends G2** ("MLB must reach full feature parity before other sports expand") — NFL no longer waits on full MLB depth. GOALS.md G2 and the CLAUDE.md "MLB is the only active product" rule must be reconciled to reflect this (Folio follow-up).

**Current state (Axiom/Relay):** `js/nfl.js` (518 lines) already ships an ESPN-backed preview — teams, scoreboard/scores, standings, leaders, ticker, game cards, `_renderNFLView` routing. ESPN endpoints (`site.api.espn.com/.../nfl`) and logos (`a.espncdn.com`) are already in the CSP and `_headers`. It is wired but not surfaced or polished for users. So this is a promotion + hardening effort, not a greenfield build.

**Per-domain framing — what "NFL in beta" requires:**
- **Vera (UX):** sport switching must become a first-class, discoverable flow (the nav is MLB-centric today). Every NFL view needs loading/empty/error states — and an **offseason** state, since the NFL is dormant most of the calendar. Decide which NFL tabs appear and how MLB↔NFL switching reads across the three nav surfaces (sub-nav / menu / bottom bar).
- **Kael (visual):** NFL team colors/logos/posture must fold into the existing token system — no new off-theme palettes (we just finished the De-AI passes). Reuse the restrained card/leaderboard language. City Connect theming is MLB-only; NFL gets its own identity treatment or none.
- **Axiom (architecture):** `AppState` NFL fields and `nfl-` routing already exist; confirm script-load order, cache TTLs, and whether NFL warrants an edge-cache proxy like `functions/api/mlb.js` (ESPN is hit directly today — acceptable for preview, evaluate under beta load).
- **Relay (data/API):** audit ESPN NFL depth before promising parity — rosters, player detail/stats, game detail, play-by-play — plus reliability, rate limits, and schema-drift risk. ESPN is a less formal contract than the MLB Stats API.
- **Cipher (security):** ESPN domains already allowlisted; confirm no new domains are needed and keep `_escHtml` on all ESPN-derived strings.

**Gates:** the three-gate rule applies per NFL view before Finn implements — Vera behavioral spec, Kael visual spec, Axiom feasibility sign-off.

**Open scoping question (owner):** what is NFL v1 for beta? (a) light surface — scores + standings + teams (mostly exists); (b) that + player/leaders depth; (c) MLB-level parity (player detail, game prep, etc.). This sets the spec scope for the seniors.

**Scope set (owner, 2026-06-14): LIGHT SURFACE.** NFL v1 = scores + standings + teams (mostly already built in `js/nfl.js`). Work is surfacing it in the nav, UX/visual polish to match the MLB system, and an offseason empty state — not player/leaders depth or MLB-level parity (deferred to later phases). Next step when work resumes: Vera behavioral spec (sport-switch flow + states incl. offseason), Kael visual spec (NFL identity within the token system), Axiom feasibility — then Finn implements behind the three gates.

---

## D-013 — NFL Data Source: ESPN via Pages Function Proxy (Sportsipy rejected on ToS)
**Status:** in progress — owner direction 2026-06-14
**Contributors:** owner, Cipher, Relay, Axiom, Folio

**Sportsipy rejected.** Sports-Reference's data-use policy explicitly prohibits building websites/tools on scraped data (sports-reference.com/data_use.html). SportStrata is a public site, so Sportsipy (an SR scraper) is a ToS violation — owner confirmed not to use it. It is also Python-only (can't run in the JS frontend) and scraper-fragile. No Sportsipy code ships (the scaffold started under the earlier ruling was left untracked and not committed).

**Chosen: ESPN via a same-origin Pages Function proxy** — `functions/api/nfl.js`, mirroring `functions/api/mlb.js`. Diagnosed live: ESPN's `/scoreboard` works from the browser, but `/teams` and `/leaders` are CORS-blocked client-side and the site `/standings` endpoint is dead (returns only `fullViewLink`). A server-side proxy fixes CORS and keeps the frontend same-origin (no new connect-src). Pages Functions confirmed live in production (`/api/mlb` responds). `js/nfl.js` `espnNFLFetch` now routes through `/api/nfl?path=...`.

**Standings:** ESPN site `/standings` has no data; standings will be derived from the `/teams` endpoint (records + a division map) — to be built against the real proxied payload after deploy, not guessed.

**Next:** push → validate `/api/nfl?path=/teams` & `/scoreboard` return real data via the live proxy → build NFL standings/teams parsing on verified shapes → surface NFL in the nav (sport switcher + tabs) + offseason state. ToS-clean, consistent with how MLB already works.

---

## D-014 — NFL Fantasy Roadmap: Mock Draft First; Accounts Are the Pivotal Decision
**Status:** open — owner direction 2026-06-14; accounts decision + target audience pending
**Contributors:** owner, Vera, Kael, Axiom, Relay, Cipher, Folio

**Direction (owner):** make NFL fantasy cutting-edge — mock drafts, fantasy grades, rich interactive graphics, league integration, monetization.

**Honest framing — two tiers:**
- **Doable now (no accounts, fits static Pages + Functions):** mock-draft simulator with Monte Carlo value ranges and ADP/tier AI opponents, a live draft-board UI, projections/ADP/rankings. Recommended first build — the #1 fantasy hook and the biggest wow per unit of effort, with no identity change.
- **Requires a product-identity change (accounts + storage + backend + payments):** personalized grades, league import, AI insights, multiplayer draft rooms, freemium subscriptions. SportStrata is currently no-login/free — adding accounts is a strategic pivot, not a feature.

**Data source (Relay/Cipher):** **Sleeper API** — free, public, read-only, no key, NFL-comprehensive, commercial use OK (review ToS before monetizing), supports league/roster import without cookie-scraping. Rejected for consistency with D-013: `sportly` (ESPN-Fantasy cookie auth + Python-only), `nfl-mcp-server` (scrapes CBS projections — ToS risk, same class as the rejected Sportsipy), NexGenData (paid + sportsbook lines = betting/brand/regulatory flag, cf. the Kalshi flag in P-notes).

**Compute:** Monte Carlo mock-draft simulation can run client-side or in a Pages Function on cached Sleeper ADP/projection data — no always-on server needed for the no-login tier. AI insights need an LLM API (per-call cost; the broadcast-blurb Worker is the existing pattern, currently disabled for cost). Multiplayer needs a real-time backend (Durable Objects/WebSockets).

**Monetization:** freemium requires accounts + a payment processor; payment setup is owner-performed (not something the build does directly).

**Open decisions (owner):** (1) **Add user accounts/login?** — gates the entire account tier. (2) **Which fantasy player first** — casual/redraft, dynasty, or DFS? — focuses the feature set.

**Next (workflow):** finish the NFL light surface (D-013 validation + nav). Then Vera/Kael/Axiom spec the no-login mock-draft simulator behind the three gates.

**Decided (owner, 2026-06-14):** path = **no-login mock-draft first, plan accounts in parallel**; first audience = **casual / redraft**. Build the mock-draft simulator now (no accounts); design the accounts/backend data model alongside so the account tier (grades, league import via Sleeper, AI, monetization) can follow without a rebuild. Data via `/api/sleeper` Pages Function proxy (added).

**Status update (2026-06-14):** D-012 (NFL light surface) and D-013 (ESPN proxy) — SHIPPED + validated live (switcher, Scores, Teams, offseason Standings, logo fix). D-014 mock-draft v1 — SHIPPED + validated live (`js/fantasy.js`: Sleeper ADP, AI opponents, Monte Carlo, grade). CLAUDE.md "Sport Focus" rule reconciled (NFL now in scope). Open follow-ups in ISSUES.

---

## D-015 — NFL Depth: Players + Trending Reuse Existing Components on Sleeper Data
**Status:** shipped (pending push) — owner direction 2026-06-15
**Contributors:** owner, Relay, Finn, Axiom, Cipher

**Direction (owner):** deepen NFL beyond the light surface by reusing logic already built — leaderboards, player cards/detail.

**Data finding (Relay):** ESPN's site API (the host our `/api/nfl` proxy is locked to) has **no working stat-leaders or roster path** — `/api/nfl?path=/leaders` returns 404, and `/teams/{id}/roster` is not allowlisted. Real ESPN stat leaders live on a *different* host (`sports.core.api.espn.com`), which would need its own proxy + allowlist + validation. On top of that it is June — the 2026 NFL season has zero stats. So a literal "passing-yards leaderboard" cannot be built cleanly today. The dead `fetchNFLLeaders()` (pointed at the 404 path) was removed.

**Decision:** build NFL depth on **Sleeper** (already validated in production by the mock draft, `/api/sleeper` proxy):
- **NFL Players view** — reuses the `.player-card` component. 2,347 active fantasy players, ranked by ADP (Sleeper `search_rank`), with real metadata (pos, team, age, exp, HT/WT, college, jersey #, injury status). Position filter chips (ALL/QB/RB/WR/TE/K). Headshots from `sleepercdn.com` (added to CSP `img-src` in `index.html` + `_headers`; image existence verified at the browser level).
- **NFL Trending board** — reuses the leaderboard panel pattern. Sleeper trending add/drop (real 24h counts across fantasy leagues) as honest "Trending Adds / Trending Drops" panels. This is not fabricated stat leaders — it's labeled for what it is.

**Why not fake it:** consistent with D-013 (no ToS-violating scraping) and the owner's "no cutting corners" rule — we ship what real, validated data supports and name it accurately, rather than inventing offseason stat leaders.

**Deferred (follow-ups in ISSUES):** true NFL stat leaders + a real player-detail page, both gated on standing up the ESPN **core-API** proxy (new host, allowlist, payload validation) and the season actually being underway.

**Nav:** NFL sub-nav is now Players · Trending · Scores · Standings · | · Teams · Mock Draft. Routes `nfl-players` → `loadNFLPlayers()`, `nfl-leaders` → `loadNFLLeaderboards()` (trending).

---

## D-016 — NFL Real Stat Leaders via ESPN Core API (server-resolved)
**Status:** shipped (pending push) — owner direction 2026-06-15 ("keep building toward NFL fully built out")
**Contributors:** owner, Relay, Axiom, Finn

**Goal:** real NFL statistical leaders (passing/rushing/receiving yds & TDs, receptions, sacks, INT), the marquee piece D-015 deferred.

**Data finding (Relay, validated via web_fetch):** ESPN's *core* API (`sports.core.api.espn.com/.../seasons/{Y}/types/2/leaders`) returns every category, but each athlete/team is a `$ref` URL (no inline names). The `byathlete` endpoint returned nothing usable. Joining ESPN athlete ids to Sleeper's `espn_id` only covered ~50% of top leaders — too lossy. Each athlete `$ref` *does* resolve to inline name/headshot/position in one hop.

**Decision (Axiom):** new Pages Function `functions/api/nflstats.js` fetches the leaders list once, then resolves the top-5 unique athletes per category server-side (Promise.all, ~30 unique, under Cloudflare's 50-subrequest cap), maps ESPN team-id→abbr from a static table, and returns a compact ready-to-render payload. Same-origin, so no CSP change; headshots are `a.espncdn.com` (already allowed). Heavy cf cacheTtl (6h leaders / 24h athletes) since season stats are static. Season auto-detects (Sep+ = current; else last completed → 2025 now); `?season=` overridable.

**IA change:** NFL sub-nav now splits **Leaders** (real stats, `nfl-leaders` → `loadNFLStatLeaders`) from **Trending** (fantasy add/drop, moved to `nfl-trending` → `loadNFLLeaderboards`). Bottom-nav (mobile) = Players · Leaders · Scores · Standings · Draft.

**Deferred:** per-player game logs / stat lines on the player-detail page (same core-API athlete `statistics` ref — next iteration); ~~⌘K NFL search~~ (shipped — players, then teams via N-2, 2026-06-21); mobile menu-panel per-sport swap.

---

## D-017 — NFL Historical / Multi-Season Support
**Status:** in progress — owner direction 2026-06-15 ("use historical data... go as far back as possible, like MLB")
**Contributors:** owner, Relay, Finn

**Direction:** make NFL data multi-season — browse past seasons and be ready for the upcoming year, like the MLB season selector.

**Data (Relay, validated):** ESPN core-API leaders return full data back to at least 2000 (verified 2000/2024/2025). Per-player game-log season options are the player's career span (ESPN `filters.season.options`). `/api/nflstats` and `/api/nflplayer` already accept `?season=`; the season auto-detects the latest completed season (flips to the live season in September), so "prepare for the upcoming year" is automatic.

**Shipped:** NFL Leaders season selector (2000 → latest), re-fetches + caches per season. Next: season-aware player stat line + game logs.

---

## D-018 — NFL Market-Competitive: Advanced Metrics via nflverse (Next Gen Stats)
**Status:** in progress — owner direction 2026-06-15 ("get NFL market-competitive"); priority order: advanced metrics → projections/rankings → charts → comparison
**Contributors:** owner, Relay, Axiom, Kael, Vera, Finn

**Goal:** make "serious stats / hidden layers" real on NFL — the brand promise was thin (basic box scores) vs. MLB's Savant percentiles.

**Data (Relay, verified):** **nflverse** data is **CC-BY-4.0** (open, commercial use OK with attribution) — lowest-risk option, consistent with D-013 (no scraping). Next Gen Stats published as small per-season/per-type gzipped CSVs (`ngs_{year}_{passing|receiving|rushing}.csv.gz`, ~40-120KB, back to 2016). Join: Sleeper's own IDs are too sparse (gsis_id ~25%, espn_id ~33%), so we match by normalized **name + team** against NGS `player_display_name` (both authoritative sources).

**Shipped (advanced metrics):** `functions/api/nfladv.js` — fetches the season+position NGS gz, gunzips (DecompressionStream) + parses server-side, finds the player, and computes **league percentile ranks** among qualified players per metric (Savant-style 0-100). Per position: WR/TE = separation, YAC-over-expected, aDOT, air-yards share, cushion, catch%; QB = CPOE, time-to-throw, aggressiveness, completed air yards; RB = RYOE/att, rush% over expected, efficiency, time-to-LOS. `_loadNFLAdvanced` renders an "Advanced · Next Gen Stats" card with percentile bars (red=elite) on the player detail, above the season stat line. Attribution shown ("Data via nflverse NGS, CC-BY"). Skill positions only.

**Architecture (Axiom):** same Pages Function + edge-cache pattern, no new infra. NGS files static post-season (cache 12h covers in-season weekly refresh).

**Next:** projections/rankings, then charts (reuse MLB), then NFL comparison (reuse MLB compare).

---

## D-019 — NFL Data Foundation: edge-cache from upstream (no D1), unified season model
**Status:** decided + shipped — owner 2026-06-15 ("strong NFL foundation, reference all past data, ready for the upcoming season")
**Contributors:** owner, Relay, Axiom, Folio

**Decision:** NFL stays **edge-cached from upstream** (ESPN / Sleeper / nflverse via Pages Functions + Cloudflare cache) — **no D1 persistence layer** for NFL for now (unlike MLB). Rationale: the upstream sources already cover all historical depth we need (leaders 2000+, stats/logs any season, NGS 2016+), cf-caching is fast + free, and a D1 archive adds ingestion/ops weight without a current need. Revisit only if upstream reliability or query needs change.

**Foundation shipped:** unified season model in `js/nfl.js` (`NFL_STATS_SEASON` / `NFL_FANTASY_SEASON` / min-season constants) replacing all hardcoded year strings (player-detail label, fantasy outlook, offseason copy) so the 2026 rollover is automatic and coordinated. Data source→coverage map documented in CLAUDE.md ("NFL Data Foundation"). Transition is automatic: season model flips in September, ESPN live endpoints populate, offseason empty-states clear.

**Next (D-018 roadmap):** projections/rankings, charts (reuse MLB), NFL comparison (reuse MLB compare).

---

## D-020 — NFL Historical / Retired-Player Stats (ESPN-id player path)
**Status:** decided (owner 2026-06-15: "we def want historical stats… ensure best data practices"); build pending priority
**Contributors:** owner, Relay, Axiom, Cipher, Vera, Kael, Folio

**Goal:** make SportStrata an all-time NFL stats destination — look up ANY player (retired or current), not just the current Sleeper roster.

**The ceiling today (Relay):** player detail is keyed on Sleeper `player_id`, and `/api/nflplayer`'s stat bridge needs a *current* team roster — so retired players (Calvin Johnson, prime Peyton) can't be found or shown. The stats spine, though, is already ESPN-athlete-id-based: `/api/nflcareer` and `/api/nflgamelog` resolve by ESPN id and work for retired players (verified: Calvin Johnson id 10447 → 2007–2015 career, 11,619 rec yds).

**Decision (Axiom):** add an **ESPN-athlete-id player path** alongside the Sleeper path:
- `/api/nflsearch?q=` — ESPN `search/v2`, filtered to NFL (`l:28`) athletes; returns {espnId, name, lastTeam, headshot, active}.
- An ESPN-id detail route (e.g. `nfl-player-espn-{id}`) rendering profile + **career table** + **game logs** + advanced (NGS, 2016+ only) — all keyed by ESPN id, no roster bridge. Reuses the existing detail components.
- ⌘K search: when the local Sleeper pool has few matches, query `/api/nflsearch` for an "All-time players" section so retired players surface.

**Best data practices (Cipher/Relay) — explicit guardrails:**
1. **Public APIs only** — ESPN public JSON (D-013 clean) + nflverse (CC-BY). No scraping, no auth/cookie endpoints.
2. **Attribution** — "Source: ESPN" / "Data via nflverse" stay on rendered historical data.
3. **Canonical key** — ESPN athlete id is the spine for historical; Sleeper id remains for current/fantasy. Don't conflate the two id spaces.
4. **Cache by volatility** — retired/past-season data is immutable → long cf `cacheTtl`; cache hard to respect upstream rate limits (no per-keystroke search hammering — debounce + cache).
5. **No PII**, no compiling personal data; stats only.
6. **Graceful gaps** — pre-2016 has no NGS, older seasons fewer fields; empty cards clear cleanly (no fabrication).

**Gates before Finn builds:** Vera (search + all-time detail behavior/states), Kael (visual reuse), Axiom (ESPN-id route + dual-key model), Cipher (data-practice sign-off), Folio (data-map update).

---

## D-021 — Mock Draft: Interactive Drag-and-Drop Board (proposed)
**Status:** proposed — owner direction 2026-06-15 ("interactive and inviting… pull player tiles onto your board… think outside the box"); approach + priority pending
**Contributors:** owner, Kael, Vera, Axiom

**Direction:** turn the mock draft from a click-a-list tool into an interactive, inviting **draft-board** experience.

**Proposal (Kael/Vera):** a two-panel board — a **best-available tile pool** (player tiles: headshot, position-color, ADP, tier) on one side, **your roster board** (slots by position) on the other. **Drag a tile onto a slot to draft**; AI opponents auto-pick between your picks and their tiles animate off the pool. Layer the cues that make it feel alive: an "on the clock" indicator, snake-order visualization, positional-need highlighting on your board, tier breaks in the pool, and the existing **Monte Carlo "% to return"** surfaced right on each tile (will this player survive to your next pick).

**Outside-the-box hooks:** value-vs-ADP "steal/reach" flash when you draft; a live grade meter that ticks as your roster fills; auto-pick-best button for speed; post-draft shareable board image (reuse the html2canvas share-card pattern).

**Architecture (Axiom):** keep the existing draft engine (snake order, ADP-based AI, Monte Carlo in `js/fantasy.js`); rebuild only the UI as a DnD board using pointer events. **Mobile:** drag-and-drop degrades poorly on touch → keep tap-to-draft as the mobile path (the current interaction). No new data (Sleeper ADP, already clean).

**Open for owner:** (1) priority vs D-020; (2) confirm drag-and-drop-with-tap-fallback as the model.

## D-022 — Navigation IA: stable Scores · Stats · Tools · Fantasy spine (both sports)
**Status:** Accepted (owner-approved scope: "Categorize + align"). Vera (lead), Kael, Axiom consensus.

**Problem.** Nav was a flat, uncategorized run of 9–10 buttons with one cosmetic divider. Order differed across sports (Teams 3rd on MLB, 7th on NFL; Scores absent from MLB desktop row but present on NFL), forcing a re-scan on sport switch. NFL stacked Leaders + Rankings + Trending with no parent — three ranked-player lists users can't tell apart. No industry-standard grouping (Scores/Stats/Tools/Fantasy).

**Decision.** One stable cross-sport spine, identical order both sports, contents vary:
- **Stats** — Players · Leaders · Teams · Standings (identical both sports)
- **Fantasy** (NFL only) — Rankings · Mock Draft · Trending (the grouping disambiguates them from stat Leaders)
- **Tools** — Compare · Builder · Prep · Arcade (MLB) / Compare (NFL)
- **Scores** — the always-present ticker SCORES button is the canonical desktop scores entry for BOTH sports (honors the prior MLB decision to keep Scores out of the sub-nav). Bottom nav + menu keep an explicit Scores item.

Desktop sub-nav: flat row with small uppercase group labels acting as separators (replaces the single divider). Mobile menu: same spine with section headers. Mobile bottom nav: identical across sports — Scores · Players · Leaders · Standings · **More** (More opens the existing menu panel).

**Also fixes a latent bug:** the ticker SCORES button was hardcoded `data-view="mlb-games"`, so on NFL it navigated to MLB scores. Now `_applySportUI` sets it per sport.

**Scope deliberately excluded** (offered, owner chose the lighter option): dropdown/mega-menu parents; section landing pages (Stats/Fantasy hubs); detail-page breadcrumbs. Revisit if a 3rd live sport lands.

### Three gates (recorded for the implementation)
- **Vera (behavioral):** group labels are non-interactive (`role="presentation"`, not focusable, not in tab order). Active-state sync unchanged (still `.nav-tab[data-view]`). More button toggles the menu panel; Escape + outside-click + item-tap still close it. Bottom-nav order stable across sports so muscle memory holds.
- **Kael (visual):** group labels = 0.6rem uppercase `--text-subtle`, left-border separator, first label borderless. Menu section headers span full grid width with a bottom rule. No new colors; reuses existing tokens.
- **Axiom (feasibility):** config-only data changes + 3 render-fn tweaks + 1 `_applySportUI` line + `_openMenu()` helper + bottom-nav More handler with `stopPropagation` (avoids the document close-handler race). No routing changes; `.nav-tab`+`data-view` contract intact.

## D-023 — nfl.js module split — recommendation: defer (proposed 2026-06-21)
**Owner:** Axiom | Backlog ref: N-8

**Question:** `js/nfl.js` (~1,440 lines) covers teams, scores, standings, players, leaders, rankings, trending, compare, player/team detail, career, game log, advanced, and the offseason helpers. Split it?

**Recommendation: do NOT split yet.**
- No module system — files share global scope via ordered `<script>` tags. A split buys no encapsulation; it only adds another load-order dependency to maintain in `index.html` + `sw.js` STATIC_ASSETS.
- ~1,440 lines is far under `mlb.js` (~9k). Size isn't the pain; the *inline-style sprawl* (N-5) is, and a split wouldn't fix it.
- For a single maintainer the split's upside (smaller blast radius) is outweighed by the load-order risk.

**If/when we revisit** (≈2.5k lines, or fantasy grows): cleanest seam is the **fantasy surface** — `js/nflFantasy.js` for Rankings + Trending + Mock Draft + the Sleeper pool helpers (`fetchNFLSleeperPool`, `_nflPool`, ADP), leaving stats/scores/standings/detail in `nfl.js`. Fewest cross-references. Load after `nfl.js`, before `app.js`; update the `index.html` chain and `sw.js` STATIC_ASSETS together.

**Decision:** N-8 closed as "won't do now." Prioritize N-5 (inline→classes), which addresses the real maintainability cost.

## D-024 — News / "what's happening" feed (injuries, hot players) — PROPOSED (brainstorm)
**Raised by:** owner | Recorded by: Finn | Date: 2026-06-21 | Status: proposed — needs owner direction

**The question:** with NFL added, users want to know who's hurt, who's hot, what's the latest. Two sources floated: (a) a news API, or (b) reading the X/Twitter feeds of pundits (e.g. Ian Rapoport for NFL + an MLB equivalent).

**Relay (data/API):** ESPN already gives us a clean, free, no-auth news feed on the host we proxy — `site.api.espn.com/apis/site/v2/sports/{football/nfl|baseball/mlb}/news`. Verified live (NFL): `articles[]` with headline, description, image, byline, published timestamp, links, and league/team/athlete tags — so a feed can be scoped to a team or even a player by filtering tags. MLB is the same endpoint shape. There are also `/injuries` endpoints, and we already pull NFL `injury_status` from Sleeper. "Who's hot" is largely derivable from data we already have (Sleeper trending add/drop; MLB/NFL leaders). Net: a feed needs ~1 new Pages Function. **X is the opposite:** its API is paid (and pricey), automated reading/scraping of accounts violates ToS, and account-reading is brittle and legally exposed. Strong recommend ESPN; avoid X.

**Cipher (security):** any external text is untrusted → `_escHtml` every field, never inject raw HTML, and if we ever LLM-summarize, treat it as a prompt-injection surface. Show headline + description + attribution + link-out (don't republish full articles → copyright-safe). X scraping adds ToS/legal risk and credential handling on top. Hard no on scraping X; ESPN's public, attributed API is the low-risk path.

**Vera (UX):** job-to-be-done — "what's the latest on my team / players, who's hurt, who's hot." Glanceable and scoped: a league feed, a team-news section on the team page, player news on player detail. Injuries deserve a distinct scannable treatment, not buried prose. "Hot" should lean on existing trending/leaders, not narrative. Full states (loading skeleton / empty / error); links open out (new tab, `rel=noopener`). News complements stats — don't bury them.

**Kael (visual):** news cards in the existing system — thumbnail, headline, source/byline, relative timestamp ("2h ago"), team-color tag. A compact "Latest" rail on home + team pages. Tokens only; brand accent on the section title.

**Axiom (feasibility):** one Pages Function `/api/news?sport=&team=` proxying ESPN `/news` (+ optional `/injuries`), edge-cached SHORT (~10m), per D-019 (no auth, no D1). Client `loadNews()` + a render module. Injuries = ESPN injuries ∪ Sleeper status; "hot" = reuse trending/leaders. Effort: small–medium.

**Recommendation:** build the feed on **ESPN's news API**, decisively over X. Phase it: (1) league news feed + team-scoped news on the team page; (2) injuries surface (ESPN ∪ Sleeper); (3) "hot" via existing trending/leaders. Republish only headline + blurb + attribution + link (copyright-safe). Do **not** scrape or read X (ToS, cost, legal, security).

**Confidence flags:** ESPN MLB `/news` is the same documented pattern as the verified NFL endpoint but wasn't fetched here (egress-blocked) — confirm at build. X API pricing/ToS specifics move fast; the "paid + no-scraping" constraint is longstanding but verify current terms before any X path is reconsidered.

**Open questions for owner:**
1. Where should news live — a dedicated "News" nav item, a home rail, team-page sections, or all three?
2. Is ESPN's insider roster (Schefter et al.) acceptable, or is a *specific* pundit voice (Rapoport) a hard requirement? Only the latter forces the X path (and its costs/risks).
3. First scope: league-wide, team-scoped, or player-scoped?

**Phase 1 shipped 2026-06-21 (Finn):** ESPN-backed league news, no X. New `functions/api/news.js` (`?sport=nfl|mlb` proxy, edge-cached 10m) + `js/news.js` + a sport-aware **News** view (sub-nav + mobile menu, both sports). Cards show headline + blurb + image + byline + relative timestamp and link out to ESPN in a new tab (copyright-safe). CSP unchanged (same-origin proxy; `a.espncdn.com` images already allowed). Open: team-scoped news on team pages, an injuries surface (ESPN ∪ Sleeper), and a "hot" rail (reuse trending/leaders).

## D-025 — Competitive NFL player-data display (Savant-style percentile profile) — PROPOSED
**Raised by:** owner | Recorded by: Finn | Date: 2026-06-21 | Status: proposed — needs owner direction

**The question:** MLB player pages show a Savant-style "Key Metrics" percentile-slider profile (P3-028). How do we present NFL player data to compete with the big stats sites?

**What we already have:** NFL player detail has an "Advanced · Next Gen Stats" card (D-018, `_loadNFLAdvanced` → nflverse NGS) with percentile bars — but it's a simpler bar (no numbered bubble), skill-positions only, narrow metric set. MLB's `.pct-row` component (track + fill + numbered bubble, diverging blue→gray→red, red=elite) is more polished and computed client-side from the qualified pool.

**Relay (data):** percentiles need a *pool*. MLB derives them client-side from `mlbLeaderSplits`; NFL already has nflverse powering `/api/nfladv` with server-side percentiles among qualified players — extend that to a broader, position-curated metric set (NGS + standard season stats) rather than re-deriving on the client. nflverse covers 2016+; pre-2016 degrades to raw values. No new vendor needed (nflverse + ESPN + Sleeper already in place).

**Kael (visual):** unify on ONE percentile component — promote MLB's `.pct-row`/`.pct-track`/`.pct-bubble` sliders to a shared, sport-agnostic component and have NFL adopt it (replacing the simpler advanced bar). Same diverging scale (red = elite). A "Key Metrics" card per position, grouped (Efficiency / Volume / Advanced). A radar/spider chart could echo competitors, but sliders scan cleaner — recommend sliders as the hero, radar deferred.

**Vera (UX):** position-aware metric sets (ties into N-12) so the page shows only what matters. Always label the qualified pool + sample size + "red = elite" for trust. States: loading skeleton, graceful fallback to raw values when sample/era is thin (pre-2016), error. Keep the season counting-stat line separate from the percentile Key Metrics; link out to source.

**Axiom (feasibility):** mostly reuse — the `.pct-*` CSS already exists. Extend `/api/nfladv` (or add `/api/nflmetrics`) to return a curated per-position metric set with percentiles; client renders via a shared `_pctRow` helper. Edge-cached per D-019. Effort: medium (server metric curation is the bulk).

**Per-position metric sets (draft):**
- QB — Pass YDS, TD, Comp%, CPOE, YPA, Passer Rtg, Time-to-Throw, Air Yards/Att, Sack%, INT%
- RB — Rush YDS, YPC, Rush Yds-Over-Expected, TD, Broken Tackles, Rec, YAC, Efficiency
- WR/TE — Rec, YDS, TD, Target Share, Separation, YAC-over-expected, Catch%, Air Yards
  (all available from nflverse NGS + season stats)

**Recommendation:** (1) promote MLB's percentile slider to a shared component; (2) build an NFL "Key Metrics" card using it — position-curated, powered by the extended nflverse endpoint; (3) keep the season line + game log as-is. This matches Savant's hallmark, beats most free sites (NGS depth behind clean sliders), and unifies MLB + NFL on one component. Radar deferred.

**Open questions for owner:**
1. Slider profile as the hero (recommended), or add a radar/spider chart too?
2. Metric depth — fantasy-relevant only, or full NGS depth?
3. Build now, or after the D-024 news feed?

## D-026 — Navigation IA v2: category dropdowns + scalable multi-sport switcher — ACCEPTED (build)
**Owner-approved 2026-06-21:** "more sports coming" + "full category-dropdown reorg now." Supersedes the deferred scope of D-022 (which parked dropdowns/hubs until a 3rd live sport). Vera (lead), Kael, Axiom.

**Why now.** Owner confirmed NBA/NHL (and possibly NCAA) are on the roadmap — the trigger D-022 named. The flat per-sport run of ~10 buttons mixes object types (Players/Teams), analytics (Leaders/Stats), fantasy (Rankings/ADP/Mock Draft) and tools (Compare); it won't scale to N sports.

**Sport switcher = primary context.** Promote from the small filter-style pill to the primary "what am I browsing" control: a prominent segmented switcher, **data-driven from a `SPORTS` config** (one entry per sport). Only *functional* sports show — MLB, NFL today; **NBA gated until P1-006 (BDL key) is restored, NHL until promoted from preview** (don't surface broken sport tabs). Switching sport swaps the secondary nav + search context.

**Top-level categories (parents); contents vary by sport, identical order:**
- **Players · Teams · Standings · News** — direct
- **Analytics ▾** — Leaders, Compare, (MLB: Builder, Prep)
- **Fantasy ▾** (sports that have it; NFL today) — Rankings, Mock Draft, Trending
- Scores stays on the ticker SCORES button (per D-022)
Deferred until they have real content: an **Explore** hub, a sidebar, section landing pages. No empty "coming soon" menus (no Trade Analyzer/DFS/Projections/Sleepers stubs).

**Behavioral spec (Vera):** parents with children open a dropdown (click + desktop hover) with `aria-haspopup`/`aria-expanded`, `role=menu`/`menuitem`, keyboard support (Enter/Space/Arrow/Esc, focus handling, click-outside close); a parent reads active when one of its children is the active view. Direct categories navigate immediately. **Mobile pattern unchanged** — the menu-panel already groups by section (the mobile equivalent of dropdowns); bottom-nav unchanged. Active-state still keys off `.nav-tab[data-view]`. Search placeholder becomes sport-aware on the header box and the ⌘K modal.

**Visual spec (Kael):** prominent segmented switcher (brand-accent active); category parents styled like current sub-nav items with a caret where a menu exists; dropdown panel reuses menu-panel/card tokens; no new colors; **3-row header height preserved** (switcher stays in row 1 — no new row, so JS scroll offsets are untouched).

**Feasibility (Axiom):** data-driven configs (`SPORTS`, category-grouped sub-nav) + a dropdown render/controller in `navigation.js`; switcher binding moves to event delegation (was direct-bound) so N sports work. `.nav-tab`+`data-view` contract and 3-row header intact. **Phased build to contain blast radius (nav is the backbone):** P1 — scalable prominent switcher + context-aware search (no structural change); P2 — desktop category dropdowns; P3 (deferred) — Explore/sidebar/hubs. Each phase = own commit + `/screenshot` verify.

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. **P1 shipped 2026-06-21** (this commit). P2 next.

## D-027 — Mock Draft "next level" (differentiator) — ACCEPTED + SHIPPED 2026-06-21
**Owner:** "set us apart from other NFL fantasy/stat sites; take the mock draft to the next level" — picked all four upgrades. Vera/Kael/Axiom/Relay. Supersedes the spirit of D-021 (drag-drop board proposal).

**Shipped (all client-side in `js/fantasy.js` + `.md-*` CSS):**
- **Draft Assistant** — real-time recommended pick + one-line reasoning blending value-vs-current-pick, lineup-aware need, tier scarcity, and Monte-Carlo survival; shown as a banner + ★ on the row. The standout differentiator (builds on the MC few free tools have).
- **Tiers + cliffs** — per-position ADP-gap tiers; list shows the tier and "N left in tier" with cliff urgency.
- **Format awareness** — Superflex (2-QB) + scoring (PPR/Half/Standard) now actually shift value, AI behavior, and needs via a documented position-multiplier heuristic; lineup-aware needs (starters → FLEX → bench). Previously scoring was a dead control.
- **Full draft board** — Players/Board toggle; all-teams × rounds snake grid with your column highlighted; also viewable post-draft.
- **Deep post-draft analysis** — projected finish vs league, positional-strength rank, best value / biggest reach, lineup-gap check (the old letter grade is kept as a sub-stat).

**Data reality (Relay):** Sleeper ADP only → tiers/value/need/Monte-Carlo are real; scoring/Superflex value is a labeled heuristic weighting, not fabricated projections. Future: a ToS-clean projections source would upgrade value/VORP. Verify on the `nfl-mock` route.

## D-028 — Competitive edge: value-based drafting (VORP) — ACCEPTED, building
**Owner:** "we need this to be a competitive tool that gives users an edge." Chose: transparent model now; build the VBD value engine + mock-draft integration, a Draft Kit/Rankings page, and Strength of Schedule. Vera/Kael/Axiom/Relay.

**Data (Relay — confirmed live):** no clean public *forward* projections, so we model from last-season production, transparently. `/api/nflfp` pulls nflverse `stats_player_reg_{season}` — **confirmed current (2025)** via `?debug=1`, with a real `games` column + opportunity metrics (target_share, air_yards_share, wopr) — and computes PPR/Half/Standard server-side. Labeled as "last-season production, projected," never as proprietary projections.

**Value engine (shipped):** `_vbd*` in `js/fantasy.js` — project (per-game × 17, format-aware) → **VORP over positional replacement** (baseline scales with teams + Superflex). Decoupled from the endpoint's upstream naming via `/api/nflfp`'s fixed output shape.

**Mock draft (shipped):** opponents still draft to ADP (the crowd); the user's **Draft Assistant now factors VORP** (the edge) and its reasoning leads with "+N pts over replacement," and the player list shows a **VORP column** (green = positive value). Graceful: if nflfp is unavailable, it falls back to the ADP-only behavior.

**Draft Kit (shipped 2026-06-21):** standalone `nfl-draftkit` view (Fantasy dropdown) reusing the engine — value board (proj pts, VORP, tier, ADP), **Sleepers/Traps** (largest VORP-rank vs ADP-rank gaps), scoring/Superflex/teams/position controls, and a Print cheat-sheet button. Unmatched (rookie/no-2025) players list by ADP below the valued board.
**SOS (shipped 2026-06-22):** standalone `nfl-sos` view (Fantasy dropdown) + `functions/api/nflsos.js` + `js/sos.js`. Joins last season's fantasy points allowed per game by each defense (nflverse weekly, CC-BY) onto the upcoming ESPN schedule; ranks 1 (easiest) – 32 (toughest) by position (QB/RB/WR/TE) and overall, across the full season and the fantasy-playoff window (weeks 15–17). Heatmap grid, sortable by position, with a season/playoff split toggle. All three D-028 features (value engine, Draft Kit, SOS) now shipped.


## D-029 — NFL standings: revive + multi-season + compete — SHIPPED 2026-06-22
**Trigger:** "users should still be able to view standings from previous years... compete with industry-standard NFL standings pages; keep MLB synergy but don't be limited by it."
**Finding:** the old NFL standings read site.api.espn.com/.../standings, which ESPN reduced to a dead `fullViewLink` stub — so standings were broken in-season too, not just offseason. Root-cause fix, not just a history add-on.
**Shipped (Relay/Vera/Kael/Axiom/Cipher):** new `functions/api/nflstandings.js` proxy to the working `site.web.api.espn.com` standings feed (season-parameterized, 2002+; past seasons immutable -> 7-day edge cache, live season 30m). New `js/nflStandings.js` + `css/nflStandings.css` **redefine** loadNFLStandings/displayNFLStandings/fetchNFLStandings (loaded after nfl.js; the nfl.js versions are now dead). Features: season selector back to 2002; **Division view** (default, MLB-synergy cards) + **Conference playoff-seeding view** (1–N with a season-aware cut line: 7 seeds 2020+, 6 before); seeds computed from ESPN or via NFL rule (4 division winners over wildcards, tiebroken by win%/diff); seed + division-winner badges, point-differential bars, Super Bowl champion/runner-up tags (static map 2002–2025, canonical-abbr matched); a **mini playoff bracket** (wild-card seed pairings + byes + the Super Bowl result). Default season = last completed (`NFL_STATS_SEASON`), so the page is alive year-round — supersedes the standings offseason empty-state from P3-029. SW v42 -> v43.
**Open:** real playoff-round results inside the bracket (currently seed pairings + final); team-page links use ESPN abbr (WAS->WSH handled).
**Update 2026-06-22 (postseason + team colors):** Bracket now shows **real postseason results** — `js/nflStandings.js` `fetchNFLPostseason()` pulls ESPN `seasontype=3` weeks 1/2/3/5 (Wild Card → Divisional → Conference → Super Bowl; the wk4 Pro Bowl is filtered by a real-team check), and `_nstdRealBracket()` renders a full AFC-left / NFC-right bracket with seeds, scores and winners (losers dimmed, SB champion tagged). Falls back to the seed-pairing preview for any season without results. Separately, NFL player cards + profile avatars now use a curated **team color** (`getNFLTeamColor()` in `js/nfl.js`) instead of the position color; the position chip stays position-colored. SW v44 -> v45.

## D-030 — Live game day (pre-season build) — SHIPPED 2026-06-22
**Trigger:** "build out live aspects for when the season comes around — live score viewer, live game blinking on the banner — drawing from MLB."
**Shipped:** new `js/nflLiveGame.js` + `css/nflLiveGame.css` — a clickable **NFL live game viewer** (`nfl-game-{id}` route): linescore by quarter, live possession / down & distance / last play, scoring-play feed, team-stat comparison, and passing/rushing/receiving box score; polls `/api/nfl?path=/summary&event=` every 20s while a game is in progress, self-stops on leave/final. Extended the `/api/nfl` allowlist with `summary` (20s TTL). The ticker is now sport-aware end to end: NFL items blink via `ticker__item--live`, a 60s `setupNFLLivePolling` loop refreshes scores + ticker when NFL is the active sport (switchSport already repopulates on switch), and ticker clicks open the specific game's viewer. The NFL Scores page now groups **live games first** under a "LIVE NOW" header (game-day rail). Game cards are clickable into the viewer. SW v45 -> v46.
**Verification caveat:** offseason, so blink/poll/possession validate against live data in September; rendering verified against completed games (linescore, scoring plays, box score).

**Update 2026-06-22 (postseason + team colors):** Bracket now shows **real postseason results** — `js/nflStandings.js` `fetchNFLPostseason()` pulls ESPN `seasontype=3` weeks 1/2/3/5 (Wild Card → Divisional → Conference → Super Bowl; the wk4 Pro Bowl is filtered by a real-team check), and `_nstdRealBracket()` renders a full AFC-left / NFC-right bracket with seeds, scores and winners (losers dimmed, SB champion tagged). Falls back to the seed-pairing preview for any season without results. Separately, NFL player cards + profile avatars now use a curated **team color** (`getNFLTeamColor()` in `js/nfl.js`) instead of the position color; the position chip stays position-colored. SW v44 -> v45.

## D-031 — Accounts, retention & monetization foundation — ACCEPTED, NOT STARTED (specs first)
**Trigger:** "to compete we need logins → retention → monetization; slow-walk it to be safe and do it right."
**Decisions (z man):** (1) **Auth stack:** Cloudflare-native — Cloudflare D1 + a vetted library, leading candidate **better-auth** (D1-first; email/OAuth/magic-link/passkey/2FA built in), fallbacks Cloudflare `workers-oauth-provider` or `jose`+KV. We do NOT hand-roll crypto or store raw passwords. (2) **Monetization (later):** **freemium** — reference/analytics stays free; a paid tier eventually unlocks the fantasy edge (league sync, projections, alerts, advanced tools). (3) **Phase 1 scope:** **auth foundation only** — accounts + followed teams/players + preference sync. No payments, nothing gated, no notifications yet. Harden + security-review, then layer monetization in a later decision.
**Hard boundaries:** assistant scaffolds integration only; the project owner owns all provider accounts/keys (set via `wrangler secret`, never in source) and performs anything touching real credentials or money. Payments (future) route through a provider (e.g. Stripe); we never move funds or handle card/credential data.
**Architecture shift to ratify (Axiom):** this is the first real per-user backend. Pages Functions gain npm dependencies + a session layer (today they're zero-dep). Workers are stateless per request → re-instantiate auth per request. Front end stays vanilla; sign-in is additive. Confirm whether this introduces a Functions build step and document it.
**Prerequisite:** P1-006 verified already resolved (`js/api.js` `BDL_API_KEY=''`, `BDL_PROXY_URL` set) — CLAUDE.md is stale and should be corrected. Carry the secrets-hygiene discipline into auth.
**Gates — Finn does not implement until ALL exist in ISSUES.md:** Cipher (threat model + session/CSRF/rate-limit/secret spec), Relay (D1 schema + data export/hard-delete + retention), Axiom (better-auth-on-Workers/D1 feasibility incl. session-refresh bug #4203), Vera (optional non-blocking auth flow + all states), Kael (on-brand sign-in surface), Folio (privacy policy, ToS, cookie consent, GDPR/CCPA data-rights). Status: all PENDING.
**Synthesis:** the product is feature-rich but identity-less and silent — accounts + follows are what convert good pages into a daily habit and unlock the league-aware fantasy tools that are the most defensible differentiator. Build the foundation slowly and correctly; monetize only on top of a hardened, reviewed base.

**D-031 update 2026-06-22 (Axiom spike):** open questions resolved — passkeys + Google OAuth + email magic-link at launch (no passwords; Apple deferred); CSP nonce migration is a fast-follow required before any paid tier; preferences stored as a JSON blob; minimal login audit in Phase 1. Library: **better-auth** on D1 (verify session bug #4203), per-request instantiation, catch-all `functions/api/auth/[[route]].js`, separate `USER_DB` binding. **Ratify:** Functions gain npm deps + a CI bundle step (front end stays buildless). See docs/auth-feasibility-spike.md. Remaining gates: Vera/Kael, Folio.

**D-031 update 2026-06-22 (email provider):** transactional email (magic-links) → **Resend** now — Cloudflare's recommended HTTP API, native to Workers, mature deliverability, free 3k/mo, scales. MailChannels' free Workers path ended Aug 2024; Cloudflare's own Email Service is only public-beta (Apr 2026) so it's not trusted for auth-critical mail yet. Email is abstracted behind one `sendEmail()` helper to migrate to Cloudflare Email Service at GA without touching auth. Domain auth (SPF/DKIM/DMARC on sportstrata.cc) required. Owner setup steps: docs/auth-setup-runbook.md; D1 schema migration: migrations/0001_user_schema.sql. Phase-1 gates all DRAFTED; implementation (Finn) starts once dev secrets/DB exist.

## D-032 — MLB accuracy hotfix: self-healing wRC+ constants, IP-thirds FIP, stat test harness — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 2). Verified in source: it is the 2026 season and `_computeBattingRates` was silently computing wRC+ with **2024** guts constants (`_MLB_WRC_CONSTANTS` had no 2026 entry → fallback), and FIP parsed `inningsPitched` with `parseFloat`, reading "100.2" (100⅔) as 100.2.
**Shipped (Relay design, Axiom implementation):**
- `_ensureWrcConstants(season)` (mlb.js) — for any season without a static entry, derives `lgwOBA` + `lgR/PA` from MLB Stats API league hitting totals (`/teams/stats`, 30-team sum, DAILY cache) using the **same 2024 linear weights as player wOBA** — self-consistent by construction. `wOBAscale` carried from the latest static year. Derived entries marked `{ derived: true }`; awaited in `fetchMLBLeagueStats`, kicked off at boot and on season change. Fallback is now 2025 (latest static), and a fallback can never render undaggered.
- `_wrcDagger()` — single source of truth for the †: shown when constants are missing, derived, or preliminary (2025 flagged `preliminary: true`).
- FIP now converts IP thirds via the existing `_mlbIpToNum()` instead of `parseFloat`.
- **`tests/stats.test.js`** — first tests in the repo: `node --test tests/`, zero deps, loads mlb.js in a vm sandbox with browser stubs. Hand-verified fixtures for `_computeBattingRates` (ISO/BABIP/BB%/K%/RC/SB%/wOBA/wRC+), `_computePitchingRates` (FIP/K-BB%/LOB%/QS%), the IP-thirds conversion, the dagger rules, and the constants derivation (including the partial-league guard). Added to the pre-push checklist in CLAUDE.md.
- Park factors: still the 2022–2024 B-Ref averages — no fetchable feed, so refresh stays a manual owner/Relay pull. OPEN item in ISSUES.md; annual-maintenance note updated in GOALS.md.
**Verification:** `node --check` clean, 7/7 tests pass, NUL-byte check clean. SW v46 → v47.

## D-033 — /api/* proxy rate limiting — SHIPPED 2026-07-01 (dashboard rule pending owner)
**Trigger:** deep-review 2026-07-01 (initiative 3). Grep-verified: no rate limiting anywhere in `functions/api/` — the proxies were open relays to ESPN/Sleeper/MLB/nflverse (quota burn + upstream-IP-ban risk = full outage), and D-031 will put session endpoints next to them.
**Shipped (Cipher spec, Axiom implementation):** `functions/api/_middleware.js` — 120 req/rolling-minute per IP across all `/api/*` routes, 429 + `Retry-After`, OPTIONS exempt, bounded memory. Explicitly **best-effort** (per-isolate, per-colo) — abuse damping, not a hard quota. Client already degrades correctly (fetch failure → view error state + retry).
**Owner action pending:** one Cloudflare WAF rate-limiting rule (300/min/IP on `/api/*`, block 60s) as the real backstop — steps in `docs/ops-rate-limiting.md`.

## D-034 — Identity ratified: two-season barbell + no-login constitutional rule; GOALS.md v2; doc pruning — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 1). GOALS.md v1 contradicted the decision log on four axes (G4 vs D-031 accounts, G6 vs D-012 NFL beta, Non-Goals vs R4 DFS, R1–R5 vs everything).
**Owner decision:** SportStrata is a **two-season barbell** — MLB broadcast/desk reference in baseball months, no-login NFL fantasy edge tool in football months; shared spine of no friction, visible provenance, correct math. **Constitutional rule:** the no-login experience must never regress; accounts (D-031) are additive-only, forever. D-031 proceeds under that rule.
**Shipped (Folio):** GOALS.md v2 (vision, G4, G6 amended; R1–R5 retired and re-scoped to a single freemium-later paragraph consistent with D-031; annual-maintenance updated). CLAUDE.md truth-audit: stale P1-006 "critical bug" section replaced with resolved status + a standing **doc-sync rule** (shipping decisions must touch CLAUDE.md in the same commit when they change architecture/rules), script load-order corrected (five missing files), api.js key-file row fixed, tests added to the pre-push checklist. Superseded/contradictory docs archived to `docs/archive/` (fixit.md, suggestions.md, reflection.md) with an index README.
**Deliberately not decided here:** NBA/NHL fate (owner call, separate entry), arcade nav placement (Kael, with D-026 P2 work).

## D-035 — Draft HQ: fantasy research surface consolidated — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 6) + D-022's own diagnosis ("ranked-player lists users can't tell apart"). The NFL Fantasy dropdown had grown to five sibling destinations (Rankings, Draft Kit, SOS, Mock Draft, Trending) — four of them ranked lists of the same players.
**Status correction first:** D-026 P2 (desktop category dropdowns) was recorded here as "next" but had already shipped in `navigation.js` (`_toggleSubNavMenu` / `_closeSubNavMenus` / `_syncSubNavParents`, aria-complete). The doc-sync rule from D-034 exists for exactly this.
**Decision (Vera lead, Kael visual, Axiom feasibility — lightweight process per owner):** consolidate via a **shared "DRAFT HQ" strip**, not a wrapper view. Each member view renders the strip at the top of its own output (`_hqStrip(active)` in `fantasy.js`; Value Board · Rankings · Schedule · Trending · Mock Draft). Routes, deep links, breadcrumbs, and `.nav-tab[data-view]` active-state all keep working because the views keep their routes — zero new routes, zero host-element games with `#playersGrid`.
**Shipped:**
- `js/fantasy.js` — `_HQ_TABS` + `_hqStrip()`; strip on Draft Kit (`_dkRender`) and Mock Draft setup (`_renderMockSetup`; hidden during an active draft on purpose — immersion).
- `js/nfl.js` — strip on Rankings (`displayNFLRankings`) and Trending (`displayNFLTrending`), `typeof` guard (nfl.js loads before fantasy.js). Fixed a latent bug: the Trending loader set breadcrumb `nfl-leaders`.
- `js/sos.js` — strip on SOS.
- `js/navigation.js` — Fantasy dropdown collapsed to **Draft HQ + Mock Draft**; new optional `also:` field on sub-nav children keeps the parent lit for member views (`childViews` now includes it). Mobile menu Fantasy section likewise 2 tiles. View labels: "Draft HQ · Value Board / Rankings / Schedule / Trending".
- `css/components.css` — `.hq-strip` / `.hq-tab` (existing tokens only, full-width in grid contexts, print-hidden).
- CLAUDE.md test command corrected to `node --test tests/stats.test.js` (the bare directory form doesn't resolve on Node 22 here). SW v47 → v48.
**Verification:** `node --check` clean on all five touched JS files; 7/7 tests pass; NUL checks clean. Visual + interaction pass on the live deploy after push (offseason data renders all five views).

## D-036 — Rookie-inclusive value board: market-implied projections — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 4, deadline Aug 1). The VBD engine projects from last-season production, so the 2026 rookie class had no value, no VORP, no tier — relegated to an ADP-only afterlist below the board, and the Draft Assistant was structurally anti-rookie (rookies contributed zero VORP to its score). A value board that goes silent on the picks drafters agonize over most fails its core August use case.
**Decision (Relay design, Axiom implementation, Vera/Kael labeling — lightweight process):** **market-implied projection** for any player with ADP but no production join. `_vbdImplied(p, scoring)` prices the player off up to 3 production-projected ADP neighbors each side *at the same position*, inverse-distance weighted (`_vbdImpTable` caches per scoring format, invalidated on pool refetch). Transparent by construction: it is market pricing, never presented as a production projection.
**Honesty rules (the important part):**
- Every implied number is tagged — `est` chip on the name, `~` prefix on PROJ/VORP, muted/italic styling (`.dk-val--est`), explanatory `title` tooltips, and a provenance line in the Draft Kit header.
- **Sleepers/Traps exclude implied rows** — their value ≈ ADP by construction, so a gap signal from them would be circular.
- **Draft Assistant weights implied VORP at half** (0.03 vs 0.06): it stops rookies from being invisibly penalized without double-counting ADP as "edge". Its reasoning string says "~+N pts over replacement (market est)".
- Positions with <4 production-matched players (e.g. K) stay unvalued — no neighbors, no fabrication.
**Shipped:** `js/fantasy.js` (`_vbdImpTable`/`_vbdImplied`/`_mdVorp` fallback/`_mdVorpIsImplied`, `_dkBuild` implied rows, `_dkRender` tags, `_mdListHtml` + `_mdRecReason`/`_mdRecommend` est-aware), `css/components.css` (`.dk-est`, `.dk-val--est`), `tests/vbd.test.js` (implied-math fixtures). SW v48 → v49.
**Verification:** `node --check js/fantasy.js` clean; 12/12 tests pass (5 new VBD + 7 stat tests); NUL checks clean. Live verify after push: rookies with `est` chips in the value board, `~` VORP in the mock list, assistant "(market est)" reasoning.

## D-037 — /deploy-check becomes the de facto CI — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 7, cross-cutting finding X3): the buildless architecture's conventions (hand-maintained script chain, SW precache list, 14-theme token system, name-based joins) had no enforcement — and the very first run of the manifest checker proved the point: **`js/fantasy.js` and `js/sos.js` had been missing from `sw.js` STATIC_ASSETS since they shipped** (SW versions were bumped; the asset list wasn't). Fixed in this commit.
**Shipped (Axiom; Kael calibrated the theme contract; Relay the join probe) — three zero-dep Node tools + four new deploy-check steps:**
- `tools/check-manifest.cjs` — index.html ⇄ sw.js STATIC_ASSETS ⇄ disk, with a lazy-load exception list (math.min.js). Exit 1 on drift. Deploy-check #10.
- `tools/check-themes.cjs` — parses every `[data-theme]` block in variables.css (hex/rgba/var() resolution, alpha compositing over bg), checks WCAG contrast on the core token pairs (text-primary 4.5, text-secondary 4.5, text-muted 3.0, accent 3.0). Report-only until existing debts clear, then `--strict` gates; any NEW theme must pass clean. All 14 current themes pass the component-level thresholds. Deploy-check #11.
- `tools/join-health.cjs` — LIVE probe (run against the deployed site): Sleeper⇄nflverse veteran name-join rate among top-200 ADP skill players, rookies excluded from the denominator (legitimately unmatched). WARN <90%, FAIL <80%. Mirrors `_vbdKey` — keep in sync. Deploy-check #13, recommended weekly in-season.
- Deploy-check additions #9 (unit tests) and #12 (NUL-byte corruption scan on changed files — this working tree has a corrupted-write history).
**Verification:** manifest checker green after the sw.js fix; theme checker 0 errors / 14 themes; 12/12 unit tests pass; all tools `node --check` clean. Join probe validates against the live deploy after push.

## D-038 — Design & UX cohesion program (Kael + Vera live audit) — ACCEPTED 2026-07-02
**Trigger:** owner: "polished and cohesive across sports and aspects, not vibe-coded; theme viability; how to move forward with UX and design."
**Method:** live browser audit of sportstrata.cc (home, Leaders, player detail, Draft HQ, Mock Draft × dark/light/cc-braves) + source-level token scan of all JS render strings. Full findings with evidence: `docs/archive/design-review-2026-07-02.md`.
**Headline findings (all observed live):**
- **V1 CRITICAL** — Leaders → player click = "Player not found" (pool-dependent resolution; cold deep-links work — the click path must fall back to the deep-link fetch). The announcer's primary flow breaks on first contact.
- **V2 CRITICAL** — no `hashchange` handling: URL/state desync (player view with `#mlb-leaders` hash) and cross-sport chimera states (NFL ticker + MLB content + broken layout).
- V3 "Storage Disabled" toast false positive; V4 SP/RP/CL leaders panels bare "No data" mid-season (qualification bug + empty-state copy); V5 duplicate search on home.
- **K1** raw route ids ("nfl-draftkit") rendered as page titles (view-meta gaps); **K2** amber = live AND = Pirates on card borders (rule adopted: *border channel = identity, badge channel = state*); **K3** quantified inline-style debt: ~550 static inline styles + 28 hex-in-style across JS render strings (mlb 193, nfl 112, teams 58, playerDetail 48) — migrate per-view to component classes, NFL first, folded into the CSP nonce migration (touch each render string once).
- **D-036 follow-ups:** retired FA players get implied values (Gurley #31 est); trap-gap numbers absurd (-927); dk-board clips <~1150px.
**Theme verdict (Kael):** system stays as a bounded brand asset. Freeze at 13+default (re-affirms D-034); tighten `tools/check-themes.cjs` with composed-surface pairs until cc-braves' observed wash-out registers as errors (the 5-pair contract passes a theme the eye fails); manual per-theme pass against a fixed surface checklist; codified identity rule: **the wordmark never changes, the icon may**.
**What's right and protected:** player detail is the posture benchmark; leaders panels, Draft HQ strip, light mode, D-026 dropdowns all verified clean.
**Execution order (lightweight process):** Wave A "flow integrity" = V1, V2, K1, V4, V3, D-036 guards (all S). Wave B "visual rules" = K2 border/badge rule + V5 search de-dup. Track C (behind features) = theme contract tightening + inline-style→class migration with CSP nonce work. Mobile audit still owed (window-resize blocked during session).
**Gates:** lightweight per owner — Vera behavior-verifies Wave A on live; Kael reviews Wave B visuals; specs inline in the review doc.

**D-038 update 2026-07-02 — Wave A (flow integrity) SHIPPED:** V1 leaders→player click now falls back to the deep-link restore path on pool miss (fixes both the not-found and the hash desync — the happy path writes the hash); V2 popstate null-state routes through `_loadFromHash` instead of blindly going home (address-bar hash edits fire popstate → chimera states gone; no double-render since internal nav uses pushState); K1 `_NAV_META` fantasy entries added; V4 SP/RP/CL root-caused (Stats API position is always "P" — panels had been structurally empty since ship) and classified by role stats with IP-thirds minimums + threshold-naming empty copy; V3 root-caused as quota exhaustion → evict-and-retry, honest toast only on true failure; D-036 guards (FA-veteran exclusion, pool-relative gap ranks, dk-board min-width fix). 15 edits, 6 files + sw.js v50. 12/12 tests, manifest checker green. **Vera live-verify after push:** leaders→click on cold entry, address-bar hash edit cross-sport, SP/RP/CL panels populated, Draft Kit gaps sane.

**D-038 update 2026-07-02 — Wave B (visual rules) SHIPPED:** K2 — live state no longer claims the border channel: `.home-game-card--live` and NFL `.game-card--live` keep team-identity borders; liveness = badge pulse + `--shadow-live` glow (rule codified in CSS comments at both sites; MLB scores-view cards were already compliant). V5 — `renderCurrentView` toggles `body.view-home`; the header search button hides on home where the hero search is primary (⌘K everywhere). SW v50 → v51. Tests 12/12, manifest + themes checkers green. Live-verify: home with live games shows team borders + amber glow; header search absent on home, present on all other views.

## D-039 — AI without metered inference: three tracks — RATIFIED 2026-07-02 (owner: Track 1 built; Track 2c built; 2a/2b/Track 3 pending)
**Trigger (owner):** "make this site cutting edge using AI, while not having a usage API tied in to limit cost. Brainstorm."
**Framing principle (all seniors):** intelligence ships from three free places — **authoring time** (generated in subscription-covered sessions, committed as static data), **training time** (models fit offline, shipped as coefficient JSON), and **client time** (user's own compute). Nothing meters per user action, ever — one viral day must not decide the bill. No "AI-powered" labels on plain code (Kael: posture kill).

**Track 1 — "Ask anything" bar (natural-language stat queries, zero model).** Deterministic grammar parser over the existing stat engine, surfaced in the ⌘K overlay. The announcer's dream interaction; instant; free forever. *Gates drafted in ISSUES.md ("Ask Bar v1") — first deliverable on ratification.*
**Track 2 — Offline-trained, client-evaluated models.** (a) Rest-of-season projections trained on 2015–2025 history → coefficient JSON → replaces "last season × 17" in the VBD engine (the honest upgrade); (b) player similarity comps (z-scored stat vectors, cosine, client-side) on player cards + rookie "profiles like…" (patches D-036's weak spot); (c) MLB playoff odds via client Monte Carlo (mock-draft MC machinery pointed at the pennant race — mid-July flagship). Relay owns training-data contracts; Axiom the eval runtime.
**Track 3 — Authoring-time narrative.** Batch-generated broadcast blurbs for top ~300 players (weekly refresh via scheduled session → static JSON with generated-on provenance date — supersedes the undeployed F1 worker and its metered cost), draft-kit position primers, plus a template-NLG corpus (AP-recap tradition) for game recaps: LLM-authored templates, slot-filled client-side, zero inference.
**Explicitly deferred:** in-browser LLMs (WebLLM/transformers.js) — real but 100MB+ downloads, WebGPU-only, no-build tension. Revisit as an opt-in "Labs" only after Tracks 1–2 ship.
**Cipher note:** Track 1 is client-only parsing — the only new surface is echoing user input (escape via `_escHtml`, no innerHTML of raw query). Track 3 content is repo-committed and reviewed like code — no user-generated content path.
**Sequencing recommendation:** Track 1 first (highest edge-per-effort, deepens G3 announcer-readiness), Track 2b comps + 2c playoff odds next (July-timed), 2a projections before August draft season, Track 3 rolling behind.

## D-040 — The Front Door, the Thread, and the House Style — RATIFIED 2026-07-03 (owner: all three programs; sequenced per recommendation)
**Trigger (owner):** "consider landing pages, synergy across the site, and having a site dedicated theme/style."
**Framing (Kael lead, Vera + Axiom consulted):** these are one problem seen from three angles. The product now has genuinely strong rooms (player detail, Draft HQ, standings-with-odds, the Ask bar) but no designed *arrival*, no designed *connections between rooms*, and an identity that lives in tokens rather than in a written, enforceable style. Three programs:

### Program 1 — The Front Door (landing + arrival)
1a. **Seasonal home hero.** The home page doesn't know the calendar. One hero module driven by a small `SEASON_MOMENTS` config: pennant-race mode (Jul–Oct: October Odds movers + deadline countdown), draft-season mode (Jul–Aug NFL surface: Draft HQ CTA + days-to-kickoff), postseason/offseason modes. Barbell made visible on arrival. (Vera lead; S/M)
1b. **Static SEO landing stubs.** The SPA is hash-routed → Google effectively sees ONE page; every share link lands on generic OG tags. Ship 4 prerendered static pages — `/mock-draft.html`, `/draft-kit.html`, `/playoff-odds.html`, `/ask.html` — real copy, per-page OG image/meta, one CTA into the app route. No framework, no build step: 4 hand-held HTML files + `_headers` cache rules. This is the entire top of the acquisition funnel for ~2 days of work. (Kael copy/visual, Folio meta discipline; M)
1c. **First-visit orientation refresh** (Vera's 2026-05-17 note, still true): the one-time value line, rewritten for the barbell, A/B'd against nothing because we're not liars — just make it good. (S)

### Program 2 — The Thread (synergy system)
2a. **"One dataset, many surfaces" hooks.** October Odds exists only in standings; it belongs on team detail (hero stat), game prep ("tonight swings the division race ±2.1%"), and the pennant-race home hero. Same for Ask-bar reach (leaders link pre-filtered — the v1.1 item) and share cards (odds-aware). Each hook is small; together they make the site feel like one organism. (Axiom; S each, rolling)
2b. **The "receipt" pattern, named and universal.** est chips, †, "Understood as:", sim timestamps — the house provenance pattern that already exists in four places. Name it in the design doc, give it one CSS vocabulary, apply it to every computed number (FIP, xW, VORP, odds). Trust is the brand; receipts are how it shows. (Kael; S spec + rolling)
2c. **Cross-sport component parity** — the NFL/MLB twin surfaces (standings, leaders, cards) converge on shared component classes as the Track C inline-style migration proceeds; parity is the acceptance test, not an afterthought. (Kael+Axiom; part of Track C)

### Program 3 — The House Style (site-dedicated theme)
3a. **Position: the default dark theme IS the SportStrata brand.** No fourteenth theme, no redesign. The CC themes are collectibles — opt-in flavor, already frozen (D-038). The move is to *elevate the default*: one polish pass over hero, empty states, motion timing (150ms ease-out standard), and density rhythm on the flagship views. (Kael; M)
3b. **DESIGN.md — the identity written down and enforceable.** Today the style lives in variables.css + scattered GOALS notes + D-038 rules. One page: posture statement (Savant × broadcast lower-thirds), the type ramp and when each face is used, the four house patterns (receipts, border=identity/badge=state, skeleton language, stat-category color discipline), copy voice rules (no hype, no "AI-powered", numbers never lie about precision), logo/wordmark rules (wordmark never themed). New-contributor onboarding AND the checklist Kael reviews against. (Kael writes, Folio maintains; S/M)
3c. **Standings column priority** (from the odds verification): DIV%/OCT% out-earn HOME/AWAY at constrained widths — reorder so odds are visible without horizontal scroll; splits move behind the scroll. (Kael+Vera; S)

**Sequencing recommendation:** 3b DESIGN.md first (it's the constitution the other programs cite), then 1b SEO stubs (highest acquisition leverage per effort), 1a seasonal hero + 3c column fix together (one standings/home pass), then 2a hooks rolling behind feature work. 3a polish pass after DESIGN.md exists to define "polished."
**Owner ratification pending on program scope + sequencing.**

**D-040 update 2026-07-03 — 3b + 3c SHIPPED:** `DESIGN.md` written — the house-style constitution (posture, the default-dark-is-the-brand position, color language incl. border=identity/badge=state and category-color discipline, type ramp roles, the four house patterns with **receipts** named as the universal provenance pattern, copy voice incl. the no-false-precision rule, motion standard 120–150ms ease-out, density/column-priority principle, enforcement pointers). CLAUDE.md key-files table links it (doc-sync). 3c: standings columns reordered — OCT% sits right after GB (always visible), DIV% wide-only beside it; RDIFF/xW/splits carry the fold. SW v56. Suite 29/29.
**Next per sequence:** 1b SEO landing stubs → 1a seasonal hero + first-visit copy → 2a synergy hooks rolling → 3a default polish pass (now that DESIGN.md defines "polished").

---

## D-041 — SEO & Traffic Growth: make the content indexable, then compound it
**Status:** proposed — owner ratification pending
**Contributors:** Relay, Axiom, Folio, Kael, Vera (drafted 2026-07-05 at owner request)
**Date opened:** 2026-07-05 | **Date resolved:** —

**Trigger (owner):** "consider SEO and ways to increase traffic."

**Decision needed:**
How to grow organic + referral traffic given the site is a deliberately no-build, hash-routed vanilla SPA on Cloudflare Pages — specifically, how to make the content library discoverable by search AND AI crawlers without violating the no-bundler / no-framework / no-build constitution.

**Current state (audit 2026-07-05):**
- App shell has title/description/OG/canonical + per-view `document.title`; robots.txt + sitemap valid; the four D-040 landing stubs are strong keyword pages.
- **But hash routing** (`#mlb-team-119`, `#nfl-player-…`) means crawlers see ONE URL (`/`). Thousands of content pages — players, teams, leaderboards, standings, games, historical stat leaders back to 2000 — are invisible to search. This is the ceiling on organic growth.
- `index.html` has **no `og:image`**; stubs use a 192px icon + `twitter:card: summary` (small). Share previews are weak despite `shareCard.js` already producing 1200×630 cards.
- **Zero JSON-LD** structured data.
- (2026) AI crawlers (OpenAI OAI-SearchBot, PerplexityBot) don't execute JS at all → the SPA is invisible to AI search too, not just Google. Raises the stakes.

**Options considered (indexability):**
- **A. Edge static-render at real path URLs — RECOMMENDED.** A Cloudflare Pages Function serves real paths (e.g. `/mlb/player/aaron-judge-592450`) returning prerendered static HTML — correct title/description/canonical/JSON-LD + a real content snapshot — to *everyone*, which hydrates into the existing SPA for humans. Same HTML for users and bots (no cloaking risk; captures AI crawlers). Uses infra we already run; adds no bundler/framework/build step. Matches Google's current preference for static/server rendering.
- **B. Dynamic rendering (UA-sniff bots → prerender snapshot).** Works, but Google deprecated it as a long-term approach (workaround only — "no rush to switch," but not the target), adds complexity, and risks cloaking if content diverges. At most an interim shim, not the goal.
- **C. Adopt an SSR framework (Next/Nuxt).** Best-in-class SEO but violates the no-build constitution outright. Rejected.
- **D. Do nothing (stay hash-only).** Caps the organic ceiling near zero for deep content. Rejected.

**Decision (proposed):** Option A — real path URLs with edge static-rendered meta + content snapshot that hydrate into the SPA. Hash routes keep working but canonicalize/redirect to the path URL to avoid duplicate content.

**Rationale:** Highest ceiling; preserves the no-build rule; reuses Cloudflare Functions we already operate; serves identical HTML to humans and every crawler type (Google + AI); and is the direction Google actually recommends now (static/server rendering over dynamic rendering).

**Sequencing (phases):**
- **Phase 0 — quick wins (no architecture change, ~days):** real 1200×630 `og:image` (from `shareCard.js`) + `summary_large_image` on shell and stubs; add `og:image` to `index.html`; JSON-LD `Organization` + `WebSite`(SearchAction) on the shell; expand `sitemap.xml` beyond the five stubs. Independent of everything else. (Folio + Axiom)
- **Phase 1 — indexability foundation:** URL scheme (Relay owns the path contract), one Cloudflare Function rendering shell + per-page meta + JSON-LD + content snapshot for two flagship templates — **MLB player** and **MLB team**. Hash→path canonical/redirect. Search Console verification + submit. (Relay + Axiom; Folio meta/schema)
- **Phase 2 — programmatic + content expansion:** extend the template to leaderboards, standings, games, and NFL player/team/leaders; auto-generate the sitemap from data; turn the **stat glossary into evergreen explainer pages** (what is FIP / wRC+ / VORP) and build seasonal hubs (pennant race, draft season). (Relay + Axiom + Kael/Vera content)
- **Phase 3 — measure + iterate:** Search Console impressions/clicks/indexed count, share CTR; iterate titles/descriptions per query data. (Folio + owner)

**Implications:**
- Preserves no-build/no-framework — new surface is one edge Function + a URL contract + JSON-LD; the human SPA is untouched beyond a hydration entry point.
- Canonical discipline: every hash route must canonicalize to its path URL (duplicate-content guard). `_headers`/CSP unaffected (no new external domains).
- Cross-domain: touches URL parsing / routing → **Relay + Axiom consensus required before Phase 1 build** (this entry becomes that consensus once ratified).
- Unblocks/aligns with existing owner to-dos: Search Console property + sitemap submission.
- Success metrics: indexed-page count (→ thousands), organic impressions/clicks (Search Console), share-link CTR, AI-crawler visibility.

**Next:** owner ratifies scope + Phase 0 go-ahead (quick wins can start immediately, independent of the Phase 1 architecture decision); Relay + Axiom sign off on the URL contract before Phase 1 implementation.
