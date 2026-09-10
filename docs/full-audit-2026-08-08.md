# SportStrata Full Technical & Financial Audit — 2026-08-08

**Format:** Per-persona findings from the file-lens authorities (`design.md`, `dev.md`, `ux.md`, `security.md`, `data.md`, `docs.md`, `junior.md`), reasoned strictly from each persona's own standing beliefs and domain ownership per `TEAM.md`.
**Method:** Read all seven persona files, `TEAM.md`, `DESIGN.md`, `CLAUDE.md`, the full tail of `ISSUES.md`/`DECISIONS.md`/`GOALS.md` (current through D-072, 2026-08-09), `package.json`, `wrangler.toml`, the two live `.github/workflows`, `.claude/commands/deploy-check.md`, `migrations/0001-0006`, and verified specific claims directly against source (`js/api.js`, `js/mlb.js` line count, CSP in `index.html` vs `_headers`, `tests/`, `docs/archive/deep-review-2026-07-01.md` for baseline comparison). Every finding below is sourced to a specific file, line, or dated log entry — nothing here is inferred without a citation the owner can re-check.

**Headline finding, stated up front because it shapes everything below:** the three canonical logs (`ISSUES.md`, `DECISIONS.md`, `GOALS.md`) are excellent and current — dated entries through 2026-08-09, real bugs, real verification steps, real owner rulings. But the **seven persona files that are supposed to give each specialist their working memory have not been updated since onboarding**, in three cases (`dev.md`, `security.md`, `design.md`) badly enough that a session opened cold from that file would misdirect real work. This is not a cosmetic problem — `security.md`'s entire threat model predates the auth system, and `dev.md`'s architecture snapshot predates NCAAF, accounts, and Analytics. The audit below surfaces this as the top cross-cutting issue, then goes domain by domain.

---

## Part 0 — Financial Framing

Three real, dated financial threads exist in the project already; the audit's job is to check them against engineering reality, not invent new ones.

1. **Monetization reversal (D-069, 2026-08-09).** `GOALS.md`'s constitutional rule "No ads, no trackers, no data sales — ever" (ratified 2026-07-01) was amended the same week to allow sportsbook affiliate revenue (CPA only, not rev-share — 8 US states require affiliate licensing that can approach the operator's own licensing cost per `docs/sponsorship-outreach.md`) and a paid subscription tier. This is a real identity change to a product whose GOALS.md still opens by describing itself as free-forever. The amendment was disclosed and dated rather than silently overwritten, which is the right process — but it means the "no ads ever" line quoted in the July 1 deep-review (`docs/archive/deep-review-2026-07-01.md` Part 0) is no longer true and any external-facing copy repeating it needs an audit pass (Folio, below).
2. **Cost-bounding discipline is real and working.** D-039's rule ("nothing meters per user action, ever") caught a live bug before it shipped — the Broadcast Blurb worker was about to go out calling Gemini live and uncached on every click; D-068 caught it and added a 4-hour KV cache keyed by `sport:playerId:group:season`, which is the correct fix for API-cost blast radius. This is good financial engineering, not just good engineering — worth naming as a strength, since it would have been easy to ship the uncached version and find out about the bill later.
3. **Engineering-time cost of the untouched July 1 recommendation.** The July 1 deep-review flagged `js/mlb.js` at 7,322 lines as "past the ceiling of the flat-file architecture" and recommended decomposition. As of this audit it is **7,409 lines** — it grew, and the recommended split never happened, despite roughly five weeks of continuous, high-velocity feature shipping in the interim (D-042 through D-072). That's not a crisis, but it is compounding cost: every session that touches MLB logic now pays a larger tax to locate the right function in one file that mixes fetch plumbing, constants, and a dozen view renderers.

---

## Part 1 — AXIOM (dev.md) — Architecture, Tests, CI/CD, Performance

### A1. No CI gate exists — the entire 13-point release safety net is opt-in

