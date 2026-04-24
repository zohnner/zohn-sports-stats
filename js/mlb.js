// ============================================================
// MLB — players, teams, games, leaderboards
// Official MLB Stats API: https://statsapi.mlb.com/api/v1
// ============================================================

let MLB_SEASON = new Date().getMonth() >= 2 && new Date().getMonth() <= 9  // Mar–Oct = current season
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;   // Nov–Feb = previous completed season

// ── Team colours ─────────────────────────────────────────────
// Keys use the abbreviation returned by the MLB Stats API.
// Alternate spellings (BBREF/Fangraphs style) are aliased below the main table.
const _MLB_COLORS_BASE = {
    // American League East
    'BAL': { primary: '#DF4601', secondary: '#000000' },
    'BOS': { primary: '#BD3039', secondary: '#0C2340' },
    'NYY': { primary: '#132448', secondary: '#C4CED3' },
    'TB':  { primary: '#092C5C', secondary: '#8FBCE6' },
    'TOR': { primary: '#134A8E', secondary: '#E8291C' },
    // American League Central
    'CWS': { primary: '#27251F', secondary: '#C4CED3' },
    'CLE': { primary: '#00385D', secondary: '#E50022' },
    'DET': { primary: '#0C2C56', secondary: '#FA4616' },
    'KC':  { primary: '#004687', secondary: '#C09A5B' },
    'MIN': { primary: '#002B5C', secondary: '#D31145' },
    // American League West
    'HOU': { primary: '#002D62', secondary: '#EB6E1F' },
    'LAA': { primary: '#BA0021', secondary: '#003263' },
    'ATH': { primary: '#003831', secondary: '#EFB21E' },   // Athletics (Sacramento/Las Vegas 2025)
    'SEA': { primary: '#0C2C56', secondary: '#005C5C' },
    'TEX': { primary: '#003278', secondary: '#C0111F' },
    // National League East
    'ATL': { primary: '#CE1141', secondary: '#13274F' },
    'MIA': { primary: '#00A3E0', secondary: '#EF3340' },
    'NYM': { primary: '#002D72', secondary: '#FF5910' },
    'PHI': { primary: '#E81828', secondary: '#002D72' },
    'WSH': { primary: '#AB0003', secondary: '#14225A' },
    // National League Central
    'CHC': { primary: '#0E3386', secondary: '#CC3433' },
    'CIN': { primary: '#C6011F', secondary: '#000000' },
    'MIL': { primary: '#12284B', secondary: '#FFC52F' },
    'PIT': { primary: '#27251F', secondary: '#FDB827' },
    'STL': { primary: '#C41E3A', secondary: '#FEDB00' },
    // National League West
    'ARI': { primary: '#A71930', secondary: '#E3D4AD' },
    'COL': { primary: '#33006F', secondary: '#C4CED4' },
    'LAD': { primary: '#005A9C', secondary: '#EF3E42' },
    'SD':  { primary: '#2F241D', secondary: '#FFC425' },
    'SF':  { primary: '#FD5A1E', secondary: '#27251F' },
};

// Alternate abbreviation aliases — BBREF/Fangraphs style and legacy spellings
const _MLB_ABBR_ALIASES = {
    'TBR': 'TB',   // Tampa Bay Rays
    'KCR': 'KC',   // Kansas City Royals
    'CHW': 'CWS',  // Chicago White Sox
    'SDP': 'SD',   // San Diego Padres
    'SFG': 'SF',   // San Francisco Giants
    'OAK': 'ATH',  // Oakland / Athletics legacy
    'WSN': 'WSH',  // Washington Nationals (ESPN abbr)
    'AZ':  'ARI',  // Arizona Diamondbacks (ESPN abbr)
};

const MLB_TEAM_COLORS = new Proxy(_MLB_COLORS_BASE, {
    get(target, abbr) {
        if (typeof abbr !== 'string') return undefined;
        return target[abbr] ?? target[_MLB_ABBR_ALIASES[abbr]] ?? undefined;
    },
});

function getMLBTeamColors(abbr) {
    const colors = abbr ? MLB_TEAM_COLORS[abbr] : null;
    if (!colors && abbr && abbr !== '???' && typeof Logger !== 'undefined') {
        Logger.debug(`Unknown MLB abbreviation: "${abbr}"`, undefined, 'MLB');
    }
    return colors || { primary: '#334155', secondary: '#64748b' };
}

// Derive a short abbreviation from a team object when the API omits it
function _mlbTeamAbbr(team) {
    if (!team) return '???';
    if (team.abbreviation) return team.abbreviation;
    // Fall back to a lookup in the already-loaded teams list
    const cached = AppState?.mlbTeams?.find(t => t.id === team.id);
    if (cached?.abbreviation) return cached.abbreviation;
    // Last resort: initials from team name words ("Kansas City Royals" → "KCR")
    return (team.name || '').split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase() || '???';
}

// ── Position matching ─────────────────────────────────────────
// Single source of truth for "does this player's position match the filter?"
// Handles OF (covers LF/CF/RF/OF) and generic P (unclassified pitcher).
const _MLB_OF_SET = new Set(['lf', 'cf', 'rf', 'of']);

function _mlbPosMatch(playerPos, filter) {
    if (!filter || filter === 'all') return true;
    const pos = (playerPos || '').toLowerCase();
    if (filter === 'of') return _MLB_OF_SET.has(pos);
    return pos === filter;
}

// Canonical position lists — single source of truth used by player page + leaderboards
const MLB_HITTING_POSITIONS  = ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'];
const MLB_PITCHING_POSITIONS = ['All', 'SP', 'RP', 'CL'];

function getMLBTeamLogoUrl(teamId) {
    return teamId ? `https://www.mlbstatic.com/team-logos/${teamId}.svg` : null;
}

function getMLBPlayerHeadshotUrl(playerId) {
    return playerId
        ? `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
        : null;
}

// ── Core fetch helper ─────────────────────────────────────────
const MLB_BASE_URL = 'https://statsapi.mlb.com/api/v1';

async function mlbFetch(endpoint, params = {}, ttl = ApiCache.TTL.MEDIUM) {
    const url = new URL(`${MLB_BASE_URL}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const cacheKey = `mlb${url.pathname}${url.search}`;

    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    Logger.debug(`MLB → ${url.pathname}${url.search}`, undefined, 'MLB');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);
    let res;
    try {
        res = await fetch(url.toString(), { signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
    if (!res.ok) throw new Error(`MLB API ${res.status}: ${res.statusText}`);

    let json;
    try {
        json = await res.json();
    } catch {
        throw new Error(`MLB API returned non-JSON response (${url.pathname})`);
    }
    ApiCache.set(cacheKey, json, ttl);
    return json;
}

const SAVANT_BASE_URL = 'https://baseballsavant.mlb.com';

// Fetch Statcast percentile data from Baseball Savant.
// Routes through the Cloudflare Worker (/savant/*) when BDL_PROXY_URL is set,
// otherwise falls back to a direct fetch (requires CORS on Savant's side).
async function fetchStatcast(playerId, type = 'batter') {
    const year    = MLB_SEASON;
    const cacheKey = `statcast_${playerId}_${type}_${year}`;
    const hit = ApiCache.get(cacheKey);
    if (hit) return hit;

    const params = new URLSearchParams({ type, year, mlbamId: playerId });
    const directUrl  = `${SAVANT_BASE_URL}/percentile-rankings?${params}`;
    const proxyUrl   = BDL_PROXY_URL ? `${BDL_PROXY_URL}/savant/percentile-rankings?${params}` : null;

    const fetchUrl = proxyUrl || directUrl;
    let json;
    try {
        const res = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) throw new Error(`Savant ${res.status}`);
        json = await res.json();
    } catch (err) {
        Logger.debug(`Statcast unavailable for ${playerId}: ${err.message}`, undefined, 'MLB');
        return null;
    }

    // Savant returns an array; we want the first entry
    const data = Array.isArray(json) ? json[0] : json;
    if (!data) return null;
    ApiCache.set(cacheKey, data, ApiCache.TTL.LONG);
    return data;
}

// ── API functions ─────────────────────────────────────────────

async function fetchMLBTeams(season = MLB_SEASON) {
    const data = await mlbFetch('/teams', { sportId: 1, season }, ApiCache.TTL.LONG);
    return (data.teams || []).filter(t =>
        t.league?.name?.includes('League') && t.sport?.id === 1
    );
}

async function fetchMLBSchedule(daysBack = 7) {
    // MLB schedule dates are ET-based. toISOString() is UTC, so after ~8pm ET the
    // UTC date is already "tomorrow" — subtract 5h to anchor to the ET calendar day.
    const nowET  = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const fromET = new Date(nowET.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fmt    = d => d.toISOString().split('T')[0];
    const data   = await mlbFetch('/schedule', {
        sportId:   1,
        startDate: fmt(fromET),
        endDate:   fmt(nowET),
        hydrate:   'team',
    }, ApiCache.TTL.SHORT);
    return (data.dates || [])
        .flatMap(d => d.games || [])
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
}

async function fetchMLBLeagueStats(group = 'hitting', season = MLB_SEASON, limit = 300) {
    const sortStat = group === 'hitting' ? 'battingAverage' : 'strikeOuts';
    const data = await mlbFetch('/stats', {
        stats:      'season',
        season,
        group,
        sportId:    1,
        limit,
        sortStat,
        playerPool: 'All',
    });
    return data.stats?.[0]?.splits || [];
}

async function fetchMLBTeamSchedule(teamId, daysBack = 15) {
    const nowET  = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const fromET = new Date(nowET.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const fmt    = d => d.toISOString().split('T')[0];
    const data   = await mlbFetch('/schedule', {
        sportId:   1,
        teamId,
        startDate: fmt(fromET),
        endDate:   fmt(nowET),
        hydrate:   'team',
    }, ApiCache.TTL.SHORT);
    return (data.dates || [])
        .flatMap(d => d.games || [])
        .sort((a, b) => new Date(b.gameDate) - new Date(a.gameDate));
}

async function fetchMLBRoster(teamId, season = MLB_SEASON) {
    const data = await mlbFetch(`/teams/${teamId}/roster`, {
        rosterType: 'active',
        season,
    }, ApiCache.TTL.MEDIUM);
    const POS_ORDER = { C: 0, '1B': 1, '2B': 2, '3B': 3, SS: 4, LF: 5, CF: 6, RF: 7, DH: 8, SP: 9, RP: 10, CL: 11 };
    return (data.roster || [])
        .map(p => ({
            id:           p.person?.id,
            fullName:     p.person?.fullName || '',
            jerseyNumber: p.jerseyNumber || '',
            position:     p.position?.abbreviation || '',
            positionType: p.position?.type || '',
        }))
        .sort((a, b) => {
            const ap = POS_ORDER[a.position] ?? 20;
            const bp = POS_ORDER[b.position] ?? 20;
            return ap !== bp ? ap - bp : a.fullName.localeCompare(b.fullName);
        });
}

// ── MLB player view mode ─────────────────────────────────────
let mlbPlayerViewMode  = 'cards';
let mlbTableSortField  = 'avg';
let mlbTableSortDir    = 'desc';

function setMLBPlayerView(mode) {
    mlbPlayerViewMode = mode;
    document.getElementById('mlbCardViewBtn')?.classList.toggle('active',  mode === 'cards');
    document.getElementById('mlbTableViewBtn')?.classList.toggle('active', mode === 'table');
    displayMLBPlayers(AppState.mlbStatsGroup);
}

// ── View: Players ─────────────────────────────────────────────

async function loadMLBPlayers() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-players', null);

    // Show search bar with adjusted placeholder for MLB
    document.getElementById('searchBar')?.style.setProperty('display', 'block');
    document.getElementById('viewHeader')?.style.setProperty('display', 'none');

    const resultEl = document.getElementById('resultCount');
    if (resultEl) resultEl.textContent = 'Loading MLB players…';

    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 9 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-card-header">
                <div>
                    <div class="skeleton-line" style="width:140px;height:18px;margin-bottom:8px"></div>
                    <div class="skeleton-line" style="width:70px;height:12px"></div>
                </div>
                <div class="skeleton-line" style="width:52px;height:28px;border-radius:20px"></div>
            </div>
            <div class="skeleton-card-rows">
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
            </div>
        </div>
    `).join('');

    try {
        _renderMLBGroupToggle();

        const group  = AppState.mlbStatsGroup;
        const splits = await fetchMLBLeagueStats(group, MLB_SEASON);

        AppState.mlbPlayerStats[group] = {};
        AppState.mlbPlayers[group]     = [];

        splits.forEach(split => {
            const id = split.player?.id;
            if (!id) return;
            AppState.mlbPlayerStats[group][id] = { ...split.stat, player_id: id };
            AppState.mlbPlayers[group].push({
                id,
                fullName: split.player.fullName || '—',
                teamId:   split.team?.id,
                teamName: split.team?.name,
                teamAbbr: split.team?.abbreviation,
                position: split.position?.abbreviation,
            });
        });

        displayMLBPlayers(group);

    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBPlayers, { tag: 'MLB', title: 'Failed to Load MLB Players' });
    }
}

function _renderMLBGroupToggle() {
    if (document.getElementById('mlbGroupToggle')) return;

    const container = document.querySelector('.search-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.id = 'mlbGroupToggle';
    wrap.style.cssText = 'display:flex;gap:0.4rem;margin-top:0.875rem;flex-wrap:wrap;align-items:center;';

    ['hitting', 'pitching'].forEach(group => {
        const btn = document.createElement('button');
        btn.textContent  = group === 'hitting' ? 'Hitters' : 'Pitchers';
        btn.dataset.group = group;
        _styleMLBGroupBtn(btn, AppState.mlbStatsGroup === group);
        btn.addEventListener('click', () => {
            AppState.mlbStatsGroup    = group;
            AppState.mlbPositionFilter = 'all'; // reset position when switching groups
            _clearMLBSearch();
            mlbTableSortField = group === 'hitting' ? 'avg' : 'era';
            mlbTableSortDir   = group === 'hitting' ? 'desc' : 'asc';
            document.querySelectorAll('[data-group]').forEach(b =>
                _styleMLBGroupBtn(b, b.dataset.group === group)
            );
            // Remove existing toggles before reloading
            document.getElementById('mlbGroupToggle')?.remove();
            document.getElementById('mlbPositionRow')?.remove();
            loadMLBPlayers();
        });
        wrap.appendChild(btn);
    });

    // Separator
    const sep = document.createElement('span');
    sep.style.cssText = 'width:1px;height:20px;background:rgba(255,255,255,0.1);margin:0 0.25rem;';
    wrap.appendChild(sep);

    // View toggle buttons (card / table)
    const cardBtn = document.createElement('button');
    cardBtn.id = 'mlbCardViewBtn';
    cardBtn.title = 'Card view';
    cardBtn.textContent = '⊞';
    cardBtn.style.cssText = 'padding:0.3rem 0.6rem;border-radius:8px;cursor:pointer;font-size:1rem;font-family:inherit;border:1px solid rgba(255,255,255,0.12);transition:all 0.2s;';
    cardBtn.classList.toggle('active', mlbPlayerViewMode === 'cards');
    cardBtn.addEventListener('click', () => setMLBPlayerView('cards'));

    const tableBtn = document.createElement('button');
    tableBtn.id = 'mlbTableViewBtn';
    tableBtn.title = 'Table view';
    tableBtn.textContent = '≡';
    tableBtn.style.cssText = cardBtn.style.cssText;
    tableBtn.classList.toggle('active', mlbPlayerViewMode === 'table');
    tableBtn.addEventListener('click', () => setMLBPlayerView('table'));

    _styleMLBViewBtn(cardBtn,  mlbPlayerViewMode === 'cards');
    _styleMLBViewBtn(tableBtn, mlbPlayerViewMode === 'table');

    wrap.appendChild(cardBtn);
    wrap.appendChild(tableBtn);

    const meta = container.querySelector('.search-meta');
    container.insertBefore(wrap, meta);

    // ── Position filter row ───────────────────────────────────
    const posWrap = document.createElement('div');
    posWrap.id = 'mlbPositionRow';
    posWrap.style.cssText = 'display:flex;gap:0.3rem;margin-top:0.45rem;flex-wrap:wrap;align-items:center;';

    const HITTING_POS  = MLB_HITTING_POSITIONS;
    const PITCHING_POS = MLB_PITCHING_POSITIONS;
    const posList = AppState.mlbStatsGroup === 'hitting' ? HITTING_POS : PITCHING_POS;
    const curPlayers = AppState.mlbPlayers[AppState.mlbStatsGroup] || [];

    posList.forEach(pos => {
        const filterVal = pos.toLowerCase();
        const count     = pos === 'All'
            ? curPlayers.length
            : curPlayers.filter(p => _mlbPosMatch(p.position, filterVal)).length;
        if (pos !== 'All' && count === 0) return; // skip positions with no data yet

        const btn = document.createElement('button');
        btn.textContent      = pos;
        btn.dataset.posFilter = filterVal;
        _styleMLBPosBtn(btn, AppState.mlbPositionFilter === filterVal);
        btn.addEventListener('click', () => {
            AppState.mlbPositionFilter = filterVal;
            _clearMLBSearch();
            document.querySelectorAll('[data-pos-filter]').forEach(b =>
                _styleMLBPosBtn(b, b.dataset.posFilter === filterVal)
            );
            displayMLBPlayers(AppState.mlbStatsGroup);
        });
        posWrap.appendChild(btn);
    });

    container.insertBefore(posWrap, meta);
}

function _styleMLBViewBtn(btn, active) {
    btn.style.cssText = `
        padding:0.3rem 0.65rem;border-radius:8px;cursor:pointer;font-size:1rem;font-family:inherit;
        border:1px solid ${active ? 'rgba(16,185,129,0.6)' : 'rgba(255,255,255,0.12)'};
        background:${active ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)'};
        color:${active ? '#34d399' : '#64748b'};transition:all 0.2s;
    `;
}

function _styleMLBGroupBtn(btn, active) {
    btn.style.cssText = `
        padding:0.3rem 0.75rem;border-radius:20px;cursor:pointer;font-weight:700;
        font-size:0.8rem;transition:all 0.2s;font-family:inherit;
        border:1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.12)'};
        background:${active ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)'};
        color:${active ? '#34d399' : '#64748b'};
    `;
}

function _styleMLBPosBtn(btn, active) {
    btn.style.cssText = `
        padding:0.2rem 0.55rem;border-radius:20px;cursor:pointer;font-weight:600;
        font-size:0.72rem;transition:all 0.2s;font-family:inherit;
        border:1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.1)'};
        background:${active ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.03)'};
        color:${active ? '#818cf8' : '#475569'};
    `;
}

function displayMLBPlayers(group = AppState.mlbStatsGroup) {
    _refreshMLBPositionRow(group);
    if (mlbPlayerViewMode === 'table') {
        displayMLBPlayersTable(group);
    } else {
        displayMLBPlayerCards(group);
    }
}

// Rebuild the position filter pill row with current player counts.
// Called after player data loads so positions with >0 players appear.
function _refreshMLBPositionRow(group) {
    const existing = document.getElementById('mlbPositionRow');
    if (!existing) return; // toggle not rendered yet (non-players view)

    const HITTING_POS  = MLB_HITTING_POSITIONS;
    const PITCHING_POS = MLB_PITCHING_POSITIONS;
    const posList    = group === 'hitting' ? HITTING_POS : PITCHING_POS;
    const curPlayers = AppState.mlbPlayers[group] || [];
    const curFilter  = AppState.mlbPositionFilter;

    existing.innerHTML = '';
    posList.forEach(pos => {
        const filterVal = pos.toLowerCase();
        const count     = pos === 'All'
            ? curPlayers.length
            : curPlayers.filter(p => _mlbPosMatch(p.position, filterVal)).length;
        if (pos !== 'All' && count === 0) return;

        const btn = document.createElement('button');
        btn.textContent       = pos;
        btn.dataset.posFilter = filterVal;
        _styleMLBPosBtn(btn, curFilter === filterVal);
        btn.addEventListener('click', () => {
            AppState.mlbPositionFilter = filterVal;
            _clearMLBSearch();
            document.querySelectorAll('[data-pos-filter]').forEach(b =>
                _styleMLBPosBtn(b, b.dataset.posFilter === filterVal)
            );
            displayMLBPlayers(group);
        });
        existing.appendChild(btn);
    });
}

function displayMLBPlayerCards(group) {
    const grid    = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    const allPlayers = AppState.mlbPlayers[group] || [];
    const players    = AppState.mlbPositionFilter === 'all'
        ? allPlayers
        : allPlayers.filter(p => _mlbPosMatch(p.position, AppState.mlbPositionFilter));
    if (allPlayers.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB player data available for this season');
        return;
    }

    // Build rank map for primary stat (AVG for hitters, ERA for pitchers)
    const rankKey = group === 'hitting' ? 'avg' : 'era';
    const rankDesc = group === 'hitting'; // higher AVG = better; lower ERA = better
    const rankMap  = {};
    [...players]
        .filter(p => AppState.mlbPlayerStats[group]?.[p.id]?.[rankKey] != null)
        .sort((a, b) => {
            const av = parseFloat(AppState.mlbPlayerStats[group][a.id][rankKey]);
            const bv = parseFloat(AppState.mlbPlayerStats[group][b.id][rankKey]);
            return rankDesc ? bv - av : av - bv;
        })
        .forEach((p, i) => { rankMap[p.id] = i + 1; });

    const fragment = document.createDocumentFragment();
    players.slice(0, 100).forEach(player => {
        const stats = AppState.mlbPlayerStats[group]?.[player.id];
        fragment.appendChild(_createMLBPlayerCard(player, stats, group, rankMap[player.id]));
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);

    const el = document.getElementById('resultCount');
    if (el) el.textContent = `Showing ${Math.min(players.length, 100)} of ${players.length}${AppState.mlbPositionFilter !== 'all' ? ` ${AppState.mlbPositionFilter.toUpperCase()}` : ''} players`;
}

function displayMLBPlayersTable(group) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    const allPlayers = AppState.mlbPlayers[group] || [];
    const players    = AppState.mlbPositionFilter === 'all'
        ? allPlayers
        : allPlayers.filter(p => _mlbPosMatch(p.position, AppState.mlbPositionFilter));
    if (allPlayers.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB player data available for this season');
        return;
    }

    const HITTING_COLS = [
        { label: '#',    field: null,            cls: 'tbl-rank' },
        { label: 'Player', field: null,          cls: '' },
        { label: 'Team', field: null,            cls: '' },
        { label: 'AVG',  field: 'avg',           cls: 'tbl-stat tbl-pts' },
        { label: 'OPS',  field: 'ops',           cls: 'tbl-stat tbl-reb' },
        { label: 'HR',   field: 'homeRuns',      cls: 'tbl-stat tbl-ast' },
        { label: 'RBI',  field: 'rbi',           cls: 'tbl-stat' },
        { label: 'R',    field: 'runs',          cls: 'tbl-stat' },
        { label: 'SB',   field: 'stolenBases',   cls: 'tbl-stat' },
        { label: 'BB',   field: 'baseOnBalls',   cls: 'tbl-stat' },
        { label: 'SO',   field: 'strikeOuts',    cls: 'tbl-stat' },
        { label: 'GP',   field: 'gamesPlayed',   cls: 'tbl-stat' },
    ];

    const PITCHING_COLS = [
        { label: '#',    field: null,              cls: 'tbl-rank' },
        { label: 'Player', field: null,            cls: '' },
        { label: 'Team', field: null,              cls: '' },
        { label: 'ERA',  field: 'era',             cls: 'tbl-stat tbl-pts' },
        { label: 'WHIP', field: 'whip',            cls: 'tbl-stat tbl-reb' },
        { label: 'W',    field: 'wins',            cls: 'tbl-stat tbl-ast' },
        { label: 'L',    field: 'losses',          cls: 'tbl-stat' },
        { label: 'SO',   field: 'strikeOuts',      cls: 'tbl-stat' },
        { label: 'IP',   field: 'inningsPitched',  cls: 'tbl-stat' },
        { label: 'BB',   field: 'baseOnBalls',     cls: 'tbl-stat' },
        { label: 'SV',   field: 'saves',           cls: 'tbl-stat' },
        { label: 'GP',   field: 'gamesPlayed',     cls: 'tbl-stat' },
    ];

    const COLS = group === 'hitting' ? HITTING_COLS : PITCHING_COLS;

    const sorted = [...players].sort((a, b) => {
        const av = parseFloat(AppState.mlbPlayerStats[group]?.[a.id]?.[mlbTableSortField]) || (mlbTableSortDir === 'desc' ? -Infinity : Infinity);
        const bv = parseFloat(AppState.mlbPlayerStats[group]?.[b.id]?.[mlbTableSortField]) || (mlbTableSortDir === 'desc' ? -Infinity : Infinity);
        return mlbTableSortDir === 'desc' ? bv - av : av - bv;
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'stats-table';

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${COLS.map(col => {
        const sortable = col.field ? 'sortable' : '';
        const isActive = col.field === mlbTableSortField ? 'sort-active' : '';
        const dir      = col.field === mlbTableSortField ? (mlbTableSortDir === 'desc' ? '↓' : '↑') : '';
        const dataAttr = col.field ? `data-sort="${col.field}"` : '';
        return `<th class="${sortable} ${isActive}" ${dataAttr}>${col.label}${dir ? ` <span class="sort-arrow">${dir}</span>` : ''}</th>`;
    }).join('')}</tr>`;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    sorted.forEach((player, i) => {
        const stats = AppState.mlbPlayerStats[group]?.[player.id];
        const tr    = document.createElement('tr');
        tr.onclick  = () => showMLBPlayerDetail(player.id, group);

        const cells = COLS.map(col => {
            if (!col.field) {
                if (col.label === '#')       return `<td class="tbl-rank">${i + 1}</td>`;
                if (col.label === 'Player') {
                    const hsUrl  = getMLBPlayerHeadshotUrl(player.id);
                    const clrs   = getMLBTeamColors(player.teamAbbr);
                    const inits  = (player.fullName || '').split(' ').map(w => w[0]).slice(0, 2).join('');
                    return `<td>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${clrs.primary}cc,${clrs.primary}44);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;color:#fff;position:relative;overflow:hidden">
                                <img src="${hsUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" data-hide-on-error>
                                <span>${inits}</span>
                            </div>
                            <div>
                                <div class="tbl-player-name">${player.fullName}</div>
                                <div class="tbl-player-pos">${player.position || ''}</div>
                            </div>
                        </div>
                    </td>`;
                }
                if (col.label === 'Team')    return `<td><span class="tbl-team-badge">${player.teamAbbr || '—'}</span></td>`;
            }
            if (!stats || stats[col.field] == null) return `<td class="${col.cls}" style="color:#334155">—</td>`;
            const raw = stats[col.field];
            const num = parseFloat(raw);
            const display = isNaN(num) ? raw :
                (col.field === 'era'  || col.field === 'whip') ? num.toFixed(2) :
                (col.field === 'avg'  || col.field === 'obp'  ||
                 col.field === 'slg'  || col.field === 'ops')  ? _fmtAvg(num) :
                String(raw);
            return `<td class="${col.cls}">${display}</td>`;
        });

        tr.innerHTML = cells.join('');
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Column sort
    thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (mlbTableSortField === field) {
                mlbTableSortDir = mlbTableSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                mlbTableSortField = field;
                mlbTableSortDir   = field === 'era' || field === 'whip' || field === 'losses' ? 'asc' : 'desc';
            }
            displayMLBPlayersTable(group);
        });
    });

    wrapper.appendChild(table);
    grid.appendChild(wrapper);

    const el = document.getElementById('resultCount');
    if (el) el.textContent = `Showing ${sorted.length} of ${players.length} players`;
}

