# A-031 — Phase 1 Setup Runbook (owner-run, detailed)

You run these; secrets never pass through the assistant or the repo. Do the **dev**
pass first end-to-end, confirm it works, then repeat for **production**. Ideally use
separate Google/Resend/Turnstile credentials for dev vs prod.

> Confidence note: exact `wrangler` flags drift between versions. Run `wrangler --version`
> (want a recent v3+/v4) and check `wrangler pages --help`, `wrangler d1 --help` if a
> command differs. Project name is assumed **`zohn-sports-stats`** (the `*.pages.dev`
> name) — confirm in the Cloudflare dashboard and substitute if different.

## 0. Prerequisites
```
node --version            # 18+
npm i -g wrangler         # or use `npx wrangler ...` everywhere
wrangler --version
wrangler login            # opens browser; authorize your Cloudflare account
wrangler pages project list   # confirm you see zohn-sports-stats
```

## 1. Create the user database (separate from the sports-cache D1)
```
wrangler d1 create sportstrata-users
```
Copy the `database_id` it prints. Then create a root **`wrangler.toml`** (for migrations
+ local dev). Keep it minimal so it does not fight your existing dashboard deploy:
```toml
name = "zohn-sports-stats"
compatibility_date = "2024-11-01"

[[d1_databases]]
binding = "USER_DB"
database_name = "sportstrata-users"
database_id = "PASTE_DATABASE_ID_HERE"
```
> ⚠ This project currently deploys via dashboard settings. Before relying on
> `wrangler.toml` for deploys, check Pages → Settings → Builds: if a build output dir is
> set, add `pages_build_output_dir = "<that dir>"` here too. Safest: use the dashboard for
> the **runtime** binding (step 2) and treat `wrangler.toml` as local/migration-only.

## 2. Bind the DB to the Pages project (runtime)
Dashboard → Workers & Pages → **zohn-sports-stats** → Settings → Functions →
**D1 database bindings** → Add:
- Variable name: `USER_DB`
- Database: `sportstrata-users`
- Add it under **both Production and Preview**.

## 3. Apply the schema
```
wrangler d1 migrations apply sportstrata-users --local     # local dev DB
wrangler d1 migrations apply sportstrata-users --remote    # the real DB
```
Verify:
```
wrangler d1 execute sportstrata-users --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table';"
```
Expect: users, auth_accounts, sessions, follows, preferences, audit_log.

## 4. Google OAuth client
1. console.cloud.google.com → create project "SportStrata".
2. **OAuth consent screen** → External → app name, support email, developer email →
   scopes `openid`, `email`, `profile` → add yourself as a test user.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - Authorized JavaScript origins: `https://sportstrata.cc`, `http://localhost:8788`
   - Authorized redirect URIs: `https://sportstrata.cc/api/auth/callback/google`,
     `http://localhost:8788/api/auth/callback/google`
   (`8788` is wrangler pages dev's default port — confirm when you run it.)
4. Copy **Client ID** + **Client secret** for step 7.

## 5. Resend (magic-link email)
1. resend.com → sign up.
2. **Domains → Add domain → `sportstrata.cc`** (or a subdomain like `mail.sportstrata.cc`
   to isolate sending reputation). Resend shows DNS records: an **SPF** TXT, **DKIM**
   CNAME(s), and a **DMARC** TXT.
3. Add those records in Cloudflare DNS (your domain → DNS → Records). Wait for **Verified**.
   Do not skip DMARC — it's the anti-spoofing + deliverability guardrail.
4. **API Keys → Create** with **Sending access** only → copy the key for step 7.
5. From address will be on the verified domain, e.g. `SportStrata <login@sportstrata.cc>`.

## 6. Turnstile (bot protection on auth endpoints)
Dashboard → Turnstile → **Add site** → `sportstrata.cc` (+ `localhost` for dev) →
mode **Managed**. Copy the **Site key** (public, goes in client config later) and the
**Secret key** (step 7).

## 7. Secrets
Generate the auth secret: `openssl rand -base64 32`.

**Production** (encrypted, per project):
```
wrangler pages secret put AUTH_SECRET          --project-name zohn-sports-stats
wrangler pages secret put GOOGLE_CLIENT_ID     --project-name zohn-sports-stats
wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name zohn-sports-stats
wrangler pages secret put RESEND_API_KEY       --project-name zohn-sports-stats
wrangler pages secret put TURNSTILE_SECRET_KEY --project-name zohn-sports-stats
```
**Local dev** → create `.dev.vars` at repo root and **add it to .gitignore first**:
```
AUTH_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
RESEND_API_KEY=...
TURNSTILE_SECRET_KEY=...
```
Confirm: `git check-ignore .dev.vars` prints the path (i.e. it's ignored).

## 8. Run locally (after Finn's code lands)
```
npx wrangler pages dev . --d1 USER_DB=sportstrata-users
```
Open the printed localhost URL, sign in via Google + passkey, confirm a `__Host-` cookie.

## 9. Hand back
When **dev** (DB + bindings + secrets + verified email DNS + Turnstile) is in place, tell
the assistant. Finn implements Phase 1, runs the spike acceptance checklist
(docs/auth-feasibility-spike.md) on `wrangler pages dev`, then prod; `/security-review`
+ lawyer pass on docs/auth-legal-checklist.md gate launch.

## Security rules (non-negotiable)
- Never commit `.dev.vars` or any secret. Rotate `AUTH_SECRET` if exposed.
- Separate dev vs prod credentials (own Google client + Resend key + Turnstile for each).
- API keys least-privilege (Resend: sending only).
