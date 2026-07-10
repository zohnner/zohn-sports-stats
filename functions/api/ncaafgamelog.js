/**
 * Pages Function: /api/ncaafgamelog  (D-044 follow-on)
 * Per-game NCAA college-football stat log for one athlete + season, from ESPN.
 * Identical shape to /api/nflgamelog (labels/names + seasonTypes[].categories[].
 * events[] joined to the events metadata map) — only the host differs.
 *
 * Usage: /api/ncaafgamelog?id=5219834&season=2025   (id = ESPN athlete id)
 * Same-origin; no keys. Returns { found, season, columns:[{label,name,full}], games:[...] }.
 */
const GAMELOG = 'https://site.web.api.espn.com/apis/common/v3/sports/football/college-football/athletes';

function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m >= 8) ? y : y - 1;
}

function json(obj, status = 200, ttl = 21600) {
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
    const season = /^\d{4}$/.test(u.searchParams.get('season') || '') ? u.searchParams.get('season') : String(defaultSeason());
    if (!id) return json({ found: false, reason: 'missing id' }, 200);

    let g;
    try {
        const r = await fetch(`${GAMELOG}/${id}/gamelog?season=${season}`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 43200, cacheEverything: true },
        });
        if (!r.ok) return json({ found: false, reason: 'gamelog fetch failed', status: r.status }, 200);
        g = await r.json();
    } catch { return json({ found: false, reason: 'gamelog fetch failed' }, 200); }

    const labels = g.labels || [];
    const names  = g.names  || [];
    const displayNames = g.displayNames || [];
    const eventsMap = g.events || {};
    const columns = labels.map((l, i) => ({ label: l, name: names[i] || '', full: displayNames[i] || l }));

    const games = [];
    for (const st of (g.seasonTypes || [])) {
        const isPost = /post|bowl|playoff/i.test(st.displayName || '');
        for (const cat of (st.categories || [])) {
            for (const ev of (cat.events || [])) {
                const id2  = ev.eventId || ev.id;
                const meta = eventsMap[id2] || {};
                if (!Array.isArray(ev.stats) || !ev.stats.length) continue;
                games.push({
                    wk:    meta.week != null ? meta.week : null,
                    post:  isPost || undefined,
                    opp:   (meta.opponent && meta.opponent.abbreviation) || '',
                    atVs:  meta.atVs || '',
                    res:   meta.gameResult || '',
                    score: meta.score || '',
                    date:  meta.gameDate || '',
                    stats: ev.stats,
                });
            }
        }
    }
    games.sort((a, b) => (a.date && b.date) ? (a.date < b.date ? -1 : 1) : 0);

    return json({ found: games.length > 0, season: Number(season), columns, games }, 200, 21600);
}