function _createMLBPlayerCard(player, stats, group, rank) {
    const card     = document.createElement('div');
    card.className = 'player-card';
    card.style.cursor = 'pointer';
    card.onclick   = () => showMLBPlayerDetail(player.id, group);

    const colors      = getMLBTeamColors(player.teamAbbr);
    // Team-color accent border at top (like NBA conference borders)
    card.style.borderTop = `3px solid ${colors.primary}cc`;

    const initials    = (player.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
    const headshotUrl = getMLBPlayerHeadshotUrl(player.id);

    const statsHtml = stats
        ? (group === 'hitting' ? `
            <div class="detail-row"><span class="detail-label">AVG</span><span class="detail-value" style="color:var(--color-pts)">${stats.avg || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">OBP</span><span class="detail-value" style="color:var(--color-reb)">${stats.obp || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SLG</span><span class="detail-value" style="color:var(--color-ast)">${stats.slg || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">OPS</span><span class="detail-value" style="color:var(--color-stl)">${stats.ops || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">HR</span><span class="detail-value" style="color:var(--color-blk)">${stats.homeRuns ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">RBI</span><span class="detail-value" style="color:var(--color-pts)">${stats.rbi ?? '—'}</span></div>
        ` : `
            <div class="detail-row"><span class="detail-label">ERA</span><span class="detail-value" style="color:var(--color-pts)">${stats.era || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">WHIP</span><span class="detail-value" style="color:var(--color-reb)">${stats.whip || '—'}</span></div>
            <div class="detail-row"><span class="detail-label">W-L</span><span class="detail-value" style="color:var(--color-ast)">${stats.wins ?? '—'}–${stats.losses ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SO</span><span class="detail-value" style="color:var(--color-stl)">${stats.strikeOuts ?? '—'}</span></div>
            <div class="detail-row"><span class="detail-label">K/9</span><span class="detail-value" style="color:var(--color-blk)">${stats.strikeoutsPer9Inn ? parseFloat(stats.strikeoutsPer9Inn).toFixed(1) : '—'}</span></div>
            <div class="detail-row"><span class="detail-label">SV</span><span class="detail-value" style="color:var(--color-pts)">${stats.saves ?? '—'}</span></div>
        `)
        : `<div class="detail-row" style="justify-content:center;color:var(--color-text-muted);font-size:0.82rem">No stats available</div>`;

    const rankLabel  = group === 'hitting' ? 'AVG' : 'ERA';
    const rankBadge  = rank != null
        ? `<span class="player-rank-badge ${rank <= 10 ? 'player-rank-badge--top' : ''}">#${rank} ${rankLabel}</span>`
        : '';

    card.innerHTML = `
        <div class="player-card-top">
            ${rankBadge}
            <div class="player-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55)">
                ${headshotUrl ? `<img class="player-headshot" src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                ${initials}
            </div>
            <div class="player-name">${player.fullName}</div>
            <div class="player-team">${player.teamAbbr ? player.teamAbbr + ' · ' : ''}${player.position || 'N/A'}</div>
        </div>
        <div class="player-details">${statsHtml}</div>
        <div class="card-cta">VIEW PROFILE →</div>
    `;

    return card;
}

// ── Phase 2: computed rate stats ─────────────────────────────

function _computeBattingRates(s) {
    const pa  = parseFloat(s.plateAppearances) || 0;
    const ab  = parseFloat(s.atBats)           || 1;
    const sf  = parseFloat(s.sacFlies)         || 0;
    const hits = parseFloat(s.hits)            || 0;
    const hr  = parseFloat(s.homeRuns)         || 0;
    const so  = parseFloat(s.strikeOuts)       || 0;
    const bb  = parseFloat(s.baseOnBalls)      || 0;
    const slg = parseFloat(s.slg);
    const avg = parseFloat(s.avg);

    const iso   = (!isNaN(slg) && !isNaN(avg)) ? _fmtAvg(slg - avg) : null;
    const babip = (hits >= 0 && hr >= 0 && so >= 0 && (ab - so - hr + sf) > 0)
        ? _fmtAvg((hits - hr) / (ab - so - hr + sf))
        : null;
    const bbPct = pa > 0 ? (bb / pa * 100).toFixed(1) : null;
    const kPct  = pa > 0 ? (so / pa * 100).toFixed(1) : null;

    return { iso, babip, bbPct, kPct, pa: pa || null };
}

function _computePitchingRates(s) {
    const ip  = parseFloat(s.inningsPitched)  || 0;
    const bf  = parseFloat(s.battersFaced)    || 1;
    const so  = parseFloat(s.strikeOuts)      || 0;
    const bb  = parseFloat(s.baseOnBalls)     || 0;
    const hr  = parseFloat(s.homeRuns)        || 0;
    const hbp = parseFloat(s.hitBatsmen)      || 0;

    const fip = ip > 0
        ? ((13 * hr + 3 * (bb + hbp) - 2 * so) / ip + 3.10).toFixed(2)
        : null;
    const kBbPct = bf > 0
        ? (((so - bb) / bf) * 100).toFixed(1)
        : null;

    return { fip, kBbPct };
}

// ── MLB formatting helpers ────────────────────────────────────

// Baseball rate stats (AVG/OBP/SLG) omit the leading zero: .315 not 0.315.
// OPS can exceed 1.000, so we only strip when the result starts with "0.".
function _fmtAvg(n) {
    return n.toFixed(3).replace(/^0\./, '.');
}

// ── MLB stat bar helpers ──────────────────────────────────────

function _mlbStatBar(label, value, max, color, fmt) {
    const num = parseFloat(value);
    if (isNaN(num) || value == null) return '';
    const pct = Math.min(100, Math.round((num / max) * 100));
    const display = fmt ? fmt(num) : num;
    return `
        <div class="shooting-stat-item">
            <div class="shooting-stat-header">
                <span style="color:var(--color-text-secondary)">${label}</span>
                <span style="color:var(--color-text-primary);font-weight:700">${display}</span>
            </div>
            <div class="shooting-stat-bar">
                <div class="shooting-stat-fill" style="width:${pct}%;background:${color}"></div>
            </div>
        </div>
    `;
}

function _mlbHittingBars(stats, rates = {}) {
    return [
        _mlbStatBar('Batting Average',   stats.avg,         0.400,  '#fbbf24', v => _fmtAvg(v)),
        _mlbStatBar('On-Base %',         stats.obp,         0.500,  '#34d399', v => _fmtAvg(v)),
        _mlbStatBar('Slugging %',        stats.slg,         0.700,  '#60a5fa', v => _fmtAvg(v)),
        _mlbStatBar('OPS',               stats.ops,         1.100,  '#a78bfa', v => _fmtAvg(v)),
        _mlbStatBar('ISO',               rates.iso,         0.400,  '#f472b6', v => v),
        _mlbStatBar('BABIP',             rates.babip,       0.400,  '#fb923c', v => v),
        _mlbStatBar('Home Runs',         stats.homeRuns,    60,     '#ef4444', v => v),
        _mlbStatBar('RBI',               stats.rbi,         140,    '#f59e0b', v => v),
        _mlbStatBar('Stolen Bases',      stats.stolenBases, 70,     '#10b981', v => v),
    ].filter(Boolean).join('');
}

function _mlbPitchingBars(stats) {
    // ERA: lower is better — invert bar (full bar = 0.00, empty = 6.00+)
    const era = parseFloat(stats.era);
    const eraBar = !isNaN(era) && stats.era != null ? `
        <div class="shooting-stat-item">
            <div class="shooting-stat-header">
                <span style="color:var(--color-text-secondary)">ERA <span style="font-size:0.7rem;color:var(--color-text-muted)">(lower = better)</span></span>
                <span style="color:var(--color-text-primary);font-weight:700">${era.toFixed(2)}</span>
            </div>
            <div class="shooting-stat-bar">
                <div class="shooting-stat-fill" style="width:${Math.min(100, Math.round(Math.max(0, (6 - era) / 6 * 100)))}%;background:#f472b6"></div>
            </div>
        </div>
    ` : '';
    const whip = parseFloat(stats.whip);
    const whipBar = !isNaN(whip) && stats.whip != null ? `
        <div class="shooting-stat-item">
            <div class="shooting-stat-header">
                <span style="color:var(--color-text-secondary)">WHIP <span style="font-size:0.7rem;color:var(--color-text-muted)">(lower = better)</span></span>
                <span style="color:var(--color-text-primary);font-weight:700">${whip.toFixed(2)}</span>
            </div>
            <div class="shooting-stat-bar">
                <div class="shooting-stat-fill" style="width:${Math.min(100, Math.round(Math.max(0, (2 - whip) / 2 * 100)))}%;background:#818cf8"></div>
            </div>
        </div>
    ` : '';
    return [
        eraBar,
        whipBar,
        _mlbStatBar('K/9',         stats.strikeoutsPer9Inn, 15,  '#fb923c', v => parseFloat(v).toFixed(1)),
        _mlbStatBar('Strikeouts',  stats.strikeOuts,    300, '#818cf8', v => v),
        _mlbStatBar('Wins',        stats.wins,          25,  '#34d399', v => v),
        _mlbStatBar('Saves',       stats.saves,         45,  '#fbbf24', v => v),
    ].filter(Boolean).join('');
}

// ── View: Player Detail ───────────────────────────────────────

function showMLBPlayerDetail(playerId, group = AppState.mlbStatsGroup) {
    const players = AppState.mlbPlayers[group] || [];
    const player  = players.find(p => p.id === playerId);
    if (!player) return;

    const grid    = document.getElementById('playersGrid');
    const stats   = AppState.mlbPlayerStats[group]?.[playerId] || {};
    const colors  = getMLBTeamColors(player.teamAbbr);
    const initials = (player.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');

    // Record in recently viewed
    if (typeof addRecent === 'function') addRecent({
        id:    player.id,
        sport: 'mlb',
        type:  'player',
        name:  player.fullName || `Player ${player.id}`,
        sub:   `${player.teamAbbr || '—'} · ${player.position || '—'}`,
        badge: 'MLB',
        action: null,
    });

    window.scrollTo({ top: 0, behavior: 'instant' });

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-players"]').forEach(t => t.classList.add('active'));

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('mlb-players', player.fullName);

    history.pushState({ view: 'mlb-player', id: playerId, group }, '', `#mlb-player-${playerId}`);

    const headshotUrl = getMLBPlayerHeadshotUrl(playerId);
    const headshotImg = headshotUrl
        ? `<img class="player-headshot player-headshot--detail" src="${headshotUrl}" alt="${player.fullName}" loading="lazy" data-hide-on-error>`
        : '';
    // Computed rate stats (Phase 2 — derived from existing API fields)
    const batting  = group === 'hitting'  ? _computeBattingRates(stats)  : null;
    const pitching = group === 'pitching' ? _computePitchingRates(stats) : null;

    const statDefs = group === 'hitting' ? [
        ['AVG',   stats.avg,          'var(--color-pts)'],
        ['OBP',   stats.obp,          'var(--color-reb)'],
        ['SLG',   stats.slg,          'var(--color-ast)'],
        ['OPS',   stats.ops,          'var(--color-stl)'],
        ['ISO',   batting?.iso,       'var(--color-blk)'],
        ['BABIP', batting?.babip,     'var(--color-pts)'],
        ['HR',    stats.homeRuns,     'var(--color-reb)'],
        ['RBI',   stats.rbi,          'var(--color-ast)'],
        ['R',     stats.runs,         'var(--color-stl)'],
        ['H',     stats.hits,         'var(--color-min)'],
        ['SB',    stats.stolenBases,  'var(--color-blk)'],
        ['BB',    stats.baseOnBalls,  '#34d399'],
        ['SO',    stats.strikeOuts,   '#64748b'],
        ['BB%',   batting?.bbPct != null ? batting.bbPct + '%' : null, '#34d399'],
        ['K%',    batting?.kPct  != null ? batting.kPct  + '%' : null, '#64748b'],
        ['PA',    batting?.pa,         '#64748b'],
        ['GP',    stats.gamesPlayed,   '#64748b'],
    ] : [
        ['ERA',  stats.era,               'var(--color-pts)'],
        ['FIP',  pitching?.fip,           'var(--color-reb)'],
        ['WHIP', stats.whip,              'var(--color-ast)'],
        ['K/9',  stats.strikeoutsPer9Inn  ? parseFloat(stats.strikeoutsPer9Inn).toFixed(1)  : null, 'var(--color-stl)'],
        ['BB/9', stats.walksPer9Inn       ? parseFloat(stats.walksPer9Inn).toFixed(1)       : null, 'var(--color-blk)'],
        ['K-BB%',pitching?.kBbPct != null ? pitching.kBbPct + '%' : null, 'var(--color-min)'],
        ['W',    stats.wins,              'var(--color-reb)'],
        ['L',    stats.losses,            '#64748b'],
        ['SO',   stats.strikeOuts,        'var(--color-ast)'],
        ['IP',   stats.inningsPitched,    'var(--color-blk)'],
        ['BB',   stats.baseOnBalls,       '#34d399'],
        ['QS',   stats.qualityStarts,     '#60a5fa'],
        ['SV',   stats.saves,             'var(--color-pts)'],
        ['HLD',  stats.holds,             'var(--color-reb)'],
        ['GS',   stats.gamesStarted,      '#64748b'],
        ['GP',   stats.gamesPlayed,        '#64748b'],
    ];

    const gl = typeof StatGlossary !== 'undefined' ? StatGlossary : null;
    const statsGrid = statDefs
        .filter(([, value]) => value != null)
        .map(([label, value, color]) => `
            <div class="stat-item">
                <div class="stat-value" style="color:${color}">${value}</div>
                <div class="stat-label">${gl ? gl.auto(label) : label}</div>
            </div>
        `).join('');

    // Stat bars for key metrics
    const barHtml = group === 'hitting' ? _mlbHittingBars(stats, batting) : _mlbPitchingBars(stats);

    // Team logo
    const teamLogo = getMLBTeamLogoUrl(player.teamId);

    grid.className  = 'player-detail-container';
    grid.innerHTML = `
        <div class="player-detail-header">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="backToMLBPlayers()" class="back-button">← Players</button>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button class="share-btn" onclick="_downloadMLBCard(${playerId},'${group}')" title="Download stat card PNG">↓ Card</button>
                    <button class="share-btn" onclick="_shareCurrentPage()" title="Copy link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share
                    </button>
                </div>
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:2.5rem;font-weight:800;
                            box-shadow:0 0 40px ${colors.primary}44">
                    ${headshotImg}${initials}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${player.fullName}</h1>
                        <span class="player-hero-pos">${player.position || 'N/A'}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.2rem">
                        ${teamLogo ? `<img src="${teamLogo}" alt="" style="width:24px;height:24px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                        ${player.teamId
                            ? `<button onclick="showMLBTeamDetail(${player.teamId})" style="background:none;border:none;padding:0;color:var(--color-text-secondary);cursor:pointer;font-size:inherit;font-family:inherit;text-decoration:underline;text-underline-offset:3px;margin:0">${player.teamName || ''}</button>`
                            : `<p class="player-detail-meta" style="color:var(--color-text-secondary);margin:0">${player.teamName || ''}</p>`}
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-muted)">
                        ${MLB_SEASON} MLB Season · ${group === 'hitting' ? 'Batting' : 'Pitching'}
                    </p>
                </div>
            </div>
        </div>

        <div class="stats-card">
            <h2 class="detail-section-title">Stat Profile</h2>
            <div style="position:relative;height:260px">
                <canvas id="mlb-player-radar"></canvas>
            </div>
        </div>

        <div class="stats-card">
            <h2 class="detail-section-title">${MLB_SEASON} ${group === 'hitting' ? 'Batting' : 'Pitching'} Stats</h2>
            <div class="stats-grid">${statsGrid}</div>
        </div>

        ${barHtml ? `
        <div class="stats-card">
            <h2 class="detail-section-title">Key Metrics</h2>
            <div class="shooting-stats-grid">${barHtml}</div>
        </div>
        ` : ''}

        <div class="stats-card" id="mlb-splits-card">
            <h2 class="detail-section-title">Splits</h2>
            <div style="height:64px;display:flex;align-items:center;justify-content:center">
                <div class="skeleton-line" style="width:100%;height:40px;border-radius:8px"></div>
            </div>
        </div>

        ${group === 'pitching' ? `
        <div class="stats-card" id="mlb-last-starts-card">
            <div style="height:36px;display:flex;align-items:center">
                <div class="skeleton-line" style="width:80%;height:20px;border-radius:6px"></div>
            </div>
        </div>
        ` : ''}

        <div class="stats-card" id="mlb-trend-card">
            <h2 class="detail-section-title">${group === 'hitting' ? 'Last 20 Games' : 'Last 8 Outings'}</h2>
            <div style="position:relative;height:220px;display:flex;align-items:center;justify-content:center">
                <div class="skeleton-line" style="width:100%;height:100%;border-radius:8px"></div>
            </div>
        </div>

        <div class="stats-card" id="mlb-statcast-card">
            <h2 class="detail-section-title">⚡ Statcast</h2>
            <div style="height:48px;display:flex;align-items:center;padding:0 0.5rem">
                <div class="skeleton-line" style="width:100%;height:28px;border-radius:6px"></div>
            </div>
        </div>

        <div class="stats-card" id="mlb-career-card">
            <h2 class="detail-section-title">Career Stats</h2>
            <div style="height:48px;display:flex;align-items:center;padding:0 0.5rem">
                <div class="skeleton-line" style="width:100%;height:28px;border-radius:6px"></div>
            </div>
        </div>

        ${_mlbCompareCard(player, group)}
    `;

    // Render radar chart immediately
    if (group === 'hitting') {
        StatsCharts.mlbRadar('mlb-player-radar', [{
            label: player.fullName,
            color: colors.primary,
            data: {
                avg:         parseFloat(stats.avg)  || 0,
                homeRuns:    stats.homeRuns          || 0,
                rbi:         stats.rbi               || 0,
                obp:         parseFloat(stats.obp)   || 0,
                slg:         parseFloat(stats.slg)   || 0,
                stolenBases: stats.stolenBases       || 0,
            },
        }], 'hitting', player.position || '');
    } else {
        StatsCharts.mlbRadar('mlb-player-radar', [{
            label: player.fullName,
            color: colors.primary,
            data: {
                era:  parseFloat(stats.era)              || 0,
                k9:   parseFloat(stats.strikeoutsPer9Inn) || 0,
                bb9:  parseFloat(stats.walksPer9Inn)      || 0,
                whip: parseFloat(stats.whip)              || 0,
                ip:   parseFloat(stats.inningsPitched)    || 0,
            },
        }], 'pitching');
    }

    // Wire compare dropdowns
    document.getElementById('mlb-cmp-select-b')?.addEventListener('change', e => _onMLBCompareChange(player, stats, group, colors));
    document.getElementById('mlb-cmp-select-c')?.addEventListener('change', e => _onMLBCompareChange(player, stats, group, colors));

    // Async: splits (hitting + pitching)
    const splitsFetcher = group === 'hitting'
        ? _fetchMLBHittingSplits(playerId)
        : _fetchMLBPitchingSplits(playerId);

    splitsFetcher.then(splits => {
        const card = document.getElementById('mlb-splits-card');
        if (!card) return;
        if (!splits || Object.keys(splits).length === 0) { card.innerHTML = ''; return; }
        card.innerHTML = `
            <h2 class="detail-section-title">Splits</h2>
            ${group === 'hitting' ? _renderMLBSplits(splits) : _renderMLBPitchingSplits(splits)}
        `;
        _initSplitsTabs(card);
    }).catch(() => {
        const card = document.getElementById('mlb-splits-card');
        if (card) card.innerHTML = '';
    });

    // Async: fetch game log → last-N-starts summary + trend chart
    _fetchMLBGameLog(playerId, group).then(logs => {
        // Last N starts card (pitchers only)
        if (group === 'pitching') {
            const startsCard = document.getElementById('mlb-last-starts-card');
            if (startsCard) {
                const html = _renderLastNStarts(logs, colors.primary);
                startsCard.innerHTML = html || '';
            }
        }

        const trendCard = document.getElementById('mlb-trend-card');
        if (!trendCard) return;

        const limit  = group === 'hitting' ? 20 : 8;
        const recent = logs.slice(-limit);

        if (recent.length < 2) { trendCard.innerHTML = ''; return; }

        trendCard.innerHTML = `
            <h2 class="detail-section-title">${group === 'hitting' ? `Last ${recent.length} Games` : `Last ${recent.length} Outings`}</h2>
            <div style="position:relative;height:220px">
                <canvas id="mlb-player-trend"></canvas>
            </div>
        `;
        StatsCharts.mlbGameTrend('mlb-player-trend', recent, group, colors.primary);
    }).catch(() => {
        const trendCard = document.getElementById('mlb-trend-card');
        if (trendCard) trendCard.innerHTML = '';
        const startsCard = document.getElementById('mlb-last-starts-card');
        if (startsCard) startsCard.innerHTML = '';
    });

    // Async: Statcast percentile data (Baseball Savant / Google Cloud)
    const savantType = group === 'pitching' ? 'pitcher' : 'batter';
    fetchStatcast(playerId, savantType).then(data => {
        const card = document.getElementById('mlb-statcast-card');
        if (!card) return;
        if (!data) { card.innerHTML = ''; return; }
        card.innerHTML = `
            <h2 class="detail-section-title">⚡ Statcast <span class="statcast-badge">via Baseball Savant</span></h2>
            ${_renderStatcastCard(data, group)}
        `;
    }).catch(() => {
        const card = document.getElementById('mlb-statcast-card');
        if (card) card.innerHTML = '';
    });

    // Async: career year-by-year stats
    _fetchMLBCareerStats(playerId, group).then(rows => {
        const card = document.getElementById('mlb-career-card');
        if (!card) return;
        if (!rows || rows.length === 0) { card.innerHTML = ''; return; }
        card.innerHTML = `
            <h2 class="detail-section-title">Career Stats</h2>
            ${_renderMLBCareerTable(rows, group)}
        `;
        _wireMLBCareerTrend(rows, group, colors.primary);
        _wireMLBCareerCSV(rows, group, player);
    }).catch(() => {
        const card = document.getElementById('mlb-career-card');
        if (card) card.innerHTML = '';
    });
}

// ── MLB Hitting Splits ────────────────────────────────────────

async function _fetchMLBHittingSplits(playerId) {
    const types   = ['vsLeft', 'vsRight', 'home', 'away'];
    const labels  = { vsLeft: 'vs LHP', vsRight: 'vs RHP', home: 'Home', away: 'Away' };
    const results = {};

    await Promise.all(types.map(async type => {
        try {
            const hydrate = `stats(group=[hitting],type=${type},season=${MLB_SEASON})`;
            const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
            const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
            if (splits.length) {
                results[type] = { label: labels[type], stat: splits[0]?.stat || {} };
            }
        } catch (_) {}
    }));

    return results;
}

async function _fetchMLBPitchingSplits(playerId) {
    const types  = ['vsLeft', 'vsRight', 'home', 'away'];
    const labels = { vsLeft: 'vs LHB', vsRight: 'vs RHB', home: 'Home', away: 'Away' };
    const results = {};

    await Promise.all(types.map(async type => {
        try {
            const hydrate = `stats(group=[pitching],type=${type},season=${MLB_SEASON})`;
            const data    = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
            const splits  = data?.people?.[0]?.stats?.[0]?.splits || [];
            if (splits.length) {
                results[type] = { label: labels[type], stat: splits[0]?.stat || {} };
            }
        } catch (_) {}
    }));

    return results;
}

function _renderMLBPitchingSplits(splits) {
    const COLS = [
        { key: 'gamesPlayed',   label: 'G' },
        { key: 'inningsPitched',label: 'IP' },
        { key: 'era',           label: 'ERA' },
        { key: 'whip',          label: 'WHIP', fmt: v => v != null ? parseFloat(v).toFixed(2) : '—' },
        { key: 'strikeOuts',    label: 'K' },
        { key: 'baseOnBalls',   label: 'BB' },
        { key: 'homeRuns',      label: 'HR' },
        { key: 'earnedRuns',    label: 'ER' },
    ];

    const types    = Object.keys(splits);
    const firstTab = types[0];

    const tabs = types.map(t =>
        `<button class="mlb-splits-tab ${t === firstTab ? 'mlb-splits-tab--active' : ''}" data-split="${t}">${splits[t].label}</button>`
    ).join('');

    const panels = types.map(t => {
        const s = splits[t].stat;
        const cells = COLS.map(col => {
            const raw = s[col.key];
            const val = raw == null ? '—' : (col.fmt ? col.fmt(raw) : raw);
            return `<div class="mlb-splits-cell">
                        <div class="mlb-splits-val">${val}</div>
                        <div class="mlb-splits-lbl">${col.label}</div>
                    </div>`;
        }).join('');
        return `<div class="mlb-splits-panel ${t === firstTab ? 'mlb-splits-panel--active' : ''}" data-split="${t}">
                    <div class="mlb-splits-stat-row">${cells}</div>
                </div>`;
    }).join('');

    return `
        <div class="mlb-splits-tabs">${tabs}</div>
        <div class="mlb-splits-panels">${panels}</div>
    `;
}

async function _fetchMLBCareerStats(playerId, group) {
    const data = await mlbFetch(`/people/${playerId}/stats`, {
        stats: 'yearByYear',
        group,
    }, ApiCache.TTL.LONG);
    const splits = data?.stats?.[0]?.splits || [];
    // Filter to MLB (sportId 1) and exclude career totals / minor leagues
    return splits
        .filter(s => s.sport?.id === 1)
        .map(s => ({
            season:   s.season,
            teamAbbr: s.team?.abbreviation || s.team?.name || '—',
            teamId:   s.team?.id,
            stat:     s.stat || {},
        }));
}

function _renderMLBCareerTable(rows, group) {
    const hitCols  = [
        { key: 'gamesPlayed',  label: 'G' },
        { key: 'atBats',       label: 'AB' },
        { key: 'avg',          label: 'AVG' },
        { key: 'obp',          label: 'OBP' },
        { key: 'slg',          label: 'SLG' },
        { key: 'homeRuns',     label: 'HR' },
        { key: 'rbi',          label: 'RBI' },
        { key: 'runs',         label: 'R' },
        { key: 'stolenBases',  label: 'SB' },
        { key: 'strikeOuts',   label: 'SO' },
    ];
    const pitCols  = [
        { key: 'gamesPlayed',   label: 'G' },
        { key: 'gamesStarted',  label: 'GS' },
        { key: 'wins',          label: 'W' },
        { key: 'losses',        label: 'L' },
        { key: 'era',           label: 'ERA' },
        { key: 'inningsPitched',label: 'IP' },
        { key: 'strikeOuts',    label: 'SO' },
        { key: 'whip',          label: 'WHIP' },
        { key: 'saves',         label: 'SV' },
    ];
    const cols = group === 'hitting' ? hitCols : pitCols;

    const thead = `<tr>
        <th>Year</th>
        <th>Team</th>
        ${cols.map(c => `<th title="${c.key}">${c.label}</th>`).join('')}
    </tr>`;

    const tbody = rows.map(row => {
        const logo = row.teamId ? `<img src="${getMLBTeamLogoUrl(row.teamId)}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:4px" loading="lazy" data-hide-on-error>` : '';
        const cells = cols.map(c => {
            const val = row.stat[c.key];
            return `<td>${val ?? '—'}</td>`;
        }).join('');
        return `<tr>
            <td class="career-season">${row.season}</td>
            <td>${logo}${row.teamAbbr}</td>
            ${cells}
        </tr>`;
    }).join('');

    const trendStats = group === 'hitting' ? _MLB_CAREER_TREND_HITTING : _MLB_CAREER_TREND_PITCHING;
    const trendBtns = trendStats.map((s, i) =>
        `<button class="career-stat-btn${i === 0 ? ' active' : ''}" data-stat="${s.key}" data-color="${s.color}">${s.label}</button>`
    ).join('');

    return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
            <span style="font-size:0.75rem;color:var(--text-muted)">${rows.length} season${rows.length !== 1 ? 's' : ''}</span>
            <button class="lb-export-btn" id="mlb-career-csv-btn" title="Download CSV">↓ CSV</button>
        </div>
        <div class="career-table-wrap"><table class="career-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
        <div class="career-trend-section">
            <div class="career-trend-controls" id="mlb-career-trend-controls">${trendBtns}</div>
            <div class="chart-wrap chart-wrap--tall" style="margin-top:0.75rem">
                <canvas id="mlb-pd-career-trend"></canvas>
            </div>
        </div>
    `;
}

