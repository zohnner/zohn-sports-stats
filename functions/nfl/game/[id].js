// Pages Function: /nfl/game/:id — crawlable, prerendered NFL game page.
// Clones the D-050 MLB game-page pattern for NFL, timed ahead of the season
// (D-056 timing note): real SPA shell + per-game <head> (SportsEvent JSON-LD) +
// a crawlable snapshot + window.__SS_ROUTE=nfl-game-{id}, matching the existing
// hash route _loadFromHash already resolves to showNFLGame(id) in nflLiveGame.js.
// Same HTML for humans and bots; any error falls back to the untouched app.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

function fmtDate(iso) {
    try {
        return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    } catch (_) { return ''; }
}

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const r = await fetch(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${id}`,
            { cf: { cacheTtl: 120, cacheEverything: true } }
        );
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const comp = data.header && data.header.competitions && data.header.competitions[0];
        if (!comp) return shell(env, request.url);

        const competitors = comp.competitors || [];
        const away = competitors.find(c => c.homeAway === 'away') || {};
        const home = competitors.find(c => c.homeAway === 'home') || {};
        const aName = (away.team && away.team.displayName) || 'Away';
        const hName = (home.team && home.team.displayName) || 'Home';
        const aScore = away.score, hScore = home.score;
        const venue = (data.gameInfo && data.gameInfo.venue && data.gameInfo.venue.fullName) || '';
        const dateStr = fmtDate(comp.date);
        const st = (comp.status && comp.status.type) || {};
        const state = st.state || 'pre';

        let statusLabel;
        if (state === 'post') statusLabel = (aScore != null && hScore != null) ? `Final ${aScore}–${hScore}` : 'Final';
        else if (state === 'in') statusLabel = st.shortDetail || 'Live';
        else statusLabel = st.shortDetail || st.detail || 'Scheduled';

        const canonical = `https://sportstrata.cc/nfl/game/${id}`;
        const matchup = `${aName} vs ${hName}`;
        const title = `${aName} @ ${hName} — ${statusLabel}${dateStr ? ` · ${dateStr}` : ''} | SportStrata`;
        const desc = `${matchup}${dateStr ? ` on ${dateStr}` : ''}${venue ? ` at ${venue}` : ''}. ${statusLabel}. Box score, live scoring and matchup analysis on SportStrata — free, no login.`;

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'SportsEvent',
            name: `${aName} at ${hName}`, sport: 'American Football', url: canonical,
            ...(comp.date ? { startDate: comp.date } : {}),
            ...(venue ? { location: { '@type': 'Place', name: venue } } : {}),
            homeTeam: { '@type': 'SportsTeam', name: hName },
            awayTeam: { '@type': 'SportsTeam', name: aName },
            ...(state !== 'post' ? { eventStatus: 'https://schema.org/EventScheduled' } : {})
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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify('nfl-game-' + id)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-games', 302); }
    }
}
