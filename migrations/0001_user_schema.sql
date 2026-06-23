-- D-031 Phase 1 — user schema (Relay spec). Apply to the SEPARATE USER_DB D1,
-- never the sports-cache DB.  wrangler d1 migrations apply USER_DB
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  email          TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name   TEXT,
  created_at     INTEGER NOT NULL,
  last_login_at  INTEGER
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,            -- 'google' | 'passkey' | 'email'
  provider_uid TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (provider, provider_uid)
);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_user ON auth_accounts(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS follows (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport       TEXT NOT NULL,            -- 'mlb' | 'nfl'
  entity_type TEXT NOT NULL,            -- 'team' | 'player'
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, sport, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS preferences (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,            -- 'login' | 'logout' | 'logout_all' | 'delete'
  ip         TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