`.github/workflows/` contains exactly two workflows: `content-queue.yml` (a scheduled bot that builds NFL/NCAAF content drafts) and `mlb-bot.yml` (a scheduled social-digest generator). **Neither runs on push or pull request, and neither runs `node --test`.** The actual regression safety net — 33 unit tests, `tools/check-manifest.cjs`, `tools/check-themes.cjs --strict`, the NUL-byte corruption scan, the CSP-sync check — is fully specified in `.claude/commands/deploy-check.md` and is real, well-designed, and entirely manual. It only runs when whoever is pushing remembers to type `/deploy-check` first. On a static site with no login this was a reasonable risk to carry. It is a materially different risk now that the same repo holds Stripe entitlement logic (`migrations/0006_monetization_v1.sql`), session auth (`better-auth`, D1 `USER_DB`), and payment-adjacent code paths (`functions/api/nflInsights.js`'s entitlement check). **Recommendation:** wrap the existing 13 checks (they don't need to be redesigned, only invoked) in a `.github/workflows/ci.yml` that runs on every push to `main` and every PR. This is close to free — the checks exist, tested, and documented already — and it closes the single largest gap between "we have a good process" and "the process cannot be skipped."

### A2. Test coverage is real but narrow, and covers none of the surfaces that now move money or sessions

`tests/` has 5 files (`stats.test.js`, `vbd.test.js`, `query.test.js`, `odds.test.js`, `scorebug.test.js`) exercising pure computed-stat and normalization functions in `mlb.js`, `fantasy.js`, and `scorebug.js`. That is a genuine improvement on the July 1 review's "zero tests" finding (A2) and should be credited as such. But of 37 JS files / 28,496 lines, **zero tests touch `js/auth.js`** (886 lines — session state, the follow system, sign-in sheet logic), **zero touch `js/navigation.js`** (1,274 lines — all hash routing, the exact class of bug that produced the D-070 `#dashboard`/`#account` refresh bug), and zero touch any Cloudflare Pages Function, including `functions/api/nflInsights.js` (the paid-tier entitlement gate) or `functions/api/follows.js`/`prefs.js` (session-scoped D1 writes). Every fix logged in D-055 through D-072 — roughly two dozen real, shipped bugs over one week — was verified by `node --check` (syntax only) plus a manual `curl` or browser click-through, never a regression test. That's an acceptable verification method for a one-time fix; it is not a substitute for a test that stops the same bug from coming back during a future refactor.

### A3. The `mlb.js` monolith recommendation from the last audit was never actioned

7,409 lines today vs. 7,322 on 2026-07-01 — it grew during the interval it was flagged for decomposition. The comparison matters because the team demonstrably *can* execute this kind of split when it's prioritized: `liveGame.js` and `scorecard.js` were already carved out of `mlb.js` using exactly the pattern the July review recommended reusing. This isn't a new idea that needs validation — it's a proven pattern sitting unapplied to the file that needs it most.

### A4. `dev.md`'s Project Context Block will actively misdirect the next cold Axiom session

Per `TEAM.md`'s own session-start protocol, Axiom reads `DECISIONS.md`/`ISSUES.md`/`GOALS.md` first — so the *canonical* logs are read correctly. But `dev.md`'s own "Project Context Block" (the persona's baseline understanding of the codebase) still states: P1-006 is unresolved and BDL_API_KEY is "a plaintext string hardcoded in api.js:11" (verified false — `api.js:11` reads `const BDL_API_KEY = ''; // KEY REMOVED`, and P1-006 has been closed in source since 2026-06-09 per `ISSUES.md`'s own reconciliation note); the script load order chain omits `detailFrame.js`, `errorHandler.js`'s real position, `auth.js`, `ncaaf.js`, `scorebug.js`, `news.js`, `odds.js`, `sos.js`, `query.js`, and `search.js` entirely; there is no mention anywhere in the file of accounts, D1, `USER_DB`, NCAAF, Cloudflare Web Analytics, or the Gemini/Broadcast Blurb worker — all shipped, all load-bearing, none reflected. A session that trusted this file's architecture summary over a fresh read of `CLAUDE.md` would be working from a snapshot roughly three months and a dozen major features stale.

### Strength worth naming
The retry-once-on-default pattern for the Aug/Sep season-flip 502 bug (first found in `ncaafstats.js`, D-056) was correctly generalized and proactively hunted down across all 9 season-computing Functions in D-072, catching two more live/imminent instances (`ncaafathlete.js` live now, `nflplayer.js`/`nflstats.js` dormant until Sep 1) before they became incidents. That's the kind of pattern-reuse the July review's A1 recommendation was asking for, executed correctly on a smaller scale — worth reusing the *review method*, not just the code fix, for the `mlb.js` split.

---

## Part 2 — KAEL (design.md) — Visual System, Component Debt

### K1. `DESIGN.md` — Kael's own authoritative reference — contains a factual error that CLAUDE.md itself has already corrected elsewhere

