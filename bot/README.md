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

## Files
| File | Purpose |
|---|---|
| `digest.py` | **The tool** — builds the daily draft-post digest |
| `fun_facts.py` | Evergreen fun-fact rotation |
| `data_fetcher.py` | MLB Stats API: finals + boxscores (free, no auth) |
| `stat_analyzer.py` | Rare-event / unprecedented detection |
| `tweet_generator.py` | Post templates (all ≤ 280 chars) |
| `database.py` | SQLite history for the unprecedented check |
| `main.py` | Legacy auto-poster (recap/drought/seed); only `seed` is needed now |
| `config.py`, `x_poster.py` | Config; `x_poster`/`tweepy` only used by the legacy poster |

## Known caveats
- **Boxscore parsing is unverified against the live API.** `data_fetcher.extract_batting_lines`
  reads `boxscore["playerStats"][side]`; if a digest shows finals but no highlights on a
  busy day, that key path needs adjusting. The scoreboard/finals come from the schedule
  feed and are independent of this.
- Fun facts are evergreen but worth a glance before posting.
- Two-grand-slam detection is a proxy (HR≥2 & RBI≥8), not definitive.
