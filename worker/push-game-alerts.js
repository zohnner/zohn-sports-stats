// D-079 -- Push Notifications v1 (F5): game-start alerts for favorited MLB/NFL
// teams. Runs on a Cron Trigger (see wrangler-push.toml), not a Pages Function --
// same reasoning as worker/weekly-digest.js and worker/auth-purge.js, whose
// /__run + shared-secret manual-test pattern this file copies rather than
// reinvents.
//
// Calls MLB Stats API and ESPN directly (not this site's own /api/mlb or /api/nfl
// proxies) -- same "the alert pipeline shouldn't depend on the site itself being
// up" reasoning as weekly-digest.js calling Sleeper directly.
//
// FIELD-SHAPE CAVEAT (flagged honestly, not verified live from this sandbox --
// the sandbox has no outbound route to statsapi.mlb.com or ESPN, only to the npm
// registry): the MLB schedule team-id -> abbreviation map and the exact
// status-code strings below are written from documented/previously-observed API
// shape, not a live response captured during this session. Before enabling the
// cron trigger, run one manual `/__run` hit during a real pre-game window (a day
// with a 7pm ET MLB or NFL game about to start) and confirm `result.matched` and
// `result.sent` look right -- this is the "recommended spike" the ISSUES.md spec
// called for, same caution already applied to the buildPushPayload() crypto path.
//
// Dedup: push_sent_log (migrations/0007) keys on (user_id, game_key) so an
// overlapping cron run can never double-send the same game-start alert twice,
// even though the lookahead window (see LOOKAHEAD_MIN) is wider than the cron
// cadence on purpose (catches a game if one run is delayed or skipped).
import { buildPushPayload } from '@block65/webcrypto-web-push';

const LOOKAHEAD_MIN = 12; // alert fires when a game's start time is <= this many minutes away
const MLB_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1';
const MLB_TEAMS_URL = 'https://statsapi.mlb.com/api/v1/teams?sportId=1';
// site.api.espn.com is Akamai-blocked for Cloudflare egress IPs specifically --
// documented live in functions/api/nfl.js's own 2026-08-07/08 header comment
// (returned "Access Denied" HTML to every path with no client-side change).
// site.web.api.espn.com serves the identical /apis/site/v2/sports/... path
// family with byte-identical shape and is NOT blocked -- same fix applied here
// after this worker's first live /__run hit reproduced the exact same failure
// (an HTML body instead of JSON) on 2026-08-09.
const NFL_SCOREBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const MLB_UA = 'SportStrata/1.0'; // matches functions/api/mlb.js's already-proven statsapi UA

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(runAlerts(env));
	},

	// Manual trigger for testing -- same shared-secret gate as auth-purge.js/
	// weekly-digest.js's /__run.
	async fetch(request, env) {
		if (new URL(request.url).pathname !== '/__run') {
			return new Response('not found', { status: 404 });
		}
		if (!env.PUSH_RUN_SECRET) {
			return new Response('PUSH_RUN_SECRET not configured', { status: 503 });
		}
		const provided = request.headers.get('X-Push-Secret') || '';
		if (!_timingSafeEqual(provided, env.PUSH_RUN_SECRET)) {
			return new Response('unauthorized', { status: 401 });
		}
		const result = await runAlerts(env);
		return Response.json(result);
	},
};

function _timingSafeEqual(a, b) {
	const bufA = new TextEncoder().encode(a);
	const bufB = new TextEncoder().encode(b);
	const len = Math.max(bufA.length, bufB.length, 1);
	let diff = bufA.length ^ bufB.length;
	for (let i = 0; i < len; i++) diff |= (bufA[i] || 0) ^ (bufB[i] || 0);
	return diff === 0;
}

// -- Upcoming-game discovery ------------------------------------------------

// Labeled fetch that reads the body as text first -- an HTTP error page (Akamai
// "Access Denied", a Cloudflare challenge, etc.) still has a 200 or non-200
// status with an HTML body; parsing straight to .json() on that just throws a
// generic "Unexpected token '<'" with no indication of WHICH upstream call or
// WHY. This is what let the NFL host-block bug (D-079 fix, 2026-08-09) hide
// behind a single opaque combined error on the first live /__run.
async function _fetchJson(label, url, opts) {
	const res = await fetch(url, opts);
	const text = await res.text();
	try {
		return JSON.parse(text);
	} catch (_) {
		throw new Error(`${label} returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200).replace(/\s+/g, ' ')}`);
	}
}

async function _mlbUpcoming(now) {
	const dateStr = new Date(now).toISOString().slice(0, 10);
	const [schedule, teamsData] = await Promise.all([
		_fetchJson('mlb-schedule', `${MLB_SCHEDULE_URL}&date=${dateStr}`, { headers: { 'User-Agent': MLB_UA } }),
		_fetchJson('mlb-teams', MLB_TEAMS_URL, { headers: { 'User-Agent': MLB_UA } }),
	]);

	const idToAbbr = {};
	for (const t of (teamsData.teams || [])) idToAbbr[t.id] = t.abbreviation;

	const games = [];
	for (const day of (schedule.dates || [])) {
		for (const g of (day.games || [])) {
			const state = g.status && g.status.codedGameState;
			if (state !== 'S' && state !== 'P') continue; // Scheduled / Pre-game only
			const startMs = new Date(g.gameDate).getTime();
			const minsAway = (startMs - now) / 60000;
			if (minsAway < 0 || minsAway > LOOKAHEAD_MIN) continue;
			const homeId = g.teams && g.teams.home && g.teams.home.team && g.teams.home.team.id;
			const awayId = g.teams && g.teams.away && g.teams.away.team && g.teams.away.team.id;
			const home = idToAbbr[homeId];
			const away = idToAbbr[awayId];
			if (!home || !away) continue;
			games.push({
				sport: 'mlb',
				gameKey: `mlb:${g.gamePk}`,
				home, away,
				startMs,
				title: `${away} @ ${home} starting soon`,
				url: `https://sportstrata.cc/mlb/game/${g.gamePk}`,
			});
		}
	}
	return games;
}

