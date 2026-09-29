# SportStrata Stories (NFL) — Design

**Date:** 2026-09-29 · **Status:** design approved in brainstorm, awaiting spec review · **Decision:** D-166 (to be recorded in DECISIONS.md when implementation lands)

## Problem

Traffic is minimal. The site's only editorial surface is ESPN's news feed (`/api/news`), which every other site also carries, so it earns no search presence and no links. What SportStrata has that nobody else publishes is its own computed data: Power Rankings movement (D-163 prior-blended SRS), leverage, strength of schedule, advanced/NGS efficiency, Sleeper trends — now guarded nightly by the contract monitor.

## Goal

Acquisition. Publish a small number of original, data-driven NFL stories per week that are (a) crawlable pages that can rank over time and (b) built around one number worth citing, so Reddit threads, beat writers and fantasy communities link to them. Links build the domain authority that later lets the pages rank.

## Non-goals and hard rules

- **Not news.** No injury, trade, signing or roster reporting — an agent has no sources and would only be rewriting ESPN. The ESPN feed stays as the breaking-news wire, relabeled "Wire · via ESPN".
- **No invented numbers, ever.** Every number in a published story traces to a committed facts file. A mechanical checker enforces it.
- **No volume play.** 0–4 stories per run. Mass-produced AI pages are exactly what Google's scaled-content spam policy targets.
- **No runtime LLM on the site.** Stories are static committed files; nothing calls a model when a visitor loads a page.
- **Human review of every story** before publish (merge = publish), at least until the checker has a track record.
- NFL only for v1. NBA/NCAAB are a second wave once the format proves itself.

## Vendor decision (D-166)

Story drafting runs as a scheduled **Claude Code** routine that opens PRs. This is a **scoped exception** to the 2026-08-08 "Gemini is the one LLM vendor" decision (recorded in `worker/broadcast-blurb.js`): that decision was about not maintaining a second vendor credential on the site, and this adds none — no key, no runtime call, no Anthropic dependency in anything the site serves. Site runtime generation (Broadcast Blurb) stays Gemini. Chosen because story-finding needs agentic exploration (many tool calls, reading data, choosing angles), which a single API prompt cannot do; the deterministic detectors and the checker, not the model, remain the accuracy guarantee.

## Architecture

```
Mon 09:00 ET / Tue 09:00 ET  (cloud routine via /schedule)
  1. node tools/contract-check.cjs  (NFL contracts; any fail → stop, no PR)
  2. node tools/stories/detect-nfl.cjs → .stories-work/packets/*.json   (no model)
  3. agent reads PLAYBOOK.md + existing stories' frontmatter (dedup) + packets
  4. agent writes 0-4 stories: content/nfl/stories/<date>-<slug>.{md,facts.json,social.md}
  5. node tools/stories/check-numbers.cjs <story>  (≤2 self-fix attempts, else drop)
  6. gh pr create "Stories: NFL Week N (Mon|Tue)"
Owner: ~10 min review → merge publishes
Edge:  functions/nfl/stories/[slug].js renders /nfl/stories/<slug>; /nfl/stories index
```

