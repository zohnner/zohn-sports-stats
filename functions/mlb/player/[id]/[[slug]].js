// Pages Function: /mlb/player/:id(/:slug) — crawlable, prerendered MLB player page (D-041 Phase 1).
// Same contract as the team function: one HTML for all clients (SPA shell via env.ASSETS
// with per-player head + Person JSON-LD + crawlable snapshot + __SS_ROUTE hint), assets
// absolutized for the deep path, fail-safe fallback to the untouched app.
//
// D-114 update: the player's team now links to /mlb/team/:abbr, plus back-links to
// /mlb and /mlb/leaders — this page previously rendered the team as plain text with
// zero outbound links.

function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}
function shell(env, url) {
    return env.ASSETS.fetch(new URL('/index.html', url));
}

function mlbSeason() {
    const n = new Date(); const m = n.getUTCMonth();
    return (m <= 1) ? n.getUTCFullYear() - 1 : n.getUTCFullYear(); // Jan/Feb → prior season
}

// D-127: a short, real stat line for this player's share-card image. Deliberately
// simple (3 headline stats, not a full profile) -- the OG card is a hook, not the page.
function statLine(stats, group) {
    if (!stats) return '';
    if (group === 'pitching') {
        const era = stats.era, w = stats.wins, l = stats.losses, k = stats.strikeOuts;
        if (era == null) return '';
        return `${era} ERA · ${w ?? 0}-${l ?? 0} · ${k ?? 0} K`;
    }
    const avg = stats.avg, hr = stats.homeRuns, rbi = stats.rbi;
    if (avg == null) return '';
    return `${avg} AVG · ${hr ?? 0} HR · ${rbi ?? 0} RBI`;
}

// MLB full-name → abbreviation, live-verified against
// https://statsapi.mlb.com/api/v1/teams?sportId=1&season=<current> (D-114).
// Duplicated deliberately — see the same map's comment in functions/mlb/leaders.js.
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

export async function onRequest(context) {
    const { request, env, params } = context;
    const id = String(params.id || '').replace(/[^0-9]/g, '');
    try {
        if (!id || !env.ASSETS) return shell(env, request.url);
        const season = mlbSeason();
        const pr = await fetch(
            `https://statsapi.mlb.com/api/v1/people/${id}?hydrate=${encodeURIComponent(`currentTeam,stats(group=[hitting,pitching],type=season,season=${season})`)}`,
            { cf: { cacheTtl: 3600, cacheEverything: true } }
        );
        if (!pr.ok) return shell(env, request.url);
        const person = ((await pr.json()).people || [])[0];
        if (!person || person.id == null) return shell(env, request.url);

        const name    = person.fullName || 'MLB Player';
        const pos     = (person.primaryPosition && person.primaryPosition.name) || '';
        const posAbbr = (person.primaryPosition && person.primaryPosition.abbreviation) || '';
        const team    = (person.currentTeam && person.currentTeam.name) || '';
        const slug    = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const canonical = `https://sportstrata.cc/mlb/player/${id}/${slug}`;
        const group   = (posAbbr === 'P') ? 'pitching' : 'hitting';
        const route   = 'mlb-player-' + id + (group === 'pitching' ? '-pitching' : '');

        const statSplit = (person.stats || []).find(s => (s.group && s.group.displayName) === group);
        const seasonStats = statSplit && statSplit.splits && statSplit.splits[0] && statSplit.splits[0].stat;
        const stat = statLine(seasonStats, group);
        const ogImage = `https://sportstrata.cc/api/og?` + new URLSearchParams({
            eyebrow: `SportStrata · MLB`,
            title: name,
            subtitle: [pos, team].filter(Boolean).join(' · '),
            ...(stat ? { stat } : {}),
        }).toString();

        const title = `${name} — Stats, Splits & Game Logs | SportStrata`;
        const desc  = `${name}${pos ? ', ' + pos : ''}${team ? ' · ' + team : ''} — season stats, advanced metrics, splits and game logs. Free, no login.`;
        const jsonld = JSON.stringify({
            '@context': 'https://schema.org', '@type': 'Person', name, url: canonical,
            ...(pos ? { jobTitle: pos } : {}),
            ...(team ? { affiliation: { '@type': 'SportsTeam', name: team } } : {})
        });

        const tabbr = team ? MLB_TEAM_ABBR[team] : null;
        const teamHtml = tabbr ? `<a href="/mlb/team/${tabbr.toLowerCase()}">${esc(team)}</a>` : esc(team);
        const bioLine = [pos ? esc(pos) : '', team ? teamHtml : ''].filter(Boolean).join(' · ');

        const snapshot =
            `<section class="ss-prerender"><h1>${esc(name)}</h1>` +
            `<p>${bioLine}</p>` +
            `<p>${esc(name)} season stats, advanced metrics, splits and game logs on SportStrata — free, no login, no ads.</p>` +
            `<p><a href="/mlb">MLB Home</a> · <a href="/mlb/leaders">MLB Stat Leaders</a></p></section>`;

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
            .replace('</head>', `<script type="application/ld+json">${jsonld.replace(/</g, "\\u003c")}</script><script>window.__SS_ROUTE=${JSON.stringify(route)};</script></head>`)
            .replace('<div id="playersGrid" class="players-grid"></div>', `<div id="playersGrid" class="players-grid">${snapshot}</div>`)
            .replace(/\b(href|src)="(?!https?:|\/\/|\/|#|data:|mailto:|tel:)/g, '$1="/');

        return new Response(html, {
            headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' }
        });
    } catch (e) {
        try { return await shell(env, request.url); }
        catch (_) { return Response.redirect('https://sportstrata.cc/#mlb-players', 302); }
    }
}
