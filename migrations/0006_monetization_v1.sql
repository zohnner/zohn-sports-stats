-- D-069 — Monetization v1: entitlement scaffold + alert opt-in.
-- Apply to the same USER_DB D1 as 0001-0005. wrangler d1 migrations apply USER_DB
--
-- subscriptions: one row per user, current-state (same shape as sleeper_links/
-- preferences, not draft_history's event log) -- "what does this user have right
-- now," upserted by the Stripe webhook once billing is actually wired up. No rows
-- exist yet for anyone -- functions/api/_entitlement.js treats an absent row as
-- not-entitled, so this table starts genuinely empty and every user is free-tier
-- until real Stripe integration starts writing to it. Not a placeholder to "turn
-- on" later -- the absence of a row IS the free-tier state.
--
-- alert_prefs: one row per user, opt-in only (see ISSUES.md "Weekly Fantasy
-- Digest" -- off by default, no dark pattern).

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  status                  TEXT NOT NULL DEFAULT 'inactive',
  current_period_end      INTEGER,
  updated_at              INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_prefs (
  user_id         TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  digest_enabled  INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

-- insight_history: one row per generated AI League Insight (event log, same shape as
-- draft_history 0004, not current-state like subscriptions/alert_prefs above). Querying
-- MAX(created_at) per user+league is how the free-tier "one per calendar week" limit in
-- functions/api/nflInsights.js is enforced -- paid users (isEntitled() true) skip that
-- check and always regenerate fresh. No delete endpoint, same reasoning as draft_history:
-- a short history of past insights is harmless, unlike a stale sleeper_links row.
CREATE TABLE IF NOT EXISTS insight_history (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  league_id   TEXT NOT NULL,
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_insight_history_user ON insight_history(user_id, league_id, created_at DESC);