`DESIGN.md`'s "Color is a language" section states the semantic trio as `--color-live` **amber**. `CLAUDE.md`'s design-tokens table independently documents: *"`--color-live` (hot pink/magenta, `#ff006e` — corrected 2026-08-02; was documented as 'amber' but never was, caught while designing N-17's injury-status badges)."* `DESIGN.md` was never amended in that pass. This directly violates `DESIGN.md`'s own stated enforcement rule: *"If a change violates a rule here, either the change is wrong or this page gets amended in the same commit — never neither."* The correction happened in `CLAUDE.md` and in the N-17 ISSUES.md entry, but not in the one document explicitly described as "what visual review checks against." Anyone — including Kael — reviewing new work against `DESIGN.md` today is checking against a token that hasn't existed in code for weeks.

### K2. `design.md`'s Project Context Block has the wrong brand color entirely

The persona file lists `--accent (#7c8df0)` — a blue-violet. The actual, current, correct value (`CLAUDE.md`, confirmed live in the CSP-adjacent design-tokens table) is `#ff8100`, orange-gold. This isn't a minor drift on a secondary token — `DESIGN.md` itself opens with *"Orange on an engineered near-black... that is SportStrata's face."* Kael's own reference file describes the product's single most identity-defining color as the wrong hue family.

### K3. One real, open, unowned token debt: `--accent` on `--accent-subtle` fails contrast in 2 of 3 live themes

`tools/check-themes.cjs --strict` — the actual enforced release gate — reports a genuine WARN: 2.98:1 in `light` and 2.88:1 in `nl-monarchs`, both below the 3.0 minimum; `dark` (the default) is clean. This has been logged and explicitly deferred to Kael across at least three later feature passes (most recently noted again in the D-053/N-16 verification trail) because "a value change ripples through every badge/pill/button using that pair" and token ownership is correctly Kael's under the RACI in `TEAM.md`. It is real, it is not blocking (WARN not FAIL), and it has now aged across several ship cycles without a decision either way.

### Strength worth naming
The Draft HQ information-architecture finding from the July 1 review (V1: "four sibling ranked lists a new user can't tell apart") was **not** just fixed once — it was fixed (D-035, consolidated into one Draft HQ + tab strip), the fix was later found to still be incomplete (six of eight destinations were invisible outside the strip itself), and D-055 went back and closed that gap with a two-cluster IA (Draft Prep / In-Season) plus full nav-menu discoverability. That's the review-finding lifecycle working as intended — flag, fix, re-verify, fix again — and it's the model the `mlb.js` split and the `--accent-subtle` contrast decision should follow instead of sitting open.

---

## Part 3 — VERA (ux.md) — Behavioral Flows, Friction, Accessibility

### V1. `ux.md`'s "known pain points" list is stale and now inaccurate

The persona file lists "No team filter on leaderboards (active 2026 gap)" as an open friction point. It shipped — `GOALS.md` (2026-08-0x entry) documents the inline-style→CSS-class migration for `.leaderboard-team-filter`, confirming the feature exists and was already refined. A Vera session trusting this file's friction inventory would propose (re-)building something that's done, wasting a round-trip exactly the way `TEAM.md`'s own "who to start with" guidance is designed to prevent.

### V2. A real, currently-live severity-worthy bug sat in production for weeks, undetected by any process

D-070 (2026-08-09): the account-menu avatar has been unclickable for every signed-in user, on every device, since D-031 shipped — `js/auth.js`'s outside-click closer checked `e.target !== btn`, but the avatar span fills the button with zero padding, so every real click's target is the inner span, and the same click that opened the menu immediately re-closed it in the same synchronous pass. This means the Dashboard and Account page — both real, shipped features — were effectively unreachable via their intended entry point from the moment they shipped until this pass caught it live. This is exactly the class of gap Vera's own standing rule exists to prevent ("I won't ship a flow I haven't personally walked through end-to-end on the actual device/browser") — it was caught, eventually, but by Axiom during an unrelated mobile-audit pass, not by a UX review gate. Worth a standing note: any new interactive control gets a live click-through as part of its own review, not deferred to "whenever someone else happens to click it."

### V3. Accessibility debt is disclosed, not hidden — but still real and now larger

