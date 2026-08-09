// D-079 -- GET returns whether the current browser (by endpoint) has an active
// subscription, POST upserts a subscription row, DELETE removes one by endpoint.
// Session-scoped only -- same discipline as follows.js: user_id always comes from
// the session, never the client. Modeled directly on functions/api/follows.js.
import { buildAuth } from './auth/_instance.js';

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

function validateSubscription(body) {
	if (!body || typeof body.endpoint !== 'string' || !body.endpoint) return false;
	if (!body.keys || typeof body.keys.p256dh !== 'string' || typeof body.keys.auth !== 'string') return false;
	if (!body.keys.p256dh || !body.keys.auth) return false;
	return true;
}

// GET ?endpoint=<url> -- used by the client on load to decide whether to show
// the toggle as already-on for this specific browser (a user may be signed in
// on a browser that was never subscribed, or was subscribed then uninstalled).
export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const endpoint = new URL(context.request.url).searchParams.get('endpoint') || '';
	if (!endpoint) return Response.json({ subscribed: false });

	const row = await context.env.USER_DB
		.prepare('SELECT id FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
		.bind(session.user.id, endpoint)
		.first();

	return Response.json({ subscribed: !!row });
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!validateSubscription(body)) {
		return Response.json({ error: 'invalid_subscription' }, { status: 400 });
	}

	// UNIQUE(endpoint) means the same browser re-subscribing (SW updates, key
	// rotation) upserts its keys/timestamp instead of piling up duplicate rows.
	await context.env.USER_DB
		.prepare(
			`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, created_at = excluded.created_at`
		)
		.bind(crypto.randomUUID(), session.user.id, body.endpoint, body.keys.p256dh, body.keys.auth, Date.now())
		.run();

	return Response.json({ ok: true }, { status: 201 });
}

export async function onRequestDelete(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });

	const body = await context.request.json().catch(() => null);
	if (!body || typeof body.endpoint !== 'string' || !body.endpoint) {
		return Response.json({ error: 'invalid_subscription' }, { status: 400 });
	}

	await context.env.USER_DB
		.prepare('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?')
		.bind(session.user.id, body.endpoint)
		.run();

	return Response.json({ ok: true });
}
