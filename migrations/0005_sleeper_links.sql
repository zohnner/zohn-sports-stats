-- D-065 — League Import: link a signed-in user's real Sleeper league.
-- Apply to the same USER_DB D1 as 0001-0004. wrangler d1 migrations apply USER_DB
--
-- Deliberately ONE ROW PER USER (user_id PRIMARY KEY, upsert-on-relink), not one row
-- per event -- this is current state ("who am I linked to right now"), the same shape
-- as `preferences` (0002), not `draft_history`'s (0004) one-row-per-event log. See
-- ISSUES.md D-065, Axiom's feasibility note, for why this feature's data model is
-- deliberately different from D-064's despite both being app-owned tables.
--
-- A wrong or stale link is actively harmful (shows someone else's roster), unlike an
-- old saved mock draft -- so unlike draft_history, this table IS meant to be deleted
-- from directly (functions/api/sleeperLink.js's DELETE handler), not just accumulated.

CREATE TABLE IF NOT EXISTS sleeper_links (
  user_id          TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  sleeper_user_id  TEXT NOT NULL,
  sleeper_username TEXT NOT NULL,
  league_id        TEXT NOT NULL,
  league_name      TEXT NOT NULL,
  league_avatar    TEXT,
  linked_at        INTEGER NOT NULL
);