const _MLB_CAREER_TREND_HITTING = [
    { key: 'avg',         label: 'AVG',  color: '#fbbf24' },
    { key: 'obp',         label: 'OBP',  color: '#34d399' },
    { key: 'slg',         label: 'SLG',  color: '#60a5fa' },
    { key: 'ops',         label: 'OPS',  color: '#a78bfa' },
    { key: 'homeRuns',    label: 'HR',   color: '#f87171' },
    { key: 'rbi',         label: 'RBI',  color: '#fb923c' },
    { key: 'stolenBases', label: 'SB',   color: '#4ade80' },
];

const _MLB_CAREER_TREND_PITCHING = [
    { key: 'era',            label: 'ERA',  color: '#f87171' },
    { key: 'whip',           label: 'WHIP', color: '#fb923c' },
    { key: 'strikeOuts',     label: 'K',    color: '#a78bfa' },
    { key: 'wins',           label: 'W',    color: '#34d399' },
    { key: 'inningsPitched', label: 'IP',   color: '#60a5fa' },
];

function _wireMLBCareerTrend(rows, group, primaryColor) {
    if (!window.StatsCharts || rows.length < 2) return;

    // rows are oldest→newest from the API filter
    const chronRows = rows.map(r => ({ season: parseInt(r.season, 10), stats: r.stat }));

    const renderTrend = (statKey, color) => {
        StatsCharts.careerTrend('mlb-pd-career-trend', chronRows, statKey, color || primaryColor);
    };

    const trendStats = group === 'hitting' ? _MLB_CAREER_TREND_HITTING : _MLB_CAREER_TREND_PITCHING;
    renderTrend(trendStats[0].key, trendStats[0].color);

    const controls = document.getElementById('mlb-career-trend-controls');
    if (!controls) return;
    controls.addEventListener('click', e => {
        const btn = e.target.closest('.career-stat-btn');
        if (!btn) return;
        controls.querySelectorAll('.career-stat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTrend(btn.dataset.stat, btn.dataset.color);
    });
}

function _wireMLBCareerCSV(rows, group, player) {
    const btn = document.getElementById('mlb-career-csv-btn');
    if (!btn || typeof exportCSV !== 'function') return;

    btn.addEventListener('click', () => {
        const hitHeaders = ['Year','Team','G','AB','AVG','OBP','SLG','HR','RBI','R','SB','SO'];
        const pitHeaders = ['Year','Team','G','GS','W','L','ERA','IP','SO','WHIP','SV'];
        const headers    = group === 'hitting' ? hitHeaders : pitHeaders;

        const csvRows = rows.map(r => {
            const s = r.stat;
            if (group === 'hitting') {
                return [r.season, r.teamAbbr, s.gamesPlayed, s.atBats, s.avg, s.obp, s.slg,
                    s.homeRuns, s.rbi, s.runs, s.stolenBases, s.strikeOuts];
            }
            return [r.season, r.teamAbbr, s.gamesPlayed, s.gamesStarted, s.wins, s.losses,
                s.era, s.inningsPitched, s.strikeOuts, s.whip, s.saves];
        });

        const safeName = (player.fullName || 'player').replace(/[^a-z0-9]/gi, '-').toLowerCase();
        exportCSV(`${safeName}-career-${group}.csv`, headers, csvRows);
    });
}

// ── Statcast card renderer ────────────────────────────────────

function _renderStatcastCard(data, group) {
    // Percentile → colour token
    const _pctColor = p => {
        if (p == null) return 'var(--text-muted)';
        if (p >= 90)  return '#22c55e';   // elite green
        if (p >= 70)  return '#86efac';   // good green
        if (p >= 50)  return '#fbbf24';   // average yellow
        if (p >= 30)  return '#fb923c';   // below avg orange
        return '#f87171';                  // poor red
    };

    const _row = (label, val, pct, unit = '') => {
        if (val == null && pct == null) return '';
        const display   = val != null ? `${parseFloat(val).toFixed(1)}${unit}` : '—';
        const pctNum    = pct != null ? Math.round(pct) : null;
        const pctColor  = _pctColor(pctNum);
        const pctLabel  = pctNum != null ? `<span class="sc-pct" style="color:${pctColor}">${pctNum}th</span>` : '';
        const barW      = pctNum != null ? pctNum : 0;
        return `
            <div class="sc-row">
                <span class="sc-label">${label}</span>
                <span class="sc-val">${display}</span>
                <div class="sc-bar-wrap">
                    <div class="sc-bar-fill" style="width:${barW}%;background:${pctColor}"></div>
                </div>
                ${pctLabel}
            </div>
        `;
    };

    let rows = '';
    if (group === 'hitting') {
        rows += _row('Exit Velocity',  data.avg_hit_speed,       data.p_avg_hit_speed,       ' mph');
        rows += _row('Hard-Hit %',     data.hard_hit_percent,    data.p_hard_hit_percent,    '%');
        rows += _row('Barrel %',       data.barrels_per_bbe,     data.p_barrels_per_bbe,     '%');
        rows += _row('Sweet Spot %',   data.sweet_spot_percent,  data.p_sweet_spot_percent,  '%');
        rows += _row('Launch Angle',   data.launch_angle,        data.p_launch_angle,        '°');
        rows += _row('xBA',            data.xba,                 data.p_xba);
        rows += _row('xSLG',           data.xslg,                data.p_xslg);
        rows += _row('xwOBA',          data.xwoba,               data.p_xwoba);
        rows += _row('Sprint Speed',   data.sprint_speed,        data.p_sprint_speed,        ' ft/s');
    } else {
        rows += _row('Exit Velocity',  data.exit_velocity,       data.p_exit_velocity,       ' mph');
        rows += _row('Spin Rate',      data.spin_rate,           data.p_spin_rate,           ' rpm');
        rows += _row('K %',            data.k_percent,           data.p_k_percent,           '%');
        rows += _row('BB %',           data.bb_percent,          data.p_bb_percent,          '%');
        rows += _row('Chase %',        data.oz_swing_percent,    data.p_oz_swing_percent,    '%');
        rows += _row('Whiff %',        data.whiff_percent,       data.p_whiff_percent,       '%');
        rows += _row('xERA',           data.xera,                data.p_xera);
        rows += _row('xwOBA vs',       data.xwoba,               data.p_xwoba);
    }

    if (!rows.trim()) return '<p style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">No Statcast data available for this season.</p>';

    return `<div class="sc-grid">${rows}</div>
            <p class="sc-note">Percentile rankings among all qualified ${group === 'hitting' ? 'hitters' : 'pitchers'} · ${MLB_SEASON} MLB season</p>`;
}

function _renderMLBSplits(splits) {
    const COLS = [
        { key: 'gamesPlayed', label: 'G' },
        { key: 'atBats',      label: 'AB' },
        { key: 'avg',         label: 'AVG', fmt: v => v || '.000' },
        { key: 'obp',         label: 'OBP', fmt: v => v || '.000' },
        { key: 'slg',         label: 'SLG', fmt: v => v || '.000' },
        { key: 'ops',         label: 'OPS', fmt: v => v || '.000' },
        { key: 'homeRuns',    label: 'HR' },
        { key: 'rbi',         label: 'RBI' },
        { key: 'strikeOuts',  label: 'K' },
        { key: 'baseOnBalls', label: 'BB' },
    ];

    const types   = Object.keys(splits);
    const firstTab = types[0];

    const tabs = types.map(t => `
        <button class="mlb-splits-tab ${t === firstTab ? 'mlb-splits-tab--active' : ''}"
                data-split="${t}">${splits[t].label}</button>
    `).join('');

    const panels = types.map(t => {
        const s = splits[t].stat;
        const cells = COLS.map(col => {
            const raw = s[col.key];
            const val = raw == null ? '—' : (col.fmt ? col.fmt(raw) : raw);
            return `<div class="mlb-splits-cell">
                        <div class="mlb-splits-val">${val}</div>
                        <div class="mlb-splits-lbl">${col.label}</div>
                    </div>`;
        }).join('');
        return `<div class="mlb-splits-panel ${t === firstTab ? 'mlb-splits-panel--active' : ''}"
                     data-split="${t}">
                    <div class="mlb-splits-stat-row">${cells}</div>
                </div>`;
    }).join('');

    return `
        <div class="mlb-splits-tabs">${tabs}</div>
        <div class="mlb-splits-panels">${panels}</div>
    `;
}

function _initSplitsTabs(card) {
    card.querySelectorAll('.mlb-splits-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const split = btn.dataset.split;
            card.querySelectorAll('.mlb-splits-tab').forEach(b => b.classList.remove('mlb-splits-tab--active'));
            card.querySelectorAll('.mlb-splits-panel').forEach(p => p.classList.remove('mlb-splits-panel--active'));
            btn.classList.add('mlb-splits-tab--active');
            card.querySelector(`.mlb-splits-panel[data-split="${split}"]`)?.classList.add('mlb-splits-panel--active');
        });
    });
}

