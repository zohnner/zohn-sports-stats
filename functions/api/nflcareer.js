/**
 * Pages Function: /api/nflcareer
 * Career year-by-year stats for one athlete, from ESPN. One upstream call returns
 * per-category (receiving/rushing/passing/defense/scoring) labels + a row per
 * season + career totals. We slim it (drop team metadata/logos/glossary) and keep
 * only categories where the player has meaningful volume.
 *
 * Usage: /api/nflcareer?id=4430878   (ESPN athlete id from /api/nflplayer)
 * Same-origin; no keys. Returns { id, categories: [{ name, displayName, labels, seasons, totals }] }.
 */
const CAREER = 'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes';

// Keep a category only if its primary stat (career total) clears this volume bar
// (drops noise like a WR's one trick-play pass or incidental tackles).
const KEEP = {
    passing:   ['passingAttempts', 25],
    rushing:   ['rushingAttempts', 20],
    receiving: ['receptions', 10],
    defensive: ['totalTackles', 20],
    scoring:   ['fieldGoals', 1],
};

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
    if (!id) return json({ found: false, reason: 'missing id' }, 200);

    let j;
    try {
        const r = await fetch(`${CAREER}/${id}/stats`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 21600, cacheEverything: true },
        });
        if (!r.ok) return json({ found: false, reason: 'career fetch failed', status: r.status }, 200);
        j = await r.json();
    } catch { return json({ found: false, reason: 'career fetch failed' }, 200); }

    const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
    const idAbbr = {};
    Object.values(j.teams || {}).forEach(t => { if (t && t.id) idAbbr[t.id] = t.abbreviation; });

    const categories = (j.categories || []).map(c => {
        const names = c.names || [];
        const keep = KEEP[c.name];
        if (keep) {
            const idx = names.indexOf(keep[0]);
            const tot = (idx >= 0 && c.totals) ? num(c.totals[idx]) : 0;
            if (tot < keep[1]) return null;
        }
        return {
            name: c.name,
            displayName: c.displayName,
            labels: c.labels || [],
            seasons: (c.statistics || []).map(st => ({
                year: st.season && st.season.year,
                team: idAbbr[st.teamId] || '',
                stats: st.stats || [],
            })),
            totals: c.totals || [],
        };
    }).filter(Boolean);

    return json({ found: categories.length > 0, id: Number(id), categories }, 200, 21600);
}
