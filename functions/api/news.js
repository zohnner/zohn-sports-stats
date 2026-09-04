/**
 * Pages Function: /api/news
 * Same-origin proxy for ESPN league news (NFL + MLB + NCAAF). No keys, no D1.
 * Headlines only — the client shows headline + blurb + attribution + link-out
 * (copyright-safe; never republishes full articles). D-024, NCAAF added D-125.
 *
 * Usage: /api/news?sport=nfl|mlb|ncaaf
 */
const LEAGUES = { nfl: 'football/nfl', mlb: 'baseball/mlb', ncaaf: 'football/college-football' };
// site.api.espn.com -> site.web.api.espn.com host swap -- see functions/api/nfl.js
// for the full note. This host serves both leagues' news here, so the original
// block was silently killing the MLB home headlines rail too, not just NFL --
// caught by scoping the fix site-wide instead of stopping at the reported page.
const ESPN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

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

    const target = `https://site.web.api.espn.com/apis/site/v2/sports/${lg}/news`;
    const ttl = 600; // 10 min — news refreshes often but not per-request
    let upstream;
    try {
        upstream = await fetch(target, {
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