async function _fetchMLBGameLog(playerId, group) {
    const apiGroup = group === 'hitting' ? 'hitting' : 'pitching';
    const hydrate  = `stats(group=[${apiGroup}],type=gameLog,season=${MLB_SEASON})`;
    const data     = await mlbFetch(`/people/${playerId}`, { hydrate }, ApiCache.TTL.MEDIUM);
    const statSplits = data?.people?.[0]?.stats?.[0]?.splits || [];

    return statSplits.map(s => {
        const st = s.stat || {};
        const entry = { date: s.date || '' };
        if (group === 'hitting') {
            entry.avg       = st.avg       ?? null;
            entry.homeRuns  = st.homeRuns  ?? 0;
            entry.rbi       = st.rbi       ?? 0;
            entry.hits      = st.hits      ?? 0;
            entry.atBats    = st.atBats    ?? 0;
        } else {
            entry.inningsPitched = st.inningsPitched ?? '0';
            entry.strikeOuts     = st.strikeOuts     ?? 0;
            entry.earnedRuns     = st.earnedRuns     ?? 0;
            entry.baseOnBalls    = st.baseOnBalls    ?? 0;
            entry.homeRuns       = st.homeRuns       ?? 0;
            entry.wins           = st.wins           ?? 0;
            entry.losses         = st.losses         ?? 0;
            entry.isStart        = (st.gamesStarted  ?? 0) > 0;
            entry.opponent       = s.opponent?.abbreviation || s.team?.abbreviation || '';
            entry.isHome         = s.isHome ?? null;
        }
        return entry;
    }).filter(e => {
        // Filter out games with no meaningful data
        if (group === 'hitting') return (e.atBats ?? 0) > 0;
        return parseFloat(e.inningsPitched || 0) > 0;
    });
}

function _renderLastNStarts(logs, primaryColor) {
    const N = 5;
    const starts = logs.filter(e => e.isStart).slice(-N);
    if (starts.length === 0) return '';

    // Aggregate totals
    let wins = 0, losses = 0, er = 0, k = 0, bb = 0, hr = 0, ipRaw = 0;
    for (const s of starts) {
        wins   += s.wins        || 0;
        losses += s.losses      || 0;
        er     += s.earnedRuns  || 0;
        k      += s.strikeOuts  || 0;
        bb     += s.baseOnBalls || 0;
        hr     += s.homeRuns    || 0;
        // IP like "6.2" → convert to outs then back
        const parts = String(s.inningsPitched || '0').split('.');
        ipRaw += parseInt(parts[0] || 0) * 3 + parseInt(parts[1] || 0);
    }
    const ipFull  = Math.floor(ipRaw / 3);
    const ipFrac  = ipRaw % 3;
    const ipStr   = ipFrac ? `${ipFull}.${ipFrac}` : String(ipFull);
    const era     = ipRaw > 0 ? ((er * 27) / ipRaw).toFixed(2) : '—';

    // Per-start row items
    const rows = starts.map(s => {
        const ip    = s.inningsPitched || '0';
        const dec   = s.wins ? 'W' : s.losses ? 'L' : '—';
        const decCls = s.wins ? 'ls-dec--w' : s.losses ? 'ls-dec--l' : 'ls-dec--nd';
        const erNum = s.earnedRuns || 0;
        const erCls = erNum === 0 ? 'ls-er--zero' : erNum >= 4 ? 'ls-er--bad' : '';
        const opp   = s.opponent ? (s.isHome === false ? `@ ${s.opponent}` : `vs ${s.opponent}`) : '';
        const dateStr = s.date ? s.date.slice(5) : '';
        return `
            <div class="ls-row">
                <span class="ls-date">${dateStr}</span>
                <span class="ls-opp">${_escHtml(opp)}</span>
                <span class="ls-ip">${ip} IP</span>
                <span class="ls-k">${s.strikeOuts ?? 0} K</span>
                <span class="ls-bb">${s.baseOnBalls ?? 0} BB</span>
                <span class="ls-er ${erCls}">${erNum} ER</span>
                <span class="ls-dec ${decCls}">${dec}</span>
            </div>`;
    }).join('');

    return `
        <div class="last-starts-wrap">
            <div class="ls-summary">
                <span class="ls-label">Last ${starts.length} Starts</span>
                <span class="ls-stat-pill">${wins}–${losses}</span>
                <span class="ls-stat-pill">${era} ERA</span>
                <span class="ls-stat-pill">${ipStr} IP</span>
                <span class="ls-stat-pill">${k} K</span>
                <span class="ls-stat-pill">${bb} BB</span>
                ${hr > 0 ? `<span class="ls-stat-pill ls-stat-pill--hr">${hr} HR</span>` : ''}
            </div>
            <div class="ls-rows">${rows}</div>
        </div>`;
}

function backToMLBPlayers() {
    if (window.StatsCharts) StatsCharts.destroyAll();
    _clearMLBSearch();
    document.getElementById('searchBar')?.style.setProperty('display', 'block');
    document.getElementById('viewHeader')?.style.setProperty('display', 'none');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-players"]').forEach(t => t.classList.add('active'));

    history.pushState({ view: 'mlb-players' }, '', '#mlb-players');

    _renderMLBGroupToggle();
    displayMLBPlayers(AppState.mlbStatsGroup);
}

// ── View: Games ───────────────────────────────────────────────

async function loadMLBGames() {
    await _loadMLBGamesForOffset(0);
}

async function _loadMLBGamesForOffset(offset) {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-games', null);

    grid.className = 'games-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card" style="min-height:160px">
            <div class="skeleton-line" style="width:60%;height:14px;margin-bottom:1.25rem"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
                <div class="skeleton-line" style="width:12%;height:20px"></div>
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
            </div>
        </div>
    `).join('');

    try {
        const dateStr = _mlbDateString(offset);
        const games   = await _fetchMLBGamesForDate(dateStr);
        if (offset === 0) AppState.mlbGames = games;
        displayMLBGames(games, dateStr, offset);
    } catch (error) {
        ErrorHandler.handle(grid, error, () => _loadMLBGamesForOffset(offset), { tag: 'MLB', title: 'Failed to Load MLB Games' });
    }
}

// Build an ET-anchored date string for a given offset from today
function _mlbDateString(offsetDays = 0) {
    const nowET = new Date(Date.now() - 5 * 60 * 60 * 1000);
    nowET.setUTCDate(nowET.getUTCDate() + offsetDays);
    const y = nowET.getUTCFullYear();
    const m = String(nowET.getUTCMonth() + 1).padStart(2, '0');
    const d = String(nowET.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Fetch all games for a single calendar date
async function _fetchMLBGamesForDate(dateStr) {
    const data = await mlbFetch('/schedule', {
        sportId:   1,
        date:      dateStr,
        hydrate:   'team,linescore',
        gameType:  'R,F,D,L,W',
    }, ApiCache.TTL.SHORT);
    const games = [];
    (data.dates || []).forEach(d => games.push(...(d.games || [])));
    return games;
}

function displayMLBGames(games, dateStr, offset) {
    const grid     = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    // Date label for the nav row
    const label = offset === 0 ? 'Today'
                : offset === -1 ? 'Yesterday'
                : new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    const navRow = document.createElement('div');
    navRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0 1rem;max-width:900px;margin:0 auto;';
    navRow.innerHTML = `
        <button class="mlb-date-nav-btn" onclick="_mlbGamesGoTo(${offset - 1})">← Prev</button>
        <span style="font-weight:700;font-size:0.95rem;color:var(--text-primary)">${label}
            <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);margin-left:0.4rem">${dateStr}</span>
        </span>
        <button class="mlb-date-nav-btn" onclick="_mlbGamesGoTo(${offset + 1})" ${offset >= 0 ? 'disabled style="opacity:0.35;cursor:not-allowed"' : ''}>Next →</button>
    `;

    const gamesWrap = document.createElement('div');
    gamesWrap.className = 'games-grid';
    gamesWrap.style.cssText = 'max-width:900px;margin:0 auto;';

    if (!games || games.length === 0) {
        gamesWrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚾</div><p class="empty-state-title">No MLB games scheduled for ${label}</p></div>`;
    } else {
        games.forEach(game => gamesWrap.appendChild(_createMLBGameCard(game)));
    }

    grid.innerHTML = '';
    grid.appendChild(navRow);
    grid.appendChild(gamesWrap);
}

function _mlbGamesGoTo(offset) {
    if (offset > 0) return; // Don't go into the future beyond today
    _loadMLBGamesForOffset(offset);
}
if (typeof window !== 'undefined') window._mlbGamesGoTo = _mlbGamesGoTo;

function _createMLBGameCard(game) {
    const card      = document.createElement('div');
    card.className  = 'game-card';

    // Only final/live games have meaningful box scores to show
    const clickable = game.status?.abstractGameState === 'Final' || game.status?.abstractGameState === 'Live';
    if (clickable && game.gamePk) {
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => showMLBGameDetail(game.gamePk, game));
    }

    const homeTeam  = game.teams?.home?.team  || {};
    const awayTeam  = game.teams?.away?.team  || {};
    const homeScore = game.teams?.home?.score ?? null;
    const awayScore = game.teams?.away?.score ?? null;
    const hasScore  = homeScore != null && awayScore != null;
    const homeWon   = hasScore && homeScore > awayScore;
    const awayWon   = hasScore && awayScore > homeScore;

    const homeColors = getMLBTeamColors(homeTeam.abbreviation);
    const awayColors = getMLBTeamColors(awayTeam.abbreviation);

    const status    = game.status?.detailedState || 'Scheduled';
    const isFinal   = status === 'Final';
    const isLive    = game.status?.abstractGameState === 'Live';
    const statusCls = isFinal ? 'game-status--final' : isLive ? 'game-status--live' : 'game-status--sched';

    let dateStr = '';
    if (game.gameDate) {
        try {
            dateStr = new Date(game.gameDate).toLocaleDateString('en-US', {
                weekday: 'short', month: 'short', day: 'numeric'
            });
        } catch (_) { dateStr = game.gameDate.split('T')[0]; }
    }

    const homeLogo = getMLBTeamLogoUrl(homeTeam.id);
    const awayLogo = getMLBTeamLogoUrl(awayTeam.id);
    const homeAbbr = _mlbTeamAbbr(homeTeam);
    const awayAbbr = _mlbTeamAbbr(awayTeam);

    card.innerHTML = `
        <div class="game-card-header">
            <span class="game-date">${dateStr}</span>
            <span class="game-status ${statusCls}">${isLive ? '<span class="live-dot"></span>' : ''}${status}</span>
        </div>
        <div class="game-matchup">
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}" data-team-id="${homeTeam.id}" style="cursor:pointer">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}55)">
                    ${homeLogo ? `<img class="game-logo-img" src="${homeLogo}" loading="lazy" data-hide-on-error onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">` : ''}
                    <span class="game-logo-text">${homeAbbr}</span>
                </div>
                <div class="game-team-abbr">${homeAbbr}</div>
                <div class="game-team-name">${homeTeam.name || ''}</div>
            </div>
            <div class="game-scores">
                <span class="game-score ${homeWon ? 'game-score--win' : hasScore && !homeWon ? 'game-score--loss' : ''}">${hasScore ? homeScore : '—'}</span>
                <span class="game-scores-sep">:</span>
                <span class="game-score ${awayWon ? 'game-score--win' : hasScore && !awayWon ? 'game-score--loss' : ''}">${hasScore ? awayScore : '—'}</span>
            </div>
            <div class="game-team game-team--away ${awayWon ? 'game-team--winner' : ''}" data-team-id="${awayTeam.id}" style="cursor:pointer">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}55)">
                    ${awayLogo ? `<img class="game-logo-img" src="${awayLogo}" loading="lazy" data-hide-on-error onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">` : ''}
                    <span class="game-logo-text">${awayAbbr}</span>
                </div>
                <div class="game-team-abbr">${awayAbbr}</div>
                <div class="game-team-name">${awayTeam.name || ''}</div>
            </div>
        </div>
    `;

    card.querySelectorAll('.game-team[data-team-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const tid = parseInt(el.dataset.teamId, 10);
            if (tid) showMLBTeamDetail(tid);
        });
    });

    return card;
}

// ── View: Game Detail ─────────────────────────────────────────

async function showMLBGameDetail(gamePk, gameStub = null) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    const homeTeam = gameStub?.teams?.home?.team || {};
    const awayTeam = gameStub?.teams?.away?.team || {};
    const homeAbbr = _mlbTeamAbbr(homeTeam);
    const awayAbbr = _mlbTeamAbbr(awayTeam);

    if (window.setBreadcrumb) {
        setBreadcrumb('mlb-games', `${awayAbbr} @ ${homeAbbr}`);
    }
    if (window.history?.pushState) {
        history.pushState({ view: 'mlb-game', gamePk }, '', `#mlb-game-${gamePk}`);
    }

    grid.innerHTML = `
        <div class="mlb-game-detail-wrap">
            <div class="arcade-back-row" style="margin-bottom:1.5rem">
                <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
            </div>
            <div class="skeleton-card" style="height:280px;margin-bottom:1rem"></div>
            <div class="skeleton-card" style="height:200px;margin-bottom:1rem"></div>
            <div class="skeleton-card" style="height:200px"></div>
        </div>
    `;

    try {
        const [linescore, boxscore] = await Promise.all([
            mlbFetch(`/game/${gamePk}/linescore`, {}, ApiCache.TTL.SHORT),
            mlbFetch(`/game/${gamePk}/boxscore`,  {}, ApiCache.TTL.SHORT),
        ]);
        _renderMLBGameDetail(grid, gameStub, linescore, boxscore);
    } catch (err) {
        Logger.error('MLB game detail failed', err, 'MLB');
        grid.innerHTML = `
            <div class="mlb-game-detail-wrap">
                <div class="arcade-back-row">
                    <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
                </div>
                <div class="arcade-error"><p>Could not load game detail. Try again later.</p></div>
            </div>
        `;
    }
}

