/**
 * Pages Function: /api/sleeper
 * Same-origin server-side proxy for the Sleeper public read API (fantasy data).
 * Sleeper is free, public, read-only, no key, and permits app development.
 * Usage: /api/sleeper?path=/v1/players/nfl   (allowlisted read paths only)
 */
const SLEEPER = 'https://api.sleeper.app';
const ALLOWED_PATHS = /^\/v1\/(state\/nfl|players\/nfl(\/trending\/(add|drop))?)$/;

function ttlFor(path) {
    if (path.includes('/trending'))    return 1800;   // 30 min
    if (path.includes('/players/nfl')) return 43200;  // 12 h — player metadata changes slowly
    if (path.includes('/state/nfl'))   return 3600;   // 1 h
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
