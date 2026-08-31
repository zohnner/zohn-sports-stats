// Pages Function: /wnba/leaders — crawlable, prerendered WNBA stat leaders page.
// Clone of functions/nfl/leaders.js. Sources the already-curated /api/wnbastats
// (same-origin, same season default the client itself uses) rather than
// re-implementing ESPN's two-stage leaders->athlete resolution here.
//
// Unlike the NFL version, leader rows do NOT link a team page — there is no
// WNBA team-detail route yet (js/wnba.js's _renderWNBAView has only a teams
// grid, no per-team view; confirmed before writing this). Each leader DOES
// link to /wnba/player/:id/:slug since that page (and its underlying
// wnba-player-{id} SPA view) is real.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
function slug(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const r = await fetch(new URL('/api/wnbastats', request.url), { cf: { cacheTtl: 900, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const categories = data.categories || [];
        if (!categories.length) return shell(env, request.url);
        const season = data.season;

        const sections = categories.map(c => {
            const leaders = (c.leaders || []).slice(0, 5);
            if (!leaders.length) return null;
            const items = leaders.map(l => {
                const nameHtml = l.id ? `<a href="/wnba/player/${esc(l.id)}/${esc(slug(l.name))}">${esc(l.name)}</a>` : esc(l.name);
                return `<li>${nameHtml}${l.team ? ` (${esc(l.team)})` : ''} — ${esc(l.value)} ${esc(c.unit)}</li>`;
            }).join('');
            return { c, leaders, html: `<h2>${esc(c.label)} Leaders</h2><ol>${items}</ol>` };
        }).filter(Boolean);

        if (!sections.length) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/wnba/leaders';
        const title = `WNBA Stat Leaders ${season} — Points, Rebounds, Assists & More | SportStrata`;
        const desc  = `${season} WNBA statistical leaders — points, rebounds, assists, steals and blocks per game, plus shooting percentages. Full leaderboards for every category. Free, no login, no ads.`;

        const headline = sections.find(s => s.c.key === 'pointsPerGame') || sections[0];
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: `WNBA ${headline.c.label} Leaders ${season}`, url: canonical,
            itemListElement: headline.leaders.map((l, i) => ({
                '@type': 'ListItem', position: i + 1, name: `${l.name} — ${l.value} ${headline.c.unit}`
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>WNBA Stat Leaders — ${esc(String(season))}</h1>` +
            `<p>Current ${esc(String(season))} WNBA leaders across scoring, rebounding, playmaking and defensive categories. Full leaderboards for every stat on SportStrata — free, no login, no ads.</p>` +
            `<p><a href="/wnba">WNBA Home</a></p>` +
            sections.map(s => s.html).join('') + `</section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('wnba-leaders')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=900' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#wnba-leaders', 302); }
    }
}
