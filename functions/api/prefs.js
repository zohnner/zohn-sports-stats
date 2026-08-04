// D-031 Phase 1 — GET/PUT synced preferences. Vera's spec: "server wins on load, client
// writes win going forward" — this endpoint just stores/returns the blob; the merge
// policy itself lives client-side in js/auth.js at the point of sign-in.
import { buildAuth } from './auth/_instance.js';

const MAX_PREFS_BYTES = 4096; // small JSON blob, not a general-purpose store

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const row = await context.env.USER_DB
		.prepare('SELECT data, updated_at FROM preferences WHERE user_id = ?')
		.bind(session.user.id)
		.first();

	return Response.json({
		preferences: row ? JSON.parse(row.data) : {},
		updatedAt: row?.updated_at || null,
	});
}

export async function onRequestPut(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}
	const serialized = JSON.stringify(body);
	if (serialized.length > MAX_PREFS_BYTES) {
		return Response.json({ error: 'preferences_too_large' }, { status: 413 });
	}

	const now = Date.now();
	await context.env.USER_DB
		.prepare(
			`INSERT INTO preferences (user_id, data, updated_at) VALUES (?, ?, ?)
			 ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
		)
		.bind(session.user.id, serialized, now)
		.run();

	return Response.json({ ok: true, updatedAt: now });
}
