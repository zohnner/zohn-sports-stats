# SportStrata Deep Review — 2026-07-01

**Format:** Six-persona strategic + technical review. Big picture first, then per-persona findings, cross-cutting issues, and one ranked initiative list.
**Method:** Read the live repo state (DECISIONS.md through D-031, ISSUES.md, GOALS.md, CLAUDE.md, THEME_REVIEW.md, fixit.md, relay-deep-dive, auth spec drafts), verified claims against source (`js/mlb.js`, `js/api.js`, `js/fantasy.js`, `js/nflStandings.js`, `functions/api/*`, `css/variables.css`, `index.html` CSP, `sw.js`), and pulled the live site shell.

---

## Part 0 — Think Large: What Is SportStrata For?

The honest answer from the repo: SportStrata is currently **four products wearing one header**.

1. **The broadcast desk reference** — the founding point of view. Game Prep, print sheets, blurbs, the scorecard, 3-clicks-to-any-fact. GOALS.md is written for this product.
2. **The fantasy edge tool** — where all the energy has gone since mid-June. Mock draft with Monte Carlo and a Draft Assistant, VORP value engine, Draft Kit, SOS heatmaps. D-027/D-028 explicitly frame this as "give users an edge" and "set us apart from other NFL fantasy sites."
3. **The casual fan companion** — arcade, 13 cosmetic themes, share cards, ticker.
4. **The portfolio showcase** — the implicit product. "Look what a solo maintainer can do in vanilla JS" explains several decisions (13 themes, four sports, an arcade) that no product-first roadmap would produce.

That plurality isn't automatically bad — ESPN is also several products. The problem is that **the strategic documents still describe product #1 while the decision log builds product #2**, and nothing has reconciled them. Concretely:

- GOALS.md **G4**: "No login, no cookies banner, no paywall" — still stated as a core goal. D-031 (accepted): accounts, cookie consent draft, freemium later. These cannot both be the strategy.
- GOALS.md **G6**: "NBA, NFL, NHL receive no new feature investment until MLB depth goals are met." D-012 through D-030: six weeks of intense NFL investment. (G2 was met, so this is arguably resolved — but G6 was never amended, and CLAUDE.md now says the opposite thing from GOALS.md.)
- GOALS.md **Non-Goals**: "not a pure betting site" sits next to **R4**, which wants a DFS lineup optimizer and DraftKings CPA deals.
- **R1–R5** (Pro tier $9.99, $499 Enterprise with 10 seats "day 1", $99 API) read as aspiration written in one sitting, not plans anyone has resourced. They contradict G4 and each other, and they anchor future decisions to fantasy numbers.

**The differentiator you actually have.** It is not "MLB analytics" — Savant, FanGraphs, and Baseball Reference own analytical depth and always will. It is not fantasy projections — FantasyPros, Sleeper, and every league host own that. What SportStrata does that nobody else does is **instant, no-login, broadcaster-grade depth**: zero friction between a URL and a print-ready, share-ready, correctly-computed answer. The anti-friction stance *is* the product. Every stat that loads in under two seconds with no account wall is the pitch. The mock draft succeeded for exactly this reason — it's the only no-login Monte Carlo draft simulator anyone can link to.

**The tension to resolve, named plainly:** D-031 (accounts) spends the differentiator to buy retention. That may be the right trade — follows and league-sync are real habit-formers — but it's currently being made as an infrastructure decision ("slow-walk auth safely") rather than an identity decision ("are we still the no-login tool?"). The strategy docs must be re-ratified before Phase 1 code lands, or the product will drift into being a worse Sleeper with a nicer scorecard.

