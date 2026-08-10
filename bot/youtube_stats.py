"""
SportStrata YouTube stats — pulls recent video performance into a plain
report so you can see what's actually working before deciding what to
post next.

Local, run-when-you-want-it. No live-site changes, no server, no schedule
required. Reads channel + video metadata from the YouTube Data API and
performance metrics (views, retention, subscriber effect) from the
YouTube Analytics API, then writes bot/reports/{date}.md and prints a
compact summary to the terminal.

One-time setup (owner-only, can't be scripted):
  1. Google Cloud Console — OAuth 2.0 Client ID (Web application type).
  2. Mint a refresh token via https://developers.google.com/oauthplayground
     (add it as an authorized redirect URI on the client first), using
     scopes:
       https://www.googleapis.com/auth/yt-analytics.readonly
       https://www.googleapis.com/auth/youtube.readonly
  3. Put these three values in bot/.env (gitignored, never commit them):
       YOUTUBE_CLIENT_ID=...
       YOUTUBE_CLIENT_SECRET=...
       YOUTUBE_REFRESH_TOKEN=...

Usage:
  python youtube_stats.py                  # last 90 days, top 25 videos
  python youtube_stats.py --days 30
  python youtube_stats.py --limit 10
"""
import argparse
import os
import re
from datetime import date, timedelta

import requests

from config import YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN, YOUTUBE_CHANNEL_ID

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "reports")

TOKEN_URL = "https://oauth2.googleapis.com/token"
DATA_API = "https://www.googleapis.com/youtube/v3"
ANALYTICS_API = "https://youtubeanalytics.googleapis.com/v2/reports"

_DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


def _require_credentials():
    missing = [n for n, v in [
        ("YOUTUBE_CLIENT_ID", YOUTUBE_CLIENT_ID),
        ("YOUTUBE_CLIENT_SECRET", YOUTUBE_CLIENT_SECRET),
        ("YOUTUBE_REFRESH_TOKEN", YOUTUBE_REFRESH_TOKEN),
    ] if not v]
    if missing:
        raise SystemExit(
            f"Missing {', '.join(missing)} in bot/.env — see the setup steps "
            f"in this file's docstring. Nothing can be fetched without them."
        )


def _get_access_token() -> str:
    r = requests.post(TOKEN_URL, data={
        "client_id": YOUTUBE_CLIENT_ID,
        "client_secret": YOUTUBE_CLIENT_SECRET,
        "refresh_token": YOUTUBE_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }, timeout=15)
    r.raise_for_status()
    return r.json()["access_token"]


def _parse_duration(iso: str) -> int:
    """ISO 8601 duration ('PT1M45S') -> total seconds."""
    m = _DURATION_RE.match(iso or "")
    if not m:
        return 0
    h, mi, s = (int(x) if x else 0 for x in m.groups())
    return h * 3600 + mi * 60 + s


def _fmt_duration(seconds: int) -> str:
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def _get_channel_info(token: str) -> dict:
    # Explicit channel id, not mine=true — mine=true returns the authenticated
    # Google Account's own default channel, which silently pulled the wrong
    # channel's data the first time this ran (2026-08-09) since the account
    # manages more than one channel. YOUTUBE_CHANNEL_ID (config.py) is the
    # fix — always target SportStrata's channel explicitly.
    # part=snippet too (not just contentDetails) so the report can print the
    # actual channel title/handle — a receipt, so a wrong-channel run like
    # the first one is obvious from the report itself, not just inferred
    # from the video titles looking off.
    r = requests.get(f"{DATA_API}/channels", params={
        "part": "snippet,contentDetails", "id": YOUTUBE_CHANNEL_ID, "access_token": token,
    }, timeout=15)
    r.raise_for_status()
    items = r.json().get("items", [])
    if not items:
        raise SystemExit(f"No channel found for id {YOUTUBE_CHANNEL_ID} — check YOUTUBE_CHANNEL_ID in config.py and that this account has access to it.")
    item = items[0]
    return {
        "uploads_playlist_id": item["contentDetails"]["relatedPlaylists"]["uploads"],
        "title": item.get("snippet", {}).get("title", "(unknown)"),
        "custom_url": item.get("snippet", {}).get("customUrl", ""),
    }


