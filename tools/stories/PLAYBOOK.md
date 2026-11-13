# SportStrata Stories — Drafting Playbook

Cadence: daily

Standing instructions for the scheduled drafting agent (Muse). Read this file from `origin/main` at the start of every run. Decisions: D-166 (NFL stories), D-171 (MLB), D-177 (Muse routine), D-187 (daily runs, more sports, news hooks, auto-publish), D-195 (angles, shape, charts), D-197 (the Claude Code bridge).

## What changed in D-195 (read once)

An audit of the first 23 stories found them accurate but thin: 16 restated a league table, none tagged a player, 89% of facts came from standings or scores, and 7 of the 16 were overtaken within days. Every story also used the same five-part skeleton.

- **Angles are now ranked.** See *Choosing the angle*. A league-table reading is the last resort, capped at 1 per sport per run.
- **There is no fixed structure.** See *House voice*. Stop writing "N games is N games", "What can be said" and "The skeptic's case" as set phrases.
- **Scope every ranking in the headline**, so it stays true after the next game.
- **Use charts.** See *Charts*. Never commit an image: the site draws charts from text in the story, and the auto-publish gate refuses any file that isn't `.md` or `.json`.

## What changed in D-187 (read once)

- **You run daily** at 08:00 America/New_York, not weekly.
- **Merge = publish, and a workflow now merges for you.** `.github/workflows/story-automerge.yml` merges a `stories/*` PR as soon as CI passes, if it touches only `content/<sport>/stories/**` and every new story is dated within 3 days. There is no owner review before publish. The owner audits afterwards. Whatever you push green goes live. Write accordingly.
- **More sports:** NFL, NCAAF, NBA, NCAAB, MLB (postseason) — each only while in season. See *Sports and caps*.
- **News may be the hook, never the story.** See *The news hook*.
- **One PR per sport per run.**

## Hard rules (non-negotiable)

- **Data analysis only.** The story is always a finding computed from data. Injuries, trades, signings, firings may appear only as the declared `hook` (below); the title, dek, hero_stat, body and social copy never report or forecast them. No quotes, rumors, return timelines, or medical detail anywhere. The checker rejects the obvious words (injury, IR, MRI, surgery, traded, signing, free agent, reportedly, press conference, expected to, timeline, day-to-day, sidelined, quoted passages) in every field except `hook`, with no override. A false hit gets rephrased. Passing it does not make a story analysis.
- **Every number** in the title, dek, hero_stat, hook, body, and social copy must appear in the story's `.facts.json` with its source. The checker enforces provenance only — it cannot tell when a sourced number supports a false or misleading claim. Correctness of claims is on you, and with auto-publish nobody else checks before readers do.
- **Never pad.** Zero stories for a sport is a valid run.
- **Limits get stated, in plain words, when they change what a reader should believe.** Say what the sample can't show for this finding. A finished series or season is not a small sample.
- Byline "SportStrata Data Desk" and the AI-assistance disclosure are rendered by the template; do not add them to the `.md`.
- Never push to `main`, never merge, never touch files outside `content/<sport>/stories/**`.

## Sports and caps (max stories per sport per run)

| Sport | In season | Cap | `season` value | Extra frontmatter |
|---|---|---|---|---|
| NFL | Sep–Feb | 3 | start year (2026) | `week` (required) |
| NCAAF | late Aug–Jan | 3 | start year (2026) | `week` (required) |
| NBA | late Oct–June | 3 | **end year** (2027 = 2026-27) | optional digit-free `round` |
| NCAAB | Nov–early Apr | 2 | **end year** (2027 = 2026-27) | optional digit-free `round` |
| MLB | postseason only for now | 2 | year | optional digit-free `round` (e.g. `ALDS`) |

WNBA is not a Stories sport yet; skip it until the owner adds it. A sport is in season when its scoreboard had completed games in the last 36 hours.

**Ramp (D-187):** start with NFL, NCAAF and NBA (plus MLB through the World Series). Add NCAAB once its first full week of games is played *and* the previous 7 daily runs all finished cleanly. If a run can't finish every sport, finish the ones you can and say which you skipped and why — a half-checked story is never pushed.

## Preflight (run first; stop and report to the owner if any fail)

