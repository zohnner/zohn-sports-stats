# SportStrata MLB Statistical Bot (X / Twitter)

Posts rare and **unprecedented** single-game MLB stat lines to X, each linking
back to SportStrata to drive traffic. Precision voice (stat + claim + link),
not hype — see `DECISIONS.md` D-008.

Separate Python project; can be extracted to its own repo at any time.

## What it detects
- **Unprecedented** H/HR/RBI/R/TB single-game combinations (vs. all stored history)
- 4-homer games, natural cycles, 6-hit games, 20-strikeout games
- Two-grand-slam games (proxy: HR≥2 & RBI≥8 — flagged for manual verification)
- **Drought** alerts (a rare event type not seen in 5+ years)

## One-time setup

### 1. X (Twitter) API credentials
Create an app at developer.x.com with **Read and Write** permission, then generate:
`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.

Add them as **GitHub repository secrets** (Settings → Secrets and variables →
Actions → New repository secret). Optionally set `SPORTSTRATA_URL` — defaults to
`https://sportstrata.cc`.

### 2. Seed the history database (required before the "unprecedented" check is meaningful)
Until seeded, the comparison table is empty and almost every line looks
unprecedented. Run **once** via Actions: the **MLB Statistical Bot** workflow →
**Run workflow** → mode = `seed`. It backfills the previous season (~2,400 games,
slow — pulls boxscores at a 2s rate limit) into `bot.db`, which the workflow caches
between runs. To seed a specific year, run locally: `python main.py --mode seed --season 2024`.

### 3. Validate before going live
Run the workflow once with mode = `dryrun` — it executes the full recap logic and
prints the tweets it *would* post without sending. Confirm the boxscore parsing
works against the live API (see Known caveats) before scheduling real posts.

## Schedule
Defined in `.github/workflows/mlb-bot.yml` (repo root):
- `recap` — daily ~5 AM ET (overnight recap of yesterday's finals)
- `drought` — daily ~noon ET
- Manual `workflow_dispatch` with mode = recap | drought | dryrun | seed

`MAX_TWEETS_PER_DAY` (default 5) caps volume well under the X free-tier limit.

## Local development
```bash
cd bot
cp .env.example .env        # fill in X creds (or leave blank for seed/dryrun)
pip install -r requirements.txt
python main.py --mode dryrun
```

## Files
| File | Purpose |
|---|---|
| `main.py` | Entry point; modes recap / seed / drought / dryrun |
| `data_fetcher.py` | Pulls finals + boxscores via `mlb-statsapi` (rate-limited) |
| `stat_analyzer.py` | Rare-event + unprecedented detection |
| `database.py` | SQLite: `stat_combinations`, `rare_events`, `tweet_log` |
| `tweet_generator.py` | Precision-voice templates (all ≤ 280 chars) |
| `x_poster.py` | tweepy client + dry-run |
| `config.py` | Env config, rarity thresholds, caps |

## Known caveats
- **Boxscore parsing is unverified against the live API.** `data_fetcher.extract_batting_lines`
  reads `boxscore["playerStats"][side]` from `statsapi.boxscore_data()`; confirm this shape
  with a `dryrun` before trusting recap output. If empty, the key path needs adjusting.
- Two-grand-slam detection is a proxy, not definitive (would need play-by-play).
- Landing pages (`/unprecedented/{id}`) and a bot JSON API are **parked** (D-008);
  Phase A links to existing SportStrata routes only.
