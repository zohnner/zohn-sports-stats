// D-031 Phase 1 — GET current user + linked sign-in methods; DELETE hard-deletes the
// account. Session-scoped only, per Cipher's spec: "no endpoint accepts a user id from
// the client. Server authorizes from the session only."
import { buildAuth } from './auth/_instance.js';

export async function onRequestGet(context) {
	const auth = buildAuth(context.env);
	const session = await auth.api.getSession({ headers: context.request.headers });
	if (!session) {
		return Response.json({ error: 'not_signed_in' }, { status: 401 });
	}

	const db = context.env.USER_DB;
	const { results: linkedMethods } = await db
		.prepare('SELECT providerId, createdAt FROM account WHERE userId = ?')
		.bind(session.user.id)
		.all();

	return Response.json({
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
			image: session.user.image,
			emailVerified: !!session.user.emailVerified,
			createdAt: session.user.createdAt,
		},
		linkedMethods,
	});
}

// Hard delete. Cipher/Relay spec calls for "requires re-auth; irreversible; confirms
// twice" — the double-confirm is a front-end UX step (js/auth.js); this endpoint's own
// server-side guard is a match against the account's own email in the request body,
// which prevents a stray/CSRF'd DELETE from succeeding silently even with a valid
// session cookie. This is a simplification of "requires re-auth," not the full
// better-auth session-freshness flow (freshSessionMiddleware) — disclosed as a
// fast-follow to tighten once the spike-acceptance pass confirms that API's exact
// behavior against a live session.
export async function onRequestDelete(context) {
	const auth = buildAuth(context.env);
	const session = await auth.api.getSession({ headers: context.request.headers });
	if (!session) {
		return Response.json({ error: 'not_signed_in' }, { status: 401 });
	}

	let body;
	try {
		body = await context.request.json();
	} catch {
		body = {};
	}
	if (!body?.confirmEmail || body.confirmEmail.trim().toLowerCase() !== session.user.email.toLowerCase()) {
		return Response.json({ error: 'confirmation_mismatch' }, { status: 400 });
	}

	const db = context.env.USER_DB;
	// ON DELETE CASCADE off user(id) takes account/session/passkey/follows/preferences/
	// audit_log with it in one statement (migrations/0002_better_auth_canonical_schema.sql).
	await db.prepare('DELETE FROM user WHERE id = ?').bind(session.user.id).run();

	return new Response(null, { status: 204 });
}
