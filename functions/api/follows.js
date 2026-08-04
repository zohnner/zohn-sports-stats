// D-031 Phase 1 — GET lists the signed-in user's follows, POST adds one, DELETE removes
// one. Session-scoped only; sport/entity_type/entity_id come from the request body but
// user_id always comes from the session, never the client (Cipher's spec).
import { buildAuth } from './auth/_instance.js';

const VALID_SPORTS = new Set(['mlb', 'nfl', 'ncaaf']);
const VALID_ENTITY_TYPES = new Set(['team', 'player']);

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

function validateFollow(body) {
	if (!body || !VALID_SPORTS.has(body.sport) || !VALID_ENTITY_TYPES.has(body.entity_type) || !body.entity_id) {
		return false;
	}
	return true;
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const { results } = await context.env.USER_DB
		.prepare('SELECT sport, entity_type, entity_id, created_at FROM follows WHERE user_id = ? ORDER BY created_at DESC')
		.bind(session.user.id)
		.all();

	return Response.json({ follows: results });
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!validateFollow(body)) {
		return Response.json({ error: 'invalid_follow' }, { status: 400 });
	}

	await context.env.USER_DB
		.prepare('INSERT OR IGNORE INTO follows (user_id, sport, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?)')
		.bind(session.user.id, body.sport, body.entity_type, String(body.entity_id), Date.now())
		.run();

	return Response.json({ ok: true }, { status: 201 });
}

export async function onRequestDelete(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!validateFollow(body)) {
		return Response.json({ error: 'invalid_follow' }, { status: 400 });
	}

	await context.env.USER_DB
		.prepare('DELETE FROM follows WHERE user_id = ? AND sport = ? AND entity_type = ? AND entity_id = ?')
		.bind(session.user.id, body.sport, body.entity_type, String(body.entity_id))
		.run();

	return Response.json({ ok: true });
}
