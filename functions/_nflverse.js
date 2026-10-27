// nflverse fallback for the NFL edge templates (D-180).
//
// ESPN blocks requests from Cloudflare (D-176), so /nfl/standings, /nfl/leaders
// and /nfl/team/* lost their server render. Each template still tries ESPN first
// and only lands here when that fails, so the pages return to ESPN on their own
// if the block lifts. nflverse is CC-BY-4.0 open data on GitHub releases (not a
// relay of ESPN); /api/nflfp already reads it from Cloudflare in production.
// Callers must render NFLVERSE_CREDIT wherever this data appears.

const NV = 'https://github.com/nflverse/nflverse-data/releases/download';
export const NFLVERSE_CREDIT = '<p>Data: <a href="https://github.com/nflverse">nflverse</a> (CC-BY 4.0).</p>';

// nflverse -> ESPN abbreviations (the ones /nfl/team/:abbr URLs use).
const TO_ESPN = { LA: 'LAR', WAS: 'WSH' };
const espnAbbr = a => TO_ESPN[a] || a;

// Mirrors /api/nflstandings and /api/nflstats: Sep+ = current season, else the last completed one.
export function nflverseSeason(now = new Date()) {
    const y = now.getUTCFullYear();
    return now.getUTCMonth() + 1 >= 9 ? y : y - 1;
}

export function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
        else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else if (c !== '\r') cur += c;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows;
}

function toObjects(rows) {
    const [hdr, ...body] = rows;
    return body.filter(r => r.length === hdr.length).map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i]])));
}

async function fetchText(path, ttl) {
    const r = await fetch(`${NV}/${path}`, { cf: { cacheTtl: ttl, cacheEverything: true } });
    if (!r.ok || !r.body) throw new Error(`nflverse ${path}: ${r.status}`);
    return new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).text();
}

// games.csv holds every season since 1999 (~2 MB); keep only this season's lines
// before parsing so the CPU cost tracks one season, not the whole file.
async function seasonGames(season) {
    const text = await fetchText('schedules/games.csv.gz', 3600);
    const nl = text.indexOf('\n');
    const prefix = `${season}_`;
    const lines = text.slice(nl + 1).split('\n').filter(l => l.startsWith(prefix));
    return toObjects(parseCSV(text.slice(0, nl + 1) + lines.join('\n')));
}

async function teamMeta() {
    return toObjects(parseCSV(await fetchText('teams/teams_colors_logos.csv.gz', 86400)));
}

// Pure: regular-season results -> per-team record. Exported for tests.
export function computeRecords(games) {
    const rec = {};
    const get = a => (rec[a] = rec[a] || { w: 0, l: 0, t: 0, pf: 0, pa: 0 });
    for (const g of games) {
        if (g.game_type !== 'REG') continue;
        const home = get(g.home_team), away = get(g.away_team);
        if (g.home_score === '' || g.away_score === '') continue;
        const hs = +g.home_score, as = +g.away_score;
        home.pf += hs; home.pa += as; away.pf += as; away.pa += hs;
        if (hs > as) { home.w++; away.l++; } else if (as > hs) { away.w++; home.l++; } else { home.t++; away.t++; }
    }
    return rec;
}

const recordText = r => `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
const winPct = r => (r.w + r.l + r.t) ? (r.w + r.t / 2) / (r.w + r.l + r.t) : 0;

// Pure: same {name, teams:[{name, abbr, record}]} sections the ESPN collector produces.
// Ordered by win% then point differential -- no tiebreakers or playoff seeds.
export function buildStandingsSections(games, teams) {
    const rec = computeRecords(games);
    const byDiv = {};
    for (const t of teams) {
        if (!rec[t.team_abbr] || !t.team_division) continue;
        (byDiv[t.team_division] = byDiv[t.team_division] || []).push({ name: t.team_name, abbr: espnAbbr(t.team_abbr), r: rec[t.team_abbr] });
    }
    return Object.keys(byDiv).sort().map(div => ({
        name: div,
        teams: byDiv[div]
            .sort((a, b) => winPct(b.r) - winPct(a.r) || (b.r.pf - b.r.pa) - (a.r.pf - a.r.pa))
            .map(t => ({ name: t.name, abbr: t.abbr, record: recordText(t.r) })),
    }));
}

export async function nflverseStandings(season = nflverseSeason()) {
    const [games, teams] = await Promise.all([seasonGames(season), teamMeta()]);
    return buildStandingsSections(games, teams);
}

// Same keys/labels/units as /api/nflstats, so the template renders either source identically.
const LEADER_CATS = [
    { key: 'passingYards',        col: 'passing_yards',     label: 'Passing Yards',   unit: 'YDS' },
    { key: 'passingTouchdowns',   col: 'passing_tds',       label: 'Passing TDs',     unit: 'TD'  },
    { key: 'rushingYards',        col: 'rushing_yards',     label: 'Rushing Yards',   unit: 'YDS' },
    { key: 'rushingTouchdowns',   col: 'rushing_tds',       label: 'Rushing TDs',     unit: 'TD'  },
    { key: 'receivingYards',      col: 'receiving_yards',   label: 'Receiving Yards', unit: 'YDS' },
    { key: 'receivingTouchdowns', col: 'receiving_tds',     label: 'Receiving TDs',   unit: 'TD'  },
    { key: 'receptions',          col: 'receptions',        label: 'Receptions',      unit: 'REC' },
    { key: 'sacks',               col: 'def_sacks',         label: 'Sacks',           unit: 'SCK' },
    { key: 'interceptions',       col: 'def_interceptions', label: 'Interceptions',   unit: 'INT' },
];

// Pure: season player rows -> /api/nflstats-shaped categories. Exported for tests.
export function buildLeaderCategories(players) {
    // Rows with no player_id are unattributed team aggregates (one reported games=79).
    const real = players.filter(p => p.player_id && p.season_type === 'REG');
    return LEADER_CATS.map(c => ({
        key: c.key, label: c.label, unit: c.unit,
        leaders: real
            .filter(p => +p[c.col] > 0)
            .sort((a, b) => +b[c.col] - +a[c.col])
            .slice(0, 5)
            .map(p => ({
                name: p.player_display_name || p.player_name,
                team: espnAbbr(p.recent_team),
                value: Number(p[c.col]).toLocaleString('en-US'),
            })),
    })).filter(c => c.leaders.length);
}

export async function nflverseLeaders(season = nflverseSeason()) {
    const players = toObjects(parseCSV(await fetchText(`stats_player/stats_player_reg_${season}.csv.gz`, 3600)));
    return { season, categories: buildLeaderCategories(players) };
}

// Current franchises as [{abbreviation (ESPN), displayName}] -- the fields the team template reads.
export async function nflverseTeams(season = nflverseSeason()) {
    const [games, teams] = await Promise.all([seasonGames(season), teamMeta()]);
    const active = new Set(games.flatMap(g => [g.home_team, g.away_team]));
    return teams.filter(t => active.has(t.team_abbr))
        .map(t => ({ abbreviation: espnAbbr(t.team_abbr), displayName: t.team_name }));
}
