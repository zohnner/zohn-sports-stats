Logger.info('Initializing SportStrata…', undefined, 'APP');

// Ticker — SCORES button navigates to scores for the active sport
(function setupTickerNav() {
    document.getElementById('tickerScoresBtn')?.addEventListener('click', () => {
        const sportViews = { nba: 'games', mlb: 'mlb-games', nfl: 'nfl-games', nhl: 'nhl-games' };
        navigateTo(sportViews[AppState.currentSport] || 'games');
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
        // MLB season state
        AppState.mlbPlayers      = { hitting: [], pitching: [] };
        AppState.mlbPlayerStats  = { hitting: {}, pitching: {} };
        AppState.mlbTeams        = [];
        AppState.mlbGames        = [];
        AppState.mlbStandings    = null;
        AppState.mlbLeaderSplits = null;
        if (typeof _clearMLBLeaderSplitsCache === 'function') _clearMLBLeaderSplitsCache();
        // Sync the MLB module's own season variable
        if (typeof setMLBSeason === 'function') setMLBSeason(year);
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
        const games = await fetchMLBSchedule(7);
        if (AppState.mlbGames.length === 0) AppState.mlbGames = games;
        updateMLBTicker(games);
        Logger.info('MLB ticker initialised', { count: games.length }, 'APP');
    } catch (error) {
        Logger.warn('Ticker init failed', error.message, 'APP');
        if (tickerEl) tickerEl.innerHTML = `<div class="ticker__item">No scores available</div>`;
    }
})();



// Live score polling — MLB (60s; same pattern as NBA above)
(function setupMLBLivePolling() {
    const INTERVAL = 60_000;

    async function _poll() {
        try {
            if (AppState.currentSport !== 'mlb') return;
            const cached = AppState.mlbGames || [];
            const hasLive = cached.some(g => g.status?.abstractGameState === 'Live');
            if (cached.length > 0 && !hasLive) return;
            ApiCache.invalidate('/schedule');
            const games = await fetchMLBSchedule(7);
            AppState.mlbGames = games;
            updateMLBTicker(games);
            // If user is on the games view, refresh via loadMLBGames so date nav stays intact
            if (AppState.currentView === 'mlb-games' && typeof loadMLBGames === 'function') {
                loadMLBGames();
            }
            // If user is on the home view, refresh today's game cards
            if (AppState.currentView === 'home' && document.getElementById('homeTodayGrid')) {
                _loadHomeTodayGames();
            }
            const liveCount = games.filter(g => g.status?.abstractGameState === 'Live').length;
            if (liveCount > 0) Logger.info(`MLB live poll: ${liveCount} live`, undefined, 'POLL');
        } catch (err) {
            Logger.warn('MLB live poll failed', err.message, 'POLL');
        }
    }

    setInterval(_poll, INTERVAL);
})();

// ── Ticker click → game detail ────────────────────────────────
// Live score polling — NFL (60s; mirrors MLB)
(function setupNFLLivePolling() {
    async function _poll() {
        try {
            if (AppState.currentSport !== 'nfl') return;
            if (typeof fetchNFLScoreboard !== 'function') return;
            const cached = AppState.nflGames || [];
            const hasLive = cached.some(g => g.isLive);
            if (cached.length > 0 && !hasLive) return;
            const games = await fetchNFLScoreboard();
            AppState.nflGames = games;
            if (typeof updateNFLTicker === 'function') updateNFLTicker(games);
            if (AppState.currentView === 'nfl-games' && typeof displayNFLGames === 'function') displayNFLGames(games);
            const liveCount = games.filter(g => g.isLive).length;
            if (liveCount > 0 && window.Logger) Logger.info(`NFL live poll: ${liveCount} live`, undefined, 'POLL');
        } catch (err) { if (window.Logger) Logger.warn('NFL live poll failed', err.message, 'POLL'); }
    }
    setInterval(_poll, 60000);
})();

(function setupTickerClicks() {
    const tickerEl = document.getElementById('scoreTicker');
    if (!tickerEl) return;
    tickerEl.addEventListener('click', e => {
        const item = e.target.closest('[data-game-id],[data-game-pk]');
        if (!item) return;
        const sport = item.dataset.sport;
        if (sport === 'mlb') {
            const gamePk = parseInt(item.dataset.gamePk, 10);
            if (!gamePk) return;
            if (AppState.currentSport !== 'mlb') switchSport('mlb');
            if (typeof openMLBGame === 'function') openMLBGame(gamePk, item.classList.contains('ticker__item--live'));
            else if (typeof showMLBGameDetail === 'function') showMLBGameDetail(gamePk);
        } else if (sport === 'nfl') {
            const gid = item.dataset.gameId;
            if (AppState.currentSport !== 'nfl') switchSport('nfl');
            if (gid) navigateTo('nfl-game-' + gid);
            else navigateTo('nfl-games');
        } else if (sport === 'nhl') {
            if (AppState.currentSport !== 'nhl') switchSport('nhl');
            else navigateTo('nhl-games');
        }
    });
})();

Logger.info('App bootstrap complete', undefined, 'APP');

// Back-to-top button — show after 400px scroll
(function setupBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;
    window.addEventListener('scroll', () => {
        btn.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
})();

// ── Home / Landing page ───────────────────────────────────────

function loadHome() {
    if (typeof _applySportUI === 'function') _applySportUI('mlb');
    const grid = document.getElementById('playersGrid');
    if (!grid) return;
    grid.className = 'home-container';

    const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric'
    });

    // Structured skeleton cards that match the real game card layout
    const skelCards = Array.from({length: 6}, () => `
        <div class="home-game-card home-game-card--skeleton" aria-hidden="true">
            <div class="hgc-row">
                <span class="skeleton-line" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></span>
                <span class="skeleton-line" style="width:36px;height:13px"></span>
                <span class="skeleton-line" style="width:18px;height:16px;margin-left:auto"></span>
            </div>
            <div class="hgc-row">
                <span class="skeleton-line" style="width:28px;height:28px;border-radius:50%;flex-shrink:0"></span>
                <span class="skeleton-line" style="width:36px;height:13px"></span>
                <span class="skeleton-line" style="width:18px;height:16px;margin-left:auto"></span>
            </div>
            <div class="hgc-card-footer">
                <span class="skeleton-line" style="width:48px;height:11px"></span>
            </div>
        </div>
    `).join('');

    const isFirstVisit = !localStorage.getItem('zs_seen_welcome');
    if (isFirstVisit) localStorage.setItem('zs_seen_welcome', '1');

    grid.innerHTML = `
        ${isFirstVisit ? `
        <div class="home-welcome">
            <strong class="home-welcome-headline">Advanced MLB stats for announcers, fantasy players, and data fans.</strong>
            <span class="home-welcome-sub">FIP, BABIP, ISO, Statcast percentiles, and 50+ leaderboard categories — free, no account, no paywall.</span>
        </div>` : ''}
        <!-- Search prompt bar (P2-004) -->
        <button class="home-search-bar" onclick="document.getElementById('searchBtn')?.click()" aria-label="Search players">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span class="home-search-bar-text">Search 900+ MLB players, teams…</span>
            <kbd class="home-search-kbd">⌘K</kbd>
        </button>

        <!-- Today's Games — dominant first module -->
        <div class="home-today" id="homeTodayGames">
            <div class="home-section-hdr">
                <span class="home-section-title">Today's Games</span>
                <span class="home-section-date">${dateStr}</span>
                <button class="home-section-link" onclick="navigateTo('mlb-games')">All scores →</button>
            </div>
            <div class="home-today-grid" id="homeTodayGrid">${skelCards}</div>
        </div>

        <!-- Tonight's Starting Pitchers — populated by _renderTonightSPSection() -->
        <div id="homeTonightSP">
            <div class="home-section-hdr">
                <span class="home-section-title">Tonight's Starters</span>
                <button class="home-section-link" onclick="navigateTo('mlb-prep')">Game Prep →</button>
            </div>
            <div class="sp-grid">
                ${[0,1,2].map(() => `
                <div class="sp-card">
                    <div class="sp-pitcher sp-pitcher--away" style="cursor:default">
                        <div class="skeleton-line" style="width:40px;height:40px;border-radius:50%;flex-shrink:0"></div>
                        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0.35rem">
                            <div class="skeleton-line" style="height:11px;width:75%"></div>
                            <div class="skeleton-line" style="height:9px;width:50%"></div>
                        </div>
                    </div>
                    <div class="sp-vs"><div class="skeleton-line" style="height:9px;width:20px"></div></div>
                    <div class="sp-pitcher sp-pitcher--home" style="cursor:default">
                        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0.35rem;align-items:flex-end">
                            <div class="skeleton-line" style="height:11px;width:75%"></div>
                            <div class="skeleton-line" style="height:9px;width:50%"></div>
                        </div>
                        <div class="skeleton-line" style="width:40px;height:40px;border-radius:50%;flex-shrink:0"></div>
                    </div>
                </div>`).join('')}
            </div>
        </div>

        <!-- Hot Right Now (P2-002) — populated by _renderHotStrip() -->
        <div id="homeHotStrip">
            <div class="home-section-hdr">
                <span class="home-section-title">Hot Right Now</span>
                <button class="home-section-link" onclick="navigateTo('mlb-leaders')">Full leaderboards →</button>
            </div>
            <div class="home-hot-grid" id="homeHotGrid">
                <div class="skeleton-line" style="height:56px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:56px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:56px;border-radius:var(--radius-md)"></div>
                <div class="skeleton-line" style="height:56px;border-radius:var(--radius-md)"></div>
            </div>
        </div>

        <div class="home-recents" id="homeRecents"></div>
        <div class="home-starred" id="homeStarred"></div>

        <!-- On This Day (P2-003) — moved above feature strip -->
        <div class="home-on-this-day" id="homeOnThisDay" style="display:none"></div>

        <!-- Feature strip (P2-005) -->
        <div class="home-features">
            <button class="home-feature-item" onclick="navigateTo('mlb-leaders')">
                <div class="home-feature-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                        <path d="M2 14V9M7 14V6M12 14V2"/><path d="M1 14h14" stroke-width="1" opacity=".5"/>
                    </svg>
                </div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Leaderboards</div>
                    <div class="home-feature-desc">AVG · OPS · ERA · FIP · EV · xBA</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-prep')">
                <div class="home-feature-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="3" width="12" height="12" rx="1.5"/><path d="M5 3V2a2 2 0 0 1 6 0v1"/><path d="M5 8h6M5 11h4"/>
                    </svg>
                </div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Game Prep</div>
                    <div class="home-feature-desc">Matchups · lineups · print-ready</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-players')">
                <div class="home-feature-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                        <circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/><path d="M8 2V1M8 15v-1M2 8H1M15 8h-1"/>
                    </svg>
                </div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Statcast</div>
                    <div class="home-feature-desc">Exit velo · barrel% · xBA per player</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-builder')">
                <div class="home-feature-icon">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2H4l4 6-4 6h8"/>
                    </svg>
                </div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Stat Builder</div>
                    <div class="home-feature-desc">Custom formulas · rank any metric</div>
                </div>
            </button>
        </div>

        <footer class="home-footer">
            <span>Stats: MLB Stats API &amp; Baseball Savant. This site is not endorsed by or affiliated with Major League Baseball.</span>
            <span>&copy; ${new Date().getFullYear()} SportStrata</span>
        </footer>
    `;

    _renderHomeRecents();
    _renderHomeStarred();
    _renderHotStrip();
    _loadOnThisDay();
    _loadHomeTodayGames();

    // Background-load leaderboard data for Hot Strip if not yet cached
    if (!AppState.mlbLeaderSplits && typeof _fetchMLBLeaderSplits === 'function') {
        _fetchMLBLeaderSplits(MLB_SEASON)
            .then(() => {
                _renderHotStrip();
                _renderTonightSPSection();
            }).catch(err => {
                Logger.warn('Leader splits failed — removing home async sections', err, 'APP');
                document.getElementById('homeHotStrip')?.remove();
                document.getElementById('homeTonightSP')?.remove();
            });
    }
}

