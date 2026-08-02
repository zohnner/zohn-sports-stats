# Issues

Active issues in priority order. When fixed, delete the row — the fix lives in the code and the git message.

---

## P1 — Critical

| ID | File | Description |
|---|---|---|
| — | — | No active P1 items. P1-006 closed in source (see reconciliation below); two owner-confirmation steps remain in the deploy checklist. |

### P1-006 — Status Reconciliation
**Contributor:** Folio (reconciliation), Cipher (verification) | **Date:** 2026-06-09

GOALS.md marked this gate ✅ on 2026-06-01 (key rotated, Worker deployed, `BDL_PROXY_URL` wired) while this file still carried it as an active incident. Cipher re-verified source state 2026-06-09: `BDL_API_KEY = ''` in `api.js`, `BDL_PROXY_URL` wired to the deployed Worker, Worker CORS allowlist present in source, no key material in any tracked file. The old key remains in public git history (3 commits) — harmless **if** rotation actually occurred. Two items move to the owner checklist: (1) confirm at balldontlie.io that the `857bec7d…` key is invalidated; (2) optional history scrub for hygiene. ISSUES and GOALS now agree: P1-006 is closed in source.

### P1-006 — Original Incident Detail (historical)
**Contributor:** Cipher (finding), Axiom (fix plan) | **Date:** 2026-05-31

**Confirmed:** Commit `4082a90` contains the live BDL key. The repo is public on GitHub (`github.com/zohnner/zohn-sports-stats`). Local and remote are fully synced. The key is readable by anyone right now. This is not a future risk — it is an active credential exposure.

**Partially resolved:** `BDL_API_KEY` has been removed from current source (`api.js:11` is now `''`). The guard bug that would have caused all BDL calls to throw even after proxy deployment has been fixed — guard at `api.js:102` now checks `!BDL_PROXY_URL` before throwing.

**Remaining steps — authorization required from project owner:**

1. **Rotate the BDL key at `balldontlie.io` dashboard.** Invalidate `857bec7d...`. This kills the risk regardless of git history state. Do this first — nothing else matters until the old key is dead.

2. **Git history scrub — owner must authorize.** Run `git filter-repo --literal-string "{old-key}" --replace-text /dev/null` then `git push origin main --force`. This rewrites commit SHAs from `4082a90` forward — destructive and irreversible. Axiom executes once owner confirms. Follow with a GitHub support request for cache purge.

3. **Deploy Worker proxy — Axiom executes after Step 1.** `cd worker && wrangler secret put BDL_API_KEY && wrangler deploy`. Paste the deployed Worker URL into `BDL_PROXY_URL` in `api.js`. Commit and push. Cipher reviews before push.

**Post-deployment hardening — COMPLETE (2026-06-04):** Both Workers (`worker/bdl-proxy.js` and `worker/broadcast-blurb.js`) updated from `ALLOWED_ORIGIN = '*'` to an origin allowlist (`sportsstrata.com` + localhost dev ports). Requires `wrangler deploy` on the BDL proxy to take effect in production; broadcast-blurb deployment still pending project owner authorization (D-006). See Engineering Issues — Worker CORS Hardening below.

**NBA features are currently non-functional** (all BDL calls throw — by design given key removal). This resolves when `BDL_PROXY_URL` is wired up in Step 3.

---

## P2 — Bugs

| ID | File | Description |
|---|---|---|
| P2-005 | [`worker/wrangler-blurb.toml`](worker/wrangler-blurb.toml) | Broadcast Blurb worker not deployed — `sportsstrata-blurb.zohnwheeler.workers.dev` returns errors. Fix: `cd worker && wrangler secret put ANTHROPIC_API_KEY --config wrangler-blurb.toml && wrangler deploy --config wrangler-blurb.toml`. |

---

## P3 — Feature Backlog

High-value MLB features consistent with the broadcast/fantasy/data-fan audience. In rough priority order.

### Recently shipped

| ID | Area | What shipped |
|---|---|---|
| P3-001 | Player Detail | Standalone `mlb-compare` view. Two-player dropdowns, side-by-side stat bars, radar overlay, shareable URL. |
| P3-003 | Player Detail | Career H2H matchup card. Statcast play-by-play CSV, last 5 seasons, PA/AB/H/HR/K/BB/AVG/OBP. |
| P3-004 | Player Detail | Savant visual card — spray chart (hitters) and pitch zone (pitchers) iframe tabs. |
| P3-006 | Arcade | Daily Quest. 10 rotating stat-challenge templates, seeded by date, streak counter. |
| P3-007 | Game Prep | Handedness Splits section — AVG/OBP/SLG/OPS/K vs. opposing starter's hand. |
| P3-008 | Game Prep | Weather card in prep sheet header — temp + wind for outdoor parks, "Dome" for covered. |
| P3-009 | Player Detail | Pitch arsenal card on pitcher pages — type badge, usage % bar, velo, spin, BAA. |
| P3-010 | Player Detail | Player bio strip — age, bat/throw, height/weight, hometown, debut year. |
| P3-011 | Team Detail | Team aggregate stats card (AVG/OBP/SLG/OPS/ERA/FIP/WHIP/K9…) + upcoming 7-day schedule with probable pitchers. |
| P3-012 | Team Detail | IL status on team roster — red badges, "N Active · M IL" title, reduced-opacity IL rows. |
| P3-013 | Search | Headshots and team logos in ⌘K search results, with team-color gradient background and initials fallback. |
| P3-014 | Standings | "📰 Moves" tab on standings page — last 7 days of MLB transactions (trades, IL, call-ups, DFAs, releases) grouped by date with headshots and team badges. |
| P3-015 | Player Detail | League rank badges on player stats — `#N MLB` shown on stats where the player ranks ≤ 30 in the league; green for top 5, accent for top 15. `_mlbPlayerLeagueRanks()` uses cached `mlbLeaderSplits`. |
| P3-016 | Leaders | Active hitting streak leaderboard panel on leaders page. Fetches `stats=streak` type; players on ≥ 5-game streaks shown ranked, orange ≥ 10, red ≥ 15. Graceful fallback if endpoint unavailable. |
| P3-017 | Player Detail | Monthly splits toggle. Month tabs (Apr–Oct) appended after L7/L14/L30 on both hitting and pitching splits cards. Green tint distinguishes month tabs from amber (recent) and default (situational). |
| P3-018 | Game Detail | Pitcher vs. team historical line — ERA/IP/WHIP/BAA shown for starting pitchers vs. opponent in game box score. Upgraded from BAA/K/BB only. Shipped 2026-06-03. |
| P3-020 | Home | "Tonight's Starters" section on home page. Shows each scheduled game's probable SPs side-by-side with ERA/WHIP/K9/W-L. Headshot + team color, clickable → pitcher detail. Renders when both games and `mlbLeaderSplits` are available (two trigger points). Hidden when no SPs announced or no games today. |

### Upcoming

