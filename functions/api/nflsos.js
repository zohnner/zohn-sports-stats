/**
 * Pages Function: /api/nflsos
 * Fantasy Strength of Schedule — D-028. Same-origin, no keys, no D1.
 *
 * Two open sources, joined server-side so the client just renders:
 *   1. Defense difficulty — fantasy points allowed PER GAME to each position
 *      (QB/RB/WR/TE), computed from nflverse WEEKLY player stats for the prior
 *      completed season (CC-BY). Each player-week's points are charged to that
 *      player's `opponent_team` defense.
 *   2. Schedule — every team's opponents, week by week, from the ESPN scoreboard
 *      for the upcoming season (weeks 1-18).
 *
 * For each team we average its opponents' points-allowed across the full season
 * and across the fantasy-playoff weeks (15-17), then rank 1-32 per position
 * (rank 1 = easiest schedule = opponents give up the most). The model is fully
 * transparent: raw per-game values ship alongside the ranks.
 *
 * Usage: /api/nflsos                 (auto: schedule=current draft season, defense=prior)
 *        /api/nflsos?season=2026
 *        /api/nflsos?debug=1         (adds _meta: source files, columns, coverage)
 *
 * Returns:
 *   { ok, season, defSeason, weeks, playoffWeeks:[15,16,17],
 *     league:{ perGame:{QB,RB,WR,TE,ALL} },
 *     teams:[{ team, bye, games, playoffGames,
 *              full:{ QB:{v,rank}, RB, WR, TE, ALL },
 *              post:{ QB:{v,rank}, RB, WR, TE, ALL } }],
 *     source, _meta? }
 */
const NV = 'https://github.com/nflverse/nflverse-data/releases/download';
const ESPN_NFL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const POS = ['QB', 'RB', 'WR', 'TE'];
const PLAYOFF_WEEKS = [15, 16, 17];
const REG_WEEKS = 18;

// nflverse weekly file has drifted in name; try the known patterns.
function weeklyCandidates(season) {
    return [
        `${NV}/player_stats/stats_player_week_${season}.csv.gz`,
        `${NV}/player_stats/player_stats_${season}.csv.gz`,
        `${NV}/stats_player/stats_player_week_${season}.csv.gz`,
    ];
}

// ESPN / legacy abbreviations -> nflverse canonical.
const ABBR = { WSH: 'WAS', OAK: 'LV', SD: 'LAC', STL: 'LAR', LA: 'LAR', JAC: 'JAX', ARZ: 'ARI', LAR: 'LAR' };
const canon = (a) => ABBR[(a || '').toUpperCase()] || (a || '').toUpperCase();

function defaultSeason() {
    // Schedule/draft season: from March on, the upcoming season; Jan-Feb still the one just played.
    const d = new Date();
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    return (m >= 3) ? y : y - 1;
}

function json(obj, status = 200, ttl = 43200) {
    return new Response(JSON.stringify(obj), {
        status, headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': `public, max-age=${ttl}`,
            'Access-Control-Allow-Origin': '*',
        },
    });
}

function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

function picker(idx) {
    return (...names) => { for (const n of names) if (idx[n] != null) return idx[n]; return -1; };
}

