# A-031 — Auth Feasibility Spike (Axiom)

**Status:** DRAFT — pending team review. Feasibility gate for D-031 Phase 1.
**Goal:** confirm Cloudflare-native accounts are buildable on our stack, pick the library, and resolve the open questions Cipher and Relay raised. No production auth code ships from this spike — it defines what Finn builds once gates pass.

## Open questions — resolved (recommendations)
- **Sign-in methods at launch:** **passkeys + Google OAuth + email magic-link.** No passwords. Apple OAuth deferred (paid Apple Developer account + review overhead; add later). Magic-link is the no-passkey/no-Google fallback.
- **CSP nonce migration:** **fast-follow, hard requirement before any paid tier.** Acceptable to launch the free auth foundation on current CSP; documented risk.
- **Preferences storage:** **JSON blob** (`preferences.data`) — flexible, no migration per new pref.
- **Login audit:** **yes, minimal** (`audit_log`: user_id, event, ip, ua, ts) in Phase 1.

## Library decision
**better-auth** with its D1 adapter — covers passkeys (WebAuthn), OAuth, and magic-link in one vetted library, which is the point of choosing "Cloudflare-native + library" without hand-rolling crypto. Fallbacks if the spike fails acceptance: Cloudflare `workers-oauth-provider` (OAuth only) or `jose` + WebCrypto with KV/D1 sessions.
**Must verify in spike:** better-auth session-refresh bug (#4203). Mitigation if unresolved — disable the rolling-refresh path and rely on idle + absolute expiry with explicit rotation on login; pin the version.

## Architecture on Cloudflare Pages
- **Routing:** a catch-all Pages Function `functions/api/auth/[[route]].js` mounts the better-auth handler; `/api/auth/*` is auth, everything else unchanged.
- **Session middleware:** a shared helper resolves the `__Host-` cookie → session row in `USER_DB` → `user` for downstream routes (`/api/me`, `/api/follows`, `/api/prefs`). Every user route authorizes from the session only; the client never passes a user id.
- **Stateless Workers:** instantiate the auth object **per request** (no module-level singleton) — this is the #1 Workers footgun.
- **Data:** new **`USER_DB`** D1 binding, separate from the sports-cache D1. Schema + migrations per Relay's spec via `wrangler d1 migrations`.
- **Secrets:** OAuth client id/secret, auth signing secret, email-provider key — all `wrangler secret`, dev/prod separated, none in source.

## Architecture shift to RATIFY
This is the founding "no backend / zero-dependency Functions" constraint changing, deliberately:
- Functions gain **npm dependencies** (`package.json` + `better-auth`). Cloudflare Pages bundles Functions with esbuild **at deploy**, so there's **no manual build step in our repo and the static front end stays buildless** — but CI now runs a Functions build, and `node_modules` enters the toolchain. Document in CLAUDE.md.
- New runtime dependencies: a D1 user database and an **email sender** for magic-links (e.g. Resend/Postmark) — another secret + small cost. Passkeys/Google avoid email at sign-in; only the fallback needs it.

## Spike acceptance checklist (must pass before Finn implements)
1. `wrangler dev` with a local `USER_DB`: sign in via Google **and** passkey; cookie is `__Host-`, `HttpOnly`, `Secure`, `SameSite=Lax`.
2. Session persists across requests; `/api/me` returns the user; logout + "log out all" revoke server-side.
3. Account hard-delete cascades all rows; expired-session purge cron runs.
4. Rate limiting + Turnstile active on auth endpoints; no secrets in source; `git` clean of keys.
5. Pages build succeeds with Functions bundling; front end unchanged for signed-out users.
6. #4203 refresh behavior confirmed acceptable or mitigated.

## Risks
- Library/vendor churn (mitigate: pin, fallback identified).
- Workers CPU limits on WebAuthn/crypto (use WebCrypto; better-auth handles).
- Email deliverability/cost for magic-links (defer-able; passkeys+Google cover most).

## Recommendation
**Proceed.** better-auth on D1 is feasible and fits the stack; ratify the Functions-build-step shift, then Vera/Kael (UX/visual) and Folio (legal) gates remain before Finn writes Phase-1 code.
