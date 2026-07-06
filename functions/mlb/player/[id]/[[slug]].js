// Pages Function: /mlb/player/:id(/:slug) — crawlable, prerendered MLB player page (D-041 Phase 1).
// Same contract as the team function: one HTML for all clients (SPA shell via env.ASSETS
// with per-player head + Person JSON-LD + crawlable snapshot + __SS_ROUTE hint), assets
// absolutized for the deep path, fail-safe fallback to the untouched app.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) {
    return env.ASSETS.fetch(new URL('/index.html', url));
}

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const pr = await fetch(
            `https://statsapi.mlb.com/api/v1/people/${id}`,
            { cf: { cacheTtl: 3600, cacheEverything: true } }
        );
        if (!pr.ok) return shell(env, request.url);
        const person = ((await pr.json()).people || [])[0];
        if (!person || person.id == null) return shell(env, request.url);

        const name    = person.fullName || 'MLB Player';
        const pos     = (person.primaryPosition && person.primaryPosition.name) || '';
        const posAbbr = (person.primaryPosition && person.primaryPosition.abbreviation) || '';
        const team    = (person.currentTeam && person.currentTeam.name) || '';
        const slug    = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/mlb/player/${id}/${slug}`;
        const group   = (posAbbr === 'P') ? 'pitching' : 'hitting';
        const route   = 'mlb-player-' + id + (group === 'pitching' ? '-pitching' : '');

        const title = `${name} — Stats, Splits & Game Logs | SportStrata`;
        const desc  = `${name}${pos ? ', ' + pos : ''}${team ? ' · ' + team : ''} — season stats, advanced metrics, splits and game logs. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Person', name, url: canonical,
            ...(pos ? { jobTitle: pos } : {}),
            ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {})
        });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc([pos, team].filter(Boolean).join(' · '))}</p>` +
            `<p>${esc(name)} season stats, advanced metrics, splits and game logs on SportStrata — free, no login, no ads.</p></section>`;

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

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-players', 302); }
    }
}
