-- SportsStrata D1 schema
-- api_cache: edge-side cache for MLB API responses

CREATE TABLE IF NOT EXISTS api_cache (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache (expires_at);