function _renderHomeRecents() {
    const el = document.getElementById('homeRecents');
    if (!el) return;
    let recents = [];
    try { recents = JSON.parse(localStorage.getItem('zs_recents') || '[]'); } catch (_) {}
    recents = recents.filter(r => r.sport === 'mlb');
    if (!recents.length) { el.innerHTML = ''; return; }

    const chips = recents.slice(0, 8).map(r => `
            <button class="home-recent-chip" data-id="${r.id}" data-sport="${r.sport}" data-type="${r.type || 'player'}">
                <span class="home-recent-badge home-recent-badge--mlb">${_escHtml(r.badge || 'MLB')}</span>
                <span class="home-recent-name">${_escHtml(r.name)}</span>
                <span class="home-recent-sub">${_escHtml(r.sub || '')}</span>
            </button>
        `).join('');

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Recently Viewed</span>
        </div>
        <div class="home-recents-grid">${chips}</div>
    `;

    el.querySelectorAll('.home-recent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id   = parseInt(chip.dataset.id);
            const type = chip.dataset.type;
            if (type === 'player' && typeof showMLBPlayerDetail === 'function') showMLBPlayerDetail(id);
            else if (type === 'team' && typeof showMLBTeamDetail === 'function') showMLBTeamDetail(id);
        });
    });
}

function _renderHomeStarred() {
    const el = document.getElementById('homeStarred');
    if (!el) return;
    const favIds = AppState.mlbFavorites;
    if (!favIds || favIds.size === 0) { el.innerHTML = ''; return; }

    const chips = [...favIds].map(id => {
        const player = [...(AppState.mlbPlayers?.hitting || []), ...(AppState.mlbPlayers?.pitching || [])]
            .find(p => p.id === id);
        if (!player) return null;
        const hitSt = AppState.mlbPlayerStats?.hitting?.[id];
        const pitSt = AppState.mlbPlayerStats?.pitching?.[id];
        const stat  = hitSt?.avg ? `AVG ${hitSt.avg}` : pitSt?.era ? `ERA ${pitSt.era}` : '';
        return `
            <button class="home-recent-chip" data-id="${id}">
                <span class="home-recent-badge home-recent-badge--mlb">♥</span>
                <span class="home-recent-name">${_escHtml(player.fullName)}</span>
                <span class="home-recent-sub">${_escHtml(player.teamAbbr || '')}${stat ? ' · ' + stat : ''}</span>
            </button>`;
    }).filter(Boolean);

    if (!chips.length) { el.innerHTML = ''; return; }

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Starred Players</span>
        </div>
        <div class="home-recents-grid">${chips.join('')}</div>
    `;

    el.querySelectorAll('.home-recent-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const id = parseInt(chip.dataset.id, 10);
            if (typeof showMLBPlayerDetail === 'function') showMLBPlayerDetail(id);
        });
    });
}

