// Pages Function: /ncaaf/team/:id(/:slug) — crawlable, prerendered NCAAF team page (D-045 P2).
// SPA shell + per-team head (SportsTeam JSON-LD) + crawlable snapshot + __SS_ROUTE=ncaaf-team-{id}.
//
// D-114 update: added back-links to /ncaaf, /ncaaf/standings, /ncaaf/rankings. A
// full ~130-team FBS directory was deprioritized (unlike MLB/NFL, this function
// fetches only the single requested team by id — no full team list is already
// in hand, so a directory here would mean an new, untested API call); back-links
// alone still connect every team page back into the crawlable hub graph.
// D-114 fix: site.api.espn.com is Cloudflare-egress-blocked (D-062, Akamai 403) --
// this file was never updated with the host-swap fix already applied everywhere
// else in functions/api/*.js, so every NCAAF team page silently fell back to the
// plain shell. site.web.api.espn.com serves the identical response shape (live-
// verified against this exact college-football/teams/:id path before switching).
const SITE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/college-football';
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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
        const tr = await fetch(`${SITE}/teams/${id}`, { headers: { 'User-Agent': ESPN_UA }, cf: { cacheTtl: 3600, cacheEverything: true } });
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
            `<p>${esc(name)} college football team stats, leaders and standing on SportStrata — free, no login.</p>` +
            `<p><a href="/ncaaf">College Football Home</a> · <a href="/ncaaf/standings">Standings</a> · <a href="/ncaaf/rankings">Rankings</a></p></section>`;

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
        catch (_) { return Response.redirect('https://sportstrata.cc/#ncaaf-teams', 302); }
    }
}
