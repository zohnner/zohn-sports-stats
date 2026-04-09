// ============================================================
// MLB — players, teams, games, leaderboards
// Official MLB Stats API: https://statsapi.mlb.com/api/v1
// ============================================================

let MLB_SEASON = new Date().getMonth() >= 2 && new Date().getMonth() <= 9  // Mar–Oct = current season
    ? new Date().getFullYear()
    : new Date().getFullYear() - 1;   // Nov–Feb = previous completed season

// ── Team colours ─────────────────────────────────────────────
const MLB_TEAM_COLORS = {
    'ATH': { primary: '#003831', secondary: '#EFB21E' },
    'TOR': { primary: '#134A8E', secondary: '#E8291C' },
    'ATL': { primary: '#CE1141', secondary: '#13274F' },
    'MIL': { primary: '#12284B', secondary: '#FFC52F' },
    'STL': { primary: '#C41E3A', secondary: '#FEDB00' },
    'CHC': { primary: '#0E3386', secondary: '#CC3433' },
    'ARI': { primary: '#A71930', secondary: '#E3D4AD' },
    'LAD': { primary: '#005A9C', secondary: '#EF3E42' },
    'SFG': { primary: '#FD5A1E', secondary: '#27251F' },
    'COL': { primary: '#33006F', secondary: '#C4CED4' },
    'SDP': { primary: '#2F241D', secondary: '#FFC425' },
    'SEA': { primary: '#0C2C56', secondary: '#005C5C' },
    'HOU': { primary: '#002D62', secondary: '#EB6E1F' },
    'LAA': { primary: '#BA0021', secondary: '#003263' },
    'TEX': { primary: '#003278', secondary: '#C0111F' },
    'MIN': { primary: '#002B5C', secondary: '#D31145' },
    'DET': { primary: '#0C2C56', secondary: '#FA4616' },
    'CLE': { primary: '#00385D', secondary: '#E50022' },
    'KCR': { primary: '#004687', secondary: '#C09A5B' },
    'CHW': { primary: '#27251F', secondary: '#C4CED3' },
    'NYY': { primary: '#132448', secondary: '#C4CED3' },
    'BOS': { primary: '#BD3039', secondary: '#0C2340' },
    'TBR': { primary: '#092C5C', secondary: '#8FBCE6' },
    'BAL': { primary: '#DF4601', secondary: '#000000' },
    'NYM': { primary: '#002D72', secondary: '#FF5910' },
    'PHI': { primary: '#E81828', secondary: '#002D72' },
    'WSH': { primary: '#AB0003', secondary: '#14225A' },
    'MIA': { primary: '#00A3E0', secondary: '#EF3340' },
    'PIT': { primary: '#27251F', secondary: '#FDB827' },
    'CIN': { primary: '#C6011F', secondary: '#000000' },
};

function getMLBTeamColors(abbr) {
    return MLB_TEAM_COLORS[abbr] || { primary: '#334155', secondary: '#64748b' };
}

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
    const res = await fetch(url.toString());
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
        Logger.error('Failed to load MLB players', error, 'MLB');
        ErrorHandler.renderErrorState(grid, error, loadMLBPlayers);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load MLB Players' });
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
            AppState.mlbStatsGroup = group;
            mlbTableSortField = group === 'hitting' ? 'avg' : 'era';
            mlbTableSortDir   = group === 'hitting' ? 'desc' : 'asc';
            document.querySelectorAll('[data-group]').forEach(b =>
                _styleMLBGroupBtn(b, b.dataset.group === group)
            );
            // Remove existing toggle before reloading (loadMLBPlayers checks for it)
            document.getElementById('mlbGroupToggle')?.remove();
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

function displayMLBPlayers(group = AppState.mlbStatsGroup) {
    if (mlbPlayerViewMode === 'table') {
        displayMLBPlayersTable(group);
    } else {
        displayMLBPlayerCards(group);
    }
}

