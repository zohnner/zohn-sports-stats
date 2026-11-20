# Ink + Ice, part 3 of 3: one icon set, dead code out (D-212)

**Base:** stacked on part 2 (`rebrand/ink-ice-system`). Merge parts 1 and 2 first.

This changes how pages look, not what they do: no fetch, route or Stories-pipeline change.

## What changed

- **Icons.** Every UI glyph (✓ ✗ ★ ☆ ♥ ✕) is now an `_iconSvg` icon from the one stroke/currentColor set. The new shapes are `check`, `x` and `heart`. Clipboard share text keeps its emoji, since emoji are the format there.
- **Dead JS.** The pre-D-161 NBA Leaderboards and Standings pages are removed. `js/leaderboards.js` and `js/standings.js` keep only `_buildPillControl` and `_parseStreak`, the two functions with live callers; every other symbol was checked for references first.
- **Dead CSS.** 35 rules that no JS, HTML or Function references are removed: old NBA player-detail per-36, advanced and shooting cards, an old waffle footer, and unused animation utilities. Classes built dynamically were excluded from the scan.
- **Dead assets.** 12 unreferenced third-party theme logos are removed. They're recoverable from git history, and the archive README says so.
- **Part 1 miss.**
  - A duplicate Chart.js token block later in `:root` still won, so dark-theme chart ticks and tooltips had stayed navy. It's removed.
  - A new test fails on any token defined twice in one theme block.
- **Old-palette leftovers** moved to Ink + Ice: text on the accent, export-card backgrounds, logo chips and the offline page.

## Left alone on purpose

- `js/players.js`: MLB's live search bar still calls its `setPlayerView` and `toggleFavFilter`.
- `css/themes-retired/`: kept as the D-047 archive.

## Verified

- **Tests:** 645 pass, 0 fail.
- **Other checks:** `check-orange` finds zero hits, `check-manifest` reports 0 failures, and `node --check` passes on every changed JS file. No NUL bytes.
- **In Chrome:**
  - MLB Leaderboards pills render (9).
  - The search close button is the SVG icon.
  - `_parseStreak` and `_buildPillControl` still exist; `loadLeaderboards` is gone.
  - No JavaScript exceptions.
- **Service worker:** cache bumped to `v367` (part 2 is `v366`, part 1 `v365`).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
