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

**Deferred:** per-player game logs / stat lines on the player-detail page (same core-API athlete `statistics` ref — next iteration); ⌘K NFL search; mobile menu-panel per-sport swap.

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
