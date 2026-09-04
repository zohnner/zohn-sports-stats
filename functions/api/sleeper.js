/**
 * Pages Function: /api/sleeper
 * Same-origin server-side proxy for the Sleeper public read API (fantasy data).
 * Sleeper is free, public, read-only, no key, and permits app development.
 * Usage: /api/sleeper?path=/v1/players/nfl   (allowlisted read paths only)
 */
const SLEEPER = 'https://api.sleeper.app';
// D-065: added the four read-only League Import paths (user lookup, user's leagues,
// a league's rosters, a league's members) alongside the original state/players paths.
// All four are documented public/read-only at docs.sleeper.com -- no token, no write
// surface -- same posture as the existing paths, just a wider allowlist of GETs.
// Phase 2 competitor-feature pass: added league/{id}/matchups/{week} for the
// NFL landing page's signed-in "Your Matchup" module -- same posture as every
// other path here (public, read-only, documented at docs.sleeper.com, no token).
const ALLOWED_PATHS = /^\/v1\/(state\/nfl|players\/nfl(\/trending\/(add|drop))?|user\/[A-Za-z0-9_]+|user\/[0-9]+\/leagues\/nfl\/[0-9]{4}|league\/[0-9]+|league\/[0-9]+\/rosters|league\/[0-9]+\/users|league\/[0-9]+\/matchups\/[0-9]+)$/;

function ttlFor(path) {
    if (path.includes('/trending'))     return 1800;   // 30 min
    if (path.includes('/players/nfl'))  return 43200;  // 12 h — player metadata changes slowly
    if (path.includes('/state/nfl'))    return 3600;   // 1 h
    if (/\/matchups\/[0-9]+$/.test(path)) return 300;  // 5 min — live scoring during games
    if (/\/rosters$|\/users$/.test(path)) return 300;  // 5 min — rosters change in-season (waivers/trades)
    if (path.includes('/leagues/nfl/')) return 3600;   // 1 h — a user's league list rarely changes
    if (/^\/v1\/user\//.test(path))     return 3600;   // 1 h — username -> user_id lookup
    if (/^\/v1\/league\/[0-9]+$/.test(path)) return 1800; // 30 min — league settings/name/avatar
    return 600;
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400',
        }});
    }
    const inUrl = new URL(request.url);
    const path  = inUrl.searchParams.get('path') || '/v1/state/nfl';
    if (!ALLOWED_PATHS.test(path)) {
        return new Response(JSON.stringify({ error: 'path not allowed' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }
    const target = new URL(SLEEPER + path);
    inUrl.searchParams.forEach((v, k) => { if (k !== 'path') target.searchParams.set(k, v); });

    const ttl = ttlFor(path);
    let upstream;
    try {
        upstream = await fetch(target.toString(), { headers: { 'Accept': 'application/json' }, cf: { cacheTtl: ttl, cacheEverything: true } });
    } catch {
        return new Response(JSON.stringify({ error: 'upstream fetch failed' }), {
            status: 502, headers: { 'Content-Type': 'application/json' },
        });
    }
    const body = await upstream.text();
    return new Response(body, {
        status: upstream.status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}
