// Pages Function: /mlb/team/:abbr — crawlable, prerendered MLB team page (D-041 Phase 1).
// Serves ONE HTML to every client: the real SPA shell (via env.ASSETS) with a
// per-team <head> (title/description/canonical/OG/JSON-LD), a crawlable content
// snapshot in the main host, and a window.__SS_ROUTE hint the SPA honors on boot.
// Fail-safe: any error falls back to the untouched app, so a broken render never
// produces a dead page. Same HTML for humans and bots (no dynamic-rendering sniff).
//
// D-114 update: added back-links to /mlb, /mlb/leaders, /mlb/standings plus an
// "Other MLB Teams" directory (reusing the `teams` list already fetched below at
// zero extra cost) — team pages previously had zero outbound links, so a crawler
// that reached one had no way to discover any other page on the site.

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
    const abbr = String(params.abbr || '').toLowerCase().replace(/[^a-z]/g, '');
    try {
        if (!abbr || !env.ASSETS) return shell(env, request.url);
        const season = new Date().getUTCFullYear();
        const tr = await fetch(
            `https://statsapi.mlb.com/api/v1/teams?sportId=1&season=${season}`,
            { cf: { cacheTtl: 3600, cacheEverything: true } }
        );
        if (!tr.ok) return shell(env, request.url);
        const teams = ((await tr.json()).teams) || [];
        const team = teams.find(t => (t.abbreviation || '').toLowerCase() === abbr);
        if (!team || team.id == null) return shell(env, request.url);

        const name  = team.name || 'MLB Team';
        const id    = team.id;
        const lg    = (team.league && team.league.name) || '';
        const div   = (team.division && team.division.name) || '';
        const venue = (team.venue && team.venue.name) || '';
        const canonical = `https://sportstrata.cc/mlb/team/${abbr}`;
        const title = `${name} — Stats, Roster, Standings & Playoff Odds | SportStrata`;
        const desc  = `${name}${lg ? ' (' + lg + (div ? ', ' + div : '') + ')' : ''} — live team stats, roster, schedule, standings and Monte Carlo playoff odds. Free, no login.`;

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SportsTeam',
            name, sport: 'Baseball', url: canonical,
            ...(lg ? { memberOf: { '@type': 'SportsOrganization', name: lg } } : {})
        });

        const otherTeams = teams
            .filter(t => t.abbreviation && t.name && t.id !== id)
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));
        const teamLinks = otherTeams.map(t =>
            `<li><a href="/mlb/team/${esc(t.abbreviation.toLowerCase())}">${esc(t.name)}</a></li>`).join('');

        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc(lg)}${div ? ' · ' + esc(div) : ''}${venue ? ' · ' + esc(venue) : ''}</p>` +
            `<p>Live ${esc(name)} team stats, roster, schedule, standings and playoff odds on SportStrata — free, no login, no ads.</p>` +
            `<p><a href="/mlb">MLB Home</a> · <a href="/mlb/leaders">MLB Stat Leaders</a> · <a href="/mlb/standings">MLB Standings</a></p>` +
            `<h2>Other MLB Teams</h2><ul>${teamLinks}</ul></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('mlb-team-' + id)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);

        // Absolutize relative asset URLs (css/js/assets/manifest/favicon) so they
        // resolve from root at a deep path like /mlb/team/nyy — otherwise CSS/JS 404.
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-teams', 302); }
    }
}
