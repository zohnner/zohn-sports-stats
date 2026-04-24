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

    initWaffle();
    if (typeof initGlobalSearch === 'function') initGlobalSearch();

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
        if (!s)                  { navigateTo('home', false); return; }
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
        if (s.view === 'mlb-team') {
            if (AppState.currentSport !== 'mlb') {
                AppState.currentSport = 'mlb';
                _applySportUI('mlb');
            }
            _restoreMLBTeamDetail(s.id);
            return;
        }
        // Ensure sport UI matches the restored view's sport prefix
        if (typeof s.view === 'string') {
            const sportFromView = s.view.startsWith('mlb-') ? 'mlb'
                : s.view.startsWith('nfl-') ? 'nfl'
                : s.view.startsWith('nhl-') ? 'nhl'
                : 'nba';
            if (AppState.currentSport !== sportFromView) {
                AppState.currentSport = sportFromView;
                _applySportUI(sportFromView);
            }
        }
        navigateTo(s.view, false);
    });

    // Apply correct sport UI before hash routing (default sport is mlb)
    _applySportUI(AppState.currentSport);

    // Load from URL hash on first visit
    _loadFromHash();
}

// ── Waffle panel ─────────────────────────────────────────────

function initWaffle() {
    const btn   = document.getElementById('waffleBtn');
    const panel = document.getElementById('wafflePanel');
    if (!btn || !panel) return;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = panel.hidden;
        panel.hidden  = !opening;
        btn.classList.toggle('waffle-btn--open', opening);
        btn.setAttribute('aria-expanded', String(opening));
    });

    // Close on outside click
    document.addEventListener('click', e => {
        if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
            _closeWaffle();
        }
    });

    // Close when Escape pressed
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.hidden) _closeWaffle();
    });

    // Close when a waffle nav item is clicked
    panel.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', _closeWaffle);
    });
}

function _closeWaffle() {
    const btn   = document.getElementById('waffleBtn');
    const panel = document.getElementById('wafflePanel');
    if (!panel) return;
    panel.hidden = true;
    btn?.classList.remove('waffle-btn--open');
    btn?.setAttribute('aria-expanded', 'false');
}

// ── Core navigation function ─────────────────────────────────

