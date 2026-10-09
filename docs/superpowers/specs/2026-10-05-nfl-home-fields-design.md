# NFL Home Fields — Design

**Date:** 2026-10-05 · **Status:** approved design, spec under owner review · **Decision:** D-number assigned at merge (re-check `origin/main` + open PRs for collisions first)

## Problem

The NFL live game field viewer (`_nlgFieldViewerHtml`, `js/nflLiveGame.js`; D-105, D-148) draws one generic field for every game. Its midfield logo renders far too large: `.fv-mid-logo` is sized from the field's width (`width: 26%; max-width: 130px`) while `.fv-field3d` has a fixed height (240px, 190px ≤640px). Measured from the projection constants, the logo covers ~95% of the sideline-to-sideline depth at midfield on desktop (130px of ~137px) and ~86% on a 421px phone (~93px of ~108px). It also stands upright facing the camera on a tilted ground plane, so it reads as a sticker, not turf paint. The flat `.fv-centerlogo` rule documents this exact mistake and its fix; D-148 reintroduced it.

The root cause behind every logo workaround in the file is `preserveAspectRatio="none"`: the SVG draws in a fixed 1000×400 space and is stretched non-uniformly to its box. That stretch is why logos warped into ovals inside the SVG (D-148), why they were moved out to HTML `<img>` overlays, and why those overlays are sized in units that don't match the field.

A second structural problem: the whole SVG (~40 static elements that never change during a game) is rebuilt by `innerHTML` every poll, and `_nlgAnimateFieldMotion` fakes continuity with stashed positions (`_nlg.fvLastPositions`/`fvPendingPositions`) because no element survives between polls. SVG ids (`fvHatch`, `fvBallSheen`, `fvRzClip`, `fvBallG`, ...) are page-global and the motion code queries `document.querySelector('.fv-field3d-svg')`.

## Goal

Differentiation. Every NFL game shows a field that represents the home team's actual field: real end zone paint, turf type, mow pattern, midfield art, and border color. A fan should recognize Lambeau, Arrowhead or Lumen Field at a glance. Competitors draw a generic field (to the best of our knowledge; not systematically surveyed).

## Decisions (owner, 2026-10-05)

| Question | Decision |
|---|---|
| Fidelity | **C** — recognizably theirs in SportStrata's visual language (colors, end zone text in our display font, turf, mow, midfield, border) now; a `signature` slot for replica-level detail at select venues later, only where licensing is confirmed. No official team fonts. **Amended 2026-10-08 (owner):** end zone lettering may use a free lookalike font per team (`endzones.<side>.font`, a fixed style set mapped to Google Fonts) plus real outline colors (`outline`, `outline2`), each sourced like any paint fact. |
| Neutral-site games | **C** — a generated neutral field by default; upgraded per game when a researched profile exists. Never present an invented field as real. |
| Launch bar | **A** — ship only when all 32 team fields are researched and approved. |
| Interim logo fix | **None.** The oversized-logo bug stays live until this ships. |
| Review strictness | **A** — owner checks every field against a photo. |
| Architecture | Content files + committed generated index (the Stories pattern), with the renderer rebuild in scope. |
| End zones | Both painted the home team's way, as real fields are. The away team keeps a small logo badge at the goal line it defends. |

## Verified upstream facts (live, 2026-10-05)

- `/scoreboard` `competitions[0]` carries `neutralSite` (bool) and `venue.{id, fullName, indoor}`. No `grass` field.
- `/summary` (what the game page loads) carries `header.competitions[0].neutralSite`, `gameInfo.venue.{id, fullName, grass}`. Confirmed on event 401872965 (IND vs WSH, Tottenham Hotspur Stadium, venue 5534, `neutralSite: true`, `grass: true`, designated home WSH).
- ESPN venue names are stale (venue 3891 reports "Reliant Stadium", renamed 2014). Names come from our profiles, never ESPN.

