// Pages Function: /nfl/player/:id(/:slug) — crawlable, prerendered NFL player page (D-045 P2).
// The route carries the Sleeper player id, so we resolve name/team/pos from Sleeper's bulk
// players map (cf-cached 24h). SPA shell + Person JSON-LD + snapshot + __SS_ROUTE=nfl-player-{id}.
const SLEEPER = 'https://api.sleeper.app/v1/players/nfl';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^A-Za-z0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const r = await fetch(SLEEPER, { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const players = await r.json();
        const p = players && players[id];
        if (!p || !p.full_name) return shell(env, request.url);

        const name = p.full_name;
        const pos  = (p.fantasy_positions && p.fantasy_positions[0]) || p.position || '';
        const team = p.team || '';
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/nfl/player/${id}/${slug}`;
        const route = 'nfl-player-' + id;
        const title = `${name} — NFL Stats, Fantasy Value & Game Logs | SportStrata`;
        const desc  = `${name}${pos ? ', ' + pos : ''}${team ? ' · ' + team : ''} — NFL season stats, fantasy value (ADP & VORP), advanced metrics and game logs. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Person', name, url: canonical,
            ...(pos ? { jobTitle: pos } : {}),
            ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {})
        });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc([pos, team].filter(Boolean).join(' · '))}</p>` +
            `<p>${esc(name)} NFL season stats, fantasy value, advanced metrics and game logs on SportStrata — free, no login, no ads.</p></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-players', 302); }
    }
}
