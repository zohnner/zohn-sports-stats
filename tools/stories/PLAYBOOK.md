# SportStrata Stories — Drafting Playbook

Standing instructions for the scheduled drafting agent (Muse). Read this file at the start of every run. Decisions: D-166 (NFL stories), D-171 (MLB extension), D-177 (this routine).

## Hard rules (D-166, non-negotiable)

- **Not news.** No injuries, trades, signings, quotes, or rumors. Only analysis computed from data. The checker rejects the obvious words (injury, IR, MRI, surgery, traded, signing, free agent, reportedly, press conference, quoted passages) in every field, with no override. A false hit gets rephrased. Passing it does not make a story analysis.
- **Every number** in the title, dek, hero_stat, body, and social copy must appear in the story's `.facts.json` with its source route. The checker enforces provenance only — it cannot tell when a sourced number supports a false or misleading claim. Correctness of claims is on you.
- **0–4 stories per run. Zero is valid. Never pad.**
- **Small samples get named as small samples.** ("3 games is 3 games.")
- Byline "SportStrata Data Desk" and the AI-assistance disclosure are rendered by the template (`story-core.cjs`); do not add them to the `.md`.
- Merge to main = publish. The owner reviews and merges every story. You never merge.

## Preflight (run first; stop and report to the owner if any fail)

1. `node --version` works.
2. `git fetch origin` — branch from a fresh `origin/main`.
3. Verify **each** `/api/*` route the run will need — do not assume. Since 2026-10-13 ESPN refuses all Cloudflare-egress requests (D-176): the sportstrata.cc ESPN proxies (`/api/nfl`, `/api/ncaaf`, `/api/*standings`, `/api/*stats`, `/api/*athlete`, `/api/news`, `/api/nflplayer`, `/api/nflgamelog`) still fail server-side even though the site's browser fallback works for visitors. Routes that don't touch ESPN (`/api/nfladv` nflverse, `/api/mlb` statsapi) should work — verify anyway.
4. `node tools/stories/build-index.cjs --check` exits 0 on the fresh tree.

## Data sources while the ESPN proxies are blocked (D-176/D-177)

You don't run on Cloudflare, so ESPN doesn't block you. For any number whose sportstrata.cc route is down, fetch ESPN directly and cite **the exact ESPN URL you fetched** as that fact's source in `.facts.json`:
- `site.web.api.espn.com/apis/site/v2/sports/{league}/...` — scoreboard, summary, news, teams
- `site.web.api.espn.com/apis/v2/sports/{league}/standings`
- `site.web.api.espn.com/apis/site/v3/sports/{league}/leaders?season=YYYY&seasontype=2` — **always pass `seasontype=2`**; without it v3 silently returns postseason leaders once a postseason exists
- `sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/...` — athletes, stats

Rules: prefer a working sportstrata.cc route whenever one exists (it's the site's own data and the better citation). The checker only requires `source` to be a non-empty string — it does not validate the format — so direct ESPN URLs pass. Never invent a URL: cite the exact URL you fetched. If a needed number is unreachable from both the site and ESPN directly, drop the angle.

## Run procedure

1. Fetch `origin/main` fresh. Create branch `stories/YYYY-MM-DD`.
2. Explore the past week through `sportstrata.cc/api/*`: NFL standings, scores, `nflstats`, `nfladv` (Next Gen Stats), `nflsos`, Sleeper trends, power rankings, plus MLB postseason games while any were played that week.
3. **Prove every angle before writing.** Rank the candidate across the whole league, find the next-closest value, check the base rate. If it's only "interesting" without a comparison that holds up, drop it.
4. Dedup: read committed stories' frontmatter first — no repeating an angle already covered this season.
5. Write each story as three files (format below), matching the samples' frontmatter and structure exactly. In `.social.md`, the `## X` section must be ≤280 characters **including the story URL**.
6. `node tools/stories/check-numbers.cjs <story.md>` on each story, then `node tools/stories/build-index.cjs`, then `node tools/stories/build-index.cjs --check`. Fix a failing number **at its source** or drop the story. **Never edit a fact to make a sentence pass.**
7. **File fence:** change only `content/{nfl,mlb}/stories/**` (including each `index.json`). If anything else needs changing (tool bug, broken API route), don't touch it — note it in the PR body or tell the owner.
8. Zero surviving stories: no branch, no PR. Log a one-line run summary.
9. Otherwise push and open **one** PR titled `Stories: week of YYYY-MM-DD`.

