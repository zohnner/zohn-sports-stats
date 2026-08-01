#!/usr/bin/env python3
"""
NFL Play Visualizer – API‑powered version
Fetches real play data from nflverse APIs.
"""

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.animation as animation
from matplotlib.patches import Rectangle, Circle, Ellipse
import argparse
import os
import sys
import pickle
import re
from math import sin, cos, radians, hypot

# ---------- optional rich for pretty UI ----------
try:
    from rich.console import Console
    from rich.table import Table
    from rich.prompt import Prompt
    console = Console()
    RICH_AVAILABLE = True
except ImportError:
    RICH_AVAILABLE = False
    def print_table(data, headers):
        col_widths = [max(len(str(h)), max((len(str(row[i])) for row in data), default=0)) for i, h in enumerate(headers)]
        header_line = " | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers))
        print(header_line)
        print("-" * len(header_line))
        for row in data:
            print(" | ".join(str(cell).ljust(col_widths[i]) for i, cell in enumerate(row)))

# ---------- API imports ----------
try:
    import nfl_data_py as nfl
    import nflreadpy
    API_AVAILABLE = True
except ImportError:
    API_AVAILABLE = False
    print("WARNING: nfl_data_py or nflreadpy not installed. Install with: pip install nfl_data_py nflreadpy")

# ---------- configuration ----------
FIELD_LENGTH = 120
FIELD_WIDTH = 53.3
END_ZONE_DEPTH = 10
YARD_LINE_INTERVAL = 10

HOME_COLOR = '#0B162A'
AWAY_COLOR = '#C60C30'
BALL_COLOR = '#8B4513'
FIELD_COLOR = '#2E8B57'
END_ZONE_COLOR = '#1A5E2A'
LINE_COLOR = 'white'
DATA_FPS = 10

# ---------- synthetic generator (fallback) ----------
def generate_synthetic_play(play_type='run'):
    frames = 20
    base_players = [
        (7,  'home', 'RB',  28, 25, 27.5),
        (10, 'home', 'WR1', 11, 35, 15.0),
        (12, 'home', 'WR2', 18, 35, 40.0),
        (71, 'home', 'OL',  71, 25, 22.0),
        (72, 'home', 'OL',  72, 25, 33.0),
        (22, 'away', 'CB',  22, 15, 25.0),
        (55, 'away', 'S',   55, 30, 20.0),
        (90, 'away', 'DL',  90, 28, 28.0),
        (91, 'away', 'DL',  91, 28, 32.0),
        (99, 'football', 'BALL', 0, 25, 27.5),
    ]
    data = []
    for f in range(frames):
        t = f / (frames - 1)
        for pid, team, pos, jersey, sx, sy in base_players:
            x, y = sx, sy
            if pid == 7:
                x = sx + 22*t; y = sy + 3*sin(radians(70*t))
            elif pid == 10:
                x = sx + 20*t; y = sy + 2*sin(radians(40*t))
            elif pid == 12:
                x = sx + 15*t; y = sy - 5*t
            elif pid == 22:
                x = sx + 18*t; y = sy + 2*sin(radians(40*t)) + 1.5
            elif pid == 55:
                x = sx + 12*t; y = sy - 6*t
            elif pid == 99:
                x = sx + 22*t; y = sy + 3*sin(radians(70*t))
            elif pid == 71:
                x = sx + 4*t; y = sy + 0.5*sin(radians(80*t))
            elif pid == 72:
                x = sx + 4*t; y = sy + 0.5*sin(radians(80*t+20))
            elif pid == 90:
                x = sx + 6*t; y = sy + 1*sin(radians(70*t))
            elif pid == 91:
                x = sx + 6*t; y = sy + 1*sin(radians(70*t+30))
            data.append({
                'frame_id': f, 'player_id': pid, 'team': team,
                'x': x, 'y': y, 'display_name': pos, 'jersey': jersey,
                'position': pos
            })
    return pd.DataFrame(data)

