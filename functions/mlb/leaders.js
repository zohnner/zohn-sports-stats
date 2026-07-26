// Pages Function: /mlb/leaders — crawlable, prerendered MLB leaders page (D-051).
// Highest-volume evergreen MLB query class ("home run leaders", "ERA leaders").
// Mirrors the team/game templates: real SPA shell + per-page <head> + a crawlable
// ranked-list snapshot + ItemList JSON-LD + __SS_ROUTE=mlb-leaders. Fail-safe.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

function mlbSeason() {
    const n = new Date(); const m = n.getUTCMonth();
    return (m <= 1) ? n.getUTCFullYear() - 1 : n.getUTCFullYear(); // Jan/Feb → prior season
}

const CATS = [
    { cat: 'homeRuns',          group: 'hitting',  label: 'Home Run' },
    { cat: 'battingAverage',    group: 'hitting',  label: 'Batting Average' },
    { cat: 'runsBattedIn',      group: 'hitting',  label: 'RBI' },
    { cat: 'earnedRunAverage',  group: 'pitching', label: 'ERA' },
    { cat: 'strikeouts',        group: 'pitching', label: 'Strikeout' },
    { cat: 'wins',              group: 'pitching', label: 'Wins' }
];

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const season = mlbSeason();
        const r = await fetch(
            `https://statsapi.mlb.com/api/v1/stats/leaders?leaderCategories=${CATS.map(c => c.cat).join(',')}&season=${season}&sportId=1&limit=5`,
            { cf: { cacheTtl: 900, cacheEverything: true } }
        );
        if (!r.ok) return shell(env, request.url);
        const blocks = ((await r.json()).leagueLeaders) || [];

        const sections = CATS.map(c => {
            const b = blocks.find(x => x.leaderCategory === c.cat && x.statGroup === c.group);
            const leaders = (b && b.leaders || []).slice(0, 5);
            if (!leaders.length) return null;
            const items = leaders.map(l =>
                `<li>${esc(l.person?.fullName || '')} (${esc(l.team?.name || '')}) — ${esc(l.value)}</li>`).join('');
            return { c, leaders, html: `<h2>${esc(c.label)} Leaders</h2><ol>${items}</ol>` };
        }).filter(Boolean);

        if (!sections.length) return shell(env, request.url);

        const canonical = 'https://sportstrata.cc/mlb/leaders';
        const title = `MLB Stat Leaders ${season} — Home Runs, AVG, RBI, ERA, Strikeouts & Wins | SportStrata`;
        const desc  = `${season} MLB statistical leaders — home runs, batting average, RBI, ERA, strikeouts and wins. Updated daily, with full leaderboards for every stat. Free, no login, no ads.`;

        // ItemList JSON-LD for the headline (home run) leaders.
        const hr = sections.find(s => s.c.cat === 'homeRuns');
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'ItemList',
            name: `MLB Home Run Leaders ${season}`, url: canonical,
            itemListElement: (hr ? hr.leaders : []).map((l, i) => ({
                '@type': 'ListItem', position: i + 1, name: `${l.person?.fullName || ''} — ${l.value} HR`
            }))
        });

        const snapshot =
            `<section class="ss-prerender"><h1>MLB Stat Leaders — ${season}</h1>` +
            `<p>Current ${season} MLB leaders across home runs, batting average, RBI, ERA, strikeouts and wins. Full leaderboards for every stat on SportStrata — free, no login, no ads.</p>` +
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
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script><script>window.__SS_ROUTE=${JSON.stringify('mlb-leaders')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-leaders', 302); }
    }
}
