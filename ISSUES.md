# Issues

Active issues in priority order. When fixed, delete the row — the fix lives in the code and the git message.

*(2026-08-19, D-110) Archived to ~215KB from ~517KB — see the "Archived" section near the bottom for the index into `docs/archive/`. Read top-to-bottom for current/open work; open the archive only if you need history on something specific.*

---

## P2 — Bugs

| ID | File | Description |
|---|---|---|
| P2-007 | js/highlightCard.js (data) | NFL Highlight Card Studio player picker for at least one game (Aug 21 NYJ@PIT) lists college-football names (Cade Klubnik, Drew Allar, Will Howard, Jack Sawyer) instead of NFL rosters — found 2026-08-22 during the layout-bug repro below, not yet root-caused. |

Historical detail (P2-006, Highlight Card Studio "completely bugged"): closed and live-verified 2026-08-16 — root cause was NOT Highlight Card Studio itself but a shared `js/shareCard.js` bug (`navigator.share()` failures other than user-cancel discarded an already-rendered PNG instead of falling back to download), affecting all 5 card-export call sites site-wide. Row deleted per this file's own house rule; full detail kept in DECISIONS.md D-101.

Historical detail (P2-005, Broadcast Blurb undeployed): closed and live-verified 2026-08-09 — row deleted per this file's own house rule ("when fixed, delete the row"); full detail kept in DECISIONS.md D-068.

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

### N-18 — NFL waiver wire — **[Vera + Kael + Axiom]** · priority 3 · ✅ SHIPPED 2026-08-02
**Contributors:** Vera (spec), Kael (visual sign-off), Axiom (feasibility) | **Date:** 2026-08-02 | 3rd of 3 owner-directed "NFL expansion" initiatives

**Vera's job-to-be-done, tested against real data before designing:** "who should I pick up off waivers right now, and why." Started from the hypothesis in the original scoping note — that this might just be Trending "extended" — and checked it against the live trending-add feed rather than assuming. Two findings that shaped the actual design: (1) a rank-based "is this player actually available" filter, which seemed like the obvious differentiator from raw Trending, turned out to be **moot** — every single one of the 25 real trending-add entries carries a placeholder `search_rank` (999 or 9999999, Sleeper's sentinel for "no meaningful ADP"), because by definition players trending on the *add* wire are deep-roster names nobody drafted. There's no real signal to filter on there. (2) A genuinely useful, previously-untried correlation *does* exist: cross-referencing a trending add against `_nflPoolMap` for a same-team, same-position player carrying an `injury_status` (N-17's field) — tested live, and it correctly surfaces real "why is this guy trending" context (e.g. a KC WR trending add showing an injured teammate at WR). This became the actual differentiator, not a rank filter.

**Behavioral spec:** a new nav destination, `nfl-waivers` ("Waiver Wire"), the Draft HQ strip's 7th tab. Shows trending **adds only** — drops stay exclusively on the existing Trending view, so the two pages don't duplicate content. Depth increases from Trending's top-12-of-two-panels to top-24-of-one-focused-list, since this page's whole job is the add side. Reuses the `_NFL_POS_FILTERS` position-pill pattern (N-17 already established doing this outside Players' own view). Each row: headshot, name, team + position, 24h add count, and — when a same-team/same-position injured teammate exists — a secondary "↳ possible opportunity: {name} ({status})" hint line (first match only, kept terse). No fetch beyond what Trending already makes (`/api/sleeper?path=/v1/players/nfl/trending/add`, same TTL); the injury correlation is pure client-side join over already-cached `_nflPoolMap`. Explicit, disclosed scope limit, not silently worked around: this can't know "your" roster or league format — that needs login/roster persistence, which is D-031 (accounts/auth foundation), still not started. This is a discovery tool, not a personalized recommender; the injury-correlation hint is what substitutes for that missing personalization signal.

**Kael (visual):** reuses `.nfl-lrow` verbatim, same row shape N-17 and Trending both already use — a fan moving between all three Draft HQ list views (Trending, Injury Report, Waiver Wire) sees one consistent list language. The injury hint line reuses `.nfl-lrow-meta`'s existing muted-text treatment (a 2nd meta line under the team/position line, same as N-17's body-part/notes line pattern) rather than inventing a new element.

**Axiom (feasibility):** zero new fetches — the trending-add call already exists in `loadNFLLeaderboards()`; the injury join is O(pool size) over data already in memory, negligible cost. New nav wiring is the exact same 4-file pattern N-17 just established (`_HQ_TABS`, `SUB_NAV_TABS.nfl` `also` array, `nflViews`, `_renderNFLView` dispatch), so this was mechanical, not a fresh design.

**Gate status:** Vera ✅ · Kael ✅ · Axiom ✅. Finn implementing this session.

**✅ SHIPPED 2026-08-02 (Finn):** `loadNFLWaivers()`/`displayNFLWaivers()` added to `nfl.js`; wired as a 7th `_HQ_TABS` entry and the same 4-file nav pattern N-17 established (`SUB_NAV_TABS.nfl` `also` array, `nflViews`, view-metadata registry, `_renderNFLView` dispatch, all `navigation.js`). **Verified:** `node --check` clean on all 3 touched files; `check-manifest.cjs`/`check-themes.cjs --strict` both clean; full unit suite green.

