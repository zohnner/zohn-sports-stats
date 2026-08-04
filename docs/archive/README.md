# Archived Documentation

Everything here is superseded, fully actioned, or historical — kept for reference,
not for a future session to treat as current guidance. Cross-check anything below
against `CLAUDE.md`, `DECISIONS.md`, and `ISSUES.md`, which are the live sources
of truth.

Moved here 2026-07-01 (D-034) so future sessions don't ingest superseded or contradictory guidance:

- `fixit.md` — improvement prompts; everything in it (skeletons, hash routing, service worker) shipped long ago.
- `suggestions.md` — pre-dates the project's constraints; recommends React Query/JSX, which violate the no-framework rule.
- `reflection.md` — a stray meta-prompt, not project documentation.

Added since (this index re-synced 2026-08-05 — it had drifted out of date with what was actually in this folder):

- `ISSUES-shipped.md` — moved out of `ISSUES.md` 2026-07-26 (D-048-era housekeeping) to keep the active backlog readable. Shipped/historical issue entries, retained verbatim.
- `MLB_STATS_ROADMAP.md` — early MLB stat-expansion roadmap. Most of what it lists has since shipped (see `MLB_LEADER_CATS` in `js/mlb.js` and the leaderboard/Statcast surfaces in CLAUDE.md).
- `ROADMAP.md` — an early project roadmap ("Focus: MLB broadcast & analytics... no new investment until MLB depth goals are met"). Superseded by NFL beta (D-012/D-014) and NCAAF (D-042) both later being promoted to active development — treat `DECISIONS.md` as current on sport scope, not this file.
- `analysis.md` — an early "Claude Code Improvement Specification." Historical; largely actioned.
- `deep-review-2026-07-01.md` — point-in-time review; recommendations actioned via D-038/D-039/D-040 and `DESIGN.md`.
- `design-review-2026-07-02.md` — point-in-time review; same disposition as above.
- `landing-page-gap-analysis.md` — July 12 home-page gap analysis vs. ESPN. Its roadmap (hero module, live game states, headlines/insights rail, freshness signals, favorites, SEO/footer) was actioned via D-046 P1–P6 and D-041/D-045.
- `relay-deep-dive-2026-06-08.md` — Relay's June 8 data-architecture audit. Point-in-time; cross-check current state against CLAUDE.md's Data Sources section before treating any finding as still open.

If you're tempted to read one of these for "what should I build next," don't — check
`GOALS.md` and `DECISIONS.md` instead. These are here so nothing is silently lost,
not so it can be silently re-actioned as if it were still an open task.
