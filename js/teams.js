// ============================================================
// Teams — grid view + team detail with roster
// ============================================================

async function loadTeams() {
    const grid = document.getElementById('playersGrid');

    if (window.setBreadcrumb) setBreadcrumb('teams', null);
    grid.className = 'players-grid';

    // Skeleton while fetching
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-avatar"></div>
            <div class="skeleton-line" style="width:70%;margin:0 auto 0.5rem"></div>
            <div class="skeleton-line" style="width:40%;margin:0 auto 1rem"></div>
            <div class="skeleton-line" style="width:90%"></div>
            <div class="skeleton-line" style="width:80%;margin-top:0.5rem"></div>
        </div>
    `).join('');

    try {
        if (!AppState.allTeams.length) {
            AppState.allTeams = await fetchTeamsAPI();
        }
        Logger.info(`Teams loaded: ${AppState.allTeams.length}`, undefined, 'TEAMS');
        displayTeams(AppState.allTeams);
    } catch (error) {
        Logger.error('Failed to load teams', error, 'TEAMS');
        ErrorHandler.renderErrorState(grid, error, loadTeams);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load Teams' });
    }
}

function displayTeams(teams) {
    const grid = document.getElementById('playersGrid');
    grid.className = 'players-grid';

    if (!teams || teams.length === 0) {
        ErrorHandler.renderEmptyState(grid, 'No teams found', '🏟');
        return;
    }

    const fragment = document.createDocumentFragment();
    teams.forEach(team => fragment.appendChild(_createTeamCard(team)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}


function _createTeamCard(team) {
    const colors   = getTeamColors(team.abbreviation);
    const confCls  = team.conference === 'East' ? 'conference-east' : 'conference-west';
    const initials = _teamInitials(team);
    const logoUrl  = getNBATeamLogoUrl(team.abbreviation);

    const card = document.createElement('div');
    card.className = `player-card team-card ${confCls}`;
    card.style.cursor = 'pointer';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View ${team.full_name}`);
    card.addEventListener('click', () => showTeamDetail(team.id));

    // Pull live W-L + conf rank from standings if already loaded
    const standing  = AppState.nbaStandings?.find(s => s.teamAbbr === team.abbreviation);
    const record    = standing ? `${standing.wins}–${standing.losses}` : null;
    const confRank  = standing ? `#${standing.rank} ${team.conference}` : null;
    const streak    = standing?.streak || null;
    const streakClr = streak?.startsWith('W') ? '#10b981' : '#f87171';

    card.innerHTML = `
        <div class="player-card-top">
            <div class="player-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);color:#fff;font-weight:800;font-size:1.4rem;letter-spacing:0.02em">
                ${logoUrl ? `<img class="player-headshot" src="${logoUrl}" alt="" loading="lazy" style="object-fit:contain;object-position:center;padding:4px" data-hide-on-error onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.display='none'">` : ''}
                <span class="avatar-text">${initials}</span>
            </div>
            <div class="player-name">${team.full_name}</div>
            <div class="player-team">${team.abbreviation}${record ? ' · ' + record : ''}</div>
        </div>
        <div class="player-details">
            <div class="detail-row">
                <span class="detail-label">Conference</span>
                <span class="detail-value" style="color:${team.conference === 'East' ? 'var(--color-east)' : 'var(--color-west)'};font-weight:700">${confRank ?? team.conference}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Division</span>
                <span class="detail-value">${team.division}</span>
            </div>
            ${record ? `
            <div class="detail-row">
                <span class="detail-label">Record</span>
                <span class="detail-value" style="font-weight:700">${record}</span>
            </div>` : `
            <div class="detail-row">
                <span class="detail-label">City</span>
                <span class="detail-value">${team.city}</span>
            </div>`}
            ${streak ? `
            <div class="detail-row">
                <span class="detail-label">Streak</span>
                <span class="detail-value" style="color:${streakClr};font-weight:700">${streak}</span>
            </div>` : ''}
        </div>
    `;

    return card;
}

// ── Team Detail ──────────────────────────────────────────────

async function showTeamDetail(teamId, push = true) {
    const team = AppState.allTeams.find(t => t.id === teamId);
    if (!team) {
        Logger.error(`Team ${teamId} not found`, undefined, 'TEAMS');
        return;
    }

    const grid = document.getElementById('playersGrid');

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('teams', team.full_name);

    if (push) {
        history.pushState({ view: 'team', id: teamId }, '', `#team-${teamId}`);
    }

    const loadColors   = getTeamColors(team.abbreviation);
    const loadInitials = _teamInitials(team);

    grid.className = 'player-detail-container';
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem;color:white;">
            <div class="player-avatar" style="background:linear-gradient(135deg,${loadColors.primary}cc,${loadColors.primary}55);width:88px;height:88px;font-size:1.75rem;font-weight:800;margin:0 auto 1.25rem">
                ${loadInitials}
            </div>
            <p style="font-size:1.1rem;color:var(--color-text-secondary)">Loading roster…</p>
            <div class="loading-spinner" style="margin-top:1.5rem"></div>
        </div>
    `;

    try {
        // Fetch roster, recent games, and stats map in parallel
        const [roster, recentGames, statsMap] = await Promise.all([
            fetchTeamRoster(teamId),
            fetchTeamGamesAPI(teamId, 12).catch(err => {
                Logger.warn('Recent games fetch failed', err.message, 'TEAMS');
                return [];
            }),
            fetchNBAStatsMap(CURRENT_SEASON),
        ]);

        // Cache recent games for use by game-detail view
        AppState._teamRecentGames[teamId] = recentGames;

        const colors = getTeamColors(team.abbreviation);

        // Enrich roster with season stats via NBA.com name-matching
        roster.forEach(p => {
            if (!AppState.playerStats[p.id]) {
                const key  = `${p.first_name} ${p.last_name}`.toLowerCase();
                const stat = statsMap[key];
                if (stat) AppState.playerStats[p.id] = { ...stat, player_id: p.id };
            }
        });

        Logger.info(`Team loaded: ${roster.length} players, ${recentGames.length} recent games`, undefined, 'TEAMS');

        grid.innerHTML = `
            ${_teamHeader(team, colors)}
            ${_recentGamesCard(recentGames, teamId)}
            ${_rosterCard(roster, colors)}
        `;

    } catch (error) {
        Logger.error('Error loading team detail', error, 'TEAMS');
        grid.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <h3 class="error-state-title">Failed to Load Team</h3>
                <p class="error-state-message">${error.message}</p>
                <button class="retry-btn" onclick="backToTeams()">← Back to Teams</button>
            </div>
        `;
    }
}