function _renderHotStrip() {
    const container = document.getElementById('homeHotStrip');
    const grid      = document.getElementById('homeHotGrid');
    if (!container || !grid) return;

    const hitting  = AppState.mlbLeaderSplits?.hitting  || [];
    const pitching = AppState.mlbLeaderSplits?.pitching || [];
    if (!hitting.length && !pitching.length) return;

    const _fmtAvgLocal = v => v >= 1 ? v.toFixed(2) : ('.' + String(Math.round(v * 1000)).padStart(3, '0'));
    const _top = (splits, sortKey, desc = true) => {
        const sorted = [...splits]
            .filter(s => s.stat?.[sortKey] != null && !isNaN(parseFloat(s.stat[sortKey])))
            .sort((a, b) => {
                const av = parseFloat(a.stat[sortKey]), bv = parseFloat(b.stat[sortKey]);
                return desc ? bv - av : av - bv;
            });
        return sorted[0] || null;
    };

    // Qualified pools for rate leaders (MLB standard: 3.1 PA / 1 IP per team game),
    // so a 1-for-1 line can't appear as the batting-average or OPS "leader".
    const _teamG  = Math.max(0, ...hitting.map(s => parseInt(s.stat?.gamesPlayed, 10) || 0));
    const _paQual = Math.round(3.1 * _teamG);
    const _ipQual = _teamG;
    const _qh = hitting.filter(s => (parseFloat(s.stat?.plateAppearances) || 0) >= _paQual);
    const _qp = pitching.filter(s => (parseFloat(s.stat?.inningsPitched) || 0) >= _ipQual);
    const qHit = _qh.length ? _qh : hitting;
    const qPit = _qp.length ? _qp : pitching;

    const spots = [
        { split: _top(hitting, 'homeRuns'),  key: 'homeRuns',  label: 'Home Runs',  unit: 'HR',  fmt: v => String(v) },
        { split: _top(qHit, 'avg'),           key: 'avg',       label: 'Batting Avg', unit: 'AVG', fmt: v => _fmtAvgLocal(v) },
        { split: _top(qPit, 'era', false),    key: 'era',       label: 'ERA Leader',  unit: 'ERA', fmt: v => parseFloat(v).toFixed(2) },
        { split: _top(qHit, 'ops'),           key: 'ops',       label: 'OPS Leader',  unit: 'OPS', fmt: v => _fmtAvgLocal(v) },
    ].filter(s => s.split);

    if (!spots.length) return;

    grid.innerHTML = spots.map(({ split, key, label, unit, fmt }) => {
        const val    = fmt(parseFloat(split.stat[key]));
        const name   = split.player?.fullName || '—';
        const abbr   = split.team?.abbreviation || '';
        const pid    = split.player?.id;
        const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr) : { primary: '#7c8df0' };
        const headshot = pid && typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(pid) : null;
        const initials = name.split(' ').map(w => w[0] || '').slice(0, 2).join('');
        return `
            <button class="home-hot-tile" data-pid="${pid || ''}" style="--team-color:${colors.primary}">
                <div class="home-hot-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="home-hot-initials">${initials}</span>
                </div>
                <div class="home-hot-body">
                    <span class="home-hot-label">${label}</span>
                    <span class="home-hot-name">${_escHtml(name)}</span>
                    <span class="home-hot-team">${_escHtml(abbr)}</span>
                </div>
                <div class="home-hot-stat">${val}<span class="home-hot-unit">${unit}</span></div>
            </button>`;
    }).join('');

    grid.querySelectorAll('.home-hot-tile[data-pid]').forEach(tile => {
        const pid = parseInt(tile.dataset.pid, 10);
        if (!pid) return;
        tile.addEventListener('click', () => {
            if (typeof showMLBPlayerDetail === 'function') showMLBPlayerDetail(pid);
        });
    });

    container.style.display = '';
}

