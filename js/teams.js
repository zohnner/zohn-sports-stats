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

function _espnTeamLogoUrl(abbr) {
    return abbr ? `https://a.espncdn.com/i/teamlogos/nba/500/${abbr.toLowerCase()}.png` : null;
}

function _createTeamCard(team) {
    const colors   = getTeamColors(team.abbreviation);
    const confCls  = team.conference === 'East' ? 'conference-east' : 'conference-west';
    const initials = _teamInitials(team);
    const logoUrl  = _espnTeamLogoUrl(team.abbreviation);

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
                ${logoUrl ? `<img class="player-headshot" src="${logoUrl}" alt="" loading="lazy" style="object-fit:contain;padding:4px" onerror="this.style.display='none'" onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.display='none'">` : ''}
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
        const roster = await fetchTeamRoster(teamId);
        const colors  = getTeamColors(team.abbreviation);

        // Load season stats for roster via NBA.com map (name matching)
        const statsMap = await fetchNBAStatsMap(CURRENT_SEASON);
        roster.forEach(p => {
            if (!AppState.playerStats[p.id]) {
                const key  = `${p.first_name} ${p.last_name}`.toLowerCase();
                const stat = statsMap[key];
                if (stat) AppState.playerStats[p.id] = { ...stat, player_id: p.id };
            }
        });

        Logger.info(`Roster loaded: ${roster.length} players`, undefined, 'TEAMS');

        grid.innerHTML = `
            ${_teamHeader(team, colors)}
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
    const logoUrl   = _espnTeamLogoUrl(team.abbreviation);
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
                    ${logoUrl ? `<img class="player-headshot" src="${logoUrl}" alt="" loading="lazy" style="object-fit:contain;padding:8px" onerror="this.style.display='none'" onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.display='none'">` : ''}
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
                        ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:50%;z-index:1" onerror="this.style.display='none'">` : ''}
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
    window.loadTeams      = loadTeams;
    window.displayTeams   = displayTeams;
    window.showTeamDetail = showTeamDetail;
    window.backToTeams    = backToTeams;
}