**Recommended point of view** (a position, per house rules): run a deliberate **two-season barbell**. In baseball months, SportStrata is the broadcast/desk reference — serious, printable, provably accurate. In football months, it's the no-login fantasy edge tool. Both legs share one spine: *no friction, visible provenance, correct math*. Cut or quarantine what serves neither leg: NBA/NHL previews (unreachable in the switcher yet still shipped to every visitor), the R2/R3 enterprise fantasies, and arcade's position in the primary nav. Accounts, if they proceed, must be additive-only — the D-031 language "optional and non-blocking, the no-login experience must not regress" is exactly right and should be promoted from an implementation note to a constitutional rule in GOALS.md.

One more large observation: **the calendar is misaligned with the roadmap.** It is July 1. MLB is at peak season — trade deadline month, the single best organic-traffic window the primary product gets — and the last six weeks of decisions are entirely NFL offseason build-out. Building NFL before September is defensible; being dark on MLB in July is not. At minimum, the July MLB moment (deadline tracker, hot/cold streaks, live game polish) deserves a slice of the next four weeks.

---

## Part 1 — AXIOM (Architecture, Performance, Code Health)

### A1. `mlb.js` is past the ceiling of the flat-file architecture — 7,322 lines, 373KB

D-023 deferred splitting `nfl.js` at ~1,440 lines with the reasoning "size isn't the pain." That was correct *for nfl.js*. It is being silently reused to avoid the `mlb.js` conversation, and `mlb.js` is a different regime: 5× larger, 109 `innerHTML` writes, every MLB feature lands in it, and it holds constants (`_PARK_FACTORS`, `_MLB_WRC_CONSTANTS`), fetch plumbing, rate math, and a dozen view renderers in one global namespace.

The architecture has also started producing its own workaround idiom: `js/nflStandings.js` **deliberately redefines** `loadNFLStandings`/`displayNFLStandings`/`fetchNFLStandings` from `nfl.js`, winning by load order, leaving dead versions in the earlier file. The comment documenting this is good; the pattern is still shadowing-as-architecture. It works only while everyone remembers it — grep for a function, land in the dead copy, patch it, nothing changes. That's not hypothetical; it's the standard failure mode of load-order-dependent globals.

**Recommendation:** don't add a bundler (G5 stands), but decompose `mlb.js` along its existing view seams (leaders, players, detail, games/live, teams/standings, computed-stat core) the same way `liveGame.js`/`scorecard.js` were already carved out — that pattern demonstrably works here. Adopt two rules in CLAUDE.md: no file over ~2,500 lines without a decision entry, and **no cross-file redefinition** — replace the nflStandings shadowing by deleting the dead functions from `nfl.js`. Effort L, amortizable per-view.

### A2. Zero tests on a codebase whose entire value proposition is correct math

There is not one test in the repo. The product's differentiators are *computed* stats — FIP, wRC+, wOBA, BABIP, VORP, Monte Carlo survival, scorecard notation — and the only verification layer is `node --check` plus eyeballs on the rendered page. The wRC+ constants bug found during this review (see R3 below) is exactly the class of error a 20-line test file catches and a screenshot never will.

The good news: the stat layer is nearly all pure functions (`_computeBattingRates`, `_computePitchingRates`, `_vbd*`). They can be tested with plain `node:test` — no framework, no build step, no G5 violation. A single `tests/stats.test.js` with known player lines and hand-verified outputs, run by `/deploy-check`, is the highest ratio of protection-to-effort available anywhere in this codebase. Effort S.

### A3. The hand-maintained delivery manifest is a recurring tax

`sw.js` is at cache v46, bumped by hand on every change (its own header comment still says "v22" — even the file disagrees with itself). `index.html` carries a 29-script load-order chain that CLAUDE.md documents incorrectly (it omits `nflLiveGame.js`, `nflStandings.js`, `fantasy.js`, `sos.js`, `news.js`). Every new file must be registered in three places that nothing validates. This friction is one of the quiet forces that pushed code into the `mlb.js` monolith — adding a file costs more than appending to an existing one. A small Node script that generates the `sw.js` STATIC_ASSETS list and verifies the script chain against `js/` (wired into `/deploy-check`) removes the whole class. Effort S.

