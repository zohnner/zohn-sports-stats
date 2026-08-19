# DECISIONS Archive — resolved/shipped/ratified, moved 2026-08-19

Decisions below are closed (complete/shipped/ratified/accepted/superseded) and dated before 2026-08-10. Moved verbatim from DECISIONS.md to cut session-start token cost (live file was ~489KB/2,569 lines). If a later request seems to reopen one of these, check here first — reopening a settled decision requires a new DECISIONS.md entry, not silent rebuilding.

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

---

## D-012 — NFL Promoted from Preview to Public Beta (Phase 2)
**Status:** complete — shipped + validated live 2026-06-14 (see D-014's status update below). Scope was set to LIGHT SURFACE (scores/standings/teams) and shipped as specified; deeper NFL work continued under D-015 onward.
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

---

## D-013 — NFL Data Source: ESPN via Pages Function Proxy (Sportsipy rejected on ToS)
**Status:** complete — ESPN proxy shipped + validated live 2026-06-14 (see D-014's status update below)
**Contributors:** owner, Cipher, Relay, Axiom, Folio

**Sportsipy rejected.** Sports-Reference's data-use policy explicitly prohibits building websites/tools on scraped data (sports-reference.com/data_use.html). SportStrata is a public site, so Sportsipy (an SR scraper) is a ToS violation — owner confirmed not to use it. It is also Python-only (can't run in the JS frontend) and scraper-fragile. No Sportsipy code ships (the scaffold started under the earlier ruling was left untracked and not committed).

**Chosen: ESPN via a same-origin Pages Function proxy** — `functions/api/nfl.js`, mirroring `functions/api/mlb.js`. Diagnosed live: ESPN's `/scoreboard` works from the browser, but `/teams` and `/leaders` are CORS-blocked client-side and the site `/standings` endpoint is dead (returns only `fullViewLink`). A server-side proxy fixes CORS and keeps the frontend same-origin (no new connect-src). Pages Functions confirmed live in production (`/api/mlb` responds). `js/nfl.js` `espnNFLFetch` now routes through `/api/nfl?path=...`.

**Standings:** ESPN site `/standings` has no data; standings will be derived from the `/teams` endpoint (records + a division map) — to be built against the real proxied payload after deploy, not guessed.

**Next:** push → validate `/api/nfl?path=/teams` & `/scoreboard` return real data via the live proxy → build NFL standings/teams parsing on verified shapes → surface NFL in the nav (sport switcher + tabs) + offseason state. ToS-clean, consistent with how MLB already works.

---

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

---

## D-019 — NFL Data Foundation: edge-cache from upstream (no D1), unified season model
**Status:** decided + shipped — owner 2026-06-15 ("strong NFL foundation, reference all past data, ready for the upcoming season")
**Contributors:** owner, Relay, Axiom, Folio

**Decision:** NFL stays **edge-cached from upstream** (ESPN / Sleeper / nflverse via Pages Functions + Cloudflare cache) — **no D1 persistence layer** for NFL for now (unlike MLB). Rationale: the upstream sources already cover all historical depth we need (leaders 2000+, stats/logs any season, NGS 2016+), cf-caching is fast + free, and a D1 archive adds ingestion/ops weight without a current need. Revisit only if upstream reliability or query needs change.

**Foundation shipped:** unified season model in `js/nfl.js` (`NFL_STATS_SEASON` / `NFL_FANTASY_SEASON` / min-season constants) replacing all hardcoded year strings (player-detail label, fantasy outlook, offseason copy) so the 2026 rollover is automatic and coordinated. Data source→coverage map documented in CLAUDE.md ("NFL Data Foundation"). Transition is automatic: season model flips in September, ESPN live endpoints populate, offseason empty-states clear.

**Next (D-018 roadmap):** projections/rankings, charts (reuse MLB), NFL comparison (reuse MLB compare).

---

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

---

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

---

## D-027 — Mock Draft "next level" (differentiator) — ACCEPTED + SHIPPED 2026-06-21
**Owner:** "set us apart from other NFL fantasy/stat sites; take the mock draft to the next level" — picked all four upgrades. Vera/Kael/Axiom/Relay. Supersedes the spirit of D-021 (drag-drop board proposal).

**Shipped (all client-side in `js/fantasy.js` + `.md-*` CSS):**
- **Draft Assistant** — real-time recommended pick + one-line reasoning blending value-vs-current-pick, lineup-aware need, tier scarcity, and Monte-Carlo survival; shown as a banner + ★ on the row. The standout differentiator (builds on the MC few free tools have).
- **Tiers + cliffs** — per-position ADP-gap tiers; list shows the tier and "N left in tier" with cliff urgency.
- **Format awareness** — Superflex (2-QB) + scoring (PPR/Half/Standard) now actually shift value, AI behavior, and needs via a documented position-multiplier heuristic; lineup-aware needs (starters → FLEX → bench). Previously scoring was a dead control.
- **Full draft board** — Players/Board toggle; all-teams × rounds snake grid with your column highlighted; also viewable post-draft.
- **Deep post-draft analysis** — projected finish vs league, positional-strength rank, best value / biggest reach, lineup-gap check (the old letter grade is kept as a sub-stat).

**Data reality (Relay):** Sleeper ADP only → tiers/value/need/Monte-Carlo are real; scoring/Superflex value is a labeled heuristic weighting, not fabricated projections. Future: a ToS-clean projections source would upgrade value/VORP. Verify on the `nfl-mock` route.

---

## D-029 — NFL standings: revive + multi-season + compete — SHIPPED 2026-06-22
**Trigger:** "users should still be able to view standings from previous years... compete with industry-standard NFL standings pages; keep MLB synergy but don't be limited by it."
**Finding:** the old NFL standings read site.api.espn.com/.../standings, which ESPN reduced to a dead `fullViewLink` stub — so standings were broken in-season too, not just offseason. Root-cause fix, not just a history add-on.
**Shipped (Relay/Vera/Kael/Axiom/Cipher):** new `functions/api/nflstandings.js` proxy to the working `site.web.api.espn.com` standings feed (season-parameterized, 2002+; past seasons immutable -> 7-day edge cache, live season 30m). New `js/nflStandings.js` + `css/nflStandings.css` **redefine** loadNFLStandings/displayNFLStandings/fetchNFLStandings (loaded after nfl.js; the nfl.js versions are now dead). Features: season selector back to 2002; **Division view** (default, MLB-synergy cards) + **Conference playoff-seeding view** (1–N with a season-aware cut line: 7 seeds 2020+, 6 before); seeds computed from ESPN or via NFL rule (4 division winners over wildcards, tiebroken by win%/diff); seed + division-winner badges, point-differential bars, Super Bowl champion/runner-up tags (static map 2002–2025, canonical-abbr matched); a **mini playoff bracket** (wild-card seed pairings + byes + the Super Bowl result). Default season = last completed (`NFL_STATS_SEASON`), so the page is alive year-round — supersedes the standings offseason empty-state from P3-029. SW v42 -> v43.
**Open:** real playoff-round results inside the bracket (currently seed pairings + final); team-page links use ESPN abbr (WAS->WSH handled).
**Update 2026-06-22 (postseason + team colors):** Bracket now shows **real postseason results** — `js/nflStandings.js` `fetchNFLPostseason()` pulls ESPN `seasontype=3` weeks 1/2/3/5 (Wild Card → Divisional → Conference → Super Bowl; the wk4 Pro Bowl is filtered by a real-team check), and `_nstdRealBracket()` renders a full AFC-left / NFC-right bracket with seeds, scores and winners (losers dimmed, SB champion tagged). Falls back to the seed-pairing preview for any season without results. Separately, NFL player cards + profile avatars now use a curated **team color** (`getNFLTeamColor()` in `js/nfl.js`) instead of the position color; the position chip stays position-colored. SW v44 -> v45.

---

## D-032 — MLB accuracy hotfix: self-healing wRC+ constants, IP-thirds FIP, stat test harness — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 2). Verified in source: it is the 2026 season and `_computeBattingRates` was silently computing wRC+ with **2024** guts constants (`_MLB_WRC_CONSTANTS` had no 2026 entry → fallback), and FIP parsed `inningsPitched` with `parseFloat`, reading "100.2" (100⅔) as 100.2.
**Shipped (Relay design, Axiom implementation):**
- `_ensureWrcConstants(season)` (mlb.js) — for any season without a static entry, derives `lgwOBA` + `lgR/PA` from MLB Stats API league hitting totals (`/teams/stats`, 30-team sum, DAILY cache) using the **same 2024 linear weights as player wOBA** — self-consistent by construction. `wOBAscale` carried from the latest static year. Derived entries marked `{ derived: true }`; awaited in `fetchMLBLeagueStats`, kicked off at boot and on season change. Fallback is now 2025 (latest static), and a fallback can never render undaggered.
- `_wrcDagger()` — single source of truth for the †: shown when constants are missing, derived, or preliminary (2025 flagged `preliminary: true`).
- FIP now converts IP thirds via the existing `_mlbIpToNum()` instead of `parseFloat`.
- **`tests/stats.test.js`** — first tests in the repo: `node --test tests/`, zero deps, loads mlb.js in a vm sandbox with browser stubs. Hand-verified fixtures for `_computeBattingRates` (ISO/BABIP/BB%/K%/RC/SB%/wOBA/wRC+), `_computePitchingRates` (FIP/K-BB%/LOB%/QS%), the IP-thirds conversion, the dagger rules, and the constants derivation (including the partial-league guard). Added to the pre-push checklist in CLAUDE.md.
- Park factors: still the 2022–2024 B-Ref averages — no fetchable feed, so refresh stays a manual owner/Relay pull. OPEN item in ISSUES.md; annual-maintenance note updated in GOALS.md.
**Verification:** `node --check` clean, 7/7 tests pass, NUL-byte check clean. SW v46 → v47.

---

## D-034 — Identity ratified: two-season barbell + no-login constitutional rule; GOALS.md v2; doc pruning — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 1). GOALS.md v1 contradicted the decision log on four axes (G4 vs D-031 accounts, G6 vs D-012 NFL beta, Non-Goals vs R4 DFS, R1–R5 vs everything).
**Owner decision:** SportStrata is a **two-season barbell** — MLB broadcast/desk reference in baseball months, no-login NFL fantasy edge tool in football months; shared spine of no friction, visible provenance, correct math. **Constitutional rule:** the no-login experience must never regress; accounts (D-031) are additive-only, forever. D-031 proceeds under that rule.
**Shipped (Folio):** GOALS.md v2 (vision, G4, G6 amended; R1–R5 retired and re-scoped to a single freemium-later paragraph consistent with D-031; annual-maintenance updated). CLAUDE.md truth-audit: stale P1-006 "critical bug" section replaced with resolved status + a standing **doc-sync rule** (shipping decisions must touch CLAUDE.md in the same commit when they change architecture/rules), script load-order corrected (five missing files), api.js key-file row fixed, tests added to the pre-push checklist. Superseded/contradictory docs archived to `docs/archive/` (fixit.md, suggestions.md, reflection.md) with an index README.
**Deliberately not decided here:** NBA/NHL fate (owner call, separate entry), arcade nav placement (Kael, with D-026 P2 work).

---

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

---

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

---

## D-037 — /deploy-check becomes the de facto CI — SHIPPED 2026-07-01
**Trigger:** deep-review 2026-07-01 (initiative 7, cross-cutting finding X3): the buildless architecture's conventions (hand-maintained script chain, SW precache list, 14-theme token system, name-based joins) had no enforcement — and the very first run of the manifest checker proved the point: **`js/fantasy.js` and `js/sos.js` had been missing from `sw.js` STATIC_ASSETS since they shipped** (SW versions were bumped; the asset list wasn't). Fixed in this commit.
**Shipped (Axiom; Kael calibrated the theme contract; Relay the join probe) — three zero-dep Node tools + four new deploy-check steps:**
- `tools/check-manifest.cjs` — index.html ⇄ sw.js STATIC_ASSETS ⇄ disk, with a lazy-load exception list (math.min.js). Exit 1 on drift. Deploy-check #10.
- `tools/check-themes.cjs` — parses every `[data-theme]` block in variables.css (hex/rgba/var() resolution, alpha compositing over bg), checks WCAG contrast on the core token pairs (text-primary 4.5, text-secondary 4.5, text-muted 3.0, accent 3.0). Report-only until existing debts clear, then `--strict` gates; any NEW theme must pass clean. All 14 current themes pass the component-level thresholds. Deploy-check #11.
- `tools/join-health.cjs` — LIVE probe (run against the deployed site): Sleeper⇄nflverse veteran name-join rate among top-200 ADP skill players, rookies excluded from the denominator (legitimately unmatched). WARN <90%, FAIL <80%. Mirrors `_vbdKey` — keep in sync. Deploy-check #13, recommended weekly in-season.
- Deploy-check additions #9 (unit tests) and #12 (NUL-byte corruption scan on changed files — this working tree has a corrupted-write history).
**Verification:** manifest checker green after the sw.js fix; theme checker 0 errors / 14 themes; 12/12 unit tests pass; all tools `node --check` clean. Join probe validates against the live deploy after push.