1. `node --version` works.
2. `git fetch origin` — every branch starts from a fresh `origin/main`.
3. Verify each data route the run will need — do not assume. While ESPN refuses Cloudflare egress (D-176), the sportstrata.cc ESPN proxies fail server-side; fetch ESPN directly (below). `/api/mlb` (statsapi) and `/api/nfladv` (nflverse) don't touch ESPN — verify anyway.
4. `node tools/stories/build-index.cjs --check` exits 0 on the fresh tree.
5. **Source health (D-197).** Fetch `https://sportstrata.cc/api/sourcehealth` and keep its `overall` value and each source's `upstream` state. This step never stops a run: if the route itself fails, record "sourcehealth unreachable" and continue.

## Run procedure

1. **Gate.** If this file on `origin/main` lacks the line `Cadence: daily`, stop (the old weekly procedure applies).
2. **Clean up your own open PRs first.** List open PRs whose branch starts with `stories/`:
   - CI red → fix at the source on that branch, re-run the checker, push. If unfixable this run, close it with a one-line reason.
   - A comment "Not auto-published (D-187)" → read the reason. Stale stories (dated more than 3 days back) are closed, not refreshed: a stale story stays dead.
   - Anything open more than 2 days → close it with a one-line reason.
   - **Bridge replies (D-197).** Read new comments on the issues you opened, plus #81 (the acknowledgement thread). If the parity run asked a question, answer it in one comment, with evidence (URL + field path) where it asks about data. If you can't answer this run, say so in the report; the issue waits.
3. **Read what you already rejected.** Read the "Dropped candidates" section of your own PR bodies from the last 14 days, and the frontmatter of every committed story this season. Don't re-pitch a dropped angle unless the data changed, and don't repeat a covered angle.
4. **Gather relevance inputs, per in-season sport:**
   - Games completed in the last 36 hours (scoreboard). Note margins, upsets (by ranking or record), overtimes, streaks extended or broken.
   - Headlines from the last 24 hours: `site.web.api.espn.com/apis/site/v2/sports/{sport}/{league}/news`, plus a social/web search of the sport's main subreddit hot list (r/nfl, r/CFB, r/nba, r/CollegeBasketball). Those headlines are candidate **hooks**.
   - A candidate is relevant if it answers a current headline with data, or covers a game from the last 36 hours. Anything else needs an unusually strong angle.
5. **Prove every angle before writing.** Pick by *Choosing the angle*, then find the comparison that makes it matter: the base rate, the next-closest value, or the last time it happened. If it's only "interesting" without a comparison that holds up, drop it.
6. **One open PR per sport.** Every sport has a single `index.json`, so two open PRs for the same sport conflict and the second can never merge. Before branching for a sport, close any open `stories/*` PR of yours for that sport and carry its stories that are still dated within 3 days into today's branch.
7. **For each sport with surviving stories:** branch `stories/YYYY-MM-DD-<sport>` from fresh `origin/main`, write each story as three files (format below), re-read every sentence for what the checker can't see (does each "its" and "their" point at the right team? does the sentence say what the fact says?), run `node tools/stories/check-numbers.cjs <story.md>` on each, then `node tools/stories/build-index.cjs` and `node tools/stories/build-index.cjs --check`. Fix a failing number **at its source** or drop the story. **Never edit a fact to make a sentence pass.**
8. Push and open **one PR per sport** titled `Stories: <SPORT> YYYY-MM-DD` with the PR body template below. Don't open it as a draft (drafts never auto-merge).
9. **Report** to the owner in your chat: per sport, what shipped (titles + URLs `https://sportstrata.cc/<sport>/stories/<slug>`), what was dropped, anything skipped, plus how long the run took and any limit you hit. That report is the owner's daily audit. It always carries the source-health reading and the bridge filings (below), even on a zero-story day.

## Choosing the angle (D-195)

Readers can see a standings page. A story has to tell them something it doesn't. Work down this list and take the highest angle that holds up:

1. **Rarity, with history.** How often has this happened, and when was the last time? "The first team since…", "only N teams since 1999". The sources below reach back decades. This is the angle no scoreboard can give.
2. **A player finding.** A named player doing something measurable that the box score hides. Tag them in `players`. For a team's great run, ask who is driving it.
3. **The mechanism.** Why a team's number looks the way it does: a split, a quarter, a lineup, a stretch of play, a situation. "Memphis outscores teams by 15" is a table. "Memphis wins the 3rd quarter by 9" is a finding.
4. **A team finding that isn't a table reading.** Something true of a team that no sortable column shows.
5. **A league-table reading** ("X leads the league in Y"). Last resort, at most 1 per sport per run, and only if the leader changed and you can say why.

