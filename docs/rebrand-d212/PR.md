# Ink + Ice, part 1 of 3: palette and Strata S mark (D-212)

**Base:** `origin/main` at `dafeb61` (chore: refresh sitemap.xml).

This removes black + orange from the whole site. It changes how pages look, not what they do: no change to fetches, routes, or the Stories pipeline, and nothing under `content/` or `.github/` is touched. Parts 2 (flat surfaces, one spacing/radius/type scale, Inter + JetBrains Mono, unified components) and 3 (one icon style, dead code and asset removal) follow as separate branches.

## Token diff

| Token | Before (dark) | After (dark) | After (light) |
|---|---|---|---|
| `--bg-base` | `#0d1014` | `#070b16` ink | `#f2f7fc` |
| `--bg-surface` | `#14181d` | `#0f182a` | `#ffffff` |
| `--accent` | `#ff7a00` | `#4cc9f0` ice | `#0b6f91` (5.7:1 on white) |
| `--text-primary` | `#f5f7fa` | `#f2f7fc` | `#070b16` |
| `--text-muted` | `#8a93a3` | `#8fa3bf` | `#4a5a73` |
| `--text-on-accent` | `#0f172a` | `#070b16` (10.2:1 on ice) | `#ffffff` |
| `--color-pct` | `#fb923c` orange | `#a3e635` lime | |

Borders, tints, header, table and toast surfaces now come from ink and text instead of navy and orange. Win, loss and live stay the same.

## Other color changes

- Every orange-family stat, chart, pitch-type, line and categorical color in JS and CSS now uses a non-orange hue.
- Team color tables are data. They are fenced with `ss-team-colors:start/end` and keep their real colors.
- All seven `SPORTS_META` accents are now `var(--accent)`, so every sport uses one accent.
- `StatsCharts` now resolves a `var()` color passed to a canvas chart.
- Export palettes (mock-draft card, stat share card, Highlight Card, `/api/og`) keep fixed hex values on purpose, now Ink + Ice.
- The five standalone pages (`ask`, `draft-kit`, `mock-draft`, `pickem`, `playoff-odds`) and `404` moved to ink and ice. The 404 gradient text is now solid ice.

## Mark

- The Strata S comes from the owner's PNG, committed as `assets/brand/strata-s-1080.png`.
- `assets/icon.svg` and `assets/brand/strata-s.svg` transcribe the PNG's measured bar geometry; nothing was redrawn by hand.
- All icon PNGs (64/192/512, maskable), `apple-touch-icon`, `favicon.ico`, the new `favicon-16/32.png` and the five static OG cards are rendered from the PNG.
- The header logo is still an `<img>`, because the tribute theme swaps it. It now points at `icon.svg`.
- The wordmark is one text-colored SPORTSTRATA everywhere: header, boot splash, standalone pages and export cards.

## Removed

- The orange flame logos: `assets/PrimaryLogo.PNG`, `SecondaryLogo.PNG` and `SportsStrata.png`, the last of which misspelled the brand.
- The four orange wordmark SVGs in `assets/brand/`.
- Dead two-tone wordmark rules: `.brand-name__accent`, `.brand span b` (×3 pages), `.brand b` (404) and `.hcs-wordmark .accent`.
- None of these was referenced from code; checked with `git grep`.

## Guards

- `tools/check-orange.cjs` flags orange-family colors (hue 12–40°, saturation ≥ 0.45). `tests/inkIce.test.js` runs it with a planted-fault case and requires zero hits outside team-color fences.
- `tools/check-themes.cjs` now holds the brand themes to 4.5:1 for three more pairs: accent on surface, ink on ice, and muted on base.

## Verified

- `node --test tests/*.test.js`: 639 pass, 0 fail.
- `check-orange`: zero hits.
- `check-themes --strict`: 0 errors. One warning predates this branch (the nl-monarchs tribute theme).
- `check-manifest`: 0 failures.
- `node --check` passes on every changed JS file. No NUL bytes.
- Checked by eye in Chrome against a local server with live upstreams:
  - home at desktop and mobile width, in dark and light;
  - NFL standings;
  - a live NCAAB game;
  - a production story page with this branch's CSS.
- Mobile check: the uppercase wordmark first overflowed the header by 2px at 485px. It was resized to fit the old footprint; scroll width now equals client width.

## Screenshots (`docs/rebrand-d212/`)

`before-home-desktop.png` (production) · `home-desktop.png` · `home-mobile.png` · `home-light.png` · `nfl-standings.png` · `live-game.png` · `story.png`

## Not done here

- Dynamic `/api/og` cards still render in Barlow. Fonts change in part 2.
- The service worker is bumped to `v365`. Open PR #219 is on `v363`, so there's no collision today; recheck before merging.
- Edge-rendered pages (stories, team and player paths) were checked with production HTML and this branch's CSS, not under `wrangler pages dev`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
