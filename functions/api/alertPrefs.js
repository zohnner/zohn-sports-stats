// D-069 — GET/POST a signed-in user's weekly-digest opt-in. Off by default, no
// dark pattern (ISSUES.md "Weekly Fantasy Digest" behavioral spec). Session-scoped,
// same never-trust-a-client-supplied-user-id discipline as follows.js/prefs.js/
// sleeperLink.js/draftHistory.js.
import { buildAuth } from './auth/_instance.js';

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const row = await context.env.USER_DB
		.prepare('SELECT digest_enabled FROM alert_prefs WHERE user_id = ?')
		.bind(session.user.id)
		.first();

	return Response.json({ digestEnabled: !!(row && row.digest_enabled) });
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!body || typeof body.digestEnabled !== 'boolean') {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const now = Date.now();
	await context.env.USER_DB
		.prepare(
			`INSERT INTO alert_prefs (user_id, digest_enabled, updated_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET digest_enabled = excluded.digest_enabled, updated_at = excluded.updated_at`
		)
		.bind(session.user.id, body.digestEnabled ? 1 : 0, now)
		.run();

	return Response.json({ ok: true, digestEnabled: body.digestEnabled });
}