function _renderMLBGameDetail(grid, stub, ls, bs) {
    const homeTeam  = stub?.teams?.home?.team || bs?.teams?.home?.team || {};
    const awayTeam  = stub?.teams?.away?.team || bs?.teams?.away?.team || {};
    const homeAbbr  = _mlbTeamAbbr(homeTeam);
    const awayAbbr  = _mlbTeamAbbr(awayTeam);
    const homeColors = getMLBTeamColors(homeAbbr);
    const awayColors  = getMLBTeamColors(awayAbbr);
    const homeLogo  = getMLBTeamLogoUrl(homeTeam.id);
    const awayLogo  = getMLBTeamLogoUrl(awayTeam.id);

    const homeScore = ls?.teams?.home?.runs ?? stub?.teams?.home?.score ?? '—';
    const awayScore = ls?.teams?.away?.runs ?? stub?.teams?.away?.score ?? '—';
    const homeWon   = typeof homeScore === 'number' && typeof awayScore === 'number' && homeScore > awayScore;
    const awayWon   = typeof awayScore === 'number' && typeof homeScore === 'number' && awayScore > homeScore;

    // ── Linescore (inning by inning) ──────────────────────────
    const innings = ls?.innings || [];
    const maxInn  = Math.max(9, innings.length);
    const innNums = Array.from({ length: maxInn }, (_, i) => i + 1);

    const innHeaders = innNums.map(n => `<th class="mlb-ls-inn">${n}</th>`).join('');
    const homeCells  = innNums.map(n => {
        const inn = innings.find(i => i.num === n);
        const r   = inn?.home?.runs;
        return `<td class="mlb-ls-cell">${r ?? '—'}</td>`;
    }).join('');
    const awayCells  = innNums.map(n => {
        const inn = innings.find(i => i.num === n);
        const r   = inn?.away?.runs;
        return `<td class="mlb-ls-cell">${r ?? '—'}</td>`;
    }).join('');

    const homeR = ls?.teams?.home?.runs ?? '—';
    const homeH = ls?.teams?.home?.hits ?? '—';
    const homeE = ls?.teams?.home?.errors ?? '—';
    const awayR = ls?.teams?.away?.runs ?? '—';
    const awayH = ls?.teams?.away?.hits ?? '—';
    const awayE = ls?.teams?.away?.errors ?? '—';

    const linescoreHtml = `
        <div class="mlb-linescore-wrap">
            <div class="mlb-game-header">
                <div class="mlb-gh-team ${awayWon ? 'mlb-gh-team--winner' : ''}" style="cursor:pointer" onclick="showMLBTeamDetail(${awayTeam.id})">
                    <div class="mlb-gh-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}44)">
                        ${awayLogo ? `<img src="${awayLogo}" loading="lazy" data-hide-on-error>` : ''}
                        <span>${awayAbbr}</span>
                    </div>
                    <span class="mlb-gh-abbr">${awayAbbr}</span>
                    <span class="mlb-gh-name">${awayTeam.name || ''}</span>
                </div>
                <div class="mlb-gh-score">
                    <span class="${awayWon ? 'mlb-gh-score-val--win' : ''}">${awayScore}</span>
                    <span class="mlb-gh-sep">–</span>
                    <span class="${homeWon ? 'mlb-gh-score-val--win' : ''}">${homeScore}</span>
                </div>
                <div class="mlb-gh-team ${homeWon ? 'mlb-gh-team--winner' : ''}" style="cursor:pointer;text-align:right" onclick="showMLBTeamDetail(${homeTeam.id})">
                    <div class="mlb-gh-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}44)">
                        ${homeLogo ? `<img src="${homeLogo}" loading="lazy" data-hide-on-error>` : ''}
                        <span>${homeAbbr}</span>
                    </div>
                    <span class="mlb-gh-abbr">${homeAbbr}</span>
                    <span class="mlb-gh-name">${homeTeam.name || ''}</span>
                </div>
            </div>
            <div class="mlb-ls-scroll">
                <table class="mlb-ls-table">
                    <thead>
                        <tr>
                            <th class="mlb-ls-team-hdr">Team</th>
                            ${innHeaders}
                            <th class="mlb-ls-rhe">R</th><th class="mlb-ls-rhe">H</th><th class="mlb-ls-rhe">E</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td class="mlb-ls-team-cell">${awayAbbr}</td>
                            ${awayCells}
                            <td class="mlb-ls-rhe mlb-ls-rhe--r ${awayWon ? 'mlb-ls-win' : ''}">${awayR}</td>
                            <td class="mlb-ls-rhe">${awayH}</td>
                            <td class="mlb-ls-rhe">${awayE}</td>
                        </tr>
                        <tr>
                            <td class="mlb-ls-team-cell">${homeAbbr}</td>
                            ${homeCells}
                            <td class="mlb-ls-rhe mlb-ls-rhe--r ${homeWon ? 'mlb-ls-win' : ''}">${homeR}</td>
                            <td class="mlb-ls-rhe">${homeH}</td>
                            <td class="mlb-ls-rhe">${homeE}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // ── Batting box scores ────────────────────────────────────
    function _battingTable(sideKey) {
        const side = bs?.teams?.[sideKey];
        if (!side) return '';
        const batters = (side.batters || []).map(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return null;
            const s = p.stats?.batting;
            if (!s) return null;
            const pos = p.position?.abbreviation || '';
            return { name: p.person?.fullName || '—', id, pos, s };
        }).filter(Boolean);

        if (!batters.length) return '';
        const teamLabel = sideKey === 'home' ? homeAbbr : awayAbbr;
        const rows = batters.map(({ name, id, pos, s }) => `
            <tr class="mlb-box-row" style="cursor:pointer" onclick="showMLBPlayerDetail(${id}, 'hitting')">
                <td class="mlb-box-name"><span class="mlb-box-pos">${pos}</span>${name}</td>
                <td>${s.atBats ?? '—'}</td>
                <td>${s.runs ?? '—'}</td>
                <td>${s.hits ?? '—'}</td>
                <td>${s.rbi ?? '—'}</td>
                <td>${s.homeRuns > 0 ? s.homeRuns : '—'}</td>
                <td>${s.baseOnBalls ?? '—'}</td>
                <td>${s.strikeOuts ?? '—'}</td>
                <td class="mlb-box-avg">${s.avg || '—'}</td>
            </tr>
        `).join('');

        return `
            <div class="mlb-box-section">
                <h3 class="mlb-box-title">${teamLabel} Batting</h3>
                <div class="mlb-box-scroll">
                    <table class="mlb-box-table">
                        <thead><tr>
                            <th class="mlb-box-name-hdr">Player</th>
                            <th title="At bats">AB</th><th title="Runs">R</th><th title="Hits">H</th>
                            <th title="RBI">RBI</th><th title="Home runs">HR</th>
                            <th title="Walks">BB</th><th title="Strikeouts">K</th>
                            <th title="Batting average">AVG</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ── Pitching box scores ───────────────────────────────────
    function _pitchingTable(sideKey) {
        const side = bs?.teams?.[sideKey];
        if (!side) return '';
        const pitchers = (side.pitchers || []).map(id => {
            const p = side.players?.[`ID${id}`];
            if (!p) return null;
            const s = p.stats?.pitching;
            if (!s || parseFloat(s.inningsPitched ?? 0) === 0) return null;
            return { name: p.person?.fullName || '—', id, s };
        }).filter(Boolean);

        if (!pitchers.length) return '';
        const teamLabel = sideKey === 'home' ? homeAbbr : awayAbbr;
        const rows = pitchers.map(({ name, id, s }) => `
            <tr class="mlb-box-row" style="cursor:pointer" onclick="showMLBPlayerDetail(${id}, 'pitching')">
                <td class="mlb-box-name">${name}</td>
                <td>${s.inningsPitched ?? '—'}</td>
                <td>${s.hits ?? '—'}</td>
                <td>${s.runs ?? '—'}</td>
                <td>${s.earnedRuns ?? '—'}</td>
                <td>${s.baseOnBalls ?? '—'}</td>
                <td>${s.strikeOuts ?? '—'}</td>
                <td class="mlb-box-avg">${s.era || '—'}</td>
            </tr>
        `).join('');

        return `
            <div class="mlb-box-section">
                <h3 class="mlb-box-title">${teamLabel} Pitching</h3>
                <div class="mlb-box-scroll">
                    <table class="mlb-box-table">
                        <thead><tr>
                            <th class="mlb-box-name-hdr">Pitcher</th>
                            <th title="Innings pitched">IP</th><th title="Hits">H</th><th title="Runs">R</th>
                            <th title="Earned runs">ER</th><th title="Walks">BB</th>
                            <th title="Strikeouts">K</th><th title="ERA">ERA</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }

    grid.innerHTML = `
        <div class="mlb-game-detail-wrap">
            <div class="arcade-back-row" style="margin-bottom:1.5rem">
                <button class="arcade-back-btn" onclick="loadMLBGames()">← Back to Scores</button>
            </div>
            ${linescoreHtml}
            <div class="mlb-box-grid">
                ${_battingTable('away')}
                ${_battingTable('home')}
                ${_pitchingTable('away')}
                ${_pitchingTable('home')}
            </div>
        </div>
    `;
}

// ── View: Teams ───────────────────────────────────────────────

async function loadMLBTeams() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', null);

    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: 6 }, () =>
        '<div class="skeleton-card" style="height:200px"></div>'
    ).join('');

    try {
        const [teams, standings] = await Promise.all([
            AppState.mlbTeams.length === 0 ? fetchMLBTeams() : Promise.resolve(AppState.mlbTeams),
            fetchMLBStandings().catch(() => ({})),
        ]);
        if (AppState.mlbTeams.length === 0) AppState.mlbTeams = teams;
        displayMLBTeams(AppState.mlbTeams, standings);
    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBTeams, { tag: 'MLB', title: 'Failed to Load MLB Teams' });
    }
}

function displayMLBTeams(teams, standings = {}) {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    if (!teams || teams.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No MLB teams found');
        return;
    }

    const sorted = [...teams].sort((a, b) => {
        const keyOf = t =>
            (t.league?.name || '') + (t.division?.name || '') + (t.name || '');
        return keyOf(a).localeCompare(keyOf(b));
    });

    const fragment = document.createDocumentFragment();
    sorted.forEach(team => {
        const colors  = getMLBTeamColors(team.abbreviation);
        const logo    = getMLBTeamLogoUrl(team.id);
        const abbr    = (team.abbreviation || '?').slice(0, 3);
        const divName = (team.division?.name || '')
            .replace('American League ', 'AL ')
            .replace('National League ', 'NL ');
        const rec     = standings[team.id];
        const hasRec  = rec && (rec.wins != null || rec.losses != null);

        const card    = document.createElement('div');
        card.className = 'team-card';
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => showMLBTeamDetail(team.id));
        card.innerHTML = `
            <div class="team-card-header" style="background:linear-gradient(135deg,${colors.primary}dd,${colors.primary}33)">
                <div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem">
                    ${logo
                        ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain" loading="lazy" data-logo-fallback="${_escHtml(abbr)}">`
                        : `<span style="font-size:1.4rem;font-weight:800;color:#fff">${abbr}</span>`}
                </div>
                <h3 class="team-name">${team.name}</h3>
                ${hasRec ? `
                    <div style="margin-top:0.375rem;display:flex;align-items:center;justify-content:center;gap:0.5rem">
                        <span style="font-weight:800;font-size:1rem;color:#fff">${rec.wins}–${rec.losses}</span>
                        <span style="font-size:0.75rem;color:rgba(255,255,255,0.6)">${rec.pct}</span>
                        ${rec.streak ? `<span style="font-size:0.7rem;color:${rec.streak.startsWith('W') ? '#34d399' : '#f87171'};font-weight:700">${rec.streak}</span>` : ''}
                    </div>
                ` : `<p style="color:rgba(255,255,255,0.55);font-size:0.78rem;margin-top:0.25rem">${team.locationName || ''}</p>`}
            </div>
            <div class="team-card-body">
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">League</span>
                    <span>${(team.league?.name || '—').replace('American League', 'AL').replace('National League', 'NL')}</span>
                </div>
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Division</span>
                    <span style="font-size:0.82rem">${divName || '—'}</span>
                </div>
                ${hasRec ? `
                    <div class="team-stat-row">
                        <span style="color:var(--color-text-muted)">GB</span>
                        <span>${rec.gamesBack}</span>
                    </div>
                ` : ''}
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Stadium</span>
                    <span style="font-size:0.82rem">${team.venue?.name || '—'}</span>
                </div>
                <div class="team-stat-row">
                    <span style="color:var(--color-text-muted)">Since</span>
                    <span>${team.firstYearOfPlay || '—'}</span>
                </div>
            </div>
            <div class="card-cta">VIEW DETAILS →</div>
        `;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── View: Team Detail ─────────────────────────────────────────

async function showMLBTeamDetail(teamId, push = true) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    const grid = document.getElementById('playersGrid');

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-teams"]').forEach(t => t.classList.add('active'));

    // Optimistically find the team for the loading screen
    let team = AppState.mlbTeams.find(t => t.id === teamId);
    const loadColors = team ? getMLBTeamColors(team.abbreviation) : { primary: '#334155' };
    const loadLogo   = getMLBTeamLogoUrl(teamId);

    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', team?.name || `Team ${teamId}`);
    if (push) history.pushState({ view: 'mlb-team', id: teamId }, '', `#mlb-team-${teamId}`);

    grid.className = 'player-detail-container';
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem">
            <div class="player-detail-avatar" style="background:linear-gradient(135deg,${loadColors.primary}cc,${loadColors.primary}55);margin:0 auto 1.25rem">
                ${loadLogo ? `<img src="${loadLogo}" style="width:100%;height:100%;object-fit:contain;padding:10px" loading="lazy" data-hide-on-error>` : (team?.abbreviation || '?')}
            </div>
            <p style="color:var(--color-text-secondary);font-size:1.1rem">Loading roster…</p>
            <div class="loading-spinner" style="margin-top:1.5rem"></div>
        </div>
    `;

    try {
        if (!team) {
            if (AppState.mlbTeams.length === 0) AppState.mlbTeams = await fetchMLBTeams();
            team = AppState.mlbTeams.find(t => t.id === teamId);
        }

        const [roster, recentGames] = await Promise.all([
            fetchMLBRoster(teamId),
            fetchMLBTeamSchedule(teamId, 15),
        ]);

        AppState._mlbTeamRecentGames[teamId] = recentGames;
        AppState._mlbTeamRosters[teamId]     = roster;

        // Pull standings record if available
        let rec = null;
        if (AppState.mlbStandings) {
            for (const div of AppState.mlbStandings) {
                const found = div.teams.find(t => t.teamId === teamId);
                if (found) { rec = found; break; }
            }
        }

        const colors = getMLBTeamColors(team?.abbreviation || '');
        grid.innerHTML = `
            ${_mlbTeamHeader(team, teamId, colors, rec)}
            ${_mlbRecentGamesCard(recentGames, teamId)}
            ${_mlbRosterCard(roster, colors)}
        `;

        // If player stats haven't been loaded yet (user came straight to team detail),
        // fetch them in the background and refresh just the roster card when ready.
        const statsLoaded =
            Object.keys(AppState.mlbPlayerStats.hitting  || {}).length > 0 ||
            Object.keys(AppState.mlbPlayerStats.pitching || {}).length > 0;

        if (!statsLoaded) {
            Promise.all([
                fetchMLBLeagueStats('hitting',  MLB_SEASON),
                fetchMLBLeagueStats('pitching', MLB_SEASON),
            ]).then(([hitSplits, pitSplits]) => {
                // Populate AppState so subsequent views are instant
                AppState.mlbPlayerStats.hitting  = {};
                AppState.mlbPlayerStats.pitching = {};
                AppState.mlbPlayers.hitting      = AppState.mlbPlayers.hitting.length  ? AppState.mlbPlayers.hitting  : [];
                AppState.mlbPlayers.pitching     = AppState.mlbPlayers.pitching.length ? AppState.mlbPlayers.pitching : [];

                for (const split of hitSplits) {
                    const id = split.player?.id;
                    if (!id) continue;
                    AppState.mlbPlayerStats.hitting[id] = { ...split.stat, player_id: id };
                    if (!AppState.mlbPlayers.hitting.find(p => p.id === id)) {
                        AppState.mlbPlayers.hitting.push({
                            id, fullName: split.player.fullName || '—',
                            teamId: split.team?.id, teamName: split.team?.name,
                            teamAbbr: split.team?.abbreviation, position: split.position?.abbreviation,
                        });
                    }
                }
                for (const split of pitSplits) {
                    const id = split.player?.id;
                    if (!id) continue;
                    AppState.mlbPlayerStats.pitching[id] = { ...split.stat, player_id: id };
                    if (!AppState.mlbPlayers.pitching.find(p => p.id === id)) {
                        AppState.mlbPlayers.pitching.push({
                            id, fullName: split.player.fullName || '—',
                            teamId: split.team?.id, teamName: split.team?.name,
                            teamAbbr: split.team?.abbreviation, position: split.position?.abbreviation,
                        });
                    }
                }

                // Re-render just the roster card in-place
                const rosterCard = grid.querySelector('.mlb-roster-card');
                if (rosterCard) {
                    rosterCard.outerHTML = _mlbRosterCard(AppState._mlbTeamRosters[teamId] || roster, colors);
                }
            }).catch(() => {}); // silent — roster is already visible, stats are a bonus
        }
    } catch (err) {
        Logger.error('Failed to load MLB team detail', err, 'MLB');
        grid.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <h3 class="error-state-title">Failed to Load Team</h3>
                <p class="error-state-message">${err.message}</p>
                <button class="retry-btn" onclick="backToMLBTeams()">← Back to Teams</button>
            </div>
        `;
    }
}

function backToMLBTeams() {
    if (window.StatsCharts) StatsCharts.destroyAll();
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-teams"]').forEach(t => t.classList.add('active'));
    history.pushState({ view: 'mlb-teams' }, '', '#mlb-teams');
    if (window.setBreadcrumb) setBreadcrumb('mlb-teams', null);
    displayMLBTeams(AppState.mlbTeams);
}

function _mlbTeamHeader(team, teamId, colors, rec) {
    const name    = team?.name || `Team ${teamId}`;
    const abbr    = team?.abbreviation || '?';
    const logo    = getMLBTeamLogoUrl(teamId);
    const divName = (team?.division?.name || '')
        .replace('American League ', 'AL ')
        .replace('National League ', 'NL ');
    const lgName  = (team?.league?.name || '')
        .replace('American League', 'AL')
        .replace('National League', 'NL');

    const standingsBio = rec ? `
        <div class="player-bio-grid" style="margin-top:0.75rem">
            <div class="player-bio-item"><span class="bio-label">Record</span><span class="bio-value" style="font-weight:800">${rec.wins}–${rec.losses}</span></div>
            <div class="player-bio-item"><span class="bio-label">PCT</span><span class="bio-value">${rec.pct}</span></div>
            <div class="player-bio-item"><span class="bio-label">GB</span><span class="bio-value">${rec.gb}</span></div>
            ${rec.streak ? `<div class="player-bio-item"><span class="bio-label">Streak</span><span class="bio-value" style="color:${rec.streak.startsWith('W') ? '#10b981' : '#f87171'};font-weight:700">${rec.streak}</span></div>` : ''}
            <div class="player-bio-item"><span class="bio-label">Last 10</span><span class="bio-value">${rec.last10}</span></div>
            <div class="player-bio-item"><span class="bio-label">Home</span><span class="bio-value">${rec.home}</span></div>
            <div class="player-bio-item"><span class="bio-label">Away</span><span class="bio-value">${rec.away}</span></div>
        </div>
    ` : '';

    return `
        <div class="player-detail-header"
             style="background:radial-gradient(ellipse at top left,${colors.primary}1a 0%,rgba(15,23,42,0.85) 55%);
                    border-top:3px solid ${colors.primary}88">
            <button onclick="backToMLBTeams()" class="back-button">← Teams</button>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:1.75rem;font-weight:800;
                            box-shadow:0 0 40px ${colors.primary}44">
                    ${logo ? `<img class="player-headshot player-headshot--detail" src="${logo}" alt="${name}" loading="lazy" style="object-fit:contain;object-position:center;padding:10px" data-hide-on-error>` : abbr}
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${name}</h1>
                        <span class="player-hero-pos">${abbr}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-secondary)">${lgName}${divName ? ' · ' + divName : ''}</p>
                    ${team?.venue?.name ? `<p class="player-detail-meta" style="color:var(--color-text-muted)">${team.venue.name}${team.firstYearOfPlay ? ' · Est. ' + team.firstYearOfPlay : ''}</p>` : ''}
                    ${standingsBio}
                </div>
            </div>
        </div>
    `;
}

