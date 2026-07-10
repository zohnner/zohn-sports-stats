/**
 * Pages Function: /api/ncaafstats  (D-044 P2)
 * Real NCAA college-football statistical leaders from ESPN's core API.
 * Mirrors /api/nflstats: fetch the core leaders list once, resolve the top-N
 * unique athletes server-side (the leaders return athletes as $ref URLs), and
 * return a compact, ready-to-render payload — no client-side N+1, no CORS.
 *
 * CFB difference: there are 130+ FBS teams, so instead of a hardcoded id->abbr
 * map (as NFL uses) we fetch the teams list ONCE and build the map, keeping the
 * subrequest count under the Functions budget.
 *
 * Usage: /api/ncaafstats            -> default season (Aug+ = current, else last completed)
 *        /api/ncaafstats?season=2025
 * Same-origin; headshots are a.espncdn.com (already in CSP). No keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';

// Curated marquee categories (subset of what ESPN returns for CFB).
const CATS = [
    { key: 'passingYards',        label: 'Passing Yards',   unit: 'YDS' },
    { key: 'passingTouchdowns',   label: 'Passing TDs',     unit: 'TD'  },
    { key: 'rushingYards',        label: 'Rushing Yards',   unit: 'YDS' },
    { key: 'rushingTouchdowns',   label: 'Rushing TDs',     unit: 'TD'  },
    { key: 'receivingYards',      label: 'Receiving Yards', unit: 'YDS' },
    { key: 'receivingTouchdowns', label: 'Receiving TDs',   unit: 'TD'  },
    { key: 'receptions',          label: 'Receptions',      unit: 'REC' },
    { key: 'totalTackles',        label: 'Tackles',         unit: 'TOT' },
    { key: 'sacks',               label: 'Sacks',           unit: 'SCK' },
    { key: 'interceptions',       label: 'Interceptions',   unit: 'INT' },
];

function idFromRef(ref) { const m = /\/(?:athletes|teams)\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m >= 8) ? y : y - 1;  // CFB: Aug+ = current season, else last completed
}

function json(obj, status = 200, ttl = 21600) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: {
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

    const inUrl = new URL(request.url);
    const qs = inUrl.searchParams.get('season');
    const season = /^\d{4}$/.test(qs || '') ? qs : String(defaultSeason());

    // 1) leaders (athletes + teams are $refs)
    let leadersJson;
    try {
        const r = await fetch(`${CORE}/seasons/${season}/types/2/leaders?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' },
            cf: { cacheTtl: 21600, cacheEverything: true },
        });
        if (!r.ok) return json({ error: 'leaders fetch failed', status: r.status }, 502);
        leadersJson = await r.json();
    } catch { return json({ error: 'leaders fetch failed' }, 502); }

    const cats = leadersJson.categories || [];
    const wanted = CATS.map(c => ({ ...c, raw: cats.find(x => x.name === c.key) })).filter(c => c.raw);

    const needA = new Set(), needT = new Set();
    wanted.forEach(c => (c.raw.leaders || []).slice(0, 5).forEach(l => {
        const aid = idFromRef(l.athlete && l.athlete.$ref); if (aid) needA.add(aid);
        const tid = idFromRef(l.team && l.team.$ref);       if (tid) needT.add(tid);
    }));
    const aids = [...needA].slice(0, 40);

    // 2) teams map — one fetch covers every FBS team id -> {abbr, logo}
    const teamMap = {};
    try {
        const r = await fetch(`${SITE}/teams?limit=400`, {
            headers: { 'Accept': 'application/json' },
            cf: { cacheTtl: 86400, cacheEverything: true },
        });
        if (r.ok) {
            const tj = await r.json();
            const teams = (tj.sports && tj.sports[0] && tj.sports[0].leagues && tj.sports[0].leagues[0] && tj.sports[0].leagues[0].teams) || [];
            teams.forEach(w => {
                const t = w.team;
                if (t && t.id) teamMap[t.id] = { abbr: t.abbreviation || '', logo: (t.logos && t.logos[0] && t.logos[0].href) || '' };
            });
        }
    } catch {}

    // 3) resolve athletes (name, pos, headshot)
    const ath = {};
    await Promise.all(aids.map(async id => {
        try {
            const r = await fetch(`${CORE}/seasons/${season}/athletes/${id}?lang=en&region=us`, {
                headers: { 'Accept': 'application/json' },
                cf: { cacheTtl: 86400, cacheEverything: true },
            });
            if (!r.ok) return;
            const a = await r.json();
            ath[id] = {
                name: a.fullName || a.displayName || '',
                pos: (a.position && a.position.abbreviation) || '',
                headshot: (a.headshot && a.headshot.href) || '',
            };
        } catch {}
    }));

    const out = wanted.map(c => ({
        key: c.key, label: c.label, unit: c.unit,
        leaders: (c.raw.leaders || []).slice(0, 5).map(l => {
            const id = idFromRef(l.athlete && l.athlete.$ref);
            const a = id ? ath[id] : null;
            const tm = teamMap[idFromRef(l.team && l.team.$ref)] || {};
            return {
                id,
                name: (a && a.name) || '',
                pos:  (a && a.pos) || '',
                team: tm.abbr || '',
                logo: tm.logo || '',
                headshot: (a && a.headshot) || '',
                value: l.displayValue,
            };
        }).filter(x => x.name && x.id),
    })).filter(c => c.leaders.length);

    return json({ season: Number(season), categories: out }, 200, 21600);
}
