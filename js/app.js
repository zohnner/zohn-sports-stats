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
            if (typeof showMLBGameDetail === 'function') showMLBGameDetail(gamePk);
        } else if (sport === 'nfl') {
            if (AppState.currentSport !== 'nfl') switchSport('nfl');
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

    grid.innerHTML = `
        <!-- Today's Games — dominant first module -->
        <div class="home-today" id="homeTodayGames">
            <div class="home-section-hdr">
                <span class="home-section-title">Today's Games</span>
                <span class="home-section-date">${dateStr}</span>
            </div>
            <div class="home-today-grid" id="homeTodayGrid">${skelCards}</div>
        </div>

        <div class="home-recents" id="homeRecents"></div>
        <div class="home-starred" id="homeStarred"></div>
        <div class="home-on-this-day" id="homeOnThisDay" style="display:none"></div>

        <!-- Feature strip — each card navigates to its tool -->
        <div class="home-features">
            <button class="home-feature-item" onclick="navigateTo('mlb-leaders')">
                <div class="home-feature-icon">📊</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Leaderboards</div>
                    <div class="home-feature-desc">Daily rankings — AVG, OPS, ISO, HR, ERA, WHIP, FIP, K-BB% and more</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-prep')">
                <div class="home-feature-icon">📋</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Game Prep</div>
                    <div class="home-feature-desc">Pitcher matchups, lineup context, and team form — ready for air</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-players')">
                <div class="home-feature-icon">🔬</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Statcast & Splits</div>
                    <div class="home-feature-desc">Exit velocity, barrel %, vs. L/R, home/away splits per player</div>
                </div>
            </button>
            <button class="home-feature-item" onclick="navigateTo('mlb-builder')">
                <div class="home-feature-icon">🧮</div>
                <div class="home-feature-text">
                    <div class="home-feature-title">Stat Builder</div>
                    <div class="home-feature-desc">Custom formulas — rank any player by any metric combination</div>
                </div>
            </button>
        </div>
    `;

    _renderHomeRecents();
    _renderHomeStarred();
    _loadOnThisDay();
    _loadHomeTodayGames();
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
                <span class="home-recent-badge home-recent-badge--mlb">${r.badge || '⚾'}</span>
                <span class="home-recent-name">${r.name}</span>
                <span class="home-recent-sub">${r.sub || ''}</span>
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
        const homeLogo  = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeAbbr) : '';
        const awayLogo  = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayAbbr) : '';
        const homeName  = _teamFullName(homeAbbr);
        const awayName  = _teamFullName(awayAbbr);
        const fmt       = (n) => hasScore ? n : '–';
        const liveCls   = isLive ? ' home-game-card--live' : '';
        const lastName  = n => n ? n.split(' ').slice(-1)[0] : '?';
        const ppLine    = !isFinal && (awayPP || homePP)
            ? `<div class="hgc-pitchers">${lastName(awayPP)} vs ${lastName(homePP)}</div>`
            : '';
        return `
            <div class="home-game-card${liveCls}" data-game-key="${gameKey}" data-game-status="${pillCls}" role="button" tabindex="0"
                 aria-label="${awayName} ${fmt(awayScore)} at ${homeName} ${fmt(homeScore)}, ${pillLabel}">
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
                if (typeof showMLBGameDetail === 'function') showMLBGameDetail(id);
            };
            card.addEventListener('click', open);
            card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
        });

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
    const container = document.getElementById('homeOnThisDay');
    if (!container) return;

    const today  = new Date();
    const mm     = String(today.getMonth() + 1).padStart(2, '0');
    const dd     = String(today.getDate()).padStart(2, '0');
    const curYear = today.getFullYear();

    // Try up to 3 past years, newest first
    for (let offset = 1; offset <= 3; offset++) {
        const year = curYear - offset;
        const dateStr = `${year}-${mm}-${dd}`;

        let sched;
        try {
            sched = await mlbFetch('/schedule', {
                sportId: 1, startDate: dateStr, endDate: dateStr, hydrate: 'linescore',
            }, ApiCache.TTL.LONG);
        } catch (_) { continue; }

        const games = sched?.dates?.[0]?.games || [];
        // Only care about final games
        const finished = games.filter(g => g.status?.abstractGameState === 'Final');
        if (finished.length === 0) continue;

        // Pick the game with the most runs (most exciting)
        const game = finished.reduce((best, g) => {
            const runs = (g.linescore?.teams?.home?.runs ?? 0) + (g.linescore?.teams?.away?.runs ?? 0);
            const bRuns = (best.linescore?.teams?.home?.runs ?? 0) + (best.linescore?.teams?.away?.runs ?? 0);
            return runs > bRuns ? g : best;
        });

        // Fetch box score to find top performer
        let top = null;
        try {
            const bs = await mlbFetch(`/game/${game.gamePk}/boxscore`, {}, ApiCache.TTL.LONG);
            if (bs) {
                const allBatters = [
                    ...Object.values(bs.teams?.home?.players || {}),
                    ...Object.values(bs.teams?.away?.players || {}),
                ].filter(p => p.stats?.batting);

                // Top by RBI first, then hits
                const sorted = allBatters
                    .map(p => ({
                        name: p.person?.fullName || '?',
                        h:    p.stats.batting.hits         ?? 0,
                        ab:   p.stats.batting.atBats       ?? 0,
                        hr:   p.stats.batting.homeRuns     ?? 0,
                        rbi:  p.stats.batting.rbi          ?? 0,
                        k:    p.stats.batting.strikeOuts   ?? 0,
                    }))
                    .filter(p => p.ab >= 2)
                    .sort((a, b) => (b.rbi - a.rbi) || (b.h - a.h) || (b.hr - a.hr));

                top = sorted[0] || null;
            }
        } catch (_) {}

        const homeTeam  = game.teams?.home?.team?.abbreviation || '?';
        const awayTeam  = game.teams?.away?.team?.abbreviation || '?';
        const homeScore = game.linescore?.teams?.home?.runs ?? game.teams?.home?.score ?? '?';
        const awayScore = game.linescore?.teams?.away?.runs ?? game.teams?.away?.score ?? '?';
        const homeLogo  = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(homeTeam) : '';
        const awayLogo  = typeof getMLBTeamLogoByAbbr === 'function' ? getMLBTeamLogoByAbbr(awayTeam) : '';
        const month     = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

        let perfLine = '';
        if (top) {
            const parts = [`${top.h}/${top.ab}`];
            if (top.hr  > 0) parts.push(`${top.hr} HR`);
            if (top.rbi > 0) parts.push(`${top.rbi} RBI`);
            perfLine = `<div class="otd-perf"><strong>${_escHtml(top.name)}</strong> · ${parts.join(' · ')}</div>`;
        }

        container.innerHTML = `
            <div class="home-section-hdr">
                <span class="home-section-title">On This Day</span>
                <span class="home-section-date">${month}, ${year}</span>
            </div>
            <div class="otd-card">
                <div class="otd-matchup">
                    ${awayLogo ? `<img class="otd-logo" src="${awayLogo}" alt="${awayTeam}" data-hide-on-error>` : ''}
                    <span class="otd-team">${awayTeam}</span>
                    <span class="otd-score">${awayScore}</span>
                    <span class="otd-sep">–</span>
                    <span class="otd-score">${homeScore}</span>
                    <span class="otd-team">${homeTeam}</span>
                    ${homeLogo ? `<img class="otd-logo" src="${homeLogo}" alt="${homeTeam}" data-hide-on-error>` : ''}
                </div>
                ${perfLine}
            </div>
        `;
        container.style.display = '';
        return; // found one — stop
    }
}

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

// ── Light / Dark Mode ─────────────────────────────────────────

const _ICON_SUN  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const _ICON_MOON = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('zs_theme', theme); } catch (_) {}
    const icon       = document.getElementById('themeToggleIcon');
    const label      = document.getElementById('themeToggleLabel');
    const headerIcon = document.getElementById('themeToggleHeaderIcon');
    const isLight    = theme === 'light';
    if (icon)       icon.textContent  = isLight ? '🌙' : '☀️';
    if (headerIcon) headerIcon.innerHTML = isLight ? _ICON_MOON : _ICON_SUN;
    if (label)      label.textContent = isLight ? 'Dark mode' : 'Light mode';
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
