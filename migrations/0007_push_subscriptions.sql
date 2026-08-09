-- D-079 -- Push Notifications v1 (F5): game-start alerts for favorited teams.
-- Apply to the same USER_DB D1 as 0001-0006. wrangler d1 migrations apply USER_DB
--
-- push_subscriptions: MULTIPLE rows per user, not one -- unlike alert_prefs (0006),
-- a single person can have notifications on in more than one browser at once (laptop
-- Chrome + phone Chrome are two independent PushSubscription endpoints from the
-- browser's own PushManager). Same shape discipline as follows (0002-era): id PK,
-- non-unique user_id FK, UNIQUE(endpoint) so re-subscribing the same browser
-- upserts instead of duplicating a row every time the SW re-registers.
--
-- Signed-in required (not signed-out-local, unlike follows' local-first pattern) --
-- a push subscription is meaningless without a server-side row to send to, so there
-- is no local-first mode to fall back to here. This does NOT violate the D-034/D-031
-- "additive-only" rule: nothing free today is being gated behind sign-in, push
-- notifications are a brand-new capability that simply requires it, same as the
-- weekly digest (alert_prefs, 0006) already does. See ISSUES.md "Push Notifications
-- -- Game-Start Alerts for Favorited Teams (F5)" for the full three-gate spec.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE(endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- push_sent_log: dedupe guard so the cron (worker/push-game-alerts.js, runs every
-- few minutes) never double-sends the same game-start alert to the same user if a
-- run overlaps a game's start window twice. Event log shape, same reasoning as
-- insight_history (0006) -- short history is harmless, no delete endpoint needed.
-- game_key is sport-qualified ("nfl:401873271", "mlb:717465") since ids are only
-- unique within one sport's own upstream API.
CREATE TABLE IF NOT EXISTS push_sent_log (
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  game_key    TEXT NOT NULL,
  sent_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, game_key)
);