function displayMLBPlayerCards(group) {
    const grid    = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    const players = AppState.mlbPlayers[group] || [];
    if (players.length === 0) {
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
    if (el) el.textContent = `Showing ${Math.min(players.length, 100)} of ${players.length} players`;
}

function displayMLBPlayersTable(group) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';
    grid.innerHTML = '';

    const players = AppState.mlbPlayers[group] || [];
    if (players.length === 0) {
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
                                <img src="${hsUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">
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
                (col.field === 'era' || col.field === 'whip') ? num.toFixed(2) :
                (col.field === 'avg' || col.field === 'ops')  ? num.toFixed(3) :
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
                ${headshotUrl ? `<img class="player-headshot" src="${headshotUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
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

    const iso   = (!isNaN(slg) && !isNaN(avg)) ? (slg - avg).toFixed(3) : null;
    const babip = (hits >= 0 && hr >= 0 && so >= 0 && (ab - so - hr + sf) > 0)
        ? ((hits - hr) / (ab - so - hr + sf)).toFixed(3)
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
        _mlbStatBar('Batting Average',   stats.avg,         0.400,  '#fbbf24', v => v.toFixed(3)),
        _mlbStatBar('On-Base %',         stats.obp,         0.500,  '#34d399', v => v.toFixed(3)),
        _mlbStatBar('Slugging %',        stats.slg,         0.700,  '#60a5fa', v => v.toFixed(3)),
        _mlbStatBar('OPS',               stats.ops,         1.100,  '#a78bfa', v => v.toFixed(3)),
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

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="mlb-players"]').forEach(t => t.classList.add('active'));

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('mlb-players', player.fullName);

    history.pushState({ view: 'mlb-player', id: playerId, group }, '', `#mlb-player-${playerId}`);

    const headshotUrl = getMLBPlayerHeadshotUrl(playerId);
    const headshotImg = headshotUrl
        ? `<img class="player-headshot player-headshot--detail" src="${headshotUrl}" alt="${player.fullName}" loading="lazy" onerror="this.style.display='none'">`
        : '';
    const logoUrl = getMLBTeamLogoUrl(player.teamId);

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

    const statsGrid = statDefs
        .filter(([, value]) => value != null)
        .map(([label, value, color]) => `
            <div class="stat-item">
                <div class="stat-value" style="color:${color}">${value}</div>
                <div class="stat-label">${label}</div>
            </div>
        `).join('');

    // Stat bars for key metrics
    const barHtml = group === 'hitting' ? _mlbHittingBars(stats, batting) : _mlbPitchingBars(stats);

    // Team logo
    const teamLogo = getMLBTeamLogoUrl(player.teamId);

    grid.className  = 'player-detail-container';
    grid.innerHTML = `
        <div class="player-detail-header">
            <button onclick="backToMLBPlayers()" class="back-button">← Players</button>
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
                        ${teamLogo ? `<img src="${teamLogo}" alt="" style="width:24px;height:24px;object-fit:contain" loading="lazy" onerror="this.style.display='none'">` : ''}
                        <p class="player-detail-meta" style="color:var(--color-text-secondary);margin:0">${player.teamName || ''}</p>
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-muted)">
                        ${MLB_SEASON} MLB Season · ${group === 'hitting' ? 'Batting' : 'Pitching'}
                    </p>
                </div>
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
    `;
}

function backToMLBPlayers() {
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
        const games = await fetchMLBSchedule(7);
        AppState.mlbGames = games;
        displayMLBGames(games);
    } catch (error) {
        Logger.error('Failed to load MLB games', error, 'MLB');
        ErrorHandler.renderErrorState(grid, error, loadMLBGames);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load MLB Games' });
    }
}

function displayMLBGames(games) {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!games || games.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No recent MLB games — check back during the season', '⚾');
        return;
    }

    const fragment = document.createDocumentFragment();
    games.slice(0, 24).forEach(game => fragment.appendChild(_createMLBGameCard(game)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function _createMLBGameCard(game) {
    const card      = document.createElement('div');
    card.className  = 'game-card';

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
    const homeAbbr = (homeTeam.abbreviation || '?').slice(0, 3);
    const awayAbbr = (awayTeam.abbreviation || '?').slice(0, 3);

    card.innerHTML = `
        <div class="game-card-header">
            <span class="game-date">${dateStr}</span>
            <span class="game-status ${statusCls}">${isLive ? '<span class="live-dot"></span>' : ''}${status}</span>
        </div>
        <div class="game-matchup">
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}55)">
                    ${homeLogo ? `<img class="game-logo-img" src="${homeLogo}" loading="lazy" onerror="this.style.display='none'" onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">` : ''}
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
            <div class="game-team game-team--away ${awayWon ? 'game-team--winner' : ''}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}55)">
                    ${awayLogo ? `<img class="game-logo-img" src="${awayLogo}" loading="lazy" onerror="this.style.display='none'" onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">` : ''}
                    <span class="game-logo-text">${awayAbbr}</span>
                </div>
                <div class="game-team-abbr">${awayAbbr}</div>
                <div class="game-team-name">${awayTeam.name || ''}</div>
            </div>
        </div>
    `;

    return card;
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
        Logger.error('Failed to load MLB teams', error, 'MLB');
        ErrorHandler.renderErrorState(grid, error, loadMLBTeams);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load MLB Teams' });
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
        card.innerHTML = `
            <div class="team-card-header" style="background:linear-gradient(135deg,${colors.primary}dd,${colors.primary}33)">
                <div style="width:64px;height:64px;display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem">
                    ${logo
                        ? `<img src="${logo}" style="width:100%;height:100%;object-fit:contain" loading="lazy" onerror="this.outerHTML='<span style=font-size:1.4rem;font-weight:800;color:#fff>${abbr}</span>'">`
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
        `;
        fragment.appendChild(card);
    });

    grid.innerHTML = '';
    grid.appendChild(fragment);
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
        if (!AppState.mlbLeaderSplits) {
            const [hitSplits, pitSplits] = await Promise.all([
                fetchMLBLeagueStats('hitting',  MLB_SEASON, 300),
                fetchMLBLeagueStats('pitching', MLB_SEASON, 300),
            ]);
            AppState.mlbLeaderSplits = { hitting: hitSplits, pitching: pitSplits };
        }
        displayMLBLeaderboards();
    } catch (error) {
        Logger.error('Failed to load MLB leaderboards', error, 'MLB');
        ErrorHandler.renderErrorState(grid, error, loadMLBLeaderboards);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load MLB Leaders' });
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

function displayMLBLeaderboards() {
    const grid     = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';

    const splits   = AppState.mlbLeaderSplits || { hitting: [], pitching: [] };
    const fragment = document.createDocumentFragment();

    MLB_LEADER_CATS.forEach(cat => {
        const catSplits = splits[cat.group] || [];
        const sorted = [...catSplits]
            .filter(s => s.stat?.[cat.key] != null)
            .sort((a, b) => {
                const av = parseFloat(a.stat[cat.key]);
                const bv = parseFloat(b.stat[cat.key]);
                return cat.desc ? bv - av : av - bv;  // desc:true → highest first; false → lowest first (ERA)
            });

        const panel  = document.createElement('div');
        panel.className = 'leaderboard-panel';

        const header = document.createElement('div');
        header.className = 'leaderboard-header';
        header.style.borderLeftColor = cat.color;
        header.innerHTML = `
            <span class="leaderboard-title">${cat.label}</span>
            <span class="leaderboard-unit" style="color:${cat.color}">${MLB_SEASON} MLB · ${cat.unit}</span>
        `;

        const list = document.createElement('div');
        list.className = 'leaderboard-list';

        const topRows = sorted.slice(0, 8);
        if (topRows.length === 0) {
            list.innerHTML = `<p style="color:var(--color-text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
        } else {
            topRows.forEach((split, i) => {
                const rawVal  = split.stat[cat.key];
                const numVal  = parseFloat(rawVal);
                const valStr  = isNaN(numVal) ? rawVal :
                    cat.decimals > 0 ? numVal.toFixed(cat.decimals) : String(rawVal);
                const abbr       = split.team?.abbreviation || '';
                const colors     = getMLBTeamColors(abbr);
                const initials   = (split.player?.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
                const headshotUrl = getMLBPlayerHeadshotUrl(split.player?.id);

                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.innerHTML = `
                    <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                    <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                        <span class="lb-avatar-initials">${initials}</span>
                    </div>
                    <div class="lb-player">
                        <span class="lb-name">${split.player?.fullName || '—'}</span>
                        <span class="lb-team">${abbr}${split.position?.abbreviation ? ' · ' + split.position.abbreviation : ''}</span>
                    </div>
                    <span class="lb-value" style="color:${cat.color}">${valStr}</span>
                `;
                list.appendChild(row);
            });
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
    const group   = AppState.mlbStatsGroup;
    const all     = AppState.mlbPlayers[group] || [];
    const q       = (term || '').toLowerCase().trim();
    const matched = q.length < 2
        ? all
        : all.filter(p =>
            p.fullName?.toLowerCase().includes(q) ||
            p.teamAbbr?.toLowerCase().includes(q) ||
            p.teamName?.toLowerCase().includes(q)
        );

    // Temporarily replace the players array for the filtered render
    const saved = AppState.mlbPlayers[group];
    AppState.mlbPlayers[group] = matched;
    displayMLBPlayers(group);
    AppState.mlbPlayers[group] = saved;

    const el = document.getElementById('resultCount');
    if (el) el.textContent = q
        ? `${matched.length} player${matched.length !== 1 ? 's' : ''} found`
        : `Showing ${Math.min(all.length, 100)} of ${all.length} players`;
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
        const ha      = g.teams?.home?.team?.abbreviation || '???';
        const va      = g.teams?.away?.team?.abbreviation || '???';
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
            <div class="ticker__item">
                ${homeLogo ? `<img class="ticker-logo" src="${homeLogo}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                <span class="ticker-team">${ha}</span>
                <span class="ticker-score ${homeWon && isFinal ? 'ticker-score--win' : ''}">${hs}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${awayWon && isFinal ? 'ticker-score--win' : ''}">${vs}</span>
                <span class="ticker-team">${va}</span>
                ${awayLogo ? `<img class="ticker-logo" src="${awayLogo}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
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

async function fetchMLBStandingsFull(season = MLB_SEASON) {
    const data = await mlbFetch('/standings', {
        leagueId:       '103,104',
        season,
        standingsTypes: 'regularSeason',
    }, ApiCache.TTL.SHORT);

    return (data.records || []).map(rec => {
        const rawName = rec.division?.name || '';
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
                const last10 = findRec('lastTen');
                return {
                    teamId:   tr.team?.id,
                    teamName: tr.team?.name    || '',
                    teamAbbr: tr.team?.abbreviation || '',
                    wins:     tr.wins   ?? 0,
                    losses:   tr.losses ?? 0,
                    pct:      tr.leagueRecord?.pct ?? '.000',
                    gb:       tr.gamesBack          || '—',
                    streak:   tr.streak?.streakCode || '',
                    home:     home   ? `${home.wins}-${home.losses}`     : '—',
                    away:     away   ? `${away.wins}-${away.losses}`     : '—',
                    last10:   last10 ? `${last10.wins}-${last10.losses}` : '—',
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
        Logger.error('MLB Standings load failed', err, 'MLB');
        ErrorHandler.renderErrorState(grid, err, loadMLBStandings);
        ErrorHandler.toast(err.message, 'error', { title: 'Failed to Load MLB Standings' });
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
        </div>
    `;

    const divsHtml = ordered.map(div => {
        const rowsHtml = div.teams.map((team, idx) => {
            const rank       = idx + 1;
            const streakWin  = team.streak.startsWith('W');
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
                <tr class="standings-row ${rowCls}">
                    <td class="standings-rank">${rank}</td>
                    <td class="standings-team-cell">
                        ${logo ? `<img class="standings-logo" src="${logo}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                        <span class="standings-team-name">${team.teamName}</span>
                        ${clinchBadge}
                    </td>
                    <td class="standings-num">${team.wins}</td>
                    <td class="standings-num">${team.losses}</td>
                    <td class="standings-num standings-pct">${team.pct}</td>
                    <td class="standings-num standings-gb">${team.gb}</td>
                    <td class="standings-num">${team.last10}</td>
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
                                <th title="Last 10 games">L10</th>
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

// ── State initialisation (runs immediately on script load) ────
Object.assign(AppState, {
    currentSport:          'nba',
    mlbTeams:              [],
    mlbPlayers:            { hitting: [], pitching: [] },
    mlbPlayerStats:        { hitting: {}, pitching: {} },
    mlbGames:              [],
    mlbStatsGroup:         'hitting',
    mlbLeaderSplits:       null,
    mlbStandings:          null,
    _mlbStandingsLeague:   'AL',
});

if (typeof window !== 'undefined') {
    window.MLB_SEASON              = MLB_SEASON;
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
    window.loadMLBLeaderboards     = loadMLBLeaderboards;
    window.displayMLBLeaderboards  = displayMLBLeaderboards;
    window.loadMLBStandings        = loadMLBStandings;
    window.displayMLBStandings     = displayMLBStandings;
    window.getMLBTeamColors        = getMLBTeamColors;
    window._renderMLBGroupToggle   = _renderMLBGroupToggle;
}
