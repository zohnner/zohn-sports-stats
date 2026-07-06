> **ARCHIVED 2026-07-06** — point-in-time review, preserved for history. Its recommendations were actioned via DECISIONS.md (D-038/D-039/D-040) and DESIGN.md. Reflects the project on its original date; do not treat as current.

---

# Design & UX Review — Kael + Vera — 2026-07-02

**Method:** live audit of https://sportstrata.cc (Chrome, desktop ~1100–1280px) across home, Leaders, player detail, Draft HQ (Value Board + Mock Draft), in dark default, light, and cc-braves themes — plus a source-level token-discipline scan of every JS render string. Screenshots taken this session; every finding below was observed, not inferred.
**Mandate (owner):** polished and cohesive across sports and surfaces, not vibe-coded; theme viability verdict; a way forward for UX and design.

---

## The one-sentence diagnosis

The product's *designed* surfaces are genuinely good — the player detail page, the Leaders panels, and the Draft Kit read as broadcast-grade — but the connective tissue between them (navigation state, view labels, empty states, theme extremes, and ~550 ad-hoc inline styles) was never designed at all, and that connective tissue is where the "vibe-coded" feeling lives.

---

## Part 1 — Vera: broken flows (these outrank all polish)

### V1 — CRITICAL: Leaders → player click fails with "Player not found"
Clicking the **#1 OPS hitter** on the leaderboard produced the player-not-found error. Verified root cause live: `currentView` became `mlb-player-665742` with `AppState.mlbPlayers.hitting = 0 players` — the click path resolves against the Players-view pool, which never loads when Leaders is your entry view. The cold deep-link path (`#mlb-player-660271` in a fresh tab) **works perfectly** — it fetches the player directly. So the fix is precise: the in-session click path must fall back to the deep-link resolution when the pool misses. This is the announcer's primary flow ("who leads in X?" → tap the leader) breaking on first contact. The error state copy itself is well-crafted — which proves someone met this bug before and styled it instead of fixing it.

### V2 — CRITICAL: no `hashchange` handling → URL/state desync and chimera states
Observed live, twice: (a) view navigated to player detail while the hash stayed `#mlb-leaders` — copying the URL from a player page shares the wrong view; (b) setting `#nfl-draftkit` from a running MLB session produced a **chimera**: NFL ticker + MLB home content + a broken ~340px center column. Cold loads route correctly through `_loadFromHash`; nothing handles hash changes on a live page. Fix: a `hashchange` listener that routes through the same logic `_loadFromHash` uses (sport-aware), and ensure every `navigateTo` path writes the hash it renders.

### V3 — "Storage Disabled" toast is a false positive
The toast ("Cache unavailable — stats will reload each visit") fired on load while `localStorage` tested writable in the same session. Likely an IndexedDB/db.js failure conflated with cache storage, or a check racing initialization. A scary system warning that's wrong is pure trust erosion. Investigate the trigger; whatever remains true should say only what's actually degraded.

### V4 — Leaders "By Position": SP/RP/CL panels show bare "No data" mid-season
All three pitching boxes empty on July 2 with 600 pitching splits loaded — almost certainly a qualification/field bug in the position strip, not real absence. And the empty state violates our own standard (explicit context, never a bare "No data"). Two fixes: the data bug, and the copy pattern.

### V5 — Duplicate search affordance on home
Header search and hero search sit ~100px apart, visually identical intent. Two search boxes is one decision nobody made. Recommendation: hero search is the home page's primary affordance — suppress the header search box on `home` only (it exists on every other view where there's no hero).

---

## Part 2 — Kael: cohesion and posture

### K1 — Raw route ids rendered as page titles
The NFL fantasy views print `nfl-draftkit` and `nfl-mock` as their visible view header — the literal route string, on the surface we just polished. The view-meta/breadcrumb map is missing entries for the fantasy routes. Small fix, large signal: nothing says "vibe-coded" louder than a route id as a page title.

### K2 — Semantic collision: amber means "live" and also means "Pittsburgh"
Game cards use team-color left borders; live games use `--color-live` (amber) borders. The Pirates' team amber is indistinguishable from the live amber — color-as-meaning collapses exactly where it matters (is this game live?). Position: **borders belong to teams; liveness belongs to the badge alone** — strengthen the LIVE badge (pulse dot already exists) and never encode state in the border channel again. One rule, applied everywhere: *the border channel is identity, the badge channel is state.*

### K3 — The inline-style debt is the cohesion debt (quantified)
Source scan of every JS render string: **~550 static inline styles** (mlb.js 193, nfl.js 112, teams.js 58, playerDetail.js 48, nhl.js 31, app.js 30, …) plus **28 literal hex colors inside style attributes**. Dynamic team-color injection is legitimate (per the 2026-06-04 rule); these are not that — they're spacing, typography, and layout decided per-string. This is why NFL rows feel *almost* like MLB rows but not quite: MLB cards are classed components, NFL rankings rows are hand-typed one-offs. The May design-system overhaul fixed the CSS files; the JS-rendered HTML never got the pass, and June's NFL sprint added ~150 more. **Plan: migrate per-view to component classes, NFL surfaces first (worst offenders, newest code), and fold the work into the CSP nonce migration** — both require touching the same render strings; touch them once.

