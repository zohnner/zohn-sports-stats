# SportStrata Social Content Tool

A tool for running SportStrata's social media. It generates **ready-to-post draft
posts** — game finals, rare-event highlights, and a daily fun fact — into
`drafts/{date}.md`. You review, edit, and post the ones you want.

**It does not post anywhere itself, and needs no X/Twitter API keys.** (X moved to
paid pay-per-use in Feb 2026, with link-bearing posts especially costly — so posting
is done manually by you, for free.)

## What a digest contains
- **Rare / unprecedented highlights** — 4-homer games, cycles, 6-hit games, 20-K
  games, two-grand-slam games, and "unprecedented" H/HR/RBI/R/TB single-game lines
- **Game of the day** — recap of the day's most notable final
- **Scoreboard roundup** — compact list of the day's finals
- **Fun fact** — a date-seeded evergreen baseball fact

Each draft is shown with its character count (and a warning if over 280).

## Run it

**Via GitHub Actions (easiest):** the **SportStrata Social Digest** workflow runs
each morning and uploads the digest as a downloadable artifact
(`sportstrata-digest`). You can also trigger it manually (Run workflow → optional
date). No secrets required.

**Locally:**
```bash
cd bot
pip install -r requirements.txt
python digest.py                 # yesterday's finals
python digest.py --date 2026-06-13
# → writes drafts/<date>.md
```

## Optional: seed history for the "unprecedented" check
The "unprecedented" highlight compares each line against stored history. Until
seeded, the history is thin and it over-flags — harmless here since you vet every
draft, but for a credible "never in MLB history" claim, backfill past seasons:
```bash
python main.py --mode seed --season 2024   # repeat for each season you want
```
The more seasons seeded, the more literally true "unprecedented" is. `bot.db` is
cached between Actions runs.

## Review-first football content queue

`content_engine.py` creates ready-to-produce NFL or NCAA Football YouTube Shorts packages from completed ESPN scoreboard events. Each candidate has a copy-ready voiceover, title, caption, five visual beats to guide the clips you select, its source-game link, and an approval checkbox. It is deliberately deterministic: the only factual claims are the final score, ESPN-supplied ranked-team status, and arithmetic derived from them.

```bash
cd bot
python content_engine.py --league nfl --date 2026-09-13
python content_engine.py --league ncaaf --date 2026-09-05
```

Drafts land in `content-queue/` (gitignored). Start with `*-todays-pick.md`: it holds the top three unique games, complete with copy-ready packages and machine-readable editor manifests. Pick an approved package, source clips you have permission to use, paste the voiceover into your editor, and follow the visual beats. The tool does not generate video or publish anywhere.

The root [content-queue workflow](../.github/workflows/content-queue.yml) runs after the main NFL/NCAAF result windows and uploads the queue as a GitHub Actions artifact. Use **Run workflow** to generate an on-demand queue; leave the date blank for the previous UTC day.

Run its offline checks with:

```bash
python -m unittest discover -s tests
```

## Play visualizer (NFL, feeds the content queue)

`play_visualizer.py` renders an animated top-down field view of a single NFL play
from real nflverse tracking data — ball/player positions frame-by-frame, route
trails, coverage lines, ball-carrier speed, a distance-gated ball-carrier guess,
and a rough (heuristic, not calibrated) completion-probability estimate. Output
is an MP4, meant to be cut into clips for `content_engine.py`'s Shorts packages
— it does not run on the live site (Cloudflare Pages has no Python runtime), and
it does not publish anywhere itself.

Requires `ffmpeg` on PATH (for `FFMpegWriter`) and the extra deps in
`requirements.txt` (numpy/pandas/matplotlib/nfl_data_py/nflreadpy/rich — not
needed by the rest of the bot).

```bash
cd bot
pip install -r requirements.txt
python play_visualizer.py --season 2024 --menu   # browse & pick a play interactively
python play_visualizer.py --season 2024 --game <id> --play <id> --week <n>
python play_visualizer.py --show-speed --show-cp --show-coverage --route-tree
```

Downloaded play-by-play and tracking data are pickle-cached under `nfl_cache/`
(gitignored) so repeat runs against the same season/week don't re-fetch. If
tracking data can't be fetched or a game/play isn't found, it falls back to a
labeled synthetic play rather than failing silently.

## YouTube video performance report

`youtube_stats.py` pulls your recent uploads plus key performance metrics (windowed
views, average view %, subscribers gained/lost, plus lifetime views/likes) into a
plain markdown report — so you can see what's actually working before deciding what
to post next. Local only: no server, no schedule, no live-site changes. It reads,
never writes anything to YouTube.

```bash
cd bot
python youtube_stats.py                  # last 90 days, top 25 videos
python youtube_stats.py --days 30
```

Reports land in `reports/{date}.md` (gitignored). Requires a one-time OAuth setup —
see the step-by-step instructions in the script's own docstring, and put the three
resulting values (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`,
`YOUTUBE_REFRESH_TOKEN`) in `bot/.env`, never committed. If the Analytics API call
fails for any reason, the report still ships with lifetime view/like counts from the
Data API rather than failing outright.

## Files
| File | Purpose |
|---|---|
| `digest.py` | **The tool** — builds the daily draft-post digest |
| `youtube_stats.py` | Video performance report — see above |
| `fun_facts.py` | Evergreen fun-fact rotation |
| `data_fetcher.py` | MLB Stats API: finals + boxscores (free, no auth) |
| `stat_analyzer.py` | Rare-event / unprecedented detection |
| `tweet_generator.py` | Post templates (all ≤ 280 chars) |
| `database.py` | SQLite history for the unprecedented check |
| `main.py` | Legacy auto-poster (recap/drought/seed); only `seed` is needed now |
| `config.py`, `x_poster.py` | Config; `x_poster`/`tweepy` only used by the legacy poster |
| `play_visualizer.py` | NFL play animation (tracking data → MP4) for the content queue — see below |

## Known caveats
- **Boxscore parsing is unverified against the live API.** `data_fetcher.extract_batting_lines`
  reads `boxscore["playerStats"][side]`; if a digest shows finals but no highlights on a
  busy day, that key path needs adjusting. The scoreboard/finals come from the schedule
  feed and are independent of this.
- Fun facts are evergreen but worth a glance before posting.
- Two-grand-slam detection is a proxy (HR≥2 & RBI≥8), not definitive.
