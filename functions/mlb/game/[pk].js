// Pages Function: /mlb/game/:pk — crawlable, prerendered MLB game page (D-050).
// Mirrors the team/player templates: ONE HTML for humans + bots (real SPA shell
// via env.ASSETS) with a per-game <head> (title/description/canonical/OG +
// SportsEvent JSON-LD), a crawlable snapshot, and window.__SS_ROUTE=mlb-live-{pk}
// so the SPA boots straight into the game panel. Any error falls back to the
// untouched app, so a broken render never produces a dead page.

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function shell(env, url) {
    return env.ASSETS.fetch(new URL('/index.html', url));
}

function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : '';
}

export async function onRequest(context) {
    const { request, env, params } = context;
    const pk = String(params.pk || '').replace(/[^0-9]/g, '');
    try {
        if (!pk || !env.ASSETS) return shell(env, request.url);
        const r = await fetch(
            `https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${pk}&hydrate=team,venue`,
            { cf: { cacheTtl: 120, cacheEverything: true } }
        );
        if (!r.ok) return shell(env, request.url);
        const games = (((await r.json()).dates || [])[0] || {}).games || [];
        const game = games[0];
        if (!game || game.gamePk == null) return shell(env, request.url);

        const away = game.teams?.away || {}, home = game.teams?.home || {};
        const aName = away.team?.name || 'Away', hName = home.team?.name || 'Home';
        const aScore = away.score, hScore = home.score;
        const venue = game.venue?.name || '';
        const dateStr = fmtDate(game.officialDate);
        const abs = game.status?.abstractGameState || '';
        const detailed = game.status?.detailedState || '';

        let statusLabel;
        if (abs === 'Final') statusLabel = (aScore != null && hScore != null) ? `Final ${aScore}–${hScore}` : 'Final';
        else if (abs === 'Live') statusLabel = detailed || 'Live';
        else statusLabel = detailed || 'Scheduled';

        const canonical = `https://sportstrata.cc/mlb/game/${pk}`;
        const matchup = `${aName} vs ${hName}`;
        const title = `${aName} @ ${hName} — ${statusLabel}${dateStr ? ` · ${dateStr}` : ''} | SportStrata`;
        const desc = `${matchup}${dateStr ? ` on ${dateStr}` : ''}${venue ? ` at ${venue}` : ''}. ${statusLabel}. Box score, live scoring and matchup analysis on SportStrata — free, no login.`;

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'SportsEvent',
            name: `${aName} at ${hName}`, sport: 'Baseball', url: canonical,
            ...(game.gameDate ? { startDate: game.gameDate } : {}),
            ...(venue ? { location: { '@type': 'Place', name: venue } } : {}),
            homeTeam: { '@type': 'SportsTeam', name: hName },
            awayTeam: { '@type': 'SportsTeam', name: aName },
            ...(abs && abs !== 'Final' ? { eventStatus: 'https://schema.org/EventScheduled' } : {})
        });

        const snapshot =
            `<section class="ss-prerender"><h1>${esc(aName)} @ ${esc(hName)}</h1>` +
            `<p>${esc(statusLabel)}${dateStr ? ' · ' + esc(dateStr) : ''}${venue ? ' · ' + esc(venue) : ''}</p>` +
            `<p>Live box score, scoring plays, and matchup analysis for ${esc(aName)} vs ${esc(hName)} on SportStrata — free, no login, no ads.</p></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${canonical}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify('mlb-live-' + pk)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-games', 302); }
    }
}