`ux.md` states plainly: "No WCAG audit has been run — treat this as a gap to close, not a guarantee." That's honest and correctly scoped. The July 1 review's V3 finding (accessibility regressed by omission on every view shipped since the last audit) has grown further since — SOS heatmaps, tier colors, VORP columns, the Injury Report status badges (N-17, which specifically had to work around a color-contrast surprise mid-build, per the DESIGN.md finding above), Dashboard, Settings, and Account have all shipped without a scoped audit pass. This isn't a new problem, but the backlog of unaudited surfaces has roughly doubled since it was last named.

---

## Part 4 — CIPHER (security.md) — Vulnerability Heatmap

**Severity key follows Cipher's own scale: Critical / High / Medium / Low / Informational.**

### High — `security.md`'s threat model has no awareness of the entire auth/payments surface

This is the most consequential persona-drift finding in the audit, not a documentation nicety. `security.md`'s Project Context Block — the file whose entire job is to enumerate assets, integrations, and known concerns — lists exactly one credential in the system (`BDL_API_KEY`, itself described as still-unresolved, which is false) and states plainly: *"Auth mechanism: None. Fully public site."* That was true when the file was written. It has not been true since D-031 shipped: the project now runs `better-auth` with magic-link email, Google OAuth, and passkeys; a D1 `USER_DB` holding session and user rows (`migrations/0001-0006`); a Stripe-adjacent entitlement table (`subscriptions`, `migrations/0006`) with real payment status fields; and session-scoped write endpoints (`functions/api/follows.js`, `prefs.js`, `draftHistory.js`, `sleeperLink.js`, `nflInsights.js`). None of this appears anywhere in Cipher's asset inventory, threat actor profile, or attack surface map. A `docs/auth-security-spec.md` exists and presumably drove the original D-031 security review — but that review's conclusions were never folded back into `security.md` itself, so the persona's *standing* threat model has silently reverted to pre-auth assumptions. Per Cipher's own stated method ("Step 1 — Asset inventory... you can't prioritize protection without knowing what's worth protecting"), a session run cold from this file would not know Stripe, sessions, or PII exist in this codebase at all.

### Low — P1-006 is closed in source but two owner-action items remain genuinely open
Verified directly: `api.js:11` is `const BDL_API_KEY = ''`, `BDL_PROXY_URL` is wired, and the guard bug is fixed. `ISSUES.md`'s own reconciliation entry (2026-06-09) is accurate and current. The two remaining items are correctly scoped as owner actions, not engineering: confirm the old key is invalidated at balldontlie.io, and optionally scrub git history. Both are Low severity now (the live risk is closed; residual risk is "an old, dead key sits in git history"), but they've been open since 2026-06-09 with no evidence either was completed. Worth a direct owner ping rather than continuing to carry them as a standing note.

### Informational — CSP is correctly in sync
Verified byte-for-byte: the `connect-src`/`img-src`/`script-src` directives in `index.html`'s meta tag and `_headers` match exactly, including the recent `static.cloudflareinsights.com`/`cloudflareinsights.com` additions for Web Analytics. This is Cipher's own standing concern ("CSP is maintained in two places that must stay in sync... divergence = security gap or breakage") and it is currently being honored correctly. No finding — flagging as a clean check, not a gap.

### Informational — the P1-006 hardcoded-key incident pattern has not recurred
The Gemini API key (D-068) and Stripe integration both went through `wrangler secret put`, never committed source, consistent with the lesson from the original P1-006 incident. Worth naming as evidence the org-level lesson was actually internalized, not just patched once.

---

## Part 5 — RELAY (data.md) — Pipeline Cost & Efficiency

### R1. `data.md`'s "External APIs in use" inventory is missing most of what's now live

The persona file lists MLB Stats API, BDL, NBA.com, ESPN headshots, and Open-Meteo. It has no entry at all for ESPN's NFL/NCAAF core and site.web.api endpoints (the backbone of the entire NFL-beta and NCAAF surfaces, `functions/api/nfl.js`, `ncaaf.js`, `ncaafstandings.js`, and 6+ more Functions), Sleeper (`functions/api/sleeper.js`, the entire fantasy/mock-draft/waiver-wire feature set), nflverse (Next Gen Stats, 2016+), or the Gemini Interactions API (Broadcast Blurb). This is Relay's own domain — the persona whose job is "read the documentation, then read the actual API responses" has a documented inventory covering roughly a third of the site's real external surface. The Data Risk Taxonomy in the same file (Schema Violation, Null Pollution, Rate Exhaustion, etc.) is sound and reusable, but it's never been applied to the newer sources — the season-flip 502 pattern that hit `ncaafstats.js`/`ncaafathlete.js`/`nflplayer.js`/`nflstats.js` (D-072) is a textbook Schema Violation / Null Pollution case that Relay's own taxonomy would have flagged had the newer endpoints been in scope for review.

