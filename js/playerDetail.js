// ============================================================
// Player Detail — full profile page
// ============================================================

async function showPlayerDetail(playerId, push = true) {
    const player = AppState.allPlayers.find(p => p.id === playerId);
    if (!player) {
        Logger.error(`Player ${playerId} not found in AppState`, undefined, 'DETAIL');
        return;
    }

    AppState.selectedPlayer = player;
    _per36Mode = false;   // reset toggle when viewing a new player
    const grid = document.getElementById('playersGrid');
    const fullName = `${player.first_name} ${player.last_name}`;

    // Record in recently viewed
    if (typeof addRecent === 'function') addRecent({
        id:    player.id,
        sport: 'nba',
        type:  'player',
        name:  fullName,
        sub:   `${player.team?.abbreviation || '—'} · ${player.position || '—'}`,
        badge: 'NBA',
        action: null, // rebuilt on access
    });

    // ── Nav state ─────────────────────────────────────────────
    // Keep Players tab active; show breadcrumb instead of search bar
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="players"]').forEach(t => t.classList.add('active'));
    AppState.currentView = 'players';

    document.getElementById('searchBar')?.style.setProperty('display', 'none');
    document.getElementById('viewHeader')?.style.setProperty('display', 'block');
    if (window.setBreadcrumb) setBreadcrumb('players', fullName);

    // ── Push history so browser back works ────────────────────
    if (push) {
        history.pushState({ view: 'player', id: playerId }, '', `#player-${playerId}`);
    }

    // ── Destroy existing charts ───────────────────────────────
    if (window.StatsCharts) StatsCharts.destroyAll();

    // ── Loading state with team-coloured initials ─────────────
    const abbr     = player.team?.abbreviation || '';
    const colors   = getTeamColors(abbr);
    const initials = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');

    grid.className = 'player-detail-container';
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem;color:white;">
            <div class="player-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);width:88px;height:88px;font-size:1.75rem;margin:0 auto 1.25rem">
                ${initials}
            </div>
            <p style="font-size:1.1rem;color:var(--color-text-secondary)">Loading profile…</p>
            <div class="loading-spinner" style="margin-top:1.5rem;"></div>
        </div>
    `;

    try {
        const stats       = AppState.playerStats[playerId];
        // Fetch in parallel: game log + stats map (needed for league rank badges).
        // If nbaStatsMap is already loaded this resolves instantly from cache.
        const [recentGames] = await Promise.all([
            fetchPlayerGamesAPI(playerId),
            AppState.nbaStatsMap ? Promise.resolve() : fetchNBAStatsMap(CURRENT_SEASON),
        ]);

        const teamName = player.team?.full_name || player.team?.name || 'Unknown Team';
        const season   = `${CURRENT_SEASON}–${(CURRENT_SEASON + 1).toString().slice(2)}`;

        // ── No-stats state ────────────────────────────────────
        if (!stats) {
            grid.innerHTML = `
                ${_playerHero(player, teamName, null)}
                <div class="detail-no-stats">
                    <div style="font-size:2.5rem;margin-bottom:1rem">📊</div>
                    <h3 style="color:var(--color-error-light);margin-bottom:0.5rem">No ${season} Stats Available</h3>
                    <p style="color:var(--color-text-muted)">This player does not have recorded stats for the current season.</p>
                </div>
            `;
            return;
        }

        // ── Full detail ───────────────────────────────────────
        const hasGames   = recentGames && recentGames.length > 0;
        const hasPlayers = AppState.allPlayers.length > 1;

        grid.innerHTML = `
            ${_playerHero(player, teamName, stats)}

            <div class="player-detail-grid">
                ${_seasonStatsCard(stats, season)}
                ${_recentGamesCard(recentGames)}
            </div>

            ${_shootingCard(stats)}

            ${_advancedStatsCard(stats)}

            <div class="stats-card" id="careerStatsCard">
                <h2 class="detail-section-title">Career / Season History</h2>
                <div style="color:var(--text-muted);font-size:0.85rem;padding:0.5rem 0">Loading…</div>
            </div>

            ${_chartsCard(recentGames)}

            ${hasPlayers ? _compareCard(player) : ''}

            ${_playerNotesCard(player.id)}
        `;

        // ── Initialise charts ─────────────────────────────────
        requestAnimationFrame(() => {
            if (window.StatsCharts) {
                StatsCharts.radar('pd-radar', [
                    { label: fullName, data: stats, color: '#818cf8' }
                ]);
                StatsCharts.shootingBars('pd-shooting', stats);
                if (hasGames) StatsCharts.gameTrend('pd-trend', recentGames);
            }

            document.getElementById('per36Btn')
                ?.addEventListener('click', () => togglePer36(stats, season));

            document.getElementById('pd-compare-select')
                ?.addEventListener('change', () => _onCompareChange(player, stats));
            document.getElementById('pd-compare-select-c')
                ?.addEventListener('change', () => _onCompareChange(player, stats));

            // Career stats — fetch last 4 seasons in background, render when ready
            _loadCareerStats(player.id, CURRENT_SEASON);

            // Announcer notes
            _initPlayerNotes(player.id);
        });

    } catch (error) {
        Logger.error('Error loading player details', error, 'DETAIL');
        grid.innerHTML = `
            <div class="error-state">
                <div class="error-state-icon">⚠️</div>
                <h3 class="error-state-title">Failed to Load Player</h3>
                <p class="error-state-message">${error.message}</p>
                <button class="retry-btn" onclick="backToPlayers()">← Back to Players</button>
            </div>
        `;
    }
}

// ── Per-36 toggle state ───────────────────────────────────────
let _per36Mode = false;

function togglePer36(stats, season) {
    _per36Mode = !_per36Mode;
    const card = document.getElementById('seasonStatsCard');
    if (!card) return;
    // Insert new card immediately after the old one, then remove old.
    // This avoids outerHTML= which detaches the node and can race with chart renders.
    card.insertAdjacentHTML('afterend', _seasonStatsCard(stats, season));
    card.remove();
    document.getElementById('per36Btn')?.addEventListener('click', () => togglePer36(stats, season));
}

// ── Comparison handler (supports 2–3 players) ─────────────────

const _NBA_COMPARE_STATS = [
    { key: 'pts',      label: 'PPG', d: 1 },
    { key: 'reb',      label: 'RPG', d: 1 },
    { key: 'ast',      label: 'APG', d: 1 },
    { key: 'stl',      label: 'SPG', d: 1 },
    { key: 'blk',      label: 'BPG', d: 1 },
    { key: 'fg_pct',   label: 'FG%', d: 1, pct: true },
    { key: 'fg3_pct',  label: '3P%', d: 1, pct: true },
    { key: 'ft_pct',   label: 'FT%', d: 1, pct: true },
    { key: 'turnover', label: 'TOV', d: 1, lower: true },
    { key: 'min',      label: 'MIN', d: 1 },
];

const _NBA_CMP_COLORS = ['#818cf8', '#34d399', '#f472b6'];

async function _onCompareChange(playerA, statsA) {
    const selB  = document.getElementById('pd-compare-select');
    const selC  = document.getElementById('pd-compare-select-c');
    const wrap  = document.getElementById('pd-compare-chart-wrap');
    if (!selB || !wrap) return;

    const idB = parseInt(selB.value) || null;
    const idC = parseInt(selC?.value) || null;

    if (!idB) {
        wrap.style.display = 'none';
        StatsCharts.destroy('pd-compare-radar');
        return;
    }

    const playerB = AppState.allPlayers.find(p => p.id === idB);
    if (!playerB) return;

    let statsB = AppState.playerStats[idB];
    if (!statsB) {
        wrap.innerHTML = '<p style="color:var(--color-text-muted);padding:1rem;text-align:center">Loading…</p>';
        wrap.style.display = 'block';
        const statsMap = await fetchNBAStatsMap(CURRENT_SEASON);
        const key = _normName(`${playerB.first_name} ${playerB.last_name}`);
        const stat = statsMap[key];
        if (stat) { statsB = { ...stat, player_id: idB }; AppState.playerStats[idB] = statsB; }
    }

    if (!statsB) {
        wrap.innerHTML = `<p style="color:var(--color-text-muted);padding:1rem;text-align:center">No stats for ${playerB.first_name} ${playerB.last_name}</p>`;
        wrap.style.display = 'block';
        return;
    }

    const playerC = idC ? AppState.allPlayers.find(p => p.id === idC) : null;
    const statsC  = playerC ? (AppState.playerStats[idC] || null) : null;

    wrap.innerHTML = `
        <canvas id="pd-compare-radar"></canvas>
        <div class="compare-table-wrap" id="pd-compare-table"></div>
    `;
    wrap.style.display = 'block';

    const nameA = `${playerA.first_name} ${playerA.last_name}`;
    const nameB = `${playerB.first_name} ${playerB.last_name}`;
    const nameC = playerC ? `${playerC.first_name} ${playerC.last_name}` : null;

    const datasets = [
        { label: nameA, data: statsA, color: _NBA_CMP_COLORS[0] },
        { label: nameB, data: statsB, color: _NBA_CMP_COLORS[1] },
    ];
    if (statsC) datasets.push({ label: nameC, data: statsC, color: _NBA_CMP_COLORS[2] });

    requestAnimationFrame(() => { StatsCharts.radar('pd-compare-radar', datasets); });

    // Multi-player stat table — stat label first column, then one column per player
    const players = [{ name: nameA, s: statsA, clr: _NBA_CMP_COLORS[0] }, { name: nameB, s: statsB, clr: _NBA_CMP_COLORS[1] }];
    if (statsC) players.push({ name: nameC, s: statsC, clr: _NBA_CMP_COLORS[2] });

    const thead = `<tr>
        <th class="cmp-stat-lbl-cell">Stat</th>
        ${players.map(p => `<th class="cmp-th-b" style="color:${p.clr}">${p.name}</th>`).join('')}
    </tr>`;

    const tbody = _NBA_COMPARE_STATS.map(s => {
        const raws = players.map(p => parseFloat(p.s?.[s.key]));
        const best = raws.reduce((bi, v, i) => {
            if (isNaN(v)) return bi;
            if (bi === -1) return i;
            return (s.lower ? v < raws[bi] : v > raws[bi]) ? i : bi;
        }, -1);
        const cells = players.map(({ s: ps, clr }, i) => {
            const raw  = parseFloat(ps?.[s.key]);
            const disp = isNaN(raw) ? '—' : s.pct ? (raw * 100).toFixed(s.d) + '%' : raw.toFixed(s.d);
            const win  = i === best && !isNaN(raw);
            return `<td class="cmp-val-a ${win ? 'cmp-winner' : ''}" style="${win ? `color:${clr}` : ''}">${disp}</td>`;
        }).join('');
        return `<tr class="cmp-row"><td class="cmp-stat-lbl-cell">${s.label}</td>${cells}</tr>`;
    }).join('');

    const tableEl = document.getElementById('pd-compare-table');
    if (tableEl) tableEl.innerHTML = `<table class="cmp-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;
}