**Dependency:** step 1 requires the contract monitor (PR #1) to be merged.

## Components

### 1. Detectors — `tools/stories/detect-nfl.cjs` (Node, zero deps, no model)
Fetch from production `/api/*` (same routes the contract monitor guards) and emit fact packets (synthetic example):

```json
{ "id": "pwr-mover-2026-w04-det",
  "kind": "power-rankings-mover",
  "headline_fact": "DET rose 9 spots to #3",
  "numbers": { "rank_now": 3, "rank_prev": 12, "delta": 9, "rating": 6.4 },
  "context": { "team": "DET", "week": 4, "season": 2026 },
  "sources": ["/api/nfl?path=/scoreboard&dates=...", "computeSRS (js/powerRankings.js)"] }
```

v1 detector set (~5), each built on data already computed on the site: Power Rankings week-over-week movers; efficiency outliers from `/api/nfladv` (NGS, 2016+); Sleeper trending adds cross-checked with usage from game logs; strength-of-schedule swings (`/api/nflsos`); score-margin/leverage extremes from the week's finals. Detectors that need `computeSRS` load `js/powerRankings.js` the same way `tests/powerRankings.test.js` does (vm context), not a copy. Packets are written to a gitignored `.stories-work/` directory; only the facts a story actually uses are committed (in its `.facts.json`).

### 2. Playbook + style — `tools/stories/PLAYBOOK.md`, `tools/stories/STYLE.md`
Selection: novelty (not already covered this season — dedup against committed frontmatter), a single citable number, relevance to this week. Zero stories is a valid outcome. Content rules: the hard rules above; numerals always; attribute every stat; one idea per story; 300–450 words; headline states the finding, dek is one sentence. Byline "SportStrata Data Desk"; every story ends with: *"Written with AI assistance from SportStrata's own data. Every number above links to its source."* The agent may fetch additional data, but every number it uses must be written into the story's `.facts.json` with its source route.

### 3. Story files — `content/nfl/stories/`
- `<yyyy-mm-dd>-<slug>.md` — frontmatter (`title`, `dek`, `date`, `teams: [DET]`, `players: []`, `hero_stat`, `week`, `season`) + a restricted Markdown body: paragraphs, `##` headings, `-` lists, `**bold**`, `[text](url)`. No raw HTML.
- `<same>.facts.json` — every number used, each with `value` and `source`.
- `<same>.social.md` — a Reddit-appropriate version (value first, link last, no link-only posts) and an X version. Not rendered on the site.

### 4. Number checker — `tools/stories/check-numbers.cjs` (zero deps)
Extracts every numeric token from title, dek, body and social drafts: integers, decimals, percentages, `.900`-style rates, `9-of-10` / `9 of 10`, ordinals (`3rd`, `#3`). Each must match a value in the facts file after normalization (`90%` ≡ `0.9` ≡ `.900`; `9 of 10` → parts `9`, `10`; `#3` ≡ `3rd` ≡ `3`). Allowlist: dates, the frontmatter `season` and `week`. Spelled-out numbers above "one" are rejected outright. Exit 0 pass / 2 fail with each offending token and its location. Runs in CI on any PR touching `content/`.

### 5. Edge rendering — `functions/nfl/stories/[slug].js` and `functions/nfl/stories/index.js`
- Fetch the `.md` via `env.ASSETS`, parse frontmatter, render the body with a small hand-written renderer (~60 lines) that escapes all text and emits only the allowed subset.
- Per-story `<head>`: title, description (dek), canonical, `NewsArticle` JSON-LD (`headline`, `datePublished`, `author: {Organization: SportStrata Data Desk}`), `og:image` = `/api/og?eyebrow=NFL · Week N&title=<title>&stat=<hero_stat>` (D-128 renderer).
- Sets `window.__SS_ROUTE = 'static-page'` (see §6) so the SPA leaves the rendered story in place.
- Fail-safe to the plain shell on any error, like every other template. `/nfl/*` is already in `_routes.json`.
- Index: newest-first list with dek and date, `ItemList` JSON-LD.

### 6. `static-page` route hint (shipped first, separately)
Live bug found during design: `/glossary` shows the **home page** to human visitors — the edge function injects the glossary snapshot, then the SPA boots to `home` and overwrites `#playersGrid` and `<title>` (confirmed in a real browser 2026-09-28). `/nfl/glossary` uses the same pattern. Fix: `_loadFromHash` treats `__SS_ROUTE === 'static-page'` as "render header/nav chrome only; do not touch `#playersGrid` or `document.title`." Both glossary functions set it. Stories reuse it. Shipped as its own PR before any story work.

### 7. Discovery and internal links
- `tools/gen-sitemap.cjs` reads `content/nfl/stories/*.md` directly (no API) and adds each story + the index.
- Home Headlines rail: a "SportStrata Stories" block (latest 3) above the ESPN list, which is relabeled "Wire · via ESPN". The rail reads a small committed `content/nfl/stories/index.json` (regenerated by the routine in the same PR) rather than listing the directory at runtime.
- NFL team pages link stories whose frontmatter `teams` includes that team (from the same `index.json`).
- NFL landing (`/nfl`) links the stories index.

### 8. The routine — created with `/schedule`
Cloud routine (no browser needed — public APIs + repo), prompt = "follow `tools/stories/PLAYBOOK.md`". Runs Mon 09:00 ET and Tue 09:00 ET. Opens a PR titled `Stories: NFL Week N (Mon|Tue)` whose body lists each story's headline, dek, hero stat, and any dropped candidates with the reason. Never pushes to `main`, never merges.

## Error handling

- Contract check fails → routine stops, no PR (logged in the routine run).
- A detector throws or returns nothing → that detector is skipped; other packets still flow. All detectors empty → no PR.
- Checker fails after 2 self-fix attempts → story dropped, reason listed in the PR body.
- Edge render error (missing file, bad frontmatter) → fail-safe to shell; a missing slug returns the shell with HTTP 404.
- The routine opening a PR with 0 stories is not allowed — no PR instead.

## Testing

- `tests/stories.test.js` (node:test): renderer escapes everything and renders only the allowed subset (script tags, raw HTML, `javascript:` links all neutralized); checker accepts each supported format and rejects unmatched numbers, spelled-out numbers, and out-of-allowlist dates; frontmatter parser edge cases; each detector against a committed fixture.
- `static-page` hint: verified live on a preview deploy — `/glossary` keeps its content and title after the SPA boots.
- Publishing end to end: one hand-written story merged on a preview deploy before any detector or routine exists.
- Added to `ci.yml` and `/deploy-check` test lists; CLAUDE.md Key Files + Deployment updated in the same commits (doc-sync rule).

## Rollout (each ships on its own)

1. `static-page` hint + glossary fixes (separate PR, now).
2. Renderer, story + index Functions, checker, one hand-written story, home rail + ESPN relabel, sitemap.
3. Detectors with fixtures.
4. Playbook/style + the scheduled routine (after PR #1's contract monitor is merged).

## Open questions (resolve in implementation)

- Whether `env.ASSETS.fetch` serves `.md` / `.json` from `content/` with usable content types on the git-integrated Pages build — confirm on a preview deploy in rollout step 2.
- Raw `.md` / `.facts.json` are publicly reachable at their static paths. Treated as acceptable (a public record of each story's numbers); revisit if it causes duplicate-content signals (could add `X-Robots-Tag: noindex` for `/content/*` in `_headers`).