**Live-verified 2026-08-02 (Finn):** injected the real logic into a live tab (same uncommitted-to-deploy constraint as N-16/N-17) against the real trending-add feed and real cached Sleeper pool. Confirmed the core premise with real numbers: of 25 live trending-add entries, **11 correctly matched a same-team/same-position injured teammate** (e.g. a KC WR add correctly flagged against Xavier Worthy's Questionable status, a JAX RB add against a teammate's Questionable status) — real, useful "why is this happening" context, not a guess at what the join would produce. Screenshotted both the unfiltered view (24 shown, green add-count badges matching Trending's own win-color convention) and the RB position filter (correctly narrowed to 7 real RB entries with updated counts) — confirms both the render and the filter interaction work end to end.

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
- D-052 — Men's College Basketball (NCAAB) as a 4th sport — ratified 2026-08-10, phased (specs in DECISIONS.md D-052); P1/P2/P3 shipped + live-verified (Scores/Standings/Teams/Rankings), P4 (player leaders/detail) data-checked and viable, owner decision on building it now pending
- D-092 — WNBA as a 5th sport — GATED task entry (specs in DECISIONS.md D-092), owner override of D-052
- SESSION HANDOFF — 2026-08-10 (clean shutdown, full state — new chat starting)

---

## Archived — shipped / historical (moved 2026-08-19)

To keep this backlog focused on **open** work, the following shipped/historical sections were moved to [`docs/archive/ISSUES-shipped-2026-08-19.md`](docs/archive/ISSUES-shipped-2026-08-19.md):

- P1 — Critical
- P3 — Feature Backlog
- P3-029 — NFL Offseason & Empty-State Unification — Three Gates
- P3-030 — NFL Team Landing Page Redesign — Three Gates
- P3-031 — Teams Index by Conference & Division — Three Gates
- Design Issues
- Engineering Issues
- UX Specs
- Architecture notes
- Relay — Analytics & Data Presentation Items (2026-06-08)
- D-031 Phase 1 — Accounts foundation (GATED — specs before code)
- Finn — Project Status Check + Fresh Health Scan (2026-07-31)
- N-14 — Silent network-fetch swallows beyond nfl.js (Logger-suppression gap, N-1 follow-through)
- Cipher — Security Sweep (2026-07-31)
- Relay — Data Sweep (2026-07-31)
- Mock Draft — UX/interaction audit + fixes (2026-07-31)
- D-047 S5 — Dark-logo treatment + N-15 — `getMLBTeamLogoById` never existed (live no-logo bug)
- Draft HQ — Compare tab was orphaned from the hub
- D-055 — Draft HQ information architecture: grouped strip, complete menus, ADP disambiguation
- D-056 — SEO growth audit: sitemap was unreachable to Google for 8 days, plus three real growth gaps
- D-057 — NFL leaders/game + NCAAF standings/rankings path URLs, ahead of season
- D-043 3c — Cross-sport ⌘K search: gates + implementation
- D-043 3b — Seasonal promo slot: gates + implementation
- D-043 3a — Tabbed home scoreboard `[All | MLB | NFL | NCAAF]`: gates + implementation
- D-061 — Reconcile "no-login" messaging post-D-031: gates + implementation
- D-062 — site.api.espn.com WAF block: root-cause + fix (bug, not a spec'd feature — no three-gate needed)
- D-063 — NFL season-phase model: fix the offseason banner showing during real preseason
- D-064 — Draft History: a real, scoped reason to sign in (fantasy-tier feature): gates + implementation
- D-065 — League Import: link a real Sleeper league, see your real roster (second sign-in incentive): gates + implementation
- Team bug/security sweep (2026-08-08) — post-D-064/D-065
- AI League Insights — Paid Tier v1 — Three Gates
- Personalized Fantasy Grade — Paid Tier Candidate #2 — Three Gates
- Weekly Fantasy Digest (Email) — Paid Tier Candidate #3 — Three Gates
- My Dashboard — Sign-In Reason #4 — Three Gates
- SEO audit: robots.txt gap opened up by D-031's new `/api/` surface — SHIPPED 2026-08-09
- Settings panel enrichment: Default Sport + Account glue + a real theme-sync bug — SHIPPED 2026-08-09
- Dashboard live "plays today" enrichment + Manage Follows — Three Gates
- Team pass: mobile audit, account-menu bug, analytics gap — 2026-08-09
- NFL Scores: week/season navigator — 2026-08-09
- Season-flip 502 audit: ncaafathlete.js (live) + nflplayer.js/nflstats.js (Sep 1) — 2026-08-09
- Stripe billing integration (Checkout + webhook) — the missing piece under the three already-spec'd paid features — Three Gates
- NFL/NCAAF landing pages — "This Week's Games" wired up — SHIPPED 2026-08-09
- SESSION HANDOFF — 2026-08-10 (clean shutdown, full state — new chat starting)
- D-092 — WNBA as a 5th sport — GATED task entry (specs in DECISIONS.md D-092), owner override of D-052
- SESSION HANDOFF — 2026-08-10 (clean shutdown, D-092 WNBA build)

---

## Highlight Card Studio — animated, user-customized player/game cards — Three Gates
**Contributors:** Vera (behavioral), Kael (visual), Axiom (feasibility) | **Date:** 2026-08-09

**Context (owner):** "consider how we can use the videocreation engine to further customize the user experience — user selects a game, selects a player, makes an animated highlight card, picks stats to display, animation style, color." Investigated the actual `videocreation` repo before speccing anything, per this file's own standing rule. Real finding, not assumed: its rendering pipeline (`src/render.js`/`src/compose.js`) is headless Chromium (Playwright) capturing PNG frames deterministically, then ffmpeg compositing them to 1080p/30fps H.264 MP4 — a CLI-invoked, offline batch pipeline built for pre-producing YouTube episodes, not something Cloudflare Pages Functions/Workers can run (no persistent filesystem, no native binary execution, no headless browser there). A literal "instant MP4 in the browser" version of this feature needs new backend infrastructure that doesn't exist today. Presented this fork to the owner directly; **owner chose the live in-browser scope (below) for v1**, with true MP4 export named as a deliberate, gated Phase B rather than silently dropped — full reasoning in DECISIONS.md D-074.

**What's genuinely reusable from videocreation despite the infra gap:** the scene-template architecture itself — HTML/CSS fragments driven by an explicit, typed data contract (see `scenes/templates/stat-leader-thumbnail.html`'s header comment for the pattern this project already follows), `border-left` team-color identity treatment, count-up stat number presentation — is directly portable as vanilla CSS/JS *design patterns* into the main site, without importing any of the video repo's actual tooling (Playwright, ffmpeg, Node CLI scripts). `videocreation/tokens/ss-tokens.css` is itself just a vendored copy of `css/variables.css`'s `:root` block — the main site doesn't need to sync anything, it already *is* the source of truth for the tokens this feature would use.

**Job to be done (Vera):** "I just watched my player have a great game — let me build something that shows it off, with the stats that matter to me, that I'm proud to post." This is a distinct job from the existing `shareCard.js` broadcast stat cards (which are single-purpose, auto-generated, not customizable) and from the scorecard export (which is a full historical record, not a highlight moment) — the differentiator here is real user choice over what's shown and how it moves, not just a branded export of data that's already on the page.

**Behavioral spec (Vera):** New `mlb-highlight-card` view (fast-follow to `nfl`/`ncaaf` once live — see Feasibility scoping note). Flow: pick a game (reuses the existing schedule picker pattern from Game Prep) → pick a player from either roster (reuses existing player-search affordance) → a **live, real-time animated preview panel** renders immediately using that player's real stats for that specific game (MLB: derived from the same play-by-play/box-score data `scorecard.js`/`liveGame.js` already parse; season-level stats also selectable, sourced from `AppState.mlbPlayerStats`) → a stat picker (checkboxes, 2–4 stat slots max — DESIGN.md's density-with-restraint principle applies here same as everywhere else, this is not a spreadsheet) → an animation-style picker (a small, fixed set — count-up numbers, slide-in, fade — not an open-ended animation builder; "restraint earns attention" per Kael's own standing principle applies directly) → a color picker defaulting to the player's real team color (`--team-color`, same `border = identity` pattern as every other card on this site) with a small set of accent alternatives, not a full color wheel (this product's palette is a disciplined system, not user-arbitrary). States: empty (no game/player picked yet — a clear "pick a game to start" prompt, never a blank studio), loading (skeleton matching the card's own real dimensions, house pattern), live-preview (the actual animated CSS/JS render, replaying on any control change so the user always sees the current configuration, not a stale one), export-ready (Download PNG button, always available once a player is picked), export-processing (brief, for PNG — html2canvas is near-instant; a longer, honestly-labeled state if GIF/WebM export ships, see Feasibility), error (data fetch failure — standard `ErrorHandler.handle` retry, never a fabricated stat). Mobile: the studio's control panel and preview stack vertically; the live preview stays full-width and functional, not a desktop-only feature.

**Visual spec (Kael):** The card face itself borrows the *visual grammar* already proven in `videocreation/scenes/templates/stat-leader-thumbnail.html` and `adp-delta.html` — big display-face stat numerals (`--font-display`, `tabular-nums`, matching this site's own numeric-voice rule), a `border-left` team-color identity bar, restrained kicker/label typography — reimplemented natively in `css/components.css` as a new `.hcs-*` component family, not literally embedded from the video repo. Animation styles ship as a small, named set (count-up, slide-in, fade) using this site's existing `120–150ms ease-out` motion standard (DESIGN.md) for micro-transitions, with the count-up stat animation running longer (800ms–1.2s, since it's the feature's signature moment, not a state-change micro-interaction) — the one deliberate exception to the standard duration, named as such rather than silently inconsistent. Color choices stay inside the established token system: team color (computed, most cards default here) or a short list of the existing stat-category accent tokens — never a raw hex picker, which would violate DESIGN.md's "color is a language with a small vocabulary" rule the moment a user picks an off-system color for a card that says "SportStrata" on it.

**Feasibility (Axiom):** No new data source — MLB: `AppState.mlbPlayerStats` (season) plus the same play-by-play parse `scorecard.js`/`liveGame.js` already do (single-game). NFL/NCAAF: confirmed via grep before scoping that `functions/api/nflgamelog.js`/`ncaafgamelog.js` already return true per-game stat rows (not just season aggregates) — both sports are structurally ready for this feature once MLB v1 proves the pattern, not blocked on new data plumbing. **v1 export scope, split for real technical-risk reasons:** static PNG export ships in v1 — this is exactly `shareCardElement({cardEl, fileName, title, text, btn})` (`js/shareCard.js`, already generalized by D-049 for precisely this kind of reuse, already proven a second time in `fantasy.js`'s mock-draft card), zero new rendering risk. **Animated GIF/WebM export does NOT ship in v1** — it's real, wanted, and not silently dropped, but it's a genuinely different technical problem (repeated `html2canvas` snapshots per animation frame is the naive approach and carries real perf/fidelity risk multiplied by frame count, the same class of risk GOALS.md already flagged and spiked for the scorecard's PNG export before committing to a design; `canvas.captureStream()` + `MediaRecorder` — recording a JS-driven canvas animation directly, no repeated DOM snapshots — is the more promising direction and needs its own scoped spike before a commitment, same discipline as the original scorecard's Phase 4 html2canvas spike). No new external domain, no CSP change (all rendering is same-origin DOM/canvas work). No framework/bundler introduced — this stays vanilla JS/CSS in the main site's existing file structure; `videocreation`'s own tooling (Playwright, ffmpeg, its Node CLI scripts) is never imported into this repo, mirroring the same governance boundary D-066 already established for the app-store work ("must never leak into the main site's repo or deploy pipeline"). New file: `js/highlightCard.js`, loaded after `shareCard.js` (reuses `shareCardElement`) and before `mlb.js` isn't required — after `scorecard.js` is sufficient since it only needs the box-score parse helpers, not anything `mlb.js`-specific at load time; exact position to be confirmed against the real chain at implementation time, not guessed here.

**Gate status: all three gates present for v1 (PNG export, MLB-first).** GIF/WebM export is named, scoped, and explicitly deferred to its own future spike — not yet gated, not silently promised. NFL/NCAAF are confirmed data-ready but sequenced as a fast-follow after MLB v1 ships, consistent with this file's own "MLB is the reference sport" convention.

**Shipped 2026-08-09; entry point added from game views 2026-08-08 (owner request post-launch):** v1 shipped with the studio's own game picker as the only way in. Owner flagged a real gap during live verification — a user already looking at a specific game (final boxscore or the live game panel) had no way to jump straight into a card for *that* game; they had to leave, reopen the studio, and re-find it in the picker. Fixed by adding `openHighlightCardForGame(gamePk)` (`js/highlightCard.js`) — sets a module-level pending gamePk, then `navigateTo('mlb-highlight-card')`; `displayMLBHighlightCard()` checks for the pending pk on load and, if present, skips the picker entirely (single-game `/schedule?gamePk=` lookup via `mlbFetch`, then straight into `_hcPickGame`). Wired from two places: the MLB game detail view's back-row (`_renderMLBGameDetail`, `js/mlb.js`) and the live game panel's meta row (`_renderPanel`, `js/liveGame.js` — deliberately not gated to Final-only, since the boxscore endpoint returns valid stats-so-far for a live game too). No new hash-routing pattern — kept to the same view (`mlb-highlight-card`) rather than adding gamePk-in-hash deep-linking, which would need its own `_loadFromHash` regex; that's a reasonable v1.1 fast-follow if shareable pre-scoped links are ever wanted, not done here.

**NFL port shipped 2026-08-09** — the fast-follow this entry's own Feasibility section named as data-ready. New view `nfl-highlight-card`, entry point `openNFLHighlightCardForGame(eventId)` wired into the single NFL game view's header row (`_nlgRender`, `js/nflLiveGame.js` — one entry point covers both live and final states there, unlike MLB which needed two functions for the same split). Data: `fetchNFLSummary(eventId)` — the exact `/api/nfl?path=/summary` call the live game panel already makes, no new proxy path. **Not unified with the MLB functions into one generic sport-adapter**, despite that being this codebase's usual multi-sport pattern (see `js/detailFrame.js`) — investigated first, real finding: MLB's boxscore (statsapi.mlb.com) keys every stat by a stable name (`stat.hits`, `stat.homeRuns`), so a fixed `{key,label}` catalog works, but ESPN's `/summary` boxscore has no such keys — each stat group (`passing`/`rushing`/`receiving`/`defensive`/`kicking`) carries a `labels` array and each athlete a parallel positional `stats` array (same shape `_nlgBoxScore` in `js/nflLiveGame.js` already parses). The NFL stat catalog is built from those labels by array index, not a semantic key — genuinely different enough that forcing one adapter function would just be these same functions again with extra indirection, not real deduplication. Reuses everything that IS actually generic: every `.hcs-*` CSS class (grepped first, confirmed zero MLB-specific styling in them before reuse), `_HC_COLOR_CHOICES`, `_HC_ANIM_STYLES`, `_hcAnimateCounts`, `shareCardElement`. Team color via `getNFLTeamColor(abbr)` (single CSS-string return, unlike MLB's `{primary,secondary}` object — confirmed by reading `js/nfl.js` before using it, not assumed from the MLB pattern). "Recent games" step uses `fetchNFLScoreboard()` filtered to `isFinal` (this week's slate — no MLB-style N-days-back lookback exists for NFL, and weekly cadence makes "this week" the natural analog, same default D-071/D-076 already established elsewhere). Verified: `node --check` clean on all three touched files, NUL scan clean, full suite 40/40, manifest and theme checks clean (2 pre-existing unrelated WARNs only). `sw.js` bumped v153→v154. Not yet live-verified against a real completed NFL game's `/summary` boxscore in production — the sandbox this was built in has no outbound network route to either `sportstrata.cc` or ESPN to inspect the live JSON shape directly, so the stat-group/label parsing above was built against the shape already proven correct by `_nlgBoxScore`'s existing production usage, not a fresh fetch. Needs a live check once pushed: open the Highlight Card Studio from a real finished NFL game and confirm the player list and stat labels render as expected (passing/rushing/receiving groups are the ones `_nlgBoxScore` already exercises live; defensive/kicking are new code paths, not yet observed against real data).

---

## NFL/NCAAF team pages — Team Record card added for MLB header/top-info parity — SHIPPED 2026-08-08

**Owner ask:** "MLB team pages look great, they should be used as a template to build out the headers and top team info for other leagues." Investigated live (per the `sportstrata-parity-loop` convention — compare against MLB before touching code) rather than assuming a gap: `js/nfl.js`'s `_renderTeamPage()` (shared by NFL and NCAAF) already deliberately mirrors `_mlbTeamHeader`'s exact classes (`.player-detail-header`, `.player-hero`, `.player-detail-avatar`, `.player-bio-grid`) — the header itself was not a fork needing a rebuild.

**Real gap found:** MLB's team page has a prominent "Team Batting / Team Pitching" stats card (`_mlbTeamStatsCard`) right under the header, before roster/upcoming — NFL and NCAAF had no equivalent "top team info" card at all, jumping straight from header to assets/roster. A second gap (a venue/stadium meta line MLB shows and NFL/NCAAF don't) was found too but needs a backend change — `functions/api/nfl.js`'s path allowlist blocks the singular `/teams/{abbr}` endpoint that might carry venue data (confirmed live: 400 "path not allowed"), and the list endpoint that IS allowlisted doesn't return venue at all. Owner chose to ship the stats-card parity now and leave venue for later.

**What shipped:** a "Team Record" card (`.stats-card` of `.player-bio-item` chips — Record, PCT, PF, PA, Diff, Streak, Home, Away for NFL; Record, Conf, PF, PA, Diff, Streak for NCAAF), rendered by `_renderTeamPage()` right after the header, before "Top Fantasy Assets"/roster — same position and visual grammar as MLB's card. Zero new data source: NFL reuses the exact standings fetch (`fetchNFLStandings`, `js/nflStandings.js`) the Standings view already calls, memoized via the same `_nstd.bySeason` cache; NCAAF's `_ncaafStandingRow()` (`js/ncaaf.js`) was extended to parse `pointsFor`/`pointsAgainst`/`pointDifferential`/`streak` out of the same raw ESPN stats array it already fetches for W-L — confirmed live those fields are present, just unparsed before this.

**Real bug caught before shipping:** the 2026 NCAAF season hasn't started, so ESPN's standings feed returns a real row for every team, but all zeros (0-0, PF 0, PA 0) — confirmed live against `/api/ncaafstandings?season=2026`. Rendering that verbatim would show a broken-looking all-zero card, not "no data yet." Both NFL and NCAAF now gate on `stdHasPlayed` (any of wins/losses/PF/PA nonzero) before building `recordChips`, on top of the existing null-`stdRow` omit — no card at all beats a fake-looking empty one. NFL isn't currently affected (`NFL_STATS_SEASON` resolves to the last *completed* season in the offseason, so 2025 data is real and non-zero — confirmed live for KC: 6-11, PF 362, PA 328) but the guard is there for symmetry/safety.

Verified: `node --check` both files, full suite (48/48), manifest sync, NUL scan, and a live DOM injection of the real rendered card against production KC data before committing (screenshot matched MLB's card styling exactly). `sw.js` bumped alongside.

---

## Push Notifications — Game-Start Alerts for Favorited Teams (F5) — Three Gates

**Context:** From today's brand-outreach/new-user-engagement brainstorm. GOALS.md's F5 names push notifications as a real, unshipped goal ("game-start alerts for favorited teams," "player milestones"). Confirmed by grep, not assumed: zero push infrastructure exists anywhere in this codebase today — no `PushManager`, no `Notification` API usage, no VAPID references. This is scoping only; no code written.

**Not the same feature as the Weekly Fantasy Digest.** The digest (`worker/weekly-digest.js`, D-069) is email, fantasy-league-specific, and — per its own migration comment — gated behind Stripe entitlement at the opt-in layer (paid tier). Push notifications sit in GOALS.md's general Feature Goals section, not Monetization, and the job here (know the moment a favorited team's game starts) has nothing to do with fantasy leagues or billing. **Decision: this ships free, signed-in-required (not paid-entitlement-gated).** Requiring sign-in for a brand-new capability is explicitly compliant with the constitutional rule (GOALS.md: "Sign-in may add things... it may never gate what is free today") — this doesn't take anything away from the no-login product, it adds something new that inherently needs a stable server-side identity to work at all. Worth being explicit about this distinction now, in writing, so implementation doesn't accidentally get wired behind the same stubbed `isEntitled()` check that's currently blocking every other account-tier feature for an unrelated reason (no Stripe integration exists yet).

**Scope split, named not hidden:** v1 is **game-start alerts only**. Milestone alerts (HR #50, no-hitter in progress) are real, wanted, and explicitly deferred — same phased-scope discipline this project already applies elsewhere (Highlight Card Studio's PNG-now/GIF-later split, D-074's Phase B). Game-start is a single, clean, schedule-known event, cheap to check on a cron cadence using data `mlb.js`/`nfl.js` already fetch. Milestone alerts need near-real-time in-game stat-threshold polling against live boxscores — a materially harder, fuzzier problem (polling cadence, cost, what counts as "in progress") that deserves its own future spec once v1 is proven, not a bolt-on here.

**Job to be done (Vera):** "I favorited my team; I want to know the moment their game starts without remembering to check." Distinct from the ticker/home hero (both require the user to already be on the site) — this is the first SportStrata capability that reaches someone when they're not looking at the product.

**Behavioral spec (Vera):**
- Opt-in only, never auto-prompted — same "off by default, no dark pattern" discipline already applied to the digest toggle (`alertPrefs.js`'s own header comment). v1 entry point: a toggle in the account/settings panel, next to Default Sport. A contextual prompt right after favoriting a first team ("want a heads-up when the Yankees play?") is a real, better UX but adds real complexity (timing, dismissal, not being naggy) — named as a fast-follow, not required for v1.
- Requires sign-in: a signed-out user hitting the toggle sees the existing sign-in sheet, same pattern as any other account-gated action already in the product.
- Permission flow: toggle on → `Notification.requestPermission()` → `granted` (subscribe, POST to the server) or `denied` (toggle reverts, small inline note — browsers block re-prompting after denial, so no retry loop is possible or attempted).
- Notification content: team name + "starts in X" / "starting now"; tapping it deep-links straight to that game's live view, reusing the existing `nfl-game-{id}`/`mlb-game-{pk}` view patterns via `notificationclick`'s `event.notification.data.url`. Fires once per game, not repeated.
- Unsubscribe: toggle off calls the browser's `subscription.unsubscribe()` and deletes the server-side row. Stale subscriptions (browser revoked, site data cleared) get pruned by the sender worker on a 404/410 send response — same "don't let dead rows accumulate" discipline already documented for `sleeper_links`/`draft_history`.

**Visual spec (Kael):** Minimal by nature — the permission prompt and the notification itself are native browser/OS chrome, not brand-styleable surfaces. The one real surface, the settings-panel toggle, reuses the existing account-panel toggle pattern already established for Default Sport and the digest opt-in (`css/auth.css`) — no new component. The contextual post-follow prompt fast-follow would need a real Kael pass on placement/timing if it's ever built; not scoped now.

**Feasibility (Axiom):**
- **New D1 migration** (`0007_push_subscriptions.sql`), same shape/discipline as `alert_prefs`: `push_subscriptions(id, user_id REFERENCES user(id) ON DELETE CASCADE, endpoint, p256dh, auth, created_at)`.
- **New Pages Function** `functions/api/pushSubscribe.js` — GET/POST/DELETE, session-scoped, user_id always from the session never the client — the same discipline read directly out of `follows.js` before writing this, not assumed.
- **New cron Worker**, modeled directly on the already-shipped `worker/weekly-digest.js`/`wrangler-digest.toml` (read in full before writing this spec): `scheduled()` handler on a 5–10 minute cadence (tighter than the digest's weekly run) + a shared-secret-gated `/__run` for manual testing, sequential per-recipient processing with per-row try/catch isolation, same `USER_DB` D1 binding. Query shape: games starting in the next cycle (from the same schedule fetches `mlb.js`/`nfl.js` already do) joined against `follows` (`entity_type = 'team'` rows) joined against `push_subscriptions`. Cloudflare's cron day-of-week gotcha the digest worker's own comment already documents (1 = Sunday, not the standard 0 = Sunday) applies here too if a day-scoped schedule is ever needed — this one's interval-based, so it doesn't hit that specific trap, but worth remembering.
- **The one real technical-risk item: Web Push protocol (VAPID signing + aes128gcm payload encryption).** Checked the npm registry directly rather than assuming a path exists: the mainstream `web-push` package depends on Node's `crypto` module and does not run in Workers. `@block65/webcrypto-web-push` does — built specifically for "NodeJS, Cloudflare Workers, Bun and Deno," MIT-licensed, 3 dependencies, 29KB unpacked. It's small — not at `web-push`'s scale or track record — so recommend a short spike (send one real push through it end-to-end) before committing, same spike-before-commit discipline already applied to html2canvas (scorecard) and GIF/WebM export (Highlight Card Studio Phase B). If it doesn't hold up, Cloudflare Workers' `crypto.subtle` fully covers the underlying primitives (ECDSA for VAPID, ECDH+HKDF+AES-GCM for payload encryption) — hand-rolling against Web Crypto directly is a real fallback, just more implementation surface and more places to get a byte-layout detail subtly wrong.
- **VAPID keys** — one-time generation, stored as Worker secrets (`wrangler secret put`), same no-plaintext-ever discipline as every other secret in this repo.
- **`sw.js` gains two new event listeners** — `push` (build and show the OS notification) and `notificationclick` (focus/open the relevant game view). Genuinely new territory for this file beyond its current stale-while-revalidate role, but additive — doesn't touch the existing `install`/`activate`/`fetch` handlers.
- **`js/auth.js` gains the subscribe/unsubscribe flow** (permission request, `pushManager.subscribe()`, POST to the new endpoint) — new browser-API surface for this codebase, not a reuse of an existing pattern, unlike almost everything else in this spec.
- **Cost/quota:** bounded by (signed-in users with subscriptions) × (games starting per check window) — trivially small at current traffic. No cost-metering concern on the scale D-039 required for LLM calls; worth revisiting only if usage grows substantially.

**Gate status:** Behavioral and Feasibility gates are present for v1 (game-start alerts, signed-in-only, free). Visual gate is a genuine pass-through, confirmed above rather than skipped — no new design system component is needed. Milestone alerts are named and deferred, not gated yet, matching this file's own three-gate discipline. **This entry is scoping only.** Implementation touches new infrastructure — a D1 migration, a new cron Worker, new secrets, new `sw.js` event handlers — the same class of change that needed explicit owner authorization before deployment for Broadcast Blurb (P2-005); recommend the same here before Finn starts, and note the Worker deployment + VAPID secret setup are owner actions, same constraint as every other Worker in this repo.

**Shipped and live — 2026-08-09 (D-079).** All app-side code from the Feasibility section above, deployed and verified working in production:

- `migrations/0007_push_subscriptions.sql` — `push_subscriptions` (multi-row-per-user, `UNIQUE(endpoint)`) + `push_sent_log` (dedup guard, keyed `(user_id, game_key)`). Applied via `wrangler d1 migrations apply USER_DB`.
- `functions/api/pushSubscribe.js` — GET/POST/DELETE, session-scoped, modeled on `follows.js`.
- `worker/push-game-alerts.js` + `worker/wrangler-push.toml` — cron Worker, every 10 minutes, 12-minute lookahead window (wider than the cadence on purpose, so one skipped run still catches every game). MLB (statsapi) + NFL (ESPN) upcoming-game discovery, `@block65/webcrypto-web-push`'s `buildPushPayload()` for the actual send, 404/410 auto-prune of dead subscriptions. Deployed with `compatibility_flags = ["nodejs_compat"]` (the package's `node:crypto` fallback path needs it).
- `sw.js` (v156) — `push` and `notificationclick` listeners. Additive only, doesn't touch `install`/`activate`/`fetch`.
- `js/auth.js` — `enablePushAlerts()`/`disablePushAlerts()`/`_pushSupported()`, wired into the account page as a "Game-start alerts" toggle right after the digest section, same structure (off by default, reverts on failed save, toasts on success).
- `js/config.js` — `VAPID_PUBLIC_KEY` constant (safe to ship client-side by design; the private half only ever lives in the Worker's secrets).
- Root `package.json` — added `@block65/webcrypto-web-push`.

**Two real bugs found and fixed via the owner's own live `/__run` testing** (not caught in review — this is exactly what the "spike before trusting it" step in the Feasibility section was for):
1. **NFL fetch failed with an Akamai "Access Denied" HTML body.** `site.api.espn.com` is Cloudflare-egress-blocked — the same incident already documented in `functions/api/nfl.js`'s 2026-08-07/08 header comment, whose fix (switch to `site.web.api.espn.com`, byte-identical response shape) just hadn't been carried over to this new Worker. Fixed, plus added the matching browser-realistic `User-Agent`.
2. **MLB fetch had no `User-Agent` header at all**, unlike `functions/api/mlb.js`'s already-proven `SportStrata/1.0` UA to `statsapi.mlb.com` — same class of risk, fixed preemptively alongside the NFL bug.

Diagnosing bug #1 was slow because the original error handling swallowed which of the two upstreams (MLB or NFL) had actually failed. Fixed structurally, not just patched: `worker/push-game-alerts.js` now uses a labeled `_fetchJson()` helper (reports HTTP status + a body snippet on parse failure) and `Promise.allSettled` instead of a combined `Promise.all`/`catch`, so a future upstream failure reports its source and status directly instead of a bare "Unexpected token '<'".

Confirmed live: `/__run` (shared-secret-gated manual trigger) returns `{"matched":0,"sent":0,"skipped":0,"failed":0,"pruned":0,"errors":[]}` — clean, no errors. `matched:0` is expected/correct when no MLB or NFL game is inside the 12-minute lookahead window; it is not itself a failure signal.

**Not yet done — the one remaining real-world check:** an actual end-to-end send (follow a team with a game starting soon, confirm the browser notification arrives and `notificationclick` opens the right game). Everything up to the send call is now verified; the send itself only fires when `matched > 0`, which hasn't happened yet on a live run.

---

## NFL Live Game Viewer — Production Rebuild (Tabs, Density, Real-Time Sync) — Three Gates

**Context:** Owner brief (Cowork), verbatim goal: bring the NFL live game page to ESPN/CBS information density with SportStrata's dark/orange identity intact — pregame/live/final states, a tabbed body (Summary, Play-by-Play, Box Score, Team Stats, Analytics, Fantasy), a real-time sync layer, a sidebar (leaders, fantasy leaders, game flow, eventually win probability), and a longer-term architecture that leaves room for original SportStrata analytics (EPA, success rate, CPOE, win probability, player impact, drive efficiency, FPOE) and auto-generated Highlight Cards from big plays.

**Current state, read in full before scoping this:** `js/nflLiveGame.js` (D-030) already exists and is live — score header, situation line (possession/down-distance/last play), quarter-by-quarter linescore, a scoring-plays feed, a team-stats comparison, and a passing/rushing/receiving box score, backed by ESPN's `/api/nfl?path=/summary&event={id}` (20s Cloudflare edge cache TTL, `functions/api/nfl.js`), polled client-side every 20s while live. This is a real, working v1 — not a stub — but it fully re-renders the entire page (`grid.innerHTML = ...`) on every poll tick, has no tabs, no full play-by-play (only scoring plays), no drive visualization, no sidebar, and no fantasy/analytics surfaces. **This spec is a rebuild of that file, not a new parallel one** — there is exactly one NFL live game view in this codebase and that stays true.

**A materially better internal precedent already exists and should be the template, not this file's own current pattern:** MLB's `js/liveGame.js` (P3-025) already solved tabbed + partial-update live game rendering in this exact codebase — `tabpanel.innerHTML` swaps between play-by-play/box-score/matchup panels without touching the header, and section-scoped updates (`.lg-header`, `.lg-linescore-wrap`) replace only what changed, gated by a `_lgLastState` diff key so an unchanged poll is a no-op render. Rebuilding NFL's page against MLB's proven pattern, the same way the Highlight Card Studio and the sport-aware hero were built by porting an MLB pattern to NFL earlier this session, is lower-risk than inventing a new update architecture from scratch — and it's a real requirement, not just a style preference: the brief's own tabbed design cannot tolerate a full-page re-render on every 15–20s poll, because that would blow away whichever tab the user has open and their scroll position, exactly the failure mode MLB's diff-based approach was built to avoid.

**Job to be done (Vera):** "I have this game open during the broadcast and I want it to feel like a second-screen production truck — score/situation always visible, everything else one tap away, and it never jumps or flickers under me while I'm reading." Distinct from the current page's job (glance at the score); this is sustained, active use across a full game.

**Behavioral spec (Vera):**
- **Three states**, matching the existing `_nlgState()` vocabulary (`pre`/`in`/`post`) — no new state model needed, just richer rendering per state:
  - *Pregame:* matchup header, records, venue/weather if ESPN provides it, projected starters if available — no tabs need live data, so Play-by-Play/Analytics/Fantasy tabs show a "kicks off at {time}" empty state rather than being hidden (a hidden tab a user expects to exist reads as broken, not as absent).
  - *Live:* the header is permanently pinned above the tab body — score, quarter, clock, possession, down/distance, field position never scroll away or require a tab switch to see. This is the brief's single clearest requirement and the one thing that must never regress across any of the phases below.
  - *Final:* same tab structure, live-only elements (clock, possession, LIVE badge) drop out; box score and team stats become the durable record, matching MLB's `showMLBGameDetail` final-state convention.
- **Tabs:** Summary (default), Play-by-Play, Box Score, Team Stats, Analytics, Fantasy — persistent across polls (a re-render must never reset the user back to Summary). Tab state lives in a small local object (`_nlg.activeTab`), same scoping discipline as `_nlg.eventId`/`_nlg.timer` already use.
- **Sidebar** (desktop; collapses to a stacked section below the tabs on mobile — this page has no sidebar real estate under ~900px, same responsive posture as every other dense view in this codebase): game leaders (per-stat-category top performer, cheap — already in the box score payload), fantasy leaders (see Feasibility), game flow (a compact scoring-progression strip from the linescore, cheap), win probability (**Phase 2, see Gate status** — not v1).
- **Real-time sync:** score/clock/situation/plays/team-stats/box-score all move together off one poll tick (one `/summary` fetch drives every section) — the brief's "synchronizing... without page refreshes" is satisfied by one coherent poll + diff-render, not by multiple independent timers per section, which would risk sections showing different moments in the game relative to each other.
- **Create Highlight Card:** stays exactly where it is today (header button, already shipped) for v1. "Auto-suggest a card from a big play" is the brief's own "eventually" — Phase 3, not v1.

**Visual spec (Kael):** This page is where DESIGN.md's posture claim ("Baseball Savant crossed with a broadcast lower-third system") gets tested hardest, since it's the site's single densest, most sustained-attention surface.
- **Density is a layout decision, not a font-size decision.** Tighter row heights, more columns visible without scrolling, a real sidebar — not shrinking type. DESIGN.md's "dense tables are the product" rule applies directly; the current page's ample whitespace between the situation line, linescore, scoring feed, team stats, and box score (each its own `.nlg-card` with full padding) is exactly the pattern to tighten.
- **Border = identity, badge = state (D-038 K2)** governs every new card: team-color borders identify a possession/drive card, never a color swapped in to signal "live" — liveness stays in the badge/glow channel, same rule already enforced on the ticker and home hero.
- **Category-color discipline** applies to the new Analytics tab whenever it ships real numbers — EPA/CPOE are informational, never colored to shout a value is good or bad, same as every existing stat column.
- **Receipts pattern** applies directly to Fantasy (show the scoring format used — PPR/Half-PPR/Standard — as a receipt chip, not silently assumed) and to any Phase 2/3 analytics number (a win-probability or EPA figure needs the same "how was this computed" provenance the odds/VBD features already carry).
- **Tabs are new UI for this codebase** — no existing `role="tablist"` component exists anywhere (checked directly, not assumed: the only `.nav-tab` class in use is the top-level sport navigation, an unrelated component). Build one shared `.gv-tabs` component styled to DESIGN.md tokens (Inter for the tab labels, `--accent` reserved for the active tab per the "brand orange = brand only" invariant — not a colored underline in a stat-category color) — this is a real new component, not a reuse, and should be built once and shared if MLB's `liveGame.js` is ever retrofitted to the same visual language later (not required now, just don't paint this into an NFL-only corner).
- Skeletons on first load matching the final layout's dimensions (header + tab strip + sidebar shell), not a spinner — same as every other view.

**Feasibility (Axiom):**
- **Rebuild `js/nflLiveGame.js` in place**, porting `liveGame.js`'s tab-panel + section-diff pattern rather than the current full-`innerHTML` replace. Concretely: `_nlgRender()` splits into `_nlgRenderHeader()` (score/situation, always re-rendered — cheapest, most time-sensitive), `_nlgRenderTabs()` (called once, tab-switch is a local DOM show/hide, not a re-fetch), and one render function per tab body, each only re-invoked when its underlying data actually changed (same `_lgLastState`-style diff key, scoped per section: linescore diff, play-count diff, box-score-snapshot diff).
- **Real technical risk, unverified and flagged rather than assumed:** whether ESPN's `/summary` payload includes a full `plays`/`drives` array (needed for the Play-by-Play tab and any drive visualization) is **not confirmed**. This session's `nflLiveGame.js` reading only exercises `header`, `boxscore`, and `scoringPlays` — never `data.plays` or `data.drives`. This sandbox has no outbound route to ESPN to check directly (confirmed earlier this session, npm registry only). **Before Finn builds the Play-by-Play tab or drive visualization, a live check is required** — fetch `/api/nfl?path=/summary&event={a real live or recent eventId}` via Chrome and inspect the actual keys present. If `drives`/`plays` aren't there or are shaped differently than assumed, the Play-by-Play tab may need a different endpoint path (ESPN's `/playbyplay` under the same host family) rather than parsing it out of `/summary`.
- **Fantasy tab/sidebar is genuinely feasible for v1**, not deferred: `js/fantasy.js` already has the PPR/Half-PPR/Standard scoring vocabulary (`_vbdProj`'s `scoring` parameter) for season projections; live fantasy points need a new, much simpler function — standard scoring rules (yards/25, TD × 4or6, INT × -2, reception × 0 or 0.5 or 1) applied directly to the box score's already-parsed per-player stat rows (`_nlgBoxScore`'s existing `g.athletes[].stats[]` access pattern). No new data source required — this is arithmetic over data already being fetched.
- **Win probability is explicitly Phase 2, not v1**, and for a real reason, not just caution: NFL win-probability reliability from ESPN's public feed is inconsistent game-to-game (sometimes present, sometimes empty) in general public-API experience, and this project has no live-verified sample from this specific endpoint. Shipping a sidebar item that's silently blank most games is worse than not shipping it; confirm real presence/reliability across several live games before committing to it, same "don't ship what you haven't proven" discipline as the push-notification field-shape caveat that just paid off twice this session.
- **SportStrata-original analytics (EPA, success rate, CPOE, player impact, drive efficiency, FPOE) are explicitly Phase 3, not "leave room for" busywork — this is a separate, large initiative, not a tab.** None of these are provided pre-computed by ESPN's public API. The only analytics-grade play-level data source this project already has is nflverse via `/api/nfladv` (2016+, currently used for Next Gen Stats player pages) — EPA/CPOE/success-rate/win-probability-added are standard nflverse/nflfastR columns *if* a play-level (not just player-season) nflverse dataset is ingested, which is a materially different, larger data-engineering project (Relay's domain, not a UI task) than anything else in this spec. "Leave room for" is honored architecturally by making the Analytics tab a real, named, empty-stated tab now (so the UI slot exists) — not by attempting any computation in Phase 1.
- **Polling cadence:** keep the existing 20s interval (matches `ttlFor('/summary')`'s edge cache TTL exactly — polling faster than the cache TTL just re-serves the same cached response). No cost/quota concern; this is a straight continuation of the existing pattern, not a new cost surface.
- **No new CSP/host surface** — same `/api/nfl` proxy, same `site.web.api.espn.com` upstream already fixed for D-079's Worker; nothing here talks to a new domain.

**Gate status:** Behavioral and Visual gates are complete for **Phase 1** (states, tabs, density, sidebar minus win-probability, fantasy scoring, diff-based sync). Feasibility gate is complete for everything in Phase 1 **except the Play-by-Play tab and drive visualization**, which are blocked on the live field-shape check named above — that check should happen before Finn starts on those two tabs specifically, not before starting Phase 1 as a whole (Summary/Box Score/Team Stats/Fantasy have no such open question). Win probability (Phase 2) and SportStrata-original analytics + auto-highlight-card suggestions (Phase 3) are named and deferred, not gated — they need their own future specs once Phase 1 is proven, matching this file's own three-gate discipline and the phased-scope precedent already set by Highlight Card Studio (PNG-now/GIF-later) and Push Notifications (game-start-now/milestone-later).

**Phase 1 shipped — 2026-08-09.** Live-verified the open field-shape question first (via Chrome, against real completed game 401873271, not assumed): `drives.previous[].plays[]` confirmed with full down/distance/field-position data, `leaders[]` confirmed, and `winprobability[]` confirmed present and populated (188 entries, 170 distinct values 0–0.827) — better news than the caution above assumed, though still held to Phase 2 per this entry's own "confirm across multiple games" bar, not shipped on the strength of one final preseason game.

Rebuilt `js/nflLiveGame.js` in place: always-visible header, six tabs (Summary, Play-by-Play, Box Score, Team Stats, Analytics as an honest empty state, Fantasy with live points computed from box score stats + a Standard/Half-PPR/PPR toggle), and a sidebar (game leaders, fantasy leaders, an inline-SVG game-flow sparkline). Update architecture ports MLB's `js/liveGame.js` tab-panel + section-diff pattern rather than the old full-page-replace-on-every-poll design — tab selection and scroll position now survive every 20s poll. `css/nflLiveGame.css` gained this codebase's first tablist component (`.gv-tabs`, accent reserved for the active tab only) plus the sidebar/fantasy/play-by-play styles. `sw.js` bumped to v157.

**Live-verified — 2026-08-09.** Checked in Chrome against the same real game (401873271, final CAR 33–30 ARI): all six tabs render and switch correctly, tab/scroll state survives a poll-equivalent re-render, the Fantasy scoring toggle recalculates live and correctly (Standard vs PPR reordered the leaderboard exactly as expected — a receptions-heavy player dropped when PPR credit was removed), the game-flow sparkline renders both teams' cumulative-score lines, the Analytics tab shows the honest empty state, and the console is clean on a fresh load (no errors).

**One real density bug found and fixed in the same pass:** the Box Score tab's player-name column used a proportional flex share (`flex: 1.5` against up to 7 stat columns at `flex: 1` each), which worked fine at the old file's 3-4-column limit but truncated names to 5-6 characters ("Haynes...", "Kenny Pi...") once the column count grew to a full stat line. Fixed: name column now gets a fixed floor (88px, 112px from 640px up) instead of a shrinking proportional share, and stat columns distribute the remainder evenly. `sw.js` bumped to v158.

---

## NFL Live Game Viewer — Phase 3 Analytics (EPA/CPOE/Success Rate/Drive Efficiency/FPOE) — Scoping

**Context:** D-080's Phase 1 shipped an Analytics tab with an honest "coming soon" placeholder. This is the deferred scoping pass for what actually goes in it. Owner chose this over waiting for more preseason games to clear Phase 2 (win probability) — the NFL preseason schedule was checked live: only one game has been played so far (CAR@ARI, Aug 6), the next wave doesn't start until Thursday, Aug 13, so Phase 2 stays blocked on data that doesn't exist yet. Not a reason to sit idle — Phase 3 is real, separate work that doesn't depend on more preseason games.

**The single most important finding in this spec, verified live rather than assumed: "Phase 3" is not one thing.** It splits into two pieces with completely different cost, timeline, and — critically — completely different live-vs-not-live characteristics. Presenting it as one undifferentiated "analytics" bucket would hide that split from the next person who picks this up.

**Phase 3a — Success Rate + Drive Efficiency. Near-term, no new data source, genuinely live.**
- **Success rate** is a rule-based formula (gained ≥40% of yards-to-go on 1st down, ≥60% on 2nd, 100% on 3rd/4th — the standard, industry-common definition), not a statistical model. It needs no external data — it's computed directly from the down/distance/yards-gained fields already flowing through `js/nflLiveGame.js`'s Play-by-Play tab (`drives.previous[].plays[].start.down/.distance`, live-verified present in D-080 Phase 1). This can be live, during a live game, today.
- **Drive efficiency** (yards/play, points/drive, time-of-possession efficiency) is pure aggregation over `data.drives[]`, a field already being fetched and rendered by Phase 1 — no new source, no new fetch, arithmetic over data already in memory.
- Both slot directly into the existing Analytics tab and can ship as a straightforward implementation pass, not a new three-gate cycle — the data source and UI slot both already exist from Phase 1.

**Phase 3b — EPA, CPOE, Win Probability Added, Player Impact. Real, but not live, and not available for the current season yet.**
- These require play-level Expected Points and Win Probability models — not arithmetic, not rule-based. Building original models is a multi-week-plus statistical modeling project, not an engineering task; the realistic path is ingesting nflverse's `nflfastR`-computed play-by-play, which already carries `epa`, `wpa`, `cpoe`, `success`, `qb_epa`, and related columns as standard, industry-recognized figures.
- **Checked live, not assumed:** nflverse's `play_by_play_2026.csv.gz` (the current season's file, at `github.com/nflverse/nflverse-data/releases/download/pbp/`) **returns 404 — it does not exist yet.** The most recent available file is `play_by_play_2025.csv.gz`, last touched 2026-02-12 (well after last season ended — a post-season archival pass, not an in-season update). **This means EPA/CPOE/win-probability-added are not available for any 2026 game right now, preseason or otherwise**, and the in-season update cadence once the file does appear (does it refresh weekly during the season, or only in batches?) is an open question this check couldn't answer and needs revisiting once the 2026 regular season actually starts publishing — realistically, September.
- **Even once available, this data is not live-during-a-game by nature.** nflverse's pipeline computes EPA from finalized play-by-play; there's no evidence of a sub-game-latency feed. Phase 3b is a **post-game recap analytics feature** (EPA breakdown of last night's game, once nflverse republishes), not a live in-game stat — a real, honest correction to the original brief's "live analytics" framing for this specific piece, distinct from Phase 3a which genuinely can be live.
- **Architecture note, checked against this project's own precedent:** `functions/api/nfladv.js` already proves gzip-CSV-from-nflverse works in a Cloudflare Pages Function (`DecompressionStream('gzip')`, name+team crosswalk via `norm()` against ESPN names) — but that file fetches small per-season NGS files. A full-season play-by-play file is **17-19 MB gzipped** — fetching and parsing that on every request is a real cost/latency problem, not a drop-in reuse of the existing pattern. This needs a scheduled Worker (cron, same pattern as `worker/push-game-alerts.js`/`worker/weekly-digest.js`) that periodically ingests the file once, computes/stores a distilled per-game or per-player summary in D1, and serves that — not a live per-request fetch of an 18MB file.

**Phase 3c — Fantasy Points Over Expected (FPOE).** Needs an expected-fantasy-points baseline (opportunity share — targets, carries, red-zone touches — versus league-average conversion rates), which is its own smaller modeling exercise, not free from either ESPN's live feed or nflverse's pbp file directly. Smallest priority of the three; deferred further, needs its own future spec once 3a is shipped and 3b's data-pipeline question is resolved.

**Vera (what this actually changes for the user):** Phase 3a is the meaningful near-term win — a fan watching live can see "this drive is running a 71% success rate" the moment it's happening, which is exactly the second-screen-production-truck feel the original brief asked for. Phase 3b, once shipped, is a different job: "what actually happened last night, in EPA terms" — a recap tool, not a live companion. These should be presented as visually distinct in the Analytics tab (a "Live" section vs a "Game Recap" section that only populates post-game), not blended into one undifferentiated list, so a user watching a live game doesn't wonder why the EPA numbers aren't moving.

**Kael (brief note, not a full visual pass yet):** Both sub-phases carry the receipts pattern already established in DESIGN.md — success rate needs its threshold stated inline ("≥40% on 1st, ≥60% on 2nd, 100% on 3rd/4th"), same as every other computed number in this product; Phase 3b numbers need a "via nflverse, updated {when}" provenance line for the same reason the odds/VBD features already carry one. Category-color discipline applies — these are informational, never colored to shout good/bad.

**Gate status:** Phase 3a is feasibility-complete and effectively pre-approved for implementation — no new data source, no new architecture question, reuses the existing Analytics tab slot. Phase 3b's feasibility is blocked on two real open items before Finn should touch it: (1) the 2026 nflverse pbp file doesn't exist yet — recheck in September when the regular season is underway; (2) the ingestion architecture (scheduled Worker + D1 distillation, not a per-request fetch) needs its own short design pass once there's actual data to design against, matching the caution already proven correct twice this session (D-079's field-shape caveat, D-080 Phase 1's own live win-probability check) that untested assumptions about a third-party feed's shape and freshness are exactly where real bugs hide. Phase 3c is named and deferred, not scoped further.

**Phase 3a shipped and live-verified — 2026-08-09.** Success Rate and Drive Efficiency now render in the Analytics tab, checked against the same real game used throughout this session (401873271, final CAR 33-30 ARI): CAR 49% success rate (37/76), ARI 55% (43/78), full 1st/2nd/3rd-4th down breakdown, yards/play and yards/drive both computed correctly, receipts-style threshold caption rendering exactly as specced ("≥40% on 1st · ≥60% on 2nd · 100% on 3rd/4th"), clean console. Phase 3b stays exactly as scoped above — not started, blocked on nflverse's 2026 data.

---

### NFL Live Game Viewer — Surface unused `/summary` fields (injuries, news, odds/broadcast, standings) — shipped 2026-08-09

**Context:** D-080's Phase 1 fetches ESPN's `/summary` payload for every live/final NFL game, but only ever read 5 of its ~17 top-level keys (`header`, `drives`, `leaders`, `scoringPlays`, `boxscore`/`gameInfo`). `injuries`, `broadcasts`, `pickcenter`/`odds`, `news`, and `standings` were all present in every response and completely unused anywhere on the site — the highest-value, lowest-cost item identified in a diehard-NFL-fan brainstorm: zero new fetches, zero new endpoints, purely rendering data already in memory on every 20s poll.

**Field shapes — live-verified 2026-08-09 against event 401873271 (CAR 33, ARI 30, final):**
- `injuries[]`: per-team `{team, injuries: [{status, type:{abbreviation}, athlete:{shortName, position:{abbreviation}}, details:{detail, returnDate}}]}` — confirmed populated (5 entries per team on this game).
- `pickcenter[]`: `{provider:{name}, details ("CAR -1.5"), overUnder (34.5), moneyline, pointSpread, homeTeamOdds, awayTeamOdds}` — confirmed populated (DraftKings).
- `news.articles[]`: `{headline, byline, published, links.web.href}` — confirmed populated, but the content is **general NFL news, not scoped to this specific game** (a sample headline was about the Bears while viewing a CAR/ARI game) — labeled "NFL News" rather than "Game News" to avoid overclaiming relevance.
- `standings.groups[]`: `{divisionHeader, standings:{entries: [{team, stats: [{name, displayValue}]}]}}`, `stats` includes a ready-made `overall` ("1-0") and `winPercent` — confirmed populated for both teams' divisions.
- `broadcasts[]` was an **empty array** for this specific (completed preseason) game — the render path is written defensively (multiple fallback field-name guesses, silently omits rather than throwing) but is **unverified against a populated broadcasts entry**. Flagging this explicitly rather than presenting it as confirmed.
- `againstTheSpread[]` had `records: []` (empty) for this game — not surfaced; too sparse to build a reliable empty-state around from one data point.

**What shipped:** Summary tab gained two collapsible cards below the scoring feed — Injury Report (open by default, per-team status/name/position/detail rows) and NFL News (collapsed by default, top 5 headlines linking out `target="_blank" rel="noopener"`). The venue caption line now folds in the broadcast network (if resolvable) and the spread/O-U line when `pickcenter` has data. The sidebar gained a Standings card showing each team's own division table (one table if it's a divisional game), with the two playing teams marked by a left border in their own team color — reusing the existing `.nlg-team`/`--tc` inline-color pattern (D-038 K2: border = identity, never state), not brand orange, per DESIGN.md invariant #3.

**Kael note:** No new color vocabulary introduced. Injury status renders as a neutral muted pill (not severity-color-coded — the semantic win/loss/live trio doesn't extend to injury status, and inventing a new color mapping wasn't reviewed). All new cards reuse the existing `.nlg-card`/`.nlg-sum` collapsible pattern and `.nlg-side-card`/`.nlg-side-title` sidebar pattern verbatim — no new component shape.

**Shipped and locally verified 2026-08-09:** `node --check`, 0 NUL bytes, manifest sync clean, theme check clean (only the 2 known pre-existing WARNs), full 40-test unit suite passing, sw.js bumped to v160. Pending: live verification on production once pushed.

---

## Home — Cross-sport score ticker

**Context:** Owner shared three competitor home pages (ESPN, The Athletic, Bleacher Report NFL) and asked the team to react. Vague-direction path per TEAM.md — Kael/Vera/Axiom framed it before anything got scoped. Converged finding: the one structural pattern worth adopting from all three is a persistent, cross-league score ticker; the editorial photo-hero/byline pattern in all three should **not** be adopted — it's exactly what D-046 already ruled out (no licensed photos, no editorial staff) and would fight DESIGN.md's posture ("broadcast-grade authority... not a consumer sports app"). Owner confirmed: cross-sport ticker is the direction.

**Current-state finding (Axiom, checked against the actual code, not assumed):** `#scoreTicker` is a single global element in the sticky header (row 2, `.header-ticker`), but it is **not** currently cross-sport — it's sport-*exclusive*, wholesale-replaced by whichever `update{Sport}Ticker()` last ran (`updateMLBTicker` in `mlb.js`, `updateNFLTicker` in `nfl.js`, `updateNCAAFTicker` in `ncaaf.js`). `switchSport()` in `navigation.js` swaps the ticker's entire contents to the new sport's games on every switch. On Home specifically, the boot IIFE in `app.js` (~line 120) unconditionally seeds the ticker with **MLB only**, regardless of what view the app lands on or what's actually in season — so a user landing on Home during an NFL/NCAAF week currently sees zero football in the ticker until they manually switch sport. That's the real gap, not a missing feature so much as a wrong default.

**The infrastructure to fix this already exists and is a near-perfect fit.** `js/scorebug.js` (D-047 S2) already normalizes MLB/NFL/NCAAF games into one shared model (`{sport, key, id, status, pillCls, pillLabel, home, away, ...}`) via `Scorebug.normalizeMLBGame()` / `normalizeNFLGame()` / `normalizeNCAAFGame()`, and already renders any of them through one sport-agnostic `Scorebug.renderTickerItem(m)` builder that reads `data-sport` for click routing. `setupTickerClicks()` in `app.js` already branches on `item.dataset.sport` for mlb/nfl/ncaaf (and nhl). **This is a data-merge task, not a new-component task** — the shared anatomy this feature needs was already built for a different reason (D-047's cross-sport cohesion contract) and happens to solve this exactly.

**Behavioral spec (Vera):**
- **Scope: Home only.** When `AppState.currentView === 'home'`, the ticker shows a merged MLB + NFL + NCAAF feed. Inside a specific sport's section (`mlb-*`/`nfl-*`/`ncaaf-*`), the ticker keeps today's existing sport-exclusive behavior — a user deep in NFL views wants NFL scores, not a diluted mixed feed. This mirrors D-042's `home` = sport-agnostic front door / everywhere else = sport-specific pattern already established for the rest of the site.
- **States:**
  - *Loading:* existing shimmer skeleton items (already sport-neutral) — no change.
  - *Mixed, populated:* live games from any sport sort first (across leagues, not grouped by league block — a ticker that reads MLB-block-then-NFL-block-then-NCAAF-block is three tickers taped together, not one), then remaining games chronological by start/game time. Followed-team games pin to the very front regardless of sport, extending the existing `_isFollowed()` pinning (`updateMLBTicker` already does this for MLB team-favorites; the merged ticker generalizes it across all three sports rather than reimplementing it).
  - *One sport in-season, others idle* (the common case in most months): the idle sport(s) simply contribute nothing — no empty placeholder items, no "no NFL games" filler inside a ticker that has real MLB games to show.
  - *Everything idle* (rare — e.g. deep MLB offseason before NFL/NCAAF have started, if that ever coincides): one sport-neutral message, not three stacked "no X scores" messages. Copy: "No scores right now — check back soon."
- **Live refresh:** each sport's own poll cadence (MLB 30s, NFL 60s; NCAAF currently has no poll loop at all — a real gap surfaced by this work, not previously needed since NCAAF's ticker only ever updated on sport-switch) must re-render the *same* merged view while on Home, not silently overwrite it with a single-sport list. Three independent loops each calling their own `update{Sport}Ticker()` against the shared `#scoreTicker` element would fight each other and flicker between merged and single-sport — this needs one shared render entry point gated on `AppState.currentView === 'home'`, not three call sites patched individually.
- **Click-through:** no new work — `setupTickerClicks()` already routes mlb/nfl/ncaaf items correctly by `data-sport`.

**Visual spec (Kael):**
- **One real gap found in the shared builder itself:** `Scorebug.renderTickerItem()` does not render the league glyph (⚾/🏈) that `renderScoreCard()` already has via `_leagueGlyph()`. That glyph exists specifically so a mixed view scans by league at a glance (its own code comment says as much for the score-card case) — the ticker needs the identical treatment for the identical reason, arguably more so since ticker items are terser and have less context than a full card. Add the glyph to `renderTickerItem`, muted inline mark per the existing invariant (not a colored badge — badge channel stays reserved for state, not identity, per D-038 K2). Ship it on **every** ticker item, not just the mixed Home case — "one rendering path, no view-aware branching in the builder," the same discipline `_leagueGlyph` was already built under.
- No new color, no new component shape. Merged items reuse `.ticker__item`/`.ticker-team`/`.ticker-score`/`.ticker-status-pill` verbatim.
- Idle-state copy must not name a specific sport when the ticker is genuinely empty across all three (see states above) — a sport-scoped idle message on a page whose whole point is being sport-agnostic reads as broken, not calm.

**Feasibility (Axiom):**
- **No new fetch, no new endpoint, no new cache surface.** `fetchMLBSchedule()`, `fetchNFLScoreboard()`, `fetchNCAAFScoreboard()` are all already called elsewhere in the app and already go through `ApiCache`/`mlbFetch`'s own TTLs — calling all three on Home costs nothing extra beyond what those views already pay when visited directly.
- **New code, all additive, no rewrite of existing per-sport ticker functions** (`updateMLBTicker`/`updateNFLTicker`/`updateNCAAFTicker` stay exactly as they are for their existing non-Home call sites):
  1. `scorebug.js` — add the league glyph to `renderTickerItem` (small, shared).
  2. `app.js` — one new `_updateHomeTicker()`: gather cached `AppState.mlbGames`/`nflGames`/`ncaafGames` (fetch whichever's missing), normalize each via `Scorebug.normalize*Game`, filter MLB to scored/live (matching `updateMLBTicker`'s existing Preview-exclusion), pin followed teams, sort live-first-then-chronological, cap and double the list for the marquee loop (same pattern `updateMLBTicker` already uses), render via `Scorebug.renderTickerItem`.
  3. `app.js` — one new `setupHomeTickerPolling()` loop (30s), body only runs when `AppState.currentView === 'home'`; this is what actually fixes the "three loops fighting" risk Vera flagged, rather than patching the three existing loops' call sites individually.
  4. Wire `_updateHomeTicker()` into the boot IIFE (replacing the unconditional MLB-only seed when the landing view is `home`) and into `loadHome()`'s entry, mirroring where `_applySportUI('home')` already gets called per the existing "home is the front door" rule.
- **NCAAB and NHL are out of scope for this pass.** NCAAB has no `Scorebug.normalize*Game` yet (D-052 shipped its own standalone ticker function, not migrated to the shared model) and NHL is preview-only per CLAUDE.md's standing rule against unprompted NBA/NHL feature work. Flagging the NCAAB gap for whoever picks up D-052 P4, not building it now.
- **No CSP/host surface change, no new global on `AppState`, no script-load-order change** — everything here composes existing functions.

**Gate status:** all three gates cleared in this pass — behavioral, visual, and feasibility specs above are concrete enough for direct implementation, no follow-up spec needed. Cleared for Finn.

**Shipped — 2026-08-10 (Finn).** Built exactly to spec, no deviations:
- `js/scorebug.js` — `renderTickerItem()` now renders the league glyph via the existing `_leagueGlyph()` helper (already used by `renderScoreCard`), shown on every ticker item.
- `css/ticker.css` — `.ticker-glyph` added, identical recipe to `.hgc-glyph` in `main.css`.
- `js/app.js` — new `_updateHomeTicker()` (merges MLB/NFL/NCAAF via `Scorebug.normalize*Game`, followed-team-first then live-first then chronological sort, sport-neutral idle copy) and new `setupHomeTickerPolling()` (30s, gated on `AppState.currentView === 'home'`). Wired into the boot IIFE (replaces the unconditional MLB-only seed when the landing view is home), into `loadHome()`'s entry, and into the `ss:follow-changed` listener so favorite-team pinning re-sorts the merged ticker too when on Home. The existing MLB (30s) and NFL (60s) live-poll loops now skip their own `update{Sport}Ticker()` call while `AppState.currentView === 'home'`, so they no longer fight the merged render for `#scoreTicker`.
- **Verified locally:** `node --check` clean on both changed JS files, 0 NUL bytes on all changed files, `tools/check-manifest.cjs` clean, `tools/check-themes.cjs` clean (only the 2 known pre-existing light/nl-monarchs contrast warnings, unrelated to this change), full 33-test unit suite passing. `sw.js` bumped to v164.
- **Not yet live-verified** — pending push + Cloudflare Pages deploy. Next session (or later this one) should confirm via Chrome: `#scoreTicker` shows a merged MLB/NFL/NCAAF feed only on Home, reverts to sport-exclusive inside a sport section, league glyphs render correctly, followed-team pinning still works, and the two live-poll loops no longer visibly fight (no flicker between merged and single-sport views) during a live MLB or NFL window.
- **Named but not built, flagged for whoever picks up D-052 P4 or a future NCAAB pass:** NCAAB has no `Scorebug.normalize*Game` yet, so it's absent from the merged ticker even though it's a shipped 4th sport. Not a regression — NCAAB's own standalone ticker function is untouched and still works inside NCAAB's own section — just an inconsistency worth closing once NCAAB has its own Scorebug normalizer.

---

## Home — Scaled-up Data-Story hero

**Context:** Follow-on to D-087. Owner asked for a more comprehensive review of the whole home dashboard, specifically raising whether a larger visual element (like the competitor sites) was needed. Full-page screenshot review (production, scrolled top to bottom) found ten distinct content modules stacked at roughly equal visual weight — welcome banner, hero, sport-picker band, Pennant Races, NFL Draft promo, Today's Games, Headlines/Insights rail, Tonight's Starters, Hot Right Now, On This Day, feature strip. D-046 itself named the intended fix when it built the hero ("break the uniform density into 4-5 weights: hero > live games > pennant-races-as-viz > headlines rail > ticker") but the shipped hero never got sized to actually read as dominant.

**Kael, pushing back on the literal ask before scoping the fix:** a licensed athlete photo (what ESPN/Athletic/Bleacher Report actually use in that slot) is still the wrong tool — those sites have photo desks curating and captioning a new image daily; we don't, and an uncaptioned stock/generic photo over live data reads as filler, not authority, the opposite of DESIGN.md's "broadcast-grade" posture. The instinct that something should visually dominate the page is correct; the fix is making the *existing* generated hero bigger and bolder, not adding a module with no editorial pipeline behind it.

**Real bug found during the review, fixed in the same pass:** `css/main.css` had a second, dead `.home-hero` rule block left over from a pre-D-046 hero design (`.home-hero-title`, `.home-hero-badge`, `.home-hero-glow`, `.home-stats-strip`, etc.) — confirmed via grep that none of those classes appear anywhere in `js/` or `index.html`. Because the dead block set `text-align: center` and the live D-046 block never reset it, the current hero's headline/hook/CTA were **silently center-aligned** (confirmed both in a live screenshot and in the computed CSS) despite every other left-aligned element on the page. Removed the entire dead block (main.css, was directly above the "Sport entry cards" comment) plus two leftover responsive overrides at the 900px/600px breakpoints that referenced the same dead classes and would have fought the new hero sizing on mobile, plus one more orphaned `.home-stat-lbl` override found later in the file. `text-align: left` set explicitly on `.hero-main` so this can't regress silently again.

**Visual spec (Kael) — concrete before/after, not a redesign:**
- `.home-hero` padding: `1.1rem 1.25rem` → `2.25rem 2.25rem`.
- `.hero-headline`: `1.15rem` → `clamp(1.6rem, 1.1rem + 2vw, 2.35rem)`, tighter letter-spacing, line-height 1.12.
- `.hero-hook`: `0.85rem` → `1.05rem`.
- `.hero-row-logo` (team logos in the matchup board): `24px` → `52px` (mobile: `36px`, was unscaled before).
- `.hero-row-score` / `.hero-standings-wl`: `1.05rem` → `1.85rem`/`1.6rem`, still `--font-mono` per DESIGN.md's numeric-voice rule — this is a size change, not a typeface change.
- `.hero-kicker` (the LIVE/TODAY/race label) deliberately **not** scaled — it's part of the shared `.eyebrow`/`.hm-kicker`/`.settings-subsection-label` recipe (D-047 S4) and moving it alone would touch unrelated UI; real broadcast graphics keep the eyebrow small and let the headline carry the size jump anyway.
- Live games gain a genuinely new element, not just bigger text: the base/outs/count diamond (`.hgc-live`/`.hgc-diamond`/`.hgc-outs`) that grid cards already show, via `Scorebug.normalizeMLBGame(g).liveHtml` — the hero previously showed zero live-state detail beyond the two scores. Reuses existing styled markup, no new CSS for the diamond itself.
- Applies uniformly to all three hero variants (MLB live/upcoming, `_heroFromStandings` fallback) since they all share the same `.home-hero`/`.hero-*` classes — one CSS pass covers all of them. NFL's hero (`_heroFromNFLGame`/`_heroNFLBoard`, active Nov–Feb per `_homeHeroSport()`) gets the same visual scale-up for free from the CSS change; did not port the live-diamond addition to it since NFL has no equivalent Scorebug live-state fragment yet (`_normalizeFootball`'s `liveHtml` is always empty) — named, not built.

**Behavioral spec (Vera):** no new states — this reuses the hero's existing selection logic (live-leverage → marquee upcoming → standings fallback, unchanged) and existing click-through. The only behavioral addition is the live diamond appearing/disappearing exactly when the grid cards' own `.hgc-live` would (mid-at-bat during an active half-inning), which is data the model already computes correctly.

**Feasibility (Axiom):** no new fetch, no new data source — `_heroFromGame`/`_heroBoard`/`_heroFromStandings` already select and hold everything needed; `Scorebug.normalizeMLBGame` was already being called elsewhere in the same page load (the ticker), so calling it again for the hero's live game costs one extra cheap function call, not a fetch. Entirely a CSS + one small JS insertion. The dead-CSS removal is net risk-*reducing*, not risk-adding — it deletes unreachable rules and a rule that was silently leaking into live UI.

**Gate status:** all three gates clear directly from this pass — no follow-up spec needed.

**Shipped — 2026-08-10 (Finn).** `css/main.css`: dead pre-D-046 hero block removed (`.home-hero-title`/`.home-hero-badge`/`.home-hero-glow`/`.home-hero-content`/`.home-hero-sub`/`.home-stats-strip`/`.home-stat`/`.home-stat-num`/`.home-stat-lbl` and its two 900px/600px orphaned overrides, plus one further orphaned `.home-stat-lbl` override found later in the file), `.home-hero`/`.hero-*` rescaled per the spec above, `.hero-live-detail` added. `js/app.js`: `_heroFromGame` now normalizes the live game via `Scorebug.normalizeMLBGame` and inserts `model.liveHtml` into the hero for live games. **Verified locally:** `node --check` clean, 0 NUL bytes on both changed files, `tools/check-manifest.cjs` clean, `tools/check-themes.cjs` clean (2 pre-existing unrelated warnings only), full 33-test unit suite passing, confirmed grep-clean of every dead class name across `css/`, `js/`, and `index.html`.

**Live-verified — 2026-08-10, after push.** No repeat of D-087's edge-cache propagation delay this time (owner waited before checking; `cf-cache-status` was already `EXPIRED`/fresh on `js/app.js` and `css/main.css`). Confirmed via computed styles and a screenshot on production: hero padding 36px (2.25rem), headline ~37.6px, `.hero-main` computed `text-align: left` (the center-align bug is gone), team logos 52px, live base/outs/count diamond rendering under the score board during a live MLB game (BOS at TOR, bottom 4th, 1-2 count). Console clean, no errors. The hero now reads as clearly the dominant element on the page rather than one card among several similar-weight ones.

---

## Home — Remaining ChatGPT-brief ideas, scoped not built

**Context:** D-090 shipped the three ideas from the owner's ChatGPT-sourced homepage brief that didn't conflict with anything already decided. Everything below is framed for whoever (or whichever persona) picks it up next — none of it is gated, none of it is built. Framed per TEAM.md's own brief format (accomplish / current state / constraints / success) so the next session doesn't start from a blank page or re-litigate what's already settled.

### 1. Hero size — big single-game focal point (D-088, shipped) vs. dense multi-game "Live Now" strip (ChatGPT's #1)
**What you're trying to accomplish:** a homepage where the most important thing to look at is unambiguous. **Current state:** D-088 just scaled the existing Data-Story hero up to be the dominant element, on the owner's own direction. The ChatGPT brief's top recommendation is the opposite move — replace the single-game hero with a compact multi-game live strip (several games at once, denser, no one game privileged). Both are legitimate answers to the same real problem (the page used to read as ten equal-weight modules); they are not compatible with each other above the fold. **Constraint:** D-088 is live and working; reversing it a day later is a real design flip-flop, not a refinement — don't do it without the owner explicitly weighing the tradeoff, not just approving a brief that happened to suggest it. **Success looks like:** an explicit owner call on which model the homepage commits to, or a decision to run one for a while before reconsidering. Route to **Vera** first (JTBD: does a user open the home page to see "the one big thing" or "everything at a glance") — visual/feasibility follow from that answer, not before it.

### 2. Density philosophy — "Bloomberg terminal" vs. the ratified "broadcast-calm" posture
**What you're trying to accomplish:** decide whether SportStrata should read as a dense trading-terminal-style product or keep its current calmer broadcast-graphics identity. **Current state:** DESIGN.md's Density and Space section is explicit and deliberate — "chrome is minimal... density needs rhythm... breathing room between panels" — and that posture is load-bearing across many other ratified decisions (D-046's hero photo rejection, D-047's brand invariants, the whole "not a consumer sports app" identity). The ChatGPT brief's "reduce whitespace 30-40%, pack in more" is a real, coherent alternative product direction, not a mistake — dense terminal UIs are a legitimate category. **Constraint:** this is bigger than a homepage tweak — a real density increase would mean revisiting DESIGN.md itself, not just shipping a PR against it. Don't let this get scoped as if it were quick-win-sized; it isn't. **Success looks like:** an explicit owner ratification of which posture to hold, documented as a DESIGN.md amendment if it changes, the same way D-048's palette migration was ratified before it shipped. Route to **all three core seniors** — this is the "vague direction question, frame it, don't pre-filter" case in TEAM.md, precisely because it's a posture question, not a feature ask.

### 3. Nav rename — "Scores · Players · Teams · Analytics · Tools" vs. current "Players · Teams · Standings · Analytics · News"
**What you're trying to accomplish:** navigation labels that read as "data platform" rather than "sports media site." **Current state:** the ChatGPT brief's specific complaint — "News makes SportStrata sound like another sports media website" — is a fair critique of the *label*, but the underlying content (the Insights tab inside the Headlines/Insights rail, D-046 P3) already carries real analytical value, not just aggregated articles; renaming or removing the nav entry doesn't remove that content, just its visibility from top-level nav. **Constraint:** this is a small change with an outsized signal — nav labels are one of the most-seen surfaces on the site. Get it right once rather than iterate live. **Success looks like:** a specific proposed label set, reviewed against what's actually in each destination (not just against the vibe of the label). Route to **Vera** (IA/labeling is hers) with **Folio** consulted (nav copy is documentation-adjacent, and Folio owns copy-consistency asks like this elsewhere).

### 4. "SportStrata Intelligence" branding — naming/framing the analytics that already exist
**What you're trying to accomplish:** make the site's existing computed analytics (Monte Carlo division odds, templated Insights bullets, VBD engine, win-probability work in the NFL live viewer) feel like one coherent, brand-owned "intelligence" product rather than scattered features. **Current state:** the capability mostly already exists — D-039's October Odds, D-046 P3's Insights rail, D-080's live-game analytics tabs. This is largely a naming/presentation/information-architecture exercise, not new engineering, though it could motivate small new surfaces (e.g. a unified "what SportStrata computed today" module). **Constraint:** DESIGN.md's copy voice explicitly bans hype language ("AI-powered," "smart," "magic") — any "Intelligence" branding has to earn the word through visible receipts (the site's own existing pattern), not marketing tone, or it contradicts the brand's own stated rules. **Success looks like:** a named visual/copy treatment Kael signs off on before any code changes. Route to **Kael** first (this is fundamentally a branding/presentation question), with **Relay** consulted on which existing computed values would actually populate it.

### 5. Search bar as a full "centerpiece" (inline result previews, not just visual weight)
**What you're trying to accomplish:** searching a player from the home page shows a rich inline preview (stats, quick links) rather than just opening the existing ⌘K overlay. **Current state:** D-090's quick win only made the entry point *look* more prominent — it still opens the same `js/search.js` ⌘K overlay it always has, no new capability. The ChatGPT brief's Bobby Witt Jr. example (name → stat line → Stats/Game Log/Splits/Advanced/Compare buttons, inline on the page) is a materially bigger feature, not a styling pass — it implies either a new inline results component or pulling the ⌘K overlay's existing query logic into a persistent home-page surface. **Constraint:** this would be the first search UI on the site that isn't the ⌘K modal — a real new pattern, not a reuse. **Success looks like:** a specific states/behavior spec (Vera) before anyone estimates it (Axiom). Route to **Vera** first, per the standard "new feature idea" path in TEAM.md.

### 6. Trending Now / analytics-forward content beyond what Hot Right Now + Insights already do
**What you're trying to accomplish:** decide if there's a real content gap between what ChatGPT's brief describes ("🔥 Royals pitching staff ↓18% K rate over last 7 games") and what `_renderHomeInsights()` already produces. **Current state:** the Insights rail already generates templated stat-margin bullets from `AppState.mlbLeaderSplits` — multi-game trend framing ("down 18% over 7 games") is a different, harder computation than the current leader-plus-margin template, requiring a rolling-window comparison the stat engine doesn't currently produce. **Constraint:** don't build this assuming it's the same as what exists — check with Relay whether the trend computation is actually available from current data sources before scoping UI for it. **Success looks like:** Relay confirms feasibility of rolling-window trend stats before Vera specs the presentation. Route to **Relay** first for this one, unusually — data availability gates the idea more than UX does.

**Nothing above is gated for Finn.** Each needs at least its first-listed persona's pass before any of these move to a real three-gate spec.

---

### Team walkthrough outcomes — 2026-08-10

Owner asked the team to actually walk through all six items rather than leave them purely framed. Outcomes:

1. **Hero size.** Resolved — **keep D-088 as shipped.** Vera: this was a false conflict. Today's Games (right below the hero) already is the dense, comprehensive, all-games view the ChatGPT brief wanted; the hero's job (narrative orientation via live-leverage selection) was never competing with it. The brief's "giant card for one relatively unimportant game" critique only holds if the hero is the *only* way to see scores on the page — it isn't.
2. **Density philosophy.** Not resolved, deliberately deferred. Kael/Axiom: a real density pass reverses DESIGN.md on purpose and touches most of `main.css`/`components.css` — multi-day, not a tweak, and D-088 just moved the opposite direction (bigger, not denser) on the owner's own steer. Vera: the one legitimate angle is that Cloudflare Web Analytics (live 2026-08-09) can now actually measure scroll depth/bounce instead of guessing from screenshots. **Recommendation: wait for real analytics data before reopening this**, don't act on an LLM's aesthetic read of two screenshots.
3. **Nav rename.** Not resolved, real premise correction found along the way. `SUB_NAV_TABS` in `navigation.js` doesn't match CLAUDE.md's documented nav anymore (real: Players · Teams · Standings · **Analytics** dropdown [Leaders/Compare/Builder/Prep/Highlight/Arcade] · News — CLAUDE.md still says a flat 8-item list with no dropdown; **doc-sync gap flagged for Folio independent of this decision**). "Scores" is already present in NCAAF/NCAAB's own sub-nav specifically because the header ticker's SCORES button (`sportViews` map in `app.js`) doesn't route those two sports — MLB/NFL correctly omit it because the ticker button already covers them. Not an inconsistency; adding "Scores" generically per the brief would be redundant for two of the four sports. "Tools" would fix the Analytics dropdown's label for Builder/Prep/Highlight/Arcade but mislabel Leaders/Compare (pure stat browsing, not tools) — points toward splitting the dropdown, not just renaming it. **Recommendation: small Vera pass on splitting Analytics, not a blind rename.**
4. **"SportStrata Intelligence" branding.** Not resolved, confirmed buildable. Relay: raw material exists and is scattered (D-039 odds, D-046 P3 Insights, D-028 VBD, D-080 win-probability) — real integration work (differing refresh cadences) but no new computation. Kael: "Intelligence" isn't on DESIGN.md's banned-word list and can earn the name honestly if every number keeps its receipt, which is already the house pattern. **Recommendation: legitimate next feature to spec properly, not an opportunistic add.**
5. **Search bar as full centerpiece.** Not resolved, correctly scoped as bigger than D-090's quick win. The Bobby Witt Jr.-style inline preview would be the first non-⌘K search surface on the site — real new UI pattern needing its own states spec, even though `js/search.js`/`js/query.js` already have the matching logic to build on. **Recommendation: worth doing, route through Vera's states spec like any new feature — not started.**
6. **Trending / rolling-window stats.** **Resolved and shipped same session** (owner approved building it immediately after the walkthrough) — see "Home — Trending (last 7 days) in the Insights rail" below. Relay's find: `AppState.mlbHotStats` (`last7Days` split via `fetchMLBLeagueStats`) already existed, already fetched for the Leaderboards page's Hot tab — this was a second-consumer job, not a new pipeline, which is why it was the one item worth building same-day instead of just scoping.

---

## Home — Trending (last 7 days) in the Insights rail

**Context:** Item 6 above, shipped same session per owner approval. `js/mlb.js`'s `fetchMLBLeagueStats(sport, season, limit, 'last7Days')` already existed and was already populating `AppState.mlbHotStats` for the Leaderboards page's Hot tab — this ships a second consumer of that exact data into the home Insights rail, not a new data source.

**What shipped:** `_renderHomeInsights()` (`js/app.js`) still renders the existing season-leader bullets synchronously and unchanged, then fires `_renderHomeTrending(host)` — a new async function that ensures `AppState.mlbHotStats` is populated (reusing the identical fetch-and-compute-rates sequence the Leaderboards page uses, so behavior between the two consumers stays identical), filters to a real sample (15+ AB / 5+ IP over the 7-day window — a fluke-noise floor, same spirit as the existing qualified-starter WHIP filter already in this function), and appends up to two bullets (best last-7-days AVG, best last-7-days ERA) in a visually distinct `.rail-trending` block with its own "Trending, last 7 days" caption, kept separate from the "Season leaders through today" caption above it so the two timeframes are never ambiguous — DESIGN.md's receipts pattern applied to a timeframe claim, not just a computed value.

**Behavioral notes (Vera):** appends only when there's real qualifying data — no empty "Trending" header with nothing under it. Degrades silently (no trending block at all) if the hot-stats fetch fails, rather than showing a broken state on the home page. Re-running `_renderHomeInsights()` (it's called twice — once optimistically, once after `mlbLeaderSplits` loads) is safe: each call fully replaces `#railInsights`'s content and re-triggers the trending append, no duplication.

**Feasibility (Axiom):** zero new fetches beyond what already happens when a user visits Leaderboards — this just means Home may now trigger that same fetch itself if the user hasn't been to Leaderboards yet this session. No new AppState shape (reuses `mlbHotStats`/`_mlbHotStatsSeason`, already-established fields). No new CSS component — `.rail-trending` is one wrapper rule; the bullets reuse `.rail-insight` verbatim.

**Shipped 2026-08-10 (Finn).** `js/app.js`: `_renderHomeTrending()` added, wired from the end of `_renderHomeInsights()`. `css/main.css`: `.rail-trending` added. **Verified locally:** `node --check` clean, 0 NUL bytes, `tools/check-manifest.cjs` clean, `tools/check-themes.cjs` clean (2 pre-existing unrelated warnings only), full 33-test unit suite passing. Pending: `sw.js` bump, commit, push, live verification.

**Live-verified — 2026-08-10, after push (same edge-cache-lag pattern as prior entries, resolved on its own after ~2 minutes).** `#railInsights` rendered the season-leader bullets correctly, but `.rail-trending` never appeared and `AppState.mlbHotStats` stayed falsy. Manually invoking `_renderHomeTrending()` on the live tab surfaced the real cause: `fetchMLBLeagueStats('hitting', season, 600, 'last7Days')` was throwing `MLB API 400` — the real MLB Stats API rejects `stats=last7Days` on the league-wide `/stats` endpoint (that token is only valid as a per-player hydrate `type`, e.g. `_fetchMLBHittingSplits`). Both this new call site and the pre-existing Leaderboards Hot-tab call site (`js/mlb.js` ~4276) wrap the fetch in a swallowed `.catch()`, so the 400 has been failing silently — no console error, just an empty section — since the Hot tab shipped, and now inherited by Trending. **This is a real pre-existing bug, not something this feature introduced; it just made it visible.**

**Fix (Axiom, shipped same session):** `fetchMLBLeagueStats()` in `js/mlb.js` now detects the three rolling-window `statsType` values (`last7Days`/`last14Days`/`last30Days`), converts the request to `stats=byDateRange` with computed `startDate`/`endDate` (ET-adjusted, same pattern used elsewhere in the codebase), and leaves the `season`-type path untouched. Verified directly against the live API: `stats=byDateRange&startDate=2026-08-03&endDate=2026-08-10` returns 200 with real splits; the old `stats=last7Days` call 400s. Fixes both call sites (Leaderboards Hot tab and this Trending block) from one place — no call-site changes needed. `node --check` clean, manifest/theme checks clean, full 33-test suite passing. `sw.js` bumped to v169.

**Live-verified after push — 2026-08-10.** Confirmed `.rail-trending` renders on production with real 7-day data (`AppState.mlbHotStats.hitting.length` = 414, `.pitching.length` = 400 — a genuine API response, not a stale fallback), and the bullets showed correct AVG/ERA values. **But the bullet text itself was broken: `Keibert Ruiz () is hitting .529...` — empty team abbreviation, which also meant `_teamColor()` fell back to the default dot color instead of the real team color.** Root cause, inspected directly on the live `AppState.mlbHotStats` object: the MLB Stats API never puts `abbreviation` on a split's `team` object (only `id`/`name`/`link`) — this is true for **every** `fetchMLBLeagueStats` response, not just `byDateRange`. The existing season-leader bullets above this one don't hit this because they read from `AppState.mlbLeaderSplits`, which `_fetchMLBLeaderSplits()` runs through an id→abbreviation `enrich()` step before storing. `AppState.mlbHotStats` — populated by two call sites (Leaderboards Hot Right Now strip, and this Trending block) — never had that enrichment. It was invisible until now because the Hot Right Now strip's own data fetch has been 400ing (and silently swallowed) this whole time too, per the byDateRange bug above — so this second bug was masked by the first one until both got exercised together for the first time here.

**Fix (Axiom, same session):** added `_enrichMLBTeamAbbr(splits, season)` in `js/mlb.js` — factors the same id→abbreviation lookup `_fetchMLBLeaderSplits` already does into a reusable helper (fetches `AppState.mlbTeams` if not yet loaded, then backfills `team.abbreviation` from team id). Wired into both `mlbHotStats` population sites: the Leaderboards Hot Right Now strip (`js/mlb.js` ~4296) and `_renderHomeTrending()` (`js/app.js`). `_fetchMLBLeaderSplits`'s own working `enrich()` step is untouched. `node --check` clean, manifest/theme checks clean, 33/33 tests. `sw.js` bumped to v170.

**Live-verified after push — 2026-08-10.** Confirmed: "Keibert Ruiz (WSH) is hitting .529 over the last 7 days" / "Sandy Alcantara (MIA) has a 0.00 ERA over the last 7 days" — real team tags and colors, both bugs resolved together. **A third caching layer caught mid-verification, worth recording alongside the Cloudflare edge-cache-lag diagnostic above:** even after confirming the edge had the fresh bytes (`fetch(url, {cache:'reload'})` → `cf-cache-status: EXPIRED`, fresh content) and clearing the Service Worker + Cache Storage, a plain page navigation kept executing the *old* `_renderHomeTrending` (confirmed by inspecting `_renderHomeTrending.toString()` directly — it lacked the `_enrichMLBTeamAbbr` call even though a fresh fetch of the same URL had it). Root cause: the browser's own HTTP disk cache — a layer independent of both the SW's Cache Storage and Cloudflare's edge — was still honoring `/js/app.js`'s `max-age=14400` and serving a pre-fix copy from an earlier fetch in the same verification session, without revalidating. Unregistering the SW removes the SW's *own* cache layer but does nothing to the browser's normal disk cache. **Fix for testing (not a site bug):** an explicit `fetch(url, {cache:'reload'})` for the exact asset, run once before the next navigation, forces the browser to overwrite its own disk-cache entry with the fresh response — a plain navigation afterward then executes the current code. Checking `fn.toString()` for an expected code fragment is the reliable way to confirm which version of a function is actually running, rather than trusting `cf-cache-status` alone (that only proves the *edge* is fresh, not that *this browser* has picked it up).

---

## Live NFL preseason debugging session — 2026-08-13/14

Task / Finding: NFL Scores list + ticker go stale during live games; Play-by-Play tab duplicates the current drive
Contributor: Finn | Date: 2026-08-13

**Context:** owner asked to use a real live NFL preseason window (Week 2, three-plus games kicking off 7:00–9:00 PM EDT on 2026-08-13) as a live-debugging opportunity rather than working from synthetic data. Investigated the NFL Scores view, the shared ticker, and the live game detail panel against real, currently-playing games.

**What I found:**

1. **Scores list + ticker go stale for up to 5 minutes with no self-correction (real, reproduced).** Loaded `#nfl-games` ("Today" tab) while three real preseason games kicked off. `AppState.nflGames` stayed at all-`isLive:false`/`isFinal:false`/0-0 long after the real games had gone final or live — confirmed against a direct, uncached fetch of `/api/nfl?path=/scoreboard` (`cache:'no-store'`) showing the true state (Detroit @ Cincinnati and Green Bay @ Pittsburgh both `STATUS_FINAL`, Tennessee @ San Francisco `STATUS_IN_PROGRESS`, 16–10). The site-wide ticker's zero-state fallback fired and displayed **"No NFL scores — season runs Sep–Feb"** (`js/nfl.js:916`) while real games were actively live/final — flatly wrong copy for a live preseason night.
   - Root cause, confirmed by clearing the client cache and forcing a fresh `loadNFLGames()` call: `fetchNFLScoreboard()`'s parsing of `isLive`/`isFinal` is correct — the fresh call immediately rendered TEN@SF live 16–10 and every other game final with real scores.
   - **Correction to my own first-pass diagnosis:** I initially wrote this up as "zero live-polling in `js/nfl.js`" because a grep of that one file found no `setInterval`. That was an incomplete grep, not a real absence — `setupNFLLivePolling()` (60s interval) exists in `app.js` and does run. The real bug is subtler and worse: its early-return guard — `const hasLive = cached.some(g => g.isLive); if (cached.length > 0 && !hasLive) return;` — trusts `AppState.nflGames`'s *own current (possibly stale) belief* about whether anything is live to decide whether to bother fetching. Proved this directly: injected an all-`isLive:false` snapshot into `AppState.nflGames` while on `#nfl-games` with `currentSport:'nfl'`, waited 100 seconds (past the 60s tick twice over), and it never self-healed — the poller kept re-checking the same frozen belief and bailing every time. Once the client happens to observe "nothing is live" (trivially true before any of today's games has kicked off, or during any gap between games), the poller is **permanently stalled** until something else overwrites `AppState.nflGames` (a manual reload, or navigating away and back through a code path that unconditionally refetches). MLB's `setupMLBLivePolling` in the same file has the identical guard shape (`if (cached.length > 0 && !hasLive) return;`) — flagging as a likely-shared latent bug, not confirmed/reproduced for MLB in this session, so not in scope for the fix below.
   - File/line: `js/nfl.js` (`loadNFLGames`/`fetchNFLScoreboard`/`updateNFLTicker`, ~L149–411, L906–924); no polling setup anywhere in the file, contrast `app.js`'s `setupMLBLivePolling`.

2. **Play-by-Play tab renders the current drive twice (real, reproduced).** Opened the real live TEN@SF panel (`showNFLGame('401874392')`) and switched to Play-by-Play. Regex-scanned the rendered DOM text for drive-header lines (`TEAM · N PLAYS, N YARDS, M:SS`) — the most recent drive ("TEN · 6 PLAYS, 26 YARDS, 2:35") appeared twice, back to back, identical; every other drive appeared exactly once.
   - Root cause: `js/nflLiveGame.js` L329–330 builds the play-by-play list as `[...(drivesObj.current ? [drivesObj.current] : []), ...(drivesObj.previous.reverse())]` with no dedupe. At certain live moments (between drives, right after a score) ESPN's `drives.current` reference is the same drive already present as `drives.previous`'s most recent entry — ESPN's own API quirk, not something reproducible without a real live game at exactly the right moment.

**Secondary finding, not fixed (flagging per my scope discipline — routing to Kael/copy, not touching it):** even outside this specific bug, `updateNFLTicker`'s zero-state copy ("No NFL scores — season runs Sep–Feb") is imprecise during preseason weeks generically — it's accurate framing for the true Mar–Aug offseason but reads as wrong the moment a preseason week is underway and today just happens to have no live/final game yet. Worth a copy pass distinguishing "no games today" from "season hasn't started," but that's a Kael copy-voice call per `DESIGN.md`, not mine to make.

**Result:** both root-caused findings (1) and (2) are architectural/data-flow — routed to Axiom per the TEAM.md matrix ("Axiom diagnoses if it's obviously a data flow or AppState issue"). Both are small, well-scoped, low-risk fixes (fix the poller's self-referential stale guard; dedupe drives by id) — see DECISIONS.md D-093 for Axiom's fix record.

Escalation needed: no — both fixes proceeded same session per the established pattern (root-cause → fix → static-verify → live-verify → ship) from every prior finding this session.

**Live-verified after push (2026-08-14, `sportstrata-v175`, commit `7d35f69`).** Deployed code confirmed to contain both fixes. TEN@SF had gone final (19–13) by verification time with nothing else live yet (next kickoffs 7:00 PM EDT), so the drive-dedup fix relied on its pre-ship live comparison rather than a second live re-check — still a real live-data test, just not repeated post-deploy. The poller fix got a full live-timing proof this pass: injected a stale all-non-live snapshot into the deployed page's live `AppState.nflGames`, waited 357.8 real seconds, watched it self-heal with zero manual reload. **D-093 closed.** Full record in DECISIONS.md D-093.

---

## NFL ticker sport-mismatch on cold/deep-link load — found + fixed 2026-08-14

Task / Finding: Deep-linked/cold loads into NFL views show the wrong sport's ticker for up to 60s
Contributor: Finn | Date: 2026-08-14

**Context:** Owner asked to continue the live-debugging pattern from the 2026-08-13/14 session (D-093) using tonight's real preseason kickoffs (DEN@ATL, TB@NYJ, MIA@WSH all live at investigation time) as another live-debugging window, and to close out that session's one open thread. Investigated the shared header ticker specifically on cold/deep-linked loads into NFL views, since D-093 didn't cover that path.

**What I found (real, reproduced on production, three times independently — fresh tabs, no prior navigation):**

Loading `sportstrata.cc/#nfl-games` or `sportstrata.cc/#nfl-home` directly (not via in-app sport-switch) renders the correct NFL page and correctly populates `AppState.currentView`/`AppState.currentSport`/`AppState.nflGames` (confirmed via console: `nfl-games`/`nfl`/16 games, 3 real live) — but the shared `#scoreTicker` at the top of the page showed 200+ MLB games and zero NFL games, despite three real NFL games being live at that exact moment. Confirmed this is not a data problem (the NFL data was correct and available), it's a render race:

- `js/app.js`'s boot IIFE (the one that seeds the ticker "independently... so it works on first load") branches only on `AppState.currentView === 'home'` for the merged ticker (D-087). Every other view — including every non-home `nfl-*`/`ncaaf-*`/`ncaab-*`/`wnba-*` view — falls to an `else` branch that unconditionally fetches the MLB schedule and calls `updateMLBTicker(games)`, regardless of what sport the landing view actually is.
- On a cold load into `#nfl-games`, this races against `loadNFLGames()`'s own `updateNFLTicker(games)` call (`js/nfl.js:406`). Whichever async fetch resolves last wins — reproduced with MLB winning three separate times.
- On a cold load into `#nfl-home` specifically, there's no competing per-view ticker call at all (unlike `nfl-games`), so the ticker just stays wrong until `setupNFLLivePolling()`'s first tick, up to 60 real seconds later (timed it: self-healed at the next tick, confirmed via console before/after).
- Clicking into NFL via the in-app nav (`switchSport('nfl')` in `js/navigation.js`) does NOT have this bug — it has its own correct per-sport ticker-seed logic. The bug is specific to the cold-boot path, which never calls that logic.

**Real-world exposure:** this hits every visitor who lands directly on an NFL page rather than navigating in-app — bookmarks, shared links, and specifically the SEO landing/content path-URLs GOALS.md documents as already shipped (`/nfl/leaders`, `/nfl/game/{id}`, D-057) and the SEO stubs from D-040 Program 1. During a live preseason night, that's the worst possible first impression: a shared link to a live NFL game shows a header full of finished MLB scores.

**File/line:** `js/app.js` L149-172 (boot IIFE, the `else` branch); races `js/nfl.js:406` (`loadNFLGames`); `js/navigation.js:245-299` (`switchSport`) has the correct per-sport logic this should have reused from the start.

**Likely shared, not confirmed:** the same boot-IIFE `else` branch would produce the identical wrong-ticker bug for a cold load into any non-home `ncaaf-*`/`ncaab-*`/`wnba-*` view too (same code path, same MLB hardcode) — not reproduced for those sports this session (NFL was the one live and in-scope), flagging per Finn's scope discipline same as D-093's MLB-poller note.

**Secondary finding closed same session, not a new investigation — Kael's copy pass from D-093:** the ticker's zero-state copy ("No NFL scores — season runs Sep–Feb") was flagged in D-093 as wrong during a live preseason week with no game currently on the board, and never fixed. Fixed in this pass (see below) — routing per TEAM.md, no separate write-up needed since D-093 already fully documented the finding.

**Result:** the ticker-race finding is architectural/data-flow — routed to Axiom per TEAM.md's matrix ("AppState issue... route to Axiom"). Both this fix and the D-093 copy-pass carryover shipped same session. Full fix record in DECISIONS.md D-094.

Escalation needed: no — small, scoped, low-risk fix (reuse existing per-sport logic, no new architecture), same bar as every D-093 fix.

**Fix status:** committed locally, `sw.js` bumped v175→v176, pending owner push. Not yet live-verified on production (no push access from this session) — next session (or the owner directly) should confirm on `sportstrata.cc` that: (1) a fresh load of `/#nfl-games` and `/#nfl-home` shows the NFL-exclusive ticker immediately, not MLB; (2) the zero-state ticker copy reads "No NFL games today — check back soon" during any current preseason gap between games, not "season runs Sep–Feb"; (3) `sw.js` reports `sportstrata-v176` after deploy.

---

## NFL Live Game Viewer audit + real /scoreboard staleness bug — 2026-08-14

Task / Finding: Full tab-by-tab audit of the live game panel against real live games; found a real edge-cache staleness bug on /api/nfl?path=/scoreboard
Contributor: Finn | Date: 2026-08-14

**Context:** Owner asked to keep pushing on NFL UX using tonight's live preseason window, this time diving specifically into the Live Game Viewer (`js/nflLiveGame.js`, D-080). Opened a real live game (DEN@ATL, event `401873278`, 3 real games live simultaneously: DEN@ATL, TB@NYJ, MIA@WSH) and went through every tab.

**Live Game Viewer audit — all healthy, no new bugs found in the viewer itself:**
- **Summary:** linescore, scoring plays, Injury Report (9 listed, correct team grouping), NFL News (collapsed by default, expands to 5 real headlines, confirmed by clicking), Standings card (both teams' own divisions, correct highlight), venue/odds caption — all rendering real data correctly.
- **Play-by-Play:** drives rendering correctly, **re-checked the D-093 drive-dedup fix against a fresh live game and it holds** — scanned rendered drive headers programmatically, zero duplicates across 5 drives.
- **Box Score:** real per-player passing/rushing/receiving/defensive lines for both teams, updating live.
- **Team Stats:** real total yards/passing/rushing/first downs/3rd down/penalties/turnovers, both teams.
- **Analytics:** Success Rate and Drive Efficiency are real, computed live from this game's own drives (confirmed values changing between checks: 56%→59% DEN success rate as the game progressed) — honestly caveated ("EPA, CPOE, and Win Probability... coming later (D-081)"), not overclaiming what it doesn't have.
- **Fantasy:** Standard/Half-PPR/PPR toggle, live-computed points from box score stats, correct.
- Console clean throughout (no errors observed across all six tabs).

**Real bug found — NOT in the viewer, in the shared scoreboard proxy it (and the Scores view, and the ticker) all depend on:** `/api/nfl?path=/scoreboard` served a genuinely frozen response for well over its documented 60-second TTL. Direct evidence: querying the endpoint at the start of this investigation returned `"11:39 - 1st"` for DEN@ATL — the exact same value the site had shown at the very start of tonight's session, well over 20 minutes of real elapsed time earlier, during which ESPN's own live scoreboard (cross-checked directly on espn.com) had moved on to `"4:14 - 1st"`, a 7+ minute swing that cannot happen in real time. A follow-up request moments later jumped straight to `"4:28 - 1st"`, and subsequent requests then tracked normally (`3:31`→`3:20`→`3:20`→...). This points to an intermittent, not constant, staleness failure — the cached edge copy can persist far longer than its nominal TTL under low-traffic conditions, then self-correct once a request happens to miss.

**Root cause:** `functions/api/nfl.js`'s upstream fetch to ESPN uses Cloudflare's `cf: { cacheTtl, cacheEverything: true }`, which is a *best-effort* eviction hint, not a guarantee — Cloudflare's own docs describe cache-TTL enforcement as advisory. With a single, unvarying cache key per path (no per-request differentiation), a lightly-trafficked PoP can keep serving the same cached object well past its intended lifetime if nothing happens to force a fresh fetch.

**Real-world exposure:** this is the data source behind the Scores view, the shared ticker, and (with a shorter, 20s TTL) the Live Game Viewer's `/summary` calls — i.e., every "live" surface on the NFL side of the site. A visitor could see a frozen score/clock for an unpredictable, potentially long stretch during exactly the moments (live games) freshness matters most. Spot-checked `/summary` (20s TTL) over a 40-second window during this session and did not reproduce the same severity there, but it shares the identical caching mechanism — flagging as the same root cause, not confirmed at the same severity, since low-traffic conditions are what triggers it and `/summary` gets hit more often per active viewer.

**Result:** routed to Relay (API/caching architecture, per TEAM.md: "API contract issue... caching → Relay, Axiom for implementation"). Fix scoped and shipped same session — see DECISIONS.md D-095.

Escalation needed: no — the fix is additive (one query param) and doesn't change response shape, status codes, or the allowlist; verified ESPN tolerates the extra param before shipping.

**Fix status:** committed locally, pending owner push. Cannot be live-verified from this session the way the client-JS fixes were (this is a server-side Pages Function; the fix only takes effect once deployed) — next session or the owner should watch a live NFL window after deploy and confirm `/api/nfl?path=/scoreboard` never repeats a stale clock value across a real multi-minute span the way it did here.

---

## NFL Scores dashboard — live down/distance/possession on game cards (D-096)

Task / Finding: Feature — surface real down/distance/possession/red-zone data already fetched but unused on the Scores grid
Contributor: Vera (spec) / Kael (visual) / Axiom (build) | Date: 2026-08-14

**What we're trying to accomplish:** owner asked to keep improving the NFL games dashboard after tonight's bug-fix passes (D-093/094/095). The Scores grid (`#nfl-games`) only ever showed score + clock for a live game — no sense of what's actually happening on the field without clicking into the full Live Game Viewer. ESPN's own scoreboard shows down/distance/last-play/field position directly on every card; ours didn't, even though the exact same data is already in the payload.

**Current state:** `fetchNFLScoreboard()` (`js/nfl.js`) already fetches `comp.situation` on every `/scoreboard` call (confirmed live: `down`, `distance`, `shortDownDistanceText`, `possession` team id, `isRedZone` all present and correct on real live games checked tonight — DEN@ATL, TB@NYJ, MIA@WSH) but drops the field entirely during normalization. Zero new fetches needed.

**Spec (Vera):** show a compact situation line — `"{possessing team} · {down} & {distance}"` (e.g. `"TB · 2nd & 8"`) — under the existing status pill, live games only. States: no line at all when not live, when `situation` is null (ESPN's `down: -1` sentinel right after a score/timeout/kickoff — a missing line beats a nonsensical "0th & 0"), or when the possessing team can't be resolved (falls back to just the down/distance text, no dangling separator). No new interaction, no click target change — the whole card is already clickable through to the Live Game Viewer for anyone who wants play-by-play depth.

**Visual (Kael):** reused `.game-weather`'s exact recipe (small caption, top divider, center-aligned, truncates) rather than inventing a new pattern — same house rhythm the card already uses for MLB's weather caption. Red zone (`isRedZone: true`) colors the line `--color-loss` red — not decoration, a real field-position threshold (opponent's 20), which DESIGN.md's color rule explicitly sanctions borrowing win/loss for ("thresholded values... may borrow win/loss"). No new tokens, no border-color changes — border stays team-identity per DESIGN.md's border=identity/badge=state rule, this is a badge-equivalent text treatment, not a border change.

**Feasibility (Axiom):** confirmed no architectural change — pure data-parsing addition in the existing `fetchNFLScoreboard()` normalizer plus one conditional line in `_createNFLGameCard()`. Live-previewed against real production data before shipping (injected the parsing logic against a real `/scoreboard` fetch and the CSS + a rendered preview element into the live page) — computed real values (`"ATL · 2nd & 10"`, `"TB · 2nd & 8"`, `"WSH · 1st & 10"`) for all three currently-live games, visually confirmed legible against the live dark theme, red-zone variant confirmed readable.

**Verified locally:** `node --check` clean on `js/nfl.js`, 0 NUL bytes, brace-balance check clean on `css/components.css`, grep confirmed no cascade conflict (only the 3 new references to `.game-situation`/`.game-situation--redzone` exist anywhere in css/js), `--color-loss` token confirmed present in both themes. Full unit suite 40/40, manifest clean, theme check clean (2 pre-existing unrelated WARNs only). `sw.js` bumped v176→v177.

**Not yet live-verified after deploy** — pending owner push. Next check: confirm the situation line renders on a real live card in production, disappears correctly on final/scheduled cards and during dead-ball/kickoff moments (down:-1), and the red-zone color triggers correctly the next time a live drive reaches the 20.

---

## NFL Scores dashboard — competitive positioning: broadcast network caption (D-097)

Task / Finding: Feature — live competitive audit vs. CBS/NFL.com/Yahoo Sports, surface broadcast network (already-parsed dead data), queue inline leaders, decline weather/odds
Contributor: Vera (audit/spec) / Kael (visual) / Axiom (build) | Date: 2026-08-15

**What we're trying to accomplish:** owner asked, after D-096's down/distance feature shipped and verified, to consider how SportStrata's NFL data display compares to industry competitors and where we can match or beat them. Live-reviewed CBS Sports, NFL.com, and Yahoo Sports' NFL scoreboards against our own Scores grid.

**Findings cross-referenced against our own live `/scoreboard` payload (not assumed):**
- Broadcast network (CBS/Yahoo/NFL.com all show it): `comp.broadcasts` already parsed by `fetchNFLScoreboard()` since D-043, but only ever consumed by the Home hero — never rendered on the Scores grid card. Zero new fetch cost.
- "Current play" text (NFL.com's marquee treatment): already shipped in SportStrata's Live Game Viewer (`.nlg-lastplay`), confirmed live — just not duplicated onto the compact grid card, deliberately (see below).
- Inline game leaders (CBS/Yahoo pattern): confirmed live that `comp.leaders` is present on the same response already fetched, shape confirmed usable. Zero new fetch cost — but not built this pass.
- Weather + betting odds (Yahoo's pattern): confirmed live, both domed and outdoor venues, that neither exists on `/scoreboard` at all. Real new scope (weather API, or per-game `/summary` for `pickcenter` odds) — Relay's domain.

**Decision:** shipped the broadcast network caption only, this pass. Declined to duplicate the current-play banner onto the grid (already exists in the Live Game Viewer; the grid card is a dense 3-wide tile and ESPN's play text is unbounded free text — a real overflow risk DESIGN.md's density rule flags). Queued inline leaders for a future pass pending its own visual gate — it's a bigger addition to an already 4-line card and needs Kael's design pass on narrow-width behavior, not a same-session bolt-on. Declined weather/odds this pass — not available from the current data source, real new scope outside NFL-display polish.

**Bug caught by live-preview before shipping:** the original `comp.broadcasts?.[0]` selector (any market, first entry) was tested against tonight's full slate before writing to disk. Local-only preseason games (no national feed) returned long, low-value strings — `"Bengals Preseason TV Network"`, `"WUSA9"` — that would have overflowed the compact date line and added noise a national audience doesn't recognize. Fixed to `market: 'national'` only, no fallback; local-only games correctly show no caption.

**Verified locally:** `node --check` clean on `js/nfl.js`, 0 NUL bytes, no new CSS added (reuses `.game-date`'s existing `" · "` separator recipe, same one `.game-status` already uses for its clock). `sw.js` bumped v177→v178.

**Verified live before shipping:** ran the corrected logic against a real production `/scoreboard` fetch (10 games, live + upcoming, mixed national/local-only) — clean short national names (`ESPN`, `NFL Net`, longest 11 chars) on games with a national feed, empty on local-only games as intended. Injected the corrected render onto real live cards in production and screenshotted — caption sits cleanly on the date line, no wrap, no collision with the D-096 situation line beneath it.

**Not yet live-verified after deploy** — pending owner push. Next check: confirm the caption renders correctly on real production cards and stays absent on the local-only preseason games that should show nothing.

**Live-verified after push (2026-08-15, `sportstrata-v178`).** Confirmed correct on real production cards — clean captions on national-network games, silent on local-only games, no wrap, no regression. D-097 closed.

---

## NFL Scores dashboard — game-wide stat leaders on cards (D-098)

Task / Finding: Feature — the third item queued from D-097's competitive audit (broadcast network shipped, current-play banner already existed, leaders queued pending its own visual gate)
Contributor: Vera (spec) / Kael (visual) / Axiom (build) | Date: 2026-08-15

**What we're trying to accomplish:** ship the last "free" competitive-parity item from D-097's CBS/Yahoo audit — game-wide passing/rushing/receiving leaders — now that it has its own design pass rather than being bolted onto D-097 blind.

**Data confirmed live:** `comp.leaders` returns exactly one leader per category (game-wide, not per-team), 3 categories, present for live and final games, absent for scheduled (ESPN omits the field pre-kickoff — no new empty-state logic needed). Same `/scoreboard` response the grid already fetches.

**Visual decision:** text-only, no headshots — a deliberate divergence from CBS/Yahoo's photo-tile pattern, per DESIGN.md's "professional data tool, not a fantasy casino" posture and to keep this a genuinely zero-new-cost feature (no new image requests). Reused the `.game-weather`/`.game-situation` bordered-caption recipe; deduped the divider when it stacks directly under D-096's situation line so live cards don't show two redundant borders back to back.

**Verified locally:** `node --check` clean, 0 NUL bytes, CSS balanced, grep confirmed no cascade conflicts. Full unit suite (6 files) clean, manifest clean. `sw.js` bumped v178→v179.

**Verified live before shipping:** real leader data injected onto real live and synthetic-final cards in production, screenshotted both the deduped-divider (live) and standalone-divider (final) paths — clean, no wrap, no overflow even on the longest real stat line seen tonight.

**Not yet live-verified after deploy** — pending owner push.

**Live-verified after push (2026-08-15, `sportstrata-v179`).** Confirmed correct on real production cards — both divider paths hold, real values render, scheduled games stay clean. D-098 closed.

---

## Home hero — tie in NFL live-game features (D-099)

Task / Finding: Feature — reuse D-096/D-097/D-098's Scores-grid live detail (situation/broadcast/leaders) inside the NFL home hero, which showed none of it despite already fetching the data
Contributor: Vera (spec) / Kael (visual) / Axiom (build) | Date: 2026-08-15

**What we're trying to accomplish:** owner asked how to tie tonight's new NFL live-game features into the main homepage hero.

**Finding:** `_heroFromNFLGame()` already receives the full game object (situation/broadcast/leaders all present) via `_renderHomeHeroNFL()`'s `fetchNFLScoreboard()` call, but only ever rendered a bare score board — same gap MLB's hero already fixed for itself (D-047 S2, reusing `Scorebug`'s `liveHtml`). Fixed by reusing the exact `.game-situation`/`.game-leaders` markup already shipped for the Scores grid inside `.hero-live-detail` — zero new CSS, zero new fetches.

**Verified live before shipping:** patched the real production home page's hero DOM to force-render the NFL hero path (bypassing the calendar gate for the preview only) against a real live game — confirmed clean render, screenshotted.

**Verified locally:** `node --check` clean, 0 NUL bytes, full unit suite clean, manifest clean. `sw.js` bumped v179→v180.

**Flagged, not resolved — real decision for the owner:** `_homeHeroSport()`'s Nov–Feb calendar gate means this new hero treatment is currently unreachable in production. It's not just preseason — September and October (the actual first ~9 weeks of the NFL regular season) are excluded too, every year, by design. Full option writeup in DECISIONS.md D-099.

**Not yet live-verified after deploy** — pending owner push, and pending the calendar-gate decision before it's even reachable in production.

---

## Home hero — cross-sport leverage scoring replaces calendar gate (D-100)

Task / Finding: Feature — owner-decided resolution to D-099's flagged gap (NFL hero content unreachable outside Nov-Feb)
Contributor: Owner (decision) / Vera (spec) / Axiom (build) | Date: 2026-08-15

**Decision:** owner chose cross-sport leverage scoring (option c of three presented in D-099/D-100) over widening the calendar window or leaving it as-is — the only option that surfaces real live NFL action (preseason included) on the homepage.

**Build:** `_renderHomeHero()` now compares MLB's and NFL's best live (or, absent any live game, best upcoming) candidate on a shared scoring currency (`_nflLeverage`/`_nflMarquee`, calibrated to MLB's existing `leverage()`/`marquee()` range) and picks the higher-scoring sport. Zero new CSS, one new proxied fetch per home load (NFL scoreboard, cached same as the NFL Scores page).

**Verified live before shipping:** caught and corrected a false-negative in the first verification pass (reloading `/js/app.js` from the live server tested the *deployed* pre-D-100 code, not local edits) by injecting the real on-disk source directly and confirming with real synthetic data both directions of the comparison (high-leverage NFL beats real live MLB; low-leverage NFL loses to it) plus the true no-NFL-live fallback case. Also re-confirmed the `max-age=14400` browser HTTP-cache gotcha (D-097) affects `app.js` too — needed a second hard reload mid-session.

**Verified locally:** `node --check` clean, 0 NUL bytes, full unit suite clean, manifest clean. `sw.js` bumped v180→v181.

**Not yet live-verified after deploy** — pending owner push.

**Live-verified after push (2026-08-15/16, `sportstrata-v181`).** Confirmed correct on a real production load — NFL's upcoming LAR@KC won the hero over MLB via the followed-team bonus + national broadcast, the first real (not synthetic) confirmation the cross-sport comparison works end-to-end. Zero console errors. D-100 closed.

---

## NAV + SEO cohesion session — 5-sport consolidation, 2026-08-15

**Trigger (owner):** revisit nav/menus for cohesion now that NCAAB and WNBA are both live alongside MLB/NFL/NCAAF, and get ahead of NFL's growing tool surface before it turns into sprawl. Full framing and team positions in DECISIONS.md D-102 — findings below are the concrete, actionable pieces that came out of it.

### SEO: NCAAB and WNBA have no edge-rendered path URLs — zero crawlable landing pages
**Contributor:** Axiom (feasibility) + Relay (data confirm) | **Date:** 2026-08-15

Verified directly (not assumed): `functions/` has `mlb/`, `nfl/`, and `ncaaf/` subdirectories, each with `index.js` (landing page) plus `team/`, `player/` path routes, and MLB/NFL additionally have `standings.js`/`leaders.js`/`rankings.js`. There is no `functions/ncaab/` or `functions/wnba/` directory at all — both sports only have their internal `/api/ncaab*` and `/api/wnba*` data-proxy Functions (`functions/api/ncaab.js`, `ncaabstandings.js`, `wnba.js`, `wnbaathlete.js`, `wnbastandings.js`, `wnbastats.js`), which serve the SPA's own client fetches, not crawlable content. `_routes.json`'s `include` list has `/mlb`, `/mlb/*`, `/nfl`, `/nfl/*`, `/ncaaf`, `/ncaaf/*` but no `/ncaab*` or `/wnba*` entries. `tools/gen-sitemap.cjs` has zero references to `ncaab` or `wnba` (grep-confirmed). Net effect: two fully live sports (D-052, D-092), each with real Scores/Standings/Teams(/Leaders for WNBA) content, are entirely hash-routed and invisible to search crawlers — no path URL, no sitemap entry, no per-page meta/JSON-LD.

**Feasibility (Axiom):** direct clone of the pattern already proven three times over (MLB → NFL → NCAAF). No AppState change, no new external domain (same ESPN host + same-origin `env.ASSETS` already in use), no CSP change. Build: `functions/ncaab/index.js` + `functions/ncaab/team/[id]/[[slug]].js` + `functions/ncaab/team/index.js`-style listing (mirror NCAAF's exact file layout) + `functions/wnba/` equivalents, then add `/ncaab`, `/ncaab/*`, `/wnba`, `/wnba/*` to `_routes.json`, then extend `tools/gen-sitemap.cjs` with NCAAB/WNBA sections mirroring the existing NCAAF section.

**No Vera/Kael gate needed** — this is backend edge-rendering of content that already exists and already has a proven visual template (`_renderSportLanding`, D-045); it's not new user-facing UI. **Ready for Finn once Relay confirms** the existing `/api/ncaab*`/`/api/wnba*` proxies expose everything the landing/team pages need (expected yes — the SPA's live views already consume this data — but confirm before build).

### Settings panel "Default Sport" dropdown missing NCAAB and WNBA options
**Contributor:** Vera + Axiom | **Date:** 2026-08-15

`index.html`'s `#settingsDefaultSport` `<select>` (Settings panel → Default Sport) lists only `""` (no default), `mlb`, `nfl`, `ncaaf` — NCAAB and WNBA are both live in `SPORTS_META`/`SPORTS` but absent from this control, so a user cannot set either as their default landing sport even though every other nav surface treats them as full peers. Small, low-risk fix: add `<option value="ncaab">NCAAB</option>` and `<option value="wnba">WNBA</option>`. Axiom: no architecture change, this is pure markup — the value just needs to match `SPORTS_META` keys, which `ncaab`/`wnba` already do. Vera: confirm whatever reads `#settingsDefaultSport`'s stored value on boot treats an unrecognized/legacy value the same safe way it already handles `""` (falls through to the sport picker), so this doesn't need its own new state. Ready for Finn.

### Nav rename / Analytics dropdown split — reopened, still unresolved since 2026-08-10
**Contributor:** Vera | **Date:** 2026-08-15

Restating and extending the 2026-08-10 finding ("Home — Remaining ChatGPT-brief ideas" item 3) since it never got picked up: `SUB_NAV_TABS.mlb` and `SUB_NAV_TABS.nfl` both have an "Analytics" dropdown that mixes pure stat-browsing (Leaders, Compare) with tools (Builder, Prep, Highlight, Arcade for MLB; Highlight for NFL) — "Analytics" doesn't accurately describe either half. Separately, NFL's "Fantasy" sub-nav dropdown is a flat 10 items (Value Board, ADP Rankings, Schedule, Compare, Mock Draft, My Drafts, My League, Trending, Injury Report, Waiver Wire) even though `MENU_TABS.nfl` already splits the same content into "Draft Prep" and "In-Season" groups for the mobile menu panel — the sub-nav dropdown should mirror that grouping rather than staying flat. **Recommendation (unchanged, now the top of my queue):** split "Analytics" into a stat-browsing group and a tools group; split NFL's "Fantasy" sub-nav dropdown the same way its menu panel already is. Not ready for Finn — I'll write the actual before/after label + grouping spec next, then it needs Kael's visual sign-off (dropdown rendering) and Axiom's quick feasibility check (expected trivial — more `.sub-nav-cat` entries, no new CSS) before it's gated.

### NFL Pages Function inventory needed before further NFL API surface work
**Contributor:** Relay | **Date:** 2026-08-15

`functions/api/` currently has 15 NFL-specific Functions: `nfl.js`, `nfladv.js`, `nflathlete.js`, `nflcareer.js`, `nflfp.js`, `nflgamelog.js`, `nflInsights.js`, `nflplayer.js`, `nflsearch.js`, `nflsos.js`, `nflstandings.js`, `nflstats.js`, `sleeper.js`, `sleeperLink.js`, `draftHistory.js` — plus `alertPrefs.js` which is sport-agnostic but NFL-triggered. Client-side, NFL has grown to `js/nfl.js` (109KB), `js/nflLiveGame.js` (39KB), `js/nflStandings.js` (22KB), `js/fantasy.js` (78KB), `js/sos.js` (8KB), plus shared use of `js/highlightCard.js`. No inventory currently maps which Functions have live call sites vs. which may have been superseded by a later endpoint and left in place. Before the next NFL feature adds a 16th function, do the inventory: grep each function name against `js/nfl.js`/`js/fantasy.js`/`js/nflStandings.js`/`js/nflLiveGame.js` for actual call sites, flag anything with zero live callers, and write the result as a one-time reference table (candidate home: a new "NFL API Surface" subsection under CLAUDE.md's Data Sources, Folio to place once Relay has the findings). Not a build task — a research/documentation pass.

### Doc-sync: CLAUDE.md's Nav System / Nav Routing sections were stale — fixed this session
**Contributor:** Folio | **Date:** 2026-08-15 | **Status:** fixed

`CLAUDE.md`'s "Nav / Routing" dispatch-logic list was missing the `ncaab-`/`wnba-` prefixes (both dispatch functions, `_renderNCAABView`/`_renderWNBAView`, exist and are wired in `renderCurrentView` — confirmed by reading `js/navigation.js` directly, not assumed). `_applySportUI(sport)`'s documented behavior ("Updates `#brandIcon` and `#brandSub` text only") was wrong — it re-renders `_renderSubNav`, `_renderBottomNav`, `_renderMenuPanel`, `_renderSportSwitch`, and `_applySportSearchPlaceholder` on every call, which is the entire mechanism that makes the nav data-driven per sport. The "Nav System (Three Surfaces)" section described a static, single-sport (MLB), no-dropdown 8-item sub-nav — the real system is `SUB_NAV_TABS`/`MENU_TABS`/`BOTTOM_NAV_TABS`, keyed per sport, with dropdown categories (`.sub-nav-cat`) for MLB's Analytics and NFL's Analytics + Fantasy groups. This exact gap was flagged once already on 2026-08-10 and missed even in the subsequent D-092 doc-sync pass that touched this same file. All three sections corrected in place this session; see the CLAUDE.md diff for exact wording. The "Path URLs & Edge Rendering" section also got a new paragraph cross-referencing the NCAAB/WNBA SEO gap above, so a future session hits the gap in CLAUDE.md directly rather than having to rediscover it by reading `functions/`.

### GOALS.md G6 "Sport Scope" conflicts with shipped NCAAF/NCAAB/WNBA reality — needs owner re-ratification
**Contributor:** Folio | **Date:** 2026-08-15

`GOALS.md`'s G6 section (dated 2026-07-01, last touched in that ratification pass) states: *"MLB (flagship) and NFL (live beta, D-012) are the two invested sports — the barbell... NBA and NHL are parked."* It does not mention NCAAF, NCAAB, or WNBA at all. Since that date, NCAAF went live (D-042, 2026-07-06), NCAAB went live (D-052, 2026-08-10), and WNBA went live (D-092, 2026-08-10) — all three are described throughout CLAUDE.md as fully in-scope, invested live surfaces with real feature roadmaps. This is a direct, unresolved conflict between the vision document (GOALS.md) and the architecture/decision record (CLAUDE.md + DECISIONS.md): per TEAM.md, Folio records decisions but does not resolve cross-domain conflicts or vision calls unilaterally, and GOALS.md's own header states it requires "owner + all seniors" ratification to change (see how v2 and the 2026-08-09 ads amendment were both explicitly ratified). **Not fixed — flagged for the owner to re-ratify G6** (and, while at it, G2's "MLB Depth First" framing may be worth a look too, though that one wasn't in scope of this session's nav/SEO focus).

### Root `index.html` JSON-LD / meta description are MLB+NFL only
**Contributor:** Folio + Kael (copy) | **Date:** 2026-08-15

The static `<head>` in `index.html` — the `Organization`/`WebSite` JSON-LD block and the default `<meta name="description">`/OG/Twitter tags — describes the product as "Free MLB and NFL analytics" and "Real-time MLB analytics, standings, player stats, splits, and live scores, plus no-login NFL draft tools." No mention of NCAAF (which has had its own edge-rendered landing page since D-045), let alone NCAAB or WNBA. This is the static fallback shown before `js/navigation.js`'s `_updatePageMeta()` overwrites it per-route, and before `functions/index.js`'s dynamic home edge-render (D-046 P6) kicks in for the bare `/` path — so its main exposure is non-route-specific crawl paths and any share/preview that catches the raw shell before JS runs. Lower priority than the NCAAB/WNBA landing-page gap above (that gap means there's no page to describe correctly; this one means the description of the pages that do exist is out of date), but real and cheap to fix: update the default description/JSON-LD to name all five live sports, phrased in Kael's existing brand voice (no hype words, per DESIGN.md). Not actioned this session — flagged for a future pass, ideally bundled with whatever session builds the NCAAB/WNBA landing pages so the copy update reflects the final sport list in one edit.

---

## Nav reimagine concept — 2026-08-15 (see DECISIONS.md D-103)

**Trigger (owner):** reimagine the nav using the team's full scope, spare no feature, compete with industry counterparts (ESPN, Yahoo Sports, CBS Sports). Scoped to the four sports that outgrew the original nav design — NFL (tool sprawl), NCAAF/NCAAB/WNBA (thinner nav than MLB's reference model) — while MLB stays the visual/structural baseline.

**What shipped this session:** a working interactive HTML prototype, not code against the live site. Saved to `docs/nav-reimagine-concept-2026-08-15.html` in this repo, delivered directly to the owner, and saved as a Cowork artifact for ongoing review. Demonstrates: a followed-teams rail (reads the existing unified `AuthState.follows` data, no new data layer), a full-width mega-menu replacing the current narrow `.sub-nav-menu` flyout (unified pillar structure — Scores & Schedule / Standings / Stats & Leaders / Teams / Tools(+Fantasy) — applied identically across all five sports), and a small live-state pulse dot on sport-switcher tabs with a live game in progress. Full team positions (Vera/Kael/Axiom/Relay) are in DECISIONS.md D-103.

**Not ready for Finn.** This is new-feature-idea scope per TEAM.md, same gate as any other feature this size — a prototype is not a states spec. Concrete next steps, in order:

### 1. Vera to write the real states spec
**Contributor:** Vera | **Date:** 2026-08-15
Needed before anything else: followed-teams rail empty state (no follows yet — the prototype's "+ Add team" affordance needs a real first-run treatment, not just an icon), loading state (skeleton chips, not a blank rail, per DESIGN.md's "skeletons speak" rule), error state (a poll failure shouldn't blank the whole rail, just skip refresh silently), mega-menu keyboard behavior (Tab between pillar triggers, Enter/Space to open, Arrow keys within an open panel, Esc to close and return focus — extending the existing `.sub-nav-menu` pattern's behavior, not inventing new keyboard handling), and the mobile drawer's own open/close/empty states.

### 2. Kael to review against real team logos and DESIGN.md
**Contributor:** Kael | **Date:** 2026-08-15
Prototype uses placeholder colored-chip logos; needs review against the site's actual ESPN/MLB-CDN team marks and the real light-mode variant (prototype is dark-only). Confirm the mega-panel's shared visual recipe holds up at MLB's 5-column width and NCAAF/NCAAB/WNBA's 3-column width without feeling either cramped or sparse.

### 3. Axiom to confirm the `SUB_NAV_TABS` schema widening
**Contributor:** Axiom | **Date:** 2026-08-15
Feasibility already checked (see D-103) — a `children` entry becomes `{group, items}`, optionally a `feature` block; `_renderSubNav`/`_toggleSubNavMenu` get rewritten for full-width instead of `position:fixed` narrow flyout; each of NCAAF/NCAAB/WNBA needs a one-line `hasLiveGame()` read added (MLB/NFL already compute the equivalent for their own ticker polling). No AppState shape change, no new external domain, no CSP change. Confirm this holds once Vera's real spec is in hand — feasibility was checked against the concept, not the final states spec.

### 4. This decision absorbs D-102's still-open Analytics-dropdown split
**Contributor:** Vera | **Date:** 2026-08-15
D-102 (2026-08-15, earlier this session) reopened the 2026-08-10 "Analytics" mislabel / NFL Fantasy-dropdown-grouping finding. Don't spec that separately — the mega-menu's pillar structure (Stats & Leaders vs. Tools, and NFL's Fantasy split into Draft Prep/In-Season) resolves it in the same motion. One decision, not two.

**Owner action needed:** sign off on scope — ship the followed-teams rail and the mega-menu together, or phase the rail first (it's pure reuse of existing data, smallest lift) and the mega-menu second (also closes D-102). Nothing here is built against the live site yet.

---

## D-103 post-ship live-verification — 2026-08-15 (see DECISIONS.md D-103 addendum)

Owner approved shipping D-103 directly against the live repo (superseding the phased Vera/Kael/Axiom gate above — see the DECISIONS.md addendum). Three bugs surfaced during live verification after push, each found by actually clicking the shipped feature rather than re-reading the diff, fixed same-session, and confirmed live. All three are closed — kept here as a record of what broke and why, per Folio's "delete when fixed, the fix lives in the commit" rule, this entry is the exception since it's a cross-cutting retrospective rather than an open item.

**1. Mega-panel dropdowns (Stats & Leaders / Tools / Fantasy) confined to trigger width — fixed, commit `7df7740`.**
`.mega-panel` is `position: absolute`, meant to anchor against `header` (`position: sticky`) so the dropdown spans the full header width. But `.sub-nav-cat` — the panel's actual DOM parent — was still `position: relative`, a leftover from the pre-D-103 `position: fixed` flyout system where ancestor positioning didn't matter. The containing-block search for an absolutely positioned element stops at the first positioned ancestor, so `.sub-nav-cat` silently became the panel's real containing block instead of `header`, squeezing every mega-panel down to the ~100px width of its own trigger button. Fix: dropped `position: relative` from `.sub-nav-cat`.

**2. Followed-team chips navigated to the sport's generic Teams list instead of the specific team — fixed, commits `cb2f5c1` + `bd94b8a`.**
First pass (`cb2f5c1`) added per-sport resolution (`_favRailGoToTeam`): NFL routes by abbreviation directly, MLB/NCAAF resolve abbreviation → numeric id then route by id, NCAAB/WNBA correctly fall back to the Teams list (no team-detail view exists yet for those two — not a bug). Live-verification caught a second bug in the MLB branch specifically (`bd94b8a`): it called `navigateTo('mlb-team-'+id)`, but unlike NFL/NCAAF, `_renderMLBView`'s switch (`js/navigation.js`) has no `mlb-team-` case at all — every real MLB call site reaches team detail via `showMLBTeamDetail(id)` directly. Routing through `navigateTo()` logged "Unknown MLB view" and rendered nothing. Fixed to call `showMLBTeamDetail()` directly for the MLB branch.

**3. Home page search bar did nothing when clicked — fixed, commit `1cdc80b`. Pre-existing bug, NOT a D-103 regression.**
`.home-search-bar`'s `onclick` referenced `document.getElementById('searchBtn')`, an id that has never existed anywhere in the codebase (the real trigger has always been `#globalSearchBtn`). `getElementById` returned `null`, so `?.click()` silently no-op'd. Traced via `git log -S` to the button's introduction on 2026-04-30 (commit `5bf59df`), months before D-103 — flagged here only because it surfaced during this session's verification pass, not because the nav work caused it.

**Process note:** all three were caught by actually exercising the shipped feature in Chrome (click the dropdown, click a followed chip, click the search bar) rather than by re-reading the diff — the diff alone looked correct in every case. Worth keeping live-verification as a mandatory step after any nav/routing change, not just a nice-to-have.

---

### `_NFL_TEAM_COLOR` map has real duplicate hex values across unrelated teams — mitigated locally, not fixed at the source (see DECISIONS.md D-104)
**Date:** 2026-08-15

Discovered live while verifying D-104's new Game Flow chart: `getNFLTeamColor()` returns the identical hex for several unrelated team pairs/groups —

- `#FFB612` — GB, PIT
- `#FB4F14` — CIN, DEN
- `#E31837` — ATL, HOU, KC
- `#C8102E` — NE, SF

Confirmed via a full 32-team sweep against the live map, not a guess. This is a pre-existing gap in `_NFL_TEAM_COLOR`/`_NFL_TEAM_COLOR_ALIAS` (js/nfl.js) — likely each team's color was picked independently against its own jersey/branding without cross-checking for collisions against the other 31. It surfaced concretely because the new Game Flow chart puts two teams' colors directly side by side as a 2-series legend, where a collision reads as a real dataviz failure (PIT vs GB: two indistinguishable gold bars, couldn't tell whose score was whose) — but the same duplicate colors are already in use anywhere the site renders two teams' brand colors together, e.g. the `.game-team-logo` chip backgrounds on every scores/matchup card, which have carried this same ambiguity since those cards shipped, just less visibly (a static logo chip doesn't need to be *distinguished from* the opposing chip the way two overlapping chart series do).

**What was done:** D-104's Game Flow chart works around this locally — when the away team's color would collide with (or is missing relative to) the home team's, the chart falls back to a neutral gray for the away bars instead of the colliding brand color. This makes the chart itself always readable but does not touch the underlying map.

**Not fixed:** an actual fix means either widening the map with enough teams having genuinely distinct hues (hard — several of these are real, correct brand colors that are just naturally close, e.g. multiple teams' primary color is a red or gold in the same family) or accepting some pairs need a secondary differentiator (pattern, saturation shift, etc.) beyond hue alone. That's a cross-cutting color-system decision affecting every place team colors render side by side, not a one-file patch — flagged here for a future session rather than actioned now.

---

### NFL live game header's `.nlg-situation` row (possession/down-distance/last-play) never rendered for any live game — fixed, see DECISIONS.md D-105
**Date:** 2026-08-16

`_nlgRenderHeader` (js/nflLiveGame.js) gated the row on `live && comp.situation`, where `comp` is `/summary`'s `header.competitions[0]`. Live-verified against two genuinely in-progress games (not assumed, not a single edge case): that object never carries a `situation` field in this ESPN response shape — `'situation' in data.header.competitions[0]` is `false` every time, live or not. So `comp.situation` was always `undefined` and the row's ternary always took the empty-string branch. This has presumably been true since the row shipped; nothing about this session's other changes touched it, it just surfaced while building D-105's field viewer, which needed a reliable situation source and went looking for why the existing text row wasn't already using one.

**Fixed as a byproduct of D-105:** the field viewer's new `fetchNFLLiveSituation` (js/nfl.js) fetches `/scoreboard`'s `comp.situation` instead (already proven reliable by D-096/D-104), and `_nlgRenderHeader` now reads that instead of `comp.situation`. The text row renders correctly now, same as the new graphic above it.

---

### Live-site UX audit + fixes — Vera/Finn pass, five real findings, one retracted
**Contributor:** Finn (with Vera framing) | **Date:** 2026-08-16

Ran a full click-through of production as a real user (home, MLB, NFL, NCAAF, NCAAB, WNBA — nav, search, standings, team/player pages, live game pages, error states). Found seven candidate issues; one did not hold up on closer inspection, five got fixed this session, one was investigated and deliberately left alone.

**Retracted — not a bug:** reported player heights rendering wrong (e.g. Judge as 8'7" instead of 6'7") based on a zoomed screenshot. Direct DOM/API inspection on the live page (`person.height`, the rendered `.bio-value` text) shows the correct value in both places. This was a screenshot/zoom rendering artifact, not a site defect — no code changed.

**Fixed, live-verified against production before commit (console injection / monkey-patch of the actual new code, since nothing was pushed yet to test end-to-end):**
1. NFL/NCAAF home page "This Week's Games" cards were not clickable — `_loadFootballLandingData()` (js/app.js) built the cards but never called the existing `_wireHomeGameCardClicks()` helper that every other home grid already uses. One line added; confirmed live that clicking a card now calls `navigateTo()` and actually routes to the game page.
2. NCAAB's score ticker showed NCAAF's football-specific offseason message ("season runs late Aug–Jan") when NCAAB itself had no games — `updateNCAABTicker()` (js/ncaab.js) used to bail out silently instead of setting its own idle state, unlike every sibling sport. Brought it in line with the MLB/NFL/NCAAF pattern; confirmed live it now shows "No college hoops scores — season starts in November".
3. Long team names truncated with no way to see the full name — `.standings-team-name` (120px) and `.game-team-name` (90px) in css/components.css were both narrower than real content needs. Widened to 180px/140px (measured against real rendered text on the live site first), added a mobile override, and added `title=` tooltips on every team-name element across js/mlb.js, js/standings.js, js/ncaaf.js, js/ncaab.js, js/wnba.js, js/nfl.js. Confirmed live: zero truncated names remain on MLB Standings (10 checked) or NFL Scores (32 checked) with the fix applied.
4. `ApiCache.set()`'s quota-exceeded eviction (js/cache.js) only ever retried once per page session (`#evictRetried` was a one-shot flag) — every quota failure after the second one failed silently for the rest of the visit, which is exactly the 33-warnings-in-one-session behavior observed live. Replaced the one-shot flag with a 30s cooldown so eviction keeps recovering instead of giving up permanently. Verified the fixed control-flow logic in isolation (fast-cooldown unit test): evicts on first failure, skips during cooldown, evicts again once the cooldown passes.

`sw.js` CACHE_NAME bumped v191 → v192 (all four JS/CSS fixes touch cached static assets).

**Investigated, deliberately not fixed:** loading splash (#bootSplash) appeared to sit over already-rendered content for 2-3+ seconds on first observation. Re-measuring with `performance.getEntriesByType('navigation')` on a warm-cache load showed it clearing in ~1.2s — the original observation was likely a cold/uncached load, and I couldn't reliably reproduce the slow case to re-measure it. The current mechanism (double-rAF after script execution + an 8s hard fallback) is a generic, view-agnostic safety design; tying it to real per-view content-readiness instead is a bigger change with a real regression risk (get it wrong and every page load is stuck at a flat 8s). Left as-is rather than ship a fix I couldn't verify. Worth a proper look with real network throttling in a follow-up session.

Full audit report (all seven original findings, plus what wasn't tested — mobile breakpoints, NFL Mock Draft end-to-end, follow/star toggle) delivered to the owner as a standalone file, not duplicated here.

**Escalation:** none. All four fixes are small, scoped, single-file-or-shared-CSS-class changes within Finn's normal execution lane — no architecture or AppState shape changes, no design-system additions (only widened existing token-free pixel values already local to their own rules).


---

### NFL team pages gain "Recent Games" / "Upcoming" (parity with MLB's showMLBTeamDetail) — and a real fix for UX-audit finding #7 along the way
**Contributor:** Finn/Axiom | **Date:** 2026-08-16

**Ask:** bring MLB's click-a-team → see recent games + upcoming games capability to NFL team-detail pages (the two sports had drifted: NFL's Schedule section only ever showed a single "Next game" mini-card, sourced from whatever week `AppState.nflGames` happened to already have loaded).

**Root cause / data gap:** MLB gets both halves from one MLB Stats API `/schedule?teamId=` call. NFL had no equivalent — the only NFL game data already in memory is the *current week's* scoreboard, not a full per-team slate. ESPN does expose the right resource (`/teams/{abbr}/schedule`, confirmed live: with no `season`/`seasontype` params it returns whatever ESPN considers "current" — right now that's this team's 3 preseason games, both played and upcoming, in one response; `season=2025&seasontype=2` returns the full completed 17-game regular season with real scores), it just wasn't in the `functions/api/nfl.js` proxy's allowlist.

**Fix — reused existing plumbing, no new endpoints:**
- `functions/api/nfl.js`: `ALLOWED_PATHS` widened to also permit `/teams/{2-4 letters}/schedule` (still not an open proxy — everything else stays rejected).
- `js/nfl.js`: new `fetchNFLTeamSchedule(abbr)` (same `espnNFLFetch`/`ApiCache` path every other NFL fetch already uses) plus `_nflRecentGamesCard`/`_nflUpcomingCard`, built by copying MLB's `_mlbRecentGamesCard`/`_mlbTeamUpcomingCard` structure and class names (`.stats-card`, `.detail-section-title`, `.roster-list`, `.roster-row`, `.roster-row--clickable`) — no new CSS classes invented for the cards themselves. `showNFLTeamDetail` fetches the schedule alongside the existing standings fetch (own try/catch, degrades to `[]` on failure); `_renderNFLTeamDetail` splits it into completed (desc, max 12) vs not-completed (asc, max 6) the same way MLB does, and falls back to the old "schedule posts once the season nears" placeholder only when both are empty. Rows navigate via `navigateTo('nfl-game-' + id)` — the same route the Scores grid's cards already use, so it's the existing win-probability/leaders/scoring-plays game page, not a new one. `_renderTeamPage` (the shared NFL+NCAAF team-page renderer) was **not** touched — NCAAF's existing single-game "Schedule" card is unaffected.

**Bug found and fixed along the way — closes UX-audit finding #7 ("Score digits render visually garbled on team pages"), previously logged as unverified:** building the NFL cards by copying MLB's row markup verbatim reproduced a real overlap live — the score column rendered on top of the date/opponent column instead of beside it. Root cause: `.roster-row` (css/components.css) is a 3-column CSS Grid with named areas (`avatar`/`info`/`stats`) built for *player* rows. A bare two-`<div>` game row with no `grid-area` gets auto-placed into the 44px "avatar" cell and overflows into "info" — exactly the "ghosted overlapping digits" Finn saw on the Yankees page during the earlier audit and couldn't confirm from a screenshot alone. It's the same root cause on both sports, since MLB's Recent Games/Upcoming cards use the identical bare-two-div pattern. Fixed at the shared class instead of patching two call sites: added `.roster-row--split` (`display:flex; justify-content:space-between`) and applied it to the game rows in **both** `js/nfl.js` and `js/mlb.js` (`_mlbRecentGamesCard`, `_mlbTeamUpcomingCard`). Player roster rows (which use `.roster-avatar`/`.roster-info`/`.roster-stats` and rely on the grid) are untouched.

**Verified live before commit:** console-injected the new functions into the production KC and Yankees team pages (with the schedule fetch temporarily pointed straight at ESPN's public endpoint, since the proxy allowlist change can't be live-tested pre-deploy) and confirmed — completed-season data (12 Recent Games rows, correct W/L colors, correct scores, clean two-column layout, all 12 clickable), future-season data (6 Upcoming rows, correct date/time, clean layout), a real click-through to `#nfl-game-{id}` landing on the existing game page for a not-yet-played game, and — after the CSS fix — the same clean layout re-confirmed on the live Yankees MLB page, including a currently-LIVE game row rendering correctly.

`sw.js` CACHE_NAME bumped v192 → v193 (functions/api/nfl.js is not cached by the SW, but js/nfl.js, js/mlb.js, and css/components.css all are).

**Not done / left alone:** section order on the NFL page differs from MLB's (NFL's Recent Games/Upcoming sit after Roster/Assets; MLB's sit before Roster) — `_renderTeamPage`'s composition order wasn't changed since NCAAF also depends on it and reordering would move NCAAF's Schedule card too, which wasn't asked for. Worth a follow-up if visual parity down to section order matters. Postseason schedule (`seasontype=3`) isn't specially handled — a playoff team's postseason games won't appear until `_nflSeasonPhase()`-style branching is added, same gap the "current phase" default has for any phase ESPN doesn't consider active.

**Escalation:** none.


---

### NFL Recent Games / Upcoming shipped in the wrong place on the page — moved up to match MLB
**Contributor:** Finn | **Date:** 2026-08-16

Owner feedback right after the previous entry shipped: the new Upcoming/Recent Games cards were real and worked, but sat at the very bottom of the NFL team page — after the entire 9-group, 90+ player roster — so the page read as "a long unorganized page" rather than a feature. Root cause: `_renderNFLTeamDetail` fed the new cards into `_renderTeamPage`'s existing `m.scheduleHtml` slot, which that shared function always renders dead last, after the roster. That slot was fine for the old single "Next game" mini-card (a minor afterthought), wrong for a real Recent Games/Upcoming feature that's supposed to be one of the page's main draws — MLB puts the equivalent cards right after the Team Batting/Pitching card, well before the roster.

**Fix:** `_renderTeamPage` (js/nfl.js, shared by NFL and NCAAF) gained a second, optional slot — `m.scheduleHtmlTop` — rendered right after the Team Record card and before Top Fantasy Assets/Roster, mirroring MLB's order. `_renderNFLTeamDetail` now feeds the Upcoming/Recent Games block into `scheduleHtmlTop` instead of `scheduleHtml`. NCAAF's call site (js/ncaaf.js) was **not touched** — it still only populates `scheduleHtml` (its single-game "Schedule" card), which still renders in its original bottom position; `m.scheduleHtmlTop || ''` is a no-op for it. New page order: header → Team Record → Upcoming → Recent Games → Top Fantasy Assets → Roster.

`sw.js` CACHE_NAME bumped v193 → v194 (js/nfl.js is a cached static asset).

**Escalation:** none.

---

### Mega-panel nav dropdowns (Stats & Leaders, Fantasy, and MLB's Tools) render shrink-wrapped instead of full-width
**Contributor:** Finn | **Date:** 2026-08-16

Owner report: "when clicking tools on an nfl page the drop down does not load cleanly." Live repro on the NFL Teams page confirmed it — clicking "Stats & Leaders" or "Fantasy" opened a narrow, left-shifted column hugging the trigger button instead of D-103's intended full-width mega-panel. Same shared CSS applies to every sport's mega-panel pillars (MLB's "Tools"/"Stats & Leaders" included), so this wasn't NFL-specific — it just happened to be reported from an NFL page.

**Root cause:** `.sub-nav-menu` (css/main.css) is `display: flex; flex-direction: column`. `.mega-panel` — applied to the same element alongside `.sub-nav-menu` — overrides `position`, `border-radius`, and the border sides, but never resets `display`. With the flex box still in force, `.mega-grid`'s `max-width: var(--max-width); margin: 0 auto` no longer behaves like a normal block-level "fill then center" container: flexbox auto-margin absorption shrinks the flex item down to its content size along the cross axis and centers *that*, instead of letting it grow to the full header width first. Confirmed live by toggling `display: block` on a `.mega-panel` element via an inline style override in the console — the grid immediately recomputed to the full 1440px `--max-width`, centered under the header.

**Fix:** added `display: block;` to the `.mega-panel` rule (css/main.css) so it fully overrides `.sub-nav-menu`'s flex layout instead of only partially overriding it. No JS changes, no new classes.

**Also investigated — "the same issue also occurs when clicking on your account icon":** could not reproduce a rendering bug on either candidate component. The avatar menu (`.auth-menu`, css/auth.css) opened cleanly via a real simulated click — correctly positioned top-right, no overlap, no shrink-wrap artifact (it's a plain `position:absolute` menu, unrelated to the `.mega-panel`/`.sub-nav-menu` flex system). The settings drawer (`#settingsPanel`/`.settings-panel-drawer`) also opened and closed cleanly once given time for its CSS transition to finish; an earlier premature read of its transform mid-transition had looked like a stuck-closed state but wasn't. Leaving this as resolved/false-alarm for now; flagging that if the owner still sees something odd on the account icon specifically, it needs a screenshot or more precise repro steps since both candidates test clean in isolation.

`sw.js` CACHE_NAME bumped v194 -> v195 (css/main.css is a cached static asset).

**Escalation:** none.

---

### Mobile sport-switcher didn't show the active sport on cold/deep-link loads into NCAAF/NCAAB/WNBA
**Contributor:** Axiom | **Date:** 2026-08-17

Owner report: "when a user opens the site on mobile, the sports switcher aspect of the nav isn't loading properly." Live repro (real DOM/CSS state pulled from production, not guessed): below 768px `.sport-switch` (css/main.css) is a fixed `max-width: 140px` horizontally-scrollable strip — sized in the 2026-08-09 header-overflow fix, when it held 3 sports (MLB/NFL/NCAAF). NCAAB (D-052) and WNBA (D-092) have since brought it to 5 pills with no revisit to that width budget. A cold or deep-link load into NCAAF, NCAAB, or WNBA rendered `_renderSportSwitch()`'s output at the strip's default (leftmost) scroll position — confirmed live via `sw.querySelector('.sport-switch-btn--active')`'s bounding rect falling entirely outside the visible 140px box, `scrollLeft: 0`. The active pill existed in the DOM with the correct `aria-pressed`/active class, it just wasn't visible, and nothing scrolled it into view — on a WNBA/NCAAB/NCAAF page, mobile users saw MLB/NFL with neither highlighted, which reads as the switcher not having loaded their current context. No console errors, no JS failure — a pure CSS/UX gap, not a script bug.

**Fix:** `_renderSportSwitch(sport)` (js/navigation.js) now calls `scrollIntoView({ block: 'nearest', inline: 'center' })` on the active pill after every render. No-op on desktop or whenever the pill is already visible; JS-only, no new classes, no CSS changes. Live-verified (headless viewport-resize wasn't reliable in this session's browser automation, so the 140px mobile constraint was reproduced by applying the real mobile media-query declarations as inline styles to the live `.sport-switch` element) — before the fix, loading `#wnba-home` left the WNBA pill's bounding rect entirely outside the 140px box; after, `scrollLeft` moved from 0 to 250 and the pill sits fully inside the box, confirmed both by rect math and a zoomed screenshot.

`sw.js` CACHE_NAME bumped v195 → v196 (js/navigation.js is a cached static asset). Commit `c02b806`.

**Not done / flagged, not fixed:** there's still no visual affordance that the strip scrolls at all (`scrollbar-width: none` hides the only hint) — a user landing on MLB/NFL by default has no cue that NCAAF/NCAAB/WNBA are reachable by swiping. This is the same gap DECISIONS.md already flagged (five sports sharing one switcher sized for three) without resolving. Raised to the team as part of today's broader Dashboard/Settings brainstorm rather than patched unilaterally, since a real fix (edge fade mask, or folding the switcher into the existing nav-reimagine-concept work) is a Kael/Vera call, not a pure bug fix.

**Escalation:** none — the correctness bug is fixed; the discoverability question above is a design decision, not a defect, and is flagged to Kael/Vera rather than escalated as broken.

---

### Dashboard live enrichment, round 2: NFL injury alerts + linked-league teaser
**Contributor:** Axiom | **Date:** 2026-08-17

Second item shipped from today's Dashboard/Account-settings team brainstorm (see the session's chat log / DECISIONS.md discussion for the full Vera/Kael/Axiom/Relay/Cipher framing). Stayed deliberately on the smart-default model per the standing 2026-08-09 decision (ISSUES.md "Dashboard live enrichment + Manage Follows" — "customization" was already re-litigated once and the owner chose not to reverse it): no widget picker, no drag-and-drop, both additions ride the Dashboard's existing per-sport data and fetch pattern.

**Injury watch:** `_dashNFLInjuryAlerts()` (js/app.js) cross-references a Dashboard section's followed player ids against the same in-module-memoized Sleeper pool (`fetchNFLSleeperPool()`/`_nflPoolMap`) the Injury Report tab (N-17) and player cards already read — no new fetch, no new cache. NFL-only, disclosed scope limit: no other sport has an injury feed anywhere in this codebase. `_dashSectionHtml` renders it with the exact "Injury watch" phrasing and `--color-loss` treatment `js/nfl.js` already uses on player cards — no new visual primitive — placed above the team-chip row, right after the live "plays today" card, on the reasoning that state-that-changed is the most useful thing the Dashboard can surface (same logic as the plays-today enrichment itself).

**Fantasy section teaser:** the existing Fantasy section (My Drafts / My League buttons, shown whenever the user follows anything NFL) now also fetches `/api/sleeperLink` (D-065, already built, single cheap row read) and shows the linked league's name above the buttons when one exists, instead of two context-free links.

**Feasibility note (why this and not the fantasy roster/grade card also proposed in the brainstorm):** `_mlRenderRoster` (js/fantasy.js, My League's real implementation) pulls rosters + users + league object and runs the VBD grade computation — real fetch cost, not something to duplicate on Dashboard. Kept Dashboard's version to the cheap teaser (league name only, links to the real page) rather than re-implementing roster/grade logic in a second place — consistent with GOALS.md's standing warning about AppState/fetch coordination growing by accretion.

**Verification:** `node --check js/app.js` clean, 0 NUL bytes, diff-reviewed against HEAD before commit. Live-verified against production by patching the three changed functions into a real signed-in tab (js/app.js isn't deployed yet) — a real injured player (Cameron Jordan, Sleeper id 957, "Questionable") synthetically added to a followed-players list rendered the injury-watch line correctly, and the account's real linked league ("zmans") rendered in the Fantasy section teaser. Screenshot-confirmed clean layout, no regression to the existing sections.

`sw.js` CACHE_NAME bumped v197 → v198 (js/app.js is a cached static asset). Commit `15bc21a`.

**Not done / flagged, not fixed:** this only fires from the Dashboard's own follow-driven sport sections — a user with a linked Sleeper league but zero followed NFL teams/players won't see the teaser (Dashboard's `hasNFLFollow` gate). Small, pre-existing edge case inherited from the Fantasy section's original gate, not introduced by this change; not worth a special-case for now.

**Escalation:** none.

---

### Settings: per-sport Dashboard section visibility toggles
**Contributor:** Axiom | **Date:** 2026-08-17

Third item from today's Dashboard/Account-settings team brainstorm — Kael's "soft customization" ceiling (boolean show/hide, not a widget picker or drag-and-drop; that's the separate, bigger decision opened as D-107).

**Shipped:** `_getDashboardHiddenSports()`/`_setDashboardHiddenSports()` (js/auth.js) — same local-first + `pushPreference('dashboardHiddenSports', ...)` shape as Default Sport (2026-08-09), including the one-time signed-out-choice fold-up on sign-in. `renderDashboardView()` (js/app.js) filters its `sports` list through the hidden array before any per-sport fetch, and gets a new empty state ("hid every section" vs. "not following anything," per Vera's states-before-screens rule) that links straight to Settings. New `_renderSettingsDashboardSections()` renders one checkbox per sport the user currently follows something in — reuses `_dashGroupFollows()`, the exact same source Dashboard renders from, so the list can't drift out of sync — and the existing `.md-check` class the weekly-digest opt-in already uses. Wired into the existing `ss:follow-changed` listener so unfollowing a sport's last team/player drops its checkbox live. New static "Dashboard" section in the Settings drawer (index.html), between Account and Following.

**Verification:** `node --check` clean on all three touched JS files, 0 NUL bytes on all four touched files, diff-reviewed against HEAD before commit. Live-verified against production by patching all three new/changed functions into a real signed-in tab (not deployed yet): hiding MLB correctly dropped its section while NFL still rendered; hiding every followed sport showed the new empty state with a working Open Settings button; Settings checkboxes rendered correctly checked/unchecked and toggling one persisted to the hidden-sports list. Screenshot-confirmed clean layout, no regression to the other three Settings sections.

`sw.js` CACHE_NAME bumped v198 → v199 (index.html and js/auth.js are both precached static assets). Commit `0bac46c`.

**Escalation:** none.


---

### Account-menu dropdown mispositioned far right of the avatar trigger
**Contributor:** Axiom | **Date:** 2026-08-17

User-reported bug (with screenshots): clicking the signed-in account avatar (`#authControl`) opened `#authMenu` far to the right of the browser window — a large gap of empty header space between the true rightmost header control (the settings gear) and the menu — instead of directly below the avatar. User also flagged that other nav elements might share the bug.

**Root cause:** the exact containing-block-skipping mechanism already diagnosed once this session for the mega-panel dropdowns (D-103, css/main.css ~lines 262-292). `.auth-menu` is `position: absolute; right: 16px`, but its DOM parent, `.header-inner`, has no `position` of its own (it is centered/capped via `max-width` + `margin: 0 auto`). With no positioned ancestor between `.auth-menu` and `<header>`, the global `body > * { position: relative; }` rule (css/main.css line 36) makes `<header>` itself the containing block — so `right: 16px` measured 16px from the true, full-viewport-width browser edge, not from the avatar sitting well short of it on any wide screen.

**Fix (D-108):** wrapped `#authControl` + `#authMenu` together in a new `.auth-wrap` div (index.html) with its own `position: relative` (css/auth.css) — a tight containing block scoped to just the trigger and its menu, standard anchored-dropdown pattern. Changed `.auth-menu`'s `right: 16px` to `right: 0`, so the menu now resolves flush against the wrapper (== the avatar's own right edge) instead of the header. `.auth-wrap` is `display: inline-flex` so it sits in the `.header-inner` flex row exactly as the bare button did before — `#authMenu` stays out of flow via its own `position: absolute`, so wrapping it doesn't add any layout width. No JS changes; `_wireAuthControlEvents()`/`_toggleAuthMenu()` (js/auth.js) only ever toggled `hidden`/`aria-expanded`, confirmed no positioning logic lived there.

**Scope check for "other nav issues like this":** systematically checked every other dropdown/overlay-style nav element for the same pattern. Sub-nav category mega-panels (Stats & Leaders, Tools) are `position: absolute` off an unpositioned ancestor too, but that is the *intentional*, already-documented D-103 behavior (full `<header>`-width panel, chosen on purpose) — re-confirmed live at current viewport width, no regression. The mobile hamburger `.menu-panel` and the ⌘K `.search-overlay` are both `position: fixed` (viewport-anchored, immune to this ancestor-skipping issue). The settings drawer (`.settings-panel`) is also `position: fixed`. No other `role="menu"`/`aria-haspopup` element exists in index.html besides `#authMenu`. Conclusion: `.auth-menu` was the only affected element.

**Verification:** 0 NUL bytes and brace-balance check on both touched files, diff-reviewed against HEAD before commit. Live-verified against production by applying the equivalent wrapper + `right: 0` change directly to the live DOM in a real tab (index.html/auth.css aren't deployed yet): trigger and menu right edges now measure identical (`900.515625` both, diff `0`), screenshot-confirmed the menu renders directly below the avatar, and `.settings-btn`/`.header-inner` positions are unchanged (no layout regression from the new wrapper).

`sw.js` CACHE_NAME bumped v199 → v200 (index.html and css/auth.css are both precached static assets).

**Escalation:** none.


---

### Dashboard/Account views raced auth resolution — flashed wrong empty state, stuck after closing the sign-in sheet
**Contributor:** Axiom | **Date:** 2026-08-17

User report, follow-up to today's Dashboard/Settings work: "the dashboard customization is not very user friendly at all. it also glitches when you try to exit." Investigated live against production (a fresh signed-in tab, cold-loaded straight to `#dashboard`) rather than assuming the report was about the visibility-toggle UX itself.

**Root cause:** `AuthState.status` starts as `'loading'` and only becomes `'signed-in'`/`'signed-out'` after `initAuth()`'s `await fetch('/api/auth/get-session')` resolves (js/auth.js). On a cold page load straight to `#dashboard` (or `#account`), the hash-restore router calls `renderDashboardView()`/`renderAccountView()` synchronously — no network wait — so it very often runs before that fetch resolves. Both functions treated any non-`'signed-in'` status, including `'loading'`, as signed-out: they rendered the "Sign in to see your followed teams..." placeholder and called `openAuthSheet()` — popping the sign-in modal over an already-signed-in user's session. Neither function was ever re-invoked once `initAuth()` actually finished, so closing that unwanted sheet left the page permanently stuck on the wrong empty placeholder — matches the "glitches when you try to exit" report exactly. Reproduced intermittently (network-timing dependent, not 100% of loads), consistent with a race rather than a deterministic bug — confirmed against real production timing, and confirmed deterministically by directly forcing the `'loading'` state in a live tab.

**Fix (D-109):** added `AuthState.ready` — a promise resolved by `initAuth()` right after it settles `AuthState.status`, before the (unrelated) preference/follow sync calls. `renderDashboardView()` (js/app.js) and `renderAccountView()` (js/auth.js) now check for the `'loading'` race specifically: if hit, they render a proper loading state (reusing the existing `.auth-account-loading` class already used elsewhere on the account page — no new CSS) and `await AuthState.ready` before deciding anything, instead of guessing from an in-progress status. Each also bails out cleanly (no render, no auth-sheet call) if `AppState.currentView` has changed away from `dashboard`/`account` by the time the wait resolves, so a user who navigates elsewhere during the brief loading window doesn't get a stale render clobbering whatever they navigated to.

**Verification:** `node --check` clean on both touched files, 0 NUL bytes, diff-reviewed against HEAD before commit. Since js/auth.js and js/app.js aren't deployed yet, live-verified the new guard logic against the real page (not a full cold reload, which can't be scripted here) by reimplementing the exact new code path inline in a live signed-in tab and forcing the three real scenarios: (1) `status:'loading'` resolving to `'signed-in'` — showed the loading placeholder, made zero `openAuthSheet()` calls, then proceeded to the real-content path once resolved; (2) `status:'loading'` resolving to genuinely `'signed-out'` — still correctly showed the signed-out prompt and called `openAuthSheet()` exactly once, confirming the legitimate signed-out path is unchanged; (3) navigating away from the view while the wait was in flight — bailed out with no render and no auth-sheet call. All three matched expected behavior.

`sw.js` CACHE_NAME bumped v200 → v201 (js/auth.js and js/app.js are both precached static assets).

**Not done / flagged, not fixed:** the user's message also called the Dashboard customization surface itself ("Set as my default sport" button, per-sport team chips, Settings visibility toggles — all shipped earlier today) "not very user friendly at all," separate from this glitch. That's a UX-design question, not a defect, and hasn't been triaged yet — flagging for a Vera-led pass rather than guessing at redesign changes unprompted.

**Escalation:** none for the glitch (root-caused and fixed). The broader Dashboard-customization UX critique is unresolved and needs the user's input on scope before Vera scopes a redesign pass.


---

## Home + nav walkthrough — 2026-08-19 (Kael/Vera/Finn)

**Contributor:** Finn (investigation), Kael + Vera (review lens) | **Date:** 2026-08-19

Owner asked for a bug + UX walkthrough of landing pages and nav specifically ("clean and concise," best-practices check), following the mock-draft bug session earlier the same day. Scope: Home + all 6 sport landing views on desktop, the already-shipped D-103 mega-menu/rail/sport-switcher, and a mobile pass. Cross-checked against existing open items first (D-102/D-103 nav-rename and mega-menu work, the mobile sport-switcher scroll fix, the mega-panel width fix, the auth-menu position fix) to avoid re-reporting known ground — none of that work regressed; the mega-menu, followed-teams rail, and sport-switcher scroll-into-view all held up under live re-check.

Two new findings, both fixed and shipped this session:

### Header sport-switch buttons were dead from Home when they matched the current sport
Live-reproduced: on a cold load (`AppState.currentSport` defaults to `'mlb'`), clicking "MLB" in the header switcher from `#home` did nothing — no navigation, no error, `location.hash` stayed `#home`. Confirmed it's general, not MLB-specific: after switching to NFL then returning to Home, the NFL pill was equally dead. Root cause: `switchSport()`'s `if (sport === AppState.currentSport) return;` guard is correct for in-app pages (clicking your current sport's own tab should no-op) but wrong for Home, which shows no sport as active in the switcher regardless of what `currentSport` actually holds. The big sport-picker cards on Home already carry the exact fix, inline, with a comment explaining the exact failure mode — `_renderSportPicker()`'s click handler in app.js checks for this and calls `_applySportUI` + `navigateTo` directly instead of going through `switchSport()`. The header switcher's delegated click handler (navigation.js) never got the same treatment.

**Fix:** mirrored `_renderSportPicker`'s same-sport guard into the `.sport-switch` delegated handler (navigation.js). **Live-verified before commit** (file not yet deployed) by patching the exact new handler logic into a real production tab and confirming a matching-sport click now advances `AppState.currentView` from `home` to `mlb-home` instead of no-op'ing.

**Secondary finding, not fixed:** `enterSport()` (app.js) is dead code — defined, zero call sites anywhere in the codebase (grep-confirmed). It also has its own latent bug if it were ever wired up: its `defaultViews` map only covers `nba`/`mlb`/`nfl`/`nhl`, so calling it for `ncaaf`/`ncaab`/`wnba` while already on that sport would fall through to `'players'` (the NBA view) instead of that sport's real default view. Moot while unreachable, but flagged for Axiom — either remove it or fix and wire it in, not leave it as a trap for a future session that finds it and assumes it's live.

### NFL home card said "Draft season" during real live preseason games
Live-observed on today's date (2026-08-19): the NFL tile in Home's sport-picker read "NFL · Draft season," while the very same page's score ticker showed real, finished NFL preseason games (PIT 28–9 GB, NE 13–13 IND, etc.). Root cause: `_sportPickerStatus('nfl')` (app.js) used its own independent, hardcoded `m >= 7 && m <= 8` month-range check instead of the canonical `_nflSeasonPhase()` model (js/nfl.js) that CLAUDE.md explicitly documents as "the actual calendar model behind every NFL offseason/preseason UI decision" — and explicitly warns against reintroducing a hardcoded calendar boolean, since that's the exact bug D-063 already fixed once. This function had quietly done it again, under a different name, in a different file.

**Fix:** `_sportPickerStatus('nfl')` now calls `_nflSeasonPhase()` and maps its four real phases (offseason/preseason/regular/postseason) to labels, with the old month-range logic kept only as a defensive fallback if `_nflSeasonPhase` isn't loaded yet (it always will be — nfl.js loads well before app.js in the script chain). **Live-verified before commit:** patched the new logic into a real tab and confirmed `_sportPickerStatus('nfl')` now returns "Preseason" for today's date, and the re-rendered card reads "NFL · Preseason" instead of "NFL · Draft season."

`sw.js` CACHE_NAME bumped v202 → v203. Commit `5e425ab`.

**Mobile pass — environment-limited, not a findings gap:** genuine responsive-viewport testing wasn't achievable this session — `resize_window` reports success but does not change the tab's actual rendered `window.innerWidth`/`innerHeight` (confirmed twice, fresh tab both times), consistent with a prior session's note on the same tool. Approximated the ≤768px breakpoint by injecting the real CSS rules from `main.css` as an override stylesheet (menu panel, bottom nav, sub-nav hide, sport-switch scroll strip) rather than a true narrow-container reflow. Under that approximation: the mobile menu panel's Stats & Leaders/Tools groups, NFL's Draft Prep/In-Season groups, the bottom nav's 5 tabs, and the "More" button's toggle-into-menu-panel behavior all rendered and behaved correctly on both Home and NFL. One unconfirmed observation — the header search input's placeholder text appeared to overlap the account avatar badge on NFL's page at this simulated width — is explicitly **not** being filed as a bug: the browser viewport never actually narrowed during this test, so a collision that depends on real container width shrinking can't be trusted from this technique the way an on/off `display` toggle can. Needs a genuine narrow-viewport or real-device check before it's treated as a finding.

**Escalation:** none — both findings were root-caused, fixed, and live-verified same session.

---

## Draft HQ dashboard rebuild — 2026-08-19 (Vera/Kael/Axiom, see DECISIONS.md D-111)

**Contributor:** Vera (JTBD + IA), Kael (visual review), Axiom (implementation + verification) | **Date:** 2026-08-19

Owner, same day as the Home + nav walkthrough above: "we need to consider how we can make the draft hq cleaner, right now it doesn't look broadcaster grade with all the tabs at the top, this should feel like a true dashboard, full of relevant info where you don't have to click away." Full rationale and decision writeup is in DECISIONS.md D-111 — this entry is the pointer + verification detail, per this file's convention.

Two real, previously-undocumented problems, both root-caused against actual code rather than guessed at: (1) every Draft Prep/In-Season page rendered the full 10-pill `_hqStrip()` regardless of which group it belonged to, duplicating the header's own Fantasy mega-menu (D-103) — D-055 had already flagged this exact "revisit if the flat list feels crowded" scenario as a named follow-up, unactioned until now; (2) `nfl-draftkit` had three different display names across the app (breadcrumb "Value Board," page H1 "Draft Kit," and was referred to as the Draft HQ hub only informally) while carrying real dashboard-shaped content (Sleepers/Traps + Value Rankings) that was buried as one of six co-equal tabs instead of being the hub.

**Shipped:** `_hqStrip()` scoped to one group per page (5 Draft Prep / 4 In-Season, never both); `nfl-compare` removed from the Draft Prep group, completing a D-103 cleanup that only half-landed (header dropdown fixed then, in-page strip not); `nfl-draftkit` renamed to "Draft HQ" everywhere and given its own Quick Tools link-card row plus a new Bye Week Watch module (real `/api/nflsos` data, not invented — an ADP-movers idea was considered and dropped for lack of a real historical-ADP-delta source, per DESIGN.md's Receipts rule against fabricated precision).

**Verified:** `node --check` + 0 NUL bytes on all 5 changed files (`js/fantasy.js`, `js/nfl.js`, `js/navigation.js`, `css/main.css`, `css/components.css`), 33/33 unit tests, `check-manifest.cjs`/`check-themes.cjs` clean. **Live-verified pre-push** (commit `27ebbf7` not yet pushed) using the same production-tab-patching technique as the 2026-08-17 Dashboard-brainstorm session and the sport-switch fix above: patched `_hqStrip`, `_dkRender`, `_dkFetchByeTeams`, `_dkByeClusters`, `_dkLoadByeWatch`, `_dkQuickTools`, and `setBreadcrumb` into a real tab on `#nfl-draftkit`, plus the new CSS rules (not yet deployed) via an injected `<style>` tag. Confirmed: `_hqStrip('nfl-mock','prep')` renders exactly 5 tabs, `_hqStrip('nfl-myleague','season')` exactly 4, neither shows "DRAFT HQ" as a title; the rebuilt dashboard's Bye Week Watch resolved real clusters against live Sleeper ADP + live SOS schedule data (e.g. Wk 11: Puka Nacua, Bijan Robinson, Jaxon Smith-Njigba, Drake London, Josh Jacobs, Kyren Williams...); Quick Tools rendered as 4 cards; breadcrumb text for `nfl-draftkit`/`nfl-mock`/`nfl-waivers` matched the new labels exactly (`Draft HQ`, `Draft HQ · Mock Draft`, `Fantasy · Waiver Wire`).

Also corrected in the same pass, found while touching this area (Folio's doc-sync rule): CLAUDE.md's Nav System section still described the header's Fantasy dropdown as a flat 10-item list including Compare with no Draft Prep/In-Season titling — both true before D-103, neither true after it shipped. D-103's own code comment already said as much; CLAUDE.md just never caught up. Fixed alongside the D-111 rename rather than left for a future session to trip over.

`sw.js` CACHE_NAME bumped v203 → v204. Commit `27ebbf7`, pushed and live-verified on sportstrata.cc same day (see follow-up entry below — a placement defect was found in this same shipped work hours later).

**Escalation:** none — root-caused, fixed, and live-verified same session.

---

## Draft HQ Quick Tools placement + NCAAF schedule-card placement — 2026-08-19 (owner-caught, Axiom)

**Contributor:** Axiom (root-cause + fix + codebase-wide search) | **Date:** 2026-08-19

Same day as the Draft HQ rebuild above (D-111), hours after it shipped and was live-verified. Owner, verbatim: "we keep running into this issue where instead of properly implementing a feature, you ammend it to the bottom of the page. FOr example, the feature you just added was put at the bottom of a page below a list of 200 players. there is no world where a user would naturally find that. Understand the issue you made and search the project for similar issues." Two-part instruction: fix the specific bug, and search the whole project for the same recurring pattern — the phrasing "we keep running into this" was treated as a signal this had happened before, not as a one-off complaint.

**The specific bug:** `_dkQuickTools()` — the 4-card link row (Mock Draft / ADP Rankings / Schedule / My Drafts) built as part of D-111 specifically to satisfy "shouldn't have to click away" — was appended at the very end of `_dkRender()`'s HTML output, after the ~200-row Value Rankings table. A user landing on Draft HQ would have to scroll past the entire ranked player list before ever seeing it. Root cause: page sections were sequenced by an abstract importance order (headline insight → secondary insight → deep reference table → secondary tools) with no accounting for the fact that the "deep reference table" sitting in the middle of that order is ~200 rows of effectively unbounded scroll — everything ordered after it is functionally invisible to a real user regardless of its own merit. Bye Week Watch, the *other* module D-111 added, was checked and confirmed **not** to have the same problem — it already rendered before the 200-row table (right after Sleepers/Traps), so no fix was needed there. Only Quick Tools was the actual violation.

**Fix:** moved `_dkQuickTools()` to render immediately after `dk-head` (the H1 + print button), before `dk-controls` — visible on load, no scrolling required. Also corrected a code comment in the same function that still described Quick Tools as being "at the bottom," now stale after the move.

**Codebase-wide search:** used an Explore agent with the full `js/` directory staged (a first attempt was scoped to only 4 files still staged from earlier work — it correctly and transparently reported that limitation rather than guessing, and was re-run with full access rather than trusted as-is). Methodology: for every view-render function (`grid.innerHTML =` or equivalent), read the function in full and flag any 50+-item loop with meaningful content sequenced after it in the same output.

**Found and independently re-verified (read the actual source, not just the agent's report) one further real instance:** NCAAF team detail pages. `displayNCAAFTeamDetail()` (`js/ncaaf.js`) builds a "Next game" schedule card and passes it into the shared `_renderTeamPage(m)` template (`js/nfl.js`, used by both NFL's and NCAAF's team pages) via the `scheduleHtml` property — which that shared template renders dead last, after the full roster. NFL's own team pages (`_renderNFLTeamDetail`, `js/nfl.js`) pass the equivalent content via `scheduleHtmlTop` instead, which renders near the top — confirmed by reading both functions directly. NCAAF's roster section (`groups`, built at `displayNCAAFTeamDetail` lines ~573-577) has no size cap and FBS rosters run 85-130 players across Offense/Defense/Special Teams groups, so the schedule card was landing after a very long uncapped list — same bug class as Quick Tools, different file, different mechanism (a mis-named template slot rather than section ordering), same effect.

**Fix:** changed `js/ncaaf.js`'s `model` object from `scheduleHtml,` to `scheduleHtmlTop: scheduleHtml,`, matching the property name NFL's own team-page builder already uses correctly for the same shared template.

**Checked and confirmed clean (specific reason given for each, not assumed):** MLB (players/teams/leaders/standings/games — all either paginated, tabbed, or genuinely short lists), Home (`loadHome()` — Today's Games and the headline/insights rail are both bounded), Teams/Players/Leaderboards/Standings/Games (NBA-preview surfaces — same bounded patterns), NCAAB (no team-detail page exists yet, so the bug class can't occur there), WNBA (no roster/team-detail page exists yet), NHL (no team roster page), remaining NCAAF views (Scores/Rankings/Standings all bounded), remaining NFL views (Players/Teams/Leaders/Compare/Standings/other Fantasy pages), `fantasy.js`'s other render functions besides `_dkRender`, Player Detail, the Ask Bar (`query.js`), global Search (`search.js`), and Stat Builder — each confirmed individually rather than skimmed as a batch.

**Verified:** `node --check` clean on `js/fantasy.js` and `js/ncaaf.js`, 0 NUL bytes on both, 33/33 unit tests pass, `check-manifest.cjs` clean, `check-themes.cjs` unchanged (same 2 pre-existing light/nl-monarchs warnings — D-038/D-066, unrelated). `sw.js` CACHE_NAME bumped v204 → v205 (both changed files are precached static assets).

**Standing takeaway, worth carrying forward:** before shipping any new page module, check whether it's sequenced after an unbounded or very-long list/table in the same render output. If so, either move it above that list or cap/paginate the list — this is now a named, recurring failure mode per the owner, not a one-off to fix and forget.

**Escalation:** none — root-caused, fixed, live-verified, and documented same session. Full architectural writeup and D-111 status correction: DECISIONS.md, D-111 follow-up amendment (2026-08-19).

---

## NFL preseason week-numbering bug + mock-draft home-page visibility — 2026-08-19 (Axiom)

**Contributor:** Axiom (root-cause + fix + live pre-push verification) | **Date:** 2026-08-19

Owner, verbatim: "the nfl preseason is weird there are 3 preseason weeks, however the hall of fame game is a stand alone week before the other three, our logic is wrong in relation to that. there also is no indication that the mock draft exsists on the main landing page, how should we draw attention to it?" Full decision writeup, rationale, and code detail: DECISIONS.md D-113 — this entry is the pointer + verification detail, per this file's convention.

**Bug 1 confirmed against live ESPN data, not just the owner's description:** `seasontype=1` for 2026 has 4 weeks, not 3 — week 1 is the standalone Hall of Fame Game (1 game), weeks 2-4 are the three full preseason weekends. `js/nfl.js`'s `_NFL_SEASONTYPES.weeks: 3` cap silently dropped ESPN week 4 (the third real preseason weekend) from the Scores nav entirely and mislabeled the HOF Game "Wk 1" next to full slates. Fixed: `weeks: 4` + new `_NFL_PRESEASON_WEEK_LABELS` map, same pattern as the existing postseason week-label handling.

**Ask 2 turned out not to be a bug:** live-inspected the real production DOM before assuming the promo was broken — the seasonal-promo-band `'draft'` entry (D-040 1a / D-043 3b) was firing correctly, right now, on the actual home page. The real problem was that it rendered as a bare `.hm-row` directly under the Pennant Races card with no visual distinction from that card's own content — a screenshot confirmed it read as a trailing caption on an MLB widget rather than its own promo. Fixed by reusing the site's existing "border = identity" convention (`.sport-card`/`.sl-card`'s `border-left: 3px solid var(--sport-accent, ...)`) on the promo row, deriving the accent/icon generically from `SPORTS_META` off the promo's own target view rather than hardcoding NFL, plus upgrading `.hm-chip--primary` to a solid accent fill per DESIGN.md's "brand orange = primary CTA" invariant. Live pre-push patch + screenshot confirmed the fix reads clearly (blue border, 🏈 icon, solid orange button) against the same production page.

**Verified:** `node --check` + 0 NUL bytes on `js/nfl.js`, `js/app.js`, `css/main.css`, `sw.js`. **Gap versus the usual bar:** no `tests/` directory or `check-manifest.cjs` was present in this session's staged partial checkout, so the unit suite could not be run this session — flagged in DECISIONS.md D-113 as something to re-run on a full checkout. `sw.js` CACHE_NAME bumped v205 → v206. Committed via the mount-safe git-plumbing workaround, commit `1918766`, exactly the 4 intended files touched.

**Escalation:** none. Owner pushed same session; live post-deploy verification done on a fresh tab against real production — confirmed `sw.js` at v206, 4 preseason week pills (HOF Game/Wk 1/Wk 2/Wk 3) with "Wk 3" correctly loading the real Aug 27-29 slate, and the home-page promo rendering with its new border/icon/solid-CTA treatment. Full detail: DECISIONS.md D-113.

---

## Home page redesign — external-LLM roadmap triage + partial build — 2026-08-19

**Contributor:** Finn (fact-check) / Vera / Kael / Axiom | **Date:** 2026-08-19

Owner pasted a 5-phase home-page redesign roadmap from another LLM. Routed through the normal process rather than built directly (same pattern as the original ChatGPT-brief episode, D-090/D-091), then owner approved implementing whatever the team's triage deemed worthy. Full triage table, rationale, and build/verification detail: DECISIONS.md D-114 — this entry is the pointer, per this file's convention.

**Fact-check caught a stale premise up front:** Phase 1's "move the tweet/social embed" doesn't apply — no social embed exists anywhere on the page (confirmed against `index.html`). Dropped.

**Shipped:** `.home-zone` shared containers (Today's Games / The Latest / Tonight's Starters / Hot Right Now read as distinct blocks now, no DOM reordering); Today's Games "marquee" treatment for the top 3 rank-sorted games (bigger tile, no accordion, nothing hidden — resolves the tension between the roadmap's "hide most games" idea and D-091's "Today's Games is the comprehensive view" reasoning by keeping everything visible); Tonight's Starters converted from an 8-row vertical stack to a responsive grid; small team-colored ERA/K-9 mini-bars on Starters cards (decoration backing the existing numbers, not a new claim).

**Two bugs caught during live pre-ship verification against real production, both fixed same pass:** the Starters grid's first-draft column width (280px) truncated real pitcher names and crowded the existing opponent-history stat rows — widened to 420px. A bare 420px minimum would have caused real horizontal overflow on any phone-width viewport — proven via a synthetic 375px-container test (the resize-window tool didn't affect this session's fixed-resolution display) — fixed with `minmax(min(420px, 100%), 1fr)` instead of a bare floor.

**Declined, not built:** ticker condensing (conflicts with `ux.md`'s standing "do not redesign the score ticker" constraint + D-087's merged-ticker architecture + NCAAF/NCAAB's mobile Scores-nav dependency on it); "SportsStrata Picks"/Lock high-confidence-play badges (GOALS.md's "not a pure betting site" non-goal + D-069's real licensing-review requirement for anything betting-adjacent — routed to the owner as its own product/compliance question, not a design-team call).

**Deferred, needs more before it's buildable:** hero and Starters win-probability bars — no MLB win-probability data source exists anywhere in this codebase (only NFL has one, via D-106/ESPN `/summary`); needs a Relay data-availability pass first. The roadmap's literal DOM-reordering half of Phase 2 also wasn't attempted this pass — the visual-separation fix above addresses the same complaint at lower risk; only revisit reordering with its own Vera/Kael pass if that turns out insufficient.

**Verified:** `node --check` clean on `js/app.js`, 0 NUL bytes on both changed files, `tools/check-manifest.cjs` clean, `tools/check-themes.cjs` clean (2 pre-existing unrelated warnings only), full 48-test unit suite passing (6 files). `sw.js` CACHE_NAME bumped v206 → v207 (`js/app.js`, `css/main.css` are both precached static assets). Committed via the mount-safe git-plumbing workaround.

**Not yet live-verified after deploy** — no push access from this session, owner needs to `git push`. Full detail: DECISIONS.md D-114.

## Mock Draft engine — competitive logic audit — 2026-08-20 (Axiom/Relay/Vera, see DECISIONS.md D-115)

**Contributor:** Axiom (architecture) / Relay (data) / Vera (consulted) / Finn (logging) | **Date:** 2026-08-20

Owner asked for a logic check on the NFL Mock Draft engine (`js/fantasy.js`) against competitor products (ESPN, Yahoo, Sleeper, FantasyPros). Full findings, competitive citations, and consensus: DECISIONS.md D-115 — this entry is the pointer, per this file's convention.

**Verdict:** the engine's core value math (trained-regression VORP, real Monte Carlo pick-survival simulation, need-aware randomized AI opponents) holds up well against what's publicly documented for the free competitor tools.

**Scoped, not built — auction/salary-cap draft format.** Every major competitor (ESPN, Yahoo, Sleeper, FantasyPros) supports both snake and auction drafts; SportStrata's Mock Draft is snake-only. Real, confirmed gap, but sized as its own build (a parallel bid-based engine, not a settings toggle) — logging it, not starting it.

**Also noted, not scoped:** the existing NFL Injury Report (`nfl-injuries`) isn't wired into the draft pool/AI picks; no live per-pick "projected finish" during the draft (only computed once at the end); the `_mdAssignTiers` comment overstates its similarity to Boris Chen's actual clustering methodology (cosmetic, not functional).

**No code changed.**

---

## NFL Live Game Viewer — live-verification session, real preseason window (D-105/D-106 audit + real bug found+fixed) — 2026-08-22

Task / Finding: Live audit of the field position viewer (D-105), win probability chart (D-106), and full six-tab Phase 1 rebuild (D-080) against real live and pregame preseason games; one real sidebar bug found and fixed.
Contributor: Finn | Date: 2026-08-22

**Context:** Owner asked to further develop the NFL live game view + field viewer live, during tonight's real preseason window. Checked ESPN's scoreboard first for real live/pregame test cases rather than assuming: GB @ DEN (event `401873613`) was live (3rd quarter, later 4th), Washington @ Detroit (event `401873601`) was genuinely pregame (kicks off 8/22, 12:00 PM EDT -- a full day out, not "already happened" as an earlier automated ESPN-page summary mis-stated; the raw API's `date` field confirmed the correct time).

**D-105 field position viewer -- re-verified against a real live game, holds up correctly.** Watched the ball marker, first-down line, and red-zone shading track a real live sequence end-to-end (a punt, a return, an offensive holding penalty, several snaps) and cross-checked every rendered `downDistanceText`/`yardLine`/`possession` against a direct, uncached `/api/nfl?path=/scoreboard` fetch for the same event at the same moment -- all matched exactly, including the home-anchored yardLine coordinate system D-105 originally fixed. One apparent staleness (`field-viewer` briefly showing an older down/distance than the header's clock) turned out **not to be a bug** on closer look: it was the real NFL clock legitimately not advancing during a penalty enforcement/review, which two 20s polls happened to straddle -- confirmed by re-polling and watching the situation catch up on the very next tick, cache-status `DYNAMIC` (not edge-cached) on every check. Flagging this here only so a future session doesn't re-chase the same false lead.

**D-106 win probability -- re-verified, correct.** Sidebar's displayed `GB 86-89%` matched `data.winprobability[]`'s last entry's `homeWinPercentage` (DEN is home) at every check.

**Six-tab Phase 1 rebuild (D-080) -- re-verified, all six tabs clean.** Summary/Play-by-Play/Box Score/Team Stats/Fantasy all rendered real, correct data for the live game (drive dedup from D-093 still holds -- no duplicate current-drive entries); tab selection and the Fantasy Standard/Half-PPR/PPR scoring toggle both survived poll-driven re-renders without resetting, matching the diff-render architecture's own contract. Analytics tab's Success Rate/Drive Efficiency (Phase 3a) computed live and correctly, with the honest "EPA/CPOE/win probability added -- coming later (D-081)" caveat intact. Console clean, all `/api/nfl` requests 200 throughout.

**Real bug found and fixed -- sidebar Game Leaders card rendered a broken half-empty shell for a pregame game.** `_nlgSidebarLeaders(data)` (`js/nflLiveGame.js`) guarded only on whether the top-level `data.leaders` array was non-empty -- but ESPN's `/summary` payload returns that array pregame too (one entry per team), each with an empty `.leaders` (category) list since no plays exist yet. Confirmed live on the pregame WSH@DET page: the card rendered `"Game Leaders / DET / WSH"` with nothing else -- two bare team-name labels and no stat rows, which reads as broken rather than absent. This directly violates this same file's own established convention (every other card/tab on this page -- Play-by-Play, Analytics, Fantasy -- shows an honest "not yet" empty state, and D-105/D-096/D-098 all explicitly chose "absent degrades to nothing, never a placeholder shell").

**Fix:** each team block now returns `''` unless it actually produced at least one leader row, and the whole card is omitted (not just left with empty team headers) unless at least one team block survived. **Live-verified before committing** -- the corrected function was injected directly into the live pregame WSH@DET tab (card correctly disappeared entirely) and into the live in-progress GB@DEN tab (real leader data for both teams rendered exactly as before, unaffected) -- not assumed from the diff alone. `node --check` clean, 0 NUL bytes. `sw.js` bumped v208 -> v209 (`js/nflLiveGame.js` is precached).

**Not built tonight, flagged for a future decision, not started:** the "further develop the field viewer" framing came up empty for genuinely new scope -- D-105/D-106/Phase-1/Phase-3a all held up against tonight's real data with only the one sidebar bug above. Phase 3b (EPA/CPOE/win-probability-added) is still blocked: checked live via GitHub's release-assets listing for `nflverse/nflverse-data`'s `pbp` release -- `play_by_play_2026.*` does not exist in any format yet; the newest file is still `play_by_play_2025.csv.gz` (dated 2026-02-12, the same post-season snapshot D-081 found). The 2026 season's own release folder currently holds only `timestamp.json`/`timestamp.txt` placeholders, also dated 2026-02-12 -- nflverse's 2026 pipeline hasn't started publishing at all yet, preseason included. No change from D-081's gate; recheck in September as that entry already said.

**Result:** shipped same session (small, low-risk, additive fix -- one card's omission condition, no new data source, no shape change). Committed locally via the mount's plumbing-commit workaround; pending owner push.

Escalation needed: no.

---

## Service worker caching /api/ responses as static assets — site-wide stale-data bug (D-117)

Task / Finding: Continuing tonight's NFL live-game polish pass, a completed preseason game's live game page rendered as pregame (no score, wrong status) on first visit -- traced to `sw.js`, not the NFL code. Full record: DECISIONS.md D-117 -- this entry is the pointer, per this file's convention.

**Verdict:** real, site-wide, previously-undiscovered bug. `sw.js`'s stale-while-revalidate fetch handler had no path exclusion for `/api/*` -- every dynamic data call (every sport, not just NFL) was being treated as a cacheable static asset with no TTL, confirmed live via direct Cache Storage inspection (84 stale `/api/` entries already sitting in the deployed `sportstrata-v208` cache). A URL's first hit after a long gap could serve arbitrarily old cached JSON before self-correcting on the next hit.

**Fixed:** `/api/*` requests now go straight to network, bypassing the SW cache entirely, letting each Pages Function's own `Cache-Control`/TTL logic govern freshness as originally intended. Rides the same `sw.js` v208->v209 bump already in flight this session (see the NFL live-game-viewer entry above).

**No code changed beyond `sw.js`** -- this is a service-worker-only fix, no page JS touched.

Escalation needed: no -- shipped same session, committed locally, pending owner push.

---

## NFL live game tabs — wire aria-controls/tabpanel role for the gv-tabs component

Task / Finding: Accessibility gap in `.gv-tabs` (this codebase's first tablist, D-080) -- buttons had `role="tab"`/`aria-selected` but no `aria-controls`, and the shared panel had no `id`/`role="tabpanel"`/`aria-labelledby`, so the tab<->panel relationship was never exposed to assistive tech even though each tab's selected state was.
Contributor: Finn | Date: 2026-08-22

**Fix:** each tab button gets a stable `id="gv-tab-{id}"` + `aria-controls="gv-tabpanel"`; the shared panel gets `id="gv-tabpanel"`, `role="tabpanel"`, and `aria-labelledby` kept in sync with the active tab on every render (`_nlgRenderActiveTabBody`, since the panel element is reused, not recreated, across poll-driven re-renders and tab switches). Live-verified by monkey-patching both functions into the live page and switching tabs -- `aria-labelledby` tracked the active tab correctly on every switch.

**Not done, flagged rather than bundled in:** full WAI-ARIA Tabs authoring-practice roving-tabindex + arrow-key navigation (all six buttons currently have the browser's default `tabIndex 0`, so Tab reaches each one individually rather than one stop + arrow keys). That's a real interaction-model change to a component this codebase built new for D-080 -- worth a look, not a same-session bugfix; noting it here for whoever picks up the next accessibility pass rather than building it ad hoc.

**No `sw.js` bump needed beyond the one already in flight this session** (D-117) -- `nflLiveGame.js` is already being re-cached by that bump.

Escalation needed: no.


---

## Highlight Card Studio — desktop rendered the mobile (<=768px) layout regardless of viewport width — 2026-08-22

Task / Finding: Owner-reported bug, live-reproduced and fixed same session.
Contributor: Finn | Date: 2026-08-22

**Repro:** Opened NFL Highlight Card Studio (`#nfl-highlight-card`) in a real Chrome tab at 1864px window width (well above the 768px breakpoint) and screenshotted it — the game picker and preview pane rendered as two cramped ~262px-wide boxes side by side instead of the intended `minmax(260px,360px) 1fr` two-column spread. Confirmed the `@media (max-width:768px)` rule in `css/components.css` never fired (`window.innerWidth` was 1864 throughout) — this was not a media-query bug.

**Root cause (found via computed-style inspection, not guessing from the CSS):** `navigateTo()` in `js/navigation.js` (line ~225) unconditionally resets `#playersGrid`'s className to `'players-grid'` (the 5-up MLB/NFL player-card grid) for every non-`home` view, before the view's own render function runs — this exists so card-grid views (`mlb-players`, `nfl-teams`, etc.) always start from a known class after leaving `home`'s custom layout. `displayMLBHighlightCard()` / `displayNFLHighlightCard()` (`js/highlightCard.js`) never override that className before writing `.hcs-shell`/`.hcs-layout` into the same `#playersGrid` container — so the leftover `players-grid` 5-column grid cascaded onto `.hcs-shell` as a grid *item*, confining it to one ~262px card cell. `.hcs-layout`'s own nested grid then had only that ~262px to divide, collapsing its `1fr` preview column to a ~110px sliver — visually indistinguishable from the real mobile stack, at any desktop width.

**Fix:** both functions now set `container.className = '';` immediately after grabbing the container, before writing anything — matching the existing precedent in `js/statBuilder.js` (`grid.className = 'builder-container'`), which resets the same leftover class for its own non-card-grid view. `.hcs-shell` is self-contained (`display:flex`, no dependency on a parent-supplied grid), so an empty class is sufficient — no new CSS needed.

**Live-verified before committing** (monkey-patched both functions into the running production page, not assumed from the diff): NFL Studio at the empty-state and game-selected steps, and MLB Studio at the empty-state step, all rendered the correct two-column desktop layout after the patch. `node --check` clean, 0 NUL bytes.

**Scope note:** this bug affected *both* MLB and NFL Highlight Card Studio identically (same container, same missing reset) — the owner only reported NFL, but MLB had the same defect and is fixed in the same commit.

**Unrelated finding surfaced during repro, not fixed here:** the NFL Highlight Card Studio's player picker for the Aug 21 NYJ @ PIT game listed names that are not NFL players on either roster — e.g. "Cade Klubnik," "Drew Allar," "Will Howard," "Jack Sawyer" (current college football players — Clemson/Penn State/Ohio State) — under both the "away" and "home" option groups. This looks like a real data-correctness bug in the boxscore/roster source for that game (possibly an ESPN athlete-id collision or wrong-sport response), separate from the layout bug above. Not investigated further this session — flagging for a follow-up rather than letting it go undocumented.

**Result:** shipped same session (small, low-risk, additive fix — one className reset in two functions, no shape/behavior change beyond fixing the collapse). Committed locally via the mount's plumbing-commit workaround; pending owner push.

Escalation needed: no (for the layout fix). The roster-name anomaly may need Relay (data/API) once someone looks at it — not escalated yet, just logged.


---

## NFL Live Game Viewer — immersion brainstorm, two ideas taken to Vera — GATED, spec stage only (2026-08-22)

**Contributors:** Vera (behavioral spec, this entry) | Kael + Axiom not yet consulted
**Date:** 2026-08-22
**Status:** spec-complete for Vera's gate; NOT implemented, NOT visually specced, NOT feasibility-checked. Per ROUTER.md, a new feature idea starts with Vera before anyone designs or codes — this is that first gate, not a green light to build.

**Context:** owner asked to brainstorm ways to make the NFL live game viewer (`js/nflLiveGame.js`, D-080 Phase 1) feel more immersive. Two ideas came out of that pass as worth taking further; both are genuinely new scope (not bugfixes), so per this file's own routing rule they get specced here rather than built ad hoc. A third finding from that same pass — `.nlg-header` (`css/nflLiveGame.css` line 93) is not sticky, only `.nlg-side` is (confirmed by reading the actual CSS live, not assumed from D-080's own text, which never explicitly promised a sticky header) — is the trigger for idea 1 below, not a restatement of an existing unmet requirement.

---

### Idea 1 — Sticky score header while scrolling the live game page

**Job to be done:** "I'm three screens deep in Play-by-Play or Box Score, scrolling to catch up on a drive — I should never have to scroll back up to check the score, clock, or down/distance. That context should just be there." Right now `.nlg-header` (score, team names/logos, clock, field position viewer) scrolls away with the rest of the page the moment the user moves past it; only the sidebar (leaders/win-probability/game flow) stays pinned. For a page whose entire premise is live-tracking a game in progress, losing the score off-screen while reading the play log is a real gap, not a nitpick — the job this page exists to do (know what's happening, right now) gets harder the moment you start using its own tabs.

**Friction inventory today:** scrolling down into any tab (Play-by-Play especially, since it's the longest) pushes the header fully off-screen; the only way back to score/clock/down-distance is scrolling up, which loses your place in the play log; on mobile this is worse since the viewport is shorter and the header is taller relative to it (the field position viewer alone is non-trivial height).

**Proposed behavior:**
- `.nlg-header` becomes `position: sticky; top: calc(var(--header-height) + var(--ticker-height) + var(--header-sub-h))` — pinned directly under the site's own sticky header stack, matching the exact pattern `.nlg-side` already uses one level down (`+ 1rem` for its own gap). No new stickiness mechanism invented — this is the site's established pattern, applied to a second element on the same page for the first time.
- **Not the full header at full height.** The pregame/live/final score row + clock/quarter + a compact one-line down-and-distance stay pinned. The field position viewer graphic (the tall part) does **not** stick — it scrolls away with the rest of the page. Reasoning: the field viewer is the richest visual on the page and deserves real space when the user is actively looking at it (i.e., on the Summary tab, scrolled to the top); pinning it permanently would eat a large fixed slice of viewport on every tab, working against the exact density discipline DESIGN.md asks for elsewhere on this page. A collapsed sticky header is a compact instrument panel, not a shrunk-down copy of the hero.
- **Transition state:** the header does not visually change shape when it becomes sticky (no re-layout, no size jump) — it simply stops moving with the page once its scroll position would take it past the pin point. This matches DESIGN.md's motion rule directly: "motion communicates state, never decorates." A layout shift here would look like a bug, not a feature.
- **Live-update behavior while sticky:** score/clock/down-distance continue to diff-render in place exactly as they do today (the existing `_nlgMaybePoll`/section-diff architecture already handles this) — stickiness only changes position, not the update mechanism. No new poll logic needed.
- **z-index:** must sit above tab content but below the site's own header stack (`.header-inner`/`.header-ticker`/`.sub-nav`) — same layering the sidebar already respects.

**States to spec:**
- *Default (page loaded, not yet scrolled):* header renders in normal flow, identical to today — no visual difference until the user actually scrolls past it.
- *Sticky/pinned (scrolled past the header's natural position):* compact score/clock/down-distance bar pinned under the site header. A subtle bottom border or shadow (existing `--shadow-sm`/`--border-default` tokens, not a new one) to visually separate it from tab content sliding underneath — the same "is this floating above something" cue `.nlg-side` doesn't currently need (it has empty space beside it, not content sliding under it) but this element does.
- *Live game, sticky:* clock/score update in place, no flicker, no re-pin animation on each poll tick.
- *Final/pregame, sticky:* same compact bar, showing final score or kickoff countdown instead of a live clock — reuses whatever the non-sticky header already shows in those states, just in the pinned position.
- *Mobile (≤900px, where `.nlg-side` already unpins per the existing media query):* the sticky header stays pinned — this is arguably more valuable on mobile, not less, since the shorter viewport means the header would otherwise scroll away even faster. Confirm the compact bar's height doesn't eat too much of an already-short mobile viewport; may need a shorter mobile-specific compact layout (e.g., score only, clock/down-distance dropped) rather than assuming the desktop compact bar just reflows. Flagging this as an open question for Kael's visual pass, not deciding it here.
- *Tab switch while sticky:* header stays pinned and unaffected — tab switching only changes body content below it, consistent with how the page already separates header/sidebar from `.gv-tabpanel`.

**What the user does next:** glances at the pinned score/clock without losing their place in whatever they were reading — no explicit action, this is a passive-context feature. No new interactive element, so no new keyboard/focus state to add; existing tab focus order is unaffected since the sticky header contains no new focusable controls.

**Accessibility:** no new interactive elements, so no new tab-stops or ARIA needed. One real consideration: `position: sticky` elements can end up in an unexpected place in screen-reader linear reading order if not careful — since this preserves the header's existing DOM position (only changes CSS position, not DOM order), reading order is unaffected. Confirm with a screen reader pass before shipping regardless, since this is exactly the kind of assumption that should be verified, not asserted.

**Explicitly not in this spec:** the field position viewer becoming sticky (named and rejected above), any new data or polling behavior, any change to the six-tab structure itself.

---

### Idea 2 — Big-play Highlight Card auto-suggest (D-080 Phase 3's deferred item)

**Job to be done:** "That was a huge play — I want to make a shareable card of it right now, while it's fresh, without digging through the Highlight Card Studio's game/player picker to find the exact play I just watched." Today, creating a highlight card from a live game requires leaving the live view, opening the Studio fresh (or via the existing "Create Highlight Card" button, which pre-selects the *game* but still requires manually picking the *player* and stats), with no connection to any specific big moment that just happened on screen.

**Scope check against D-080/D-081 first, before speccing behavior:** D-080 Phase 3 named "auto-suggested Highlight Cards from major plays" as deferred, explicitly because computing what counts as a "major play" the way D-080 originally framed it (EPA-based significance) needs nflverse play-by-play data that D-081 confirmed does not exist for the 2026 season yet (`play_by_play_2026.*` still absent as of this session's own recheck, tonight). **That EPA-based version of this feature is still blocked — this spec does not reopen or route around that blocker.** What follows is a deliberately smaller version that does not need EPA at all, scoped to only what's actually available live today.

**What "big play" means here, without EPA:** a rule-based, no-model definition built entirely from data `js/nflLiveGame.js` already has in hand from the existing scoring-plays/play-by-play parse: any scoring play (TD, FG, safety — already flagged in ESPN's `scoringPlays` array, which the page already reads), or a single play with a large yardage gain (a fixed threshold — e.g. 20+ yards, a number to sanity-check against real play distributions before committing, not asserted here) with a real turnover (INT/fumble recovery) also qualifying. This is intentionally the same class of "no new data source" rule-based approach D-081 already used for Phase 3a's Success Rate/Drive Efficiency — proven pattern, not a new one.

**Proposed behavior:**
- When a qualifying play happens (detected on the same poll tick that already updates the page — no new fetch), a small, dismissible prompt appears — not a modal, not an interruption of whatever the user is currently looking at. Anchored near the top of the page (below the sticky header from Idea 1, if both ship) or as a toast-style element, final placement is Kael's call, not decided here.
- Prompt copy names the actual play plainly — e.g. "Mahomes to Kelce, 34-yd TD -- make a card?" -- never a generic "Big play detected!" (ux.md's own rule: no placeholder text as a stand-in for real labels; this is the same principle applied to a system-generated prompt).
- Two actions: **Create Card** (jumps straight into the Highlight Card Studio with both the game *and* the specific player from that play pre-selected — a step beyond today's `openNFLHighlightCardForGame`, which only pre-fills the game) and **Dismiss** (closes the prompt, no further action, does not suppress future prompts for later plays in the same game).
- **Does not auto-open the Studio.** The user chose to be on the live game page; auto-navigating away from what they're watching the moment something exciting happens would be exactly the kind of interruption ux.md's "every interaction has a cost" principle warns against — it would cost them their place in whatever they were reading, for a feature meant to reduce friction, not add it.
- **Rate limiting:** if multiple qualifying plays happen close together (a shootout with back-to-back scores), only show one prompt at a time — a new qualifying play while a prompt is already showing replaces its content rather than stacking a second prompt. No more than one prompt visible ever.
- **Auto-dismiss:** the prompt is not permanent chrome — it should clear itself after a reasonable window (e.g., the next poll tick that has no new qualifying play, or a fixed timeout) rather than sitting on screen indefinitely as stale advice about a play that already scrolled by. Exact timing is an implementation detail for whoever builds this, not pinned down here, but "it never goes away on its own" is explicitly the wrong answer.

**States to spec:**
- *Default:* no prompt — this is the overwhelmingly common state, most poll ticks have no qualifying play.
- *Qualifying play detected:* prompt appears with a short, named entrance (matching DESIGN.md's 120-150ms ease-out standard for state changes — this is a state change, not decoration, so the existing rule applies directly, no new motion budget needed).
- *User clicks Create Card:* prompt dismisses, `navigateTo('nfl-highlight-card')` fires with both eventId and the specific player pre-selected — extending `_hcNflPendingEventId`'s existing single-value handoff pattern (`js/highlightCard.js`) to also carry a player reference; exact shape (athlete id? the same `side:group:index` key the picker's own `<select>` already uses, confirmed live this session while reproducing the layout bug?) is Axiom's call, not decided here.
- *User clicks Dismiss:* prompt clears immediately, no card created, no future suppression.
- *User does nothing:* prompt auto-clears per the timeout above.
- *Pregame/Final:* feature is inert — no plays are happening pregame, and "final" state has no new plays to detect; existing `openNFLHighlightCardForGame` entry point remains the only path from a finished game, unchanged.
- *Multiple qualifying plays in sequence:* replace-not-stack behavior above.
- *Mobile:* prompt must not cover the score header or block the tabs — placement needs its own mobile treatment, flagged for Kael same as Idea 1's mobile question.

**What the user does next:** either lands in the Studio with game+player pre-selected (a genuinely faster path than today's game-only preselect) and continues the existing Studio flow (stats -> animation -> color, all unchanged), or dismisses and keeps watching — both are complete, non-dead-end outcomes.

**Accessibility:** the prompt is a new interactive element with two real actions — needs a visible focus state on both buttons, keyboard reachability (not just mouse/touch), and should not trap focus (this is a live page the user may be actively reading via screen reader elsewhere) — likely an `aria-live="polite"` announcement region so screen reader users are told a card-worthy moment happened, not just sighted users via a visual toast. Exact ARIA pattern to be confirmed against a live screen reader test before shipping, consistent with this file's "accessibility is not a checkbox" standing rule.

**Explicitly not in this spec:** the EPA-based "major play" detection D-080 originally named (still blocked on nflverse data per D-081, unchanged by this entry), any change to the Studio's own flow once entered, auto-navigation without user action.

---

**Gate status: Vera's behavioral spec only.** Both ideas need Kael's visual pass (prompt placement/treatment for Idea 2, mobile compact-header layout for Idea 1) and Axiom's feasibility check (exact data shape for the play-detection rule in Idea 2, confirming the sticky positioning math against the real header height stack for Idea 1) before either is buildable. Neither is scheduled; this entry exists so the idea isn't lost or rebuilt from scratch later, per this file's own "don't leave a finding undocumented" rule.

## Trophy Case — cross-sport career achievements engine (D-116), 2026-08-23

**Job to be done:** "This player won a championship / an MVP — I want to see that at a glance on their page, the way I'd expect any real sports-reference site to show it," without digging through a full career stat table to reconstruct it. Today no player detail page (any of the 5 sports) shows career hardware anywhere — stat tables show performance, not what it earned.

**Scope check against ISSUES.md/DECISIONS.md/GOALS.md first:** no prior entry for awards, trophies, MVPs, or championship history in any of the three files — genuinely new ground.

**Vera — states:**
- *Player with verified achievements (any count):* one tile per achievement type, sorted by taxonomy group (championship first, then major individual awards, then conference/other honors), each tile showing a count, a short label, and the specific season(s) — the site's existing Receipts convention (show provenance, not just a claim) applied to hardware instead of a stat number.
- *Player with zero verified achievements — the ~99% case (rookies, journeymen, most of any roster):* container renders **nothing at all**, not an empty-state card. DESIGN.md's "empty states name their way out" rule assumes there's a next action to suggest; there is no way out of not having won a championship yet, so a permanent "0 trophies" card on nearly every profile would be noise dressed as information, not a real empty state. Deliberate, confirmed with the owner's brief's own framing (illustrative example was multi-trophy, not zero — this pushed the zero-case into the spec explicitly rather than leaving it implicit).
- *Sport with no seeded award data at all (MLB/NCAAF/NCAAB/WNBA at ship time):* fails closed identically to the zero-achievement case — a 404/missing `data/awards-<sport>.json` never throws, never shows a broken card, just renders nothing.
- *Data load failure (network/parse error):* same fail-closed behavior, logged via `Logger.warn` for diagnosis, never surfaced to the user as an error state — a missing trophy case is not worth interrupting the page over.
- *Name-matching collision:* two real players sharing a normalized name would collide (out of scope for v1 — reuses `_normName`'s existing cross-source matching convention rather than inventing a new one; no such collision exists in the seeded NFL data, confirmed by construction with 3 keys).

**Kael — visual (revised mid-session after an owner-supplied mockup; see DECISIONS.md D-116 for the full pivot writeup):**
- **Placement:** sticky side rail (`.nlg-layout`/`.nlg-main`/`.nlg-side`), not stacked into the linear card flow after the stat tables. Reuses the exact two-column pattern already shipped on the NFL live-game page — no new sidebar CSS invented.
- **Shell:** `.nlg-side-card`/`.nlg-side-title`, matching how every other sidebar widget on the site already looks, rather than the main-column `.stats-card` treatment.
- **Imagery:** inline gold-gradient SVG icons stand in for trophy/medal photography (trophy cup for championships, medal for individual awards, rosette fallback for anything else) — chosen over real trophy photography, which was ruled out on two grounds: no image-generation tool available this session, and real photos of official league hardware carry copyright/trademark risk on a live public site. Owner confirmed this tradeoff directly (chose "polished CSS/SVG illustrations" over the alternative when asked).
- **Color:** new `--color-award` semantic token family (gold), explicitly not `--accent` (brand orange is brand-only, D-047 invariant #3) and not a stat-category or `--color-tier-*` token — hardware/achievement is its own meaning, same discipline DESIGN.md already applies to every other color token on the site.
- **Layout of a tile:** icon + count/label on one line, seasons on the line below in mono type (same "receipts" instinct the rest of the site uses for provenance) — vertical stack of tiles, not a wrapping horizontal grid, so the side rail reads cleanly at its fixed ~300px width.

**Axiom — schema/feasibility:**
- One generic engine (`js/achievements.js`): a per-sport taxonomy config object (`{label, short, group}` per achievement type) consumed by a single render function — same "sports differ only in config, never in render logic" pattern `detailFrame.js` already established for `detailHeader()`/`detailSection()`. Adding a new sport is a taxonomy entry + a `data/awards-<sport>.json` file; zero render-code changes.
- Data keyed by `_normName(full name)` — reuses the site's existing cross-source name-matching helper (`js/config.js`, built for BDL/NBA.com matching) rather than any one API's player ID, since ID schemes differ per sport/source (Sleeper for NFL, MLB Stats API for MLB, ESPN for NCAAF, etc.) and a name-keyed static JSON file needs to match against whichever ID scheme happens to be rendering the page.
- An achievement type not present in a sport's taxonomy config still renders (fallback: title-cased type string, sort group 9, rosette icon) rather than breaking — curated data can land ahead of a taxonomy-config update instead of the two being coupled.
- Data source: hand-curated static JSON, same precedent as `data/trades.json`/`data/stadiums.json` — no live API surface exists for career award/championship history on any source this site already integrates (MLB Stats API, ESPN, Sleeper, nflverse), confirmed by Relay. See DECISIONS.md D-116 for the full sourcing decision and the standing seasonal-upkeep question.

**Gate status: all three gates present — Finn-buildable.** Built and live-verified this session; see DECISIONS.md D-116 for the full build/verification writeup, including the mid-session placement/imagery pivot and the exact players/data verified against real sources.
