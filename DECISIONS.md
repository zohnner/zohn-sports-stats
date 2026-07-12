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

---

## D-042 — NCAA Football as a third live sport + a sport-agnostic front door
**Status:** proposed — owner ratification pending
**Contributors:** Vera (JTBD/UX), Axiom (architecture/feasibility), Kael (visual/identity), Relay (data/API contract), Cipher (security)
**Date opened:** 2026-07-06 | **Date resolved:** —

**Trigger (owner):** "expand from MLB and NFL to include NCAA Football, and redesign the homepage as a clean, sport-agnostic hub."

**Decision needed:**
(1) Whether to promote a third live sport — NCAA Football (`ncaaf`) — and at what Phase-1 scope. (2) How to reconcile a "sport-agnostic launchpad" home with the ratified two-season-barbell identity (D-034) and the seasonal-hero front door (D-040 1a). (3) Two architecture questions the owner's brief raised explicitly: a reusable Sport abstraction, and path routing (`/mlb`, `/nfl`, `/ncaaf`).

**Framing (all three core seniors):** the brief maps onto three existing decisions rather than open ground. NCAAF is a scope decision in the family of D-012 (NFL preview→beta). The "sport-agnostic hub" is D-040 Program 1 (The Front Door) seen from a new angle. The routing ask is D-041 (real path URLs), already proposed and pending. The right move is to fold this work into those threads, not to spin up a parallel architecture.

### Resolution 1 — NCAAF scope (Relay + Vera)
Promote `ncaaf` as a live public surface, ESPN-backed via a `/api/ncaaf` Pages Function that clones `functions/api/nfl.js` almost verbatim (host swap to `.../sports/football/college-football`, path allowlist, TTL-by-volatility, no keys, no D1 — per D-019). **Phase-1 scope is deliberately bounded to what CFB data actually supports cleanly: Scores, Standings-by-conference, Teams, and Rankings (AP / Coaches / CFP polls).** Player stat leaders and player detail are **deferred** — ESPN's college player feeds are thin and inconsistent across ~130+ FBS programs (plus FCS), and shipping a sparse player surface would violate the "correct math, visible provenance" spine. The one genuinely new data shape is the **conference** dimension (unlike the flat 30/32-team pro leagues); standings and team browse are conference-grouped from the start. Season model gets an `NCAAF_SEASON` in a new `js/ncaaf.js` following the NFL auto-detect pattern (CFB runs late Aug–mid Jan, CFP included).

### Resolution 2 — the architecture questions
**No `Sport` class/interface.** The brief's "extract a reusable Sport interface/class" describes an OOP pattern this buildless, global-scope, flat-`<script>` codebase deliberately doesn't use — it would be complexity without payoff (Axiom: is the indirection earning its keep? here, no). **What ships instead is the lightweight data-driven `SPORTS` registry Axiom already recommended in D-026 feasibility and which was never fully built:** a plain config object keyed by sport id holding `{ id, label, icon, brandSub, defaultView, accent, hasFantasy, seasonModel }`. `switchSport`'s hardcoded `brandConfig` map and the `if (sport==='mlb') … else if ('nfl') …` fetch/ticker chains in `navigation.js` collapse to registry lookups + a per-sport ticker hook. This is the real, contained refactor that makes an Nth sport cheap — data, not inheritance.

**No new path-routing scheme here.** The brief's `/mlb`, `/nfl`, `/ncaaf` path URLs are exactly D-041's domain (real path URLs + edge static-render, hash→path canonical). NCAAF ships on the **existing hash routing** as `ncaaf-*` views (`ncaaf-scores`, `ncaaf-standings`, `ncaaf-teams`, `ncaaf-rankings`), and NCAAF templates are **added to D-041's URL contract when its Phase 2 lands** — not invented as a second, divergent path system. Inventing separate path routing in this decision would collide head-on with D-041 and create two canonicalization schemes. Explicitly rejected.

### Resolution 3 — the front door (Kael lead, Vera + Axiom consulted)
The "sport-agnostic hub" is adopted **as a synthesis with the barbell, not a replacement for it.** D-034's constitutional identity — MLB reference in baseball months, NFL fantasy edge in football months — and D-040 1a's seasonal hero stay: the home still *leads* with the in-season surface (its "Featured Content"), because a neutral grid that treats a July pennant race and a dormant sport as equal tiles throws away the one thing that makes arrival feel alive. The launchpad ask is satisfied by adding, **below** the seasonal hero, an equal-weight **sport-picker band** — MLB · NFL · NCAAF cards, each with live/seasonal status and one primary CTA into that sport's default view — driven by the same `SPORTS` registry. So: hero = the calendar's answer (dynamic, in-season sport); picker band = the neutral launchpad (all sports equal). The home stops being MLB-by-default (it currently hard-calls `_applySportUI('mlb')` in `loadHome`) — the picker band is the sport-agnostic layer the owner asked for, without regressing the identity.

### Resolution 4 — security (Cipher)
**No CSP change required.** NCAAF rides ESPN's existing allowlisted hosts — `site.api.espn.com` (connect-src) and `a.espncdn.com` (img-src) are already in both `_headers` and the `index.html` meta CSP. The `/api/ncaaf` Function inherits the `_middleware.js` rate limit (D-033) by living under `/api/`. Same escaping discipline (`_escHtml` on all API strings) applies; NCAAF adds no new user-input surface. The only vigilance item is the new team/conference name space going into `innerHTML` — covered by the existing rule.

**Options considered (scope):** full NCAAF parity with NFL incl. player leaders (rejected — data quality can't support it cleanly at CFB scale); Scores+Standings+Teams+Rankings only (**chosen**); scores-only preview like NBA/NHL (rejected — undersells a sport with a real in-season audience the barbell can use in the Aug–Jan gap between MLB's wind-down and… itself overlapping NFL).

**Rationale:** NCAAF at bounded scope fills a real calendar niche, reuses the entire NFL/ESPN proxy + component pattern (low marginal cost), and the front-door synthesis gives the owner the launchpad without breaking the identity the barbell decision made load-bearing. The two architecture "asks" resolve to one good refactor (`SPORTS` registry) and one deferral (path URLs → D-041), which keeps this decision from forking the codebase.

