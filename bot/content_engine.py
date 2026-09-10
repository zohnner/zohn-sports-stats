"""Review-first NFL and college-football short-form content drafts.

The engine uses deterministic templates rather than an LLM: each claim maps to
the cited ESPN scoreboard event, so a reviewer can verify it before publishing.
"""
import argparse
import json
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football"
LEAGUES = {"nfl", "ncaaf"}
ESPN_LEAGUE_PATHS = {"nfl": "nfl", "ncaaf": "college-football"}
MAX_SCRIPT_WORDS = 140
MAX_TODAYS_PICKS = 3
QUEUE_DIR = Path(__file__).with_name("content-queue")


def _fetch_espn_json(league: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
    if league not in LEAGUES:
        raise ValueError(f"Unsupported league: {league}")
    query = urlencode(params)
    request = Request(
        f"{ESPN_BASE}/{ESPN_LEAGUE_PATHS[league]}{path}?{query}",
        headers={"Accept": "application/json", "User-Agent": "SportStrataContentEngine/1.0"},
    )
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def fetch_scoreboard(league: str, target: date) -> list[dict[str, Any]]:
    """Return completed ESPN scoreboard events for one league and calendar day."""
    payload = _fetch_espn_json(league, "/scoreboard", {"dates": target.strftime("%Y%m%d"), "limit": 500})
    return [event for event in payload.get("events", []) if _is_final(event)]


def fetch_game_summary(league: str, event_id: str) -> dict[str, Any]:
    return _fetch_espn_json(league, "/summary", {"event": event_id})


def _is_final(event: dict[str, Any]) -> bool:
    status = event.get("status", {}).get("type", {})
    return bool(status.get("completed")) or status.get("name", "").startswith("STATUS_FINAL")


def _competitors(event: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
    competitors = ((event.get("competitions") or [{}])[0]).get("competitors") or []
    if len(competitors) != 2:
        return None
    winner = next((team for team in competitors if team.get("winner")), None)
    loser = next((team for team in competitors if not team.get("winner")), None)
    return (winner, loser) if winner and loser else None


def _team_name(team: dict[str, Any]) -> str:
    return team.get("team", {}).get("displayName", "Unknown team")


def _score(team: dict[str, Any]) -> int:
    try:
        return int(team.get("score", 0))
    except (TypeError, ValueError):
        return 0


def _rank(team: dict[str, Any]) -> int | None:
    rank = team.get("curatedRank", {}).get("current")
    return rank if isinstance(rank, int) and 1 <= rank <= 25 else None


def _source_url(event: dict[str, Any]) -> str:
    event_id = event.get("id", "")
    return f"https://www.espn.com/football/game/_/gameId/{event_id}" if event_id else "https://www.espn.com/"


def _team_asset(team: dict[str, Any]) -> dict[str, str | None]:
    data = team.get("team", {})
    logos = data.get("logos") or []
    logo = data.get("logo") or (logos[0].get("href") if logos else None)
    return {"name": _team_name(team), "logo": logo, "color": data.get("color"), "alternate_color": data.get("alternateColor")}


def _period_scores(team: dict[str, Any]) -> list[str]:
    return [str(period.get("displayValue", period.get("value", "—"))) for period in team.get("linescores") or []]


def _leaders_from_summary(summary: dict[str, Any]) -> list[str]:
    leaders: list[str] = []
    for category in summary.get("leaders") or []:
        leader = (category.get("leaders") or [{}])[0]
        athlete = leader.get("athlete", {}).get("displayName")
        value = leader.get("displayValue") or leader.get("value")
        label = category.get("displayName") or category.get("name")
        if athlete and value and label:
            leaders.append(f"{label}: {athlete} — {value}")
    return leaders[:3]


def detect_stories(events: list[dict[str, Any]], league: str) -> list[dict[str, Any]]:
    """Create stories whose premise is established by the final score alone."""
    stories: list[dict[str, Any]] = []
    for event in events:
        sides = _competitors(event)
        if not sides:
            continue
        winner, loser = sides
        winner_score, loser_score = _score(winner), _score(loser)
        margin, total = winner_score - loser_score, winner_score + loser_score
        winner_rank, loser_rank = _rank(winner), _rank(loser)
        common = {
            "league": league, "event_id": event.get("id", ""), "game_name": event.get("name", "Final score"),
            "winner": _team_name(winner), "loser": _team_name(loser), "winner_score": winner_score,
            "loser_score": loser_score, "winner_rank": winner_rank, "loser_rank": loser_rank,
            "source_url": _source_url(event), "team_assets": [_team_asset(winner), _team_asset(loser)],
            "score_by_period": {"winner": _period_scores(winner), "loser": _period_scores(loser)},
        }
        if league == "ncaaf" and loser_rank and (not winner_rank or winner_rank > loser_rank):
            stories.append({**common, "type": "ranked_upset", "priority": min(100, 65 + max(0, 26 - loser_rank))})
        if total >= 70 and margin <= 7:
            stories.append({**common, "type": "shootout", "priority": min(100, 55 + (total - 70))})
        if margin >= 21 and winner_score >= 35:
            rank_bonus = 10 if winner_rank and winner_rank <= 10 else 0
            stories.append({**common, "type": "statement_win", "priority": min(100, 45 + min(25, margin - 20) + rank_bonus)})
    return sorted(stories, key=lambda story: story["priority"], reverse=True)


def enrich_story(story: dict[str, Any]) -> dict[str, Any]:
    """Add optional editor context without ever blocking a verified score story."""
    try:
        summary = fetch_game_summary(story["league"], story["event_id"])
        leaders = _leaders_from_summary(summary)
    except (OSError, ValueError, json.JSONDecodeError):
        leaders = []
    return {**story, "leaders": leaders}


def select_today_picks(stories: list[dict[str, Any]], limit: int = MAX_TODAYS_PICKS) -> list[dict[str, Any]]:
    picks, seen_events = [], set()
    for story in stories:
        if story["event_id"] in seen_events:
            continue
        picks.append(story)
        seen_events.add(story["event_id"])
        if len(picks) == limit:
            break
    return picks


def _rank_label(rank: int | None) -> str:
    return f"No. {rank} " if rank else ""


def build_script(story: dict[str, Any]) -> str:
    """Produce a sub-140-word vertical-video draft from verified story data."""
    winner = f"{_rank_label(story['winner_rank'])}{story['winner']}"
    loser = f"{_rank_label(story['loser_rank'])}{story['loser']}"
    score = f"{story['winner_score']}-{story['loser_score']}"
    if story["type"] == "ranked_upset":
        script = (
            f"{winner} just changed the conversation. They beat {loser}, {score}. "
            f"The result matters because {loser} entered the game ranked, while {story['winner']} finished the night on top. "
            "No invented narratives, no noise: the final score is the receipt. "
            "Was this the start of a real climb, or one unforgettable Saturday? Follow SportStrata for the numbers behind the next result."
        )
    elif story["type"] == "shootout":
        total = story["winner_score"] + story["loser_score"]
        script = (
            f"This one turned into a track meet. {winner} held off {loser}, {score}, in a game with {total} combined points. "
            "That is a one-score final, which means every possession carried weight late. "
            f"The receipt is simple: {story['winner_score']} for the winner, {story['loser_score']} for the loser. "
            "Which side impressed you more: the offense that survived, or the one that nearly stole it? Follow SportStrata for the next slate."
        )
    else:
        margin = story["winner_score"] - story["loser_score"]
        script = (
            f"{winner} did not just win. They made a statement. The final: {winner} {score} over {loser}, a {margin}-point margin. "
            f"Scoring {story['winner_score']} and holding the opponent to {story['loser_score']} is the kind of result that changes a weekly resume. "
            "The score is the receipt. Now the question is whether they can carry that form into the next matchup. Follow SportStrata for the numbers that matter."
        )
    if len(script.split()) > MAX_SCRIPT_WORDS:
        raise ValueError("Script exceeded the content-engine word limit")
    return script


def build_youtube_package(story: dict[str, Any]) -> dict[str, Any]:
    """Return the copy and edit brief needed to turn a story into one Short."""
    winner = story["winner"]
    loser = story["loser"]
    score = f"{story['winner_score']}-{story['loser_score']}"
    league_tag = "#NFL" if story["league"] == "nfl" else "#CollegeFootball"
    if story["type"] == "ranked_upset":
        title = f"{winner} Stuns {_rank_label(story['loser_rank'])}{loser}"
        hook = f"Open on the decisive clip with: {winner} changed the conversation."
    elif story["type"] == "shootout":
        title = f"{winner} vs. {loser} Was a Track Meet"
        hook = f"Open on the loudest scoring clip, then reveal {score}."
    else:
        title = f"{winner} Made a Statement Against {loser}"
        hook = f"Open on the biggest momentum-play clip and reveal the final: {score}."
    return {
        "title": title,
        "caption": f"Final: {winner} {score} {loser}.\n\nThe score is the receipt. {league_tag} #Sports #Shorts\n\nSource: {story['source_url']}",
        "voiceover": build_script(story),
        "visual_beats": [
            f"0–3s — {hook}",
            f"3–10s — Show a score graphic: {winner} {score} {loser}.",
            "10–25s — Use two or three clips that match the narrated turning point.",
            "25–40s — Return to the SportStrata final-score card and source receipt.",
            "40–55s — Close on the question from the script and SportStrata mark.",
        ],
    }


def build_edit_manifest(story: dict[str, Any]) -> dict[str, Any]:
    return {
        "event_id": story["event_id"],
        "source_url": story["source_url"],
        "clip_search_terms": [f"{story['winner']} highlights", f"{story['loser']} highlights", story["game_name"]],
        "team_assets": story.get("team_assets", []),
        "score_by_period": story.get("score_by_period", {}),
        "leaders": story.get("leaders", []),
    }


def render_queue(stories: list[dict[str, Any]], league: str, target: date) -> str:
    lines = [
        f"# SportStrata {league.upper()} content queue — {target.isoformat()}", "",
        "Review each draft before publication. Claims are limited to the cited final-score data; do not add injury, betting, or historical claims without a separate verified source.", "",
    ]
    if not stories:
        return "\n".join(lines + ["_No qualifying final-score stories found._", ""])
    for index, story in enumerate(stories, start=1):
        title = story["type"].replace("_", " ").title()
        package = build_youtube_package(story)
        lines.extend([
            f"## {index}. {title} — priority {story['priority']}/100", "", "- [ ] Approved for production",
            f"- Source: [{story['game_name']}]({story['source_url']})",
            f"- Evidence: {story['winner']} {story['winner_score']}, {story['loser']} {story['loser_score']}", "",
            "### YouTube Shorts production pack", "", f"**Title:** {package['title']}", "",
            "**Voiceover — copy/paste this:**", "", package["voiceover"], "", "**Caption:**", "", package["caption"], "",
            "**Visual beats:**", *(f"- {beat}" for beat in package["visual_beats"]), "",
            "**Editor manifest:**", "", "```json", json.dumps(build_edit_manifest(story), indent=2), "```", "",
            "Use only clips you have the right to use. Pair them with original SportStrata score cards; do not imply any claim beyond the evidence above.", "",
        ])
    return "\n".join(lines)


def render_today_pick(stories: list[dict[str, Any]], league: str, target: date) -> str:
    lines = [f"# SportStrata {league.upper()} Today’s Pick — {target.isoformat()}", "", "Start here. These are the highest-priority unique games from today’s queue.", ""]
    picks = select_today_picks(stories)
    if not picks:
        return "\n".join(lines + ["_No qualifying final-score stories today. No action needed._", ""])
    for index, story in enumerate(picks, start=1):
        package = build_youtube_package(story)
        lines.extend([
            f"## {index}. {package['title']}", "", f"- Source: [{story['game_name']}]({story['source_url']})",
            f"- Evidence: {story['winner']} {story['winner_score']}, {story['loser']} {story['loser_score']}", "",
            "### Voiceover — copy/paste this", "", package["voiceover"], "", "### Caption", "", package["caption"], "",
            "### Visual beats", *(f"- {beat}" for beat in package["visual_beats"]), "", "### Editor manifest", "", "```json",
            json.dumps(build_edit_manifest(story), indent=2), "```", "",
        ])
    return "\n".join(lines)


def write_queue(league: str, target: date, output_dir: Path = QUEUE_DIR) -> tuple[Path, Path]:
    stories = [enrich_story(story) for story in detect_stories(fetch_scoreboard(league, target), league)]
    output_dir.mkdir(parents=True, exist_ok=True)
    queue_path = output_dir / f"{target.isoformat()}-{league}.md"
    pick_path = output_dir / f"{target.isoformat()}-{league}-todays-pick.md"
    queue_path.write_text(render_queue(stories, league, target), encoding="utf-8")
    pick_path.write_text(render_today_pick(stories, league, target), encoding="utf-8")
    return queue_path, pick_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build review-first SportStrata football content drafts.")
    parser.add_argument("--league", choices=sorted(LEAGUES), required=True)
    parser.add_argument("--date", help="Target date (YYYY-MM-DD); defaults to today")
    parser.add_argument("--output-dir", type=Path, default=QUEUE_DIR)
    args = parser.parse_args()
    target = date.fromisoformat(args.date) if args.date else datetime.now().date()
    queue_path, pick_path = write_queue(args.league, target, args.output_dir)
    print(f"Wrote {queue_path}")
    print(f"Wrote {pick_path}")


if __name__ == "__main__":
    main()