function _teamHeader(team, colors) {
    const initials  = _teamInitials(team);
    const logoUrl   = getNBATeamLogoUrl(team.abbreviation);
    const confLabel = `${team.conference}ern Conference · ${team.division} Division`;

    const standing   = AppState.nbaStandings?.find(s => s.teamAbbr === team.abbreviation);
    const record     = standing ? `${standing.wins}–${standing.losses}` : null;
    const confRank   = standing ? `#${standing.rank} in ${team.conference}` : null;
    const streak     = standing?.streak;
    const streakClr  = streak?.startsWith('W') ? '#10b981' : '#f87171';
    const l10        = standing?.l10;

    const standingBio = record ? `
        <div class="player-bio-grid" style="margin-top:0.75rem">
            <div class="player-bio-item"><span class="bio-label">Record</span><span class="bio-value" style="font-weight:800">${record}</span></div>
            ${confRank ? `<div class="player-bio-item"><span class="bio-label">Conf Rank</span><span class="bio-value">${confRank}</span></div>` : ''}
            ${streak   ? `<div class="player-bio-item"><span class="bio-label">Streak</span><span class="bio-value" style="color:${streakClr};font-weight:700">${streak}</span></div>` : ''}
            ${l10      ? `<div class="player-bio-item"><span class="bio-label">Last 10</span><span class="bio-value">${l10}</span></div>` : ''}
        </div>
    ` : '';

    return `
        <div class="player-detail-header"
             style="background:radial-gradient(ellipse at top left, ${colors.primary}1a 0%, rgba(15,23,42,0.85) 55%);
                    border-top:3px solid ${colors.primary}88">
            <button onclick="backToTeams()" class="back-button">← Back to Teams</button>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:2rem;font-weight:800;letter-spacing:0.02em;
                            box-shadow:0 0 40px ${colors.primary}44">
                    ${logoUrl ? `<img class="player-headshot" src="${logoUrl}" alt="" loading="lazy" style="object-fit:contain;object-position:center;padding:8px" data-hide-on-error onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.display='none'">` : ''}
                    <span class="avatar-text">${initials}</span>
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${team.full_name}</h1>
                        <span class="player-hero-pos">${team.abbreviation}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-secondary)">${team.city}</p>
                    <p class="player-detail-meta">${confLabel}</p>
                    ${standingBio}
                </div>
            </div>
        </div>
    `;
}

function _rosterCard(roster, colors) {
    if (!roster || roster.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Roster</h2>
                <p style="color:var(--color-text-muted);text-align:center;padding:2rem">No roster data available for this season.</p>
            </div>
        `;
    }

    // Group by position
    const positions = ['G', 'F', 'C', ''];
    const byPos = {};
    positions.forEach(pos => { byPos[pos] = []; });
    roster.forEach(p => {
        const pos = p.position || '';
        const bucket = positions.includes(pos) ? pos : '';
        byPos[bucket].push(p);
    });

    const rows = roster
        .slice()
        .sort((a, b) => {
            const posOrder = { G: 0, F: 1, C: 2 };
            const ap = posOrder[a.position] ?? 3;
            const bp = posOrder[b.position] ?? 3;
            if (ap !== bp) return ap - bp;
            return (a.last_name || '').localeCompare(b.last_name || '');
        })
        .map(p => {
            const stats      = AppState.playerStats[p.id];
            const ptsRaw     = stats ? parseFloat(stats.pts) : null;
            const pts        = ptsRaw != null ? ptsRaw.toFixed(1) : '—';
            const reb        = stats?.reb != null ? parseFloat(stats.reb).toFixed(1) : '—';
            const ast        = stats?.ast != null ? parseFloat(stats.ast).toFixed(1) : '—';
            const fgPct      = stats?.fg_pct != null ? (stats.fg_pct * 100).toFixed(1) + '%' : '—';
            const ptsClr     = ptsRaw >= 25 ? '#fbbf24' : ptsRaw >= 20 ? '#a78bfa' : ptsRaw >= 15 ? 'var(--color-pts)' : 'var(--color-text-secondary)';
            const jersey     = p.jersey_number ? `#${p.jersey_number}` : '';
            const initials   = _playerInitials(p);
            const headshotUrl = getESPNHeadshotUrl(p);

            return `
                <div class="roster-row" onclick="showPlayerDetail(${p.id})" style="cursor:pointer">
                    <div class="roster-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44);position:relative;overflow:hidden">
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top center;border-radius:50%;z-index:1" data-hide-on-error>` : ''}
                        <span style="position:relative">${initials}</span>
                    </div>
                    <div class="roster-info">
                        <span class="roster-name">${p.first_name} ${p.last_name}</span>
                        <span class="roster-meta">${p.position || 'N/A'}${jersey ? ' · ' + jersey : ''}</span>
                    </div>
                    <div class="roster-stats">
                        <span style="color:${ptsClr};font-weight:800">${pts}</span>
                        <span style="color:var(--color-reb)">${reb}</span>
                        <span style="color:var(--color-ast)">${ast}</span>
                        <span style="color:var(--color-text-muted)">${fgPct}</span>
                    </div>
                    <div class="roster-labels">
                        <span>PTS</span><span>REB</span><span>AST</span><span>FG%</span>
                    </div>
                </div>
            `;
        }).join('');

    return `
        <div class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Roster · ${roster.length} Players</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

// ── Recent Games card ────────────────────────────────────────

function _recentGamesCard(games, teamId) {
    if (!games || games.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title">Recent Games</h2>
                <p style="color:var(--text-muted);text-align:center;padding:1.5rem 0">No recent games this season.</p>
            </div>
        `;
    }

    const rows = games.map(g => {
        const isHome     = g.home_team?.id === teamId;
        const teamScore  = isHome ? (g.home_team_score ?? 0) : (g.visitor_team_score ?? 0);
        const oppScore   = isHome ? (g.visitor_team_score ?? 0) : (g.home_team_score ?? 0);
        const opp        = isHome ? g.visitor_team : g.home_team;
        const oppAbbr    = opp?.abbreviation || '???';
        const oppLogo    = getNBATeamLogoUrl(oppAbbr);
        const status     = g.status || '';
        const isFinal    = /final|^f$/i.test(status);
        const hasScores  = teamScore > 0 || oppScore > 0;
        const isWin      = isFinal && hasScores && teamScore > oppScore;
        const isLoss     = isFinal && hasScores && teamScore < oppScore;
        const outcome    = isFinal && hasScores ? (isWin ? 'W' : 'L') : (status.slice(0, 4) || '—');
        const outcomeClr = isWin ? 'var(--color-win)' : isLoss ? '#f87171' : 'var(--text-muted)';
        // Use noon UTC so we never land on the wrong day after timezone offset
        const dateStr    = g.date
            ? new Date(g.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—';
        const homeAway   = isHome ? 'vs' : '@';
        const scoreStr   = isFinal && hasScores ? `${teamScore}–${oppScore}` : '—';

        return `
            <div class="roster-row" style="cursor:pointer" onclick="showTeamGameDetail(${g.id}, ${teamId})">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">
                    <span style="font-weight:900;font-size:0.88rem;min-width:18px;color:${outcomeClr}">${outcome}</span>
                    <span style="color:var(--text-muted);font-size:0.75rem;min-width:52px">${dateStr}</span>
                    <span style="color:var(--text-subtle);font-size:0.75rem;margin-right:2px">${homeAway}</span>
                    <img src="${oppLogo}" style="width:20px;height:20px;object-fit:contain;flex-shrink:0"
                         loading="lazy" data-hide-on-error>
                    <span style="font-weight:700;font-size:0.85rem">${oppAbbr}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-weight:800;font-size:0.9rem;
                                 color:${isWin?'var(--color-win)':isLoss?'#f87171':'var(--text-primary)'}">${scoreStr}</span>
                    <span style="color:var(--text-subtle);font-size:0.8rem">›</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title">Recent Games · ${games.length}</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

// ── Game Detail (box score) ───────────────────────────────────

async function showTeamGameDetail(gameId, teamId) {
    const team = AppState.allTeams.find(t => t.id === teamId);
    if (!team) return;

    const grid = document.getElementById('playersGrid');

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('teams', `${team.full_name} · Game`);

    history.pushState({ view: 'team-game', gameId, teamId }, '', `#team-${teamId}-game-${gameId}`);

    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:white">
            <p style="color:var(--text-secondary)">Loading box score…</p>
            <div class="loading-spinner" style="margin-top:1.5rem"></div>
        </div>
    `;

    try {
        const playerStats = await fetchGameBoxScoreAPI(gameId);
        const game = AppState._teamRecentGames[teamId]?.find(g => g.id === gameId) ?? null;
        grid.innerHTML = _teamGameDetailHTML(game, playerStats, team, teamId);
    } catch (err) {
        Logger.error('Failed to load box score', err, 'TEAMS');
        grid.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <h3 class="error-state-title">Failed to Load Box Score</h3>
                <p class="error-state-message">${err.message}</p>
                <button class="retry-btn" onclick="showTeamDetail(${teamId})">← Back to Team</button>
            </div>
        `;
    }
}

function _teamGameDetailHTML(game, playerStats, team, teamId) {
    const colors = getTeamColors(team.abbreviation);
    let gameHeader = '';

    if (game) {
        const isHome     = game.home_team?.id === teamId;
        const teamScore  = isHome ? (game.home_team_score ?? 0) : (game.visitor_team_score ?? 0);
        const oppScore   = isHome ? (game.visitor_team_score ?? 0) : (game.home_team_score ?? 0);
        const opp        = isHome ? game.visitor_team : game.home_team;
        const oppAbbr    = opp?.abbreviation || '???';
        const oppColors  = getTeamColors(oppAbbr);
        const oppLogo    = getNBATeamLogoUrl(oppAbbr);
        const teamLogo   = getNBATeamLogoUrl(team.abbreviation);
        const dateStr    = game.date
            ? new Date(game.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
            : '';
        const status     = game.status || 'Final';
        const isFinal    = /final|^f$/i.test(status);
        const isWin      = isFinal && teamScore > oppScore;

        gameHeader = `
            <div class="player-detail-header" style="grid-column:1/-1;
                background:radial-gradient(ellipse at top left,${colors.primary}1a 0%,rgba(15,23,42,0.85) 55%);
                border-top:3px solid ${colors.primary}88">
                <button onclick="showTeamDetail(${teamId})" class="back-button">← ${team.full_name}</button>
                <div class="player-hero">
                    <div style="display:flex;align-items:center;gap:1.25rem;flex-wrap:wrap">
                        <div class="player-detail-avatar"
                             style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                                    box-shadow:0 0 40px ${colors.primary}44">
                            <img class="player-headshot" src="${teamLogo}" alt="" loading="lazy"
                                 style="object-fit:contain;object-position:center;padding:8px" data-hide-on-error>
                            <span class="avatar-text">${_teamInitials(team)}</span>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:2.8rem;font-weight:900;line-height:1;
                                        color:${isWin?'var(--color-win)':'#f87171'}">${teamScore}</div>
                            <div style="font-size:0.65rem;color:var(--text-muted);letter-spacing:0.8px;
                                        text-transform:uppercase;margin-top:2px">${team.abbreviation}</div>
                        </div>
                        <div style="text-align:center;padding:0 0.5rem">
                            <div style="font-size:0.65rem;color:var(--text-subtle);text-transform:uppercase;
                                        letter-spacing:1.5px;font-weight:700">${status}</div>
                        </div>
                        <div style="text-align:center">
                            <div style="font-size:2.8rem;font-weight:900;line-height:1;
                                        color:${!isWin?'var(--color-win)':'#f87171'}">${oppScore}</div>
                            <div style="font-size:0.65rem;color:var(--text-muted);letter-spacing:0.8px;
                                        text-transform:uppercase;margin-top:2px">${oppAbbr}</div>
                        </div>
                        <div class="player-detail-avatar" ${opp?.id ? `onclick="showTeamDetail(${opp.id})"` : ''}
                             style="background:linear-gradient(135deg,${oppColors.primary}cc,${oppColors.primary}55);${opp?.id ? 'cursor:pointer' : ''}">
                            <img class="player-headshot" src="${oppLogo}" alt="" loading="lazy"
                                 style="object-fit:contain;object-position:center;padding:8px" data-hide-on-error>
                        </div>
                    </div>
                    <div class="player-hero-info">
                        <p class="player-detail-meta">${dateStr}</p>
                        <p class="player-detail-meta" style="color:var(--text-subtle)">${isHome ? 'Home' : 'Away'}</p>
                    </div>
                </div>
            </div>
        `;
    } else {
        gameHeader = `
            <div class="stats-card" style="grid-column:1/-1">
                <button onclick="showTeamDetail(${teamId})" class="back-button">← ${team.full_name}</button>
            </div>
        `;
    }

    // Split stats by team
    const myStats  = playerStats.filter(s => s.team?.id === teamId);
    const oppStats = playerStats.filter(s => s.team?.id !== teamId);
    const oppTeam  = game ? (game.home_team?.id === teamId ? game.visitor_team : game.home_team) : null;
    const oppTitle = oppTeam?.full_name || 'Opponent';

    return `
        ${gameHeader}
        ${_boxScoreTable(myStats, team.full_name, colors)}
        ${_boxScoreTable(oppStats, oppTitle, getTeamColors(oppTeam?.abbreviation || ''))}
    `;
}

function _boxScoreTable(stats, title, colors) {
    if (!stats || stats.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title" style="border-left:3px solid ${colors.primary};padding-left:0.75rem">${title}</h2>
                <p style="color:var(--text-muted);text-align:center;padding:1.5rem">No player stats available.</p>
            </div>
        `;
    }

    // Filter out DNP / inactive rows (no minutes and no counting stats)
    const active = stats.filter(s =>
        s.min && s.min !== '00' && s.min !== '0' && s.min !== 0 ||
        (s.pts ?? 0) > 0 || (s.reb ?? 0) > 0 || (s.ast ?? 0) > 0
    );
    if (active.length === 0) {
        return `
            <div class="stats-card" style="grid-column:1/-1">
                <h2 class="detail-section-title" style="border-left:3px solid ${colors.primary};padding-left:0.75rem">${title}</h2>
                <p style="color:var(--text-muted);text-align:center;padding:1.5rem">No player stats available.</p>
            </div>
        `;
    }
    const sorted = [...active].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));

    const rows = sorted.map(s => {
        const p       = s.player;
        const name    = p ? `${p.first_name} ${p.last_name}` : 'Unknown';
        const id      = p?.id;
        const pts     = s.pts  ?? '—';
        const reb     = s.reb  ?? '—';
        const ast     = s.ast  ?? '—';
        const stl     = s.stl  ?? '—';
        const blk     = s.blk  ?? '—';
        const fgPct   = s.fg_pct != null ? (s.fg_pct * 100).toFixed(1) + '%' : '—';
        const minRaw  = s.min;
        const minDisp = minRaw
            ? (typeof minRaw === 'string' ? minRaw.split(':')[0] : Math.round(minRaw))
            : '—';
        const ptsNum  = typeof s.pts === 'number' ? s.pts : 0;
        const ptsClr  = ptsNum >= 30 ? '#fbbf24'
                      : ptsNum >= 20 ? '#a78bfa'
                      : ptsNum >= 10 ? 'var(--color-pts)'
                      : 'var(--text-secondary)';

        return `
            <div class="roster-row" ${id ? `onclick="showPlayerDetail(${id})" style="cursor:pointer"` : ''}>
                <div class="roster-info" style="flex:1;min-width:0">
                    <span class="roster-name">${name}</span>
                    <span class="roster-meta">${s.player?.position || ''} · ${minDisp} min</span>
                </div>
                <div class="roster-stats">
                    <span style="color:${ptsClr};font-weight:800">${pts}</span>
                    <span style="color:var(--color-reb)">${reb}</span>
                    <span style="color:var(--color-ast)">${ast}</span>
                    <span style="color:var(--text-muted)">${stl}/${blk}</span>
                    <span style="color:var(--text-muted)">${fgPct}</span>
                </div>
                <div class="roster-labels">
                    <span>PTS</span><span>REB</span><span>AST</span><span>S/B</span><span>FG%</span>
                </div>
            </div>
        `;
    }).join('');

    return `
        <div class="stats-card" style="grid-column:1/-1">
            <h2 class="detail-section-title" style="border-left:3px solid ${colors.primary};padding-left:0.75rem">${title}</h2>
            <div class="roster-list">${rows}</div>
        </div>
    `;
}

// ── Back to teams ────────────────────────────────────────────

function backToTeams() {
    history.pushState({ view: 'teams' }, '', '#teams');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="teams"]').forEach(t => t.classList.add('active'));
    AppState.currentView = 'teams';

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('teams', null);

    displayTeams(AppState.allTeams);
}

// ── Helpers ──────────────────────────────────────────────────

function _teamInitials(team) {
    const name = team.name || team.full_name || '';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) return words[0][0] + words[words.length - 1][0];
    return name.slice(0, 2);
}

function _playerInitials(player) {
    const f = player.first_name?.[0] || '';
    const l = player.last_name?.[0]  || '';
    return f + l;
}

// ── Exports ──────────────────────────────────────────────────

if (typeof window !== 'undefined') {
    window.loadTeams          = loadTeams;
    window.displayTeams       = displayTeams;
    window.showTeamDetail     = showTeamDetail;
    window.showTeamGameDetail = showTeamGameDetail;
    window.backToTeams        = backToTeams;
}
