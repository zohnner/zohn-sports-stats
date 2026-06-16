/**
 * Pages Function: /api/nflstats
 * Real NFL statistical leaders from ESPN's core API (sports.core.api.espn.com).
 * The core leaders endpoint returns athletes as $ref URLs; this function fetches
 * the leaders list once, then resolves the top-N unique athletes server-side and
 * returns a compact, ready-to-render payload (no client-side N+1, no CORS).
 *
 * Usage: /api/nflstats            -> default season (auto: in-season=current, else last completed)
 *        /api/nflstats?season=2024
 * Same-origin; headshots are a.espncdn.com (already in CSP). No keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

// Curated, fantasy-forward categories (subset of what ESPN returns).
const CATS = [
    { key: 'passingYards',        label: 'Passing Yards',   unit: 'YDS' },
    { key: 'passingTouchdowns',   label: 'Passing TDs',     unit: 'TD'  },
    { key: 'rushingYards',        label: 'Rushing Yards',   unit: 'YDS' },
    { key: 'rushingTouchdowns',   label: 'Rushing TDs',     unit: 'TD'  },
    { key: 'receivingYards',      label: 'Receiving Yards', unit: 'YDS' },
    { key: 'receivingTouchdowns', label: 'Receiving TDs',   unit: 'TD'  },
    { key: 'receptions',          label: 'Receptions',      unit: 'REC' },
    { key: 'sacks',               label: 'Sacks',           unit: 'SCK' },
    { key: 'interceptions',       label: 'Interceptions',   unit: 'INT' },
];

// ESPN NFL team id -> abbreviation (stable).
const TEAM = {
    1:'ATL',2:'BUF',3:'CHI',4:'CIN',5:'CLE',6:'DAL',7:'DEN',8:'DET',9:'GB',10:'TEN',
    11:'IND',12:'KC',13:'LV',14:'LAR',15:'MIA',16:'MIN',17:'NE',18:'NO',19:'NYG',20:'NYJ',
    21:'PHI',22:'ARI',23:'PIT',24:'LAC',25:'SF',26:'SEA',27:'TB',28:'WSH',29:'CAR',30:'JAX',
    33:'BAL',34:'HOU',
};

function idFromRef(ref) { const m = /\/(?:athletes|teams)\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m >= 9) ? y : y - 1;  // Sep+ = current season; Jan–Aug = last completed
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

    // Collect unique athlete ids across the top 5 of each category (cap for subrequest budget).
    const need = new Set();
    wanted.forEach(c => (c.raw.leaders || []).slice(0, 5).forEach(l => {
        const id = idFromRef(l.athlete && l.athlete.$ref); if (id) need.add(id);
    }));
    const ids = [...need].slice(0, 45);

    const ath = {};
    await Promise.all(ids.map(async id => {
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
                headshot: (a.headshot && a.headshot.href) || `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,
            };
        } catch {}
    }));

    const out = wanted.map(c => ({
        key: c.key, label: c.label, unit: c.unit,
        leaders: (c.raw.leaders || []).slice(0, 5).map(l => {
            const id = idFromRef(l.athlete && l.athlete.$ref);
            const a = id ? ath[id] : null;
            const teamId = idFromRef(l.team && l.team.$ref);
            return {
                id,
                name: (a && a.name) || '',
                pos:  (a && a.pos) || '',
                team: TEAM[teamId] || '',
                headshot: (a && a.headshot) || (id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : ''),
                value: l.displayValue,
            };
        }).filter(x => x.name),
    })).filter(c => c.leaders.length);

    return json({ season: Number(season), categories: out }, 200, 21600);
}