# ---------- helper functions ----------
def calculate_speed(df, player_id, frame_rate=DATA_FPS):
    player_data = df[df['player_id'] == player_id].sort_values('frame_id')
    if len(player_data) < 2:
        return 0.0
    speeds = []
    for i in range(1, len(player_data)):
        prev = player_data.iloc[i-1]
        curr = player_data.iloc[i]
        dx = curr['x'] - prev['x']
        dy = curr['y'] - prev['y']
        dist = hypot(dx, dy)
        time = 1.0 / frame_rate
        speed_yds_per_sec = dist / time
        speed_mph = speed_yds_per_sec * 2.045
        speeds.append(speed_mph)
    return max(speeds) if speeds else 0.0

def estimate_cp(qb_pos, receiver_pos, defender_pos):
    dist_to_target = hypot(receiver_pos[0] - qb_pos[0], receiver_pos[1] - qb_pos[1])
    if defender_pos is not None:
        dist_to_defender = hypot(receiver_pos[0] - defender_pos[0], receiver_pos[1] - defender_pos[1])
        cp = max(0, min(1, 0.8 - (dist_to_target / 60) + (dist_to_defender / 15)))
    else:
        cp = max(0, min(1, 0.8 - (dist_to_target / 60)))
    return cp

# Down/clock formatting — pulls from the real play-by-play context fetched in
# fetch_play_data. Returns None on missing/NaN input so callers can fall back
# to an honest "unavailable" label instead of a plausible-looking guess.
def _ordinal_down(down):
    try:
        if down is None or pd.isna(down):
            return None
        d = int(down)
    except (TypeError, ValueError):
        return None
    return {1: '1st', 2: '2nd', 3: '3rd', 4: '4th'}.get(d)

def _format_clock(seconds_remaining):
    try:
        if seconds_remaining is None or pd.isna(seconds_remaining):
            return None
        s = max(0, int(seconds_remaining))
    except (TypeError, ValueError):
        return None
    return f'{s // 60}:{s % 60:02d}'

def _down_distance_text(context):
    """Real down & distance for the play being rendered, or an honest fallback —
    never the hardcoded placeholder the overlay used to show for every play."""
    if not context:
        return 'Synthetic play'
    down_label = _ordinal_down(context.get('down'))
    ydstogo = context.get('ydstogo')
    if down_label and ydstogo is not None and not pd.isna(ydstogo):
        try:
            return f'{down_label} & {int(ydstogo)}'
        except (TypeError, ValueError):
            return down_label
    return down_label or 'Down & distance unavailable'

def _game_clock_text(context):
    """Real quarter + time remaining, or '' (renders nothing) rather than a fake clock."""
    if not context:
        return ''
    qtr = context.get('qtr')
    clock = _format_clock(context.get('quarter_seconds_remaining'))
    try:
        qtr_label = f'Q{int(qtr)}' if qtr is not None and not pd.isna(qtr) else None
    except (TypeError, ValueError):
        qtr_label = None
    if qtr_label and clock:
        return f'{qtr_label}  {clock}'
    return qtr_label or clock or ''

# ---------- field drawing ----------
def draw_field(ax, view='top', home_team='HOME', away_team='AWAY'):
    ax.clear()
    ax.set_xlim(-END_ZONE_DEPTH, FIELD_LENGTH - END_ZONE_DEPTH)
    ax.set_ylim(0, FIELD_WIDTH)
    ax.set_aspect('equal')
    ax.axis('off')
    ax.add_patch(Rectangle((-END_ZONE_DEPTH, 0), FIELD_LENGTH, FIELD_WIDTH,
                           facecolor=FIELD_COLOR, edgecolor='none'))
    for x0, label, color in [
        (-END_ZONE_DEPTH, home_team, '#1A3A5E'),
        (FIELD_LENGTH - END_ZONE_DEPTH, away_team, '#5E1A1A')
    ]:
        ax.add_patch(Rectangle((x0, 0), END_ZONE_DEPTH, FIELD_WIDTH,
                               facecolor=color, edgecolor=LINE_COLOR, linewidth=1, alpha=0.8))
        ax.text(x0 + END_ZONE_DEPTH/2, FIELD_WIDTH/2, label,
                color='white', fontsize=18, ha='center', va='center',
                weight='bold', alpha=0.6, rotation=90)
    for y in range(0, FIELD_LENGTH + 1, YARD_LINE_INTERVAL):
        if y == 0 or y == FIELD_LENGTH: continue
        x = y - END_ZONE_DEPTH
        ax.plot([x, x], [0, FIELD_WIDTH], color=LINE_COLOR, linewidth=0.8, alpha=0.6)
        if y % 10 == 0:
            num = int(y - END_ZONE_DEPTH) if y <= 50 else int(FIELD_LENGTH - y - END_ZONE_DEPTH)
            ax.text(x, 2.5, str(num), color='white', fontsize=8, ha='center', va='bottom')
            ax.text(x, FIELD_WIDTH - 2.5, str(num), color='white', fontsize=8, ha='center', va='top')
    for y in np.arange(0, FIELD_WIDTH, 1.5):
        for x in [-END_ZONE_DEPTH + 5, -END_ZONE_DEPTH + 10,
                  FIELD_LENGTH - END_ZONE_DEPTH - 10, FIELD_LENGTH - END_ZONE_DEPTH - 5]:
            ax.plot([x, x+0.5], [y, y], color='white', linewidth=0.5, alpha=0.4)
    ax.plot([-END_ZONE_DEPTH, FIELD_LENGTH - END_ZONE_DEPTH], [0, 0], color='white', linewidth=1.5)
    ax.plot([-END_ZONE_DEPTH, FIELD_LENGTH - END_ZONE_DEPTH], [FIELD_WIDTH, FIELD_WIDTH], color='white', linewidth=1.5)
    return ax

