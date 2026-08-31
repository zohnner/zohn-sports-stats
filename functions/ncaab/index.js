// Pages Function: /ncaab — clean, crawlable per-sport landing.
// Clones the proven D-041/D-045 edge-render pattern (functions/ncaaf/index.js):
// serve the real SPA shell with a per-sport <head> + a crawlable content
// snapshot + window.__SS_ROUTE hint the SPA honors on boot. Same HTML for
// humans and bots. Fail-safe to the app.
//
// SEO audit 2026-08-31 (DECISIONS.md D-121): NCAAB has been a live surface
// since D-052 (2026-08-10) with zero crawlable pages. Only landing + standings
// ship here, not team/player — js/ncaab.js's _renderNCAABView only handles
// 'ncaab-standings' and 'ncaab-teams' (a grid, no per-team detail route) and
// there is no player-detail view at all (CLAUDE.md: "data-checked as viable,
// not built, owner decision pending"). A crawlable team/player template would
// set __SS_ROUTE to a view that doesn't exist client-side — verified against
// js/navigation.js/js/ncaab.js directly before writing this, not assumed.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

const TITLE = "College Basketball Scores, Rankings & Standings | SportStrata";
const DESC  = "Free NCAA men's college basketball coverage: AP/Coaches rankings, conference standings, team pages and live scores. No login, no ads.";
const H1    = "College Basketball Stats";
const CANON = 'https://sportstrata.cc/ncaab';
const ROUTE = "ncaab-home";
const CARDS = [["Standings", "/ncaab/standings"], ["Teams", "#ncaab-teams"], ["Rankings", "#ncaab-rankings"], ["Scores", "#ncaab-scores"]];

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebPage',
            name: TITLE, url: CANON, description: DESC,
            isPartOf: { '@type': 'WebSite', name: 'SportStrata', url: 'https://sportstrata.cc' },
            about: { '@type': 'SportsOrganization', name: "NCAA Men's College Basketball", sport: "Basketball" }
        });
        const links = CARDS.map(c => `<li><a href="${esc(c[1])}">${esc(c[0])}</a></li>`).join('');
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(H1)}</h1>` +
            `<p>${esc(DESC)}</p><ul>${links}</ul></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(TITLE)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(TITLE)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(TITLE)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(DESC)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify(ROUTE)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#' + ROUTE, 302); }
    }
}
