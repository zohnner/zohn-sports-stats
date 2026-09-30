// Pages Function: /nfl/stories — SportStrata Stories index (D-166).
// Lists content/nfl/stories/index.json (built by tools/stories/build-index.cjs),
// newest first, with ItemList JSON-LD. Sets __SS_ROUTE='static-page-nfl' (D-167).
// Renders an honest "first stories on the way" page when the index is empty.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function setAttr(html, re, value) {
    return html.replace(re, (_, open, close) => `${open}${value}${close}`);
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
function prettyDate(iso) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const r = await env.ASSETS.fetch(new URL('/content/nfl/stories/index.json', request.url));
        const stories = r.ok ? (((await r.json()) || {}).stories || []) : [];

        const canonical = 'https://sportstrata.cc/nfl/stories';
        const title = 'SportStrata Stories — Data-Driven NFL Analysis | SportStrata';
        const desc = "Original NFL analysis built from SportStrata's own numbers — every stat listed with its source. Free, no login, no ads.";
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList', name: 'SportStrata Stories', url: canonical,
            itemListElement: stories.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://sportstrata.cc${s.url}`, name: s.title })),
        });
        const items = stories.map(s =>
            `<li><a href="${esc(s.url)}">${esc(s.title)}</a>` +
            `<p class="ss-story__dek">${esc(s.dek)}</p>` +
            `<p class="ss-story__meta"><time datetime="${esc(s.date)}">${esc(prettyDate(s.date))}</time> · NFL Week ${esc(s.week)}</p></li>`
        ).join('');
        const snapshot =
            `<section class="ss-prerender ss-stories"><h1>SportStrata Stories</h1>` +
            `<p>Original NFL analysis built from SportStrata's own numbers. Every stat in every story is listed with its source.</p>` +
            (stories.length ? `<ol class="ss-stories__list">${items}</ol>` : `<p>The first stories are on the way.</p>`) +
            `<p><a href="/nfl">NFL Home</a></p></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`);
        html = setAttr(html, /(<meta name="description" content=")[^"]*(">)/, esc(desc));
        html = setAttr(html, /(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, canonical);
        html = setAttr(html, /(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, canonical);
        html = setAttr(html, /(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, esc(title));
        html = setAttr(html, /(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, esc(desc));
        html = setAttr(html, /(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, esc(title));
        html = setAttr(html, /(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, esc(desc));
        html = html.replace('</head>', () => `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('static-page-nfl')};</script></head>`);
        html = html.replace('<div id="playersGrid" class="players-grid"></div>', () => `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/nfl', 302); }
    }
}
