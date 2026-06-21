/**
 * Pages Function: /api/nflathlete
 * Slim NFL athlete profile (current or retired) from ESPN, for the all-time
 * player-detail header. Career stats come from /api/nflcareer, game logs from
 * /api/nflgamelog (both keyed by the same ESPN athlete id).
 *
 * Usage: /api/nflathlete?id=10447
 * Same-origin; no keys. Profiles are near-immutable → long cache.
 */
const ATH = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes';

function json(obj, status = 200, ttl = 86400) {
    return new Response(JSON.stringify(obj), {
        status, headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400',
        }});
    }
    const u = new URL(request.url);
    const id = (u.searchParams.get('id') || '').replace(/[^0-9]/g, '');
    if (!id) return json({ found: false, reason: 'missing id' }, 200);

    let a;
    try {
        const r = await fetch(`${ATH}/${id}`, { headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true } });
        if (!r.ok) return json({ found: false, reason: 'athlete fetch failed', status: r.status }, 200);
        const j = await r.json();
        a = j.athlete || j;
    } catch { return json({ found: false, reason: 'athlete fetch failed' }, 200); }
    if (!a || !(a.fullName || a.displayName)) return json({ found: false, reason: 'no athlete' }, 200);

    const pos = a.position || {};
    const college = a.college || {};
    const status = a.status || {};
    return json({
        found: true,
        id: Number(id),
        name: a.fullName || a.displayName,
        pos: pos.abbreviation || '',
        headshot: (a.headshot && a.headshot.href) || `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,
        height: a.displayHeight || '',
        weight: a.displayWeight || '',
        college: college.name || '',
        jersey: a.jersey || '',
        debutYear: a.debutYear || null,
        age: a.age || null,
        statusType: status.type || '',          // 'active' | 'inactive'
        statusName: status.name || '',
        team: (a.team && a.team.displayName) || '',
    }, 200, 86400);
}
