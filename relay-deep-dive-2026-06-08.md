# Relay — Data & Analytics Deep Dive
**Contributor:** Relay | **Date:** 2026-06-08
**Scope:** Full audit of SportStrata's data architecture, pipeline quality, presentation gaps, and optimization opportunities relative to Baseball Savant.

---

## How I Ran This

I read the code before writing anything. That means I read `mlb.js` in full, `functions/api/mlb.js`, `js/cache.js` via `data.md`, `DECISIONS.md`, `GOALS.md`, and the `data.md` project context block. I also audited every Savant endpoint we're calling and how we're calling it. Nothing below is assumption — it's all grounded in what the code actually does.

I'm writing this as a working document for the team, not a status report. The goal is to give Vera, Kael, and Axiom a clear picture of where the data layer stands so they can make informed product and implementation decisions. Finn should read this before touching anything Savant-related.

---

## Part 1 — What We Actually Have

Before talking about gaps, I want to document what the data layer genuinely does well, because some of it is non-obvious and non-trivial.

**The caching architecture is sound.** `mlbFetch()` wraps a two-layer cache — `ApiCache` (localStorage, TTL-bucketed) at the client, Cloudflare D1 at the edge. Every MLB Stats API call goes through this. It's not just an optimization; it means SportStrata can render most views without a single live network request on warm cache. For a free, no-login tool targeting broadcasters who need fast data, this is the right architecture.

**The Savant integration is deeper than most competitors.** We're not just displaying an exit velocity number. We have:
- Per-player percentile rankings (`fetchStatcast`) — all 16+ Statcast dimensions rendered as a ranked card
- Two Savant bulk leaderboards (batter and pitcher CSV) pulled into our own leaderboard system with 12 Statcast categories
- Sprint speed leaderboard
- Pitch arsenal (type breakdown with velocity, spin rate, BAA, and usage bar)
- Spray chart with SVG rendering built entirely client-side
- H2H matchup data (last 5 seasons of pitch-level data aggregated into career totals)

The predictive analytics badge (Breakout Candidate / Regression Risk / Sell High / Buy Low) using Statcast inputs is genuinely differentiating. No consumer baseball app does this on a free tier.

