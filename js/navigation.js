// ============================================================
// Navigation — tab routing, hash-based history, breadcrumb
// ============================================================

function setupNavigation() {
    const searchBox   = document.getElementById('searchBox');
    const searchClear = document.getElementById('searchClear');

    if (!searchBox) {
        Logger.error('Search box not found', undefined, 'NAV');
        return;
    }

    // Tab clicks — delegate to navigateTo so state/hash always stay in sync
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', () => navigateTo(tab.dataset.view));
    });

    // Search (debounced) — NBA does live API search; MLB does local filter
    const countEl = document.getElementById('resultCount');
    const handleSearch = debounce(async e => {
        const val = e.target.value;
        if (searchClear) searchClear.style.display = val ? 'block' : 'none';
        if (AppState.currentView === 'players') {
            if (val.trim().length >= 2 && countEl) countEl.textContent = 'Searching…';
            await searchPlayers(val);
        } else if (AppState.currentView === 'mlb-players') {
            filterMLBPlayers(val);
        }
    }, 300);
    searchBox.addEventListener('input', handleSearch);

    searchClear?.addEventListener('click', () => {
        searchBox.value = '';
        searchClear.style.display = 'none';
        if (AppState.currentView === 'players')     searchPlayers('');
        if (AppState.currentView === 'mlb-players') filterMLBPlayers('');
    });

    // Browser back / forward
    window.addEventListener('popstate', e => {
        const s = e.state;
        if (!s)                  { navigateTo('players', false); return; }
        if (s.view === 'player')    { _restorePlayerDetail(s.id);             return; }
        if (s.view === 'team')      { _restoreTeamDetail(s.id);              return; }
        if (s.view === 'team-game') { _restoreTeamGameDetail(s.teamId, s.gameId); return; }
        if (s.view === 'mlb-player') {
            // Restore MLB player detail — ensure sport is set correctly
            if (AppState.currentSport !== 'mlb') {
                AppState.currentSport = 'mlb';
                _applySportUI('mlb');
            }
            showMLBPlayerDetail(s.id, s.group || 'hitting');
            return;
        }
        // If returning to an mlb- view, ensure sport UI matches
        if (typeof s.view === 'string' && s.view.startsWith('mlb-')) {
            if (AppState.currentSport !== 'mlb') {
                AppState.currentSport = 'mlb';
                _applySportUI('mlb');
            }
        } else if (typeof s.view === 'string' && !s.view.startsWith('mlb-')) {
            if (AppState.currentSport !== 'nba') {
                AppState.currentSport = 'nba';
                _applySportUI('nba');
            }
        }
        navigateTo(s.view, false);
    });

    // Load from URL hash on first visit
    _loadFromHash();
}

// ── Core navigation function ─────────────────────────────────

function navigateTo(view, push = true) {
    if (window.StatsCharts) StatsCharts.destroyAll();

    // Sync all matching nav tabs (header + mobile)
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.nav-tab[data-view="${view}"]`).forEach(t => t.classList.add('active'));
    AppState.currentView = view;

    // Show/hide search bar (only for NBA players view)
    const isNBAPlayers = view === 'players';
    const isMLBPlayers = view === 'mlb-players';
    document.getElementById('searchBar')?.style.setProperty('display',
        (isNBAPlayers || isMLBPlayers) ? 'block' : 'none'
    );
    document.getElementById('viewHeader')?.style.setProperty('display',
        (isNBAPlayers || isMLBPlayers) ? 'none' : 'block'
    );

    // Clean up sport-specific filter UI when switching views
    if (!isNBAPlayers) document.getElementById('positionFilters')?.remove();
    if (!isMLBPlayers) document.getElementById('mlbGroupToggle')?.remove();

    // Update search placeholder
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.placeholder = isMLBPlayers
            ? 'Filter by name or team…'
            : 'Search players by name or team…';
        if (isMLBPlayers || isNBAPlayers) searchBox.value = '';
    }

    setBreadcrumb(view, null);

    if (push) history.pushState({ view }, '', `#${view}`);
    renderCurrentView(view);
}

// ── Sport switching ───────────────────────────────────────────