## 1. Field profile (data model)

One file per real field, keyed by venue + home team, under `content/nfl/fields/`:

- `<venue-slug>--<team>.json`, e.g. `lambeau-field--gb.json`. Shared venues get one per tenant (`metlife-stadium--nyg.json`, `metlife-stadium--nyj.json`, SoFi likewise): 32 files for 30 venues.
- Researched neutral-site games: `content/nfl/fields/neutral/<espnEventId>.json` (painted per game).

Profile fields (visual facts only):

| Field | Type | Notes |
|---|---|---|
| `venueId` | string | ESPN `gameInfo.venue.id` — the lookup key with `homeTeam` |
| `homeTeam` | string | ESPN abbreviation |
| `name` | string | Our venue name |
| `surface` | `natural` \| `artificial` \| `hybrid` | Renderer maps type → house turf palette; no per-team greens |
| `mow` | `stripes-5` \| `stripes-10` \| `checker` \| `none` | |
| `endzones.left` / `endzones.right` | `{ fill, text, textColor }` | Display sides (left = away goal side, per existing `disp()`); `text` e.g. `"GREEN BAY"` / `"PACKERS"` |
| `midfield` | `primary-logo` \| `alt-logo` \| `wordmark` \| `none` | `alt-logo`/`wordmark` carry an image URL |
| `border` | color | Apron around the playing field |
| `signature` | array | Empty in v1. Reserved for fidelity-C detail |

Each profile has a sibling `<name>.facts.json` mapping every attribute path → `{ source, photo, checked, confidence: high|medium|low }`, plus a top-level `approved: { date }` written by the review gallery.

## 2. Renderer

New `js/fieldViewer.js`, loaded immediately before `js/nflLiveGame.js` (update `index.html` and `sw.js` `STATIC_ASSETS` together; bump the cache version). API:

```js
const fv = FieldViewer.mount(hostEl, { profile, home, away, venueLabel });
fv.update(situation);   // every poll
fv.destroy();
```

