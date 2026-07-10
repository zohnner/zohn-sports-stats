// Pages Function: /ncaaf/team/:id(/:slug) — crawlable, prerendered NCAAF team page (D-045 P2).
// SPA shell + per-team head (SportsTeam JSON-LD) + crawlable snapshot + __SS_ROUTE=ncaaf-team-{id}.
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

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
        const tr = await fetch(`${SITE}/teams/${id}`, { cf: { cacheTtl: 3600, cacheEverything: true } });
        if (!tr.ok) return shell(env, request.url);
        const team = (await tr.json()).team;
        if (!team || !(team.displayName || team.name)) return shell(env, request.url);

        const name = team.displayName || team.name;
        const abbr = team.abbreviation || '';
        const summary = team.standingSummary || '';
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/ncaaf/team/${id}/${slug}`;
        const route = 'ncaaf-team-' + id;
        const title = `${name} — College Football Stats & Roster | SportStrata`;
        const desc  = `${name}${abbr ? ' (' + abbr + ')' : ''}${summary ? ' · ' + summary : ''} — college football team stats, leaders and standing. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'SportsTeam', name, sport: 'American Football', url: canonical
        });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc([abbr, summary].filter(Boolean).join(' · '))}</p>` +
            `<p>${esc(name)} college football team stats, leaders and standing on SportStrata — free, no login.</p></section>`;

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
        catch (_) { return Response.redirect('https://sportstrata.cc/#ncaaf-teams', 302); }
    }
}
