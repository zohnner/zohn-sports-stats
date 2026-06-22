/**
 * Pages Function: /api/nflfp
 * Bulk last-season NFL fantasy production from nflverse player stats (open data,
 * CC-BY). Powers value-based drafting (VORP) — D-028. Same-origin, no keys, no D1.
 *
 * Returns a fixed shape regardless of which nflverse file is found, so the client
 * value engine doesn't care about upstream naming:
 *   { found, season, count, players:[{name,pos,team,g,ppr,half,std}], source, _meta? }
 *
 * Usage: /api/nflfp?season=2025      (auto-detects latest available, falls back)
 *        /api/nflfp?season=2025&debug=1   (adds _meta: tried URLs, used, columns)
 *
 * nflverse renamed these assets over time, so we try several patterns and use the
 * first that parses. Verify availability/columns on deploy via ?debug=1.
 */
const NV = 'https://github.com/nflverse/nflverse-data/releases/download';

function candidates(season) {
    return [
        `${NV}/player_stats/stats_player_reg_${season}.csv.gz`,
        `${NV}/player_stats/player_stats_${season}.csv.gz`,
        `${NV}/player_stats/stats_player_week_${season}.csv.gz`,
        `${NV}/stats_player/stats_player_reg_${season}.csv.gz`,
    ];
}

function defaultSeason() {
    const d = new Date();
    const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    return (m >= 9) ? y : y - 1;  // in-season = current, else last completed
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

// flexible column pick — nflverse naming has drifted across versions
function picker(idx) {
    return (...names) => { for (const n of names) if (idx[n] != null) return idx[n]; return -1; };
}

export async function onRequest(context) {
    const { request } = context;
    if (request.method === 'OPTIONS') {
        return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' } });
    }
    const u = new URL(request.url);
    const debug = u.searchParams.get('debug') === '1';
    const reqSeason = /^\d{4}$/.test(u.searchParams.get('season') || '') ? Number(u.searchParams.get('season')) : defaultSeason();

    const tried = [];
    let rows = null, used = null, usedUrl = null;
    for (let y = reqSeason; y >= reqSeason - 6 && !rows; y--) {
        for (const url of candidates(y)) {
            tried.push(url);
            try {
                const r = await fetch(url, { headers: { 'Accept': 'application/octet-stream' }, cf: { cacheTtl: 21600, cacheEverything: true } });
                if (!r.ok || !r.body) continue;
                const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
                const parsed = parseCSV(text);
                if (parsed.length > 50) { rows = parsed; used = y; usedUrl = url; break; }
            } catch (_) { /* next */ }
        }
    }
    if (!rows) return json({ found: false, reason: 'no nflverse player stats found', season: reqSeason, ...(debug ? { _meta: { tried } } : {}) }, 200, 600);

    const hdr = rows[0]; const idx = {}; hdr.forEach((h, i) => { idx[h.trim()] = i; });
    const col = picker(idx);
    const cName = col('player_display_name', 'player_name', 'full_name');
    const cPos  = col('position', 'pos', 'position_group');
    const cTeam = col('recent_team', 'team', 'team_abbr');
    const cWeek = col('week');
    const cPassYd = col('passing_yards'), cPassTD = col('passing_tds', 'pass_touchdowns');
    const cInt = col('passing_interceptions', 'interceptions');
    const cRushYd = col('rushing_yards'), cRushTD = col('rushing_tds', 'rush_touchdowns');
    const cRec = col('receptions'), cRecYd = col('receiving_yards'), cRecTD = col('receiving_tds', 'rec_touchdowns');
    const cFumL = col('fumbles_lost'), cSackFumL = col('sack_fumbles_lost'), cRushFumL = col('rushing_fumbles_lost'), cRecFumL = col('receiving_fumbles_lost');
    const c2pt = col('passing_2pt_conversions');

    if (cName < 0) return json({ found: false, reason: 'no name column', ...(debug ? { _meta: { usedUrl, header: hdr.slice(0, 40) } } : {}) }, 200);

    const num = (r, c) => { if (c < 0) return 0; const v = parseFloat(r[c]); return isNaN(v) ? 0 : v; };
    const agg = {};  // by name|pos
    for (let i = 1; i < rows.length; i++) {
        const r = rows[i]; if (r.length <= cName || !r[cName]) continue;
        const pos = (cPos >= 0 ? r[cPos] : '').toUpperCase();
        if (!['QB', 'RB', 'WR', 'TE'].includes(pos)) continue;
        const key = r[cName] + '|' + pos;
        const a = agg[key] || (agg[key] = { name: r[cName], pos, team: cTeam >= 0 ? r[cTeam] : '', g: 0, std: 0, ppr: 0, half: 0 });
        if (cTeam >= 0 && r[cTeam]) a.team = r[cTeam];
        const fumL = num(r, cFumL) || (num(r, cSackFumL) + num(r, cRushFumL) + num(r, cRecFumL));
        const base = num(r, cPassYd) * 0.04 + num(r, cPassTD) * 4 - num(r, cInt) * 2
            + num(r, cRushYd) * 0.1 + num(r, cRushTD) * 6
            + num(r, cRecYd) * 0.1 + num(r, cRecTD) * 6
            - fumL * 2 + num(r, c2pt) * 2;
        const rec = num(r, cRec);
        a.std  += base;
        a.half += base + rec * 0.5;
        a.ppr  += base + rec * 1;
        // weekly file → count games; season file → one row per player (g stays 0, fixed below)
        if (cWeek >= 0) a.g += 1;
    }
    let players = Object.values(agg);
    const weekly = cWeek >= 0;
    if (!weekly) players.forEach(p => { p.g = 17; });   // season-totals file: assume full slate for PPG
    players = players
        .map(p => ({ name: p.name, pos: p.pos, team: p.team || 'FA', g: p.g || 1,
                     ppr: Math.round(p.ppr * 10) / 10, half: Math.round(p.half * 10) / 10, std: Math.round(p.std * 10) / 10 }))
        .filter(p => p.ppr > 0)
        .sort((a, b) => b.ppr - a.ppr)
        .slice(0, 400);

    return json({
        found: players.length > 0, season: used, count: players.length, weekly, players, source: 'nflverse',
        ...(debug ? { _meta: { usedUrl, columns: hdr, scoredRows: rows.length - 1 } } : {}),
    }, 200, 21600);
}
