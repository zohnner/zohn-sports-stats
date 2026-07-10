/**
 * Pages Function: /api/ncaafathlete  (D-044 P2)
 * Per-player NCAA college-football bio + season stat line from ESPN's core API.
 * Simpler than /api/nflplayer: NCAAF is ESPN-native end to end, so we already
 * have the ESPN athlete id (from /api/ncaafstats leaders or a team roster) and
 * fetch that athlete directly — no Sleeper->ESPN name-match bridge needed.
 *
 * Usage: /api/ncaafathlete?id=5219834&season=2025
 * Returns { found, season, id, bio:{...}, gp, groups:[{key,label,stats:[[label,val]]}] }.
 * Same-origin; no keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football';

// Output groups: ESPN split category + curated [statName, label]; shown only if primary > 0.
const GROUPS = [
    { key: 'passing', label: 'Passing', cat: 'passing', primary: 'passingYards', stats: [
        ['completions','CMP'],['passingAttempts','ATT'],['passingYards','YDS'],
        ['passingTouchdowns','TD'],['interceptions','INT'],['quarterbackRating','RTG'] ] },
    { key: 'rushing', label: 'Rushing', cat: 'rushing', primary: 'rushingAttempts', stats: [
        ['rushingAttempts','CAR'],['rushingYards','YDS'],['rushingTouchdowns','TD'],
        ['yardsPerRushAttempt','AVG'],['longRushing','LNG'] ] },
    { key: 'receiving', label: 'Receiving', cat: 'receiving', primary: 'receptions', stats: [
        ['receptions','REC'],['receivingYards','YDS'],['receivingTouchdowns','TD'],
        ['yardsPerReception','AVG'],['longReception','LNG'] ] },
    { key: 'defense', label: 'Defense', cat: 'defensive', primary: 'totalTackles', stats: [
        ['totalTackles','TOT'],['soloTackles','SOLO'],['sacks','SACK'],
        ['tacklesForLoss','TFL'],['passesDefended','PD'] ] },
];

function idFromRef(ref) { const m = /\/teams\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

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
    const id = (u.searchParams.get('id') || '').replace(/[^0-9]/g, '');
    const season = /^\d{4}$/.test(u.searchParams.get('season') || '') ? u.searchParams.get('season') : String(defaultSeason());
    if (!id) return json({ found: false, reason: 'missing id' }, 200);

    // 1) athlete bio
    let bio = null, teamId = null;
    try {
        const r = await fetch(`${CORE}/seasons/${season}/athletes/${id}?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true },
        });
        if (r.ok) {
            const a = await r.json();
            teamId = idFromRef(a.team && a.team.$ref);
            bio = {
                name: a.fullName || a.displayName || '',
                pos: (a.position && a.position.abbreviation) || '',
                jersey: a.jersey || '',
                height: a.displayHeight || '',
                weight: a.displayWeight || '',
                classYr: (a.experience && a.experience.displayValue) || '',
                headshot: (a.headshot && a.headshot.href) || '',
            };
        }
    } catch {}
    if (!bio) return json({ found: false, reason: 'athlete not found', season: Number(season) }, 200);

    // 2) team (abbr + logo) — one extra ref resolve, best-effort
    if (teamId) {
        try {
            const r = await fetch(`${CORE}/seasons/${season}/teams/${teamId}?lang=en&region=us`, {
                headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true },
            });
            if (r.ok) {
                const t = await r.json();
                bio.team = t.abbreviation || t.name || '';
                bio.teamId = teamId;
                bio.teamLogo = (t.logos && t.logos[0] && t.logos[0].href) || '';
            }
        } catch {}
    }

    // 3) season statistics
    let splits;
    try {
        const r = await fetch(`${CORE}/seasons/${season}/types/2/athletes/${id}/statistics?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 43200, cacheEverything: true },
        });
        if (r.ok) splits = (await r.json()).splits;
    } catch {}

    const cats = {};
    (splits && splits.categories || []).forEach(c => { cats[c.name] = catMap(c.stats); });
    const gp = cats.general && cats.general.gamesPlayed ? cats.general.gamesPlayed.d : null;

    const groups = [];
    for (const g of GROUPS) {
        const cm = cats[g.cat];
        if (!cm) continue;
        const prim = cm[g.primary];
        let show = !!(prim && prim.v > 0);
        const di = cats.defensiveInterceptions;
        if (g.key === 'defense') {
            // skill players pick up incidental tackles; only show Defense for real production.
            // CFB keeps INTs in a separate defensiveInterceptions category.
            show = (cm.totalTackles && cm.totalTackles.v >= 10)
                || (cm.sacks && cm.sacks.v > 0)
                || (cm.passesDefended && cm.passesDefended.v > 0)
                || (di && di.interceptions && di.interceptions.v > 0);
        }
        if (!show) continue;
        const line = g.stats.map(([n, l]) => [l, cm[n] ? cm[n].d : '—']);
        if (g.key === 'defense' && di && di.interceptions) line.push(['INT', di.interceptions.d]);
        groups.push({ key: g.key, label: g.label, stats: line });
    }

    return json({ found: groups.length > 0, season: Number(season), id, bio, gp, groups }, 200, 21600);
}
