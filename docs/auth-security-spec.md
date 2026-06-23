# A-031 — Auth Security Spec & Threat Model (Cipher)

**Status:** DRAFT — pending team review. Gate for D-031 Phase 1 (accounts foundation).
**Scope:** sign-in, sessions, and account data for the Phase-1 foundation (accounts + follows + synced prefs). No payments in scope. Auth is optional and non-blocking.

## Principles
1. **We never store raw passwords and never hand-roll crypto.** A vetted library (better-auth candidate) owns password hashing, OAuth, and token primitives. We own configuration, session policy, and review.
2. **Data minimization.** Store the least that makes accounts work: a user id, email, linked OAuth identities, and app preferences/follows. Nothing else.
3. **Secrets never touch source.** All provider/client/signing secrets via `wrangler secret` (carry forward the P1-006 lesson). Separate dev and prod secrets.
4. **Signed-out parity.** The no-login experience must not regress; auth only adds.

## Assets to protect
- User identity (email, OAuth subject ids).
- Session tokens / cookies.
- The user database (follows, prefs) — low sensitivity but still personal data.
- Provider client secrets and any signing keys.

## Threat model (STRIDE-lite) and mitigations
| Threat | Vector | Mitigation |
|---|---|---|
| Credential theft | Phishing, password reuse | **Passkeys-first** + OAuth (Google/Apple); optional email magic-link. Minimize/avoid passwords. |
| Session hijack | Token theft, fixation | Opaque 256-bit session id, **stored hashed at rest** in D1; rotate on login; short idle + absolute expiry. |
| XSS → token exfil | Injected script | Cookies `HttpOnly` so script can't read them; keep `_escHtml()` discipline; **tighten CSP** (remove `'unsafe-inline'` for scripts → nonces) as a hardening follow-up. |
| CSRF | Cross-site state change | `SameSite=Lax` cookies + **origin check and a custom header required on all mutations** (`/api` is same-origin). |
| Account takeover | Brute force, cred stuffing | **Rate limiting** per-IP and per-account on login / magic-link / OAuth callback; lockout/backoff; **Cloudflare Turnstile** on sign-up/login (user-solved, never bot-bypassed by us). |
| Account enumeration | Differential responses/timing | Uniform responses + timing on "email exists" paths; generic errors. |
| Secret leakage | Secrets in source/logs | `wrangler secret` only; **never log tokens, cookies, or secrets**; secret scanning in pre-push. |
| Privilege/data exposure | Broken access control | Every `/api` user route authorizes the session → only the owner's rows; server-side checks, never trust client. |

## Session design
- **Server-side sessions in D1** (opaque random token; store only its hash). Stateless JWTs rejected for Phase 1 — we want instant server-side revocation.
- Cookie: `__Host-` prefix, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`.
- Lifetimes: idle timeout ~7d, absolute ~30d; rotate id on each successful auth; "log out all devices" purges the user's session rows.
- Workers are **stateless per request** → re-instantiate the auth object per request (no singleton).

## Transport & headers
- HTTPS only (Cloudflare) + HSTS. CSP already strict apart from script `'unsafe-inline'` — schedule a nonce migration before launch since auth raises the cost of any XSS.

## Account lifecycle
- Email verification before first sync write. Recovery via provider / magic-link.
- Audit trail of auth events (login, new device, logout-all) — no tokens/secrets in it.
- Re-authentication required for future sensitive actions (e.g., when payments arrive).

## Dependencies
- Pin and audit the auth library; **verify better-auth session-refresh bug #4203** during the Axiom spike before adopting. Have `workers-oauth-provider` / `jose`+KV as fallbacks.

## Open questions for the team
1. Passkeys-only at launch, or passkeys + one OAuth provider + magic-link?
2. Email storage: plaintext (needed for login/contact) with DB-level protection — acceptable? (Recommended: yes, minimized.)
3. CSP nonce migration: block launch on it, or fast-follow? (Recommended: before any *paid* tier; document risk if deferred.)