# ---------- animation function ----------
def animate(frame_id, df, ball_id, receiver_ids, line_of_scrimmage,
            play_label, args, ax, fig, context=None):
    draw_field(ax, view=args.view)

    # route trees
    if args.route_tree:
        for pid in receiver_ids:
            player_path = df[df['player_id'] == pid].sort_values('frame_id')
            if len(player_path) > 1:
                x_path = player_path['x'].values - END_ZONE_DEPTH
                y_path = player_path['y'].values
                ax.plot(x_path, y_path, color='cyan', linewidth=1.5, alpha=0.3, linestyle='-')

    # ball trail
    ball_trail = df[(df['player_id'] == ball_id) & (df['frame_id'] <= frame_id)]
    if len(ball_trail) > 1:
        trail_x = ball_trail['x'].values - END_ZONE_DEPTH
        trail_y = ball_trail['y'].values
        for i in range(1, len(trail_x)):
            alpha = i / len(trail_x) * 0.7
            ax.plot(trail_x[i-1:i+1], trail_y[i-1:i+1],
                    color='orange', linewidth=3, alpha=alpha, solid_capstyle='round')

    # receiver trails
    for pid in receiver_ids:
        player_trail = df[(df['player_id'] == pid) & (df['frame_id'] <= frame_id)]
        if len(player_trail) > 1:
            trail_x = player_trail['x'].values - END_ZONE_DEPTH
            trail_y = player_trail['y'].values
            ax.plot(trail_x, trail_y, color=HOME_COLOR, linewidth=2, alpha=0.5, linestyle='dashed')

    # coverage
    if args.show_coverage:
        frame_data = df[df['frame_id'] == frame_id]
        defenders = frame_data[frame_data['team'] == 'away']
        receivers = frame_data[frame_data['team'] == 'home']
        for _, rec in receivers.iterrows():
            if rec['player_id'] in receiver_ids:
                rx = rec['x'] - END_ZONE_DEPTH
                ry = rec['y']
                min_dist = float('inf')
                nearest_def = None
                for _, def_row in defenders.iterrows():
                    dx = def_row['x'] - rec['x']
                    dy = def_row['y'] - rec['y']
                    dist = hypot(dx, dy)
                    if dist < min_dist:
                        min_dist = dist
                        nearest_def = def_row
                if nearest_def is not None:
                    ax.plot([rx, nearest_def['x'] - END_ZONE_DEPTH],
                            [ry, nearest_def['y']],
                            color='magenta', linewidth=1, alpha=0.3, linestyle=':')

    # yardage gain
    ball_data = df[(df['player_id'] == ball_id) & (df['frame_id'] == frame_id)]
    if not ball_data.empty:
        ball_x = ball_data.iloc[0]['x'] - END_ZONE_DEPTH
        ball_y = ball_data.iloc[0]['y']
        los_x = line_of_scrimmage - END_ZONE_DEPTH
        ax.axvline(x=los_x, color='yellow', linestyle='--', linewidth=1.5, alpha=0.8)
        first_down_x = los_x + 10
        ax.axvline(x=first_down_x, color='yellow', linestyle=':', linewidth=1.5, alpha=0.5)
        if ball_x > los_x:
            gain = ball_x - los_x
            ax.annotate('', xy=(ball_x, ball_y+2.5), xytext=(los_x, ball_y+2.5),
                        arrowprops=dict(arrowstyle='->', color='lime', lw=3, alpha=0.9))
            ax.text((los_x + ball_x)/2, ball_y+5, f'+{gain:.0f} yds',
                    color='lime', fontsize=10, ha='center', weight='bold')

    # players
    frame_data = df[df['frame_id'] == frame_id]
    ball_carrier_id = None
    if not ball_data.empty:
        ball_x_abs = ball_data.iloc[0]['x']
        ball_y_abs = ball_data.iloc[0]['y']
        min_dist_ball = float('inf')
        for _, row in frame_data.iterrows():
            if row['team'] == 'home' and row['player_id'] != ball_id:
                dx = row['x'] - ball_x_abs
                dy = row['y'] - ball_y_abs
                dist = hypot(dx, dy)
                if dist < min_dist_ball:
                    min_dist_ball = dist
                    ball_carrier_id = row['player_id']
        # Nearest-to-ball alone mistags a receiver standing 10+ yards away as "carrier"
        # pre-snap or on an incompletion, since someone is always nearest. Require the
        # nearest player to actually be near the ball before calling them the carrier.
        BALL_CARRIER_MAX_DIST_YDS = 2.0
        if min_dist_ball > BALL_CARRIER_MAX_DIST_YDS:
            ball_carrier_id = None

    for _, row in frame_data.iterrows():
        pid = row['player_id']
        x = row['x'] - END_ZONE_DEPTH
        y = row['y']
        team = row['team']
        jersey = row.get('jersey', '')
        if team == 'football':
            ball = Ellipse((x, y), width=0.9, height=0.6, angle=0,
                           facecolor=BALL_COLOR, edgecolor='black', linewidth=0.5)
            ax.add_patch(ball)
            ball_shadow = Ellipse((x+0.1, y-0.1), width=0.9, height=0.6,
                                  angle=0, facecolor='black', alpha=0.2)
            ax.add_patch(ball_shadow)
        else:
            color = HOME_COLOR if team == 'home' else AWAY_COLOR
            circle = Circle((x, y), radius=0.9, facecolor=color, edgecolor='white', linewidth=1.5)
            ax.add_patch(circle)
            shadow = Circle((x+0.1, y-0.1), radius=0.9, facecolor='black', alpha=0.2)
            ax.add_patch(shadow)
            if jersey:
                ax.text(x, y, str(jersey), color='white', fontsize=8,
                        ha='center', va='center', weight='bold')

            if pid == args.highlight:
                highlight = Circle((x, y), radius=1.5, facecolor='none',
                                   edgecolor='yellow', linewidth=3)
                ax.add_patch(highlight)

            if args.show_speed and pid == ball_carrier_id:
                top_speed = calculate_speed(df, pid)
                ax.text(x, y-1.8, f'{top_speed:.1f} mph', color='white', fontsize=8,
                        ha='center', weight='bold', bbox=dict(facecolor='black', alpha=0.5, pad=1))

    # completion probability — a rough distance-based heuristic, not a calibrated model.
    # Labeled "Est. CP" rather than "CP" so it never reads as more precise than it is.
    if args.show_cp:
        if not ball_data.empty and len(receiver_ids) > 0:
            qb_data = frame_data[(frame_data['team'] == 'home') & (frame_data['position'] == 'QB')]
            if qb_data.empty:
                home_players = frame_data[frame_data['team'] == 'home']
                qb = home_players.iloc[0] if not home_players.empty else None
            else:
                qb = qb_data.iloc[0]
            if qb is not None:
                qb_pos = (qb['x'], qb['y'])
                ball_pos = (ball_data.iloc[0]['x'], ball_data.iloc[0]['y'])
                best_receiver = None
                best_dist = float('inf')
                for pid in receiver_ids:
                    rec_data = frame_data[frame_data['player_id'] == pid]
                    if not rec_data.empty:
                        rec_pos = (rec_data.iloc[0]['x'], rec_data.iloc[0]['y'])
                        dist = hypot(rec_pos[0]-ball_pos[0], rec_pos[1]-ball_pos[1])
                        if dist < best_dist:
                            best_dist = dist
                            best_receiver = rec_data.iloc[0]
                if best_receiver is not None:
                    rec_pos = (best_receiver['x'], best_receiver['y'])
                    defenders = frame_data[frame_data['team'] == 'away']
                    min_def_dist = float('inf')
                    def_pos = None
                    for _, d in defenders.iterrows():
                        dd = hypot(d['x']-rec_pos[0], d['y']-rec_pos[1])
                        if dd < min_def_dist:
                            min_def_dist = dd
                            def_pos = (d['x'], d['y'])
                    cp = estimate_cp(qb_pos, rec_pos, def_pos)
                    ax.text(0.5, 0.92, f'Est. CP: {cp*100:.0f}%', transform=ax.transAxes,
                            color='lime', fontsize=14, ha='center',
                            bbox=dict(facecolor='black', alpha=0.6, pad=3))

    # overlays
    # CLK is a stylized pre-snap play-clock countdown for visual flavor, not tied to
    # real per-play data — unlike the down/distance and quarter/time lines below, which
    # now render the actual play context instead of a hardcoded placeholder.
    clock_sec = max(0, 25 - int(frame_id * 1.2))
    ax.text(0.98, 0.98, f'CLK {clock_sec}s', transform=ax.transAxes,
            color='white', fontsize=13, weight='bold', ha='right', va='top',
            bbox=dict(facecolor='black', alpha=0.7, pad=5, boxstyle='round'))
    ax.text(0.02, 0.98, _down_distance_text(context), transform=ax.transAxes,
            color='white', fontsize=14, weight='bold', va='top',
            bbox=dict(facecolor='black', alpha=0.7, pad=5, boxstyle='round'))
    game_clock = _game_clock_text(context)
    if game_clock:
        ax.text(0.02, 0.90, game_clock, transform=ax.transAxes,
                color='white', fontsize=11, va='top')
    ax.text(0.5, 0.03, play_label, transform=ax.transAxes,
            color='white', fontsize=12, ha='center', va='bottom',
            bbox=dict(facecolor='black', alpha=0.6, pad=4, boxstyle='round'))
    if not ball_data.empty:
        yard_line = int(ball_data.iloc[0]['x'])
        ax.text(0.98, 0.85, f'Ball at {yard_line}', transform=ax.transAxes,
                color='white', fontsize=10, ha='right', va='top',
                bbox=dict(facecolor='black', alpha=0.5, pad=3))

    return ax