### R2. Caching discipline is real and consistently applied to new work

`ApiCache` TTL buckets, the Cloudflare D1 edge cache, and — most recently — the Workers KV pattern for Broadcast Blurb (4h TTL, keyed to avoid per-click cost) all follow the same discipline Relay's persona describes as non-negotiable ("I won't build a caching layer without defining its invalidation strategy"). This is a genuine strength: cost-bounding is being designed in at the point of feature creation, not retrofitted.

### R3. The retry-once-on-default season-flip pattern is now a proven, reusable Relay-domain asset

Four files now share the identical fix shape (`ncaafstats.js`, `ncaafathlete.js`, `nflplayer.js`, `nflstats.js`, per D-072). This is exactly the kind of "schema drift is the silent killer" pattern Relay's own beliefs describe — worth formally naming as the standing answer in `data.md` itself (currently it lives only in `DECISIONS.md` D-072's prose) so the next engineer reaches for it directly instead of re-deriving it.

---

## Part 6 — FOLIO (docs.md) — Documentation Staleness

This is the throughline of the whole audit, so the finding is stated plainly rather than softened: **the persona whose entire job is "flag outdated documentation as a bug, not a low-priority backlog item" has the most stale file of the seven.** `docs.md`'s own Project Context Block is timestamped **2026-05-18** — roughly 12 weeks and dozens of shipped features behind the current session (2026-08-09) — and still describes Cipher/Relay/Folio as "newly onboarded," `DECISIONS.md` as running "D-001 through D-007 at minimum" (it's at D-072), and the codebase state as pre-Phase-1-scorecard. Every other persona file inherited some version of this same drift, in proportion to how much the underlying system changed since May: `dev.md` and `security.md` worst (both describe a pre-auth, pre-NCAAF, P1-006-open world), `design.md` next (wrong brand color, stale DESIGN.md contradiction), `data.md` and `junior.md` next (missing NFL/NCAAF data sources; stale blocker list), `ux.md` least severe (mostly one resolved friction item).

**Concrete, smaller findings in the same spirit, all independently verified:**

- `ISSUES.md`'s own P2 summary table (line 43) still lists P2-005 (Broadcast Blurb undeployed) as an active row with deploy instructions, even though the detailed entry directly below it and `DECISIONS.md` D-068 both confirm it was closed and live-verified 2026-08-09. This violates the file's own stated house rule at the top: "When fixed, delete the row." Small, but it's a live self-contradiction inside the one document Finn is required to trust literally.
- `junior.md`'s "Active blockers I'm aware of" list still names both P1-006 (closed 2026-06-09) and P2-005 (closed 2026-08-09) as things Finn must flag immediately if encountered — both are now false alarms waiting to happen.
- `GOALS.md`'s "No ads... ever" constitutional language (2026-07-01) needed the explicit, dated amendment it got in D-069 — that was done correctly and is a good example of the right process; flagging only because any external-facing copy (marketing page, README) that still quotes the pre-amendment line needs the same audit pass Folio would normally catch.

**Recommendation, stated as a process fix, not just a one-time cleanup:** `TEAM.md`'s session-start protocol requires every persona to read `DECISIONS.md`/`ISSUES.md`/`GOALS.md` first — which is why those three files stay accurate. It does **not** require refreshing that persona's own Project Context Block against what was just read. Add one line to the "session end" protocol in `TEAM.md`: *if a session surfaces information that contradicts your own Project Context Block, update the block before closing the session* — the same standard already applied to `CLAUDE.md` via the doc-sync rule. Without that, this exact audit will be re-runnable, with a bigger gap, in another twelve weeks.

---

## Part 7 — FINN (junior.md) — Q4 Gatekeeper Check

This project does not track work by fiscal quarter — there's no "Q4" label anywhere in `ISSUES.md`, `DECISIONS.md`, or `GOALS.md`; work is tracked by dated entries and P/D/N-numbers. Treating "upcoming Q4 work" as "the next major queued initiative not yet implemented," per the three-gate rule (`TEAM.md`):

