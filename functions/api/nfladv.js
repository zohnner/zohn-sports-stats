/**
 * Pages Function: /api/nfladv
 * NFL Next Gen Stats ("advanced metrics") for one player + season, from nflverse
 * (CC-BY-4.0, open data). Fetches the small per-season/per-type NGS gzip, gunzips
 * and parses it, matches the player by normalized name (+team), and computes
 * league percentile ranks among qualified players (Savant-style 0-100 bars).
 *
 * Usage: /api/nfladv?name=Jaxon%20Smith-Njigba&team=SEA&pos=WR&season=2025
 * NGS data exists from 2016 on. Same-origin; no keys. Attribution: nflverse.
 */
const NGS_BASE = 'https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats';

// Per-type curated metrics: [csvColumn, label, unit, direction] (hi = higher better, lo = lower better, neutral)
const METRICS = {
    receiving: {
        qualCol: 'targets', qualMin: 25,
        rows: [
            ['avg_separation', 'Avg Separation', 'yd', 'hi'],
            ['avg_yac_above_expectation', 'YAC Over Expected', 'yd', 'hi'],
            ['avg_intended_air_yards', 'Avg Depth of Target', 'yd', 'neutral'],
            ['percent_share_of_intended_air_yards', 'Air Yards Share', '%', 'hi'],
            ['avg_cushion', 'Avg Cushion', 'yd', 'neutral'],
            ['catch_percentage', 'Catch %', '%', 'hi'],
            ['avg_yac', 'Avg YAC', 'yd', 'hi'],
            ['avg_expected_yac', 'Expected YAC', 'yd', 'neutral'],
        ],
    },
    passing: {
        qualCol: 'attempts', qualMin: 100,
        rows: [
            ['completion_percentage_above_expectation', 'CPOE', '%', 'hi'],
            ['avg_time_to_throw', 'Time to Throw', 's', 'lo'],
            ['avg_intended_air_yards', 'Intended Air Yds', 'yd', 'neutral'],
            ['aggressiveness', 'Aggressiveness', '%', 'neutral'],
            ['avg_completed_air_yards', 'Completed Air Yds', 'yd', 'hi'],
            ['max_completed_air_distance', 'Max Air Distance', 'yd', 'hi'],
            ['passer_rating', 'Passer Rating', '', 'hi'],
            ['completion_percentage', 'Completion %', '%', 'hi'],
        ],
    },
    rushing: {
        qualCol: 'rush_attempts', qualMin: 40,
        rows: [
            ['rush_yards_over_expected_per_att', 'RYOE / Att', 'yd', 'hi'],
            ['rush_pct_over_expected', 'Rush % Over Exp', '%', 'hi'],
            ['efficiency', 'Efficiency', '', 'lo'],
            ['avg_time_to_los', 'Time to LOS', 's', 'lo'],
            ['percent_attempts_gte_eight_defenders', '8+ in Box %', '%', 'neutral'],
            ['expected_rush_yards', 'Expected Rush Yds', 'yd', 'neutral'],
            ['avg_rush_yards', 'Yards / Carry', 'yd', 'hi'],
            ['rush_yards_over_expected', 'RYOE (Total)', 'yd', 'hi'],
        ],
    },
};

function typeForPos(pos) {
    pos = (pos || '').toUpperCase();
    if (pos === 'QB') return 'passing';
    if (pos === 'RB' || pos === 'FB' || pos === 'HB') return 'rushing';
    return 'receiving';  // WR/TE default
}

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

// Minimal CSV parser (handles double-quoted fields).
function parseCSV(text) {
    const rows = [];
    let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c === '\r') { /* skip */ }
        else cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
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
    const pos  = u.searchParams.get('pos') || '';
    const season = /^\d{4}$/.test(u.searchParams.get('season') || '') ? u.searchParams.get('season') : String(defaultSeason());
    if (!name) return json({ found: false, reason: 'missing name' }, 200);
    if (Number(season) < 2016) return json({ found: false, reason: 'no NGS before 2016', season: Number(season) }, 200);

    const type = typeForPos(pos);
    const spec = METRICS[type];

    // Try the requested season, falling back to earlier seasons when the file is
    // missing (current season not yet published) or returns a partial body.
    const reqSeason = Number(season);
    let rows = null, used = null;
    for (let y = reqSeason; y >= Math.max(2016, reqSeason - 6); y--) {
        try {
            const r = await fetch(`${NGS_BASE}/ngs_${y}_${type}.csv.gz`, {
                headers: { 'Accept': 'application/octet-stream' },
                cf: { cacheTtl: 1800, cacheEverything: true },
            });
            if (!r.ok || !r.body) continue;
            const text = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
            const parsed = parseCSV(text);
            if (parsed.length > 100) { rows = parsed; used = y; break; }  // full file, not a partial
        } catch (_) { /* try the previous season */ }
    }
    if (!rows) return json({ found: false, reason: 'no NGS data available', season: reqSeason, type }, 200, 600);
    const hdr = rows[0];
    const idx = {}; hdr.forEach((h, i) => { idx[h] = i; });
    const wkCol = idx.week, nameCol = idx.player_display_name, teamCol = idx.team_abbr;
    if (nameCol == null) return json({ found: false, reason: 'no name column', _meta: { header: hdr.slice(0, 20) } }, 200);

    // Season-summary rows are week == 0.
    const season0 = rows.slice(1).filter(r => r.length > 1 && (wkCol == null || r[wkCol] === '0'));
    const num = (r, col) => { const v = parseFloat(r[idx[col]]); return isNaN(v) ? null : v; };

    // qualified pool for percentile baselines
    const qualified = season0.filter(r => { const q = num(r, spec.qualCol); return q != null && q >= spec.qualMin; });

    const target0 = norm(name);
    let hit = qualified.find(r => norm(r[nameCol]) === target0);
    if (!hit) hit = season0.find(r => norm(r[nameCol]) === target0);  // unqualified but present
    if (!hit && team) hit = season0.find(r => norm(r[nameCol]).split(' ').pop() === target0.split(' ').pop() && (teamCol == null || r[teamCol] === team));
    if (!hit) return json({ found: false, reason: 'player not in NGS', season: used, type }, 200);

    const pct = (col, dir, val) => {
        if (val == null || !qualified.length) return null;
        const vals = qualified.map(r => num(r, col)).filter(v => v != null);
        if (!vals.length) return null;
        const below = vals.filter(v => v <= val).length;
        let p = Math.round(100 * below / vals.length);
        if (dir === 'lo') p = 100 - p;
        return Math.max(1, Math.min(99, p));
    };

    const metrics = spec.rows.map(([col, label, unit, dir]) => {
        const val = num(hit, col);
        return { label, unit, dir, value: val, pct: dir === 'neutral' ? null : pct(col, dir, val) };
    }).filter(m => m.value != null);

    return json({
        found: metrics.length > 0,
        season: used,
        type,
        player: hit[nameCol],
        team: teamCol != null ? hit[teamCol] : '',
        qualifiedPlayers: qualified.length,
        metrics,
        source: 'nflverse NGS',
    }, 200, 21600);
}