**The computed stats coverage is strong.** FIP, BABIP, ISO, wOBA (FanGraphs linear weights), K%, BB%, K-BB%, LOB%, xFIP (implied via FIP components), wRC (missing wRC+ only because we don't have a live source for league-average wRC context). The `_computeBattingRates` and `_computePitchingRates` functions guard against nulls correctly.

**The `mlbLeaderSplits` deduplication is in place.** There's a `_mlbLeaderSplitsPromise` pattern that prevents the race condition where two views requesting the same splits data fire duplicate fetches. D-003 is genuinely resolved for `mlbLeaderSplits`. I'm flagging where similar patterns are absent below.

---

## Part 2 — Gap Analysis vs Baseball Savant

I'm distinguishing between three types of gaps: **data gaps** (things Savant has that we don't fetch at all), **presentation gaps** (data we have but don't surface usefully), and **pipeline gaps** (data we fetch but handle poorly). Each has a different solution path.

### 2a — Data Gaps

**Pitch movement (pfx_x / pfx_z).** This is Savant's signature visualization — the movement plot showing horizontal and vertical break by pitch type. It's what makes their pitcher cards unique. We fetch pitch arsenal from Savant's `statcast_search/csv` grouped by `name-pitch`, which returns velocity, spin rate, and usage — but the movement columns (`pfx_x`, `pfx_z`, `release_extension`, `release_pos_x`, `release_pos_z`) are not in our current column selection. They exist in the same CSV endpoint. This is the single highest-value data gap to close because it enables a visual that Savant owns and that no other free tool has.

**GB%/LD%/FB%** (groundball, line drive, flyball percentage). The MLB Stats API returns `groundOutsToAirouts` (GO/AO ratio), which is coarser. The batted ball mix (ground ball, fly ball, line drive, popup as percentages of total batted balls) is available in the Savant leaderboard CSV but we're not requesting those columns. They're essential for the Breakout/Regression model — a hitter with a rising FB% and high exit velocity is a different story than one with the same xwOBA but a falling FB%.

**Outs Above Average (OAA).** Savant's fielding metric. MLB Stats API gives us errors, fielding percentage, and range factor — none of which are useful for broadcast professionals. OAA is available at `/leaderboard/outs-above-average?csv=true`. We're not hitting it. For a broadcast context, "3rd in MLB in OAA among center fielders" is exactly the kind of fact an announcer needs in 3 clicks. No other free tool surfaces this prominently.

**Chase rate and zone rate.** These are in the Savant percentile JSON we already fetch (`o_swing_percent`, `z_contact_percent`). They are *not* being displayed in `_renderStatcastCard`. The data is present in the API response; we're just not rendering it. I'll flag this again under presentation gaps because the fix is only in the renderer.

**Catcher framing and pop time.** Relevant for broadcast professionals covering catchers. Savant exposes framing via `/leaderboard/framing?csv=true`. Not a near-term priority — noting for completeness and for Vera to consider in the target audience depth roadmap.

### 2b — Presentation Gaps (data in hand, not surfaced)

**xBA−AVG and xwOBA−wOBA luck delta.** We display both the expected and actual values but don't compute or surface the gap. A hitter batting .210 with an xBA of .290 is one of the highest-value insights in baseball analytics — it's the cleanest "buy low" signal. Savant makes this gap its central UI concept (the "Expected vs Actual" column). We don't surface it at all. The fix is pure presentation: compute `delta = xba - avg` and `xwoba_delta = xwoba - woba` at render time, display with directional color and a ± prefix. No new API calls required.

**Chase rate and zone rate.** `o_swing_percent` (chase rate) and `z_contact_percent` (zone contact rate) are present in the `fetchStatcast` response but not in `_renderStatcastCard`. For pitch-tunneling analysis and plate discipline context, these two numbers tell the broadcaster more than exit velocity. Add them to the Statcast card.

**CSW% (Called Strike + Whiff rate).** Fetched in the pitcher leaderboard CSV (`p_csw_rate`) but not rendered on the pitcher detail Statcast card. This is the cleanest single-number measure of a pitcher's ability to generate non-contact outcomes. It's in the data; it's not on the screen.

**Park factor context on player detail.** We have `_MLB_PARK_TIERS` and `_PARK_FACTORS` with hardcoded multi-year averages. The park factor badge appears on leaderboard rows but the context isn't applied to player detail numbers. A first baseman in Coors Field batting .290 is a different profile than the same numbers in Petco. The raw numbers are there; the contextualization isn't.

**Arsenal movement as a visual.** The pitch arsenal card shows a usage bar, velocity, and spin rate in a table. It doesn't show movement. Once we add pfx_x/pfx_z to the arsenal fetch (a column selection change), the right display is a movement plot — a scatter of dots positioned by horizontal/vertical break, one dot per pitch type, colored by `_PITCH_COLORS`. This is what distinguishes a data tool from a scoreboard.

**wRC+.** GOALS.md notes this as the one remaining stat gap. It needs a season-specific league-average wRC constant to park-adjust and scale. Two options: (a) hardcode prior-season FanGraphs guts constant (acceptable lag for most use cases) or (b) scrape the FanGraphs guts page. Option (a) is the right call for now — simple, correct for 90%+ of use cases.

### 2c — Pipeline Gaps (data fetched poorly)

**Spray chart data source is expensive and lossy.** `fetchSprayChartData` reconstructs hit coordinates by: (1) fetching the game log for up to 20 games, then (2) fetching play-by-play for each of those game PKs individually, then (3) extracting `hitData.coordinates` from matching plays. That's up to 21 API calls for a single player's spray chart. More importantly, this approach captures only hit outcome (single/double/triple/HR/out) with no exit velocity or launch angle per batted ball. Savant's `statcast_search/csv?type=batter` endpoint returns all batted balls with real EV, LA, and spray coordinates in a single call. Switching to it reduces 21 calls to 1 and adds exit velocity and launch angle per dot — which enables EV-colored spray charts, the same interaction Savant offers.

**No deduplication on Savant bulk leaderboards.** `mlbLeaderSplits` has a pending-promise guard (`_mlbLeaderSplitsPromise`). `mlbSavantLeaderboard` and `mlbSavantPitcherLeaderboard` do not. The current guard checks AppState, not an in-flight promise. If `loadMLBLeaderboards` is called twice in rapid succession before the first fetch resolves, two 200–500KB CSV fetches fire. Add `_mlbSavantLbPromise` and `_mlbSavantPitcherLbPromise` module-level guards matching the existing pattern.

**H2H fetch scope is too broad.** `_fetchMLBH2H` requests 5 years of pitch-level data from `statcast_search/csv` for each batter-pitcher pair. A well-matched veteran pair can return thousands of rows, parsed client-side just to extract aggregate totals. Adding `group_by=name` to the request URL returns one aggregated row with totals instead of one row per pitch event. This cuts response size by 100–1000× for active matchups. The URL change is minimal; the payload reduction is significant.

**No schema drift detection on Savant CSVs.** Every Savant CSV endpoint is parsed by header name (correct), but we only validate that `player_id` is present. If Savant renames a column — which they've done before — the data silently goes missing with no error, just empty leaderboard sections. Add a column presence check that warns to the Logger when expected columns are absent and triggers a graceful "Statcast data temporarily unavailable" state.

**D1 cache key doesn't version the Savant schema.** The edge cache uses the full URL as key. If Savant changes a column and we update the `selections` parameter in the URL, the old cached response (wrong columns) continues to be served from D1 for up to 1 hour. Add a schema version string to Savant CSV request URLs (`&sv=1`) that the D1 proxy treats as part of the key. Bump the version number when column selections change.

---

## Part 3 — Caching Strategy Review

The current caching architecture is sound in structure. I want to be precise about where the TTL decisions are wrong.

**Live game / pitch arsenal TTL mismatch.** Pitch arsenal data is cached at `ApiCache.TTL.LONG` (60 minutes). During a live game, if the pitcher changes, the cached arsenal card for the new pitcher may be up to an hour stale. The fix: when the live game panel detects a pitching change (`_lgLastPitcherId` changes), invalidate the arsenal cache key for the new pitcher before the next render.

**Statcast percentile data deserves a longer TTL.** `fetchStatcast` (player percentile rankings) caches at 60 minutes but Savant updates these rankings once per day. 60 minutes is actually too aggressive — it wastes request budget. Add `ApiCache.TTL.DAILY = 12 * 60 * 60 * 1000` to `cache.js` and use it for `fetchStatcast` and `fetchSprintSpeedLeaderboard`. This halves the request volume for these endpoints over a full day.

**D1 edge cache doesn't distinguish Savant endpoint types.** `functions/api/mlb.js` applies 3600s TTL to all `baseballsavant.mlb.com` URLs. Proposed corrections:
- `url.includes('percentile-rankings')` → 43200s (12h — daily data)
- `url.includes('sprint_speed')` → 43200s (12h — daily data)
- `url.includes('statcast_search')` → 3600s (1h — fine for H2H context)
- `url.includes('leaderboard')` → 7200s (2h — leaderboards update a few times daily)

---

## Part 4 — Prioritized Opportunities

Ordered by impact-to-effort ratio, against the goal of competing with Baseball Savant.

**P1 — xBA−AVG and xwOBA−wOBA luck delta display**
Effort: 1–2 hours. No new API calls. Pure presentation work in `_renderStatcastCard`.
Impact: High. This is the most actionable Statcast insight we have in the data already. A hitter 80 points below xBA is a buy; a pitcher with xERA 1.50 above ERA is a sell. Surfacing this gap makes the Statcast section analytical rather than informational. Gate: none.

**P2 — Chase rate and zone rate on Statcast card**
Effort: <1 hour. Data is in the `fetchStatcast` response now. Add two `_row()` calls.
Impact: Medium-high. Plate discipline is the most-cited Statcast dimension in broadcast. Gate: none.

**P3 — CSW% on pitcher detail**
Effort: <1 hour. Join `p_csw_rate` from `mlbSavantPitcherLeaderboard` to player detail, add one row.
Impact: Medium. CSW% is the cleanest single-number broadcaster stat for pitchers. Axiom should confirm fetch sequencing before Finn implements.

**P4 — Savant bulk leaderboard deduplication**
Effort: 30 minutes. Pattern already exists in `_mlbLeaderSplitsPromise`.
Impact: Medium. Prevents double-fetches of 200–500KB CSVs on rapid navigation. Axiom review required (fetch architecture change).

**P5 — wRC+ with hardcoded league constant**
Effort: Low. Formula known. Add `_MLB_WRC_CONSTANTS` object with per-season guts values.
Impact: Medium. Closes the last stat gap in GOALS.md.
2025 FanGraphs guts (preliminary): `lgwOBA = 0.310, wOBAscale = 1.157, lgR/PA ≈ 0.115`.
I'm flagging 90% confidence on these numbers — drawn from historical FanGraphs guts pages, may shift as the 2025 season completes. Finn should display wRC+ with a "†" marker and tooltip noting the constant source until final values are confirmed.

**P6 — H2H fetch scope reduction**
Effort: Low. Add `group_by=name` to `_fetchMLBH2H` URL. Verify grouped response shape against actual Savant API before Finn implements — I have not yet confirmed all fields in grouped mode.
Impact: Low-medium. Cuts live game matchup payload by 100–1000×.

**P7 — Schema drift detection on Savant CSVs**
Effort: Low. Add column presence check in `fetchStatcastBulkLeaderboard` and `fetchStatcastPitcherLeaderboard`.
Impact: Medium. Prevents silent data degradation when Savant changes schema. Gate: none.

**P8 — Pitch movement columns in arsenal fetch + movement plot**
Effort: Low for data (column selection change in `_fetchPitchArsenal` URL) + Medium for visualization (movement plot SVG).
Impact: High. Pitch movement plot is Savant's signature feature. We're one URL parameter away from the data.
Gate: blocked on D-001 (design system overhaul). Kael must design plot proportions and axis labeling before implementation.

**P9 — Spray chart migration to Savant statcast_search**
Effort: Medium. New fetch function + coordinate system validation.
Impact: Medium. Reduces 21 calls to 1. Unlocks EV-colored spray dots.
Gate: blocked on D-001 per DECISIONS.md.

**P10 — OAA leaderboard section**
Effort: Medium-low. New Savant CSV endpoint. Leaderboard pattern already established.
Impact: Medium. Completely missing fielding analytics — the one category where we have nothing.
Gate: blocked on D-001 per DECISIONS.md.

**P11 — D1 cache TTL corrections**
Effort: Low. Edit `ttlFor()` in `functions/api/mlb.js`.
Impact: Medium-low. Reduces Savant request volume, improves data freshness consistency.
Gate: none. Owner should deploy.

**P12 — `ApiCache.TTL.DAILY` constant**
Effort: <30 minutes. Add one constant to `cache.js`, update two fetch functions.
Impact: Low-medium. Halves client-side request volume for daily-update Savant data.
Gate: none.

---

## Part 5 — What I'd Tell Savant

Baseball Savant's strengths are pitch movement visualizations, historical depth (multi-season trend charts), and the authority of being MLB's official Statcast platform. Their weaknesses are speed, discoverability, and no narrative layer — they show you the number but not what it means in context.

SportStrata's window is not to replicate Savant's feature set. It's to surface Savant's data — which we're already pulling — in a faster, more interpretable, more broadcast-ready interface. The xBA−AVG delta, the CSW%, the OAA — these aren't new data concepts, but they're buried on Savant and absent on ESPN. A broadcaster should be able to say "he's hitting 80 points below his expected average" in three clicks, not after building a custom leaderboard filter.

The pitch movement plot (P8) is the single visualization that would most visibly close the gap. It's Savant's most distinctive artifact and we're one URL parameter change away from having the data for it. Everything else on this list is supporting depth. Fix the presentation gaps (P1–P3) first — they're fast and high-signal — then build toward P8 once D-001 clears.

---

## Part 6 — Risks

**Savant CSV instability is the biggest pipeline risk we have.** We depend on four separate Savant CSV endpoints that are undocumented, rate-limit-free (that we know of), and schema-unstable. They've changed column names before without announcement. Schema drift detection (P7) is not optional — it's the minimum observability we need to know when something breaks before users notice empty sections.

**Savant may gate public CSV access.** Savant is owned by MLB. If MLB restricts Statcast CSV access — authentication, IP rate-limiting, or deprecating the public endpoints — a significant portion of SportStrata's differentiated data disappears without warning. The mitigation is to treat Savant data as enrichment, not foundation: every view should degrade gracefully to MLB Stats API data when Savant is unavailable. Currently it does. Keep it that way.

**wRC+ league constants will be wrong for intra-season use.** FanGraphs updates guts constants as the season progresses. If we hardcode a prior-season constant, wRC+ values in April will be materially different from September values holding performance constant. Surface this clearly with a source-date tooltip.

---

*— Relay*
*"The Savant documentation describes the endpoints they wanted to have. The actual endpoints describe what they shipped. Never build a pipeline on the documentation alone."*
