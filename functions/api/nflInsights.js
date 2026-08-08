// D-069 — AI League Insights (paid tier v1, "AI League Insights" in ISSUES.md).
// POST only. Session-scoped; computes everything server-side from the user's own
// linked Sleeper league (D-065) -- the client never supplies roster/stat data, so
// there's nothing here for a client to spoof.
//
// Free tier: one generation per rolling 7 days per user+league (checked against
// insight_history, not a KV TTL -- see file-scope comment in migrations/0006 for why
// this is a D1 event-log query rather than the KV-cache pattern D-068 uses for
// Broadcast Blurb). Paid tier (isEntitled()): always generates fresh: the per-user
// cost is revenue-backed, and _middleware.js's existing 120/min/IP cap is the
// abuse backstop, same as every other /api/* route -- no new rate limiter needed
// here specifically.
//
// Uses the SAME Gemini contract D-068 proved live in production
// (worker/broadcast-blurb.js) -- same endpoint, same response parsing, and the
// SAME max_output_tokens=8192 lesson learned the hard way there (thinking tokens
// draw from the same budget; 400 was not enough and failed a real deployed
// request). Applying that fix here from the start instead of rediscovering it.
import { buildAuth } from './auth/_instance.js';

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODEL      = 'gemini-3.6-flash';
const FREE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PLAYERS_CACHE_KEY = 'players:nfl:dump';
const PLAYERS_CACHE_TTL_S = 12 * 60 * 60; // Sleeper's own guidance: don't hit this endpoint often, player identities rarely change intraday

const SYSTEM_INSTRUCTION = 'You are a sharp, concise fantasy football analyst writing for a single team manager. Use ONLY the roster, record, and trending data given to you -- never invent a stat, injury, or matchup detail not present in the input. 3-4 sentences. No bullet points, no headers, no markdown. If nothing meaningful stands out, say so plainly rather than manufacturing a false sense of urgency.';

async function requireSession(context) {
	const auth = buildAuth(context.env);
	return auth.api.getSession({ headers: context.request.headers });
}

async function getPlayersDump(env, ctx) {
	if (env.AI_CACHE) {
		const cached = await env.AI_CACHE.get(PLAYERS_CACHE_KEY);
		if (cached) { try { return JSON.parse(cached); } catch {} }
	}
	const res = await fetch('https://api.sleeper.app/v1/players/nfl');
	if (!res.ok) throw new Error(`sleeper players fetch failed (${res.status})`);
	const data = await res.json();
	if (env.AI_CACHE) {
		// waitUntil, not a bare unawaited promise -- guarantees the KV write
		// completes even after the response is returned, rather than racing
		// the isolate being torn down. Never blocks the response, never lets
		// a cache-write failure surface as a user-facing error.
		const write = env.AI_CACHE.put(PLAYERS_CACHE_KEY, JSON.stringify(data), { expirationTtl: PLAYERS_CACHE_TTL_S }).catch(() => {});
		if (ctx && ctx.waitUntil) ctx.waitUntil(write); else await write;
	}
	return data;
}

function playerLabel(playersDump, id) {
	const p = playersDump && playersDump[id];
	if (p) return `${p.first_name || ''} ${p.last_name || ''}`.trim() + ` (${p.position || '?'}, ${p.team || 'FA'})`;
	return `${id} (DEF)`;
}