## Story files

- `<yyyy-mm-dd>-<slug>.md` — frontmatter + restricted Markdown body (paragraphs, `##` headings, `-` lists, `**bold**`, `[text](url)`). No raw HTML.
  - NFL frontmatter: `title`, `dek`, `date`, `season`, `week`, `teams: []`, `players: []`, `hero_stat`.
  - MLB frontmatter: same minus `week`; optional digit-free `round` (e.g. `ALDS`) feeds the eyebrow.
- `<same>.facts.json` — `{"facts": [{"key", "value", "label", "source"}]}`. Every number used, each with value and source route. Write every number you use into this file **as you draft**, not after.
- `<same>.social.md` — `## Reddit` (title + value-first body, link last) and `## X` (≤280 chars incl. URL).

## Number checker notes (what it does and doesn't do)

- Extracts numeric tokens from title/dek/hero_stat/body/social: integers, decimals, percentages, `.900`-style rates, `9-of-10`/`9 of 10`, ordinals (`3rd`, `#3`). Each must match a facts value after normalization (`90%` ≡ `0.9` ≡ `.900`; `#3` ≡ `3rd` ≡ `3`).
- Exempt: ISO dates; `Week N` only when every N is 1..`week`+1; years only in `<year> season|regular season|postseason|draft`; per-sport phrase lists (`STORY_SPORTS` in `story-core.cjs`) — football phrases for NFL only, baseball structure (`9th inning`, `Game 5`, `3-2 count`) for MLB only. Never borrow the other sport's list.
- Spelled-out numbers above "one" are rejected outright — write `$55M`, not "55 million".
- **What it can't catch:** two facts of equal magnitude are indistinguishable to it; a whole number within 0.5 of any fact passes; a sourced-but-misleading claim passes clean. Re-read every sentence against its fact before shipping.

## House voice (from the two published stories)

- **Headline states the finding as a plain fact**, with the scope in it: "The Jaguars have allowed 36 points through Week 3, the fewest in the NFL."
- **Dek is one sentence**, a second number that deepens the headline.
- **Open with the core number + attribution**: "…the fewest of the league's 32 teams, per SportStrata's standings data." Never a bare number — always "X, the fewest of 32" or "vs the league average of Y".
- **Numerals always.** No hype adjectives (no "incredible", "stunning", "shocking").
- **Structure that repeats:** Game by game (score list) → the mechanism (where the number comes from — bullpen outs, point differential decomposition) → the skeptic's objection, answered with data ("Not just a soft schedule", "Not quite an upset") → **The caveat** (name the small sample, state what can and can't be said).
- **Internal links** to team pages on first mention: `[Jacksonville Jaguars](/nfl/team/jax)`.
- **One idea per story.** 300–450 words.
- **Social:** Reddit is value-first with the link last; X is the finding in one breath plus URL.

## PR body template

For each story:
```
### <headline>
Angle proof: <the comparison, e.g. "36 pts allowed, 1st of 32; next is 41 (SF)">
Base rate / context: <league average, historical norm, or sample-size caveat>
Weakest claim: <the one sentence a skeptic would attack first, and why it holds>
```
Then:
```
### Dropped candidates
- <angle>: <why it didn't hold up>
```
Write the body so checking each angle takes seconds: proof first, prose second.

## Standing authorization (D-177)

The scheduled run may: push a `stories/*` branch, open one PR per run. It may never: push to `main`, merge, touch files outside `content/{nfl,mlb}/stories/**`. Anything else needs the owner's explicit go. No agent reviewer — CI checker plus owner review.

## Schedule

Every Tuesday 09:00 America/New_York (after Monday Night Football is final; the timezone handles DST). NFL weekly + MLB postseason; MLB goes quiet after the World Series.
