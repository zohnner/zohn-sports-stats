// Pages Function: /mlb/leaders — crawlable, prerendered MLB leaders page (D-051).
// Highest-volume evergreen MLB query class ("home run leaders", "ERA leaders").
// Mirrors the team/game templates: real SPA shell + per-page <head> + a crawlable
// ranked-list snapshot + ItemList JSON-LD + __SS_ROUTE=mlb-leaders. Fail-safe.
//
// D-114 update: each leader's team and player name now link to /mlb/team/:abbr
// and /mlb/player/:id — this page previously rendered plain text with zero
// outbound links, one of the reasons GSC's Links report showed only 7 internal
// links site-wide despite ~1,500 pages in the sitemap.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) { return env.ASSETS.fetch(new URL('/index.html', url)); }

// MLB full-name → abbreviation, live-verified against
// https://statsapi.mlb.com/api/v1/teams?sportId=1&season=<current> (D-114).
// Duplicated here rather than shared across functions/*.js — same convention as
// MLB_TERMS in functions/glossary.js: each edge function is an isolated worker
// with no access to a shared client bundle, so duplication is deliberate, not
// drift. Note "Athletics" (no city) → ATH — the franchise dropped "Oakland"
// from its official team name for the 2025 season.
const MLB_TEAM_ABBR = {
    'Arizona Diamondbacks': 'AZ', 'Athletics': 'ATH', 'Atlanta Braves': 'ATL',
    'Baltimore Orioles': 'BAL', 'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC',
    'Chicago White Sox': 'CWS', 'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE',
    'Colorado Rockies': 'COL', 'Detroit Tigers': 'DET', 'Houston Astros': 'HOU',
    'Kansas City Royals': 'KC', 'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD',
    'Miami Marlins': 'MIA', 'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN',
    'New York Mets': 'NYM', 'New York Yankees': 'NYY', 'Philadelphia Phillies': 'PHI',
    'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD', 'San Francisco Giants': 'SF',
    'Seattle Mariners': 'SEA', 'St. Louis Cardinals': 'STL', 'Tampa Bay Rays': 'TB',
    'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR', 'Washington Nationals': 'WSH'
};

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
            const items = leaders.map(l => {
                const pname = esc((l.person && l.person.fullName) || '');
                const pid = l.person && l.person.id;
                const pSlug = ((l.person && l.person.fullName) || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                const nameHtml = pid ? `<a href="/mlb/player/${pid}/${esc(pSlug)}">${pname}</a>` : pname;
                const tname = (l.team && l.team.name) || '';
                const tabbr = MLB_TEAM_ABBR[tname];
                const teamHtml = tabbr ? `<a href="/mlb/team/${tabbr.toLowerCase()}">${esc(tname)}</a>` : esc(tname);
                return `<li>${nameHtml} (${teamHtml}) — ${esc(l.value)}</li>`;
            }).join('');
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
            `<p><a href="/mlb">MLB Home</a></p>` +
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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify('mlb-leaders')};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`);
        html = html.replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-leaders', 302); }
    }
}