function _mlbRecentGamesCard(games, teamId) {
    if (!games || games.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Recent Games</h2>
                <p style="color:var(--color-text-muted);text-align:center;padding:2rem">No recent games found.</p>
            </div>
        `;
    }

    const rows = games.slice(0, 12).map(g => {
        const homeTeam  = g.teams?.home?.team || {};
        const awayTeam  = g.teams?.away?.team || {};
        const homeScore = g.teams?.home?.score ?? null;
        const awayScore = g.teams?.away?.score ?? null;
        const hasScore  = homeScore != null && awayScore != null;

        const isHome  = homeTeam.id === teamId;
        const myScore = isHome ? homeScore : awayScore;
        const opScore = isHome ? awayScore : homeScore;
        const oppTeam = isHome ? awayTeam : homeTeam;
        const oppAbbr = _mlbTeamAbbr(oppTeam);
        const oppLogo = getMLBTeamLogoUrl(oppTeam.id);

        const status   = g.status?.detailedState || '';
        const isFinal  = status === 'Final';
        const isLive   = g.status?.abstractGameState === 'Live';
        const isWin    = isFinal && hasScore && myScore > opScore;
        const isLoss   = isFinal && hasScore && myScore < opScore;
        const outcome  = isFinal && hasScore ? (isWin ? 'W' : 'L') : (isLive ? 'LIVE' : '—');
        const outClr   = isWin ? '#10b981' : isLoss ? '#f87171' : 'var(--color-text-muted)';
        const scoreStr = hasScore ? `${myScore}–${opScore}` : '—';
        const scoreClr = isWin ? '#10b981' : isLoss ? '#f87171' : 'var(--color-text-secondary)';
        const ha       = isHome ? 'vs' : '@';

        let dateStr = '—';
        if (g.gameDate) {
            try { dateStr = new Date(g.gameDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch (_) {}
        }

        const clickable = isFinal && g.gamePk;
        return `
            <div class="roster-row ${clickable ? 'roster-row--clickable' : ''}"
                 ${clickable ? `onclick="showMLBGameDetail(${g.gamePk}, AppState._mlbTeamRecentGames[${teamId}].find(g=>g.gamePk===${g.gamePk}))"` : ''}>
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                    <span style="font-weight:900;font-size:0.875rem;min-width:26px;color:${outClr}">${outcome}</span>
                    <span style="color:var(--color-text-muted);font-size:0.75rem;min-width:54px">${dateStr}</span>
                    <span style="color:var(--color-text-muted);font-size:0.75rem">${ha}</span>
                    ${oppLogo ? `<img src="${oppLogo}" alt="" style="width:18px;height:18px;object-fit:contain;flex-shrink:0" loading="lazy" data-hide-on-error>` : ''}
                    <span style="font-weight:600;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${oppAbbr}</span>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0">
                    <span style="font-weight:700;font-size:0.95rem;color:${scoreClr}">${scoreStr}</span>
                    ${clickable ? '<span style="font-size:0.65rem;color:#334155">›</span>' : ''}
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Recent Games</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

function _mlbRosterCard(roster, colors) {
    if (!roster || roster.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Roster</h2>
                <p style="color:var(--color-text-muted);text-align:center;padding:2rem">No roster data available.</p>
            </div>
        `;
    }

    const rows = roster.map(p => {
        const isPitcher  = p.positionType === 'Pitcher';
        const hitStats   = AppState.mlbPlayerStats.hitting?.[p.id];
        const pitStats   = AppState.mlbPlayerStats.pitching?.[p.id];
        const stats      = isPitcher ? (pitStats || hitStats) : (hitStats || pitStats);

        let statsHtml = '';
        if (stats && isPitcher) {
            const era  = stats.era  != null ? parseFloat(stats.era).toFixed(2)  : '—';
            const whip = stats.whip != null ? parseFloat(stats.whip).toFixed(2) : '—';
            const so   = stats.strikeOuts ?? '—';
            statsHtml = `
                <div class="roster-stats">
                    <span style="color:var(--color-pts)">${era}</span>
                    <span style="color:var(--color-reb)">${whip}</span>
                    <span style="color:var(--color-ast)">${so}</span>
                </div>
                <div class="roster-labels"><span>ERA</span><span>WHIP</span><span>K</span></div>
            `;
        } else if (stats) {
            const avg = stats.avg || '—';
            const hr  = stats.homeRuns ?? '—';
            const rbi = stats.rbi     ?? '—';
            statsHtml = `
                <div class="roster-stats">
                    <span style="color:var(--color-pts)">${avg}</span>
                    <span style="color:var(--color-reb)">${hr}</span>
                    <span style="color:var(--color-ast)">${rbi}</span>
                </div>
                <div class="roster-labels"><span>AVG</span><span>HR</span><span>RBI</span></div>
            `;
        }

        const initials    = (p.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const headshotUrl = getMLBPlayerHeadshotUrl(p.id);
        const jersey      = p.jerseyNumber ? `#${p.jerseyNumber}` : '';

        // Link to player detail if stats were loaded for them
        const group     = isPitcher ? 'pitching' : 'hitting';
        const inPlayers = AppState.mlbPlayers[group]?.find(pl => pl.id === p.id);
        const clickAttr = inPlayers ? `onclick="showMLBPlayerDetail(${p.id},'${group}')" style="cursor:pointer"` : '';

        return `
            <div class="roster-row" ${clickAttr}>
                <div class="roster-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44);position:relative;overflow:hidden">
                    ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:1" data-hide-on-error>` : ''}
                    <span style="position:relative">${initials}</span>
                </div>
                <div class="roster-info">
                    <span class="roster-name">${p.fullName}</span>
                    <span class="roster-meta">${p.position || 'N/A'}${jersey ? ' · ' + jersey : ''}</span>
                </div>
                ${statsHtml}
            </div>
        `;
    }).join('');

    return `
        <div class="stats-card mlb-roster-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Active Roster · ${roster.length} Players</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

// ── View: Leaderboards ────────────────────────────────────────

async function loadMLBLeaderboards() {
    const grid = document.getElementById('playersGrid');
    if (window.setBreadcrumb) setBreadcrumb('mlb-leaders', null);

    grid.className = 'leaderboards-grid';
    grid.innerHTML = Array.from({ length: 8 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:55%;height:16px;margin-bottom:1rem"></div>
            ${Array.from({ length: 5 }, () => `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
                    <div class="skeleton-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
                    <div style="flex:1"><div class="skeleton-line" style="width:70%;height:12px"></div></div>
                    <div class="skeleton-line" style="width:36px;height:20px"></div>
                </div>
            `).join('')}
        </div>
    `).join('');

    try {
        const season = AppState.mlbLeaderSeason || MLB_SEASON;
        if (!AppState.mlbLeaderSplits) {
            const [hitSplits, pitSplits] = await Promise.all([
                fetchMLBLeagueStats('hitting',  season, 300),
                fetchMLBLeagueStats('pitching', season, 300),
            ]);
            AppState.mlbLeaderSplits = { hitting: hitSplits, pitching: pitSplits };
        }
        displayMLBLeaderboards();
    } catch (error) {
        ErrorHandler.handle(grid, error, loadMLBLeaderboards, { tag: 'MLB', title: 'Failed to Load MLB Leaders' });
    }
}

// desc:true = higher value is better (rank #1 = highest); desc:false = lower is better (ERA/WHIP)
// decimals: how many decimal places to display for this stat
const MLB_LEADER_CATS = [
    { key: 'avg',                label: 'Batting Average', unit: 'AVG',  color: '#fbbf24', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'ops',                label: 'OPS',             unit: 'OPS',  color: '#a78bfa', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'obp',                label: 'On-Base %',       unit: 'OBP',  color: '#34d399', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'slg',                label: 'Slugging %',      unit: 'SLG',  color: '#60a5fa', group: 'hitting',  desc: true,  decimals: 3 },
    { key: 'homeRuns',           label: 'Home Runs',       unit: 'HR',   color: '#ef4444', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'rbi',                label: 'RBI',             unit: 'RBI',  color: '#f59e0b', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'stolenBases',        label: 'Stolen Bases',    unit: 'SB',   color: '#10b981', group: 'hitting',  desc: true,  decimals: 0 },
    { key: 'era',                label: 'ERA',             unit: 'ERA',  color: '#f472b6', group: 'pitching', desc: false, decimals: 2 },
    { key: 'whip',               label: 'WHIP',            unit: 'WHIP', color: '#818cf8', group: 'pitching', desc: false, decimals: 2 },
    { key: 'strikeoutsPer9Inn',  label: 'K/9',             unit: 'K/9',  color: '#fb923c', group: 'pitching', desc: true,  decimals: 1 },
    { key: 'strikeOuts',         label: 'Strikeouts',      unit: 'K',    color: '#c084fc', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'wins',               label: 'Wins',            unit: 'W',    color: '#38bdf8', group: 'pitching', desc: true,  decimals: 0 },
    { key: 'saves',              label: 'Saves',           unit: 'SV',   color: '#fbbf24', group: 'pitching', desc: true,  decimals: 0 },
];

const MLB_MINGP_OPTIONS = [0, 10, 20, 50, 100];
// Values are lowercase to match AppState.mlbLeaderPosition storage convention
const MLB_POS_OPTIONS   = [
    { value: 'all', label: 'All' },
    // hitting positions (derived from MLB_HITTING_POSITIONS)
    { value: 'c',   label: 'C'   },
    { value: '1b',  label: '1B'  },
    { value: '2b',  label: '2B'  },
    { value: '3b',  label: '3B'  },
    { value: 'ss',  label: 'SS'  },
    { value: 'of',  label: 'OF'  },
    { value: 'dh',  label: 'DH'  },
    // pitching positions (derived from MLB_PITCHING_POSITIONS)
    { value: 'sp',  label: 'SP'  },
    { value: 'rp',  label: 'RP'  },
    { value: 'cl',  label: 'CL'  },
];
// Positions that belong to pitching panels; all others are hitting
// Derived from the canonical position lists defined near getMLBTeamLogoUrl
const PITCHING_POS_SET = new Set(MLB_PITCHING_POSITIONS.filter(p => p !== 'All').map(p => p.toLowerCase()));
// OF set reuses _MLB_OF_SET (defined near _mlbPosMatch)

function displayMLBLeaderboards() {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';

    const splits   = AppState.mlbLeaderSplits || { hitting: [], pitching: [] };
    const minGP    = AppState.mlbLeaderMinGP    || 0;
    const posFilt  = AppState.mlbLeaderPosition || 'all';
    const season   = AppState.mlbLeaderSeason   || MLB_SEASON;
    const fragment = document.createDocumentFragment();

    const MLB_SEASON_OPTIONS = [2023, 2024, 2025].map(y => ({ value: y, label: String(y) }));

    // Control row 1 — Season
    fragment.appendChild(_buildPillControl('Season:', MLB_SEASON_OPTIONS, season, val => {
        if (val === season) return;
        AppState.mlbLeaderSeason = val;
        AppState.mlbLeaderSplits = null;
        loadMLBLeaderboards();
    }));

    // Control row 2 — Min GP
    fragment.appendChild(_buildPillControl('Min GP:', MLB_MINGP_OPTIONS, minGP, val => {
        AppState.mlbLeaderMinGP = val;
        displayMLBLeaderboards();
    }));

    // Control row 3 — Position
    fragment.appendChild(_buildPillControl('Position:', MLB_POS_OPTIONS, posFilt, val => {
        AppState.mlbLeaderPosition = val;
        displayMLBLeaderboards();
    }));

    MLB_LEADER_CATS.forEach(cat => {
        const catSplits = splits[cat.group] || [];

        // Determine whether the position filter applies to this panel
        const posIsForPitching = PITCHING_POS_SET.has(posFilt);
        const posIsForHitting  = posFilt !== 'all' && !posIsForPitching;
        const applyPosFilt     = (cat.group === 'pitching' && posIsForPitching) ||
                                 (cat.group === 'hitting'  && posIsForHitting);

        const dir = AppState._mlbLbSortDir?.[cat.key] !== undefined
            ? AppState._mlbLbSortDir[cat.key]
            : cat.desc;
        const sorted = [...catSplits]
            .filter(s => {
                const numVal = parseFloat(s.stat?.[cat.key]);
                if (isNaN(numVal)) return false;
                if (minGP > 0 && (s.stat?.gamesPlayed ?? 0) < minGP) return false;
                if (applyPosFilt) {
                    const pos = (s.position?.abbreviation || '').toLowerCase();
                    return _mlbPosMatch(pos, posFilt);
                }
                return true;
            })
            .sort((a, b) => {
                const av = parseFloat(a.stat[cat.key]);
                const bv = parseFloat(b.stat[cat.key]);
                return dir ? bv - av : av - bv;
            });

        const panel  = document.createElement('div');
        panel.className = 'leaderboard-panel';

        const unitTipMlb = (typeof StatGlossary !== 'undefined' && StatGlossary.MLB[cat.unit])
            ? `<span class="stat-tip" data-tip="${StatGlossary.MLB[cat.unit].replace(/"/g,'&quot;')}" tabindex="0">${cat.unit}</span>`
            : cat.unit;

        const header = document.createElement('div');
        header.className = 'leaderboard-header leaderboard-header--sortable';
        header.style.borderLeftColor = cat.color;
        header.title = `Click to sort ${dir ? 'ascending' : 'descending'}`;
        header.innerHTML = `
            <span class="leaderboard-title">${cat.label}</span>
            <span class="leaderboard-unit" style="color:${cat.color}">${season} MLB · ${unitTipMlb}${(minGP > 0 || applyPosFilt) ? ` · ${sorted.length} qualifying` : ''}</span>
            <button class="lb-export-btn" aria-label="Export ${cat.label} as CSV" title="Download CSV" onclick="event.stopPropagation()">↓CSV</button>
            <span class="leaderboard-sort-arrow">${dir ? '▼' : '▲'}</span>
        `;
        header.addEventListener('click', () => {
            if (!AppState._mlbLbSortDir) AppState._mlbLbSortDir = {};
            AppState._mlbLbSortDir[cat.key] = !dir;
            displayMLBLeaderboards();
        });

        setTimeout(() => {
            const exportBtn = panel.querySelector('.lb-export-btn');
            if (exportBtn && typeof exportCSV === 'function') {
                exportBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    const headers = ['Rank', 'Player', 'Team', 'Position', 'GP', cat.unit];
                    const rows = sorted.map((s, i) => {
                        const rawVal = s.stat[cat.key];
                        const numVal = parseFloat(rawVal);
                        const _isBatAvg = cat.decimals === 3;
                        const display = isNaN(numVal) ? rawVal :
                            _isBatAvg ? _fmtAvg(numVal) :
                            cat.decimals > 0 ? numVal.toFixed(cat.decimals) : String(rawVal);
                        return [i+1, s.player?.fullName||'', s.team?.abbreviation||'', s.position?.abbreviation||'', s.stat?.gamesPlayed??'', display];
                    });
                    exportCSV(`mlb-${cat.key}-${season}.csv`, headers, rows);
                });
            }
        }, 0);

        const list = document.createElement('div');
        list.className = 'leaderboard-list';

        const MLB_LB_INIT = 10;

        function _buildMLBLeaderboardRow(split, i) {
            const rawVal  = split.stat[cat.key];
            const numVal  = parseFloat(rawVal);
            const _isBatAvg = cat.decimals === 3;
            const valStr  = isNaN(numVal) ? rawVal :
                _isBatAvg   ? _fmtAvg(numVal) :
                cat.decimals > 0 ? numVal.toFixed(cat.decimals) : String(rawVal);
            const abbr       = split.team?.abbreviation || '';
            const colors     = getMLBTeamColors(abbr);
            const initials   = (split.player?.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
            const headshotUrl = getMLBPlayerHeadshotUrl(split.player?.id);

            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.setAttribute('role', 'button');
            row.setAttribute('tabindex', '0');
            const pid = split.player?.id;
            if (pid) {
                row.addEventListener('click', () => showMLBPlayerDetail(pid));
                row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') showMLBPlayerDetail(pid); });
            }
            row.innerHTML = `
                <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="lb-avatar-initials">${initials}</span>
                </div>
                <div class="lb-player">
                    <span class="lb-name">${split.player?.fullName || '—'}</span>
                    <span class="lb-team">${abbr}${split.position?.abbreviation ? ' · ' + split.position.abbreviation : ''}</span>
                </div>
                <span class="lb-value" style="color:${cat.color}">${valStr}</span>
            `;
            return row;
        }

        if (sorted.length === 0) {
            list.innerHTML = `<p style="color:var(--color-text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
        } else {
            sorted.slice(0, MLB_LB_INIT).forEach((split, i) => {
                list.appendChild(_buildMLBLeaderboardRow(split, i));
            });

            const extra = sorted.slice(MLB_LB_INIT);
            extra.forEach((split, i) => {
                const row = _buildMLBLeaderboardRow(split, MLB_LB_INIT + i);
                row.style.display = 'none';
                row.dataset.extra = '1';
                list.appendChild(row);
            });

            if (extra.length > 0) {
                const moreBtn = document.createElement('button');
                moreBtn.className = 'leaderboard-more-btn';
                moreBtn.textContent = `Show ${extra.length} more`;
                moreBtn.style.cssText = `
                    width:100%;padding:0.5rem;margin-top:0.5rem;background:var(--bg-subtle);
                    border:1px solid var(--border-default);border-radius:var(--radius-sm);
                    color:var(--text-muted);font-size:0.75rem;cursor:pointer;
                    transition:background var(--transition-fast);
                `;
                moreBtn.addEventListener('mouseenter', () => moreBtn.style.background = 'var(--bg-card)');
                moreBtn.addEventListener('mouseleave', () => moreBtn.style.background = 'var(--bg-subtle)');
                moreBtn.addEventListener('click', () => {
                    const hidden = [...list.querySelectorAll('[data-extra]')];
                    const showing = hidden[0]?.style.display !== 'none';
                    hidden.forEach(r => r.style.display = showing ? 'none' : '');
                    moreBtn.textContent = showing ? `Show ${extra.length} more` : 'Show less';
                });
                panel.appendChild(header);
                panel.appendChild(list);
                panel.appendChild(moreBtn);
                fragment.appendChild(panel);
                return;
            }
        }

        panel.appendChild(header);
        panel.appendChild(list);
        fragment.appendChild(panel);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── Local search filter ───────────────────────────────────────

function filterMLBPlayers(term) {
    const q = (term || '').toLowerCase().trim();
    AppState.mlbSearchQuery = q;

    // No query — restore normal group + position view
    if (q.length < 2) {
        displayMLBPlayers(AppState.mlbStatsGroup);
        return;
    }

    // Search across BOTH groups so pitchers are findable while on hitters tab
    const seen    = new Set();
    const results = [];
    ['hitting', 'pitching'].forEach(grp => {
        (AppState.mlbPlayers[grp] || []).forEach(p => {
            if (seen.has(p.id)) return;
            if (
                p.fullName?.toLowerCase().includes(q) ||
                p.teamAbbr?.toLowerCase().includes(q) ||
                p.teamName?.toLowerCase().includes(q)
            ) {
                seen.add(p.id);
                results.push({ ...p, _group: grp });
            }
        });
    });

    _displayMLBSearchResults(results, q);
}

// Clears the search box + query state so filters/group switches start fresh.
function _clearMLBSearch() {
    AppState.mlbSearchQuery = '';
    const box   = document.getElementById('searchBox');
    const clear = document.getElementById('searchClear');
    if (box)   box.value = '';
    if (clear) clear.style.display = 'none';
}

// Renders cross-group search results as cards (position filter is bypassed).
function _displayMLBSearchResults(results, q) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    const el = document.getElementById('resultCount');

    if (results.length === 0) {
        ErrorHandler.renderEmptyState(grid, `No players found matching "${q}"`, '🔍');
        if (el) el.textContent = '0 players found';
        return;
    }

    if (el) el.textContent = `${results.length} player${results.length !== 1 ? 's' : ''} found`;

    const fragment = document.createDocumentFragment();
    results.forEach(player => {
        const grp   = player._group || AppState.mlbStatsGroup;
        const stats = AppState.mlbPlayerStats[grp]?.[player.id];
        const card  = _createMLBPlayerCard(player, stats, grp, null);
        fragment.appendChild(card);
    });
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ── MLB Ticker ────────────────────────────────────────────────

function updateMLBTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) return;

    // Exclude Preview (not-yet-started) games so 0-0 SCH items don't flood the ticker.
    // abstractGameState: 'Preview' | 'Live' | 'Final'
    const scored = (games || []).filter(g =>
        g.status?.abstractGameState !== 'Preview' &&
        g.teams?.home?.score != null &&
        g.teams?.away?.score != null
    );

    if (scored.length === 0) {
        ticker.innerHTML = `<div class="ticker__item">No recent MLB scores — check back during the season</div>`;
        return;
    }

    const items = [...scored, ...scored].map(g => {
        const hs      = g.teams?.home?.score ?? 0;
        const vs      = g.teams?.away?.score ?? 0;
        const ha      = _mlbTeamAbbr(g.teams?.home?.team);
        const va      = _mlbTeamAbbr(g.teams?.away?.team);
        const homeId  = g.teams?.home?.team?.id;
        const awayId  = g.teams?.away?.team?.id;
        const st      = g.status?.detailedState || 'Final';
        const isFinal = st === 'Final';
        const isLive  = g.status?.abstractGameState === 'Live';
        const pillCls = isFinal ? 'final' : isLive ? 'live' : 'sched';
        // For live games show inning from linescore if available
        const inning  = g.linescore?.currentInning ? `${g.linescore.isTopInning ? '▲' : '▼'}${g.linescore.currentInning}` : null;
        const pillLbl = isFinal ? 'F' : isLive ? (inning || 'LIVE') : 'SCH';
        const homeLogo = homeId ? `https://www.mlbstatic.com/team-logos/${homeId}.svg` : null;
        const awayLogo = awayId ? `https://www.mlbstatic.com/team-logos/${awayId}.svg` : null;
        const homeWon  = hs > vs;
        const awayWon  = vs > hs;
        return `
            <div class="ticker__item" data-game-pk="${g.gamePk}" data-sport="mlb" style="cursor:pointer">
                ${homeLogo ? `<img class="ticker-logo" src="${homeLogo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-team">${ha}</span>
                <span class="ticker-score ${homeWon && isFinal ? 'ticker-score--win' : ''}">${hs}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${awayWon && isFinal ? 'ticker-score--win' : ''}">${vs}</span>
                <span class="ticker-team">${va}</span>
                ${awayLogo ? `<img class="ticker-logo" src="${awayLogo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                <span class="ticker-status-pill ticker-status-pill--${pillCls}">${pillLbl}</span>
            </div>
        `;
    }).join('');

    ticker.innerHTML = items;

    // Proportional scroll speed — same logic as NBA ticker in games.js
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) {
            ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
        }
    }));
}

// ── Standings ─────────────────────────────────────────────────

async function fetchMLBStandings(season = MLB_SEASON) {
    const data = await mlbFetch('/standings', {
        leagueId:      '103,104',
        season,
        standingsTypes: 'regularSeason',
    }, ApiCache.TTL.SHORT);
    // Build teamId → record map
    const map = {};
    (data.records || []).forEach(div => {
        (div.teamRecords || []).forEach(tr => {
            map[tr.team.id] = {
                wins:      tr.wins,
                losses:    tr.losses,
                pct:       tr.leagueRecord?.pct ?? '.000',
                gamesBack: tr.gamesBack || '—',
                streak:    tr.streak?.streakCode || '',
            };
        });
    });
    return map;
}