// Defense points allowed per game to each position, from the prior-season weekly file.
async function buildDefense(defSeason, debug) {
    const tried = [];
    let rows = null, usedUrl = null;
    for (const url of weeklyCandidates(defSeason)) {
        tried.push(url);
        try {
            const r = await fetch(url, { headers: { 'Accept': 'application/octet-stream' }, cf: { cacheTtl: 86400, cacheEverything: true } });
            if (!r.ok || !r.body) continue;
            const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
            const parsed = parseCSV(text);
            if (parsed.length > 50) { rows = parsed; usedUrl = url; break; }
        } catch (_) { /* next */ }
    }
    if (!rows) return { ok: false, reason: 'no nflverse weekly file', tried };

    const hdr = rows[0]; const idx = {}; hdr.forEach((h, i) => { idx[h.trim()] = i; });
    const col = picker(idx);
    const cPos = col('position', 'pos', 'position_group');
    const cOpp = col('opponent_team', 'opponent', 'opp');
    const cWeek = col('week');
    const cType = col('season_type', 'game_type');
    if (cPos < 0 || cOpp < 0) return { ok: false, reason: 'missing position/opponent columns', usedUrl, header: hdr.slice(0, 40) };

    const cPassYd = col('passing_yards'), cPassTD = col('passing_tds', 'pass_touchdowns');
    const cInt = col('passing_interceptions', 'interceptions');
    const cRushYd = col('rushing_yards'), cRushTD = col('rushing_tds', 'rush_touchdowns');
    const cRec = col('receptions'), cRecYd = col('receiving_yards'), cRecTD = col('receiving_tds', 'rec_touchdowns');
    const cFumL = col('fumbles_lost'), cSackFumL = col('sack_fumbles_lost'), cRushFumL = col('rushing_fumbles_lost'), cRecFumL = col('receiving_fumbles_lost');
    const c2pt = col('passing_2pt_conversions');
    const num = (r, c) => { if (c < 0) return 0; const v = parseFloat(r[c]); return isNaN(v) ? 0 : v; };

    const allowed = {};            // team -> {QB,RB,WR,TE,ALL} total PPR allowed
    const defWeeks = {};           // team -> Set of weeks it played (games count)
    let scored = 0;
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (cType >= 0) { const t = (r[cType] || '').toUpperCase(); if (t && t !== 'REG' && t !== 'REG_SEASON' && t !== 'REGULAR') continue; }
        const pos = (r[cPos] || '').toUpperCase();
        if (!POS.includes(pos)) continue;
        const opp = canon(r[cOpp]);
        if (!opp) continue;
        const fumL = num(r, cFumL) || (num(r, cSackFumL) + num(r, cRushFumL) + num(r, cRecFumL));
        const ppr = num(r, cPassYd) * 0.04 + num(r, cPassTD) * 4 - num(r, cInt) * 2
            + num(r, cRushYd) * 0.1 + num(r, cRushTD) * 6
            + num(r, cRecYd) * 0.1 + num(r, cRecTD) * 6
            - fumL * 2 + num(r, c2pt) * 2 + num(r, cRec) * 1;
        const a = allowed[opp] || (allowed[opp] = { QB: 0, RB: 0, WR: 0, TE: 0, ALL: 0 });
        a[pos] += ppr; a.ALL += ppr;
        if (cWeek >= 0) { (defWeeks[opp] || (defWeeks[opp] = new Set())).add(r[cWeek]); }
        scored++;
    }

    const perGame = {};            // team -> {QB,RB,WR,TE,ALL} per game
    for (const team of Object.keys(allowed)) {
        const g = (defWeeks[team] && defWeeks[team].size) || 17;
        const a = allowed[team]; const pg = {};
        for (const k of ['QB', 'RB', 'WR', 'TE', 'ALL']) pg[k] = a[k] / g;
        pg._g = g;
        perGame[team] = pg;
    }
    return { ok: true, perGame, usedUrl, scored, teams: Object.keys(perGame).length };
}

// Every team's opponent, week by week, from the ESPN scoreboard.
async function buildSchedule(season) {
    const sched = {};              // team -> { [week]: oppAbbr }
    const fetchWeek = async (w) => {
        const url = `${ESPN_NFL}/scoreboard?seasontype=2&week=${w}&dates=${season}`;
        try {
            const r = await fetch(url, { headers: { 'Accept': 'application/json' }, cf: { cacheTtl: 86400, cacheEverything: true } });
            if (!r.ok) return;
            const j = await r.json();
            for (const ev of (j.events || [])) {
                const comp = ev.competitions && ev.competitions[0];
                const cs = (comp && comp.competitors) || [];
                if (cs.length !== 2) continue;
                const a = canon(cs[0].team && cs[0].team.abbreviation);
                const b = canon(cs[1].team && cs[1].team.abbreviation);
                if (!a || !b) continue;
                (sched[a] || (sched[a] = {}))[w] = b;
                (sched[b] || (sched[b] = {}))[w] = a;
            }
        } catch (_) { /* skip week */ }
    };
    await Promise.all(Array.from({ length: REG_WEEKS }, (_, i) => fetchWeek(i + 1)));
    return sched;
}

