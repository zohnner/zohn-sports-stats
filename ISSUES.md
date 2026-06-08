# Issues

Active issues in priority order. When fixed, delete the row — the fix lives in the code and the git message.

---

## P1 — Critical

| ID | File | Description |
|---|---|---|
| P1-006 | [`js/api.js:11`](js/api.js#L11) | `BDL_API_KEY` is plaintext in source — any public push leaks it. Fix: deploy `worker/bdl-proxy.js`, set `BDL_PROXY_URL` in `api.js`, remove the raw key. |

### P1-006 — Active Incident Detail
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

## Design Issues

### WCAG Audit Results — mlb-player-{id} (Priority 1)
**Contributor:** Finn | **Date:** 2026-06-04
**Tool:** Lighthouse 13.3.0 | **Score: 91/100** — passes D-004 threshold (≥90).

**FAIL: color-contrast** — Ticker LIVE pill text at 3.79:1 (expected 4.5:1). Same root cause as players view — `--color-live` amber text on dark ticker surface. Routes to **Kael** for token fix alongside the players view repair.

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

### Park Factors Table — Undated, No Source Attribution, No Update Path
**Contributor:** Relay | **Date:** 2026-06-04

`_PARK_FACTORS` at [`js/mlb.js:138`](js/mlb.js#L138) is a static 30-entry lookup hardcoded with no season year, no source, and no update mechanism. Park factors shift year-over-year. The A's entry (team ID 133, value `0.97`) references Sutter Health Park in the comment but the factor likely reflects Oakland Coliseum era data — this requires verification.

**Recommended actions (Axiom — small):**
1. Add `// Source: Baseball Reference park factors | Season: YYYY` at the top of the table. Document which season these values reflect so future reviewers know when a refresh is due.
2. Flag in GOALS.md as an annual maintenance item: refresh park factor values at each season's start (April).

This is not a P1 — the values are close enough for a badge display and graceful fallback (`_parkFactorBadge` renders nothing if the team ID is missing). But stale values mislead analysis for teams with recently changed parks.

---

### Sprint Speed CSV — No Column Schema Guard
**Contributor:** Relay | **Date:** 2026-06-04

`fetchSprintSpeedLeaderboard()` at [`js/mlb.js:484`](js/mlb.js#L484) parses Savant's sprint speed CSV by header name. If Savant renames `sprint_speed` to another column name, the `.filter(r => r.player_id && r.sprint_speed)` at line 503 silently returns an empty array — the feature goes dark with no log entry. The HTML-response guard (line 494) handles a different failure mode.

**Recommended fix (Finn — one line, Axiom review):** After parsing headers at line 497, add:
```js
if (!headers.includes('sprint_speed')) {
    Logger.warn('Savant sprint speed CSV schema changed — column not found', undefined, 'MLB');
    return null;
}
```
This converts a silent data failure into an observable log event. Route to Axiom if the fix touches anything beyond the one guard line.

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
- `wrangler deploy` on the BDL proxy to push the source change to production — Axiom executes when ready.
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
- Format above 60 min: current implementation returns `"Updated Nh ago"`. Kael's spec said `"Updated today at H:MM AM/PM"`. Kael decides — both are defensible.

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

## Scorecard Feature — Phased Implementation Roadmap

**Architecture lead:** Axiom | **Date:** 2026-05-17
**Reference:** `Documentation/baseball-scorecard-docs.md` | **Decision:** `DECISIONS.md D-007`

**Hard blockers — no implementation starts until both are closed:**
- ✅ D-001: Design system overhaul complete — **resolved 2026-05-17**
- ✅ D-003: Fetch deduplication complete — `_fetchMLBLeaderSplits()` pending-promise registry in `mlb.js`, smoke-tested 2026-05-17

**Spec gates — Finn does not start Phase 1 until all four exist:**
- ✅ Kael visual design: grid layout, diamond SVG proportions, new CSS tokens, typography decision — **complete, see Visual Design section below**
- ✅ Vera behavioral spec: all states — active PA, cell hover, scorecard empty, API error mid-game, mobile layout, keyboard nav — **complete, see UX Specs section**
- ✅ Axiom API verification: Phase 0 complete — see findings below
- ❌ Axiom AppState review: Phase 3 field additions approved before Finn touches AppState — **pending**

---

### Kael Visual Design — Scorecard Phase 1
**Contributor:** Kael | **Date:** 2026-05-17
**Status:** Complete. All four design gates delivered. Finn may implement Phase 1 once D-003 closes.

---

#### Posture

The scorecard is a physical artifact dropped into a digital context. It should feel like a real paper scorecard sitting on a production desk — warm, legible, slightly worn — not a sleek dark-UI data table. This means the scorecard has its own surface tokens that intentionally break from the app's dark-mode palette. The island of warm paper in dark chrome is the design intention, not an inconsistency.

The broadcast audience will recognize this immediately as "a scorecard." That recognition is the primary visual goal. The hierarchy inside the card is: team names and score → inning columns → diamond fill states → notation labels. Nothing decorative should compete with this hierarchy.

---

#### CSS Tokens (already added to `css/variables.css`)

```css
--scorecard-paper:         #f5f0e6;   /* warm off-white — primary card background */
--scorecard-ink:           #1a1209;   /* near-black brown — notation text */
--scorecard-border:        #c4a882;   /* aged tan — major grid lines */
--scorecard-border-light:  #ddd0b8;   /* lighter — inning subdivision lines */
--scorecard-highlight:     #e8a830;   /* amber-gold — filled base segments */
--scorecard-run:           #d4380d;   /* terra cotta — run scored glow */
--scorecard-active-border: rgba(245,158,11,0.90); /* live at-bat pulse */
--scorecard-shadow:        0 4px 24px rgba(0,0,0,0.30), 0 0 0 1px rgba(180,160,130,0.25);
```

These tokens apply **only** within `.scorecard-*` selectors in `css/scorecard.css`. Do not reference them elsewhere.

---

#### Typography

Header row (team names, inning numbers): `var(--font-display)` (Barlow Semi Condensed) — condensed for density, authoritative weight. Font weight 700. All-caps for inning numbers.

Notation labels inside cells: `var(--font-mono)` (JetBrains Mono) — typewriter precision, aligns horizontally across rows. Font weight 400. 11px / `var(--text-xs)`.

Player names (left column): `var(--font-sans)` (Inter) — readable at small size, weight 600. 13px / `var(--text-sm)`.

Inning R/H/E footer and game totals bar: `var(--font-mono)`, weight 700, tabular-nums. Color: `var(--scorecard-ink)` at 80% opacity.

No external typeface additions. All three fonts are already loaded via existing CSS.

---

#### Grid Layout

```css
.scorecard-grid {
    display: grid;
    grid-template-columns: 180px repeat(var(--scorecard-innings, 9), minmax(60px, 1fr));
    grid-template-rows: 40px repeat(var(--scorecard-batters, 9), 88px) 32px;
    /* rows: header | batter rows | R/H/E footer */
    background: var(--scorecard-paper);
    border: 2px solid var(--scorecard-border);
    border-radius: var(--radius-sm);
    box-shadow: var(--scorecard-shadow);
    font-family: var(--font-mono);
    overflow: hidden;
}
```

`--scorecard-innings` and `--scorecard-batters` are CSS custom properties set inline by JS to handle extra-inning games and lineup depth beyond 9. Default 9 for both.

At the 180px name column + 9 innings at minimum 60px each: minimum total width is `180 + (9 × 60) = 720px`. This fits a 768px breakpoint with scrolling allowed. On desktop at 1280px, each inning column is approximately `(1280 - 180 - 32px padding) / 9 ≈ 119px`.

On mobile: horizontal scroll via `overflow-x: auto` on a `.scorecard-wrapper` container. The name column is `position: sticky; left: 0` with `z-index: 2` and the same `--scorecard-paper` background so it covers scrolling cells behind it.

---

#### Cell Structure

Each plate-appearance cell:

```html
<div class="sc-cell" role="gridcell" tabindex="0" aria-label="[batter] [inning] [notation]">
    <span class="sc-notation">K</span>       <!-- top-left: outcome symbol -->
    <span class="sc-count">1-2</span>        <!-- top-right: final count (optional, Phase 2) -->
    <svg class="sc-diamond" viewBox="0 0 60 60" aria-hidden="true">
        <path class="sc-seg sc-seg--first"  d="M30,30 L60,30 L30,60 Z"/>
        <path class="sc-seg sc-seg--second" d="M30,30 L30,0  L60,30 Z"/>
        <path class="sc-seg sc-seg--third"  d="M30,30 L0,30  L30,0  Z"/>
        <path class="sc-seg sc-seg--home"   d="M30,30 L30,60 L0,30  Z"/>
        <!-- outer diamond outline -->
        <path class="sc-diamond-border" d="M30,0 L60,30 L30,60 L0,30 Z"
              fill="none" stroke="var(--scorecard-border)" stroke-width="1.5"/>
    </svg>
</div>
```

**Diamond SVG geometry — exact coordinates:**
- ViewBox: `0 0 60 60`, rendered at 44px × 44px in cell
- Center point: `(30, 30)`
- Four corners: top `(30,0)` = 2B, right `(60,30)` = 1B, bottom `(30,60)` = home, left `(0,30)` = 3B
- First base segment (bottom-right triangle): `M30,30 L60,30 L30,60 Z`
- Second base segment (top-right triangle): `M30,30 L30,0 L60,30 Z`
- Third base segment (top-left triangle): `M30,30 L0,30 L30,0 Z`
- Home segment (bottom-left triangle): `M30,30 L30,60 L0,30 Z`

**Segment fill states via CSS class on `<svg>`:**

```css
.sc-diamond .sc-seg { fill: none; }
.sc-diamond.reached-1 .sc-seg--first  { fill: var(--scorecard-highlight); }
.sc-diamond.reached-2 .sc-seg--second { fill: var(--scorecard-highlight); }
.sc-diamond.reached-3 .sc-seg--third  { fill: var(--scorecard-highlight); }
.sc-diamond.scored    .sc-seg--home   { fill: var(--scorecard-highlight); }
```

JS adds classes `reached-1`, `reached-2`, `reached-3`, `scored` directly to the `<svg>` element based on `resolveBaseProgression()` output. No inline styles, no D3.

**Run-scored glow animation** — applied to the home segment only:

```css
@keyframes scoredPulse {
    0%, 100% { filter: drop-shadow(0 0 0px var(--scorecard-run)); }
    50%       { filter: drop-shadow(0 0 6px var(--scorecard-run)); }
}
.sc-diamond.scored .sc-seg--home {
    fill: var(--scorecard-highlight);
    animation: scoredPulse 600ms ease-out 1 forwards;
}
@media (prefers-reduced-motion: reduce) {
    .sc-diamond.scored .sc-seg--home { animation: none; }
}
```

One-shot animation (`1 forwards`) — fires at render time for historical mode, does not loop.

---

#### Header Row

Left cell (name column header): team abbreviations stacked — home team above, away team below, separated by `var(--scorecard-border)`. Background `var(--scorecard-paper)`. Font: `var(--font-display)` 700.

Inning number cells: centered, `var(--font-display)` all-caps, `var(--text-xs)`, `var(--scorecard-ink)` at 70% opacity. Column dividers: `1px solid var(--scorecard-border-light)`.

---

#### Name Column

Each player name row: `var(--font-sans)` 600, 13px, left-padded `8px`. The player name is a `<button>` element (per Vera's spec) with `cursor: pointer` and no default button styling. Focus ring uses `outline: 2px solid var(--scorecard-active-border); outline-offset: -2px`.

Name column has `background: var(--scorecard-paper)` and `border-right: 2px solid var(--scorecard-border)`. On mobile, `position: sticky; left: 0; z-index: 2`.

---

#### Footer Row (R/H/E per inning)

Row height: 32px. Background: `rgba(196,168,130,0.15)` — a subtle step down from the paper white to visually separate totals from at-bat cells. Font: `var(--font-mono)` 700, 11px, tabular-nums. Three sub-rows (R/H/E) are stacked within the 32px height using `display: flex; flex-direction: column`. 

Abbreviation labels (R/H/E) appear in the left column (name column footer) in `var(--text-xs)` weight 700.

---

#### Wrapper and Chrome

```css
.scorecard-wrapper {
    background: var(--scorecard-paper);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--scorecard-shadow);
    /* Subtle fold line at vertical midpoint */
    position: relative;
}
.scorecard-wrapper::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 0; right: 0;
    height: 1px;
    background: rgba(196,168,130,0.25);
    pointer-events: none;
}
```

The scorecard header (team names, game date, final score) sits above the `.scorecard-grid` in a `.scorecard-header` div. Background: `var(--scorecard-paper)`. Bottom border: `2px solid var(--scorecard-border)`. Padding: `16px 20px`.

---

#### Active At-Bat Cell (Phase 3 — visual spec in advance)

```css
.sc-cell.pa--active {
    outline: 2px solid var(--scorecard-active-border);
    outline-offset: -2px;
}
@keyframes activeAtBatPulse {
    0%, 100% { outline-color: rgba(245,158,11,0.90); }
    50%       { outline-color: rgba(245,158,11,0.35); }
}
.sc-cell.pa--active {
    animation: activeAtBatPulse 1.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
    .sc-cell.pa--active { animation: none; }
}
```

---

#### What Finn Must Not Do

- No `transform: rotate(45deg)` on the diamond — use the SVG path geometry above instead. Rotation creates html2canvas rendering issues flagged in D-007.
- No hardcoded color values in `scorecard.css` — all values from `--scorecard-*` tokens or existing `variables.css` tokens.
- No D3. No third-party animation libraries. CSS keyframes only.
- No `innerHTML +=` — build the full scorecard HTML string and inject once.
- Diamond segment fill via CSS class on the `<svg>` element — not inline style, not per-path class manipulation.

---

### Phase 0 — API Shape Verification (Finn, no code)
**Assigned to:** Finn | **Blocks:** Phase 1 | **Status:** Complete — see findings below

Fetch the play-by-play payload from `/game/{gameId}/playByPlay` for two completed 2025 games: one with clean outcomes only, one with complex base states (stolen base mid-at-bat, wild pitch with runners on, double play). Use `mlbFetch('/game/{gameId}/playByPlay', {}, ApiCache.TTL.LONG)` — never call the endpoint directly.

Document the following and file results as a follow-up entry in ISSUES.md:

1. The exact shape of `allPlays[n]` — which fields are always present, which are conditional
2. How `runners` array within each play encodes base advances (including mid-PA advances that happen before the batter's outcome resolves)
3. Whether stolen bases and wild pitches mid-at-bat appear as separate play objects or as embedded `playEvents` within the active at-bat's object
4. Which `result.eventType` strings map to the notation symbols in the doc (K, Kc, BB, 1B, 2B, 3B, HR, FC, E#, DP, etc.) — produce the full mapping table
5. How `about.halfInning` and `about.inning` are structured (confirm "top"/"bottom" string values, confirm inning numbering starts at 1)

Research and documentation only. No rendering code, no UI work. Route findings to Axiom before Phase 1 begins.

### Phase 0 Findings — Play-by-Play API Shape
**Contributor:** Finn | **Date:** 2026-05-17
**Games examined:** 823384 (PHI 11 @ PIT 9, 10 innings — complex), 824194 (TEX 0 @ HOU 2 — clean)

---

**allPlays[n] — always-present top-level keys:**

| Key | Type | Notes |
|---|---|---|
| `result` | object | `type`, `event`, `eventType`, `description`, `rbi`, `awayScore`, `homeScore`, `isOut` |
| `about` | object | `atBatIndex`, `halfInning`, `isTopInning`, `inning`, `startTime`, `endTime`, `isComplete`, `isScoringPlay`, `hasReview`, `hasOut`, `captivatingIndex` |
| `count` | object | `balls`, `strikes`, `outs` — count at END of play |
| `matchup` | object | `batter` (`id`, `fullName`, `link`), `batSide`, `pitcher` (`id`, `fullName`, `link`), `pitchHand`, `splits` |
| `pitchIndex` | int[] | Indices into `playEvents` for pitch-type events |
| `actionIndex` | int[] | Indices into `playEvents` for non-pitch actions (SB, WP, subs, etc.) — empty array when no mid-PA actions |
| `runnerIndex` | int[] | Redundant with `runners` — do not use |
| `runners` | object[] | All runner movements for the play — both mid-PA and final batter outcome |
| `playEvents` | object[] | Chronological pitch-by-pitch events, interleaved with action events |
| `playEndTime` | string | ISO 8601 |
| `atBatIndex` | int | Sequential 0-based index across entire game — same value as `about.atBatIndex` |

---

**`about` field details:**
- `halfInning`: always `"top"` or `"bottom"` (lowercase)
- `inning`: integer, 1-based (`1` = first inning)
- `isScoringPlay`: `true` if any runner scores in this play
- Games that end in the top of an inning have no `allPlays` entries for the bottom of that inning — the scorecard must render the missing half as a blank column. Confirmed: TEX @ HOU game ends with last play in `top` of inning 9; no bottom-of-9th entries.

---

**`runners` array — full shape per entry:**

```js
{
  movement: {
    originBase: null | '1B' | '2B' | '3B',   // where runner was when pitch was delivered
    start:      null | '1B' | '2B' | '3B',   // base at start of this movement segment
    end:        null | '1B' | '2B' | '3B' | 'score', // base after movement; null = out
    outBase:    null | '1B' | '2B' | '3B',   // base where put out; null if safe or batter
    isOut:      boolean,
    outNumber:  null | 1 | 2 | 3             // which out in the inning
  },
  details: {
    event:            string,    // human-readable event name
    eventType:        string,    // machine-readable event type (same vocabulary as result.eventType)
    movementReason:   null | string,
    runner:           { id, fullName, link },
    responsiblePitcher: null | { id, fullName, link },
    isScoringEvent:   boolean,
    rbi:              boolean,
    earned:           boolean,
    teamUnearned:     boolean,
    playIndex:        int        // index into playEvents this movement corresponds to
  },
  credits: [ { player, position, credit } ]  // fielding credits (assists, putouts)
}
```

**Critical encoding rules for `resolveBaseProgression()`:**

1. `start: null` = the batter coming to plate (not a baserunner)
2. `end: 'score'` = runner scored a run (NOT `end: null`)
3. `end: null` + `isOut: true` = runner put out; `outBase` tells you where
4. A single runner can appear **multiple times** in the `runners` array when they advance in stages during one play. Example: on a single, a runner goes from 1B → 3B — this produces two entries: `'1B' -> '2B'` and `'2B' -> '3B'`. To derive a runner's final base, follow their entries in `playIndex` order and take the `end` of the last one.
5. Mid-PA movements (SB, WP, CS) appear in the **same `runners` array** as the batter's final outcome. Distinguish by `details.eventType` — mid-PA entries will have event types like `stolen_base_2b`, `wild_pitch`, etc., while the batter's entry will have the plate-appearance event type.
6. To determine diamond fill state for a batter's cell: find the batter's runner entry where `movement.start === null`, then trace forward through any additional entries with the same `runner.id` to get their final `end` value.

---

**Mid-PA actions — how they appear in `playEvents`:**

Mid-PA events are `type: 'action'` entries in `playEvents` at the positions listed in `actionIndex`. They are interleaved chronologically between pitch entries. The at-bat continues after them — `pitchIndex` entries resume after.

Known `actionIndex` eventType values (confirmed across both games + known API vocabulary):

| eventType | Scorecard meaning |
|---|---|
| `stolen_base_2b` / `stolen_base_3b` / `stolen_base_home` | SB — annotate on baserunner's previous cell |
| `caught_stealing_2b` / `caught_stealing_3b` | CS — runner out mid-PA |
| `wild_pitch` | WP — advances shown in runners array |
| `passed_ball` | PB — advances shown in runners array |
| `pickoff_1b` / `pickoff_2b` / `pickoff_3b` | PO — runner out |
| `runner_placed` | Extra-innings automatic runner — treat as baserunner, no plate appearance |
| `pitching_substitution` / `offensive_substitution` / `defensive_substitution` / `defensive_switch` | Roster move — no baserunner effect; safe to ignore for diamond rendering |
| `game_advisory` / `batter_timeout` | Administrative — ignore for rendering |

---

**`result.eventType` → scorecard notation mapping:**

| eventType | result.event examples | Notation | Distinguish how |
|---|---|---|---|
| `strikeout` | Strikeout | `K` or `Kc` | Last pitch `details.call.code`: `'C'` = looking (Kc); `'S'`, `'W'`, `'T'` = swinging (K) |
| `walk` | Walk | `BB` | — |
| `hit_by_pitch` | Hit By Pitch | `HBP` | — |
| `single` | Single | `1B` | — |
| `double` | Double | `2B` | — |
| `home_run` | Home Run | `HR` | — |
| `field_out` | Groundout / Flyout / Lineout / Pop Out | `G`, `F`, `L`, `F` | Use `result.event`: `'Groundout'` → `G`, `'Flyout'` → `F`, `'Lineout'` → `L`, `'Pop Out'` → `F` |
| `grounded_into_double_play` | Grounded Into DP | `DP` | Can append fielding positions from credits if needed |
| `double_play` | Double Play | `DP` | Non-groundball DP (e.g., line-drive DP) |
| `force_out` | Forceout | `FC` | Batter reaches safely; another runner forced out |
| `field_error` | Field Error | `E#` | `#` = position code from `runners[n].credits[n].position.code` |
| `sac_bunt` | Sac Bunt | `SAC` | — |
| `sac_fly` | Sac Fly | `SF` | — |

**Note on `field_out` fielding positions:** The fielder position for notation (e.g., `G6-3` = shortstop to first) can be derived from `runners[n].credits` — entries with `credit: 'f_assist'` are the throwing fielders, `credit: 'f_putout'` is the fielder recording the out. The `position.code` is the standard scorecard number (1=P, 2=C, 3=1B, 4=2B, 5=3B, 6=SS, 7=LF, 8=CF, 9=RF). For Phase 1, abbreviated notation (`G`, `F`, `L`) is sufficient; detailed position notation is an enhancement.

---

**Pitch event shape (for Phase 2 hover tooltips):**

```js
{
  type: 'pitch',
  isPitch: true,
  pitchNumber: int,           // 1-based pitch number within at-bat
  count: { balls, strikes, outs },  // count AFTER this pitch
  details: {
    call: { code: string, description: string },  // 'B'=ball, 'S'=swinging, 'C'=called, 'X'=in-play, 'T'=foul-tip, 'W'=blocked
    description: string,      // 'Ball', 'Called Strike', 'Swinging Strike', 'In play, out(s)', etc.
    type: { code: string, description: string },  // pitch type: 'FF'=4-seam, 'SI'=sinker, 'SL'=slider, 'CH'=changeup, 'CU'=curveball, 'FS'=splitter, etc.
    isInPlay: boolean,
    isStrike: boolean,
    isBall: boolean,
  },
  pitchData: {
    startSpeed: number,       // release velocity (mph)
    endSpeed: number,         // plate velocity (mph)
    coordinates: {
      pX: number,             // horizontal plate location (-1.7 to 1.7 ft from center; negative = catcher's left)
      pZ: number,             // vertical plate location (feet above ground; ~1.6–3.5 ft is typical strike zone)
    },
    breaks: {
      spinRate: number,       // RPM
      breakVerticalInduced: number,  // IVB in inches
      breakHorizontal: number,       // HB in inches
    },
    zone: number,             // Statcast zone (1-9 = in-zone, 11-14 = out-of-zone)
    strikeZoneTop: number,    // batter-specific top of strike zone (feet)
    strikeZoneBottom: number, // batter-specific bottom of strike zone (feet)
  }
}
```

---

**Escalation to Axiom:** Phase 0 complete. All five questions from the task brief are answered above. The multi-entry runner pattern (a single runner appearing multiple times when advancing in stages) is the non-obvious piece most likely to produce incorrect diamond fills if not handled — flagging this specifically for Axiom's review of `resolveBaseProgression()` before Phase 1 integrates it.

---

### Phase 1 — Historical Static Render
**Assigned to:** Finn | **Estimated:** 3–5 weeks | **Status:** ✅ Shipped and smoke-tested 2026-06-01. One P3 finding below.

**Smoke test result (Axiom, 2026-06-01):** Cold deep-link to `#mlb-scorecard-823384` (PHI @ PIT, 10 innings). Full render confirmed: 10-column CSS Grid, correct notation symbols (K, Kc, HR, FC, 1B, DP, G, BB, SF), correct diamond fill states (partial + full amber fills per base reached), paper texture aesthetic, player names, team logos, FINAL status, ← Scores nav. Live scores ticker active alongside the scorecard view.

**P3 finding — header scores show `—` on cold deep-link:** RESOLVED (Axiom, 2026-06-01). `_fetchGameMeta()` was reading `box.teams?.home?.runs` from the boxscore endpoint, which is the wrong field path. The MLB boxscore API puts run totals at `box.teams.home.teamStats.batting.runs`. The linescore endpoint (used elsewhere in mlb.js) uses `ls.teams.home.runs` — these are different endpoints with different shapes. Fixed in [`js/scorecard.js:165`](js/scorecard.js#L165) — both home and away corrected to `teamStats.batting.runs`. Cold deep-link to a completed game now shows the correct final score.

**Axiom review findings (2026-06-01):**

Reviewed `scorecard.js` (425 lines) and `css/scorecard.css` (415 lines) against Phase 0 findings and Kael/Vera specs.

**Approved — no blocking issues:**
- `resolveNotation()` — correct. Strikeout looking/swinging distinction via last pitch `call.code === 'C'`. All Phase 0 eventType mappings present plus reasonable additions (IBB, CI, SACDP).
- `resolveBaseProgression()` — correct. Multi-entry runner pattern handled: filters by `runner.id === batterId`, sorts by `playIndex`, takes last entry's `end`. Handles staged advances, out-at-base, and home-run scoring correctly.
- `buildScorecardData()` — correct. Parallel fetch of PBP + game meta. Inning count derived from data, not hardcoded.
- `_buildTeamSection()` — correct. Lineup ordered by first appearance; `paByInning` map handles multiple PAs per inning (shows first PA in column slot — known Phase 1 limitation, acceptable).
- Navigation wiring in `navigation.js` — correct. `_restoreMLBScorecard` registered in all three paths: `popstate`, `_renderMLBView`, `_loadFromHash`. Hash regex `^mlb-scorecard-(\d+)$` correct.
- `css/scorecard.css` — complete. All Phase 1 selectors, base-fill states, `scoredPulse` animation, `prefers-reduced-motion` overrides, mobile grid sizing all present per Kael's spec.

**Fixed in this session:** Double `resolveBaseProgression(play)` call per PA in `_buildTeamSection` — cached result into `base` variable, used for both `pa.base` and `pa.scored`. Minor efficiency fix.

**Spec gap — route to Vera for ruling:**
`_renderScorecardSkeleton()` ignores `gameStub` entirely. Vera's spec called for: "The scorecard outer chrome renders synchronously from context already available: team names and team colors." Currently all three header slots render as generic skeleton lines even when `gameStub.teams.home/away` is available. This means a user who clicks "Scorecard" from the Scores view sees a fully generic skeleton rather than a team-contextual loading state. Vera decides: blocker for Phase 1 ship, or Phase 2 refinement?

**New files — both require Axiom review on load order placement before Finn creates them:**
- `js/scorecard.js` — load position: after `mlb.js`, before `nfl.js` in `index.html`
- `css/scorecard.css` — loaded via `<link>` in `index.html`; scoped to scorecard only

**New view:** `mlb-scorecard` registered in `renderCurrentView()` in `navigation.js`. Entry point: clicking a completed game card in the Scores view passes the `gameId` and opens the scorecard.

**Deliverables Finn is responsible for:**

`buildScorecardData(gameId)` — fetches `/game/{gameId}/playByPlay` via `mlbFetch()`, maps `allPlays` to PA objects. Must handle mid-PA base advances using the `runners` array findings from Phase 0. This is the most technically precise piece of Phase 1 — do not write it until Phase 0 results are documented.

`resolveNotation(eventType)` — maps MLB API `result.eventType` strings to display symbols. Use the mapping table produced in Phase 0. Pure function, no side effects.

`resolveBaseProgression(play)` — derives diamond fill state (which of the four base segments are filled) from the `runners` array. Returns `{ first, second, third, home }` boolean object per batter.

Grid render — CSS Grid, `grid-template-columns: 180px repeat(9, 1fr)`. Rows expand to fit the actual lineup depth (not hardcoded to 9). Player name column links to player detail. Header row shows inning numbers.

Diamond SVG — inline SVG per cell, four `<path>` segments (first/second/third/home). Fill state applied via CSS class (`segment--filled`), not inline style. SVG dimensions and segment geometry from Kael's design. No D3, no clipped divs.

Inning summary footer — R/H/E tallied per inning automatically from the play data. Appended as a footer row below each half-inning block.

Game totals row — cumulative R/H/E and LOB calculation. LOB = (runners who reached base) − (runs scored) − (caught stealing / picked off).

**Rules Finn must not break in Phase 1:**
- All play-by-play fetches via `mlbFetch()` — never `fetch(statsapi.mlb.com...)` directly
- All API strings going into `innerHTML` via `_escHtml()`
- Diamond is inline SVG — not clipped divs, not D3
- New CSS tokens only from Kael's approved additions to `variables.css` — no hardcoded color values
- No `html2canvas`, `jsPDF`, or `D3` loaded or referenced in Phase 1
- `Logger` everywhere — no bare `console.log`
- Build full HTML string, inject once — no `innerHTML +=`

**Axiom review gate:** Axiom reviews `buildScorecardData()` and `resolveBaseProgression()` for correctness against the Phase 0 findings before Finn integrates them into the render path. Incorrect base state logic will silently produce wrong diamonds.

---

### Phase 2 — Interactive Layer
**Assigned to:** Finn | **Estimated:** 1–2 weeks | **Status:** UNBLOCKED — begin immediately
**Vera behavioral spec:** complete (all cell interaction states defined above). Phase 1 shipped and Axiom-reviewed 2026-06-01. Finn may start Phase 2 now.

**Deliverables:**

Cell hover/tap tooltip — shows pitch sequence for that PA: pitch types, count progression, pitch locations if available in the `playEvents` array. Tooltip is pure CSS/HTML positioned relative to the cell — no third-party tooltip library. Keyboard-accessible (focus triggers tooltip, Escape dismisses).

Player name click — calls `showMLBPlayerDetail(playerId)` via the existing player detail routing. Back button must return to the scorecard view, not reset to home. Finn verifies this with Axiom before wiring it up — the routing implications touch `navigation.js`.

Run scoring visual — when a run scores, the home-plate diamond segment gets a CSS class that applies a brief fill animation (`@keyframes` in `css/animations.css` or `css/scorecard.css`). CSS transition only, no JS animation loop.

---

### Phase 3 — Live Mode
**Assigned to:** Finn | **Estimated:** 2–3 weeks | **Status:** ✅ Shipped 2026-06-08. All deliverables implemented in `js/scorecard.js` + `css/scorecard.css`. visibilitychange pause/resume committed same session.

**New AppState fields (Axiom approves shape before Finn writes anything):**
- `mlbLiveGameId` — string, the gameId currently being polled. Null when no live scorecard is active.
- `mlbLiveScorecardPlays` — array, accumulated plays for the live game. Reset when `mlbLiveGameId` changes.

**Deliverables:**

`startLiveScorecard(gameId)` — sets `mlbLiveGameId`, initializes `mlbLiveScorecardPlays`, starts polling at 20s interval. Interval handle stored in a module-scoped variable in `scorecard.js`.

Cleanup hook — interval is cleared when the user navigates away from `mlb-scorecard`. Finn wires this into `navigateTo()` in `navigation.js` as a pre-navigation hook: before rendering the new view, check if `mlbLiveGameId` is set and clear the interval. Axiom reviews this navigation.js change specifically — it touches shared routing logic.

Game-over detection — poll response includes game status. When status === `'Final'`, clear the interval and set `mlbLiveGameId` to null. No orphaned intervals.

Active PA cell — current batter's cell gets a `.pa--active` CSS class while the at-bat is in progress. Pulse animation via CSS (`@keyframes`), not JS. Pitch count (balls/strikes) displayed and updated within the cell on each poll cycle.

State recovery — if the user navigates away mid-game and returns to `mlb-scorecard`, the card re-renders from `mlbLiveScorecardPlays` (already accumulated in AppState) rather than showing a blank grid. No re-fetch from scratch.

---

### Phase 4 — Export / Share Card (P3-026)
**Assigned to:** Axiom (spike) → Finn (if spike passes) | **Estimated:** 2–4 weeks | **Status:** ✅ Shipped 2026-06-08. "Download ↓" button on completed scorecards; html2canvas 1.4.1 loaded dynamically from cdnjs; 2× scale PNG capture of `.scorecard-wrapper`. No CSP changes needed. jsPDF (PDF export) remains a future enhancement.

**User request (2026-06-04):** Users should be able to download a completed scorecard. This is the primary motivator for Phase 4 — the scorecard is a shareable artifact (broadcast use case, social distribution) and a static PNG download is the minimum viable version. PDF (jsPDF) is a secondary nice-to-have.

**Axiom spike (before any Finn work):**

Render a prototype scorecard cell — inline SVG diamond with fill state, notation label, CSS custom properties applied — and run html2canvas against it. Specifically test: CSS `transform: rotate(45deg)` on the diamond, CSS custom property resolution, inline SVG rendering. Document the output quality in ISSUES.md. If the output matches the live DOM acceptably, Phase 4 proceeds with html2canvas. If it does not, Axiom documents the Cloudflare Worker + Puppeteer screenshot alternative and escalates to the project owner for a scope decision before any Phase 4 implementation begins.

**If spike passes — Finn implements:**

Share card flow — "Share This Game" button on a completed scorecard. `html2canvas` captures the scorecard DOM node to a `<canvas>`. A team-color gradient header (using existing `getMLBTeamColors()`) and game date are composited onto the canvas. User downloads PNG or copies to clipboard.

CSP update — both `index.html` `<meta http-equiv="Content-Security-Policy">` and the `_headers` file must be updated with the html2canvas CDN domain before the script tag is added. Finn does not add the `<script>` tag until the CSP is updated in both places.

jsPDF (printable scorecard PDF) — evaluated after html2canvas output is validated. Similar CDN + CSP update required. Parked until html2canvas work proves out.

---

### Phase 5 — Annotation Mode & Custom Notation (Parked)
**Status: Parked indefinitely. No spec, no implementation until Phases 1–4 ship and adoption is validated.**

Annotation mode (freehand notes per cell) is effectively a mini drawing canvas and requires a full Vera spec before any implementation discussion. Custom notation mode requires maintaining parallel notation-mapping tables. Neither is core to the scorecard value proposition. These entries exist to prevent scope creep — if someone proposes implementing them before Phase 1–4 are done, this is the documented decision that blocks it.

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

## Live Game Expanded View — Phased Implementation Roadmap

**Architecture lead:** Axiom | **Date:** 2026-06-04
**Reference:** `sportsstrata_live_game_expanded_view.md` | **Decision:** `DECISIONS.md D-009`

**Spec gates — Finn does not start Phase 1 until all three exist:**
- ✅ Kael visual spec: complete 2026-06-04 — see "Kael Visual Spec — Phase 1" above
- ✅ Vera behavioral spec: complete 2026-06-04 — see "Vera Behavioral Spec — Phase 1" above
- ✅ Axiom feasibility sign-off: complete 2026-06-04 — `js/liveGame.js` + `css/liveGame.css` created and wired. Stub implementation in place. `stopLiveGamePolling()` hooked into `navigateTo()`. Click handler updated in `_createMLBGameCard()`. All 26 JS files pass syntax check.

**All three Phase 1 gates closed 2026-06-04. Finn may begin Phase 1 after completing Phase 0 live-game API verification.**

---

### Kael Visual Spec — Phase 1
**Contributor:** Kael | **Date:** 2026-06-04
**Gates:** Required before Finn starts Phase 1. Vera behavioral spec and Axiom feasibility must also be complete.

---

#### Posture

The expanded panel lives inside the scores list, not above it. It should feel like a score card that opened up — the same surface, more information, no chrome escalation. No modal shadow, no overlay backdrop, no new surface color. The panel is the game card, extended.

One intentional exception: the left border. A 3px solid band in the home team's primary color runs the full panel height. This is the only place team color applies to the panel structure itself — every other use of team color is in the score display and logo (already established in the game card). The border provides immediate visual identity without the panel needing a team-colored header.

---

#### Accordion Container — `.lg-panel`

```css
.lg-panel {
    border-left: 3px solid var(--lg-team-color, var(--accent));
    background: var(--bg-surface);
    border-top: 1px solid var(--border-default);
    border-bottom: 1px solid var(--border-default);
    margin: 0 calc(-1 * var(--space-4));   /* bleed to card edges */
    padding: var(--space-4);
    animation: lgPanelOpen 180ms ease-out forwards;
}
@keyframes lgPanelOpen {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
    .lg-panel { animation: none; }
}
```

`--lg-team-color` is set inline by JS on `.lg-panel` using the home team's `getMLBTeamColors(abbr).primary`. No hardcoded colors in CSS.

The panel inserts immediately after the clicked game card's DOM node. It is not a child of the card — it is a sibling. The game card itself does not change its layout or size when the panel opens.

---

#### Game Header Bar — `.lg-header`

Sits at top of `.lg-panel`. Single row on desktop, wraps on mobile.

```
[Away logo] AWAY  3 : 2  HOME [Home logo]    ▲7th    2-1 | 1 Out    [LIVE ●]
```

Tokens:
- Score values: `var(--font-display)` weight 800, `var(--text-2xl)` — same weight as ticker scores
- Winning team score: `color: var(--color-win)`
- Inning indicator: `var(--font-mono)` weight 700, `var(--text-sm)`, `color: var(--text-secondary)`
- Count/outs pill: `var(--bg-raised)` background, `var(--border-default)` border, `var(--radius-full)`, `var(--text-xs)` weight 600 — e.g. `2-1 · 1 Out`
- LIVE badge: reuse existing `.game-status--live` — amber dot + "LIVE" — no redesign
- FINAL / DELAYED / POSTPONED: reuse `.game-status--final` / `.game-status--sched` with appropriate labels

---

#### Linescore — `.lg-linescore`

CSS Grid. Inning number headers top, R/H/E pinned right, team rows below.

```css
.lg-linescore {
    display: grid;
    grid-template-columns: 48px repeat(var(--lg-innings, 9), minmax(28px, 1fr)) 20px 24px 24px;
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-xs);
    margin: var(--space-3) 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
.lg-linescore-cell {
    text-align: center;
    padding: 0.25rem 0.15rem;
    color: var(--text-secondary);
}
.lg-linescore-cell--header {
    color: var(--text-subtle);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid var(--border-default);
}
.lg-linescore-cell--active {
    background: var(--accent-subtle);
    color: var(--accent);
    border-radius: var(--radius-xs);
}
.lg-linescore-cell--rhe {
    font-weight: 800;
    color: var(--text-primary);
    border-left: 1px solid var(--border-default);
}
.lg-linescore-team {
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--text-muted);
    text-align: left;
    padding-left: 0.25rem;
}
```

`--lg-innings` set inline by JS. Extra innings extend the grid automatically — no max column assumption.

---

#### Tab Bar — `.lg-tabs`

Three tabs in Phase 1 (Play-by-Play | Box Score), using existing `.mlb-group-btn` / `.mlb-group-btn--active` classes. No new CSS needed.

```html
<div class="mlb-group-toggle-row lg-tabs" role="tablist">
    <button class="mlb-group-btn mlb-group-btn--active" role="tab" aria-selected="true"  data-lg-tab="pbp">Play-by-Play</button>
    <button class="mlb-group-btn"                        role="tab" aria-selected="false" data--lg-tab="box">Box Score</button>
</div>
```

Reuses the existing toggle component exactly — no divergence. Phase 2 adds the Matchup tab as a third button.

---

#### Play-by-Play — `.lg-pbp`

Scrollable list. Max height `320px`, `overflow-y: auto`. Most recent play at top.

```css
.lg-pbp-entry {
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border-default);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.5;
}
.lg-pbp-entry:last-child { border-bottom: none; }

.lg-pbp-inning {
    font-family: var(--font-mono);
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--text-subtle);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 0.3rem 0.5rem 0.2rem;
    background: var(--bg-raised);
    border-bottom: 1px solid var(--border-default);
    position: sticky;
    top: 0;
    z-index: 1;
}

/* Scoring play — green-tinted background */
.lg-pbp-entry--scoring {
    background: var(--color-win-subtle);
    border-left: 2px solid var(--color-win);
    padding-left: calc(0.5rem - 2px);
}

/* Home run */
.lg-pbp-entry--hr::before {
    content: '💥 ';
}
```

New play entries slide in from top: `animation: lgEntrySlide 200ms ease-out`. Reduced-motion override: `animation: none`.

---

#### Box Score Tables — `.lg-box`

Two tables per team (batting + pitching), switched via a team selector pill above. No new table CSS needed — reuse `.stats-table` from `components.css` if it exists, otherwise:

```css
.lg-box-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs);
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
}
.lg-box-table th {
    color: var(--text-subtle);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    padding: 0.25rem 0.4rem;
    border-bottom: 1px solid var(--border-default);
    text-align: right;
}
.lg-box-table th:first-child { text-align: left; }
.lg-box-table td {
    padding: 0.2rem 0.4rem;
    color: var(--text-secondary);
    text-align: right;
    border-bottom: 1px solid var(--border-default);
}
.lg-box-table td:first-child { text-align: left; color: var(--text-primary); font-family: var(--font-sans); }
.lg-box-table tr--active td { background: var(--accent-subtle); }
.lg-box-table tr--sub td:first-child { font-style: italic; color: var(--text-muted); }
```

Decision column (W/L/S/H/BS) rendered as a colored badge inline in the pitcher name cell — reuse `.position-badge` or similar existing pill.

---

#### What Finn Must Not Do
- No inline `style=` for team colors — use `--lg-team-color` CSS custom property set by JS
- No hardcoded pixel values — all spacing from `--space-*` tokens
- No new color tokens — all from existing `variables.css`
- No `innerHTML +=` — build the full panel HTML string, inject once
- Do not modify `.game-card` CSS — the panel is a sibling, not a child

---

### Vera Behavioral Spec — Phase 1
**Contributor:** Vera | **Date:** 2026-06-04
**Gates:** Required before Finn starts Phase 1. Companion to Kael's visual spec.

---

#### Entry and Exit

**Trigger:** Click on any live game card (`.game-card` where `abstractGameState === 'Live'`). The existing card click handler opens `showMLBGameDetail` — Finn wires a new handler that opens the expanded panel instead for live games. Final game cards continue to use the existing detail flow.

**One panel at a time.** Opening a panel for Game A while Game B's panel is open: close Game B's panel (collapse, stop polling if running), open Game A's panel, start polling. Never two panels open simultaneously.

**Exit:** A close button (`×`, top-right of `.lg-panel`, `aria-label="Collapse game view"`) collapses the panel. Collapse animation: reverse of open (`opacity 0, translateY(-6px)`, 150ms). After animation completes, element is removed from DOM and polling stops.

---

#### State 1 — Loading

Immediately on panel open, before any fetch resolves:

- Game header renders synchronously from data already available in the game card's `game` object: team names, logos, current score, inning indicator, count/outs if available from `game.linescore`
- Linescore area: skeleton shimmer rows (2 rows × 10 columns)
- Tab content area: 4 skeleton lines at `var(--text-xs)` height

The header is never a skeleton — the game card already has enough data to render it immediately.

#### State 2 — Live (data loaded, polling active)

All sections populated. LIVE badge pulses. Polling runs every 9 seconds. On each poll cycle where linescore state changes: header count/outs update, linescore refreshes active column highlight, new play-by-play entries prepend to list with slide-in animation.

**Play-by-play animation:** new entries prepend to the container. The entry animates from `opacity: 0, translateY(-8px)` to `opacity: 1, translateY(0)` over 200ms. No animation for entries that were present before the poll (only the diff).

**Score change:** when either team's run total increases, flash the score digit — `background-color: var(--color-win-subtle)` for 800ms then fade. CSS-only via a toggled class. One class toggle, one CSS transition.

**Pitching change:** if `feed/live` shows a new pitcher (`currentPlay.matchup.pitcher.id` changed since last poll), prepend a banner entry to the play-by-play list styled as `.lg-pbp-entry--pitching-change`: `"↔ Singer replaced by Bubic"`, `color: var(--text-muted)`, italic. No separate banner element — it's a play-by-play entry with a special style.

#### State 3 — Poll failure / reconnecting

After two consecutive linescore poll failures (network error or non-200 response): replace the LIVE badge with a `RECONNECTING…` badge (`color: var(--text-muted)`, no dot). Continue attempting polls.

After five consecutive failures: replace badge with `LIVE DATA UNAVAILABLE`. Show a "Retry" button below the game header that calls `_pollLiveGame(gamePk)` immediately and resets the failure counter. Do not remove any previously loaded data — show last known state, clearly labeled as stale via the badge.

#### State 4 — Game final (during polling session)

When `abstractGameState` changes to `'Final'` during a polling session: stop polling, replace LIVE badge with FINAL badge (`.game-status--final`), remove count/outs pill (game is over), add a "Full scorecard →" link in the header that navigates to `mlb-scorecard-{gamePk}`. Play-by-play log freezes. Box score freezes.

#### State 5 — Delayed / Suspended

When `detailedState` is `'Delayed'`, `'Suspended'`, or `'Rain Delay'`: reduce poll interval to 60 seconds. Replace LIVE badge with `DELAYED` or `SUSPENDED` (`.game-status--sched` styling). Show delay reason as a single line below the linescore if available from `linescore.note`. At-bat module (Phase 2) freezes if present.

#### State 6 — Between innings

When `linescore.inningState === 'Middle'` or `'End'`: count/outs pill shows `—` instead of a count. No at-bat module content (Phase 2). Play-by-play log is current. Poll continues at normal 9-second interval.

---

#### Tab Behavior

`data-lg-tab` attribute on each tab button. Active tab tracked in module-scoped `Map<gamePk, tabId>`. Default tab on first open: `'pbp'` (Play-by-Play). On tab switch: swap active class, swap content panel visibility. No re-fetch on tab switch — all data is already loaded.

`aria-selected="true/false"` on each tab button. `role="tabpanel"` on each content section with matching `aria-labelledby`. Tab panels not hidden via `display:none` — use `hidden` attribute for proper ARIA semantics.

---

#### Mobile Layout (≤768px)

Vertical stack order within `.lg-panel`:
1. Game header (score, status — same as desktop)
2. Count/outs + inning pill (own row)
3. Linescore (horizontal scroll within panel)
4. Tab bar (full width)
5. Tab content (play-by-play or box score)

No two-column layout on mobile. The pitch zone (Phase 2) drops below the linescore on mobile, not at the top. This contradicts the source document's wording — the source document is overridden by this spec.

Linescore horizontal scroll: `-webkit-overflow-scrolling: touch`, scrollbar hidden on mobile (`scrollbar-width: none`).

---

#### Keyboard Navigation

| Key | Behavior |
|---|---|
| `Tab` | Moves through: close button → tab bar buttons → content elements |
| `←` / `→` on focused tab button | Moves between tab buttons, activates focused tab |
| `Enter` / `Space` on tab button | Activates tab (already default behavior on `<button>`) |
| `Escape` | Collapses panel (same as clicking `×` close button) |

Focus returns to the game card's expand trigger when the panel is closed via Escape or the close button.

---

#### What Vera Has Not Specced (Phase 2)
- Pitch zone interaction (dot hover/tap, tooltip, keyboard focus on dots)
- Base diagram tap behavior on mobile
- Matchup stats tab empty state (player who has never faced this pitcher)

---

### Phase 0 — API Verification (Finn, no code)
**Assigned to:** Finn | **Blocks:** Phase 1 | **Status:** Partially confirmed by Axiom — remaining item below

**Confirmed:**
- `/game/{gamePk}/linescore` — lightweight (2KB), correct for diff polling. Fields: `currentInning`, `inningState`, `teams.away.runs`, `teams.home.runs`.
- `/game/{gamePk}/feed/live` — combined payload (200–500KB). Contains linescore + all plays + boxscore + current play `pitchData`.
- `/game/{gamePk}/boxscore` — already used by bullpen tracker. Field path for runs: `box.teams.home.teamStats.batting.runs` (not `box.teams.home.runs`). Confirmed by scorecard P3 fix.
- `/people/{personId}/stats?stats=vsPlayer&opposingPlayerId={id}&group=hitting` — **confirmed working**. Returns `vsPlayer` per-season splits + `vsPlayerTotal` career aggregate. Tested live 2026-06-04 against Pasquantino (686469) vs. Berríos (621244). Handle empty `splits` gracefully.
- `matchup.batterStrikeZoneTop` / `matchup.batterStrikeZoneBottom` — present in `feed/live` per-play matchup object. Use for zone bounds, not a fixed rectangle.

**Remaining Finn task (Phase 0): ✅ COMPLETE — 2026-06-04.** See findings below.

### Phase 0 Findings — Live Game feed/live API Shape
**Contributor:** Finn | **Date:** 2026-06-04
**Game verified:** 823457 (SD @ PHI, Final) via `/api/v1.1/game/823457/feed/live`

---

**CRITICAL — API version mismatch (routed to Relay + Axiom, fixed same session):**

`/game/{gamePk}/feed/live` returns **404 on `/api/v1`** and **200 on `/api/v1.1`**. This is the only MLB Stats API endpoint that requires the v1.1 base URL. All other game endpoints (`/linescore`, `/boxscore`, `/playByPlay`) work correctly on v1.

Impact: `displayGamePrep()` in `mlb.js` was silently failing on this fetch. Fixed by adding `MLB_BASE_URL_V11` constant at `mlb.js:340` and optional `baseUrl` parameter to `mlbFetch()`. The one call site updated at `mlb.js:6217`. `liveGame.js` polling URL updated to v1.1.

---

**CHECK 1 — Linescore field paths: CONFIRMED ✅**

All fields accessible at `feed.liveData.linescore`:
- `currentInning` — integer (1-based) ✅
- `inningState` — string: `"Top"`, `"Middle"`, `"End"`, `"Bottom"` ✅
- `isTopInning` — boolean ✅
- `balls`, `strikes`, `outs` — integers at linescore root ✅
- `teams.away.runs`, `teams.away.hits`, `teams.away.errors` ✅
- `teams.home.runs`, `teams.home.hits`, `teams.home.errors` ✅
- `innings[n]` shape: `{ num: 1, ordinalNum: "1st", home: { runs, hits, errors, leftOnBase }, away: { runs, hits, errors, leftOnBase } }` ✅

Note: innings use `home`/`away` sub-keys (not `home.runs` at top level of inning) — `liveGame.js` `_buildLinescore()` already handles this correctly.

---

**CHECK 2 — Pitch coordinates: CONFIRMED with correction ✅**

Pitch events in `liveData.plays.currentPlay.playEvents`:
- Filter by `e.isPitch === true` (not `e.type === 'pitch'`) ✅
- `pitchData.coordinates.pX` — horizontal position in feet from plate center ✅ (sample: -0.263)
- `pitchData.coordinates.pZ` — vertical position in feet from ground ✅ (sample: 1.043)
- `pitchData.startSpeed` — velocity in mph ✅ (sample: 91.4)
- `details.type.description` — pitch type ✅ (sample: "Cutter")
- `details.call.description` — call result ✅ (sample: "Swinging Strike")
- `count.balls`, `count.strikes` — count at time of pitch ✅

**Correction to source document and D-009:** `batterStrikeZoneTop` and `batterStrikeZoneBottom` are NOT on `currentPlay.matchup` — they do not exist at that path. Correct path is `playEvents[n].pitchData.strikeZoneTop` and `pitchData.strikeZoneBottom` (present on every pitch event). D-009 architecture note and Kael's Phase 2 spec should be updated to reflect this. Kael's SVG coordinate mapping formula is unchanged — just the source field path differs.

---

**CHECK 3 — Box score battingOrder: CONFIRMED ✅**

- `liveData.boxscore.teams.home.battingOrder` — array of numeric player IDs (e.g. `[656941, 607208, 547180, ...]`) ✅
- `liveData.boxscore.teams.away.battingOrder` — same ✅
- Player data keyed as `teams.home.players['ID' + playerId]` ✅
- `player.stats.batting` — full batting stats object with `atBats`, `runs`, `hits`, `rbi`, `baseOnBalls`, `strikeOuts` ✅
- `player.person.fullName`, `player.person.lastName` ✅
- `player.position.abbreviation` ✅
- `liveData.boxscore.teams.home.pitchers` — array of numeric pitcher IDs in appearance order ✅
- `player.gameStatus.isCurrentPitcher` — boolean, true for the active pitcher ✅

---

**CHECK 4 — gameData teams: CONFIRMED ✅**

- `feed.gameData.teams.home.abbreviation` ✅ (e.g. "PHI")
- `feed.gameData.teams.away.abbreviation` ✅ (e.g. "SD")
- `feed.gameData.status.abstractGameState` ✅ ("Final", "Live", "Preview")
- `feed.gameData.status.detailedState` ✅ ("Final", "In Progress", "Scheduled", etc.)

---

**All four checks confirmed. One critical bug found and fixed (v1 → v1.1 for feed/live). One document correction (strikeZoneTop path). Phase 1 implementation is unblocked.**

---

### Phase 1 — Core Expanded View (Linescore, Play-by-Play, Box Score)
**Assigned to:** Finn (after all three spec gates close) | **Status:** Blocked — specs pending

**Scope:**
- New file `js/liveGame.js` — loaded after `mlb.js` in `index.html`
- New CSS in `css/liveGame.css` — loaded via `<link>` in `index.html`
- Accordion trigger wired to live game cards in `mlb.js` `loadMLBGames()` render path
- `navigateTo()` cleanup hook in `navigation.js` — clears `_liveGameInterval` before routing

**Components Finn implements:**
1. **Accordion container** — `.lg-panel` that expands inline below the clicked game card. `data-game-pk` on the trigger button. One panel open at a time (opening a new one collapses the previous).
2. **Game header bar** — team logos, score, inning indicator (`▲/▼ + ordinal`), count/outs pill, LIVE/FINAL/DELAYED/POSTPONED badge, last-polled indicator.
3. **Linescore grid** — CSS Grid, inning columns, R/H/E pinned right, current inning `--accent-subtle` highlight, horizontal scroll on mobile.
4. **Play-by-play tab** — reverse-chronological plays from `allPlays`, grouped by half-inning with collapsible headers. HR entries flagged. Score-at-time shown for scoring plays.
5. **Box score tab** — batting table (lineup order, `battingOrder`) + pitching table (decision badge, pitch count). Per-team, switchable.
6. **Diff-based polling loop** — `setInterval(_pollLiveGame, 9000)`. Linescore-only by default; triggers `feed/live` fetch on state change. Stops when `abstractGameState === 'Final'`.

**Finn must not:**
- Use `mlbFetch()` for live polling — call `fetch(_mlbProxyUrl(url))` directly, no cache
- Call `feed/live` on every poll — only on linescore state change
- Leave `_liveGameInterval` running when the user navigates away
- Use `innerHTML +=` anywhere in the render chain

**Axiom reviews:** All code before Phase 1 is marked complete. Interval lifecycle, proxy URL usage, and AppState interactions are the primary review concerns.
**Vera reviews:** All state transitions verified in browser on a live game before Phase 1 is called done.
**Kael reviews:** Visual output against spec.

---

### Phase 2 — Pitch Zone, Base Diagram, Matchup Stats
**Assigned to:** Finn | **Status:** Blocked — Phase 1 must ship first + Phase 0 live-game verification required

**Scope:**
- Pitch zone SVG — viewBox `0 0 100 140`, batter-specific zone bounds from `matchup.batterStrikeZoneTop/Bottom`, pitch dots result-coded (see D-009 for color mapping)
- Base runner diagram — reuses scorecard diamond SVG geometry (read-only, no cell structure), bases filled on occupation
- Matchup stats tab — `vsPlayerTotal` career H2H, current pitcher's Statcast arsenal, batter/pitcher season splits vs. handedness
- Mobile pitch zone: drops below fold (below linescore), not at top of stack
- Pitch dot aria-labels: `aria-label="Pitch N: [type] [velocity]mph — [result]"` on each `<circle>`

**Kael visual spec for Phase 2:** pitch zone proportions, dot sizing (8px default, 10px hover), tooltip positioning, mobile carousel tab treatment — required before Finn starts Phase 2.

---

### Post-MVP — Deferred
- Win probability chart — requires computation layer not in scope
- Pitch trajectory animation — requires Statcast release point + 3D render
- Heat map overlay — all pitches in game vs. current at-bat
- Share card / social export
- Push notifications (PWA dependency)