- **AI League Insights — Paid Tier v1** (the D-069 subscription tier) is the one item in `ISSUES.md` explicitly marked *"All three gates present. Not yet implemented — this is a landed spec, ready for a future session's implementation pass once the owner confirms pricing and gives the go-ahead."* Visual spec (Kael): restraint rules stated, no blur/FOMO paywall dimming. Behavioral spec (Vera): full states specified per the entry. Feasibility (Axiom): confirmed buildable from three already-proven pieces (Stripe Checkout, the D-068 Gemini+KV pattern, existing entitlement-checking discipline). **All three gates are genuinely present** — this is not a case of Finn needing to flag a gap and wait. The only blocker is a business decision (pricing) explicitly left to the owner, not a spec gap.
- **Sportsbook affiliate/CPA outreach** (the other D-069 track) is not a feature with a UI to gate — it's business development blocked on real traffic numbers per `docs/sponsorship-outreach.md`. The three-gate rule doesn't apply; no finding.
- No other item currently in `ISSUES.md` is both (a) queued as the "next" initiative and (b) missing a gate. If the owner intends different work as "Q4," Finn's correct move per `junior.md`'s own standing rule is to ask which specific initiative before assuming — not guess.

---

## Ranked Initiative List (cross-persona, effort-weighted)

1. **Wire the existing `/deploy-check` 13 checks into a required GitHub Actions job.** (Axiom, A1) Near-zero net-new work — the checks exist and are documented — closes the largest process gap on a codebase that now handles payments.
2. **Refresh all seven persona Project Context Blocks against current `CLAUDE.md`/`DECISIONS.md` state, prioritized `security.md` and `dev.md` first.** (Folio, cross-cutting) This is the throughline finding of the whole audit; every other domain's drift traces back to this one gap.
3. **Amend `DESIGN.md`'s `--color-live` entry and Kael's own `design.md` accent-color value.** (Kael/Folio, K1/K2) Five-minute fix; currently the one document explicitly named "what visual review checks against" is wrong on the brand's single most identity-defining token.
4. **Decide `--accent`-on-`--accent-subtle` contrast (K3) — ship a value or explicitly defer with a date.** It's been sitting as a WARN across three-plus review cycles; a decision either way is cheaper than continuing to re-flag it.
5. **Split `js/mlb.js` using the already-proven `liveGame.js`/`scorecard.js` extraction pattern.** (Axiom, A3) Not urgent, but it's the one July 1 recommendation that regressed instead of improving.
6. **Add tests for `js/auth.js` and the payment/entitlement Functions before the paid tier (Finn's gate-cleared item) goes into an implementation pass.** (Axiom, A2) The one place where "zero test coverage" and "money now moves through this code" now overlap directly.

---

## Paste-ready entries

The following are formatted to the exact templates in `TEAM.md` ("Documentation Standards") and are ready to append to `ISSUES.md` and `DECISIONS.md` as-is.

### → Append to `ISSUES.md`

```markdown
### Persona files (.claude/members/*.md) are stale relative to CLAUDE.md/DECISIONS.md — dev.md and security.md worst
**Contributor:** Folio (full-team audit) | **Date:** 2026-08-08

Full-team audit (Kael/Axiom/Vera/Cipher/Relay/Folio/Finn) found all seven persona files carry a "Project Context Block" that predates significant shipped work, in three cases badly enough to misdirect a cold session:

- `dev.md`: states P1-006 is unresolved (`api.js:11` has held `BDL_API_KEY = ''` since 2026-06-09); script load order chain omits detailFrame.js/auth.js/ncaaf.js/scorebug.js/news.js/odds.js/sos.js/query.js/search.js; zero mention of accounts, D1 USER_DB, NCAAF, Web Analytics, or the Gemini Broadcast Blurb worker.
- `security.md`: threat model states "Auth mechanism: None. Fully public site" — false since D-031 shipped better-auth + D1 USER_DB + session-scoped write endpoints + Stripe entitlement tables (migrations/0006). Asset inventory has no auth/payments entry at all.
- `design.md`: `--accent` listed as `#7c8df0` (blue-violet); correct current value is `#ff8100` (orange-gold, per CLAUDE.md). `--color-live` listed as amber; corrected in CLAUDE.md 2026-08-02 to `#ff006e`.
- `data.md`: "External APIs in use" omits ESPN NFL/NCAAF core+site.web.api, Sleeper, nflverse, and Gemini — roughly two-thirds of the site's real external surface.
- `docs.md`: own Project Context Block timestamped 2026-05-18, ~12 weeks and dozens of features stale; still describes DECISIONS.md as "D-001 through D-007 at minimum" (currently D-072).
- `junior.md`: "Active blockers" lists P1-006 and P2-005, both closed (2026-06-09 and 2026-08-09 respectively).
- `ux.md`: "known pain points" lists "No team filter on leaderboards" as an open gap; shipped (GOALS.md, inline-style→class migration entry).

**Why it matters:** TEAM.md's session-start protocol has every persona read DECISIONS.md/ISSUES.md/GOALS.md first, which is why those three stay accurate — but nothing requires refreshing the persona's own Project Context Block against what was just read, so drift is silent and compounding.

**Fix:** each senior/specialist refreshes their own Project Context Block against current CLAUDE.md/DECISIONS.md state. Recommend prioritizing security.md and dev.md first (highest-consequence drift). Process fix: add a line to TEAM.md's "session end" protocol requiring a Project Context Block update whenever a session surfaces information that contradicts it — same standard already applied to CLAUDE.md's doc-sync rule.

### DESIGN.md — `--color-live` entry contradicts CLAUDE.md's own 2026-08-02 correction
**Contributor:** Kael (audit finding), Folio (doc-sync) | **Date:** 2026-08-08

DESIGN.md's "Color is a language" section lists the semantic trio as `--color-live` **amber**. CLAUDE.md's design-tokens table documents this was corrected 2026-08-02 to `#ff006e` (hot pink/magenta) — "was documented as 'amber' but never was, caught while designing N-17's injury-status badges." DESIGN.md was not amended in that pass, violating its own stated rule: "If a change violates a rule here, either the change is wrong or this page gets amended in the same commit — never neither."

**Fix:** one-line edit to DESIGN.md's Semantic trio bullet. Owner: Kael (visual-token R/A per TEAM.md RACI).

### ISSUES.md P2 summary table still lists P2-005 as active — contradicts its own closed detail entry
**Contributor:** Folio (audit finding) | **Date:** 2026-08-08

The P2 — Bugs summary table (top of file) lists P2-005 (Broadcast Blurb undeployed) with live deploy instructions. The detailed entry for P2-005 further down, and DECISIONS.md D-068, both confirm it was closed and live-verified 2026-08-09 (real Gemini blurb generated, KV cache hit confirmed on repeat request). This file's own house rule states: "When fixed, delete the row." Self-contradicting as currently written.

**Fix:** delete the P2-005 row from the summary table.

### No CI gate enforces the /deploy-check protocol — 13 real checks are entirely opt-in
**Contributor:** Axiom (full-team audit) | **Date:** 2026-08-08

`.github/workflows/` has two scheduled content-bot workflows (content-queue.yml, mlb-bot.yml); neither runs on push/PR, neither runs tests. The full release safety net (33 unit tests, manifest sync, theme contrast contract, NUL-byte scan, CSP-sync check — .claude/commands/deploy-check.md) only runs when the person pushing remembers to type `/deploy-check`. This was a reasonable risk on a static no-login site; it's a different risk now that the repo holds Stripe entitlement logic (migrations/0006_monetization_v1.sql) and session auth (better-auth, D1 USER_DB).

**Fix:** wrap the existing 13 checks in a required `.github/workflows/ci.yml` triggered on push to main and on PR. The checks themselves need no redesign — only invocation.

### Zero test coverage on auth.js, navigation.js, and every Cloudflare Pages Function
**Contributor:** Axiom (full-team audit) | **Date:** 2026-08-08

tests/ covers pure computed-stat/normalization functions in mlb.js, fantasy.js, scorebug.js (5 files, 33 tests) — a real improvement on the 2026-07-01 review's "zero tests" finding. But js/auth.js (886 lines — session state, follow system), js/navigation.js (1,274 lines — all hash routing), and every functions/api/*.js Pages Function (including the paid-tier entitlement gate, functions/api/nflInsights.js) have no test coverage at all. Every fix in D-055 through D-072 (~2 dozen real bugs, one week) was verified by node --check (syntax only) plus manual curl/browser click-through, never a regression test.

**Fix:** add node:test coverage for auth.js's session/follow logic and navigation.js's hash-routing dispatch before the paid subscription tier (fully spec'd, gates cleared, ISSUES.md "AI League Insights — Paid Tier v1") goes into an implementation pass — this is the first place "no tests" and "real money moves through this code" overlap directly.

### js/mlb.js monolith — July 1 recommendation to decompose was never actioned, file grew instead
**Contributor:** Axiom (full-team audit) | **Date:** 2026-08-08

docs/archive/deep-review-2026-07-01.md flagged mlb.js at 7,322 lines as "past the ceiling of the flat-file architecture," recommended decomposing along existing view seams (leaders/players/detail/games/teams/standings), and noted the pattern already works — liveGame.js and scorecard.js were successfully carved out the same way. Current line count: 7,409 — it grew during 5 weeks of otherwise very high shipping velocity (D-042 through D-072), meaning the split was deprioritized under feature pressure rather than decided against.

**Fix:** no urgency, but worth scheduling — the proven extraction pattern (liveGame.js/scorecard.js precedent) is directly reusable.

### --accent on --accent-subtle contrast WARN — unowned across 3+ review cycles
**Contributor:** Kael (audit finding, re-flag) | **Date:** 2026-08-08

tools/check-themes.cjs --strict reports a real WARN: 2.98:1 (light theme) and 2.88:1 (nl-monarchs), both below the 3.0 minimum; dark (default) is clean. Logged and deferred to Kael across at least 3 later feature-verification passes with no decision either way (value change ripples through every badge/pill/button using the pair).

**Fix:** Kael picks a new --accent-subtle value (or explicitly defers with a stated reason/date) — a decision either way costs less than continuing to re-flag it every cycle.
```

### → Append to `DECISIONS.md`

```markdown
## D-073 — Full-team audit: persona-file drift is the top cross-cutting risk; CI gate and mlb.js split are the top engineering items — 2026-08-08

**Status:** open
**Contributors:** Kael, Axiom, Vera, Cipher, Relay, Folio, Finn (full-team audit, all seven file-lenses)
**Date opened:** 2026-08-08 | **Date resolved:** —

**Decision needed:**
Whether to (a) adopt a standing process fix requiring persona Project Context Blocks to be refreshed whenever a session surfaces contradicting information, in addition to the existing CLAUDE.md doc-sync rule, and (b) prioritize the CI-gate and mlb.js-decomposition engineering items against the current feature-velocity roadmap (D-069 paid tier, D-067 brainstorm queue).

**Options considered:**
1. Treat this as a one-time cleanup — refresh all 7 persona files now, no process change. Cheapest, but the same drift reappears (the July 1 deep-review already predicted and partially caught this exact class of gap for CLAUDE.md; persona files were never brought under the same discipline).
2. Add a persona-file refresh step to TEAM.md's session-end protocol (mirroring the existing CLAUDE.md doc-sync rule), owned by Folio for cross-file consistency but executed by each senior for their own file. Higher cost per session, but closes the gap structurally.
3. Do nothing — accept periodic full-team audits as the correction mechanism. Rejected: security.md's drift (stated "Auth mechanism: None" against a live auth+payments system) is a high-severity gap that shouldn't wait for the next scheduled audit to surface.

**Decision:**
Pending owner sign-off. Audit recommends Option 2, with immediate one-time refreshes of dev.md and security.md (highest-consequence drift) as the first action regardless of which option is chosen for the standing process.

**Rationale:**
TEAM.md's session-start protocol already requires reading DECISIONS.md/ISSUES.md/GOALS.md, which is why those three logs stay accurate through 72+ decisions and hundreds of dated entries. Persona files were never brought under an equivalent discipline, so they drift silently — in security.md's case, to the point of describing a threat model that omits the entire auth/payments system. The fix costs one line in an already-existing protocol document.

**Implications:**
- Cipher: security.md refresh should be treated as the first priority — the current file would not surface Stripe/D1/session risk to a cold-started session.
- Axiom: dev.md refresh + the CI-gate item (wrap the existing /deploy-check 13 checks in a required GitHub Action) + the mlb.js decomposition (proven pattern, unactioned since 2026-07-01) are the three concrete engineering items this audit surfaces; none require new design work.
- Kael: DESIGN.md's `--color-live` entry and design.md's `--accent` value both need one-line corrections; the `--accent`-on-`--accent-subtle` contrast WARN needs an owned decision, not another re-flag.
- Folio: owns the standing process fix to TEAM.md if Option 2 is chosen; also owns pruning ISSUES.md's stale P2-005 summary-table row per the file's own house rule.
- Finn: confirmed the three-gate rule is currently being honored correctly — the one major queued initiative (AI League Insights — Paid Tier v1) has all three gates present and is blocked only on an owner pricing decision, not a spec gap.
```
