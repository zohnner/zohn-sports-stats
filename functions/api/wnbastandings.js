/**
 * Pages Function: /api/wnbastandings
 * WNBA standings, current OR any past season back to 1997 (league founding).
 * Same-origin, no keys, no D1. Clone of /api/ncaabstandings (D-042/D-052
 * pattern, D-092 for WNBA).
 *
 * Why this exists: ESPN's site.api.espn.com/.../standings (used by /api/wnba)
 * returns only a `fullViewLink` stub — same dead feed NFL/NCAAF/NCAAB hit
 * (D-029). The real standings tree lives on the site.web.api host below.
 * Server-side fetch sidesteps that host's browser CORS.
 *
 * Tree: data.children = the two conferences (Eastern, Western) directly —
 * confirmed live 2026-08-10: no division nesting (unlike NCAAB's ~32-conference
 * tree), each conference's `standings.entries` holds all its teams flat. The
 * same recursive collector NCAAB/NCAAF use handles this correctly, it just
 * terminates one level sooner since there are no `children` under each conference.
 *
 * Usage: /api/wnbastandings?season=2026
 *        /api/wnbastandings?season=2026&debug=1   (adds _meta envelope)
 */
const BASE = 'https://site.web.api.espn.com/apis/v2/sports/basketball/wnba/standings';
const MIN_SEASON = 1997; // WNBA founding season

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
    // WNBA season is a single calendar year (Apr-Oct, confirmed live 2026-08-10
    // against the real scoreboard payload: season.year:2026 for the season in
    // progress right now) — unlike NCAAF/NCAAB's fall-spanning label, there's no
    // start-year/end-year ambiguity here. Defensive fallback for direct calls
    // without an explicit season: Jan-Mar (before the new season starts) show
    // last year's final standings; Apr-Dec show the current year (live or just
    // completed).
    const _wnbaLastSeasonNow = (d) => (d.getUTCMonth() + 1 <= 3) ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    const season = (reqSeason >= MIN_SEASON && reqSeason <= nowYear + 1)
        ? reqSeason
        : _wnbaLastSeasonNow(new Date());
    const debug = u.searchParams.get('debug') === '1';

    const target = new URL(BASE);
    target.searchParams.set('region', 'us');
    target.searchParams.set('lang', 'en');
    target.searchParams.set('contentorigin', 'espn');
    target.searchParams.set('season', String(season));
    target.searchParams.set('seasontype', '2');     // regular season
    target.searchParams.set('level', '2');          // league > conference (no division level exists for WNBA)
    target.searchParams.set('sort', 'winpercent:desc,gamesbehind:asc');

    const isPast = season < _wnbaLastSeasonNow(new Date());
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
        entriesAtGroup: groups.map(c => (c.standings?.entries || []).length),
        sampleStatNames: (() => {
            try { return groups[0].standings.entries[0].stats.map(s => s.name); } catch (_) { return null; }
        })(),
    };
    return json(JSON.stringify({ ok: true, _meta: meta, raw: parsed }), 200, ttl);
}
