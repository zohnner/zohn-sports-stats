/**
 * Pages Function: /api/wnbastats
 * Real WNBA statistical leaders from ESPN's core API (sports.core.api.espn.com).
 * Clone of functions/api/nflstats.js/ncaafstats.js — the core leaders endpoint
 * returns athletes as $ref URLs; this resolves the top-N unique athletes
 * server-side and returns a compact, ready-to-render payload (no client-side
 * N+1, no CORS). Live-verified 2026-08-10 (D-092 follow-up): real, populated
 * per-game-average categories exist (PPG/RPG/APG/SPG/BPG/FG%/FT%) — no
 * poll/ranking exists for a pro league, but per-player stat leaders are a
 * different, viable feature (same distinction MLB/NFL/NCAAF Leaders tabs make).
 *
 * Usage: /api/wnbastats            -> default season (auto: in-season=current, else last completed)
 *        /api/wnbastats?season=2025
 * Same-origin; headshots are a.espncdn.com (already in CSP). No keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba';

// Curated categories — ESPN's WNBA leaders resource is per-game-average based
// (not counting-stat based like NFL's), matching how ESPN itself presents
// basketball leaders.
const CATS = [
    { key: 'pointsPerGame',      label: 'Points Per Game',   unit: 'PPG' },
    { key: 'reboundsPerGame',    label: 'Rebounds Per Game', unit: 'RPG' },
    { key: 'assistsPerGame',     label: 'Assists Per Game',  unit: 'APG' },
    { key: 'stealsPerGame',      label: 'Steals Per Game',   unit: 'SPG' },
    { key: 'blocksPerGame',      label: 'Blocks Per Game',   unit: 'BPG' },
    { key: 'fieldGoalPercentage',label: 'Field Goal %',      unit: 'FG%' },
    { key: 'FreeThrowPct',       label: 'Free Throw %',      unit: 'FT%' },
];

// ESPN WNBA team id -> abbreviation (stable; confirmed live 2026-08-10, 15 teams
// incl. both 2025/2026 expansion franchises).
const TEAM = {
    20:'ATL', 19:'CHI', 18:'CON', 3:'DAL', 129689:'GS', 5:'IND', 17:'LV', 6:'LA',
    8:'MIN', 9:'NY', 11:'PHX', 132052:'POR', 14:'SEA', 131935:'TOR', 16:'WSH',
};

function idFromRef(ref) { const m = /\/(?:athletes|teams)\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

// Single calendar-year season (unlike NFL/NCAAF's fall-spanning label) — mirrors
// WNBA_LAST_SEASON in js/wnba.js: Jan-Mar show last year's completed season,
// Apr-Dec show the current year (live or just completed).
function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m <= 3) ? y - 1 : y;
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

    // Self-healing season fallback (same pattern as nflstats.js/ncaafstats.js):
    // if the computed default season has no leaders yet (e.g. very early April
    // before enough games are played for per-game averages to populate), fall
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
                headshot: (a.headshot && a.headshot.href) || `https://a.espncdn.com/i/headshots/wnba/players/full/${id}.png`,
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
                headshot: (a && a.headshot) || (id ? `https://a.espncdn.com/i/headshots/wnba/players/full/${id}.png` : ''),
                value: l.displayValue,
            };
        }).filter(x => x.name),
    })).filter(c => c.leaders.length);

    return json({ season: Number(season), categories: out }, 200, 21600);
}
