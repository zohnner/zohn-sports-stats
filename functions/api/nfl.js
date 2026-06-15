/**
 * Pages Function: /api/nfl
 * Same-origin server-side proxy for the ESPN NFL public API.
 * Fixes ESPN's browser CORS on /teams and /leaders and keeps the frontend
 * same-origin (no third-party connect-src needed). No API keys, no D1 binding.
 *
 * Usage: /api/nfl?path=/scoreboard  (extra query params are forwarded)
 * Only an allowlisted set of ESPN NFL paths is permitted (no open proxy).
 */
const ESPN_NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const ALLOWED_PATHS = /^\/(teams|scoreboard|standings|leaders|news)\/?$/;

function ttlFor(path) {
    if (path.startsWith('/scoreboard')) return 60;    // live scores
    if (path.startsWith('/standings'))  return 1800;  // 30 min
    if (path.startsWith('/teams'))      return 3600;  // 1 hr
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
    const path  = inUrl.searchParams.get('path') || '/scoreboard';
    if (!ALLOWED_PATHS.test(path)) {
        return new Response(JSON.stringify({ error: 'path not allowed' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }

    const target = new URL(ESPN_NFL + path);
    inUrl.searchParams.forEach((v, k) => { if (k !== 'path') target.searchParams.set(k, v); });

    const ttl = ttlFor(path);
    let upstream;
    try {
        upstream = await fetch(target.toString(), {
            headers: { 'Accept': 'application/json' },
            cf: { cacheTtl: ttl, cacheEverything: true },
        });
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
