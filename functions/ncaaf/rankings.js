// Pages Function: /ncaaf/rankings — crawlable, prerendered NCAA football polls page.
// Promotes the existing hash-only ncaaf-rankings view (js/ncaaf.js's
// displayNCAAFRankings/fetchNCAAFRankings) to a real path URL, timed ahead of
// the CFB season's Aug-Jan discovery window (D-056 timing note). Clones the
// D-051/D-050 prerender pattern: real SPA shell + per-page <head> + a crawlable
// AP Top 25 snapshot + ItemList JSON-LD + __SS_ROUTE=ncaaf-rankings. Same HTML
// for humans and bots; fail-safe. Self-fetches /api/ncaaf?path=/rankings (same
// same-origin proxy the client uses) and replicates its FBS-poll filter here,
// since that filter lives client-side today — one behavior, described twice
// only because one half runs at the edge and one in the browser.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
const fbsPoll = (n) => !!n && !/\bFCS\b|Div(ision)?\s*(II|III)\b/i.test(n);

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const r = await fetch(new URL('/api/ncaaf?path=/rankings', request.url), { cf: { cacheTtl: 1800, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        const polls = (data.rankings || []).filter(p => fbsPoll(p.shortName || p.name));
        const poll = polls[0];
        const ranks = poll ? (poll.ranks || []).slice(0, 25) : [];
        if (!ranks.length) return shell(env, request.url);

        const pollName = poll.shortName || poll.name || 'AP Top 25';
        const occurrence = (poll.occurrence && poll.occurrence.displayValue) || '';

        const canonical = 'https://sportstrata.cc/ncaaf/rankings';
        const title = `${pollName} — College Football Rankings${occurrence ? ` (${occurrence})` : ''} | SportStrata`;
        const desc  = `${pollName} college football rankings${occurrence ? `, ${occurrence}` : ''} — full Top 25 with records and week-over-week movement. Free, no login, no ads.`;

        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: `${pollName} College Football Rankings`, url: canonical,
            itemListElement: ranks.map(rk => {
                const t = rk.team || {};
                return { '@type': 'ListItem', position: rk.current, name: t.displayName || t.name || t.location || '?' };
            })
        });

        const items = ranks.map(rk => {
            const t = rk.team || {};
            const name = t.displayName || t.name || t.location || '?';
            const rec = rk.recordSummary || '';
            return `<li>${rk.current}. ${esc(name)}${rec ? ` (${esc(rec)})` : ''}</li>`;
        }).join('');

        const snapshot =
            `<section class="ss-prerender"><h1>${esc(pollName)}${occurrence ? ` — ${esc(occurrence)}` : ''}</h1>` +
            `<p>Full Top 25 college football rankings with records and movement, updated weekly on SportStrata — free, no login, no ads.</p>` +
            `<ol>${items}</ol></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify('ncaaf-rankings')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#ncaaf-rankings', 302); }
    }
}
