// Pages Function: /nfl/team/:abbr(/:slug) — crawlable, prerendered NFL team page (D-045 P2).
// Clones the D-041 pattern: SPA shell via env.ASSETS + per-team head (SportsTeam JSON-LD)
// + crawlable snapshot + __SS_ROUTE=nfl-team-{ABBR}. Same HTML for humans and bots; fail-safe.
const TEAMS = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

export async function onRequest(context) {
    const { request, env, params } = context;
    const abbr = String(params.abbr || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
        if (!abbr || !env.ASSETS) return shell(env, request.url);
        const r = await fetch(TEAMS, { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const list = (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0] && data.sports[0].leagues[0].teams) || [];
        const team = (list.find(w => w.team && String(w.team.abbreviation || '').toUpperCase() === abbr) || {}).team;
        if (!team) return shell(env, request.url);

        const A     = team.abbreviation || abbr;
        const name  = team.displayName || A;
        const slug  = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/nfl/team/${A.toLowerCase()}/${slug}`;
        const route = 'nfl-team-' + A;
        const title = `${name} — Roster, Depth Chart, Schedule & Fantasy | SportStrata`;
        const desc  = `${name} — NFL roster and depth chart, schedule, standings, and top fantasy assets by ADP. Free, no login.`;
        const jsonld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'SportsTeam', name, sport: 'American Football', url: canonical });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc(name)} NFL roster, depth chart, schedule, standings and fantasy assets on SportStrata — free, no login, no ads.</p></section>`;

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
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-teams', 302); }
    }
}