Also flagged for ratification, not objection: D-031 brings npm dependencies and a build step to Pages Functions — the first crack in "no build step." Acceptable, but keep the front end buildless and say so explicitly in GOALS.md when it's re-ratified.

---

## Part 2 — VERA (UX, Information Hierarchy, Accessibility)

### V1. The fantasy surface is four sibling ranked lists a new user cannot tell apart

NFL now exposes Rankings, Draft Kit, Leaders, and Trending as separate top-level destinations — four different ranked lists of the same players, distinguished only by which value column leads. D-022 itself diagnosed this ("three ranked-player lists users can't tell apart") and the answer was group labels; since then a fourth (Draft Kit) and a fifth (SOS) shipped. Labels don't fix an IA problem, hierarchy does.

**Recommendation:** consolidate into one **Draft HQ** view with internal tabs (Values · Rankings · SOS · Trending), keeping Mock Draft as its own destination. This does more for draft-season usability than any new feature, it simplifies D-026 P2's dropdown work, and it gives August's marketing one URL to point at. Effort M.

### V2. Provenance is fine print, and for an "edge" tool that's a trust time bomb

The VBD engine is honestly *labeled* ("last-season production, projected") — but the label lives in small text while the numbers wear the visual authority of projections. The first time a user compares the Draft Kit to FantasyPros and sees no 2026 rookies on the value board (they're relegated to an unmatched-by-ADP list below), the whole site's credibility takes the hit — including the MLB side, which genuinely is accurate. Trust doesn't degrade per-feature; it degrades per-brand.

**Recommendation:** make provenance a first-class UI pattern, not a caption: a small data-source chip on every computed surface ("2025 production · PPR-weighted" / "Statcast · updated daily" / "wRC+ † 2024 constants") that opens a how-this-is-computed popover reusing the existing glossary infrastructure. This is jointly owned with Relay (R3) and Kael (K3). Effort M.

### V3. Accessibility regressed by omission on everything shipped since D-004

The WCAG pass (D-004, closed 2026-06-09) audited three MLB views. Since then: SOS red-to-green heatmaps, tier colors, VORP green-positive columns, a draft board grid, dropdown navigation, a live game viewer — none audited, and several lean on red/green encoding that fails colorblind users outright, in a product whose whole fantasy pitch is "read this table and gain an edge." D-026's dropdown behavioral spec is properly ARIA'd, which shows the muscle exists; it just hasn't been pointed at the new surfaces. **Recommendation:** a scoped audit of the five newest views with the same 100/100 bar, plus a rule that Vera's state-spec gate includes a contrast/colorblind check for any new color-encoded data. Effort S/M.

---

## Part 3 — KAEL (Visual Identity, Theming, Polish)

### K1. Thirteen themes is a governance problem wearing a delight costume

The City Connect theme system is a genuine brand asset — it's memorable, it's baseball-native, and no competitor has it. It is also 949 lines / 45KB of `variables.css`, thirteen contexts every component change must hold up in, and THEME_REVIEW.md's contrast CRITs ([CRIT] light-mode accent below WCAG on white; [HIGH] border-opacity stack) have no recorded closure. The posture belief applies to systems too: a theme system without a contract isn't a design system, it's thirteen chances to ship a contrast failure.

**Recommendation:** keep the themes, freeze the count, and write the **theme contract**: the exact token set every theme must define, minimum contrast ratios per token pair, and a small Node script that computes the ratios for all thirteen themes and fails `/deploy-check` on violation. That converts the sprawl from unbounded liability to bounded asset — and it's the only way theme #14 ever gets approved responsibly. Effort S/M.

### K2. One header, two postures — declare the split instead of leaking it

"Serious stats for serious fans" sits directly above a nav containing Arcade. The MLB surfaces carry desk-reference calm; the mock draft carries (correctly) game-show energy; the arcade carries neither the brand nor the audience. This isn't a demand to delete the arcade — it's a demand to *decide its place*. A product can hold two postures if the seams are deliberate: reference surfaces dense and quiet, fantasy surfaces kinetic, and playthings tucked behind an Explore/extras entry rather than standing in the primary spine next to Game Prep. Right now the postures blend by accident, which reads as no posture. Effort S (it's mostly a nav and copy decision, executed with Vera in the D-026 P2 work).

### K3. The exported artifact is the brand in the wild — treat it as the flagship

Share cards (R5), scorecard PNGs, and the printable Draft Kit cheat sheet are the only surfaces that travel — they appear in group chats and timelines where the product isn't there to explain itself. They're built (shareCard.js, scorecard export, print button) but they've had no design pass since shipping, and nothing measures whether anyone shares them. Before investing in any new visual surface, spend a cycle making these three exports unmistakably excellent — typography, team color handling, watermark placement — because each one is an acquisition channel that costs nothing per impression. Pairs with V2/R3: a provenance line on the card ("SportStrata · July 1, 2026") is both trust and brand. Effort M.

---

## Part 4 — CIPHER (Security, Exposure, Hardening)

### C1. The Pages Functions are an unauthenticated open proxy with no rate limiting — fix before auth, not after

`/api/nfl*`, `/api/sleeper`, `/api/mlb`, `/api/nflfp` and the rest accept anonymous requests and relay to ESPN, Sleeper, nflverse, and MLB with server-side caching. There is **no rate limiting anywhere in `functions/api/`** (verified by grep). Today that means: anyone can use SportStrata as a free ESPN/Sleeper proxy, burn the Cloudflare quota, and — worse — get the Worker IPs banned by upstreams, which takes the whole product down. Once D-031 lands, the same unprotected layer sits next to session endpoints. The auth security spec drafts rate limiting *for auth endpoints*; the existing proxy surface needs it first and independently. Cloudflare-native rate limiting rules per route (plus a simple per-IP token bucket in the Function for allowlisted paths) is a small, high-value job. Effort S. Cipher owns the spec; Axiom implements.

### C2. `'unsafe-inline'` in script-src means the CSP is decorative — and D-031 raises the stakes from defacement to session theft

The CSP allowlists domains but permits inline script, so the actual XSS defense is `_escHtml` discipline across ~300 `innerHTML` writes in 24 files — including a second, independent escaper (`_escFan` in fantasy.js), which is how escaping discipline starts to fork. Every rendered name from Sleeper, ESPN, and nflverse is third-party data flowing into `innerHTML`; `schema.js` validation is NBA/MLB-era and doesn't cover the NFL ingestion paths. Today the blast radius of a miss is defacement. The day accounts ship, it's session cookies. D-031 currently schedules CSP nonce migration as a fast-follow "required before any paid tier" — **I disagree with that sequencing: it should gate auth launch itself.** The migration is a real project precisely because inline `onclick=` handlers are everywhere in generated HTML, which is why it must start now, view by view, rather than land as a panic after accounts exist. Each converted view also shrinks the monolith, so this pairs naturally with A1. Effort L, phased.

### C3. Third-party data supply chain needs boundary validation, not just escaping

`nfladv.js` and `nflfp.js` download and gunzip nflverse CSVs server-side and the client renders derived fields; ESPN/Sleeper payloads bridge by normalized-name joins. Escaping handles the injection case; nothing handles the *shape* case — a schema change or a compromised upstream field flows straight through. Extend the `ApiShape` pattern to the NFL Functions (validate at the edge, return a typed error the client already knows how to render). Effort M; Relay co-owns (see R2).

---

## Part 5 — RELAY (Data Sourcing, Freshness, Accuracy)

### R1. The rookie gap is the Draft Kit's core-use-case failure, and draft season is six weeks away

The VBD engine projects from `stats_player_reg_2025` — so the 2026 rookie class has no value, no VORP, no tier, and drops to an ADP-only afterlist. But rookies are *the* thing drafters agonize over; a value board without them isn't conservative, it's answering the wrong question during the only weeks the tool matters. This is the single most time-sensitive data decision in the project. Options, in order of preference: (1) blend Sleeper ADP-implied value for unmatched players so rookies appear *in* the board with an explicit "market-priced, no production data" tag; (2) source a ToS-clean rookie projection baseline (nflverse draft-pick value curves are CC-BY and get you a defensible prior); (3) at bare minimum, redesign the board so the rookie list is a peer section, not a footnote. Do (1)+(2). Effort M, deadline August 1. Relay owns; Axiom implements; Vera/Kael handle the labeling surface (V2/K3).

### R2. Name-based joins are the silent-failure engine and nothing measures their miss rate

Sleeper↔ESPN↔nflverse bridging by normalized name+team is a documented, reasonable compromise (Sleeper's foreign ids are ~25–33% populated). But joins degrade silently: trades break the team half of the key, suffixes and nicknames break the name half, and the user just sees a missing Advanced card or an empty VORP cell with no signal that it's a *join* failure rather than absent data. Relay's own principle — schema drift is the silent killer — applies to entity resolution too. **Recommendation:** instrument the joins. Each Function that name-matches logs (or returns in a `_debug` field) matched/unmatched counts; a tiny `/api/joinhealth` endpoint or a `/deploy-check` probe reports match rate per source pair. When the rate dips after an ESPN roster update, you find out from a number, not a bug report. Effort S.

### R3. MLB accuracy debt: wRC+ is silently using 2024 constants for 2026, and park factors weren't refreshed

Verified in source: `_MLB_WRC_CONSTANTS` contains only 2024 and 2025. It is the 2026 season, so `_MLB_WRC_CONSTANTS[MLB_SEASON]` misses and the code falls back to **2024** constants (`js/mlb.js:1522`) — the † dagger does render, but a dagger doesn't tell the user "this number is computed against a league environment from two seasons ago." Likewise `_PARK_FACTORS` is still the 2022–2024 average, with the Athletics relocation explicitly called out in GOALS.md's annual-maintenance note as needing an April refresh that didn't happen. For a product whose design principle #1 is "data accuracy over data volume," on its flagship differentiating stat, in-season: this is the review's most concrete finding. Fix is small (fetch/enter 2026 FanGraphs guts, refresh park factors, add a `/deploy-check` warning when `MLB_SEASON` has no constants entry) — and it's the poster child for A2's test harness: a one-line assertion (`_MLB_WRC_CONSTANTS[MLB_SEASON] !== undefined` in season) would have caught it in March. Effort S. **The annual-maintenance items need an owner and a calendar trigger, not a note in GOALS.md nobody re-reads.**

---

## Part 6 — FOLIO (Documentation, Onboarding, Maintainability)

### F1. CLAUDE.md actively misdirects every session that reads it

This is not ordinary staleness; in an AI-assisted workflow CLAUDE.md is executable documentation, loaded into context and *obeyed* every session. It currently instructs, in a section titled "Known Critical Bug — DO NOT IGNORE," that the BDL key is hardcoded at `js/api.js:11` — resolved 2026-06-09; the file now has `BDL_API_KEY = ''` and a Worker proxy (D-031 already noted this staleness and asked for correction; it still hasn't happened). Its script load order omits five files that exist in `index.html` (`nflLiveGame.js`, `nflStandings.js`, `fantasy.js`, `sos.js`, `news.js`). `sw.js`'s own header says v22 against a v46 cache name. Every future session pays this tax in re-flagged dead bugs and missed load-order dependencies. **Recommendation:** a truth-audit of CLAUDE.md against the repo now, and — the durable fix — a standing rule in the ship checklist: any decision that ships touches CLAUDE.md in the same commit, and `/deploy-check` greps for the known-stale markers. Effort S.

### F2. GOALS.md no longer states the goals; DECISIONS.md does, and it's unreadable for that job

The contradictions catalogued in Part 0 (G4 vs D-031, G6 vs D-012, Non-Goals vs R4, R1–R5 vs everything) mean the strategy is actually encoded in a 74KB append-only decision log — excellent as history, useless as orientation. A new contributor (or persona session) reading GOALS.md today would refuse the last six weeks of shipped work as out of scope. **Recommendation:** Folio drafts GOALS.md v2 with the owner — re-ratify identity (the barbell, or whatever the owner chooses), promote D-031's "no-login experience must not regress" to a constitutional rule, prune or re-scope R1–R5 into a single honest monetization paragraph, and update G6 to reflect the two-live-sports reality. One page of truth beats thirty pages of aspiration. Effort S/M, but it gates the accounts work.

### F3. The docs corpus contains guidance that violates the project's own constraints — prune it

`misc_documentation/suggestions.md` recommends React Query and JSX error boundaries — a framework, in a project whose first commandment is no frameworks. `reflection.md` is a stray meta-prompt, not documentation. `fixit.md` consists mostly of prompts for work that has since shipped (skeletons, hash routing, service worker). ISSUES.md is 252KB of append-only shipped-entries with roughly one formally open item — it's an archive impersonating a tracker. None of these are harmless: they get read by future sessions and weighed as instruction. **Recommendation:** move superseded material to `docs/archive/`, split ISSUES.md into a lean open-items file plus an archive, and give `docs/` a one-screen index. Effort S.

---

## Part 7 — Cross-Cutting Findings

**X1. The identity drift is everyone's problem wearing different masks.** Folio sees stale GOALS.md; Vera sees an onboarding page that can't say what the product is; Kael sees two postures blending; Cipher sees auth being sequenced as plumbing rather than an identity change; the owner sees a roadmap argument every two weeks. One re-ratification (F2 + Part 0) resolves all five at once. That's why it ranks first below despite being the cheapest item on the list.

**X2. Trust is a single shared asset, and three personas are each holding a piece of its erosion.** Relay's stale constants and rookie gap, Vera's fine-print provenance, Kael's untended export cards, Axiom's absent tests — individually minor, together they threaten the one claim ("serious stats," i.e. *correct* stats) that justifies the product's existence. Initiative 3 below bundles them deliberately: provenance UI + constants fix + join telemetry + stat tests are one program, not four chores.

**X3. The buildless architecture is hitting its ceiling in five places at once.** The mlb.js monolith (Axiom), the hand-bumped sw.js manifest (Axiom), the thirteen-theme contract gap (Kael), the nonce migration blocked by inline handlers (Cipher), and Functions gaining npm deps (D-031) are the same finding: conventions that scaled to 10K lines don't scale to 37K. The answer is not a framework — it's *small scripts that enforce the conventions* (manifest generation, contrast checks, constants checks, test runner), all hanging off the already-institutionalized `/deploy-check`. Turning `/deploy-check` into the project's de facto CI is the architectural move of this review.

**X4. The season clock is a first-class prioritization input and it's currently ignored.** July = MLB peak + the last quiet weeks before fantasy draft season. August = draft-kit judgment month (rookie gap becomes public). September = every unverified NFL live-game code path (D-030's own caveat) runs against real games for the first time. The ranked list below is ordered with this clock, not just by abstract severity.

**X5. ~180KB of unreachable sport code ships to every visitor.** NBA and NHL aren't in the `SPORTS` switcher, yet `players.js`, `leaderboards.js`, `playerDetail.js`, `games.js`, `nhl.js`, and the BDL plumbing in `api.js` load on every page, and the CSP still allowlists `stats.nba.com` and `api.balldontlie.io`. It's simultaneously a perf cost, an attack-surface cost, and a docs-confusion cost. Either gate their delivery behind sport activation or make the call on NBA's future — D-026 gated NBA "until P1-006 is restored," and P1-006 has been resolved since June 9, so even the gate condition is stale.

---

## Part 8 — Ranked Initiatives

| # | Initiative | Why it beats the alternatives | Effort | Owner(s) |
|---|---|---|---|---|
| 1 | **Re-ratify the constitution** — GOALS.md v2 (identity decision: barbell + no-login-must-not-regress as constitutional rule), truth-audit CLAUDE.md, prune contradictory docs (F1, F2, F3, X1) | Cheapest item, gates the most: accounts UX, monetization framing, sport scope, and every future persona session all inherit from these files. Currently they misdirect. | **S** | Folio lead; all seniors ratify; owner decides identity |
| 2 | **MLB accuracy hotfix + stat test harness** — 2026 wRC+ constants, park-factor refresh, `node:test` suite over the pure stat functions, constants check in `/deploy-check` (R3, A2, X2) | It is mid-season on the flagship product and the flagship stat is computed against a 2024 league environment. Smallest fix with the largest correctness payoff; the tests make the whole class of bug unrepeatable. | **S** | Relay (constants) + Axiom (tests) |
| 3 | **Proxy hardening: rate limits + NFL boundary validation** (C1, C3) | A live, unauthenticated exposure today, and a prerequisite for auth. An upstream IP ban is a full outage; this is the cheapest outage insurance available. | **S/M** | Cipher spec; Axiom implements; Relay schemas |
| 4 | **Rookie-inclusive value board by Aug 1** — ADP-implied value blend + rookie prior, provenance chips on every computed surface (R1, V2, K3 label work) | The Draft Kit meets its public judgment in August; without rookies it fails its core use case in front of its largest seasonal audience. Deadline-driven, hence above structurally bigger items. | **M** | Relay lead; Axiom; Vera/Kael (provenance UI) |
| 5 | **CSP nonce migration, phased per view — gates auth launch** (C2; re-sequences D-031's "fast-follow") | Once sessions exist, one escaping miss is account takeover. Starting now, view-by-view, is the only way it's ever cheap; each converted view also pays down A1. | **L** (phased) | Cipher spec; Axiom implements |
| 6 | **Fantasy IA consolidation: Draft HQ + D-026 P2 dropdowns + posture split** (V1, K2) | Four sibling ranked lists confuse the exact user the fantasy bet is courting; consolidation before draft season multiplies initiative 4's impact. | **M** | Vera lead; Kael; Axiom |
| 7 | **`/deploy-check` as de facto CI + manifest generation + theme contract** — sw.js/script-chain generator, 13-theme contrast checker, join-health probe (A3, K1, R2, X3) | Converts three recurring manual taxes into scripts; unblocks safe growth of files and themes. Do after 2/3 seed it with the first checks. | **M** | Axiom; Kael (contract); Relay (join probe) |
| 8 | **mlb.js decomposition + delivery of unreachable sport code decided** (A1, X5) | Real but not urgent; ride along with initiative 5's per-view refactors rather than as a standalone big-bang. NBA/NHL call is an owner decision that costs one conversation. | **L** | Axiom; owner (NBA/NHL call) |

Deliberately **not** on the list: new MLB depth features (G2 is met; July effort goes to accuracy and the deadline moment, not new columns), NBA/NHL revival (decide, don't build), account implementation itself (D-031's gates are drafted and correctly sequenced — it starts after 1, 3, and 5's first phase), and everything in R2/R3 enterprise land (re-scope in GOALS v2 first).

---

*Filed 2026-07-01. Sources: DECISIONS.md (D-001–D-031), GOALS.md, ISSUES.md, CLAUDE.md, THEME_REVIEW.md, fixit.md, suggestions.md, relay-deep-dive-2026-06-08.md, docs/auth-*.md, and direct source verification in js/, css/, functions/api/, index.html, _headers, sw.js. Claims marked "verified" were checked against source this session.*
