// D-031 Phase 1 — shared better-auth instance builder.
// Underscore-prefixed => not a routable endpoint (same convention as functions/api/_middleware.js).
// Imported by [[route]].js (mounts the full handler) and by the session-scoped API routes
// (me.js, me/export.js, follows.js, prefs.js) that need to resolve "who is this request from."
//
// Per-request instantiation is deliberate, not an oversight: Workers are stateless per
// request, and a module-level singleton auth object would leak the D1 binding across
// isolates. This was the #1 footgun flagged in the Axiom feasibility spike
// (docs/auth-feasibility-spike.md) and ratified in DECISIONS.md D-031.
import { betterAuth } from 'better-auth';
import { passkey } from '@better-auth/passkey';
import { magicLink } from 'better-auth/plugins';
import { createAuthMiddleware, APIError } from 'better-auth/api';
import { Kysely } from 'kysely';
import { D1Dialect } from 'kysely-d1';
import { sendMagicLinkEmail } from './_email.js';
import { verifyTurnstile } from './_turnstile.js';

// Endpoints where a bot could enumerate accounts or spam sign-in — Turnstile-gated per
// Cipher's threat model (auth-security-spec.md). Matched by suffix rather than pinned to
// one exact better-auth path shape: an exact-match that goes stale after a library upgrade
// would silently stop protecting a renamed endpoint instead of erroring loudly.
const TURNSTILE_GATED_SUFFIXES = [
	'/sign-in/social',
	'/sign-in/magic-link',
	'/passkey/generate-register-options',
	'/passkey/generate-authenticate-options',
];

export function buildAuth(env) {
	if (!env.USER_DB) {
		throw new Error('USER_DB binding missing — see docs/auth-setup-runbook.md step 2 (bind the D1 database in the Pages dashboard, both Production and Preview).');
	}
	if (!env.AUTH_SECRET) {
		throw new Error('AUTH_SECRET missing — see docs/auth-setup-runbook.md step 7.');
	}

	const db = new Kysely({ dialect: new D1Dialect({ database: env.USER_DB }) });

	return betterAuth({
		// { db, type: 'sqlite' } rather than passing the Kysely instance bare: better-auth's
		// dialect auto-detection matches known dialect constructor names (Postgres/MySQL/
		// Sqlite), and D1Dialect (from kysely-d1) isn't one of them — the explicit type hint
		// is required, not optional, for a correct sqlite-flavored adapter (booleans as 0/1,
		// no RETURNING support assumed, etc).
		database: { db, type: 'sqlite' },
		secret: env.AUTH_SECRET,
		baseURL: env.AUTH_BASE_URL || undefined,
		trustedOrigins: env.AUTH_TRUSTED_ORIGINS
			? env.AUTH_TRUSTED_ORIGINS.split(',').map((s) => s.trim())
			: undefined,

		// Cipher's spec: idle + absolute expiry, opaque token, no forced password path.
		// Rolling-refresh behavior (better-auth issue #4203) is a disclosed spike-acceptance
		// item — auth-feasibility-spike.md item 6 — not yet confirmed against a live D1
		// instance from this environment. If it misbehaves, `updateAge` below is the first
		// knob to try (increase it, which reduces how often a refresh is attempted).
		session: {
			expiresIn: 60 * 60 * 24 * 30, // 30d absolute
			updateAge: 60 * 60 * 24 * 7, // ~7d idle-refresh cadence
			cookieCache: { enabled: false }, // D1 is the source of truth, not a cookie cache
		},

		// __Host- cookie (Secure + Path=/ + no Domain, exactly Cipher's spec) is what
		// useSecureCookies + cookiePrefix produce together in better-auth's cookie builder.
		advanced: {
			useSecureCookies: true,
			cookiePrefix: 'sportstrata',
			defaultCookieAttributes: { sameSite: 'lax', path: '/', httpOnly: true },
		},

		socialProviders: {
			google: {
				clientId: env.GOOGLE_CLIENT_ID,
				clientSecret: env.GOOGLE_CLIENT_SECRET,
			},
		},

		plugins: [
			passkey({
				rpID: env.PASSKEY_RP_ID || 'sportstrata.cc',
				rpName: 'SportStrata',
				origin: env.PASSKEY_ORIGIN || 'https://sportstrata.cc',
			}),
			magicLink({
				sendMagicLink: async ({ email, url }) => sendMagicLinkEmail(env, email, url),
			}),
		],

		// Cipher's spec: rate limiting on auth endpoints. better-auth's own database-backed
		// limiter (separate from, and in addition to, functions/api/_middleware.js's
		// 120/min/IP catch-all — belt and suspenders, not redundant: this one is scoped to
		// auth endpoints specifically and keyed differently).
		rateLimit: { enabled: true, storage: 'database', window: 60, max: 10 },

		// better-auth requires `user.name`. Vera's spec (auth-ux-visual-spec.md) never
		// collects one — display name is optional, per Relay's original minimal-PII
		// posture — so sign-up would otherwise hard-fail on a field nothing in the UI asks
		// for. Default it from the email's local part instead of blocking.
		databaseHooks: {
			user: {
				create: {
					before: async (user) => {
						if (!user.name) {
							return { data: { ...user, name: String(user.email || '').split('@')[0] || 'SportStrata User' } };
						}
						return { data: user };
					},
				},
			},
		},

		// Turnstile gate on the sensitive endpoints listed above. better-auth ships no
		// Turnstile plugin of its own, so this is a `hooks.before` check rather than a
		// plugin — verified against betterAuth's actual exported API (createAuthMiddleware
		// from 'better-auth/api'), not guessed.
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				const gated = TURNSTILE_GATED_SUFFIXES.some((suffix) => ctx.path.endsWith(suffix));
				if (!gated) return;
				// The passkey options endpoints are GET (no body) — token arrives as a
				// query param there, and in the POST body for sign-in/social + magic-link.
				const token = ctx.body?.turnstileToken || ctx.query?.turnstileToken;
				const ok = await verifyTurnstile(env, token, ctx.request);
				if (!ok) {
					throw new APIError('BAD_REQUEST', { message: 'Turnstile verification failed' });
				}
			}),
		},
	});
}
