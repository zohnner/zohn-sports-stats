// D-064 — GET lists the signed-in user's saved Mock Draft results (newest first, capped),
// POST saves one. Session-scoped only; user_id always comes from the session, never the
// client body — same Cipher-mandated pattern as follows.js/prefs.js. No DELETE in v1:
// Vera's spec is a silent rolling window, so POST enforces the cap itself by dropping
// anything beyond MAX_DRAFTS for this user in the same request.
import { buildAuth } from './auth/_instance.js';

const MAX_DRAFTS = 20;
const MAX_RESULT_BYTES = 16384; // a trimmed draft (own picks + summary) is ~1-2KB; generous margin

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const { results } = await context.env.USER_DB
		.prepare('SELECT id, result, created_at FROM draft_history WHERE user_id = ? AND sport = ? ORDER BY created_at DESC LIMIT ?')
		.bind(session.user.id, 'nfl', MAX_DRAFTS)
		.all();

	const drafts = (results || []).map(row => {
		let parsed;
		try { parsed = JSON.parse(row.result); } catch (_) { parsed = null; }
		if (!parsed) return null;
		return { id: row.id, created_at: row.created_at, ...parsed };
	}).filter(Boolean);

	return Response.json({ drafts });
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!body || typeof body !== 'object' || !body.config || !body.grade || !Array.isArray(body.roster)) {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}
	const serialized = JSON.stringify(body);
	if (serialized.length > MAX_RESULT_BYTES) {
		return Response.json({ error: 'draft_too_large' }, { status: 413 });
	}

	const id = crypto.randomUUID();
	const now = Date.now();
	await context.env.USER_DB
		.prepare('INSERT INTO draft_history (id, user_id, sport, result, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(id, session.user.id, 'nfl', serialized, now)
		.run();

	// Rolling-window cap (Vera's spec: silent, no delete UI) — drop anything beyond
	// MAX_DRAFTS for this user/sport, oldest first, in the same request.
	await context.env.USER_DB
		.prepare(
			`DELETE FROM draft_history WHERE user_id = ? AND sport = ? AND id NOT IN (
			   SELECT id FROM draft_history WHERE user_id = ? AND sport = ? ORDER BY created_at DESC LIMIT ?
			 )`
		)
		.bind(session.user.id, 'nfl', session.user.id, 'nfl', MAX_DRAFTS)
		.run();

	return Response.json({ ok: true, id, created_at: now }, { status: 201 });
}
