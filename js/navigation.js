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

    // Tab clicks — sub-nav items are re-rendered per sport, so they're handled by
    // delegation (below); everything else is bound directly.
    // Bind only "standalone" nav-tabs directly; the sub-nav, bottom-nav and menu
    // panel are re-rendered per sport, so they use delegation (handlers survive
    // regeneration). Binding regenerated buttons directly would leave them dead.
    document.querySelectorAll('.nav-tab').forEach(tab => {
        if (tab.closest('#subNav') || tab.closest('#bottomNav') || tab.closest('#menuPanel')) return;
        tab.addEventListener('click', () => navigateTo(tab.dataset.view));
    });
    document.getElementById('subNav')?.addEventListener('click', e => {
        const parent = e.target.closest('.sub-nav-parent');
        if (parent) { e.stopPropagation(); _toggleSubNavMenu(parent); return; }
        const t = e.target.closest('.nav-tab[data-view]');
        if (t) { _closeSubNavMenus(); navigateTo(t.dataset.view); }
    });
    document.addEventListener('click', e => { if (!e.target.closest('.sub-nav-cat')) _closeSubNavMenus(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') _closeSubNavMenus(); });
    window.addEventListener('scroll', () => _closeSubNavMenus(), { passive: true });
    document.getElementById('bottomNav')?.addEventListener('click', e => {
        if (e.target.closest('.bottom-more')) {
            e.stopPropagation();
            const panel = document.getElementById('menuPanel');
            (panel && panel.hidden) ? _openMenu() : _closeMenu();
            return;
        }
        const t = e.target.closest('.nav-tab[data-view]');
        if (t) navigateTo(t.dataset.view);
    });
    document.getElementById('menuPanel')?.addEventListener('click', e => {
        const t = e.target.closest('.nav-tab[data-view]');
        if (t) { navigateTo(t.dataset.view); _closeMenu(); }
    });
    // Delegated so a re-rendered (data-driven) switcher keeps working — D-026.
    document.querySelector('.sport-switch')?.addEventListener('click', e => {
        const b = e.target.closest('.sport-switch-btn[data-sport]');
        if (b) switchSport(b.dataset.sport);
    });

    initMenu();
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
        // Null state = address-bar hash edit or a history entry we didn't
        // write. Route through the hash router (sport-aware) — blindly going
        // home here caused cross-sport chimera states (D-038 V2).
        if (!s)                  { _loadFromHash(); return; }
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
        if (s.view === 'mlb-scorecard') {
            if (AppState.currentSport !== 'mlb') {
                AppState.currentSport = 'mlb';
                _applySportUI('mlb');
            }
            if (typeof _restoreMLBScorecard === 'function') _restoreMLBScorecard(s.gameId);
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

// ── Menu panel ───────────────────────────────────────────────

function initMenu() {
    const btn   = document.getElementById('menuBtn');
    const panel = document.getElementById('menuPanel');
    if (!btn || !panel) return;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = panel.hidden;
        panel.hidden  = !opening;
        btn.classList.toggle('menu-btn--open', opening);
        btn.setAttribute('aria-expanded', String(opening));
    });

    document.addEventListener('click', e => {
        if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) {
            _closeMenu();
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !panel.hidden) _closeMenu();
    });

    // Close when a menu item is tapped
    panel.querySelectorAll('.nav-tab').forEach(tab => {
        tab.addEventListener('click', _closeMenu);
    });
}

function _openMenu() {
    const btn   = document.getElementById('menuBtn');
    const panel = document.getElementById('menuPanel');
    if (!panel) return;
    panel.hidden = false;
    btn?.classList.add('menu-btn--open');
    btn?.setAttribute('aria-expanded', 'true');
}

function _closeMenu() {
    const btn   = document.getElementById('menuBtn');
    const panel = document.getElementById('menuPanel');
    if (!panel) return;
    panel.hidden = true;
    btn?.classList.remove('menu-btn--open');
    btn?.setAttribute('aria-expanded', 'false');
}

// ── Core navigation function ─────────────────────────────────

function navigateTo(view, push = true) {
    if (window.StatsCharts) StatsCharts.destroyAll();
    if (typeof stopLiveGamePolling === 'function') stopLiveGamePolling();
    if (typeof stopLiveScorecardPolling === 'function') stopLiveScorecardPolling();
    if (typeof stopNFLLiveGame === 'function') stopNFLLiveGame();

    // Scroll to top on every navigation
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Sync all matching nav tabs (waffle panel + mobile)
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.nav-tab[data-view="${view}"]`).forEach(t => t.classList.add('active'));
    if (typeof _syncSubNavParents === 'function') _syncSubNavParents(view);
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
    _updatePageMeta(view);
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

    document.getElementById('positionFilters')?.remove();
    document.getElementById('mlbGroupToggle')?.remove();

    const brandConfig = {
        nba: { icon: '🏀', sub: 'NBA Analytics',  defaultView: 'players'     },
        mlb: { icon: '⚾',  sub: 'MLB Analytics',  defaultView: 'mlb-players' },
        nfl: { icon: '🏈',  sub: 'NFL Analytics',  defaultView: 'nfl-home' },
        nhl: { icon: '🏒',  sub: 'NHL Analytics',  defaultView: 'nhl-players' },
    };
    const cfg = brandConfig[sport] || brandConfig.mlb;

    _applySportUI(sport);

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
    'nfl-home':      { label: 'NFL Home',      icon: '🏈' },
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
    'mlb-compare':   { label: 'Compare',       icon: '⚡' },
    'mlb-scorecard': { label: 'Scorecard',     icon: '📋' },
    'nfl-players':   { label: 'NFL Players',   icon: '🏈' },
    'nfl-rankings':  { label: 'Draft HQ · Rankings', icon: '📊' },
    'nfl-draftkit':  { label: 'Draft HQ · Value Board', icon: '📋' },
    'nfl-mock':      { label: 'Mock Draft',    icon: '🏈' },
    'nfl-compare':   { label: 'Player Compare', icon: '⚡' },
    'nfl-leaders':   { label: 'NFL Leaders',   icon: '🏈' },
    'nfl-trending':  { label: 'Draft HQ · Trending', icon: '🔥' },
    'nfl-teams':     { label: 'NFL Teams',     icon: '🏈' },
    'nfl-games':     { label: 'NFL Scores',    icon: '📅' },
    'nfl-standings': { label: 'NFL Standings', icon: '📊' },
    'nfl-sos':       { label: 'Draft HQ · Schedule', icon: '🗓️' },
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
            <button class="breadcrumb-link" onclick="navigateTo('${root}')">${meta.label}</button>
            <span class="breadcrumb-sep">›</span>
            <span class="breadcrumb-current">${current}</span>
        `;
        document.title = `${current} — SportStrata`;
    } else {
        el.innerHTML = `<span class="breadcrumb-root">${meta.label}</span>`;
        const label = meta.label || root;
        document.title = label === 'Home' ? 'SportStrata — MLB Analytics' : `${label} — SportStrata`;
    }
}