// ── Full Standings (divisional, for Standings view) ──────────

// Division ID → short name: used when the API returns division.name = null (active season)
const _MLB_DIV_ID_MAP = {
    200: 'AL East', 201: 'AL East', 202: 'AL Central', 203: 'AL West',
    204: 'NL East', 205: 'NL Central', 206: 'NL West',
};

async function fetchMLBStandingsFull(season = MLB_SEASON) {
    const data = await mlbFetch('/standings', {
        leagueId:       '103,104',
        season,
        standingsTypes: 'regularSeason',
        hydrate:        'team,league,division,sport,conference,record(overallRecords)',
    }, ApiCache.TTL.SHORT);

    return (data.records || []).map(rec => {
        // For the current/active season the API may return division.name = null;
        // fall back to a hardcoded ID lookup so standings still render.
        const rawName = rec.division?.name || _MLB_DIV_ID_MAP[rec.division?.id] || '';
        const divName = rawName
            .replace('American League ', 'AL ')
            .replace('National League ', 'NL ');
        const league = divName.startsWith('AL') ? 'AL' : 'NL';
        return {
            division: divName,
            league,
            teams: (rec.teamRecords || []).map(tr => {
                const findRec = type => (tr.records?.overallRecords || []).find(r => r.type === type);
                const home   = findRec('home');
                const away   = findRec('away');
                const teamAbbr = tr.team?.abbreviation || '';
                const rs     = tr.runsScored  ?? tr.runs ?? null;
                const ra     = tr.runsAllowed ?? null;
                const rdiff  = rs != null && ra != null ? rs - ra : null;
                return {
                    teamId:   tr.team?.id,
                    teamName: tr.team?.name || teamAbbr,
                    teamAbbr,
                    wins:     tr.wins   ?? 0,
                    losses:   tr.losses ?? 0,
                    pct:      tr.leagueRecord?.pct ?? '.000',
                    gb:       tr.gamesBack          || '—',
                    streak:   tr.streak?.streakCode || '',
                    home:     home   ? `${home.wins}-${home.losses}` : '—',
                    away:     away   ? `${away.wins}-${away.losses}` : '—',
                    rdiff:    rdiff != null ? (rdiff > 0 ? `+${rdiff}` : String(rdiff)) : '—',
                    clinched: tr.clinchIndicator || '',
                    divRank:  parseInt(tr.divisionRank) || 99,
                };
            }).sort((a, b) => a.divRank - b.divRank),
        };
    });
}

let _mlbStandingsLeague = 'AL';

async function loadMLBStandings() {
    const grid = document.getElementById('playersGrid');
    const viewCount = document.getElementById('viewResultCount');
    if (viewCount) viewCount.textContent = 'MLB Standings';
    if (window.setBreadcrumb) setBreadcrumb('mlb-standings', null);

    grid.className = 'standings-container';
    grid.innerHTML = Array.from({ length: 18 }, () =>
        `<div class="skeleton-line" style="height:38px;border-radius:8px;margin-bottom:4px"></div>`
    ).join('');

    try {
        if (!AppState.mlbStandings) {
            AppState.mlbStandings = await fetchMLBStandingsFull();
        }
        displayMLBStandings(AppState.mlbStandings, _mlbStandingsLeague);
    } catch (err) {
        ErrorHandler.handle(grid, err, loadMLBStandings, { tag: 'MLB', title: 'Failed to Load MLB Standings' });
    }
}

