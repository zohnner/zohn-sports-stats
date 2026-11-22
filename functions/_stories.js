// Shared SportStrata Stories renderers (D-166, generalized per sport in D-171).
// Underscore-prefixed, so not a route. functions/<sport>/stories/{index,[slug]}.js
// are one-line wrappers. Story page: a committed
// content/<sport>/stories/<slug>.md rendered into the SPA shell with a per-story
// <head>, NewsArticle JSON-LD and an /api/og stat card. Index: that sport's
// index.json (tools/stories/build-index.cjs), newest first, ItemList JSON-LD.
// Both set __SS_ROUTE='static-page-<sport>' (D-167) so the SPA keeps the page.
// Unknown slug → the shell with HTTP 404. Any other error → the plain shell.
import core from '../tools/stories/story-core.cjs';
import { shell, rawShell } from './_shell.js';
import { readStories, readAllStories, isPublished, retiredStoryTarget, siblingStories, storyListHtml, STORY_SPORT_IDS } from './_storyLinks.js';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function setAttr(html, re, value) {
    return html.replace(re, (_, open, close) => `${open}${value}${close}`);
}
async function notFound(env, url) {
    const html = await (await rawShell(env, url)).text();
    return new Response(html, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
}
function prettyDate(iso) {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fillHead(html, { title, desc, canonical, ogImage, jsonld, sport, snapshot }) {
    html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`);
    html = setAttr(html, /(<meta name="description" content=")[^"]*(">)/, esc(desc));
    html = setAttr(html, /(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, canonical);
    html = setAttr(html, /(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, canonical);
    html = setAttr(html, /(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, esc(title));
    html = setAttr(html, /(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, esc(desc));
    html = setAttr(html, /(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, esc(title));
    html = setAttr(html, /(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, esc(desc));
    if (ogImage) {
        html = setAttr(html, /(<meta id="ogImage"\s*property="og:image"\s*content=")[^"]*(">)/, esc(ogImage));
        html = setAttr(html, /(<meta id="twImage" name="twitter:image" content=")[^"]*(">)/, esc(ogImage));
    }
    html = html.replace('</head>', () => `<script type="application/ld+json">${jsonld.replace(/</g, '\\u003c')}</script><script>window.__SS_ROUTE=${JSON.stringify(`static-page-${sport}`)};</script></head>`);
    html = html.replace('<div id="playersGrid" class="players-grid"></div>', () => `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
    return html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
}

// "All · NFL · MLB …": the way sideways from any stories page. Lists only
// sports with a published story, so no link lands on an empty index.
// `active` is a sport id, 'all', or null (a story page: nothing is current).
function sportLinks(all, active) {
    const have = STORY_SPORT_IDS.filter(sp => all.some(s => s.sport === sp));
    const link = (href, label, on) => (on ? `<strong aria-current="page">${label}</strong>` : `<a href="${href}">${label}</a>`);
    return [link('/stories', active === null ? 'All stories' : 'All', active === 'all'),
        ...have.map(sp => link(`/${sp}/stories`, esc(core.STORY_SPORTS[sp].label), active === sp))];
}
function sportRowHtml(all, active) {
    const links = sportLinks(all, active);
    return links.length > 2 ? `<nav class="ss-stories__sports" aria-label="Stories by sport">${links.join(' · ')}</nav>` : '';
}

function htmlResponse(html) {
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}

async function failSafe(env, url, sport) {
    try { return await shell(env, url); }
    catch (_) { return Response.redirect(`https://sportstrata.cc/${sport === 'home' ? '' : sport}`, 302); }
}

export async function renderStoryPage(context, sport) {
    const { request, env, params } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const label = core.STORY_SPORTS[sport].label;
        const slug = String(params.slug || '');
        if (!core.SLUG_RE.test(slug)) return notFound(env, request.url);
        const moved = retiredStoryTarget(sport, slug);
        if (moved) return Response.redirect(`https://sportstrata.cc${moved}`, 301);
        const r =await env.ASSETS.fetch(new URL(`/content/${sport}/stories/${slug}.md`, request.url));
        if (!r.ok) return notFound(env, request.url);
        const { meta, body } = core.parseStory(await r.text());
        if (core.validateMeta(meta, sport).length) return shell(env, request.url);

        const eyebrow = core.storyEyebrow(meta, sport);
        // Unpublishing deletes the .md, but the edge kept serving a deleted file
        // for 20+ minutes (2026-11-15). The index is the list of what is
        // published, so a story missing from it is gone, whatever ASSETS returns.
        const published = await readStories(env, request.url, sport);
        if (!isPublished(published, slug)) return notFound(env, request.url);
        const siblings = siblingStories(published, slug);
        const everySport = await readAllStories(env, request.url);
        const canonical = `https://sportstrata.cc${core.storyUrl(slug, sport)}`;
        const title = `${meta.title} | SportStrata`;
        const desc = String(meta.dek);
        const barChart = core.firstBarChart(body);
        const ogImage = 'https://sportstrata.cc/api/og?' + new URLSearchParams({
            eyebrow: `SportStrata Stories · ${eyebrow}`,
            title: String(meta.title),
            ...(barChart
                ? { subtitle: barChart.title, bars: barChart.values.join(','), hi: String(barChart.hi) }
                : { stat: String(meta.hero_stat) }),
            ...(meta.accent && { accent: String(meta.accent).slice(1) }),
        }).toString();
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'NewsArticle',
            headline: String(meta.title).slice(0, 110), description: desc,
            datePublished: String(meta.date), dateModified: String(meta.date),
            image: [ogImage], mainEntityOfPage: canonical,
            author: { '@type': 'Organization', name: core.BYLINE, url: `https://sportstrata.cc/${sport}/stories` },
            publisher: { '@type': 'Organization', name: 'SportStrata', url: 'https://sportstrata.cc' },
        });
        const snapshot =
            `<article class="ss-prerender ss-story">` +
            `<p class="ss-story__eyebrow"><a href="/${sport}/stories">SportStrata Stories</a> · ${esc(eyebrow)}</p>` +
            `<h1>${esc(meta.title)}</h1>` +
            `<p class="ss-story__dek">${esc(meta.dek)}</p>` +
            (meta.hook ? `<p class="ss-story__hook">The news: <a href="${esc(meta.hook_url)}" rel="noopener">${esc(meta.hook)}</a></p>` : '') +
            `<p class="ss-story__meta">By ${esc(core.BYLINE)} · <time datetime="${esc(meta.date)}">${esc(prettyDate(meta.date))}</time></p>` +
            `<div class="ss-story__body">${core.renderBody(body)}</div>` +
            `<p class="ss-story__disclosure">${esc(core.DISCLOSURE)} <a href="/content/${sport}/stories/${esc(slug)}.facts.json">See the data behind this story</a>.</p>` +
            storyListHtml(siblings, `More ${label} stories`, { sport, more: false }) +
            `<p class="ss-story__more">More stories: ${sportLinks(everySport, null).reverse().join(' · ')} · <a href="/${sport}">${label} Home</a></p>` +
            `</article>` +
            `<div class="newsletter-card" data-newsletter-source="story"></div>`;

        const html = await (await rawShell(env, request.url)).text();
        return htmlResponse(fillHead(html, { title, desc, canonical, ogImage, jsonld, sport, snapshot }));
    } catch (e) {
        return failSafe(env, request.url, sport);
    }
}

