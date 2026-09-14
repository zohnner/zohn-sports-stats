// Pages Function: /nba — clean, crawlable per-sport landing.
// Clones the proven D-041/D-045 edge-render pattern (functions/wnba/index.js):
// serve the real SPA shell with a per-sport <head> + a crawlable content
// snapshot + window.__SS_ROUTE hint the SPA honors on boot. Same HTML for
// humans and bots. Fail-safe to the app.
//
// D-161 (2026-09-14): NBA revived as a live 7th sport. Landing + standings +
// leaders + player-detail ship here — no team template, because
// js/nba.js's _renderNBAView has no per-team route (Teams is a display-only
// grid, matching NCAAB/WNBA precedent). Player detail DOES exist
// (showNBAPlayer / nba-player-{id}), confirmed live in js/nba.js before
// writing that template. No Rankings link — no poll exists for a pro league.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

const TITLE = "NBA Scores, Standings & Player Stats | SportStrata";
const DESC  = "Free NBA coverage: live scores, Eastern/Western conference standings by division, statistical leaders (PPG, RPG, APG, SPG, BPG) and player pages. No login, no ads.";
const H1    = "NBA Stats";
const CANON = 'https://sportstrata.cc/nba';
const ROUTE = "nba-home";
const CARDS = [["Standings", "/nba/standings"], ["Leaders", "/nba/leaders"], ["Teams", "#nba-teams"], ["Scores", "#nba-scores"]];

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebPage',
            name: TITLE, url: CANON, description: DESC,
            isPartOf: { '@type': 'WebSite', name: 'SportStrata', url: 'https://sportstrata.cc' },
            about: { '@type': 'SportsOrganization', name: "NBA", sport: "Basketball" }
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