---

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

---

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

---

## D-043 — Home hub follow-on: tabbed scoreboard, seasonal promo, cross-sport search
**Status:** COMPLETE 2026-08-02. Ratified (owner, via D-058) with sequencing **3c (cross-sport search) → 3b (seasonal promo) → 3a (tabbed scoreboard)**; all three built, verified, and live-verified on production in that order the same day. Full build/verification detail for each sub-item is in ISSUES.md under "D-043 3c/3b/3a — ... gates + implementation".
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

---

---

## D-044 — Cross-sport frame parity: unify player + team detail (and view chrome) across MLB/NFL/NCAAF
**Status:** complete — P1 through P5 all built and verified at the render/data level, per the entry's own final 2026-07-06 update ("D-044 P1–P5 all built and verified"). Remaining items (MLB player detail onto the shared frame, NFL leader-row tabindex parity, a native-load pass) are opportunistic follow-ons, not blocking.
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

---

## D-048 — Brand redesign: engineered near-black, Space Grotesk, semantic + chart layers, motion language (phased migration) — ALL 7 PHASES SHIPPED

**Decision (2026-07-26):** Supersede the "orange on deep navy" identity with a redesigned system aimed at a serious analytics posture (StatMuse × Baseball Savant × Bloomberg Terminal). Owner-driven; verified token set drafted + WCAG-checked before code. **Dark is default; light is a supported, accessible (not default) alternate.**

**What changes:** (1) surfaces off navy #060c18 → engineered near-black ramp (#0d1014 → #f5f7fa); (2) brand orange #ff8100→#FF7A00 + lighter interaction orange + dark "brand-ink" for orange-on-light; (3) semantic layer (win/loss/live/info) carved from brand — rules "never +/- by color alone (▲▼)" and "live = pulse+badge, not a fill"; (4) dedicated 6-color chart categorical (orange = focal series only; min pairwise ΔE ≥ 31; chart-pink ΔE 39 from live-pink); (5) type split — Space Grotesk (display) + Barlow Semi Condensed (numerals) + Inter (body), no Orbitron; (6) control-center visual language — load-bearing 1px borders, restrained shadows, streak-motif motion (animate data, not UI).

**Method:** value-swaps on EXISTING token names in variables.css (components update for free) — no mass rename. One PR per phase, each gated by `check-themes.cjs --strict` + live screenshots, each revertible.

**Phases:** 1 Foundation (surfaces+text→near-black) · 2 Brand orange · 3 Semantic layer · 4 Chart palette + StatsCharts · 5 Typography · 6 Visual language · 7 Light-mode parity + measure/lock.