function switchSport(sport) {
    if (sport === AppState.currentSport) return;
    AppState.currentSport = sport;

    // Update sport switcher button states
    document.querySelectorAll('.sport-btn').forEach(btn => {
        const active = btn.dataset.sport === sport;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });

    // Swap nav bars
    const nbaNav    = document.getElementById('nba-nav');
    const mlbNav    = document.getElementById('mlb-nav');
    const mobNbaNav = document.getElementById('mobile-nba-nav');
    const mobMlbNav = document.getElementById('mobile-mlb-nav');
    const seasonSel = document.getElementById('seasonSelect');

    if (sport === 'mlb') {
        if (nbaNav)    nbaNav.style.display    = 'none';
        if (mlbNav)    mlbNav.style.display     = '';
        if (mobNbaNav) mobNbaNav.style.display  = 'none';
        if (mobMlbNav) mobMlbNav.style.display  = '';
        if (seasonSel) seasonSel.style.display  = 'none';
        document.getElementById('brandIcon').textContent = '⚾';
        document.getElementById('brandSub').textContent  = 'MLB Analytics';
        document.getElementById('positionFilters')?.remove();
        document.getElementById('mlbGroupToggle')?.remove();
        // Refresh ticker with MLB scores
        fetchMLBSchedule(7).then(games => {
            AppState.mlbGames = AppState.mlbGames.length ? AppState.mlbGames : games;
            updateMLBTicker(games);
        }).catch(() => {});
        navigateTo('mlb-players');
    } else {
        if (nbaNav)    nbaNav.style.display    = '';
        if (mlbNav)    mlbNav.style.display     = 'none';
        if (mobNbaNav) mobNbaNav.style.display  = '';
        if (mobMlbNav) mobMlbNav.style.display  = 'none';
        if (seasonSel) seasonSel.style.display  = '';
        document.getElementById('brandIcon').textContent = '🏀';
        document.getElementById('brandSub').textContent  = 'NBA Analytics';
        document.getElementById('mlbGroupToggle')?.remove();
        // Restore NBA ticker
        const nbaGames = AppState.allGames;
        if (nbaGames.length) updateTicker(nbaGames);
        else fetchGamesAPI().then(games => updateTicker(games)).catch(() => {});
        navigateTo('players');
    }
}

// ── Breadcrumb ───────────────────────────────────────────────

const _NAV_META = {
    players:      { label: 'Players',   icon: '👤' },
    leaders:      { label: 'Leaders',   icon: '🏆' },
    teams:        { label: 'Teams',     icon: '🏟' },
    games:        { label: 'Games',     icon: '📅' },
    standings:    { label: 'Standings', icon: '📊' },
    builder:      { label: 'Builder',   icon: '🧮' },
    'mlb-players': { label: 'MLB Players', icon: '⚾' },
    'mlb-leaders': { label: 'MLB Leaders', icon: '🏆' },
    'mlb-teams':   { label: 'MLB Teams',   icon: '🏟' },
    'mlb-games':   { label: 'MLB Games',   icon: '📅' },
};

function setBreadcrumb(root, current) {
    const el = document.getElementById('breadcrumb');
    if (!el) return;
    const meta = _NAV_META[root] || { label: root, icon: '' };
    if (current) {
        el.innerHTML = `
            <button class="breadcrumb-link" onclick="navigateTo('${root}')">${meta.icon} ${meta.label}</button>
            <span class="breadcrumb-sep">›</span>
            <span class="breadcrumb-current">${current}</span>
        `;
    } else {
        el.innerHTML = `<span class="breadcrumb-root">${meta.icon} ${meta.label}</span>`;
    }
}

// ── View renderer ────────────────────────────────────────────

function renderCurrentView(view) {
    Logger.info(`View → ${view}`, undefined, 'NAV');

    // MLB views
    if (view.startsWith('mlb-')) {
        _renderMLBView(view);
        return;
    }

    // NBA views
    const viewCount = document.getElementById('viewResultCount');
    switch (view) {
        case 'players':
            if (AppState.allPlayers.length === 0) {
                loadPlayers();
            } else {
                displayPlayers(AppState.filteredPlayers);
                updatePlayerCount();
            }
            break;

        case 'leaders':
            loadLeaderboards();
            break;

        case 'teams':
            if (viewCount) viewCount.textContent = 'NBA Teams';
            if (AppState.allTeams.length === 0) {
                loadTeams();
            } else {
                displayTeams(AppState.allTeams);
            }
            break;

        case 'games':
            if (viewCount) viewCount.textContent = 'Recent Games';
            if (AppState.allGames.length === 0) {
                loadGames();
            } else {
                displayGames(AppState.allGames);
            }
            break;

        case 'standings':
            if (viewCount) viewCount.textContent = 'NBA Standings';
            if (AppState.nbaStandings?.length) {
                displayStandings(AppState.nbaStandings, _standingsConf ?? 'East');
            } else {
                loadStandings();
            }
            break;

        case 'builder':
            if (viewCount) viewCount.textContent = 'Stat Builder';
            displayStatBuilder();
            break;

        default:
            Logger.error(`Unknown view: ${view}`, undefined, 'NAV');
    }
}

function _renderMLBView(view) {
    const viewCount = document.getElementById('viewResultCount');
    // Hide search bar for all MLB views except players
    const isPlayersView = view === 'mlb-players';
    if (!isPlayersView) {
        document.getElementById('searchBar')?.style.setProperty('display', 'none');
        document.getElementById('viewHeader')?.style.setProperty('display', 'block');
        document.getElementById('mlbGroupToggle')?.remove();
    }

    switch (view) {
        case 'mlb-players':
            if ((AppState.mlbPlayers?.['hitting']?.length || 0) === 0) {
                loadMLBPlayers();
            } else {
                _renderMLBGroupToggle();
                displayMLBPlayers(AppState.mlbStatsGroup);
            }
            break;

        case 'mlb-leaders':
            if (viewCount) viewCount.textContent = 'MLB Leaders';
            loadMLBLeaderboards();
            break;

        case 'mlb-teams':
            if (viewCount) viewCount.textContent = 'MLB Teams';
            if (AppState.mlbTeams.length === 0) {
                loadMLBTeams();
            } else {
                displayMLBTeams(AppState.mlbTeams);
            }
            break;

        case 'mlb-games':
            if (viewCount) viewCount.textContent = 'MLB Games';
            if (AppState.mlbGames.length === 0) {
                loadMLBGames();
            } else {
                displayMLBGames(AppState.mlbGames);
            }
            break;

        default:
            Logger.error(`Unknown MLB view: ${view}`, undefined, 'NAV');
    }
}