function _renderTonightSPSection() {
    const el = document.getElementById('homeTonightSP');
    if (!el) return;

    const games    = AppState._homeGames || [];
    const pitSplits = AppState.mlbLeaderSplits?.pitching || [];
    if (!games.length || !pitSplits.length) return;

    // Index pitching splits by player ID for O(1) lookup
    const statsById = {};
    pitSplits.forEach(s => { if (s.player?.id) statsById[s.player.id] = s.stat; });

    // Only scheduled/live today's games that have at least one probable pitcher
    const todayET = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const upcoming = games.filter(g => {
        if ((g.gameDate || '').slice(0, 10) !== todayET) return false;
        if (g.status?.abstractGameState === 'Final') return false;
        return g.teams?.away?.probablePitcher?.id || g.teams?.home?.probablePitcher?.id;
    }).slice(0, 8);

    if (!upcoming.length) { el.style.display = 'none'; return; }

    const _fmt = (val, dec) => val != null && !isNaN(parseFloat(val)) ? parseFloat(val).toFixed(dec) : '—';
    const _fmtAvgLocal = v => { const n = parseFloat(v); return isNaN(n) ? '—' : n >= 1 ? n.toFixed(2) : '.' + String(Math.round(n * 1000)).padStart(3, '0'); };

    const _spCard = (pp, teamAbbr, align, oppTeamId) => {
        if (!pp?.id) {
            return `<div class="sp-pitcher sp-pitcher--${align} sp-pitcher--tbd"><span class="sp-tbd">TBD</span></div>`;
        }
        const s       = statsById[pp.id] || {};
        const colors  = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(teamAbbr) : { primary: '#7c8df0' };
        const headshot = typeof getMLBPlayerHeadshotUrl === 'function' ? getMLBPlayerHeadshotUrl(pp.id) : '';
        const initials = (pp.fullName || '').split(' ').map(w => w[0] || '').slice(0, 2).join('');
        const wl      = (s.wins != null && s.losses != null) ? `${s.wins}–${s.losses}` : '';
        const era     = _fmt(s.era, 2);
        const whip    = _fmt(s.whip, 2);
        const k9      = _fmt(s.strikeoutsPer9Inn, 1);
        const pid     = pp.id;

        const lastName = (pp.fullName || '').split(' ').slice(1).join(' ') || pp.fullName || 'TBD';

        return `
            <div class="sp-pitcher sp-pitcher--${align}" role="button" tabindex="0"
                 data-pitcher-id="${pid}" data-opp-team-id="${oppTeamId || ''}"
                 onclick="showMLBPlayerDetail(${pid},'pitching')"
                 onkeydown="if(event.key==='Enter')showMLBPlayerDetail(${pid},'pitching')"
                 title="${_escHtml(pp.fullName || '')}">
                <div class="sp-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshot ? `<img src="${headshot}" alt="" loading="lazy" data-hide-on-error>` : ''}
                    <span class="sp-avatar-initials">${_escHtml(initials)}</span>
                </div>
                <div class="sp-info">
                    <span class="sp-name">${_escHtml(lastName)}</span>
                    <span class="sp-team" style="color:${colors.primary}">${_escHtml(teamAbbr)}</span>
                    <div class="sp-statline">
                        <span>${era} ERA</span>
                        <span>${whip} WHIP</span>
                        <span>${k9} K/9</span>
                        ${wl ? `<span>${wl}</span>` : ''}
                    </div>
                    ${oppTeamId ? `<div class="vs-opp-row" data-vs-placeholder="1"><span class="skeleton-line" style="height:9px;width:120px;display:inline-block"></span></div>` : ''}
                    <div class="vs-opp-row" data-ha-placeholder="1"><span class="skeleton-line" style="height:9px;width:90px;display:inline-block"></span></div>
                </div>
            </div>`;
    };

    const cards = upcoming.map(g => {
        const awayAbbr = g.teams?.away?.team?.abbreviation || '';
        const homeAbbr = g.teams?.home?.team?.abbreviation || '';
        const awayPP   = g.teams?.away?.probablePitcher;
        const homePP   = g.teams?.home?.probablePitcher;
        const d        = new Date(g.gameDate || '');
        const etH      = (d.getUTCHours() - 4 + 24) % 24;
        const etM      = d.getUTCMinutes();
        const timeStr  = isNaN(etH) ? '' : `${etH % 12 || 12}:${String(etM).padStart(2,'0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;

        const awayTeamId = g.teams?.away?.team?.id;
        const homeTeamId = g.teams?.home?.team?.id;

        return `
            <div class="sp-card">
                ${_spCard(awayPP, awayAbbr, 'away', homeTeamId)}
                <div class="sp-vs">
                    <span class="sp-vs-text">vs</span>
                    ${timeStr ? `<span class="sp-time">${timeStr}</span>` : ''}
                </div>
                ${_spCard(homePP, homeAbbr, 'home', awayTeamId)}
            </div>`;
    }).join('');

    el.innerHTML = `
        <div class="home-section-hdr">
            <span class="home-section-title">Tonight's Starters</span>
            <button class="home-section-link" onclick="navigateTo('mlb-prep')">Game Prep →</button>
        </div>
        <div class="sp-grid">${cards}</div>
    `;
    el.style.display = '';

    // Async enrichment: populate vs-opponent career stats for each SP
    el.querySelectorAll('[data-pitcher-id][data-opp-team-id]').forEach(async pitcherEl => {
        const pid    = parseInt(pitcherEl.dataset.pitcherId);
        const oppId  = parseInt(pitcherEl.dataset.oppTeamId);
        const rowEl  = pitcherEl.querySelector('[data-vs-placeholder]');
        if (!pid || !oppId || !rowEl) return;

        try {
            const data = await mlbFetch(`/people/${pid}`, {
                hydrate: `stats(group=[pitching],type=vsTeamTotal,opposingTeamId=${oppId})`
            }, ApiCache.TTL.LONG);

            const split = data.people?.[0]?.stats?.[0]?.splits?.[0]?.stat;
            if (!split || !split.gamesPlayed) { rowEl.remove(); return; }

            const opp    = data.people?.[0]?.stats?.[0]?.splits?.[0]?.opponent?.abbreviation || '';
            const baa    = split.avg ? split.avg.replace(/^0/, '') : null;
            const k      = split.strikeOuts;
            const bb     = split.baseOnBalls;
            const starts = split.gamesPlayed;
            const qual   = starts < 3 ? '(small sample)' : `(${starts} starts)`;

            if (!baa) { rowEl.remove(); return; }

            rowEl.removeAttribute('data-vs-placeholder');
            rowEl.innerHTML =
                `<span class="vs-opp-row__label">${_escHtml(opp)} career</span>` +
                `<span class="vs-opp-row__val">${_escHtml(baa)} BAA</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__val">${k} K</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__val">${bb} BB</span>` +
                `<span class="vs-opp-row__caveat">${_escHtml(qual)}</span>`;
        } catch (_) {
            rowEl.remove();
        }
    });

    // Async enrichment: home/away ERA split for each confirmed SP
    el.querySelectorAll('[data-pitcher-id]').forEach(pitcherEl => {
        const pid   = parseInt(pitcherEl.dataset.pitcherId);
        const haRow = pitcherEl.querySelector('[data-ha-placeholder]');
        if (!pid || !haRow) return;
        mlbFetch(`/people/${pid}`, {
            hydrate: `stats(group=[pitching],type=homeAndAway,season=${MLB_SEASON})`
        }, ApiCache.TTL.LONG).then(data => {
            const splits = data.people?.[0]?.stats?.[0]?.splits || [];
            const home = splits.find(s => s.split?.code === 'H')?.stat;
            const away = splits.find(s => s.split?.code === 'A')?.stat;
            if (!home || !away) { haRow.remove(); return; }
            const hEra = home.era != null ? parseFloat(home.era).toFixed(2) : null;
            const aEra = away.era != null ? parseFloat(away.era).toFixed(2) : null;
            if (!hEra && !aEra) { haRow.remove(); return; }
            haRow.removeAttribute('data-ha-placeholder');
            haRow.innerHTML =
                `<span class="vs-opp-row__label">Home</span>` +
                `<span class="vs-opp-row__val">${_escHtml(hEra || '—')} ERA</span>` +
                `<span class="vs-opp-row__sep">·</span>` +
                `<span class="vs-opp-row__label">Away</span>` +
                `<span class="vs-opp-row__val">${_escHtml(aEra || '—')} ERA</span>`;
        }).catch(() => haRow.remove());
    });
}

async function _loadHomeTodayGames() {
    const gridEl = document.getElementById('homeTodayGrid');
    if (!gridEl) return;

    const _teamFullName = (abbr) => {
        const colors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(abbr) : null;
        return colors?.name || abbr;
    };

    const _gameCard = (homeAbbr, awayAbbr, homeScore, awayScore, status, homeId, awayId, gameKey, gameDate, awayPP, homePP) => {
        const isFinal   = /final|^f$/i.test(status);
        const isLive    = !isFinal && /in progress|live/i.test(status);
        const hasScore  = isFinal || isLive || homeScore > 0 || awayScore > 0;
        const homeWon   = isFinal && homeScore > awayScore;
        const awayWon   = isFinal && awayScore > homeScore;
        const pillCls   = isFinal ? 'final' : isLive ? 'live' : 'sched';
        let pillLabel;
        if (isFinal) {
            pillLabel = 'Final';
        } else if (isLive) {
            pillLabel = 'Live';
        } else if (gameDate) {
            const d = new Date(gameDate);
            const etH = (d.getUTCHours() - 4 + 24) % 24;
            const etM = d.getUTCMinutes();
            pillLabel = `${etH % 12 || 12}:${String(etM).padStart(2, '0')} ${etH >= 12 ? 'PM' : 'AM'} ET`;
        } else {
            pillLabel = 'Scheduled';
        }
        const homeLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeAbbr) : '';
        const awayLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayAbbr) : '';
        const homeColors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(homeAbbr) : { primary: '#7c8df0' };
        const homeName   = _teamFullName(homeAbbr);
        const awayName   = _teamFullName(awayAbbr);
        const fmt        = (n) => hasScore ? n : '–';
        const liveCls    = isLive ? ' home-game-card--live' : '';
        const lastName   = n => n ? n.split(' ').slice(-1)[0] : 'TBD';
        const ppLine     = !isFinal && (awayPP || homePP)
            ? `<div class="hgc-pitchers">${lastName(awayPP)} vs ${lastName(homePP)}</div>`
            : '';
        return `
            <div class="home-game-card${liveCls}" data-game-key="${gameKey}" data-game-status="${pillCls}" role="button" tabindex="0"
                 aria-label="${awayName} ${fmt(awayScore)} at ${homeName} ${fmt(homeScore)}, ${pillLabel}"
                 style="--hgc-team-color:${homeColors.primary}">
                <div class="hgc-row">
                    ${awayLogo ? `<img class="hgc-team-logo" src="${awayLogo}" alt="${awayAbbr}" data-hide-on-error>` : `<span class="hgc-logo-ph"></span>`}
                    <span class="hgc-abbr${awayWon ? ' hgc-abbr--win' : ''}" title="${awayName}">${awayAbbr}</span>
                    <span class="hgc-score${awayWon ? ' hgc-score--win' : ''}">${fmt(awayScore)}</span>
                </div>
                <div class="hgc-row">
                    ${homeLogo ? `<img class="hgc-team-logo" src="${homeLogo}" alt="${homeAbbr}" data-hide-on-error>` : `<span class="hgc-logo-ph"></span>`}
                    <span class="hgc-abbr${homeWon ? ' hgc-abbr--win' : ''}" title="${homeName}">${homeAbbr}</span>
                    <span class="hgc-score${homeWon ? ' hgc-score--win' : ''}">${fmt(homeScore)}</span>
                </div>
                ${ppLine}
                <div class="hgc-card-footer">
                    <span class="hgc-pill hgc-pill--${pillCls}">${pillLabel}</span>
                </div>
            </div>`;
    };

    try {
        const mlbResult = await fetchMLBSchedule(2).catch(() => null);
        if (mlbResult) AppState._homeGames = mlbResult;
        const cards = [];

        if (mlbResult) {
            mlbResult.slice(0, 15).forEach(g => cards.push(_gameCard(
                g.teams?.home?.team?.abbreviation ?? '?',
                g.teams?.away?.team?.abbreviation ?? '?',
                g.teams?.home?.score ?? 0,
                g.teams?.away?.score ?? 0,
                g.status?.detailedState || '',
                g.teams?.home?.team?.id,
                g.teams?.away?.team?.id,
                `mlb-${g.gamePk}`,
                g.gameDate,
                g.teams?.away?.probablePitcher?.fullName,
                g.teams?.home?.probablePitcher?.fullName,
            )));
        }

        if (!gridEl.isConnected) return;

        if (cards.length === 0) {
            gridEl.innerHTML = `<p class="home-no-games">No games scheduled today.</p>`;
            return;
        }

        gridEl.innerHTML = cards.join('');

        // Update section header with live count badge + filter pills (idempotent)
        const liveCount = mlbResult ? mlbResult.filter(g => /in progress|live/i.test(g.status?.detailedState || '')).length : 0;
        const hdrEl = document.querySelector('#homeTodayGames .home-section-hdr');
        if (hdrEl) {
            // Strip stale live badge before re-inserting
            hdrEl.querySelectorAll('.home-live-badge').forEach(el => el.remove());
            if (liveCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'home-live-badge';
                badge.textContent = `${liveCount} Live`;
                hdrEl.appendChild(badge);
            }

            // Remove stale filter bar before re-inserting
            gridEl.parentNode.querySelectorAll('.home-filter-bar').forEach(el => el.remove());
            const filterBar = document.createElement('div');
            filterBar.className = 'home-filter-bar';
            filterBar.innerHTML = `
                <button class="home-filter-pill active" data-filter="all">All</button>
                ${liveCount > 0 ? '<button class="home-filter-pill home-filter-pill--live" data-filter="live">Live</button>' : ''}
                <button class="home-filter-pill" data-filter="final">Final</button>
                <button class="home-filter-pill" data-filter="sched">Upcoming</button>
            `;
            gridEl.parentNode.insertBefore(filterBar, gridEl);

            filterBar.addEventListener('click', e => {
                const pill = e.target.closest('.home-filter-pill');
                if (!pill) return;
                filterBar.querySelectorAll('.home-filter-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                const filter = pill.dataset.filter;
                gridEl.querySelectorAll('.home-game-card').forEach(card => {
                    const visible = filter === 'all' || card.dataset.gameStatus === filter;
                    card.style.display = visible ? '' : 'none';
                });
            });
        }

        gridEl.querySelectorAll('.home-game-card').forEach(card => {
            const open = () => {
                const id = parseInt((card.dataset.gameKey || '').replace('mlb-', ''), 10);
                if (!id) return;
                if (AppState.currentSport !== 'mlb') switchSport('mlb');
                if (typeof openMLBGame === 'function') openMLBGame(id, card.classList.contains('home-game-card--live'));
                else if (typeof showMLBGameDetail === 'function') showMLBGameDetail(id);
            };
            card.addEventListener('click', open);
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
        });

        _renderTonightSPSection();

    } catch (_) {
        if (gridEl.isConnected) {
            gridEl.innerHTML = `<p class="home-no-games">Scores unavailable.</p>`;
        }
    }
}

// ── On This Day (ANN-005) ─────────────────────────────────────
// Fetches MLB games from today's date in the last 3 seasons,
// picks a completed game, grabs the box score, surfaces top performer.

async function _loadOnThisDay() {
    const today   = new Date();
    const mm      = String(today.getMonth() + 1).padStart(2, '0');
    const dd      = String(today.getDate()).padStart(2, '0');
    const curYear = today.getFullYear();
    const month   = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

    for (let offset = 1; offset <= 3; offset++) {
        const year    = curYear - offset;
        const dateStr = `${year}-${mm}-${dd}`;

        let sched;
        try {
            sched = await mlbFetch('/schedule', {
                sportId: 1, startDate: dateStr, endDate: dateStr, hydrate: 'linescore',
            }, ApiCache.TTL.LONG);
        } catch (err) {
            Logger.warn(`OnThisDay: schedule fetch failed for ${dateStr}`, err?.message, 'APP');
            continue;
        }

        const container = document.getElementById('homeOnThisDay');
        if (!container || !container.isConnected) return;

        const games    = sched?.dates?.[0]?.games || [];
        const finished = games.filter(g => g.status?.abstractGameState === 'Final');
        if (finished.length === 0) continue;

        const game = finished.reduce((best, g) => {
            const runs  = (g.linescore?.teams?.home?.runs ?? 0) + (g.linescore?.teams?.away?.runs ?? 0);
            const bRuns = (best.linescore?.teams?.home?.runs ?? 0) + (best.linescore?.teams?.away?.runs ?? 0);
            return runs > bRuns ? g : best;
        });

        let players = [];
        try {
            const bs = await mlbFetch(`/game/${game.gamePk}/boxscore`, {}, ApiCache.TTL.LONG);
            if (bs) {
                players = [
                    ...Object.values(bs.teams?.home?.players || {}),
                    ...Object.values(bs.teams?.away?.players || {}),
                ]
                    .filter(p => p.stats?.batting?.atBats >= 2)
                    .map(p => ({
                        name: p.person?.fullName || '?',
                        h:   p.stats.batting.hits      ?? 0,
                        ab:  p.stats.batting.atBats    ?? 0,
                        hr:  p.stats.batting.homeRuns  ?? 0,
                        rbi: p.stats.batting.rbi       ?? 0,
                    }))
                    .sort((a, b) => (b.rbi - a.rbi) || (b.h - a.h) || (b.hr - a.hr));
            }
        } catch (err) {
            Logger.warn(`OnThisDay: boxscore fetch failed for ${game.gamePk}`, err?.message, 'APP');
        }

        const el = document.getElementById('homeOnThisDay');
        if (!el || !el.isConnected) return;

        const homeTeam   = game.teams?.home?.team?.abbreviation || '?';
        const awayTeam   = game.teams?.away?.team?.abbreviation || '?';
        const homeScore  = game.linescore?.teams?.home?.runs ?? game.teams?.home?.score ?? '?';
        const awayScore  = game.linescore?.teams?.away?.runs ?? game.teams?.away?.score ?? '?';
        const homeLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeTeam) : '';
        const awayLogo   = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayTeam) : '';
        const homeColors = typeof getMLBTeamColors === 'function' ? getMLBTeamColors(homeTeam) : { primary: 'var(--accent)' };

        const top = players[0] || null;
        let challengeHTML = '';

        if (top) {
            const parts = [`${top.h}-for-${top.ab}`];
            if (top.hr  > 0) parts.push(`${top.hr} HR`);
            if (top.rbi > 0) parts.push(`${top.rbi} RBI`);
            const clueLine = parts.join(' · ');

            const distractors = players.slice(1, 4);

            if (distractors.length >= 1) {
                // Multiple-choice mode: shuffle answer + distractors
                const pool = [{ ...top, correct: true }, ...distractors.map(p => ({ ...p, correct: false }))];
                for (let i = pool.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [pool[i], pool[j]] = [pool[j], pool[i]];
                }
                window._otdChoices = pool;
                const choiceBtns = pool.map((c, i) =>
                    `<button class="otd-choice" onclick="_otdReveal(${i})">${_escHtml(c.name)}</button>`
                ).join('');
                challengeHTML = `
                    <div class="otd-challenge">
                        <p class="otd-prompt">Who had this game?</p>
                        <p class="otd-clue">${clueLine}</p>
                        <div class="otd-choices" id="otdChoices">${choiceBtns}</div>
                        <p class="otd-result" id="otdResult" hidden></p>
                    </div>`;
            } else {
                // Fallback: single reveal button
                window._otdChoices = [{ ...top, correct: true }];
                challengeHTML = `
                    <div class="otd-challenge">
                        <p class="otd-prompt">Star of the game</p>
                        <p class="otd-clue">${clueLine}</p>
                        <div class="otd-choices" id="otdChoices">
                            <button class="otd-choice otd-choice--reveal" onclick="_otdReveal(0)">Reveal player</button>
                        </div>
                        <p class="otd-result" id="otdResult" hidden></p>
                    </div>`;
            }
        }

        el.innerHTML = `
            <div class="home-section-hdr">
                <span class="home-section-title">On This Day</span>
                <span class="home-section-date">${month}, ${year}</span>
            </div>
            <div class="otd-card" style="border-left: 3px solid ${homeColors.primary}">
                <div class="otd-matchup">
                    ${awayLogo ? `<img class="otd-logo" src="${awayLogo}" alt="${_escHtml(awayTeam)}" data-hide-on-error>` : ''}
                    <span class="otd-team">${_escHtml(awayTeam)}</span>
                    <span class="otd-score">${awayScore}</span>
                    <span class="otd-sep">–</span>
                    <span class="otd-score">${homeScore}</span>
                    <span class="otd-team">${_escHtml(homeTeam)}</span>
                    ${homeLogo ? `<img class="otd-logo" src="${homeLogo}" alt="${_escHtml(homeTeam)}" data-hide-on-error>` : ''}
                </div>
                ${challengeHTML}
            </div>
            <button class="otd-arcade-link" onclick="navigateTo('arcade')">
                Play more games in Arcade
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 6.5h9M8 3 11 6.5 8 10"/></svg>
            </button>
        `;
        el.style.display = '';
        return;
    }
    Logger.debug('OnThisDay: no finished games found in last 3 years for this date', undefined, 'APP');
}

window._otdReveal = function(idx) {
    const choices   = window._otdChoices;
    if (!choices) return;
    const chosen    = choices[idx];
    const choicesEl = document.getElementById('otdChoices');
    const resultEl  = document.getElementById('otdResult');
    if (!choicesEl || !resultEl) return;

    const correct = choices.find(c => c.correct);

    if (choices.length === 1) {
        // Reveal-only mode: replace button with name
        choicesEl.innerHTML = `<span class="otd-revealed">${_escHtml(correct?.name || '?')}</span>`;
        return;
    }

    choicesEl.querySelectorAll('.otd-choice').forEach((btn, i) => {
        btn.disabled = true;
        if (choices[i].correct)   btn.classList.add('otd-choice--correct');
        else if (i === idx)       btn.classList.add('otd-choice--wrong');
        else                      btn.classList.add('otd-choice--dim');
    });

    resultEl.innerHTML = chosen.correct
        ? `<span class="otd-result--right">&#10003; Correct!</span>`
        : `<span class="otd-result--wrong">&#10007; It was <strong>${_escHtml(correct?.name || '?')}</strong></span>`;
    resultEl.hidden = false;
};

// Enter a sport from the home page — handles same-sport case
function enterSport(sport) {
    const defaultViews = { nba: 'players', mlb: 'mlb-players', nfl: 'nfl-players', nhl: 'nhl-players' };
    if (AppState.currentSport === sport) {
        navigateTo(defaultViews[sport] || 'players');
    } else {
        switchSport(sport);
    }
}

if (typeof window !== 'undefined') {
    window.loadHome   = loadHome;
    window.enterSport = enterSport;
}

// ── Theme & Settings Panel ────────────────────────────────────

const _CC_TEAM_LOGOS = {
    // MLB CC 2026 — standard team logos (no official CC-specific CDN paths exist)
    'cc-braves':       'https://www.mlbstatic.com/team-logos/144.svg',
    'cc-orioles':      'https://www.mlbstatic.com/team-logos/110.svg',
    'cc-reds':         'https://www.mlbstatic.com/team-logos/113.svg',
    'cc-royals':       'assets/themes/royals-cc-forever.jpg',
    'cc-brewers':      'https://www.mlbstatic.com/team-logos/158.svg',
    'cc-pirates':      'https://www.mlbstatic.com/team-logos/134.svg',
    'cc-padres':       'https://www.mlbstatic.com/team-logos/135.svg',
    'cc-rangers':      'https://www.mlbstatic.com/team-logos/140.svg',
    // Tribute & independent — actual uploaded logos
    'cc-bananas':      'assets/themes/SavannahBananas.png',
    'retro-expos':     'assets/themes/exposlogo.webp',
    'nl-monarchs':     'assets/themes/images.png',
    'aa-trash-pandas': 'assets/themes/trash-pandas-logo.png',
};

const _CC_THEME_ALTS = {
    'cc-braves':       'Atlanta Braves City Connect',
    'cc-orioles':      'Baltimore Orioles City Connect',
    'cc-reds':         'Cincinnati Reds City Connect',
    'cc-royals':       'Kansas City Royals City Connect',
    'cc-brewers':      'Milwaukee Brewers City Connect',
    'cc-pirates':      'Pittsburgh Pirates City Connect',
    'cc-padres':       'San Diego Padres City Connect',
    'cc-rangers':      'Texas Rangers City Connect',
    'cc-bananas':      'Savannah Bananas',
    'retro-expos':     'Montreal Expos Retro',
    'nl-monarchs':     'Kansas City Monarchs — Negro Leagues',
    'aa-trash-pandas': 'Rocket City Trash Pandas',
};

function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zs_theme', theme); } catch (_) {}
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.setAttribute('aria-pressed', String(btn.dataset.themeSet === theme));
    });
    const logoEl = document.querySelector('.brand-logo-img');
    if (logoEl) {
        const ccLogo = _CC_TEAM_LOGOS[theme];
        if (ccLogo) {
            logoEl.onerror = () => { logoEl.src = 'assets/icon-64.png'; logoEl.onerror = null; };
        } else {
            logoEl.onerror = null;
        }
        logoEl.src = ccLogo || 'assets/icon-64.png';
        logoEl.alt = _CC_THEME_ALTS[theme] || 'SportStrata';
    }
}

function openSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.hidden = false;
    _applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');
    requestAnimationFrame(() => panel.classList.add('settings-panel--open'));
    document.addEventListener('keydown', _settingsPanelKeyHandler);
}

function _closeSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    if (!panel) return;
    panel.classList.remove('settings-panel--open');
    panel.addEventListener('transitionend', () => { panel.hidden = true; }, { once: true });
    document.removeEventListener('keydown', _settingsPanelKeyHandler);
}

function _settingsPanelKeyHandler(e) {
    if (e.key === 'Escape') _closeSettingsPanel();
}

(function _initSettingsPanel() {
    document.getElementById('settingsPanelClose')?.addEventListener('click', _closeSettingsPanel);
    document.getElementById('settingsPanelBackdrop')?.addEventListener('click', _closeSettingsPanel);
    document.querySelectorAll('.theme-swatch').forEach(btn => {
        btn.addEventListener('click', () => _applyTheme(btn.dataset.themeSet));
    });
})();

// Sync swatch active state on load (theme was set by the inline <head> script)
_applyTheme(document.documentElement.getAttribute('data-theme') || 'dark');

if (typeof window !== 'undefined') {
    window.openSettingsPanel = openSettingsPanel;
}

// ── PWA Install Prompt ────────────────────────────────────────
// Captures the beforeinstallprompt event so we can trigger it on demand.
// After a short delay on the second+ visit, surfaces a non-intrusive toast.
(function setupInstallPrompt() {
    let _deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        _deferredPrompt = e;

        const visits = parseInt(localStorage.getItem('zs_visits') || '0', 10) + 1;
        localStorage.setItem('zs_visits', String(visits));

        if (visits < 2) return; // only prompt from 2nd visit onward
        if (localStorage.getItem('zs_install_dismissed')) return;

        setTimeout(() => {
            if (!_deferredPrompt) return;
            const toast = document.createElement('div');
            toast.className = 'install-toast';
            toast.setAttribute('role', 'dialog');
            toast.setAttribute('aria-label', 'Install SportStrata');
            toast.innerHTML = `
                <span class="install-toast-msg">Add SportStrata to your home screen</span>
                <button class="install-toast-btn" id="installAcceptBtn">Install</button>
                <button class="install-toast-dismiss" aria-label="Dismiss">✕</button>
            `;
            document.body.appendChild(toast);
            requestAnimationFrame(() => toast.classList.add('install-toast--visible'));

            document.getElementById('installAcceptBtn')?.addEventListener('click', () => {
                _deferredPrompt.prompt();
                _deferredPrompt.userChoice.then(() => { _deferredPrompt = null; toast.remove(); });
            });
            toast.querySelector('.install-toast-dismiss')?.addEventListener('click', () => {
                localStorage.setItem('zs_install_dismissed', '1');
                toast.classList.remove('install-toast--visible');
                setTimeout(() => toast.remove(), 300);
            });
        }, 4000);
    });

    window.addEventListener('appinstalled', () => {
        _deferredPrompt = null;
        document.querySelector('.install-toast')?.remove();
        Logger.info('PWA installed', undefined, 'APP');
    });
})();


