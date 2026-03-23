Logger.info('Initializing ZohnStats…', undefined, 'APP');

// Sport switcher — toggles between NBA and MLB
(function setupSportSwitcher() {
    document.querySelectorAll('.sport-btn').forEach(btn => {
        btn.addEventListener('click', () => switchSport(btn.dataset.sport));
    });
})();

// Season selector — switches CURRENT_SEASON and reloads the current view
(function setupSeasonSelector() {
    const sel = document.getElementById('seasonSelect');
    if (!sel) return;
    sel.value = String(CURRENT_SEASON);
    sel.addEventListener('change', () => {
        const year = parseInt(sel.value, 10);
        if (year === CURRENT_SEASON) return;
        CURRENT_SEASON = year;
        // Clear all season-specific state — forces a fresh load for the new season
        AppState.allPlayers      = [];
        AppState.filteredPlayers = [];
        AppState.playerStats     = {};
        AppState.allGames        = [];
        AppState.nbaStatsMap     = null;
        AppState._nbaStatsSeason = null;
        // Teams data is season-independent; keep allTeams
        Logger.info(`Season → ${year}–${String(year + 1).slice(-2)}`, undefined, 'APP');
        renderCurrentView(AppState.currentView);
    });
})();

// Bust the localStorage cache when the season changes so stale data
// from a previous season never blocks the new one.
(function bustCacheOnSeasonChange() {
    const key = 'zs_season';
    const stored = localStorage.getItem(key);
    if (stored !== String(CURRENT_SEASON)) {
        ApiCache.invalidate('');
        localStorage.setItem(key, String(CURRENT_SEASON));
        Logger.info(`Season changed to ${CURRENT_SEASON} — cache cleared`, undefined, 'APP');
    }
})();

// setupNavigation calls _loadFromHash which handles initial view + player loading
setupNavigation();

// Ticker sits right below the sticky header — keep its top in sync
(function fixStickyTicker() {
    const header = document.querySelector('header');
    const ticker = document.querySelector('.ticker-wrap');
    if (!header || !ticker) return;
    const update = () => { ticker.style.top = header.offsetHeight + 'px'; };
    update();
    new ResizeObserver(update).observe(header);
})();

// Fetch ESPN player map; once resolved, refresh the players grid so headshots appear
fetchESPNPlayerMap()
    .then(() => {
        if (AppState.currentView === 'players' && AppState.filteredPlayers.length > 0) {
            displayPlayers(AppState.filteredPlayers);
        }
    })
    .catch(() => {});

// Populate the ticker independently so it works on first load
// (games tab may not have been visited yet)
(async () => {
    try {
        const games = await fetchGamesAPI();
        if (AppState.allGames.length === 0) AppState.allGames = games;
        updateTicker(games);
        Logger.info('Ticker initialised', { count: games.length }, 'APP');
    } catch (error) {
        Logger.warn('Ticker init failed', error.message, 'APP');
    }
})();

// Pre-fetch standings so team cards + player cards show W-L on first render
fetchNBAStandings()
    .then(rows => {
        if (rows.length) {
            AppState.nbaStandings = rows;
            // Re-render current view only if it displays team/player data
            const v = AppState.currentView;
            if (v === 'players' && AppState.filteredPlayers.length > 0) displayPlayers(AppState.filteredPlayers);
            if (v === 'teams'   && AppState.allTeams.length > 0)        displayTeams(AppState.allTeams);
        }
    })
    .catch(() => {});

// Live score polling — re-fetches NBA games every 30s when live games are present
(function setupLivePolling() {
    const INTERVAL = 30_000;

    function _isLive(g) {
        const st = g.status || '';
        return st.includes('Q') || st.includes('Half') || st.includes(':');
    }

    async function _poll() {
        try {
            if (AppState.currentSport !== 'nba') return;
            // Only keep polling while there are (or may be) live games
            const cached = AppState.allGames;
            if (cached.length > 0 && !cached.some(_isLive)) return;
            ApiCache.invalidate('/games');
            const games = await fetchGamesAPI();
            AppState.allGames = games;
            updateTicker(games);
            if (AppState.currentView === 'games') displayGames(games);
            const liveCount = games.filter(_isLive).length;
            if (liveCount > 0) Logger.info(`Live poll: ${liveCount} live games`, undefined, 'POLL');
        } catch (err) {
            Logger.warn('Live poll failed', err.message, 'POLL');
        }
    }

    setInterval(_poll, INTERVAL);
})();

Logger.info('App bootstrap complete', undefined, 'APP');
