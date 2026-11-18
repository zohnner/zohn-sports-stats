# SportStrata — Goals

> **"Serious stats for serious fans."**

This file says what SportStrata is for, what rules never bend, and what the next season of work is aiming at. It is short on purpose. History lives in `DECISIONS.md`. The previous version of this file (frozen 2026-09-14) is kept at `docs/archive/GOALS-2026-09-14.md` for its reasoning trail.

Last resynced: 2026-11-18, against `DECISIONS.md` through D-211.

---

## What SportStrata is

A free sports analytics site at [sportstrata.cc](https://sportstrata.cc) covering six live sports: MLB, NFL, NCAA Football, NCAA Men's Basketball, NBA and WNBA. One vanilla JavaScript app, no framework, no build step, hosted on Cloudflare Pages with edge-rendered pages for search engines.

Two things set it apart from a scoreboard site:

1. **Numbers you can check.** Every computed number shows where it came from. Stories carry a `.facts.json` with a source for every figure, a nightly contract check watches the upstream feeds, and an integrity audit plants faults on purpose to prove the checks catch them.
2. **Original data stories.** SportStrata Stories are written daily by a scheduled agent (Muse) from live data, number-checked before they publish, and never cover injuries, trades, rumors or quotes.

The original "two-season barbell" (MLB in baseball months, NFL fantasy in football months, ratified 2026-07-01) still describes the two strongest surfaces, but the site now runs year-round across six sports, so the calendar below replaces it as the planning frame.

---

## Rules that never bend

### The no-login experience must never regress (constitutional, ratified 2026-07-01)

Accounts (D-031) are **additive-only**. Every current capability stays available logged-out, forever. Sign-in may add things (follows, sync, league-aware tools); it may never gate what is free today. Any proposal that would violate this rule is out of scope until GOALS.md is re-ratified again.

### G1 — Speed & Reliability
Every view must render a useful state within **2 seconds** on a standard broadband connection.
Degraded/partial data is acceptable; a broken blank screen is not.

### G4 — Zero Friction (amended 2026-07-01)
The logged-out product has no login wall, no paywall, and full functionality — governed by the constitutional rule above.
Favorites, notes, and preferences save to `localStorage`; nothing leaves the browser unless the user explicitly shares a link or opts into an account (D-031, optional and additive-only).

### G5 — Maintainable Solo Codebase
No frameworks, no build step, no CI pipeline complexity.
Vanilla JS + CSS modules. Each sport is one file (or at most two).
The codebase should be readable by a future contributor in 30 minutes.

### Accuracy over volume
Fewer stats shown correctly beats many stats shown wrong. A number the site can't source doesn't ship, in the app or in a story.

### No trackers, no data sales, ever
Ads and sponsorships are permitted in principle (D-069) but deliberately on hold (D-151) until traffic clears a real threshold. Trackers and selling user data stay excluded permanently.

---

## Sport scope

| Sport | Status | Biggest gap (from the audit matrix, issue #190) |
|---|---|---|
| MLB | Flagship, full depth | None open. Offseason until spring training |
| NFL | Live | No team-season history for "first since 1999" checks (#148) |
| NCAA Football | Live | Team pages lack results and a game log (#167) |
| NCAA Men's Basketball | Live, thinnest | No team pages (#116), player pages (#117) or player game log |
| NBA | Live (D-161) | No Playoff Picture |
| WNBA | Live, offseason | No team page, no player game log, no Stories |
| NHL | Parked | Preview only. No work without an owner decision recorded here first |

Adding a seventh sport, or reviving NHL, needs an explicit owner decision. Measure nav capacity live before building; every sport added so far has caused a header overflow bug.

---

## The 2026–27 calendar

The sports calendar sets the deadlines. Dates are approximate and should be checked before anything is scheduled against them.

| When (approx.) | What happens | What SportStrata needs ready |
|---|---|---|
| Early–mid December | Conference championships, CFP selection, bowls begin | NCAAF team-page results (#167). The ranked-games list (#169) shipped 2026-11-18 |
| Mid December | Fantasy football playoffs | In-season fantasy tools working. Nothing new required |
| January – mid February | NFL playoffs and Super Bowl | NFL team-season history (#148) so Stories can verify historical claims |
| Mid February | MLB spring training | Confirm the MLB season rollover (D-206) |
| Mid March | Selection Sunday and the NCAA tournament | NCAAB team pages, player pages and game log, live and crawlable |
| Late March | MLB Opening Day | Stories back on MLB; refresh park factors (due April 2027) |
| April | NBA playoffs | NBA Playoff Picture |
| May | WNBA season opens | WNBA team page and Stories |

---

## Current priorities

In order:

1. **NCAAF before CFP selection:** ship #167, the only item left with a deadline inside a month. (#169, the ranked-games list on NCAAF and NCAAB Rankings, shipped 2026-11-18.)
2. **NCAAB before March:** team pages (#116), then player pages (#117), then the player game log. The tournament is NCAAB's biggest traffic window, and NCAAB has the most `no` cells in the audit matrix.
3. **NFL history before the playoffs:** #148, which also clears a group of open `derived-stat` issues.
4. **NBA Playoff Picture before April.**
5. **Keep the integrity layer green.** A red Contract Check or Integrity Audit is fixed before new features.

The scheduled parity run builds `[parity]` issues in +1 order (D-198). Where that order and this list disagree, this list wins for anything with a calendar deadline.

---

## How the work runs

- **Muse** (scheduled agent) writes Stories daily, one PR per sport, auto-merged when CI passes (D-187). It files `[muse-found]`, `[parity]` and `[derived-stat]` issues (D-197).
- **Parity / build run** (scheduled Claude Code) builds `[parity]` issues, one open PR at a time. The owner merges (D-198).
- **Desk run** posts one daily brief issue, read-only (D-202).
- **Audit run** (Mondays) looks for gaps and faults on purpose and files up to three `[audit]` issues (D-199).
- **The owner** merges every code PR. Nothing but Stories merges itself.

---

## Non-goals

- **Not a social platform.** No comments or user-generated content. Follows exist only as personal sync.
- **Not a betting site.** Odds appear as context only.
- **Not a native app.** The PWA covers mobile.
- **Not a real-time broadcast feed.** Polling is enough; no sub-second WebSocket feeds without a specific partnership.
- **No runtime LLM calls billed per reader** (D-039). Stories are written ahead of time and committed.

---

## Annual maintenance

- **Park factors (each April):** `_PARK_FACTORS` in `js/mlb.js`. Last refreshed 2026-07-31 (2023–2025 window). Next due April 2027.
- **NFL home fields (before each season):** re-check end zone paint in `content/nfl/fields/` against current photos (D-174).
- **wRC+ constants:** self-healing; optionally add the official FanGraphs entry when published to drop the dagger.
- **This file:** resync it whenever a sport changes status or a calendar deadline passes.
