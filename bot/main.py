"""
MLB Statistical Bot — main entry point.

Modes:
  --mode recap   Process yesterday's final games (run nightly via cron/Actions)
  --mode seed    Seed the database with a full past season (run once on setup)
  --mode drought Check for drought alerts (can run daily, low tweet volume)
  --mode dryrun  Run recap logic without posting to X (for testing)

Usage:
  python main.py --mode recap
  python main.py --mode seed --season 2024
  python main.py --mode dryrun
"""

import argparse
import logging
from datetime import date, timedelta

import database as db
import data_fetcher as fetcher
import stat_analyzer as analyzer
import tweet_generator as generator
import x_poster as poster
from config import MAX_TWEETS_PER_DAY

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


def _process_game(game: dict, game_date: date, dry: bool) -> int:
    """Analyzes one completed game. Returns number of tweets sent."""
    game_pk = game["game_id"]
    log.info(f"Processing game {game_pk}: {game.get('away_name')} @ {game.get('home_name')}")

    try:
        boxscore = fetcher.get_boxscore(game_pk)
    except Exception as e:
        log.error(f"Failed to fetch boxscore for {game_pk}: {e}")
        return 0

    batting_lines  = fetcher.extract_batting_lines(boxscore)
    pitching_lines = fetcher.extract_pitching_lines(boxscore)

    findings = []

    for line in batting_lines:
        findings.extend(analyzer.analyze_batting_line(line, game_pk, game_date))

    for line in pitching_lines:
        findings.extend(analyzer.analyze_pitching_line(line, game_pk, game_date))

    findings.extend(analyzer.check_two_grand_slams(batting_lines, game_pk, game_date))

    # Persist all combinations regardless of tweet outcome
    for line in batting_lines:
        db.record_combination(
            player_id=line["player_id"],
            player_name=line["player_name"],
            game_pk=game_pk,
            game_date=game_date,
            hits=line["hits"],
            home_runs=line["home_runs"],
            rbi=line["rbi"],
            runs=line["runs"],
            total_bases=line["total_bases"],
        )

    tweets_sent = 0

    for finding in findings:
        if db.tweets_today() >= MAX_TWEETS_PER_DAY:
            log.warning("Daily tweet cap reached — queuing remaining findings for tomorrow")
            # Persist untweeted rare events for next run
            if finding["type"] != "unprecedented":
                db.record_rare_event(
                    event_type=finding["type"],
                    player_id=finding.get("player_id"),
                    player_name=finding.get("player_name"),
                    game_pk=game_pk,
                    game_date=game_date,
                    details=finding.get("details", {}),
                )
            break

        text = generator.build(finding)
        if not text:
            continue

        try:
            if dry:
                tweet_id = poster.dry_run(text)
            else:
                tweet_id = poster.post(text)
            db.log_tweet(tweet_id, text)
            tweets_sent += 1
            log.info(f"Tweeted [{finding['type']}] for {finding.get('player_name')} — id {tweet_id}")
        except Exception as e:
            log.error(f"Tweet failed for {finding['type']}: {e}")

    return tweets_sent


def mode_recap(target_date: date, dry: bool):
    games = fetcher.get_final_games(target_date)
    log.info(f"Found {len(games)} final games on {target_date}")
    total = 0
    for game in games:
        total += _process_game(game, target_date, dry)
    log.info(f"Recap complete — {total} tweets sent")


def mode_drought(today: date, dry: bool):
    alerts = analyzer.check_droughts(today)
    log.info(f"Found {len(alerts)} drought alerts")
    for finding in alerts:
        if db.tweets_today() >= MAX_TWEETS_PER_DAY:
            break
        text = generator.build(finding)
        if not text:
            continue
        try:
            if dry:
                tweet_id = poster.dry_run(text)
            else:
                tweet_id = poster.post(text)
            db.log_tweet(tweet_id, text)
            log.info(f"Drought tweet sent — {finding['details']['label']}")
        except Exception as e:
            log.error(f"Drought tweet failed: {e}")


def mode_seed(season: int):
    """
    Seeds the database with all batting lines from a completed season.
    Run once on initial setup: python main.py --mode seed --season 2024
    """
    import statsapi
    log.info(f"Seeding season {season} — this will take a while")

    schedule = statsapi.schedule(
        start_date=f"{season}-03-20",
        end_date=f"{season}-10-01",
        sportId=1,
    )
    final_games = [g for g in schedule if g.get("status") == "Final"]
    log.info(f"{len(final_games)} final games to seed")

    for i, game in enumerate(final_games):
        if i % 50 == 0:
            log.info(f"  Seeded {i}/{len(final_games)}")
        try:
            boxscore = fetcher.get_boxscore(game["game_id"])
            batting_lines = fetcher.extract_batting_lines(boxscore)
            game_date = date.fromisoformat(game["game_date"][:10])
            for line in batting_lines:
                db.record_combination(
                    player_id=line["player_id"],
                    player_name=line["player_name"],
                    game_pk=game["game_id"],
                    game_date=game_date,
                    hits=line["hits"],
                    home_runs=line["home_runs"],
                    rbi=line["rbi"],
                    runs=line["runs"],
                    total_bases=line["total_bases"],
                )
        except Exception as e:
            log.warning(f"Skipping game {game['game_id']}: {e}")

    log.info("Seed complete")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["recap", "seed", "drought", "dryrun"],
                        default="dryrun")
    parser.add_argument("--date", help="Override date (YYYY-MM-DD)")
    parser.add_argument("--season", type=int, help="Season year for seed mode")
    args = parser.parse_args()

    db.init_db()

    if args.mode == "seed":
        season = args.season or (date.today().year - 1)
        mode_seed(season)

    elif args.mode in ("recap", "dryrun"):
        dry = args.mode == "dryrun"
        target = (
            date.fromisoformat(args.date)
            if args.date
            else date.today() - timedelta(days=1)
        )
        mode_recap(target, dry)

    elif args.mode == "drought":
        target = date.fromisoformat(args.date) if args.date else date.today()
        mode_drought(target, dry=False)
