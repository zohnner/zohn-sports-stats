// ---- State ------------------------------------------------------------------

let playerViewMode  = 'cards';   // 'cards' | 'table'
let tableSortField  = 'pts';
let tableSortDir    = 'desc';    // 'asc' | 'desc'

function setPlayerView(mode) {
    playerViewMode = mode;
    document.getElementById('cardViewBtn')?.classList.toggle('active',  mode === 'cards');
    document.getElementById('tableViewBtn')?.classList.toggle('active', mode === 'table');
    displayPlayers(AppState.filteredPlayers);
    Logger.debug(`Player view → ${mode}`, undefined, 'PLAYERS');
}

// ---- Skeleton loading -------------------------------------------------------

function showSkeletonCards(count = 9) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';
    grid.innerHTML = Array.from({ length: count }, () => `
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
                <div class="skeleton-line" style="height:34px;border-radius:7px"></div>
            </div>
        </div>
    `).join('');
}

// ---- Data loading -----------------------------------------------------------

async function loadPlayers() {
    const resultCount = document.getElementById('resultCount');
    const grid = document.getElementById('playersGrid');

    try {
        resultCount.textContent = 'Loading players…';
        showSkeletonCards(9);

        Logger.info('Fetching players from API…', undefined, 'PLAYERS');
        AppState.allPlayers = await fetchAllPlayers();

        if (!AppState.allPlayers || AppState.allPlayers.length === 0) {
            throw new Error('No players returned from API');
        }

        Logger.info(`Fetched ${AppState.allPlayers.length} players`, undefined, 'PLAYERS');

        await loadStatsForPlayers(AppState.allPlayers);

        AppState.filteredPlayers = AppState.allPlayers;

        renderPositionFilters();
        displayPlayers(AppState.filteredPlayers);
        updatePlayerCount();

    } catch (error) {
        Logger.error('Failed to load players', error, 'PLAYERS');
        resultCount.textContent = 'Error loading players';
        ErrorHandler.renderErrorState(grid, error, loadPlayers);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load Players' });
    }
}

async function loadStatsForPlayers(players) {
    Logger.info(`Fetching season averages for ${players.length} players…`, undefined, 'PLAYERS');
    const statsMap = await fetchNBAStatsMap(CURRENT_SEASON);
    let matched = 0;
    players.forEach(player => {
        const key  = `${player.first_name} ${player.last_name}`.toLowerCase();
        const stat = statsMap[key];
        if (stat) {
            AppState.playerStats[player.id] = { ...stat, player_id: player.id };
            matched++;
        }
    });
    Logger.info(`Stats matched for ${matched} of ${players.length} players`, undefined, 'PLAYERS');
    if (matched === 0 && players.length > 0) {
        ErrorHandler.toast('Season stats unavailable — NBA stats service unreachable', 'warn');
    }
    // Build PPG rank map once so displayPlayerCards doesn't sort on every keystroke
    const rankMap = {};
    [...players]
        .filter(p => AppState.playerStats[p.id]?.pts != null)
        .sort((a, b) => AppState.playerStats[b.id].pts - AppState.playerStats[a.id].pts)
        .forEach((p, i) => { rankMap[p.id] = i + 1; });
    AppState.ppgRankMap = rankMap;

    // Seed IndexedDB for the Q&A engine
    if (typeof StatsDB !== 'undefined') {
        StatsDB.syncPlayers(players, statsMap).catch(() => {});
    }
}

// ---- Display dispatcher -----------------------------------------------------

function displayPlayers(players) {
    if (playerViewMode === 'table') {
        displayPlayersTable(players);
    } else {
        displayPlayerCards(players);
    }
}

// ---- Card view --------------------------------------------------------------

function displayPlayerCards(players) {
    const grid = document.getElementById('playersGrid');
    grid.innerHTML = '';
    grid.className = 'players-grid';

    if (players.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No players match your search');
        return;
    }

    // PPG rank map is built once in loadStatsForPlayers and cached in AppState.ppgRankMap
    const ppgRankMap = AppState.ppgRankMap;

    const fragment = document.createDocumentFragment();
    players.forEach(player => {
        fragment.appendChild(createPlayerCard(player, AppState.playerStats[player.id], ppgRankMap[player.id]));
    });
    grid.appendChild(fragment);
}