function navigateTo(view, push = true) {
    if (window.StatsCharts) StatsCharts.destroyAll();

    // Scroll to top on every navigation
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Sync all matching nav tabs (waffle panel + mobile)
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.nav-tab[data-view="${view}"]`).forEach(t => t.classList.add('active'));
    AppState.currentView = view;

    // Restore playersGrid class for non-home views
    const grid = document.getElementById('playersGrid');
    if (grid && view !== 'home') grid.className = 'players-grid';

    // Show/hide search bar and view header
    const isNBAPlayers = view === 'players';
    const isMLBPlayers = view === 'mlb-players';
    const isHome       = view === 'home';
    document.getElementById('searchBar')?.style.setProperty('display',
        (isNBAPlayers || isMLBPlayers) ? 'block' : 'none'
    );
    document.getElementById('viewHeader')?.style.setProperty('display',
        (isNBAPlayers || isMLBPlayers || isHome) ? 'none' : 'block'
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

    // Entrance animation — restarts on every navigation
    const _grid = document.getElementById('playersGrid');
    if (_grid) {
        _grid.classList.remove('view-enter');
        requestAnimationFrame(() => _grid.classList.add('view-enter'));
    }
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

    // Swap nav bars and season row visibility
    const nbaNav         = document.getElementById('nba-nav');
    const mlbNav         = document.getElementById('mlb-nav');
    const mobNbaNav      = document.getElementById('mobile-nba-nav');
    const mobMlbNav      = document.getElementById('mobile-mlb-nav');
    const seasonRow      = document.getElementById('waffleSeasonRow');

    const nflNav    = document.getElementById('nfl-nav');
    const nhlNav    = document.getElementById('nhl-nav');
    const mobNflNav = document.getElementById('mobile-nfl-nav');
    const mobNhlNav = document.getElementById('mobile-nhl-nav');

    // Hide all sport navs, then show the active one
    [nbaNav, mlbNav, nflNav, nhlNav].forEach(n => n && (n.style.display = 'none'));
    [mobNbaNav, mobMlbNav, mobNflNav, mobNhlNav].forEach(n => n && (n.style.display = 'none'));
    if (seasonRow) seasonRow.style.display = (sport === 'nba') ? '' : 'none';
    document.getElementById('positionFilters')?.remove();
    document.getElementById('mlbGroupToggle')?.remove();

    const brandConfig = {
        nba: { icon: '🏀', sub: 'NBA Analytics',  nav: nbaNav,    mobNav: mobNbaNav, defaultView: 'players'     },
        mlb: { icon: '⚾',  sub: 'MLB Analytics',  nav: mlbNav,    mobNav: mobMlbNav, defaultView: 'mlb-players' },
        nfl: { icon: '🏈',  sub: 'NFL Analytics',  nav: nflNav,    mobNav: mobNflNav, defaultView: 'nfl-players' },
        nhl: { icon: '🏒',  sub: 'NHL Analytics',  nav: nhlNav,    mobNav: mobNhlNav, defaultView: 'nhl-players' },
    };
    const cfg = brandConfig[sport] || brandConfig.nba;

    if (cfg.nav)    cfg.nav.style.display    = '';
    if (cfg.mobNav) cfg.mobNav.style.display = '';
    document.getElementById('brandIcon').textContent = cfg.icon;
    document.getElementById('brandSub').textContent  = cfg.sub;

    // Refresh ticker for the new sport
    if (sport === 'mlb') {
        fetchMLBSchedule(7).then(games => {
            AppState.mlbGames = AppState.mlbGames.length ? AppState.mlbGames : games;
            updateMLBTicker(games);
        }).catch(() => {});
    } else if (sport === 'nfl') {
        if (typeof fetchNFLScoreboard === 'function') {
            fetchNFLScoreboard().then(games => {
                AppState.nflGames = games;
                updateNFLTicker(games);
            }).catch(() => {});
        }
    } else if (sport === 'nhl') {
        if (typeof fetchNHLScoreboard === 'function') {
            fetchNHLScoreboard().then(data => {
                AppState.nhlGames = data.games;
                updateNHLTicker(data.games);
            }).catch(() => {});
        }
    }

    navigateTo(cfg.defaultView);
}

// ── Breadcrumb ───────────────────────────────────────────────

const _NAV_META = {
    home:            { label: 'Home',          icon: '🏠' },
    players:         { label: 'Players',       icon: '👤' },
    leaders:         { label: 'Leaders',       icon: '🏆' },
    teams:           { label: 'Teams',         icon: '🏟' },
    games:           { label: 'Scores',        icon: '📅' },
    standings:       { label: 'Standings',     icon: '📊' },
    builder:         { label: 'Builder',       icon: '🧮' },
    'mlb-players':   { label: 'MLB Players',   icon: '⚾' },
    'mlb-leaders':   { label: 'MLB Leaders',   icon: '🏆' },
    'mlb-teams':     { label: 'MLB Teams',     icon: '🏟' },
    'mlb-games':     { label: 'MLB Scores',    icon: '📅' },
    'mlb-standings': { label: 'MLB Standings', icon: '📊' },
    'mlb-builder':   { label: 'Stat Builder',  icon: '🧮' },
    'mlb-prep':      { label: 'Game Prep',     icon: '📋' },
    'nfl-players':   { label: 'NFL Leaders',   icon: '🏈' },
    'nfl-leaders':   { label: 'NFL Leaders',   icon: '🏈' },
    'nfl-teams':     { label: 'NFL Teams',     icon: '🏈' },
    'nfl-games':     { label: 'NFL Scores',    icon: '📅' },
    'nfl-standings': { label: 'NFL Standings', icon: '📊' },
    'nhl-players':   { label: 'NHL Leaders',   icon: '🏒' },
    'nhl-leaders':   { label: 'NHL Leaders',   icon: '🏒' },
    'nhl-teams':     { label: 'NHL Teams',     icon: '🏒' },
    'nhl-games':     { label: 'NHL Scores',    icon: '📅' },
    'nhl-standings': { label: 'NHL Standings', icon: '📊' },
    'arcade':        { label: 'Arcade',        icon: '🎮' },
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
        document.title = `${current} — SportsStrata`;
    } else {
        el.innerHTML = `<span class="breadcrumb-root">${meta.icon} ${meta.label}</span>`;
        const label = meta.label || root;
        document.title = label === 'Home' ? 'SportsStrata — MLB Analytics' : `${label} — SportsStrata`;
    }
}

// ── View renderer ────────────────────────────────────────────

function renderCurrentView(view) {
    Logger.info(`View → ${view}`, undefined, 'NAV');

    // Sport-specific views
    if (view.startsWith('mlb-')) { _renderMLBView(view); return; }
    if (view.startsWith('nfl-')) { _renderNFLView(view); return; }
    if (view.startsWith('nhl-')) { _renderNHLView(view); return; }

    // NBA views
    const viewCount = document.getElementById('viewResultCount');
    switch (view) {
        case 'home':
            loadHome();
            break;

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

        case 'arcade':
            if (viewCount) viewCount.textContent = 'Arcade';
            loadArcade();
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
            if (viewCount) viewCount.textContent = 'MLB Scores';
            loadMLBGames();
            break;

        case 'mlb-builder':
            if (viewCount) viewCount.textContent = 'Stat Builder';
            displayStatBuilder();
            break;

        case 'mlb-prep':
            if (viewCount) viewCount.textContent = 'Game Prep';
            displayGamePrep();
            break;

        case 'mlb-standings':
            if (viewCount) viewCount.textContent = 'MLB Standings';
            if (AppState.mlbStandings) {
                displayMLBStandings(AppState.mlbStandings, AppState._mlbStandingsLeague || 'AL');
            } else {
                loadMLBStandings();
            }
            break;

        default:
            Logger.error(`Unknown MLB view: ${view}`, undefined, 'NAV');
    }
}

function _renderNFLView(view) {
    const viewCount = document.getElementById('viewResultCount');
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');

    switch (view) {
        case 'nfl-players':
        case 'nfl-leaders':
            if (viewCount) viewCount.textContent = 'NFL Leaders';
            loadNFLLeaderboards();
            break;
        case 'nfl-teams':
            if (viewCount) viewCount.textContent = 'NFL Teams';
            if (AppState.nflTeams.length) displayNFLTeams(AppState.nflTeams);
            else loadNFLTeams();
            break;
        case 'nfl-games':
            if (viewCount) viewCount.textContent = 'NFL Scores';
            loadNFLGames();
            break;
        case 'nfl-standings':
            if (viewCount) viewCount.textContent = 'NFL Standings';
            if (AppState.nflStandings?.length) displayNFLStandings(AppState.nflStandings);
            else loadNFLStandings();
            break;
        default:
            Logger.error(`Unknown NFL view: ${view}`, undefined, 'NAV');
    }
}

function _renderNHLView(view) {
    const viewCount = document.getElementById('viewResultCount');
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');

    switch (view) {
        case 'nhl-players':
        case 'nhl-leaders':
            if (viewCount) viewCount.textContent = 'NHL Leaders';
            loadNHLLeaderboards();
            break;
        case 'nhl-teams':
            if (viewCount) viewCount.textContent = 'NHL Teams';
            if (AppState.nhlTeams.length) displayNHLTeams(AppState.nhlTeams);
            else loadNHLTeams();
            break;
        case 'nhl-games':
            if (viewCount) viewCount.textContent = 'NHL Scores';
            loadNHLGames();
            break;
        case 'nhl-standings':
            if (viewCount) viewCount.textContent = 'NHL Standings';
            if (AppState.nhlStandings?.length) displayNHLStandings(AppState.nhlStandings);
            else loadNHLStandings();
            break;
        default:
            Logger.error(`Unknown NHL view: ${view}`, undefined, 'NAV');
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

async function _restoreMLBTeamDetail(teamId) {
    Logger.info(`Restoring MLB team detail ${teamId}`, undefined, 'NAV');
    if (AppState.currentSport !== 'mlb') {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
    }
    if (AppState.mlbTeams.length === 0) {
        AppState.mlbTeams = await fetchMLBTeams();
    }
    showMLBTeamDetail(teamId, false);
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
    if (!hash) { navigateTo('home', false); return; }

    const playerMatch    = hash.match(/^player-(\d+)$/);
    const teamMatch      = hash.match(/^team-(\d+)$/);
    const teamGameMatch  = hash.match(/^team-(\d+)-game-(\d+)$/);
    const mlbPlayerMatch = hash.match(/^mlb-player-(\d+)$/);
    const mlbTeamMatch   = hash.match(/^mlb-team-(\d+)$/);

    if (playerMatch) {
        _restorePlayerDetail(parseInt(playerMatch[1]));
    } else if (teamGameMatch) {
        // More specific pattern checked before plain team match
        _restoreTeamGameDetail(parseInt(teamGameMatch[1]), parseInt(teamGameMatch[2]));
    } else if (teamMatch) {
        _restoreTeamDetail(parseInt(teamMatch[1]));
    } else if (mlbPlayerMatch) {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
        showMLBPlayerDetail(parseInt(mlbPlayerMatch[1]), 'hitting');
    } else if (mlbTeamMatch) {
        _restoreMLBTeamDetail(parseInt(mlbTeamMatch[1]));
    } else {
        // Malformed deep-link? Warn if hash looks like it was meant to be a known pattern
        const knownPrefixes = ['player-', 'team-', 'mlb-player-'];
        if (knownPrefixes.some(p => hash.startsWith(p))) {
            Logger.warn(`Unrecognised hash: #${hash} — falling back to home`, undefined, 'NAV');
            ErrorHandler.toast(`Link not found (#${hash}) — showing home view.`, 'warn', { duration: 4000 });
            navigateTo('players', false);
            return;
        }

        const mlbViews = ['mlb-players', 'mlb-leaders', 'mlb-teams', 'mlb-games', 'mlb-standings', 'mlb-builder', 'mlb-prep'];
        const nflViews = ['nfl-players', 'nfl-leaders', 'nfl-teams', 'nfl-games', 'nfl-standings'];
        const nhlViews = ['nhl-players', 'nhl-leaders', 'nhl-teams', 'nhl-games', 'nhl-standings'];
        const nbaViews = ['players', 'leaders', 'teams', 'games', 'standings', 'builder', 'arcade', 'home'];
        if (mlbViews.includes(hash)) {
            AppState.currentSport = 'mlb';
            _applySportUI('mlb');
            navigateTo(hash, false);
        } else if (nflViews.includes(hash)) {
            AppState.currentSport = 'nfl';
            _applySportUI('nfl');
            navigateTo(hash, false);
        } else if (nhlViews.includes(hash)) {
            AppState.currentSport = 'nhl';
            _applySportUI('nhl');
            navigateTo(hash, false);
        } else {
            navigateTo(nbaViews.includes(hash) ? hash : 'home', false);
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

    const navIds  = ['nba-nav', 'mlb-nav', 'nfl-nav', 'nhl-nav'];
    const mobIds  = ['mobile-nba-nav', 'mobile-mlb-nav', 'mobile-nfl-nav', 'mobile-nhl-nav'];
    const brands  = { nba: ['🏀','NBA Analytics'], mlb: ['⚾','MLB Analytics'], nfl: ['🏈','NFL Analytics'], nhl: ['🏒','NHL Analytics'] };
    const suffix  = { nba: 'nba', mlb: 'mlb', nfl: 'nfl', nhl: 'nhl' }[sport] || 'nba';

    navIds.forEach(id => document.getElementById(id)?.style.setProperty('display', id === `${suffix}-nav` ? '' : 'none'));
    mobIds.forEach(id => document.getElementById(id)?.style.setProperty('display', id === `mobile-${suffix}-nav` ? '' : 'none'));
    document.getElementById('waffleSeasonRow')?.style.setProperty('display', sport === 'nba' ? '' : 'none');

    const [icon, sub] = brands[sport] || brands.nba;
    const brandIcon = document.getElementById('brandIcon');
    const brandSub  = document.getElementById('brandSub');
    if (brandIcon) brandIcon.textContent = icon;
    if (brandSub)  brandSub.textContent  = sub;
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
    window.initWaffle        = initWaffle;
}
