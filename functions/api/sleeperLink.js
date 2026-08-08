// D-065 — GET returns the signed-in user's current Sleeper league link (if any),
// POST creates or replaces it (upsert -- "change league" is just re-POSTing), DELETE
// removes it ("unlink"). Session-scoped only; user_id always comes from the session,
// never the client body -- same Cipher-mandated pattern as follows.js/prefs.js.
//
// Unlike draftHistory.js (D-064, deliberately no DELETE), this table IS meant to be
// deleted from directly -- a stale/wrong link is actively harmful, not just clutter.
import { buildAuth } from './auth/_instance.js';

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const row = await context.env.USER_DB
		.prepare('SELECT sleeper_user_id, sleeper_username, league_id, league_name, league_avatar, linked_at FROM sleeper_links WHERE user_id = ?')
		.bind(session.user.id)
		.first();

	return Response.json({ link: row || null });
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!body || !body.sleeper_user_id || !body.sleeper_username || !body.league_id || !body.league_name) {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const now = Date.now();
	await context.env.USER_DB
		.prepare(
			`INSERT INTO sleeper_links (user_id, sleeper_user_id, sleeper_username, league_id, league_name, league_avatar, linked_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET
			   sleeper_user_id = excluded.sleeper_user_id,
			   sleeper_username = excluded.sleeper_username,
			   league_id = excluded.league_id,
			   league_name = excluded.league_name,
			   league_avatar = excluded.league_avatar,
			   linked_at = excluded.linked_at`
		)
		.bind(session.user.id, String(body.sleeper_user_id), String(body.sleeper_username), String(body.league_id), String(body.league_name), body.league_avatar ? String(body.league_avatar) : null, now)
		.run();

	return Response.json({ ok: true, linked_at: now });
}

export async function onRequestDelete(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	await context.env.USER_DB
		.prepare('DELETE FROM sleeper_links WHERE user_id = ?')
		.bind(session.user.id)
		.run();

	return Response.json({ ok: true });
}
