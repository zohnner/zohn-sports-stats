/**
 * Pages Function: /api/nbastats
 * Real NBA statistical leaders from ESPN's core API (sports.core.api.espn.com).
 * Clone of functions/api/wnbastats.js — the core leaders endpoint returns
 * athletes as $ref URLs; this resolves the top-N unique athletes server-side
 * and returns a compact, ready-to-render payload (no client-side N+1, no CORS).
 * Live-verified 2026-09-14: category names (pointsPerGame/reboundsPerGame/
 * assistsPerGame/stealsPerGame/blocksPerGame/fieldGoalPercentage/FreeThrowPct)
 * are identical to WNBA's — same ESPN basketball leaders resource shape.
 *
 * Usage: /api/nbastats            -> default season (auto: in-season=current, else last completed)
 *        /api/nbastats?season=2025
 * Same-origin; headshots are a.espncdn.com (already in CSP). No keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';

const CATS = [
    { key: 'pointsPerGame',      label: 'Points Per Game',   unit: 'PPG' },
    { key: 'reboundsPerGame',    label: 'Rebounds Per Game', unit: 'RPG' },
    { key: 'assistsPerGame',     label: 'Assists Per Game',  unit: 'APG' },
    { key: 'stealsPerGame',      label: 'Steals Per Game',   unit: 'SPG' },
    { key: 'blocksPerGame',      label: 'Blocks Per Game',   unit: 'BPG' },
    { key: 'fieldGoalPercentage',label: 'Field Goal %',      unit: 'FG%' },
    { key: 'FreeThrowPct',       label: 'Free Throw %',      unit: 'FT%' },
];

// ESPN NBA team id -> abbreviation (stable; confirmed live 2026-09-14 by
// extracting every team from the real /standings response, all 30 teams).
const TEAM = {
    1:'ATL', 2:'BOS', 3:'NO', 4:'CHI', 5:'CLE', 6:'DAL', 7:'DEN', 8:'DET',
    9:'GS', 10:'HOU', 11:'IND', 12:'LAC', 13:'LAL', 14:'MIA', 15:'MIL',
    16:'MIN', 17:'BKN', 18:'NY', 19:'ORL', 20:'PHI', 21:'PHX', 22:'POR',
    23:'SAC', 24:'SA', 25:'OKC', 26:'UTAH', 27:'WSH', 28:'TOR', 29:'MEM', 30:'CHA',
};

function idFromRef(ref) { const m = /\/(?:athletes|teams)\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

// NBA labels a season by its END year (see functions/api/nbastandings.js) —
// mirrors NBA_LAST_SEASON in js/nba.js: Jul-Sep (offseason) keep showing the
// season that just ended in June; Oct-Jun show the season in progress.
function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m >= 10) ? y + 1 : y;
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
    const requestedSeason = /^\d{4}$/.test(qs || '') ? qs : String(defaultSeason());

    // Self-healing season fallback (same pattern as nflstats.js/ncaafstats.js/
    // wnbastats.js): if the computed default season has no leaders yet, fall
    // back to the prior completed season rather than 502ing. Only falls back
    // when the requested season is the routine computed default — an explicit
    // ask for a specific other year still fails honestly.
    let leadersJson, season = requestedSeason;
    const fetchLeaders = async (s) => {
        const r = await fetch(`${CORE}/seasons/${s}/types/2/leaders?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' },
            cf: { cacheTtl: 21600, cacheEverything: true },
        });
        if (!r.ok) throw new Error('status ' + r.status);
        return r.json();
    };
    try {
        leadersJson = await fetchLeaders(season);
    } catch (e1) {
        if (qs && Number(qs) !== defaultSeason()) return json({ error: 'leaders fetch failed', detail: e1.message }, 502);
        const fallback = String(Number(season) - 1);
        try {
            leadersJson = await fetchLeaders(fallback);
            season = fallback;
        } catch (e2) {
            return json({ error: 'leaders fetch failed', detail: `${season}: ${e1.message}; ${fallback}: ${e2.message}` }, 502);
        }
    }

    const cats = leadersJson.categories || [];
    const wanted = CATS.map(c => ({ ...c, raw: cats.find(x => x.name === c.key) })).filter(c => c.raw);

    // Collect unique athlete ids across the top 5 of each category (cap for subrequest budget).
    const need = new Set();
    wanted.forEach(c => (c.raw.leaders || []).slice(0, 5).forEach(l => {
        const id = idFromRef(l.athlete && l.athlete.$ref); if (id) need.add(id);
    }));
    const ids = [...need].slice(0, 35);

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
                headshot: (a.headshot && a.headshot.href) || `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png`,
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
                headshot: (a && a.headshot) || (id ? `https://a.espncdn.com/i/headshots/nba/players/full/${id}.png` : ''),
                value: l.displayValue,
            };
        }).filter(x => x.name),
    })).filter(c => c.leaders.length);

    return json({ season: Number(season), categories: out }, 200, 21600);
}
