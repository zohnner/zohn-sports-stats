/**
 * Pages Function: /api/nbastandings
 * NBA standings, current OR any past season back to founding.
 * Same-origin, no keys, no D1. Clone of /api/ncaafstandings — NOT
 * /api/wnbastandings — because NBA's real tree is conference > division >
 * entries (2 conferences x 3 divisions each), confirmed live 2026-09-14 via
 * a direct fetch of the real ESPN endpoint at level=3, the same shape
 * NFL/NCAAF use. WNBA's flatter conference-only tree does not apply here.
 *
 * Why this exists: ESPN's site.api.espn.com/.../standings (used by /api/nba)
 * returns only a `fullViewLink` stub — same dead feed NFL/NCAAF/NCAAB/WNBA
 * hit (D-029). The real standings tree lives on the site.web.api host below.
 * Server-side fetch sidesteps that host's browser CORS.
 *
 * Tree: data.children = the two conferences (East, West); each conference's
 * children = 3 divisions, each with standings.entries. The same recursive
 * collector NCAAF/NCAAB use handles this without special-casing.
 *
 * Usage: /api/nbastandings?season=2026
 *        /api/nbastandings?season=2026&debug=1   (adds _meta envelope)
 */
const BASE = 'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings';
const MIN_SEASON = 1950; // NBA founding era (BAA/NBA merger)

function json(body, status, ttl) {
    return new Response(body, {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    }

    const u = new URL(request.url);
    const nowYear = new Date().getUTCFullYear();
    const reqSeason = parseInt(u.searchParams.get('season') || '', 10);
    // NBA labels a season by its END year (confirmed live: the 2025-26 season,
    // running 2025-10-01..2026-06-27, reports season.year:2026 — the same
    // end-year convention NCAAB uses, the opposite of NCAAF's start-year
    // labeling). Defensive fallback for direct calls without an explicit
    // season: Jul-Sep (before the new season's games start in Oct) keep
    // showing the season that just ended in June; Oct-Jun show the season
    // currently in progress (or about to start).
    const _nbaLastSeasonNow = (d) => (d.getUTCMonth() + 1 >= 10) ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
    const season = (reqSeason >= MIN_SEASON && reqSeason <= nowYear + 1)
        ? reqSeason
        : _nbaLastSeasonNow(new Date());
    const debug = u.searchParams.get('debug') === '1';

    const target = new URL(BASE);
    target.searchParams.set('region', 'us');
    target.searchParams.set('lang', 'en');
    target.searchParams.set('contentorigin', 'espn');
    target.searchParams.set('season', String(season));
    target.searchParams.set('seasontype', '2');     // regular season
    target.searchParams.set('level', '3');          // league > conference > division
    target.searchParams.set('sort', 'winpercent:desc,gamesbehind:asc');

    const isPast = season < _nbaLastSeasonNow(new Date());
    const ttl = isPast ? 604800 : 1800;             // 7 days vs 30 min

    let upstream;
    try {
        upstream = await fetch(target.toString(), {
            headers: { 'Accept': 'application/json' },
            cf: { cacheTtl: ttl, cacheEverything: true },
        });
    } catch (e) {
        return json(JSON.stringify({ ok: false, reason: 'upstream fetch failed', season }), 502, 600);
    }

    const text = await upstream.text();
    if (!upstream.ok) {
        return json(JSON.stringify({ ok: false, reason: `upstream ${upstream.status}`, season, ...(debug ? { _meta: { url: target.toString(), body: text.slice(0, 300) } } : {}) }), 200, 600);
    }

    if (!debug) return json(text, 200, ttl);

    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) { /* leave null */ }
    const groups = (parsed && parsed.children) || [];
    const meta = {
        url: target.toString(), season, ttl,
        topKeys: parsed ? Object.keys(parsed).slice(0, 12) : null,
        groupCount: groups.length,
        groupNames: groups.map(c => c.abbreviation || c.name),
        childrenPerGroup: groups.map(c => (c.children || []).length),
        entriesAtGroup: groups.map(c => (c.standings?.entries || []).length),
        sampleStatNames: (() => {
            try { return (groups[0].standings?.entries || groups[0].children[0].standings.entries)[0].stats.map(s => s.name); } catch (_) { return null; }
        })(),
    };
    return json(JSON.stringify({ ok: true, _meta: meta, raw: parsed }), 200, ttl);
}
