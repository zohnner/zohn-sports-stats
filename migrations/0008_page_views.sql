-- D-149 — First-party page-view log, sport/view breakdown.
-- Apply to the same USER_DB D1 as 0001-0007. wrangler d1 migrations apply USER_DB
--
-- WHY THIS EXISTS: Cloudflare Web Analytics (the Pages dashboard auto-toggle, confirmed
-- ON 2026-09-10) has no custom events/dimensions and unconfirmed support for hash-based
-- SPA routing (this site's entire in-app nav is hash-based) -- it cannot answer "which
-- sport/page gets traffic," only raw top-level pageviews. This table is the answer:
-- one row per navigateTo() call, written via navigator.sendBeacon so it never blocks
-- rendering (G1). No user identifier, IP, or user-agent is stored -- sport/view/timestamp
-- only, matching GOALS.md's "no trackers, no data sales, ever" line. Anonymous by
-- construction, not by policy choice that could later be walked back.
--
-- Event log, same shape as draft_history/insight_history (0004/0006), not current-state
-- like subscriptions/follows -- INSERT-only, no user_id, no upsert.
CREATE TABLE IF NOT EXISTS page_views (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sport       TEXT NOT NULL,
  view        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- The query this table exists to answer: sport breakdown over a window.
--   SELECT sport, COUNT(*) AS views FROM page_views
--   WHERE created_at > (unixepoch() * 1000) - 7*24*60*60*1000
--   GROUP BY sport ORDER BY views DESC;
CREATE INDEX IF NOT EXISTS idx_page_views_sport_time ON page_views(sport, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_view_time ON page_views(view, created_at DESC);
