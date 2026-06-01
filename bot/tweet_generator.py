"""
Tweet templates — precision voice only.
One strong claim word, stat line, SportStrata link. No emoji beyond ⚾.
Kael's spec: broadcast-grade authority, not consumer sports hype.
"""
from config import SPORTSTRATA_URL


def _player_link(player_id: int) -> str:
    return f"{SPORTSTRATA_URL}/#mlb-player-{player_id}"


def _leaders_link() -> str:
    return f"{SPORTSTRATA_URL}/#mlb-leaders"


def unprecedented(finding: dict) -> str:
    d    = finding["details"]
    name = finding["player_name"]
    date = finding["game_date"]

    avg  = f"{d['hits']}-for-{d['ab']}" if d.get("ab") else f"{d['hits']} H"
    line = (
        f"{avg}, {d['home_runs']} HR, {d['rbi']} RBI, "
        f"{d['runs']} R, {d['total_bases']} TB"
    )
    link = _player_link(finding["player_id"])

    return (
        f"Unprecedented.\n\n"
        f"{name} · {date}\n"
        f"{line}\n\n"
        f"No MLB player has produced this combination of hits, home runs, RBI, runs, "
        f"and total bases in a single game.\n\n"
        f"Full stat profile: {link}"
    )


def rare_event(finding: dict) -> str:
    d         = finding["details"]
    name      = finding["player_name"]
    game_date = finding["game_date"]
    etype     = finding["type"]
    link      = _player_link(finding["player_id"])

    if etype == "four_home_run_game":
        return (
            f"⚾ {name} hit 4 home runs on {game_date}.\n\n"
            f"{d['home_runs']} HR · {d['rbi']} RBI · {d['tb']} total bases\n\n"
            f"This has happened fewer than 20 times in MLB history — rarer than a perfect game.\n\n"
            f"Full stat profile: {link}"
        )

    if etype == "natural_cycle":
        return (
            f"Natural cycle.\n\n"
            f"{name} · {game_date}\n"
            f"Single, double, triple, and home run — in that order.\n\n"
            f"This has occurred fewer than 15 times in MLB history.\n\n"
            f"Full stat profile: {link}"
        )

    if etype == "six_hit_game":
        return (
            f"{name} went {d['hits']}-for-{d['ab']} on {game_date}.\n\n"
            f"A 6-hit game is one of baseball's rarest single-game batting feats.\n\n"
            f"Full stat profile: {link}"
        )

    if etype == "two_grand_slams_game":
        return (
            f"Two grand slams in one game.\n\n"
            f"{name} · {game_date}\n"
            f"{d['hr']} HR · {d['rbi']} RBI\n\n"
            f"This has happened 12 times in MLB history — rarer than a perfect game.\n\n"
            f"Full stat profile: {link}"
        )

    if etype == "twenty_strikeouts":
        return (
            f"20 strikeouts.\n\n"
            f"{name} · {game_date} · {d['ip']} IP\n\n"
            f"This has happened only 5 times in MLB history.\n\n"
            f"Full stat profile: {link}"
        )

    # Fallback for any new rare event type
    return (
        f"Historic: {name} · {game_date}\n"
        f"Details: {d}\n\n"
        f"Full stat profile: {link}"
    )


def drought(finding: dict) -> str:
    d     = finding["details"]
    label = d["label"]
    days  = d["days"]
    last  = d["last_date"]
    link  = _leaders_link()

    return (
        f"{days} days since the last {label} in MLB history.\n\n"
        f"Last occurrence: {last}\n\n"
        f"MLB leaders and records: {link}"
    )


def build(finding: dict) -> str | None:
    """
    Dispatches a finding to the correct template.
    Returns None if the finding type has no template (should not tweet it).
    """
    t = finding["type"]
    if t == "unprecedented":
        return unprecedented(finding)
    if t == "drought":
        return drought(finding)
    if t in ("four_home_run_game", "natural_cycle", "six_hit_game",
             "two_grand_slams_game", "twenty_strikeouts"):
        return rare_event(finding)
    return None
