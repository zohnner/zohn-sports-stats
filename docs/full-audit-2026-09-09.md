# SportStrata Full Technical & Financial Audit — 2026-09-09

**Format:** Per-persona findings from the file-lens authorities (`dev.md`/Axiom, `design.md`/Kael, `ux.md`/Vera, `security.md`/Cipher, `data.md`/Relay, `docs.md`/Folio, `junior.md`/Finn), reasoned against each persona's own domain per `TEAM.md`. **Every finding below is re-derived from source this session — file, line, or dated log entry, verified directly, not inherited from the 2026-08-08 audit or its roadmap.** Where this audit confirms something the 8/8 audit found, that is stated as a fresh finding with its own citation, not a restatement.

**Method:** Read `CLAUDE.md` in full (trusted as current per project convention), `DECISIONS.md` D-073→D-135 (the entire unreviewed tail — 62 of 95 total logged decisions), `ISSUES.md` in full (1,916 live lines) cross-referenced against source, `GOALS.md` in full, `docs/roadmap-2026-08-08.md`, `docs/full-audit-2026-08-08.md`, `docs/sponsorship-outreach.md`, `git log --since=2026-08-08` (256 commits), all seven `.claude/members/*.md` persona files plus `TEAM.md`/`ROUTER.md`, and live source for every specific claim: `functions/api/_entitlement.js`, `functions/api/nflInsights.js`, `migrations/0006_monetization_v1.sql`, `.github/workflows/ci.yml`, `.claude/commands/deploy-check.md`, `js/fantasy.js`, `js/auth.js`, `tests/`, `js/mlb.js` line count, persona-file mtimes, and a full grep of `functions/`, `worker/`, and `js/` for `stripe`/`checkout`/`pricing`.

**Headline finding, stated up front:** in 32 days and 256 commits, SportStrata shipped two new live sports (NCAAB, WNBA), a shared basketball live-game viewer, an NCAAF live-game viewer at full NFL parity, a from-scratch MLB live-game redesign, a home-page redesign in four phases, an NFL pregame-preview rebuild, and 39 Pages Functions' worth of backend surface (28,496 → 39,874 lines of `js/`, +40%). In the same 32 days, **zero lines of Stripe integration code were written, no pricing decision was made, no ad-network application was sent, no legal review of the sportsbook affiliate path happened, and the two persona files most responsible for catching exactly this kind of drift (`data.md`, `docs.md`) were not touched at all** — they are frozen at 2026-05-18, four months and every multi-sport feature in this project's history behind. The engineering velocity is real and the code quality discipline (caching, cost-bounding, live-verification) is consistently good. The revenue velocity is zero, and the monetization plan itself has quietly stalled without anyone logging that it stalled.

---

## Part 0 — Financial Framing (re-verified, not inherited)