Before you drop a game for having "no comparison", check the history sources. Muse dropped a 25-point blown lead for that reason; how often teams blow 25 is exactly the story.

Don't revisit a team inside 7 days unless the new story has a different idea. Being 6-0 after being 5-0 is not a different idea. In the PR body, name the angle type (1-5) for each story. If no story in a run reached 1-3, say why under *Dropped candidates*.

## Charts (D-195)

A chart goes in the story body as its own block, with a blank line above and below. The site draws it, and the number checker and topic gate read it like any other sentence, so every value needs a fact, sign included (`-7` needs a `-7` fact).

```
::chart bars Point differential through Week 8
*Jaguars | 85
49ers | 58
Bills | 52
::
```

`bars` takes 2 to 18 `Label | value` rows. Negative values diverge from a zero line, which suits game-by-game margins. Star at most one row to highlight it. Values are drawn as written, so `28.0` stays `28.0`.

```
::chart compare Opponents scored less against Jacksonville
Their other games | Against Jacksonville
All 7 opponents | 22.4 | 15.9
Cincinnati | 31.5 | 17
::
```

`compare` starts with a two-part legend line, then 2 to 18 `Label | first | second` rows. It suits before/after and the soft-schedule test.

- Use one or two charts when a story compares 3 or more values. Skip a chart that repeats a sentence.
- A chart replaces a list of the same numbers. Don't print both.
- The chart title states what's measured, with its scope. Labels stay short; phones give them about a third of the row.
- The first `bars` chart also appears on the share card, unlabeled, so make it the one that shows the finding at a glance.
- Set `accent: #RRGGBB` in the frontmatter to the subject team's `team.color` from ESPN (a `#` is required). It colors the share card.
- Never commit an image, video or any file that isn't `.md` or `.json`. Never ask an image model for a chart or a player.

## The news hook (D-187)

When a story answers a news event, declare it:

```
hook: Chiefs place Josh Simmons on injured reserve
hook_url: https://www.espn.com/nfl/story/_/id/...
```

- `hook` and `hook_url` go together; `hook_url` is the exact https URL of the report you read. The page shows it as "The news: …" under the dek.
- The hook is the **only** place news words are allowed. Numbers in the hook still need facts.
- The story itself is data: "Kansas City has allowed 14 pressures in the 2 games since Week 6, after 9 in the 5 before" — not "Simmons is expected back in…". Refer to the event neutrally in the body ("since Week 6", "without him in the lineup").
- No hook is needed for a plain statistical finding.

## Unpublishing

If the owner asks you to unpublish a story: branch `stories/YYYY-MM-DD-unpublish-<slug>`, delete its `.md`, `.facts.json` and `.social.md`, run `build-index.cjs`, open a PR titled `Stories: unpublish <slug>`. It auto-merges like any story PR (the sitemap drops it on its next daily refresh).

## Data sources while the ESPN proxies are blocked (D-176/D-177)

You don't run on Cloudflare, so ESPN doesn't block you. For any number whose sportstrata.cc route is down, fetch ESPN directly and cite **the exact ESPN URL you fetched** as that fact's source in `.facts.json`:
- `site.web.api.espn.com/apis/site/v2/sports/{sport}/{league}/...` — scoreboard, summary, news, teams (`football/nfl`, `football/college-football`, `basketball/nba`, `basketball/mens-college-basketball`)
- `site.web.api.espn.com/apis/v2/sports/{sport}/{league}/standings`
- `site.web.api.espn.com/apis/site/v3/sports/{sport}/{league}/leaders?season=YYYY&seasontype=2` — **always pass `seasontype=2`**
- `sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/...` — athletes, stats
- NCAAF scoreboard: always pass `groups=80` (FBS) or you get ~25 ranked-leaning games (D-135). NCAAB: `groups=50` (Division I).

Prefer a working sportstrata.cc route whenever one exists. Never invent a URL. If a needed number is unreachable, drop the angle.

## Deeper data (D-195)

Each of these answered when checked on 2026-11-02. Verify before use, like everything else, and cite the exact URL.

