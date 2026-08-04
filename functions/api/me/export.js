// D-031 Phase 1 — GET /api/me/export. Relay's data-rights spec: "authenticated endpoint
// returns a JSON bundle of all rows for the user (users, auth_accounts, follows,
// preferences; sessions summarized, tokens never included)."
import { buildAuth } from '../auth/_instance.js';

export async function onRequestGet(context) {
	const auth = buildAuth(context.env);
	const session = await auth.api.getSession({ headers: context.request.headers });
	if (!session) {
		return Response.json({ error: 'not_signed_in' }, { status: 401 });
	}

	const db = context.env.USER_DB;
	const uid = session.user.id;

	const [accounts, sessions, follows, prefs, passkeys] = await Promise.all([
		db.prepare('SELECT providerId, accountId, createdAt FROM account WHERE userId = ?').bind(uid).all(),
		// Summarized per Relay's spec — no token column in the export, ever.
		db.prepare('SELECT id, createdAt, expiresAt, ipAddress, userAgent FROM session WHERE userId = ?').bind(uid).all(),
		db.prepare('SELECT sport, entity_type, entity_id, created_at FROM follows WHERE user_id = ?').bind(uid).all(),
		db.prepare('SELECT data, updated_at FROM preferences WHERE user_id = ?').bind(uid).first(),
		db.prepare('SELECT name, deviceType, createdAt FROM passkey WHERE userId = ?').bind(uid).all(),
	]);

	const bundle = {
		exportedAt: new Date().toISOString(),
		user: {
			id: session.user.id,
			email: session.user.email,
			name: session.user.name,
			emailVerified: !!session.user.emailVerified,
			createdAt: session.user.createdAt,
		},
		linkedAccounts: accounts.results,
		passkeys: passkeys.results,
		sessions: sessions.results,
		follows: follows.results,
		preferences: prefs ? JSON.parse(prefs.data || '{}') : {},
	};

	return new Response(JSON.stringify(bundle, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Content-Disposition': 'attachment; filename="sportstrata-data-export.json"',
		},
	});
}
