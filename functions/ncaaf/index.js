// Pages Function: /ncaaf — clean, crawlable per-sport landing (D-045 P1).
// Clones the proven D-041 edge-render pattern: serve the real SPA shell with a
// per-sport <head> + a crawlable content snapshot + window.__SS_ROUTE hint the
// SPA honors on boot. Same HTML for humans and bots. Fail-safe to the app.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

const TITLE = "College Football Rankings, Standings, Leaders & Scores | SportStrata";
const DESC  = "Free college football coverage: AP/Coaches/CFP rankings, conference standings, stat leaders (passing, rushing, receiving, defense), and the Top 25 scoreboard. No login.";
const H1    = "College Football Stats";
const CANON = 'https://sportstrata.cc/ncaaf';
const ROUTE = "ncaaf-home";
const CARDS = [["Rankings", "#ncaaf-rankings"], ["Standings", "#ncaaf-standings"], ["Leaders", "#ncaaf-leaders"], ["Scores", "#ncaaf-scores"]];

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebPage',
            name: TITLE, url: CANON, description: DESC,
            isPartOf: { '@type': 'WebSite', name: 'SportStrata', url: 'https://sportstrata.cc' },
            about: { '@type': 'SportsOrganization', name: "NCAA Football", sport: "American Football" }
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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify(ROUTE)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#' + ROUTE, 302); }
    }
}
