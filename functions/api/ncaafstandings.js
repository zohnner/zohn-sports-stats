/**
 * Pages Function: /api/ncaafstandings
 * NCAA college-football standings, current OR any past season back to 2003.
 * Same-origin, no keys, no D1. Clone of /api/nflstandings (D-042).
 *
 * Why this exists: ESPN's site.api.espn.com/.../standings (used by /api/ncaaf)
 * returns only a `fullViewLink` stub — same dead feed as NFL (D-029). The real
 * standings tree lives on the site.web.api host below and accepts a `season`
 * param. Server-side fetch sidesteps that host's browser CORS.
 *
 * Tree: data.children = conferences (SEC, Big Ten, ...); each conference has
 * either standings.entries directly OR children = divisions with entries.
 *
 * Usage: /api/ncaafstandings?season=2025
 *        /api/ncaafstandings?season=2025&debug=1   (adds _meta envelope)
 */
const BASE = 'https://site.web.api.espn.com/apis/v2/sports/football/college-football/standings';
const MIN_SEASON = 2003;

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
    const season = (reqSeason >= MIN_SEASON && reqSeason <= nowYear)
        ? reqSeason
        : (new Date().getUTCMonth() + 1 >= 8 ? nowYear : nowYear - 1);
    const debug = u.searchParams.get('debug') === '1';

    const target = new URL(BASE);
    target.searchParams.set('region', 'us');
    target.searchParams.set('lang', 'en');
    target.searchParams.set('contentorigin', 'espn');
    target.searchParams.set('season', String(season));
    target.searchParams.set('seasontype', '2');     // regular season
    target.searchParams.set('level', '3');          // group > conference > (division)
    target.searchParams.set('sort', 'winpercent:desc,gamesbehind:asc');

    const isPast = season < nowYear;
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