function createPlayerCard(player, stats, ppgRank) {
    const card = document.createElement('div');
    card.className = 'player-card';

    const conf = player.team?.conference;
    if (conf === 'East') card.classList.add('conference-east');
    else if (conf === 'West') card.classList.add('conference-west');

    card.style.cursor = 'pointer';
    card.onclick = () => showPlayerDetail(player.id);

    const teamName    = player.team?.full_name || player.team?.name || 'Unknown Team';
    const abbr        = player.team?.abbreviation || '';
    const colors      = getTeamColors(abbr);
    const initials    = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
    const headshotUrl = getESPNHeadshotUrl(player);
    const headshotImg = headshotUrl
        ? `<img class="player-headshot" src="${headshotUrl}" alt="" loading="lazy" onerror="this.style.display='none'" onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.visibility='hidden'">`
        : '';

    const rankBadge = ppgRank != null ? `<span class="player-rank-badge ${ppgRank <= 10 ? 'player-rank-badge--top' : ''}">#${ppgRank} PPG</span>` : '';

    // Team record from standings (if already loaded)
    const standing  = AppState.nbaStandings?.find(s => s.teamAbbr === abbr);
    const recordStr = standing ? `${standing.wins}–${standing.losses}` : '';

    // Colour-tier the PPG value
    const pts    = stats?.pts;
    const ptsClr = pts >= 25 ? '#fbbf24' : pts >= 20 ? '#a78bfa' : pts >= 15 ? 'var(--color-pts)' : 'var(--color-text-primary)';

    card.innerHTML = `
        <div class="player-card-top">
            ${rankBadge}
            <div class="player-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55)">
                ${headshotImg}<span class="avatar-text">${initials}</span>
            </div>
            <div class="player-name">${player.first_name} ${player.last_name}</div>
            <div class="player-team">${abbr ? abbr + ' · ' : ''}${player.position || 'N/A'}${recordStr ? ' · ' + recordStr : ''}</div>
        </div>
        <div class="player-details">
            <div class="detail-row">
                <span class="detail-label">Team</span>
                <span class="detail-value">${teamName}</span>
            </div>
            ${stats ? `
                <div class="detail-row">
                    <span class="detail-label">PPG</span>
                    <span class="detail-value" style="color:${ptsClr};font-weight:800">${pts?.toFixed(1) ?? '—'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">RPG</span>
                    <span class="detail-value" style="color:var(--color-reb)">${stats.reb?.toFixed(1) ?? '—'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">APG</span>
                    <span class="detail-value" style="color:var(--color-ast)">${stats.ast?.toFixed(1) ?? '—'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">FG%</span>
                    <span class="detail-value" style="color:var(--color-blk)">${stats.fg_pct != null ? (stats.fg_pct * 100).toFixed(1) + '%' : '—'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">3P%</span>
                    <span class="detail-value">${stats.fg3_pct != null ? (stats.fg3_pct * 100).toFixed(1) + '%' : '—'}</span>
                </div>
            ` : `
                <div class="detail-row" style="justify-content:center;color:var(--color-text-muted);font-size:0.82rem">
                    No season stats available
                </div>
            `}
        </div>
        <div class="card-cta">VIEW PROFILE →</div>
    `;

    return card;
}

// ---- Table view -------------------------------------------------------------

function displayPlayersTable(players) {
    const grid = document.getElementById('playersGrid');
    grid.className = '';          // remove grid layout — table fills full width
    grid.innerHTML = '';

    if (players.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No players match your search');
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const table = document.createElement('table');
    table.className = 'stats-table';

    const COLS = [
        { label: '#',     field: null,          cls: 'tbl-rank' },
        { label: 'Player', field: null,         cls: '' },
        { label: 'Team',  field: null,          cls: '' },
        { label: 'GP',    field: 'games_played',cls: 'tbl-stat' },
        { label: 'PPG',   field: 'pts',         cls: 'tbl-stat tbl-pts' },
        { label: 'RPG',   field: 'reb',         cls: 'tbl-stat tbl-reb' },
        { label: 'APG',   field: 'ast',         cls: 'tbl-stat tbl-ast' },
        { label: 'FG%',   field: 'fg_pct',      cls: 'tbl-stat tbl-pct', pct: true },
        { label: '3P%',   field: 'fg3_pct',     cls: 'tbl-stat tbl-pct', pct: true },
        { label: 'FT%',   field: 'ft_pct',      cls: 'tbl-stat tbl-pct', pct: true },
        { label: 'STL',   field: 'stl',         cls: 'tbl-stat' },
        { label: 'BLK',   field: 'blk',         cls: 'tbl-stat' },
        { label: 'TOV',   field: 'turnover',    cls: 'tbl-stat' },
        { label: 'MIN',   field: 'min',         cls: 'tbl-stat' },
    ];

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>${COLS.map(col => {
        const sortable  = col.field ? 'sortable' : '';
        const isActive  = col.field === tableSortField ? 'sort-active' : '';
        const dir       = col.field === tableSortField ? (tableSortDir === 'desc' ? '↓' : '↑') : '';
        const dataAttr  = col.field ? `data-sort="${col.field}" data-dir="${dir}"` : '';
        return `<th class="${sortable} ${isActive}" ${dataAttr}>${col.label}</th>`;
    }).join('')}</tr>`;
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    players.forEach((player, i) => {
        const stats = AppState.playerStats[player.id];
        const tr    = document.createElement('tr');
        tr.onclick = () => showPlayerDetail(player.id);

        const cells = COLS.map(col => {
            if (!col.field) {
                // Static cells
                if (col.label === '#')      return `<td class="tbl-rank">${i + 1}</td>`;
                if (col.label === 'Player') {
                    const hsUrl  = getESPNHeadshotUrl(player);
                    const clrs   = getTeamColors(player.team?.abbreviation || '');
                    const inits  = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
                    return `<td>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,${clrs.primary}cc,${clrs.primary}44);flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:800;color:#fff;position:relative;overflow:hidden">
                                ${hsUrl ? `<img src="${hsUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%" onerror="this.style.display='none'">` : ''}
                                <span>${inits}</span>
                            </div>
                            <div>
                                <div class="tbl-player-name">${player.first_name} ${player.last_name}</div>
                                <div class="tbl-player-pos">${player.position || ''}</div>
                            </div>
                        </div>
                    </td>`;
                }
                if (col.label === 'Team')   return `<td><span class="tbl-team-badge">${player.team?.abbreviation || '—'}</span></td>`;
            }
            if (!stats || stats[col.field] == null) return `<td class="${col.cls}" style="color:#334155">—</td>`;
            const raw     = stats[col.field];
            const display = col.pct ? (raw * 100).toFixed(1) + '%' : parseFloat(raw).toFixed(1);
            return `<td class="${col.cls}">${display}</td>`;
        });

        tr.innerHTML = cells.join('');
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    // Column sort click
    thead.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const field = th.dataset.sort;
            if (tableSortField === field) {
                tableSortDir = tableSortDir === 'desc' ? 'asc' : 'desc';
            } else {
                tableSortField = field;
                tableSortDir   = 'desc';
            }

            AppState.filteredPlayers.sort((a, b) => {
                const av = AppState.playerStats[a.id]?.[field] ?? -Infinity;
                const bv = AppState.playerStats[b.id]?.[field] ?? -Infinity;
                return tableSortDir === 'desc' ? bv - av : av - bv;
            });

            displayPlayersTable(AppState.filteredPlayers);
        });
    });

    wrapper.appendChild(table);
    grid.appendChild(wrapper);
}

// ---- Position filter --------------------------------------------------------

function renderPositionFilters() {
    if (document.getElementById('positionFilters')) return;

    const container = document.querySelector('.search-container');
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.id = 'positionFilters';
    wrap.style.cssText = 'display:flex;gap:0.4rem;margin-top:0.875rem;flex-wrap:wrap;';

    [
        { label: 'All',  value: 'all' },
        { label: 'G',    value: 'G'   },
        { label: 'F',    value: 'F'   },
        { label: 'C',    value: 'C'   },
    ].forEach(({ label, value }) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.dataset.pos = value;
        _styleFilterBtn(btn, AppState.positionFilter === value);
        btn.addEventListener('click', () => setPositionFilter(value));
        wrap.appendChild(btn);
    });

    // Insert before search-meta
    const meta = container.querySelector('.search-meta');
    container.insertBefore(wrap, meta);
}

function _styleFilterBtn(btn, active) {
    btn.style.cssText = `
        padding:0.3rem 0.75rem;border-radius:20px;cursor:pointer;font-weight:700;
        font-size:0.8rem;transition:all 0.2s;font-family:inherit;
        border:1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.12)'};
        background:${active ? 'rgba(102,126,234,0.2)' : 'rgba(255,255,255,0.04)'};
        color:${active ? '#818cf8' : '#64748b'};
    `;
}

function setPositionFilter(position) {
    AppState.positionFilter = position;
    document.querySelectorAll('[data-pos]').forEach(btn => {
        _styleFilterBtn(btn, btn.dataset.pos === position);
    });
    applyFilters();
}

function applyFilters() {
    const term = (document.getElementById('searchBox')?.value || '').toLowerCase().trim();
    const pos  = AppState.positionFilter;

    AppState.filteredPlayers = AppState.allPlayers.filter(player => {
        const teamName = player.team?.full_name || player.team?.name || '';
        const matchesSearch = term === '' ||
            `${player.first_name} ${player.last_name}`.toLowerCase().includes(term) ||
            teamName.toLowerCase().includes(term);
        const matchesPos = pos === 'all' || (player.position?.includes(pos));
        return matchesSearch && matchesPos;
    });

    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}

// Live search — filters local data immediately, then enriches from the API
let _searchAbort = null; // tracks in-flight search so stale results are dropped

async function searchPlayers(term) {
    // Always apply local filter first for instant feedback
    applyFilters();

    const q = (term || '').trim();
    if (q.length < 2) return;

    // Cancel any pending remote search
    _searchAbort = Symbol();
    const thisSearch = _searchAbort;

    try {
        const apiResults = await searchPlayersAPI(q);
        if (thisSearch !== _searchAbort) return; // stale — a newer search started

        // Find players not yet in allPlayers
        const newPlayers = apiResults.filter(p => !AppState.allPlayers.find(a => a.id === p.id));
        if (!newPlayers.length) return;

        // Look up stats for new players from the NBA map (already fetched)
        const statsMap = await fetchNBAStatsMap(CURRENT_SEASON);
        newPlayers.forEach(p => {
            const key  = `${p.first_name} ${p.last_name}`.toLowerCase();
            const stat = statsMap[key];
            if (stat) AppState.playerStats[p.id] = { ...stat, player_id: p.id };
        });
        AppState.allPlayers = [...AppState.allPlayers, ...newPlayers];

        // Re-apply filters so newly loaded players appear
        applyFilters();
        Logger.info(`Live search added ${newPlayers.length} players`, undefined, 'SEARCH');
    } catch (err) {
        Logger.warn('Live search failed', err.message, 'SEARCH');
    }
}

function updatePlayerCount() {
    const el = document.getElementById('resultCount');
    if (el) el.textContent = `Showing ${AppState.filteredPlayers.length} of ${AppState.allPlayers.length} players`;
}

if (typeof window !== 'undefined') {
    window.setPlayerView    = setPlayerView;
    window.loadPlayers      = loadPlayers;
    window.displayPlayers   = displayPlayers;
    window.loadStatsForPlayers = loadStatsForPlayers;
    window.updatePlayerCount   = updatePlayerCount;
}