# ---------- API data fetching (pickle caching) ----------
CACHE_DIR = "nfl_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

def get_play_by_play(season):
    """Fetch play‑by‑play and schedule, map string game_id to numeric."""
    cache_file = os.path.join(CACHE_DIR, f"pbp_{season}.pkl")
    if os.path.exists(cache_file):
        print(f"Loading play‑by‑play from cache ({cache_file})")
        with open(cache_file, 'rb') as f:
            pbp = pickle.load(f)
        if not isinstance(pbp, pd.DataFrame):
            pbp = pd.DataFrame(pbp)
        return pbp

    print(f"Downloading play‑by‑play for {season}...")
    import nfl_data_py as nfl
    pbp = nfl.import_pbp_data(
        years=[season],
        columns=[
            'game_id', 'play_id', 'down', 'yardline_100',
            'qtr', 'quarter_seconds_remaining', 'desc',
            'home_team', 'away_team', 'posteam', 'defteam',
            'ydstogo', 'play_type', 'game_date'
        ]
    )
    schedules = nfl.import_schedules(years=[season])

    # Rename pbp's game_id to old_game_id for merging
    pbp = pbp.rename(columns={'game_id': 'old_game_id'})

    # Try to merge on old_game_id if it exists in schedules
    if 'old_game_id' in schedules.columns:
        pbp = pbp.merge(schedules[['game_id', 'old_game_id']], on='old_game_id', how='left')
    else:
        # Fallback: merge on home_team, away_team, and game_date
        # Normalize dates
        pbp['game_date'] = pd.to_datetime(pbp['game_date']).dt.date
        schedules['game_date'] = pd.to_datetime(schedules['game_date']).dt.date
        pbp = pbp.merge(schedules[['game_id', 'home_team', 'away_team', 'game_date']],
                        on=['home_team', 'away_team', 'game_date'], how='left')
        # Drop the duplicate date column if any
        if 'game_date_x' in pbp.columns and 'game_date_y' in pbp.columns:
            pbp = pbp.drop(columns=['game_date_y'])
            pbp = pbp.rename(columns={'game_date_x': 'game_date'})

    # Now pbp has numeric game_id (may be NaN if no match)
    with open(cache_file, 'wb') as f:
        pickle.dump(pbp, f)
    return pbp

