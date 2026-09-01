// Pages Function: /nfl/standings — crawlable, prerendered NFL division
// standings page. Promotes the existing hash-only nfl-standings view
// (js/nflStandings.js's fetchNFLStandings) to a real path URL, the same gap
// MLB (D-041) and NCAAF (D-114) already closed — NFL was the one sport with
// a live standings feature and no crawlable page for it (found during the
// 2026-08-31 NFL Week 1 readiness pass). Clone of functions/ncaaf/standings.js
// — same recursive conference/division collector; /api/nflstandings's own
// tree (AFC/NFC -> 4 divisions each -> entries) is a strict subset of what
// that collector already handles. Same HTML for humans and bots; fail-safe.
// Self-fetches /api/nflstandings (same-origin) so season-default logic
// (Sept+ = current year, else prior) lives in one place, not duplicated here.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

function collectConfs(node, trail, out) {
    const nm = node.name || node.abbreviation;
    const t2 = nm ? [...trail, nm] : trail;
    const entries = (node.standings && node.standings.entries) || [];
    if (entries.length) {
        const label = t2.join(' — ') || nm || 'Division';
        const teams = entries.map(e => {
            const t = e.team || {};
            const stat = (names) => (e.stats || []).find(x => names.includes(x.name) || names.includes(x.type)) || null;
            const w = stat(['wins']), l = stat(['losses']);
            const record = (w && l) ? `${w.displayValue}-${l.displayValue}` : '';
            return { name: t.displayName || t.name || t.location || '?', record };
        }).filter(t => t.name && t.name !== '?');
        if (teams.length) out.push({ name: label, teams });
    }
    for (const c of (node.children || [])) collectConfs(c, t2, out);
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const r = await fetch(new URL('/api/nflstandings', request.url), { cf: { cacheTtl: 1800, cacheEverything: true } });
        if (!r.ok) return shell(env, request.url);
        const data = await r.json();
        if (data && data.ok === false) return shell(env, request.url);

        const confs = [];
        for (const c of (data.children || [])) collectConfs(c, [], confs);
        const sections = confs.filter(c => c.teams.length).slice(0, 8);
        if (!sections.length) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/nfl/standings';
        const title = `NFL Standings — Division Records & Playoff Picture | SportStrata`;
        const desc  = `NFL standings by division — win-loss records for all 32 teams across the AFC and NFC, updated throughout the season. Free, no login, no ads.`;

        const confItems = sections.map(s => `<li>${esc(s.name)}</li>`).join('');
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: 'NFL Division Standings', url: canonical,
            itemListElement: sections.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name }))
        });

        const sectionHtml = sections.map(s => {
            const rows = s.teams.slice(0, 8).map(t => `<li>${esc(t.name)}${t.record ? ` (${esc(t.record)})` : ''}</li>`).join('');
            return `<h2>${esc(s.name)}</h2><ol>${rows}</ol>`;
        }).join('');

        const snapshot =
            `<section class="ss-prerender"><h1>NFL Standings</h1>` +
            `<p>Division-by-division standings with win-loss records for every NFL team, updated throughout the season on SportStrata — free, no login, no ads.</p>` +
            `<p>Divisions: <ul>${confItems}</ul></p>` +
            `<p><a href="/nfl">NFL Home</a> · <a href="/nfl/leaders">NFL Stat Leaders</a></p>` +
            sectionHtml + `</section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('nfl-standings')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#nfl-standings', 302); }
    }
}
