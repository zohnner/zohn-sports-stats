/**
 * Pages Function: /api/nflstandings
 * NFL standings, current OR any past season back to 2002 (the current 8-division,
 * 32-team structure). Same-origin, no keys, no D1.
 *
 * Why this exists: ESPN's site.api.espn.com/.../standings (used by /api/nfl) now
 * returns only a `fullViewLink` — it's dead. The real standings tree lives on the
 * site.web.api host below, which also accepts a `season` param. Server-side fetch
 * sidesteps that host's browser CORS.
 *
 * Usage: /api/nflstandings?season=2024            (level 3 = conference > division)
 *        /api/nflstandings?season=2024&debug=1    (adds _meta envelope)
 *
 * Past seasons are immutable -> long edge cache; the live season -> short.
 */
const BASE = 'https://site.web.api.espn.com/apis/v2/sports/football/nfl/standings';
const MIN_SEASON = 2002;

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
    const season = (reqSeason >= MIN_SEASON && reqSeason <= nowYear) ? reqSeason : (new Date().getUTCMonth() + 1 >= 9 ? nowYear : nowYear - 1);
    const level = /^[1-3]$/.test(u.searchParams.get('level') || '') ? u.searchParams.get('level') : '3';
    const debug = u.searchParams.get('debug') === '1';

    const target = new URL(BASE);
    target.searchParams.set('region', 'us');
    target.searchParams.set('lang', 'en');
    target.searchParams.set('contentorigin', 'espn');
    target.searchParams.set('season', String(season));
    target.searchParams.set('seasontype', '2');     // regular season
    target.searchParams.set('level', level);
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

    if (!debug) {
        // pass the raw ESPN tree straight through; the client parses it.
        return json(text, 200, ttl);
    }

    // debug: wrap with a small envelope describing what came back
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) { /* leave null */ }
    const confs = (parsed && parsed.children) || [];
    const meta = {
        url: target.toString(), season, level, ttl,
        topKeys: parsed ? Object.keys(parsed).slice(0, 12) : null,
        confCount: confs.length,
        confNames: confs.map(c => c.abbreviation || c.name),
        divPerConf: confs.map(c => (c.children || []).length),
        sampleStatNames: (() => {
            try { return confs[0].children[0].standings.entries[0].stats.map(s => s.name); } catch (_) { return null; }
        })(),
        sampleTeam: (() => {
            try { return confs[0].children[0].standings.entries[0].team.displayName; } catch (_) { return null; }
        })(),
    };
    return json(JSON.stringify({ ok: true, _meta: meta, raw: parsed }), 200, ttl);
}
