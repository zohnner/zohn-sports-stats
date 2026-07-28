# ISSUES.md — Archived (shipped features + historical handoffs)

Moved out of `ISSUES.md` during 2026-07-26 housekeeping (D-048-era) to keep the active backlog readable. Everything here is **shipped or historical** — retained verbatim for reference. Cross-check against `DECISIONS.md` and git history.

---

## P3-027 — Shareable Stat Cards (R5 Phase 1) — Three Gates
**Contributors:** Vera (behavioral), Kael (visual), Axiom (feasibility) | **Date:** 2026-06-09

**Job to be done (Vera):** A fan or broadcaster sees a leaderboard stat worth talking about and wants to post it. One tap produces a branded PNG they can share anywhere; every share carries the SportStrata watermark and domain back to the site. This is the R5 acquisition loop.

**Behavioral spec (Vera):** Share icon button on every leaderboard row, always visible (no hover-reveal — touch lesson from the card CTA fix). Click: button enters generating state (disabled, spinner glyph); card renders offscreen; on mobile with Web Share file support → native share sheet; otherwise PNG download named `{player}-{stat}-sportstrata.png` + toast "Card saved". Failure → toast "Couldn't generate card — try again", button restores. Headshot CDN refusal → card auto-falls back to team-color initials avatar (P3-013 pattern), never fails the share. Button: `aria-label="Share {player}'s {stat} stat card"`; row click/keydown guards exclude the button so it never navigates. Toast is `aria-live="polite"`.

**Visual spec (Kael):** 600×315 card exported at 2× (1200×630 — exact OG/Twitter ratio). Always dark-brand regardless of active theme — an export artifact is brand surface, not UI surface, so its colors are fixed hex (documented exception to the token rule). Layout: left column headshot/initials circle with accent ring + name + team·pos; right column rank badge ("#N IN MLB" — gold for top 3, accent otherwise), stat value at 56px in Barlow Semi Condensed, stat label, "{season} season · updated {date}" line; bottom bar SPORTSTRATA wordmark + sportsstrata.com. Diagonal team-color wash behind the left column at low opacity. Mockup approved by owner 2026-06-09.

**Feasibility (Axiom):** Confirmed. html2canvas 1.4.1 loader `_scLoadHtml2Canvas()` already global from scorecard.js (P3-026 validated the capture pipeline). CDN CORS for headshots unverifiable from the audit environment (egress-blocked) — resolved by deterministic preflight: load headshot with `crossOrigin="anonymous"`, on error build the card with initials avatar; canvas never taints. New file `js/shareCard.js` after `liveGame.js` in the chain + `css/shareCard.css`; both added to `sw.js` STATIC_ASSETS per D-010. No new CSP domains (cdnjs already allowed). Sparkline of last 30 days (R5 full spec) deferred to Phase 2 — needs game-log fetches.

**All three gates present. Implementation approved.**
---

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

---

## Live Game Expanded View — Phased Implementation Roadmap

**Architecture lead:** Axiom | **Date:** 2026-06-04
**Reference:** `sportsstrata_live_game_expanded_view.md` | **Decision:** `DECISIONS.md D-009`

**Spec gates — Finn does not start Phase 1 until all three exist:**
- ✅ Kael visual spec: complete 2026-06-04 — see "Kael Visual Spec — Phase 1" above
- ✅ Vera behavioral spec: complete 2026-06-04 — see "Vera Behavioral Spec — Phase 1" above
- ✅ Axiom feasibility sign-off: complete 2026-06-04 — `js/liveGame.js` + `css/liveGame.css` created and wired. Stub implementation in place. `stopLiveGamePolling()` hooked into `navigateTo()`. Click handler updated in `_createMLBGameCard()`. All 26 JS files pass syntax check.

**All three Phase 1 gates closed 2026-06-04. Finn may begin Phase 1 after completing Phase 0 live-game API verification.**

**All three Phase 2 gates closed 2026-06-08. Finn may begin Phase 2 now. Phase 1 shipped 2026-06-08.**

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

### Kael Visual Spec — Phase 2
**Contributor:** Kael | **Date:** 2026-06-08
**Gates:** Required before Finn starts Phase 2. Vera behavioral addendum and Axiom feasibility must also be complete.

---

#### Posture

Phase 2 elements live within the existing `.lg-panel` without adding chrome or escalating elevation. Pitch zone and base diagram are data displays, not dashboards — they should feel like a broadcast overlay inset into the score card, same surface, more signal. No new container shadows, no new background fills, no modal treatment.

Desktop adds a two-column split within `.lg-panel`: pitch zone + base diagram stack on the left, existing tabs (PBP, Box Score) plus new Matchup tab on the right. This split only activates when a current at-bat exists (`currentPlay.matchup` is present and at least one pitch has been thrown in the at-bat). Between innings and before first pitch, the single-column Phase 1 layout is unchanged.

---

#### Two-Column Body Wrapper — `.lg-body`

Wrap the pitch zone column and the tab column in a flex row. The linescore and game header remain outside `.lg-body`.

```css
.lg-body {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
}

.lg-zone-col {
    flex: 0 0 130px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.lg-tab-col {
    flex: 1 1 0;
    min-width: 0;
}
```

Mobile (`≤768px`): `.lg-body { flex-direction: column; }`. `.lg-zone-col` renders after `.lg-linescore-wrap` in the vertical stack, not before it. Matches Vera's layout override.

---

#### Pitch Zone SVG — `.lg-pitch-zone`

`viewBox="0 0 100 140"`. Coordinate origin: top-left. `aspect-ratio: 5 / 7` maintains proportions fluidly.

```css
.lg-zone-wrap { position: relative; }
.lg-pitch-zone { width: 100%; aspect-ratio: 5 / 7; display: block; }
```

Strike zone rectangle: built from the **last pitch event's** `pitchData.strikeZoneTop` and `pitchData.strikeZoneBottom` (corrected path per Finn's Phase 0 findings — not `currentPlay.matchup`). Fallback if no pitches yet: `szTop=3.5`, `szBot=1.5`. Horizontal bounds ±0.71ft (plate half-width).

Coordinate mapping (API feet → SVG units 0–100 / 0–140):
- `svgX = 50 + (pX / 2.5) * 50` — maps ±2.5ft horizontal to 0–100
- `svgY = 130 - ((pZ - 0.5) / 4.5) * 120` — maps 0.5–5.0ft to 130–10 (inverted, high pZ = low svgY)

Zone `<rect>`:
- `x = svgX(−0.71) ≈ 36`
- `width = svgX(0.71) − svgX(−0.71) ≈ 28`
- `y = svgY(strikeZoneTop)`, `height = svgY(strikeZoneBot) − svgY(strikeZoneTop)`
- `fill="none"`, `stroke="var(--border-strong)"`, `stroke-width="1.5"`

Home plate outline: pentagon centered at `(50, 130)`, width 12, height 6. `fill="none"`, `stroke="var(--border-mid)"`, `stroke-width="1"`.

Grid lines (optional enhancement, not required for Phase 2 ship): 3×3 faint lines dividing the zone into 9 quadrants. `stroke="var(--border-default)"`, `stroke-width="0.5"`, `opacity="0.5"`. Only draw if zone rect height > 20 SVG units.

---

#### Pitch Dot Styling

Each pitch event in the current at-bat gets one `<g class="lg-dot-group" tabindex="0" role="button">` containing one `<circle>` and one `<text>`.

Default: `r="4"`. Hover/focus: `r="5"`. Use CSS `r` on the circle (supported in all modern browsers; wrap in a `try/catch` for the SVG attribute fallback if needed):

```css
.lg-dot-group { cursor: pointer; }
.lg-dot-group circle {
    transition: r 120ms ease, opacity 120ms ease;
}
.lg-dot-group:hover circle,
.lg-dot-group:focus-visible circle { r: 5px; }
```

Pitch number label: `<text class="lg-dot-text">` at same cx/cy, font-size `5`, fill `var(--bg-base)`, `text-anchor="middle"`, `dominant-baseline="central"`. Opacity 0 at default size, 1 on hover/focus:
```css
.lg-dot-text { opacity: 0; pointer-events: none; }
.lg-dot-group:hover .lg-dot-text,
.lg-dot-group:focus-visible .lg-dot-text { opacity: 1; }
```

Dot color by result (from `details.call.code`):

| `call.code` | Category | Fill |
|---|---|---|
| `'B'` | Ball | `var(--accent)` |
| `'C'` | Called strike | `var(--color-win)` |
| `'S'`, `'W'`, `'T'` | Swinging strike | `var(--color-loss)` |
| `'F'`, `'R'` | Foul | `var(--text-muted)` |
| `'X'` — hit result | In play — hit | `var(--color-pts)` |
| `'X'` — HR | In play — home run | `var(--color-pts)`, `stroke-width="2"`, `stroke="var(--text-primary)"` |
| `'X'` — out | In play — out | `var(--text-subtle)` |
| Other / unknown | Fallback | `var(--border-mid)` |

For `call.code === 'X'`: check `result.event` (or `result.eventType`) — `'Home Run'` → HR style; any string containing `'Out'`, `'Grounded'`, `'Flyout'`, `'Strikeout'` → out style; otherwise → hit style.

