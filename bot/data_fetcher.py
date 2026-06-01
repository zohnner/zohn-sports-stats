import time
import requests
from datetime import date, timedelta
import statsapi  # python-mlb-statsapi

# Respect the public API — one request per 2 seconds minimum
_RATE_LIMIT_SEC = 2


def _get(url, params=None):
    resp = requests.get(url, params=params, timeout=10)
    resp.raise_for_status()
    time.sleep(_RATE_LIMIT_SEC)
    return resp.json()


def get_final_games(target_date: date) -> list[dict]:
    """Returns all Final games for the given date."""
    date_str = target_date.strftime("%Y-%m-%d")
    data = statsapi.schedule(date=date_str)
    return [g for g in data if g.get("status") == "Final"]


def get_boxscore(game_pk: int) -> dict:
    """Returns the full boxscore dict for a completed game."""
    return statsapi.boxscore_data(game_pk)


def get_player_stats(player_id: int, stat_type="season") -> dict:
    """Returns current-season hitting stats for a player."""
    return statsapi.player_stat_data(player_id, type=stat_type)


def extract_batting_lines(boxscore: dict) -> list[dict]:
    """
    Extracts individual batting stat lines from a boxscore.
    Returns a list of dicts with player_id, player_name, and stat fields.
    """
    lines = []
    for side in ("away", "home"):
        players = boxscore.get("teamStats", {})  # unused — pull from playerStats
        for pid, pdata in boxscore.get("playerStats", {}).get(side, {}).items():
            batting = pdata.get("batting", {})
            if not batting:
                continue
            ab = batting.get("atBats", 0)
            if ab == 0:
                continue  # pitchers with 0 AB, courtesy appearances, etc.

            lines.append({
                "player_id":   int(pid),
                "player_name": pdata.get("name", "Unknown"),
                "team_side":   side,
                "ab":          ab,
                "hits":        batting.get("hits", 0),
                "home_runs":   batting.get("homeRuns", 0),
                "rbi":         batting.get("rbi", 0),
                "runs":        batting.get("runs", 0),
                "total_bases": batting.get("totalBases", 0),
                "doubles":     batting.get("doubles", 0),
                "triples":     batting.get("triples", 0),
                "bb":          batting.get("baseOnBalls", 0),
                "k":           batting.get("strikeOuts", 0),
                "sb":          batting.get("stolenBases", 0),
            })
    return lines


def extract_pitching_lines(boxscore: dict) -> list[dict]:
    """Extracts pitching stat lines — used for K-threshold detection."""
    lines = []
    for side in ("away", "home"):
        for pid, pdata in boxscore.get("playerStats", {}).get(side, {}).items():
            pitching = pdata.get("pitching", {})
            if not pitching:
                continue
            ip = pitching.get("inningsPitched", "0.0")
            if float(ip.replace(".1", ".33").replace(".2", ".67")) < 1.0:
                continue

            lines.append({
                "player_id":   int(pid),
                "player_name": pdata.get("name", "Unknown"),
                "team_side":   side,
                "ip":          ip,
                "strikeouts":  pitching.get("strikeOuts", 0),
                "hits":        pitching.get("hits", 0),
                "er":          pitching.get("earnedRuns", 0),
                "bb":          pitching.get("baseOnBalls", 0),
                "hr":          pitching.get("homeRuns", 0),
            })
    return lines
