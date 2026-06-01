from datetime import date, datetime
from config import RARITY_THRESHOLDS, DROUGHT_ALERT_DAYS
import database as db


def analyze_batting_line(line: dict, game_pk: int, game_date: date) -> list[dict]:
    """
    Runs all checks against a single batting line.
    Returns a list of findings — each is a dict with keys:
      type, player_id, player_name, game_pk, game_date, details
    """
    findings = []
    pid  = line["player_id"]
    name = line["player_name"]
    h    = line["hits"]
    hr   = line["home_runs"]
    rbi  = line["rbi"]
    r    = line["runs"]
    tb   = line["total_bases"]

    # ── Unprecedented combination ─────────────────────────────
    if h >= 2 and hr >= 1 and rbi >= 3:  # floor to avoid flagging mundane lines
        if db.is_unprecedented(h, hr, rbi, r, tb):
            findings.append({
                "type":        "unprecedented",
                "player_id":   pid,
                "player_name": name,
                "game_pk":     game_pk,
                "game_date":   game_date,
                "details": {
                    "hits": h, "home_runs": hr, "rbi": rbi,
                    "runs": r, "total_bases": tb,
                    "ab": line["ab"],
                },
            })

    # ── 4-homer game ──────────────────────────────────────────
    if hr >= 4:
        findings.append({
            "type":        "four_home_run_game",
            "player_id":   pid,
            "player_name": name,
            "game_pk":     game_pk,
            "game_date":   game_date,
            "details":     {"home_runs": hr, "rbi": rbi, "tb": tb},
        })

    # ── Natural cycle (1B, 2B, 3B, HR in one game) ───────────
    has_single  = (h - line["doubles"] - line["triples"] - hr) >= 1
    has_double  = line["doubles"] >= 1
    has_triple  = line["triples"] >= 1
    has_hr      = hr >= 1
    if has_single and has_double and has_triple and has_hr:
        findings.append({
            "type":        "natural_cycle",
            "player_id":   pid,
            "player_name": name,
            "game_pk":     game_pk,
            "game_date":   game_date,
            "details":     {"hits": h, "2b": line["doubles"], "3b": line["triples"], "hr": hr},
        })

    # ── 6-hit game ────────────────────────────────────────────
    if h >= 6:
        findings.append({
            "type":        "six_hit_game",
            "player_id":   pid,
            "player_name": name,
            "game_pk":     game_pk,
            "game_date":   game_date,
            "details":     {"hits": h, "ab": line["ab"]},
        })

    return findings


def analyze_pitching_line(line: dict, game_pk: int, game_date: date) -> list[dict]:
    findings = []
    pid  = line["player_id"]
    name = line["player_name"]
    k    = line["strikeouts"]

    # ── 20-strikeout game ─────────────────────────────────────
    if k >= 20:
        findings.append({
            "type":        "twenty_strikeouts",
            "player_id":   pid,
            "player_name": name,
            "game_pk":     game_pk,
            "game_date":   game_date,
            "details":     {"strikeouts": k, "ip": line["ip"], "hits": line["hits"]},
        })

    return findings


def check_two_grand_slams(batting_lines: list[dict], game_pk: int,
                           game_date: date) -> list[dict]:
    """
    Detects if any single player hit 2+ grand slams in one game.
    Requires RBI >= 8 and HR >= 2 as a necessary (not sufficient) proxy —
    a definitive check would need play-by-play, so we flag for manual review.
    """
    findings = []
    for line in batting_lines:
        if line["home_runs"] >= 2 and line["rbi"] >= 8:
            findings.append({
                "type":        "two_grand_slams_game",
                "player_id":   line["player_id"],
                "player_name": line["player_name"],
                "game_pk":     game_pk,
                "game_date":   game_date,
                "details": {
                    "hr": line["home_runs"],
                    "rbi": line["rbi"],
                    "note": "2 grand slams suspected — verify via play-by-play",
                },
            })
    return findings


def check_droughts(today: date) -> list[dict]:
    """
    Returns a finding for each rare event that hasn't occurred in
    DROUGHT_ALERT_DAYS days, if the drought crossed a new year threshold today.
    Only fires once per year (on the anniversary) to avoid daily spam.
    """
    alerts = []
    for event_type in RARITY_THRESHOLDS:
        last = db.last_rare_event_date(event_type)
        if not last:
            continue
        last_date = date.fromisoformat(last)
        days = (today - last_date).days
        if days < DROUGHT_ALERT_DAYS:
            continue
        # Fire once per 365-day cycle after the threshold
        years_since = days // 365
        if (days % 365) == 0 or (1 <= (days % 365) <= 3):  # grace window for cron drift
            label = RARITY_THRESHOLDS[event_type]["label"]
            alerts.append({
                "type":        "drought",
                "event_type":  event_type,
                "player_id":   None,
                "player_name": None,
                "game_pk":     None,
                "game_date":   today,
                "details": {
                    "days": days,
                    "last_date": last,
                    "label": label,
                    "years": years_since,
                },
            })
    return alerts