**Implications:**
- Adds `js/ncaaf.js` (+ `functions/api/ncaaf.js`, `css/ncaaf.css`) to the script chain, `index.html`, and `sw.js` STATIC_ASSETS (D-010 / manifest checker #10 — fails otherwise).
- `SPORTS` registry refactor touches `js/navigation.js` (`switchSport`, `_applySportUI`, the fetch/ticker branch chains) — nav is the backbone, so phase it and `/screenshot`-verify each step (same discipline as D-026).
- Home loses its `_applySportUI('mlb')` hard default in favor of the picker band (the CLAUDE.md "never remove that call" rule is amended by this decision — the neutral-home behavior is the intended change, recorded here so a future session doesn't "fix" it back).
- Cross-domain: routing/URL interaction → **Relay + Axiom own the `SPORTS` registry shape and confirm NCAAF's place in D-041's URL contract before Phase 2 path work.** Doc-sync (D-034 rule): CLAUDE.md updated in the same commit that ships the registry + NCAAF (sport list, load order, home rule, data-sources table).
- Gates (Finn does not implement until ALL exist in ISSUES.md): Vera (home + NCAAF JTBD/all states), Kael (sport-picker band + NCAAF surface visual against DESIGN.md), Axiom (`SPORTS` registry feasibility + phasing), Relay (ESPN CFB contract + conference model), Cipher (verified — CSP unchanged, rate-limit inherited). **Status: all DRAFTED in ISSUES.md, pending owner ratification of this entry.**

**Sequencing recommendation:** (P1) `SPORTS` registry refactor behind current behavior — no visible change, pure enabler, own commit + screenshot. (P2) NCAAF data layer + four views on hash routes. (P3) front-door: seasonal hero retained + sport-picker band + drop the MLB home default. (P4 deferred) NCAAF into D-041's path/edge-render contract; NCAAF player surface if/when a clean data source appears.

**Next:** owner ratifies scope + sequencing. Nothing implements before ratification (this is a scope + identity + architecture decision — owner's call, like D-012 and D-034).

**D-042 update 2026-07-06 — Resolution 3 SHIPPED (P1 + P2-slice + P3; pending push):** Owner ratified Resolution 3 (the front door). Shipped:
- **P1 registry (`js/navigation.js`):** `SPORTS_META` map (nba/mlb/nfl/nhl/ncaaf: id, label, icon, sub, defaultView, accent) + `SPORTS` ordered list (mlb/nfl/ncaaf). `switchSport`'s inline `brandConfig` and `_applySportUI`'s `brands` map now read from the registry — behavior-preserving for existing sports, and sport #3 is now a data entry. Added the `ncaaf` ticker branch.
- **P2 slice (`js/ncaaf.js` + `functions/api/ncaaf.js`):** `NCAAF_SEASON` model (late-Aug→Jan), `/api/ncaaf` ESPN college-football proxy (clone of `nfl.js`, allowlist scoreboard/standings/teams/rankings, no keys/D1, inherits `_middleware.js` limiter), offseason-aware `ncaaf-scores` landing, `updateNCAAFTicker`. Routed in `renderCurrentView` + `_loadFromHash` (+ ncaaf sub/bottom/menu nav). Standings/Teams/Rankings remain the routed-but-unbuilt P2 remainder.
- **P3 front door (`js/app.js` + `css/main.css`):** registry-driven **sport-picker band** on home (three status-aware cards: border=identity, dot=state, per K2) + dropped the MLB hard default — `loadHome` now calls `_applySportUI('home')` (neutral brand, no forced sport, sub-nav defaults to MLB context). CLAUDE.md home rule amended accordingly.
- **Verification:** `node --check` clean on all 5 touched JS; 29/29 unit tests; manifest checker green (index.html ⇄ sw.js ⇄ disk); NUL scan clean on all touched files; SW v67→v68. Doc-sync: CLAUDE.md (load order, currentSport, key files, data sources, dispatch, home rule, What-NOT-to-do, sport-focus). **Owed:** `/screenshot` live-verify after push (NCAAF is offseason in July → card shows "Preview · starts Aug", `ncaaf-scores` shows the offseason state; live scoreboard validates in late Aug). NCAAF Standings/Teams/Rankings (P2 remainder) + NCAAF into D-041's path contract (P4) not built.

**D-042 update 2026-07-06 — P2 remainder (Rankings/Standings/Teams) SHIPPED (pending push):** Continuing on ratified D-042 scope. Relay note: ESPN's `site.api` CFB standings feed is a stub (same failure NFL hit in D-029), so Standings + Teams read the `site.web.api` conference tree via a new `functions/api/ncaafstandings.js` (clone of `nflstandings.js`, season-parameterized, `debug=1` envelope for shape verification). Shipped in `js/ncaaf.js`: `displayNCAAFRankings` (AP/Coaches/CFP poll tabs, movement arrows), `displayNCAAFStandings` (season selector + conference sections, reusing the sport-agnostic `.standings-*` component), `displayNCAAFTeams` (conference-grouped chips from the same tree). Nav (sub/bottom/menu) expanded to Scores·Standings·Teams·Rankings·News. Reused existing `.standings-*` classes; added only `.ncaaf-team-grid/-chip` to components.css. SW v68→v69. **Verification:** `node --check` clean (ncaaf.js, navigation.js, ncaafstandings.js); 29/29 tests; manifest green; NUL clean. **Owed (Relay):** confirm the exact CFB conference-tree depth against the deployed `/api/ncaafstandings?season=2025&debug=1` after push (built defensively with a recursive conference collector, but the live tree shape is unverified — web_fetch was down during the build). NCAAF into D-041's path contract remains P4.

---

## D-043 — Home hub follow-on: tabbed scoreboard, seasonal promo, cross-sport search
**Status:** proposed — owner ratification pending
**Contributors:** Vera (JTBD/UX), Kael (visual), Axiom (feasibility), Relay (data contract)
**Date opened:** 2026-07-06 | **Date resolved:** —

**Trigger (owner):** external homepage critique proposing a full multi-sport "hub" overhaul. Most of it was rejected because it fights the ratified two-season barbell (D-034) and the seasonal-hero front door (D-040 1a) — a hero carousel (discredited UX pattern + offseason dead slides), equal-weight sport framing (the positioning we explicitly declined), and forced per-sport symmetry on modules the calendar can't fill (a fabricated July NFL "matchup"). The "sport cards hub" it called crucial already shipped as the D-042 sport-picker band. **Three keepers** survive as genuine improvements and are specced below; each strengthens the barbell rather than diluting it.

**Framing (Kael + Vera):** the barbell holds — the home leads with the in-season sport. These three items make the *other* sports reachable and the live one richer, seasonally, without pretending a dormant sport is co-equal. All three degrade to today's behavior when a sport is offseason.

### 3a — Tabbed home scoreboard `[All | MLB | NFL | NCAAF]`
**Vera (JTBD/states):** a visitor scanning "Today's Games" should filter to their sport in one tap. Default **All**; each game prefixed with a league glyph (⚾/🏈). Tabs: default All, remember the last choice within the session. Per-sport empty state in offseason ("No NFL games today — season runs Sep–Feb", reusing the offseason component). Loading = existing skeleton cards. A sport with zero games today shows the empty state inside its tab, never a blank grid.
**Kael (visual):** reuse the `.standings-tabs`/`.standings-tab` vocabulary already used by NCAAF (one family). League glyph is a muted inline mark, not a colored badge (border=identity/badge=state discipline stays). Football games show the **broadcast network** next to kickoff time (ESPN/FOX/etc.) — a real football-viewer need MLB doesn't emphasize; render it as a `--text-muted` caption, not a logo.
**Relay (data contract):** ESPN scoreboard (`fetchNFLScoreboard`/`fetchNCAAFScoreboard`, already built) exposes `competitions[].broadcasts` / `geoBroadcasts` — capture `.names`/`.media.shortName`. MLB Stats API schedule needs `hydrate=broadcasts` on the schedule call to get the same. **Confidence flag:** exact broadcast field shapes unverified live (web_fetch was down at spec time) — confirm both against real payloads before build; degrade gracefully to no-network if absent.
**Axiom (feasibility):** the home currently loads MLB games only (`_loadHomeTodayGames`) with an MLB-specific card builder. Two changes: (1) a unified game-card (or per-sport renderers writing into the one `#homeTodayGrid`), and (2) **lazy per-tab fetch** — All fetches MLB now (as today) + the in-season football scoreboards only when their tab is opened, so a July visitor pays for nothing dormant. Note the payoff is itself seasonal: in July "All" is ~100% MLB; the tabs earn their keep in the Sep–Oct overlap. No new CSP domains.

### 3b — Seasonal promo slot (replaces the static NFL Draft Kit box)
**Vera:** one promo module whose content follows the calendar, same instinct as the D-040 1a seasonal hero. Summer (Jul–Aug) → NFL Draft Kit / Mock Draft CTA; football season → NFL/NCAAF surface; baseball postseason → October Odds. States: exactly one promo, always a real destination, never a "coming soon."
**Kael:** promote from the buried mid-right text box to a single full-width band beneath the sport-picker band; brand-accent, one CTA, no carousel.
**Axiom:** a small `PROMO_MOMENTS` config keyed off the season models (`MLB_SEASON`, `NFL_FANTASY_SEASON`, `NCAAF_SEASON`) picks the active promo — the seasonal-hero pattern, generalized. **Honest scope:** the critique's "CFP Playoff Predictor" does not exist — the fall NCAAF promo routes to Rankings/Scores, not a predictor, until/unless such a feature is built.

### 3c — Cross-sport ⌘K search with sport badges
**Vera:** results grouped by sport with a small sport badge per row; the sport-aware placeholder **stays** (in MLB context "Search 900+ MLB players…" has higher scent than a generic prompt) — cross-sport is additive, surfaced when the query matches other sports.
**Axiom (feasibility — lighter than the critique assumes):** `initGlobalSearch` in `search.js` **already** spans NBA/MLB/NFL pools (`AppState.allPlayers`, `AppState.mlbPlayers`, NFL players+teams). The real gaps: (1) results only cover pools already loaded (populated on sport visit) → lazy-load the other sports' player/team pools on first cross-sport query; (2) add sport badges + grouping to the result render; (3) add NCAAF **teams** (from the standings tree). **Hard limit (Relay):** NCAAF has **no player data** (deferred, D-042) — cross-sport search covers MLB/NFL players + MLB/NFL/NCAAF teams only; no NCAAF players, and the UI must not imply otherwise.

**Rationale:** each keeper serves the returning in-season user (the product's actual audience per D-034/GOALS) rather than a first-timer's impression of breadth. Breadth is ESPN's game; depth + honesty is the moat, and "lead with what's live" is the honest signal.

**Implications / gates:** Finn does not implement until each sub-item's gates sit in ISSUES.md. Cross-domain: 3a touches the home render + adds football fetches on home (Axiom owns; keep it lazy). Doc-sync (D-034): any new fetch host → CSP both places (none expected — ESPN already allowlisted). SW version bump on any js/css change.

**Sequencing recommendation:** 3c first (smallest — search.js is already 80% there, highest daily utility), then 3b seasonal promo (config, low risk), then 3a tabbed scoreboard (largest — unified card + broadcast contract; time it to land before the Sept football overlap when it actually pays off).

**Next:** owner ratifies scope + sequencing; Relay verifies the two broadcast-field contracts before 3a build.

**D-042 update 2026-07-06 — live-verified (browser) + refinements:** Home regression fixed (v70) confirmed live — picker band renders all 3 sports, no console errors, neutral "Multi-Sport Analytics" brand. NCAAF views verified against live 2025 data: Rankings (AP top-3 Indiana/Miami/Ole Miss), Standings (12 conferences, full names, 136 teams), Teams (12 sections, 136 chips). **Relay owed shape-check CLOSED:** `/api/ncaafstandings?season=2025&debug=1` returns 11 conference groups directly (no FBS/FCS super-group); entries sit at the conference node except Sun Belt (2 divisions nested one level deeper) — the recursive collector handles both. Two refinements shipped (v71): Rankings now filters to FBS-relevant polls (drops FCS / Div II / Div III noise ESPN returns); conference label uses the full trail so Sun Belt divisions read "Sun Belt — East" not a bare "East".

---

## D-044 — Cross-sport frame parity: unify player + team detail (and view chrome) across MLB/NFL/NCAAF
**Status:** proposed — owner ratification pending
**Contributors:** Kael (frame/visual), Vera (JTBD/states), Axiom (architecture), Relay (NCAAF data)
**Date opened:** 2026-07-06 | **Date resolved:** —

**Trigger (owner):** "use the MLB frame and player-detail structure to expand NFL and NCAAF — similar across sports, different when needed for different metrics or graph types." Owner scope answers: NCAAF = *investigate ESPN athletes* (build players if the data holds); surfaces = *full frame* (player + team detail + shared chrome).

**The frame, defined (Kael, from the MLB benchmark — D-038's posture reference):** `.player-detail-container` → `.player-detail-header` (back + action buttons) → `.player-hero` (avatar w/ headshot-or-initials, name, position chip, team logo+link, meta lines, bio strip) → repeated `.stats-card` sections, each `.detail-section-title` + one of: a **radar** "stat profile," a `.stats-grid` of totals with sparklines, a **game-trend** line, a **career-trend** line. `StatsCharts.mlbRadar / mlbGameTrend / careerTrend` are MLB-named but the chart *types* are sport-agnostic. **What's shared = the frame; what varies per sport = which stats fill the grid, the radar axes, and the game-log metric.** That's the whole design thesis.

**Relay finding — NCAAF players are feasible (softens the D-042 deferral):** live-probed the ESPN core API for the completed 2025 CFB season. `.../seasons/2025/types/2/leaders` returns fully-populated passing/rushing/receiving/defense leaders, each linking `athlete` + `team` + a per-athlete `statistics` ref **by ID**. Team rosters (`site.api .../teams/{id}/roster`) return 62 players with bio (position, jersey, height/weight, experience) but **no stats** and ~30% headshot coverage. Verdict: **player pages are buildable** — star/rotation players have real season stats, and because roster/leaders/stats are all ESPN-native the join is **by ID, no fragile name-match** (cleaner than NFL, D-016). D-042's "too sparse" concern narrows to two real, manageable gaps: **depth/walk-on players have thin or empty stats** (→ empty states) and **headshots are sparse** (→ initials-avatar fallback, the P3-013 pattern). Cost: the core API is ref-based (N+1) → refs must be **resolved server-side** in a Pages Function, exactly like `/api/nflstats` (D-016). This entry supersedes D-042's blanket player-data deferral, with scope documented.

**Options considered:**
- Per-sport bespoke detail pages (status quo — MLB rich, NFL ad-hoc inline styles, NCAAF none). Rejected: no parity, no reuse, three code paths drift (already the D-038 K3 finding).
- **One shared frame builder + per-sport data adapters (chosen).** A sport-agnostic `renderDetailFrame(config)` emits the standard markup; each sport supplies `{avatar, name, position, teamLink, metaLines, bioStrip, actions, sections:[{title, type, data}]}`. Charts generalized to `radarProfile / gameTrend / careerTrend`. Parity is the acceptance test (D-040 2c).

**Decision (proposed):** build the shared frame builder and bring NFL and NCAAF onto it, adapting metrics/charts per sport; add the NCAAF player data layer server-resolved from the ESPN core API. MLB stays the reference and is refactored onto the shared classes only where it's non-destabilizing (it's the posture benchmark — do not risk it for cosmetic unification).

**Phasing (contain blast radius — player detail is high-traffic):**
- **P1 — extract the frame (Kael + Axiom).** Audit + name the shared CSS (`.player-detail-*`, `.player-hero`, `.stats-card`, `.detail-section-*`) as documented house classes (DESIGN.md); build `renderDetailFrame()` in a shared file; migrate **NFL player detail** off its inline styles/`back-button` onto it (data already exists — the D-038 K3 "NFL first" migration). Reference implementation, no new data. `/screenshot` parity check vs MLB.
- **P2 — NCAAF player data layer (Relay + Axiom).** New `functions/api/ncaafathlete.js` + `functions/api/ncaafstats.js` mirroring `/api/nflplayer` + `/api/nflstats`: server-resolve core-API refs (roster, athlete, season stats, gamelog), cache by volatility, ID-join. Initials fallback + thin-data empty states.
- **P3 — NCAAF players + leaders (Axiom).** NCAAF player list, player detail on the shared frame, and a Leaders view (the probed leaders endpoint). Routes `ncaaf-players`, `ncaaf-player-{id}`, `ncaaf-leaders`; add to nav + `SPORTS`/`SUB_NAV_TABS`.
- **P4 — team detail parity (Kael + Axiom).** Unify NFL's `.team-*` (P3-030), MLB team detail, and a new NCAAF team detail into one team frame.
- **P5 — shared view chrome (Vera + Kael).** Breadcrumbs, tabs, containers unified across sports; accessibility pass (focus, keyboard, headshot alt/fallback).

**Gates (Finn does not implement a phase until its gates are in ISSUES.md):**
- **Vera** — JTBD + states for player/team detail across sports: loading (skeleton), **thin-CFB-player empty state**, error, **no-headshot** fallback, no-games-yet (preseason).
- **Kael** — the frame as a named DESIGN.md house pattern; sport adapts stat-category color language + radar axes; wordmark/identity rules hold.
- **Axiom** — `renderDetailFrame()` builder architecture; generalize `StatsCharts` names; NCAAF Pages Functions feasibility; per-phase commits + screenshot.
- **Relay** — NCAAF core-API contract (confirmed feasible here): server-resolved refs, ID-join, caching by volatility, documented coverage (leaders + rotation yes; walk-ons thin; ~30% headshots).

**Implications:** touches high-traffic detail views and adds NCAAF Functions + client files (index.html + sw.js + manifest per D-010; SW bump). No new CSP host (ESPN core API is `sports.core.api.espn.com` — server-side only, no browser connect-src; **verify this host isn't needed client-side** before build). Doc-sync CLAUDE.md (D-034). Overturns D-042's player deferral — record there too.

**Sequencing recommendation:** P1 first (pure refactor, no data risk, proves the frame + pays down D-038 K3 debt), then P2→P3 (NCAAF players, the net-new value), then P4 team parity, then P5 chrome. MLB refactor is opportunistic, never on the critical path.

**Next:** owner ratifies scope + phasing; then P1 gates (Kael frame spec + Axiom builder design) land in ISSUES.md and P1 builds.

**D-044 update 2026-07-06 — P1 done + P2 (NCAAF player data layer) built:** P1 shipped (b371595, 75dbec6): `js/detailFrame.js` builder (`detailHeader`/`detailSection`) + NFL player detail (header + Player Profile/Fantasy Outlook cards) migrated onto it, inline styles → named classes (D-038 K3 "NFL first"); MLB untouched. P2 built: `functions/api/ncaafstats.js` (CFB leaders, ESPN core-API server-resolved — athletes + a one-shot teams-map to stay under the subrequest budget) and `functions/api/ncaafathlete.js` (`?id=&season=` → bio + season stat groups by ID, no name-match). Both validated against live 2025 payloads: leaders populated; athlete bio carries name/pos/headshot/jersey/ht/wt/class/team-ref; `statistics` (types/2) returns `splits.categories` (passing/rushing/receiving/defensive/general). Two shape corrections applied: CFB keeps defensive INTs in a separate `defensiveInterceptions` category, and there is no `kicking` category on offensive players (kicking lives under `scoring`) — the unverified kicking group was dropped rather than risk wrong FG numbers. Next: P3 (NCAAF Leaders + player list + player detail on the shared frame + routing).

**D-044 update 2026-07-06 — P3 (NCAAF Leaders + player detail on the shared frame) built:** `js/ncaaf.js`: `displayNCAAFLeaders` (category cards from `/api/ncaafstats`, rows link straight to `ncaaf-player-{id}` — leaders carry the ESPN athlete id, so no name-index), `showNCAAFPlayer` + `displayNCAAFPlayerDetail` (bio + season stat groups rendered through the shared `detailHeader`/`detailSection` builder — the D-044 payoff; initials-avatar fallback for sparse headshots, empty-state for thin-stat reserves). Routing: `renderCurrentView`→`_renderNCAAFView` handles `ncaaf-player-*`; `_loadFromHash` gains `ncaafPlayerMatch` + `ncaaf-leaders`. Nav: Leaders tab added to sub/bottom/menu. Reused `.nfl-lrow`/`.card` leader-row classes + `.standings-*`; new CSS limited to `.ncf-stat*` stat cells. SW v73→v74. Leaders is NCAAF's player-discovery path (no full roster list — no Sleeper equivalent). Remaining: live-verify the P2 functions + P3 views end to end; P4 team-detail parity; P5 shared chrome; MLB opportunistic refactor.

**D-044 update 2026-07-06 — P4 (NCAAF team detail) built:** `js/ncaaf.js` `showNCAAFTeam`/`displayNCAAFTeamDetail` — team banner (logo, name, abbr, `standingSummary`, team-color accent) + Team Leaders (the team's players filtered from `/api/ncaafstats` by abbr, clickable → player detail). Teams chips now carry the ESPN team id and link to `ncaaf-team-{id}`; `_ncaafStandingRow` captures `id`. `/api/ncaaf` allowlist extended to `/teams/{id}` (single-team detail). Routing: `_renderNCAAFView` handles `ncaaf-team-*`; `_loadFromHash` gains `ncaafTeamMatch`. CSS: `.ncf-team-*` banner + `.ncaaf-team-chip--link`. SW v74→v75. (MLB/NFL team pages already have their own detail — this brings NCAAF to parity; a later slice can unify all three onto one team frame.) Remaining: P5 shared chrome; optional MLB player-frame refactor.

**D-044 update 2026-07-06 — P5 (shared chrome + a11y) built; planned phases complete:** NCAAF views were showing raw route ids as titles/breadcrumbs (no `_NAV_META` entries — the D-038 K1 defect). Added NCAAF `_NAV_META` entries; `_renderNCAAFView` sets the breadcrumb centrally for list views; player/team detail set `setBreadcrumb('ncaaf-leaders', name)` / `('ncaaf-teams', name)` (escaped) so titles read e.g. "Drew Mestemaker — SportStrata". A11y: NCAAF leader rows + linkable team chips are now `role="button" tabindex="0"` with `aria-label`, plus a delegated Enter/Space keydown handler in `navigation.js` covering `.nfl-lrow--link` + `.ncaaf-team-chip--link` (also readies the NFL rows once they gain tabindex). SW v75→v76. **D-044 P1–P5 all built and verified (render/data level).** Remaining optional: MLB player detail onto the shared `detailFrame` builder; NFL deep stat-fn inline-style tail (D-038 K3); NFL leader/detail rows given tabindex for full keyboard parity; a native-load pass once the edge cache turns over.

---

## D-045 — Path-URL SEO foundation + clean per-sport landing pages (ratifies + extends D-041)
**Status:** proposed — owner ratified the direction (full path URLs + real-URL per-sport pages); gates + P1 go-ahead pending
**Contributors:** Relay (URL contract), Axiom (edge-render architecture), Kael (landing visual), Vera (landing UX), Folio (meta/schema), Cipher (redirect/CSP safety)
**Date opened:** 2026-07-06 | **Date resolved:** —

**Trigger (owner):** "SEO optimization + each sport should have a clean, enticing landing page that isn't too busy." Owner scope answers: landing = **real-URL pages that are BOTH the SEO entry point and the in-app landing**; SEO = **the full path-URL foundation** (not just quick wins).

**This ratifies D-041 Option A** (real path URLs + edge static-render that hydrates into the SPA) and makes the **per-sport landing pages the flagship first surface**. The two owner tasks are one architecture: a real URL per sport (`/mlb`, `/nfl`, `/ncaaf`) that a crawler indexes AND a human lands on, then hydrates into the existing hash-routed SPA.

**Framing (all seniors):** the hard part is the routing model shift (hash SPA → real paths), so we land the **3 sport landing pages first** — highest value (top-of-funnel + the clean UX the owner asked for), smallest surface, and it proves the edge-render pattern before we point it at thousands of content pages.

**Gates (Finn does not implement a phase until its gates are in ISSUES.md):**
- **Relay — URL contract.** Path scheme: landing `/mlb` `/nfl` `/ncaaf`; content later as `/{sport}/player/{slug}-{id}`, `/{sport}/team/{slug}-{id}`, `/{sport}/leaders`, `/{sport}/standings`. Every hash route canonicalizes to its path URL (duplicate-content guard); the reverse (path → hash view) drives hydration. Slug = normalized name; id is the source of truth.
- **Axiom — edge-render architecture.** ONE Cloudflare Pages Function serves real paths: prerendered shell + per-page `<title>`/meta/canonical/JSON-LD + a real content snapshot (so crawlers and first paint get content with no JS), which then hydrates into the untouched SPA via a small entry point. **No framework, no bundler, no build step — the constitution holds** (new surface = one Function + a URL map + JSON-LD). Hash→path redirects from a fixed map. Phase hard; the SPA keeps working throughout; each phase = own commit + `/screenshot` + crawler-fetch check.
- **Kael — landing visual (clean, enticing, not busy).** Per sport: ONE hero (sport identity — its accent color, wordmark, a single evocative line), a seasonal-moment strip, and 3–4 primary entry cards (that sport's best surfaces — e.g. MLB: Leaders/Standings+Odds/Player search; NFL: Mock Draft/Draft HQ/Scores; NCAAF: Rankings/Standings/Leaders). Nothing else. Distinct per-sport character within the house style (DESIGN.md); reuses the sport-picker/hero vocabulary. "Not too busy" is the acceptance test.
- **Vera — landing UX.** JTBD: a visitor (often from search) lands on `/nfl` and in one glance grasps what this tool offers for that sport and has one obvious next step. States: in-season vs offseason hero; the static snapshot must be meaningful **without JS** (crawler + first paint); loading→hydrate is seamless; a11y (headings, landmarks, focus).
- **Folio — meta/schema.** Per-page title/description/canonical + OG/Twitter (`summary_large_image`, real 1200×630 og:image), JSON-LD (`Organization`/`WebSite`+SearchAction on shell; `WebPage`+`BreadcrumbList`; `SportsTeam`/`Person` on content templates later). `sitemap.xml` includes the 3 landing pages now, auto-expands with templates.
- **Cipher — safety.** Hash→path redirect map is a fixed allowlist (no open-redirect); no new external hosts (CSP intact); no secrets; the edge Function is read-only + rate-limited under existing middleware if placed under `/api`, else its own lightweight guard.

**Phasing:**
- **P0 (independent, can start now):** SEO quick wins with zero routing change — `og:image` on the shell, JSON-LD `Organization`/`WebSite` on the shell, expand `sitemap.xml`. (Folio + Axiom)
- **P1 (flagship):** the URL contract + edge-render Function for the **3 per-sport landing pages** (`/mlb` `/nfl` `/ncaaf`) — clean Kael/Vera designs, static snapshot + hydrate, canonical + hash redirects, per-page meta/JSON-LD, sitemap. The dual SEO + UX win, and it proves the pattern. (Relay contract, Axiom Function, Kael/Vera design, Folio meta)
- **P2:** extend edge-render to player/team/leaders/standings templates — the thousands of indexable content pages. (Relay + Axiom + Folio)
- **P3:** Search Console verify + submit; measure indexed count / impressions / share CTR; iterate. (Folio + owner)

**Cross-domain:** touches URL parsing / routing → **Relay + Axiom consensus required before P1 build** (this entry becomes that consensus once ratified). Preserves no-build/no-framework. Owner action later: Search Console property + sitemap submission.

**Next:** owner ratifies scope + sequencing; then Relay + Axiom sign off on the URL contract, P1 gates (Kael/Vera landing spec, Folio meta) land in ISSUES.md, and P1 builds. P0 quick wins can proceed in parallel immediately.

**D-045 update 2026-07-06 — discovery + P1 (landing pages) built:** Discovery: D-041 Phase 1 edge-render already SHIPPED for MLB (`functions/mlb/team/[abbr].js`, `.../player/[id]/[[slug]].js`, `standings.js`) + og:image/JSON-LD/sitemap in the shell — so the path-URL + edge-render architecture is proven and in production. P1 is therefore an **extension of a shipped pattern, not new routing** (the big risk I flagged is retired). Built: (1) a unified clean **sport-landing view** `_renderSportLanding(sport)` in `app.js` (one hero + seasonal line + 4 entry cards, registry-driven, "not too busy") routed via `renderCurrentView` for `mlb-home`/`nfl-home`/`ncaaf-home`; `SPORTS_META.defaultView` for mlb→`mlb-home`, ncaaf→`ncaaf-home` (nfl already `nfl-home`), so entering a sport lands on its landing. NFL's old `loadNFLHome` is now bypassed by the unified landing (kept, unused). (2) Three **edge-render landing functions** `functions/{mlb,nfl,ncaaf}/index.js` cloning the proven pattern (per-sport title/desc/canonical/OG/JSON-LD + crawlable snapshot + `__SS_ROUTE={sport}-home`, fail-safe to app). (3) `sitemap.xml` +`/mlb` `/nfl` `/ncaaf`; `_NAV_META` + hash-view arrays updated. SW v76→v77. Verified: node --check all, 29/29 tests, manifest green, NUL clean; landing render validated against live registry (clean hero + 4 cards + accent + seasonal status). **Owed:** CLAUDE.md doc-sync (sport landings, defaultView change, edge landing fns); live pass once edge turns over; P2 (NFL/NCAAF content-template edge-render) + P3 (Search Console/measure).

**D-045 update 2026-07-06 — P2 started (NCAAF content templates):** Built the first content-template edge-render functions cloning the D-041 pattern: `functions/ncaaf/player/[id]/[[slug]].js` (ESPN core athlete → Person JSON-LD + snapshot, `__SS_ROUTE=ncaaf-player-{id}`) and `functions/ncaaf/team/[id]/[[slug]].js` (ESPN team → SportsTeam JSON-LD + snapshot, `__SS_ROUTE=ncaaf-team-{id}`). Both fail-safe to the app, no new CSP hosts. `/ncaaf` landing verified live (correct per-sport title/canonical/OG + crawlable snapshot). **Remaining P2:** NFL player/team templates (same pattern, Sleeper-id ⇄ ESPN bridge for players); **programmatic sitemap generation** from data (teams + top players/leaders per sport) — the discovery mechanism that turns the templates into indexed pages; app-link/canonical hardening (hash → path). P3: Search Console verify/submit + measure.

**D-045 update 2026-07-06 — P2 sitemap generator built:** `tools/gen-sitemap.cjs` regenerates `sitemap.xml` from live data — landings + 4 stubs + `/mlb/standings`, all MLB teams + top hitting/pitching qualifiers (MLB Stats API), all FBS teams (ESPN) + NCAAF stat leaders (the site's own `/api/ncaafstats`, names+ids in one call). Only emits paths that have a real edge-render template today (MLB team/player + NCAAF team/player); NFL content templates are the remaining P2 item. Owner/CI-run (needs outbound network — the sandbox can't reach the APIs, same as `join-health.cjs`); syntax-verified (`node --check`), slug logic unit-checked. `/ncaaf/team/249` verified live (correct title/canonical/OG + snapshot). **Next:** owner runs `node tools/gen-sitemap.cjs` to populate the sitemap; NFL player/team templates; P3 Search Console.

**D-044/D-045 update 2026-07-06 — NCAAF team page deepened (MLB-depth, NFL data pattern):** The D-044 P4 simple banner is replaced by the full sport-agnostic `_renderTeamPage` builder (P3-030 — hero + facts grid + assets + roster-by-unit + schedule), the on-brand rich template NFL uses. `showNCAAFTeam`/`displayNCAAFTeamDetail` now fetch CFB **roster** and **schedule** NFL-style via `/api/ncaaf` (allowlist extended to `/teams/{id}/roster` + `/teams/{id}/schedule`), grouping the ESPN roster by offense/defense/specialTeam, mapping team stat leaders into the assets section, and finding the next game from the schedule. `_renderTeamPage` gained `assetsTitle`/`assetsCountLabel` params (NFL-default, back-compat) so CFB shows "Team Leaders · {season}". Roster/leader rows deep-link to `ncaaf-player-{id}`. Conference chip parsed from `standingSummary`; team color drives `--team` accent. SW v77→v78. Verified live: hero/chips/facts/assets/roster-groups/player-links/accent all correct against real UNT data (only the assets label lagged on the not-yet-deployed builder).

**D-044 follow-on 2026-07-06 — (1) NCAAF player game log shipped; (2) NFL content-template prep:**
**(1) Game log:** `functions/api/ncaafgamelog.js` — faithful clone of `/api/nflgamelog` (same ESPN gamelog shape: `labels`/`names` columns joined from `seasonTypes[].categories[].events[]` to the events metadata map; CFB host + Aug-season default). Client `_loadNCAAFGameLog(id, season)` in `js/ncaaf.js` lazy-fetches it and renders a per-game table (Date · Opp · Res + position-relative stat columns, W/L colored) into a `#ncaaf-gamelog-host` on the player detail, via the shared `detailSection`. Reuses `.stats-table`; adds only `.gl-*` cells. SW v78→v79. Player page now: hero + profile + season stat groups + game log — MLB/NFL-depth on the shared frame.
**(2) NFL templates plan (ready to build):** `functions/nfl/team/[abbr]/[[slug]].js` — clone the MLB team edge-render; resolve abbr via ESPN NFL `/teams`, `__SS_ROUTE=nfl-team-{abbr}`. `functions/nfl/player/[id]/[[slug]].js` — route uses the **Sleeper** id, so the edge function fetches Sleeper's bulk `players/nfl` map (cf-cached 24h) to resolve id→name/team/pos for the head/JSON-LD, `__SS_ROUTE=nfl-player-{sleeperId}`. Both fail-safe to the app; add to `gen-sitemap.cjs` once shipped. No new CSP hosts (ESPN + Sleeper already used server-side).

**D-045 update 2026-07-06 — P2 NFL content templates shipped; content templates now complete:** `functions/nfl/team/[abbr]/[[slug]].js` (ESPN NFL teams → SportsTeam JSON-LD + snapshot, `__SS_ROUTE=nfl-team-{ABBR}`) and `functions/nfl/player/[id]/[[slug]].js` (resolves the Sleeper id via Sleeper's bulk `players/nfl` map, cf-cached 24h → Person JSON-LD + snapshot, `__SS_ROUTE=nfl-player-{sleeperId}`). Both clone the proven D-041 pattern, fail-safe to the app, no new CSP hosts. `tools/gen-sitemap.cjs` extended with NFL teams + top-~400 fantasy players (Sleeper search_rank). **Edge-render content templates now exist for all three sports** (MLB/NFL/NCAAF team+player) + the three landings + NCAAF gamelog. D-045 P2 is effectively complete; remaining: owner runs `gen-sitemap.cjs` to populate discovery, and P3 Search Console. CLAUDE.md doc-synced.

**D-044 follow-on 2026-07-06 — NCAAF player game-trend chart shipped; radar deliberately deferred (data integrity):**
**(1) Game trend:** the NCAAF player page now renders a **Game Trend** chart above the game-log table, reusing the shared `StatsCharts.nflGameTrend(canvas, games, columns, accent)` — a drop-in because `/api/ncaafgamelog` returns the identical football shape (columns with `.name` like `passingYards`, games with `.stats`). It auto-picks the player's yardage group (passing/rushing/receiving) as a line + TD bars; returns null (and the section self-removes) for players with no yardage, e.g. pure defenders. `_renderNCAAFView` now calls `StatsCharts.destroyAll()` on every NCAAF nav to avoid orphaned charts. Chart.js is eager (`index.html`), so no lazy-load. SW v79→v80. Player page depth now matches MLB/NFL: hero + profile + season groups + **game-trend chart** + game log.
**(2) Radar — deferred on purpose (prep for next):** a raw-stat radar would be **false precision** — a meaningful radar needs a per-position percentile baseline, and CFB player data has no clean qualified-player corpus for that. The honest version is a **"% of FBS leader" radar** (normalize each of the player's stats against the national leader from `/api/ncaafstats`); it needs `/api/ncaafathlete` to also emit the raw stat *names + numeric values* (today it returns display-only `[label, value]` pairs) so the client can map player→leader per stat. That endpoint tweak + client radar is the concrete next slice — no fabricated axes ship in the meantime.

**D-044 follow-on 2026-07-06 — NCAAF player "Season Profile" radar shipped (honest normalization):** The radar deferred last commit is now built on a defensible baseline. `/api/ncaafathlete` groups now also carry `raw: {statName: numericValue}` (additive, non-breaking — display `stats` unchanged). New generic `StatsCharts.radarProfile(canvas, labels, values, color)` plots pre-normalized 0–100 values with custom axes (no hardcoded keys, unlike the NBA-specific `radar`). Client `_loadNCAAFRadar` fetches `/api/ncaafstats`, takes the #1 value per category as the baseline, and plots each of the player's production stats as **% of the FBS leader** (Pass/Rush/Rec yds+TD, Rec, Tackles, Sacks, INT) — capped at 100, ≥3 axes required, self-removes otherwise. Caption states the normalization explicitly ("% of the FBS leader"), honoring the no-false-precision rule. NCAAF player page now: hero + profile + season groups + **Season Profile radar** + **game-trend chart** + game log — full MLB/NFL depth. SW v80→v81. Math sanity-checked (leader → 100%).

---

## D-046 — Homepage overhaul: analytics-first landing, gap-analysis P1–6 (ad-free)
**Status:** in progress — **P1 shipped** (`89f7015`, live game states + ticker parity), **P2 shipped** (`ef59029`, Data-Story hero), **P3 shipped** (`398f886`, Headlines + Insights rail), **P4 shipped** (`917cdbb`; Pennant-Races viz + freshness + live-review [hidden] fix; sport-status→pills and two-column rail intentionally not done — the page reads well and the sport cards are the functional launchpad), **P5 shipped** (team favorites MVP); P6 pending. Owner ratified direction (ad-free; P1–6 scope).

**Progress log:**
- **P1 (shipped `89f7015`):** `fetchMLBSchedule` hydrates `linescore`; home `_gameCard(g)` renders UPCOMING/LIVE/FINAL (inning tag ▲/▼/MID/END, outs dots, base-state diamond from `linescore.offense.first/second/third`, live pitcher·batter); live-first sort; polling 60s→30s (guarded); ticker inning parity for free (render logic already existed). Win probability deferred — Phase-1 acceptance covers score/inning/outs/base only; WP needs a per-live-game fetch, better placed in the expanded live view + the P2 hero. Verified vs the 2026-07-11 live feed; base/outs shown only during an active Top/Bottom half.
- **P2 (shipped `ef59029`):** `_renderHomeHero(games)` above the search bar — selection logic live-leverage → marquee upcoming (combined win% + division rivalry) → tightest-division-race fallback (`_heroFromStandings`); generated matchup board + logo lockups, no photos, token-only theme safety; refreshes on the 30s live poll. Harness-verified selection over the real slate.
- **P3 (shipped `398f886`):** tabbed `#homeRail` after Today's Games — **Headlines** from `/api/news` (relative timestamps, link-out) + **Insights** = templated leader-plus-margin bullets from `mlbLeaderSplits` (K, RBI, SB, WHIP; categories the Hot Strip doesn't spotlight, honest gap-to-runner-up, WHIP qualified). Placed in-flow rather than a floating right-rail — the true two-column right-rail layout is deferred to P4 (the density/hierarchy pass), keeping this phase low-risk. `_wireRailTabs()` handles panel toggle.
- **P4 (partial):** the two **data-backed, verifiable** pieces shipped — (a) Pennant Races promoted from the thin chip row to a **division-win% bar viz** (`.pennant-viz`; Monte Carlo `divOdds` drives bar width, leader logo, gap label; graceful when odds absent), and (b) **freshness timestamps** ("Updated Nm ago" on Today's Games from real fetch time, refreshed on the poll + a 30s ticker). The remaining P4 items are **subjective visual work whose acceptance criterion is screenshot sign-off** (§9 Phase 4: "visual regression screenshots approved for desktop 1440px + mobile 390px"): the 4–5 visual-weight tiers, demoting sport-status cards to compact pills, and folding the rail into a two-column layout. Those are held for a **live screenshot review** against deployed sportstrata.cc (drivable via Chrome) rather than shipped blind — building CSS hierarchy changes without seeing them risks the exact regressions the gate guards against.
- **P4 live review (shipped `917cdbb`):** drove Chrome against deployed sportstrata.cc (1440px). Confirmed P1–P4 render correctly with live games (ticker inning tags, hero = highest-leverage live game, live cards with base/outs/count, pennant odds bars, freshness stamp, insights). Caught a real runtime-only bug: `.rail-panel{display:flex}` / `.home-hero{display:flex}` overrode the UA `[hidden]{display:none}`, so tab-hidden panels + the empty hero showed anyway — fixed with `[hidden]` guards. Verdict on the deferred items: **not doing** sport-status→pills or the two-column rail — the page already has clear hierarchy and the sport cards double as the D-042 launchpad; the reward/risk isn't there. (Mobile 390px capture didn't take through the tooling; mobile CSS in place but unverified visually.)
- **P5 (shipped):** team favorites MVP — `localStorage` set (`zs_fav_teams`, no PII, Cipher gate). A per-team `.hgc-star` on each home game card toggles a favorite; favorite-team games pin first in the Today's Games grid and the ticker, and get a +100 bonus in the hero leverage/marquee scoring so a favorite's game becomes the focal narrative. Deferred (noted, not blocking): a "My Team" headlines-rail tab and defaulting the pennant viz to the favorite's division.
**Contributors:** Vera (JTBD/states), Kael (hierarchy/hero/visual), Axiom (feasibility/live/ticker/edge), Relay (news+live+insights data), Folio (SEO/footer/meta), Cipher (favorites/privacy)
**Date opened:** 2026-07-06 | **Date resolved:** —
**Reference:** `docs/landing-page-gap-analysis.md` (ESPN gap analysis, audited 2026-07-12).

**Trigger (owner):** "I don't like the main home page / landing zone — complete overhaul." Owner scope answers: **stay ad-free** (skip the doc's ad slots + premium upsell — the clean, no-ads feel is the brand, per D-034 + the marketing); cover **Phases 1–6** (everything except monetization).

**Design principle (Kael, from the doc):** don't clone ESPN's editorial-first home — build the **analytics-first equivalent**: every module ESPN fills with *stories*, SportStrata fills with *data narratives*. **Protect the existing strengths** the doc flags: score ticker with finals, probable pitchers on cards, the Pennant Races strip, prominent ⌘K search, the clean no-ad feel, the dark identity. This is restructure + elevate, not rebuild — the news pipeline (`/api/news`, `loadNews`), MLB live-card states (`isLive`/`liveCount` in `_loadHomeTodayGames`), favorites/recents (IndexedDB `db.js` + `homeStarred`), and the per-sport ticker already exist to build on.

**Gates (Finn does not implement a phase until its gates are in ISSUES.md):**
- **Vera** — JTBD for the landing ("what matters today, in data"); hero **selection logic** (live-leverage → marquee matchup → yesterday's statistical anomaly, graceful fallback to standings/odds on no-games days); the three live-card states (UPCOMING/LIVE/FINAL) with win-prob/base-state/outs; favorites reorder behavior; all empty/loading/error states; a11y (F-pattern, focus, live-region for score updates).
- **Kael** — visual hierarchy pass (break the uniform density into 4–5 weights: hero > live games > pennant-races-as-viz > headlines rail > ticker); the Data-Story hero visual (generated data graphics + logo lockups, **no licensed photos**); demote sport-status cards to compact pills; hero must pass all active themes (`THEME_REVIEW.md`); every above-the-fold module gets ≥1 non-text visual (the doc's rule).
- **Axiom** — feasibility: live-card polling ≤30s (reuse `liveGame.js` infra, D-009); **sport-agnostic ticker schema** (`{sport,status,period,clock,...}`) refactor so NFL season needs no rewrite; home **edge-render** of today's games + headlines snapshot (D-041/D-045 pattern at `/` — the biggest SEO lever, doc 6.3); no layout shift (CLS < 0.1) when cards change state.
- **Relay** — data contracts: headlines from `/api/news` (relative timestamps); **Insights** templated stat bullets from the existing stat engine (no editorial staff — e.g. "whiff rate up 6pts over last 3 starts"); live game data (score/inning/outs/base/win-prob) source + TTL; ticker normalized schema.
- **Folio** — SEO/footer: dynamic-date-aware landing `<title>`/meta ("MLB Scores & Analytics — {date}"); full crawlable footer (teams, standings, tools, about, privacy/terms); freshness timestamps everywhere ("Updated Nm ago").
- **Cipher** — favorites in `localStorage`/IndexedDB (no PII, no account yet); no new external hosts (news/live reuse existing allowlisted upstreams); live-region announcements don't leak.

**Phasing (the doc's order, ads dropped):**
- **P1 — Live game states + ticker live parity** (Vera states, Kael live treatment, Axiom polling, Relay live data). Highest engagement ROI; MLB is mid-season so it's testable now. Acceptance: live game shows score/inning/outs/base within 30s; live cards sort first; no layout shift on state change.
- **P2 — Data-Story hero** (Vera selection logic, Kael visual, Axiom render). Fixes the "no focal point" problem; search moves below hero / into sticky header. Graceful no-games fallback.
- **P3 — Headlines + Insights rail** (Relay data, Kael layout). Fills the dead right side; reuses `/api/news`; Insights = templated data bullets.
- **P4 — Density/hierarchy + freshness pass** (Kael + Vera). Mostly CSS/layout + timestamps; Pennant Races promoted from thin strip to a viz module; sport-status cards → compact pills. Keep CLS < 0.1.
- **P5 — Favorites MVP** (localStorage first): star on any game/team → persists → reorders ticker + grid + weights hero + a "My Team" headlines tab.
- **P6 — Home SEO edge-render + sport-agnostic ticker schema** (Axiom + Folio): prerender today's games + headlines into the `/` shell for crawlers; ticker schema refactor before NFL-season traffic.
- **(P7 ads — dropped by owner.)**

**Cross-domain:** touches the home render, the ticker (backbone), and adds an edge-render at `/` → **Vera + Kael + Axiom consensus per phase**; live/news reuse keeps CSP unchanged. Doc-sync CLAUDE.md when the home render/ticker schema change (D-034 rule).

**Next:** owner ratifies the phasing; then P1 gates (Vera live-state spec + Kael live treatment + Relay live-data contract) land in ISSUES.md and P1 builds. Recommend starting P1 (live states) — highest ROI and live-testable during the current MLB season.
