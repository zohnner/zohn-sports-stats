"""Draft Trophy Case award data from Wikidata for human review.

WHY THIS EXISTS (D-116): the original Trophy Case build hand-curated
data/awards-<sport>.json by having an AI assistant research each player
conversationally (Pro-Football-Reference / Baseball-Reference bio pages +
dedicated award-list pages + Wikipedia infobox cross-checks). That worked
but does not scale past a handful of players per session, and depends on
scraping sites (PFR/BR) whose terms restrict automated access.

This script queries Wikidata's SPARQL endpoint instead. Wikidata models
"award received" as a structured property (P166) with a "point in time"
qualifier (P585) for the season/year -- this is the same underlying data
that generates the Wikipedia infobox lines the original research repeatedly
fell back on for cross-checking (e.g. "8x All-Star (2016-2019, 2021-2024)").
Querying it directly is *more* reliable than asking a model to summarize a
bio page, not less: several of the errors caught during the original NFL/MLB
research (a false 2021 Astros championship claim, an impossible 2020
All-Star selection, conflicting All-Star counts across three page-summary
attempts) were exactly the kind of thing a structured, sourced property
avoids by construction.

WHAT THIS SCRIPT DOES NOT DO: it never writes to data/awards-<sport>.json
directly, and it never runs as a GitHub Action with write access to this
repo (see .github/workflows/trophy-case-research.yml -- contents: read,
same as the existing content-queue.yml). Its output is a draft file plus a
plain-English review summary, uploaded as a build artifact. A human (or an
AI assistant working on the human's behalf, per D-116's "scheduled AI
research, you approve" automation tier) reviews the draft -- especially
every record flagged needs_review -- before merging anything into the real
data file through the repo's normal commit path.

CAVEAT (be upfront about this, don't bury it): this script has NOT been
run against live Wikidata as of the commit that adds it. The author's own
tooling could not reach wikidata.org/query.wikidata.org to test-execute it
in the session that wrote this file. The query shapes and property IDs
(P166, P585, P54, P580, P582) are Wikidata's well-documented, stable public
schema, but the *coverage and exact label text* Wikidata has for any given
athlete is unverified until this actually runs. Treat the first real run
as a supervised dry run, not a trusted pipeline -- spot-check its output
against the same discipline the original NFL/MLB research used before
trusting a full season's worth of unattended runs.

Usage:
    python bot/trophy_case_research.py --sport nfl --players "Lamar Jackson" "Josh Allen"
    python bot/trophy_case_research.py --sport mlb --players-file bot/trophy-case-watchlist-mlb.txt
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen

WIKIDATA_SEARCH = "https://www.wikidata.org/w/api.php"
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "SportStrataTrophyCaseResearch/0.1 (https://sportstrata.cc; contact via repo owner)"
OUT_DIR = Path(__file__).with_name("trophy-case-drafts")

# Sport-specific "is this Wikidata item actually an athlete in this sport"
# disambiguation hints, checked against the item's occupation/sport claims
# during search-result resolution. Deliberately conservative: if a name is
# ambiguous and none of these hints match confidently, the script flags it
# for a human to supply an explicit QID rather than guessing.
SPORT_HINTS: dict[str, list[str]] = {
    "nfl": ["american football", "gridiron football"],
    "mlb": ["baseball"],
    "ncaaf": ["american football"],
    "ncaab": ["basketball"],
    "wnba": ["basketball"],
}

# Label substrings (case-insensitive) mapped to this repo's taxonomy type
# keys (js/achievements.js ACHIEVEMENT_TAXONOMY). Order matters within a
# sport -- first match wins -- so more specific phrases are listed before
# more general ones (e.g. "Super Bowl Most Valuable Player" before "Most
# Valuable Player"). A label that matches nothing here is NOT dropped --
# it ships in the draft as type "UNMAPPED: <label>" with needs_review set,
# so a real Wikidata label variant never silently disappears. Extend this
# table as real runs surface label text this list didn't anticipate.
AWARD_LABEL_MAP: dict[str, list[tuple[str, str]]] = {
    "nfl": [
        ("super bowl champion", "championship"),
        ("super bowl most valuable player", "championship_mvp"),
        ("super bowl mvp", "championship_mvp"),
        ("nfl most valuable player", "season_mvp"),
        ("ap most valuable player", "season_mvp"),
        ("associated press nfl most valuable player", "season_mvp"),
        ("offensive player of the year", "opoy"),
        ("defensive player of the year", "dpoy"),
        ("offensive rookie of the year", "oroty"),
        ("defensive rookie of the year", "droty"),
        ("walter payton", "walter_payton_moty"),
        ("comeback player of the year", "comeback_poy"),
        ("first-team all-pro", "all_pro"),
        ("first team all-pro", "all_pro"),
        ("pro bowl", "pro_bowl"),
        ("conference championship", "conference_championship"),
    ],
    "mlb": [
        ("world series champion", "championship"),
        ("world series most valuable player", "championship_mvp"),
        ("world series mvp", "championship_mvp"),
        ("most valuable player", "season_mvp"),
        ("cy young", "cy_young"),
        ("rookie of the year", "rookie_of_year"),
        ("gold glove", "gold_glove"),
        ("silver slugger", "silver_slugger"),
        ("comeback player of the year", "comeback_poy"),
        ("roberto clemente award", "roberto_clemente"),
        ("all-star", "all_star"),
    ],
}

# NL/AL and AFC/NFC-qualified MVP labels ("National League Most Valuable
# Player Award") still match "most valuable player" above via substring,
# so no separate entries are needed for the league-qualified forms.


@dataclass
class AwardRecord:
    type: str
    season: int | None
    team: str | None
    wikidata_label: str
    needs_review: bool
    review_reason: str = ""


@dataclass
class PlayerResult:
    name: str
    qid: str | None
    records: list[AwardRecord] = field(default_factory=list)
    resolution_notes: list[str] = field(default_factory=list)


def _http_get_json(url: str) -> Any:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def resolve_qid(name: str, sport: str) -> tuple[str | None, list[str]]:
    """Search Wikidata for `name`, return a QID only if a sport-hint disambiguates
    it confidently. Ambiguous or hintless matches return None with notes explaining
    why -- callers should ask a human for an explicit QID in that case rather than
    guessing between candidates."""
    notes: list[str] = []
    search_url = (
        f"{WIKIDATA_SEARCH}?action=wbsearchentities&search={quote(name)}"
        f"&language=en&type=item&limit=8&format=json"
    )
    try:
        results = _http_get_json(search_url).get("search", [])
    except Exception as exc:  # network/parse failure -- never silently proceed
        notes.append(f"search request failed: {exc}")
        return None, notes

    if not results:
        notes.append("no Wikidata search results for this name")
        return None, notes

    hints = SPORT_HINTS.get(sport, [])
    candidates = []
    for r in results:
        desc = (r.get("description") or "").lower()
        if any(h in desc for h in hints):
            candidates.append(r)

    if len(candidates) == 1:
        return candidates[0]["id"], notes

    if not candidates:
        notes.append(
            f"{len(results)} search result(s), none of their descriptions matched "
            f"sport hints {hints!r} -- top result was {results[0].get('id')} "
            f"({results[0].get('description')!r}); needs a human-supplied QID"
        )
        return None, notes

    notes.append(
        f"{len(candidates)} ambiguous sport-matching candidates: "
        + ", ".join(f"{c['id']} ({c.get('description')!r})" for c in candidates)
        + " -- needs a human-supplied QID to disambiguate"
    )
    return None, notes


def _sparql(query: str) -> list[dict[str, Any]]:
    url = f"{WIKIDATA_SPARQL}?query={quote(query)}&format=json"
    data = _http_get_json(url)
    return data.get("results", {}).get("bindings", [])


AWARDS_QUERY = """
SELECT ?awardLabel ?year WHERE {{
  wd:{qid} p:P166 ?stmt .
  ?stmt ps:P166 ?award .
  OPTIONAL {{ ?stmt pq:P585 ?time . BIND(YEAR(?time) AS ?year) }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""

TEAMS_QUERY = """
SELECT ?teamLabel ?start ?end WHERE {{
  wd:{qid} p:P54 ?stmt .
  ?stmt ps:P54 ?team .
  OPTIONAL {{ ?stmt pq:P580 ?start . }}
  OPTIONAL {{ ?stmt pq:P582 ?end . }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
}}
"""


def fetch_award_statements(qid: str) -> list[dict[str, Any]]:
    return _sparql(AWARDS_QUERY.format(qid=qid))


def fetch_team_intervals(qid: str) -> list[dict[str, Any]]:
    return _sparql(TEAMS_QUERY.format(qid=qid))


def _team_for_season(intervals: list[dict[str, Any]], season: int | None) -> tuple[str | None, str]:
    """Best-effort: find a team whose [start, end) interval covers `season`.
    Returns (team_label_or_None, note). A season falling in more than one
    interval (mid-season trade) or in none returns None with an explanatory
    note rather than a guess -- team resolution is exactly the kind of thing
    that needs a human's eyes (see the Zack Greinke 2019 trade case in
    DECISIONS.md D-116, resolved by hand this session)."""
    if season is None:
        return None, "no season/year on this award, cannot resolve a team"
    matches = []
    for iv in intervals:
        start_year = int(iv["start"]["value"][:4]) if "start" in iv else None
        end_year = int(iv["end"]["value"][:4]) if "end" in iv else None
        if (start_year is None or start_year <= season) and (end_year is None or season <= end_year):
            matches.append(iv.get("teamLabel", {}).get("value"))
    matches = [m for m in matches if m]
    if len(matches) == 1:
        return matches[0], ""
    if not matches:
        return None, f"no team-membership interval covers season {season}"
    return None, f"{len(matches)} team intervals cover season {season} ({matches}) -- likely a mid-season trade"


def _map_award_type(sport: str, label: str) -> tuple[str, bool, str]:
    low = label.lower()
    for phrase, taxonomy_type in AWARD_LABEL_MAP.get(sport, []):
        if phrase in low:
            return taxonomy_type, False, ""
    return f"UNMAPPED: {label}", True, "no entry in AWARD_LABEL_MAP matched this Wikidata award label"


def research_player(name: str, sport: str, qid_override: str | None = None) -> PlayerResult:
    qid = qid_override
    notes: list[str] = []
    if qid is None:
        qid, notes = resolve_qid(name, sport)
    result = PlayerResult(name=name, qid=qid, resolution_notes=notes)
    if qid is None:
        return result

    try:
        award_rows = fetch_award_statements(qid)
    except Exception as exc:
        result.resolution_notes.append(f"award query failed: {exc}")
        return result

    try:
        team_intervals = fetch_team_intervals(qid)
    except Exception as exc:
        team_intervals = []
        result.resolution_notes.append(f"team-interval query failed (team fields will be blank): {exc}")

    for row in award_rows:
        label = row.get("awardLabel", {}).get("value", "")
        if not label:
            continue
        season = int(row["year"]["value"]) if "year" in row else None
        taxonomy_type, needs_review, reason = _map_award_type(sport, label)
        team, team_note = _team_for_season(team_intervals, season)
        if team is None and not needs_review:
            needs_review = True
            reason = team_note
        result.records.append(
            AwardRecord(
                type=taxonomy_type,
                season=season,
                team=team,
                wikidata_label=label,
                needs_review=needs_review,
                review_reason=reason,
            )
        )
    return result


def _norm_key(name: str) -> str:
    # Mirrors js/config.js's _normName() closely enough for draft purposes --
    # strip diacritics, dots, Jr/Sr/roman-numeral suffixes, collapse whitespace.
    # This is NOT imported from the JS source (different language); if the
    # real _normName() ever changes, update this to match or the draft's keys
    # won't line up with what the site actually looks up at render time.
    import unicodedata

    decomposed = unicodedata.normalize("NFD", name.lower())
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    stripped = stripped.replace(".", "")
    stripped = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", stripped)
    return re.sub(r"\s+", " ", stripped).strip()


def build_draft(sport: str, names: list[str], qid_overrides: dict[str, str]) -> dict[str, Any]:
    draft: dict[str, Any] = {}
    summary_lines: list[str] = []
    for name in names:
        result = research_player(name, sport, qid_overrides.get(name))
        key = _norm_key(name)
        if result.qid is None:
            summary_lines.append(f"SKIPPED {name}: could not resolve a QID ({'; '.join(result.resolution_notes)})")
            continue
        records = [
            {
                "type": r.type,
                "season": r.season,
                "team": r.team,
                "_wikidata_label": r.wikidata_label,
                "_needs_review": r.needs_review,
                "_review_reason": r.review_reason,
            }
            for r in result.records
        ]
        draft[key] = records
        flagged = sum(1 for r in result.records if r.needs_review)
        summary_lines.append(
            f"{name} ({result.qid}): {len(records)} record(s), {flagged} flagged for review"
            + (f" -- notes: {'; '.join(result.resolution_notes)}" if result.resolution_notes else "")
        )
    return {"draft": draft, "summary": summary_lines}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sport", required=True, choices=sorted(AWARD_LABEL_MAP.keys()))
    parser.add_argument("--players", nargs="*", default=[], help="Player full names, space-separated")
    parser.add_argument("--players-file", type=Path, help="Text file, one player name per line")
    parser.add_argument(
        "--qid",
        action="append",
        default=[],
        metavar="Name=Q123",
        help="Explicit QID override for a name, e.g. --qid 'Lamar Jackson=Q3628164'. "
        "Use when auto-resolution can't disambiguate a common name.",
    )
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    names = list(args.players)
    if args.players_file:
        names += [
            line.strip()
            for line in args.players_file.read_text(encoding="utf-8").splitlines()
            if line.strip() and not line.strip().startswith("#")
        ]
    if not names:
        parser.error("no players given -- pass --players or --players-file")

    qid_overrides: dict[str, str] = {}
    for entry in args.qid:
        if "=" not in entry:
            parser.error(f"--qid must be Name=Q123, got: {entry!r}")
        name, qid = entry.split("=", 1)
        qid_overrides[name] = qid

    result = build_draft(args.sport, names, qid_overrides)

    out_path = args.out or (OUT_DIR / f"awards-{args.sport}-draft.json")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result["draft"], indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    summary_path = out_path.with_suffix(".summary.txt")
    summary_path.write_text(
        "Trophy Case research draft -- REVIEW BEFORE MERGING (D-116)\n"
        "Every record needing a second look is flagged _needs_review in the draft JSON.\n"
        "This pipeline has not been battle-tested at scale; sanity-check a sample of\n"
        "unflagged records too, not just the flagged ones, especially on early runs.\n\n"
        + "\n".join(result["summary"])
        + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {out_path}", file=sys.stderr)
    print(f"Wrote {summary_path}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
