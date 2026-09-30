// Pages Function: /nfl/stories/:slug — one SportStrata Story (D-166).
// Renders a committed, human-reviewed content/nfl/stories/<slug>.md into the SPA
// shell with a per-story <head>, NewsArticle JSON-LD and an /api/og stat card.
// Sets __SS_ROUTE='static-page-nfl' (D-167) so the SPA leaves the story in place.
// Unknown slug → the shell with HTTP 404. Any other error → the plain shell.
import core from '../../../tools/stories/story-core.cjs';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
async function notFound(env, url) {
    const html = await (await shell(env, url)).text();
    return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function prettyDate(iso) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export async function onRequest(context) {
    const { request, env, params } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const slug = String(params.slug || '');
        if (!core.SLUG_RE.test(slug)) return notFound(env, request.url);
        const r = await env.ASSETS.fetch(new URL(`/content/nfl/stories/${slug}.md`, request.url));
        if (!r.ok) return notFound(env, request.url);
        const { meta, body } = core.parseStory(await r.text());
        if (core.validateMeta(meta).length) return shell(env, request.url);

        const canonical = `https://sportstrata.cc${core.storyUrl(slug)}`;
        const title = `${meta.title} | SportStrata`;
        const desc = String(meta.dek);
        const ogImage = 'https://sportstrata.cc/api/og?' + new URLSearchParams({
            eyebrow: `SportStrata Stories · NFL Week ${meta.week}`,
            title: String(meta.title),
            stat: String(meta.hero_stat),
        }).toString();
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'NewsArticle',
            headline: String(meta.title).slice(0, 110), description: desc,
            datePublished: String(meta.date), dateModified: String(meta.date),
            image: [ogImage], mainEntityOfPage: canonical,
            author: { '@type': 'Organization', name: core.BYLINE, url: 'https://sportstrata.cc/nfl/stories' },
            publisher: { '@type': 'Organization', name: 'SportStrata', url: 'https://sportstrata.cc' },
        });
        const snapshot =
            `<article class="ss-prerender ss-story">` +
            `<p class="ss-story__eyebrow"><a href="/nfl/stories">SportStrata Stories</a> · NFL · Week ${esc(meta.week)}</p>` +
            `<h1>${esc(meta.title)}</h1>` +
            `<p class="ss-story__dek">${esc(meta.dek)}</p>` +
            `<p class="ss-story__meta">By ${esc(core.BYLINE)} · <time datetime="${esc(meta.date)}">${esc(prettyDate(meta.date))}</time></p>` +
            `<div class="ss-story__body">${core.renderBody(body)}</div>` +
            `<p class="ss-story__disclosure">${esc(core.DISCLOSURE)} <a href="/content/nfl/stories/${esc(slug)}.facts.json">See the data behind this story</a>.</p>` +
            `<p class="ss-story__more"><a href="/nfl/stories">More SportStrata Stories</a> · <a href="/nfl">NFL Home</a></p>` +
            `</article>`;

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
            .replace(/(<meta id="ogImage"\s*property="og:image"\s*content=")[^"]*(">)/, `$1${esc(ogImage)}$2`)
            .replace(/(<meta id="twImage" name="twitter:image" content=")[^"]*(">)/, `$1${esc(ogImage)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify('static-page-nfl')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/nfl', 302); }
    }
}
