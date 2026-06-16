/**
 * Pages Function: /api/nflplayer
 * Per-player NFL season stat line from ESPN, bridged from a Sleeper player.
 * Sleeper's espn_id only covers ~1/3 of players, so instead we fetch the
 * player's *team* roster (ESPN, inline ids+names), match by normalized name to
 * get the ESPN athlete id, then fetch that athlete's season statistics.
 * Two upstream subrequests, both cf-cached. Near-100% coverage for rostered players.
 *
 * Usage: /api/nflplayer?name=Jaxon%20Smith-Njigba&team=SEA&season=2025
 * Same-origin; no keys, no D1. Returns { found, season, name, gp, groups:[...] }.
 */
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';

// Sleeper team abbr -> ESPN team id.
const TEAM_ID = {
    ATL:1, BUF:2, CHI:3, CIN:4, CLE:5, DAL:6, DEN:7, DET:8, GB:9, TEN:10,
    IND:11, KC:12, LV:13, LAR:14, MIA:15, MIN:16, NE:17, NO:18, NYG:19, NYJ:20,
    PHI:21, ARI:22, PIT:23, LAC:24, SF:25, SEA:26, TB:27, WAS:28, CAR:29, JAX:30,
    BAL:33, HOU:34, OAK:13, WSH:28,
};

// Output groups: ESPN category + curated [statName, label]; shown only if primary > 0.
const GROUPS = [
    { key: 'passing', label: 'Passing', cat: 'passing', primary: 'passingYards', stats: [
        ['completions','CMP'],['passingAttempts','ATT'],['passingYards','YDS'],
        ['passingTouchdowns','TD'],['interceptions','INT'],['quarterbackRating','RTG'] ] },
    { key: 'rushing', label: 'Rushing', cat: 'rushing', primary: 'rushingAttempts', stats: [
        ['rushingAttempts','CAR'],['rushingYards','YDS'],['rushingTouchdowns','TD'],
        ['yardsPerRushAttempt','AVG'],['longRushing','LNG'] ] },
    { key: 'receiving', label: 'Receiving', cat: 'receiving', primary: 'receptions', stats: [
        ['receptions','REC'],['receivingTargets','TGT'],['receivingYards','YDS'],
        ['receivingTouchdowns','TD'],['yardsPerReception','AVG'],['longReception','LNG'] ] },
    { key: 'defense', label: 'Defense', cat: 'defensive', primary: 'totalTackles', stats: [
        ['totalTackles','TOT'],['soloTackles','SOLO'],['sacks','SACK'],
        ['tacklesForLoss','TFL'],['passesDefended','PD'],['QBHits','QBH'] ] },
    { key: 'kicking', label: 'Kicking', cat: 'scoring', primary: 'fieldGoals', stats: [
        ['fieldGoals','FG'],['kickExtraPointsMade','XP'],['totalPoints','PTS'] ] },
];

function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z ]/g, ' ').replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
        .replace(/\s+/g, ' ').trim();
}

function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m >= 9) ? y : y - 1;
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

function flattenRoster(data) {
    const out = [];
    for (const grp of (data.athletes || [])) {
        if (Array.isArray(grp.items)) out.push(...grp.items);
        else if (grp.id) out.push(grp);
    }
    return out;
}

function catMap(stats) {
    const m = {};
    (stats || []).forEach(s => { m[s.name] = { d: s.displayValue, v: s.value }; });
    return m;
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: {
            'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400',
        }});
    }

    const u = new URL(request.url);
    const name = u.searchParams.get('name') || '';
    const team = (u.searchParams.get('team') || '').toUpperCase();
    const season = /^\d{4}$/.test(u.searchParams.get('season') || '') ? u.searchParams.get('season') : String(defaultSeason());
    const teamId = TEAM_ID[team];
    if (!name || !teamId) return json({ found: false, reason: 'missing name/team' }, 200);

    // 1) team roster -> athlete id by name
    let athleteId = null, espnName = name;
    try {
        const r = await fetch(`${SITE}/teams/${teamId}/roster`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true },
        });
        if (r.ok) {
            const roster = flattenRoster(await r.json());
            const target = norm(name);
            let hit = roster.find(a => norm(a.fullName || a.displayName) === target);
            if (!hit) hit = roster.find(a => norm(a.displayName) === target);
            if (hit) { athleteId = hit.id; espnName = hit.fullName || hit.displayName; }
        }
    } catch {}
    if (!athleteId) return json({ found: false, reason: 'not on roster', season: Number(season) }, 200);

    // 2) athlete season statistics
    let splits;
    try {
        const r = await fetch(`${CORE}/seasons/${season}/types/2/athletes/${athleteId}/statistics?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 43200, cacheEverything: true },
        });
        if (!r.ok) return json({ found: false, reason: 'no stats', season: Number(season) }, 200);
        const sj = await r.json();
        splits = sj.splits;
    } catch { return json({ found: false, reason: 'stats fetch failed', season: Number(season) }, 200); }

    const cats = {};
    (splits && splits.categories || []).forEach(c => { cats[c.name] = catMap(c.stats); });

    const gp = cats.general && cats.general.gamesPlayed ? cats.general.gamesPlayed.d : null;

    const groups = [];
    for (const g of GROUPS) {
        const cm = cats[g.cat];
        if (!cm) continue;
        const prim = cm[g.primary];
        if (!prim || !(prim.v > 0)) continue;
        const line = g.stats.map(([n, l]) => [l, cm[n] ? cm[n].d : '—']);
        if (g.key === 'defense' && cats.defensiveInterceptions && cats.defensiveInterceptions.interceptions) {
            line.push(['INT', cats.defensiveInterceptions.interceptions.d]);
        }
        groups.push({ key: g.key, label: g.label, stats: line });
    }

    return json({ found: groups.length > 0, season: Number(season), name: espnName, gp, groups }, 200, 21600);
}
