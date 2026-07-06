// Pages Function: /mlb/standings — crawlable, prerendered MLB standings (D-041 Phase 1).
// Same contract as the team/player functions: one HTML for all clients (SPA shell via
// env.ASSETS + per-page head + crawlable division-table snapshot + __SS_ROUTE hint),
// assets absolutized, fail-safe fallback to the untouched app.

const DIV = { 200: 'AL West', 201: 'AL East', 202: 'AL Central', 203: 'NL West', 204: 'NL East', 205: 'NL Central' };
const DIV_ORDER = [201, 202, 200, 204, 205, 203];

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const season = new Date().getUTCFullYear();
        const sr = await fetch(
            `https://statsapi.mlb.com/api/v1/standings?leagueId=103,104&season=${season}&standingsTypes=regularSeason&hydrate=team`,
            { cf: { cacheTtl: 900, cacheEverything: true } }
        );
        if (!sr.ok) return shell(env, request.url);
        const records = ((await sr.json()).records) || [];

        const byDiv = {};
        records.forEach(rec => {
            const id = rec.division && rec.division.id;
            if (id == null) return;
            byDiv[id] = (rec.teamRecords || []).slice().sort((a, b) => (a.divisionRank || 99) - (b.divisionRank || 99));
        });

        let tables = '';
        DIV_ORDER.forEach(id => {
            const rows = byDiv[id];
            if (!rows || !rows.length) return;
            tables += `<h2>${esc(DIV[id] || 'Division')}</h2><ul>`;
            rows.forEach(tr => {
                const nm = (tr.team && tr.team.name) || 'Team';
                const gb = (tr.gamesBack && tr.gamesBack !== '-') ? ` (${esc(tr.gamesBack)} GB)` : '';
                tables += `<li>${esc(nm)} — ${esc(String(tr.wins))}–${esc(String(tr.losses))}${gb}</li>`;
            });
            tables += '</ul>';
        });
        if (!tables) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/mlb/standings';
        const title = `MLB Standings ${season} — Division Races, Wild Card & Playoff Odds | SportStrata`;
        const desc = `Live ${season} MLB standings — all six divisions, games back, wild card, and Monte Carlo playoff odds. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Dataset',
            name: `${season} MLB Standings`, description: desc, url: canonical,
            creator: { '@type': 'Organization', name: 'SportStrata' }
        });
        const snapshot = `<section class="ss-prerender"><h1>${season} MLB Standings</h1>${tables}</section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify('mlb-standings')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-standings', 302); }
    }
}