**Phase 1 shipped (this commit):** variables.css :root dark — bg-base/surface/raised/card/card-hover/overlay → neutral near-black; text-primary/secondary/muted/subtle/disabled → neutral ramp (was navy-tinted). check-themes --strict green (0/0 across dark/light/nl-monarchs). Accent/semantic/stat/NFL/tier tokens unchanged (later phases). Light + nl-monarchs untouched. DESIGN.md navy line amended.

**Supersedes** D-047's "brand = orange on deep navy" and DESIGN.md "no brand refresh to chase." D-047 cohesion machinery (scorebug, token discipline, check-themes gate) retained and reused.

**Doc-sync correction (Folio, 2026-07-31):** this entry was never updated past Phase 1 despite all 7 phases actually shipping (`git log` confirms Phases 2–7 committed through 2026-07-26, plus two bonus logo/wordmark commits) — a real instance of the doc-sync rule this same page states ("any decision that ships must touch CLAUDE.md/DECISIONS.md in the same commit"). Found during a 2026-07-31 team session when the owner asked to "resume brand work" based on this page's stale status. Full phase log for the record: **Phase 2** (`e768a69`, brand orange refine — `--accent`/`--accent-light`/`--brand-ink` now the shipped D-048 values in `variables.css`), **Phase 3** (`559ca60`, semantic layer), **Phase 4** (`984ca01`, chart categorical palette + StatsCharts), **Phase 5** (`3030577`, Space Grotesk typography), **Phase 6a** (`c93716e`, load-bearing borders), **Phase 6b** (`e5acf3e`, streak-motif loader), **Phase 7** (`ba28faf`, light-mode parity). Plus `8ffe6b6`/`8f75dbf` (new data-bar S logo + split wordmark). D-048 is complete — nothing left to resume here.

---

## D-059 — Site-wide security sweep (post-D-031): JSON-LD script-injection defense-in-depth — SHIPPED 2026-08-04
**Trigger (owner):** "let's continue improving this and make sure it is secure," after D-031's own security review closed.

**Scope:** the D-031 review only covered the new auth code. This pass went broader — Cipher's lens applied to the rest of the site: every SEO edge-render Function (17 files under `functions/{mlb,nfl,ncaaf}/`+`functions/index.js`+`functions/glossary.js`), secrets hygiene sitewide, CSP sync, and the read-only `/api/*` proxy layer's SSRF/injection surface.

**Found and fixed:** all 18 edge-render Functions embed a `JSON.stringify()`-built `jsonld` string directly inside a `<script type="application/ld+json">` tag with no neutralization of `<` characters. If any upstream field (MLB Stats API / ESPN player names, headlines, team names) ever contained the literal sequence `</script>`, it would prematurely close the script tag in HTML served to real browsers — these pages are explicitly "same HTML for humans and bots," so this isn't a bots-only surface. Practical likelihood is low (these are curated upstream sources, not directly attacker-writable), but it's a real, uniform gap across the entire SEO surface and a one-line fix per file, so it's closed as defense-in-depth rather than left as an accepted risk: `${jsonld}</script>` → `${jsonld.replace(/</g, "<")}</script>` in all 18 files (mechanical, identical pattern everywhere — applied via a small script, `node --check` clean on every file, NUL-byte scan clean).

**Checked and clean, no changes needed:**
- **Secrets hygiene:** grepped `js/`, `functions/`, `worker/` for hardcoded key/secret/token patterns — none found, consistent with P1-006's resolved status.
- **CSP sync:** `_headers` and `index.html`'s meta tag are byte-identical, as CLAUDE.md's own rule requires.
- **SSRF / path injection in `/api/*` proxies:** spot-checked `sleeper.js`, `nfl.js`, `nflathlete.js` — every proxy hardcodes its upstream host and either matches the request path against a strict allowlist regex (`sleeper.js`, `nfl.js` and the same pattern in the other sport proxies) or sanitizes a dynamic id to digits-only before interpolating into the upstream URL (`nflathlete.js` and the same pattern elsewhere). No user input can redirect a server-side fetch to an arbitrary host.

**Known, already-disclosed, not re-opened here:** `script-src 'unsafe-inline'` in CSP is a real weakening of XSS protection, already tracked as a fast-follow "required before any paid tier" per D-031's 2026-06-22 spike note — not new, not re-litigated in this pass. Also noted but not acted on: the SEO edge-render Functions live outside `/api/`, so `functions/api/_middleware.js`'s rate limiting doesn't cover them (documented as fact in CLAUDE.md already) — each unique id/path is a cache-miss that costs an origin fetch, so a determined scraper varying ids could generate real upstream load without hitting any limit. Worth a root-level `functions/_middleware.js` at some point; not done in this pass since it's a new code path, not a fix to an existing one, and the sweep's scope was auditing what exists.

**Also shipped in this session, same "make it secure" push:** `worker/auth-purge.js`'s `/__run` endpoint (flagged as the one D-031 review finding) is now gated behind a shared-secret header — see D-031's entry above for detail.

---

---

## D-060 — Follow system merged to one implementation; NBA follows silently unsynced since launch — SHIPPED 2026-08-05

**Trigger (owner):** "we need to merge the two, star going forward" — after wiring the D-031 follow star onto every sport's cards/detail pages, MLB and NBA player cards still carried a separate, older localStorage-only heart-favorite system, visually duplicating the new star.

**Merge:** `AuthState.follows` / `renderFollowStar()` (`js/auth.js`) is now the single favorite/follow implementation for every sport and surface. Removed outright, not deprecated: the standalone `zs_fav_teams`/`_getFavTeams`/`_isFavTeam`/`_toggleFavTeam` system (MLB team favorites, `app.js`), the `zs_mlb_favs`/`_toggleMLBFav` system (MLB player favorites, `mlb.js`), and `AppState.favorites`/`isFavorite()`/`toggleFavorite()` (NBA player favorites, `api.js`/`players.js`) — along with their dead CSS (`.hgc-star`, `.mlb-fav-btn`, `.fav-btn`). `_migrateLegacyFavorites()` one-time-folds all three old `localStorage` keys into the unified `zs_follows` set on first load after the merge, so no user loses a favorite. An `ss:follow-changed` `CustomEvent` decouples `auth.js` from the surfaces (home game sort, ticker sort, Starred rail) that need to react to a follow toggling.

**Found during the merge's own security check, not reported by anyone:** `functions/api/follows.js`'s server-side `VALID_SPORTS` allowlist (`['mlb', 'nfl', 'ncaaf']`) was never updated when the follow star was extended to NBA cards. Every NBA follow from a signed-in user was silently rejected (400 `invalid_follow`) and swallowed by `toggleFollow()`'s local-fallback catch — no console error, no user-visible failure, just permanent non-sync for that one sport. Fixed by adding `'nba'` to the set, with a comment at the fix site explaining the failure mode. This is the kind of gap the merge itself made easy to introduce (one more sport, one more place the allowlist needs to match) — CLAUDE.md's "What NOT to Do" now carries a standing rule: any sport newly wired into `renderFollowStar()` must add itself to `VALID_SPORTS` in the same commit.

**Also covered in this session's broader documentation/security pass:** CLAUDE.md itself had drifted out of sync with the code it documents — the script load order was missing three files (`detailFrame.js`, `auth.js`, `scorebug.js`), the Key Files table had no entry for any of the D-031 auth/follows infrastructure, and the Home Data-Story hero section still described the just-deleted `zs_fav_teams` system as current. All fixed in the same pass, per the project's own doc-sync rule (Folio, 2026-07-01: any decision that ships must touch CLAUDE.md in the same commit if it changes architecture, load order, key files, or a documented rule). AGENTS.md re-synced to match. README.md's "No accounts" claim, stale `migrations/` description, and missing NCAAF/accounts sections corrected to reflect current state. No other security findings — `functions/api/prefs.js` and `functions/api/me.js` re-checked and remain session-scoped and parameterized; no SQL injection surface; D1 `follows`/`prefs`/`me` tables have no CHECK constraint on `sport`, so the app-level `VALID_SPORTS` fix was sufficient with no migration needed.

---

---

## D-061 — Reconcile "no-login" messaging post-D-031; make sign-in's benefit legible — SHIPPED 2026-08-07

