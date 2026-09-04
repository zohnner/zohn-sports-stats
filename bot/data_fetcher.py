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


def _int(v, default=0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def extract_batting_lines(boxscore: dict) -> list[dict]:
    """
    Extracts individual batting stat lines from a boxscore.
    Returns a list of dicts with player_id, player_name, and stat fields.

    statsapi.boxscore_data() has no "playerStats" key — real shape is a flat
    per-team "{side}Batters" list of row dicts (header row has personId 0,
    all stat values are strings), not a personId-keyed map. Verified live
    2026-09-03 against a real completed game.
    """
    lines = []
    for side in ("away", "home"):
        for row in boxscore.get(f"{side}Batters", []):
            pid = row.get("personId", 0)
            if not pid:
                continue  # header/totals row
            ab = _int(row.get("ab"))
            if ab == 0:
                continue  # pinch runners, courtesy appearances, etc.

            hits, doubles, triples, hr = (
                _int(row.get("h")), _int(row.get("doubles")),
                _int(row.get("triples")), _int(row.get("hr")),
            )
            lines.append({
                "player_id":   int(pid),
                "player_name": row.get("name", "Unknown"),
                "team_side":   side,
                "ab":          ab,
                "hits":        hits,
                "home_runs":   hr,
                "rbi":         _int(row.get("rbi")),
                "runs":        _int(row.get("r")),
                "total_bases": (hits - doubles - triples - hr) + 2 * doubles + 3 * triples + 4 * hr,
                "doubles":     doubles,
                "triples":     triples,
                "bb":          _int(row.get("bb")),
                "k":           _int(row.get("k")),
                "sb":          _int(row.get("sb")),
            })
    return lines


def extract_pitching_lines(boxscore: dict) -> list[dict]:
    """Extracts pitching stat lines — used for K-threshold detection.

    Same real shape as extract_batting_lines: "{side}Pitchers" row list.
    """
    lines = []
    for side in ("away", "home"):
        for row in boxscore.get(f"{side}Pitchers", []):
            pid = row.get("personId", 0)
            if not pid:
                continue  # header/totals row
            ip = row.get("ip", "0.0") or "0.0"
            if float(ip.replace(".1", ".33").replace(".2", ".67")) < 1.0:
                continue

            lines.append({
                "player_id":   int(pid),
                "player_name": row.get("name", "Unknown"),
                "team_side":   side,
                "ip":          ip,
                "strikeouts":  _int(row.get("k")),
                "hits":        _int(row.get("h")),
                "er":          _int(row.get("er")),
                "bb":          _int(row.get("bb")),
                "hr":          _int(row.get("hr")),
            })
    return lines
