# SportsStrata — Live Game Expanded View
## Feature Documentation

**Version:** 1.0  
**Feature Area:** Scores Tab  
**Inspired by:** MLB At Bat / Gameday  

---

## Overview

The Live Game Expanded View is a full-panel overlay (or dedicated page section) that opens when a user clicks on any in-progress game card in the Scores tab. Rather than showing just the score and inning, this view transforms the game card into a rich, real-time game-tracking experience comparable to MLB's Gameday feature — covering the current at-bat, pitch tracking, linescore, play-by-play log, and live box score.

This is SportsStrata's highest-engagement surface for live games. The goal is to give a user everything they need to follow a game without a broadcast — pitch by pitch, play by play.

---

## Entry Point & Layout

**Trigger:** Clicking a live game card in the Scores tab expands it in-place (accordion style) or opens a modal/drawer overlay.  
**Exit:** An "X" or collapse control returns the user to the standard scores list.  
**Layout:** Two-column on desktop, single-column stack on mobile.

**Left Column (primary):**
- Current at-bat header
- Strike zone / pitch plot
- Pitch sequence log (current at-bat)
- Base runner diagram

**Right Column (secondary):**
- Linescore
- Game situation summary
- Tabbed section: Play-by-Play | Box Score | Matchup Stats

---

## Sections

---

### 1. Game Header Bar

Persistent across the full view. Stays visible at all times.

| Element | Description |
|---|---|
| Team matchup | Away @ Home, with logos |
| Live score | Current score, bold and prominent |
| Inning indicator | "Top 3rd", "Bot 7th", etc. with arrow (▲ / ▼) |
| Count | Balls–Strikes–Outs (e.g. `2-1 | 1 Out`) |
| Status badge | `LIVE` pulse indicator or `FINAL` / `DELAYED` / `POSTPONED` |
| Last updated | Subtle timestamp or "Live" tag confirming data freshness |

---

### 2. Current At-Bat Module

The centerpiece of the live view. Updates after every pitch.

#### 2a. Matchup Display
- **Batter:** Name, position, team, current game stats (AVG / OBP / OPS or H-AB line for today)
- **Pitcher:** Name, handedness (L/R), today's line (IP, H, R, ER, BB, K, ERA entering game)
- Subtle avatar placeholder (initials in circle, team-colored)
- Career batter vs. pitcher line (if available via API): e.g. `4-for-12, 1 HR`

#### 2b. Strike Zone / Pitch Plot

A visual representation of the strike zone with plotted pitch locations for the current at-bat.

- **Zone:** Rendered as a rectangle scaled to standard MLB strike zone proportions
- **Pitches:** Each pitch plotted as a colored dot at its location when crossing the plate
- **Color coding by pitch result:**
  - 🔵 Ball
  - 🔴 Called Strike
  - 🟠 Swinging Strike
  - 🟢 Foul
  - ⚪ In Play
- **Pitch number label:** Each dot labeled with pitch sequence number (1, 2, 3…)
- **Hover / tap on dot:** Tooltip shows pitch type, velocity, count at time of pitch
- **Pitch type legend** below the zone diagram

> **Data source:** `MLB Stats API` — `/game/{gamePk}/playByPlay` returns `pitchData.coordinates` (pX, pZ) and `details.type.description` for each pitch in the current at-bat.

#### 2c. Pitch Sequence Log (Current At-Bat)

A horizontal or vertical list of pills/chips representing each pitch in the current at-bat:

```
[1] 97mph FF — Ball  |  [2] 89mph CH — Called Strike  |  [3] 95mph FF — Foul  |  [4] ...
```

Each chip shows: pitch number, velocity, pitch type abbreviation (FF, SL, CH, CU, SI, etc.), result.

---

### 3. Base Runner Diagram

A diamond SVG showing occupied bases, updated live after each play.

- Each base corner is a filled square; **occupied bases highlighted** in team accent color
- Display number of outs (3 dots, filled = outs recorded)
- Optionally show runner names on hover/tap

---

### 4. Linescore

The classic inning-by-inning run grid, styled like a broadcast overlay.

```
         1  2  3  4  5  6  7  8  9   R  H  E
KC       0  0  2  0  1  0  -  -  -   3  7  1
CHC      0  1  0  0  0  0  -  -  -   1  5  0
```

- Current inning column highlighted
- Unfilled innings shown as `-` or blank
- R / H / E totals pinned to the right
- Scrollable horizontally on mobile for extra innings

---

### 5. Game Situation Summary

A compact row of contextual callouts displayed beneath the linescore:

| Field | Example |
|---|---|
| Current Pitcher | Salvador Pérez battery: Brady Singer (95 pitches) |
| Pitching Change | "Singer replaced by Bubic — 6th inning" |
| Scoring Play Alert | "Royals score on Witt Jr. sac fly — 3-1" |
| Win Probability | Away 34% · Home 66% (if data available) |
| Weather | 72°F, Wind 8mph Out to CF (for outdoor games) |

---

### 6. Tabbed Supplemental Panel

Three tabs beneath the main left-column content:

---

#### Tab A: Play-by-Play

A scrollable chronological log of all plays and notable pitches in the game.

Each entry shows:
- Inning half (▲3 / ▼5)
- Play description: e.g. *"Bobby Witt Jr. singles on a ground ball to left field. MJ Melendez scores."*
- Score at time of play (if run scored)
- Home run indicator 💥 for HR plays

