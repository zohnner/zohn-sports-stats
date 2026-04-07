// ============================================================
// Games — recent results grid + score ticker
// ============================================================

async function loadGames() {
    const grid = document.getElementById('playersGrid');

    if (window.setBreadcrumb) setBreadcrumb('games', null);

    grid.className = 'games-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card" style="min-height:160px">
            <div class="skeleton-line" style="width:60%;height:14px;margin-bottom:1.25rem"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
                <div class="skeleton-line" style="width:12%;height:20px"></div>
                <div class="skeleton-line" style="width:30%;height:40px;border-radius:8px"></div>
            </div>
            <div class="skeleton-line" style="width:40%;height:28px;border-radius:20px"></div>
        </div>
    `).join('');

    try {
        Logger.info('Fetching games…', undefined, 'GAMES');
        const games = await fetchGamesAPI();
        AppState.allGames = games;
        Logger.info(`Loaded ${games.length} games`, undefined, 'GAMES');
        displayGames(games);
        updateTicker(games);
    } catch (error) {
        Logger.error('Failed to load games', error, 'GAMES');
        ErrorHandler.renderErrorState(grid, error, loadGames);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load Games' });
    }
}

function displayGames(games) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'games-grid';

    if (!games || games.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No recent games found', '📅');
        return;
    }

    const fragment = document.createDocumentFragment();
    games.forEach(game => fragment.appendChild(createGameCard(game)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function createGameCard(game) {
    const card = document.createElement('div');
    card.className = 'game-card';

    const homeScore = game.home_team_score    ?? 0;
    const awayScore = game.visitor_team_score ?? 0;
    const hasScore  = homeScore > 0 || awayScore > 0;

    const homeWon = hasScore && homeScore > awayScore;
    const awayWon = hasScore && awayScore > homeScore;

    const homeColors = getTeamColors(game.home_team?.abbreviation);
    const awayColors = getTeamColors(game.visitor_team?.abbreviation);

    const homeInitials = _teamAbbrInitials(game.home_team?.abbreviation);
    const awayInitials = _teamAbbrInitials(game.visitor_team?.abbreviation);

    // Status
    const status    = game.status || 'Scheduled';
    const isFinal   = status.includes('Final');
    const isLive    = status.includes('Q') || status.includes('Half') || status.includes(':');
    const statusCls = isFinal ? 'game-status--final' : isLive ? 'game-status--live' : 'game-status--sched';

    // Date
    let dateStr = '';
    if (game.date) {
        try {
            dateStr = new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch (_) { dateStr = game.date; }
    }

    const hasQuarters = hasScore && (game.home_q1 != null || game.visitor_q1 != null);
    const hasOT       = game.home_ot != null || game.visitor_ot != null;
    const homeAbbr    = game.home_team?.abbreviation || '—';
    const awayAbbr    = game.visitor_team?.abbreviation || '—';

    const quartersHtml = hasQuarters ? `
        <div class="game-quarters">
            <div class="quarter-row quarter-row--header">
                <span class="quarter-team"></span>
                <span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span>
                ${hasOT ? '<span>OT</span>' : ''}
                <span class="quarter-total">T</span>
            </div>
            <div class="quarter-row">
                <span class="quarter-team">${homeAbbr}</span>
                <span>${game.home_q1 ?? '—'}</span>
                <span>${game.home_q2 ?? '—'}</span>
                <span>${game.home_q3 ?? '—'}</span>
                <span>${game.home_q4 ?? '—'}</span>
                ${hasOT ? `<span>${game.home_ot ?? '—'}</span>` : ''}
                <span class="quarter-total ${homeWon ? 'quarter-win' : ''}">${homeScore}</span>
            </div>
            <div class="quarter-row">
                <span class="quarter-team">${awayAbbr}</span>
                <span>${game.visitor_q1 ?? '—'}</span>
                <span>${game.visitor_q2 ?? '—'}</span>
                <span>${game.visitor_q3 ?? '—'}</span>
                <span>${game.visitor_q4 ?? '—'}</span>
                ${hasOT ? `<span>${game.visitor_ot ?? '—'}</span>` : ''}
                <span class="quarter-total ${awayWon ? 'quarter-win' : ''}">${awayScore}</span>
            </div>
        </div>
    ` : '';

    const margin    = isFinal && hasScore ? Math.abs(homeScore - awayScore) : null;
    const marginStr = margin != null ? `<span class="game-margin">by ${margin}</span>` : '';

    card.innerHTML = `
        <div class="game-card-header">
            <span class="game-date">${dateStr}</span>
            <div style="display:flex;align-items:center;gap:0.5rem">
                ${marginStr}
                <span class="game-status ${statusCls}">${isLive ? '<span class="live-dot"></span>' : ''}${status}</span>
            </div>
        </div>
        <div class="game-matchup">
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}55)">
                    <img class="game-logo-img" src="https://a.espncdn.com/i/teamlogos/nba/500/${homeAbbr.toLowerCase()}.png" loading="lazy" onerror="this.style.display='none'" onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">
                    <span class="game-logo-text">${homeInitials}</span>
                </div>
                <div class="game-team-abbr">${homeAbbr}</div>
                <div class="game-team-name">${game.home_team?.full_name || ''}</div>
            </div>
            <div class="game-scores">
                <span class="game-score ${homeWon ? 'game-score--win' : hasScore && !homeWon ? 'game-score--loss' : ''}">${hasScore ? homeScore : '—'}</span>
                <span class="game-scores-sep">:</span>
                <span class="game-score ${awayWon ? 'game-score--win' : hasScore && !awayWon ? 'game-score--loss' : ''}">${hasScore ? awayScore : '—'}</span>
            </div>
            <div class="game-team game-team--away ${awayWon ? 'game-team--winner' : ''}">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}55)">
                    <img class="game-logo-img" src="https://a.espncdn.com/i/teamlogos/nba/500/${awayAbbr.toLowerCase()}.png" loading="lazy" onerror="this.style.display='none'" onload="var t=this.parentElement.querySelector('.game-logo-text');if(t)t.style.display='none'">
                    <span class="game-logo-text">${awayInitials}</span>
                </div>
                <div class="game-team-abbr">${awayAbbr}</div>
                <div class="game-team-name">${game.visitor_team?.full_name || ''}</div>
            </div>
        </div>
        ${quartersHtml}
    `;

    return card;
}

function _teamAbbrInitials(abbr) {
    if (!abbr) return '?';
    return abbr.length <= 3 ? abbr : abbr.slice(0, 2);
}

function updateTicker(games) {
    const ticker = document.getElementById('scoreTicker');
    if (!ticker) {
        Logger.warn('Ticker container not found', undefined, 'GAMES');
        return;
    }

    const scored  = games.filter(g =>
        (g.home_team_score != null && g.home_team_score > 0) ||
        (g.visitor_team_score != null && g.visitor_team_score > 0)
    );
    const _isLiveStatus = st => /Q[1-4]|[Hh]alf|:\d|OT\d?/.test(st) || st.includes(':');
    const liveCount = scored.filter(g => _isLiveStatus(g.status || '')).length;

    // Update the "SCORES" title pill to show live game count when games are in progress
    const titleEl = document.querySelector('.ticker-title');
    if (titleEl) {
        titleEl.innerHTML = liveCount > 0
            ? `SCORES <span class="ticker-live-badge">${liveCount} LIVE</span>`
            : 'SCORES';
    }

    if (scored.length === 0) {
        ticker.innerHTML = `<div class="ticker__item">No recent scores — check back during game time</div>`;
        return;
    }

    const items = [...scored, ...scored].map(g => {
        const hs       = g.home_team_score    ?? 0;
        const vs       = g.visitor_team_score ?? 0;
        const st       = g.status || 'Final';
        const isLive   = _isLiveStatus(st);
        const isFinal  = /final|^f$/i.test(st);
        const isPostponed = /ppd|postponed/i.test(st);
        const pillCls  = isFinal ? 'final' : isLive ? 'live' : isPostponed ? 'other' : 'sched';
        const pillLbl  = isFinal ? 'F' : isPostponed ? 'PPD' : isLive ? st : 'SCH';
        const homeAbbr = g.home_team?.abbreviation || '?';
        const awayAbbr = g.visitor_team?.abbreviation || '?';
        const homeLogo = `https://a.espncdn.com/i/teamlogos/nba/500/${homeAbbr.toLowerCase()}.png`;
        const awayLogo = `https://a.espncdn.com/i/teamlogos/nba/500/${awayAbbr.toLowerCase()}.png`;
        const homeWon  = hs > vs;
        const awayWon  = vs > hs;
        return `
            <div class="ticker__item">
                <img class="ticker-logo" src="${homeLogo}" alt="" loading="lazy" onerror="this.style.display='none'">
                <span class="ticker-team">${homeAbbr}</span>
                <span class="ticker-score ${homeWon && isFinal ? 'ticker-score--win' : ''}">${hs}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${awayWon && isFinal ? 'ticker-score--win' : ''}">${vs}</span>
                <span class="ticker-team">${awayAbbr}</span>
                <img class="ticker-logo" src="${awayLogo}" alt="" loading="lazy" onerror="this.style.display='none'">
                <span class="ticker-status-pill ticker-status-pill--${pillCls}">${pillLbl}</span>
            </div>
        `;
    }).join('');

    ticker.innerHTML = items;

    // Set scroll duration proportional to content width so longer strips (many games)
    // move at the same comfortable reading pace (~60 px/s) regardless of game count.
    // Double-rAF ensures the browser has laid out the new DOM before we measure.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        const w = ticker.scrollWidth;
        if (w > 0) {
            // Content is doubled for seamless loop → actual scroll distance = w/2
            ticker.style.animationDuration = Math.max(15, Math.round(w / 2 / 60)) + 's';
        }
    }));
}

if (typeof window !== 'undefined') {
    window.loadGames    = loadGames;
    window.displayGames = displayGames;
    window.updateTicker = updateTicker;
}
