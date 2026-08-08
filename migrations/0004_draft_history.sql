-- D-064 — Draft History: signed-in users' Mock Draft results, saved + revisitable.
-- Apply to the same USER_DB D1 as 0001-0003. wrangler d1 migrations apply USER_DB
--
-- Relay's application-owned table, same shape convention as follows/preferences (0002):
-- user_id targets the better-auth `user(id)` table, created_at is INTEGER epoch-ms
-- (Date.now(), server-set — never trusted from the client), matching every other
-- app-owned table in this schema.
--
-- `result` stores a TRIMMED draft summary, not the full in-memory Mock Draft object —
-- Axiom's feasibility note (ISSUES.md D-064): the full player-pool/VBD/tier debug data
-- `_mdRenderComplete()` works from is large and none of it is needed to redraw a past
-- draft's summary screen; only the user's own picks + config + the already-computed
-- grade/highlights/positional-rank summary travel to storage — a JSON blob of roughly
-- 1-2KB per draft, same "don't store more than the UI needs to redraw" discipline as
-- preferences.js's small-blob philosophy, just one row per draft instead of per user.
--
-- Capped at MAX_DRAFTS (see functions/api/draftHistory.js) via delete-oldest-on-insert
-- inside the POST handler itself, not a separate DELETE endpoint or cron — Vera's spec
-- (ISSUES.md D-064): a silent rolling window, no delete UI in v1.

CREATE TABLE IF NOT EXISTS draft_history (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sport      TEXT NOT NULL DEFAULT 'nfl',   -- future-proofed; only NFL fantasy exists today
  result     TEXT NOT NULL,                  -- JSON blob: {config, grade, finish, avg, posRank, bestVal, reach, unfilled, roster}
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_draft_history_user ON draft_history(user_id, sport, created_at DESC);