Format: reverse-chronological (most recent at top), grouped by half-inning with collapsible headers.

> **Data source:** `/game/{gamePk}/playByPlay` — `allPlays[].result.description`

---

#### Tab B: Box Score

Standard box score layout, two halves: batting and pitching.

**Batting table (per team):**

| Player | AB | R | H | RBI | BB | K | AVG |
|---|---|---|---|---|---|---|---|
| Witt Jr., SS | 3 | 1 | 2 | 1 | 1 | 0 | .298 |

- Players listed in lineup order
- Substitutes shown in italics below starters
- Bold rows for active batter

**Pitching table (per team):**

| Pitcher | IP | H | R | ER | BB | K | ERA |
|---|---|---|---|---|---|---|---|
| Singer, W (4-2) | 5.2 | 5 | 1 | 1 | 2 | 7 | 3.12 |

- W/L/S/H/BS designation shown inline
- Pitch count in a subtle column or tooltip

> **Data source:** `/game/{gamePk}/boxscore`

---

#### Tab C: Matchup Stats

Context-rich stats for the current batter vs. pitcher matchup. Refreshes on each new at-bat.

**Batter season splits (vs. RHP / LHP)**  
**Pitcher season splits (vs. RHH / LHH)**  
**Head-to-head history (career):** AB, H, HR, AVG, OPS  
**Pitch arsenal for current pitcher:** For each pitch type — usage %, avg velo, whiff %, BA against

This tab is the most analytically differentiated part of the feature, giving SportsStrata an edge over casual score trackers.

---

## State Management

| State | Behavior |
|---|---|
| **Pre-game** | Show probable pitchers, lineups if posted, weather. No zone/pitch data yet. |
| **Live — between pitches** | Hold last pitch state; poll for updates every 5–10 seconds |
| **Live — between at-bats** | Reset pitch zone; show result of last AB; update linescore |
| **Live — between innings** | Show inning break indicator; keep linescore and box score current |
| **Pitching change** | Flash "Pitching Change" banner; update pitcher module |
| **Scoring play** | Flash score update; append to play-by-play |
| **Final** | Freeze all data; replace `LIVE` badge with `FINAL`; stop polling |
| **Delayed / Suspended** | Show reason if available; pause polling or poll at reduced interval |

---

## Data Sources (MLB Stats API)

All endpoints use the base URL: `https://statsapi.mlb.com/api/v1`

| Data | Endpoint |
|---|---|
| Live game state, score, count, runners | `/game/{gamePk}/linescore` |
| All plays + pitch-by-pitch | `/game/{gamePk}/playByPlay` |
| Box score | `/game/{gamePk}/boxscore` |
| Game feed (combined, most complete) | `/game/{gamePk}/feed/live` |
| Batter/pitcher season stats | `/people/{personId}/stats?stats=season&group=hitting` |
| Career vs. pitcher | `/people/{personId}/stats?stats=vsPlayer&opposingPlayerId={pitcherId}` |

> **Proxy note:** All requests should be routed through the existing Cloudflare Worker proxy to avoid CORS issues. The `feed/live` endpoint is the most comprehensive single-call option but is heavier — consider using it as the primary poll and supplementing with lighter endpoints for specific data as needed.

---

## Polling Strategy

```
Live game:       poll /feed/live every 8–10 seconds
Between innings: poll every 20 seconds
Pre-game:        poll every 60 seconds
Final:           stop polling
```

Use `linescore.currentInning` + `linescore.inningState` to detect state changes and trigger UI updates. Diff incoming data against current state to animate only changed elements (score, count, new pitch).

---

## UX / Interaction Notes

- **Pitch zone animation:** New pitch dots should animate in (fade + scale) rather than appearing instantly
- **Score change:** Flash the updated score briefly (subtle highlight pulse) when runs score
- **Play-by-play new entry:** Slide-in from top when a new play is appended
- **Tab memory:** Remember the last-active tab per game session so returning doesn't reset the user
- **Mobile behavior:** Stack vertically; pitch zone stays near the top; linescore scrolls horizontally; tabs collapse to a swipe carousel or select dropdown
- **Loading state:** Show skeleton loaders for each section independently so the UI is usable before all data loads
- **Error state:** If API call fails, show "Unable to load live data — retrying…" without crashing the whole view

---

## Visual Design Guidance

- Background: dark card surface (consistent with SportsStrata's existing dark theme)
- Strike zone: white outline on dark field; pitch dots use high-contrast team or result colors
- Base diagram: minimalist SVG diamond, filled bases in team accent color
- Linescore: monospace or tabular-nums font for alignment; active column slightly highlighted
- Typography hierarchy: score is largest, count is secondary, supplemental stats are tertiary
- Team colors: pull from existing team color map already in SportsStrata

---

## Future Enhancements (Post-MVP)

- **Gameday 3D–style pitch trajectory:** Animate the ball path from release to plate (requires Statcast release point data)
- **Heat map view:** Overlay all pitches in the game (not just current AB) as a density heat map
- **Exit velocity / launch angle:** Show Statcast data for batted balls in play-by-play entries
- **Win probability chart:** Line chart of home team win probability across all plays
- **Social share card:** "Snap" of the current game state (score, inning, play description) formatted for Twitter/X
- **Push notifications (if PWA):** Scoring play and pitching change alerts

---

*Document prepared for SportsStrata Claude Code handoff. Implement expanded view within the existing Scores tab architecture using vanilla JS and the Cloudflare Worker proxy.*
