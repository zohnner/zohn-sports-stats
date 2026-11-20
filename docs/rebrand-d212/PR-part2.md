# Ink + Ice, part 2 of 3: flat surfaces, two fonts, one scale (D-212)

**Base:** stacked on part 1 (`rebrand/ink-ice-tokens`, itself on `origin/main` at `dafeb61`). Merge part 1 first.

This changes how pages look, not what they do: no fetch, route or Stories-pipeline change.

## What changed

- **Flat surfaces.**
  - The `--blur-*` tokens are now `none`, and the two raw blurs are removed.
  - Card, header, mobile-nav, toast and waffle surfaces are solid.
  - Decorative gradients are flattened to their first color stop. This includes the team-color avatars built in JS.
  - The ambient body glow and the scanline texture are removed.
  - The skeleton loader pulses its opacity instead of sweeping a gradient.
  - Glows are removed: the accent shadow, the field-marker halos and the critical-moment text glow. Focus rings stay.
  - Gradients that encode data stay: legend scales, field markings, the sticky-column fill trick and the tribute theme.
- **Two fonts.**
  - Inter and JetBrains Mono only. `--font-display` and `--font-brand` are deleted, and their 78 usages moved to `--font-sans`.
  - `/api/og` renders in Inter. The Barlow TTFs were removed and Inter TTFs added.
  - Tables use tabular figures; prose keeps proportional ones.
- **One scale.**
  - One radius: `--radius` (8px) plus `--radius-full`. That covers 297 token usages and 169 raw values.
  - 974 font sizes are on the `--text-*` scale. New steps: `--text-2xs` and `--text-5xl`.
  - 1,867 padding, margin and gap lengths in `css/` are on the `--space-*` scale. New step: `--space-0-5`, a 2px hairline.

## Bugs found while verifying

- **Arial controls.** Buttons and inputs never inherited the page font, so any control without its own font rule rendered in Arial. The header wordmark showed it once the old display-font override was gone. Fixed with `button, input, select, textarea { font-family: inherit }`.
- **Contrast.** The ice buttons used white text, about 2:1. They now use `--text-on-accent`.
- **Freshness label.** The "Updated Xs ago" receipt had no default size or color. It now defaults to extra-small and muted.

## Verified

- **Tests:** 644 pass, 0 fail. The new `tests/designSystem.test.js` checks the type scale, radius, no-glass and two-font rules, including a planted fault.
- **Other checks:** `check-orange` finds zero hits, `check-themes --strict` reports 0 errors, and `check-manifest` reports 0 failures.
- **Overflow:** checked in Chrome on 9 views (home, NFL standings and stats, MLB standings, NBA leaders, NCAAB scores, NCAAF rankings, WNBA standings, Arcade) at 1366px and at phone width. No horizontal overflow, and no element uses a fallback font.
- **Screenshots:** `docs/rebrand-d212/part2/`.

## Not done

- Raw spacing inside JS inline `style=` strings.
- A per-component markup rewrite across sports. The token passes give them one treatment, but their HTML wasn't restructured.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