// ── View renderer ────────────────────────────────────────────

function renderCurrentView(view) {
    Logger.info(`View → ${view}`, undefined, 'NAV');

    // Home has a hero search — two identical search affordances 100px apart
    // is one decision nobody made (D-038 V5). ⌘K still works everywhere.
    document.body.classList.toggle('view-home', view === 'home');

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

        case 'news':
            if (viewCount) viewCount.textContent = 'News';
            loadNews(AppState.currentSport);
            break;

        default:
            Logger.error(`Unknown view: ${view}`, undefined, 'NAV');
    }
}

function _renderMLBView(view) {
    // Dynamic scorecard route — entry is normally via loadMLBScorecard() directly,
    // but handle the case where navigateTo receives the full view string.
    if (view.startsWith('mlb-scorecard-')) {
        const gameId = parseInt(view.slice('mlb-scorecard-'.length), 10);
        if (!isNaN(gameId) && typeof _restoreMLBScorecard === 'function') {
            _restoreMLBScorecard(gameId);
        }
        return;
    }

    const viewCount = document.getElementById('viewResultCount');
    // Hide search bar for all MLB views except players
    const isPlayersView = view === 'mlb-players';
    if (!isPlayersView) {
        document.getElementById('searchBar')?.style.setProperty('display', 'none');
        document.getElementById('viewHeader')?.style.setProperty('display', 'block');
        document.getElementById('mlbGroupToggle')?.remove();
    }

    if (view.startsWith('mlb-live-')) {
        const gamePk = parseInt(view.slice('mlb-live-'.length), 10);
        if (viewCount) viewCount.textContent = 'Live Game';
        if (!isNaN(gamePk) && typeof showMLBLiveGame === 'function') showMLBLiveGame(gamePk);
        return;
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

        case 'mlb-compare':
            if (viewCount) viewCount.textContent = 'Compare Players';
            loadMLBCompare();
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

// Cross-surface offseason signal (P3-029): one strip pointing users to the
// surfaces that work year-round. Session-dismissible, re-surfaces next session.
// N-6 (Vera/Kael): only the offseason-affected stat surfaces — Scores/Standings/Teams.
// Players/Rankings/Trending/Leaders deliver year-round, so the strip is redundant there.
const _NFL_STRIP_VIEWS = new Set(['nfl-games', 'nfl-teams']);

function _syncNFLOffseasonStrip(view) {
    document.getElementById('nflOffseasonStrip')?.remove();
    if (!_NFL_STRIP_VIEWS.has(view)) return;
    if (typeof _nflIsOffseason !== 'function' || !_nflIsOffseason()) return;
    if (sessionStorage.getItem('ss_nfl_offseason_dismissed') === '1') return;

    const main = document.querySelector('main');
    const grid = document.getElementById('playersGrid');
    if (!main || !grid) return;

    const strip = document.createElement('div');
    strip.id = 'nflOffseasonStrip';
    strip.className = 'nfl-offseason-strip';
    strip.setAttribute('role', 'status');
    strip.setAttribute('aria-live', 'polite');
    strip.innerHTML = `<span class="nfl-offseason-strip__msg">NFL is between seasons — live scores return in September. Standings &amp; tools are open year-round:
            <button class="nfl-offseason-strip__link" data-view="nfl-players">Players</button> ·
            <button class="nfl-offseason-strip__link" data-view="nfl-standings">Standings</button> ·
            <button class="nfl-offseason-strip__link" data-view="nfl-rankings">Rankings</button> ·
            <button class="nfl-offseason-strip__link" data-view="nfl-mock">Mock Draft</button> ·
            <button class="nfl-offseason-strip__link" data-view="nfl-leaders">2025 Leaders</button></span>
        <button class="nfl-offseason-strip__close" type="button" aria-label="Dismiss offseason notice">✕</button>`;
    main.insertBefore(strip, grid);

    strip.querySelector('.nfl-offseason-strip__close').addEventListener('click', () => {
        sessionStorage.setItem('ss_nfl_offseason_dismissed', '1');
        strip.remove();
    });
    strip.querySelectorAll('.nfl-offseason-strip__link').forEach(b => {
        b.addEventListener('click', () => navigateTo(b.dataset.view));
    });
}

function _renderNFLView(view) {
    const viewCount = document.getElementById('viewResultCount');
    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    _syncNFLOffseasonStrip(view);

    if (view.startsWith('nfl-player-espn-')) {
        if (viewCount) viewCount.textContent = 'NFL Player';
        showNFLEspnPlayer(view.slice('nfl-player-espn-'.length));
        return;
    }
    if (view.startsWith('nfl-player-')) {
        if (viewCount) viewCount.textContent = 'NFL Player';
        showNFLPlayerDetail(view.slice('nfl-player-'.length));
        return;
    }
    if (view.startsWith('nfl-team-')) {
        if (viewCount) viewCount.textContent = 'NFL Team';
        showNFLTeamDetail(view.slice('nfl-team-'.length));
        return;
    }
    if (view.startsWith('nfl-game-')) {
        if (viewCount) viewCount.textContent = 'NFL Game';
        if (typeof showNFLGame === 'function') showNFLGame(view.slice('nfl-game-'.length));
        return;
    }

    switch (view) {
        case 'nfl-mock':
            if (viewCount) viewCount.textContent = 'Mock Draft';
            if (typeof loadMockDraft === 'function') loadMockDraft();
            break;
        case 'nfl-draftkit':
            if (viewCount) viewCount.textContent = 'Draft HQ · Value Board';
            if (typeof loadDraftKit === 'function') loadDraftKit();
            break;
        case 'nfl-sos':
            if (viewCount) viewCount.textContent = 'Draft HQ · Schedule';
            if (typeof loadNFLSOS === 'function') loadNFLSOS();
            break;
        case 'nfl-players':
            if (viewCount) viewCount.textContent = 'NFL Players';
            loadNFLPlayers();
            break;
        case 'nfl-rankings':
            if (viewCount) viewCount.textContent = 'Draft HQ · Rankings';
            loadNFLRankings();
            break;
        case 'nfl-compare':
            if (viewCount) viewCount.textContent = 'Player Compare';
            loadNFLCompare();
            break;
        case 'nfl-leaders':
            if (viewCount) viewCount.textContent = 'NFL Leaders';
            loadNFLStatLeaders();
            break;
        case 'nfl-trending':
            if (viewCount) viewCount.textContent = 'Draft HQ · Trending';
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
        case 'nfl-home':
            if (viewCount) viewCount.textContent = 'NFL Home';
            if (typeof loadNFLHome === 'function') loadNFLHome();
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

async function _restoreMLBPlayerDetail(playerId, group) {
    Logger.info(`Restoring MLB player detail ${playerId} (${group})`, undefined, 'NAV');
    if (AppState.currentSport !== 'mlb') {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
    }
    if (!AppState.mlbPlayers?.[group]?.length) {
        const grid = document.getElementById('playersGrid');
        if (grid) {
            grid.className = '';
            grid.style.cssText = 'display:block';
            grid.innerHTML = `
                <div class="player-detail-skeleton" style="padding:1.5rem;max-width:900px;margin:0 auto">
                    <div style="display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem">
                        <div class="skeleton-line" style="width:64px;height:64px;border-radius:50%;flex-shrink:0"></div>
                        <div style="flex:1;display:flex;flex-direction:column;gap:0.5rem">
                            <div class="skeleton-line" style="height:18px;width:180px"></div>
                            <div class="skeleton-line" style="height:13px;width:100px"></div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.25rem">
                        ${Array(16).fill('<div class="skeleton-line" style="height:48px;border-radius:var(--radius-md)"></div>').join('')}
                    </div>
                    ${Array(3).fill('<div class="skeleton-card" style="margin-bottom:0.75rem;height:80px"></div>').join('')}
                </div>`;
        }
        try {
            const splits = await fetchMLBLeagueStats(group, MLB_SEASON);
            if (!AppState.mlbPlayers) AppState.mlbPlayers = {};
            if (!AppState.mlbPlayerStats) AppState.mlbPlayerStats = {};
            AppState.mlbPlayers[group]    = [];
            AppState.mlbPlayerStats[group] = {};
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
        } catch (err) {
            const g = document.getElementById('playersGrid');
            if (g) ErrorHandler.handle(g, err, () => _restoreMLBPlayerDetail(playerId, group), { tag: 'MLB', title: 'Could not load player stats' });
            return;
        }
    }
    AppState.mlbStatsGroup = group;
    showMLBPlayerDetail(playerId, group);
}

async function _restoreMLBComparison(group, id1, id2) {
    Logger.info(`Restoring MLB comparison ${id1} vs ${id2} (${group})`, undefined, 'NAV');
    await _restoreMLBPlayerDetail(id1, group);
    requestAnimationFrame(() => {
        const sel = document.getElementById('mlb-cmp-select-b');
        if (!sel) return;
        sel.value = String(id2);
        sel.dispatchEvent(new Event('change'));
    });
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
    // D-041 Phase 1: edge-prerendered path URLs (e.g. /mlb/team/nyy) set window.__SS_ROUTE
    // so the SPA boots straight to the entity. Additive — normal loads never set it.
    if (window.__SS_ROUTE) {
        const _r = window.__SS_ROUTE; window.__SS_ROUTE = '';
        const _mt = /^mlb-team-(\d+)$/.exec(_r);
        if (_mt) {
            AppState.currentSport = 'mlb';
            if (typeof _applySportUI === 'function') _applySportUI('mlb');
            if (typeof _restoreMLBTeamDetail === 'function') { _restoreMLBTeamDetail(parseInt(_mt[1], 10)); return; }
        }
    }
    const hash = window.location.hash.slice(1);
    if (!hash) { navigateTo('home', false); return; }

    const playerMatch        = hash.match(/^player-(\d+)$/);
    const teamMatch          = hash.match(/^team-(\d+)$/);
    const teamGameMatch      = hash.match(/^team-(\d+)-game-(\d+)$/);
    const mlbPlayerMatch     = hash.match(/^mlb-player-(\d+)(?:-(hitting|pitching))?$/);
    const mlbTeamMatch       = hash.match(/^mlb-team-(\d+)$/);
    const mlbCompareMatch    = hash.match(/^mlb-compare-(hitting|pitching)-(\d+)-(\d+)$/);
    const mlbScorecardMatch  = hash.match(/^mlb-scorecard-(\d+)$/);
    const mlbLiveMatch       = hash.match(/^mlb-live-(\d+)$/);
    const nflEspnMatch       = hash.match(/^nfl-player-espn-(\d+)$/);
    const nflPlayerMatch     = hash.match(/^nfl-player-([A-Za-z0-9]+)$/);
    const nflTeamMatch       = hash.match(/^nfl-team-([A-Za-z]+)$/);
    const nflCompareMatch    = hash.match(/^nfl-compare-([A-Za-z0-9]+)-([A-Za-z0-9]+)$/);
    const nflGameMatch       = hash.match(/^nfl-game-([A-Za-z0-9]+)$/);

    if (playerMatch) {
        _restorePlayerDetail(parseInt(playerMatch[1]));
    } else if (teamGameMatch) {
        // More specific pattern checked before plain team match
        _restoreTeamGameDetail(parseInt(teamGameMatch[1]), parseInt(teamGameMatch[2]));
    } else if (teamMatch) {
        _restoreTeamDetail(parseInt(teamMatch[1]));
    } else if (mlbCompareMatch) {
        _restoreMLBComparison(mlbCompareMatch[1], parseInt(mlbCompareMatch[2]), parseInt(mlbCompareMatch[3]));
    } else if (mlbScorecardMatch) {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
        if (typeof _restoreMLBScorecard === 'function') {
            _restoreMLBScorecard(parseInt(mlbScorecardMatch[1]));
        }
    } else if (mlbLiveMatch) {
        AppState.currentSport = 'mlb';
        _applySportUI('mlb');
        navigateTo('mlb-live-' + mlbLiveMatch[1], false);
    } else if (mlbPlayerMatch) {
        _restoreMLBPlayerDetail(parseInt(mlbPlayerMatch[1]), mlbPlayerMatch[2] || 'hitting');
    } else if (mlbTeamMatch) {
        _restoreMLBTeamDetail(parseInt(mlbTeamMatch[1]));
    } else if (nflEspnMatch) {
        AppState.currentSport = 'nfl';
        _applySportUI('nfl');
        AppState.currentView = 'nfl-player-espn-' + nflEspnMatch[1];
        showNFLEspnPlayer(nflEspnMatch[1]);
    } else if (nflPlayerMatch) {
        AppState.currentSport = 'nfl';
        _applySportUI('nfl');
        navigateTo('nfl-player-' + nflPlayerMatch[1], false);
    } else if (nflTeamMatch) {
        AppState.currentSport = 'nfl';
        _applySportUI('nfl');
        navigateTo('nfl-team-' + nflTeamMatch[1], false);
    } else if (nflCompareMatch) {
        AppState.currentSport = 'nfl';
        _applySportUI('nfl');
        AppState.currentView = 'nfl-compare';
        loadNFLCompare();
    } else if (nflGameMatch) {
        AppState.currentSport = 'nfl';
        _applySportUI('nfl');
        navigateTo('nfl-game-' + nflGameMatch[1], false);
    } else {
        // Malformed deep-link? Warn if hash looks like it was meant to be a known pattern
        const knownPrefixes = ['player-', 'team-', 'mlb-player-', 'mlb-compare-', 'mlb-live-', 'mlb-scorecard-'];
        if (knownPrefixes.some(p => hash.startsWith(p))) {
            Logger.warn(`Unrecognised hash: #${hash} — falling back to home`, undefined, 'NAV');
            ErrorHandler.toast(`Link not found (#${hash}) — showing home view.`, 'warn', { duration: 4000 });
            navigateTo('home', false);
            return;
        }

        const mlbViews = ['mlb-players', 'mlb-leaders', 'mlb-teams', 'mlb-games', 'mlb-standings', 'mlb-builder', 'mlb-prep', 'mlb-compare'];
        const nflViews = ['nfl-home', 'nfl-players', 'nfl-rankings', 'nfl-draftkit', 'nfl-sos', 'nfl-leaders', 'nfl-trending', 'nfl-teams', 'nfl-games', 'nfl-standings', 'nfl-mock', 'nfl-compare'];
        const nhlViews = ['nhl-players', 'nhl-leaders', 'nhl-teams', 'nhl-games', 'nhl-standings'];
        const nbaViews = ['players', 'leaders', 'teams', 'games', 'standings', 'builder', 'arcade', 'home', 'news'];
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

// Updates brand text/icon for the active sport
// Per-sport sub-nav tab sets. NFL is the D-012 light surface: Scores/Standings/Teams.
const SUB_NAV_TABS = {
    mlb: [
        { v: 'mlb-players', l: 'Players' },
        { v: 'mlb-teams', l: 'Teams' },
        { v: 'mlb-standings', l: 'Standings' },
        { l: 'Analytics', children: [
            { v: 'mlb-leaders', l: 'Leaders' }, { v: 'mlb-compare', l: 'Compare' },
            { v: 'mlb-builder', l: 'Builder' }, { v: 'mlb-prep', l: 'Prep' }, { v: 'arcade', l: 'Arcade' },
        ] },
        { v: 'news', l: 'News' },
    ],
    nfl: [
        { v: 'nfl-players', l: 'Players' },
        { v: 'nfl-teams', l: 'Teams' },
        { v: 'nfl-standings', l: 'Standings' },
        { l: 'Analytics', children: [
            { v: 'nfl-leaders', l: 'Leaders' }, { v: 'nfl-compare', l: 'Compare' },
        ] },
        { l: 'Fantasy', children: [
            { v: 'nfl-draftkit', l: 'Draft HQ', also: ['nfl-rankings', 'nfl-sos', 'nfl-trending', 'nfl-mock'] },
            { v: 'nfl-mock', l: 'Mock Draft' },
        ] },
        { v: 'news', l: 'News' },
    ],
};

function _renderSubNav(sport) {
    const nav = document.getElementById('subNav');
    if (!nav) return;
    const tabs = SUB_NAV_TABS[sport] || SUB_NAV_TABS.mlb;
    nav.setAttribute('aria-label', `${(sport || 'mlb').toUpperCase()} navigation`);
    nav.innerHTML = tabs.map((t, i) => {
        if (t.children) {
            const menuId = `subcat-${sport}-${i}`;
            const childViews = t.children.flatMap(c => [c.v, ...(c.also || [])]).join(' ');
            const items = t.children.map(c => `<button class="nav-tab sub-nav-drop-item" data-view="${c.v}" role="menuitem">${c.l}</button>`).join('');
            return `<div class="sub-nav-cat" data-children="${childViews}">
                <button class="nav-tab sub-nav-parent" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="${menuId}">${t.l}<span class="sub-nav-caret" aria-hidden="true">▾</span></button>
                <div class="sub-nav-menu" id="${menuId}" role="menu" hidden>${items}</div>
            </div>`;
        }
        return `<button class="nav-tab sub-nav-item" data-view="${t.v}">${t.l}</button>`;
    }).join('');
    nav.querySelectorAll(`.nav-tab[data-view="${AppState.currentView}"]`).forEach(t => t.classList.add('active'));
    _syncSubNavParents(AppState.currentView);
}

// Category-dropdown controller (D-026 P2). Menus are position:fixed (the sub-nav
// is overflow-x:auto, which would clip an absolute menu) and positioned on open.
function _syncSubNavParents(view) {
    document.querySelectorAll('#subNav .sub-nav-cat').forEach(cat => {
        const kids = (cat.dataset.children || '').split(' ');
        const parent = cat.querySelector('.sub-nav-parent');
        if (parent) parent.classList.toggle('active', kids.includes(view));
    });
}
function _closeSubNavMenus() {
    document.querySelectorAll('#subNav .sub-nav-menu:not([hidden])').forEach(m => { m.hidden = true; });
    document.querySelectorAll('#subNav .sub-nav-parent[aria-expanded="true"]').forEach(p => p.setAttribute('aria-expanded', 'false'));
}
function _toggleSubNavMenu(parent) {
    const cat = parent.closest('.sub-nav-cat');
    const menu = cat && cat.querySelector('.sub-nav-menu');
    if (!menu) return;
    const willOpen = menu.hidden;
    _closeSubNavMenus();
    if (willOpen) {
        const r = parent.getBoundingClientRect();
        menu.style.left = `${Math.round(r.left)}px`;
        menu.style.top = `${Math.round(r.bottom + 4)}px`;
        menu.hidden = false;
        parent.setAttribute('aria-expanded', 'true');
    }
}

const _NAV_ICONS = {
    players:   '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="5" r="2.5"/><path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5"/></svg>',
    leaders:   '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 2h6v4a3 3 0 01-6 0V2z"/><path d="M5 5H3a2 2 0 002 2"/><path d="M11 5h2a2 2 0 01-2 2"/><path d="M8 9v2.5M6 13h4"/></svg>',
    scores:    '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3.5" width="12" height="10.5" rx="1.5"/><path d="M2 7.5h12M5.5 1.5v4M10.5 1.5v4"/></svg>',
    standings: '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 13.5V10M7 13.5V6M11.5 13.5V3"/><path d="M1.5 13.5h13"/></svg>',
    extra:     '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="10" height="11" rx="1"/><path d="M6.5 3a1.5 1.5 0 013 0"/><path d="M5.5 7.5h5M5.5 10.5h3.5"/></svg>',
    teams:     '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1.5L2.5 4v4C2.5 11.5 5 14 8 15c3-1 5.5-3.5 5.5-7V4L8 1.5z"/></svg>',
    builder:   '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 2L14 5 6 13H3v-3L11 2z"/><path d="M9 4l3 3"/></svg>',
    compare:   '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="3" width="5" height="10" rx="1"/><rect x="9.5" y="3" width="5" height="10" rx="1"/></svg>',
    arcade:    '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="4.5" width="13" height="7" rx="2.5"/><path d="M5 8h2M6 7v2"/><circle cx="11" cy="7.5" r="0.75" fill="currentColor" stroke="none"/><circle cx="13" cy="7.5" r="0.75" fill="currentColor" stroke="none"/></svg>',
    trending:  '<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 11l4-4 3 3 5-6"/><path d="M11 4h3v3"/></svg>',
};

const MENU_TABS = {
    mlb: [
        { group:'Stats' },
        { v:'mlb-players', l:'Players', i:'players' }, { v:'mlb-leaders', l:'Leaders', i:'leaders' },
        { v:'mlb-teams', l:'Teams', i:'teams' }, { v:'mlb-standings', l:'Standings', i:'standings' },
        { v:'mlb-games', l:'Scores', i:'scores' }, { v:'news', l:'News', i:'extra' },
        { group:'Tools' },
        { v:'mlb-compare', l:'Compare', i:'compare' }, { v:'mlb-builder', l:'Builder', i:'builder' },
        { v:'mlb-prep', l:'Prep', i:'extra' }, { v:'arcade', l:'Arcade', i:'arcade' },
    ],
    nfl: [
        { group:'Stats' },
        { v:'nfl-players', l:'Players', i:'players' }, { v:'nfl-leaders', l:'Leaders', i:'leaders' },
        { v:'nfl-teams', l:'Teams', i:'teams' }, { v:'nfl-standings', l:'Standings', i:'standings' },
        { v:'nfl-games', l:'Scores', i:'scores' }, { v:'news', l:'News', i:'extra' },
        { group:'Fantasy' },
        { v:'nfl-draftkit', l:'Draft HQ', i:'extra' }, { v:'nfl-mock', l:'Mock Draft', i:'extra' },
        { group:'Tools' },
        { v:'nfl-compare', l:'Compare', i:'compare' },
    ],
};

function _renderMenuPanel(sport) {
    const panel = document.getElementById('menuPanel');
    const grid = panel && panel.querySelector('.menu-grid');
    if (!grid) return;
    const tabs = MENU_TABS[sport] || MENU_TABS.mlb;
    grid.setAttribute('aria-label', `${(sport || 'mlb').toUpperCase()} navigation`);
    grid.innerHTML = tabs.map(t => t.group
        ? `<div class="menu-section" role="presentation">${t.group}</div>`
        : `<button class="nav-tab menu-item" data-view="${t.v}"><span class="nav-icon">${_NAV_ICONS[t.i] || ''}</span><span>${t.l}</span></button>`
    ).join('');
    grid.querySelectorAll(`.nav-tab[data-view="${AppState.currentView}"]`).forEach(t => t.classList.add('active'));
}

const BOTTOM_NAV_TABS = {
    mlb: [
        { v: 'mlb-games', l: 'Scores', i: 'scores' }, { v: 'mlb-players', l: 'Players', i: 'players' },
        { v: 'mlb-leaders', l: 'Leaders', i: 'leaders' }, { v: 'mlb-standings', l: 'Standings', i: 'standings' },
        { more: true, l: 'More', i: 'extra' },
    ],
    nfl: [
        { v: 'nfl-games', l: 'Scores', i: 'scores' }, { v: 'nfl-players', l: 'Players', i: 'players' },
        { v: 'nfl-leaders', l: 'Leaders', i: 'leaders' }, { v: 'nfl-standings', l: 'Standings', i: 'standings' },
        { more: true, l: 'More', i: 'extra' },
    ],
};

function _renderBottomNav(sport) {
    const nav = document.getElementById('bottomNav');
    if (!nav) return;
    const tabs = BOTTOM_NAV_TABS[sport] || BOTTOM_NAV_TABS.mlb;
    nav.innerHTML = tabs.map(t => t.more
        ? `<button class="nav-tab bottom-more" type="button" aria-label="More options"><span class="nav-icon">${_NAV_ICONS[t.i] || ''}</span><span class="bottom-nav-label">${t.l}</span></button>`
        : `<button class="nav-tab" data-view="${t.v}"><span class="nav-icon">${_NAV_ICONS[t.i] || ''}</span><span class="bottom-nav-label">${t.l}</span></button>`
    ).join('');
    nav.querySelectorAll(`.nav-tab[data-view="${AppState.currentView}"]`).forEach(t => t.classList.add('active'));
}

// Data-driven sport switcher (D-026) — add a sport by adding one entry here.
// Only functional sports are listed: NBA waits on P1-006 (BDL key), NHL on
// promotion from preview — surfacing a broken sport tab is worse than omitting it.
const SPORTS = [
    { id: 'mlb', label: 'MLB' },
    { id: 'nfl', label: 'NFL' },
];

function _renderSportSwitch(sport) {
    const wrap = document.getElementById('sportSwitch') || document.querySelector('.sport-switch');
    if (!wrap) return;
    wrap.innerHTML = SPORTS.map(s => {
        const on = s.id === sport;
        return `<button class="sport-switch-btn${on ? ' sport-switch-btn--active' : ''}" data-sport="${s.id}" aria-pressed="${on}">${s.label}</button>`;
    }).join('');
}

function _applySportSearchPlaceholder(sport) {
    const label = (SPORTS.find(s => s.id === sport) || {}).label || '';
    const ph = label ? `Search ${label} players, teams, stats…` : 'Search players, teams, stats…';
    const box = document.getElementById('searchBox'); if (box) box.placeholder = ph;
    const modal = document.getElementById('searchModalInput'); if (modal) modal.placeholder = ph;
    const gbtn = document.getElementById('globalSearchBtn'); if (gbtn) gbtn.setAttribute('data-label', ph);
}

function _applySportUI(sport) {
    const brands = { nba: ['🏀','NBA Analytics'], mlb: ['⚾','MLB Analytics'], nfl: ['🏈','NFL Analytics'], nhl: ['🏒','NHL Analytics'] };
    const [icon, sub] = brands[sport] || brands.mlb;
    const brandIcon = document.getElementById('brandIcon');
    const brandSub  = document.getElementById('brandSub');
    if (brandIcon) brandIcon.textContent = icon;
    if (brandSub)  brandSub.textContent  = sub;
    if (sport !== 'nfl') document.getElementById('nflOffseasonStrip')?.remove();
    const tickerScoresBtn = document.getElementById('tickerScoresBtn');
    if (tickerScoresBtn) tickerScoresBtn.dataset.view = (sport === 'nba' ? 'games' : `${sport}-games`);
    _renderSubNav(sport);
    _renderBottomNav(sport);
    _renderMenuPanel(sport);
    _renderSportSwitch(sport);
    _applySportSearchPlaceholder(sport);
}

// ── Utility ──────────────────────────────────────────────────

// ── SEO meta tag updates on each route change ─────────────────

const _PAGE_META = {
    'home':          { title: 'SportStrata — Serious Stats for Serious Fans', desc: 'Real-time MLB analytics, standings, player stats, splits, and live scores.' },
    'mlb-players':   { title: 'SportStrata — MLB Players',    desc: 'Browse MLB player stats for hitting and pitching. Sortable, filterable, shareable.' },
    'mlb-leaders':   { title: 'SportStrata — MLB Leaders',    desc: 'MLB statistical leaders in batting average, ERA, home runs, and more.' },
    'mlb-teams':     { title: 'SportStrata — MLB Teams',      desc: 'MLB team rosters, stats, and recent results for all 30 teams.' },
    'mlb-games':     { title: 'SportStrata — MLB Scores',     desc: 'Live MLB scores, game results, and upcoming schedule.' },
    'mlb-standings': { title: 'SportStrata — MLB Standings',  desc: 'Current MLB standings by division and league.' },
    'mlb-builder':   { title: 'SportStrata — Stat Builder',   desc: 'Build custom MLB stats with any formula. Save and compare.' },
    'mlb-prep':      { title: 'SportStrata — Game Prep',      desc: 'Broadcast-ready MLB game prep sheets with pitcher matchups and key stats.' },
    'mlb-compare':   { title: 'SportStrata — Compare Players', desc: 'Side-by-side MLB player comparison with stat bars and percentile rings.' },
    'mlb-scorecard': { title: 'SportStrata — Game Scorecard',  desc: 'Play-by-play baseball scorecard for any MLB game.' },
    'arcade':        { title: 'SportStrata — Arcade',         desc: 'Baseball trivia and mini-games powered by real MLB data.' },
    'news':          { title: 'SportStrata — News',           desc: 'Latest NFL and MLB headlines, injuries, and storylines.' },
    'nfl-sos':       { title: 'SportStrata — NFL Strength of Schedule', desc: 'Fantasy strength of schedule by position, weighted for the fantasy playoffs.' },
};

function _updatePageMeta(view) {
    const m = _PAGE_META[view] || _PAGE_META['home'];
    document.title = m.title;
    const descEl = document.querySelector('meta[name="description"]');
    if (descEl) descEl.setAttribute('content', m.desc);
    document.getElementById('ogTitle')?.setAttribute('content', m.title);
    document.getElementById('ogDescription')?.setAttribute('content', m.desc);
    document.getElementById('ogUrl')?.setAttribute('content', location.href);
    document.getElementById('canonicalLink')?.setAttribute('href', location.href);
}

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
    window.initMenu          = initMenu;
}
