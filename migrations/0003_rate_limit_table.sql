-- D-031 Phase 1 amendment (2026-08-04) — add better-auth's database-backed rate-limit table.
--
-- WHY THIS MIGRATION EXISTS: functions/api/auth/_instance.js sets
-- `rateLimit: { enabled: true, storage: 'database', ... }` per Cipher's spec. better-auth's
-- database-backed rate limiter reads/writes its OWN `rateLimit` model
-- (@better-auth/core/dist/db/schema/rate-limit.mjs) — a table entirely separate from the
-- user/session/account/verification/passkey tables 0002 created. Nothing in 0001 or 0002
-- ever created it, because neither was written by actually tracing the rate-limiter's own
-- code path — only the auth-core tables were. First real request against
-- /api/auth/get-session in a live `wrangler pages dev` run surfaced this immediately:
-- `D1_ERROR: no such table: rateLimit: SQLITE_ERROR`, thrown from
-- better-auth/dist/api/rate-limiter/index.mjs's readRow() on every single request, since the
-- rate limiter runs on the hooks path before any endpoint logic — this blocked ALL auth
-- endpoints, not just the gated ones.
--
-- Exact shape traced from @better-auth/core/dist/db/get-tables.mjs's shouldAddRateLimitTable
-- branch: `key` (string, unique, required), `count` (number, required),
-- `lastRequest` (number, bigint-flagged, required, default Date.now()). No `id` field is ever
-- passed by the rate-limiter's own db.create() call — same as every other better-auth model,
-- the adapter generates it — so `id TEXT PRIMARY KEY` follows the identical pattern 0002 used
-- for user/session/account/verification/passkey.

CREATE TABLE IF NOT EXISTS rateLimit (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  count       INTEGER NOT NULL,
  lastRequest INTEGER NOT NULL
);