def get_available_plays(season, week=None):
    pbp = get_play_by_play(season)
    # Drop rows where game_id is NaN (unmatched)
    pbp = pbp.dropna(subset=['game_id'])
    # Keep necessary columns and deduplicate
    plays = pbp[['game_id', 'old_game_id', 'play_id', 'desc', 'home_team', 'away_team',
                 'down', 'ydstogo', 'yardline_100']].drop_duplicates()
    # Deduplicate by game_id and play_id using groupby
    plays = plays.groupby(['game_id', 'play_id']).first().reset_index()
    # Convert game_id to int
    plays['game_id'] = plays['game_id'].astype(int)
    return plays.head(200)

def fetch_tracking_data(season, week):
    """Fetch tracking data with pickle caching (using nflreadpy)."""
    cache_file = os.path.join(CACHE_DIR, f"tracking_{season}_week{week}.pkl")
    if os.path.exists(cache_file):
        print(f"Loading tracking data from cache ({cache_file})")
        with open(cache_file, 'rb') as f:
            tracking = pickle.load(f)
        if not isinstance(tracking, pd.DataFrame):
            tracking = pd.DataFrame(tracking)
        return tracking

    print(f"Downloading tracking data for {season} week {week}...")
    try:
        import nflreadpy
        tracking = nflreadpy.load_tracking(season=season, week=week)
        if not isinstance(tracking, pd.DataFrame):
            tracking = pd.DataFrame(tracking)
        with open(cache_file, 'wb') as f:
            pickle.dump(tracking, f)
        return tracking
    except Exception as e:
        print(f"Error loading tracking data: {e}")
        return None

