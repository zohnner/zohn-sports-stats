/**
 * Pages Function: /api/nflsearch
 * NFL athlete search (current + retired) via ESPN's public search, filtered to the
 * NFL league (uid tag ~l:28~). Powers all-time player lookup. Cache by query.
 *
 * Usage: /api/nflsearch?q=calvin%20johnson
 * Same-origin; no keys. Returns { results: [{ id, name, team, headshot }] }.
 */
const SEARCH = 'https://site.web.api.espn.com/apis/search/v2';

function json(obj, status = 200, ttl = 3600) {
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
    const q = (u.searchParams.get('q') || '').trim();
    if (q.length < 2) return json({ results: [] }, 200, 60);

    let j;
    try {
        const r = await fetch(`${SEARCH}?region=us&lang=en&limit=12&query=${encodeURIComponent(q)}`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 3600, cacheEverything: true },
        });
        if (!r.ok) return json({ results: [], reason: 'search failed' }, 200, 60);
        j = await r.json();
    } catch { return json({ results: [], reason: 'search failed' }, 200, 60); }

    const out = [];
    for (const group of (j.results || [])) {
        if (group.type !== 'player') continue;
        for (const it of (group.contents || [])) {
            const uid = it.uid || '';
            if (!uid.includes('~l:28~')) continue;          // NFL league only
            const m = /~a:(\d+)/.exec(uid);
            if (!m) continue;
            out.push({
                id: m[1],
                name: it.displayName || '',
                team: it.subtitle || '',
                headshot: (it.image && it.image.default) || `https://a.espncdn.com/i/headshots/nfl/players/full/${m[1]}.png`,
            });
            if (out.length >= 10) break;
        }
    }
    return json({ results: out }, 200, 3600);
}