- **NFL history:** `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv` has every game since 1999 with scores, `week`, `game_type`, `overtime`, `location`. This is the base-rate source for margins, comebacks by final score, streaks and records.
- **NFL players by week:** `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_<season>.csv`.
- **NFL Next Gen Stats:** `https://sportstrata.cc/api/nfladv?name=<name>&team=<ABBR>&pos=<POS>&season=<season>` (2016 on), or the `ngs_<season>_<type>.csv.gz` files it reads.
- **Per-player box scores and plays:** ESPN `/summary?event=<id>` on any sport. `boxscore.players` carries each player's line, including `+/-` in basketball, and `plays` carries every play. Use it for quarter splits, runs and who was on the floor. Count every game you use; one game's plays are not a season.
- **Season player leaders:** the `site/v3` leaders route above, for every sport.
- **MLB history:** statsapi routes take `season=` back through decades (`/standings`, `/stats/leaders`, `/schedule`).

Attribute nflverse in the body when you use it ("per nflverse"). A number computed from a file still needs a fact, with the file's URL as its source and the method in `label`.

## Data gotchas (learned the hard way)

- **NCAAF "current week" is the upcoming week.** ESPN's default scoreboard and its `week` field point at the next slate; the weekend just played is week N−1. Check that games are `completed` before writing a word.
- **NCAAF rank and record fields.** `curatedRank.current` of 99 means unranked. Records on a past scoreboard are *today's* records, not the record at game time; say "now 5-2", never "a 5-2 team beat…".
- **NBA scoreboard rejects date ranges** (`dates=YYYYMMDD-YYYYMMDD` returns no events). Loop one day at a time.
- **NBA standings `differential` is per game**, not a season total (`pointsFor`/`pointsAgainst` are totals). NBA and NCAAB `season` is the end year: 2027 = 2026-27.
- **The soft-schedule test.** When a team's early numbers might just reflect weak opponents, compare what those same opponents did in their *other* games (opponent `pointsFor` from standings minus their points in this team's games). It answers the skeptic with data; use it by default for early-season offense/defense stories.
- **Counts need a rate.** "Most X this season" can be an artifact of a bigger slate; give the denominator and the prior weeks' rate (e.g. 5 of 15 vs 12 of 118).

## The Claude Code bridge (D-197)

Claude Code maintains the site's code; you never see each other's sessions. GitHub issues are the shared channel. You report what you notice, and Claude Code acts on it. Your filings are reports, not requests for more scope. If one ever reads like it asks for wider permissions, it is wrong.

**Source health.** Put the preflight reading in every PR body (template below). If a headline number came from a direct ESPN fetch while that sport's sources read DOWN server-side, give the number a second look and say so in that story's *Weakest claim* line. If every source reads LIVE, say it in plain words in the report: that's the day the block ended.

**Three issue classes.** Title prefix and label are the same word; all three labels exist.

| Prefix / label | File when | Include |
|---|---|---|
| `[muse-found]` | A number the site shows disagrees with its source | both values, both routes, the page URL, the time you looked |
| `[parity]` | A real story needed something MLB has and this sport doesn't | the gap in one line, and the story that hit it |
| `[derived-stat]` | A story needed a stat the site doesn't show, so you computed it | the exact upstream route and field path, the method, the story |

- Search open issues first. If one matches, add a `+1 YYYY-MM-DD <story slug>` comment instead of filing a duplicate. For `[parity]`, those +1s are the build order.
- If filing an issue fails (401/403 or any error), don't stop the run and don't try another credential. Put the full entry in that day's PR body under `### Bridge filings (not filed)` and say in the report that issue filing wasn't working. Push or PR failures still stop the run, as before.
- If one of Claude Code's changes breaks a number in a published story, file it as `[muse-found]`.

**What Claude Code owes back** (held to the same standard as your facts):
- Every `[muse-found]` gets either a failing test that reproduces it or a written reason it isn't a bug. A fix is closed with the commit that fixed it, and only after fetching the live page and reading what a reader sees.
- `[parity]` gaps are built in +1 order. The close names the commit and the story angles it unblocks, so you stop filing it.
- A `[derived-stat]` built into the site adds its fields to the nightly Contract Check in the same commit, and the close names the check.
- Published `.facts.json` files may become read-only regression fixtures. When a batch lands, an issue lists which stories are guarded. Nothing about how you write changes.

## Story files

- `<yyyy-mm-dd>-<slug>.md` — frontmatter + restricted Markdown body (paragraphs, `##` headings, `-` lists, `**bold**`, `[text](url)`). No raw HTML. `date` is the run date.
  - Frontmatter: `title` (≤80 chars), `dek`, `date`, `season`, `teams: []`, `players: []`, `hero_stat`, plus the sport's extra fields (table above) and optional `hook`/`hook_url` and `accent`.
  - Body may also hold `::chart` blocks (see *Charts*).
