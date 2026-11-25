-- D-214 — Weekly email list (owner-approved 2026-11-21: Resend, email-only double opt-in).
-- Apply to the same USER_DB D1 as 0001-0009:
--   npx wrangler d1 execute sportstrata-users --remote --file migrations/0010_newsletter.sql
--
-- Stores only what sending needs: the address, its state, timestamps, and which
-- page the signup came from (a fixed bucket, never a URL). No IP, no user agent,
-- no link to the accounts tables: subscribing never requires signing in.
--
-- token_hash is SHA-256 of the random token carried in the confirm and
-- unsubscribe links, so a leaked table can't be used to act for anyone.
-- status: 'pending' (confirmation sent) -> 'confirmed' -> 'unsubscribed'.
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  email            TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  token_hash       TEXT NOT NULL UNIQUE,
  source           TEXT,
  created_at       INTEGER NOT NULL,
  last_sent_at     INTEGER,
  confirmed_at     INTEGER,
  unsubscribed_at  INTEGER
);

-- The send job reads confirmed subscribers only.
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
