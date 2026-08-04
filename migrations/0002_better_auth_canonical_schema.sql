-- D-031 Phase 1 amendment (2026-08-04) — adopt better-auth's canonical schema.
-- Apply to the SEPARATE USER_DB D1, same as 0001.  wrangler d1 migrations apply USER_DB
--
-- WHY THIS MIGRATION EXISTS: 0001 (Relay's original spec) predates anyone actually
-- installing and reading better-auth's source. Doing that during Phase-1 implementation
-- surfaced two real conflicts, both documented in docs/auth-security-spec.md's and
-- docs/auth-data-schema.md's 2026-08-04 amendments:
--   1. better-auth's session strategy stores an opaque token directly (not a hash) and
--      looks sessions up by exact match on the raw cookie value. 0001's `sessions.token_hash`
--      column name promised something the running system was never going to do — renamed
--      to `token` so the column name matches what it actually holds. Owner-approved
--      2026-08-04: accept better-auth's default (opaque token + HttpOnly/Secure/SameSite
--      cookie + TLS) rather than build an unverified custom hashing adapter.
--   2. better-auth's core requires `user`/`session`/`account`/`verification` tables with
--      its own fixed field names, and the passkey plugin requires its own `passkey` table
--      (publicKey, credentialID, counter, deviceType, backedUp, transports) that has no
--      equivalent in 0001 at all. Hand-mapping every field of five tables onto 0001's
--      custom snake_case naming via better-auth's fieldName/modelName overrides is exactly
--      the kind of unverified-against-a-live-instance risk already flagged for the session
--      question — so this migration adopts better-auth's own canonical table/column shapes
--      instead of fighting them. `follows`/`preferences`/`audit_log` are NOT better-auth's
--      concern and keep Relay's original design; only their `user_id` foreign key now
--      targets the new `user(id)` table.
--
-- 0001's `users`/`auth_accounts`/original `sessions` shape were never populated (Phase 1
-- had not shipped), so this is a clean structural replacement, not a data migration.
--
-- DISCLOSED, NOT YET LIVE-VERIFIED: date fields below are TEXT (ISO 8601), booleans are
-- INTEGER (0/1) — the standard convention for better-auth's kysely-based SQL adapters on
-- SQLite-family databases. This repo could not install better-auth's own CLI schema
-- generator to confirm byte-exact type coercion against the kysely-d1 dialect specifically
-- (native module build blocked in this environment). Confirm actual read/write behavior
-- during the owner's `wrangler pages dev` spike-acceptance pass (auth-feasibility-spike.md
-- checklist item 1) before trusting this in production; if the kysely-d1 dialect coerces
-- dates differently, the fix is a column-type change here, not an application-logic change.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS auth_accounts;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS user (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,             -- required by better-auth; defaulted from
                                             -- email-local-part when a provider omits it
                                             -- (see functions/api/auth/[[route]].js hook)
  email          TEXT NOT NULL UNIQUE,
  emailVerified  INTEGER NOT NULL DEFAULT 0,
  image          TEXT,
  createdAt      TEXT NOT NULL,
  updatedAt      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session (
  id         TEXT PRIMARY KEY,
  expiresAt  TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL,
  ipAddress  TEXT,
  userAgent  TEXT,
  userId     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_user ON session(userId);

CREATE TABLE IF NOT EXISTS account (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,      -- 'google' | 'passkey' | 'email' (magic link)
  userId                TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  TEXT,
  refreshTokenExpiresAt TEXT,
  scope                 TEXT,
  password              TEXT,               -- unused (no password sign-in); column kept
                                             -- because better-auth's core schema expects it
  createdAt             TEXT NOT NULL,
  updatedAt             TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_user ON account(userId);

CREATE TABLE IF NOT EXISTS verification (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  TEXT NOT NULL,
  createdAt  TEXT NOT NULL,
  updatedAt  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON verification(identifier);

-- @better-auth/passkey plugin's required table (WebAuthn credentials)
CREATE TABLE IF NOT EXISTS passkey (
  id           TEXT PRIMARY KEY,
  name         TEXT,
  publicKey    TEXT NOT NULL,
  userId       TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  credentialID TEXT NOT NULL,
  counter      INTEGER NOT NULL,
  deviceType   TEXT NOT NULL,
  backedUp     INTEGER NOT NULL,
  transports   TEXT,
  createdAt    TEXT,
  aaguid       TEXT
);
CREATE INDEX IF NOT EXISTS idx_passkey_user ON passkey(userId);
CREATE INDEX IF NOT EXISTS idx_passkey_credential ON passkey(credentialID);

-- Relay's application-owned tables, unchanged in shape from 0001 — only the FK target
-- moves from the now-dropped `users(id)` to `user(id)`.
DROP TABLE IF EXISTS follows;
CREATE TABLE follows (
  user_id     TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  sport       TEXT NOT NULL,                -- 'mlb' | 'nfl' | 'ncaaf'
  entity_type TEXT NOT NULL,                -- 'team' | 'player'
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, sport, entity_type, entity_id)
);

DROP TABLE IF EXISTS preferences;
CREATE TABLE preferences (
  user_id    TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT REFERENCES user(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,                -- 'login' | 'logout' | 'logout_all' | 'delete'
  ip         TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