// ── History restoration ──────────────────────────────────────

async function _restorePlayerDetail(playerId) {
    Logger.info(`Restoring player detail ${playerId}`, undefined, 'NAV');
    if (AppState.allPlayers.length === 0) await loadPlayers();
    if (!AppState.playerStats[playerId] && AppState.allPlayers.length > 0) {
        await loadStatsForPlayers(AppState.allPlayers);
    }
    showPlayerDetail(playerId, false);
}

async function _restoreTeamDetail(teamId) {
    Logger.info(`Restoring team detail ${teamId}`, undefined, 'NAV');
    if (AppState.allTeams.length === 0) {
        AppState.allTeams = await fetchTeamsAPI();
    }
    showTeamDetail(teamId, false);
}

async function _restoreTeamGameDetail(teamId, gameId) {
    Logger.info(`Restoring team game detail team=${teamId} game=${gameId}`, undefined, 'NAV');
    if (AppState.allTeams.length === 0) {
        AppState.allTeams = await fetchTeamsAPI();
    }
    // Restore the recent-games cache so the game header renders correctly
    if (!AppState._teamRecentGames[teamId]) {
        AppState._teamRecentGames[teamId] = await fetchTeamGamesAPI(teamId, 12).catch(() => []);
    }
    showTeamGameDetail(gameId, teamId);
}

function _loadFromHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) { navigateTo('players', false); return; }

    const playerMatch    = hash.match(/^player-(\d+)$/);
    const teamMatch      = hash.match(/^team-(\d+)$/);
    const teamGameMatch  = hash.match(/^team-(\d+)-game-(\d+)$/);
    const mlbPlayerMatch = hash.match(/^mlb-player-(\d+)$/);

    if (playerMatch) {
        _restorePlayerDetail(parseInt(playerMatch[1]));
    } else if (teamGameMatch) {
        // More specific pattern must be checked before the plain team match
        _restoreTeamGameDetail(parseInt(teamGameMatch[1]), parseInt(teamGameMatch[2]));
    } else if (teamMatch) {
        _restoreTeamDetail(parseInt(teamMatch[1]));
    } else if (mlbPlayerMatch) {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
        showMLBPlayerDetail(parseInt(mlbPlayerMatch[1]), 'hitting');
    } else {
        const mlbViews = ['mlb-players', 'mlb-leaders', 'mlb-teams', 'mlb-games'];
        const nbaViews = ['players', 'leaders', 'teams', 'games', 'standings', 'builder'];
        if (mlbViews.includes(hash)) {
            AppState.currentSport = 'mlb';
            _applySportUI('mlb');
            navigateTo(hash, false);
        } else {
            navigateTo(nbaViews.includes(hash) ? hash : 'players', false);
        }
    }
}

// Applies sport-specific UI without triggering navigation
function _applySportUI(sport) {
    document.querySelectorAll('.sport-btn').forEach(btn => {
        const active = btn.dataset.sport === sport;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', String(active));
    });
    const isMLB = sport === 'mlb';
    document.getElementById('nba-nav')?.style.setProperty('display', isMLB ? 'none' : '');
    document.getElementById('mlb-nav')?.style.setProperty('display', isMLB ? ''     : 'none');
    document.getElementById('mobile-nba-nav')?.style.setProperty('display', isMLB ? 'none' : '');
    document.getElementById('mobile-mlb-nav')?.style.setProperty('display', isMLB ? ''     : 'none');
    document.getElementById('seasonSelect')?.style.setProperty('display',   isMLB ? 'none' : '');
    const brandIcon = document.getElementById('brandIcon');
    const brandSub  = document.getElementById('brandSub');
    if (brandIcon) brandIcon.textContent = isMLB ? '⚾' : '🏀';
    if (brandSub)  brandSub.textContent  = isMLB ? 'MLB Analytics' : 'NBA Analytics';
}

// ── Utility ──────────────────────────────────────────────────

function debounce(func, timeout = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => func.apply(this, args), timeout);
    };
}

if (typeof window !== 'undefined') {
    window.setupNavigation   = setupNavigation;
    window.navigateTo        = navigateTo;
    window.setBreadcrumb     = setBreadcrumb;
    window.renderCurrentView = renderCurrentView;
    window.switchSport       = switchSport;
    window.debounce          = debounce;
}