1. **The subscription tier is at the exact same place it was on 2026-08-08.** `functions/api/_entitlement.js` (read in full this session) is unchanged in substance: `isEntitled()` queries `subscriptions WHERE status='active'` and returns `false` unconditionally because that table has zero rows for anyone. A fresh grep of `functions/`, `worker/`, and `js/*.js` for `stripe`/`Stripe`/`checkout`/`Checkout`/`webhook` found exactly one hit outside comments and the D1 schema: `functions/api/_entitlement.js`'s own file-header comment explaining that it's stubbed on purpose. No `functions/api/stripe/` directory exists. No pricing number appears anywhere in `GOALS.md` or `DECISIONS.md` — the roadmap's own working number, **$4.99/mo or $29/yr**, was explicitly flagged as "not mine to decide unilaterally" and was never picked up by the owner in any of the 62 decisions logged since.
2. **The two "paid tier" features that got built shipped as free features, not gated ones — because there is nothing to gate them behind.** `functions/api/nflInsights.js` (read in full) is real, working code — it calls Gemini, computes a real fantasy-league insight from a user's linked Sleeper roster, and correctly checks `isEntitled()`. But since that check can never return true today, every signed-in user gets the "free tier" behavior (one insight per rolling 7 days) forever, with no path to unlimited. `js/fantasy.js:1126-1130` says this explicitly in a code comment: *"there's no cost reason to hide it, only a product-tier reason... reserving positional breakdown for later iteration rather than a paywall with nothing real behind it yet"* — the Personalized Fantasy Grade (letter grade + league rank, `_mlGradeFromRank`) is shown to every signed-in user with a linked league, full stop, because there is no working paywall to put it behind. Two of the three spec'd paid features are, in fact, currently free features. This is a stronger and more concrete version of the 8/8 audit's abstract "terminates at a stubbed Stripe integration" finding — it's not just stubbed, it has forced two real features into the free tier by default.
3. **`js/mlb.js` grew a third consecutive measurement period and still has not been split.** 7,322 lines (2026-07-01) → 7,409 (2026-08-08) → **7,489 lines today** (verified via `wc -l js/mlb.js`, this session). The proven extraction pattern (`liveGame.js`, `scorecard.js` were both carved out of this exact file) has not been reapplied in 32 days of otherwise very high shipping velocity, even though `js/` as a whole is growing fast enough (28,496 → 39,874 lines, +40%) that the file's relative share of the codebase is at least stable even as its absolute cost to navigate keeps rising.
4. **CI exists now and genuinely runs — but covers 8 of 13 deploy-check items, not all 13.** `.github/workflows/ci.yml` (read in full) runs on push/PR to `main` and executes: BDL-key check (#1), `_headers` present (#2), CSP sync (#3), `.env` not tracked (#6), unit tests (#9 — now 6 files, not 4: `stats/vbd/query/odds/scorebug/entitlement.test.js`, matching `tests/` exactly), manifest sync (#10), theme contrast strict (#11), NUL-byte scan (#12). **Missing from CI, confirmed by diffing against `.claude/commands/deploy-check.md`'s own 13-point list:** #4 (deployment-critical files committed), #7 (`worker/wrangler.toml` present), #8 (service-worker `CACHE_NAME` bump-on-change check). #5 and #13 are correctly excluded (report-only / post-deploy-only, not CI-appropriate). #8 is the one real gap worth naming — it's the exact class of bug (`sw.js` shadowing a fresh edit with a stale cached copy) that D-123 hit and had to work around during live verification on 2026-08-31; CI catching a missed `CACHE_NAME` bump before merge would have prevented that entire debugging detour.

---

## Part 1 — AXIOM (dev.md) — Architecture, Tests, CI/CD

### A1. mlb.js monolith: three consecutive audits, three consecutive misses
See Part 0.3. `js/mlb.js:7489` lines. No decomposition PR exists in `git log --since=2026-08-08`. This is not a new finding — it is the same finding, unactioned, for the third time.

### A2. Test coverage grew, but the growth targeted the wrong risk surface
`tests/` now has 6 files (was 5 on 8/8): `entitlement.test.js` (added 2026-08-08, D-073) and `scorebug.test.js` (date not independently confirmed, present in CI) joined the original 4. **Still zero coverage on `js/auth.js` (session state, follow system) and `js/navigation.js` (all hash routing)** — both named explicitly in the 8/8 audit's A2 finding and the roadmap's Phase 0 item #3, neither addressed since. Of the 39 Pages Functions now in `functions/api/`, exactly one (`_entitlement.js`) has test coverage. The 38 others — including every session-scoped D1 write endpoint (`follows.js`, `prefs.js`, `draftHistory.js`, `sleeperLink.js`, `pushSubscribe.js`) and the Gemini-calling `nflInsights.js` — have none. Given that `nflInsights.js` is the one Function that actually moves toward the paid tier (correctly calling `isEntitled()`), it is also the highest-consequence untested Function in the repo, and it grew in this window, not before it.

### A3. No CI gate for the SW cache-version bump (see Part 0.4)
A real, previously-hit-in-production gap (D-123, 2026-08-31), still not covered by `ci.yml`.

### A4. Real engineering velocity, real discipline, genuinely worth naming
256 commits since 8/8, spanning two new live sports (NCAAB D-052/WNBA D-092, both already ratified before this window but built out heavily within it), a shared `bballLiveGame.js` viewer built only after live-fetching real completed games and finding the prior D-092 data-shape assumption wrong (`js/bballLiveGame.js` header comment, D-092 self-correction), an NCAAF live-game viewer brought to full NFL parity (D-118→D-130), and a from-scratch MLB live-game IA redesign (D-124) organized around a stated mental model (GAME→INNING→HALF-INNING→PLATE APPEARANCE→PITCH→RESULT) rather than a re-skin. Live-verification discipline is consistently applied and catches real bugs before or shortly after ship: D-129 found and fixed an `isLive` detection bug affecting both NCAAF and NFL (`STATUS_END_PERIOD` missing from the state allowlist), D-123 found and fixed a real accuracy bug live-affecting all 32 NFL team pages (IR players counted as active roster), D-135 found and fixed NCAAF Scores silently dropping ~75% of real games for weeks (missing `groups=80`). This is a strong, consistent pattern — bugs get caught by deliberate live-checking, not by luck, and every fix in this window cites a specific verification step.

### Strength worth naming
The season-flip-502 retry pattern the 8/8 audit called out as "a proven, reusable Relay-domain asset" (R3) was in fact reused again and generalized further in this window — D-122's NFL Week 1 readiness pass explicitly audited the season-phase model's assumptions before trusting them and caught a real factual error in a code comment (`_nflSeasonPhase()`'s "Thursday after Labor Day" claim is wrong for 2026 — the real opener is Wednesday Sept 9, one day earlier than the comment implies) even though the boundary value itself still resolves correctly this year. That's the review discipline the 8/8 audit asked for, executed on schedule, unprompted.

---

## Part 2 — KAEL (design.md) — Visual System, Component Debt

### K1. The `--accent`-on-`--accent-subtle` contrast WARN is now open across at least 5 review cycles, not 3
Confirmed still failing as of the most recent CI-adjacent verification note found in this window (`DECISIONS.md:1498`, ~2026-08-22): *"same 2 pre-existing `--accent-subtle` WARNs tracked since D-058, unrelated."* This was flagged in the 8/8 audit (K3) as "a decision either way is cheaper than another re-flag," was named Phase 0 item #5 in the same-day roadmap as a "five-minute, zero-risk fix," and is still unresolved a month later. It is the single cheapest open item in this entire audit and the one with the least excuse for staying open.

### K2. DESIGN.md's own `--color-live` correction (fixed 2026-08-08 per D-073) has held
Verified: `CLAUDE.md`'s design-tokens table still states `#ff006e`, and no regression was found in this window. Worth naming that a one-line fix, once made, stayed made — the drift problem in this codebase is specifically about documents nobody revisits, not documents that get corrected wrong.

### Strength worth naming
The home-page redesign shipped in four explicitly-scoped phases (`3d59414` Phase 1, `4365c6e`–`c2101b0` an "Emoji removal" sub-arc run as Phases A–E, `bed2c4a` Phase 2, `7ccf931` Phase 3, `1a13ca4` Phase 4) rather than as one undifferentiated rewrite — each phase has its own commit and, per `DECISIONS.md`, its own scoped rationale (e.g. Phase 3's sport-picker snippets explicitly reused existing per-sport leverage-scoring functions rather than inventing a new one). This is the same phased-scope discipline the 8/8 audit praised elsewhere (Highlight Card Studio's PNG-now/GIF-later split) applied consistently to a much larger initiative.

---

## Part 3 — VERA (ux.md) — Behavioral Flows, Friction

### V1. Dashboard customization has now been deferred three times without a decision
D-107 (2026-08-17, read in full) documents the *third* time "customize the dashboard" has come up, with Vera/Kael/Axiom all giving reasoned positions (Vera: no stated JTBD yet for real reordering; Kael: posture risk from a drag-and-drop pattern; Axiom: feasible, but real new UI-pattern cost) and the entry itself states plainly: **"Decision: Pending. Not started."** This is not sunk-cost drift (nothing was half-built and abandoned) — it's a live, correctly-flagged, repeatedly-deferred owner decision that has now sat open for 23 days as of this audit. Worth naming as a pattern distinct from monetization drift: the team is correctly *not* building ahead of a spec here, but the fork itself needs an owner answer, not a fourth re-flag next month.

### V2. No scoped WCAG audit has happened since the 8/8 audit's V3 finding
Grep of `DECISIONS.md` for "WCAG" since 8/8 returns one incidental keyboard/screen-reader note (D-117 Phase spec) and no audit entry. The roadmap's own Phase 3 item #1 ("a scoped WCAG audit before the paid tier's first real cohort of paying users hits it") is moot in one sense (there is no paying cohort yet — see Part 0) but the underlying backlog the 8/8 audit flagged as "roughly doubled" has only grown further: this window alone shipped NCAAB, WNBA, a shared basketball live-game viewer, an NFL pregame-preview rebuild, and a full home-page redesign, none of which have any WCAG-specific verification entry in `DECISIONS.md`.

### Strength worth naming
D-123's live-verification methodology finding (a service-worker precache shadowing a fresh local edit, producing false-negative bug-fix verification) was caught, root-caused, and folded into `.claude/commands/screenshot.md` as a standing default technique in the same session — exactly the "flag, fix, generalize" lifecycle the 8/8 audit praised for the Draft HQ IA finding.

---

## Part 4 — CIPHER (security.md) — Vulnerability Heatmap

**Severity key follows Cipher's own scale.**

### High (persisting) — `security.md` has not been touched since the 8/8 remediation, and the site's real attack surface has grown substantially underneath it
File mtime confirms `security.md` was last edited 2026-08-08 (the D-073 remediation pass). Its Project Context Block (read in full this session) is *not* the pre-auth "Auth mechanism: None" text the 8/8 audit flagged — that correction held. But it also has no entry for: NCAAB (`/api/ncaab`, `/api/ncaabstandings`), WNBA (`/api/wnba`, `/api/wnbastandings`, `/api/wnbastats`, `/api/wnbaathlete`), `functions/api/og.js` (new external-facing render surface, satori/resvg-wasm), `functions/api/youtube.js` (a shared-secret-gated owner-only endpoint with its own credential set), or `functions/api/nflInsights.js`'s Gemini call path — five real, live, externally-reachable surfaces added or substantially expanded since the file was last read against source. On the one question that actually matters most for revenue risk, the file happens to still be accurate by coincidence, not because anyone re-verified it: **Stripe genuinely still doesn't exist**, so the file's "threat-model this BEFORE the webhook handler is built, not after" framing is still live, correct guidance. That's a lucky accident of the payments track stalling, not evidence the file is being maintained.

### High (process) — D-073's own recommended fix was never adopted
Read `TEAM.md`'s current session-end protocol (lines 236-239) in full: it requires updating `ISSUES.md`, updating `DECISIONS.md`, and writing up out-of-scope findings. **It does not require refreshing a persona's own Project Context Block.** D-073 itself named this explicitly as "worth a deliberate decision... not actioned here since it's a process change." D-110 (2026-08-19) touched `TEAM.md` and four persona files in the same window, for an unrelated token-diet pass — and still did not add the line D-073 recommended. The gap the 8/8 audit's Folio section called the "throughline finding of the whole audit" is now confirmed, by direct inspection of the current protocol text, to be exactly as open as it was a month ago.

### High (new this audit) — `data.md` and `docs.md` were never touched, not even during the 8/8 remediation
File mtimes: `data.md` and `docs.md` are both dated **2026-05-18** — identical to what the 8/8 audit found. D-073's remediation explicitly refreshed `design.md`, `dev.md`, and `security.md` and "removed" stale items from `junior.md`/`ux.md`, but never mentions `data.md` or `docs.md`. These are now the two most stale files in the repo by a wide margin (four months, not one), and — per Part 5 below — `data.md`'s content confirms it: it still lists only MLB Stats API, BDL, NBA.com, ESPN headshots, and Open-Meteo as "External APIs in use," with zero mention of ESPN NFL/NCAAF/NCAAB/WNBA core+standings+stats+athlete endpoints (9+ Pages Functions), Sleeper, nflverse, or Gemini — the overwhelming majority of this project's real external surface.

### Low, unchanged — two owner-action items from P1-006's closure remain open
Confirming old BDL key invalidation at balldontlie.io, and the optional git-history scrub — both flagged Low by the 8/8 audit, both still with no evidence of action in `DECISIONS.md`.

### Informational — cost-bounding discipline held up under real new load
Both Gemini call sites in the repo (`worker/broadcast-blurb.js`, `functions/api/nflInsights.js` — confirmed via grep, no others exist) are cost-bounded: the Blurb worker via a 4-hour KV cache (D-068), Insights via a D1 event-log-checked weekly free-tier limit that the paid path (once real) would bypass deliberately, not accidentally. No new AI/LLM feature shipped in this window without this discipline. Worth naming as a genuine strength that has held under real feature pressure, not just at the point it was originally designed in.

---

## Part 5 — RELAY (data.md) — Pipeline Cost & Efficiency

### R1. `data.md`'s external-API inventory is now missing the majority of the site, confirmed by direct read
Verified by reading the file's Project Context Block in full this session (offset 117-156): it enumerates exactly 5 external sources. It has never been updated to include NFL/NCAAF/NCAAB/WNBA data (ESPN core, ESPN site.web.api, Sleeper, nflverse) or Gemini. This is the same finding the 8/8 audit made (R1) — restated here because the file is unchanged, not because it's new.

### R2. No new data-quality incident this window traces to a gap in `data.md`'s Risk Taxonomy — but that's not evidence the taxonomy was applied
The season-flip-502 pattern and the D-135 `groups=80` scoreboard-cap bug are both textbook instances of the exact Schema Violation / Null Pollution categories `data.md`'s taxonomy already names — but `DECISIONS.md`'s own entries for both (D-072 predates this window; D-135 is fresh) show them being caught by live-verification discipline in the moment, not by anyone consulting `data.md` first. The taxonomy is sound; it is not being used as a working reference, because the file describing it is four months stale and nobody is opening it.

### Strength worth naming, unchanged from 8/8
Caching discipline continues to be designed in at feature-creation time, not retrofitted — `nflInsights.js`'s D1-based free-tier check and the `AI_CACHE`/`YT_CACHE`/`BLURB_CACHE` KV namespaces added across this window all follow the same pattern Relay's persona describes as non-negotiable.

---

## Part 6 — FOLIO (docs.md) — Documentation Staleness

### F1. `CLAUDE.md` contains a real, citable self-contradiction on the Broadcast Blurb deployment status
`CLAUDE.md`'s Deployment section, `worker/` entry (verified against the file content loaded at session start): *"Deployment still pending owner authorization (P2-005)."* This directly contradicts `DECISIONS.md` D-068 (2026-08-09): *"Live-verified 2026-08-09 (owner, via curl against the deployed Worker post-fix)... F1 (Broadcast Blurb) is live."* — and `ISSUES.md`'s own P2 table note (line 17): *"closed and live-verified 2026-08-09."* This is the exact same class of self-contradiction the 8/8 audit caught in `ISSUES.md`'s P2-005 summary row (K/Folio finding, since fixed) — except this one is inside `CLAUDE.md`, the one document this project's own convention calls "the single most actively-maintained file in the repo... trusted as current." It has been wrong for a month.

### F2. Persona-file drift has not been reduced, only redistributed
Of the seven persona files, three (`design.md`, `dev.md`, `security.md`) were refreshed once, on 2026-08-08, and have not been touched since — meaning their "current" state is now a month old against a codebase that grew 40% in that time. Two (`junior.md`, `ux.md`) had stale items removed on the same date but were also not touched again. Two (`data.md`, `docs.md`) were never touched at all — see Cipher's High finding above. **No persona file has been updated in the 32 days since the 8/8 audit**, despite two new sports shipping, a home-page redesign, and dozens of new Pages Functions landing in that window.

### F3. The `docs.md` persona is, by its own file's stated mission, the one most obligated to have caught F1 and F2 — and it is the most stale file of all
`docs.md`'s own text (line 105) states: *"I flag when documentation is uncertain, approximated, or based on observation rather than specification."* The file describing this discipline has not been opened since 2026-05-18.

### Real strength, unchanged
`CLAUDE.md`, `ISSUES.md`, and `DECISIONS.md` themselves remain excellent and current — dated entries through today, real verification steps, real citations. D-110's token-diet pass (archiving closed sections, adding `ROUTER.md`) is a genuine, well-executed process improvement that measurably reduced session-start cost (1,002KB → 578KB) without losing anything (archived, not deleted, indexed by title). The doc-sync discipline this project applies to its three canonical logs is real and still working — the gap is specifically the persona files, which sit outside that discipline by design (`.gitignore`'d) and have no equivalent forcing function.

---

## Part 7 — FINN (junior.md) — Three-Gate Check

Per `TEAM.md`'s own rule, checked every item in `ISSUES.md`/`DECISIONS.md` currently described as gate-complete but unimplemented:

- **Stripe billing integration (Checkout + webhook)** — archived to `docs/archive/ISSUES-shipped-2026-08-19.md` (its live-doc TOC line at `ISSUES.md:291` is itself now a dangling reference to an archived entry — a small doc-sync miss worth a one-line fix). Gate status at archival: *"visual and behavioral specs present. Feasibility present with one explicit open implementation question... Not yet implemented — ready for a build pass once the owner confirms pricing and creates the Stripe product/prices."* **All three gates have been present, and implementation has been zero, for 32 days.**
- **AI League Insights — Paid Tier v1** — implemented (`functions/api/nflInsights.js`, `js/fantasy.js`), but its actual paid-tier gate is inert (see Part 0.2). Not a Finn gap — Finn's job (confirm the spec had three gates before implementation started) was honored; the gap is downstream of Finn's scope, in the owner-only pricing decision.
- **Personalized Fantasy Grade** — implemented, currently free-for-everyone by construction, same root cause.
- **Dashboard customization (D-107)** — correctly *not* implemented; explicitly gated on an owner JTBD answer that hasn't arrived. This is the three-gate rule working as intended, not a gap.
- **NCAAB player leaders/detail** — per `CLAUDE.md`'s own Sport Focus section, still "data-checked as viable but not built (owner decision pending)" as of today, unchanged since D-052 (2026-08-10). **30 days pending**, same status as a month ago.

No other `ISSUES.md` entry currently matches the "all three gates present, not yet implemented" pattern.

---

## Goals Audit (GOALS.md, section by section)

**Constitutional rule ("no-login core stays free forever"):** **Intact, and stronger than a policy statement — it's structurally true.** Every feature shipped in this window (NCAAB, WNBA, all live-game viewers, the home redesign) is fully reachable signed-out. The one place this rule interacts with the paid tier — AI League Insights and Fantasy Grade — currently resolves in the user's favor by accident (no working paywall exists), not by design intent, but the outcome is consistent with the rule either way.

**"No ads, no trackers, no data sales — ever," as amended by D-069:** **Unchanged since D-069 (2026-08-09) — no further movement.** Ads are permitted per the amendment; none are running. Cloudflare Web Analytics (cookieless, no PII) is the only tracking-adjacent thing live, and it's live and collecting — but see Monetization Verdict below on whether anyone has looked at what it's collected.

**G1 (Speed) / G2 (MLB depth) / G3 (Announcer-ready):** Shipped and maintained; no regression found. G3's "Remaining" line (Broadcast Blurb deployment, P2-005) is **stale in GOALS.md** the same way it's stale in `CLAUDE.md` — it's been live since 2026-08-09.

**G4 (Zero Friction):** Intact.

**G5 (Maintainable solo codebase, "readable by a future contributor in 30 minutes"):** **Partially not met, and moving the wrong direction.** `js/mlb.js` at 7,489 lines is not readable in 30 minutes by any reasonable measure, and the total `js/` surface grew 40% in a month with zero decomposition work.

**G6 (Sport scope):** **Shipped faster than the 7/1 or 8/8 baselines expected.** NCAAF, NCAAB, and WNBA are all live with near-full feature parity to NFL's live-game architecture — this is real forward progress, not scope creep, since `CLAUDE.md`'s Sport Focus section explicitly keeps NBA/NHL out of scope and nothing in this window touched either.

**Monetization section:** See below — this is the one section of `GOALS.md` where "shipped" language (D-069's amendment) has outpaced actual shipped revenue infrastructure by a wide and now month-old margin.

---

## Monetization — Plain Verdict

**The site is generating $0/month in revenue, today, and has generated $0/month every day since the constitutional monetization amendment (D-069, 2026-08-09).** This is not a hedge or a "still ramping" framing — it is a structural fact, not a slow start: `isEntitled()` cannot return `true` for any user because `subscriptions` has zero rows and no code path exists anywhere in this repo that could write one. Every payments-adjacent feature that got built (AI League Insights, Personalized Fantasy Grade) ships as a free feature today because there is nothing to charge against. No ad-network application has been sent. No sportsbook affiliate outreach has been sent. No legal review of the affiliate path has happened — `docs/sponsorship-outreach.md`'s "get real gaming-law counsel before signing anything" line is untouched, and no `DECISIONS.md`/`ISSUES.md` entry anywhere in this window mentions consulting one.

**Cloudflare Web Analytics has now been collecting real traffic data for exactly 31 days (live since 2026-08-09), and nobody has looked at it.** A full search of `DECISIONS.md` and `ISSUES.md` since 8/8 for any entry reporting real pulled numbers — pageviews, sessions, unique visitors — returns nothing. The roadmap's own instruction was to accumulate "3-4 weeks of real traffic data" before applying to Playwire; that window closed around 2026-09-06, three days before this audit, and no application has gone out, because — as far as this audit can determine — nobody has pulled the number yet to know whether it clears any network's threshold. This is not "the data doesn't exist yet." The data exists. Nobody has looked.

**The roadmap's own target — subscription live before NFL kickoff — has already been missed, not merely at risk.** The roadmap (`docs/roadmap-2026-08-08.md`) framed this as "target: live before Sep 10, 2026," based on a "Thursday after Labor Day" formula. D-122 (2026-08-31, this project's own NFL-readiness pass) found that formula factually wrong for 2026: Labor Day is Sept 7, and the real 2026 opener is **Wednesday, September 9 — today, the day this audit is being written.** Whichever date is used, Stripe does not exist, no pricing decision has been made, and the target window has closed with zero subscription infrastructure built beyond the D1 schema and the correctly-stubbed read-side check. The plan has not been revised or re-dated anywhere in `DECISIONS.md` — it has simply gone quiet. Thirty-two days and 256 commits of real, well-executed engineering happened in a different direction (sport expansion, live-game viewers, home redesign) while the revenue plan sat completely untouched.

**This is not a criticism of the engineering that did happen — it's a statement about what didn't.** The team is demonstrably capable of shipping the Stripe integration; it is scoped, the D1 schema is done, the entitlement read-side is done, and `nflInsights.js` proves the exact Gemini+cost-bounding pattern the paid tier needs already works in production. The blocker, unchanged since 2026-08-08, is a single business decision — the price — that only the owner can make, and it has not been made.

---

## Ranked Initiative List (cross-persona, effort-weighted, current reality)

1. **Owner makes the pricing decision — the one blocking item, unchanged for 32 days.** (Owner, ~5 minutes of decision time, unblocks a multi-day build) Everything else in the monetization track is either done (D1 schema, entitlement read-side) or waits on this single number. The roadmap's own $4.99/mo-or-$29/yr recommendation is still sitting there, unactioned, not because it's wrong but because nobody has said yes or no to it.
2. **Build the Stripe webhook + Checkout flow once pricing lands.** (Axiom, real scoped work — Checkout hosted page, a signature-verified webhook at `functions/api/stripe/webhook.js`, an upgrade CTA) This is genuinely the single highest-leverage engineering task not yet done in this codebase — it is the only thing standing between two already-built, already-live features and their first dollar of revenue.
3. **Pull the 31 days of Cloudflare Web Analytics data that already exists and report it in `DECISIONS.md`.** (Owner or Axiom, near-zero effort) This is blocking Path A ad-network applications for no engineering reason — the data exists, nobody has looked. A single session reading the dashboard and logging real numbers unblocks Playwire/Raptive/Mediavine applications immediately.
4. **Add a persona-file refresh trigger to `TEAM.md`'s session-end protocol.** (Folio, one line) D-073 recommended this by name 32 days ago and it was never adopted, even during D-110's own pass through the same file. This is the actual root cause of the recurring "persona files are stale" finding this audit and the 8/8 audit both had to make from scratch — fixing the process, not just the files, is what stops a third audit from finding the same thing in October.
5. **Refresh `data.md` and `docs.md` specifically — the two files nobody has touched since May.** (Relay, Folio) Not urgent in the sense of blocking anything today, but they are now the most stale documents in the entire repo (four months, not one) and are the two files whose entire job is catching exactly this kind of drift.
6. **Decide the `--accent`-on-`--accent-subtle` contrast WARN.** (Kael, genuinely five minutes) Open across at least five review cycles now. The cheapest item on this list by a wide margin.
7. **Add `ci.yml` coverage for deploy-check #7 (wrangler.toml present) and #8 (SW cache-version bump-on-change).** (Axiom) #8 specifically would have caught the exact class of bug D-123 spent real debugging time working around live.
8. **Split `js/mlb.js` using the already-proven `liveGame.js`/`scorecard.js` pattern.** (Axiom) Third consecutive audit naming this; still not urgent enough to have blocked anything, but the file is 167 lines heavier than it was at the last audit and shows no sign of stopping on its own.

### The single highest-leverage thing not yet done

**Making the pricing decision.** Every other item on this list — the Stripe build, the ad applications, even the persona-file process fix — either directly depends on it or is a smaller, cheaper task by comparison. Two fully-built, fully-live features (AI League Insights, Personalized Fantasy Grade) are sitting in production right now, working correctly, generating zero revenue for a structural reason that traces to exactly one unmade decision. This project does not have a monetization *engineering* problem — the D1 schema, the entitlement check, and the Gemini cost-bounding pattern are all already proven in production. It has a monetization *decision* problem, and it is the only item on this entire audit where 32 days of otherwise excellent execution changed nothing, because the one input that was needed was never supplied.

---

## Paste-ready entries

### → Append to `ISSUES.md`

```markdown
### CLAUDE.md's Broadcast Blurb deployment line contradicts D-068/P2-005's own closure — stale for a month
**Contributor:** Folio (full-team audit) | **Date:** 2026-09-09

CLAUDE.md's Deployment section, `worker/` entry, states: "Deployment still pending owner authorization (P2-005)." This directly contradicts DECISIONS.md D-068 (2026-08-09): "Live-verified 2026-08-09 (owner, via curl against the deployed Worker post-fix)... F1 (Broadcast Blurb) is live," and ISSUES.md's own P2 table note (line 17): "closed and live-verified 2026-08-09." CLAUDE.md is the one document this project treats as continuously authoritative; this line has been wrong for 32 days.

**Fix:** update CLAUDE.md's `worker/` bullet and GOALS.md's G3 "Remaining" line (same stale claim) to state Broadcast Blurb is live, deployed, and KV-cached, citing D-068.

### ISSUES.md's Stripe billing TOC line points at an archived entry — dangling reference
**Contributor:** Folio (full-team audit) | **Date:** 2026-09-09

ISSUES.md:291 lists "Stripe billing integration (Checkout + webhook)... Three Gates" in the file's own table of contents / index list, but no matching `## ` section exists anywhere in the live document — it was moved to `docs/archive/ISSUES-shipped-2026-08-19.md` during D-110's archival pass and the TOC line was never updated to point there or removed.

**Fix:** either restore a live stub entry (since this is explicitly NOT resolved — all three gates present, zero implementation, per the archived entry's own gate status) or update the index line to point at the archive file, matching the convention used elsewhere in the same index.

### Persona files data.md and docs.md have never been refreshed — four months stale, worse than the 8/8 audit's worst finding
**Contributor:** Cipher/Folio (full-team audit) | **Date:** 2026-09-09

File mtimes confirm `.claude/members/data.md` and `.claude/members/docs.md` are both dated 2026-05-18 — unchanged since before this project's own 2026-08-08 full-team audit, which flagged persona-file staleness as its top cross-cutting finding and refreshed design.md/dev.md/security.md in response, but never touched these two. data.md's Project Context Block (verified by direct read) lists only 5 external APIs (MLB Stats API, BDL, NBA.com, ESPN headshots, Open-Meteo) — zero mention of ESPN NFL/NCAAF/NCAAB/WNBA endpoints (9+ Pages Functions), Sleeper, nflverse, or Gemini, which collectively make up the majority of this project's real external surface as of today.

**Fix:** Relay refreshes data.md's External APIs/Rate Limits/Caching/Known Issues sections against the current functions/api/ directory (39 Functions) and CLAUDE.md's Data Sources section. Folio refreshes docs.md's Project Context Block against current DECISIONS.md state (D-135, not "D-001 through D-007").

### TEAM.md session-end protocol still has no persona-file refresh requirement — D-073's own recommendation, unadopted for 32 days
**Contributor:** Cipher (full-team audit) | **Date:** 2026-09-09

TEAM.md's current session-end protocol (lines 236-239) requires updating ISSUES.md and DECISIONS.md and writing up out-of-scope findings — it does not require refreshing a persona's own Project Context Block when a session surfaces contradicting information. D-073 (2026-08-08) named this exact fix as "worth a deliberate decision" and left it explicitly unactioned as a process change requiring all three seniors' sign-off. D-110 (2026-08-19) edited TEAM.md and four persona files in the same window, for an unrelated token-diet pass, and still did not add this line. Three of seven persona files (design.md, dev.md, security.md) have not been touched since 2026-08-08; two (data.md, docs.md) have never been touched. Without this line, persona-file staleness will keep recurring at every future audit, indefinitely.

**Fix:** add one line to TEAM.md's "All personas — session end" section: "If this session surfaced information contradicting your own Project Context Block, update it before closing the session." Same standard already applied to CLAUDE.md's doc-sync rule.

### ci.yml is missing 2 of 13 deploy-check gates that are meaningfully CI-appropriate
**Contributor:** Axiom (full-team audit) | **Date:** 2026-09-09

.github/workflows/ci.yml (added D-073, 2026-08-08) covers checks #1, #2, #3, #6, #9, #10, #11, #12 of deploy-check.md's 13-point list. #5 and #13 are correctly excluded (report-only / post-deploy-only). Missing: #7 (worker/wrangler.toml present — trivial, one `test -f` line) and #8 (service-worker CACHE_NAME bump-on-change check). #8 specifically is not cosmetic: D-123 (2026-08-31) hit the exact failure mode this check exists to prevent during local verification (a stale SW-cached js/nfl.js shadowing a real fix, producing false-negative bug verification) and had to develop a new isolated-browser-context workaround technique mid-session. A CI check on CACHE_NAME bumps would not have caught that specific local-dev issue, but would catch the equivalent production-facing bug (a deploy that changes a precached asset without bumping the version) before merge.

**Fix:** port deploy-check.md #7 and #8's existing bash logic (already written and documented) into ci.yml as two more required steps.
```

### → Append to `DECISIONS.md`

```markdown
## D-136 — Progress/monetization audit: engineering velocity is real and high; revenue velocity is zero and the plan has gone silent — 2026-09-09

**Status:** open
**Contributors:** Claude (full-team-format audit, all seven file-lenses)
**Date opened:** 2026-09-09 | **Date resolved:** —

**Decision needed:**
A full re-audit (docs/full-audit-2026-09-09.md), re-deriving every claim from source rather than trusting the 2026-08-08 audit or its roadmap, found: (1) the subscription tier's blocking item — an owner pricing decision — has been unmade for the entire 32 days since it was flagged as the sole blocker in D-069/the 8/8 roadmap; (2) Cloudflare Web Analytics has collected 31 days of real traffic data that nobody has pulled or reported, blocking Path A ad applications for a purely process reason, not a data reason; (3) the roadmap's "before NFL kickoff" target has already passed (D-122 found the real 2026 opener is Sept 9, not the roadmap's assumed Sept 10 — today, at time of this audit); (4) two of the three spec'd paid features (AI League Insights, Personalized Fantasy Grade) shipped and are live in production as *free* features by construction, since there is no working paywall to gate them behind; (5) D-073's own recommended process fix (persona-file refresh on session-end) was never adopted, and two persona files (data.md, docs.md) have never been touched at all, predating even the 8/8 audit's remediation pass.

**Options considered:**
1. Continue the current pattern — high feature velocity on the product surface, no forcing function on the monetization decision — and revisit at the next audit.
2. Treat the pricing decision as the literal top-priority item for the owner's next session, ahead of any further sport/feature work, given that the D1 schema, entitlement check, and Gemini cost-bounding pattern are all already proven and waiting.
3. Formally de-scope monetization for this quarter (reverse D-069's urgency framing explicitly) if the owner's actual priority has shifted to product breadth — not a criticism, but currently undocumented either way; GOALS.md still frames this as an active, ratified push with no revision.

**Decision:**
Pending owner input. This audit does not have standing to choose between options 2 and 3 — that is exactly the "get an explicit owner decision" gap the audit itself is flagging. What it can and does say plainly: whichever option is correct, option 1 (silent continuation) is what has actually been happening for 32 days, and it should stop being the default by inertia.

**Rationale:**
GOALS.md's Monetization section and D-069 both frame paid-tier work as an active, owner-directed push. DECISIONS.md's own dated-entry discipline means a genuine de-scoping, if that's what has quietly happened, should be logged as a decision the same way the original push was — not left to be inferred from 32 days of silence on the topic.

**Implications:**
- If Option 2: next session's first action is the pricing number, then the Stripe webhook/Checkout build (scoped, ready — see docs/roadmap-2026-08-08.md Phase 1 Step 2).
- If Option 3: GOALS.md's Monetization section and the "AI League Insights — Paid Tier v1"/"Personalized Fantasy Grade"/"Weekly Fantasy Digest" ISSUES.md entries should be re-labeled to reflect they are shipping as free features, not paid ones pending billing — the current framing ("paid tier") is inaccurate to what's actually live.
- Either way: pull and log the 31 days of Web Analytics data this week — it is a near-zero-cost action that unblocks the entire ads/affiliate track regardless of which monetization option is chosen.
- Either way: add the persona-file refresh line to TEAM.md's session-end protocol (see paste-ready ISSUES.md entry above) so the next audit isn't re-deriving the same drift finding a third time.
```
