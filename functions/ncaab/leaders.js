// Pages Function: /ncaab/leaders — crawlable, prerendered NCAA men's
// basketball stat leaders (#191). Clone of functions/wnba/leaders.js. Sources
// /api/ncaabstats (the client's own payload) rather than re-reading ESPN here.
//
// Names are plain text: NCAAB has neither a team page nor a player page yet
// (#116, #117). FG% and FT% are left out upstream, see functions/api/ncaabstats.js.

import { shell, rawShell } from '../_shell.js';
import { readSource, TOLERANCE, SHAPES, staleNote, pageCacheControl } from '../_espnSource.js';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const src = await readSource('leaders:ncaab', new URL('/api/ncaabstats', request.url), {
            maxStaleMs: TOLERANCE.leaders, validate: SHAPES.leaders, waitUntil: p => context.waitUntil(p),
            init: { cf: { cacheTtl: 900, cacheEverything: true } },
        });
        if (!src.data) return shell(env, request.url);
        const categories = src.data.categories || [];
        if (!categories.length) return shell(env, request.url);
        const season = Number(src.data.season);
        const seasonLabel = season ? `${season - 1}-${String(season).slice(2)}` : '';

        const sections = categories.map(c => {
            const leaders = (c.leaders || []).slice(0, 5);
            if (!leaders.length) return null;
            const items = leaders.map(l => `<li>${esc(l.name)}${l.team ? ` (${esc(l.team)})` : ''} — ${esc(l.value)} ${esc(c.unit)}</li>`).join('');
            return { c, leaders, html: `<h2>${esc(c.label)} Leaders</h2><ol>${items}</ol>` };
        }).filter(Boolean);
        if (!sections.length) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/ncaab/leaders';
        const title = `College Basketball Stat Leaders ${seasonLabel} — Points, Rebounds, Assists & More | SportStrata`;
        const desc  = `${seasonLabel} NCAA Division I men's basketball leaders: points, rebounds, assists, steals, blocks and threes per game. Free, no login, no ads.`;

        const headline = sections.find(s => s.c.key === 'pointsPerGame') || sections[0];
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: `College Basketball ${headline.c.label} Leaders ${seasonLabel}`, url: canonical,
            itemListElement: headline.leaders.map((l, i) => ({
                '@type': 'ListItem', position: i + 1, name: `${l.name} — ${l.value} ${headline.c.unit}`
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>College Basketball Stat Leaders — ${esc(seasonLabel)}</h1>` +
            `<p>${esc(seasonLabel)} NCAA Division I men's basketball leaders, per game. Shooting percentages are left out until ESPN applies an attempts minimum.</p>` +
            `<p><a href="/ncaab">College Basketball Home</a> · <a href="/ncaab/standings">Standings</a></p>` +
            sections.map(s => s.html).join('') + staleNote(src, 'Leaders') + `</section>`;

        let html = await (await rawShell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, (_, a, b) => `${a}${esc(desc)}${b}`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, (_, a, b) => `${a}${canonical}${b}`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, (_, a, b) => `${a}${canonical}${b}`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, (_, a, b) => `${a}${esc(title)}${b}`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, (_, a, b) => `${a}${esc(desc)}${b}`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, (_, a, b) => `${a}${esc(title)}${b}`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, (_, a, b) => `${a}${esc(desc)}${b}`)
            .replace('</head>', () => `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('ncaab-leaders')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', () => `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': pageCacheControl(src, 900) } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#ncaab-leaders', 302); }
    }
}