// ── HTML fragment builders ────────────────────────────────────

function _playerHero(player, teamName, stats) {
    const conf     = player.team?.conference || '';
    const div      = player.team?.division   || '';
    const abbr        = player.team?.abbreviation || '';
    const colors      = getTeamColors(abbr);
    const initials    = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
    const headshotUrl = getESPNHeadshotUrl(player);
    const headshotImg = headshotUrl
        ? `<img class="player-headshot" src="${headshotUrl}" alt="${player.first_name} ${player.last_name}" loading="lazy" data-hide-on-error onload="var s=this.parentElement.querySelector('.avatar-text');if(s)s.style.visibility='hidden'">`
        : '';

    // Bio attributes available from BDL player object
    const jersey   = player.jersey_number ? `#${player.jersey_number}` : null;
    const height   = player.height   || null;   // e.g. "6-8"
    const weight   = player.weight   ? `${player.weight} lbs` : null;
    const college  = player.college  || null;
    const country  = player.country  || null;
    const draftStr = player.draft_year
        ? `${player.draft_year} Draft · Rd ${player.draft_round || '?'} · Pick ${player.draft_number || '?'}`
        : null;

    const gp = stats?.games_played;

    const bioItems = [
        jersey  && `<div class="player-bio-item"><span class="bio-label">Jersey</span><span class="bio-value">${_escHtml(jersey)}</span></div>`,
        height  && `<div class="player-bio-item"><span class="bio-label">Height</span><span class="bio-value">${_escHtml(height)}</span></div>`,
        weight  && `<div class="player-bio-item"><span class="bio-label">Weight</span><span class="bio-value">${_escHtml(weight)}</span></div>`,
        college && `<div class="player-bio-item"><span class="bio-label">College</span><span class="bio-value">${_escHtml(college)}</span></div>`,
        country && `<div class="player-bio-item"><span class="bio-label">Country</span><span class="bio-value">${_escHtml(country)}</span></div>`,
        draftStr && `<div class="player-bio-item"><span class="bio-label">Draft</span><span class="bio-value">${_escHtml(draftStr)}</span></div>`,
        gp != null && `<div class="player-bio-item"><span class="bio-label">Games</span><span class="bio-value">${_escHtml(gp)} GP</span></div>`,
    ].filter(Boolean).join('');

    return `
        <div class="player-detail-header"
             style="background:radial-gradient(ellipse at top left, ${colors.primary}1a 0%, rgba(15,23,42,0.85) 55%);
                    border-top:3px solid ${colors.primary}88">
            <div style="display:flex;align-items:center;justify-content:space-between">
                <button onclick="backToPlayers()" class="back-button">← Players</button>
                <div style="display:flex;gap:0.5rem;align-items:center">
                    <button class="share-btn" onclick="_downloadNBACard(${player.id})" title="Download stat card PNG">↓ Card</button>
                    <button class="share-btn" onclick="_shareCurrentPage()" title="Copy link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                        Share
                    </button>
                </div>
            </div>
            <div class="player-hero">
                <div class="player-detail-avatar"
                     style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}55);
                            color:#fff;font-size:2.5rem;font-weight:800;letter-spacing:0.02em;
                            box-shadow:0 0 40px ${colors.primary}44">
                    ${headshotImg}<span class="avatar-text">${initials}</span>
                </div>
                <div class="player-hero-info">
                    <div class="player-hero-top">
                        <h1 class="player-detail-name">${_escHtml(player.first_name)} ${_escHtml(player.last_name)}</h1>
                        <span class="player-hero-pos">${_escHtml(player.position || 'N/A')}</span>
                    </div>
                    <p class="player-detail-meta" style="color:var(--color-text-secondary)">
                        ${player.team?.id
                            ? `<button onclick="showTeamDetail(${player.team.id})" style="background:none;border:none;padding:0;color:inherit;cursor:pointer;font-size:inherit;font-family:inherit;text-decoration:underline;text-underline-offset:3px">${teamName}</button>`
                            : teamName}
                    </p>
                    ${conf ? `<p class="player-detail-meta">${conf} Conference · ${div} Division</p>` : ''}
                    ${bioItems ? `<div class="player-bio-grid">${bioItems}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function _computeLeagueRanks(stats) {
    const map = AppState.nbaStatsMap;
    if (!map || !stats) return {};
    const players = Object.values(map);
    const ranks   = {};
    const fields  = ['pts', 'reb', 'ast', 'stl', 'blk', 'turnover', 'min', 'fg_pct', 'fg3_pct', 'ft_pct', 'oreb', 'dreb'];

    for (const f of fields) {
        const vals = players
            .map(p => parseFloat(p[f]))
            .filter(v => !isNaN(v))
            .sort((a, b) => b - a); // descending — higher = better rank
        const val = parseFloat(stats[f]);
        if (!isNaN(val) && vals.length > 0) {
            // Find first index where stored value <= player value
            const idx = vals.findIndex(v => v <= val);
            ranks[f]  = idx === -1 ? vals.length : idx + 1;
        }
    }
    return ranks;
}

function _rankTag(rank, total) {
    if (!rank || !total) return '';
    const pct = rank / total;
    const cls = pct <= 0.05 ? 'stat-rank--elite'
              : pct <= 0.15 ? 'stat-rank--great'
              : pct <= 0.35 ? 'stat-rank--good'
              : '';
    return `<div class="stat-rank ${cls}">#${rank}</div>`;
}

function _seasonStatsCard(stats, season) {
    // Per-36 normalisation: multiply rate stats by (36 / min), keep percentages unchanged
    const min36  = _per36Mode && stats.min > 0 ? 36 / stats.min : 1;
    const r = (v, d = 1) => v != null ? (parseFloat(v) * min36).toFixed(d) : '—';
    const s = (v, d = 1) => v != null ? parseFloat(v).toFixed(d) : '—';
    const p = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const gpLabel   = !_per36Mode && stats.games_played ? ` · ${stats.games_played} GP` : '';
    const modeLabel = _per36Mode ? 'Per 36 Min' : `Season Averages · ${season}${gpLabel}`;

    // Ranks only meaningful in raw mode (not per-36)
    const ranks = _per36Mode ? {} : _computeLeagueRanks(stats);
    const total = AppState.nbaStatsMap ? Object.keys(AppState.nbaStatsMap).length : 0;
    const rk    = f => _rankTag(ranks[f], total);

    const gl  = typeof StatGlossary !== 'undefined' ? StatGlossary : null;
    const tip = lbl => gl ? gl.auto(lbl) : lbl;

    return `
        <div class="stats-card" id="seasonStatsCard">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5)">
                <h2 class="detail-section-title" style="margin-bottom:0">${modeLabel}</h2>
                <button id="per36Btn" class="per36-btn" aria-label="Toggle Per-36 minutes normalisation"
                    style="${_per36Mode ? 'background:rgba(99,102,241,0.2);border-color:rgba(99,102,241,0.5);color:#818cf8' : ''}">
                    ${_per36Mode ? 'Per 36 ON' : 'Per 36'}
                </button>
            </div>
            <div class="stats-grid">
                <div class="stat-item"><div class="stat-value" style="color:var(--color-pts)">${r(stats.pts)}</div>${rk('pts')}<div class="stat-label">${tip('PTS')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-reb)">${r(stats.reb)}</div>${rk('reb')}<div class="stat-label">${tip('REB')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-ast)">${r(stats.ast)}</div>${rk('ast')}<div class="stat-label">${tip('AST')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-blk)">${p(stats.fg_pct)}</div>${rk('fg_pct')}<div class="stat-label">${tip('FG%')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-stl)">${p(stats.fg3_pct)}</div>${rk('fg3_pct')}<div class="stat-label">${tip('3P%')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-pct)">${p(stats.ft_pct)}</div>${rk('ft_pct')}<div class="stat-label">${tip('FT%')}</div></div>
                <div class="stat-item"><div class="stat-value">${r(stats.stl)}</div>${rk('stl')}<div class="stat-label">${tip('STL')}</div></div>
                <div class="stat-item"><div class="stat-value">${r(stats.blk)}</div>${rk('blk')}<div class="stat-label">${tip('BLK')}</div></div>
                <div class="stat-item"><div class="stat-value">${r(stats.turnover)}</div><div class="stat-label">${tip('TOV')}</div></div>
                <div class="stat-item"><div class="stat-value" style="color:var(--color-min)">${s(stats.min)}</div>${rk('min')}<div class="stat-label">${tip('MIN')}</div></div>
                ${stats.oreb != null ? `<div class="stat-item"><div class="stat-value">${r(stats.oreb)}</div>${rk('oreb')}<div class="stat-label">${tip('OREB')}</div></div>` : ''}
                ${stats.dreb != null ? `<div class="stat-item"><div class="stat-value">${r(stats.dreb)}</div>${rk('dreb')}<div class="stat-label">${tip('DREB')}</div></div>` : ''}
            </div>
        </div>
    `;
}

function _recentGamesCard(recentGames) {
    const rows = recentGames && recentGames.length > 0
        ? recentGames.map(g => {
            const date      = g.game?.date ? new Date(g.game.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
            const homeAbbr  = g.game?.home_team?.abbreviation    || 'HME';
            const awayAbbr  = g.game?.visitor_team?.abbreviation || 'AWY';
            const homeScore = g.game?.home_team_score    ?? null;
            const awayScore = g.game?.visitor_team_score ?? null;
            const scoreStr  = homeScore != null && awayScore != null ? `${homeScore}–${awayScore}` : '—';
            const fgPct     = (g.fgm != null && g.fga != null && g.fga > 0) ? ` · ${((g.fgm / g.fga) * 100).toFixed(0)}% FG` : '';
            const mins      = g.min != null ? `${parseFloat(g.min).toFixed(0)}m` : '';
            const pts       = g.pts ?? 0;
            // Colour-code big games
            const ptsColor  = pts >= 30 ? '#fbbf24' : pts >= 20 ? 'var(--color-pts)' : 'var(--color-text-secondary)';
            return `
                <div class="recent-game-item">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.35rem">
                        <span class="recent-game-date">${date} · ${homeAbbr} vs ${awayAbbr}</span>
                        <span style="color:var(--color-text-muted);font-size:0.8rem;font-weight:600">${scoreStr}${mins ? ' · ' + mins : ''}</span>
                    </div>
                    <div class="recent-game-stats">
                        <span style="color:${ptsColor};font-weight:800">${pts} PTS</span>
                        <span style="color:var(--color-reb)">${g.reb ?? 0} REB</span>
                        <span style="color:var(--color-ast)">${g.ast ?? 0} AST</span>
                        <span style="color:var(--color-stl)">${g.stl ?? 0} STL</span>
                        <span style="color:var(--color-blk)">${g.blk ?? 0} BLK</span>
                        ${fgPct ? `<span style="color:var(--color-text-muted);font-size:0.8rem">${g.fgm}/${g.fga}${fgPct}</span>` : ''}
                    </div>
                </div>
            `;
        }).join('')
        : `<p style="color:var(--color-text-muted);text-align:center;padding:2rem">No recent games available</p>`;

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Recent Games</h2>
            <div class="recent-games-list">${rows}</div>
        </div>
    `;
}

function _shootingCard(stats) {
    const bar = (pct, color) => `
        <div class="shooting-stat-bar">
            <div class="shooting-stat-fill" style="width:${pct ? pct * 100 : 0}%;background:${color}"></div>
        </div>
    `;
    const fmt = v => v != null ? (v * 100).toFixed(1) + '%' : '0.0%';
    const sub = (m, a) => `${(m ?? 0).toFixed(1)} / ${(a ?? 0).toFixed(1)} per game`;

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Shooting</h2>
            <div class="shooting-stats-grid">
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color:var(--color-text-secondary)">Field Goals</span>
                        <span style="color:var(--color-text-primary);font-weight:700">${fmt(stats.fg_pct)}</span>
                    </div>
                    ${bar(stats.fg_pct, 'var(--color-blk)')}
                    <div style="color:var(--color-text-muted);font-size:0.82rem;margin-top:0.25rem">${sub(stats.fgm, stats.fga)}</div>
                </div>
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color:var(--color-text-secondary)">3-Pointers</span>
                        <span style="color:var(--color-text-primary);font-weight:700">${fmt(stats.fg3_pct)}</span>
                    </div>
                    ${bar(stats.fg3_pct, 'var(--color-stl)')}
                    <div style="color:var(--color-text-muted);font-size:0.82rem;margin-top:0.25rem">${sub(stats.fg3m, stats.fg3a)}</div>
                </div>
                <div class="shooting-stat-item">
                    <div class="shooting-stat-header">
                        <span style="color:var(--color-text-secondary)">Free Throws</span>
                        <span style="color:var(--color-text-primary);font-weight:700">${fmt(stats.ft_pct)}</span>
                    </div>
                    ${bar(stats.ft_pct, 'var(--color-pct)')}
                    <div style="color:var(--color-text-muted);font-size:0.82rem;margin-top:0.25rem">${sub(stats.ftm, stats.fta)}</div>
                </div>
            </div>
        </div>
    `;
}

// ── Career / Multi-season Stats ───────────────────────────────

async function _loadCareerStats(playerId, currentSeason) {
    const card = document.getElementById('careerStatsCard');
    if (!card) return;

    const seasons = [currentSeason, currentSeason - 1, currentSeason - 2, currentSeason - 3];

    try {
        // Fetch all seasons in parallel
        const results = await Promise.all(
            seasons.map(yr =>
                fetchPlayerStatsAPI([playerId], yr)
                    .then(rows => ({ season: yr, stats: rows[0] || null }))
                    .catch(() => ({ season: yr, stats: null }))
            )
        );

        const rows = results.filter(r => r.stats && r.stats.games_played > 0);
        if (!rows.length) {
            card.innerHTML = `<h2 class="detail-section-title">Career / Season History</h2>
                <p style="color:var(--text-muted);font-size:0.85rem">No historical data available.</p>`;
            return;
        }

        card.innerHTML = _careerStatsCard(rows);
        _wireCareerCSV(rows);
        _wireCareerTrend(rows);
    } catch (_) {
        card.remove();
    }
}

const _CAREER_TREND_STATS = [
    { key: 'pts',     label: 'PTS',  color: '#fbbf24' },
    { key: 'reb',     label: 'REB',  color: '#34d399' },
    { key: 'ast',     label: 'AST',  color: '#60a5fa' },
    { key: 'stl',     label: 'STL',  color: '#a78bfa' },
    { key: 'blk',     label: 'BLK',  color: '#f87171' },
    { key: 'fg_pct',  label: 'FG%',  color: '#f472b6' },
    { key: 'fg3_pct', label: '3P%',  color: '#818cf8' },
    { key: 'min',     label: 'MIN',  color: '#94a3b8' },
];

function _careerStatsCard(rows) {
    const p = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const r = (v, d = 1) => v != null ? parseFloat(v).toFixed(d) : '—';
    const seasonLabel = yr => `${yr}–${String(yr + 1).slice(-2)}`;
    const gl = typeof StatGlossary !== 'undefined' ? StatGlossary : null;
    const th = lbl => gl ? `<th>${gl.auto(lbl)}</th>` : `<th>${lbl}</th>`;

    const colHtml = rows.map(({ season, stats: s }) => `
        <td class="career-season">${seasonLabel(season)}</td>
        <td>${r(s.pts)}</td>
        <td>${r(s.reb)}</td>
        <td>${r(s.ast)}</td>
        <td>${r(s.stl)}</td>
        <td>${r(s.blk)}</td>
        <td>${p(s.fg_pct)}</td>
        <td>${p(s.fg3_pct)}</td>
        <td>${p(s.ft_pct)}</td>
        <td>${r(s.min)}</td>
        <td class="career-gp">${s.games_played ?? '—'}</td>
    `).join('</tr><tr>');

    const trendBtns = _CAREER_TREND_STATS.map((s, i) =>
        `<button class="career-stat-btn${i === 0 ? ' active' : ''}" data-stat="${s.key}" data-color="${s.color}">${s.label}</button>`
    ).join('');

    return `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)">
            <h2 class="detail-section-title" style="margin-bottom:0">Career / Season History</h2>
            <button class="lb-export-btn" id="career-csv-btn" aria-label="Export career stats as CSV" title="Download CSV">↓CSV</button>
        </div>
        <div class="career-table-wrap">
            <table class="career-table">
                <thead>
                    <tr>
                        <th>Season</th>
                        ${th('PTS')}${th('REB')}${th('AST')}${th('STL')}${th('BLK')}
                        ${th('FG%')}${th('3P%')}${th('FT%')}${th('MIN')}${th('GP')}
                    </tr>
                </thead>
                <tbody>
                    <tr>${colHtml}</tr>
                </tbody>
            </table>
        </div>
        <div class="career-trend-section">
            <div class="career-trend-controls" id="career-trend-controls">${trendBtns}</div>
            <div class="chart-wrap chart-wrap--tall" style="margin-top:0.75rem">
                <canvas id="pd-career-trend"></canvas>
            </div>
        </div>
    `;
}

function _wireCareerCSV(rows) {
    const btn = document.getElementById('career-csv-btn');
    if (!btn || typeof exportCSV !== 'function') return;
    const seasonLabel = yr => `${yr}–${String(yr + 1).slice(-2)}`;
    btn.addEventListener('click', () => {
        const headers = ['Season','PTS','REB','AST','STL','BLK','FG%','3P%','FT%','MIN','GP'];
        const csvRows = rows.map(({ season, stats: s }) => [
            seasonLabel(season),
            s.pts != null ? parseFloat(s.pts).toFixed(1) : '',
            s.reb != null ? parseFloat(s.reb).toFixed(1) : '',
            s.ast != null ? parseFloat(s.ast).toFixed(1) : '',
            s.stl != null ? parseFloat(s.stl).toFixed(1) : '',
            s.blk != null ? parseFloat(s.blk).toFixed(1) : '',
            s.fg_pct  != null ? (s.fg_pct*100).toFixed(1)+'%'  : '',
            s.fg3_pct != null ? (s.fg3_pct*100).toFixed(1)+'%' : '',
            s.ft_pct  != null ? (s.ft_pct*100).toFixed(1)+'%'  : '',
            s.min != null ? parseFloat(s.min).toFixed(1) : '',
            s.games_played ?? '',
        ]);
        exportCSV(`nba-career-stats.csv`, headers, csvRows);
    });
}

function _wireCareerTrend(rows) {
    if (!window.StatsCharts || rows.length < 2) return;

    // Rows come newest-first from the API — reverse for oldest→newest chart
    const chronRows = [...rows].reverse();

    const renderTrend = (statKey, color) => {
        StatsCharts.careerTrend('pd-career-trend', chronRows, statKey, color);
    };

    // Initial render with PTS
    const firstStat = _CAREER_TREND_STATS[0];
    renderTrend(firstStat.key, firstStat.color);

    document.getElementById('career-trend-controls')?.addEventListener('click', e => {
        const btn = e.target.closest('.career-stat-btn');
        if (!btn) return;
        document.querySelectorAll('.career-stat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderTrend(btn.dataset.stat, btn.dataset.color);
    });
}

// ── NBA Advanced Stats ────────────────────────────────────────
// All metrics derived from existing BDL fields — no extra fetches.

function _advancedStatsCard(stats) {
    const pts  = parseFloat(stats.pts)      || 0;
    const fgm  = parseFloat(stats.fgm)      || 0;
    const fga  = parseFloat(stats.fga)      || 0;
    const fg3m = parseFloat(stats.fg3m)     || 0;
    const fg3a = parseFloat(stats.fg3a)     || 0;
    const ftm  = parseFloat(stats.ftm)      || 0;
    const fta  = parseFloat(stats.fta)      || 0;
    const tov  = parseFloat(stats.turnover) || 0;
    const ast  = parseFloat(stats.ast)      || 0;

    if (fga === 0) return ''; // not enough data

    const tsAttempts = fga + 0.44 * fta;
    const ts    = tsAttempts > 0 ? pts / (2 * tsAttempts) : null;
    const efg   = fga > 0 ? (fgm + 0.5 * fg3m) / fga : null;
    const tovPct = (fga + 0.44 * fta + tov) > 0
        ? tov / (fga + 0.44 * fta + tov) * 100 : null;
    const astTo = tov > 0 ? ast / tov : null;
    const par3  = fga > 0 ? fg3a / fga : null;
    const ftr   = fga > 0 ? fta / fga : null;

    const pct = v => v != null ? (v * 100).toFixed(1) + '%' : '—';
    const r1  = v => v != null ? v.toFixed(1) : '—';

    const _bar = (val, max, color) => {
        const w = val != null ? Math.min(val / max, 1) * 100 : 0;
        return `<div class="adv-bar"><div class="adv-bar-fill" style="width:${w}%;background:${color}"></div></div>`;
    };

    const _tip = (lbl, key) => typeof StatGlossary !== 'undefined'
        ? StatGlossary.auto(key || lbl) : lbl;

    const _metric = (label, display, bar, key) => `
        <div class="adv-metric">
            <div class="adv-metric-top">
                <span class="adv-metric-label">${_tip(label, key)}</span>
                <span class="adv-metric-value">${display}</span>
            </div>
            ${bar}
        </div>`;

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Advanced Efficiency</h2>
            <div class="adv-stats-grid">
                ${_metric('TS%',    pct(ts),           _bar(ts,    0.70, 'var(--color-pts)'), 'TS%')}
                ${_metric('eFG%',   pct(efg),          _bar(efg,   0.65, 'var(--color-ast)'), 'eFG%')}
                ${_metric('TOV%',   r1(tovPct) + '%',  _bar(tovPct ? tovPct/100 : 0, 0.25, 'var(--color-loss)'), 'TOV%')}
                ${_metric('AST/TO', r1(astTo),         _bar(astTo, 6,    'var(--color-stl)'), 'AST/TO')}
                ${_metric('3PAr',   pct(par3),         _bar(par3,  0.60, 'var(--color-stl)'), '3PAr')}
                ${_metric('FTr',    pct(ftr),          _bar(ftr,   0.60, 'var(--color-pct)'), 'FTr')}
            </div>
        </div>
    `;
}

function _chartsCard(recentGames) {
    const hasGames = recentGames && recentGames.length > 0;
    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Performance Charts</h2>
            <div class="charts-duo">
                <div class="chart-panel">
                    <p class="chart-label">Stat Profile</p>
                    <div class="chart-wrap"><canvas id="pd-radar"></canvas></div>
                </div>
                <div class="chart-panel">
                    <p class="chart-label">Shooting Splits</p>
                    <div class="chart-wrap"><canvas id="pd-shooting"></canvas></div>
                </div>
            </div>
            ${hasGames ? `
                <div class="chart-panel" style="margin-top:var(--space-5)">
                    <p class="chart-label">Last ${recentGames.length} Games · PTS / REB / AST</p>
                    <div class="chart-wrap chart-wrap--tall"><canvas id="pd-trend"></canvas></div>
                </div>
            ` : ''}
        </div>
    `;
}

function _compareCard(currentPlayer) {
    const options = AppState.allPlayers
        .filter(p => p.id !== currentPlayer.id)
        .sort((a, b) => (AppState.playerStats[b.id]?.pts ?? 0) - (AppState.playerStats[a.id]?.pts ?? 0))
        .map(p => {
            const pts = AppState.playerStats[p.id]?.pts;
            const ptsStr = pts != null ? ` · ${pts.toFixed(1)} PPG` : '';
            return `<option value="${p.id}">${p.first_name} ${p.last_name} · ${p.team?.abbreviation || ''}${ptsStr}</option>`;
        })
        .join('');

    return `
        <div class="stats-card">
            <h2 class="detail-section-title">Compare Players</h2>
            <div class="mlb-cmp-selects">
                <select id="pd-compare-select" class="compare-select">
                    <option value="">— Add player 2 —</option>
                    ${options}
                </select>
                <select id="pd-compare-select-c" class="compare-select">
                    <option value="">— Add player 3 —</option>
                    ${options}
                </select>
            </div>
            <div id="pd-compare-chart-wrap" class="chart-wrap chart-wrap--tall" style="display:none;margin-top:var(--space-5)">
            </div>
        </div>
    `;
}

// ── Player Notes (ANN-003) ────────────────────────────────────

function _playerNotesCard(playerId) {
    return `
        <div class="stats-card player-notes-card" id="playerNotesCard">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3)">
                <h2 class="detail-section-title" style="margin-bottom:0">Announcer Notes</h2>
                <span class="player-notes-saved" id="playerNotesSaved" style="display:none">Saved</span>
            </div>
            <textarea
                id="playerNotesTextarea"
                class="player-notes-textarea"
                placeholder="Private notes visible only in this browser — storylines, talking points, game-prep reminders…"
                rows="4"
                data-player-id="${playerId}"
            ></textarea>
        </div>
    `;
}

function _initPlayerNotes(playerId) {
    const ta   = document.getElementById('playerNotesTextarea');
    const saved = document.getElementById('playerNotesSaved');
    if (!ta) return;

    const key = `ss_notes_${playerId}`;
    try { ta.value = localStorage.getItem(key) || ''; } catch (_) {}

    let timer;
    ta.addEventListener('input', () => {
        clearTimeout(timer);
        if (saved) saved.style.display = 'none';
        timer = setTimeout(() => {
            try { localStorage.setItem(key, ta.value); } catch (_) {}
            if (saved) { saved.style.display = ''; setTimeout(() => { saved.style.display = 'none'; }, 2000); }
        }, 800);
    });
}

// ── Share ─────────────────────────────────────────────────────

function _shareCurrentPage() {
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({ url, title: document.title }).catch(() => {});
    } else {
        navigator.clipboard?.writeText(url).then(() => {
            if (typeof ErrorHandler !== 'undefined') {
                ErrorHandler.toast('Link copied to clipboard', 'success');
            }
        }).catch(() => {});
    }
}

// ── Back to players ───────────────────────────────────────────

function backToPlayers() {
    AppState.selectedPlayer = null;
    if (window.StatsCharts) StatsCharts.destroyAll();

    history.pushState({ view: 'players' }, '', '#players');

    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('[data-view="players"]').forEach(t => t.classList.add('active'));
    AppState.currentView = 'players';

    document.getElementById('searchBar')?.style.setProperty('display', 'block');
    document.getElementById('viewHeader')?.style.setProperty('display', 'none');

    displayPlayers(AppState.filteredPlayers);
    updatePlayerCount();
}

function _downloadNBACard(playerId) {
    const player = AppState.allPlayers?.find(p => p.id === playerId);
    const stats  = AppState.playerStats?.[playerId];
    if (!player || !stats) return;
    const abbr   = player.team?.abbreviation;
    const colors = typeof getTeamColors === 'function' ? getTeamColors(abbr) : { primary: '#6366f1' };
    StatsCharts.downloadShareCard(player, stats, 'nba', colors);
}

if (typeof window !== 'undefined') {
    window.showPlayerDetail   = showPlayerDetail;
    window.backToPlayers      = backToPlayers;
    window.togglePer36        = togglePer36;
    window._shareCurrentPage  = _shareCurrentPage;
    window._downloadNBACard   = _downloadNBACard;
}