def fetch_play_data(game_id, play_id, season, week):
    """Fetch tracking data for a numeric game_id and play_id."""
    tracking = fetch_tracking_data(season, week)
    if tracking is None:
        return None, None, None

    play_tracking = tracking[(tracking['gameId'] == game_id) & (tracking['playId'] == play_id)]
    if play_tracking.empty:
        print(f"No tracking data found for play {game_id}/{play_id}.")
        return None, None, None

    play_tracking = play_tracking.rename(columns={
        'frameId': 'frame_id',
        'playerId': 'player_id',
        'displayName': 'display_name',
        'jerseyNumber': 'jersey',
        'position': 'position'
    })

    ball_df = play_tracking[play_tracking['team'] == 'football']
    los = ball_df[ball_df['frame_id'] == ball_df['frame_id'].min()]['x'].mean() if not ball_df.empty else 25

    pbp = get_play_by_play(season)
    play_info = pbp[(pbp['game_id'] == game_id) & (pbp['play_id'] == play_id)]
    context = play_info.iloc[0].to_dict() if not play_info.empty else {}

    return play_tracking, los, context

# ---------- interactive menu ----------
def interactive_select_play(season):
    if not API_AVAILABLE:
        print("API libraries not available. Falling back to synthetic data.")
        return None

    plays = get_available_plays(season)
    if plays.empty:
        print("No plays found for this season.")
        return None

    total_plays = len(plays)
    page_size = 20
    current_page = 0
    selected = None

    while selected is None:
        start_idx = current_page * page_size
        end_idx = min(start_idx + page_size, total_plays)
        page_plays = plays.iloc[start_idx:end_idx]

        if RICH_AVAILABLE:
            table = Table(title=f"Available Plays (Season {season}, Page {current_page+1}/{((total_plays-1)//page_size)+1})")
            table.add_column("#", style="cyan")
            table.add_column("Game ID", style="green")
            table.add_column("Play ID", style="magenta")
            table.add_column("Description", style="white")
            table.add_column("Teams", style="yellow")
            for idx, row in page_plays.iterrows():
                desc = row['desc'][:50] + ("..." if len(row['desc'])>50 else "")
                teams = f"{row['home_team']} vs {row['away_team']}"
                table.add_row(str(idx+1), str(row['old_game_id']), str(int(row['play_id'])), desc, teams)
            console.print(table)
        else:
            print(f"\n--- Available Plays (Season {season}, Page {current_page+1}/{((total_plays-1)//page_size)+1}) ---")
            print(f"{'#':<4} {'Game ID':<20} {'Play ID':<8} {'Description':<50} {'Teams'}")
            for idx, row in page_plays.iterrows():
                desc = row['desc'][:50] + ("..." if len(row['desc'])>50 else "")
                teams = f"{row['home_team']} vs {row['away_team']}"
                print(f"{idx+1:<4} {row['old_game_id']:<20} {int(row['play_id']):<8} {desc:<50} {teams}")

        try:
            if RICH_AVAILABLE:
                choice = Prompt.ask(
                    f"Enter play number (1-{total_plays}), or [bold]next[/bold], [bold]prev[/bold], [bold]exit[/bold]"
                )
            else:
                choice = input(f"Enter play number (1-{total_plays}), or next, prev, exit: ")
        except KeyboardInterrupt:
            print("\nExiting.")
            return None

        choice = choice.strip().lower()
        if not choice:
            continue

        if choice == 'exit':
            return None
        elif choice == 'next':
            if current_page < (total_plays-1)//page_size:
                current_page += 1
            else:
                print("Already on last page.")
            continue
        elif choice == 'prev':
            if current_page > 0:
                current_page -= 1
            else:
                print("Already on first page.")
            continue
        else:
            # Robust: extract any digits from the input
            match = re.search(r'\d+', choice)
            if match:
                num = int(match.group())
                if 1 <= num <= total_plays:
                    selected_row = plays.iloc[num - 1]
                    # Use the numeric game_id (int)
                    game_id = int(selected_row['game_id'])
                    play_id = int(selected_row['play_id'])
                    if RICH_AVAILABLE:
                        week = int(Prompt.ask("Enter the week number for this game", default="1"))
                    else:
                        week = int(input("Enter the week number for this game (default 1): ") or "1")
                    return game_id, play_id, week
                else:
                    print("Number out of range.")
            else:
                print("Invalid input. Please enter a number or a command.")
                continue
    return None

