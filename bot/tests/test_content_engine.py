import sys
import unittest
from datetime import date
from io import StringIO
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import content_engine


def final_event(winner_score="42", loser_score="35", winner_rank=None, loser_rank=None):
    def competitor(name, score, winner, rank):
        item = {"team": {"displayName": name}, "score": score, "winner": winner}
        if rank:
            item["curatedRank"] = {"current": rank}
        return item
    return {"id": "401999999", "name": "Example Final", "status": {"type": {"completed": True}}, "competitions": [{"competitors": [competitor("Example Winners", winner_score, True, winner_rank), competitor("Example Losers", loser_score, False, loser_rank)]}]}


class ContentEngineTests(unittest.TestCase):
    def test_ranked_upset_has_a_script_and_receipt(self):
        stories = content_engine.detect_stories([final_event(loser_rank=7)], "ncaaf")
        upset = next(story for story in stories if story["type"] == "ranked_upset")
        self.assertLessEqual(len(content_engine.build_script(upset).split()), 140)
        rendered = content_engine.render_queue([upset], "ncaaf", date(2026, 9, 5))
        self.assertIn("Approved for production", rendered)
        self.assertIn("https://www.espn.com/football/game/_/gameId/401999999", rendered)

    def test_shootout_is_not_an_upset_without_ranked_context(self):
        stories = content_engine.detect_stories([final_event()], "nfl")
        self.assertEqual([story["type"] for story in stories], ["shootout"])

    def test_incomplete_games_are_not_stories(self):
        event = final_event()
        event["status"]["type"]["completed"] = False
        self.assertFalse(content_engine._is_final(event))

    def test_ncaaf_uses_espns_college_football_endpoint(self):
        with patch("content_engine.urlopen", return_value=StringIO('{"events": []}')) as mocked:
            self.assertEqual(content_engine.fetch_scoreboard("ncaaf", date(2026, 7, 28)), [])
        self.assertIn("/college-football/scoreboard", mocked.call_args.args[0].full_url)

    def test_youtube_package_has_copy_ready_voiceover_and_edit_beats(self):
        story = content_engine.detect_stories([final_event()], "nfl")[0]
        package = content_engine.build_youtube_package(story)
        self.assertIn("#Shorts", package["caption"])
        self.assertLessEqual(len(package["voiceover"].split()), 140)
        self.assertEqual(len(package["visual_beats"]), 5)

    def test_todays_pick_deduplicates_games_and_includes_edit_manifest(self):
        stories = content_engine.detect_stories([final_event(loser_rank=7)], "ncaaf")
        picks = content_engine.select_today_picks(stories)
        self.assertEqual(len(picks), 1)
        rendered = content_engine.render_today_pick(stories, "ncaaf", date(2026, 9, 5))
        self.assertIn("Editor manifest", rendered)
        self.assertIn("clip_search_terms", rendered)

    def test_summary_enrichment_is_optional_editor_context(self):
        story = content_engine.detect_stories([final_event()], "nfl")[0]
        summary = {"leaders": [{"displayName": "Passing", "leaders": [{"athlete": {"displayName": "Example QB"}, "displayValue": "300 YDS, 3 TD"}]}]}
        with patch("content_engine.fetch_game_summary", return_value=summary):
            enriched = content_engine.enrich_story(story)
        manifest = content_engine.build_edit_manifest(enriched)
        self.assertEqual(enriched["leaders"], ["Passing: Example QB — 300 YDS, 3 TD"])
        self.assertEqual(manifest["leaders"], enriched["leaders"])
        self.assertEqual(len(manifest["team_assets"]), 2)


if __name__ == "__main__":
    unittest.main()