function displayMLBStandings(divisions, league = 'AL') {
    _mlbStandingsLeague = league;
    AppState._mlbStandingsLeague = league;
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    const DIV_ORDER = {
        AL: ['AL East', 'AL Central', 'AL West'],
        NL: ['NL East', 'NL Central', 'NL West'],
    };
    const leagueDivs = divisions.filter(d => d.league === league);
    const ordered = (DIV_ORDER[league] || [])
        .map(name => leagueDivs.find(d => d.division === name))
        .filter(Boolean);

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab ${league === 'AL' ? 'active' : ''}"
                onclick="displayMLBStandings(AppState.mlbStandings,'AL')">American League</button>
            <button class="standings-tab ${league === 'NL' ? 'active' : ''}"
                onclick="displayMLBStandings(AppState.mlbStandings,'NL')">National League</button>
            <button class="standings-tab"
                onclick="displayMLBPowerRankings(AppState.mlbStandings)">⚡ Power</button>
        </div>
    `;

    const divsHtml = ordered.map(div => {
        const rowsHtml = div.teams.map((team, idx) => {
            const rank       = idx + 1;
            const streakWin  = team.streak?.startsWith?.('W') ?? false;
            const streakCls  = team.streak
                ? (streakWin ? 'standings-streak--win' : 'standings-streak--loss')
                : '';
            // Rank 1 = division leader (playoff); ranks 2-3 = WC contenders
            const rowCls = rank === 1 ? 'standings-row--playoff' : rank <= 3 ? 'standings-row--playin' : '';

            const clinchBadge = team.clinched === 'z'
                ? `<span class="clinch-badge clinch-badge--div" title="Clinched Division">z</span>`
                : team.clinched === 'x' || team.clinched === 'y'
                ? `<span class="clinch-badge clinch-badge--po" title="Clinched Playoff">x</span>`
                : '';

            const logo = getMLBTeamLogoUrl(team.teamId);
            // Separator between division leader and rest of division
            const sepAfterLeader = rank === 1
                ? `<tr class="standings-sep standings-sep--playoff"><td colspan="10"><span>Wild Card zone</span></td></tr>`
                : '';

            return `
                <tr class="standings-row ${rowCls}" style="cursor:pointer" onclick="showMLBTeamDetail(${team.teamId})">
                    <td class="standings-rank">${rank}</td>
                    <td class="standings-team-cell">
                        ${logo ? `<img class="standings-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>` : ''}
                        <span class="standings-team-name">${team.teamName}</span>
                        ${clinchBadge}
                    </td>
                    <td class="standings-num">${team.wins}</td>
                    <td class="standings-num">${team.losses}</td>
                    <td class="standings-num standings-pct">${team.pct}</td>
                    <td class="standings-num standings-gb">${team.gb}</td>
                    <td class="standings-num standings-rdiff ${team.rdiff?.startsWith?.('+') ? 'standings-rdiff--pos' : team.rdiff !== '—' && !team.rdiff?.startsWith?.('+') && team.rdiff !== '0' ? 'standings-rdiff--neg' : ''}">${team.rdiff}</td>
                    <td class="standings-num ${streakCls}">${team.streak || '—'}</td>
                    <td class="standings-num standings-split">${team.home}</td>
                    <td class="standings-num standings-split">${team.away}</td>
                </tr>
                ${sepAfterLeader}
            `;
        }).join('');

        return `
            <div class="mlb-division-panel">
                <h3 class="mlb-division-title">${div.division}</h3>
                <div class="standings-table-wrap">
                    <table class="standings-table">
                        <thead>
                            <tr>
                                <th class="standings-th-rank">#</th>
                                <th class="standings-th-team">Team</th>
                                <th title="Wins">W</th>
                                <th title="Losses">L</th>
                                <th title="Win percentage">PCT</th>
                                <th title="Games behind">GB</th>
                                <th title="Run differential (runs scored minus runs allowed)">RDIFF</th>
                                <th title="Current streak">STRK</th>
                                <th title="Home record">HOME</th>
                                <th title="Away record">AWAY</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="mlb-standings-grid">${divsHtml}</div>
        <div class="standings-legend">
            <span class="legend-item"><span class="legend-dot legend-dot--playoff"></span>Division Leader</span>
            <span class="legend-item"><span class="legend-dot legend-dot--playin"></span>Wild Card Zone</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--div">z</span>Clinched Division</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--po">x</span>Clinched Playoff</span>
        </div>
    `;
}

// ── MLB Power Rankings ────────────────────────────────────────

function displayMLBPowerRankings(divisions) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    if (!divisions || !divisions.length) {
        grid.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">No standings data available</p>';
        return;
    }

    // Flatten all teams from all divisions
    const allTeams = divisions.flatMap(d => d.teams.map(t => ({ ...t, division: d.division })));

    // Normalise RDIFF: parse "+12" / "-5" / "—" → number, then scale to 0..1
    const rdiffs = allTeams
        .map(t => parseFloat(t.rdiff))
        .filter(n => !isNaN(n));
    const rdiffMin = Math.min(...rdiffs, 0);
    const rdiffMax = Math.max(...rdiffs, 1);

    const _mlbPowerScore = t => {
        const gp      = t.wins + t.losses;
        const winPct  = gp > 0 ? t.wins / gp : 0;
        const rd      = parseFloat(t.rdiff);
        const rdFact  = isNaN(rd) ? winPct
            : rdiffMax !== rdiffMin ? (rd - rdiffMin) / (rdiffMax - rdiffMin) : 0.5;
        const strNum  = typeof _parseStreak === 'function' ? _parseStreak(t.streak) : 0;
        const strFact = (strNum + 10) / 20;
        return winPct * 0.60 + rdFact * 0.25 + strFact * 0.15;
    };

    const scored = allTeams
        .map(t => ({ ...t, _score: _mlbPowerScore(t) }))
        .sort((a, b) => b._score - a._score);

    const maxScore = scored[0]._score || 1;

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'AL')">American League</button>
            <button class="standings-tab" onclick="displayMLBStandings(AppState.mlbStandings,'NL')">National League</button>
            <button class="standings-tab active">⚡ Power</button>
        </div>
    `;

    const rowsHtml = scored.map((team, idx) => {
        const rank      = idx + 1;
        const gp        = team.wins + team.losses;
        const winPct    = gp > 0 ? (team.wins / gp).toFixed(3) : '.000';
        const strNum    = typeof _parseStreak === 'function' ? _parseStreak(team.streak) : 0;
        const streakClr = strNum >= 3 ? 'var(--color-win)' : strNum <= -3 ? 'var(--color-loss)' : 'var(--text-muted)';
        const logo      = getMLBTeamLogoUrl(team.teamId);
        const barW      = (team._score / maxScore * 100).toFixed(1);

        const heat = team._score >= 0.65 ? { icon: '🔥', label: 'HOT',   cls: 'power-heat--hot'  }
                   : team._score >= 0.52 ? { icon: '📈', label: 'SOLID', cls: 'power-heat--solid' }
                   : team._score >= 0.40 ? { icon: '➡️',  label: 'MID',   cls: 'power-heat--mid'  }
                   :                       { icon: '❄️',  label: 'COLD',  cls: 'power-heat--cold'  };

        const divShort = team.division.replace('American League ', 'AL ').replace('National League ', 'NL ');
        const leagueCls = divShort.startsWith('AL') ? 'power-conf--east' : 'power-conf--west';

        return `
            <div class="power-row power-row--mlb" style="cursor:pointer" onclick="showMLBTeamDetail(${team.teamId})">
                <div class="power-rank">${rank}</div>
                ${logo ? `<img class="power-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>` : '<div class="power-logo"></div>'}
                <div class="power-team">
                    <div class="power-team-name">${team.teamName} <span class="power-conf ${leagueCls}">${divShort.slice(0, 2)}</span></div>
                    <div class="power-bar-wrap">
                        <div class="power-bar-fill" style="width:${barW}%"></div>
                    </div>
                </div>
                <div class="power-record">${team.wins}–${team.losses}<span class="power-pct">${winPct}</span></div>
                <div class="power-streak" style="color:${streakClr}">${team.streak || '—'}</div>
                <div class="power-heat ${heat.cls}">${heat.icon} ${heat.label}</div>
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="power-header-row power-header-row--mlb">
            <div></div><div></div>
            <div class="power-col-label">Team</div>
            <div class="power-col-label">Record</div>
            <div class="power-col-label">Streak</div>
            <div class="power-col-label">Form</div>
        </div>
        <div class="power-list">${rowsHtml}</div>
        <p class="power-note">Power score = Win% (60%) + Run Differential (25%) + Streak (15%)</p>
    `;
}

// ── MLB Player Compare (PREM-004) ─────────────────────────────

const _MLB_CMP_HIT = [
    { key: 'avg',         label: 'AVG',  d: 3, lead: true },
    { key: 'obp',         label: 'OBP',  d: 3, lead: true },
    { key: 'slg',         label: 'SLG',  d: 3, lead: true },
    { key: 'ops',         label: 'OPS',  d: 3, lead: true },
    { key: 'homeRuns',    label: 'HR',   d: 0 },
    { key: 'rbi',         label: 'RBI',  d: 0 },
    { key: 'stolenBases', label: 'SB',   d: 0 },
    { key: 'strikeOuts',  label: 'K',    d: 0, lower: true },
];
const _MLB_CMP_PIT = [
    { key: 'era',             label: 'ERA',  d: 2, lower: true },
    { key: 'whip',            label: 'WHIP', d: 2, lower: true },
    { key: 'strikeoutsPer9Inn', label: 'K/9', d: 1 },
    { key: 'walksPer9Inn',    label: 'BB/9', d: 1, lower: true },
    { key: 'strikeOuts',      label: 'K',    d: 0 },
    { key: 'wins',            label: 'W',    d: 0 },
    { key: 'inningsPitched',  label: 'IP',   d: 1 },
    { key: 'saves',           label: 'SV',   d: 0 },
];

function _mlbCompareCard(currentPlayer, group) {
    const pool = AppState.mlbPlayers?.[group] || [];
    if (!pool.length) return '';

    const sortKey = group === 'hitting' ? 'ops' : 'era';
    const opts = pool
        .filter(p => p.id !== currentPlayer.id)
        .sort((a, b) => {
            const av = parseFloat(AppState.mlbPlayerStats?.[group]?.[a.id]?.[sortKey] || (group === 'hitting' ? 0 : 99));
            const bv = parseFloat(AppState.mlbPlayerStats?.[group]?.[b.id]?.[sortKey] || (group === 'hitting' ? 0 : 99));
            return group === 'hitting' ? bv - av : av - bv;
        })
        .map(p => `<option value="${p.id}">${_escHtml(p.fullName || '—')} · ${_escHtml(p.teamAbbr || '—')}</option>`)
        .join('');

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Compare Players</h2>
            <div class="mlb-cmp-selects">
                <select id="mlb-cmp-select-b" class="compare-select">
                    <option value="">— Add player 2 —</option>
                    ${opts}
                </select>
                <select id="mlb-cmp-select-c" class="compare-select">
                    <option value="">— Add player 3 —</option>
                    ${opts}
                </select>
            </div>
            <div id="mlb-cmp-wrap" style="display:none;margin-top:1rem">
                <div style="position:relative;height:280px"><canvas id="mlb-cmp-radar"></canvas></div>
                <div id="mlb-cmp-table" class="compare-table-wrap"></div>
            </div>
        </div>
    `;
}

function _onMLBCompareChange(playerA, statsA, group, colorsA) {
    const selB  = document.getElementById('mlb-cmp-select-b');
    const selC  = document.getElementById('mlb-cmp-select-c');
    const wrap  = document.getElementById('mlb-cmp-wrap');
    if (!selB || !wrap) return;

    const idB = parseInt(selB.value) || null;
    const idC = parseInt(selC?.value) || null;

    if (!idB) { wrap.style.display = 'none'; return; }

    const playerB  = (AppState.mlbPlayers?.[group] || []).find(p => p.id === idB);
    const statsB   = AppState.mlbPlayerStats?.[group]?.[idB];
    const playerC  = idC ? (AppState.mlbPlayers?.[group] || []).find(p => p.id === idC) : null;
    const statsC   = idC ? AppState.mlbPlayerStats?.[group]?.[idC] : null;

    if (!playerB || !statsB) { wrap.style.display = 'none'; return; }

    wrap.style.display = 'block';

    const colorsB = getMLBTeamColors(playerB.teamAbbr);
    const colorsC = playerC ? getMLBTeamColors(playerC.teamAbbr) : null;

    // Radar datasets
    const _radarData = (s) => group === 'hitting' ? {
        avg:         parseFloat(s.avg)         || 0,
        homeRuns:    s.homeRuns                || 0,
        rbi:         s.rbi                     || 0,
        obp:         parseFloat(s.obp)         || 0,
        slg:         parseFloat(s.slg)         || 0,
        stolenBases: s.stolenBases             || 0,
    } : {
        era:  parseFloat(s.era)              || 0,
        k9:   parseFloat(s.strikeoutsPer9Inn) || 0,
        bb9:  parseFloat(s.walksPer9Inn)      || 0,
        whip: parseFloat(s.whip)              || 0,
        ip:   parseFloat(s.inningsPitched)    || 0,
    };

    const datasets = [
        { label: playerA.fullName, data: _radarData(statsA), color: colorsA.primary },
        { label: playerB.fullName, data: _radarData(statsB), color: colorsB.primary },
    ];
    if (playerC && statsC) datasets.push({ label: playerC.fullName, data: _radarData(statsC), color: colorsC?.primary || '#f472b6' });

    requestAnimationFrame(() => {
        StatsCharts.mlbRadar('mlb-cmp-radar', datasets, group);
    });

    // Stat table
    const statDefs = group === 'hitting' ? _MLB_CMP_HIT : _MLB_CMP_PIT;
    const _fmtVal = (s, def) => {
        const raw = parseFloat(s?.[def.key]);
        if (isNaN(raw)) return '—';
        const str = raw.toFixed(def.d);
        return def.lead ? str.replace(/^0\./, '.') : str;
    };

    const players  = [{ p: playerA, s: statsA, clr: colorsA.primary }, { p: playerB, s: statsB, clr: colorsB.primary }];
    if (playerC && statsC) players.push({ p: playerC, s: statsC, clr: colorsC?.primary || '#f472b6' });

    const thead = `<tr>
        <th class="cmp-th-a" style="color:${players[0].clr}">${_escHtml(playerA.fullName)}</th>
        <th class="cmp-th-mid">Stat</th>
        <th class="cmp-th-b" style="color:${players[1].clr}">${_escHtml(playerB.fullName)}</th>
        ${players[2] ? `<th class="cmp-th-b" style="color:${players[2].clr}">${_escHtml(playerC.fullName)}</th>` : ''}
    </tr>`;

    const tbody = statDefs.map(def => {
        const vals = players.map(({ s }) => parseFloat(s?.[def.key]));
        const best = vals.reduce((bst, v, i) => {
            if (isNaN(v)) return bst;
            if (bst === -1) return i;
            const bv = vals[bst];
            return def.lower ? (v < bv ? i : bst) : (v > bv ? i : bst);
        }, -1);
        const cells = players.map(({ s, clr }, i) => {
            const disp = _fmtVal(s, def);
            const win  = i === best && !isNaN(vals[i]);
            return `<td class="cmp-val-a ${win ? 'cmp-winner' : ''}" style="${win ? `color:${clr}` : ''}">${disp}</td>`;
        }).join('');
        return `<tr class="cmp-row"><td class="cmp-stat-lbl-cell">${def.label}</td>${cells}</tr>`;
    }).join('');

    const tableEl = document.getElementById('mlb-cmp-table');
    if (tableEl) {
        tableEl.innerHTML = `<table class="cmp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
    }
}

// ── Standings lookup helper ───────────────────────────────────

function _standingsTeam(teamId) {
    if (!teamId || !AppState.mlbStandings) return null;
    for (const div of AppState.mlbStandings) {
        const found = div.teams.find(t => t.teamId === teamId);
        if (found) return found;
    }
    return null;
}

// ── Share Card download helper ────────────────────────────────

function _downloadMLBCard(playerId, group) {
    const player = (AppState.mlbPlayers?.[group] || []).find(p => p.id === playerId);
    const stats  = AppState.mlbPlayerStats?.[group]?.[playerId];
    if (!player || !stats) return;
    const colors = getMLBTeamColors(player.teamAbbr);
    StatsCharts.downloadShareCard(player, stats, group, colors);
}

// ── Game Prep View (ANN-001) ──────────────────────────────────

async function displayGamePrep() {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.style.cssText = 'display:block;';

    grid.innerHTML = `
        <div class="prep-page-wrap">
            <h1 class="prep-page-title">Game Prep</h1>
            <p class="prep-page-sub">Select a game to generate a broadcast prep sheet</p>
            <div class="skeleton-line" style="height:80px;border-radius:12px;margin-bottom:0.75rem"></div>
            <div class="skeleton-line" style="height:80px;border-radius:12px;margin-bottom:0.75rem"></div>
            <div class="skeleton-line" style="height:80px;border-radius:12px"></div>
        </div>
    `;

    const todayStr = _mlbDateString(0);
    let games;
    try {
        const data = await mlbFetch('/schedule', {
            sportId:  1,
            date:     todayStr,
            hydrate:  'team,probablePitcher,linescore',
            gameType: 'R,F,D,L,W',
        }, ApiCache.TTL.SHORT);
        games = (data.dates || []).flatMap(d => d.games || []);
    } catch (_) {
        grid.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚾</div><p class="empty-state-title">Could not load today's schedule</p></div>`;
        return;
    }

    if (!games.length) {
        grid.innerHTML = `<div class="prep-page-wrap"><h1 class="prep-page-title">Game Prep</h1><div class="empty-state"><div class="empty-state-icon">⚾</div><p class="empty-state-title">No games scheduled today</p><p style="color:var(--text-muted);font-size:0.85rem">${todayStr}</p></div></div>`;
        return;
    }

    const cards = games.map(g => {
        const away      = g.teams?.away;
        const home      = g.teams?.home;
        const awayAbbr  = away?.team?.abbreviation || '???';
        const homeAbbr  = home?.team?.abbreviation || '???';
        const awayClr   = getMLBTeamColors(awayAbbr);
        const homeClr   = getMLBTeamColors(homeAbbr);
        const awayLogo  = away?.team?.id ? getMLBTeamLogoUrl(away.team.id) : '';
        const homeLogo  = home?.team?.id ? getMLBTeamLogoUrl(home.team.id) : '';
        const awayPP    = away?.probablePitcher;
        const homePP    = home?.probablePitcher;
        const awayRec   = away?.leagueRecord ? `${away.leagueRecord.wins}-${away.leagueRecord.losses}` : '';
        const homeRec   = home?.leagueRecord ? `${home.leagueRecord.wins}-${home.leagueRecord.losses}` : '';
        const status    = g.status?.abstractGameState;
        const gameTime  = g.gameDate ? new Date(g.gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }) : '';
        const statusTxt = status === 'Live' ? '🔴 LIVE' : status === 'Final' ? 'Final' : gameTime;

        return `
            <button class="prep-game-card" onclick="_openGamePrepSheet(${g.gamePk},${away?.team?.id},${home?.team?.id},${awayPP?.id || 'null'},${homePP?.id || 'null'})">
                <div class="prep-gc-team">
                    ${awayLogo ? `<img src="${awayLogo}" alt="${awayAbbr}" class="prep-gc-logo" loading="lazy" data-hide-on-error>` : ''}
                    <div class="prep-gc-info">
                        <span class="prep-gc-abbr" style="color:${awayClr.primary}">${awayAbbr}</span>
                        <span class="prep-gc-rec">${awayRec}</span>
                        <span class="prep-gc-pitcher">P: ${_escHtml(awayPP?.fullName || 'TBD')}</span>
                    </div>
                </div>
                <div class="prep-gc-mid">
                    <span class="prep-gc-at">@</span>
                    <span class="prep-gc-status">${statusTxt}</span>
                    <span class="prep-gc-cta">Prep →</span>
                </div>
                <div class="prep-gc-team prep-gc-team--home">
                    <div class="prep-gc-info prep-gc-info--home">
                        <span class="prep-gc-abbr" style="color:${homeClr.primary}">${homeAbbr}</span>
                        <span class="prep-gc-rec">${homeRec}</span>
                        <span class="prep-gc-pitcher">P: ${_escHtml(homePP?.fullName || 'TBD')}</span>
                    </div>
                    ${homeLogo ? `<img src="${homeLogo}" alt="${homeAbbr}" class="prep-gc-logo" loading="lazy" data-hide-on-error>` : ''}
                </div>
            </button>
        `;
    }).join('');

    grid.innerHTML = `
        <div class="prep-page-wrap">
            <h1 class="prep-page-title">Game Prep</h1>
            <p class="prep-page-sub">Select a game · ${todayStr}</p>
            <div class="prep-game-list">${cards}</div>
        </div>
    `;
}

async function _openGamePrepSheet(gamePk, awayTeamId, homeTeamId, awayPitcherId, homePitcherId) {
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = `
        <div class="prep-sheet">
            <div class="prep-sheet-toolbar no-print">
                <button class="back-button" onclick="displayGamePrep()">← All Games</button>
            </div>
            <div class="skeleton-line" style="height:120px;border-radius:16px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:160px;border-radius:12px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:200px;border-radius:12px;margin-bottom:1rem"></div>
            <div class="skeleton-line" style="height:200px;border-radius:12px"></div>
        </div>
    `;

    // Parallel fetches — include probable pitcher stats if not already in AppState
    const _needsPP = id => id && !AppState.mlbPlayerStats?.pitching?.[id];
    const [gameRes, awayBatRes, awayPitRes, homeBatRes, homePitRes, awayPPRes, homePPRes] = await Promise.allSettled([
        mlbFetch(`/game/${gamePk}/feed/live`, {}, ApiCache.TTL.SHORT),
        mlbFetch(`/teams/${awayTeamId}/stats`, { stats: 'season', group: 'hitting',  season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${awayTeamId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${homeTeamId}/stats`, { stats: 'season', group: 'hitting',  season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        mlbFetch(`/teams/${homeTeamId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM),
        _needsPP(awayPitcherId) ? mlbFetch(`/people/${awayPitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
        _needsPP(homePitcherId) ? mlbFetch(`/people/${homePitcherId}/stats`, { stats: 'season', group: 'pitching', season: MLB_SEASON }, ApiCache.TTL.MEDIUM) : Promise.resolve(null),
    ]);

    // Cache fetched pitcher stats into AppState so _pitcherCard can find them
    const _cachePPStats = (id, res) => {
        if (!id || res.status !== 'fulfilled' || !res.value) return;
        const stat = res.value?.stats?.[0]?.splits?.[0]?.stat;
        if (stat) {
            if (!AppState.mlbPlayerStats.pitching) AppState.mlbPlayerStats.pitching = {};
            AppState.mlbPlayerStats.pitching[id] = stat;
        }
    };
    _cachePPStats(awayPitcherId, awayPPRes);
    _cachePPStats(homePitcherId, homePPRes);

    const gameData   = gameRes.status === 'fulfilled' ? gameRes.value : {};
    const gameInfo   = gameData?.gameData || {};
    const awayTeam   = gameInfo?.teams?.away || {};
    const homeTeam   = gameInfo?.teams?.home || {};
    const awayAbbr   = awayTeam?.abbreviation || '???';
    const homeAbbr   = homeTeam?.abbreviation || '???';
    const awayClr    = getMLBTeamColors(awayAbbr);
    const homeClr    = getMLBTeamColors(homeAbbr);
    const awayLogo   = awayTeamId ? getMLBTeamLogoUrl(awayTeamId) : '';
    const homeLogo   = homeTeamId ? getMLBTeamLogoUrl(homeTeamId) : '';
    const venue      = gameInfo?.venue?.name || '';
    const gameDate   = gameInfo?.datetime?.dateTime;
    const dateFmt    = gameDate ? new Date(gameDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York' }) : '';
    const timeFmt    = gameDate ? new Date(gameDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short' }) : '';
    const awayPPInfo = gameInfo?.probablePitchers?.away;
    const homePPInfo = gameInfo?.probablePitchers?.home;

    const _teamStat = res => (res.status === 'fulfilled' ? res.value?.stats?.[0]?.splits?.[0]?.stat : null) || {};
    const awayBat = _teamStat(awayBatRes);
    const homeBat = _teamStat(homeBatRes);
    const awayPit = _teamStat(awayPitRes);
    const homePit = _teamStat(homePitRes);

    const _fmt  = (v, d = 2) => v != null ? parseFloat(v).toFixed(d) : '—';
    const _lead = v => v != null ? parseFloat(v).toFixed(3).replace(/^0\./, '.') : '—';

    const _pitcherCard = (ppInfo, fallbackId) => {
        const info    = ppInfo || {};
        const pid     = info.id || fallbackId;
        const name    = info.fullName || (pid ? 'Probable Pitcher' : 'TBD');
        const pStats  = AppState.mlbPlayerStats?.pitching?.[pid] || {};
        const hs      = pid ? getMLBPlayerHeadshotUrl(pid) : '';
        const avatar  = hs
            ? `<img src="${hs}" alt="${_escHtml(name)}" class="prep-pp-hs" loading="lazy" data-hide-on-error>`
            : `<div class="prep-pp-avatar">${_escHtml((name[0] || '?').toUpperCase())}</div>`;
        const wins   = pStats.wins   ?? '—';
        const losses = pStats.losses ?? '—';
        const rec    = wins !== '—' ? `${wins}-${losses}` : '';
        return `
            <div class="prep-pp-card">
                <div class="prep-pp-top">
                    ${avatar}
                    <div>
                        <div class="prep-pp-name">${_escHtml(name)}</div>
                        ${rec ? `<div class="prep-pp-rec">${rec}</div>` : ''}
                    </div>
                </div>
                <div class="prep-pp-stats">
                    <div class="prep-pp-stat"><span class="prep-pp-val">${_fmt(pStats.era, 2)}</span><span class="prep-pp-lbl">ERA</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${_fmt(pStats.whip, 2)}</span><span class="prep-pp-lbl">WHIP</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.strikeoutsPer9Inn ? _fmt(pStats.strikeoutsPer9Inn, 1) : '—'}</span><span class="prep-pp-lbl">K/9</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.strikeOuts ?? '—'}</span><span class="prep-pp-lbl">K</span></div>
                    <div class="prep-pp-stat"><span class="prep-pp-val">${pStats.inningsPitched ?? '—'}</span><span class="prep-pp-lbl">IP</span></div>
                </div>
            </div>
        `;
    };

    const _cmpRow = (awayVal, lbl, homeVal, highlight = false) => {
        const cls = highlight ? ' prep-cmp-row--highlight' : '';
        return `
            <div class="prep-cmp-row${cls}">
                <span class="prep-cmp-val">${awayVal}</span>
                <span class="prep-cmp-lbl">${lbl}</span>
                <span class="prep-cmp-val">${homeVal}</span>
            </div>
        `;
    };

    const _keyHitters = teamId => {
        const top = (AppState.mlbPlayers?.hitting || [])
            .filter(p => p.teamId === teamId)
            .map(p => ({ ...p, _ops: parseFloat(AppState.mlbPlayerStats?.hitting?.[p.id]?.ops || 0) }))
            .filter(p => p._ops > 0)
            .sort((a, b) => b._ops - a._ops)
            .slice(0, 4);

        if (!top.length) return `<p class="prep-no-hitters">Open Players view to populate key hitters</p>`;

        return top.map(p => {
            const s   = AppState.mlbPlayerStats?.hitting?.[p.id] || {};
            const hs  = getMLBPlayerHeadshotUrl(p.id);
            const img = hs
                ? `<img src="${hs}" alt="" class="prep-hitter-hs" loading="lazy" data-hide-on-error>`
                : `<div class="prep-hitter-init">${_escHtml((p.fullName || '?')[0])}</div>`;
            return `
                <div class="prep-hitter-row" onclick="showMLBPlayerDetail(${p.id},'hitting')" role="button" tabindex="0">
                    ${img}
                    <div class="prep-hitter-info">
                        <span class="prep-hitter-name">${_escHtml(p.fullName || '—')}</span>
                        <span class="prep-hitter-pos">${p.position || ''}</span>
                    </div>
                    <div class="prep-hitter-stats">
                        <span>${_lead(s.avg)}</span>
                        <span>${s.homeRuns ?? '—'} HR</span>
                        <span>${_lead(s.ops)} OPS</span>
                    </div>
                </div>
            `;
        }).join('');
    };

    const awayRec = awayTeam?.record ? `${awayTeam.record.wins}–${awayTeam.record.losses}` : '';
    const homeRec = homeTeam?.record ? `${homeTeam.record.wins}–${homeTeam.record.losses}` : '';

    // Enrich from standings if loaded
    const awaySt = _standingsTeam(awayTeamId);
    const homeSt = _standingsTeam(homeTeamId);
    const _formBadge = st => {
        if (!st) return '';
        const parts = [];
        if (st.streak) {
            const isW = st.streak.startsWith('W');
            parts.push(`<span class="prep-form-badge prep-form-badge--${isW ? 'w' : 'l'}">${_escHtml(st.streak)}</span>`);
        }
        if (st.rdiff && st.rdiff !== '—') {
            const pos = st.rdiff.startsWith('+');
            parts.push(`<span class="prep-form-badge prep-form-badge--${pos ? 'pos' : 'neg'}" title="Run differential">${_escHtml(st.rdiff)} R</span>`);
        }
        if (st.home) parts.push(`<span class="prep-form-tag" title="Home record">🏠 ${st.home}</span>`);
        if (st.away) parts.push(`<span class="prep-form-tag" title="Away record">✈ ${st.away}</span>`);
        return parts.length ? `<div class="prep-form-strip">${parts.join('')}</div>` : '';
    };

    grid.innerHTML = `
        <div class="prep-sheet">
            <div class="prep-sheet-toolbar no-print">
                <button class="back-button" onclick="displayGamePrep()">← All Games</button>
                <button class="prep-print-btn" onclick="window.print()">🖨 Print</button>
            </div>

            <div class="prep-matchup-hdr">
                <div class="prep-mh-team" style="border-left:4px solid ${awayClr.primary}">
                    ${awayLogo ? `<img src="${awayLogo}" alt="${awayAbbr}" class="prep-mh-logo" loading="lazy" data-hide-on-error>` : ''}
                    <div>
                        <div class="prep-mh-city">${_escHtml(awayTeam.locationName || '')}</div>
                        <div class="prep-mh-name">${_escHtml(awayTeam.teamName || awayAbbr)}</div>
                        <div class="prep-mh-rec">${awayRec}</div>
                        ${_formBadge(awaySt)}
                    </div>
                </div>
                <div class="prep-mh-center">
                    <div class="prep-mh-vs">@</div>
                    <div class="prep-mh-time">${timeFmt}</div>
                    <div class="prep-mh-venue">${_escHtml(venue)}</div>
                    <div class="prep-mh-date">${dateFmt}</div>
                </div>
                <div class="prep-mh-team prep-mh-team--home" style="border-right:4px solid ${homeClr.primary}">
                    <div class="prep-mh-team-info--home">
                        <div class="prep-mh-city">${_escHtml(homeTeam.locationName || '')}</div>
                        <div class="prep-mh-name">${_escHtml(homeTeam.teamName || homeAbbr)}</div>
                        <div class="prep-mh-rec">${homeRec}</div>
                        ${_formBadge(homeSt)}
                    </div>
                    ${homeLogo ? `<img src="${homeLogo}" alt="${homeAbbr}" class="prep-mh-logo" loading="lazy" data-hide-on-error>` : ''}
                </div>
            </div>

            <div class="prep-section">
                <div class="prep-section-title">⚾ Probable Pitchers</div>
                <div class="prep-two-col">
                    ${_pitcherCard(awayPPInfo, awayPitcherId)}
                    <div class="prep-divider"></div>
                    ${_pitcherCard(homePPInfo, homePitcherId)}
                </div>
            </div>

            <div class="prep-section">
                <div class="prep-section-title">🏏 Team Batting</div>
                <div class="prep-cmp-header">
                    <span class="prep-cmp-team-lbl" style="color:${awayClr.primary}">${awayAbbr}</span>
                    <span></span>
                    <span class="prep-cmp-team-lbl" style="color:${homeClr.primary}">${homeAbbr}</span>
                </div>
                ${_cmpRow(_lead(awayBat.avg),  'AVG',  _lead(homeBat.avg),  true)}
                ${_cmpRow(_lead(awayBat.obp),  'OBP',  _lead(homeBat.obp))}
                ${_cmpRow(_lead(awayBat.slg),  'SLG',  _lead(homeBat.slg))}
                ${_cmpRow(_lead(awayBat.ops),  'OPS',  _lead(homeBat.ops),  true)}
                ${_cmpRow(awayBat.homeRuns ?? '—', 'HR',  homeBat.homeRuns ?? '—')}
                ${_cmpRow(awayBat.runs ?? '—',     'R',   homeBat.runs ?? '—')}
                ${_cmpRow(awayBat.stolenBases ?? '—', 'SB', homeBat.stolenBases ?? '—')}
                ${_cmpRow(awayBat.strikeOuts ?? '—', 'K',  homeBat.strikeOuts ?? '—')}
            </div>

            <div class="prep-section">
                <div class="prep-section-title">⚡ Team Pitching</div>
                <div class="prep-cmp-header">
                    <span class="prep-cmp-team-lbl" style="color:${awayClr.primary}">${awayAbbr}</span>
                    <span></span>
                    <span class="prep-cmp-team-lbl" style="color:${homeClr.primary}">${homeAbbr}</span>
                </div>
                ${_cmpRow(_fmt(awayPit.era, 2),  'ERA',  _fmt(homePit.era, 2),  true)}
                ${_cmpRow(_fmt(awayPit.whip, 2), 'WHIP', _fmt(homePit.whip, 2))}
                ${_cmpRow(awayPit.strikeoutsPer9Inn ? _fmt(awayPit.strikeoutsPer9Inn, 1) : '—', 'K/9', homePit.strikeoutsPer9Inn ? _fmt(homePit.strikeoutsPer9Inn, 1) : '—')}
                ${_cmpRow(awayPit.strikeOuts ?? '—', 'K',  homePit.strikeOuts ?? '—')}
                ${_cmpRow(awayPit.saves ?? '—',      'SV', homePit.saves ?? '—')}
            </div>

            <div class="prep-section">
                <div class="prep-section-title">⭐ Key Hitters</div>
                <div class="prep-two-col">
                    <div class="prep-hitters-col">
                        <div class="prep-hitters-lbl" style="color:${awayClr.primary}">
                            ${awayLogo ? `<img src="${awayLogo}" alt="" style="width:16px;height:16px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                            ${awayAbbr}
                        </div>
                        ${_keyHitters(awayTeamId)}
                    </div>
                    <div class="prep-divider"></div>
                    <div class="prep-hitters-col">
                        <div class="prep-hitters-lbl" style="color:${homeClr.primary}">
                            ${homeLogo ? `<img src="${homeLogo}" alt="" style="width:16px;height:16px;object-fit:contain" loading="lazy" data-hide-on-error>` : ''}
                            ${homeAbbr}
                        </div>
                        ${_keyHitters(homeTeamId)}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── State initialisation (runs immediately on script load) ────
Object.assign(AppState, {
    currentSport:          'nba',
    mlbTeams:              [],
    mlbPlayers:            { hitting: [], pitching: [] },
    mlbPlayerStats:        { hitting: {}, pitching: {} },
    mlbGames:              [],
    mlbStatsGroup:         'hitting',
    mlbPositionFilter:     'all',
    mlbSearchQuery:        '',
    mlbLeaderMinGP:        0,
    mlbLeaderPosition:     'all',
    mlbLeaderSeason:       null,   // null = use MLB_SEASON default
    mlbLeaderSplits:       null,
    mlbStandings:          null,
    _mlbStandingsLeague:   'AL',
    _mlbTeamRecentGames:   {},
    _mlbTeamRosters:       {},
});

function setMLBSeason(year) { MLB_SEASON = year; }

if (typeof window !== 'undefined') {
    window.MLB_SEASON              = MLB_SEASON;
    window.setMLBSeason            = setMLBSeason;
    window.fetchMLBLeagueStats     = fetchMLBLeagueStats;
    window.loadMLBPlayers          = loadMLBPlayers;
    window.displayMLBPlayers       = displayMLBPlayers;
    window.filterMLBPlayers        = filterMLBPlayers;
    window.setMLBPlayerView        = setMLBPlayerView;
    window.showMLBPlayerDetail     = showMLBPlayerDetail;
    window.backToMLBPlayers        = backToMLBPlayers;
    window.loadMLBGames            = loadMLBGames;
    window.displayMLBGames         = displayMLBGames;
    window.updateMLBTicker         = updateMLBTicker;
    window.loadMLBTeams            = loadMLBTeams;
    window.displayMLBTeams         = displayMLBTeams;
    window.showMLBTeamDetail       = showMLBTeamDetail;
    window.backToMLBTeams          = backToMLBTeams;
    window.loadMLBLeaderboards     = loadMLBLeaderboards;
    window.displayMLBLeaderboards  = displayMLBLeaderboards;
    window.loadMLBStandings          = loadMLBStandings;
    window.displayMLBStandings       = displayMLBStandings;
    window.displayMLBPowerRankings   = displayMLBPowerRankings;
    window.getMLBTeamColors        = getMLBTeamColors;
    window._renderMLBGroupToggle   = _renderMLBGroupToggle;
    window.displayGamePrep         = displayGamePrep;
    window._openGamePrepSheet      = _openGamePrepSheet;
    window._downloadMLBCard        = _downloadMLBCard;
}