export async function onRequestPost(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });
	const userId = session.user.id;
	const env = context.env;

	const link = await env.USER_DB
		.prepare('SELECT league_id, sleeper_user_id, league_name FROM sleeper_links WHERE user_id = ?')
		.bind(userId)
		.first();
	if (!link) return Response.json({ error: 'no_league_linked' }, { status: 400 });

	const { isEntitled } = await import('./_entitlement.js');
	const entitled = await isEntitled(env, userId);

	if (!entitled) {
		const recent = await env.USER_DB
			.prepare('SELECT content, created_at FROM insight_history WHERE user_id = ? AND league_id = ? ORDER BY created_at DESC LIMIT 1')
			.bind(userId, link.league_id)
			.first();
		if (recent && (Date.now() - recent.created_at) < FREE_WINDOW_MS) {
			return Response.json({
				content: recent.content,
				cached: true,
				entitled: false,
				nextAvailable: recent.created_at + FREE_WINDOW_MS,
			});
		}
	}

	let rosters, users, trending, playersDump;
	try {
		[rosters, users, trending] = await Promise.all([
			fetch(`https://api.sleeper.app/v1/league/${link.league_id}/rosters`).then(r => r.json()),
			fetch(`https://api.sleeper.app/v1/league/${link.league_id}/users`).then(r => r.json()),
			fetch('https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=5').then(r => r.json()),
		]);
		playersDump = await getPlayersDump(env, context);
	} catch (e) {
		return Response.json({ error: 'sleeper_fetch_failed', detail: String(e) }, { status: 502 });
	}

	const myRoster = (rosters || []).find(r => String(r.owner_id) === String(link.sleeper_user_id));
	if (!myRoster) return Response.json({ error: 'roster_not_found' }, { status: 404 });
	const me = (users || []).find(u => String(u.user_id) === String(link.sleeper_user_id));
	const teamName = (me && me.metadata && me.metadata.team_name) || (me && me.display_name) || link.league_name;
	const s = myRoster.settings || {};
	const record = `${s.wins || 0}-${s.losses || 0}${s.ties ? `-${s.ties}` : ''}`;
	const starters = (myRoster.starters || []).filter(id => id && id !== '0').map(id => playerLabel(playersDump, id));
	const trendingList = (trending || []).slice(0, 5).map(t => playerLabel(playersDump, t.player_id));

	const input = `Team: ${teamName} in "${link.league_name}", record ${record}.\nCurrent starters: ${starters.join(', ') || 'unknown'}.\nLeague-wide top waiver-wire adds (last 24h, most-added first): ${trendingList.join(', ') || 'none'}.\n\nWrite a short outlook for this manager: how their team looks right now and whether anything on the trending list is worth a look given their roster. Use only the facts above.`;

	try {
		const res = await fetch(GEMINI_API, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
			body: JSON.stringify({
				model: MODEL,
				system_instruction: SYSTEM_INSTRUCTION,
				input,
				generation_config: { temperature: 0.7, max_output_tokens: 8192, thinking_level: 'low' },
			}),
		});
		if (!res.ok) {
			const err = await res.text();
			return Response.json({ error: 'gemini_error', detail: err.slice(0, 500) }, { status: 502 });
		}
		const data = await res.json();
		if (data.status && data.status !== 'completed') {
			return Response.json({ error: 'gemini_incomplete', detail: data.status }, { status: 502 });
		}
		const step = (data.steps || []).find(s2 => s2.type === 'model_output');
		const content = step ? (step.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim() : '';
		if (!content) return Response.json({ error: 'gemini_empty' }, { status: 502 });

		const now = Date.now();
		await env.USER_DB
			.prepare('INSERT INTO insight_history (id, user_id, league_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind(crypto.randomUUID(), userId, link.league_id, content, now)
			.run();

		return Response.json({ content, cached: false, entitled, generatedAt: now });
	} catch (e) {
		return Response.json({ error: 'worker_error', detail: String(e) }, { status: 500 });
	}
}

export async function onRequestGet(context) {
	const session = await requireSession(context);
	if (!session) return Response.json({ error: 'not_signed_in' }, { status: 401 });
	const userId = session.user.id;
	const env = context.env;

	const link = await env.USER_DB
		.prepare('SELECT league_id FROM sleeper_links WHERE user_id = ?')
		.bind(userId)
		.first();
	if (!link) return Response.json({ error: 'no_league_linked' }, { status: 400 });

	const { isEntitled } = await import('./_entitlement.js');
	const entitled = await isEntitled(env, userId);
	const recent = await env.USER_DB
		.prepare('SELECT content, created_at FROM insight_history WHERE user_id = ? AND league_id = ? ORDER BY created_at DESC LIMIT 1')
		.bind(userId, link.league_id)
		.first();

	return Response.json({
		entitled,
		hasRecent: !!recent,
		content: recent ? recent.content : null,
		generatedAt: recent ? recent.created_at : null,
		nextAvailable: (!entitled && recent) ? recent.created_at + FREE_WINDOW_MS : null,
	});
}
