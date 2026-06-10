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
**Status:** open — Priority 1 audit substantially complete, one view pending manual run
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
**Status:** open
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

