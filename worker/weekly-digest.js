// D-069 — Weekly Fantasy Digest cron. Runs on a Cron Trigger (see
// wrangler-digest.toml), not a Pages Function -- Pages has no scheduled() handler,
// same reasoning as worker/auth-purge.js, whose /__run + shared-secret manual-test
// pattern this file copies rather than reinvents.
//
// Sent from a SEPARATE address (DIGEST_EMAIL_FROM) via the SAME Resend account used
// for magic-link sign-in. This is deliberate, not an oversight: mixing a promotional/
// engagement stream with the transactional sign-in stream on one sending identity is
// exactly the domain-reputation risk this project already rejected once this session
// (the mass-email sponsorship idea) -- a separate From-address isolates that risk
// completely regardless of this digest's own complaint/unsubscribe rate. See
// ISSUES.md "Weekly Fantasy Digest" for the full reasoning.
//
// Calls Sleeper's public API directly (not this site's own /api/sleeper proxy) --
// no auth needed, and the digest shouldn't depend on the site itself being up.
const PLAYERS_DUMP_URL = 'https://api.sleeper.app/v1/players/nfl';
const TRENDING_URL = 'https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=3';

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(runDigest(env));
	},

	// Manual trigger for testing -- same shared-secret gate as auth-purge.js's /__run,
	// not left open on this Worker's public *.workers.dev URL.
	async fetch(request, env) {
		if (new URL(request.url).pathname !== '/__run') {
			return new Response('not found', { status: 404 });
		}
		if (!env.DIGEST_RUN_SECRET) {
			return new Response('DIGEST_RUN_SECRET not configured', { status: 503 });
		}
		const provided = request.headers.get('X-Digest-Secret') || '';
		if (!_timingSafeEqual(provided, env.DIGEST_RUN_SECRET)) {
			return new Response('unauthorized', { status: 401 });
		}
		const result = await runDigest(env);
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

function playerLabel(playersDump, id) {
	const p = playersDump && playersDump[id];
	if (p) return `${p.first_name || ''} ${p.last_name || ''}`.trim() + ` (${p.position || '?'}, ${p.team || 'FA'})`;
	return `${id} (DEF)`;
}

async function sendDigestEmail(env, toEmail, teamName, leagueName, record, trendingLines) {
	const from = env.DIGEST_EMAIL_FROM || 'SportStrata Digest <digest@sportstrata.cc>';
	const text = `Your weekly SportStrata fantasy digest\n\n${teamName} (${leagueName}) — record ${record}\n\nTop league-wide waiver adds this week:\n${trendingLines.map(l => `- ${l}`).join('\n')}\n\nCheck your full roster: https://sportstrata.cc/#nfl-myleague\n\n---\nYou're getting this because you opted in. Turn it off any time in your SportStrata account settings: https://sportstrata.cc/#account`;
	const html = `<p><strong>Your weekly SportStrata fantasy digest</strong></p><p>${teamName} (${leagueName}) — record ${record}</p><p>Top league-wide waiver adds this week:</p><ul>${trendingLines.map(l => `<li>${l}</li>`).join('')}</ul><p><a href="https://sportstrata.cc/#nfl-myleague">Check your full roster</a></p><p style="color:#888;font-size:13px">You're getting this because you opted in. Turn it off any time in your <a href="https://sportstrata.cc/#account">SportStrata account settings</a>.</p>`;

	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ from, to: toEmail, subject: `Your weekly fantasy digest — ${teamName}`, text, html }),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 200)}`);
	}
}

async function runDigest(env) {
	const result = { ranAt: new Date().toISOString(), sent: 0, skipped: 0, failed: 0, errors: [] };

	const recipients = await env.USER_DB.prepare(
		`SELECT u.email as email, sl.league_id as league_id, sl.sleeper_user_id as sleeper_user_id, sl.league_name as league_name
		 FROM alert_prefs ap
		 JOIN user u ON u.id = ap.user_id
		 JOIN sleeper_links sl ON sl.user_id = ap.user_id
		 WHERE ap.digest_enabled = 1`
	).all();

	const rows = (recipients && recipients.results) || [];
	if (!rows.length) return result;

	let playersDump, trending;
	try {
		[playersDump, trending] = await Promise.all([
			fetch(PLAYERS_DUMP_URL).then(r => r.json()),
			fetch(TRENDING_URL).then(r => r.json()),
		]);
	} catch (e) {
		result.errors.push(`shared fetch failed: ${e}`);
		return result;
	}
	const trendingLines = (trending || []).slice(0, 3).map(t => playerLabel(playersDump, t.player_id));

	// Sequential, not Promise.all — this is a batch cron job, not a user-facing
	// request, so there's no latency pressure; sequential keeps Resend traffic
	// gentle and means one user's failure can't affect another's send.
	for (const row of rows) {
		try {
			const [rosters, users] = await Promise.all([
				fetch(`https://api.sleeper.app/v1/league/${row.league_id}/rosters`).then(r => r.json()),
				fetch(`https://api.sleeper.app/v1/league/${row.league_id}/users`).then(r => r.json()),
			]);
			const myRoster = (rosters || []).find(r => String(r.owner_id) === String(row.sleeper_user_id));
			if (!myRoster) { result.skipped++; continue; }
			const me = (users || []).find(u => String(u.user_id) === String(row.sleeper_user_id));
			const teamName = (me && me.metadata && me.metadata.team_name) || (me && me.display_name) || row.league_name;
			const s = myRoster.settings || {};
			const record = `${s.wins || 0}-${s.losses || 0}${s.ties ? `-${s.ties}` : ''}`;

			await sendDigestEmail(env, row.email, teamName, row.league_name, record, trendingLines);
			result.sent++;
		} catch (e) {
			result.failed++;
			result.errors.push(String(e).slice(0, 200));
		}
	}

	return result;
}