function rankDesc(teams, getVal) {
    // rank 1 = highest value (easiest matchup = most points allowed)
    const order = teams.slice().sort((x, y) => getVal(y) - getVal(x));
    const rank = {};
    order.forEach((t, i) => { rank[t.team] = i + 1; });
    return rank;
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    }
    const u = new URL(request.url);
    const debug = u.searchParams.get('debug') === '1';
    const season = /^\d{4}$/.test(u.searchParams.get('season') || '') ? Number(u.searchParams.get('season')) : defaultSeason();
    const defSeason = season - 1;

    const [def, sched] = await Promise.all([buildDefense(defSeason, debug), buildSchedule(season)]);
    if (!def.ok) return json({ ok: false, reason: def.reason, season, defSeason, ...(debug ? { _meta: def } : {}) }, 200, 600);
    if (!Object.keys(sched).length) return json({ ok: false, reason: 'no schedule for season', season, defSeason }, 200, 600);

    const pg = def.perGame;
    const teamList = Object.keys(sched).sort();

    const teams = teamList.map((team) => {
        const weeksMap = sched[team] || {};
        const playedWeeks = Object.keys(weeksMap).map(Number);
        const allWeeks = [];
        for (let w = 1; w <= REG_WEEKS; w++) allWeeks.push(w);
        const bye = allWeeks.find(w => !weeksMap[w]) || null;

        const opp = allWeeks.map(w => weeksMap[w] || null); // null = bye
        const avg = (weeks) => {
            const acc = { QB: 0, RB: 0, WR: 0, TE: 0, ALL: 0 }; let n = 0;
            for (const w of weeks) {
                const o = weeksMap[w]; if (!o) continue;
                const d = pg[o]; if (!d) continue;
                for (const k of ['QB', 'RB', 'WR', 'TE', 'ALL']) acc[k] += d[k];
                n++;
            }
            if (!n) return null;
            const r = {}; for (const k of ['QB', 'RB', 'WR', 'TE', 'ALL']) r[k] = acc[k] / n; r._n = n;
            return r;
        };
        return { team, bye, opp, _full: avg(allWeeks), _post: avg(PLAYOFF_WEEKS) };
    });

    // rank per position for full season and playoff window
    const pack = (teams, key) => {
        const out = {};
        for (const pos of ['QB', 'RB', 'WR', 'TE', 'ALL']) {
            const valid = teams.filter(t => t[key]);
            const rk = rankDesc(valid, t => t[key][pos]);
            out[pos] = rk;
        }
        return out;
    };
    const rFull = pack(teams, '_full');
    const rPost = pack(teams, '_post');

    const round1 = (x) => Math.round(x * 10) / 10;
    const shaped = teams.map(t => {
        const cell = (avgObj, rankObj) => {
            const c = {};
            for (const pos of ['QB', 'RB', 'WR', 'TE', 'ALL']) {
                c[pos] = avgObj ? { v: round1(avgObj[pos]), rank: rankObj[pos][t.team] || null } : { v: null, rank: null };
            }
            return c;
        };
        return {
            team: t.team, bye: t.bye,
            games: t._full ? t._full._n : 0,
            playoffGames: t._post ? t._post._n : 0,
            full: cell(t._full, rFull),
            post: cell(t._post, rPost),
        };
    });

    // league per-game baseline (median-ish via mean of defenses)
    const league = { perGame: { QB: 0, RB: 0, WR: 0, TE: 0, ALL: 0 } };
    const dteams = Object.keys(pg);
    for (const k of ['QB', 'RB', 'WR', 'TE', 'ALL']) {
        league.perGame[k] = round1(dteams.reduce((s, d) => s + pg[d][k], 0) / (dteams.length || 1));
    }

    return json({
        ok: true, season, defSeason, weeks: REG_WEEKS, playoffWeeks: PLAYOFF_WEEKS,
        league, teams: shaped, source: 'nflverse + ESPN',
        ...(debug ? { _meta: { defUsedUrl: def.usedUrl, defScoredRows: def.scored, defTeams: def.teams, schedTeams: teamList.length } } : {}),
    }, 200, 43200);
}
