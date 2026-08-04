// Pages Function: /nfl/leaders — crawlable, prerendered NFL stat leaders page.
// Clones the D-051 MLB pattern for NFL, timed ahead of the ~5-week-out season
// (D-056 timing note): real SPA shell + per-page <head> + a crawlable ranked-list
// snapshot + ItemList JSON-LD + __SS_ROUTE=nfl-leaders. Same HTML for humans and
// bots; fail-safe. Sources the already-curated /api/nflstats (same-origin, same
// season default the client itself uses) rather than re-implementing ESPN's
// two-stage leaders->athlete resolution here — one definition of "NFL leaders."

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
        const r = await fetch(new URL('/api/nflstats', request.url), { cf: { cacheTtl: 900, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const categories = data.categories || [];
        if (!categories.length) return shell(env, request.url);
        const season = data.season;

        const sections = categories.map(c => {
            const leaders = (c.leaders || []).slice(0, 5);
            if (!leaders.length) return null;
            const items = leaders.map(l =>
                `<li>${esc(l.name)} (${esc(l.team)}) — ${esc(l.value)} ${esc(c.unit)}</li>`).join('');
            return { c, leaders, html: `<h2>${esc(c.label)} Leaders</h2><ol>${items}</ol>` };
        }).filter(Boolean);

        if (!sections.length) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/nfl/leaders';
        const title = `NFL Stat Leaders ${season} — Passing, Rushing, Receiving & Defense | SportStrata`;
        const desc  = `${season} NFL statistical leaders — passing yards, rushing yards, receiving yards, TDs, sacks and interceptions. Full leaderboards for every category. Free, no login, no ads.`;

        const headline = sections.find(s => s.c.key === 'passingYards') || sections[0];
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: `NFL ${headline.c.label} Leaders ${season}`, url: canonical,
            itemListElement: headline.leaders.map((l, i) => ({
                '@type': 'ListItem', position: i + 1, name: `${l.name} — ${l.value} ${headline.c.unit}`
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>NFL Stat Leaders — ${season}</h1>` +
            `<p>Current ${season} NFL leaders across passing, rushing, receiving and defensive categories. Full leaderboards for every stat on SportStrata — free, no login, no ads.</p>` +
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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('nfl-leaders')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=900' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-leaders', 302); }
    }
}
