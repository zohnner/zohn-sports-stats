Logger.info('Initializing SportsStrata…', undefined, 'APP');

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

// Fetch ESPN player map — refresh headshots when ready, then sync players to DB
fetchESPNPlayerMap()
    .then(() => {
        if (AppState.currentView === 'players' && AppState.filteredPlayers.length > 0) {
            displayPlayers(AppState.filteredPlayers);
        }
        if (AppState.allPlayers.length && AppState.nbaStatsMap) {
            StatsDB.syncPlayers(AppState.allPlayers, AppState.nbaStatsMap).catch(() => {});
        }
    })
    .catch(() => {});

// Populate the ticker independently so it works on first load
// (games tab may not have been visited yet)
(async () => {
    // Show shimmer skeleton while games are fetching to eliminate empty-ticker flicker
    const tickerEl = document.getElementById('scoreTicker');
    if (tickerEl) {
        tickerEl.innerHTML = Array.from({ length: 6 }, () =>
            `<div class="ticker__item" style="opacity:0.35">
                <span class="ticker-team" style="display:inline-block;width:28px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle"></span>
                <span class="ticker-score" style="display:inline-block;width:20px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle;margin:0 4px"></span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score" style="display:inline-block;width:20px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle;margin:0 4px"></span>
                <span class="ticker-team" style="display:inline-block;width:28px;height:10px;
                    background:var(--border-mid);border-radius:4px;vertical-align:middle"></span>
            </div>`
        ).join('');
    }

    try {
        if (AppState.currentSport === 'mlb') {
            const games = await fetchMLBSchedule(7);
            if (AppState.mlbGames.length === 0) AppState.mlbGames = games;
            updateMLBTicker(games);
            Logger.info('MLB ticker initialised', { count: games.length }, 'APP');
        } else {
            const games = await fetchGamesAPI();
            if (AppState.allGames.length === 0) AppState.allGames = games;
            updateTicker(games);
            Logger.info('Ticker initialised', { count: games.length }, 'APP');
        }
    } catch (error) {
        Logger.warn('Ticker init failed', error.message, 'APP');
        if (tickerEl) tickerEl.innerHTML = `<div class="ticker__item">No scores available</div>`;
    }
})();

// Pre-fetch standings — feeds team/player cards AND the Q&A engine's IndexedDB
fetchNBAStandings()
    .then(rows => {
        if (rows.length) {
            AppState.nbaStandings = rows;
            StatsDB.syncStandings(rows).catch(() => {});
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

// ── Home / Landing page ───────────────────────────────────────

function loadHome() {
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';

    const _stat = (target, label, suffix = '+') =>
        `<div class="home-stat">
            <div class="home-stat-num" data-target="${target}" data-suffix="${suffix}">0</div>
            <div class="home-stat-lbl">${label}</div>
        </div>`;

    grid.innerHTML = `
        <div class="home-hero">
            <div class="home-hero-glow"></div>
            <div class="home-hero-content">
                <div class="home-hero-badge">⚡ Real-time Sports Analytics</div>
                <h1 class="home-hero-title">SportsStrata</h1>
                <p class="home-hero-sub">Serious stats for serious fans</p>
                <div class="home-stats-strip">
                    ${_stat(540, 'NBA Players')}
                    ${_stat(750, 'MLB Players')}
                    ${_stat(60, 'MLB Teams & Rosters')}
                    ${_stat(4, 'Arcade Games', '')}
                </div>
            </div>
        </div>

        <div class="home-sports-grid">
            <button class="home-sport-card home-sport-card--nba" onclick="enterSport('nba')">
                <div class="home-sport-icon">🏀</div>
                <div class="home-sport-name">NBA</div>
                <div class="home-sport-desc">Players · Leaders · Teams · Scores · Standings</div>
                <div class="home-sport-cta">Explore NBA →</div>
            </button>
            <button class="home-sport-card home-sport-card--mlb" onclick="enterSport('mlb')">
                <div class="home-sport-icon">⚾</div>
                <div class="home-sport-name">MLB</div>
                <div class="home-sport-desc">Players · Leaders · Teams · Scores · Standings</div>
                <div class="home-sport-cta">Explore MLB →</div>
            </button>
            <div class="home-sport-card home-sport-card--soon">
                <div class="home-sport-icon">🏈</div>
                <div class="home-sport-name">NFL</div>
                <div class="home-sport-desc">Coming soon</div>
                <div class="home-sport-badge">Soon</div>
            </div>
            <div class="home-sport-card home-sport-card--soon">
                <div class="home-sport-icon">🏒</div>
                <div class="home-sport-name">NHL</div>
                <div class="home-sport-desc">Coming soon</div>
                <div class="home-sport-badge">Soon</div>
            </div>
        </div>

        <div class="home-features">
            <div class="home-feature-item">
                <div class="home-feature-icon">📊</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Live Leaderboards</div>
                    <div class="home-feature-desc">Real-time rankings updated daily across all major stats</div>
                </div>
            </div>
            <div class="home-feature-item">
                <div class="home-feature-icon">🎮</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Sports Arcade</div>
                    <div class="home-feature-desc">Four daily mini-games — new puzzles every day</div>
                </div>
            </div>
            <div class="home-feature-item">
                <div class="home-feature-icon">🧮</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Stat Builder</div>
                    <div class="home-feature-desc">Build custom formulas and rank players by any metric</div>
                </div>
            </div>
            <div class="home-feature-item">
                <div class="home-feature-icon">🔍</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Deep Drill-downs</div>
                    <div class="home-feature-desc">Splits, game logs, box scores, and radar charts</div>
                </div>
            </div>
        </div>
    `;

    // Animate stat counters
    grid.querySelectorAll('.home-stat-num').forEach(el => {
        const target = parseInt(el.dataset.target, 10);
        const suffix = el.dataset.suffix ?? '+';
        let cur = 0;
        const step = Math.max(1, Math.ceil(target / 40));
        const tick = () => {
            cur = Math.min(cur + step, target);
            el.textContent = cur + (cur === target ? suffix : '');
            if (cur < target) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

// Enter a sport from the home page — handles same-sport case
function enterSport(sport) {
    if (AppState.currentSport === sport) {
        navigateTo(sport === 'mlb' ? 'mlb-players' : 'players');
    } else {
        switchSport(sport);
    }
}

if (typeof window !== 'undefined') {
    window.loadHome   = loadHome;
    window.enterSport = enterSport;
}

// ── Light / Dark Mode ─────────────────────────────────────────

function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zs_theme', theme); } catch (_) {}
    const icon  = document.getElementById('themeToggleIcon');
    const label = document.getElementById('themeToggleLabel');
    if (icon)  icon.textContent  = theme === 'light' ? '🌙' : '☀️';
    if (label) label.textContent = theme === 'light' ? 'Dark mode'  : 'Light mode';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    _applyTheme(current === 'light' ? 'dark' : 'light');
}

// Sync the toggle button label on load (theme was set by the inline <head> script)
_applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

if (typeof window !== 'undefined') {
    window.toggleTheme = toggleTheme;
}