**Trigger (owner):** "after pushing logins we need to verify the site is now free of 'no login ever' — we need to consider how to keep the site free, but logging in is of benefit. be sure to loop in the team for full workflow."

**Ground truth confirmed before touching anything:** the *product policy* here was never in question — D-034's constitutional rule ("the no-login experience must never regress; accounts (D-031) are additive-only, forever") is correct, already ratified, and GOALS.md's own "Current State"/G4 sections already describe it accurately. The actual problems were narrower and different in kind: (1) three specific docs still asserted the pre-D-031 absolute claim ("no-login MLB analytics dashboard" / "free, no-login sports analytics platform") as if accounts didn't exist, and (2) — the more consequential gap — the product itself never explained *why* a visitor would ever bother signing in. The sign-in sheet said "Sign in" and offered three buttons with zero context. `js/auth.js`'s own code comment already articulated the real value prop ("an account only adds cross-device sync") — it just never made it into the UI a visitor sees.

**Team round (Vera/Kael/Axiom/Folio), gates landed in ISSUES.md:**
- **Vera:** a single honest sentence in the sign-in sheet's initial state, dynamic when the visitor already has local follows (concrete — "sync your 3 follows"), generic-but-honest otherwise. Not a nag banner outside the sheet; the header pill's low-key "Sign in" text stays as-is.
- **Kael:** reuse `.auth-sheet-note` (already exists in css/auth.css, plain secondary-color text) — no new CSS, no urgency styling, no color escalation.
- **Axiom:** trivial to implement — `AuthState.follows` is already a populated `Set` at sheet-render time (loaded synchronously at script bootstrap), so the copy needs zero new fetch/schema/endpoint.
- **Folio:** three stale-doc fixes identified — `CLAUDE.md` line 5, `README.md` line 5 (both asserted whole-product "no-login," now false), `GOALS.md`'s pre-D-031 "no-account tier" planning section (an open-question snapshot that now contradicts the rest of the same file, since the question it poses was answered by D-031/D-034).

**Shipped:**
- `CLAUDE.md`: Identity/Product line corrected to state every core feature works fully signed-out forever (D-034), with an optional additive account (D-031) for cross-device sync — never required.
- `README.md`: opening line corrected from "free, no-login sports analytics platform" to "free sports analytics platform" + a line naming the signed-out-by-default / optional-account reality (lines 16-22 further down the same file already had this right — only the top line was stale).
- `GOALS.md`: the pre-D-031 "no-account tier" section (lines ~341-347) is now explicitly marked historical with a note pointing to D-031/D-034 and the file's own "Current State" section — kept, not deleted, since it's the real reasoning trail that led to the account-tier decision.
- `js/auth.js`: new `_authBenefitCopy()` helper + a `.auth-sheet-note` line inserted at the top of `_renderAuthSheetChoices()`'s body template — reads `AuthState.follows.size` and shows either "Sign in to sync your N follows across devices — everything already works signed out" or the generic "An account only adds cross-device sync for your follows — everything here works fully signed out" when there's nothing local to reference yet.

**Verified:** `node --check` clean on `js/auth.js`.

**Committed:** `sw.js` `CACHE_NAME` v135→v136, commit `e58d4a9`.

---

---

## D-062 — site.api.espn.com WAF block: NFL scores + 5 other endpoints silently broken — SHIPPED 2026-08-07

**Trigger (owner):** "nfl scores are not loading properly, we need to debug to be ready for preseason" — reported the day after the real Week 1 preseason slate started (Thu Aug 6, CAR@ARI).

**Reproduced:** `/#nfl-games` loaded, but showed the offseason banner ("live scores return in September") instead of the real Aug 6 game, and the one game card rendered had no score and a missing Panthers logo. Console showed the real cause immediately: `NFL API 403` from `espnNFLFetch` in `js/nfl.js`.