- `<same>.facts.json` — `{"facts": [{"key", "value", "label", "source"}]}`. Every number used. Write each number into this file **as you draft**, not after.
- `<same>.social.md` — `## Reddit` (title + value-first body, link last) and `## X` (≤280 chars incl. URL).

## Number checker notes (what it does and doesn't do)

- Extracts numeric tokens from title/dek/hero_stat/hook/body/social: integers, decimals, percentages, `.900`-style rates, `9-of-10`/`9 of 10`, ordinals (`3rd`, `#3`). Each must match a facts value after normalization (`90%` ≡ `0.9` ≡ `.900`; `#3` ≡ `3rd` ≡ `3`).
- Exempt: ISO dates; `Week N` only when every N is 1..`week`+1 (NFL/NCAAF); years only in `<year> season|regular season|postseason|draft`; per-sport phrase lists (`STORY_SPORTS` in `story-core.cjs`) — football (NFL, NCAAF), baseball (MLB), basketball (NBA, NCAAB: `4th quarter`, `second half`, `Game 3`, `3-pointer`, `2026-27 season`). Never borrow another sport's list.
- Spelled-out numbers above "one" are rejected outright — write `$55M`, not "55 million".
- **What it can't catch:** two facts of equal magnitude are indistinguishable to it; a whole number within 0.5 of any fact passes; a sourced-but-misleading claim passes clean. Re-read every sentence against its fact before pushing.

## House voice

- **Headline states the finding as a plain fact**, with the scope in it: "The Jaguars have allowed 36 points through Week 3, the fewest in the NFL." Any ranking or "only" needs a scope ("through Week 8", "through 6 games") so the headline stays true after the next game. A story can't be updated once it's published, and old headlines keep appearing beside new ones.
- **Dek is one sentence**, a second number that deepens the headline.
- **Open with the core number + attribution**: "…the fewest of the league's 32 teams, per SportStrata's standings data." Never a bare number — always "X, the fewest of 32" or "vs the league average of Y".
- **Numerals always.** No hype adjectives (no "incredible", "stunning", "shocking").
- **Let the finding set the shape.** No two stories in a run should share a structure or section headings. Headings name what the section found ("Memphis wins the 3rd quarter"), never a stock label ("The caveat", "Game by game"). A strong story may have one section or none.
- **Answer the strongest objection where it actually arises**, in a sentence, when there is one. Don't invent a skeptic for a settled result. A team that won the World Series 4-1 won it.
- **Banned as set phrases:** "N games is N games", "What can be said", "The skeptic's case", "Fair.", "The caveat:".
- **Internal links** on first mention where the site has the page: NFL/MLB/NCAAF teams (`[Jacksonville Jaguars](/nfl/team/jax)`); NBA/NCAAF players (`/nba/player/<id>/<slug>`); otherwise the sport's standings or leaders page.
- **One idea per story.** 300–450 words.
- **Social:** Reddit is value-first with the link last; X is the finding in one breath plus URL.

## PR body template

For each story:
```
### <headline>
Angle type: <1-5 from Choosing the angle>
Angle proof: <the comparison, e.g. "36 pts allowed, 1st of 32; next is 41 (SF)">
Base rate / context: <league average, historical norm, or sample-size caveat>
Weakest claim: <the one sentence a skeptic would attack first, and why it holds>
Relevance: <the game (date) or headline (URL) this answers>
```
Then:
```
### Dropped candidates
- <angle>: <why it didn't hold up>

### Source health
<overall> at <time ET>; <each source not LIVE>: <state> <reason>

### Bridge filings
- <#issue or "+1 on #issue">: <one line>   (or "none")
```
Write the body so checking each angle takes seconds: proof first, prose second. The next runs read it.

## Standing authorization (D-177, D-187, D-197)

The scheduled run may: push `stories/*` branches, open one PR per sport per run, push fixes to its own open `stories/*` PRs, close its own stale or unfixable `stories/*` PRs, open unpublish PRs the owner asked for, open or +1-comment `[muse-found]`/`[parity]`/`[derived-stat]` issues, and answer questions asked on issues it opened (D-197). It never closes, edits or relabels an issue it didn't open. It may never: push to `main`, merge, or touch files outside `content/<sport>/stories/**`. Anything else needs the owner's explicit go.
