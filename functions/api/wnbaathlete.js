/**
 * Pages Function: /api/wnbaathlete  (D-092 follow-up)
 * Per-player WNBA bio + season stat line from ESPN's core API.
 * Clone of functions/api/ncaafathlete.js — WNBA is ESPN-native end to end, so
 * we already have the ESPN athlete id (from /api/wnbastats leaders) and fetch
 * that athlete directly — no name-match bridge needed.
 *
 * Usage: /api/wnbaathlete?id=4433402&season=2026
 * Returns { found, season, id, bio:{...}, gp, groups:[{key,label,stats:[[label,val]]}] }.
 * Same-origin; no keys, no D1.
 */
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba';

// Output groups: ESPN split category + curated [statName, label]; shown only if primary > 0.
const GROUPS = [
    { key: 'offensive', label: 'Offense', cat: 'offensive', primary: 'points', stats: [
        ['avgPoints','PPG'],['fieldGoalPct','FG%'],['threePointFieldGoalPct','3P%'],
        ['freeThrowPct','FT%'],['avgAssists','APG'],['avgTurnovers','TOPG'] ] },
    { key: 'defensive', label: 'Defense & Rebounding', cat: 'defensive', primary: 'totalRebounds', stats: [
        ['avgRebounds','RPG'],['avgDefensiveRebounds','DRPG'],['avgSteals','SPG'],['avgBlocks','BPG'] ] },
    { key: 'general', label: 'General', cat: 'general', primary: 'gamesPlayed', stats: [
        ['gamesPlayed','GP'],['gamesStarted','GS'],['avgMinutes','MPG'],['doubleDouble','DD2'] ] },
];

function idFromRef(ref) { const m = /\/teams\/(\d+)/.exec(ref || ''); return m ? m[1] : null; }

// Single calendar-year season — see js/wnba.js's WNBA_LAST_SEASON for the same split.
function defaultSeason() {
    const now = new Date();
    const y = now.getUTCFullYear(), m = now.getUTCMonth() + 1;
    return (m <= 3) ? y - 1 : y;
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
                exp: (a.experience && Number.isFinite(a.experience.years)) ? `${a.experience.years} yr${a.experience.years === 1 ? '' : 's'}` : '',
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

    // 3) season statistics — same self-healing fallback pattern as ncaafathlete.js:
    // only falls back to last season when `season` is the routine computed
    // default, never overrides an explicit ?season= request. Deliberately does
    // NOT touch bio/team above (roster-level resource populates before games do,
    // so the *current* team should show even if we fall back to last season's stats).
    let statsSeason = season;
    const fetchStats = async (s) => {
        const r = await fetch(`${CORE}/seasons/${s}/types/2/athletes/${id}/statistics?lang=en&region=us`, {
            headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 43200, cacheEverything: true },
        });
        if (!r.ok) return null;
        return (await r.json()).splits;
    };
    let splits = null;
    try { splits = await fetchStats(season); } catch {}
    if ((!splits || !(splits.categories || []).length) && Number(season) === defaultSeason()) {
        const fallback = String(Number(season) - 1);
        try {
            const fbSplits = await fetchStats(fallback);
            if (fbSplits && (fbSplits.categories || []).length) { splits = fbSplits; statsSeason = fallback; }
        } catch {}
    }

    const cats = {};
    (splits && splits.categories || []).forEach(c => { cats[c.name] = catMap(c.stats); });
    const gp = cats.general && cats.general.gamesPlayed ? cats.general.gamesPlayed.d : null;

    const groups = [];
    for (const g of GROUPS) {
        const cm = cats[g.cat];
        if (!cm) continue;
        const prim = cm[g.primary];
        const show = !!(prim && prim.v > 0);
        if (!show) continue;
        const line = g.stats.map(([n, l]) => [l, cm[n] ? cm[n].d : '—']);
        const raw = {};
        g.stats.forEach(([n]) => { if (cm[n] && typeof cm[n].v === 'number') raw[n] = cm[n].v; });
        groups.push({ key: g.key, label: g.label, stats: line, raw });
    }

    return json({ found: groups.length > 0, season: Number(statsSeason), id, bio, gp, groups }, 200, 21600);
}
