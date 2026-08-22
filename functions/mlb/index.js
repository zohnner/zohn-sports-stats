// Pages Function: /mlb — clean, crawlable per-sport landing (D-045 P1).
// Clones the proven D-041 edge-render pattern: serve the real SPA shell with a
// per-sport <head> + a crawlable content snapshot + window.__SS_ROUTE hint the
// SPA honors on boot. Same HTML for humans and bots. Fail-safe to the app.
//
// D-114 update: promoted "#mlb-leaders" to the real /mlb/leaders path, and
// added a full 30-team directory linking down into /mlb/team/:abbr. GSC's
// Links report (0 external, 7 internal site-wide) showed the real reason the
// site wasn't surfacing in search wasn't a technical block — it was a
// crawlable-but-disconnected page graph: hub pages with no spokes.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

const TITLE = "MLB Stats, Standings, Leaders & Playoff Odds | SportStrata";
const DESC  = "Free MLB analytics: leaders (AVG, OPS, ERA, FIP, wRC+), standings with Monte Carlo playoff odds, Statcast player profiles, and game prep. No login, no ads.";
const H1    = "MLB Stats & Analytics";
const CANON = 'https://sportstrata.cc/mlb';
const ROUTE = "mlb-home";
const CARDS = [["Leaders", "/mlb/leaders"], ["Standings & Playoff Odds", "/mlb/standings"], ["Players", "#mlb-players"], ["Game Prep", "#mlb-prep"]];

async function teamDirectory() {
    try {
        const season = new Date().getUTCFullYear();
        const tr = await fetch(
            `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`,
            { cf: { cacheTtl: 3600, cacheEverything: true } }
        );
        if (!tr.ok) return '';
        const teams = (((await tr.json()).teams) || [])
            .filter(t => t.abbreviation && t.name)
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
        if (!teams.length) return '';
        const items = teams.map(t =>
            `<li><a href="/mlb/team/${esc(t.abbreviation.toLowerCase())}">${esc(t.name)}</a></li>`).join('');
        return `<h2>All 30 MLB Teams</h2><ul>${items}</ul>`;
    } catch (_) { return ''; }
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebPage',
            name: TITLE, url: CANON, description: DESC,
            isPartOf: { '@type': 'WebSite', name: 'SportStrata', url: 'https://sportstrata.cc' },
            about: { '@type': 'SportsOrganization', name: "Major League Baseball", sport: "Baseball" }
        });
        const links = CARDS.map(c => `<li><a href="${esc(c[1])}">${esc(c[0])}</a></li>`).join('');
        const teams = await teamDirectory();
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(H1)}</h1>` +
            `<p>${esc(DESC)}</p><ul>${links}</ul>${teams}</section>`;

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
