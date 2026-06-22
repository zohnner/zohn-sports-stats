/**
 * Pages Function: /api/news
 * Same-origin proxy for ESPN league news (NFL + MLB). No keys, no D1.
 * Headlines only — the client shows headline + blurb + attribution + link-out
 * (copyright-safe; never republishes full articles). D-024.
 *
 * Usage: /api/news?sport=nfl|mlb
 */
const LEAGUES = { nfl: 'football/nfl', mlb: 'baseball/mlb' };

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400',
        }});
    }

    const u = new URL(request.url);
    const sport = (u.searchParams.get('sport') || 'nfl').toLowerCase();
    const lg = LEAGUES[sport];
    if (!lg) {
        return new Response(JSON.stringify({ error: 'sport not allowed' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });
    }

    const target = `https://site.api.espn.com/apis/site/v2/sports/${lg}/news`;
    const ttl = 600; // 10 min — news refreshes often but not per-request
    let upstream;
    try {
        upstream = await fetch(target, {
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