export async function renderStoriesIndex(context, sport) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const label = core.STORY_SPORTS[sport].label;
        const r = await env.ASSETS.fetch(new URL(`/content/${sport}/stories/index.json`, request.url));
        const stories = r.ok ? (((await r.json()) || {}).stories || []) : [];
        const everySport = await readAllStories(env, request.url);

        const canonical = `https://sportstrata.cc/${sport}/stories`;
        const title = `SportStrata Stories — Data-Driven ${label} Analysis | SportStrata`;
        const desc = `Original ${label} analysis built from SportStrata's own numbers — every stat listed with its source. Free, no login, no ads.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList', name: `SportStrata ${label} Stories`, url: canonical,
            itemListElement: stories.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://sportstrata.cc${s.url}`, name: s.title })),
        });
        const items = stories.map(s =>
            `<li><a href="${esc(s.url)}">${esc(s.title)}</a>` +
            `<p class="ss-story__dek">${esc(s.dek)}</p>` +
            `<p class="ss-story__meta"><time datetime="${esc(s.date)}">${esc(prettyDate(s.date))}</time> · ${esc(core.storyEyebrow(s, sport))}</p></li>`
        ).join('');
        const snapshot =
            `<section class="ss-prerender ss-stories"><h1>SportStrata Stories</h1>` +
            sportRowHtml(everySport, sport) +
            `<p>Original ${label} analysis built from SportStrata's own numbers. Every stat in every story is listed with its source.</p>` +
            (stories.length ? `<ol class="ss-stories__list">${items}</ol>` : `<p>The first stories are on the way.</p>`) +
            `<p><a href="/${sport}">${label} Home</a></p></section>`;

        const html = await (await rawShell(env, request.url)).text();
        return htmlResponse(fillHead(html, { title, desc, canonical, ogImage: null, jsonld, sport, snapshot }));
    } catch (e) {
        return failSafe(env, request.url, sport);
    }
}

// /stories: every sport's stories in one list, newest first. Each row carries
// its sport in the eyebrow, so a mixed list is never ambiguous.
export async function renderStoriesHub(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const stories = await readAllStories(env, request.url);

        const canonical = 'https://sportstrata.cc/stories';
        const title = 'SportStrata Stories — Data-Driven Sports Analysis | SportStrata';
        const desc = "Original analysis across every sport SportStrata covers, built from its own numbers — every stat listed with its source. Free, no login, no ads.";
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList', name: 'SportStrata Stories', url: canonical,
            itemListElement: stories.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `https://sportstrata.cc${s.url}`, name: s.title })),
        });
        const items = stories.map(s =>
            `<li><a href="${esc(s.url)}">${esc(s.title)}</a>` +
            `<p class="ss-story__dek">${esc(s.dek)}</p>` +
            `<p class="ss-story__meta"><time datetime="${esc(s.date)}">${esc(prettyDate(s.date))}</time> · ${esc(core.storyEyebrow(s, s.sport))}</p></li>`
        ).join('');
        const snapshot =
            `<section class="ss-prerender ss-stories"><h1>SportStrata Stories</h1>` +
            sportRowHtml(stories, 'all') +
            `<p>Original analysis built from SportStrata's own numbers, across every sport. Every stat in every story is listed with its source.</p>` +
            (stories.length ? `<ol class="ss-stories__list">${items}</ol>` : `<p>The first stories are on the way.</p>`) +
            `<p><a href="/">SportStrata Home</a></p></section>`;

        const html = await (await rawShell(env, request.url)).text();
        return htmlResponse(fillHead(html, { title, desc, canonical, ogImage: null, jsonld, sport: 'home', snapshot }));
    } catch (e) {
        return failSafe(env, request.url, 'home');
    }
}