| ID | Area | Description |
|---|---|---|
| P3-019 | Leaders | **Position-adjusted leaderboard view.** ✅ Already live — `_appendMLBByPositionGrid` confirmed called at `mlb.js:4338`. Top hitters/pitchers per position by OPS/ERA. |
| P3-021 | Home | **"Tonight's starters" deeper stats.** ✅ Fully shipped 2026-06-03. Home/away ERA split live via `homeAndAway` hydrate, skeleton placeholder, graceful removal if no data. VS-opponent career BAA/K/BB row also live. |
| P3-022 | Scorecard | **Baseball scorecard — phase-gated implementation.** ✅ Phases 1–3 shipped 2026-06-08. Phase 4 (export/share) unblocked — Axiom html2canvas spike is the remaining gate. |
| P3-025 | Scores | **Live Game Expanded View — phase-gated implementation.** In-place accordion on live game cards: game header, linescore, play-by-play, box score (Phase 1); pitch zone, base diagram, matchup stats (Phase 2). See `DECISIONS.md D-009` and full roadmap below. |
| P3-026 | Scorecard | **Scorecard download / export.** ✅ Shipped 2026-06-08. "Download ↓" button on completed scorecards, html2canvas 1.4.1 dynamic load from cdnjs, 2× PNG capture. jsPDF PDF export remains a future enhancement (Phase 5 scope). |
| P3-023 | Leaders | **Statcast leaderboard expansion — Hard Hit% and Sweet Spot%.** ✅ Shipped 2026-06-03. `fetchStatcastBulkLeaderboard` URL expanded, `STATCAST_LEADER_CATS` has HH% (#fb923c) and SS% (#38bdf8). |
| P3-024 | Leaders | **Pitcher Statcast leaderboard.** Relay finding (2026-06-03): Savant exposes `/leaderboard/custom?type=pitcher` with `p_k_percent`, `p_bb_percent`, `p_whiff_percent`, `p_csw_rate`, `exit_velocity_avg`. ✅ Shipped 2026-06-03 — see `fetchStatcastPitcherLeaderboard()` and `STATCAST_PITCHER_CATS` in `mlb.js`. |

---

## P3-029 — NFL Offseason & Empty-State Unification — Three Gates
**Contributors:** Vera (behavioral, lead), Kael (visual), Axiom (feasibility) | **Date:** 2026-06-21

**Trigger (UX, owner request):** During the ~7-month NFL offseason (now), the nine NFL surfaces answer the same user question — "is there anything worth my time here right now?" — three different ways. Standings renders a designed offseason hero (`.nfl-offseason`) with CTAs. Scores falls through to a flat one-line `ErrorHandler.renderEmptyState` ("No NFL games this week…"). Teams renders 32 record-less cards with no explanation of why every record is blank. Meanwhile Players, Rankings, Leaders (2025 finals), Trending, Mock Draft, and Compare all work year-round and never say so. A first-timer who lands on Scores or Standings can reasonably conclude the whole beta is dead and bounce — before discovering the five surfaces that deliver. This is a trust + discoverability failure, squarely Vera's domain: empty states are the real design, and consistency is a feature.

**Behavioral spec (Vera):**
- **Job-to-be-done (offseason):** "I came for NFL — is anything live, and where do I go that works today?" Every surface must answer in <10s, not just Standings.
- **One shared empty/offseason component** replaces the three divergent treatments. It always answers three things: what the surface shows in-season, why it's empty now, and where to go that has data today (real CTAs to Players / Rankings / Mock Draft / 2025 Leaders).
- **States, specified for every NFL surface:** loading = existing skeleton shimmer (keep); live-season default = existing renders (no change); offseason (legitimately empty, pre-kickoff) = shared offseason component, copy parameterized per surface; empty-but-should-have-data (Leaders returns no categories, Sleeper pool empty) = a distinct "unavailable right now" message that must NOT wear the offseason skin (a fetch failure is not the offseason; dressing a fault as a schedule hides a real bug); error = existing `ErrorHandler.handle` with retry (keep).
- **Per-surface offseason copy:** Scores — "No NFL games until Week 1 kicks off in September…" (see Axiom's schedule-vs-empty check); Standings — keep current hero copy, routed through the shared component; Teams — do NOT hide the grid (rosters/logos have offseason value); add one muted line above it: "Records show 0–0 until the {NFL_FANTASY_SEASON} season starts."
- **Cross-surface offseason strip:** slim, non-blocking, top of NFL content while the season model reports offseason; "NFL is between seasons — live scores & standings return in September. Open year-round: Players · Rankings · Mock Draft · 2025 Leaders." Dismiss is **session-scoped** (`sessionStorage` `ss_nfl_offseason_dismissed`), not permanent — the offseason is the dominant state for 7 months, so re-surfacing once per session is correct.
- **Interactive states:** CTAs reuse `.nfl-offseason-btn` with visible `:hover`, `:focus-visible` (2px accent outline — gap to close), keyboard reachability. Strip dismiss: `aria-label="Dismiss offseason notice"`, focusable, non-modal. Strip is `role="status"` / `aria-live="polite"`. Glyph `aria-hidden`, title a real `<h2>`, color never the sole signal. No dead-end empty state on any surface.

**Visual spec (Kael):** Promote the existing `.nfl-offseason` block (`main.css`) to the canonical shared component — no second look. Tokens only (`--text-subtle` glyph, `--text-primary`/`--font-display` title, `--text-secondary` body, `.nfl-offseason-btn` accent + ghost). The cross-surface strip reuses the first-visit value-strip visual language (`--accent-subtle` bg, 1px accent border, ~40px) so it reads as the same family. Teams line: `--text-muted` 0.74rem inline caption. Add the missing `:focus-visible` ring to `.nfl-offseason-btn`. **Confidence flag:** not screenshotted against the live deploy — most NFL work is "pending push," so live trails source; sign-off is against current source + token system. Run `/screenshot` post-implementation before final visual sign-off.

**Feasibility (Axiom):** Confirmed — no architecture changes. Season-model values already exist in `nfl.js`. Add one `_nflOffseasonState({surface})` helper called from `displayNFLGames`, `displayNFLStandings` (replacing the inline hero), and the Teams annotation — *removes* duplicated markup. Strip renders on NFL view entry / `_applySportUI('nfl')`, guarded by `sessionStorage` + the offseason flag, reusing the `ss_welcomed` first-visit wiring. No new CSP domains, no new fetches, no new files; `sw.js` STATIC_ASSETS unaffected. Verify: `node --check` + `/screenshot` + keyboard pass.
- **Open check before Finn wires (flagged, <90% confident):** Scores in offseason may already render the 2026 Week-1 schedule (D-013) rather than empty. Show the schedule when present; fall to the offseason component only when genuinely empty. Confirm which path fires before implementing.

**All three gates present. Implementation approved** — Finn may implement after confirming the Scores schedule-vs-empty path above. No silent fixes; gaps return here as named entries.

**Finn — implementation | Date: 2026-06-21**

*Open check resolved first:* hit ESPN `/scoreboard` live — in the offseason it returns the **2026 Week 1 regular-season schedule** (NE @ SEA, TB @ CIN, NO @ DET… season type 2, week 1, dated Sep 9–13). So Scores is populated, not empty. I did **not** replace the Scores schedule with an offseason card — the offseason component is only its empty *fallback*. Axiom's flag was correct to catch this.

*What shipped:*
- `js/nfl.js` — new `_nflIsOffseason()` (Mar–Aug) + `_nflOffseasonState(surface)` helper (promotes the old inline Standings hero to one reusable component, per-surface copy/CTAs). Standings empty → `_nflOffseasonState('standings')` (visually identical, now shared). Scores empty fallback → offseason card in offseason, plain empty-state otherwise (schedule path untouched). Teams → muted `.nfl-teams-note` caption above the grid in offseason when all records are blank.
- `js/navigation.js` — `_syncNFLOffseasonStrip(view)` renders the session-dismissible cross-surface strip above `#playersGrid` on the 7 NFL list views during offseason; removed on non-NFL sport switch in `_applySportUI`. `sessionStorage` key `ss_nfl_offseason_dismissed`.
- `css/main.css` — `.nfl-offseason-btn:focus-visible` ring (Kael's gap), `.nfl-teams-note`, `.nfl-offseason-strip` (reuses `--accent-subtle`/`--accent-border`). All tokens confirmed present in `variables.css`.

*Verification:* new code passes `node --check` + logic exercised (offseason=true for June, all surface states + generic fallback render, strip set = 7 views); every edited region balanced; `.games-grid` confirmed `display:grid` so the note spans. **Not done — live browser render:** the live deploy trails source (NFL work pending push), so `/screenshot` end-to-end wasn't run. Recommend an owner/Axiom `/syntax-check` + `/screenshot` pass on the real working tree before push.

*Escalation:* none blocking. One judgment call for Kael/Vera: the strip shows on all 7 list views including the year-round ones (Players/Rankings/Trending) where it's slightly redundant. Kept per Vera's "any surface" spec; flagging in case you'd rather scope it to the emptier surfaces (Scores/Standings/Teams). — Finn

---

## P3-030 — NFL Team Landing Page Redesign — Three Gates
**Contributors:** Kael (visual, lead), Vera (behavioral), Axiom (feasibility) | **Date:** 2026-06-21

**Trigger (owner):** make the team landing pages clean and on-brand, inspired by the MLB team page without copying it. The NFL team page was functional but plain — back button, small logo + name·record·count line, roster grid; no team-color branding, no hero, no fantasy angle, no in-season scaffolding.

**Visual spec (Kael):** a sport-agnostic `.team-*` component family (components.css), tokens only; the team's own color drives accents via a `--team` custom property + `color-mix` (no hardcoded hex). Deliberately distinct from MLB's radial-hero + 7-cell bio grid: a **team-identity banner** (team-color top stripe + tinted gradient wash, large logo, display-font name, abbr + division chips, season label), a compact **facts grid** (players / offense / defense / special teams / division — offseason-safe), a **Top Fantasy Assets** band (position-colored cards by ADP — an NFL-native section MLB has no equivalent of), a brand-styled **roster by unit** (depth-chart order, projected-starter ★, injury flag), and a **Schedule** section (next-game card, else a clean in-season empty-state). The SportStrata accent threads the section titles/chips.

**Behavioral spec (Vera):** job-to-be-done — "who are they, who are their key players, how's their season." States: loading skeleton (existing), default, roster-empty message (not blank), error (existing `ErrorHandler.handle` retry). Asset + roster items are keyboard-focusable `<button>`s → player detail; `:focus-visible` rings; hover states; image fallbacks via `data-hide-on-error`. Offseason: season label "Enters the {season} season"; facts/assets/roster populate from Sleeper year-round; record/results render an empty-state. Color is never the sole signal.

**Feasibility (Axiom):** no architecture change. Generic `_renderTeamPage(model)` + `_renderNFLTeamDetail` builds a normalized model from existing data (nflTeams, Sleeper pool, nflGames) + a static `_NFL_DIVISIONS` map (32 teams, stable; conference/division isn't in the ESPN payload and standings are offseason-empty). `color-mix` already in use; no new fetches/CSP/files. **Reusable:** `_renderTeamPage` + `.team-*` are sport-agnostic — NHL/NBA adopt by feeding the same model shape (`{name,logo,teamColor,division,record,facts,assets,groups,scheduleHtml,playerPrefix,backView}`).

**All three gates present. Implementation shipped 2026-06-21 (Finn).** Verified: `node --check` clean; live computed-style + screenshot check (Cowboys). Reusable contract documented for NHL/NBA.

---

## P3-031 — Teams Index by Conference & Division — Three Gates
**Contributors:** Kael (visual, lead), Vera (behavioral), Axiom (feasibility) | **Date:** 2026-06-21

**Trigger (owner):** the teams page was filler — a flat 32-card grid. Needed a comprehensive, scannable index so users can find a team by conference/division.

**Visual spec (Kael):** AFC and NFC sections (display-font accent titles), each a responsive grid of the 4 divisions; each division a labeled vertical list of `.team-pick` rows (logo, short name, abbr·record) with a team-color left accent. On-brand, tokens only.
**Behavioral spec (Vera):** keyboard-focusable `<button>` rows → team page; hover + `:focus-visible`; offseason 0–0 note retained; teams with no mapped division fall into an "Other" group (no data lost); image fallbacks via `data-hide-on-error`.
**Feasibility (Axiom):** reuses the `_NFL_DIVISIONS` map from P3-030; pure `displayNFLTeams` rewrite + `.teams-*` CSS. No new fetch/CSP/files.

**All three gates present. Shipped 2026-06-21 (Finn).** Verified node --check + live.

---

## NFL Improvement Backlog — Cross-Domain Audit (2026-06-21)
**Contributors:** Vera (UX), Kael (visual), Axiom (architecture/data) | Evidence gathered against current source (post-P3-029).

Candidates in priority order. **Shipped 2026-06-21:** N-1, N-2, N-3 (three gates → Finn, report below); N-4, N-6 (code), N-7 (docs), N-8 (decision → D-023). **N-5 is gated; implementation deferred to a session where browser verification is possible.**

### N-1 — Player detail shows nothing (and swallows the error) when the ESPN name-match fails — **[Vera + Relay/Axiom]** · priority 1 · ✅ SHIPPED 2026-06-21
**Finding:** NFL player stats/career/game-log/advanced all bridge Sleeper→ESPN by **name match**. When the match fails — free agents, name mismatches, retired players — the loaders bailed silently (`if (!res.ok) return;` / `if (!data.found …) return;` / `catch (_) {}` in `js/nfl.js`). The user landed on a real player, saw the profile, and **no stats, no reason why.** The bare `catch (_) {}` also violated "never suppress; Logger everywhere."
**Shipped:** `_nflStatsUnavailable(host, name)` placeholder renders in `#nfl-stat-line` on every no-match/empty/error path of `_loadNFLPlayerStats` (incl. the no-team free-agent case); the four detail loaders' bare catches now `Logger.warn(..., 'NFL')`.

### N-2 — NFL teams weren't searchable in ⌘K (players were) — **[Vera + Relay]** · priority 1 · ✅ SHIPPED 2026-06-21
**Finding:** ⌘K surfaced NFL players but had no NFL Teams group (NBA & MLB both did). Typing "Cowboys" returned nothing despite NFL team detail pages existing.
**Shipped:** NFL Teams group added to the `teamHits` builder in `search.js` (filters `AppState.nflTeams`, routes to `nfl-team-{abbr}` after ensuring NFL context); `AppState.nflTeams` is now warmed on overlay open like the player pool.
**Doc note:** CLAUDE.md/DECISIONS still list "⌘K NFL search" as deferred — it shipped for players earlier; teams now close it. Logged as N-7 for Folio.

### N-3 — NFL hardcoded a color vocabulary that bypassed the token system — **[Kael]** · priority 2 · ✅ SHIPPED 2026-06-21
**Finding:** `_NFL_POS_COLOR`, `_NFL_STAT_COLORS`, `_NFL_STAT_GROUP_COLOR` were literal hex in `js/nfl.js`, against "always use vars." The inline alpha-concat (`${posColor}cc`) also produced invalid CSS for the `var(--accent)` fallback case (latent bug).
**Shipped:** 19 NFL color tokens added to `css/variables.css` (`--nfl-pos-*`, `--nfl-stat-*`, `--nfl-cat-1..9`); the three JS maps now reference `var(--…)`; alpha shades go through a new `_nflAlpha(c, pct)` helper using `color-mix(in srgb, … transparent)` instead of hex concat (also fixes the fallback bug). `color-mix` is supported across current evergreen browsers (Axiom feasibility).

### N-4 — Players position filter resets every visit — **[Vera]** · priority 3 · ✅ SHIPPED 2026-06-21
`_nflPosFilter` (`js/nfl.js`) now initializes from `sessionStorage` (`ss_nfl_pos_filter`) and saves on chip click — a returning user keeps their position view.

### N-5 — Inline-style sprawl across NFL views — **[Kael + Axiom]** · priority 3 (phased) · GATED — implementation deferred to a verification-capable session
**Finding:** ~178 `style="…"` literals + 23 `style.cssText` in `js/nfl.js`. Standings cards, trending/leader rows, the career & game-log tables, and the player-detail hero are assembled with inline CSS rather than component classes — fights the design system (Kael) and bloats the monolith (Axiom). MLB reuses `.player-card`, `.leaderboard-*`, `.stats-table`.

**Why not shipped this round:** moving inline styles to classes is the one change that can silently regress layout via the cascade (CLAUDE.md cascade-safety rule) and must be verified in a browser. This session can't screenshot the working tree (mount + deploy-trails-source), so per "don't ship a flow you haven't walked through," implementation — not the spec — is deferred.

**Behavioral spec (Vera):** pure visual/structural refactor — zero interaction or DOM-contract change. Click handlers, `data-view`, `.nav-tab`, route strings, `_escHtml` escaping unchanged. Each extracted block renders byte-identical output (same element tree, same computed styles).

**Visual spec (Kael):** new classes in `css/components.css` (NFL section), tokens only. Phase by repetition × safety:
  1. Player-detail hero avatar gradient (3 near-identical blocks: player card, Sleeper detail, ESPN detail) → `.nfl-hero-avatar` taking color via an inline `--pc` custom property; class reproduces the exact `color-mix` gradient + size.
  2. Leader/trending list row → `.nfl-stat-row` (displayNFLStatLeaders + displayNFLTrending).
  3. Standings division card + row → `.nfl-standings-card` / `-row`.
  4. Career / game-log table chrome (largely already `.stats-table`; strip redundant inline).
  Each phase = its own commit + `/screenshot` diff before the next.

**Feasibility (Axiom):** mechanical; main risk is cascade order — new NFL classes must be defined where they win over any base class they sit on (e.g. `.player-detail-avatar`). Grep each selector before adding. No JS-logic change; `color-mix` already in use post-N-3.

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. **Phase 1 SHIPPED 2026-06-21** — the player-detail hero avatars (×2) and the player-card avatar deduped into `.nfl-hero-avatar` / `.nfl-pos-grad` in `components.css` (placed after main.css so they win the `.player-detail-avatar` background cascade); inline gradient blocks removed from `nfl.js`, color passed via a `--pc` custom property. **Phase 2 SHIPPED 2026-06-21** — trending + stat-leader list rows and panel headers deduped into `.nfl-lrow` / `.nfl-lrow-*` / `.nfl-card-head` (components.css); the per-row conditional border is now `.nfl-lrow:last-child`.

**Phase 3 SHIPPED 2026-08-02, then found to be DEAD CODE — corrected 2026-08-02 (Finn, live-verify pass):** `displayNFLStandings` in `nfl.js` was refactored into `.nfl-standings-*` classes as written above, but live-verification in a real browser against `sportstrata.cc/#nfl-standings` found the change has **zero live effect**. `js/nflStandings.js` (D-029, loaded *after* `nfl.js` in the script chain) opens with an explicit header comment: "these functions intentionally REDEFINE loadNFLStandings / displayNFLStandings / fetchNFLStandings from nfl.js... This file is loaded after nfl.js, so its declarations win in global scope." Confirmed in the live console: `window.displayNFLStandings.toString()` on the production standings page is nflStandings.js's version (`nstd-*` classes), not nfl.js's. nflStandings.js's own standings implementation was already fully class-based (`.nstd-row`, `.nstd-div-card`, `.nstd-table`, etc.) before this session touched anything — it was written after N-5 was originally logged and nobody re-checked whether the finding still applied to the live code path. **Net result: no bug existed to fix, no regression risk, but the "Phase 3 shipped" claim above was wrong** — the actual, live standings page has been clean of inline styles since D-029 shipped, unrelated to this session's work.

**Dead code removed 2026-08-02 (Finn):** deleted `fetchNFLStandings`/`loadNFLStandings`/`displayNFLStandings` from `nfl.js` (the ESPN `/standings` call they made was itself a dead stub per D-029's own header comment, so this wasn't just unreachable JS, it was unreachable JS calling a broken endpoint) plus the two orphaned `window.loadNFLStandings`/`window.displayNFLStandings` assignments — left those in would have thrown a `ReferenceError` the moment that block ran, since the functions no longer exist by that point in the file, so this couldn't be a partial cleanup. Also removed the now-unreferenced `.nfl-standings-*` classes from `components.css` (confirmed via repo-wide grep: zero remaining references outside this ISSUES.md entry). **Verified:** `node --check` clean on `nfl.js`; CSS brace-balance 0; `tools/check-manifest.cjs` 0/0; `tools/check-themes.cjs --strict` 0 errors (2 pre-existing WARNs, unrelated, Kael's queue); full unit suite 33/33. **Not yet deployed** — bundled with N-5 Phase 4 below, same wrangler-auth blocker.

**Phase 4 SHIPPED locally 2026-08-02, NOT YET DEPLOYED — confirmed 2026-08-02 (Finn, live-verify pass):** `_loadNFLCareer` + `_loadNFLGameLog` are NOT shadowed anywhere else (`grep -rn "function _loadNFLCareer\|function _loadNFLGameLog" js/` → one hit each, both in `nfl.js`), so this fix is real and will take effect once deployed. Live-checked a real player (`sportstrata.cc/#nfl-player-4046`, Patrick Mahomes game log table): production DOM still shows `<th style="text-align:left;position:sticky;left:0;background:var(--bg-elevated)">` and no `nfl-tbl-` classes anywhere in the page — i.e., production is still serving the pre-refactor inline-style version. This is expected and consistent with the standing constraint that this sandbox has no `wrangler` auth to deploy (see the BDL CORS entry above, same blocker) — the local commit is correct, it just hasn't shipped yet. **Cannot be visually live-verified until deployed.**

**Status: Phase 1–2 shipped and live (confirmed working in earlier sessions). Phase 3's target was already fixed by unrelated code (D-029) before this session started — no further action needed, N-5 can be considered closed for standings. Phase 4 is code-complete and locally verified (see the totals-row regression catch above) but sitting undeployed — owner needs to run a deploy, then a `/screenshot` pass on a player's career/game-log tables is the confirming step, same as the BDL CORS fix waiting in the queue above.**

### N-6 — Offseason-strip scope — **[Vera + Kael]** · priority 3 · ✅ DECIDED + SHIPPED 2026-06-21
**Decision:** show the strip only on the offseason-affected stat surfaces — Scores, Standings, Teams. Dropped from Players/Rankings/Trending/Leaders, which deliver year-round and where the strip was redundant noise. `_NFL_STRIP_VIEWS` in `navigation.js` narrowed to `['nfl-games','nfl-standings','nfl-teams']`.

### N-7 — Docs stale: ⌘K NFL search listed as deferred but shipped — **[Folio]** · priority 4 · ✅ DONE 2026-06-21
DECISIONS.md deferred note struck through with a "shipped — players, then teams via N-2" annotation (history preserved). CLAUDE.md's `search.js` reference was already neutral/accurate — no change needed.

### N-8 — `nfl.js` monolith (1,400+ lines) — **[Axiom]** · priority 5 · ✅ DECIDED 2026-06-21 → DECISIONS D-023
Axiom's call: **don't split now** — no module system means a split adds load-order risk without encapsulation gain, and the real cost is N-5's inline sprawl, not file size. Revisit ~2.5k lines; clean seam = `nflFantasy.js`. See D-023.

### N-9 — `--bg-elevated` referenced but never defined — **[Kael + Folio]** · priority 2 (pre-existing; found during N-5 phase-2 verification)
**Finding:** `var(--bg-elevated)` is used 23× (7 in `js/nfl.js`, 13 in `css/*`, 3 in `js/nhl.js`) but the token is **not defined** in `variables.css` — confirmed live via `getComputedStyle(:root).getPropertyValue('--bg-elevated')` → `""`, and by grep (no `--bg-elevated:` anywhere). Every reference resolves to nothing, so those surfaces (NFL panel headers, the leader-season `<select>`, standings header, etc.) render transparent instead of the intended raised surface. **Pre-existing — not from N-5.** Surfaced while verifying Phase 2: `.nfl-card-head` background came back transparent, exactly matching the old inline `var(--bg-elevated)` → confirms no regression, but exposes the latent bug.
**Fix direction (Kael owns the value):** define `--bg-elevated` in both `:root` and `[data-theme="light"]` (likely ≈ `--bg-raised`). **Not a unilateral fix** — it would change the background of 20+ spots that have silently been transparent, so it needs Kael's value choice + a visual review across MLB and NFL before shipping.
**✅ SHIPPED 2026-06-21 (Kael decision):** defined `--bg-elevated: var(--bg-raised)` once in `:root`. Custom properties resolve lazily, so every `var(--bg-elevated)` now follows the active theme's own `--bg-raised` across all 14 themes with no per-theme edits. All 13 css usages + nfl/nhl are `background:` contexts wanting a raised surface, so this restores intended behavior (hover rows, prep rows, panel headers) rather than changing design.

### N-10 — `--border-subtle` referenced but never defined — **[Kael + Folio]** · priority 2 · ✅ SHIPPED 2026-06-21
**Finding:** parallel to N-9 — `var(--border-subtle)` is used 16× (11 `js`, 5 `css`) but never defined in `variables.css` (defined border tokens are default/mid/strong/accent). An undefined `var()` with no fallback voids the whole `border` shorthand, so every `border: 1px solid var(--border-subtle)` rendered with **no border** — invisible row separators in trending/leader/roster lists and avatar rings. Found while building P3-030 (also explains the 0px separators seen during N-5 phase-2 verification).
**Shipped (Kael decision):** `--border-subtle: var(--border-default)` defined once in `:root` (lazy-resolves per theme), restoring the intended light separators app-wide.

### N-11 — Headshot bleeds over the initials/abbr behind it — **[Kael + Vera]** · priority 2 · ✅ SHIPPED 2026-06-21
**Finding:** NFL avatars rendered initials as raw text under the `.player-headshot` img; the CSS comment promised "hidden by JS once headshot loads" but config.js only had an *error* handler — no *load* handler — so transparent headshot PNGs showed the initials/abbr bleeding through (sloppy).
**Shipped:** global capture-phase `load` listener in config.js hides the sibling `.avatar-text` when a `.player-headshot` loads; NFL avatar initials (card + both detail heroes) wrapped in `.avatar-text`.

### N-12 — Player stats shown regardless of position — **[Vera + Relay]** · priority 2 · ✅ SHIPPED 2026-06-21
**Finding:** season + career stat blocks were gated only by a volume threshold, not by position, so off-position lines could surface (e.g. a QB's kicking/scoring row).
**Shipped:** `_NFL_STAT_POS` map + `_nflStatByPos()` filter applied to season groups (`_loadNFLPlayerStats`) and career categories (`_loadNFLCareer`, now position-aware). A QB shows passing/rushing, a K shows kicking, defenders show defense — falls back to the full set if a filter would empty it.

### N-16 — Team roster grouped by unit, not position — **[Vera + Kael + Axiom]** · priority 3 · ✅ SHIPPED 2026-08-02
**Contributors:** Vera (spec), Kael (visual sign-off), Axiom (feasibility) | **Date:** 2026-08-02 | **Requested by:** owner, as part of a broader "NFL expansion" push (position view + injury report + waiver wire, sequenced one at a time)

**Vera's job-to-be-done:** a fan on a team page wants to answer "who's this team's WR2?" or "how deep is their O-line?" without scanning one long mixed list. Read `_renderNFLTeamDetail` in `nfl.js` before writing this: the roster is already grouped, but only into 3 broad units via `_NFL_ROSTER_GROUPS` — `Offense` (QB/RB/FB/WR/TE/OL/OT/G/C all mixed together), `Defense` (DL/DE/DT/NT/LB/DB/CB/S mixed), `Special Teams` (K/P/LS). Within each unit, players are already sorted correctly (`depth_chart_order`, then `search_rank`, then name) and already carry `starter`/`injury` badges — so the *sorting and data* are right, the *grouping granularity* is the gap. A fan still has to eyeball an 18-player Offense list to find "the receivers."

**Behavioral spec:** replace the 3-unit grouping with 9 individual-position groups, in broadcast-familiar order: QB, RB, WR, TE, OL, DL, LB, DB, K/P. Zero new interaction — this is the same static list render `_renderTeamPage`'s `groups` loop already does, just with more, narrower buckets. Existing behavior carries over unchanged: a group with 0 matching players renders nothing (`if (!grp.players.length) return ''`, already in `_renderTeamPage` — no new empty-state needed), the starter star and injury badge render exactly as they do today, and clicking a row still navigates to that player's detail page. No new loading/error state — this reads from `_nflPoolMap`, which is already fetched and cached before this function ever runs.

**Kael (visual, sign-off):** no new classes needed. `_renderTeamPage`'s group loop already emits `<h3 class="detail-section-title">{label} <span class="team-section__count">{count}</span></h3><div class="roster-list">...</div>` per group — going from 3 groups to 9 is the same markup repeated more times, same tokens (`--text-subtle`, `--border-subtle` on `.roster-row`), same `.roster-avatar`/`.roster-name`/`.roster-meta` row shape MLB's team page already shares via the same sport-agnostic `_renderTeamPage`. One thing to watch, not a blocker: OL/DL/K-P groups will often be short (2-4 players) since Sleeper's active-roster pool skews toward fantasy-relevant positions — several thin sections stacked is a visual density question worth a real screenshot check post-ship, not a reason to hold this.

**Axiom (feasibility):** pure data-shape change. `_NFL_ROSTER_GROUPS` (3 entries) becomes a longer array of `[label, positions[]]` pairs (9 entries) — same shape, same consumer (`_renderNFLTeamDetail`'s `.map()` over it), no change to `_renderTeamPage`, no AppState shape change, no new fetch, no new CSP surface. The only other reader of `_NFL_ROSTER_GROUPS` is the `facts` array feeding the hero's Players/Offense/Defense/Special-Teams counts (`groups[0]/[1]/[2].players.length`) — those indices break once there are 9 groups instead of 3, so the fact-grid needs its own small update (sum by side-of-ball instead of reading fixed indices), not a blocker, just a dependency to carry through the same commit.

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. Finn implementing this session (all three gates landed in the same pass since the scope was small and well-understood from reading the existing code first).

**✅ SHIPPED 2026-08-02 (Finn):** `_NFL_ROSTER_GROUPS` replaced with 9 position groups (QB/RB/WR/TE/OL/DL/LB/DB/K-P) in broadcast order. The hero fact grid's Offense/Defense/Special-Teams counts now sum across the relevant groups by side-of-ball instead of reading `groups[0]/[1]/[2]` by fixed index (would have silently shown wrong counts — e.g. "Offense: 2" meaning just the QB group — had this not been caught before shipping). Empty groups still render nothing, same as before. **Verified:** `node --check` clean; `check-manifest.cjs`/`check-themes.cjs --strict` both clean; full unit suite green.

**Live-verified 2026-08-02 (Finn), and one real gap caught in the process:** couldn't test against production directly (this is uncommitted-to-deploy code, same wrangler-auth constraint as N-5 Phase 4), so instead injected the exact new logic into a live tab via `window.eval` under test-only names (`_N16_TEST_GROUPS`/`_n16RenderTest`, to avoid colliding with the real `const`-scoped globals nfl.js declares — a plain `window.X = ...` override doesn't work against top-level `const`/`function` bindings in a classic script, confirmed the hard way on the first attempt) and re-rendered a real team (`KC`) against real, already-cached Sleeper roster data. First pass surfaced a genuine bug that predates this session: KC's roster included two players — C.J. Hanson (`OG`) and Kahlil Benson (`T`) — whose Sleeper position codes weren't covered by the OL group's position list (`OL`/`OT`/`G`/`C`), so they silently fell out of every group entirely. This wasn't introduced by N-16 — the *old* 3-bucket Offense group had exactly the same gap (`roster.length` was 97, the old 3 buckets summed to 95) — but since the code was already open, fixed it in the same commit: `OG` and `T` added to the OL group's position list. Re-verified: KC's 97-player roster now fully accounts for across the 9 groups (47 offense + 46 defense + 4 special teams = 97, no orphans). Screenshotted the rendered result: hero fact grid shows the correct summed counts, and scrolling the roster confirms real position-group sections (`WR 13`, etc.) with starter stars and injury badges (Xavier Worthy's "Questionable" tag) rendering exactly as before — same classes, same visual language, no regression.

### N-17 — NFL injury report — **[Vera + Kael + Axiom]** · priority 3 · ✅ SHIPPED 2026-08-02
**Contributors:** Vera (spec), Kael (visual sign-off), Axiom (feasibility) | **Date:** 2026-08-02 | 2nd of 3 owner-directed "NFL expansion" initiatives, sequenced one at a time after N-16

**Vera's job-to-be-done:** "which players across the league are hurt right now, and does it change a start/sit or roster decision." Read the current code first, not guessed: `p.injury_status` already flows through `_nflPoolMap` and already renders inline in 4 places — player card, player detail bio row, rankings row, roster row (team detail) — always as a raw string badge, always requiring the fan to already be on that specific player/team page to see it. There's no way to ask "who's questionable league-wide" without clicking through 32 team pages. Checked the real live data before designing anything (`_nflPoolMap` on the live site, 2026-08-02): of 9,398 active Sleeper pool entries, 449 carry a non-empty `injury_status`, but 196 of those have no current team (free agents/inactive DB entries — noise, not signal). Filtering to rostered players: **253 real, currently-relevant entries** across 5 values — `Questionable` (130), `PUP` (89), `IR` (32), `DNR` (1), `Sus` (1). Also found two fields the site has never surfaced anywhere: `injury_body_part` and `injury_notes` (e.g. "Neck" / "Soreness") — free additional content once the report exists, not a new fetch.

**Behavioral spec:** a new nav destination, `nfl-injuries`, joining the existing Draft HQ strip (`_HQ_TABS` in `fantasy.js`) as a 6th tab alongside Value Board/Rankings/Schedule/Trending/Mock Draft — same family Trending already lives in despite being in-season rather than strictly pre-draft, so precedent supports this home rather than inventing a new nav category. Rows grouped under status headers in urgency order — **Questionable** first (this-week, game-time-decision relevance), then **IR**, **PUP**, **DNR**, **Sus** (longer-term/rare) — same grouped-list-with-headers idiom N-16 and the existing Rankings tiers already use, not a new pattern. Position filter reuses the existing `_NFL_POS_FILTERS` pill row verbatim (same component Players already uses). Each row: headshot, name, team + position meta, status badge, and — new — body part/notes as a secondary line when Sleeper provides them. Clicking a row navigates to that player's detail page, same interaction every other list in this codebase uses. No loading state beyond the standard skeleton (data is already fetched by the time any NFL view loads); empty state ("No injuries currently reported league-wide") for the rare fully-healthy-league case, same `ErrorHandler.renderEmptyState` call every other empty NFL view uses; error state via the standard `ErrorHandler.handle` retry pattern.

**Kael (visual):** reuses `.nfl-lrow`/`.nfl-lrow-av`/`.nfl-lrow-main`/`.nfl-lrow-name`/`.nfl-lrow-meta` row shape verbatim — the exact same row `displayNFLTrending` already renders, so a fan moving between Trending and Injury Report sees a consistent list language, not a new one. **Design call, corrected before shipping:** the original plan was two status-badge colors — `--color-live` (documented in this project's own CLAUDE.md as "amber," for the Questionable/uncertain case) vs `--color-loss` (red, for the settled IR/PUP/DNR/Sus case). Live-checked the actual rendered color during verification and it came out hot pink, not amber — `--color-live` is `#ff006e` in `variables.css`, not amber at all; **CLAUDE.md's own design-token description is wrong** (small Folio-flagged doc fix, see below). Checked `--accent-light` as an alternative amber candidate and it's *worse* for this: theme-inconsistent (`#ffb347` dark / `#ff8100` light, same as plain accent / `#d41830` nl-monarchs — genuinely red in that last theme, which would have silently broken the "distinct from red" premise in one of the site's 3 live themes). Simplified to a single `--color-loss` red for every status, matching the exact convention every other injury badge already uses elsewhere in the codebase (player card, player detail, rankings row, roster row) — consistency with the established pattern beat a two-tone distinction the token system doesn't actually support cleanly.

**Axiom (feasibility):** zero new fetches — this is a pure client-side filter/group/render over `_nflPoolMap`, which is already fetched and cached by the time any NFL Draft HQ view loads (`fetchNFLSleeperPool()` gates all of them). New module-level filter state (`_nflInjPosFilter`) follows the exact `_nflPosFilter`/`sessionStorage` pattern Players already uses. Wiring touches 4 places, each mechanical: `_HQ_TABS` (fantasy.js), `SUB_NAV_TABS.nfl`'s Fantasy `also` array + `MENU_TABS.nfl` mobile tile (navigation.js), the `nflViews` hash-routing array (navigation.js), and a `_renderNFLView` dispatch case (navigation.js). No AppState shape change, no new CSP surface, no new files.

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. Finn implementing this session.

**✅ SHIPPED 2026-08-02 (Finn):** `loadNFLInjuries()`/`displayNFLInjuries()` added to `nfl.js`, wired as a 6th `_HQ_TABS` entry (`fantasy.js`) and into `SUB_NAV_TABS.nfl`'s Fantasy `also` array, the `nflViews` hash-routing array, the view-metadata registry, and a `_renderNFLView` dispatch case (all `navigation.js`). No mobile-menu tile needed — Rankings/Schedule/Trending don't have their own tiles either; the whole Draft HQ family is reached via Draft HQ's own strip once you're in it, and Injury Report follows the same precedent. **Verified:** `node --check` clean on all 3 touched files; `check-manifest.cjs`/`check-themes.cjs --strict` both clean; full unit suite green.

**Live-verified 2026-08-02 (Finn), with one design correction caught mid-verification:** since this is uncommitted-to-deploy code (same wrangler-auth constraint as N-16/N-5 Phase 4), injected the real render logic into a live tab and ran it against real cached Sleeper data. First pass used the two-color badge design from Kael's spec above (`--color-live` for Questionable) — the rendered result came out hot pink, not amber, because `--color-live` is `#ff006e` in `variables.css`, not the amber CLAUDE.md's own docs claimed. Checked `--accent-light` as a fallback amber and found it's theme-inconsistent (genuinely red in `nl-monarchs`), so simplified to the single `--color-loss` red every other injury badge in the codebase already uses — corrected in both `nfl.js` and the Kael section above before calling this done, plus a one-line fix to CLAUDE.md's own token description (was wrong independent of this feature). Re-verified after the fix: screenshotted the Draft HQ · Trending view with the injury logic swapped in — 253 rostered players correctly grouped under **Questionable (130)** → **IR (32)** → **PUP (89)** → **DNR (1)** → **Sus (1)** headers, real body-part/notes detail rendering for the first time anywhere on the site (e.g. "KC · QB · Knee - ACL Surgery" on Patrick Mahomes), consistent red status color, working row click-through pattern. Clicked the QB position filter live: correctly narrowed to 3 QB entries (Mahomes, Tagovailoa, Penix) with an updated count — confirms the filter-pill wiring, not just the initial render.

### N-18 — NFL waiver wire — **[Vera]** · priority 3 · QUEUED, not started
**Scoping decided 2026-08-02** (3rd of 3 owner-directed "NFL expansion" initiatives): a fantasy-context add/drop surface, separate from N-17 above. Not starting cold: the existing NFL Trending view (`nfl-trending`, `displayNFLTrending` in `nfl.js`) already pulls Sleeper's trending add/drop endpoints (`/v1/players/nfl/trending/add`, `/trending/drop`) and renders them as `.nfl-lrow` list rows. Most likely path is extending that view rather than a from-scratch build — but that's a hypothesis to confirm with Vera, not a decision made yet: "waiver wire" in fantasy-football usage usually implies more than a trending list (e.g. who's rostered vs available in a given league format, drop-candidate suggestions relative to your own roster), and this site has no login/roster-persistence to know "your" roster outside of an active Mock Draft session — worth an explicit scope conversation before implementation starts on whether this is "trending, better presented" or something that needs new data/state.

### N-13 — NGS Key Metrics lag the current season (resolve to 2023) — **[Relay]** · priority 3 · partially addressed 2026-06-21
**Finding:** the Key Metrics card (D-025) resolves to **2023** while the season-stats line shows 2025. Diagnosed via the deployed `/api/nfladv` (probed 2022–2025): the nflverse `nextgen_stats` release tops out at **2023** — requests for 2024/2025 404 and the server correctly falls back to the latest available (2023). 2022→2022, 2023→2023, 2024→2023, 2025→2023. So the fallback logic is *correct*; the gap is upstream data availability (nflverse NGS appears frozen/lagging at 2023, likely an NFL/AWS NGS licensing issue — not confirmed).
**Addressed:** the caption now reads "2023 (latest available) season · …" when the resolved NGS season lags the requested one, so the 2023 metrics don't look like a bug next to the 2025 stat line.
**Open (Relay):** confirm whether 2024+ NGS exists under a different nflverse release/path (couldn't verify here — web_fetch can't read the binary `.csv.gz` and curl is restricted). If it does, point `/api/nfladv` at the current source; if NGS is genuinely frozen at 2023, consider supplementing advanced metrics from another ToS-clean source for recent seasons.

**Finn — implementation of N-1/N-2/N-3 | Date: 2026-06-21**

*Shipped:* `js/nfl.js` (N-1 placeholder + Logger.warn in the 4 player-detail loaders; N-3 maps→tokens + `_nflAlpha` color-mix), `js/search.js` (N-2 NFL Teams group + warm), `css/variables.css` (N-3 19 tokens).
*Verification:* `node --check` clean on `nfl.js` + `search.js`; zero NUL bytes; `variables.css` braces balanced; every `var(--nfl-*)` referenced in `nfl.js` confirmed present in `variables.css`; NFL color maps contain no remaining hex.
*Not done — live browser render:* recommend `/screenshot` of an NFL player-detail (force a no-match to see the N-1 placeholder), the ⌘K overlay (search a team), and the player cards (color parity) after deploy.
*Secondary finding (flagged, not fixed — for Axiom):* 5 more bare `catch (_) {}` remain in `js/nfl.js` outside the player-detail loaders (team detail, ESPN-player path). Same Logger-suppression issue as N-1; out of N-1's scope. Worth a small follow-up. — Finn

---

## Design Issues

### WCAG Audit Results — mlb-player-{id} (Priority 1)
**Contributor:** Finn | **Date:** 2026-06-04
**Tool:** Lighthouse 13.3.0 | **Score: 91/100** — passes D-004 threshold (≥90).

**FAIL: color-contrast** — Ticker LIVE pill text at 3.79:1 (expected 4.5:1). **Resolved** — `.ticker-status-pill--live` changed from `color: var(--color-live)` to `color: var(--text-primary)` in `css/ticker.css` (Design System Overhaul, 2026-06-04). Re-audit recommended to confirm 100/100.

**FAIL: select-name** — Two `<select>` elements in the Compare Players card (`#mlb-cmp-select-b`, `#mlb-cmp-select-c`) had no label. Fix applied same session: `aria-label="Compare: player 2"` and `aria-label="Compare: player 3"` added to [`js/mlb.js:5657–5664`](js/mlb.js#L5657). Resolved.

**Manual checks — all pass** (same stack as players view — verified in prior session).

---

### WCAG Audit Results — mlb-leaders (Priority 1) — Manual Run Required
**Contributor:** Finn | **Date:** 2026-06-04

Lighthouse times out on this view in the headless test environment. Root cause: the Statcast leaderboard fetches (`fetchStatcastBulkLeaderboard`, `fetchStatcastPitcherLeaderboard`) take longer than Lighthouse's DevTools evaluation window under headless. This is a tooling limitation, not an application error — the page loads and renders correctly.

**Action required:** Run Lighthouse manually in Chrome DevTools (`chrome://inspect` → Lighthouse tab → Accessibility → `http://localhost:3001/#mlb-leaders`). Expected: same failures as players view (`--text-subtle` contrast, ticker pill) since the leaders view uses the same token set. Document results as a follow-up ISSUES.md entry.

---

### WCAG Audit Results — mlb-players (Priority 1)
**Contributor:** Finn | **Date:** 2026-06-04
**Tool:** Lighthouse 13.3.0 | **Score: 96/100** — passes D-004 threshold (≥90). Two root causes producing nine failures.

**Root Cause A — `--text-subtle` insufficient contrast on dark card surfaces**

`--text-subtle: #556d8f` renders at 3.05:1 on `--bg-card` (`#172131`) and 3.45:1 on `--bg-base` (`#0b1526`). AA requires 4.5:1 for text at these sizes (11.5–13px). Affects eight elements — all inactive toggle labels:

| Element | Token used | Contrast | Failures |
|---|---|---|---|
| Inactive `.mlb-group-btn` ("Pitchers") | `--text-subtle` | 3.05:1 | 1 |
| Inactive `.mlb-pos-btn` (1B, 2B, 3B, SS, OF, DH) | `--text-subtle` | 3.05:1 | 6 |
| `.freshness-label` | `--text-subtle` | 3.45:1 | 1 |

**Fix (Kael — one token change):** Lighten `--text-subtle` in `:root` (dark mode) to achieve ≥4.5:1 on `#172131`. `--text-muted` at `#7fa5c8` is ~5.9:1 and would pass — Kael decides whether to adjust `--text-subtle` up or switch inactive labels to `--text-muted`. Adjusting the token fixes all 8 failures in one line.

**Root Cause B — Ticker LIVE pill text**

`LIVE` text in `.ticker-status-pill--live`: computed `#976510` on `#191817` = 3.53:1, fails AA. Routes to Kael for visual fix.

**Manual checks — all pass:**
- `prefers-reduced-motion`: blanket `* { animation-duration: 0.01ms !important }` in `animations.css` ✅
- Icon-only aria-labels: theme toggle, search button, menu button — all present and specific ✅
- Search overlay focus trap: focus management + Escape handling confirmed in `search.js` ✅
- Color-only states: live/win/loss all have text labels alongside color ✅

**Remaining for full D-004 close:**
1. Kael adjusts `--text-subtle` (or swaps inactive label token) — fixes 8 failures
2. Kael fixes ticker live pill text contrast — fixes 1 failure
3. Leaders view Lighthouse run (timed out in this session — re-run separately)
4. Player detail view Lighthouse run (not yet run — Priority 1, needed before Pro tier launch)

---

### WCAG Contrast Fixes — RESOLVED
**Contributor:** Finn (audit), Kael (fix) | **Date:** 2026-06-04 | **Verified:** Lighthouse 100/100 on mlb-players post-fix

Two contrast failures confirmed across multiple views. Both have a single clear fix each.

**Item 1 — `--text-subtle` on dark card surfaces (8 elements, 3.05–3.45:1)**

Affects: all inactive `.mlb-pos-btn` labels, inactive `.mlb-group-btn` ("Pitchers"), `.freshness-label`.
Current value: `--text-subtle: #556d8f`. Need ≥4.5:1 on `--bg-card` (`#172131`).
`--text-muted: #7fa5c8` achieves ~5.9:1 and passes. Kael decides: raise `--text-subtle` or switch inactive label token.
One token change in [`css/variables.css`](css/variables.css) `:root` block fixes all 8 elements.

**Item 2 — Ticker LIVE pill text (1 element, 3.53–3.79:1)**

The `.ticker-status-pill--live` text computes to `#976510` on `#191817` — amber on dark ticker background. Expected ≥4.5:1.
Fix: darken the text color on the live pill, or increase `--color-live` luminance for use as text (not background). Kael decides approach.
File: [`css/ticker.css`](css/ticker.css) or [`css/variables.css`](css/variables.css) — whichever sets the pill text color.

**Both fixes unblock D-004 WCAG pass for Pro tier launch.**

---

### Position Chip Tokens — Light-Mode Contrast Gap — RESOLVED
**Contributor:** Kael (finding + fix) | **Date:** 2026-06-04

`--color-chip`, `--color-chip-bg`, and `--color-chip-border` had no `[data-theme="light"]` overrides. In light mode they inherited dark-mode indigo values: `#818cf8` text on white (~2.5:1, fails WCAG AA for 11.5px text) and `rgba(99,102,241,0.12)` background (nearly invisible on white, leaving border as the only active signal).

**Fix:** Added explicit light-mode overrides to `[data-theme="light"]` in [`css/variables.css`](css/variables.css):
- `--color-chip: #4f46e5` — darker indigo, ~6:1 contrast on white (passes AA)
- `--color-chip-bg: rgba(79,70,229,0.09)` — proportionally adjusted tint
- `--color-chip-border: rgba(79,70,229,0.38)` — proportionally adjusted border

Affects all components using chip tokens in light mode: position filter chips, comparison bars, position pills, search tags. Dark mode and all CC themes unaffected — only the `[data-theme="light"]` block was changed.

**Finn note:** When running the WCAG audit, position chips can be considered resolved for light-mode contrast. Verify the dark-mode values (`#818cf8` on `--bg-card`) separately — that contrast is lower (~3.1:1 on the dark surface) and may still be a finding.

---

### Player View Toggles — COMPLETE
**Contributor:** Kael (spec) | **Date:** 2026-05-29 | **Resolved by:** Axiom | **Date resolved:** 2026-05-31

All three toggle functions (`_styleMLBViewBtn`, `_styleMLBGroupBtn`, `_styleMLBPosBtn`) confirmed using `classList.toggle` with correct base classes assigned on element creation. Wrapper uses `mlb-group-toggle-row`, separator uses `mlb-group-sep`. All CSS classes confirmed present in `components.css`. Kael visual review of light-mode rendering still required before the design system overhaul is fully signed off.

**Secondary finding resolved (Finn, 2026-06-03):** `posWrap` at current `mlb.js:952` uses `posWrap.className = 'mlb-pos-row'` — the class is already wired. No `style.cssText` present. ISSUES.md line number was stale by ~70 lines. No further action needed.

---

### Leaderboard Section Dividers — COMPLETE
**Contributor:** Kael (spec) | **Date:** 2026-05-29 | **Resolved by:** Axiom | **Date resolved:** 2026-05-31

All three text-only dividers ("Active Hitting Streaks", "Hot Right Now", "Statcast Leaders") confirmed with SVG icons matching Kael's spec — trending-up, flame-dot, and target-circle respectively. Verified against current source at lines 3817, 3894, and 4245. No action required.

---

### City Connect — Standard Logos Used, CC-Specific Logos Needed
**Contributor:** Kael | **Date:** 2026-06-01

`_CC_TEAM_LOGOS` in [`js/app.js:943`](js/app.js#L943) maps each CC theme to the standard team logo SVG from `mlbstatic.com/{teamId}.svg`. When a CC theme is active the header shows the regular team logo, not the City Connect variant.

MLB likely exposes CC-specific logo assets at a different CDN path (unknown pattern — needs investigation). If CC logos exist at a predictable URL, the map should be updated. If not, consider a team wordmark or the CC uniform number as a fallback identity element.

**Investigation complete (Kael, 2026-06-01):** Exhaustive probe of mlbstatic.com CDN patterns (`/city-connect/`, `/cap/`, `/-dark`, `/season/2026/`, `/wordmark/`) all return 404. The official MLB CC reveal page itself uses standard `team-logos/{id}.svg` for team identification. No public CC-specific logo URLs exist at this time.

**Recommended path:** Keep the standard logos (current behavior). The CSS-only header signal has been implemented (see below) — a 2px accent ring on `.brand-logo-img` fires for all 12 themed modes via `[data-theme^="cc-"]` and the three bonus theme selectors. No JS change needed.

**Axiom decision (2026-06-01):** The four bonus themes (`cc-bananas`, `retro-expos`, `nl-monarchs`, `aa-trash-pandas`) will not receive `_CC_TEAM_LOGOS` entries at this time. All four teams are either independent, minor league, or historical — no stable SVG logo URLs exist on MLB's CDN, and adding third-party domain URLs would require CSP changes in both `index.html` and `_headers` for assets that may drift or disappear. The fallback to `assets/Icon.PNG` is clean; the accent ring badge added by Kael provides sufficient themed-mode identity in the header. Revisit if stable logo sources become available.

---

### Color Semantic Drift Risk
**Contributor:** Kael | **Date:** 2026-05-17

The stat-color palette (`--color-pts` amber, `--color-reb` emerald, `--color-ast` sky, `--color-stl` violet, `--color-blk` pink) is functioning as a categorical system today. The risk is incremental drift: each new component added during the 2026 feature push reaches for these colors to signal activity or emphasis rather than category, and over time the palette stops meaning anything specific.

No single instance of this has become a problem yet — this is an early flag. The fix is an explicit rule enforced during the design system overhaul: stat colors mark category only. They do not signal importance, highlight states, or decorate new components that don't map to those exact stat types. Any proposed use of a stat-color token outside its defined category should be documented and justified, not defaulted to.

---

### WCAG Accessibility — No Audit Run
**Contributor:** Kael | **Date:** 2026-05-17

The success metrics table marks WCAG AA compliance as "Partial" but there has been no structured audit. This means the gap is unknown. Color contrast for text on `--bg-card` surfaces, keyboard navigation through the leaderboard tables, and focus visibility on the ⌘K search overlay are the highest-probability failure points based on a visual read of the current UI.

This needs a real audit before any Pro or Enterprise tier launch — a broadcast professional or production assistant using keyboard shortcuts will hit gaps immediately if focus states are missing or contrast ratios fail on mid-weight text. Recommend running axe-core or Lighthouse accessibility pass against the MLB players, leaders, and player detail views as the first three targets.

---

### Loading State Verification — Throttled Network Not Confirmed
**Contributor:** Kael | **Date:** 2026-05-17

Skeleton states exist and the shimmer keyframe is implemented. What hasn't been confirmed is how every view behaves under realistic network conditions — a mobile connection at 3G speeds, a cold cache on first visit, or a partial API failure where some endpoints return and others time out.

The skeleton pattern is only as good as the coverage. If a view defaults to a blank container when its specific data fails rather than showing a skeleton and a graceful error, the user sees a broken layout with no explanation. Every view needs to be walked in Chrome DevTools with network throttled to "Slow 3G" before the 2026 feature push adds more async data dependencies on top of the existing ones.

---

### Game Prep Absent from Mobile Bottom Tab Bar — RESOLVED
**Contributor:** Vera | **Date:** 2026-05-17 | **Resolved:** 2026-05-31

Current bottom tab bar: Players | Leaders | Scores | Standings | Builder. Game Prep is not in it.

Game Prep is the highest-value feature for the announcer persona — it is the one view that addresses G3 ("every key fact in 3 clicks or fewer") for the primary paying audience. On mobile, reaching it requires three interactions: tap the menu button, wait for the panel to appear, tap the Prep tile. That is two interactions more than any item in the tab bar. For a broadcaster opening SportStrata on a phone in the booth, that friction is a product failure at the moment it matters most.

Builder is the feature currently occupying the tab bar slot that Prep should have. Builder is a power-user tool — it requires composing custom stat formulas, which is not a live-broadcast workflow. It belongs in the menu panel, not the bottom tab bar. Swapping Builder out and Prep in aligns the tab bar with actual audience priority for the first time.

This is a P2 UX issue. It is a behavioral change, not a visual one, and it is small: change `data-view="mlb-builder"` to `data-view="mlb-prep"` in the bottom tab bar markup, update the label and icon, confirm the active state syncs correctly via `.nav-tab`. Prep still remains accessible from the menu panel — no feature is removed. Builder is only deprioritized from the primary mobile surface.

**Recommended fix:** swap Builder ↔ Prep in `#bottomNav` in `index.html`. Update icon to clipboard or checklist glyph. Confirm active state with `navigateTo('mlb-prep')`.

---

### Home Search Bar False Affordance — RESOLVED
**Contributor:** Vera | **Date:** 2026-05-17 | **Resolved:** 2026-06-01

Vera's recommended fix was implemented. The home search element is a `<button class="home-search-bar">` (`js/app.js:201`) — not an `<input>`. It carries the magnifier icon, "Search 900+ MLB players, teams…" label text, and a `⌘K` kbd hint at the trailing edge. Hidden on `≤640px` via `@media (max-width: 640px) { .home-search-kbd { display: none; } }`. Hover state (`--border-accent`, `--shadow-card-hov`) confirms it as a tappable element. ARIA: `aria-label="Search players"` on the button element. No false affordance — the element's shape, element type, and cursor all signal a button, not a text field.

---

### Data Freshness — No Last-Updated Timestamp
**Contributor:** Vera | **Date:** 2026-05-17 | **Priority:** P2 for Enterprise tier launch

There is no indication anywhere in the UI of when stats were last fetched or what date the data reflects. For a broadcast professional citing SportStrata stats on-air, data freshness is not a UX nicety — it is a trust prerequisite. An announcer who quotes a slugging percentage that is two days stale, or who misses a player's performance from last night's game because the cache hasn't been invalidated, has a credibility problem with their audience that SportStrata created.

This is also the explanation for stat discrepancies: a user who compares a SportStrata number to another source and finds a difference has no way to determine whether it is a calculation difference or a data timing difference. A timestamp resolves that ambiguity immediately.

The implementation is lightweight because the timestamp exists: `ApiCache` stores a write timestamp with every entry. Surfacing it requires reading the cache metadata for the key stat endpoints and rendering it as a small "Stats as of [time]" label near the data. This is not a new data source — it is making visible data that is already computed.

**Recommended fix:** Add a `data-freshness` attribute or a small `.freshness-label` element near the stat header in the players, leaders, and player detail views. Populate it from `ApiCache.getTimestamp(key)` if such a method exists, or from the response `Date` header captured at fetch time. Target format: "Updated 14 min ago" or "Updated today at 2:34 PM". P2 — required before Enterprise marketing begins.

---

### Sub-nav Ordering Misalignment with Primary Audience — RESOLVED
**Contributor:** Vera | **Date:** 2026-05-17 | **Resolved:** 2026-05-31

Current sub-nav order: Players | Leaders | Teams | Standings | [divider] | Builder | Prep | Arcade.

Game Prep sits 7th of 8 items. Builder sits 6th. This order does not reflect the announcer persona's workflow — it reflects implementation history. The broadcaster who opens SportStrata before a game has one immediate destination: Prep. The user who wants to build a custom stat formula is a power user who will find Builder regardless of its position. Listing Builder before Prep on a surface designed for announcers is a category error.

The fix is a two-item swap: Prep before Builder. No new nav items, no restructuring, no changes to click routing.

**Recommended fix:** in `#subNav` in `index.html`, move the Prep `<button>` before the Builder `<button>`. Confirm `data-view` values and `.nav-tab` classes are unchanged.

---

### Card CTA Hover-Reveal Invisible to Touch Users — RESOLVED
**Contributor:** Vera | **Date:** 2026-05-17 | **Resolved:** 2026-06-01

Mobile fix in place at [`css/components.css:273`](css/components.css#L273): `@media (max-width: 768px) { .card-cta { color: var(--accent); } }`. The CTA is always accent-colored on mobile — no hover event required. Desktop still uses the hover-reveal pattern (`.player-card:hover .card-cta`) with accent color on hover. No change to touch interaction semantics.

---

### `detail-value` at 11.5px — Readability at Production Distances
**Contributor:** Vera | **Date:** 2026-05-17

After Kael's card-density pass, `.detail-value` renders at `var(--text-xs)` = 11.5px. On a Retina laptop at normal laptop distance this is readable. On a 1080p or 1440p monitor at desk distance — the typical environment for a production assistant or broadcast technician — 11.5px is at the lower threshold of comfortable sustained reading. The stat values are the primary information in a player card; they should not require the user to lean in.

This is not a P1 item. It is a watch item: if readability complaints arrive from production-environment users, the fix is bumping `.detail-value` from `var(--text-xs)` to `var(--text-sm)` (13px). The card density trade-off Kael made was correct for visual hierarchy; the concern is whether 11.5px holds at non-Retina viewing distances. Monitor in real usage before acting.

---

### Game Prep — Team Color as Sole Differentiator for League/Side Context
**Contributor:** Vera | **Date:** 2026-05-17

Screenshots of the Game Prep view confirm that home/away and AL/NL context is signaled primarily via team color bands. Color is the fastest differentiator for this context and is appropriate. The WCAG concern is that color is the _only_ differentiator — no text label ("Home", "Away", "AL", "NL") accompanies the color block for users who cannot distinguish the colors reliably.

For the broadcast professional audience, a color-blind announcer using this view during game prep cannot confirm league context without already knowing which team is which. That is a use case that exists and that the Enterprise tier cannot afford to fail.

**Recommended fix:** add a small text label ("Home" / "Away", or "AL" / "NL" where applicable) adjacent to the team color band in the game selector and prep sheet header. Text accompanies color — never color alone. This is a WCAG 1.4.1 (Use of Color) requirement and is trivial to implement.

---

## Engineering Issues

### liveGame.js — Corrupted Tail Broke Entire Live Game Feature — RESOLVED
**Contributor:** Axiom (finding + fix), Cipher (review) | **Date:** 2026-06-09

The uncommitted working-tree edit that added the poll-freshness timestamp and the improved `showMLBLiveGame()` accidentally appended 53 lines of duplicated fragments after the file's legitimate end (line 949): a mid-comment paste artifact ("on-away during the initial poll"), a duplicate export block, and a partial duplicate of the new function body. `node --check` failed at line 950 — the whole script would have thrown a `SyntaxError` at load, killing every live game feature (the rest of the app survives because classic scripts fail independently). Fix: truncated at line 949. All 25 JS files + workers + edge function now pass `node --check`. Lesson for the pre-commit path: `/syntax-check` would have caught this — it must run before every commit, not just before pushes.

### Service Worker — Cache-First Froze Deployed Code; Precache List Incomplete — RESOLVED
**Contributor:** Axiom (finding + fix), Vera (behavior review) | **Date:** 2026-06-09

`sw.js` served all same-origin JS/CSS cache-first under a static `sportstrata-v2` cache name. Consequence: once a returning user had the SW installed, every deploy was invisible to them until `CACHE_NAME` was manually bumped — "we shipped the fix but users still see the bug." Compounding it, `STATIC_ASSETS` omitted `math.min.js`, `scorecard.js`, `liveGame.js`, `scorecard.css`, and `liveGame.css`, so offline boot was incomplete and lazily-cached files from later deploys could mix versions with precached ones. Fix: strategy changed to stale-while-revalidate (cached copy serves instantly, background refresh makes the next load current — offline behavior preserved), precache list completed, cache bumped to `sportstrata-v3` (one-time eviction of all v2 clients). Vera note: first paint stays fast; freshness now lags by at most one page load instead of indefinitely.

### CSP Missing Broadcast Blurb Worker Domain — RESOLVED
**Contributor:** Cipher (finding), Axiom (fix) | **Date:** 2026-06-09

`connect-src` in both `index.html` and `_headers` listed the BDL proxy Worker but not `sportsstrata-blurb.zohnwheeler.workers.dev`, which `mlb.js` fetches for the Broadcast Blurb feature. The moment P2-005 deploys the Worker, the browser would block every blurb request — F1 would appear broken despite a successful deployment. Fix: blurb domain added to `connect-src` in both files (kept in sync per CLAUDE.md deployment rule).

### node_modules and package-lock.json Tracked in Public Repo — STAGED FOR REMOVAL
**Contributor:** Cipher (finding), Axiom (fix) | **Date:** 2026-06-09

408 `node_modules/` files plus `package-lock.json` were committed before `.gitignore` added those patterns — gitignore only prevents new tracking, it never untracks. A public analytics dashboard repo shipping a vendored axios tree is noise at best and a stale-dependency CVE surface at worst. Fix: `git rm -r --cached node_modules package-lock.json` executed — 409 deletions staged, files remain on disk. Removal lands with the owner's next commit.

### Stray Files Removed; bot/ GitHub Workflow Is Inert
**Contributor:** Folio (finding), Axiom (cleanup) | **Date:** 2026-06-09

Removed: `js/cache.js.tmp` (byte-identical duplicate of `cache.js`) and the empty root file `images` (was tracked). Separate note: `bot/.github/workflows/mlb-bot.yml` will never run — GitHub Actions only reads workflows from the repository root `.github/workflows/`. When the bot is ready to schedule, either move the workflow to the root or extract `bot/` to its own repo (D-008 anticipated extraction). No action now; flagging so the dormant workflow isn't mistaken for a live one.

### Local .env Hygiene — OWNER ADVISORY (details in private owner checklist)
**Contributor:** Cipher | **Date:** 2026-06-09 | **Severity:** Medium (local-only)

The untracked root `.env` contains credentials beyond what SportStrata consumes. Verified: not tracked, not in git history, covered by `.gitignore`. Recommendation: keep only project-scoped secrets in this working copy. Specifics are documented in the private owner checklist (gitignored), not here — this is a public repo.

### Live Game Page — Architecture Deviation from D-009
**Contributor:** Axiom | **Date:** 2026-06-08

D-009 specifies the live game entry pattern as "inline accordion" (opens in-place within the scores list). The current implementation in `js/liveGame.js` uses a full-page view (`showMLBLiveGame`) instead. `openLiveGamePanel` — the inline accordion function — is exported but never called from `_createMLBGameCard`. The card click routes to `navigateTo('mlb-live-'+gamePk)` → `showMLBLiveGame`.

This is a design deviation, not a crash bug. The full-page view is functional. But D-009 is still `open` status and the decision team should either accept the full-page approach as the intended direction or re-specify whether the inline accordion should be restored.

**Requires:** D-009 resolution. Vera and Kael should weigh in on whether the full-page vs. inline accordion distinction affects their specs.

---

### Park Factors Table — Undated, No Source Attribution, No Update Path — RESOLVED (see P2, 2026-07-31)
**Contributor:** Relay | **Date:** 2026-06-04

`_PARK_FACTORS` at [`js/mlb.js:138`](js/mlb.js#L138) is a static 30-entry lookup hardcoded with no season year, no source, and no update mechanism. Park factors shift year-over-year. The A's entry (team ID 133, value `0.97`) references Sutter Health Park in the comment but the factor likely reflects Oakland Coliseum era data — this requires verification.

**Recommended actions (Axiom — small):**
1. Add `// Source: Baseball Reference park factors | Season: YYYY` at the top of the table. Document which season these values reflect so future reviewers know when a refresh is due.
2. Flag in GOALS.md as an annual maintenance item: refresh park factor values at each season's start (April).

This is not a P1 — the values are close enough for a badge display and graceful fallback (`_parkFactorBadge` renders nothing if the team ID is missing). But stale values mislead analysis for teams with recently changed parks.

**Finn, live-verify pass (2026-08-02):** confirmed resolved by reading current `js/mlb.js:140-177` directly, not by trusting the ISSUES.md entry below. The table now carries a dated header comment (`// Review annually at season start...`), a documented exceptions list (Athletics/Orioles/Rays, each with a stated reason for its non-standard window), and all 30 values are on the 2023–2025 R-column window per the P2 entry below. This original finding (undated, unsourced, no update path) no longer describes the code. See P2 for the actual refresh.

---

### Sprint Speed CSV — No Column Schema Guard — SHIPPED (confirmed 2026-08-02)
**Contributor:** Relay (finding) | Finn (fix) | **Date:** 2026-06-04 | **Confirmed shipped:** 2026-08-02

`fetchSprintSpeedLeaderboard()` in `js/mlb.js` parses Savant's sprint speed CSV by header name. If Savant renames `sprint_speed` to another column name, the row filter would silently return an empty array — the feature goes dark with no log entry.

**Fix verified in code (`js/mlb.js:578-581`):**
```js
if (!headers.includes('sprint_speed')) {
    Logger.warn('Savant sprint speed CSV schema changed — expected column not found', undefined, 'MLB');
    return null;
}
```
Matches the recommended fix (message wording improved slightly). A schema change now produces an observable `Logger.warn` instead of a silent empty array.

---

### Bullpen Tracker — Cold-Cache Request Budget Watch Item
**Contributor:** Relay | **Date:** 2026-06-04

`_populateBullpenSection()` at [`js/mlb.js:6595`](js/mlb.js#L6595) fires up to 6 boxscore fetches on cold cache (3 games × 2 teams). Combined with the ~12 existing parallel fetches in `displayGamePrep()`, a cold game prep load now initiates up to 18 concurrent MLB Stats API calls. LONG TTL (60 min) means this is a one-time cost per session and is acceptable today. Document as a budget watch item: if game prep view grows further in data scope, audit the total cold-cache request count before adding more parallel fetches.

No action needed now. File if the budget exceeds 20 calls on a cold load.

---

### Worker CORS Hardening — Source Complete, BDL Redeploy Pending
**Contributor:** Cipher (finding) | Axiom (implementation) | Folio (docs) | **Date:** 2026-06-04

**Finding:** Both deployed Cloudflare Workers used `ALLOWED_ORIGIN = '*'`, making them open relays. Anyone who discovered the Worker URLs could use the BDL API key quota for free (bdl-proxy) or generate Anthropic API charges at project expense (broadcast-blurb).

**Severity:** Medium. No key exposure — secrets stay server-side. Risk is quota exhaustion (BDL) and cost abuse (Anthropic).

**Resolution:** Replaced wildcard CORS with an origin allowlist in both Workers. Only `https://sportsstrata.com` and localhost dev ports (`3001`–`3003`, both `localhost` and `127.0.0.1`) receive a matching `Access-Control-Allow-Origin` header. All other origins receive the production domain in the header, causing the browser to block them. Savant proxy path regex also tightened to remove `%` (aligns with the BDL proxy pattern). Brand name corrected from "ZohnStats" to "SportStrata" in the bdl-proxy.js file comment.

**Files changed:** [`worker/bdl-proxy.js`](worker/bdl-proxy.js) | [`worker/broadcast-blurb.js`](worker/broadcast-blurb.js)

**Remaining actions:**
- `wrangler deploy` on the BDL proxy to push the source change to production — **confirmed 2026-08-02: source fix is verified correct in `worker/bdl-proxy.js` (`ALLOWED_ORIGINS` allowlist includes `https://sportstrata.cc`/`https://www.sportstrata.cc`/`https://zohn-sports-stats.pages.dev` + local dev ports — the "sportsstrata.com" typo above is stale prose only, not a code bug), but `wrangler whoami` shows this session has no Cloudflare auth, so the deploy itself has NOT run. Owner runs `cd worker && wrangler deploy` to push it live — this can't be executed from an unauthenticated sandbox.**
- Broadcast-blurb deployment requires project owner authorization per D-006 — source fix is staged, deploy blocked.

**Cipher verification:** Allowlist uses exact string matching (`Array.includes`), no prefix bypass possible. Empty-origin requests fall back to production domain correctly. Control holds.

**Informational — CF edge cache + Vary:** The BDL proxy uses `cf: { cacheEverything: true }`. With origin-dependent CORS headers, a cached response from one local dev port could be served to a different local port with the wrong CORS header. No security impact — but if local dev CORS failures appear after this deploys, add `'Vary': 'Origin'` to BDL response headers. Not a blocker.

---

### Game-Day TTL Reduction — SHIPPED
**Contributor:** Axiom | **Date:** 2026-06-01

`fetchMLBLeagueStats()` previously cached season stats with a fixed 30-minute MEDIUM TTL regardless of time of day. During an active game window, a home run hit in the 9th inning could take up to 30 minutes to surface in the leaderboard or player card — a broadcast trust issue Vera flagged in the "Data Freshness" entry above.

Fix: added `_activeGameHours()` helper in [`js/mlb.js:6`](js/mlb.js#L6). When the local clock reads noon–midnight ET (UTC-5, unadjusted for DST — close enough for sports context), `fetchMLBLeagueStats()` passes `ApiCache.TTL.SHORT` (5 min) instead of `ApiCache.TTL.MEDIUM` (30 min) for season-type stat fetches. `last7Days` and other non-season statsTypes keep MEDIUM. Cascades to `_fetchMLBLeaderSplits()` automatically since it calls `fetchMLBLeagueStats()` internally.

**Known limitation — AppState-level staleness:** `_fetchMLBLeaderSplits()` stores results in `AppState.mlbLeaderSplits` for the session. Once populated, subsequent calls return the in-memory value and bypass the ApiCache TTL entirely. The TTL reduction only helps on page load or cache miss — not within a running session. See "Cache Coherence Guard" below for the within-session fix.

**Vera cue:** The freshness label (`_formatFreshness`) already reflects ApiCache write time correctly. With SHORT TTL during game hours, the label will read "Updated X min ago" with X ≤ 5 on a page reload, rather than up to 30. This is a meaningful improvement for the broadcast use case.

---

### Cache Coherence Guard — RESOLVED (verified 2026-06-04)
**Contributor:** Axiom | **Date:** 2026-06-01 | **Verified by:** Axiom 2026-06-04

**Problem:** `AppState.mlbPlayerStats[id]` (player card data) and `AppState.mlbLeaderSplits` (leaderboard data) are fetched from different endpoints with independent ApiCache TTLs. A player who goes 3-for-4 may show an updated AVG in the leaderboard before their player card cache refreshes — a temporary inconsistency that is most noticeable when a broadcaster switches between views mid-game.

**Root cause:** these are different endpoints (`/stats?group=hitting` vs `/people/{id}?hydrate=stats`), cached independently, with no shared invalidation signal.

**Proposed fix (~10 lines in mlb.js):** Before rendering a player detail card, compare the `ApiCache.getTimestamp()` of the player stats key against `AppState._mlbLeaderSplitsTs`. If the player stats entry is more than 5 minutes older, evict the player stats entry from ApiCache and re-fetch. This ensures the player card always reflects data at least as fresh as the leaderboard.

**Where to wire it:** In `showMLBPlayerDetail()` in `mlb.js`, before the `fetchMLBLeagueStats()` call in the stats hydration block.

**Vera cue:** When this ships, the inconsistency window closes to ≤5 min during game hours and ≤30 min off-hours. The freshness label on the player card will accurately reflect when the data was actually fetched, not a stale cache write.

**Finn:** Do not implement this — it touches core AppState hydration logic. Axiom owns.

---

### AppState Race Condition — `mlbLeaderSplits` — RESOLVED (D-003)
**Contributor:** Axiom | **Date:** 2026-05-17 | **Resolved:** 2026-05-29

`_fetchMLBLeaderSplits()` with a module-scoped `_mlbLeaderSplitsPromise` pending-promise registry is in place in `mlb.js`. All three former call sites now route through this function. D-003 is closed. Verified in code 2026-05-29 — `app.js` uses `_fetchMLBLeaderSplits(MLB_SEASON)`, `loadMLBLeaderboards()` and `_showMLBScoutReport()` likewise. No further action.

---

### `schema.js` Load Order — RESOLVED
**Contributor:** Axiom (original finding) + Finn (violation trace) | **Date:** 2026-05-17 | **Resolved by:** Axiom | **Date resolved:** 2026-06-01

`schema.js` moved to load 4th in the chain — immediately before `api.js` — via option (b). Confirmed `schema.js` has no dependencies on any file loaded after position 3 (`cache.js`); it only requires `Logger` from `errorHandler.js` (position 2). All three `ApiShape.check()` call sites in `api.js` now have a guaranteed-live `ApiShape` at every call, including async preload contexts. CLAUDE.md load order documentation updated to reflect the new chain. 25/25 JS files pass `node --check` syntax verification post-move.

---

### P2-005 — Broadcast Blurb Worker Is Undeployed, No Blocker Identified
**Contributor:** Axiom | **Date:** 2026-05-17

`worker/wrangler-blurb.toml` is committed and the worker code exists. The endpoint is referenced in the UI. It isn't deployed. The documented fix is two commands: set the `ANTHROPIC_API_KEY` secret via `wrangler secret put`, then `wrangler deploy`. There's no technical blocker recorded — this appears to be an execution gap, not an engineering problem.

This matters because F1 (AI Stat Narratives) is listed as the single feature that makes SportStrata irreplaceable for announcers. Leaving the worker undeployed means that feature is inert in production indefinitely. If there's a reason it hasn't shipped — cost concern, API key not available, rate limit question — that reason should be documented here so it doesn't look like an oversight.

---

### D-005 Skeleton Coverage Audit — All MLB Views
**Contributor:** Finn | **Date:** 2026-05-17

Code-level verification of skeleton and error-state coverage for all MLB views, per D-005 requirement. Method: read each view entry function and its restore path in `navigation.js` for cold deep-link behaviour. Three categories: solid (skeleton + ErrorHandler), gap (blank or inconsistent), style-only (loading state exists but uses spinner instead of skeleton pattern).

| View | Entry Function | Skeleton? | Error State? | Verdict |
|---|---|---|---|---|
| Players | [`js/mlb.js:747`](js/mlb.js#L747) `loadMLBPlayers()` | ✅ 9 skeleton cards | ✅ `ErrorHandler.handle` | Solid |
| Scores | [`js/mlb.js:2459`](js/mlb.js#L2459) `_loadMLBGamesForOffset()` | ✅ 6 skeleton cards | ✅ `ErrorHandler.handle` | Solid |
| Teams | [`js/mlb.js:2917`](js/mlb.js#L2917) `loadMLBTeams()` | ✅ 6 skeleton cards | ✅ `ErrorHandler.handle` | Solid |
| Leaders | [`js/mlb.js:3487`](js/mlb.js#L3487) `loadMLBLeaderboards()` | ✅ 8 skeleton cards | ✅ `ErrorHandler.handle` | Solid |
| Standings | [`js/mlb.js:4507`](js/mlb.js#L4507) `loadMLBStandings()` | ✅ 18 skeleton rows | ✅ `ErrorHandler.handle` | Solid |
| Game Prep | [`js/mlb.js:5576`](js/mlb.js#L5576) `displayGamePrep()` | ✅ 3 skeleton lines | ⚠️ Custom emoji empty state — not `ErrorHandler.handle` | Minor |
| Stat Builder | [`js/statBuilder.js:168`](js/statBuilder.js#L168) `displayStatBuilder()` | ⚠️ Loading spinner, not skeleton-card pattern | Not confirmed | Style gap |
| Arcade | [`js/arcade.js:28`](js/arcade.js#L28) `loadArcade()` | N/A — synchronous, no async | N/A | No issue |
| Player Detail — async sub-cards | [`js/mlb.js:1617`](js/mlb.js#L1617) inline in `showMLBPlayerDetail()` | ✅ All 6 async sub-cards have individual skeleton placeholders | — | Solid |
| Player Detail — **cold deep-link** | [`js/navigation.js:498`](js/navigation.js#L498) `_restoreMLBPlayerDetail()` | ❌ **No skeleton** — grid is blank during `fetchMLBLeagueStats` call | ❌ Silent blank grid if fetch fails | **P2 bug** |
| Team Detail — loading | [`js/mlb.js:3019`](js/mlb.js#L3019) `showMLBTeamDetail()` | ⚠️ Team logo + spinner — not skeleton-card pattern | Need to verify error path | Style gap |
| Team Detail — **cold deep-link** | [`js/navigation.js:486`](js/navigation.js#L486) `_restoreMLBTeamDetail()` | ❌ Grid blank during `fetchMLBTeams()` call | ❌ No error state | Minor gap |
| Home — Hot Strip | [`js/app.js:282`](js/app.js#L282) fire-and-forget | ❌ Blank section — no skeleton, no loading indicator | ❌ Silent on failure | **P2 bug** |
| Home — Tonight's Starters | [`js/app.js:282`](js/app.js#L282) fire-and-forget | ❌ Blank section — no skeleton, no loading indicator | ❌ Silent on failure | **P2 bug** |

**Three confirmed P2 bugs (per D-005 definition: blank container on pending/failed data):**

1. **Player detail cold deep-link** — `_restoreMLBPlayerDetail()` at [`navigation.js:498`](js/navigation.js#L498) calls `await fetchMLBLeagueStats()` with no loading state set beforehand. The grid holds whatever was previously rendered (or empty). If the fetch fails, `showMLBPlayerDetail()` is called with an empty players array, hits `if (!player) return` at [`mlb.js:1451`](js/mlb.js#L1451), and exits silently — blank grid, no error, no retry. A user who bookmarks a player URL and returns on a cold cache sees nothing.

2. **Home Hot Strip** — blank section between game cards and feature tiles while `mlbLeaderSplits` loads. Confirmed by screenshot. Fire-and-forget `Promise.all().then()` at [`app.js:282`](js/app.js#L282) — the hot strip simply doesn't exist in the DOM until the promise resolves.

3. **Home Tonight's Starters** — same root cause and same blank section as Hot Strip. Both depend on `mlbLeaderSplits` and render in the same callback.

**Style inconsistencies (route to Kael + Vera — pattern question, not P2 bugs):**
- `displayStatBuilder()` and `showMLBTeamDetail()` use a `loading-spinner` div rather than the `skeleton-card`/`skeleton-line` pattern used by all other views. Whether this should be unified is a design/UX decision — flagging for Kael (visual consistency) and Vera (whether spinner vs skeleton is intentional per interaction spec).
- `displayGamePrep()` error state uses a custom emoji icon empty state rather than `ErrorHandler.handle()`. Flagging for Vera — is this intentional for the prep view specifically?

Escalation: P2 bugs → Axiom (implementation) and Vera (UX spec for loading states). Style gaps → Kael + Vera.

---

### Home Page — Hot Strip and Tonight's Starters Render Nothing on Cold Load — RESOLVED
**Contributor:** Finn | **Date:** 2026-05-17 | **Verified by:** Vera | **Date verified:** 2026-06-01

Observed via headless screenshot (desktop, 1280×900). On cold load, the section between "Today's Games" game cards and the four feature tiles (Leaderboards / Game Prep / Statcast / Builder) is completely empty — a large dark blank area. No skeleton, no loading indicator, no error message.

Both Hot Strip and Tonight's Starters depend on `AppState.mlbLeaderSplits`, which is fetched in a non-blocking `Promise.all().then()` in `loadHome()` ([`js/app.js:282`](js/app.js#L282)). Until that resolves, both sections are invisible — not loading, not skeletal, just absent. This is exactly the scenario D-005 describes: a view showing a blank container on partial/pending data rather than a skeleton + graceful state.

Context from CLAUDE.md: Tonight's Starters is "Hidden when no SPs announced or no games today." There are games today (game card skeletons visible), so this blank is not the intentional "no games" path — it's a missing loading state.

Escalation: Kael (visual — blank section posture) and Vera (UX — should this section show a skeleton while `mlbLeaderSplits` loads, or is empty acceptable?). Related to D-005.

---

## UX Specs

### Visual Spec: Data Freshness Timestamp
**Contributor:** Kael | **Date:** 2026-05-31 | **Axiom feasibility:** Confirmed 2026-05-31
**Addresses:** Beta gate 3. **All three gates complete. Finn may implement.**

Element: `.freshness-label` — inline text, no container, no background.
Position: trailing element in the `.search-meta` bar on `mlb-players` and `mlb-leaders` views.
Tokens: `color: var(--text-subtle)` | `font-size: var(--text-xs)`.
Format: `Updated [N] min ago` for ages under 60 min. `Updated today at [H:MM AM/PM]` at 60 min+.
Add `aria-label="Data last updated [N] minutes ago"` (verbose for screen readers, differs from visible text).
States: one — value present, or element absent from DOM. No loading state, no placeholder text.

**Status: Already implemented.** Finn's session audit confirmed `_formatFreshness(ts)` and `.freshness-label` are live in both the players view (via `AppState._mlbPlayerStatsTs`) and the leaders view (via `AppState._mlbLeaderSplitsTs`). The session-introduced `mlbStatsFreshness()` helper and `ApiCache.set('mlb_fresh_…')` call were redundant and have been removed.

**Open refinements:**
- `aria-label` on freshness-label spans — **RESOLVED (Vera, 2026-06-01).** Players view (card + table modes) already had `aria-label="Data last updated [text]"`. Leaders view was missing it — added in `mlb.js` at the leaderboard section divider render site. Pattern: `'Data last updated ' + formatted.slice('Updated '.length)`. Axiom to review on next pass (one-line string template change, no logic change).
- Format above 60 min: **RESOLVED (Kael ruling, 2026-06-09).** Same-day already used the spec format (ISSUES note was stale). Non-today now reads `Updated {Mon D} at {H:MM}` — absolute timestamps are on-air citable; relative ages go stale as spoken.

---

### Visual Spec: First-Visit Value Statement
**Contributor:** Kael | **Date:** 2026-05-31
**Addresses:** Beta gate 4. Requires Vera behavioral spec before Finn can implement.

Element: `.home-welcome` — single strip above `#homeHotStrip`, below the games section.
Surface: `var(--bg-surface)` background | `1px solid var(--border-default)` border | `var(--radius-sm)` | padding `0.625rem 1rem`.
Text: `var(--text-secondary)` | `var(--text-sm)` | two lines maximum.
Draft copy: "Built for broadcasters, analysts, and fans who need more than a scoreboard. No login, no paywall."
Dismiss: `<button>` at trailing edge — `×` character, `var(--text-subtle)` default, `var(--text-secondary)` on hover, no background.
Margin-bottom: `0.875rem` before the next section.

**Vera must spec:** ~~localStorage key name, definition of "first visit," whether dismiss is permanent or session-scoped, and whether the strip hides before or after its dismiss animation (if any).~~ — **Complete. See behavioral spec below.**

---

### Behavioral Spec: First-Visit Value Statement
**Contributor:** Vera | **Date:** 2026-05-31
**Addresses:** Beta gate 4. Companion to Kael's visual spec above. All three gates confirmed: Kael visual ✅ Vera behavioral ✅ Axiom feasibility — pending (see note below).

**Job to be done:** A broadcaster arriving from a Google search, a referral, or a shared link needs to understand what SportStrata is and why it's worth their attention — within the first 10 seconds. They cannot feel this from the game cards alone. The strip gives them one sentence of product context before they navigate anywhere.

**State 1 — Rendered (default, first visit)**

Condition: `localStorage.getItem('ss_welcomed')` is `null` or absent.

The `.home-welcome` strip is in the DOM immediately on `loadHome()`. It is synchronous — no await, no condition on data availability. It renders before anything else on the home page. If localStorage throws (strict private browsing), catch the exception and fail open: render the strip. Never crash the home page over a localStorage read failure.

**State 2 — Dismissed via ×**

User clicks the `×` button. Two things happen in this order:
1. `localStorage.setItem('ss_welcomed', '1')` — permanent
2. `.home-welcome` is removed from the DOM via `el.remove()`

No animation. No fade. Instant removal. The content below shifts up naturally via document reflow. The localStorage key is `'ss_welcomed'` — lowercase, no prefix. The value is the string `'1'`.

**State 3 — Dismissed via navigation**

On the first call to `navigateTo()` from the home page, if `.home-welcome` exists in the DOM: set `localStorage.setItem('ss_welcomed', '1')` and remove the element. The strip does not follow the user into other views — it is home-only and home-scoped. Finn wires this into `navigateTo()` in `navigation.js` as a one-time pre-navigation side effect: check for `#homeWelcome`, if present remove it and write the key, then continue routing as normal.

**State 4 — Returning visitor**

Condition: `localStorage.getItem('ss_welcomed') === '1'`.

`loadHome()` does not render the `.home-welcome` element at all. No placeholder, no hidden element, no visible gap. As if the strip were never in the spec.

**What does NOT change:**

The strip never appears on any view other than `home`. It does not re-appear on home page revisits within the same session once dismissed. It does not expire on a timer or reset after N days. Dismiss is permanent until localStorage is cleared.

**Axiom feasibility confirmed 2026-05-31:** The `navigateTo()` side effect — checking for `#homeWelcome` and removing it on first navigation away from home — has already been wired into `navigation.js`. It runs before `renderCurrentView()`, touches no AppState, and is guarded so it only fires when the element exists. localStorage key is `ss_welcomed`, value `'1'`. Finn does not need to touch `navigation.js` for the dismiss-via-navigation path — it's already there.

**Status: Already implemented.** Finn's session audit confirmed `.home-welcome` exists in `loadHome()` via `zs_seen_welcome` localStorage key. Strip renders on first visit and is never shown again. CSS exists in `main.css`. The session-introduced `navigateTo()` side effect (wrong ID `#homeWelcome`, wrong key `ss_welcomed`) was dead code and has been removed.

**Open refinements — decision items for Kael and Vera:**
- `.home-welcome` uses `--accent-subtle` background + `--accent-border` border. Kael's spec said `--bg-surface` + `--border-default`. Current treatment is more prominent (accent accent). Kael confirms which is correct for the intended posture.
- No explicit `×` dismiss button. **Vera ruling (2026-06-01):** The simpler behavior is sufficient. The strip is two lines, non-blocking, and disappears permanently after the first visit. An explicit dismiss button adds interaction cost without solving a real user problem. Gate closed as-is. No further action needed.
- Welcome strip has no `id`. If the dismiss-via-navigation behavior is required, adding `id="homeWelcome"` and aligning the localStorage key (`zs_seen_welcome` vs `ss_welcomed`) needs to be decided before implementation.

---

---

### Loading State Specs — P2 Bug Fixes — ALL RESOLVED
**Contributor:** Vera (spec) | **Date:** 2026-05-17 | **Resolved:** 2026-06-01
**Addresses:** Finn's D-005 audit — three P2 gaps and two style questions. All three specs are implemented; verified against source code 2026-06-01.

---

#### Spec 1 — Player Detail Cold Deep-Link — RESOLVED
**File:** [`js/navigation.js:517`](js/navigation.js#L517) `_restoreMLBPlayerDetail()` | **Verified:** 2026-06-01

All three states implemented. Skeleton: hero row (circular avatar, name line, position line) + 4×4 stat block grid + 3 stacked card skeletons injected synchronously before the `await`. Error state: `ErrorHandler.handle(grid, err, retryFn, { tag: 'MLB', title: 'Could not load player stats' })`. Not-found state: `if (!player)` replaced with a centered "Player not found" empty state with "Browse all players →" button in [`js/mlb.js:1484`](js/mlb.js#L1484).

The user job here is: *"I bookmarked this player, I'm returning to check their stats."* A blank screen violates that job completely. Three states required, all missing today.

**State: Loading** (while `fetchMLBLeagueStats` resolves)

Immediately before the `await` call, set the grid to a skeleton that matches the player detail page structure — not a generic shimmer, a layout-shaped skeleton. Specifically:

- Hero row: circular avatar placeholder (64px), name line (180px wide), position/team line (100px wide)
- Stats section: 4 rows of 4 skeleton stat blocks (matching the stats-grid layout)
- Three stacked skeleton cards at the same heights as the splits card, trend card, and statcast card

This skeleton must be injected synchronously before any `await`. It replaces whatever the grid currently holds.

**State: Error** (fetch fails or returns empty)

Do not silently return. Call `ErrorHandler.handle(grid, error, retryFn, { tag: 'MLB', title: 'Could not load player stats' })` where `retryFn` is `() => _restoreMLBPlayerDetail(playerId, group)`. The user sees the standard error card with a retry button. Never blank.

**State: Not found** (fetch succeeds but `player` is undefined — ID not in dataset)

The current `if (!player) return` at [`mlb.js:1451`](js/mlb.js#L1451) is a silent blank. Replace with an explicit empty state:

```
Player not found
This player may not have stats recorded for the current season,
or the link may be outdated.
[Browse all players →]  ← navigates to mlb-players
```

Use `ErrorHandler.renderEmptyState(grid, message)` or an equivalent structure. Never blank.

---

#### Spec 2 — Home Hot Strip and Tonight's Starters — RESOLVED
**File:** [`js/app.js:246`](js/app.js#L246) | **Verified:** 2026-06-01

Both sections have DOM-present skeleton markup in the initial synchronous `loadHome()` HTML. Hot strip: `#homeHotStrip` renders with 3 full-width skeleton shimmer rows at `56px` height while `mlbLeaderSplits` loads. Tonight's Starters: `#homeTonightSP` renders 3 skeleton SP cards (circular avatar, two stat-line skeletons) matching the real card dimensions. On API failure: `Logger.warn()` fires and both elements are removed via `.remove()` — no error card on the home page, per spec. `_renderHotStrip()` and `_renderTonightSPSection()` replace skeleton contents with real data when the async resolves.

The user job here is: *"What's happening in MLB today?"* The home page's blank mid-section during load is a layout-shift problem and a trust problem. Users who land on a slow connection see the game cards skeleton above, nothing in the middle, then feature tiles below — it looks broken.

**Decision: both sections show DOM-present skeleton placeholders immediately.**

The sections must exist in the DOM as soon as `loadHome()` runs, before any async resolves. Implement as inline skeleton markup rendered synchronously in `loadHome()`, in the same position where Hot Strip and Tonight's Starters will eventually render. The async callback replaces the skeleton with real content when `mlbLeaderSplits` resolves.

**Hot Strip skeleton:** A single horizontal shimmer row, full width, at the height of the real hot strip (`~56px`). Three skeleton pill shapes (matching the hot-player pill shape) at roughly equal spacing. No player names or stats in the skeleton — just the shape.

**Tonight's Starters skeleton:** Three SP-card-shaped skeleton blocks in a horizontal scroll container. Each card: circular avatar skeleton (48px), team color block placeholder (12px wide), two stat-line skeletons. Height must match a real SP card exactly — prevents layout shift when real cards render.

**State: API failure** (fetch resolves but both splits arrays are empty, or the Promise rejects)

Both sections are removed from the DOM silently. No error message on the home page for these secondary sections — a "Failed to load hot players" error card in the middle of the home page is disproportionate. Log the failure with `Logger.warn()`. The home page functions without these sections.

**What does NOT change:** The "Hidden when no SPs announced or no games today" behavior for Tonight's Starters stays. After real data loads, the section still hides itself if there are no announced starters. The skeleton is not a commitment to show content — it's a layout placeholder that gets replaced with either real content or nothing.

---

#### Spec 3 — Style Inconsistency Rulings — RESOLVED
**Verified:** 2026-06-01

**Stat Builder skeleton** ([`js/statBuilder.js:178`](js/statBuilder.js#L178)): Replaced — spinner is gone, replaced with a `builder-panel` skeleton: one heading-width line (160×20px), one large formula-area line (120px height), one input-area line (65% width). No layout shift.

**Game Prep "Try again" button** ([`js/mlb.js:5725`](js/mlb.js#L5725)): Added. Error state now: `⚾` icon → "Could not load today's schedule" → `<button class="btn-ghost" onclick="displayGamePrep()">Try again</button>`. Tone preserved (emoji-first), retry affordance present.

**Team Detail entity-first spinner**: Permitted exception — no change, per Vera's ruling.

---

### WCAG Accessibility Audit Scope
**Contributor:** Vera | **Date:** 2026-05-17
**Addresses:** D-004. Finn runs tooling; this entry defines what to run, what to check, and what failure means.

**Tool:** Chrome DevTools Lighthouse → Accessibility tab. Run in incognito with no extensions. Record the score for each view and paste results into ISSUES.md as a follow-up entry.

**Priority 1 — must pass before Pro tier launch. Target: ≥90 Lighthouse accessibility score on all three.**

| View | URL hash | What to check manually beyond Lighthouse |
|---|---|---|
| `mlb-players` | `#mlb-players` | Keyboard: can Tab reach every player card? Does each card have a focusable affordance? Contrast: stat value text on `--bg-card`. |
| `mlb-leaders` | `#mlb-leaders` | Keyboard: can Tab navigate the leaderboard entries? Do rank badges have sufficient contrast (colored background + white text)? |
| `mlb-player-{id}` | `#mlb-player-{any valid id}` | Keyboard: tab order through stat bars, splits toggle, month tabs. Focus ring visibility on toggle buttons. |

**Priority 2 — must pass before Enterprise tier launch.**

| View | URL hash | Key risk |
|---|---|---|
| `mlb-games` | `#mlb-games` | Live game status pill — amber `--color-live` with dark text. Confirm AA contrast. |
| `mlb-standings` | `#mlb-standings` | Win/loss columns — color + text label both present? `--color-win`/`--color-loss` on dark surfaces. |
| `mlb-prep` | `#mlb-prep` | Game selector — keyboard accessible? Print button has visible focus? |

**Specific items Finn must check manually regardless of Lighthouse score:**

1. **`prefers-reduced-motion`** — does the skeleton shimmer animation stop when the OS has reduced motion enabled? Check `css/components.css` or `css/animations.css` for the shimmer keyframe and confirm it has a `@media (prefers-reduced-motion: reduce)` override.

2. **⌘K search overlay focus trap** — open the overlay, then Tab through every element inside it. Focus must not escape to the page behind. Close with Escape; confirm focus returns to the element that triggered the overlay (the search button in the header).

3. **Icon-only buttons** — the theme toggle, the search button, and the menu button (mobile) are icon-only. Each must have an `aria-label`. Grep for `aria-label` in `index.html` and confirm all three are present.

4. **Color-only state signals** — confirm that live game status, win/loss records, and streak indicators all have text labels alongside color. Color must not be the sole differentiator.

**What constitutes a pass:** Lighthouse score ≥90 AND all four manual checks confirmed. Finn documents the score, any flagged items, and the manual check results in a follow-up ISSUES.md entry titled "WCAG Audit Results — [view name]". Vera reviews findings and assigns owners per the routing matrix before the audit is considered complete.

---

### Scorecard Behavioral Spec — Phase 1 and Phase 2
**Contributor:** Vera | **Date:** 2026-05-17
**Gates:** Phase 1 and Phase 2 implementation. Finn does not start either phase without this spec. Axiom reviews for feasibility before Finn is assigned work.

---

#### Entry Point and Navigation Model

The scorecard is a drill-down view, not a primary nav destination. It is not exposed in the sub-nav, menu panel, or bottom tab bar. Entry is always via a game card in the `mlb-games` (Scores) view.

**On a completed game card:** an additional action — "Scorecard" text link or icon button — appears below the score line. Clicking navigates to `mlb-scorecard-{gameId}`. Visual design of this entry point is Kael's call; behaviorally it must be a clearly labeled affordance, not a tap-anywhere-on-the-card behavior (that tap target belongs to the game detail flow).

**On a live game card:** same "Scorecard" affordance, labeled "Live Scorecard" with the `--color-live` amber dot. Makes the live-mode intent unambiguous before the user commits to the view.

**Hash pattern:** `#mlb-scorecard-{gameId}` — consistent with the existing `mlb-player-{id}` and `mlb-team-{id}` patterns. A cold deep-link to this hash must be handled by `_loadFromHash()` in `navigation.js`, requiring a new `_restoreMLBScorecard(gameId)` restore function (Axiom's design).

**Back navigation:** browser back button returns to `mlb-games`. History entry is pushed on scorecard entry. If the scorecard was opened from player detail (Phase 2 — clicking a player name), back returns to the scorecard, not to player detail.

---

#### State Map — Historical Mode (Phase 1)

**State 1: Loading**

Triggered immediately on entry before any data fetch resolves.

The scorecard outer chrome renders synchronously from context already available: team names and team colors (from `AppState.mlbTeams` if loaded, or greyed fallback if not). The grid area fills with skeleton cells — a 9-column header row (inning numbers shimmer) and enough batter-row skeletons to suggest a full lineup (show 9 rows). Each cell contains a small skeleton diamond outline and a skeleton line for the notation area. Player name column shows skeleton lines at roster-name widths.

This skeleton uses the scorecard's paper-texture background and grid structure so the user immediately understands the layout they're waiting for.

**State 2: Loaded**

All cells populated. Notation labels top-left, diamond fill state per runner progression. Inning R/H/E footer row visible. Game totals bar at bottom. Surplus innings (extra-inning games) extend the grid horizontally — the header row grows, cells are added. The grid scrolls horizontally if it overflows the viewport width.

**State 3: Error**

The outer chrome (team names, colors, game date) remains visible. The grid area — not the whole page — shows the error state: "Could not load play data for this game." with a "Try again" button. The error is contained to the grid, not a full-page error. The user can still see which game they were trying to view.

**State 4: Game not started** (reached via a direct URL to a future game)

Not reachable from Phase 1's entry point (only completed games show the scorecard affordance). If reached via old bookmark: "This game hasn't started yet." with the scheduled start time. Link: "View today's scores →" navigates to `mlb-games`. Not a skeleton, not an error — an informational state.

**State 5: No plays** (game in progress but 0 plays recorded yet — extremely rare edge)

Render the grid structure with all cells empty. A status line below the team headers reads "Waiting for first pitch…" No error, no skeleton — the grid is the correct empty state here.

---

#### Cell Interaction States — Phase 2

**Default (no interaction):**
Cell shows notation label (top-left) and diamond fill. No hover affordance visible. Cursor: default.

**Hover (desktop) / Focus (keyboard):**
Trigger: `mouseenter` or `:focus-visible` on the cell element. Delay: 150ms debounce before tooltip appears (prevents flicker on fast cursor movement across the grid).

Tooltip content:
- Batter name and final outcome (already visible in cell, shown for mobile context)
- Pitch sequence: each pitch as a row — `Pitch N: [type] [velocity] mph — [call]`. Example: "Pitch 3: Slider 87 mph — Called Strike". Use `details.type.description` for type, `pitchData.startSpeed` rounded to integer for velocity, `details.description` for call.
- Count at end of at-bat: balls / strikes shown as the closing line

Tooltip positioning: appears above the cell. If the cell is in the top two rows, appears below instead. Never overlaps adjacent cells. Tooltip is `role="tooltip"` with `aria-describedby` wired to the cell element.

Dismiss: on `mouseleave` (desktop) or Escape (keyboard). Tooltip has no interactive elements — it is read-only.

**Click / Enter (player name in row header):**
Player name in the left-column header is a `<button>` (not a link — there is no standalone URL for a player name within the scorecard context). On activate: calls `showMLBPlayerDetail(batterId, group)` and pushes history state so back returns to the scorecard. `group` is `'hitting'` for all position players, `'pitching'` for pitchers appearing in the batting lineup (rare — DH-off games). Default to `'hitting'` if uncertain.

**Run scored animation (Phase 1, on historical render):**
When a cell's diamond fill reaches home (all four segments filled — representing a run scored), the home-plate segment has a `.segment--scored` CSS class that applies a brief glow animation (`box-shadow` pulse, 600ms ease-out). Applied once at render time for historical mode, not re-triggered on subsequent renders. CSS only — no JS animation loop.

---

#### Live Mode States — Phase 3 (spec in advance)

**Active at-bat cell:**
Current batter's cell has class `.pa--active`. A 2px amber border (`--color-live`) pulses via CSS `@keyframes` at a 1.5s cycle. Inside the cell: pitch count shown as `B•S` (e.g., `2•1` for 2 balls 1 strike). The notation label area is blank until the at-bat resolves. Diamond fill reflects any mid-PA base advances already recorded.

**LIVE badge:**
Positioned in the scorecard header row alongside the game status. Amber dot + "LIVE" text, using the same pill pattern as live game status pills in the score ticker. Updates to "FINAL" text (no dot, no pulse) when the game ends.

**Paused / updating state:**
When the tab regains visibility after being backgrounded (visibilitychange event), polling resumes and the LIVE badge briefly reads "UPDATING…" (plain text, no animation) during the re-sync fetch. Returns to "LIVE" once the new plays have been rendered.

**Game over:**
LIVE badge becomes "FINAL". `.pa--active` class removed from all cells. Pulse animation stops. No further network calls. The completed scorecard is now in the same visual state as a historically-loaded scorecard.

---

#### Mobile Layout

**Orientation: vertical phone (primary case)**

The scorecard grid does not reflow — it scrolls horizontally within the viewport. The player name column is `position: sticky; left: 0` so it remains visible during horizontal scroll. This is the "sticky column" pattern standard in mobile data tables. The horizontal scroll container gets `-webkit-overflow-scrolling: touch` for momentum scrolling on iOS.

Cell size: on mobile, each cell shrinks to a minimum of `44px × 44px` (Apple/Google tap target minimum). At 9 innings × 44px, the full grid is `396px` wide plus the name column — this requires horizontal scroll on all phones, which is expected and acceptable.

**Cell tap (mobile):**
Tap on a cell opens a bottom sheet (not a positional tooltip — mobile cannot reliably position relative to small cells). Bottom sheet slides up from the bottom edge, overlays the lower portion of the scorecard. Contains identical pitch sequence content as desktop tooltip. Dismiss by tapping outside the sheet or swiping down. The bottom sheet is `role="dialog"` with a focus trap while open.

**Player name tap (mobile):**
Same behavior as desktop click — navigates to player detail. Back gesture returns to scorecard.

---

#### Keyboard Navigation (all modes)

| Key | Behavior |
|---|---|
| `Tab` | Move to next interactive element (player name buttons and focusable cells) |
| Arrow keys | Within the grid, move between adjacent cells in any direction |
| `Enter` / `Space` on cell | Open tooltip (show pitch sequence) |
| `Enter` / `Space` on player name | Navigate to player detail |
| `Escape` | Close tooltip if open; otherwise does nothing |

All interactive elements in the scorecard must be reachable by Tab and operable by Enter. The grid cells must have `tabindex="0"` to be keyboard-focusable. Focus ring uses the standard `--accent-border` outline color already defined in `variables.css`.

---

#### What Is Not Specced (Phase 1 and 2 only)

- Export / share card (Phase 4 — awaits html2canvas spike)
- Freehand annotation (Phase 5 — parked)
- Custom notation mode (Phase 5 — parked)
- Pitch location visualization within cell (beyond Phase 2 scope — tooltip shows pitch type and velocity; spatial coordinates are available in the data but zone visualization is a future enhancement)

---

## Architecture notes

**Stack:** Vanilla JS/CSS/HTML. No bundler, no framework. All files share global scope via `<script>` tags in `index.html`. Script load order is documented in `CLAUDE.md`.

**Primary data sources:**
- MLB Stats API (`statsapi.mlb.com/api/v1`) — players, stats, schedule, standings, transactions, game logs, splits
- Baseball Savant (`baseballsavant.mlb.com`) — Statcast percentiles, pitch arsenal CSV, spray charts
- Open-Meteo — game-day weather for outdoor parks

**Edge cache:** Cloudflare Pages Function at `functions/api/mlb.js` proxies and D1-caches MLB Stats API + Savant calls. TTL varies by endpoint (schedule: 60s, standings: 30m, people/teams: 1h, Savant: 1h).

**Key AppState fields in play:**
- `mlbLeaderSplits` — full season hitting + pitching splits for all players; powers league-rank badges and hot strip
- `mlbHotStats` — last-7-days splits; powers hot strip
- `mlbSavantLeaderboard` — Statcast bulk CSV; powers Statcast leaderboard section
- `mlbPlayers` — `{ hitting: [], pitching: [] }` — main player pool
- `mlbPlayerStats` — `{ hitting: { [id]: statsObj }, pitching: { [id]: statsObj } }`

**Before any push:** run `/deploy-check`. It validates BDL key exposure, CSP sync, and committed state of critical files.

---

## Relay — Analytics & Data Presentation Items (2026-06-08)

The following items were identified in Relay's full data architecture deep dive (`docs/archive/relay-deep-dive-2026-06-08.md`). Implemented items are noted. Items requiring spec gates or further verification are parked here.

---

### [IMPLEMENTED] P4 — Savant Bulk Leaderboard Fetch Deduplication
**Contributor:** Relay / Axiom | **Date:** 2026-06-08

`mlbSavantLeaderboard` and `mlbSavantPitcherLeaderboard` lacked in-flight promise guards, meaning rapid double-navigation could fire two 200–500KB Savant CSV fetches simultaneously. Added `_mlbSavantLbPromise` and `_mlbSavantPitcherLbPromise` module-level guards matching the existing `_mlbLeaderSplitsPromise` pattern. `js/mlb.js` — `loadMLBLeaderboards`.

---

### [IMPLEMENTED] P7 — Schema Drift Detection on Savant CSV Fetchers
**Contributor:** Relay / Axiom | **Date:** 2026-06-08

`fetchStatcastBulkLeaderboard` and `fetchStatcastPitcherLeaderboard` only validated `player_id` presence. Added required-column checks on parsed headers. Mismatch logs `Logger.warn` with actual headers received and returns `null`, triggering graceful degradation in the UI. `js/mlb.js`.

---

### [IMPLEMENTED] P2 — Chase Rate and Zone Contact Rate on Statcast Card
**Contributor:** Relay / Axiom | **Date:** 2026-06-08

`oz_swing_percent` (chase rate) and `z_contact_percent` (zone contact rate) were present in every `fetchStatcast` percentile response but not rendered. Added to both hitter and pitcher sections of `_renderStatcastCard`. `js/mlb.js`.

---

### [IMPLEMENTED] P3 — CSW% on Pitcher Statcast Card
**Contributor:** Relay / Axiom | **Date:** 2026-06-08

Added `csw_rate` / `p_csw_rate` row to the pitcher section of `_renderStatcastCard`. Data sourced from `fetchStatcast` percentile-rankings response (same endpoint already powering the card). If field is absent from the response, `_row()` silently no-ops. `js/mlb.js`.

**Note for Relay verification:** `csw_rate` field presence in the percentile-rankings JSON response is assumed from Savant API conventions — flagged <90% confidence. Relay to verify against a live response and confirm or remove if absent.

---

### [IMPLEMENTED] P5 — wRC+ with Hardcoded FanGraphs Constants
**Contributor:** Relay / Axiom | **Date:** 2026-06-08

Added `_MLB_WRC_CONSTANTS` (2024 and 2025 preliminary values) and wRC+ computation in `_computeBattingRates`. Formula: `((wOBA − lgwOBA) / wOBAscale + lgRPA) / lgRPA × 100`. Added to player detail stat grid and hitting stat bars. 2025 values are preliminary (marked `†` in code comments). `js/mlb.js`.

**Relay note:** 2025 constants flagged at <90% confidence — drawn from historical FanGraphs guts patterns. Relay to confirm 2025 final constants (typically available mid-September) and update `_MLB_WRC_CONSTANTS[2025]` when finalized.

---

### [IMPLEMENTED] P1 — xBA−AVG and xwOBA−wOBA Luck Delta Display
**Shipped:** 2026-06-08 | `mlb.js` — `_deltaRow()` helper + data augmentation in `fetchStatcast().then()`
**Contributor:** Relay | **Date:** 2026-06-08
**Vera spec:** 2026-06-08 ✅ | **Kael spec:** pending | **Axiom feasibility:** n/a (no new arch)

---

#### Vera — UX Spec (2026-06-08)

**Job to be done.** The user is looking at a player's Statcast card and wants to know one thing: is this player's current performance sustainable? The xBA−AVG gap is the cleanest single answer to that question. A hitter batting .210 with an xBA of .290 is almost certainly going to improve. A hitter batting .330 with an xBA of .240 is almost certainly going to regress. Without the gap, the user sees two disconnected numbers and has to do the math themselves. With the gap, the card makes an argument.

**What gets added.** Two delta rows for hitters, one for pitchers:

*Hitters (after the xBA row and after the xwOBA row):*
- `xBA − AVG` delta row: label "Luck (xBA)", value is `xBA − AVG` formatted as `±.NNN`
- `xwOBA − wOBA` delta row: label "Luck (xwOBA)", value is `xwOBA − wOBA` formatted as `±.NNN`

*Pitchers (after the xERA row):*
- `xERA − ERA` delta row: label "Luck (xERA)", value is `xERA − ERA` formatted as `±N.NN`

**Color semantics — hitters.**
- Delta > +0.020: player is underperforming expectations → **green** (unlucky, buy signal). The user should read this as "expected to improve."
- Delta < −0.020: player is outperforming expectations → **red** (lucky, sell/regression risk).
- Delta between −0.020 and +0.020: **neutral** (--text-muted). No directional signal at this precision.

**Color semantics — pitchers.** Direction inverts. An ERA lower than xERA means the pitcher is getting lucky (fewer runs allowed than deserved).
- xERA − ERA > +0.50: pitcher ERA is better than deserved → **red** (lucky, regression risk).
- xERA − ERA < −0.50: pitcher ERA is worse than deserved → **green** (unlucky, expected improvement).
- Between −0.50 and +0.50: **neutral**.

**Neutral threshold rationale.** For batting metrics (AVG, wOBA), deltas under 20 points are within normal season-to-date variance and carry no actionable signal. For ERA, 0.50 runs is the standard broadcast rounding convention. These thresholds prevent false signals for players who are performing roughly as expected.

**Display format.**
- Batting deltas: always 3 decimal places with leading sign: `+.043`, `−.062`, `≈0`. Use `−` (minus sign U+2212) not `-` (hyphen) for negative values.
- ERA delta: 2 decimal places: `+0.71`, `−1.23`, `≈0`.
- Zero/neutral case: display `≈ 0` in `--text-muted` color. Do not hide the row — absence of a row reads as "data unavailable," which is different from "no signal."

**States.**
- **Data present, signal directional:** colored value (green or red per above).
- **Data present, signal neutral:** `≈ 0` in `--text-muted`.
- **Data missing (one or both inputs null):** skip the row entirely — the `_deltaRow()` helper returns `''` when either input is null. This is the same behavior as `_row()` with two null inputs.
- **No percentile bar.** Delta rows have no percentile ranking and no bar. The `.sc-bar-wrap` cell is present but empty (zero-width bar, no color fill) so the grid columns stay aligned.

**Tooltip / title attribute.** Each delta row's label `<span>` carries a `title` attribute:
- "xBA vs AVG: positive = hitting below expectations (unlucky), negative = hitting above expectations (lucky)"
- "xwOBA vs wOBA: positive = underperforming expected run value (unlucky)"
- "xERA vs ERA: positive = ERA better than deserved (lucky), negative = ERA worse than deserved (unlucky)"
These are the only explanation the user gets — no modal, no footnote. The wording must be plain English, not analyst jargon.

**Placement.**
- Hitter xBA delta row: immediately after the `xBA` row.
- Hitter xwOBA delta row: immediately after the `xwOBA` row.
- Pitcher xERA delta row: immediately after the `xERA` row.
- Do not group deltas into a separate section — co-locating each delta with its source stat is what makes the connection legible at a glance.

**Implementation note for Finn.** `stats.avg` and `batting.woba` are available via closure in the `fetchStatcast().then()` callback in `showMLBPlayerDetail`. Augment the `data` object before passing to `_renderStatcastCard`:
```js
data._actual_avg  = stats.avg  ? parseFloat(stats.avg)  : null;
data._actual_woba = batting?.woba ?? null;
data._actual_era  = stats.era  ? parseFloat(stats.era)  : null;
```
Inside `_renderStatcastCard`, add a `_deltaRow(label, expected, actual, invert, unit, title)` helper that computes `delta = expected - actual`, applies threshold logic, returns the `.sc-row` HTML with no bar fill and appropriate color. `invert` flips the color semantics (used for pitchers where lower delta = better).

**What Kael needs to design.** The delta rows sit inside the existing `.sc-grid` layout. The delta value goes in the `.sc-val` slot. No new layout primitives are needed — the only visual question is whether the ± prefix color should be full-intensity (same as percentile colors) or slightly muted (e.g., 80% opacity) to visually distinguish delta rows from ranked rows. Kael should decide and add a CSS class or inline alpha if needed.

**Finn does not start until Kael adds their visual note below.**

---

#### Kael — Visual Spec (2026-06-08)

The existing percentile color scale (`#22c55e` → `#86efac` → `#fbbf24` → `#fb923c` → `#f87171`) is semantic: it maps percentile rank to a quality signal. Delta rows carry a different signal — they're directional (buy/sell), not ranked. Using the same greens/reds would visually merge the two systems and make the card harder to read at a glance.

**Decision: use full-intensity semantic colors but distinguish via opacity.** The delta value should render at `opacity: 0.80` on the color. This is light enough to read as a secondary signal relative to the ranked rows above it, but still clearly green or red when directional. Use `--color-win` (`var(--color-win)`) and `--color-loss` (`var(--color-loss)`) rather than the hardcoded hex used in `_pctColor` — these are the correct tokens for win/loss semantics in this design system.

**Delta row font weight: `500` (medium), not `600` (the `.sc-val` default).** Slightly lighter weight reinforces the visual hierarchy: ranked percentile rows are the primary signal, delta rows are the interpretive gloss. Do not add a new CSS class for this — apply `font-weight:500;opacity:0.80` as inline style on the value span inside `_deltaRow()` to avoid cascade complexity.

**No bar fill for delta rows.** The `.sc-bar-wrap` should still render (preserving grid column alignment) but with `width: 0` and no background color. Do not try to render a centered "deviation from zero" bar — the added complexity isn't worth the marginal information gain at this card width.

**Label style.** Delta row labels use the same `.sc-label` style as ranked rows. The `title` attribute specified by Vera provides the full explanation on hover — no additional label styling needed.

**Finn is clear to implement.** All three gates: Vera ✅, Kael ✅, Axiom n/a (no new architecture). Implement `_deltaRow()` and the `data` augmentation as Vera specified.

---

### [IMPLEMENTED] P8 — Pitch Movement Plot
**Contributor:** Relay | **Date:** 2026-06-08
**Shipped:** 2026-06-08 | `mlb.js` — `_buildMovementSVG()` + event delegation; `components.css` — `.arsenal-movement-plot`
**Specs:** Kael ✅ · Vera ✅ · Axiom ✅

We are one URL parameter change away from the data: add `pfx_x,pfx_z,release_extension` to the `selections` in `_fetchPitchArsenal`. The pitch movement plot (horizontal/vertical break scatter by pitch type, colored by `_PITCH_COLORS`) is Savant's most distinctive feature and the highest-visibility gap between SportStrata and Savant.

**Required before implementation:** Kael designs plot proportions, axis ranges, and dot sizing. Vera specs interaction states (hover tooltip with pitch type + velo + break values, empty state when no arsenal data). Axiom confirms SVG implementation approach. Finn does not start until all three specs exist here.

---

#### Kael — Visual Spec (2026-06-08)

**What we're building.** A pitch movement plot: a scatter showing average horizontal and vertical break per pitch type, one dot per pitch in the arsenal, colored by `_PITCH_COLORS`. This is the single visualization that most distinguishes Savant from every other free baseball tool.

**Data note (for Finn to verify first).** The current `_fetchPitchArsenal` URL has no `selections` filter, so the CSV likely already returns `pfx_x` and `pfx_z` as average break per pitch type. Verify by logging `Object.keys(rows[0])` in the console before building the renderer. If they're absent, add `&selections=pfx_x,pfx_z,release_extension,release_speed,release_spin_rate,pitch_name,pitch_type,pitches,ba` to the URL. Do not change the URL until you've confirmed the fields are missing.

**Plot dimensions.** `240×240px` viewBox, rendered as an inline `<svg>` inside the arsenal card, above the existing pitch table. The SVG uses `viewBox="-22 -22 44 44"` — this maps directly to the pfx coordinate space (inches of break, typically ±18 max) with 2in padding on each side. No separate scaling required.

**Coordinate mapping.** `cx = pfx_x` (positive = glove-side, negative = arm-side for RHP). `cy = -pfx_z` (negate because SVG Y increases downward; positive pfx_z = "rise" should map visually upward). This is the standard convention — do not flip it.

**Zero crosshairs.** Two dashed lines at `x=0` and `y=0`, `stroke: var(--border-mid)`, `stroke-dasharray: 2 2`, `stroke-width: 0.5`. These represent neutral movement. Label them with tiny text: "Arm" at the left edge of the x-axis, "Glove" at the right, "Rise" at the top of the y-axis, "Drop" at the bottom. Text size: `font-size: 2px` in SVG units (renders as ~11px in the 240px container). Color: `var(--text-muted)`.

**Dots.** One `<circle>` per pitch type:
- `r` = scaled by usage: `2.5 + (pct / 100) * 3.5` (ranges from 2.5 at 0% to 6.0 at 100%). This gives a visual weight hint without making low-usage pitches invisible.
- `fill` = `_PITCH_COLORS[pitch_type]` at full opacity.
- `stroke` = same color at 40% opacity (`color + '66'`), `stroke-width: 0.3`. Gives a subtle halo that helps readability when two dots overlap.

**Pitch type labels.** `<text>` element at `(cx + r + 0.5, cy + 0.8)` — offset right of the dot. `font-size: 2.2px`. `fill: var(--text-secondary)`. Content: `r.pitch_type` (the 2-letter code, e.g. "FF", "SL"). On mobile (≤768px), suppress labels — the dot tooltip alone is sufficient.

**Background.** `<rect>` filling the full viewBox, `fill: var(--bg-surface)`, `rx: 1`. The SVG should inherit the card background rather than rendering as transparent over white.

**Card placement.** The SVG renders at the top of the `#mlb-arsenal-card` section, above `.arsenal-list`. Wrap it in `<div class="arsenal-movement-plot">` with `display:flex; justify-content:center; padding-bottom:0.75rem`. No new CSS file needed — add the `.arsenal-movement-plot` rule to `components.css` with `display:flex; justify-content:center; padding-bottom:0.75rem`.

---

#### Vera — Interaction Spec (2026-06-08)

**Job to be done.** The pitcher detail user (broadcaster or analyst) wants to understand how a pitcher's arsenal plays — not just what they throw, but the physical reason why certain pitches are effective. A fastball that runs 10 inches arm-side paired with a slider that cuts 8 inches glove-side creates a visual tunnel effect. The movement plot makes this readable in two seconds.

**Hover state (desktop).** On `mouseover` of a pitch dot, show a floating tooltip:
```
Curveball (CU)
Break: 8.2" horizontal · −12.4" vertical
Velo: 82.1 mph · Spin: 2,411 rpm · Usage: 22%
```
Tooltip floats relative to the SVG container — `position: absolute` inside the `.arsenal-movement-plot` wrapper (which gets `position: relative`). Width: `160px`. `background: var(--bg-raised)`, `border: 1px solid var(--border-default)`, `border-radius: var(--radius-sm)`, `padding: 0.4rem 0.6rem`, `font-size: 0.75rem`. Dismiss on `mouseout`. No delay — instant show/hide.

Tooltip sign convention for the user: show "+" for arm-side (pfx_x > 0) and "−" for glove-side (pfx_x < 0). Show "+" for rise (pfx_z > 0) and "−" for drop (pfx_z < 0). Do not expose the raw coordinate system — use plain "horizontal"/"vertical" labels.

**Touch/mobile state.** On mobile (≤768px), dots are tappable — first tap shows tooltip, second tap dismisses. The SVG renders at `180×180px`. Pitch type text labels are suppressed on mobile (the usage table below provides identification). The tooltip positions above the dot to avoid being cut off at the bottom of the card.

**Empty state.** If `pfx_x` and `pfx_z` are null/absent for all pitch types in the arsenal, do not render the SVG at all — skip the `<div class="arsenal-movement-plot">` entirely. The existing usage table still renders normally. No "data unavailable" message in the plot area — absence is preferable to a broken-looking empty chart. Log a `Logger.debug` for observability.

**Loading state.** Arsenal data loads async — the card already has a skeleton state before `_fetchPitchArsenal` resolves. No new loading state needed for the plot specifically; it appears when `_renderPitchArsenal` is called, same as the table.

**Accessibility.** Each `<circle>` gets `role="img"` and `aria-label` with the full pitch description: `aria-label="Four-Seam Fastball: 8.2 inches horizontal, 12.4 inches vertical rise, 95.1 mph"`. The SVG element gets `role="img" aria-label="Pitch movement plot"`. Keyboard navigation is not required for this version — the data is also in the table below.

---

#### Axiom — Feasibility Note (2026-06-08)

Confirmed viable as inline SVG within `_renderPitchArsenal`. No canvas needed — the data is static aggregate values per pitch type (not a real-time or high-frequency plot), so SVG is the right choice. Canvas would only add complexity without benefit.

**Implementation path for Finn:**

1. Verify `pfx_x`/`pfx_z` are in `rows[0]` keys. If absent, add `&selections=...` to the URL in `_fetchPitchArsenal`.
2. In `_renderPitchArsenal`, add a `_buildMovementSVG(rows)` helper that: filters to rows with valid pfx values, builds the SVG string, returns empty string if no valid pfx data.
3. The SVG is a template literal — no DOM manipulation, just HTML string concatenation, consistent with the project's batch-DOM-write rule.
4. Tooltip is a `<div id="arsenal-mvmt-tooltip">` injected once into the page by `_renderPitchArsenal` (or reused if already present). Show/hide via `style.display`. Position by reading `getBoundingClientRect()` on the SVG container relative to its parent.
5. Event listeners go on the SVG element via event delegation: one `mouseover` on the `<svg>` checking `event.target.dataset.pitchType`, not one listener per circle. This is simpler and avoids listener accumulation on re-renders — call `StatsCharts.destroyAll()` equivalent: remove the SVG element from the DOM before re-injecting.

**CSS changes needed:** One new rule in `components.css`: `.arsenal-movement-plot { display:flex; justify-content:center; padding-bottom:0.75rem; position:relative; }`. All other visual properties are inline SVG attributes or inline styles on the tooltip — no cascade risk.

**Render order:** `_buildMovementSVG(rows)` result + `
` + existing `<div class="arsenal-list">` HTML. Movement plot is above the table.

**Finn is clear to implement.** Gates: Kael ✅ · Vera ✅ · Axiom ✅.

**SHIPPED** (verified in code 2026-06-09, Folio): `_buildMovementSVG` at `mlb.js:699`, wired into `_renderPitchArsenal`, delegated tooltip handlers live, `.arsenal-movement-plot` CSS in components.css. Entry was stale — implementation landed with the 2026-06-09 beta-hardening commit.


---

### [PHASE 1 SHIPPED 2026-06-09] P9 — Spray Chart Migration to Savant statcast_search
**Contributor:** Relay | **Date:** 2026-06-08
**Updated:** 2026-06-08 — D-001 is complete. Unblocked. Awaiting Relay coordinate field verification + Kael EV color spec + Vera toggle spec.

Current `fetchSprayChartData` makes up to 21 API calls (game log + up to 20 play-by-play fetches) to reconstruct spray coordinates. Savant's `statcast_search/csv?type=batter` returns all batted balls with real EV, LA, and `hc_x/hc_y` in a single call. Migration reduces request cost by ~20× and unlocks exit-velocity–colored spray dots (EV as dot color intensity). Phase 1: swap coordinate source. Phase 2: EV-colored dot toggle.

**Required before implementation:** Relay to verify Savant batter CSV coordinate field names (`hc_x`, `hc_y`) against live response. Kael designs EV color scale. Vera specs toggle interaction (outcome-coded vs EV-coded view). Finn does not start until all three specs exist here.

---

### [PARKED — NEEDS SPEC] P10 — OAA (Outs Above Average) Leaderboard Section
**Contributor:** Relay | **Date:** 2026-06-08
**Updated:** 2026-06-08 — D-001 is complete. Unblocked. Awaiting Vera section spec + Kael visual spec + Axiom AppState confirmation.

Savant exposes OAA via `/leaderboard/outs-above-average?csv=true`. SportStrata has no fielding analytics beyond MLB Stats API fielding% and range factor — neither is useful in broadcast context. OAA is the standard broadcast fielding reference. Fetch, parse, store in `AppState.mlbSavantOAALeaderboard`. Add a section to the leaders view below pitcher Statcast.

**Required before implementation:** Vera specs the section (position filter? separate batter/pitcher sections?). Kael adds OAA to the visual leaderboard system. Axiom confirms AppState field addition doesn't need a DECISIONS.md entry. Finn does not start until all three specs exist here.

---

### [CLOSED — NOT VIABLE, Relay verification 2026-06-09] P6 — H2H Fetch Scope Reduction (group_by=name)
**Contributor:** Relay | **Date:** 2026-06-08

`_fetchMLBH2H` fetches 5 years of pitch-level rows and manually aggregates event outcomes client-side. Adding `group_by=name` to the Savant URL should return one pre-aggregated row per batter-pitcher pair, cutting payload by 100–1000×. The open question is whether grouped mode includes event-outcome columns (`ba`, `ab`, `h`, `hr`) or only Statcast aggregate metrics (EV averages). Only the former is a valid drop-in replacement.

**Verification attempt 2026-06-09 (Relay):** Savant fetches time out or return empty from the audit environment (egress restrictions) — same class of failure as the 2026-06-08 attempt. P6/P9/P10 remain parked on the manual browser step. Do not implement against guessed column names.

**Verification attempt 2026-06-08:** Fetched `statcast_search/csv?...&group_by=name` from dev environment. Savant returned `Content-Type: application/download` — tooling rendered binary, column names not inspectable. **Manual step required:** open the URL in a browser, inspect the CSV header row, and document the confirmed field mapping here before Finn implements.

---

## D-031 Phase 1 — Accounts foundation (GATED — specs before code)

**Scope:** accounts + followed teams/players + synced preferences. No payments, no gated features, no notifications (freemium + monetization come in a later phase). Auth is **optional and non-blocking** — the no-login experience must not regress.

**Gate 0 — Secrets hygiene:** P1-006 already resolved (`api.js` key removed, proxy set). All auth/provider/session secrets via `wrangler secret`, never committed. ✅ verified / carry forward.

**Gates (all required before implementation):**
- **A-031 Cipher (security):** threat model; sessions = HttpOnly/Secure/SameSite cookies backed by D1; CSRF tokens; auth-endpoint rate limiting; passkey/OAuth approach; secret management. — **DRAFTED** (docs/auth-security-spec.md; pending team review).
- **A-031 Relay (data):** D1 schema (`users`, `sessions`, `follows`, `prefs`); data export + hard-delete; retention policy. — **DRAFTED** (docs/auth-data-schema.md; pending team review).
- **A-031 Axiom (feasibility):** better-auth on Workers/D1 spike (per-request instantiation; evaluate session-refresh bug #4203) vs `workers-oauth-provider`/`jose`; Functions npm-dependency + build-step impact; session middleware. — **DRAFTED** (docs/auth-feasibility-spike.md; pending team review).
- **A-031 Vera (UX):** optional sign-in flow; states (signed-out, signing-in, signed-in, error, account mgmt); follows UI; account menu. — **DRAFTED** (docs/auth-ux-visual-spec.md; pending review).
- **A-031 Kael (visual):** on-brand sign-in surface + account menu in header. — **DRAFTED** (docs/auth-ux-visual-spec.md; pending review).
- **A-031 Folio (legal):** privacy policy, terms, cookie consent, GDPR/CCPA data-rights copy. — **DRAFTED** (docs/auth-legal-checklist.md; pending review).

**Finn:** implements Phase 1 only once all gates above are signed off. Then a full `/security-review` before launch.

---

### Wave 1 accuracy + hardening (2026-07-01) — SHIPPED (pending push)
Deep-review initiatives 2+3 (D-032, D-033). Lightweight process per owner.

- **wRC+ stale-constants bug fixed:** 2026 was silently computed with 2024 guts constants. `_ensureWrcConstants(season)` now derives lgwOBA/lgR-PA from MLB Stats API league totals for any season without a static entry (DAILY cache, † dagger via `_wrcDagger()`). Awaited in `fetchMLBLeagueStats`, warmed at boot + on season change.
- **FIP IP-thirds fixed:** `_computePitchingRates` used `parseFloat("100.2")` = 100.2 instead of 100⅔ — now `_mlbIpToNum()`.
- **First test suite:** `tests/stats.test.js` (`node --test tests/`, zero deps, vm-sandboxed mlb.js). 7 tests, hand-verified fixtures. Added to pre-push checklist.
- **/api/* rate limiting:** `functions/api/_middleware.js` (120/min/IP best-effort, 429 + Retry-After). Owner dashboard WAF rule pending — steps in `docs/ops-rate-limiting.md`.
- SW v46 → v47 (mlb.js changed).

**Verification:** node --check clean on mlb.js + middleware; 7/7 tests pass; NUL checks clean. Live verify after push: wRC+ values on player detail should show † and shift slightly (they were computed against the 2024 run environment before).

### P2 — Park factors refresh (2026 season) — ✅ SHIPPED 2026-07-31 (Relay)
`_PARK_FACTORS` in `js/mlb.js` was still the 2022–2024 average. Refreshed via `WebSearch` + `web_fetch` against RotoWire's "The Z Files: 2026 MLB Park Factors" (same rolling 3-year methodology B-Ref uses; B-Ref's own park-adjustment pages aren't fetchable/parseable in this environment, so RotoWire's published table stood in as the source). All 30 team IDs updated to the R (runs) column, 2023–2025 window. Three teams keep a non-standard window because the source itself uses one, not by inheritance: Athletics/Sutter Health Park (2025 only — first year at that park, no history to average), Orioles/Camden Yards (2024–2025 only — the 2024 wall renovation reset the average), Rays/Tropicana Field (2022–2024 — 2025 home games were relocated after hurricane roof damage, so that year isn't representative of the actual venue). Verified: `node --check` clean, all 30 team IDs present with no duplicates (scripted check), values cross-referenced against the source table by hand. GOALS.md annual-maintenance note updated; next refresh due April 2027.

### Constitution v2 (2026-07-01) — SHIPPED (pending push)
D-034: GOALS.md v2 (barbell identity + no-login constitutional rule, R1–R5 retired), CLAUDE.md truth-audit (P1-006 section, script chain, doc-sync rule, tests in checklist), `docs/archive/` pruning (fixit/suggestions/reflection).

### Draft HQ consolidation (2026-07-01) — SHIPPED (pending push)
D-035. Fantasy dropdown: 5 sibling views → **Draft HQ + Mock Draft**; shared `.hq-strip` tab bar rendered by each member view (Value Board · Rankings · Schedule · Trending · Mock Draft). Old routes unchanged = deep links safe. Latent trending-breadcrumb bug fixed (`nfl-leaders` → `nfl-trending`). Strip print-hidden (Draft Kit cheat sheet unaffected). SW v48.
**Live verify after push:** all five views show the strip with correct active pill; Fantasy parent stays lit across member views; mobile menu shows 2 fantasy tiles; mock draft strip disappears once a draft starts.

### Rookie-inclusive value board (2026-07-01) — SHIPPED (pending checks + push)
D-036. Players with ADP but no production join (the whole 2026 rookie class) now get a **market-implied projection** (`_vbdImplied`: up to 3 production-projected ADP neighbors per side at the position, inverse-distance weighted) and appear ON the value board and in the Draft Assistant — tagged `est`/`~`/muted everywhere, half-weight in assistant scoring, excluded from Sleepers/Traps (circular). Positions with <4 matched players stay unvalued. Tests: `tests/vbd.test.js`. SW v49.
**Verified 2026-07-01:** `node --check` clean, 12/12 tests pass. Live-verify after push: Draft Kit shows rookies with `est` chips in the board (not just the afterlist), mock draft VORP column shows `~` values for rookies, assistant can recommend a rookie with "(market est)" reasoning.

### /deploy-check hardening + SW precache drift fix (2026-07-01) — SHIPPED (pending push)
D-037. New `tools/` checkers (manifest sync, theme contrast contract, live join-health) + deploy-check steps 9–13 (tests, manifest, themes, NUL scan, join probe). **Bug fixed:** `js/fantasy.js` + `js/sos.js` were never added to `sw.js` STATIC_ASSETS — found by the manifest checker on its first run. Post-push: run `node tools/join-health.cjs https://sportstrata.cc` for the first live join-rate baseline and record it here.

---

## D-038 audit findings (2026-07-02) — OPEN until fixed; evidence in docs/archive/design-review-2026-07-02.md

### P1 — Leaders → player detail "Player not found" (V1) — FIXED 2026-07-02 (Wave A)
Click path resolves via `AppState.mlbPlayers` (empty unless Players view visited); cold deep-link path fetches directly and works. Fix: `showMLBPlayerDetail` falls back to the deep-link resolution on pool miss; also write the player hash on this path (hash stayed `#mlb-leaders`). Verified live: `currentView: mlb-player-665742`, `hash: #mlb-leaders`, `hittingPool: 0`, `leaderSplits: 600`.

### P1 — No hashchange routing (V2) — FIXED 2026-07-02 (Wave A: popstate null-state now routes through _loadFromHash — address-bar hash edits fire popstate, so no separate hashchange listener needed)
Hash edits on a live page don't remap the view; cross-sport hash jumps create chimera states (NFL ticker + MLB content + ~340px column). Add a `hashchange` listener routing through `_loadFromHash` logic, sport-aware.

### P2 — View-meta labels missing for NFL fantasy routes (K1) — FIXED 2026-07-02 (Wave A: _NAV_META entries added; Draft HQ-prefixed labels)
`nfl-draftkit` / `nfl-mock` render raw route ids as the visible view header on cold load.

### P2 — Leaders By-Position SP/RP/CL panels empty mid-season (V4) — FIXED 2026-07-02 (Wave A: root cause — Stats API reports all pitchers as position "P"; panels now classify by role stats (GS ratio → SP, saves ≥3 → CL, else RP) with IP-thirds min. Empty state names the threshold)
All three pitching boxes "No data" on Jul 2 with 600 pitching splits loaded — trace qualification/field path; empty state needs contextual copy either way.

### P2 — "Storage Disabled" toast false positive (V3) — FIXED 2026-07-02 (Wave A: root cause — quota exhaustion, not disabled storage. Now evicts zs_* once and retries; toast only if retry fails, honest copy "Caching off")
Fired while localStorage tested writable. Trace trigger (IndexedDB conflation? init race); copy must state only what's actually degraded.

### P2 — D-036 guards (Relay) — FIXED 2026-07-02 (Wave A: team-less veterans excluded from implied pricing; sleeper/trap gaps ranked within the ≤180-ADP pool ("Val #N of M"); dk-board overflow-x + min-width:0 on the name cell — the grid-blowout culprit)
(a) exclude team-less veterans from implied pricing (Gurley FA #31 est); (b) trap-gap computed within ADP-comparable pool or reframed ("market #99 · model #501"); (c) `.dk-board` horizontal overflow below ~1150px.

### P3 — Border=identity / badge=state rule (K2) — FIXED 2026-07-02 (Wave B: live border overrides removed from .home-game-card--live and NFL .game-card--live; state = badge pulse + --shadow-live glow only. MLB scores-view cards were already compliant — no live border class)
Amber live-border indistinguishable from Pirates team border. Kael spec: card borders always team color; liveness lives only in the badge (pulse retained).

### P3 — Home search duplication (V5) — FIXED 2026-07-02 (Wave B: renderCurrentView toggles body.view-home; header .search-global-btn hidden on home only. ⌘K unaffected)
Hero search + header search stacked ~100px apart on home. Spec: hero is primary on home; header search hidden on home only.

### P3 — Theme contract tightening (Kael verdict) — CONTRACT TIGHTENED 2026-08-02; new finding needs Kael's color call
**cc-braves itself is moot** — it was retired entirely in D-047 (2026-07-12, brand-cohesion prune); the live theme set is now just dark (`:root`), light, and `nl-monarchs` (`css/themes-retired/README.md`). The underlying contract gap this item was really about is evergreen, though, so it's still worth closing rather than filing as N/A.

**Shipped:** `tools/check-themes.cjs`'s `PAIRS` array gained 3 composed-surface pairs, each grounded in real usage (grep-confirmed against `components.css`), not hypothetical: `--accent` on `--accent-subtle` (the `.btn-secondary`/badge/pill pattern — a text token checked only against `--bg-base` before, never against the tinted background it actually sits on in real UI), `--text-muted` on `--bg-surface` (muted captions on surface-level panels), `--text-primary` on `--bg-interactive` (nav/tab/list-row text on hover/active backgrounds).

**Real finding from the tightened contract:** `--accent` on `--accent-subtle` comes back **WARN** (not ERROR) for `light` (2.98, min 3.0) and `nl-monarchs` (2.88, min 3.0) — the root/dark theme is clean. This is a genuine near-miss on the badge/pill pattern in two of the three live themes, exactly the class of issue the old contract couldn't see. **Not fixed here** — choosing a new accent or accent-subtle value is Kael's call (visual system/tokens is Kael's R/A domain per the team RACI, not Axiom's), and a value change ripples through every badge/pill/button using that pair. Flagging for Kael's review rather than picking a color unilaterally.

**Still owed:** the per-theme manual pass against a fixed checklist (game card, starters row, leaders panel, detail chips) — the automated contract catches contrast math, not composition/spacing/vibe, so a human pass is still the real acceptance test for "wash-out."

### Wave A live verification (2026-07-02) — PASSED
Vera checklist run on sportstrata.cc post-deploy (SW v50): V1 cold Leaders entry → Schwarber row click → full player page, hash `#mlb-player-656941-hitting` (was: "Player not found" + stale hash). V2 `location.hash = '#nfl-draftkit'` from an MLB player page → clean full sport switch, no chimera. V4 SP/RP/CL panels populated with role-classified pitchers (Misiorowski/Minter/Suarez lead). K1 title "Draft HQ · Value Board". A4: Gurley absent from valued board (`_dkBuild` check), trap chips bounded ("Val #104 of 154"). V3: no false toast across the session. All six fixes confirmed.

### Wave B live verification (2026-07-02) — PASSED
K2: live LAD–SD card border-left = rgb(0,90,156) (Dodger blue, its own --hgc-team-color) + amber --shadow-live glow; badge pulse intact. Team borders everywhere else (PIT gold reads as identity, unambiguous). V5: body.view-home set, header .search-global-btn display:none on home, present elsewhere; hero search primary. D-038 now 8/9 closed — Track C (theme contract tightening + inline-style→class migration with CSP nonce) remains, plus the owed mobile audit.

---

## D-043 — Home hub follow-on (3 keepers) — GATED task entry (specs in DECISIONS.md D-043, implementation on owner ratification)

Three independent sub-items from the 2026-07-06 homepage critique that survived review (the rest was rejected for fighting the barbell — see D-043 trigger). Each ships behind its own gates; sequencing 3c → 3b → 3a per the decision. Finn does not start any sub-item until its gates are ratified.

### 3a — Tabbed home scoreboard `[All | MLB | NFL | NCAAF]`
- **Vera ✅ DRAFTED** — default All; league glyph per game; per-sport offseason empty state; remember tab within session.
- **Kael ✅ DRAFTED** — reuse `.standings-tabs`; muted league glyph (not a badge); football games show broadcast network as `--text-muted` caption.
- **Relay ⚠ CONTRACT PENDING VERIFY** — ESPN `competitions[].broadcasts`/`geoBroadcasts`; MLB schedule needs `hydrate=broadcasts`. Exact field shapes unverified live (web_fetch down at spec) — confirm before build, degrade to no-network if absent.
- **Axiom ✅ DRAFTED** — unified game-card (or per-sport renderers into `#homeTodayGrid`); **lazy per-tab fetch** (don't fetch dormant football on July load); payoff is seasonal (Sept–Oct overlap).

### 3b — Seasonal promo slot
- **Vera ✅ DRAFTED** — one calendar-driven promo, always a real destination (summer → Draft Kit; fall → NFL/NCAAF; Oct → October Odds).
- **Kael ✅ DRAFTED** — full-width band beneath the sport-picker band; brand-accent, one CTA, no carousel.
- **Axiom ✅ DRAFTED** — `PROMO_MOMENTS` config off the season models (generalized seasonal-hero pattern). **Scope caveat:** no "CFP Predictor" exists — fall NCAAF promo routes to Rankings/Scores.

### 3c — Cross-sport ⌘K search with sport badges
- **Vera ✅ DRAFTED** — results grouped by sport + badges; sport-aware placeholder stays (additive, not replacement).
- **Axiom ✅ DRAFTED** — `initGlobalSearch` already spans NBA/MLB/NFL pools; gaps = lazy-load other sports' pools on first cross-sport query, add badges/grouping, add NCAAF teams.
- **Relay ✅ HARD LIMIT** — NCAAF has no player data (D-042 deferred): cross-sport = MLB/NFL players + MLB/NFL/NCAAF teams only; UI must not imply NCAAF players exist.

**Status:** all gates DRAFTED, pending owner ratification of D-043. No implementation started.

---

## Archived — shipped / historical (moved 2026-07-26)

To keep this backlog focused on **open** work, the following shipped/historical sections were moved to [`docs/archive/ISSUES-shipped.md`](docs/archive/ISSUES-shipped.md):

- P3-027 — Shareable Stat Cards (R5 Phase 1) — Three Gates
- Scorecard Feature — Phased Implementation Roadmap
- Live Game Expanded View — Phased Implementation Roadmap
- P3-028 — Player Detail Percentile Stat Profile — Three Gates
- Ask Bar v1 (D-039 Track 1) — GATED task entry — specs below, implementation on owner ratification
- October Odds (D-039 Track 2c) — GATED task entry — ratified 2026-07-02
- SESSION HANDOFF — 2026-07-05 (clean shutdown, full state)
- D-042 — NCAAF + sport-agnostic front door — GATED task entry (specs below, implementation on owner ratification)
- D-044 — Cross-sport frame parity (player + team detail + chrome) — GATED, phased (specs in DECISIONS.md D-044)
- D-045 — Path-URL SEO foundation + per-sport landing pages — GATED, phased (specs in DECISIONS.md D-045)
- D-046 — Homepage overhaul (analytics-first landing) — GATED, phased (specs in DECISIONS.md D-046 + docs/landing-page-gap-analysis.md)

---

## Finn — Project Status Check + Fresh Health Scan (2026-07-31)
**Contributor:** Finn | **Date:** 2026-07-31

**What I did:** owner asked for a full-team debug + expansion-brainstorm pass. Before touching anything I read DECISIONS.md, ISSUES.md, GOALS.md per the standing session-start sequence, then ran a fresh scan for anything not already logged.

**Open backlog snapshot (nothing new here, just surfaced for the session):**
- D-038 "Theme contract tightening" (line ~1327) — still OPEN.
- D-041/D-045 SEO — P3 (Search Console verify/submit + measure) still owner-run, not done.
- D-047 brand cohesion — **[CORRECTED 2026-07-31, see DECISIONS.md]** this line was stale — S2 (foundation + 4 consumers), S3a, S3c, S4 were already shipped, not pending. Actual remainder: S2's NHL/NBA tickers + NFL/NCAAF scores-grid consumers, S6 (measure & lock). S5 shipped same day this was corrected.
- D-048 brand redesign — **[CORRECTED 2026-07-31, see DECISIONS.md]** this line was stale — all 7 phases were already shipped (through 2026-07-26), not just Phase 1. D-048 is complete, nothing open.
- D-043 (tabbed scoreboard / seasonal promo / cross-sport search) — all three gated, still awaiting owner ratification, nothing built.
- N-13 (NGS lags at 2023) — still open; Relay never confirmed whether newer nflverse NGS exists under another path.
- N-5 phases 3–4 (NFL standings-card + table-chrome inline-style cleanup) — still pending.
- Park factors (`_PARK_FACTORS` in mlb.js) — still the 2022–2024 B-Ref average; the GOALS.md annual-maintenance note calls for an each-April refresh and it's now end of July with no pull done this year. **[SUPERSEDED same day — see P2 below, shipped later on 2026-07-31: this note was written before that refresh landed and was never removed. Confirmed stale by Finn 2026-08-02 by reading current `js/mlb.js` — the table is on the 2023–2025 window today, not 2022–2024.]**

**Fresh finding (not previously logged at this scope):** grepped for `catch (_) {}` across `js/` — **42 instances across 11 files**, not just the 5 in `nfl.js` that N-1's secondary finding (2026-06-21) flagged and left open. Sampled all of them. About 32 are `localStorage`/`Date` formatting guards — defensible, not real error-swallowing (a private-browsing quota failure on a favorites-star write isn't worth a Logger line). But roughly 10 are silent swallows of actual network/data fetches, meaning a real failure produces no console trace and no user-visible signal — just a quietly empty section:
- `js/nfl.js:821` — `fetchNFLSleeperPool()`
- `js/nfl.js:1217` — `fetchNFLScoreboard()`
- `js/nfl.js:1587` — profile/career fetch (part of the "5 more" N-1 flagged and never closed)
- `js/ncaaf.js:524–526` — **three** in the same team-detail path (roster, schedule, team stats) — if any of the three ESPN calls fail, that part of the NCAAF team page just renders empty with zero diagnostic trail
- `js/search.js:325` — NFL cross-search fetch
- `js/app.js:1486` — a stats fetch

This is the same anti-pattern N-1 caught in `nfl.js` and left as a named-but-unfixed secondary finding. It has since spread to `ncaaf.js` (built after N-1) and `search.js`/`app.js`, and nobody re-flagged it. Routing to Axiom.

**Escalation:** none blocking. Recommend Axiom scope this as N-14 below rather than let it sit as an unowned secondary finding a second time.

---

## N-14 — Silent network-fetch swallows beyond nfl.js (Logger-suppression gap, N-1 follow-through)
**Contributors:** Finn (finding), Axiom (diagnosis) | **Date:** 2026-07-31 | **Priority:** 3

**Axiom's read:** this is mechanical, not architectural — identical fix shape to N-1 (`_nflStatsUnavailable`-style placeholder + `Logger.warn(err, 'NFL'|'NCAAF'|'SEARCH'|'APP')` on each swallow, nothing else touched). No AppState risk, no load-order risk. The `catch (_) {}` around `localStorage`/date-formatting calls should stay as-is — logging every quota-exceeded favorites write would just be noise, and Finn's rule ("never suppress *a real error*") is about hiding failures that matter, not defensive one-liners around browser storage.

**Scope for Finn once gated:** the ~10 network-fetch swallows Finn listed above, one Logger.warn each, same pattern as N-1's implementation. Bundle with N-5 phases 3–4 as one "finish what we started" cleanup pass rather than opening a third parallel NFL/NCAAF workstream — both are debt from features that shipped fast and never got their follow-up commit.

**Gate status:** no visual or interaction spec needed (this is pure observability, not user-facing behavior change) — Axiom's sign-off above is sufficient per the "mechanical fix" carve-out the team has used before (e.g. N-9/N-10 token fixes). **Finn is clear to implement whenever a verification-capable session picks this up** (needs console verification per Finn's own standing rules — confirm a forced-failure case actually logs, not just that the code compiles).

**✅ SHIPPED 2026-07-31 (Finn):** all ~10 swallows fixed, plus one Finn's original scan missed — `arcade.js:396` (daily-puzzle game-performance fetch inside a `Promise.all` map, same silent-degradation shape, now tagged `'ARCADE'`, a module tag that didn't exist before this fix). Final list: `nfl.js` — Sleeper pool fetch on leaders load, scoreboard fetch in team detail, ESPN profile/career fetch on player detail (this last one is the original N-1 "5 more" finding, now finally closed); `ncaaf.js` — roster/schedule/team-stats fetches in team detail (3, one function); `search.js` — NFL all-time search; `app.js` — football landing stats teaser; `arcade.js` — game-performance fetch. Each now does `catch (err) { Logger.warn(msg, err, 'TAG') }` instead of `catch (_) {}` — behavior unchanged (failures still degrade the same way), only the diagnostic trail is new. **Verified:** `node --check` clean on all 5 touched files; full unit suite 37/37 green (no coverage overlap with these files, but confirms nothing else regressed). **Live-verified 2026-08-02 (Finn):** forced a real failure against production (`sportstrata.cc`), not a guess from reading the code. Overrode `window.fetch` in a live tab to reject any request whose URL contains `scoreboard`, cleared `ApiCache` so the swallow couldn't be masked by a cache hit, then navigated to `#nfl-team-SF`. The real browser console showed the exact line the fix writes: `WARN [NFL] | Scoreboard fetch failed in team detail | FORCED_TEST_FAILURE_scoreboard` — confirms `Logger.warn` correctly reaches `console.warn` end to end (traced `errorHandler.js`'s `#write`: it reads `console.warn` fresh on each call rather than caching a stale reference at module load, so the override took effect) and the page didn't crash or blank out, it just degraded quietly with a diagnostic trail, exactly as designed. Two other candidate test points (`Sleeper pool fetch failed on leaders load`, `nfl-leaders`) turned out to be unreachable today for reasons unrelated to the fix itself: the leaders page short-circuits to an empty state before ever calling `fetchNFLSleeperPool()` because it's currently NFL draft season with no `data.categories` yet, and a naive first attempt was silently absorbed by `ApiCache` returning a cached response instead of hitting the network. Neither is a defect in N-14 — both are artifacts of testing conditions, resolved by picking a reachable code path and clearing cache first. Given the one forced test round-tripped correctly and all ~10 fixes share the identical `catch (err) { Logger.warn(msg, err, 'TAG') }` shape, this is treated as sufficient confidence to close N-14 rather than repeating the same mechanical proof nine more times.

---

## Cipher — Security Sweep (2026-07-31)
**Contributor:** Cipher | **Date:** 2026-07-31

Asset inventory unchanged since the last review: BDL_API_KEY (proxied, P1-006 stays resolved — confirmed `js/api.js` still carries no live key), no PII, no accounts, no payments.

**Checked fresh this session:**
- CSP `<meta>` in `index.html` and `_headers` — **byte-identical**, both list the same seven allowlisted hosts (workers.dev proxy ×2, BDL, ESPN, NBA.com, MLB Stats API, Savant, NHL, Open-Meteo). No divergence. Clean.
- No inline `onerror=` attributes introduced anywhere in `js/` (the one `config.js` hit is the capture-phase listener itself, the correct pattern — not a violation).
- No new `innerHTML +=` usages.
- No secrets, tokens, or keys found in any grep of `js/` or the diff currently sitting uncommitted in the working tree.

**Verdict:** no new findings. Existing controls hold. Nothing here blocks the expansion brainstorm below.

---

## Relay — Data Sweep (2026-07-31)
**Contributor:** Relay | **Date:** 2026-07-31

- Park factors (see Finn's note above) — flagging again with a sharper edge: this is now a **data-accuracy** issue, not just a maintenance checkbox. `_PARK_FACTORS` reflects 2022–2024 and the comment still says "Season: 2024." Every hitter/pitcher park-adjusted stat on the site has been quietly wrong-by-inheritance for the length of a full season now. Recommend the owner do the manual B-Ref/FanGraphs pull this belongs to before end of season, not next spring. **[SUPERSEDED same day — this pull happened later on 2026-07-31, see P2 below. Confirmed stale by Finn 2026-08-02 against current `js/mlb.js` (2023–2025 window, exceptions documented, next refresh due April 2027).]**
- N-13 (NGS lag) — still unresolved whether 2024+ Next Gen Stats exist under a different nflverse release path. Nobody has been able to verify (`web_fetch` can't read the binary `.csv.gz`, curl restricted in this environment either). Needs an owner-run manual check outside the sandbox, same class of blocker as the Savant `group_by=name` verification (P6/P9/P10) — flagging so it doesn't get silently re-forgotten a third time.
- No new schema-drift or rate-limit issues found in this pass — MLB/NFL/NCAAF fetch contracts unchanged since the last audit.

---

## Mock Draft — UX/interaction audit + fixes (2026-07-31)
**Contributors:** Vera (audit + spec), Kael (visual, light), Axiom (feasibility) | **Date:** 2026-07-31

**Vera's audit (walked the actual draft flow in `js/fantasy.js`, not a guess):** three real findings, prioritized by how much they hurt the core loop.

**1. AI picks between your turns are invisible — the draft has no "live" feeling.** `_mdAdvance()` (fantasy.js:268) is a synchronous `while` loop: every AI team's pick between your turns resolves with zero delay, zero animation, zero acknowledgment. In a 12-team draft, that's up to 22 picks vanishing between two clicks — you draft a player, and the screen just jumps to your next turn with a completely different board. The only way to see what happened is to manually flip to the Board tab and compare against memory. For a product whose whole pitch is "a live Draft Assistant" (the setup screen's own subhead), this is the single biggest gap between what it claims to be and what it feels like using it. This isn't a speed problem to fix with a delay (nobody wants to sit through 22 fake picks) — it's a **missing recap**, the same instinct behind the "receipts" pattern this codebase already uses everywhere else for provenance.

**2. Draft board cells identify players by last name only, with no way to confirm who it is.** `_mdBoardHtml()` (fantasy.js:468) truncates to `name.split(' ').slice(-1)[0]` with no tooltip, no full name anywhere on the cell. Common surnames (Williams, Jones, Allen — several active NFL players share these) are genuinely ambiguous on the board with no way to disambiguate short of leaving the view.

**3. Mobile player rows are overloaded — 7 data points in one 0.7–0.85rem-tall flex row.** `.md-row` (main.css:3798) packs position badge, name, team, tier/cliff badge, VORP, ADP, and survival% into one row with no mobile-specific simplification (the only mobile rule at 760px, main.css:3853, stacks the roster panel above the list — it doesn't touch row density). Name is already `text-overflow: ellipsis` at desktop widths; at a 360–390px viewport with six sibling columns eating the row first, name truncation gets materially worse right when mobile drafting is exactly the situation Vera's own standing rule ("consider mobile... even on desktop-primary products") exists for.

**Vera's spec:**
- **Recap strip:** after `_mdAdvance()` returns control to the user (i.e., every time `_mdRenderDraft()` runs following one or more AI picks), show a dismissible strip above the recommended-pick banner: "Since your last pick" + a compact list of what each AI team took (round · team · pos · name), newest first. Not a modal, not blocking — a scannable strip the user can glance at or ignore. On your very first pick of the draft (nothing to recap), it doesn't render — no empty state needed, just absence, consistent with the arsenal-plot precedent ("absence is preferable to a broken-looking empty state").
- **Board tooltip:** `title` attribute with the full name on every filled `.md-bd-cell`. Native tooltip, no new component, works identically on desktop hover and (via long-press) mobile.
- **Mobile row simplification:** below 760px, drop the ADP and tier/cliff badge from `.md-row` — keep position, name, team, VORP, and survival%, the five fields that actually drive a pick decision mid-draft. ADP and tier are still fully available in the Board view and aren't lost, just decluttered from the fast-scan list on small screens.
- **States:** recap strip needs no loading/error state (it's derived from data already in memory, synchronous). No accessibility regression — the strip is inert text, the tooltip is a native browser affordance, and the mobile column drop doesn't remove any interactive element, only display columns.

**Kael (visual, light sign-off):** none of this needs new visual language — the recap strip reuses the existing `.md-note`/card token vocabulary (`--bg-card`, `--border-default`, `--text-muted`), sized like a compact version of the existing recommended-pick banner but visually subordinate to it (no `--accent` border, this isn't the primary CTA). Tooltip is browser-native, no styling needed. Mobile column drop is a pure `display:none` media-query addition, no new tokens.

**Axiom (feasibility):** all three are additive and contained to `js/fantasy.js` + `css/main.css`, no AppState/architecture touch. Recap needs one new field on `_md` (a marker of `_md.picks.length` at the start of each user turn) and a small diff computed at render time — no new state shape, no persistence. No new fetches, no new CSP surface, no new files (manifest checker unaffected).

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. **Finn implementing this session.**

**✅ SHIPPED 2026-07-31 (Finn):**
- **Recap strip:** `_md.userTurnMark` tracks picks-count at the moment your own pick lands (set in `_mdUserDraft`, right before `_mdAdvance()` runs the AI picks); `_mdRenderDraft` slices `_md.picks` from that mark to build a "Since your last pick" strip (newest first, pos + name + team/round), rendered above the recommended-pick banner. Correctly renders on your very first turn too if you're not drafting 1st overall (shows the picks that happened before you) — a strictly better behavior than the original "never on turn 1" spec, so keeping it.
- **Board tooltip:** filled `.md-bd-cell` divs now carry `title="{full escaped name}"` — hover on desktop, long-press on mobile, disambiguates the last-name-only board display.
- **Mobile row density:** `.md-row-adp`, `.md-cliff`, `.md-tier` now `display:none` inside the existing 760px breakpoint — both values remain fully visible in the Board view, nothing interactive was removed.
- **CSS:** `.md-recap`/`.md-recap-title`/`.md-recap-list`/`.md-recap-item`/`.md-recap-team` added to `main.css`, token-only (`--bg-card`, `--border-default`, `--text-subtle/secondary`), no new component.

**Verified:** `node --check` clean on `fantasy.js`; `main.css` brace-balanced; `check-manifest.cjs` and `check-themes.cjs --strict` both green (0/0 across all 3 kept themes); full unit suite 37/37 (no direct coverage on the draft engine, confirms nothing else regressed). Logic traced by hand against the snake-draft sequencing (`_mdSnakeTeam`) rather than guessed.

**Live-verified 2026-08-02 (Finn):** ran a real draft against production (`sportstrata.cc/#nfl-mock`, 12 teams, pick 6), not a code read. **Recap strip:** confirmed both spec'd behaviors — on the very first turn (nothing to recap in the strict sense, since I don't pick 1st overall) it correctly showed the 5 picks that happened before my turn (Drake Maye, Ja'Marr Chase, Jahmyr Gibbs, Bijan Robinson, Josh Allen), matching the documented "strictly better than the original spec" behavior; after drafting Christian McCaffrey and letting the snake advance through picks 7–18, the strip correctly re-rendered with exactly those 12 AI picks, newest-first. **Board tooltip:** switched to the Board tab, inspected the DOM directly rather than trusting a hover screenshot — `document.querySelector('.md-bd-cell')` for the Josh Allen pick returns `title="Josh Allen"`, confirming the full name is there even though the cell text is truncated to "Allen". **Mobile row density:** `resize_window` didn't actually change this session's real desktop browser viewport (stayed 1568px regardless), so a literal 375px screenshot wasn't possible from this session — instead fetched the live `/css/main.css` directly and confirmed the exact rule is deployed: `@media (max-width: 760px) { ... .md-row-adp, .md-cliff, .md-tier { display: none } ... }`, correctly scoped to only those three columns, matching Vera's spec verbatim. All three fixes confirmed live and working as designed.

---

## D-047 S5 — Dark-logo treatment + N-15 — `getMLBTeamLogoById` never existed (live no-logo bug)
**Contributors:** Kael (S5 spec, pre-existing per D-047 phasing), Axiom (N-15 finding + fix), Finn (implementation) | **Date:** 2026-07-31 | **N-15 Priority:** 2

**Context:** owner asked the team what should ship next; after a stale-docs correction (D-048 was fully shipped, not 1/7 — see DECISIONS.md) landed on D-047 S5 as the one genuinely open, fully-specified, season-independent piece of brand-cohesion work remaining.

**S5 shipped:** `darkSafe: true` added to `_MLB_COLORS_BASE` for NYY, CLE, DET, MIL, COL (dark navy/teal/purple crests that lose contrast against the D-048 near-black card surface). `Scorebug.normalizeMLBGame` reads it off `getMLBTeamColors` and carries it per-side; `renderScoreCard`/`renderTickerItem` add `.hgc-team-logo--chip`/`.ticker-logo--chip` when set. Chip is a fixed `#f5f7fa` circle (not a theme token) since its job is contrast against the logo image itself, independent of which theme's surface it sits on.

**N-15 — found while wiring S5:** `Scorebug.normalizeMLBGame`'s `logoById` helper calls `getMLBTeamLogoById`, a function name that **has never existed** in `mlb.js` — the real function is `getMLBTeamLogoUrl`. Three more call sites in `app.js` (`_heroTeamInfo`, the insights-rail leader logo, and the pennant-race viz leader logo) made the identical mistake. All four were guarded by `typeof getMLBTeamLogoById === 'function'`, so instead of throwing, every one silently resolved to `''` — no crash, no console error, just a missing `<img>`. Net effect, live since these features shipped (D-046 P2/P4 dated 2026-07-06, D-047 S2 foundation dated on/before 2026-07-26): **the home hero, the insights-rail leader logo, the pennant-race viz leader logo, every scorebug-built home-grid game card, and the MLB ticker have all been rendering without team logos.** Exactly the silent-failure shape N-1/N-14 already named and fixed elsewhere in the codebase — this one just wasn't caught because the failure mode is a missing image, not a missing feature.

**Fix:** renamed all four call sites to `getMLBTeamLogoUrl`. No other code path was affected — `getMLBTeamLogoUrl(teamId)` already existed, already correct, already used at 20+ other call sites across `mlb.js`/`arcade.js`/`scorecard.js`.

**Verified:** `node --check` clean (`mlb.js`, `scorebug.js`, `app.js`); `grep -c getMLBTeamLogoById js/*.js` → 0 everywhere; `check-manifest.cjs` + `check-themes.cjs --strict` both green; full suite 37/37. Built a standalone Node `vm` harness (stubbing `AppState`/`Logger`/`_escHtml`) to actually execute `Scorebug.normalizeMLBGame` + both builders against a real MLB game object rather than trust static review: confirmed `away.logo` resolves a real `espncdn.com` URL, `away.darkSafe` is `true` for NYY and `false` for BOS, and the `--chip` class appears exactly once per render, only on the flagged team. **Not done — live verify:** haven't loaded the deployed site to visually confirm logos now render on the home page/ticker where they were previously blank, or eyeballed the chip's contrast on a real near-black card. Recommend a `/screenshot` pass on home + MLB scores after push — this is a visible regression fix, worth confirming by eye.

---

