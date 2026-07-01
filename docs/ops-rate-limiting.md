# Rate Limiting — /api/* Proxy Layer

**Status:** middleware shipped 2026-07-01 (`functions/api/_middleware.js`). Dashboard rule = owner action, pending.
**Owner:** Cipher (spec) / Axiom (middleware) / z man (dashboard rule)

## What shipped in code

`functions/api/_middleware.js` applies to every `/api/*` route: 120 requests per rolling
minute per IP, then `429` + `Retry-After`. It is **best-effort** — counts live in isolate
memory, so they reset on isolate recycle and are independent per Cloudflare colo. It damps
scrapers and proxy freeloaders; it is not a hard quota. CORS preflights are exempt.

The client already handles this shape: a 429 fails the fetch, and every view renders its
error state with a retry button.

## Owner action — Cloudflare dashboard WAF rule (real enforcement)

Cloudflare Dashboard → your Pages project's zone → **Security → WAF → Rate limiting rules**
→ Create rule:

- **Name:** `api-proxy-limit`
- **If incoming requests match:** `URI Path starts with /api/`
- **Rate:** 300 requests per 1 minute, per IP
- **Then:** Block for 1 minute (response code 429)

The WAF rate (300/min) is deliberately looser than the middleware (120/min) — the WAF is
the backstop against distributed abuse; the middleware handles the common single-IP case
at zero cost. Free-plan zones get 1 rate-limiting rule; this is the right one to spend it on.

## Why this matters

Before this, anyone could use SportStrata's Workers as a free authenticated-free proxy to
ESPN/Sleeper/MLB — burning Pages Function quota and risking upstream IP bans (a ban on
Cloudflare egress IPs = full product outage for the affected data source). It also becomes
a prerequisite once D-031 auth endpoints exist next to these routes.
