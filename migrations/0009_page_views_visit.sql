-- D-183 — New-visitor signal on the D-149 page_views log.
-- Apply to USER_DB: wrangler d1 migrations apply USER_DB --remote
--
-- Still anonymous by construction: no user id, IP, or user-agent. The client keeps a
-- "seen" bit and a per-tab navigation counter in its own storage and sends only the
-- derived values. All four columns are nullable so pre-D-183 rows stay valid.
--   is_new      1 = this tab's session is the browser's first-ever visit, 0 = returning,
--               NULL = unknown (storage blocked) or a pre-D-183 row
--   seq         nth navigation in this tab (1 = the entry page)
--   ref         entry channel bucket, seq = 1 only (direct/internal/google/search/
--               reddit/x/meta/ai/other) -- the raw referrer is never sent
--   entry_path  location.pathname of the entry page, seq = 1 only
ALTER TABLE page_views ADD COLUMN is_new INTEGER;
ALTER TABLE page_views ADD COLUMN seq INTEGER;
ALTER TABLE page_views ADD COLUMN ref TEXT;
ALTER TABLE page_views ADD COLUMN entry_path TEXT;

-- Entry rows are the denominator for every new-visitor question below.
CREATE INDEX IF NOT EXISTS idx_page_views_entry ON page_views(seq, created_at DESC);

-- New vs returning entries, last 7 days:
--   SELECT is_new, COUNT(*) FROM page_views
--   WHERE seq = 1 AND created_at > (unixepoch() * 1000) - 7*86400000 GROUP BY is_new;
-- Which channels bring new visitors, and which entry pages they land on:
--   SELECT ref, entry_path, COUNT(*) FROM page_views
--   WHERE seq = 1 AND is_new = 1 AND created_at > (unixepoch() * 1000) - 7*86400000
--   GROUP BY ref, entry_path ORDER BY 3 DESC LIMIT 25;
-- New-visitor click-through (share of entries followed by a 2nd page), no session id needed:
--   SELECT SUM(seq = 2) * 1.0 / SUM(seq = 1) FROM page_views
--   WHERE is_new = 1 AND created_at > (unixepoch() * 1000) - 7*86400000;