# ---------- main ----------
def main():
    parser = argparse.ArgumentParser(description='NFL Play Visualizer – API powered')
    parser.add_argument('--season', type=int, default=2024, help='Season year (default 2024)')
    parser.add_argument('--week', type=int, help='Week number (if not provided, will be asked)')
    parser.add_argument('--game', type=int, help='Game ID (skip menu)')
    parser.add_argument('--play', type=int, help='Play ID (skip menu)')
    parser.add_argument('--list', action='store_true', help='List plays for the season and exit')
    parser.add_argument('--menu', action='store_true', help='Force interactive menu')
    parser.add_argument('--fps', type=int, default=6, help='Output frames per second')
    parser.add_argument('--speed', type=float, default=1.0, help='Playback speed multiplier')
    parser.add_argument('--highlight', type=int, help='Player ID to highlight')
    parser.add_argument('--show-speed', action='store_true', help='Show ball carrier speed')
    parser.add_argument('--show-cp', action='store_true', help='Show completion probability')
    parser.add_argument('--show-coverage', action='store_true', help='Show coverage assignments')
    parser.add_argument('--route-tree', action='store_true', help='Draw full route paths')
    parser.add_argument('--view', choices=['top', 'sideline'], default='top', help='View perspective')
    parser.add_argument('--output', type=str, help='Output MP4 file name')
    args = parser.parse_args()

    df = None
    context = {}  # real play context (down/distance/qtr/clock) when available; {} = honest "no data"
    if not API_AVAILABLE:
        print("API libraries not installed. Using synthetic data.")
        df = generate_synthetic_play('run')
        ball_id = 99
        receiver_ids = [10, 12]
        los = 25
        play_label = "SYNTHETIC PLAY"
        args.output = args.output or "nfl_synthetic.mp4"
    else:
        if args.list:
            plays = get_available_plays(args.season)
            print(f"Available plays for season {args.season}:")
            print(plays[['game_id', 'old_game_id', 'play_id', 'desc', 'home_team', 'away_team']].head(20).to_string())
            return

        if args.menu or (args.game is None and args.play is None):
            result = interactive_select_play(args.season)
            if result is None:
                print("Selection cancelled. Falling back to synthetic data.")
                df = generate_synthetic_play('run')
                ball_id = 99
                receiver_ids = [10, 12]
                los = 25
                play_label = "SYNTHETIC PLAY"
                args.output = args.output or "nfl_synthetic.mp4"
                context = {}
            else:
                game_id, play_id, week = result
                df, los, context = fetch_play_data(game_id, play_id, args.season, week)
                if df is None:
                    print("Failed to fetch play data. Falling back to synthetic.")
                    df = generate_synthetic_play('run')
                    ball_id = 99
                    receiver_ids = [10, 12]
                    los = 25
                    play_label = "SYNTHETIC PLAY"
                    args.output = args.output or "nfl_synthetic.mp4"
                    context = {}
                else:
                    ball_df = df[df['team'] == 'football']
                    ball_id = ball_df['playerId'].iloc[0] if not ball_df.empty else 99
                    home_players = df[df['team'] == 'home']
                    skill_positions = ['WR', 'TE', 'RB', 'QB']
                    skill_players = home_players[home_players['position'].isin(skill_positions)]
                    receiver_ids = skill_players['playerId'].unique()[:2] if len(skill_players) >= 2 else [p for p in home_players['playerId'].unique() if p != ball_id][:2]
                    play_label = f"Game {game_id} Play {play_id}"
                    if not args.output:
                        args.output = f"nfl_{game_id}_{play_id}.mp4"
                    print(f"Animating play {game_id}/{play_id} ({len(df['frame_id'].unique())} frames)")
        else:
            if args.week is None:
                week = int(input("Enter week number: "))
            else:
                week = args.week
            df, los, context = fetch_play_data(args.game, args.play, args.season, week)
            if df is None:
                print("Failed to fetch play data. Falling back to synthetic.")
                df = generate_synthetic_play('run')
                ball_id = 99
                receiver_ids = [10, 12]
                los = 25
                play_label = "SYNTHETIC PLAY"
                args.output = args.output or "nfl_synthetic.mp4"
                context = {}
            else:
                ball_df = df[df['team'] == 'football']
                ball_id = ball_df['playerId'].iloc[0] if not ball_df.empty else 99
                home_players = df[df['team'] == 'home']
                skill_positions = ['WR', 'TE', 'RB', 'QB']
                skill_players = home_players[home_players['position'].isin(skill_positions)]
                receiver_ids = skill_players['playerId'].unique()[:2] if len(skill_players) >= 2 else [p for p in home_players['playerId'].unique() if p != ball_id][:2]
                play_label = f"Game {args.game} Play {args.play}"
                if not args.output:
                    args.output = f"nfl_{args.game}_{args.play}.mp4"
                print(f"Animating play {args.game}/{args.play} ({len(df['frame_id'].unique())} frames)")

    if df is None:
        df = generate_synthetic_play('run')
        ball_id = 99
        receiver_ids = [10, 12]
        los = 25
        play_label = "SYNTHETIC PLAY"
        args.output = args.output or "nfl_synthetic.mp4"
        context = {}

    df = df.dropna(subset=['x', 'y'])

    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(10, 5.5))
    fig.patch.set_facecolor('#1a1a1a')

    frames = sorted(df['frame_id'].unique())
    interval = int(1000 / (args.fps * args.speed))

    ani = animation.FuncAnimation(
        fig, animate, frames=frames,
        fargs=(df, ball_id, receiver_ids, los, play_label, args, ax, fig, context),
        interval=interval, blit=False
    )

    print(f"Rendering {len(frames)} frames to {args.output} ...")
    writer = animation.FFMpegWriter(fps=args.fps, metadata=dict(artist='SportStrata'), bitrate=2500)
    ani.save(args.output, writer=writer)
    print(f"✅ Done! Saved as {args.output}")

if __name__ == '__main__':
    main()