// ── F5 Phase 1: Add-to-Home-Screen prompt (2nd distinct-day visit) ──
// G4: visit tracking is localStorage-only, nothing leaves the browser.
// iOS Safari never fires beforeinstallprompt — strip simply never shows there.
(function setupInstallPrompt() {
    const DONE_KEY = 'zs_a2hs_done';
    const DAYS_KEY = 'zs_visit_days';
    let deferred = null;

    try {
        if (localStorage.getItem(DONE_KEY)) return;
        if (window.matchMedia('(display-mode: standalone)').matches) return;
        const today = new Date().toDateString();
        const days = JSON.parse(localStorage.getItem(DAYS_KEY) || '[]');
        if (!days.includes(today)) {
            days.push(today);
            localStorage.setItem(DAYS_KEY, JSON.stringify(days.slice(-5)));
        }
        if (days.length < 2) return;
    } catch (_) { return; }

    window.addEventListener('appinstalled', () => {
        try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
        document.querySelector('.a2hs-strip')?.remove();
    });

    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault();
        deferred = e;
        if (document.querySelector('.a2hs-strip')) return;
        const strip = document.createElement('div');
        strip.className = 'a2hs-strip';
        strip.setAttribute('role', 'region');
        strip.setAttribute('aria-label', 'Install SportStrata');
        strip.innerHTML = `
            <img class="a2hs-icon" src="assets/icon-64.png" alt="">
            <span class="a2hs-text">Install SportStrata for one-tap access</span>
            <button class="btn-primary a2hs-install">Install</button>
            <button class="a2hs-dismiss" aria-label="Dismiss install prompt">\u00d7</button>`;
        const done = () => {
            strip.remove();
            try { localStorage.setItem(DONE_KEY, '1'); } catch (_) {}
        };
        strip.querySelector('.a2hs-install').addEventListener('click', async () => {
            done();
            if (deferred) { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; }
        });
        strip.querySelector('.a2hs-dismiss').addEventListener('click', done);
        document.body.appendChild(strip);
        Logger.info('A2HS prompt shown', undefined, 'APP');
    });
})();
