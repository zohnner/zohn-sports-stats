/**
 * Pages Function: /api/nfl
 * Same-origin server-side proxy for the ESPN NFL public API.
 * Fixes ESPN's browser CORS on /teams and /leaders and keeps the frontend
 * same-origin (no third-party connect-src needed). No API keys, no D1 binding.
 *
 * Usage: /api/nfl?path=/scoreboard  (extra query params are forwarded)
 * Only an allowlisted set of ESPN NFL paths is permitted (no open proxy).
 */
// 2026-08-07/08: site.api.espn.com started returning an Akamai "Access Denied"
// 403 to every path (teams/scoreboard/standings/news) with no other change on
// our side -- caught live the day before preseason kicked off, when the scores
// page showed the offseason banner instead of Thu Aug 6 CAR@ARI.
//
// First fix attempt was a browser-realistic User-Agent header (kept below,
// harmless) -- didn't clear it. Live-verified via Chrome (real browser network
// path, not this Function's egress) that site.api.espn.com itself works fine
// for a normal client; the block is specific to Cloudflare's egress IP range
// hitting THAT host, not a UA/bot-signature check. sports.core.api.espn.com
// (nflstats.js) was never blocked, which pointed at a host-specific WAF rule
// rather than a blanket Cloudflare ban -- and live-checking (again via Chrome,
// direct navigation, no CORS) confirmed site.web.api.espn.com serves the exact
// same /apis/site/v2/sports/... path family with byte-identical response shape
// (scoreboard, teams, news, roster all checked) -- it's a second edge for the
// same API, not a different one. Switched the upstream host here; every path
// this file already builds against ESPN_NFL is unchanged.
const ESPN_NFL = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl';
const ALLOWED_PATHS = /^\/(teams|scoreboard|standings|leaders|news|summary)\/?$|^\/teams\/[A-Za-z]{2,4}\/schedule\/?$/;
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function ttlFor(path) {
    if (path.startsWith('/scoreboard')) return 60;    // live scores
    if (path.startsWith('/summary'))    return 20;    // live game detail
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
    // Cloudflare's cf.cacheTtl eviction is best-effort, not a hard guarantee.
    // Live-debugging 2026-08-14 (DECISIONS.md D-095) caught a real
    // /scoreboard response served well past its nominal 60s TTL during three
    // live preseason games -- the site showed a frozen score/clock while
    // ESPN's own scoreboard had moved on by several minutes of game time.
    // Salting the upstream cache key with a TTL-aligned time bucket forces
    // Cloudflare to treat each TTL window as a genuinely distinct cached
    // resource, instead of trusting best-effort eviction of a stale one.
    // ESPN ignores unrecognized query params (confirmed live), so this is
    // safe to append unconditionally.
    target.searchParams.set('_cb', String(Math.floor(Date.now() / 1000 / ttl)));

    let upstream;
    try {
        upstream = await fetch(target.toString(), {
            headers: { 'Accept': 'application/json', 'User-Agent': ESPN_UA },
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