def _get_recent_videos(token: str, playlist_id: str, limit: int) -> list[dict]:
    videos, page_token = [], None
    page_num = 0
    while len(videos) < limit:
        page_num += 1
        params = {
            "part": "snippet", "playlistId": playlist_id,
            "maxResults": min(50, limit - len(videos)), "access_token": token,
        }
        if page_token:
            params["pageToken"] = page_token
        r = requests.get(f"{DATA_API}/playlistItems", params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        total = data.get("pageInfo", {}).get("totalResults")
        got = len(data.get("items", []))
        next_tok = data.get("nextPageToken")
        print(f"  (uploads playlist page {page_num}: {got} items, "
              f"totalResults={total}, more pages={'yes' if next_tok else 'no'})")
        for item in data.get("items", []):
            sn = item["snippet"]
            videos.append({
                "video_id": sn["resourceId"]["videoId"],
                "title": sn["title"],
                "published_at": sn["publishedAt"][:10],
            })
        page_token = next_tok
        if not page_token:
            break
    return videos[:limit]


def _get_video_details(token: str, video_ids: list[str]) -> dict:
    """Batched (up to 50 ids/call) — duration + lifetime view/like/comment counts."""
    out = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        r = requests.get(f"{DATA_API}/videos", params={
            "part": "contentDetails,statistics", "id": ",".join(batch), "access_token": token,
        }, timeout=15)
        r.raise_for_status()
        for item in r.json().get("items", []):
            stats = item.get("statistics", {})
            out[item["id"]] = {
                "duration_seconds": _parse_duration(item.get("contentDetails", {}).get("duration", "")),
                "lifetime_views": int(stats.get("viewCount", 0)),
                "lifetime_likes": int(stats.get("likeCount", 0)),
                "lifetime_comments": int(stats.get("commentCount", 0)),
            }
    return out


def _get_analytics(token: str, video_ids: list[str], start: date, end: date) -> dict:
    """Windowed performance per video. Returns {} on failure rather than
    raising — a report with lifetime stats only is still useful; don't let
    one flaky call kill the whole thing."""
    if not video_ids:
        return {}
    out = {}
    try:
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i:i + 50]
            r = requests.get(ANALYTICS_API, params={
                "ids": f"channel=={YOUTUBE_CHANNEL_ID}",
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "metrics": "views,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost",
                "dimensions": "video",
                "filters": "video==" + ",".join(batch),
                "sort": "-views",
                "access_token": token,
            }, timeout=20)
            r.raise_for_status()
            data = r.json()
            headers = [h["name"] for h in data.get("columnHeaders", [])]
            for row in data.get("rows", []):
                rec = dict(zip(headers, row))
                out[rec["video"]] = rec
    except requests.RequestException as e:
        detail = ""
        resp = getattr(e, "response", None)
        if resp is not None:
            detail = f" | response: {resp.text[:300]}"
        print(f"  (Analytics API call failed — {e}{detail}; report will show lifetime stats only)")
    return out


def build_report(videos: list[dict], details: dict, analytics: dict, start: date, end: date, channel_info: dict) -> str:
    handle = f" ({channel_info['custom_url']})" if channel_info.get("custom_url") else ""
    lines = [
        f"# SportStrata YouTube — video performance, {start} to {end}",
        "",
        f"**Channel: {channel_info.get('title', '(unknown)')}{handle}** — if this isn't the channel you expected, "
        f"the id in `YOUTUBE_CHANNEL_ID` (bot/config.py or bot/.env) is wrong, not the script.",
        "",
        f"_Generated by bot/youtube_stats.py. Windowed metrics (views/retention/subs) cover the date range above; "
        f"lifetime views/likes/comments are all-time. Sorted by windowed views where available, else lifetime views._",
        "",
        "| Video | Published | Duration | Views (window) | Avg view % | Subs +/- | Lifetime views | Likes |",
        "|---|---|---|---|---|---|---|---|",
    ]

    def sort_key(v):
        a = analytics.get(v["video_id"])
        if a:
            return (1, int(a.get("views", 0)))
        d = details.get(v["video_id"], {})
        return (0, d.get("lifetime_views", 0))

    for v in sorted(videos, key=sort_key, reverse=True):
        vid = v["video_id"]
        d = details.get(vid, {})
        a = analytics.get(vid)
        title = v["title"].replace("|", "\\|")
        dur = _fmt_duration(d.get("duration_seconds", 0))
        link = f"[{title}](https://youtu.be/{vid})"
        if a:
            views_w = a.get("views", "—")
            avg_pct = f"{float(a.get('averageViewPercentage', 0)):.0f}%"
            subs = int(a.get("subscribersGained", 0)) - int(a.get("subscribersLost", 0))
            subs_str = f"+{subs}" if subs >= 0 else str(subs)
        else:
            views_w, avg_pct, subs_str = "—", "—", "—"
        lines.append(
            f"| {link} | {v['published_at']} | {dur} | {views_w} | {avg_pct} | {subs_str} | "
            f"{d.get('lifetime_views', '—')} | {d.get('lifetime_likes', '—')} |"
        )

    if len(lines) <= 7:
        lines.append("")
        lines.append("_No videos found in this window._")
    return "\n".join(lines)


def main(days: int, limit: int):
    _require_credentials()
    end, start = date.today(), date.today() - timedelta(days=days)

    token = _get_access_token()
    channel_info = _get_channel_info(token)
    handle = f" ({channel_info['custom_url']})" if channel_info.get("custom_url") else ""
    print(f"Channel: {channel_info.get('title', '(unknown)')}{handle}")
    playlist_id = channel_info["uploads_playlist_id"]
    videos = _get_recent_videos(token, playlist_id, limit)
    if not videos:
        print(f"No videos found on channel '{channel_info.get('title', '(unknown)')}'.")
        return

    video_ids = [v["video_id"] for v in videos]
    details = _get_video_details(token, video_ids)
    analytics = _get_analytics(token, video_ids, start, end)

    report = build_report(videos, details, analytics, start, end, channel_info)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    path = os.path.join(REPORTS_DIR, f"{date.today()}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Wrote {path}  ({len(videos)} videos, {len(analytics)} with windowed analytics)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90, help="Lookback window for windowed metrics (default: 90)")
    ap.add_argument("--limit", type=int, default=25, help="Max videos to include (default: 25)")
    args = ap.parse_args()
    main(args.days, args.limit)
