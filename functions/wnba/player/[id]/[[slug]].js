// Pages Function: /wnba/player/:id(/:slug) — crawlable, prerendered WNBA
// player page. Clone of functions/nfl/player/[id]/[[slug]].js, adapted to
// WNBA's real source: unlike NFL's Sleeper-id bridge, WNBA is ESPN-native end
// to end (D-092 Resolution 5) — the route already carries the ESPN athlete
// id used by /api/wnbastats leaders, so this fetches /api/wnbaathlete
// directly, no name-match bridge needed. SPA shell + Person JSON-LD +
// snapshot + __SS_ROUTE=wnba-player-{id}, matching js/wnba.js's
// showWNBAPlayer/displayWNBAPlayerDetail route naming exactly.
//
// No team-page link (unlike the NFL template) — there is no WNBA
// team-detail route yet, confirmed against js/wnba.js before writing this.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const r = await fetch(new URL(`/api/wnbaathlete?id=${id}`, request.url), { cf: { cacheTtl: 21600, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const bio = data && data.bio;
        if (!data.found || !bio || !bio.name) return shell(env, request.url);

        const name = bio.name;
        const pos  = bio.pos || '';
        const team = bio.team || '';
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/wnba/player/${id}/${slug}`;
        const route = 'wnba-player-' + id;
        const title = `${name} — WNBA Stats & Player Profile | SportStrata`;
        const desc  = `${name}${pos ? ', ' + pos : ''}${team ? ' · ' + team : ''} — WNBA season stats and player profile. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Person', name, url: canonical,
            ...(pos ? { jobTitle: pos } : {}),
            ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {})
        });

        const bioLine = [pos ? esc(pos) : '', team ? esc(team) : ''].filter(Boolean).join(' · ');
        const statsHtml = (data.groups || []).map(g =>
            `<h2>${esc(g.label)}</h2><ul>${(g.stats || []).map(([l, v]) => `<li>${esc(l)}: ${esc(String(v))}</li>`).join('')}</ul>`
        ).join('');

        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${bioLine}</p>` +
            `<p>${esc(name)} WNBA season stats and player profile on SportStrata — free, no login, no ads.</p>` +
            statsHtml +
            `<p><a href="/wnba">WNBA Home</a> · <a href="/wnba/leaders">WNBA Stat Leaders</a></p></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#wnba-leaders', 302); }
    }
}
