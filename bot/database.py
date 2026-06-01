import sqlite3
import hashlib
import json
from datetime import date, datetime
from config import DB_PATH


def _connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _connect()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS stat_combinations (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id         INTEGER NOT NULL,
            player_name       TEXT NOT NULL,
            game_pk           INTEGER NOT NULL,
            game_date         TEXT NOT NULL,
            hits              INTEGER,
            home_runs         INTEGER,
            rbi               INTEGER,
            runs              INTEGER,
            total_bases       INTEGER,
            combination_hash  TEXT UNIQUE NOT NULL,
            created_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rare_events (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type   TEXT NOT NULL,
            player_id    INTEGER,
            player_name  TEXT,
            game_pk      INTEGER NOT NULL,
            game_date    TEXT NOT NULL,
            details      TEXT,
            tweeted      INTEGER DEFAULT 0,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tweet_log (
            tweet_id         TEXT PRIMARY KEY,
            content          TEXT NOT NULL,
            combination_hash TEXT,
            posted_at        TEXT DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_combo_hash ON stat_combinations(combination_hash);
        CREATE INDEX IF NOT EXISTS idx_rare_event_type ON rare_events(event_type, game_date);
        CREATE INDEX IF NOT EXISTS idx_rare_tweeted ON rare_events(tweeted);
    """)
    conn.commit()
    conn.close()


def _combo_hash(hits, home_runs, rbi, runs, total_bases):
    raw = f"{hits}_{home_runs}_{rbi}_{runs}_{total_bases}"
    return hashlib.md5(raw.encode()).hexdigest()


def is_unprecedented(hits, home_runs, rbi, runs, total_bases):
    """
    Returns True if no player has EVER posted at least this many
    hits, HR, RBI, runs, AND total bases in a single game.
    Uses >= comparison so 5-HR/9-RBI also counts as exceeding a 4-HR/8-RBI combo.
    """
    conn = _connect()
    row = conn.execute("""
        SELECT 1 FROM stat_combinations
        WHERE hits >= ? AND home_runs >= ? AND rbi >= ?
          AND runs >= ? AND total_bases >= ?
        LIMIT 1
    """, (hits, home_runs, rbi, runs, total_bases)).fetchone()
    conn.close()
    return row is None


def record_combination(player_id, player_name, game_pk, game_date,
                        hits, home_runs, rbi, runs, total_bases):
    h = _combo_hash(hits, home_runs, rbi, runs, total_bases)
    conn = _connect()
    conn.execute("""
        INSERT OR IGNORE INTO stat_combinations
        (player_id, player_name, game_pk, game_date,
         hits, home_runs, rbi, runs, total_bases, combination_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?)
    """, (player_id, player_name, game_pk, str(game_date),
          hits, home_runs, rbi, runs, total_bases, h))
    conn.commit()
    conn.close()
    return h


def record_rare_event(event_type, player_id, player_name, game_pk, game_date, details):
    conn = _connect()
    conn.execute("""
        INSERT OR IGNORE INTO rare_events
        (event_type, player_id, player_name, game_pk, game_date, details)
        VALUES (?,?,?,?,?,?)
    """, (event_type, player_id, player_name, game_pk, str(game_date),
          json.dumps(details)))
    conn.commit()
    conn.close()


def get_untweeted_rare_events():
    conn = _connect()
    rows = conn.execute("""
        SELECT * FROM rare_events WHERE tweeted = 0
        ORDER BY game_date DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def mark_tweeted(rare_event_id, tweet_id, content, combination_hash=None):
    conn = _connect()
    conn.execute(
        "UPDATE rare_events SET tweeted = 1 WHERE id = ?",
        (rare_event_id,)
    )
    conn.execute("""
        INSERT OR IGNORE INTO tweet_log (tweet_id, content, combination_hash)
        VALUES (?,?,?)
    """, (tweet_id, content, combination_hash))
    conn.commit()
    conn.close()


def log_tweet(tweet_id, content, combination_hash=None):
    conn = _connect()
    conn.execute("""
        INSERT OR IGNORE INTO tweet_log (tweet_id, content, combination_hash)
        VALUES (?,?,?)
    """, (tweet_id, content, combination_hash))
    conn.commit()
    conn.close()


def tweets_today():
    conn = _connect()
    today = date.today().isoformat()
    count = conn.execute("""
        SELECT COUNT(*) FROM tweet_log
        WHERE date(posted_at) = ?
    """, (today,)).fetchone()[0]
    conn.close()
    return count


def last_rare_event_date(event_type):
    """Returns the most recent game_date for this event type, or None."""
    conn = _connect()
    row = conn.execute("""
        SELECT game_date FROM rare_events
        WHERE event_type = ?
        ORDER BY game_date DESC LIMIT 1
    """, (event_type,)).fetchone()
    conn.close()
    return row["game_date"] if row else None