Dots are rendered in pitch sequence order, oldest first. Most recent pitch is always on top (SVG paint order = array order, so append new dots, don't prepend).

---

#### Pitch Tooltip — `.lg-pitch-tooltip`

`position: absolute` on `.lg-zone-wrap`. Not inside the SVG element.

```css
.lg-pitch-tooltip {
    position: absolute;
    background: var(--bg-raised);
    border: 1px solid var(--border-mid);
    border-radius: var(--radius-sm);
    padding: 0.3rem 0.5rem;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    box-shadow: var(--shadow-sm);
    line-height: 1.6;
}
```

Content (4 lines):
```
Cutter               ← details.type.description
91.4 mph             ← startSpeed
Swinging Strike      ← details.call.description
2-2 count            ← count.balls + '-' + count.strikes + ' count'
```

Positioning: JS places it using `getBoundingClientRect()` on the circle and the `.lg-zone-wrap` container. Default: centered above the dot (`top: dotTop - tooltipHeight - 4px`, `left: dotCenterX - tooltipWidth/2`). If `dotTop < 32px` from zone top: position below instead. Clamp `left` so it doesn't overflow zone wrapper edges.

---

#### Base Runner Diagram — `.lg-base-diagram`

Sits below the pitch zone in `.lg-zone-col`. Small, fixed-width, no fluid scaling needed.

```css
.lg-base-diagram { display: block; margin: 0 auto; }
```

`viewBox="0 0 60 60"`, `width="56"` attribute on the SVG element.

Layout — four bases at diamond positions:
- Second base: `cx=30, cy=12` 
- Third base: `cx=10, cy=30`
- First base: `cx=50, cy=30`
- Home plate: `cx=30, cy=50` (pentagon, not square)

Each base is a `<rect width="8" height="8" transform="rotate(45, cx, cy)"`. Home plate: a small `<polygon>` approximately 8×6.

Diamond infield lines connecting adjacent bases: `<line>` elements, `stroke="var(--border-default)"`, `stroke-width="1"`.

Empty base: `fill="var(--bg-surface)"`, `stroke="var(--border-mid)"`, `stroke-width="1.5"`.
Occupied base: `fill="var(--color-pts)"`, `stroke="var(--color-pts)"`.

Runner data from `currentPlay.runners`: each object has `movement.end` — `'1B'`, `'2B'`, `'3B'`. A runner at `'score'` (scoring play in progress) does not fill a base. Render occupied state based on unique end positions across all runners in the array. If `currentPlay.runners` is absent: all bases empty.

No animation on base state change. Base occupation updates synchronously when `_renderPanel()` re-runs on each poll. If a base flips from occupied to empty or vice versa, the fill attribute updates — no transition.

---

#### Matchup Tab Layout

Third tab: `"Matchup"` button added after "Box Score" in `.lg-tabs`. Uses `.mlb-group-btn` class, same as the first two.

Tab content (`data-lg-tab="matchup"`) is a scrollable vertical stack, `max-height: 320px`, `overflow-y: auto`, consistent with PBP.

Four blocks rendered top-to-bottom; blocks 2–4 are conditional:

**Block 1 — Career H2H** (always renders, or shows empty state per Vera's spec)
Section label: `"[BATTER] VS. [PITCHER]"`, `font-size: 0.65rem`, `color: var(--text-subtle)`, uppercase.
Stat row: `PA / H / HR / BB / K / AVG / OBP / SLG`, tabular mono, same width and style as `.lg-box-table` — reuse that table class.

**Block 2 — This At-Bat** (only if ≥1 pitch thrown in current at-bat)
Label: `"THIS AT-BAT"`.
Single stat line: `N pitches · X-Y count`, color `var(--text-secondary)`.

**Block 3 — Pitcher Arsenal** (only if `AppState.mlbPlayerStats.pitching[pitcherId]` has arsenal data)
Label: `"[PITCHER NAME] ARSENAL"`.
Pitch type badges: reuse existing markup from player detail pitch arsenal card.

**Block 4 — Handedness Splits** (only if splits data in AppState)
Label: `"BATTER VS. [L/R]HP"` and `"PITCHER VS. [L/R]HB"`.
Two stat rows: AVG / OBP / SLG vs. hand.

Dividers between blocks: `border-top: 1px solid var(--border-default)`, `margin: var(--space-2) 0`. No section card wrappers — flat list.

---

### Vera Behavioral Spec Addendum — Phase 2
**Contributor:** Vera | **Date:** 2026-06-08
**Gates:** Covers three interactions left unspecced in Phase 1 behavioral spec. All three required before Finn starts Phase 2.

---

#### Pitch Zone Dot Interaction

**Desktop (pointer device):**
`mouseenter` on `.lg-dot-group`: show tooltip, expand dot (r=5 via CSS). `mouseleave`: hide tooltip, shrink dot (r=4). No delay on show or hide. Only one tooltip active at a time — entering a second dot removes the first tooltip immediately before placing the new one.

**Mobile (touch):**
First tap on a dot: show tooltip positioned above the dot (or below if near top edge), highlight dot. Tooltip stays visible until: user taps another dot (replace tooltip), user taps outside `.lg-zone-wrap` (dismiss), or the panel closes (cleanup in `stopLiveGamePolling()`). No bottom sheet — the zone is too small for a sheet origin, and the tooltip content (4 lines) doesn't warrant the weight.

**Keyboard:**
Each `.lg-dot-group` carries `tabindex="0"` and `role="button"`. `aria-label="Pitch [N]: [type] [velocity]mph — [result]"`. `:focus-visible` → show tooltip, expand dot. `blur` → hide tooltip, shrink dot. `Tab` moves through dots in pitch sequence order (1, 2, 3…). `Escape` while a dot has focus: hide tooltip, move focus to `.lg-zone-wrap` (not out of the zone). Arrow keys within the zone: not implemented in Phase 2.

**Tooltip cleanup:** `stopLiveGamePolling()` removes the active tooltip element from the DOM (if present) and clears `_lgPitchTooltipEl`. Between-innings transitions that re-render the panel also remove stale tooltip references.

---

#### Base Diagram — Mobile Tap Behavior

No tap interaction. The base diagram is display-only in Phase 2. Tapping it does nothing — `pointer-events: none` on the entire SVG. The diagram communicates runner positions visually; that is its complete scope.

---

#### Matchup Tab — H2H Empty State

When `vsPlayerTotal` has `PA === 0` or `splits` is an empty array (batter and pitcher have never faced each other in the majors): render Block 1 as:

```
[BatterName] has never faced [PitcherName]
in the majors
```

`color: var(--text-subtle)`, `font-size: var(--text-xs)`, centered within the block area, `padding: var(--space-3) 0`.

**Loading state** (Block 1 while `vsPlayer` fetch is in flight): two-line skeleton shimmer, same pattern as box score loading. Blocks 3 and 4 use data already in AppState and render immediately without a skeleton.

**Block 3 absent** (pitcher has no Statcast arsenal data): omit Block 3 entirely. No placeholder text, no skeleton.

**Block 4 absent** (splits unavailable): omit Block 4 entirely.

These are data-absent states, not errors. No error icon, no "something went wrong" copy.

---

### Axiom Feasibility Sign-off — Phase 2
**Contributor:** Axiom | **Date:** 2026-06-08
**Gates:** Required before Finn starts Phase 2.

All Phase 2 components fit within the existing `liveGame.js` module without new files or new global state fields beyond two additions to module scope.

**Pitch zone SVG**: Built with `document.createElementNS()` calls, not a template string (cleaner attribute control for dynamic `r`, `fill`, `cx`, `cy` values). SVG container inserted into `.lg-zone-col`. Tooltip is a `<div>` created once and reused — removed from DOM on close, reinserted on show. Coordinate math runs inside a helper `_lgSvgCoords(pX, pZ)` → `{x, y}`. Zone bounds helper `_lgZoneBounds(plays)` reads the last pitch event's `pitchData.strikeZoneTop/Bottom`.

**Base diagram**: Static SVG string built once. `fill` attributes on the four base `<rect>` elements updated in-place via `setAttribute()` on each poll cycle — no full redraw.

**Matchup fetch**: New helper `_lgFetchH2H(batterId, pitcherId)` calls `mlbFetch('/people/${batterId}/stats', { stats: 'vsPlayer', opposingPlayerId: pitcherId, group: 'hitting' }, ApiCache.TTL.MEDIUM)`. Triggered on first Matchup tab click for a given batter+pitcher pair, not on panel open. Results cached in-memory in `_lgH2HCache` (`"${batterId}_${pitcherId}"` key), cleared in `stopLiveGamePolling()`.

**HTML structure change**: `_renderPanel()` wraps the existing tab section in `.lg-tab-col` and injects `.lg-zone-col` as sibling inside new `.lg-body` wrapper, only when `currentPlay.matchup` is present. When between innings or no current play: render single-column Phase 1 layout unchanged.

**New module state** (two additions only):
```js
let _lgPitchTooltipEl = null;  // active tooltip DOM node or null
let _lgH2HCache = {};          // { "batterId_pitcherId": vsPlayerTotal }
```
Both cleared in `stopLiveGamePolling()`.

**CSS `r` attribute**: `r` as a CSS property (not SVG attribute) is supported in Chrome 86+, Firefox 80+, Safari 14.1+. No polyfill needed for 2026 browser targets. The `r` SVG attribute on `<circle>` is the fallback — JS sets it via `setAttribute('r', '4')` on creation; CSS overrides it for hover/focus states.

**No new files, no new global state. Finn may proceed.**

---

### Phase 2 — Pitch Zone, Base Diagram, Matchup Stats
**Assigned to:** Finn | **Status:** ✅ Shipped 2026-06-08. SVG CSS-variable bug fixed same day. Pitcher arsenal block (Block 3) added 2026-06-08.

**Spec gates:**
- ✅ Kael visual spec: complete 2026-06-08 — see "Kael Visual Spec — Phase 2" above
- ✅ Vera behavioral spec: complete 2026-06-08 — see "Vera Behavioral Spec Addendum — Phase 2" above
- ✅ Axiom feasibility sign-off: complete 2026-06-08 — see "Axiom Feasibility Sign-off — Phase 2" above

**Scope:**
- Pitch zone SVG — `viewBox="0 0 100 140"`, zone bounds from `playEvents[n].pitchData.strikeZoneTop/Bottom` (corrected per Finn's Phase 0 findings — not `currentPlay.matchup`), pitch dots result-coded by `details.call.code`
- Base runner diagram — compact SVG diamond, 56px fixed-width, bases filled from `currentPlay.runners[*].movement.end`
- Matchup stats tab — `vsPlayerTotal` career H2H, pitcher Statcast arsenal if available, batter/pitcher handedness splits if available
- Mobile: `.lg-body` switches to `flex-direction: column`; `.lg-zone-col` drops below linescore
- Pitch dot aria-labels: `aria-label="Pitch [N]: [type] [velocity]mph — [result]"` on each `<g class="lg-dot-group">`
- Two-column layout activates only when `currentPlay.matchup` exists and ≥1 pitch thrown; between-innings renders Phase 1 layout unchanged

---

### Post-MVP — Deferred
- Win probability chart — requires computation layer not in scope
- Pitch trajectory animation — requires Statcast release point + 3D render
- Heat map overlay — all pitches in game vs. current at-bat
- Share card / social export
- Push notifications (PWA dependency)

---

---

## P3-028 — Player Detail Percentile Stat Profile — Three Gates
**Contributors:** Kael (visual), Vera (behavioral), Axiom (feasibility) | **Date:** 2026-06-09

**Problem (owner brief):** Player page stats read as undifferentiated numbers in a box. The fixed-max stat bars (`_mlbStatBar`) scale value against arbitrary maxima with decorative colors — a league-average hitter shows a 69%-full amber bar, which encodes nothing. The competitive reference is Baseball Savant's percentile sliders.

**Visual spec (Kael):** Each stat row: label (fixed column) | percentile track with fill + circular numbered bubble at the percentile position | actual value right-aligned in tabular figures. Diverging blue→gray→red scale, Savant convention: red = elite, always — lower-is-better stats (ERA, WHIP, BB/9, H/9, HR/9, K%) invert before coloring. Scale colors are fixed hex by documented exception: this is a perceptual data-encoding scale, not a themed surface. Caption above rows: "League percentiles · vs N qualified {hitters|pitchers} · red = elite". Mockup approved by owner 2026-06-09.

**Behavioral spec (Vera):** Percentiles render only when (a) `mlbLeaderSplits` is loaded, (b) the qualified pool has ≥20 players, and (c) the player themself qualifies (≥80 PA hitters / ≥15 IP pitchers — same thresholds as P3-015 rank badges). Any failure of (a)–(b) degrades each row to a plain label+value pair, never a broken bar. Failure of (c) shows plain rows plus the caption "Below qualification threshold (80 PA) — league percentiles hidden". Each percentile row: `role="img"` + `aria-label="{stat}: {value}, {N}th percentile of qualified {pool}"`, `title` tooltip with the same. The raw value remains the visually dominant number — percentile is context, not replacement (broadcast-grade rule: the citable number leads).

**Feasibility (Axiom):** Confirmed, zero new fetches. `AppState.mlbLeaderSplits` already holds full league splits with computed rates merged (`mlb.js:4036`) and is already awaited on player detail for rank badges. Percentile = midrank position in the sorted qualified pool, memoized per `(group, season)` in `AppState._mlbPctPools` with lazily built sorted arrays per stat key. `_mlbHittingBars`/`_mlbPitchingBars` keep their names and call sites — presentation-only rewrite. New `.pct-*` classes in `components.css` (grep-verified no collisions). Old `.shooting-stat-*` classes untouched — still used by NBA player detail.

**All three gates present. Shipped 2026-06-09** — percentile engine + `.pct-*` rows live in `mlb.js` / `components.css`; dead `_mlbStatBar` removed; engine unit-verified (extremes, median, inversion, degraded states).

---

### Session 2026-06-09 (evening) — UX Consistency + Share Phase 2 — SHIPPED
**Contributors:** Vera (specs), Kael (visual review), Axiom (implementation), Relay (verification attempt), Folio (entries) | **Date:** 2026-06-09

Four items shipped, one verification blocked:

1. **Spinner → skeleton unification (D-005 style gaps).** Spray chart loading and team-detail roster loading now use the `skeleton-line` pattern matching every other view. `loading-spinner` has zero remaining call sites in MLB code. Kael's visual-consistency flag closed.
2. **Game Prep error logging.** The schedule fetch `catch (_)` silently swallowed errors. Now logs via `Logger.warn` before rendering the retry state. Vera ruling recorded: the custom retry UI is intentional and adequate for this view — the defect was the silent swallow, not the presentation.
3. **Hero share button (P3-027 Phase 2).** Player detail hero now carries the share button — exports the headline stat card (OPS for hitters, ERA for pitchers) with the league rank badge when the player ranks ≤30, hidden otherwise. `shareCard.js` rank made optional to support this.
4. **Pitch movement plot entry reconciled.** Implementation was already live (`_buildMovementSVG`, mlb.js:699) — ISSUES entry was stale, now marked shipped.
5. **Relay Savant verification (P6/P9/P10) — still blocked.** Endpoints time out from the audit environment. Items remain correctly parked on the manual browser step; no implementation against guessed schemas.

---

### De-AI Visual Pass — Generic-Template Tells Removed — SHIPPED
**Contributor:** Kael (audit + fixes), Folio (doc correction) | **Date:** 2026-06-09

Owner brief: strip the tell-tale signs of an AI-generated site. Audit findings and fixes:

1. **Inter dropped.** \`--font-sans\` is now the native system stack. Inter is the default body font of nearly every AI-generated site — its presence undermines the broadcast-grade posture, and dropping it removes ~100KB of font transfer (G1). Barlow Semi Condensed stays as \`--font-display\` — it is a deliberate sports-graphics choice, not a default.
2. **JetBrains Mono dropped.** \`--font-mono\` is now the system mono stack. A code-editor font on a baseball site read as developer-tool residue. Formula inputs and linescores keep monospace alignment via the system stack.
3. **Gradient-clip text eliminated** (2 sites): \`.brand-name\` and \`.home-hero-title\` are now solid color. Gradient text is the second-loudest AI-template tell after Inter.
4. **Neon glows stripped:** 5× inline \`0 0 40px\` avatar halos (player hero, team detail, NBA detail, teams ×2), the 16px amber bloom on \`--shadow-live\` (1px ring retained — the signal survives, the neon dies), \`drop-shadow(0 0 4px)\` on active bottom-nav icons, and 6 orange-bloom button shadows replaced with neutral elevation (\`--shadow-sm/md\`). The focus ring keeps its 2px accent line, loses its glow. Scorecard run-pulse retained — it is diegetic to the paper scorecard, not decoration.
5. **Share card realigned to brand.** \`_SHC_ACCENT\` was the stale indigo \`#7c8df0\` — now brand orange \`#ff8100\` / gold \`#ffd200\`. The exported PNG now matches the site identity.
6. **CLAUDE.md token docs corrected** — accent was documented as indigo; the live token has been brand orange. Folio fix, Axiom-reviewed.

Not touched, deliberately: \`backdrop-filter\` header blur (mainstream convention, not an AI tell), the percentile blue–red data scale (industry convention from Savant), stat category colors (semantic system per the GOALS direction note), skeleton shimmer (standard loading grammar).

---

### Live Games Opened the Wrong View from Ticker and Home Cards — RESOLVED
**Contributor:** Finn (trace), Axiom (fix) | **Date:** 2026-06-09

Owner report: clicking a live game on the ticker loaded the static box-score view instead of the live game page. Trace: both the ticker click handler (`app.js` setupTickerClicks) and the home page game card handler hardcoded `showMLBGameDetail(gamePk)` for every game regardless of state — only the scores-view cards routed live games to `navigateTo('mlb-live-' + gamePk)`.

Fix: new `openMLBGame(gamePk, forceLive)` router in `mlb.js` — live games (by `AppState.mlbGames` lookup OR a DOM live hint) go to the live page with the `mlbLiveGame` stub set; everything else goes to game detail. Ticker passes `ticker__item--live`, home cards pass `home-game-card--live` as the hint, so routing works even when the game object is not yet in AppState. `showMLBLiveGame` already tolerates a missing stub (falls back to games-list lookup, then skeleton + first poll), so cold ticker clicks are safe.

Rule going forward: any new surface that links to a game routes through `openMLBGame()` — never call `showMLBGameDetail` directly for a clickable game element.

---

### Session 2026-06-09 (late) — Issues + Goals Work — SHIPPED
**Contributors:** Cipher (finding), Axiom (implementation), Folio (reconciliation), Kael (ruling), Vera (spec) | **Date:** 2026-06-09

1. **Unescaped API strings fixed (Cipher → Axiom).** `lb-name` in both leaderboard row builders and the scout-report summary rendered API-derived strings into innerHTML without `_escHtml()`. All three sites now escape. MLB API data is low-risk, but the escaping rule exists for defense in depth — exceptions rot.
2. **GOALS.md reconciled (Folio).** Success-metrics table: API-key row updated to resolved (was still showing the P1-006 warning), MLB-features row updated to reflect G2/G3 completion, Stat Builder examples target marked open. New "Annual Maintenance" section: park factors refresh each April, wRC+ guts constants each season.
3. **Freshness >60min format closed (Kael ruling).** Same-day already matched spec ("Updated today at H:MM") — the ISSUES note was stale. Non-today now shows "Updated {Mon D} at {H:MM}" instead of "Nh ago": absolute timestamps are on-air citable.
4. **F5 Phase 1 shipped — Add-to-Home-Screen prompt.** Vera spec: shows only on 2nd distinct visit day (localStorage day list, G4-compliant), only when `beforeinstallprompt` fires (iOS Safari never shows it — no fake instructions), permanent dismiss either way, never shown in standalone display mode. Kael: `.a2hs-strip` bottom strip in toast grammar, tokens only, `position: fixed` documented as intentional (same exception class as bottom-nav). Axiom: manifest verified install-eligible (standalone + icons + start_url + SW). Logic unit-verified: 2nd-day visit + event → strip; install/dismiss → `zs_a2hs_done`, never again.

**Still blocked on manual/owner steps:** Lighthouse mlb-leaders (D-004), throttled-network pass (D-005), Savant schema verification (P6/P9/P10), blurb Worker deploy (P2-005/D-006).

---

### Relay Verification Results — Owner-Supplied CSV Headers (2026-06-09)
**Contributor:** Relay (analysis), owner (browser fetch) | **Date:** 2026-06-09

**P9 — VERIFIED, UNBLOCKED.** Batter `statcast_search/csv` header confirms all required fields: `hc_x`, `hc_y`, `launch_speed`, `launch_angle`, plus `events`, `bb_type`, `des`, `game_date`. Phase 1 (coordinate-source swap, outcome coloring unchanged) clear to implement — Relay + Axiom only. Phase 2 (EV-colored dots) still needs Kael color scale + Vera toggle spec.

**P6 — NOT VIABLE, CLOSED.** `group_by=name` returned a header byte-identical to pitch-level mode — Savant ignores the parameter on this endpoint or applies it only in the UI layer. No aggregated outcome columns exist. The client-side aggregation in `_fetchMLBH2H` stays; payload-reduction idea closed rather than parked.

**P10 — STILL PARKED.** The OAA leaderboard header was not captured in this batch. One remaining URL for the owner (from the walkthrough, step 4A).

**D-006 — owner ruling:** Broadcast Blurb deliberately disabled for now. Recorded in DECISIONS.md; removed from pending-action lists.

---

### Session 2026-06-09 (verification results applied) — SHIPPED
**Contributors:** Relay (verification analysis), Axiom (implementation), Folio (records) | **Date:** 2026-06-09

- **D-004 CLOSED** — owner Lighthouse on mlb-leaders: Accessibility 100. Paid-tier WCAG gate satisfied.
- **D-006 CLOSED** — blurb worker deliberately deferred by owner ruling.
- **P6 CLOSED (not viable)** — `group_by=name` returns the pitch-level schema unchanged.
- **D-011 OPENED + executed** — performance pass targeting Lighthouse 58 → ≥90: math.min.js (664KB) out of the script chain, lazy-loaded by Stat Builder with loading-state fallback; arcade/scorecard/liveGame/shareCard CSS + fonts CSS deferred (print/onload swap with noscript fallback); header icon 96KB → 5KB (`assets/icon-64.png`, explicit dimensions); `robots.txt` added (was missing — crawlers got the SPA HTML fallback, 335 parse errors); HSTS + COOP headers added.
- **P9 Phase 1 SHIPPED** — `fetchSprayChartData` now one Savant CSV call instead of gameLog + up to 20 playByPlay fetches. Schema guard on `events`/`hc_x`/`hc_y` (Relay pattern). Renderer unchanged — Savant event values match its keys. Parse verified against stubbed CSV. Phase 2 (EV-colored dots via `launch_speed`, now confirmed in schema) awaits Kael color scale + Vera toggle spec.
- **Re-test needed (owner):** Lighthouse performance re-run after deploy; expect FCP/LCP to drop substantially. Also still open: OAA header row (P10), Slow-3G pass (D-005).

---

### De-AI Pass Round 2 — Content-Level Tells — SHIPPED
**Contributor:** Kael (audit + rulings), Axiom (implementation), Vera (review) | **Date:** 2026-06-09

Round 1 covered visual tells (fonts, glows, gradients). Round 2 went after content and behavior:

1. **Emoji removed from professional surfaces.** Breadcrumbs now render labels only (were "🏆 MLB Leaders"). Every empty state uses one neutral SVG baseball glyph via `ErrorHandler.EMPTY_GLYPH` — `renderEmptyState` ignores legacy emoji args (accepts SVG strings only). Recents badge fallback is text ("MLB"), not ⚾. **Documented exception:** Arcade keeps its emoji — it is the deliberately playful zone, and uniformity there would be its own kind of fake. The hidden `#brandIcon` span retains emoji fallbacks (never rendered).
2. **Console silenced in production.** `Logger` now gates INFO/DEBUG console output behind localhost or `localStorage.zs_debug = '1'`. A visitor opening DevTools sees a quiet console instead of a colored dev-log stream — the single fastest way a technical evaluator smells a vibe-coded site. History buffer still records everything for the error boundary.
3. **Attribution footer added** to the home page: "Stats: MLB Stats API & Baseball Savant. This site is not endorsed by or affiliated with Major League Baseball." plus copyright. This is simultaneously a legitimacy marker (real stat products credit sources), an MLB API terms nicety, and the kind of boring detail template sites never have.
4. **README reviewed, kept** — already professional: concrete feature inventory, no emoji headers, no badge walls.

---

### Key Metrics — Unqualified-Player Layout Looked Broken — RESOLVED
**Contributor:** owner (report + screenshot), Kael (diagnosis + fix) | **Date:** 2026-06-09

Owner screenshot: a ~2-game player's Key Metrics rendered as sparse full-width label/value rows with huge vertical gaps — read as a loading failure. Diagnosis: the percentile rows were injected into the legacy `.shooting-stats-grid` (flex column, 1.25rem gap) sized for the old two-line stat bars; one-line rows inherited the airy spacing. The qualification logic itself was correct — the player genuinely sits below 80 PA, so percentiles were rightly hidden.

Fix: MLB Key Metrics gets its own `.pct-profile` container (legacy grid untouched — NBA detail still uses it). Percentile bar rows span full width; plain unqualified rows pack two-up as a dense bordered table via auto-fit grid (collapses to one column on narrow screens). Verify post-deploy on both a qualified starter (bars + bubbles) and a call-up (compact two-column table).

---

### Browser Identity Assets Missing — Favicon, Touch Icon, Emoji PWA Icons — RESOLVED
**Contributor:** Vera (finding), Kael (icon production), Axiom (wiring) | **Date:** 2026-06-11

Public-readiness UX pass found the site had no `<link rel=icon>` at all (generic globe in every browser tab + a /favicon.ico 404 in every visitor console), no apple-touch-icon (iOS home screen got a page screenshot), and — worst — the PWA manifest icons were inline SVG data-URIs rendering a ⚡ emoji: that emoji was the installed app icon behind the F5 install prompt. Fixed: generated brand icons from Icon.PNG (favicon.ico multi-size, icon-64/192/512 with maskable-safe margins on brand background, apple-touch-icon 180), linked in index.html, manifest icons now real PNGs, key icons precached in sw.js.

---

### Live UX Walkthrough (Vera, via owner's Chrome) — Findings — 2026-06-11
**Contributors:** Vera (walkthrough), Axiom (fixes), Cipher (CORS), Folio (record)

Walked the production site in the owner's browser. Results:

1. **CRITICAL, FIXED: cold deep-links lost percentiles + rank badges.** Reproduced the owner's "Key Metrics not loading" report on Aaron Judge (261 PA): `AppState.mlbLeaderSplits` was null on the cold deep-link path — `_restoreMLBPlayerDetail` loads league stats but never the leader splits, so P3-028 percentiles AND P3-015 rank badges silently vanished. Fix in `showMLBPlayerDetail`: fetch the pool once when absent, re-render guarded by hash. **Verified live** by executing the fix's logic in-page: full Savant-style profile rendered (Judge: OPS 95th, ISO 98th, vs 366 qualified hitters), rank badges returned.
2. **CRITICAL, SOURCE-FIXED: production origin blocked by own Workers.** `sportsstrata.com` serves an error page — production actually lives at `zohn-sports-stats.pages.dev`, which was NOT in the Worker CORS allowlists. NBA features (BDL proxy) and the blurb Worker (when enabled) would be CORS-refused on the real production origin. Added pages.dev to both allowlists — **owner must `wrangler deploy` the BDL proxy** and decide the custom-domain question: either attach sportsstrata.com to the Pages project (it is the brand domain printed on share cards and the footer) or re-brand those references.
3. **Console clean in production** — Logger gating verified live, zero errors on home page load.
4. **Cold deep-link works** (player page renders from direct URL), `popstate` handler present so Back/Forward work. Known edge: manually editing the hash mid-session does not re-route (no `hashchange` listener) — minor, parked.
5. **Home page first impression: strong.** Game cards, ticker, Tonight's Starters all render with team identity. Minor copy inconsistency parked: game card shows "Pérez vs ?" while the starters section shows "TBD" for the same unknown.
6. **State nit, parked:** `AppState.currentView` reads `mlb-players` while on a player detail page (restore path doesn't set the player route) — cosmetic, but worth a cleanup pass.

---

### P9 Phase 2 — Exit-Velocity Spray Chart Coloring — SHIPPED
**Contributors:** Kael (color spec), Vera (toggle spec), Axiom (implementation) | **Date:** 2026-06-11

Built on the owner-verified CSV schema (launch_speed confirmed present). Kael: EV dots reuse the P3-028 _mlbPctColor diverging scale (75 mph -> blue, 115 -> red) — one data-intensity language site-wide, no new palette. Vera: Outcome / Exit velo pill toggle above the chart, outcome default, toggle rendered only when EV data exists, aria-pressed + group label, EV-less rows render neutral in EV mode, legend switches to mph buckets with counts (105+, 95–105, 85–95, <85). Axiom: launch_speed captured in the spray parse (cache key bumped to v3), delegated click listener on the container re-renders from cached rows — zero refetches on toggle. Renderer unit-verified in both modes plus the no-EV fallback.

Also this session: SITE_DOMAIN constant in config.js (owner ruling 2026-06-11: pages.dev is canonical for now) wired into the share card footer and share text — one-line change when a custom domain attaches; home game card unknown-pitcher fallback unified to TBD; AppState.currentView made truthful on player detail.

---

### Redundancy Audit — "One Number, One Home" — Phase 1 SHIPPED
**Contributors:** owner (finding), Kael (ruling + redesign), Axiom (implementation) | **Date:** 2026-06-11

Owner flagged the player page showing season stats twice (stat tiles + Key Metrics). Kael's audit found it was actually three times — the radar also plots AVG/OBP/SLG/HR/RBI/SB. Adopted as Design Principle 7 (GOALS.md): one number, one home, context system matched to stat type.

**Shipped:** Player detail restructured. "Season Totals" tiles now hold only counting/volume stats (HR R RBI H 2B 3B TB SB BB SO Speed PA GP; pitching: W L SO IP BB QS SV HLD GS GP) with rank badges for league context. Key Metrics owns every rate/advanced stat (hitting: AVG OBP SLG OPS wOBA wRC+ ISO BABIP BB% K% SB%; pitching: ERA WHIP K/9 BB/9 H/9 HR/9 K/BB FIP K-BB% LOB% QS%) with percentile bars. FIP/K-BB%/LOB%/QS% gained percentiles they never had; zero stats appear in both sections.

**Flagged for owner decision:** the Stat Profile radar still re-plots six stats now shown elsewhere. Options: remove from single-player view (keep in Compare where shape-vs-shape earns it), or keep as visual anchor. Kael leans remove-on-single-player; awaiting ruling.

**Standing team mandate:** every view audited against Principle 7 during its next touch. Known candidates to check: game prep team-comparison rows vs probable-pitcher cards (ERA/WHIP may repeat), team detail aggregate card vs standings row, compare view stat bars vs radar.

---

### Principle 7 Audit — Game Prep — PASSES (live review 2026-06-11)
**Contributors:** Vera + Kael (live walkthrough), Folio (record)

Walked the full STL@NYM prep sheet in the owner's browser. Verdict: the apparent stat repeats are scope distinctions, not redundancy — Team Batting (season), Handedness Splits (lineup vs starter hand), Key Hitters (individual), Probable Pitchers (individual) vs Team Pitching (staff) each answer a different broadcast question. No changes. Bullpen availability chips pair color with text labels correctly. Headshot false alarm investigated and withdrawn (real photos, small render). Remaining Principle 7 candidates for next touches: team detail aggregate card vs standings row; compare view bars vs radar; the player-detail radar awaiting owner ruling.

---

### Live Game Viewer Not Rendering Full-Page — FIXED (2026-06-12)
**Contributors:** owner (report), Axiom (diagnosis + fix), Vera + Kael (review), Finn (record)

**Report:** the full-page live game view (`navigateTo('mlb-live-{gamePk}')`, the D-009 pattern) was not loading into the whole page — it rendered cramped in a narrow column.

**Root cause (Axiom):** `navigateTo()` sets `#playersGrid` to `.players-grid` for every non-home view (`navigation.js:153`) — a `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` multi-column grid. `showMLBLiveGame()` then appended `.lg-live-page` straight into that grid without resetting the class, so the live page became a single grid item pinned to one ~240px auto-fill track on the left. Its own `max-width:680px; margin:0 auto` never engaged because the grid track was already narrower than 680px. Scorecard (`grid.className = ''`) and player detail (`grid.className = 'player-detail-container'`) already reset the container; the live page was the one full-bleed view that didn't. This is the contract: any view that injects its own page wrapper into `#playersGrid` must first drop `.players-grid`.

**Fix (Finn, per Axiom):** one line in `showMLBLiveGame` — `grid.className = ''` before injecting the page, with a WHY comment. Renderer, polling, and back-nav unchanged. Restores the intended centered single-column reading view across the full content area. Syntax-checked.

**Kael (visual review):** the restored 680px centered column is the intended D-009 reading width — matches the focused-page posture of scorecard and player detail. No change. If the owner wants edge-to-edge box-score density later, that's a separate Kael spec, not a regression.

**Vera (behavior review):** back button (`← Back to Scores`) and the `_closeExistingPanel` page-mode branch (`navigateTo('mlb-games')`) both intact; polling lifecycle stops on nav-away via the existing `stopLiveGamePolling()` in `navigateTo`. No state-cleanup gap introduced — navigating away restores `.players-grid` on the next view.

**Secondary finding (Finn, flagged — not fixed):** mid-session manual hash edits still don't re-route — there is no `hashchange` listener; routing runs through `navigateTo()` and a first-load `_loadFromHash()` only. Carried over from the 2026-06-11 walkthrough (parked as minor). If "improve nav functions" is meant to cover this, it needs an Axiom call on adding a `hashchange` handler vs. leaving it. Routed to Axiom.

---

### De-AI Pass Round 3 — Off-Theme Decorative Color — SHIPPED (2026-06-12)
**Contributors:** owner (report), Kael (audit + ruling), Axiom (implementation)

Owner flagged the multicolored "Season Totals" tiles on the player page as reading "vibecoded." Kael's audit confirmed it and found the same anti-pattern across MLB/shared surfaces: stat **values** were tinted by category — a different hue per stat (HR emerald, RBI sky, R violet, plus raw hex `#67e8f9`, `#a3e635`, `#fb923c`…). This directly violates the project's own token rule (`variables.css`: "do NOT use stat-category tokens for grading — those tokens mark category, not quality") and Kael's principle "color is meaning, not decoration."

**Kael ruling (now the standing rule):** stat values render in one neutral weight (`--text-primary`/`--text-secondary`). Color is reserved for (a) semantic state — win/loss/live — and (b) performance quality — rank badges and percentile bars. Category never gets a hue. Data is the hero; the rainbow was chrome competing with it.

**Shipped (Axiom):**
- Player detail **Season Totals** tiles — dropped the per-stat color column entirely (hitting + pitching); values now uniform. Rank badges (quality) untouched.
- Player detail compact stats card (AVG/OBP/SLG/OPS/HR/RBI; ERA/WHIP/W-L/SO/K9/SV) — removed per-stat tint.
- **Fielding** card tiles — removed tint.
- **Team roster** card stat lines (ERA/WHIP/K; AVG/HR/RBI) — removed tint.
- Stat-table columns `.tbl-pts/.tbl-reb/.tbl-ast/.tbl-pct` (`main.css`) — collapsed to one `--text-primary` rule.
- Home `.examples-panel` — replaced the surviving `linear-gradient` + category-amber heading with a flat `--accent-subtle` panel and `--accent` heading (kills a gradient Round 1 missed).

Semantic color (win/loss/live), rank badges, and percentile bars are intentionally unchanged. Syntax-checked; diff is color-only, no logic touched.

**Remaining category-hue candidates for next touch (flagged, not fixed):** NBA player detail still tints values (`players.js`/`playerDetail.js`) — left alone per the MLB-only rule; `stat-rank--good/great/elite` reuse category tokens rather than the `--color-tier-*` performance tokens; a couple of component-card accents (`components.css` ~2284, ~2348). None are on the player page the owner flagged.

---

### Live Game Viewer — Pitch Heat Map + Mobile/a11y Polish — SHIPPED (2026-06-12)
**Contributors:** owner (direction), Kael (color spec), Vera (toggle + mobile order), Axiom (implementation) | See DECISIONS.md D-009 amendment.

**Shipped:**
- **Pitch heat map** on the live game zone. New `_collectPitcherGamePitches(allPlays, pitcherId)` aggregates the current pitcher's whole-game pitches via the confirmed `coordinates.pX/pZ` fields; `_buildPitchHeat` bins them (7×9) over the plot region and shades cells by count in one hue (`--accent`, opacity-scaled). `_lgZoneGeom` factored out so dots and heat share identical zone geometry. `_renderZone` now owns the zone column and is called from `_renderPanel` and from the toggle handler (re-renders from `_lgFeedCache`, zero refetch).
- **Dots/Heat toggle** — pill group above the zone, `aria-pressed`, Heat disabled until ≥1 game pitch, session-scoped via `_lgZoneMode` Map keyed by gamePk.
- **Mobile order** — zone column drops below the play-by-play log on ≤768px (flex `order`), per the D-009 mobile-order intent.
- **a11y** — zone SVGs now `role="img"` with mode-specific `aria-label` (dots: at-bat + pitch count; heat: pitcher game pitch count); existing dot keyboard/focus/Escape behavior unchanged.

Verified: `node --check` clean; 16-assertion jsdom harness passed (aggregation excludes other pitchers, dots render, heat cells render with inline opacity, toggle disabled-state correct, `_renderZone` integration + hidden-when-no-at-bat). Pixel verification pending owner `/screenshot` (no browser in build env).

**Gated, not built:** pitch **trajectory animation** — needs per-pitch movement/break fields not confirmed in `feed/live`. Parked pending an owner-supplied feed sample (Relay/Axiom schema-verification pattern). See D-009 amendment.

---

### De-AI Follow-up — Hot Right Now Strip + Font Audit (2026-06-14)
**Contributors:** owner (report), Kael (audit + ruling), Axiom (implementation)

**Hot Right Now multicolor — FIXED.** The home "Hot Right Now" tiles (`home-hot-tile`, rendered in `app.js`) were the last multicolor home surface Rounds 1/3 missed: four hardcoded category hues (HR red, AVG amber, ERA pink, OPS violet) drove a per-stat colored left-border, a `::before` gradient wash, and the colored stat value — the "multicolored glow" on the dark tiles. Kael ruling (per Round 3 standard — color is state/quality, not category): collapse to the single brand `--accent`. Dropped the per-stat `color` from the `spots` array and both inline styles; `.home-hot-stat` now renders in `--accent`; removed the `::before` gradient wash for a flat card. Also repaired the `main.css` footer truncation left by the Round 3 sync corruption (footer rule restored).

**Font audit (Kael) — finding, owner ruling pending.** De-AI Round 1 (`ef02de0`) dropped **Inter** (body sans) and **JetBrains Mono** (stat numerals) for system stacks, citing ~100KB perf. It KEPT **Barlow Semi Condensed** (`--font-display`), which still loads and carries the headings, scores, and stat values — so the signature aesthetic is intact. The `Themes/` docs are team color palettes, not site typography. Open question for the owner: restore Inter + JetBrains Mono (revert Round 1 fonts), restore just the stat monospace, or keep system stacks. No font change made yet.

---

### Public Beta Readiness Review (2026-06-14)
**Contributors:** Cipher (data/security), Vera (UX), Kael + Relay (layout/data presentation), Folio (record)

**Cipher — data liabilities.** Overall clean: no accounts/login, **no PII collected or transmitted**, no third-party trackers/analytics, no hardcoded secrets in source (all server-side Worker env), local storage is cache/prefs/favorites only (never sent). `.gitignore` covers `.env`, `*.key/*.pem`, and `owner-checklist-*.md`. Findings:
- **P1-006 (open owner action) — the one real liability.** The old BDL key is in public git history (entered in `4082a90`). Current source is clean (`BDL_API_KEY=''`), but on a public repo the old key is extractable. **Owner must confirm it's invalidated at balldontlie.io;** optional history scrub for hygiene. This is the top pre-promotion item.
- **CSP uses `'unsafe-inline'`** (script + style) — necessary for the no-build inline scripts/styles, mitigated by `_escHtml` discipline, but it's the main XSS-hardening gap. Acceptable for beta; note for later.
- **Kalshi betting code path** in `worker/bdl-proxy.js` (env-gated, inert unless keys set). Scope/brand/regulatory flag for a publicly promoted stats site — confirm it stays disabled.

**Vera — UX.** Public Beta gates closed 2026-06-01; recent fixes (full-page live view, hot strip, fonts, cold deep-link) land the experience. Residual: mid-session hash edits don't re-route (no `hashchange` listener — parked, minor). **Gating item: several fixes are committed but must be pushed and deployed (and the `sportstrata.cc` custom domain attached) before promoting** — users should land on the fixed build.

**Kael + Relay — layout / data presentation (for consideration, not changes).** Continue the Principle-7 sweep (team-detail vs standings, compare bars vs radar). Review first-visit home hierarchy for a cold beta visitor, off-season/no-games empty states, and re-run Lighthouse post-deploy (D-011). All forward-looking — no silent edits.

---

### Public Beta — Live UX Pass Findings (2026-06-14)
**Contributors:** Vera (live walkthrough on sportstrata.cc), Axiom (fix), Cipher/Relay (data notes), Folio (record)

Walked the live production site. Deploy + `sportstrata.cc` confirmed live; home, ticker, scores, search, Recently Viewed, fonts (Inter/JetBrains restored), and the Hot Right Now accent fix all render correctly. Findings:

1. **CRITICAL, FIXED — Players grid collapsed to a single squished row.** `showMLBPlayerDetail` sets an inline `grid.style.cssText='display:flex;align-items:center;justify-content:center;padding:4rem'` for its loading/not-found layout (`mlb.js:1837`). That inline style **leaked**: navigating from a player detail to the Players list left it on `#playersGrid`, and inline `display:flex` overrode `.players-grid{display:grid}` — 100 cards crushed into one ~34px-wide nowrap row. Fix: `displayMLBPlayerCards` and `displayMLBPlayersTable` now clear `grid.style.cssText` before rendering. Verified live (clearing the inline style restored a proper 4-column ~299px grid). Same inline-leak class as the live-game `.players-grid` fix — candidate central hardening: clear grid inline style in `navigateTo`.
2. **HIGH, data credibility (Relay) — unqualified rate leaders.** Home "Hot Right Now" and the season rate leaderboards default to no qualifier ("Min GP/IP: All"), so they surface 1-for-1 players: Batting Avg 1.000, OPS 3.250, OBP 1.000, ERA 0.00 (10-way tie), K% 0.0%. The position grid and Statcast leaders (which enforce a minimum) show correct leaders. For "serious stats," the headline leaders must be qualified — apply a min-PA/IP default to `_top()` and the rate leaderboards. Not yet fixed — needs threshold decision.
3. **LOW, confirmed — `hashchange` deep links.** Pasting a `#mlb-...` URL into an already-open tab doesn't re-route (no `hashchange` listener). Cold loads and in-app clicks work. Parked.
4. **Minor data gaps:** pitcher Statcast leaders (K%/Whiff%/CSW%/BB%) and Quality Starts show "No data" on the leaders page — confirm the source/qualifier before promoting those sections.
5. **Positive:** the "Player not found" state is well-designed (clear message + "Browse all players" CTA), not a blank screen.

---

### Leader Qualification — rate leaderboards + Hot Right Now (2026-06-14)
**Contributors:** owner (direction), Relay (qualifier), Axiom (implementation), Folio (record)

Fixes the beta credibility issue where 1-for-1 lines topped rate boards (Batting Avg 1.000, OPS 3.250, ERA 0.00). Applied the MLB-standard qualifier — **3.1 PA per team game** for hitters, **1 IP per team game** for pitchers — derived at runtime from the max games-played in the pool, so it auto-scales with the season:
- **Home "Hot Right Now"** (`app.js` `_renderHotStrip`): AVG/OPS pick from qualified hitters, ERA from qualified pitchers (HR stays full-pool — counting stat). Falls back to the full pool if nobody qualifies yet.
- **Leaders page** (`mlb.js` season-leaders filter): every rate category (`cat.decimals > 0`) now requires the PA/IP qualifier by default, independent of the user's Min GP/IP control. Counting stats unchanged. Panels show the "N qualifying" count.

**Tradeoff to note:** the 1-IP/game pitching qualifier (≈70 IP now) excludes relievers from rate boards like K/9 — that's the standard "qualified" definition (matches ERA-title rules), but if we want elite reliever rates surfaced, we'd add a lower reliever bar later.

---

### Leaders "No data" gaps — Pitcher Statcast fixed; empty boards hidden (2026-06-14)
**Contributors:** Relay (Savant schema diagnosis), Axiom (fix), Folio (record)

Live beta pass found several Leaders panels showing "No data." Root-caused both against the live data:
1. **Pitcher Statcast (K%/Whiff%/BB%) — FIXED.** The Savant custom-leaderboard column names had a stale `p_` prefix (`p_k_percent`, `p_whiff_percent`, `p_bb_percent`) that Savant now returns **blank**; only `exit_velocity_avg` populated (hence EV Allowed worked, the rest were empty). Verified the correct keys live (`k_percent`/`bb_percent`/`whiff_percent` return real values, 129 qualifying). Updated the fetch `selections`, the schema-`required` check, and `STATCAST_PITCHER_CATS`. **CSW removed** — Savant returns `csw_percent` blank here (no source), so the category is dropped rather than shown empty.
2. **Quality Starts / QS% — not in the data source.** `qualityStarts` is absent from the MLB Stats API leader splits (`qualityStartsKeyExists: false`, totalQS 0). Rather than show a permanently-broken panel, the season-leaders renderer now **hides any panel that is empty in the default (unfiltered) view**; filtered views still show empties so "no matches" stays visible. QS reappears automatically if a source is wired later.

Verified: corrected Savant query returns populated K%/Whiff%/BB% live; `node --check` clean; diff is the four intended edits only.

---

### NFL Fantasy — Mock Draft Simulator (spec / three gates) (2026-06-14)
**Contributors:** Vera, Kael, Axiom, Relay | Roadmap: DECISIONS.md D-014. Scope: no-login, casual/redraft.

Foundation added: `functions/api/sleeper.js` (same-origin Sleeper proxy). Build is gated on the three specs below closing AND a data check.

**Relay — data gate (must validate post-deploy before building the value engine):** confirm via `/api/sleeper?path=/v1/players/nfl` what's actually available — positions, team, status, and an ADP-like signal (`search_rank`). Sleeper has no direct ADP/projections endpoint; if `search_rank` is too coarse, supplement ADP/projections from another ToS-clean source (decision, not assumption). VORP/PAR are derived from projections, so they depend on this.

**Vera — behavioral spec:** Flow: setup (teams 8/10/12/14, scoring PPR/half/std, snake, your slot) → live board → AI opponents auto-pick on ADP + tier with controlled variance → your turn (search/filter best-available, position needs) → recap (team grade, value vs. ADP, VORP-lite). States: players loading, error/empty, draft in progress, your-turn, complete. Session-only, fully resettable; **no login, nothing persisted server-side.** Keyboard + mobile flows specced.

**Kael — visual spec:** Immersive draft board (rounds × teams grid), turn/countdown indicator, "best available" panel, a "war room" panel for your roster needs, position color-coding drawn from the existing token system (no new palette). Reuse card/leaderboard/table language; restrained, broadcast-grade.

**Axiom — feasibility:** Monte Carlo (thousands of sims for value ranges) runs **client-side in a Web Worker** (non-blocking) over cached player values — no backend, fits static Pages. New `js/fantasy.js` + an `nfl-mock` route; AI-opponent logic = ADP/tier + variance (no LLM). Three gates required before Finn builds.

**Accounts foundation (parallel planning, Axiom — design only, not built):** target Cloudflare-native (Pages + D1 for user/league data + Turnstile/Access or lightweight auth). Design the mock-draft result + roster shapes so "save my draft," league import (Sleeper league/roster), and personalized grades slot in later without a rebuild. No auth code ships in this phase.

---

### NFL Beta + Fantasy Mock Draft — SHIPPED + validated (2026-06-14)
**Contributors:** Axiom, Relay, Vera, Kael, Finn, Folio

Validated live on sportstrata.cc:
- **NFL light surface:** sport switcher → brand/sub-nav swap (Scores/Standings/Teams/Mock Draft); Scores = 2026 Week-1 schedule via `/api/nfl`; Teams = 32; Standings = offseason state; game-card logo fix.
- **Mock Draft v1 (`js/fantasy.js`):** setup → snake draft vs ADP/need AI → best-available search/filter → Monte Carlo "% to return" (verified: 0%→97% gradient by ADP) → roster panel → value-vs-ADP grade. No login, session-only. Data: Sleeper `/api/sleeper` (search_rank ADP; 1,709 ranked players).

**Open follow-ups:**
- **NFL depth (next, per owner):** reuse existing MLB component logic — NFL **leaderboards** (leaderboard panel pattern) and NFL **player cards/detail** (player-card/detail pattern), powered by ESPN data via `/api/nfl` (`/leaders`, team rosters, athlete stats). Needs the three gates.
- Projections-dependent fantasy (VORP/PAR, projected points) + DST — need a ToS-clean projections source (Sleeper public data lacks projections).
- Year-round NFL standings source (ESPN site `/standings` is permanently dead; derive in-season from scoreboard records or a cdn/core endpoint via the proxy).
- Mobile bottom-nav per-sport swap; Monte Carlo → Web Worker for thousands of sims.
- Accounts tier (grades, league import, multiplayer, monetization) — D-014 parallel planning.

Note: service worker is stale-while-revalidate (D-010) — post-deploy changes show after a load or two.

### NFL Depth — Players directory + Trending board (2026-06-15) — SHIPPED (pending push)
Owner: deepen NFL reusing existing component logic (leaderboards, player cards). See D-015.

**Data reality (Relay):** ESPN site API has no working `/leaders` or roster path (404 / not-allowlisted); real stat leaders need the ESPN core-API host. Offseason = zero 2026 stats. Removed the dead `fetchNFLLeaders()`.

**Shipped on validated Sleeper data:**
- **NFL Players** (`loadNFLPlayers`/`displayNFLPlayers`/`_createNFLPlayerCard` in `nfl.js`) — reuses `.player-card`. 2,347 active fantasy players ranked by ADP; metadata pos/team/age/exp/HT-WT/college/#/injury; position filter chips. Sleeper headshots (`sleepercdn.com` added to CSP img-src in `index.html` + `_headers`; image existence verified).
- **NFL Trending** (`loadNFLLeaderboards`/`displayNFLTrending`) — reuses leaderboard panel. Sleeper trending add/drop, real 24h counts, two panels, labeled "across fantasy leagues in the last 24 hours · Source: Sleeper."
- Nav: sub-nav = Players · Trending · Scores · Standings · | · Teams · Mock Draft; route split (`nfl-players`→players, `nfl-leaders`→trending); menu labels fixed (were both "NFL Leaders").

**Verification:** `node --check` clean on `nfl.js` + `navigation.js`; no NUL/truncation; Sleeper pool + trending payloads + headshot image validated live pre-deploy. Full live render verification pending push + Cloudflare deploy.

**Open follow-ups (deferred):**
- True NFL stat leaders (passing/rushing/receiving yds, TDs, sacks, INT) — requires standing up an ESPN **core-API** proxy (`sports.core.api.espn.com`): new Pages Function, allowlist, payload validation. In-season only.
- NFL player-detail page (reuse player-detail pattern) — worth building once per-player stats exist via the core-API proxy; Sleeper metadata alone doesn't justify a full detail page.
- Mobile bottom-nav per-sport swap (still MLB-only destinations on mobile).

### NFL Functional Pass — Player Detail, Team Detail+Rosters, Mobile Bottom-Nav (2026-06-15) — SHIPPED (pending push)
Owner: "make the NFL side fully functional." Team audit (Vera/Kael/Axiom/Relay) → owner picked 3 of 4 fixes.

**Audit findings (live):** player cards showed pointer cursor but had no click action (dead-end); team cards non-clickable; mobile bottom-nav stayed on MLB destinations in NFL mode; ⌘K omits NFL (deferred by owner). Scores view confirmed correct (shows real 2026 Week 1 schedule in offseason).

**Shipped (all reuse existing components, Sleeper data):**
- **NFL player detail** (`showNFLPlayerDetail`/`_renderNFLPlayerDetail`, nfl.js) — reuses `.player-detail-*`. Hero (headshot, pos pill, ADP badge, clickable team link), Player Profile (age/exp/HT/WT/college/jersey/depth-chart/status), Fantasy Outlook prose. Player cards now clickable (+ "VIEW PROFILE" CTA); Trending rows clickable. Route `nfl-player-{id}`.
- **NFL team detail + roster** (`showNFLTeamDetail`/`_renderNFLTeamDetail`) — reuses detail header. Team header (logo/record/player count), next-opponent from schedule, full roster grouped Offense/Defense/Special Teams (Sleeper by team, `_nflSleeperAbbr` aliases WSH→WAS, OAK→LV), each player row clickable → player detail. Route `nfl-team-{abbr}`. Validated: BUF 95 players, 45/45/5 split, 0 orphans.
- **Mobile bottom-nav per-sport swap** (`BOTTOM_NAV_TABS` + `_renderBottomNav` in `_applySportUI`) — NFL mode shows Players/Trending/Scores/Standings/Draft instead of MLB destinations.
- Hash deep-links: `nfl-player-*` / `nfl-team-*` handled in `_loadFromHash` + `_renderNFLView`.
- SW cache bumped v4→v5 (precached JS changed) so the deploy lands immediately.

**Verification:** node --check clean (nfl.js, navigation.js, sw.js); no NUL/truncation; player-detail + roster-grouping logic validated live against Sleeper. Full interaction verification pending push + deploy.

**Deferred:** ⌘K NFL search (owner skipped this round); true stat leaders + game logs (need ESPN core-API proxy, D-015).

### NFL Real Stat Leaders (2025) + Leaders/Trending split (2026-06-15) — SHIPPED (pending push)
See D-016. Owner: keep building toward NFL fully built out.

- **`functions/api/nflstats.js`** (NEW) — resolves ESPN core-API leaders + top athletes server-side → compact payload. Season auto-detect, `?season=` override. ~30 subrequests, cf-cached.
- **`loadNFLStatLeaders`/`displayNFLStatLeaders`** (nfl.js) — reuse leaderboard panel; 9 categories (pass/rush/rec yds+TD, receptions, sacks, INT), top 5 each, headshots, team·pos, value+unit, "{season} · Source: ESPN" note.
- **IA split:** `nfl-leaders` = real stats; `nfl-trending` = fantasy add/drop (was nfl-leaders). Sub-nav: Players · Leaders · Trending · Scores · Standings · | · Teams · Mock Draft. Bottom-nav: Players · Leaders · Scores · Standings · Draft.
- SW bumped v5→v6.

**Verification:** node --check clean (nflstats.js, nfl.js, navigation.js, sw.js); leaders + athlete-ref shapes validated via web_fetch. Function is server-side — full render verification is post-deploy.

**Deferred:** player game logs on detail (core-API athlete statistics ref); ⌘K NFL search; mobile menu-panel per-sport swap.

### NFL Player Detail — Season Stat Lines via ESPN (2026-06-15) — SHIPPED (pending push)
Extends D-016. Owner: keep building toward NFL fully built out.

**Data finding (Relay):** Sleeper's `espn_id` covers only ~33% of top players (JSN, Bijan, Nacua have none) — too lossy to bridge detail→stats. ESPN's team-roster endpoint (`site.api.espn.com/.../teams/{id}/roster`) returns athletes inline (id + fullName + position), so we bridge by team + normalized-name match instead → near-100% coverage for rostered players.

**Shipped:**
- **`functions/api/nflplayer.js`** (NEW) — `?name=&team=&season=`: maps Sleeper abbr→ESPN team id, fetches that team's roster, name-matches to the ESPN athlete id, then fetches season statistics. 2 subrequests, cf-cached. Returns curated groups (passing/rushing/receiving/defense/kicking), each shown only if its primary stat > 0, plus GP.
- **`_loadNFLPlayerStats`** (nfl.js) — async-loads into a `#nfl-stat-line` placeholder on the player-detail page after the profile renders; renders a "{season} Season Stats · N GP" card with stat chips per group. Silent no-op when the player isn't matched (free agents, name mismatches) — no broken state.
- SW v6→v7.

**Verification:** node --check clean (nflplayer.js, nfl.js, sw.js); roster + statistics shapes validated via web_fetch. Function is server-side — full render verification post-deploy.

**Deferred:** per-game game logs (game-by-game); ⌘K NFL search; mobile menu-panel per-sport swap.

### Mobile nav: bottom-nav click bug fix + menu-panel per-sport swap (2026-06-15) — SHIPPED (pending push)
- **Bug found + fixed:** `_renderBottomNav` regenerates the mobile bottom bar per sport, but `setupNavigation` bound click handlers directly to the original static buttons at init — so regenerated buttons were dead (no navigation) on mobile. Now sub-nav, bottom-nav, and menu-panel all use event delegation; only standalone `.nav-tab`s (e.g. ticker SCORES) are bound directly. (Verified the bug live: real-click on a regenerated bottom-nav button did not navigate.)
- **Menu-panel per-sport swap:** the mobile hamburger (`#menuPanel`) was static MLB tiles in all sports. Added `MENU_TABS` + `_renderMenuPanel(sport)` (called from `_applySportUI`); NFL now shows Players/Leaders/Trending/Teams/Scores/Standings/Mock Draft. Extended `_NAV_ICONS` (teams/builder/compare/arcade/trending).
- SW v8→v9.

**Verification:** node --check clean; full mobile click-through pending push + deploy.

### NFL Game Logs (game-by-game) on player detail (2026-06-15) — SHIPPED (pending push)
Extends D-017. Owner: historical/multi-season.

- **`functions/api/nflgamelog.js`** (NEW) — `?id={espnId}&season=`: fetches ESPN's gamelog (full payload, no truncation server-side), parses position-relative columns (`labels`/`names`) + `seasonTypes[].categories[].events[].stats` joined to the `events` metadata map (week, opponent, result, score, date). Returns compact `{columns, games}` + a temporary `_meta` introspection field.
- **`/api/nflplayer`** now returns the resolved `espnId` so the game log reuses it (no extra roster fetch).
- **`_loadNFLGameLog`** (nfl.js) — renders a horizontally-scrollable game-log table (reuses `.table-wrapper`/`.stats-table`) into a `#nfl-gamelog` placeholder on the player detail, below the season stat line. Sticky WK column, W/L coloring, score. Silent no-op when no games.
- SW v10→v11.

**Caveat:** my local web_fetch of the gamelog truncated at 89KB (the events metadata map), so the per-game stat-row parse follows ESPN's documented standard format and is confirmed via the `_meta` field on first live test. Remove `_meta` once confirmed.

### NFL Advanced Metrics — Next Gen Stats via nflverse (2026-06-15) — SHIPPED (pending push)
D-018 (market-competitive, priority 1). nflverse = CC-BY-4.0 (verified, clean).

- **`functions/api/nfladv.js`** (NEW) — `?name&team&pos&season`: fetch `ngs_{season}_{type}.csv.gz` (nflverse), gunzip+parse server-side, name+team match, compute league percentiles among qualified players. Per-position metric sets. `?debug=1` returns the header (confirm columns live, then remove). NGS from 2016+.
- **`_loadNFLAdvanced`** (nfl.js) — "Advanced · Next Gen Stats" card on player detail (above season stats) with Savant-style percentile bars (red=elite) + nflverse attribution. Skill positions only; silent no-op otherwise.
- SW v11→v12.

**Verification:** node --check clean; functions are server-side (gz decode + parse) so verify live: confirm columns via `?debug=1`, then the card renders with real percentiles for a known player. Then remove the debug path.

### NFL Rankings view (ADP, positional + tiers) (2026-06-15) — SHIPPED (pending push)
D-018 priority 2. Projections deferred (no clean documented forward-projection source — ESPN core mirrors actuals / empty for future; ESPN fantasy API is ToS-gray). Owner: "Rankings now, skip projections."

- **`loadNFLRankings`/`displayNFLRankings`** (nfl.js) — Sleeper ADP ranked list: overall rank (ALL) or positional rank (filtered), position chips, tier grouping (Round N for ALL, {POS} Tier N filtered), injury flag, clickable → player detail. Uses NFL_FANTASY_SEASON label.
- Nav: sub-nav Players · **Rankings** · Leaders · Trending · Scores · Standings · | · Teams · Mock Draft; route `nfl-rankings`; menu + nflViews + view-meta wired.
- SW v14→v15.

**Verification:** node --check clean; live render check pending push.

### NFL chart layer — game-log trend (2026-06-15) — SHIPPED (pending push)
D-018 priority 3 (charts), reusing MLB Chart.js infra (StatsCharts).

- **`StatsCharts.nflGameTrend`** (charts.js) — line chart of the player's primary yardage stat per game (auto-detects passing/rushing/receiving group) + TD bars on a second axis. Tracked/destroyed via the existing StatsCharts instance map.
- **`_loadNFLGameLog`** (nfl.js) — renders a trend canvas above the game-log table; self-removes if Chart.js unavailable. Chart.js already loads site-wide before charts.js.
- SW v15→v16.

**Verification:** node --check clean; live render pending push.

### NFL Player Comparison (2026-06-15) — SHIPPED (pending push)
D-018 priority 4 (comparison), reusing the .cmp-* compare UI.

- **`loadNFLCompare`/`_renderNFLCompareView`/`_updateNFLCompare`** (nfl.js) — two-player picker from the Sleeper pool (top 300 ADP); on selection fetches each player's season stats via `/api/nflplayer` and renders side-by-side with "share" tug-of-war bars per stat (A=accent, B=blue), winner bolded, GP in headers. Shareable hash `#nfl-compare-{idA}-{idB}` (replaceState + restore). Reuses `.cmp-*` CSS.
- Nav: sub-nav Compare (after Mock Draft) + route + hash handler in `_loadFromHash` + menu + nflViews + view-meta.
- SW v16→v17.

**Completes D-018 roadmap:** advanced metrics, multi-season/historical, rankings, charts, comparison all shipped.

**Verification:** node --check clean; live render pending push.

### NFL player-detail season selector — historical access (2026-06-15) — SHIPPED (pending push)
Owner: encourage offseason / "years past" use by stat fanatics through ease of access.

- **`_nflChangeDetailSeason`** + "Stats season" `<select>` on the player detail (career range: rookie season → latest, from Sleeper `years_exp`). Drives the season stat line, game log (+ trend chart), and Advanced/NGS cards to the selected year; profile + fantasy outlook stay current-season.
- Loaders `_loadNFLPlayerStats(p, season)` / `_loadNFLAdvanced(p, season)` now take a season (cache-keyed per season); game log already did. Empty seasons (pre-rookie, pre-2016 NGS) clear gracefully.
- SW v17→v18.

**Verification:** node --check clean; live check pending push (flip a player to a prior season, confirm stats/log/advanced update).

### NFL career year-by-year table (2026-06-15) — SHIPPED (pending push)
Stat-fanatic historical access (follows the player-detail season selector).

- **`functions/api/nflcareer.js`** (NEW) — `?id={espnId}`: ESPN per-athlete career stats; slimmed to {category: labels, per-season rows, totals}, volume-filtered (drops noise like a WR's trick-play pass / incidental tackles).
- **`_loadNFLCareer`** (nfl.js) — "Career" card on player detail below the game log: a table per meaningful category (rows per season + a Career totals row). Loads once per player (espnId-gated; season-independent). Tapping a season row calls `_nflChangeDetailSeason` → loads that season's stats/log/advanced above and syncs the season dropdown.
- SW v18→v19.

**Verification:** node --check clean; career data shape validated via web_fetch (JSN receiving 2023-25 + totals). Live render pending push.

### Link Leaders rows → player detail (2026-06-15) — SHIPPED (pending push)
Closes the connectivity item (#38). Trending rows already linked.

- `loadNFLStatLeaders` warms the Sleeper pool; `displayNFLStatLeaders` name-matches each leader to a Sleeper player_id and makes matched rows clickable → `nfl-player-{id}`. Current-season leaders link (in the pool); historical/retired leaders gracefully stay non-clickable (not in the Sleeper roster).
- SW v19→v20.

### NFL all-time / retired-player path (2026-06-15) — SHIPPED (pending push)
D-020. Owner: historical stats for any player + best data practices.

- **`functions/api/nflsearch.js`** (NEW) — ESPN search/v2 filtered to NFL (`~l:28~`), returns {id,name,team,headshot}. Cache 1h by query.
- **`functions/api/nflathlete.js`** (NEW) — slim ESPN athlete profile (name, pos, headshot, ht/wt, college, debut, jersey, status active/inactive). Cache 24h (near-immutable).
- **`showNFLEspnPlayer(espnId)`** (nfl.js) — all-time detail keyed by ESPN id: hero (Retired badge for inactive) + Career table + Game Log with a season selector built from career years. Reuses `_loadNFLCareer` / `_loadNFLGameLog`. Career-row click dispatches via `_nflCareerRowClick` (Sleeper detail vs ESPN detail).
- Routing: `nfl-player-espn-{id}` in `_renderNFLView` (checked before the Sleeper `nfl-player-` prefix) + `_loadFromHash` deep-link.
- **⌘K**: async "All-Time Players" section (`_appendNflAllTime`, debounced+cached) → routes to `nfl-player-espn-{id}`, surfacing retired players (e.g. Calvin Johnson).
- Data practices: public ESPN API only, attribution kept, ESPN id canonical for historical, immutable→long cache, debounced search. SW v20→v21.

**Verification:** node --check clean; search/athlete/career validated via web_fetch (Calvin Johnson 10447 → 2007-15 career). Live render pending push.

### Nav IA: categorize + align both sports (2026-06-21) — SHIPPED (pending push)
D-022. Owner: nav lacked direction / industry-standard categorization across MLB + NFL.

- Stable spine both sports: **Stats** (Players·Leaders·Teams·Standings) · **Fantasy** (NFL: Rankings·Mock·Trending) · **Tools** (Compare·Builder·Prep·Arcade / Compare). Identical order; only contents vary.
- Sub-nav: flat row with uppercase group labels (`.sub-nav-group`, non-interactive) replacing the single cosmetic divider. Menu: same spine with `.menu-section` headers.
- Mobile bottom nav now identical across sports: Scores · Players · Leaders · Standings · **More** (More toggles the menu panel; `stopPropagation` avoids the document close-handler race).
- Fixed latent bug: ticker SCORES button was hardcoded `mlb-games` → now sport-aware via `_applySportUI` (NFL desktop scores no longer routed to MLB).
- Files: js/navigation.js (configs + 3 render fns + `_openMenu` + handler + `_applySportUI`), css/main.css, sw.js v21→v22.

**Verification:** node --check clean (NUL 0); static render sim confirms identical cross-sport order. Live desktop+mobile screenshots pending push.

---

---

## Ask Bar v1 (D-039 Track 1) — GATED task entry — specs below, implementation on owner ratification

### Gate 1 — Vera: job-to-be-done + behavioral spec ✅ DRAFTED
**JTBD:** "Who leads in X?" answered in one keystroke flow — typed the way an announcer thinks, not the way a database is shaped. Target queries (v1 grammar): `<stat> leaders` · `<team> <stat>` · `<position> <stat> leaders` · `<stat> under|over <n>` (qualification) · `hitting|pitching` group inference from the stat · season inference (current). Examples that must parse: "hr leaders", "dodgers ops", "SS batting average", "era leaders min 50 ip", "rookies hr" (rookie = flag if data allows, else v1.1).
**Flow:** lives INSIDE the existing ⌘K overlay as an additive result section — the focus trap, keyboard nav, and player-name search are untouched (search.js do-not-rewire honored). As the user types, if the query parses, an **answer panel** renders ABOVE name matches: top-10 list for the parsed query + an "Understood as:" echo line. Enter on the panel opens the full leaderboard view filtered accordingly; Enter on a row opens the player.
**States (all required):** *no-parse* → silent fallback to today's name search (never an error — the bar must never punish trying); *partial parse* → parse what's recognized, echo shows what was used; *loading* → skeleton rows in the panel (data usually cached — leaders splits); *empty result* → "No qualified players match — try removing 'min 50 IP'" (actionable, names the filter); *first-use teach* → 3 example-query chips shown when the overlay opens empty (dismiss forever after first successful parse, localStorage).
**Keyboard:** arrows traverse answer rows then name results as one list; Esc unchanged; no new shortcuts.
**A11y:** answer panel is `role="region"` `aria-label="Query answer"`; echo line is `aria-live="polite"` so screen readers hear the interpretation change.

### Gate 2 — Kael: visual spec ✅ DRAFTED
Reuses the leaderboard panel row anatomy (rank chip, headshot, name, value in the stat's category color) inside the overlay — the answer should look like the product answering, not a new widget. "Understood as:" echo renders the parse as **tokens-as-chips** (stat chip in its category color, team chip with logo, position chip) — the interpretation is visible, which is our provenance pattern doing trust work (D-038 lineage). Teach chips use `.md-pos-btn` chip styling. **No sparkle icons, no "AI" badges, no gradient glows** — the intelligence reads through precision and speed, per the posture rule. Empty/loading states use existing skeleton tokens. One new CSS block (`.qa-*` prefix), tokens only, grep-checked before landing (cascade-safety rule).

### Gate 3 — Axiom: feasibility ✅ DRAFTED
**Architecture:** new `js/query.js` — a pure function `parseStatQuery(text) → { group, statKey, filters:{team, pos, qual}, confidence } | null` + `runStatQuery(parsed) → rows` reading `AppState.mlbLeaderSplits` (already fetched/cached by leaders + warmed by ⌘K open via `_fetchMLBLeaderSplits`). Zero new endpoints (Relay confirms: season splits cover the v1 grammar; "last 30 days" timeframes need `stats=byDateRange` — deferred to v1.1 with its own gate). Entity tables reuse `MLB_LEADER_CATS` (stat names/aliases), team abbr/alias maps, and position lists — single sources of truth, no duplication. search.js integration is additive: one render hook in the results builder, no focus-trap changes. Load order: after `mlb.js`, before `search.js`; index.html + sw.js updated together (manifest check #10 enforces). Pure-function parser = fully unit-testable → `tests/query.test.js` with a fixture table of query→parse pairs, wired into the pre-push suite.
**Effort:** M (parser + fixtures S/M, overlay integration S, polish S). **Risk:** low — additive, feature-flagged by "does it parse", NFL grammar is v2 (same parser, different entity tables).

**SHIPPED 2026-07-02 — all three gates signed off (Vera ✅ Kael ✅ Axiom ✅), Finn implementation complete.**
- `js/query.js` (parser + engine + panel builder, ~250 lines) — entity tables from `MLB_LEADER_CATS` + colloquial aliases, 30-team nickname map, position map incl. SP/RP/CL role classification (Wave A logic), longest-phrase-first matching, default rate-stat qualification mirroring percentile-engine minimums (80 PA / 15 IP, echoed as "(default)").
- ⌘K integration additive per spec: answer panel + teach chips in `_renderResults`, splits warmed on overlay open; focus trap and keyboard nav untouched (answer rows reuse the `.search-result-item` + `data-idx` contract).
- `.qa-*` CSS (tokens only, no AI glitter per Kael gate). `js/query.js` in index.html chain + sw.js precache (manifest check green). SW v52. CLAUDE.md load order + key files synced (doc-sync rule).
- `tests/query.test.js`: 11 cases (grammar incl. two-token entities, group-ambiguity pref + hint override, qualifier extraction, IP-thirds quals, role classification, cold-pool null). Full suite 23/23.
- **Documented v1 simplification (Vera accepted):** the "Full leaderboards →" row opens `mlb-leaders` unfiltered — pre-applying the parsed team/position filter to the Leaders view is v1.1. Also v1.1: timeframe grammar ("last 30 days" needs `stats=byDateRange`), NFL entity tables, rookie flag.
- **Live verify after push:** ⌘K → "hr leaders" answers instantly with † correct values; "dodgers ops", "era leaders min 50 ip", "closers saves"; teach chips appear once and dismiss after first parse; arrow keys traverse answer rows into name results; "judge hr" shows both the HR panel and Judge in name search.

### Ask Bar v1 live verification (2026-07-02) — PASSED, one gap found & fixed
Verified on sportstrata.cc: teach chips render on the empty overlay ("Try asking:"); "hr leaders" → UNDERSTOOD AS: HOME RUNS chip + instant top-10 (Schwarber 30); "era leaders min 50 ip" → ERA + MIN 50 IP chips, ascending sort (Misiorowski 1.47); teach chips dismissed after first parse; 11 answer rows keyboard-reachable. **Gap:** "judge hr" rendered the panel but name search matched the full string, so Aaron Judge didn't surface. Fixed same session: `qaBuild` returns the leftover tokens and `_renderResults` runs the name search on them ("judge hr" → HR board + Judge). Tests 23/23. SW v53.

### ⌘K MLB name search dead on cold sessions — FOUND & FIXED 2026-07-02
Surfaced by the Ask Bar live verification ("judge hr" leftover fix worked, but `_buildGroups('judge')` was EMPTY): MLB name search sourced `AppState.mlbPlayers`, which only populates on the Players view — so searching any MLB player by name silently returned nothing for cold visitors (NFL warmed on open; MLB never did). Fix: when pools are empty, `_buildGroups` searches a pool derived from `mlbLeaderSplits` (warmed on overlay open since D-039), entries carry `_qGroup` so pitcher clicks restore the right pool. SW v54.
**Live verify after push:** fresh tab → ⌘K → "judge" → Aaron Judge appears; click → player page (group-correct for pure pitchers, e.g. "skenes").

### Ask Bar + cold-search final verification (2026-07-02) — PASSED
Cold session on sportstrata.cc (SW v54): "judge hr" → HOME RUNS panel + Aaron Judge in MLB name results (both halves of the Vera gate). Cold-session MLB name search confirmed working via the splits-derived pool. D-039 Track 1 fully verified live.

---

---

## October Odds (D-039 Track 2c) — GATED task entry — ratified 2026-07-02

### Gate 1 — Vera: JTBD + behavioral ✅
**Job:** "What are my team's October chances, and what did last night do to them?" — answered where the user already looks: the MLB Standings view. Two new columns (DIV%, OCT%) on the division tables; no new route. **States:** columns show — while the sim runs (standings render immediately, odds fill in on one re-render); fetch failure → columns stay —, view unaffected; season over → 100/0 from final standings (0-game sim degrades gracefully); provenance caption in the legend names the method and sim count. Values must never imply false precision: >99.5% renders ">99", <0.5% renders "<1".

### Gate 2 — Kael: visual ✅
Two `standings-num` columns after xW (DIV% wide-screen only, OCT% always). Mono numerals; ≥75% takes `--color-win`, <5% takes `--text-subtle`, else `--text-primary` — the same restraint as RDIFF coloring. Methodology lives in `th title` tooltips + one legend-note sentence. No charts, no gradients, no "AI" labels (posture rule).

### Gate 3 — Axiom + Relay: feasibility + data contract ✅
**Data (Relay):** standings already carry W-L + runs scored/allowed (`fetchMLBStandingsFull`, SHORT TTL). One new fetch: remaining regular-season schedule via `mlbFetch('/schedule', {sportId:1, gameTypes:'R', startDate:today, endDate:season-end}, DAILY)` filtered to `abstractGameState === 'Preview'` — immutable-ish daily payload, edge-cached.
**Model (documented, transparent):** strength = pythagorean win% (runs^1.83) regressed 30% to .500; per-game home win prob = log5 + 3.5% home bump, clamped [.25,.75]; 4,000 season sims; field = 3 division winners + 3 WC per league; ties broken by random jitter (v1 simplification — real MLB tiebreakers are head-to-head; noted in tooltip).
**Architecture (Axiom):** new `js/odds.js` — pure sim (`_mlbOddsSim`, seeded `mulberry32` RNG for tests) + `_mlbOddsEnsure()` (fetch, precompute per-game probabilities once, sim ~150ms, store `AppState.mlbOdds`) + `_mlbOddsCell(teamId, kind)` render hook. mlb.js integration ≤ 12 lines (two th, two td via typeof-guarded hook, one kick in `loadMLBStandings`, legend note). Chain after mlb.js; index.html + sw.js together (check #10). Tests: `tests/odds.test.js` seeded fixtures.

**SHIPPED 2026-07-02 — all gates signed (Vera ✅ Kael ✅ Axiom/Relay ✅).** `js/odds.js` (138 lines), standings DIV%/OCT% columns + provenance legend with sim timestamp, `.standings-odds` tokens-only CSS, chain + sw.js v55, CLAUDE.md synced. `tests/odds.test.js`: 6 seeded cases (pythag regression, log5 symmetry/clamps, deterministic zero-game sim, ~53.5% home-bump convergence, wild-card rescue, no-false-precision formatting). Full suite 29/29.
**Live verify after push:** MLB Standings shows DIV%/OCT% filling in ~1s after first paint; leader ≥75% reads green; legend shows sim time; values sane vs the eye test (runaway leaders >90, cellar dwellers <1).

### October Odds live verification (2026-07-03) — PASSED, one placement note
Sim confirmed on sportstrata.cc: 4,000 seasons × 1,098 remaining games, values pass the eye test (ARI 9.0% OCT, BAL 11.8% from 12 GB, LAA <1%), legend stamped with sim time. **Note → D-040:** at 3-panel desktop widths the DIV%/OCT% columns sit behind the table's horizontal scroll (visible columns end at RDIFF). Column priority decision needed: odds likely out-earn HOME/AWAY splits for default visibility.

### D-040 3b+3c (2026-07-03) — SHIPPED (pending push)
DESIGN.md house-style constitution at repo root (Kael, Folio-maintained); standings column priority: OCT% after GB always visible, DIV% wide-only, splits behind the fold. SW v56. **Live verify:** standings shows OCT% without horizontal scroll at 3-panel widths; tooltips intact; wild-card view unaffected.

### D-040 3b+3c live verification (2026-07-03) — PASSED, one boundary bug found & fixed
Column order verified live: W L PCT GB **OCT%** visible without scroll at 3-panel widths (Rays green, Royals "<1"), DIV% wide-only, splits behind the fold. **Boundary bug caught by the verification:** TB's oct = exactly 99.5 → `v > 99.5` false → rendered "100" — the precise value the no-false-precision rule bans. Fixed to inclusive boundaries (`>= 99.5 && < 100`; true 100 from all sims may say so); pinned in tests/odds.test.js. SW v57.

### D-040 1b — SEO landing stubs (2026-07-03) — SHIPPED (pending push)
Gates (lightweight, static surface): Vera ✅ one-job pages, single CTA into the app route, cross-links between tools; Kael ✅ DESIGN.md voice (kicker "Free · No login · No ads", receipts paragraph on every page, no hype adjectives, brand dark hardcoded so the pages are self-contained); Folio ✅ canonical + OG + twitter meta per page, sitemap.xml, robots.txt Sitemap line; Axiom ✅ zero app impact — no JS, no app CSS, not precached, SW untouched (no version bump needed).
Four pages: `/mock-draft` `/draft-kit` `/playoff-odds` `/ask` (Cloudflare Pages serves .html at clean URLs). The SPA's hash routing meant Google saw one page and every share carried one generic preview — this is the whole top of the acquisition funnel.
**Follow-ups:** proper 1200×630 OG card images (og:image is the 192px icon for now); submit sitemap in Google Search Console (owner).
**Live verify after push:** each clean URL renders; CTA lands on the right app view; `curl -s https://sportstrata.cc/mock-draft | grep og:` shows per-page meta.

### D-040 1a+1c — seasonal home moment + welcome copy (2026-07-03) — SHIPPED (pending push)
Gates (lightweight): Vera ✅ moment band is additive above Today's Games, skeleton while the sim runs, **absent beats broken** (any failure removes the row, never an error on the front door), cross-sport chips route through `_hmGo` (sets sport UI first — the D-038 V2 chimera lesson applied proactively); Kael ✅ slim rows on surface tokens, accent kicker, race chips reuse the pill vocabulary, mobile drops the prose spans; Axiom ✅ `_homeMomentFor(date)` pure config (add a season window + a renderer branch, nothing else), reuses `fetchMLBStandingsFull` (SHORT cache) + `_mlbOddsEnsure` — the first D-040 2a synergy hook (odds on home).
1a: Jul–Oct "Pennant Races" row — 3 tightest divisions (leader, chaser GB, leader DIV% from the live sim) → standings; Jun–Sep "NFL Draft Season" row — Draft Kit + Mock Draft chips.
1c: first-visit welcome rewritten for the barbell: "Serious stats for serious fans — no login, ever." + receipts language.
SW v58. Suite 29/29, manifest + themes green.
**Live verify after push:** home shows both rows (July = overlap window); pennant chips carry real GB + div%; Draft Kit chip lands on NFL Draft HQ with full sport switch (no chimera); first-visit copy visible in a fresh profile/incognito.

### D-040 1a+1c live verification (2026-07-05) — PASSED
Home moment band live: PENNANT RACES row with 3 real races sorted by tightness (AL West SEA · TEX 0.5 back · 59% div; NL East ATL 88%; AL East TB 62%) + All odds link; NFL DRAFT SEASON row with chips. Draft Kit chip → full clean sport switch via _hmGo (sport nfl, view/hash/title/strip all correct — no chimera). Barbell welcome copy confirmed in fresh loadHome. **D-040 Program 1 (Front Door) complete.**

---

---

## SESSION HANDOFF — 2026-07-05 (clean shutdown, full state)

**Everything below is committed. Pending push at handoff: `caaacc4` (1a+1c moment band) + `cb9bfaa` (verification log) + this handoff commit.**

### Shipped + live-verified this arc (all decision-logged)
D-032 accuracy hotfix + first tests · D-033 /api rate limiting · D-034 GOALS v2 barbell constitution · D-035 Draft HQ · D-036 rookie value board · D-037 CI tools (manifest/themes/join-health) · D-038 audit + Waves A/B (8/9 closed) · D-039 Track 1 Ask Bar + Track 2c October Odds (+ cold-search fix, leftover-token fix, 99.5 boundary fix) · D-040 Program 1 complete (DESIGN.md, column priority, 4 SEO stubs + sitemap, seasonal moment band, barbell welcome). Test suite: 29/29 across 4 files. SW at v58.

### Ratified queue (in order — D-040/D-039 hold the detail)
1. **D-040 2a hooks, rolling:** odds on team detail + game prep; Ask Bar pre-filtered leaders link (v1.1); share cards odds-aware.
2. **D-040 3a:** default-theme polish pass (DESIGN.md defines "polished").
3. **D-039 2a:** trained rest-of-season projections replacing "last season × 17" in VBD — **deadline: before August draft season.** 2b similarity comps after. Track 3 authored narrative pending ratification.
4. **D-038 Track C:** theme-contract tightening (check-themes composed pairs) + inline-style→class migration folded into **CSP nonce work — which gates D-031 auth launch**.
5. **D-031 auth Phase 1:** all six gates DRAFTED (docs/auth-*.md); implementation blocked on nonce work + owner dev secrets/DB.

### Owner to-dos (nobody else can)
- Cloudflare WAF rate rule on /api/* (docs/ops-rate-limiting.md)
- Google Search Console: submit https://sportstrata.cc/sitemap.xml
- Post-push spot check: home moment band + welcome copy in incognito

### Still owed (small)
Mobile audit (session window-resize was blocked — use devtools device mode) · 1200×630 OG card images for the stubs · park-factor manual refresh (P2) · join-health baseline run (`node tools/join-health.cjs https://sportstrata.cc`).

### Working conventions for the next session
TEAM.md three-gate rule; lightweight process per owner; DESIGN.md is visual law; live-verify every wave on sportstrata.cc post-push; SW CACHE_NAME bump per deploy (next: v59); commit via the Node/plumbing workaround (memory: sportstrata-commit-workaround); tests + checkers via /deploy-check.

---

### D-040 2a Hook 1 — October Odds on team detail (Playoff Odds hero stat) — SHIPPED (pending push)
**Contributor:** Vera / Kael / Axiom / Finn | **Date:** 2026-07-05

First of the four D-040 2a "one dataset, many surfaces" hooks. October Odds (D-039 2c) lived only in standings; it now surfaces as a **Playoff Odds** item in the MLB team-detail header bio grid.

**Gate 1 — Vera (behavioral) ✅** Job-to-be-done: a fan on a team page learns "are they making October?" without a trip to standings. States: *default* shows OCT% beside Record/PCT/GB; the header paints before the sim lands, so the slot is simply absent until odds fill in on one in-place re-render; **absent beats broken** — partial standings (<24 teams), offseason, no remaining games, or any fetch failure omits the item entirely (never an error on the team page). Threshold ≥75% green, <5% muted. Receipt: title tooltip "Playoff odds · 4,000 simulated seasons · {time}". No false precision (>99 / <1 via `_oddsFmtPct`). Color is reinforcement, not the only signal (value + "Playoff Odds" label carry it). Mobile inherits the responsive bio grid.

**Gate 2 — Kael (visual, vs DESIGN.md) ✅** Extends the existing `player-bio-item` pattern — no new component. Value in Barlow (`--font-display`); thresholded green borrow (`--color-win`) is the sanctioned semantic-trio use; it is a value color, not a border state (border=identity holds). OCT% only in the header (DIV% stays a standings-table detail — the headline a fan checks is "do they make October"). No new token. Watch item: verify green-on-light contrast in review.

**Gate 3 — Axiom (feasibility) ✅** No architectural change. New `_mlbTeamOddsBio(teamId)` reads `AppState.mlbOdds.byTeam[teamId]`. `showMLBTeamDetail` gains a guarded post-render hook mirroring the standings hook (`mlb.js` loadMLBStandings): lazily `fetchMLBStandingsFull()` if absent (MEDIUM cache) → `_mlbOddsEnsure` (30-min memo + DAILY schedule cache) → replace `.player-detail-header` in place, guarded on `location.hash === #mlb-team-{id}`. typeof-guards keep mlb.js decoupled from odds.js load order. Reuses the standings odds engine + `_oddsFmtPct` → **no new external fetch (no Relay gate), no user input (no Cipher surface)**. Cost on first team visit: one cached standings fetch.

**SHIPPED 2026-07-05 (pending push).** `js/mlb.js`: `+_mlbTeamOddsBio`, `+`Playoff Odds bio item, `+`guarded odds-ensure/in-place header re-render in `showMLBTeamDetail`. No CSS file touched (reuses `player-bio-item` + tokens). SW v58 → v59 (mlb.js is precached). `node --check` clean, 0 NUL bytes. Odds core unchanged; full suite green.
**Live verify after push:** open a contender's page (e.g. `#mlb-team-119`) → "Playoff Odds" appears in the header bio within ~1s, value matches that team's OCT% in standings; a cellar team reads "<1"; tooltip shows sim time; offseason/pre-season shows no odds item and no error.
**Follow-ups (remaining D-040 2a hooks):** Ask Bar pre-filtered leaders link (v1.1); odds-aware share cards; game-prep division-swing line (needs a conditional-sim spike — log separately, not a quick display hook).

---

### NFL/MLB ticker — no-scores placeholder rode the marquee under the SCORES pill — FIXED (pending push)
**Contributor:** Kael (visual) / Axiom (fix) / Finn (repro) | **Date:** 2026-07-05

Reported: in NFL offseason the ticker's placeholder ("No NFL scores — season runs Sep–Feb") overlapped the "SCORES" pill. Root cause: `tickerScroll` transforms `#scoreTicker` by −50% of its full flex width; with a single short placeholder item that dragged the element ~450px left, over the pill. MLB had the identical latent bug (hidden in-season). Fix: toggle `.ticker--idle` (`animation:none; transform:none`) whenever the ticker shows only the placeholder, in both `updateNFLTicker` and `updateMLBTicker`; new rule in `css/ticker.css`. NHL/NBA share the pattern but were left untouched (preview surfaces). Commit `2d89bf7`, SW v60.
**Live verify after push:** switch to NFL in offseason → placeholder sits cleanly after the SCORES pill, no overlap; in-season MLB ticker still scrolls normally.

### NFL landing page — season-aware `nfl-home` view — SHIPPED (pending push)
**Contributor:** Vera / Kael / Axiom / Finn | **Date:** 2026-07-05

Reported: the NFL switcher dumped users straight onto NFL Scores; no designed arrival. Built a dedicated `nfl-home` and routed `switchSport('nfl')` to it (D-040 Front-Door pattern, NFL edition).

**Gate 1 — Vera (behavioral) ✅** JTBD: "I switched to NFL — where do I go?" Season-aware. Offseason: hero = "NFL Draft Season · N days to kickoff" + Mock Draft / Draft HQ / Leaders chips; games section titled "Upcoming Games". In-season: hero = "{season} Season" + Scores/Standings/Leaders chips; games titled "This Week". States: games row shows a skeleton then fills; **absent beats broken** — if the scoreboard is empty or the fetch fails, the whole games section is removed, never a broken shell. Quick-access tiles (always present, no data dependency) cover all eight NFL surfaces. First-visit welcome line (once per browser).

**Gate 2 — Kael (visual, vs DESIGN.md) ✅** Reuses the existing home vocabulary only — `home-container`, `home-welcome`, `home-moment`/`hm-*` hero, `home-today`/`home-section-hdr`, native `games-grid` cards (`_createNFLGameCard`), and `home-feature-item` tiles. No new component, no new token, no new CSS. Accent kicker, receipts-style plain copy, no hype adjectives. Text-forward tiles (title + desc) render clean without icons.

**Gate 3 — Axiom (feasibility) ✅** New `loadNFLHome()` + `_nflKickoffDate()`/`_nflDaysToKickoff()` in `nfl.js`; four wire-ups in `navigation.js` (brandConfig defaultView → `nfl-home`; `_renderNFLView` case; `_loadFromHash` nflViews for `#nfl-home` deep links; `_NAV_META` breadcrumb). Reuses `fetchNFLScoreboard` (existing `/api/nfl`, cached) → no new external fetch, no CSP change. typeof-guarded, re-render guarded on `currentView`. Commit adds SW v61 (precached JS changed). Suite green (odds/stats/query/vbd), manifest + themes clean.
**Live verify after push:** click the NFL switcher → lands on NFL Home (not Scores); offseason hero shows the kickoff countdown; tiles route correctly; `#nfl-home` deep link works; MLB switcher unaffected.

---

### D-041 Phase 0 — SEO quick wins — SHIPPED (pending push)
**Contributor:** Folio / Kael / Axiom | **Date:** 2026-07-05

No-architecture-change items from D-041. **Social cards:** five on-brand 1200×630 OG images generated (`assets/og-default|mock-draft|draft-kit|playoff-odds|ask.png`); `index.html` had **no `og:image` at all** — added it plus `twitter:card: summary_large_image` + twitter title/desc/image; the four stubs upgraded from the 192px icon + small card to their per-page 1200×630 card + large card. **Structured data:** `Organization` + `WebSite` JSON-LD on the shell; `WebApplication` (free, SportsApplication) JSON-LD on each stub — all parse-validated. **Sitemap:** lastmod refreshed + changefreq/priority hints (real expansion is gated on Phase 1 path URLs — no crawlable content URLs exist to add yet). SW v62→v63 (index.html precached). check-manifest + check-themes green.
**Live verify after push:** `curl -s https://sportstrata.cc/ | grep -E 'og:image|summary_large_image|ld\+json'` shows the tags; paste a link into the X/Slack/iMessage preview debuggers → large card renders, not the icon.

### D-041 Phase 1 prep — URL contract + edge-render design (for Relay + Axiom sign-off)
**Contributor:** Relay / Axiom (draft for consensus) | **Date:** 2026-07-05

Per D-041, Phase 1 needs Relay + Axiom sign-off on the URL contract before implementation. Draft below — **not yet accepted**.

**Proposed path URL scheme** (id-first for stable resolution, slug for keywords):
- MLB player: `/mlb/player/{id}/{slug}` (e.g. `/mlb/player/592450/aaron-judge`)
- MLB team: `/mlb/team/{abbr}` (e.g. `/mlb/team/nyy`)
- MLB leaders / standings / scores / game: `/mlb/leaders/{category}`, `/mlb/standings`, `/mlb/scores`, `/mlb/game/{gamePk}`
- NFL mirror: `/nfl/player/{id}/{slug}`, `/nfl/team/{abbr}`, `/nfl/leaders/{category}/{season}`, `/nfl/standings`, `/nfl/scores`
- Glossary (Phase 2 content): `/glossary/{term}`
- Existing stubs keep their clean paths.

**Edge-render approach (Axiom):** a Cloudflare Pages Function on the content routes returns ONE HTML for all clients — server-injected `<title>`/description/canonical(self)/og:image/JSON-LD (`Person` for players, `SportsTeam` for teams, `Dataset`/`ItemList` for leaderboards) **plus a real prerendered content snapshot** (key stats as HTML so JS-less crawlers — Google + AI bots — get content), then boots the existing SPA which hydrates to the matching state. No UA sniffing (avoids cloaking; the deprecated dynamic-rendering path). Reuses existing `/api/*` proxies + edge cache for the data fetch.

**Open questions to resolve before build:**
1. **Routing model:** migrate the SPA to History API path routing, or keep hash routing in-app with path URLs only as crawlable entry points that set SPA state on load? (Affects `navigation.js` `navigateTo`/`_loadFromHash` scope.) — **Axiom**
2. **Team key:** `{abbr}` vs `{id}/{slug}` — abbr is cleaner but the alias drift (`_MLB_ABBR_ALIASES`) must map. — **Relay**
3. **Data + TTL per template** at the edge (which fields, which cache bucket). — **Relay**
4. **Canonical/duplicate-content:** every hash route must `rel=canonical` to its path URL; confirm one canonical per entity. — **Folio**
5. **Sitemap generation:** build-time script over the data vs edge-generated `/sitemap-*.xml` (players/teams likely need index sitemaps). — **Relay + Axiom**
6. **og:image:** static default for Phase 1; per-entity dynamic cards (edge-generated from the shareCard template) as a fast-follow. — **Kael**

**Sign-off needed:** Relay (URL contract, data/TTL, sitemap source) + Axiom (routing model, edge Function architecture) before Phase 1 implementation begins. Then two flagship templates first — MLB player + MLB team.

---

### D-041 Phase 1 — open questions resolved + first slice (MLB team) SHIPPED (pending push)
**Contributor:** Relay / Axiom / Folio / Finn | **Date:** 2026-07-05

Resolutions to the six Phase 1 prep questions (Relay + Axiom sign-off):
1. **Routing model:** keep hash routing in-app; add path URLs as **additive** crawler entry points via edge Functions that set `window.__SS_ROUTE`, honored once in `_loadFromHash`. No History-API migration — lowest risk, no core rewrite.
2. **Team key:** `{abbr}` (statsapi abbreviation, lowercased), resolved to team id at the edge from the cached `/teams` list.
3. **Data + TTL:** teams list `cf.cacheTtl 3600`; rendered page `cache-control max-age 300`.
4. **Canonical:** the path URL is the entity's canonical; in-app hash nav is transient and fine.
5. **Sitemap:** add the 30 team URLs **after live-verify**; data-driven generation deferred.
6. **og:image:** static default for Phase 1; per-entity edge-generated cards a fast-follow.

**First slice — `functions/mlb/team/[abbr].js`:** fetches the team from statsapi, pulls the real SPA shell via `env.ASSETS`, injects per-team `<title>`/description/canonical/OG/twitter/`SportsTeam` JSON-LD + a crawlable `<h1>`/snapshot into `#playersGrid` + a `window.__SS_ROUTE` hint; returns one HTML to all clients (no UA sniff). **Fail-safe:** any error returns the untouched app (or a redirect), so a broken render can't dead-page. Fully additive: `/mlb/team/*` is a brand-new route, nothing links to it yet, existing traffic untouched. SW v63→v64 (navigation.js precached).
**Live verify after push (before wiring links/sitemap):** `curl -s https://sportstrata.cc/mlb/team/nyy | grep -E '<title>|canonical|SportsTeam|__SS_ROUTE'` shows Yankees meta; loading `/mlb/team/nyy` in a browser boots the SPA straight to the Yankees page; a bad abbr (`/mlb/team/zzz`) falls back to the app, not a 500.
**Next once verified:** extend to MLB player (`/mlb/player/{id}/{slug}`), then add team + player URLs to the sitemap; NFL mirror; glossary content pages (Phase 2).

---

---

## D-042 — NCAAF + sport-agnostic front door — GATED task entry (specs below, implementation on owner ratification)

Single linked task per the three-gate rule. Gates DRAFTED; Finn does not begin until D-042 is owner-ratified. Sequencing P1→P4 per the decision.

### Gate 1 — Vera: JTBD + behavioral spec ✅ DRAFTED
**Job (home):** a returning visitor arriving at `/` in any month should, in one glance, (a) see what's live right now, and (b) reach any of the three sports in one click — without the site pretending a dormant sport is as urgent as an in-season one. Two jobs, two zones: the seasonal hero answers "what should I look at today"; the sport-picker band answers "take me to my sport."
**Job (NCAAF):** a college-football follower wants scores, their conference's standings, the current polls, and a team's page — the reference spine, not a fantasy tool (no CFB fantasy in scope).
**States — sport-picker band:** each sport card renders one of `live` (games in progress — pulsing status dot + score count), `today` (games scheduled today, none live), `in-season-idle` (season active, no games today — next-game date), `offseason` (dormant — "Season starts {date}" using the sport's season model). Card always navigable to that sport's default view regardless of state. Loading = three skeleton cards (existing skeleton language). Fetch failure for one sport's status = that card falls back to `offseason`-style static copy, never blocks the other two or the page.
**States — NCAAF views:** each of Scores / Standings / Teams / Rankings needs loading (skeleton), empty (offseason "Season starts {date}" — reuse the unified `.nfl-offseason` component from P3-029, generalized), error (view-level retry), and populated. Standings + Teams are **conference-grouped** (collapsible conference sections; remember expanded state within the session). Rankings shows poll selector (AP / Coaches / CFP when available — CFP only appears in-season once released; hide, don't empty, when absent).
**Home default behavior change:** home stops force-selecting MLB. `_applySportUI` on home renders a neutral brand state; the picker band is the sport entry point. Deep links and in-sport nav unchanged.
**Accessibility:** picker cards are real links/buttons with `aria-label="{Sport} — {status}"`; status dot is not the only signal (text label too); conference section toggles use `aria-expanded`; poll selector is a labeled control with keyboard support.

### Gate 2 — Kael: visual spec ✅ DRAFTED (against DESIGN.md)
**Front door.** The default dark theme is the brand (DESIGN.md 3a) — no new theme. Hero unchanged in spirit from D-040 1a (leads with in-season sport). New **sport-picker band** sits below the hero: three equal cards in a responsive row (stack on mobile), each = sport icon + wordmark-scale label + a status line, one-line CTA. Card accent comes from a per-sport `--sport-accent` custom property from the `SPORTS` registry (MLB orange-gold stays the master brand accent; NFL and NCAAF get restrained identity tints — **border channel = identity, badge/dot = state**, the K2 rule). Live state = pulsing dot + `--shadow-live` glow, never a colored border swap. No "coming soon" tiles. The band reads as one family with the existing card system (reuse card tokens, radii, shadows) — not a marketing carousel.
**NCAAF surface.** Sport-agnostic reuse of existing `.team-*` / standings / card component families (the P3-030 sport-agnostic team family and the D-029 standings cards). Conference grouping uses the section-header language already in standings. CFP/AP poll rankings render in the leaders/standings visual idiom (rank badge = gold top-4 per the receipts/badge vocabulary). No NCAAF-specific colors beyond the one identity tint; team-color accents come from the team's own color via `--team` + `color-mix` (P3-030 pattern), no hardcoded hex.
**Identity rule (DESIGN.md):** wordmark never themed; the brand icon may vary by active sport (the icon-may-change / wordmark-never rule from D-038). Confidence flag: not screenshotted against live — sign-off is against current source + token system; run `/screenshot` post-implementation before final visual sign-off.

### Gate 3 — Axiom: feasibility ✅ DRAFTED
**`SPORTS` registry (P1, pure enabler).** New registry object (home in `navigation.js` or a small `config.js` addition) keyed by sport id: `{ id, label, icon, brandSub, defaultView, accent, hasFantasy, tickerFetch, seasonModel }`. Refactor `switchSport` (its inline `brandConfig` + the mlb/nfl/nhl `if/else` fetch+ticker chain) and `_loadFromHash`'s `startsWith` sport detection to derive from the registry. Behavior-preserving — no visible change, own commit, `/screenshot` + `node --check`. This is the D-026 recommendation finally built; it's what makes sport #3 (and #4) cheap.
**NCAAF data + views (P2).** `functions/api/ncaaf.js` clones `functions/api/nfl.js`: host `https://site.api.espn.com/apis/site/v2/sports/football/college-football`, path allowlist (`/scoreboard`, `/standings`, `/teams`, `/rankings`), TTL-by-volatility, no keys, no D1, inherits `_middleware.js` rate limit. `js/ncaaf.js` (after `nhl.js` in the chain) defines `NCAAF_SEASON` (NFL auto-detect pattern), fetchers, and the four `_renderNCAAFView` renderers; `renderCurrentView` gains a `view.startsWith('ncaaf-')` branch. **Conference is the one new shape** — a grouping key on standings/teams; no new architecture, just a group-by. Add `js/ncaaf.js` + `css/ncaaf.css` to `index.html` AND `sw.js` STATIC_ASSETS (manifest checker #10 fails otherwise) + bump SW version.
**Front door (P3).** Home renders the picker band from the registry; drop the `_applySportUI('mlb')` hard default in `loadHome` (D-042 amends the CLAUDE.md rule — intended change). Per-sport status = one lightweight scoreboard probe each (SHORT TTL), failure-isolated per card.
**Routing (P4 deferred).** No path routing in this work — NCAAF stays on `ncaaf-*` hash views; path URLs fold into D-041's contract later. Confirmed no collision with D-041 as long as NCAAF doesn't invent its own paths now.
**Verification:** `node --check` on every touched JS file; `/screenshot` per nav-touching phase; manifest + theme checkers green; `/deploy-check` before push; NUL-byte scan (this tree has a corrupted-write history).

### Gate — Relay: data / API contract ✅ DRAFTED
ESPN college-football public API mirrors the NFL feeds already in production. Confirmed-shape endpoints for Phase-1 scope: `/scoreboard` (with `?groups=` for conference/week filtering), `/standings`, `/teams`, `/rankings` (AP/Coaches/CFP polls). **Conference model:** ESPN exposes conference groupings on team + standings payloads — that's the join key for the conference-grouped views; FBS vs FCS must be filtered (Phase 1 = FBS). **Deferred with cause:** player season stats / leaders — ESPN's CFB player endpoints are inconsistent and sparse across the full program set; shipping them would break the "correct math, visible provenance" spine. Revisit if a clean CFB stats source appears (same bar as the NFL nflverse decision, D-018). Caching by volatility per D-019: scoreboard SHORT, rankings/standings MEDIUM, teams LONG; past weeks immutable → long edge cache.

### Gate — Cipher: security ✅ VERIFIED (no work required)
CSP unchanged — `site.api.espn.com` (connect-src) and `a.espncdn.com` (img-src) already allowlisted in `_headers` and the `index.html` meta tag; NCAAF adds no new external host. `/api/ncaaf` inherits the D-033 rate limit by living under `/api/`. No new user-input surface; existing `_escHtml` discipline covers the new team/conference name space going into `innerHTML`. Sign-off stands as long as no new fetch host is introduced during implementation (if one is, both CSP sites must update together — D-034 doc-sync).

### D-042 Resolution 3 — SHIPPED (pending push) 2026-07-06
Owner ratified Resolution 3 (front door). Shipped P1 (SPORTS registry refactor, behavior-preserving), P2-slice (`js/ncaaf.js` + `functions/api/ncaaf.js`: season model, offseason-aware `ncaaf-scores` landing, ESPN CFB proxy, routing + nav), P3 (home sport-picker band, MLB hard-default dropped → `_applySportUI('home')`). SW v67→v68. **Verification:** `node --check` clean (5 JS files); 29/29 unit tests; manifest checker green; NUL scan clean; CLAUDE.md doc-synced. **Owed:** `/screenshot` live-verify after push. **Remaining (not built):** NCAAF Standings/Teams/Rankings (P2 remainder, routed to offseason state); NCAAF into D-041 path contract (P4). Full detail in DECISIONS.md D-042 update 2026-07-06.

### D-042 P2 remainder (Rankings/Standings/Teams) — SHIPPED (pending push) 2026-07-06
`js/ncaaf.js`: Rankings (poll tabs AP/Coaches/CFP + movement), conference-grouped Standings (season selector) + Teams, all reusing `.standings-*`. New `functions/api/ncaafstandings.js` (site.web.api tree — the site.api standings feed is a stub, per D-029). Nav expanded. SW v68→v69. **Verify:** node --check clean, 29/29 tests, manifest green, NUL clean. **Owed:** live shape check via `/api/ncaafstandings?season=2025&debug=1` after push (web_fetch was down at build time — parser is defensive/recursive but the exact CFB tree depth is unconfirmed); `/screenshot` visual pass. Full detail: DECISIONS.md D-042 update 2026-07-06.

---

---

## D-044 — Cross-sport frame parity (player + team detail + chrome) — GATED, phased (specs in DECISIONS.md D-044)

Owner scope: NCAAF = investigate ESPN athletes (feasible — see D-044 Relay finding); surfaces = full frame. Phased P1→P5; each phase gated before Finn implements.

### Relay probe result (NCAAF players) ✅ FEASIBLE
ESPN core API 2025 CFB leaders fully populated (passing/rushing/receiving/defense); athlete→statistics join **by ID** (no name-match). Rosters give bio + ~30% headshots, no stats. Gaps: depth-player stats thin, headshots sparse → empty states + initials fallback. Refs must be **server-resolved** (Pages Function, like /api/nflstats). Supersedes D-042's blanket player deferral.

### P1 — Extract the shared frame + refactor NFL player detail (reference impl)
- **Kael** ⏳ frame spec: name `.player-detail-*` / `.player-hero` / `.stats-card` / `.detail-section-*` as DESIGN.md house classes; sport adapts stat colors + radar axes.
- **Axiom** ⏳ `renderDetailFrame(config)` builder + generalize `StatsCharts` (radarProfile/gameTrend/careerTrend); migrate NFL player detail off inline styles/back-button (D-038 K3 "NFL first"). Data already exists — no new fetches. Screenshot parity vs MLB.

### P2 — NCAAF player data layer (Relay contract + Axiom) — new `/api/ncaafathlete` + `/api/ncaafstats` (core-API server-resolved, ID-join, volatility cache).
### P3 — NCAAF players + player detail (shared frame) + Leaders view; routes ncaaf-players / ncaaf-player-{id} / ncaaf-leaders + nav.
### P4 — Team detail parity (unify NFL `.team-*` P3-030 + MLB team detail + new NCAAF team detail).
### P5 — Shared view chrome (breadcrumbs/tabs/containers) + a11y pass (Vera + Kael).

**Status:** D-044 pending owner ratification. P1 gates drafted above; nothing built yet.

---

---

## D-045 — Path-URL SEO foundation + per-sport landing pages — GATED, phased (specs in DECISIONS.md D-045)

Owner ratified: real-URL per-sport pages (`/mlb` `/nfl` `/ncaaf`) that are BOTH the SEO entry point and the in-app landing; full path-URL foundation (ratifies D-041 Option A). Landing pages ship first as the flagship. Each phase gated before Finn implements.

### P0 — SEO quick wins (no routing change; can start now)
- **Folio + Axiom** ⏳ og:image on shell; JSON-LD Organization/WebSite(+SearchAction) on shell; expand sitemap.xml. Independent of everything else.

### P1 — Per-sport landing pages on real URLs (flagship)
- **Relay** ⏳ URL contract: `/mlb` `/nfl` `/ncaaf` landing + hash↔path canonical/redirect map.
- **Axiom** ⏳ one Cloudflare Pages Function: prerendered shell + meta/JSON-LD + content snapshot → hydrates the SPA; no build step; SPA untouched.
- **Kael** ⏳ clean per-sport landing: one hero (sport identity) + seasonal strip + 3–4 primary entry cards, nothing else ("not too busy" = acceptance test).
- **Vera** ⏳ landing JTBD + states; meaningful **without JS** (crawler + first paint); a11y.
- **Folio** ⏳ per-page title/desc/canonical/OG + JSON-LD (WebPage/BreadcrumbList); sitemap adds the 3 pages.
- **Cipher** ⏳ redirect allowlist (no open redirect); CSP intact; no secrets.

### P2 — Extend edge-render to content templates (player/team/leaders/standings) — thousands of indexable pages. (Relay + Axiom + Folio)
### P3 — Search Console verify/submit; measure indexed count / impressions / share CTR; iterate. (Folio + owner)

**Status:** D-045 pending owner ratification of scope + P1 go-ahead. Relay + Axiom URL-contract consensus required before P1 build. P0 may proceed in parallel. Nothing built yet.

---

---

## D-046 — Homepage overhaul (analytics-first landing) — GATED, phased (specs in DECISIONS.md D-046 + docs/landing-page-gap-analysis.md)

Owner: **ad-free** (drop the doc's ad slots/upsell); scope **P1–6**. Restructure + elevate — reuse `/api/news`, MLB live-card states, favorites (IndexedDB), the per-sport ticker. Analytics-first, not an ESPN clone. Each phase gated before Finn implements.

### P1 — Live game states + ticker live parity (highest ROI; MLB in-season, live-testable)
- **Vera** ⏳ UPCOMING/LIVE/FINAL states; LIVE = score+inning/half+outs+base-state+win-prob; live-region a11y.
- **Kael** ⏳ live treatment (accent pulse/badge, live cards front-sorted, no CLS).
- **Axiom** ⏳ ≤30s polling (reuse liveGame.js infra); ticker shows live inning state, not just finals.
- **Relay** ⏳ live data contract (score/inning/outs/base/win-prob) + TTL.

### P2 — Data-Story hero (fixes "no focal point")
- **Vera** ⏳ selection logic (live-leverage → marquee → anomaly; no-games fallback). **Kael** ⏳ hero visual (generated graphics + logo lockups, no photos; passes all themes). **Axiom** ⏳ render; search moves below hero.

### P3 — Headlines + Insights rail (fills the dead right side)
- **Relay** ⏳ headlines from /api/news (relative ts) + templated Insights bullets from the stat engine. **Kael** ⏳ rail layout.

### P4 — Density/hierarchy + freshness pass (mostly CSS)
- **Kael+Vera** ⏳ 4–5 visual weights; Pennant Races → viz module; sport-status cards → pills; "Updated Nm ago" everywhere; CLS < 0.1.

### P5 — Favorites MVP (localStorage) — star → persist → reorder ticker+grid + weight hero + "My Team" headlines tab. **Cipher** ⏳ no-PII.
### P6 — Home SEO edge-render (prerender today's games+headlines into `/`) + sport-agnostic ticker schema. **Axiom+Folio** ⏳.

**Status:** D-046 pending owner ratification of phasing. Ads dropped (owner). P1 gates draft next; nothing built yet.

---

