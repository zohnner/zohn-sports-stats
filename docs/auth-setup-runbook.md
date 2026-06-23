# A-031 — Phase 1 Setup Runbook (owner-run)

These are the steps **you** run to create the accounts, database, and secrets so
Finn can build + verify Phase-1 auth. Nothing here is automated by the assistant —
secrets never pass through it or the repo. Do dev first, then repeat for prod.

## 1. User database (separate from the sports-cache D1)
```
wrangler d1 create sportstrata-users           # note the database_id
# add the binding to wrangler.toml as USER_DB
wrangler d1 migrations apply USER_DB --local    # dev
wrangler d1 migrations apply USER_DB --remote    # prod
```
Migration ships in `migrations/0001_user_schema.sql`.

## 2. Google OAuth client
- Google Cloud Console → APIs & Services → Credentials → OAuth client (Web).
- Authorized redirect URI: `https://sportstrata.cc/api/auth/callback/google` (+ a localhost URI for dev).
- Copy the client id + secret into secrets (step 4).

## 3. Resend (transactional email for magic-links)
- Create a Resend account; **add and verify the `sportstrata.cc` domain** — this publishes SPF, DKIM, and DMARC DNS records. Do not skip DMARC; it's the anti-spoofing + deliverability guardrail.
- Create an API key scoped to **sending only**.
- (Migration note: this is abstracted behind one `sendEmail()` helper so we can move to Cloudflare Email Service at GA without touching auth.)

## 4. Secrets (never in source — P1-006 discipline)
```
wrangler secret put AUTH_SECRET            # 32+ random bytes, unique per env
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

## 5. Turnstile (bot protection on auth endpoints)
- Cloudflare dashboard → Turnstile → create a widget for `sportstrata.cc`.
- Public site key goes in client config (not secret); secret key via step 4.

## 6. Hand back to Finn
Once 1–5 exist in **dev**, Finn implements Phase 1 against a working `wrangler dev`
and runs the spike acceptance checklist (docs/auth-feasibility-spike.md) before
anything touches prod. A full `/security-review` precedes launch; legal docs
(docs/auth-legal-checklist.md) get a lawyer pass before going live.

## Security defaults baked into the build (for reference)
- Sessions: opaque token, stored hashed; `__Host-` HttpOnly Secure SameSite=Lax cookie.
- Mutations require same-origin + a custom header (CSRF).
- Rate limiting + Turnstile on login / magic-link / callback.
- Separate dev/prod secrets + D1; least-privilege API keys.
