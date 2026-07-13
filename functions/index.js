// Pages Function: / — crawlable, prerendered home (D-046 P6).
// Same proven D-041/D-045 edge-render pattern as the sport landings: serve the
// real SPA shell with dynamic-date <head> + a crawlable snapshot of today's MLB
// games injected into #playersGrid, so bots (and the first paint) see real,
// current content instead of an empty shell — the single biggest SEO lever.
// Same HTML for humans and bots. Any error fails safe to the untouched app.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

const CANON = 'https://sportstrata.cc/';
const H1    = 'Serious Stats for Serious Fans';

// ET calendar day (schedule dates are ET-based).
function etDate() {
    const et = new Date(Date.now() - 5 * 3600 * 1000);
    return {
        iso: et.toISOString().slice(0, 10),
        pretty: et.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    };
}

// Best-effort today's-games snapshot. Never throws — returns '' on any failure.
async function todaysGamesSnapshot(iso) {
    try {
        const r = await fetch(
            `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${iso}&hydrate=team,linescore`,
            { cf: { cacheTtl: 120, cacheEverything: true }, headers: { Accept: 'application/json' } }
        );
        if (!r.ok) return '';
        const games = ((await r.json()).dates || [])[0]?.games || [];
        if (!games.length) return '<p>No MLB games scheduled today.</p>';
        const rows = games.slice(0, 16).map(g => {
            const a = g.teams?.away, h = g.teams?.home;
            const an = a?.team?.name || 'Away', hn = h?.team?.name || 'Home';
            const st = g.status?.detailedState || '';
            const scored = a?.score != null && h?.score != null;
            const line = scored ? `${an} ${a.score}, ${hn} ${h.score} — ${st}` : `${an} at ${hn} — ${st}`;
            return `<li>${esc(line)}</li>`;
        }).join('');
        return `<ul>${rows}</ul>`;
    } catch (_) { return ''; }
}

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.ASSETS) return shell(env, request.url);
        const d = etDate();
        const title = `MLB Scores, Stats & Analytics — ${d.pretty} | SportStrata`;
        const desc  = `Today's MLB scores and live game states, leaders (AVG, OPS, ERA, FIP, wRC+), standings with Monte Carlo playoff odds, and Statcast player profiles. Free, no login, no ads. Updated ${d.pretty}.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'WebSite',
            name: 'SportStrata', url: CANON, description: desc,
            potentialAction: { '@type': 'SearchAction', target: 'https://sportstrata.cc/#mlb-players?q={q}', 'query-input': 'required name=q' }
        });
        const games = await todaysGamesSnapshot(d.iso);
        const snapshot =
            `<section class="ss-prerender"><h1>${esc(H1)}</h1>` +
            `<p>${esc(desc)}</p>` +
            `<h2>Today's MLB Games — ${esc(d.pretty)}</h2>${games}` +
            `<ul><li><a href="/mlb">MLB Stats &amp; Analytics</a></li>` +
            `<li><a href="/mlb/standings">Standings &amp; Playoff Odds</a></li>` +
            `<li><a href="/nfl">NFL</a></li><li><a href="/ncaaf">College Football</a></li></ul></section>`;

        let html = await (await shell(env, request.url)).text();
        html = html
            .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
            .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<link id="canonicalLink" rel="canonical"\s*href=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogUrl"\s*property="og:url"\s*content=")[^"]*(">)/, `$1${CANON}$2`)
            .replace(/(<meta id="ogTitle"\s*property="og:title"\s*content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="ogDescription"\s*property="og:description"\s*content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace(/(<meta id="twTitle" name="twitter:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
            .replace(/(<meta id="twDescription" name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
            .replace('</head>', `<script type="application/ld+json">${jsonld}</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=120' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#home', 302); }
    }
}