### K4 — What's already right (protect it)
Player detail (radar profile, chip row, ranked stat tiles, Card/Share/Blurb actions) is the strongest surface in the product and the posture benchmark. Leaders panels (stat-color coding, freshness stamp, CSV/share per row) are coherent. The Draft HQ strip + est-tagging shipped clean. Light mode is solid — not an afterthought. The D-026 dropdowns behave correctly. These prove the system works when it's used.

---

## Part 3 — Theme viability (Kael verdict, with evidence)

**Observed:** cc-braves renders the entire content area washed-out and dim — dramatically worse than default dark (side-by-side screenshots this session). Yet `tools/check-themes.cjs` passes it, because the 5-pair contract tests token pairs, not the *composed* result (translucent cards over dark navy, muted text on those cards, atmosphere effects). Light and dark defaults are both genuinely good.

**Verdict: the theme system stays — as a bounded brand asset, not an open-ended feature.**
1. **Freeze at the current 13 + default** (re-affirms D-034). No theme #14 until the debt below clears.
2. **Tighten the contract until the tool sees what the eye sees:** add composed-surface pairs (`--text-secondary` on `--bg-card`-over-`--bg-base`, `--text-muted` on `--bg-surface`, card borders vs surfaces), then calibrate thresholds until cc-braves' real dimness registers as errors. The checker exists; it needs to be made honest.
3. **Manual Kael pass per theme** against a fixed checklist (game card, starters row, leaders panel, detail chips) — themes that fail get their surface/text tokens corrected, not deleted. Estimate: the CC themes cluster around the same translucent-card pattern, so one fix likely propagates.
4. **Identity rule for team themes:** the brand icon swapping to a team mark is acceptable "jersey" behavior *only because* the SportStrata wordmark stays. Codify: the wordmark never changes; the icon may. (Observed working — make it a written rule so it survives.)
5. Theme switching via the settings panel is the only supported path (programmatic `data-theme` changes leave logo residue — internal note for tests).

---

## Part 4 — D-036 follow-ups spotted live (Relay assist)

- **Retired players get implied values:** Todd Gurley (FA, retired) sits at #31 with `est ~245`. Guard: no implied pricing for team-less veterans (`team === 'FA' && years_exp > 0`).
- **Traps gap numbers are absurd** (`-927`): value-rank spans the full 600 pool while ADP spans ~180, so gaps read as noise. Compute the gap within the ADP-comparable pool, or present as "market #99 · model #501" instead of a signed delta.
- **Draft Kit table clips right columns** below ~1150px viewport with no horizontal scroll — add `overflow-x: auto` to `.dk-board`'s wrapper (same pattern as `.table-wrapper`).

---

## Part 5 — Execution plan (proposed order, lightweight process)

| # | Item | Type | Effort | Owner |
|---|---|---|---|---|
| 1 | V1 leaders-click fallback to deep-link resolution (+ hash written on detail nav) | Bug | S | Axiom/Finn, Vera verifies |
| 2 | V2 `hashchange` router | Bug | S/M | Axiom |
| 3 | K1 view-meta labels for all NFL fantasy routes | Bug | S | Finn |
| 4 | V4 SP/RP/CL position-strip bug + empty-state copy | Bug | S | Finn (trace), Axiom |
| 5 | V3 storage-toast false positive | Bug | S | Finn (trace) |
| 6 | D-036 guards: retired-FA exclusion, trap-gap fix, dk-board overflow | Bug | S | Axiom, Relay |
| 7 | K2 border=identity / badge=state rule applied to game cards | Design fix | S | Kael spec, Finn |
| 8 | V5 home search de-duplication | Design fix | S | Vera+Kael spec, Finn |
| 9 | Theme contract tightening (check-themes pairs+thresholds) + CC theme token corrections | System | M | Kael + Axiom |
| 10 | Inline-style → component-class migration, NFL surfaces first, folded into CSP nonce work | System | L (phased) | Kael classes, Axiom migration |
| 11 | Mobile audit (window resize was blocked this session — needs devtools or hand check) | Audit | S | Vera + owner |

Items 1–6 are a single "flow integrity" wave — all small, all trust-critical, shippable together. Items 7–8 are one visual wave. Items 9–10 are the systemic track that runs behind feature work.

---

*Kael: "The strip, the detail page, and the leader panels prove this product knows what it wants to look like. The job now is making the seams meet the standard the surfaces already set."*
*Vera: "Every finding in Part 1 is a user mid-task hitting a wall we built. Fix the walls before we repaint anything."*