- **Pixel-space projection.** Drop `preserveAspectRatio="none"`. A `ResizeObserver` measures the host; the projection (same fractional constants as today's `_FV`) runs against the real width/height so 1 SVG unit = 1 CSS px. Logos and text live inside the SVG undistorted; the HTML `<img>` overlays (`.fv-ez-logo`, `.fv-mid-logo`) and their sizing workarounds are deleted.
- **Static layer** — turf (surface palette + mow pattern), border, yard lines, numbers, hashes, pylons, goalposts, both painted end zones, midfield art, away defended-goal badge. Built on mount; rebuilt only on a real size change (debounced). Never on poll.
- **Dynamic layer** — ball, scrimmage line, first-down line, red zone, play arrow: persistent elements whose positions/attributes change per poll, animated by CSS transitions. `_nlgAnimateFieldMotion` and the stashed-position bookkeeping are deleted. Distance-scaled glide (`_nlgGlideDuration` range 220–640ms), 4th-down pulse, first-down-earned flash, turnover flash, timeout-dot flash, and `prefers-reduced-motion` behavior carry over unchanged.
- **Midfield art** — placed at the projected midfield point and foreshortened by the local projection (affine over ~12 yards is accurate); ~12 yards wide.
- **End zone text** — per-glyph layout along each end zone's depth axis: each letter at its projected point, scaled by local perspective, so text reads as paint on the ground.
- **Instance-scoped ids** — every `<defs>` id prefixed per instance; all queries scoped to the instance root.

**Risk / first task:** per-glyph perspective text at the 421px phone width, where the far end of an end zone is only a few px deep. Prototype it (throwaway) before anything else. Fallback if illegible: draw end zone text only over the near half of each end zone. Report before building on it.

## 3. Data flow, fallbacks, failure

Lookup at mount, first match wins:

1. `neutralSite` and `neutral/<eventId>` exists → researched neutral profile.
2. `neutralSite` → generated neutral field: neutral turf, both end zones in the designated home team's colors + name, ESPN venue name as a small caption.
3. `<venueId>--<homeAbbr>` → researched team profile.
4. Otherwise → generated field from team colors (`getTeamColors`), ESPN logo, abbreviation, `indoor`. Covers mid-season relocations and index-fetch failure.

`content/nfl/fields/index.json` (sources stripped) is fetched once per session and cached `ApiCache.TTL.DAILY`. The first paint never waits on it: render (4), then rebuild the static layer once when the index arrives. Missing/failed images are omitted; the field stays complete. If an `alt-logo`/`wordmark` host is not CSP-allowlisted, update both `_headers` and the `index.html` CSP meta.

**Drift detection** — add a `fields` contract to the nightly contract monitor (`tools/contracts/`):
- every venue id ESPN reports for a non-neutral home game this season has a profile;
- ESPN `gameInfo.venue.grass` agrees with `surface` (`natural`/`hybrid` ⇔ grass).

End zone repaints cannot be detected from any feed. **Recurring task:** re-check all 32 photos before each season (owner + agent, via the gallery).

## 4. Research, review gallery, launch gate

**Research.** Agent researches fields in home-schedule order. Each facts file requires: ≥1 photo from a **current-season** home game (paint evidence must be current), source + checked date + confidence per attribute, an official team/venue source for `surface` where one exists (ESPN `grass` recorded as a cross-check). Conflicting sources → record both, mark `low`.

**Review gallery** — `tools/fields/gallery.html`, local only (`tools/` is private per D-168). Per field: the real `fieldViewer.js` render, the source photo beside it (hotlinked; a link if the host blocks it), the fact list with low-confidence facts highlighted, and an Approve control that writes `approved` into the facts file via a small local helper (or prints a one-line command to run). Sorted by low-confidence count. All 32 require approval regardless.

**Launch gate** — `node tools/fields/build-index.cjs --check` in CI fails when: fewer than 32 team profiles, any unapproved, any unsourced attribute, any schema violation, or a stale `index.json`. Neutral profiles are validated only when present. Work stays on `feat/nfl-home-fields` until the gate passes.

## 5. Testing, rollout, scope

**Tests**
- `tests/fieldViewer.test.js` — pixel-space projection at 421/773/1148px (1 unit = 1px; yard lines meet sidelines), the four-step lookup incl. neutral and missing-index, glide duration, per-glyph layout (glyphs inside the end zone polygon, shrinking with depth). Projection/layout are pure functions with no DOM access, tested like `tests/powerRankings.test.js`.
- `tests/fields.test.js` — `build-index` and `--check` against fixtures: valid, unsourced, unapproved, schema-invalid, stale index.
- Both added to `/deploy-check`'s test list and the CLAUDE.md test command.

**Visual verification** — record one completed 2026 game's `/summary` + `/scoreboard` situations as fixtures; replay through the new renderer in real Chrome at 421/773/1148px and confirm ball, lines, red zone land where the current renderer puts them (parity proves the rebuild is visual-only). Plus: a dome, MetLife as NYG and NYJ, a neutral game, a forced fallback, reduced motion, light theme. After deploy, verify on production during a real game.

**Rollout** — one PR, mergeable only when the gate passes. Same commit: DECISIONS.md entry, CLAUDE.md doc-sync (Key Files, script load order, deploy-check test list, replace the field-viewer description in the `js/nflLiveGame.js` entry), `index.html` + `sw.js` + cache version.

**Out of scope** — the `signature` detail tier; porting NCAAF's flat viewer onto `fieldViewer.js` (enabled by the shared renderer, but 130+ venues is its own research project); an interim logo fix (declined); Lottie/Rive celebration animations.

**Cost** — the oversized-logo bug stays live until all 32 are approved. Research is estimated at several working sessions and owner review at ~1–2 hours spread across them (unverified estimates; actual pace reported after the first batch).