async function _nflUpcoming(now) {
	const data = await _fetchJson('nfl-scoreboard', NFL_SCOREBOARD_URL, { headers: { 'Accept': 'application/json', 'User-Agent': ESPN_UA } });
	const games = [];
	for (const ev of (data.events || [])) {
		const statusName = ev.status && ev.status.type && ev.status.type.name;
		if (statusName !== 'STATUS_SCHEDULED') continue;
		const startMs = new Date(ev.date).getTime();
		const minsAway = (startMs - now) / 60000;
		if (minsAway < 0 || minsAway > LOOKAHEAD_MIN) continue;
		const comp = ev.competitions && ev.competitions[0];
		const competitors = (comp && comp.competitors) || [];
		const home = (competitors.find((c) => c.homeAway === 'home') || {}).team;
		const away = (competitors.find((c) => c.homeAway === 'away') || {}).team;
		if (!home || !away || !home.abbreviation || !away.abbreviation) continue;
		games.push({
			sport: 'nfl',
			gameKey: `nfl:${ev.id}`,
			home: home.abbreviation, away: away.abbreviation,
			startMs,
			title: `${away.abbreviation} @ ${home.abbreviation} starting soon`,
			url: `https://sportstrata.cc/nfl`,
		});
	}
	return games;
}

// -- Send ---------------------------------------------------------------

async function _sendOne(env, sub, message) {
	const vapid = {
		subject: 'mailto:zohnwheeler@gmail.com',
		publicKey: env.VAPID_PUBLIC_KEY,
		privateKey: env.VAPID_PRIVATE_KEY,
	};
	const subscription = {
		endpoint: sub.endpoint,
		expirationTime: null,
		keys: { p256dh: sub.p256dh, auth: sub.auth },
	};
	const payload = await buildPushPayload(message, subscription, vapid);
	return fetch(subscription.endpoint, payload);
}

async function runAlerts(env) {
	const result = { ranAt: new Date().toISOString(), matched: 0, sent: 0, skipped: 0, failed: 0, pruned: 0, errors: [] };
	const now = Date.now();

	// Isolated per-sport: one upstream being down (or blocked) shouldn't also
	// silence the other, and the error needs to say which one broke.
	const [mlbResult, nflResult] = await Promise.allSettled([_mlbUpcoming(now), _nflUpcoming(now)]);
	const mlbGames = mlbResult.status === 'fulfilled' ? mlbResult.value : [];
	const nflGames = nflResult.status === 'fulfilled' ? nflResult.value : [];
	if (mlbResult.status === 'rejected') result.errors.push(String(mlbResult.reason).slice(0, 250));
	if (nflResult.status === 'rejected') result.errors.push(String(nflResult.reason).slice(0, 250));

	const games = [...mlbGames, ...nflGames];
	if (!games.length) return result;

	for (const game of games) {
		// Users following either team in this sport, joined to their push subscriptions.
		const { results: rows } = await env.USER_DB.prepare(
			`SELECT DISTINCT ps.id as sub_id, ps.user_id as user_id, ps.endpoint as endpoint, ps.p256dh as p256dh, ps.auth as auth
			 FROM follows f
			 JOIN push_subscriptions ps ON ps.user_id = f.user_id
			 WHERE f.sport = ? AND f.entity_type = 'team' AND f.entity_id IN (?, ?)`
		).bind(game.sport, game.home, game.away).all();

		for (const row of (rows || [])) {
			result.matched++;
			const already = await env.USER_DB.prepare(
				'SELECT 1 FROM push_sent_log WHERE user_id = ? AND game_key = ?'
			).bind(row.user_id, game.gameKey).first();
			if (already) { result.skipped++; continue; }

			try {
				const message = {
					data: JSON.stringify({ title: game.title, body: 'Tap to open live scoring.', url: game.url }),
					options: { ttl: 60 * 30 },
				};
				const res = await _sendOne(env, row, message);
				if (res.status === 404 || res.status === 410) {
					// Push service says this endpoint is gone -- prune it so future
					// runs don't keep paying the failed-send cost for a dead browser.
					await env.USER_DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(row.sub_id).run();
					result.pruned++;
					continue;
				}
				if (!res.ok) throw new Error(`push send failed (${res.status})`);

				await env.USER_DB.prepare(
					'INSERT OR IGNORE INTO push_sent_log (user_id, game_key, sent_at) VALUES (?, ?, ?)'
				).bind(row.user_id, game.gameKey, Date.now()).run();
				result.sent++;
			} catch (e) {
				result.failed++;
				result.errors.push(String(e).slice(0, 200));
			}
		}
	}

	return result;
}
