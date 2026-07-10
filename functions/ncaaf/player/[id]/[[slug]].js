// Pages Function: /ncaaf/player/:id(/:slug) — crawlable, prerendered NCAAF player page (D-045 P2).
// Clones the D-041 pattern: SPA shell via env.ASSETS + per-player head (Person JSON-LD) +
// crawlable snapshot + __SS_ROUTE=ncaaf-player-{id}. Same HTML for humans and bots; fail-safe.
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }
function season() { const n = new Date(); return (n.getUTCMonth() + 1 >= 8) ? n.getUTCFullYear() : n.getUTCFullYear() - 1; }

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const yr = season();
        const ar = await fetch(`${CORE}/seasons/${yr}/athletes/${id}?lang=en&region=us`, { cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!ar.ok) return shell(env, request.url);
        const a = await ar.json();
        if (!a || !(a.fullName || a.displayName)) return shell(env, request.url);

        const name = a.fullName || a.displayName;
        const pos  = (a.position && a.position.displayName) || '';
        let team = '';
        const tref = a.team && a.team.$ref;
        const tid = tref && (/\/teams\/(\d+)/.exec(tref) || [])[1];
        if (tid) {
            try {
                const tr = await fetch(`${CORE}/seasons/${yr}/teams/${tid}?lang=en&region=us`, { cf: { cacheTtl: 86400, cacheEverything: true } });
                if (tr.ok) { const t = await tr.json(); team = t.displayName || t.name || ''; }
            } catch (_) {}
        }
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/ncaaf/player/${id}/${slug}`;
        const route = 'ncaaf-player-' + id;
        const title = `${name} — College Football Stats | SportStrata`;
        const desc  = `${name}${pos ? ', ' + pos : ''}${team ? ' · ' + team : ''} — ${yr} college football season stats. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Person', name, url: canonical,
            ...(pos ? { jobTitle: pos } : {}),
            ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {})
        });
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${esc([pos, team].filter(Boolean).join(' · '))}</p>` +
            `<p>${esc(name)} ${yr} college football season stats on SportStrata — free, no login, no ads.</p></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#ncaaf-leaders', 302); }
    }
}
