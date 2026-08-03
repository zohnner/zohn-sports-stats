# A-031 — User Data Schema & Data-Rights Design (Relay)

**Status:** DRAFT — pending team review. Gate for D-031 Phase 1.
**Principle:** minimal personal data; every user can export and hard-delete everything; sessions and deleted accounts are purged on a schedule.

## Database
- Use a **separate D1 database** from the existing edge-cache D1 (isolation: user data must never share a binding with cached sports data). New binding, e.g. `USER_DB`.
- Managed with `wrangler d1 migrations` (versioned SQL in `migrations/`).

## Schema (Phase 1)
```sql
-- Identity
CREATE TABLE users (
  id            TEXT PRIMARY KEY,           -- uuid
  email         TEXT UNIQUE NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  display_name  TEXT,
  created_at    INTEGER NOT NULL,           -- epoch ms
  last_login_at INTEGER
);

-- Linked sign-in methods (OAuth / passkey / magic-link); secrets handled by the auth lib
CREATE TABLE auth_accounts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,               -- 'google' | 'passkey' | 'email' (Apple deferred — see auth-feasibility-spike.md)
  provider_uid TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  UNIQUE (provider, provider_uid)
);

-- Server-side sessions (store only a HASH of the token)
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,              -- random id (client cookie carries it)
  token_hash TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_exp  ON sessions(expires_at);

-- Followed teams/players
CREATE TABLE follows (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sport       TEXT NOT NULL,                -- 'mlb' | 'nfl'
  entity_type TEXT NOT NULL,                -- 'team' | 'player'
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, sport, entity_type, entity_id)
);

-- Preferences (one row per user; small JSON blob keeps it flexible without migrations)
CREATE TABLE preferences (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',    -- e.g. {"theme","defaultSport","scoring"}
  updated_at INTEGER NOT NULL
);
```
`ON DELETE CASCADE` everywhere off `users` makes hard-delete a single statement plus session purge.

## PII inventory
- **Email** (required for login/contact) — the only real PII. Display name optional.
- No addresses, no payment data (out of scope), no third-party sharing.

## Data rights (required at launch)
- **Export:** authenticated endpoint returns a JSON bundle of all rows for the user (users, auth_accounts, follows, preferences; sessions summarized, tokens never included).
- **Hard delete:** `DELETE FROM users WHERE id=?` cascades all child rows; explicitly purge sessions; confirm via re-auth. Irreversible, completes synchronously.
- **Retention:** expired sessions purged by a scheduled Worker (cron) daily; deleted accounts leave no residue; audit log rows older than 90 days purged by the **same daily cron** (added at cross-team review 2026-08-02 — the 90d figure was already promised in Folio's legal checklist but had no purge mechanism defined against it; the cron job scope is now explicitly both `sessions` and `audit_log`, not sessions alone).

## Access rules
- Every read/write is scoped to `session.user_id`. No endpoint accepts a user id from the client. Server authorizes from the session only.

## Open questions for the team
1. Preferences as a JSON blob (flexible, recommended) vs typed columns (queryable)? 
2. Add a lightweight `audit_log` table in Phase 1, or defer to the notifications/payments phase? (Recommended: minimal login audit now.)
3. Cron purge cadence — daily sufficient? (Recommended: yes; scope confirmed at review to cover both `sessions` and `audit_log`.)

## Review status
**REVIEWED — signed off 2026-08-02** (cross-team pass ahead of D-031 Phase 1). One gap found and closed above (audit_log purge cadence had no mechanism defined against the 90d promise in Folio's legal checklist); one stale comment fixed (`apple` removed from `auth_accounts.provider`, matching the already-correct migration and the feasibility spike's decision to defer Apple). No other inconsistencies found against auth-security-spec.md, auth-feasibility-spike.md, or migrations/0001_user_schema.sql.
