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
    } catch (error) {
        ErrorHandler.handle(grid, error, loadGames, { tag: 'GAMES', title: 'Failed to Load Games' });
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
    card.dataset.gameId = game.id;

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
    const isLive    = /Q[1-4]|[Hh]alf|:\d|OT\d?/.test(status);
    const statusCls = isFinal ? 'game-status--final' : isLive ? 'game-status--live' : 'game-status--sched';

    // Date
    let dateStr = '';
    if (game.date) {
        try {
            dateStr = new Date(game.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        } catch (_) { dateStr = game.date; }
    }

    // Expected BDL fields: home_q1/q2/q3/q4, visitor_q1/q2/q3/q4, home_ot, visitor_ot
    const hasQuarters = hasScore && (game.home_q1 != null || game.visitor_q1 != null);
    const hasOT       = game.home_ot != null || game.visitor_ot != null;
    if (isFinal && hasScore && !hasQuarters) {
        Logger.debug(`Game ${game.id}: final score present but no quarter fields — BDL shape may have changed`, undefined, 'GAMES');
    }
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

    const homeTeamId = game.home_team?.id;
    const awayTeamId = game.visitor_team?.id;

    card.innerHTML = `
        <div class="game-card-header">
            <span class="game-date">${dateStr}</span>
            <div style="display:flex;align-items:center;gap:0.5rem">
                ${marginStr}
                <span class="game-status ${statusCls}">${isLive ? '<span class="live-dot"></span>' : ''}${status}</span>
            </div>
        </div>
        <div class="game-matchup">
            <div class="game-team ${homeWon ? 'game-team--winner' : ''}" data-team-id="${homeTeamId}" style="cursor:pointer">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${homeColors.primary}cc,${homeColors.primary}55)">
                    <img class="game-logo-img" src="https://a.espncdn.com/i/teamlogos/nba/500/${homeAbbr.toLowerCase()}.png" loading="lazy" data-hide-on-error data-hides-sibling-text>
                    <span class="game-logo-text">${homeInitials}</span>
                </div>
                <div class="game-team-abbr">${homeAbbr}</div>
                <div class="game-team-name">${game.home_team?.full_name || ''}</div>
            </div>
            <div class="game-scores" style="cursor:pointer" data-score-click>
                <span class="game-score ${homeWon ? 'game-score--win' : hasScore && !homeWon ? 'game-score--loss' : ''}">${hasScore ? homeScore : '—'}</span>
                <span class="game-scores-sep">:</span>
                <span class="game-score ${awayWon ? 'game-score--win' : hasScore && !awayWon ? 'game-score--loss' : ''}">${hasScore ? awayScore : '—'}</span>
            </div>
            <div class="game-team game-team--away ${awayWon ? 'game-team--winner' : ''}" data-team-id="${awayTeamId}" style="cursor:pointer">
                <div class="game-team-logo" style="background:linear-gradient(135deg,${awayColors.primary}cc,${awayColors.primary}55)">
                    <img class="game-logo-img" src="https://a.espncdn.com/i/teamlogos/nba/500/${awayAbbr.toLowerCase()}.png" loading="lazy" data-hide-on-error data-hides-sibling-text>
                    <span class="game-logo-text">${awayInitials}</span>
                </div>
                <div class="game-team-abbr">${awayAbbr}</div>
                <div class="game-team-name">${game.visitor_team?.full_name || ''}</div>
            </div>
        </div>
        ${quartersHtml}
    `;

    // Hide fallback initials text when logo loads successfully
    card.querySelectorAll('img[data-hides-sibling-text]').forEach(img => {
        img.addEventListener('load', () => {
            img.parentElement.querySelector('.game-logo-text')?.style.setProperty('display', 'none');
        }, { once: true });
    });

    // Team sections → team detail; score area → box score
    card.querySelectorAll('.game-team[data-team-id]').forEach(el => {
        el.addEventListener('click', e => {
            e.stopPropagation();
            const tid = parseInt(el.dataset.teamId, 10);
            if (tid) showTeamDetail(tid);
        });
    });
    if (hasScore && homeTeamId) {
        card.querySelector('[data-score-click]')?.addEventListener('click', e => {
            e.stopPropagation();
            showTeamGameDetail(game.id, homeTeamId);
        });
        card.querySelector('.game-card-header')?.addEventListener('click', () => {
            showTeamGameDetail(game.id, homeTeamId);
        });
        card.querySelector(`${quartersHtml ? '.game-quarters' : '.game-matchup'}`)?.addEventListener('click', e => {
            if (!e.target.closest('[data-team-id]') && !e.target.closest('[data-score-click]')) {
                showTeamGameDetail(game.id, homeTeamId);
            }
        });
    }

    return card;
}

function _teamAbbrInitials(abbr) {
    if (!abbr) return '?';
    return abbr.length <= 3 ? abbr : abbr.slice(0, 2);
}

function updateTicker(games) {
    if (AppState.currentSport !== 'nba') return;
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
        const homeLogo = getNBATeamLogoUrl(homeAbbr);
        const awayLogo = getNBATeamLogoUrl(awayAbbr);
        const homeWon  = hs > vs;
        const awayWon  = vs > hs;
        return `
            <div class="ticker__item" data-game-id="${g.id}" data-sport="nba" style="cursor:pointer">
                <img class="ticker-logo" src="${homeLogo}" alt="" loading="lazy" data-hide-on-error>
                <span class="ticker-team">${homeAbbr}</span>
                <span class="ticker-score ${homeWon && isFinal ? 'ticker-score--win' : ''}">${hs}</span>
                <span class="ticker-divider">–</span>
                <span class="ticker-score ${awayWon && isFinal ? 'ticker-score--win' : ''}">${vs}</span>
                <span class="ticker-team">${awayAbbr}</span>
                <img class="ticker-logo" src="${awayLogo}" alt="" loading="lazy" data-hide-on-error>
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