**Root-caused, and it's bigger than the reported page:** `functions/api/nfl.js`'s upstream, `site.api.espn.com`, is returning an Akamai "Access Denied" WAF block (`Reference #18.d9b2d717.1786`) to every path (`/teams`, `/standings`, `/scoreboard`, `/news`) — confirmed by hitting all four through the live proxy and getting 403 on each. Confirmed this is host-specific, not a general ESPN outage or a problem with our request shape: `sports.core.api.espn.com` (used by `nflstats.js`) and `site.web.api.espn.com` (used by `ncaafstandings.js`) both kept returning clean 200s throughout testing. Grepped every `functions/api/*.js` for `site.api.espn.com` and found it's the shared upstream for **six** endpoints, not just the one reported: `nfl.js` (scores/teams/standings — the reported bug), `ncaaf.js` (NCAAF scores/teams/standings/rankings — same clone, same host, same 403, not yet reported but confirmed live), `news.js` (NFL **and MLB** headlines — confirmed live that `/api/news?sport=mlb` also 403s, meaning the primary sport's home headlines rail was silently down too), `nflsos.js` (Strength of Schedule's per-week scoreboard fetch), `nflplayer.js` (the roster-lookup half of NFL player-card stats — degrades silently to `{found:false}`, no visible error), and `ncaafstats.js` (the team-abbr/logo map for CFB leaders — degrades silently to leaders with blank team/logo, no visible error). The last two are the more concerning class of bug: they don't throw or show an error state at all, they just quietly return incomplete data.

**Fix:** every `fetch()` call targeting `site.api.espn.com` across the six files now sends a browser-realistic `User-Agent` header (`Mozilla/5.0 ... Chrome/128.0.0.0 ...`) alongside the existing `Accept: application/json`. This is the standard remediation for this exact class of WAF block (Akamai and similar edge WAFs commonly flag empty/library-labeled User-Agents as bot traffic) and has direct precedent in this repo: `functions/api/mlb.js` already carries a `User-Agent: SportStrata/1.0` header, added for a comparable upstream-blocking issue against the MLB Stats API. `sports.core.api.espn.com` and `site.web.api.espn.com` calls were left untouched — they were never blocked, and touching working code outside the diagnosed root cause isn't warranted.

**Honest limitation, disclosed rather than hidden:** this fix could not be live-tested from this sandbox — egress to `espn.com` is blocked here (confirmed: direct `curl` to `site.api.espn.com` from the sandbox shell times out/fails to route, same as `sportstrata.cc` itself is unreachable directly and had to be checked via the browser tool instead). The header change is standard, precedented in this exact codebase, and low-risk (additive, no behavior change if it turns out not to be sufficient — the existing 403 passthrough / graceful-degradation paths are untouched as a fallback), but **the real proof is the first live check after deploy**, not this session. If the User-Agent alone doesn't clear the block, the next lever is migrating these six endpoints off `site.api.espn.com` onto `site.web.api.espn.com` (already proven reachable, already used for NCAAF standings) — a bigger change, not attempted here since the shape of `site.web.api.espn.com`'s scoreboard/teams/news responses relative to `site.api.espn.com`'s is unverified and swapping hosts blind risks trading one silent failure for another.

**Verified:** `node --check` clean on all 6 touched files. NUL-byte scan clean. `tools/check-manifest.cjs` clean (server-side Functions aren't part of the client asset manifest — no `sw.js` bump needed for this change). No live verification possible pre-deploy (see limitation above).

**Update 2026-08-07 (same day, post-deploy) — the User-Agent fix above did NOT clear the block; root-caused further and shipped the real fix.** Live-checked immediately after the owner pushed: `/api/nfl?path=/scoreboard` still returned 403 with a fresh Akamai reference number (not a stale cache — confirmed via a cache-busting query param + `cache: 'no-store'`). That ruled out User-Agent/bot-signature as the actual mechanism. Decisive test: navigated a real Chrome tab directly to `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard` (a completely different network path than Cloudflare's Function egress, no CORS involved since it's a direct navigation, not a fetch) and got a clean 200 with real data. That proves the block is specific to Cloudflare's egress IP range hitting `site.api.espn.com`, not a general host outage and not fixable with request headers. Since `sports.core.api.espn.com` (nflstats.js) was never blocked, this looked like a host-specific WAF rule rather than a blanket Cloudflare ban — so tested whether a *different* ESPN host serves the same data: direct-navigated to `site.web.api.espn.com/apis/site/v2/sports/football/nfl/{scoreboard,teams,news,teams/12/roster}` and `.../college-football/scoreboard` and `.../baseball/mlb/news` — all six returned clean 200s with response shapes byte-identical to what `site.api.espn.com` used to serve (confirmed by inspecting the JSON directly, not assumed). `site.web.api.espn.com` mirrors the entire `/apis/site/v2/...` path family, not just the `/apis/v2/...` standings-specific paths `nflstandings.js`/`ncaafstandings.js` already used it for.

**Real fix:** swapped the upstream hostname from `site.api.espn.com` to `site.web.api.espn.com` in all six files (`nfl.js`, `ncaaf.js`, `news.js`, `nflsos.js`, `nflplayer.js`, `ncaafstats.js`) — every path string these files already build is unchanged, since the two hosts serve the identical API surface. The User-Agent header stays (harmless, still correct defense-in-depth against a genuine bot-signature block elsewhere) but is no longer the thing doing the work. `node --check` clean on all 6. NUL scan clean. `check-manifest.cjs` clean (server-side Functions aren't client assets).

**Committed:** `98c280a`. **Live-verified 2026-08-07:** after the owner pushed, production still 403'd for ~40s (build/deploy propagation lag, not a code problem — confirmed by the error page itself still naming `site.api.espn.com`, the old host, meaning the new code hadn't gone live yet), then flipped to 200 on all six affected endpoints (NFL scoreboard/teams, NCAAF scoreboard, MLB news, NFL news, NFL player stats). `/#nfl-games` renders the real Thu Aug 6 result (CAR 33, ARI 30, Final) with both team logos loading and zero console errors on a fresh reload. D-062 fully closed.

---

---

## D-063 — NFL season-phase model: fix the "between seasons" banner showing during real preseason — SHIPPED 2026-08-07

**Trigger (owner):** "lets clean up the 'nfl is between seasons' we need to build better logic so that it handles any time of year cleanly," immediately after D-062 fixed the underlying data outage and made it obvious the copy problem was separate and still live.

**Root cause:** `_nflIsOffseason()` in `js/nfl.js` was a single binary flag — `getMonth()+1 >= 3 && <= 8` — treating all of March through August as "offseason." That was wrong for four real weeks every year: NFL preseason games air throughout August (the game D-062 fixed, CAR@ARI, played Aug 6), and that binary had no way to represent "games are happening, they just don't count toward the record yet." Every offseason-gated surface — the cross-page dismissible strip, the Scores/Teams/home-hero copy — inherited the same blind spot. Confirmed via a direct comparison that NCAAF's equivalent (`_ncaafIsOffseason()`, Feb–Jul only) already drew this line correctly; NFL was the outlier, not the pattern.

**Fix — a real 4-state model, not a wider binary:** `_nflSeasonPhase()` now returns `'offseason' | 'preseason' | 'regular' | 'postseason'` from calendar-day heuristics chosen against NFL scheduling rules that don't move year to year (season opener is always the Thursday after Labor Day, never before Sep 4; the Super Bowl has been in February every year since the league's last date move, so day≤14 safely clears every actual Super Bowl Sunday without a lookup table). Verified exhaustively: a day-by-day simulation across all 366 days of a sample year confirms every day maps to exactly one phase, all four phases are reachable, and no day is unclassified.

Two derived helpers replace the single old boolean, because the call sites actually needed two different questions answered, not one:
- `_nflIsOffseason()` = `phase === 'offseason'` — narrow: "is there genuinely nothing on the board." Now correctly excludes August.
- `_nflHasNoOfficialRecord()` = `offseason || preseason` — broader: "are records/standings still 0-0." Preseason results never count toward the official record, so team pages still correctly show the 0-0 explainer through August even though real games (and real final scores) exist.

**Shipped:**
- `js/nfl.js`: the phase model itself; `_nflHasNoOfficialRecord()` now gates the Teams page 0-0 note (was `_nflIsOffseason()`, which would have gone silent in August under the new narrower definition and left an unexplained 0-0 on every team). `loadNFLHome()` gets a real third branch: preseason shows its own kicker ("NFL Preseason"), hero text, chip order (Scores first, not buried behind Mock Draft), tile subtitles ("Preseason live" / "Opens at kickoff"), and section title ("Preseason Games") — distinct from both the offseason draft-countdown framing and the in-season "This Week" framing.
- `js/navigation.js`: the literal reported string — "NFL is between seasons — live scores return in September" — replaced with "NFL is in the offseason — preseason returns in August, the regular season in September." This strip is gated by the now-narrower `_nflIsOffseason()`, so as of this fix it simply stops appearing once real preseason games are on the board — no visitor sees a stale banner sitting next to a real score anymore.
- `js/app.js`: `_promoMoments()`'s `'nfl-live'` home-promo entry was implicitly riding on the old `_nflIsOffseason()` semantics (`!_nflIsOffseason()`) — under the new narrower definition that would have started firing in August too, silently overriding the existing, deliberate "Draft Season" promo that's supposed to own July–August (a real design decision from D-043, not accidental). Decoupled it: the promo's active-window check is now an explicit, literal `m >= 9 || m <= 2`, preserving its exact prior effective behavior instead of inheriting a meaning that had just changed out from under it.
- `CLAUDE.md`: documented `_nflSeasonPhase()`/`_nflIsOffseason()`/`_nflHasNoOfficialRecord()` in the NFL Data Foundation section, with an explicit "don't reintroduce a single Mar–Aug boolean" warning naming this exact bug, per the doc-sync rule.

**Verified:** `node --check` clean on `js/nfl.js`, `js/navigation.js`, `js/app.js`. NUL scan clean. `tools/check-manifest.cjs` clean. `tools/check-themes.cjs` clean (same 2 pre-existing unrelated warnings tracked since D-058). Phase function exhaustively simulated day-by-day for full coverage (see above) before touching any UI code.

**Committed:** `674cc10`. **Live-verified 2026-08-07:** navigated `/#nfl-games` fresh (through an intermediate page load, not a same-URL reload — same-URL reloads on this Chrome instance intermittently restored a stale prior render regardless of SW cache state, a browser-session artifact unrelated to the fix itself) — the "between seasons" banner is gone, replaced by the real preseason game the banner used to contradict (CAR 33–30 ARI, Final, Thu Aug 6). SW cache (`sportstrata-v137`) directly inspected and confirmed to contain the updated code in all three touched files before the render was re-checked. Note: `/#nfl-home` currently resolves through the D-045 sport-landing route (`_renderSportLanding`), not `loadNFLHome()` — the preseason hero/kicker/tile copy this fix added to `loadNFLHome()` is correct but currently unreachable via that route (pre-existing since D-045, not introduced by this fix); flagged, not fixed here, since it's out of this decision's scope.

---

---

## D-071 — NFL Scores page: week/season navigator replaces the single-game default — SHIPPED 2026-08-09

**Trigger (owner):** "we need to consider the nfl scores view, right now only the first pre season game, users should be enticed to surf around the scores page."

**Root cause:** `fetchNFLScoreboard()` (`js/nfl.js`) called ESPN's `/scoreboard` with zero query params, every single time, at every one of its 6 call sites. ESPN's own zero-param default resolves to whatever it considers "today's window" — during this week of August that's exactly one Hall-of-Fame-adjacent preseason game. There was no bug in the data pull itself (the one game shown was real and correctly fetched); the actual problem was that the Scores page offered no way to see anything beyond that one narrow window — no path to yesterday, next week, the regular season, or last year's playoffs. "Users should be enticed to surf around" is a browsing-affordance gap, not a data gap.

**Fix, not a new data source:** `fetchNFLScoreboard(opts)` now accepts optional `{seasontype, week, season}`, forwarded to ESPN as `seasontype`/`week`/`dates` — reusing, verbatim, the exact three param names `nflStandings.js`'s `fetchNFLPostseason()` already proves work in production (`seasontype=3&week=${wk}&dates=${season}`), rather than guessing a new contract against ESPN's undocumented API. `opts` defaults to `{}`, so all 5 pre-existing zero-arg callers (home hero, team detail, ticker refresh) are untouched.

`loadNFLGames()` now renders a persistent navigator strip above the grid (`_renderNFLScoresNav()`): a "Today" pill (the original default), Preseason/Regular Season/Postseason tabs, and a horizontally-scrollable week-pill row underneath (3 preseason weeks — confirmed against the real 2026 schedule structure, Hall of Fame Game bucketed into week 1 plus 3 real preseason weeks, not a guessed 4; 18 regular-season weeks; 5 postseason slots using the Wild Card/Divisional/Conference/Pro Bowl/Super Bowl labels already established in `nflStandings.js`'s own header comment). Visual language matches this file's own existing convention exactly — the inline-style pill chips already used for `_NFL_POS_FILTERS` on the Players tab — no new component system, no CSS-class-based control introduced into a file that already has its own established pattern.

**Two judgment calls worth naming:**
1. The site-wide live ticker (`updateNFLTicker`) only ever updates from the real "Today" fetch (`if (!_nflScoresFilter) updateNFLTicker(games)`) — a visitor browsing to Preseason Week 1 of a past season should never push stale scores into the header ticker other pages also read from.
2. The strip is nfl-games-only by design, but nothing in the existing per-view render loop removed it when navigating away — added an explicit `document.getElementById('nflScoresNav')?.remove()` in `_renderNFLView` for every other NFL view, mirroring the exact cleanup pattern `_syncNFLOffseasonStrip` already established for its own element.

**Scope:** a bounded fix to an existing view — no three-gate spec, no new page, no schema/API change. `functions/api/nfl.js`'s existing param passthrough required zero server-side changes.

**Status:** shipped. Verified: `node --test` (33/33 pass), manifest sync clean, no NUL corruption, true-diff scoped to exactly `js/nfl.js` / `js/navigation.js` / `css/main.css`.

---

---

## D-075 — Live-verifying the Highlight Card entry point surfaced a real bug: game detail view getting stomped by the live-score poll — FIXED 2026-08-09

**Status:** accepted
**Contributors:** Axiom (root cause + fix)
**Date opened:** 2026-08-09 | **Date resolved:** 2026-08-09

**What happened:** While live-testing the new "Create Highlight Card" entry point from the MLB game detail view (added same day, see the Highlight Card Studio entry in ISSUES.md), the detail view itself was observed reverting back to the games list ~2-4 seconds after opening — hash stayed on `#mlb-game-{pk}`, but the rendered content snapped back to the score grid. Reproduced consistently while a game was live elsewhere in the day's slate (SEA @ TB).

**Root cause:** `showMLBGameDetail()` (`js/mlb.js`) is invoked directly via `onclick`, bypassing `navigateTo()` — which is normally what sets `AppState.currentView`. It never set `AppState.currentView` itself, so the value stayed `'mlb-games'` from whatever view the user was on before clicking in. `setupMLBLivePolling()`'s 30s live-score refresh (`js/app.js`) guards its games-list re-render on exactly that field (`if (AppState.currentView === 'mlb-games') loadMLBGames()`) — with the stale value, the next poll tick re-rendered the games list straight over the open detail view, unconditionally, any time a game anywhere was live. This predates today's Highlight Card Studio work entirely; it just happened to be caught because that work is what put someone back on this page.

**Fix:** `showMLBGameDetail()` now sets `AppState.currentView = \`mlb-game-${gamePk}\`` immediately after the `pushState` call, matching the pattern `showMLBPlayerDetail()` and `scorecard.js`'s `AppState.currentView = \`mlb-scorecard-${gameId}\`` already use for the same reason. `_loadMLBGamesForOffset()` (backing `loadMLBGames()`) now also sets `AppState.currentView = 'mlb-games'` at its own top, so the "← Back to Scores" button (and any other direct call) restores correct state too, not just the forward path into detail.

**Implication:** any view-rendering function invoked outside `navigateTo()`'s dispatch must self-set `AppState.currentView`, or it silently inherits whichever view happened to be current before — and any code that gates on that field (the live poll here, but potentially future code) will act on stale state. Worth a grep pass if a similar poll/guard pattern is added elsewhere.

---

---

## D-078 — Root cause of near-zero organic traffic found: Cloudflare Bot Fight Mode was blocking Googlebot's sitemap fetch — owner-actioned 2026-08-09

**Status:** accepted (owner action taken, outcome pending Google's re-crawl)
**Contributors:** owner (Cloudflare/Search Console actions), Axiom (diagnosis)
**Date opened:** 2026-08-09 | **Date resolved:** pending — the fix is live, Google's re-fetch/re-index isn't instant

**Trigger:** owner reported "sportstrata" still doesn't surface in search, a full week after D-056 (2026-08-02) diagnosed and supposedly fixed a stale/unreachable sitemap. Investigating why the fix didn't hold surfaced a real, previously-undiagnosed root cause.

**What was checked and ruled out:** the sitemap file itself — fetched directly, 200, correct `content-type: application/xml`, same as D-056's own finding a week earlier. `robots.txt` — correct `Allow: /`, correct `Sitemap:` reference, no bot-specific blocks. `_headers` — standard security headers only (CSP, HSTS, frame-options, etc.), nothing scoped to crawlers, no stray `X-Robots-Tag`. All clean, all consistent with "the file is healthy," which is exactly what made a full week of persistent `Couldn't fetch` from Google specifically — with a plain fetch succeeding the whole time — the tell: something was intercepting Googlebot's requests specifically, at the edge, before they ever reached the healthy file or the app.

**Root cause, confirmed by the owner's own screenshots:** Cloudflare's **Bot Fight Mode** was enabled (Security → Bots), with JS Detections on. Search Console's URL Inspection tool on `https://sportstrata.cc/sitemap.xml` showed not just a failed fetch but **"URL is not on Google" / "unknown to Google"** — `Last crawl: N/A`, `Page fetch: N/A`, `Crawl allowed?: N/A` — Google hadn't just failed to read the sitemap, it had never gotten far enough to register a crawl attempt at all. That combination (healthy file + clean robots.txt + zero crawl history despite a week of resubmission attempts) is the signature of an edge-level challenge intercepting the request before Google's fetcher gets a real response — exactly what Bot Fight Mode does to traffic it isn't confident is a real browser. Cloudflare's own docs claim verified crawlers like Googlebot are auto-excluded, but this is the free-tier feature, well short of paid Bot Management's precision, and real-world reports of it still catching legitimate automated traffic are common enough that it's a well-known gotcha, not a surprising one in hindsight.

**Why this matters beyond the sitemap:** Bot Fight Mode challenges inbound traffic site-wide, not just sitemap requests — if it's been blocking Googlebot's sitemap fetch for over a week, it's a reasonable bet it's been interfering with Googlebot's regular page-crawl attempts too, which would explain the near-zero organic numbers D-056 already flagged (1 click, 13 impressions) as more than just "sitemap was stale" — the sitemap being unreachable was one symptom of a broader block, not the sole cause.

**Decision:** turn Bot Fight Mode off, not tune it. This site has no threat model that needs it — no checkout, no login-gated content worth scraping (accounts are optional/additive, D-034), and the one real abuse vector (open API proxy endpoints) is already covered separately and specifically by `functions/api/_middleware.js`'s per-IP rate limiting. A blunt, imprecise, site-wide bot challenge is pure downside for a product whose growth strategy depends on being maximally crawlable.

**Owner-actioned this session:** Bot Fight Mode turned off. Indexing requested via Search Console's URL Inspection panel for the sitemap URL.

**Not yet resolved — this is a re-crawl waiting period, not a same-session fix:** Google's next sitemap fetch and any resulting page indexing aren't instant; realistic timeline is hours to a few days for the sitemap to show a successful fetch in the Sitemaps report, and likely longer (days to weeks) for meaningful indexing of the ~1500+ URLs it references, since this is a young domain with no prior successful crawl history to build from. **Follow-up needed:** re-check the Sitemaps report (expect `Success` status with a non-zero `Discovered pages` count, up from today's 0) and re-run URL Inspection → Test Live URL on the sitemap in a day or two. If it's still failing after Bot Fight Mode is confirmed off, the next place to look is Cloudflare's WAF Security Events log filtered to the Googlebot user-agent, to see if a custom WAF rule (separate from Bot Fight Mode) is also in play.

---

## D-079 — Push Notifications v1 shipped and deployed: game-start alerts for followed teams (F5)

**Status:** shipped, deployed, verified live
**Contributors:** Vera (behavioral spec), Axiom (feasibility + implementation), Kael (visual pass-through, confirmed no new component needed), owner (deployment + live `/__run` testing that caught both bugs below)
**Date opened:** 2026-08-09 | **Date resolved:** 2026-08-09

**What shipped**, per the three-gate spec recorded in ISSUES.md ("Push Notifications — Game-Start Alerts for Favorited Teams (F5) — Three Gates"): a new D1 migration (`push_subscriptions` + `push_sent_log`), a session-scoped Pages Function (`functions/api/pushSubscribe.js`), a cron Worker (`worker/push-game-alerts.js`, every 10 minutes) that checks MLB/NFL schedules for games starting soon and sends Web Push via `@block65/webcrypto-web-push`, two new `sw.js` listeners (`push`, `notificationclick`), and a settings-panel toggle in `js/auth.js` next to the existing weekly-digest opt-in. Signed-in required, free (not paid-entitlement-gated) — consistent with D-034/D-031's additive-only rule, since this is a new capability, not a gate on anything already free.

**Why free + signed-in, not folded into the Stripe entitlement gate:** the weekly digest (D-069) is gated behind `isEntitled()` because it's specifically a monetization-tier feature per its own migration comment. Push notifications live in GOALS.md's general Feature Goals, not Monetization — gating it behind the same stubbed entitlement check would have been scope creep from convenience, not a real product decision, and would have silently blocked every user until Stripe integration ships (which has no committed date).

**The named technical risk was real, and testing caught it immediately.** `@block65/webcrypto-web-push`'s upstream-fetch code was written from documented API shape, not a live response (the sandbox that wrote it has no outbound route to `statsapi.mlb.com` or ESPN). The spike-before-trusting-it step called for in the ISSUES.md spec found two bugs on the owner's first live `/__run` hits: (1) the NFL fetch used `site.api.espn.com`, which is Cloudflare-egress-blocked by Akamai — the exact incident already documented in `functions/api/nfl.js`'s 2026-08-07/08 comment, whose fix (`site.web.api.espn.com`) just hadn't been carried over to this new Worker; (2) the MLB fetch was missing the `User-Agent: SportStrata/1.0` header that `functions/api/mlb.js` already proved necessary. Both fixed same-day; error handling was also restructured (`Promise.allSettled` + a labeled fetch helper reporting HTTP status + body snippet) so a future upstream failure names its source instead of a bare JSON-parse exception. A third issue — the Worker's own `wrangler deploy` output warning that `@block65/webcrypto-web-push`'s `node:crypto` fallback needs `compatibility_flags = ["nodejs_compat"]` — was fixed proactively before it could crash a real send. `/__run` now returns clean (`errors: []`) on every check.

**Deployed:** migration applied, Worker live on its cron trigger, secrets set (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`PUSH_RUN_SECRET`, owner-held, none in source). **One real-world check remains, not yet exercised:** an actual send has never fired, since no live `/__run` has yet landed inside a game's 12-minute lookahead window (`matched` has stayed 0 on every check so far). The send path (`buildPushPayload` → push service → `sw.js`'s `push`/`notificationclick` listeners) is implemented and code-reviewed but not yet proven against a real notification hitting a real browser.

**Milestone alerts (HR #50, no-hitter in progress) remain explicitly deferred**, as already recorded in the ISSUES.md spec — this decision covers v1 (game-start only) alone.

---

## D-031 — Accounts, retention & monetization foundation — Phase 1 LIVE-VERIFIED + security-reviewed, all findings closed 2026-08-04
**Trigger:** "to compete we need logins → retention → monetization; slow-walk it to be safe and do it right."
**Decisions (z man):** (1) **Auth stack:** Cloudflare-native — Cloudflare D1 + a vetted library, leading candidate **better-auth** (D1-first; email/OAuth/magic-link/passkey/2FA built in), fallbacks Cloudflare `workers-oauth-provider` or `jose`+KV. We do NOT hand-roll crypto or store raw passwords. (2) **Monetization (later):** **freemium** — reference/analytics stays free; a paid tier eventually unlocks the fantasy edge (league sync, projections, alerts, advanced tools). (3) **Phase 1 scope:** **auth foundation only** — accounts + followed teams/players + preference sync. No payments, nothing gated, no notifications yet. Harden + security-review, then layer monetization in a later decision.
**Hard boundaries:** assistant scaffolds integration only; the project owner owns all provider accounts/keys (set via `wrangler secret`, never in source) and performs anything touching real credentials or money. Payments (future) route through a provider (e.g. Stripe); we never move funds or handle card/credential data.
**Architecture shift to ratify (Axiom):** this is the first real per-user backend. Pages Functions gain npm dependencies + a session layer (today they're zero-dep). Workers are stateless per request → re-instantiate auth per request. Front end stays vanilla; sign-in is additive. Confirm whether this introduces a Functions build step and document it.
**Prerequisite:** P1-006 verified already resolved (`js/api.js` `BDL_API_KEY=''`, `BDL_PROXY_URL` set) — CLAUDE.md is stale and should be corrected. Carry the secrets-hygiene discipline into auth.
**Gates — Finn does not implement until ALL exist in ISSUES.md:** Cipher (threat model + session/CSRF/rate-limit/secret spec), Relay (D1 schema + data export/hard-delete + retention), Axiom (better-auth-on-Workers/D1 feasibility incl. session-refresh bug #4203), Vera (optional non-blocking auth flow + all states), Kael (on-brand sign-in surface), Folio (privacy policy, ToS, cookie consent, GDPR/CCPA data-rights). Status: all PENDING.
**Synthesis:** the product is feature-rich but identity-less and silent — accounts + follows are what convert good pages into a daily habit and unlock the league-aware fantasy tools that are the most defensible differentiator. Build the foundation slowly and correctly; monetize only on top of a hardened, reviewed base.

**D-031 update 2026-06-22 (Axiom spike):** open questions resolved — passkeys + Google OAuth + email magic-link at launch (no passwords; Apple deferred); CSP nonce migration is a fast-follow required before any paid tier; preferences stored as a JSON blob; minimal login audit in Phase 1. Library: **better-auth** on D1 (verify session bug #4203), per-request instantiation, catch-all `functions/api/auth/[[route]].js`, separate `USER_DB` binding. **Ratify:** Functions gain npm deps + a CI bundle step (front end stays buildless). See docs/auth-feasibility-spike.md. Remaining gates: Vera/Kael, Folio.

**D-031 update 2026-06-22 (email provider):** transactional email (magic-links) → **Resend** now — Cloudflare's recommended HTTP API, native to Workers, mature deliverability, free 3k/mo, scales. MailChannels' free Workers path ended Aug 2024; Cloudflare's own Email Service is only public-beta (Apr 2026) so it's not trusted for auth-critical mail yet. Email is abstracted behind one `sendEmail()` helper to migrate to Cloudflare Email Service at GA without touching auth. Domain auth (SPF/DKIM/DMARC on sportstrata.cc) required. Owner setup steps: docs/auth-setup-runbook.md; D1 schema migration: migrations/0001_user_schema.sql. Phase-1 gates all DRAFTED; implementation (Finn) starts once dev secrets/DB exist.

**D-031 update 2026-08-02 (cross-team review — all six gates SIGNED OFF):** owner said "start D-031 workflow." Read all six drafted specs (auth-security-spec.md, auth-data-schema.md, auth-feasibility-spike.md, auth-ux-visual-spec.md, auth-legal-checklist.md, auth-setup-runbook.md) plus the applied migration (migrations/0001_user_schema.sql) end to end and cross-checked them against each other rather than rubber-stamping — this is what "team review" in each doc's own DRAFT status line was still waiting on. Found and closed two real gaps: (1) Relay's schema doc still listed `apple` in the `auth_accounts.provider` comment even though the migration already excludes it and the feasibility spike deferred Apple — stale comment, fixed to match; (2) Folio's legal checklist promises `audit_log` retained "90 days then dropped," but no purge mechanism existed for it — the daily sessions-purge cron scope is now explicit about covering `audit_log` too, not just `sessions`. Everything else (sign-in methods, cookie/session design, follows model, CSP nonce timeline, processor list) checked out consistent across all six docs with no further conflicts. Each doc now carries its own dated "Review status" sign-off note; ISSUES.md's D-031 gate table updated from DRAFTED/pending-review to REVIEWED for all six.

**Status now:** spec review is complete — nothing is blocking on the team side. The only remaining gate before Finn writes Phase-1 code is entirely owner-run per the standing hard boundary (assistant scaffolds integration only, never touches real credentials): work through docs/auth-setup-runbook.md — create the `USER_DB` D1 database, bind it to the Pages project (Production + Preview), register a Google OAuth client, verify the Resend sending domain (SPF/DKIM/DMARC on sportstrata.cc), add Turnstile, and push the five secrets (`AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) via `wrangler pages secret put`. Once dev-environment setup is confirmed done, tell Finn — Phase 1 implementation starts immediately against the six reviewed specs, runs the spike acceptance checklist on `wrangler pages dev`, then a full `/security-review` gates launch.

**D-031 update 2026-08-04 (owner setup complete; Finn implements Phase 1):** owner completed the runbook (D1 bound, migration applied, all five secrets pushed) and said "all set, let's roll." Before writing code, installed better-auth 1.6.25 + @better-auth/passkey locally and read the real source — the six specs above had only ever been checked against each other, never against the actual library, and doing so surfaced two real architecture conflicts requiring a decision, not a silent pick:

1. better-auth's session strategy stores an opaque token directly in D1 and looks it up by exact match — it does not hash tokens at rest, conflicting with Cipher's spec. **Owner chose: accept better-auth's default** over building an unverified custom hashing adapter. Documented as an accepted amendment in docs/auth-security-spec.md and migrations/0002's header comment.
2. better-auth requires its own canonical `user`/`session`/`account`/`verification`/`passkey` table shapes, incompatible with 0001's naming and missing a `verification` table entirely (needed for magic-link + passkey challenges). Adopted better-auth's own schema outright (migrations/0002_better_auth_canonical_schema.sql) rather than hand-mapping five tables of fields onto custom names — the same unverified-against-a-live-instance risk as #1, at larger scope. `follows`/`preferences`/`audit_log` (Relay's own tables, not better-auth's concern) keep their original shape, FK retargeted.

**Shipped:** full Phase 1 — better-auth catch-all mount + session middleware (`functions/api/auth/`), `/api/me` (+ export, hard-delete), `/api/follows`, `/api/prefs`, a daily purge cron as its own sibling Worker (`worker/auth-purge.js`, matching the existing `worker/bdl-proxy.js` pattern since Pages Functions have no native `scheduled()` handler), and the full front end (`js/auth.js`, `css/auth.css`) — account control, sign-in sheet with all three methods and every state Vera's spec listed, reusable follow-star component, account management page, preference sync. CSP/`_headers` gained `challenges.cloudflare.com` for Turnstile. Full detail, including what's disclosed-unverified (WebAuthn ceremony, D1 date-type coercion) and what's intentionally deferred (wiring follow stars onto the existing card templates), is in ISSUES.md's "D-031 Phase 1 implementation (2026-08-04)" entry — that's the working document going forward, not this one.

**D-031 update 2026-08-04 (spike acceptance run for real — 5 more bugs found, magic-link + Google OAuth + session persistence confirmed live):** owner filled in `AUTH_TURNSTILE_SITE_KEY`, deployed the purge Worker, and ran `wrangler pages dev` for real. Live-debugged via Claude-in-Chrome (real console/network, not guesswork) through a chain of five real bugs: a duplicate `AUTH_TURNSTILE_SITE_KEY` const crashing `js/auth.js` at parse time (stale placeholder never removed once the real key landed); a CSS `[hidden]` override on `.auth-control` that let the button render before JS ever touched it; a missing `rateLimit` D1 table (better-auth's database-backed rate limiter needs its own table, never traced/created — blocked every single auth request, not just the gated ones — fixed via migrations/0003_rate_limit_table.sql); a local D1 split-brain where `wrangler pages dev`'s ad-hoc `--d1` flag and `wrangler d1 migrations apply`'s `wrangler.toml`-based resolution silently pointed at two different local SQLite files (fixed by dropping the `--d1` override so both read the same binding); and an invalid `RESEND_API_KEY` in the owner's local `.dev.vars` (credential/formatting issue, owner-resolved). Full root-cause detail in ISSUES.md's D-031 entry. **Confirmed live and working end to end:** Turnstile solves silently in managed mode; magic-link send → email → click-through → persisted session all succeed; Google's `/sign-in/social` returns a genuine `accounts.google.com` redirect. Passkey/WebAuthn remains the one disclosed-unverified path — needs a real authenticator gesture, owner's to exercise.

**Update 2026-08-04 (remote migration applied, rate-limit blocker fully closed):** `wrangler d1 migrations apply sportstrata-users --remote` succeeded on retry — the earlier `code: 7403` Cloudflare API auth error was transient, no config change needed. All three migrations (0001/0002/0003) are now current on both local and remote D1.

**D-031 update 2026-08-04 (manual security review — the automated `/security-review` skill couldn't resolve this session's git root, so this was done by hand against Cipher's threat model):** reviewed every D-031 endpoint plus `js/auth.js`'s DOM-writing paths. Clean: session-only authorization everywhere (no endpoint trusts a client-supplied user id), all D1 access parameterized (no SQL injection surface), consistent `_escHtml()` on every user/server-derived `innerHTML` write (no XSS surface), CSRF covered for free by `SameSite=Lax` + `HttpOnly` cookies, no CORS wildcard on any auth-sensitive route, no open-redirect surface (`callbackURL` always self-referential), no SSRF in the Turnstile relay, session tokens explicitly excluded from the data export. **One real, low-severity finding:** `worker/auth-purge.js`'s `/__run` endpoint is unauthenticated and publicly reachable on the Worker's own URL — low impact (idempotent maintenance deletes, aggregate-only response, no PII) but still worth gating behind a shared secret or removing once the cron trigger is confirmed firing on its own. Left as an owner decision (adding `PURGE_RUN_SECRET` means pushing a new secret, which is the owner's to do) rather than silently implemented. Full detail in ISSUES.md's D-031 entry.

**D-031 update 2026-08-04 (`/__run` finding closed):** owner chose the shared-secret gate. `worker/auth-purge.js`'s manual-trigger path now requires an `X-Purge-Secret` header matching a new `PURGE_RUN_SECRET` (constant-time compare, own implementation since this Worker carries no `nodejs_compat` flag), returning 401 on mismatch and 503 if unconfigured. The scheduled cron path is untouched — no header exists on a Cron Trigger invocation, so this only closes the actual public-URL exposure. Owner generated + pushed the secret, redeployed, and confirmed live: unauthenticated `curl` → `401`; correct header → the normal purge JSON.

**Not done yet:** (a) confirm `nodejs_compat` is set in the Cloudflare Pages dashboard itself (Production + Preview — the local `wrangler.toml` flag doesn't cover the dashboard-built live site), (b) wire follow stars onto the existing card templates (deferred, ISSUES.md task). Both are small; once done, D-031 Phase 1 is fully closed.
