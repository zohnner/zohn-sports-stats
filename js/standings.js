// ============================================================
// NBA Standings view
// ============================================================

let _standingsConf = 'East';
let _standingsView = 'standings'; // 'standings' | 'power'

async function loadStandings() {
    const grid = document.getElementById('playersGrid');
    const viewCount = document.getElementById('viewResultCount');
    if (viewCount) viewCount.textContent = 'NBA Standings';
    if (window.setBreadcrumb) setBreadcrumb('standings', null);

    grid.className = 'standings-container';
    grid.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border-default);border-radius:var(--radius-lg);overflow:hidden">
            <div class="skeleton-line" style="height:36px;border-radius:0;margin:0;opacity:0.5"></div>
            ${Array.from({ length: 15 }, () => `
                <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1.25rem;border-top:1px solid var(--border-default)">
                    <div class="skeleton-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
                    <div class="skeleton-line" style="flex:1;height:12px;max-width:160px"></div>
                    <div class="skeleton-line" style="width:28px;height:12px"></div>
                    <div class="skeleton-line" style="width:28px;height:12px"></div>
                    <div class="skeleton-line" style="width:36px;height:12px"></div>
                    <div class="skeleton-line" style="width:40px;height:12px"></div>
                </div>
            `).join('')}
        </div>
    `;

    try {
        Logger.info('Fetching NBA standings…', undefined, 'STANDINGS');
        const rows = await fetchNBAStandings();
        if (!rows.length) throw new Error('No standings data returned');
        AppState.nbaStandings = rows;
        displayStandings(rows, _standingsConf);
    } catch (err) {
        Logger.error('Standings load failed', err, 'STANDINGS');
        ErrorHandler.renderErrorState(grid, err, loadStandings);
    }
}

function displayStandings(rows, conf) {
    _standingsConf = conf;
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    const confRows = rows
        .filter(r => r.conference === conf)
        .sort((a, b) => a.rank - b.rank);

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab ${conf === 'East' && _standingsView === 'standings' ? 'active' : ''}"
                onclick="_standingsView='standings';displayStandings(AppState.nbaStandings,'East')">Eastern</button>
            <button class="standings-tab ${conf === 'West' && _standingsView === 'standings' ? 'active' : ''}"
                onclick="_standingsView='standings';displayStandings(AppState.nbaStandings,'West')">Western</button>
            <button class="standings-tab ${_standingsView === 'power' ? 'active' : ''}"
                onclick="displayPowerRankings(AppState.nbaStandings)">⚡ Power</button>
        </div>
    `;

    const rowsHtml = confRows.map((team, idx) => {
        const rank      = idx + 1;
        const logoUrl   = getNBATeamLogoUrl(team.teamAbbr);
        const pct       = typeof team.pct === 'number' ? team.pct.toFixed(3) : (team.pct ?? '—');
        const gb        = team.gb === 0 || team.gb === '0' || !team.gb ? '—' : team.gb;
        const streak    = team.streak ?? '—';
        const streakWin = typeof streak === 'string' && streak.startsWith('W');
        const streakCls = streakWin ? 'standings-streak--win' : 'standings-streak--loss';

        const clinchBadge = team.clinchedPO
            ? `<span class="clinch-badge clinch-badge--po" title="Clinched Playoff">x</span>`
            : team.clinchedDiv
            ? `<span class="clinch-badge clinch-badge--div" title="Clinched Division">z</span>`
            : '';

        // Row class for playoff / play-in colouring
        const rowCls = rank <= 6 ? 'standings-row--playoff'
                     : rank <= 10 ? 'standings-row--playin'
                     : '';

        // Visual separator rows inserted AFTER rank 6 and rank 10
        const sepAfter6  = rank === 6  ? `<tr class="standings-sep standings-sep--playoff"><td colspan="10"><span>Play-In zone</span></td></tr>` : '';
        const sepAfter10 = rank === 10 ? `<tr class="standings-sep standings-sep--eliminated"><td colspan="10"><span>Eliminated</span></td></tr>` : '';

        return `
            <tr class="standings-row ${rowCls}" style="cursor:pointer" onclick="_nbaStandingsTeamClick('${team.teamAbbr}')">
                <td class="standings-rank">${rank}</td>
                <td class="standings-team-cell">
                    <img class="standings-logo" src="${logoUrl}" alt=""
                         loading="lazy" data-hide-on-error>
                    <span class="standings-team-name">${team.teamCity} ${team.teamName}</span>
                    ${clinchBadge}
                </td>
                <td class="standings-num">${team.wins}</td>
                <td class="standings-num">${team.losses}</td>
                <td class="standings-num standings-pct">${pct}</td>
                <td class="standings-num standings-gb">${gb}</td>
                <td class="standings-num">${team.l10 || '—'}</td>
                <td class="standings-num ${streakCls}">${streak}</td>
                <td class="standings-num standings-split">${team.home || '—'}</td>
                <td class="standings-num standings-split">${team.road || '—'}</td>
            </tr>
            ${sepAfter6}${sepAfter10}
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="standings-table-wrap">
            <table class="standings-table">
                <thead>
                    <tr>
                        <th class="standings-th-rank">#</th>
                        <th class="standings-th-team">Team</th>
                        <th title="Wins">W</th>
                        <th title="Losses">L</th>
                        <th title="Win percentage">PCT</th>
                        <th title="Games behind">GB</th>
                        <th title="Last 10 games">L10</th>
                        <th title="Current streak">STRK</th>
                        <th title="Home record">HOME</th>
                        <th title="Road record">ROAD</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
        <div class="standings-legend">
            <span class="legend-item"><span class="legend-dot legend-dot--playoff"></span>Playoff</span>
            <span class="legend-item"><span class="legend-dot legend-dot--playin"></span>Play-In</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--po">x</span>Clinched Playoff</span>
            <span class="legend-item"><span class="clinch-badge clinch-badge--div">z</span>Clinched Division</span>
        </div>
    `;
}

// ── Power Rankings ─────────────────────────────────────────────
// Combines season win%, recent form (L10), and current streak into
// a single score. Presented as a ranked league-wide list.

function _parseL10(l10) {
    if (!l10) return null;
    const m = String(l10).match(/(\d+)[-–](\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function _parseStreak(streak) {
    if (!streak) return 0;
    const m = String(streak).match(/([WL])(\d+)/i);
    if (!m) return 0;
    const n = Math.min(parseInt(m[2], 10), 10);
    return m[1].toUpperCase() === 'W' ? n : -n;
}

function _powerScore(team) {
    const gp      = (team.wins || 0) + (team.losses || 0);
    const winPct  = gp > 0 ? team.wins / gp : 0;
    const l10W    = _parseL10(team.l10);
    const l10Pct  = l10W != null ? l10W / 10 : winPct;
    const streak  = _parseStreak(team.streak);
    const strFact = (streak + 10) / 20; // normalise -10..+10 → 0..1
    return winPct * 0.50 + l10Pct * 0.35 + strFact * 0.15;
}

function displayPowerRankings(rows) {
    _standingsView = 'power';
    const grid = document.getElementById('playersGrid');
    grid.className = 'standings-container';

    if (!rows || !rows.length) {
        grid.innerHTML = '<p style="padding:2rem;color:var(--text-muted);text-align:center">No standings data available</p>';
        return;
    }

    // Score every team and sort
    const scored = rows.map(t => ({ ...t, _score: _powerScore(t) }))
        .sort((a, b) => b._score - a._score);

    const maxScore = scored[0]._score;

    const tabHtml = `
        <div class="standings-tabs">
            <button class="standings-tab" onclick="_standingsView='standings';displayStandings(AppState.nbaStandings,'East')">Eastern</button>
            <button class="standings-tab" onclick="_standingsView='standings';displayStandings(AppState.nbaStandings,'West')">Western</button>
            <button class="standings-tab active">⚡ Power</button>
        </div>
    `;

    const rows_html = scored.map((team, idx) => {
        const rank   = idx + 1;
        const gp     = (team.wins || 0) + (team.losses || 0);
        const winPct = gp > 0 ? (team.wins / gp).toFixed(3) : '.000';
        const l10W   = _parseL10(team.l10);
        const streak = team.streak ?? '—';
        const strVal = _parseStreak(team.streak);
        const streakColor = strVal >= 3 ? 'var(--color-win)' : strVal <= -3 ? 'var(--color-loss)' : 'var(--text-muted)';
        const logo   = getNBATeamLogoUrl(team.teamAbbr);

        // Overall win% bar
        const barW   = (team._score / maxScore * 100).toFixed(1);

        // L10 pip dots (filled = win)
        const l10Pips = l10W != null
            ? Array.from({ length: 10 }, (_, i) =>
                `<span class="power-pip ${i < l10W ? 'power-pip--win' : 'power-pip--loss'}"></span>`
              ).join('')
            : '<span style="color:var(--text-muted);font-size:0.75rem">—</span>';

        // Heat label
        const heat = team._score >= 0.65 ? { icon: '🔥', label: 'HOT',   cls: 'power-heat--hot'  }
                   : team._score >= 0.50 ? { icon: '📈', label: 'SOLID', cls: 'power-heat--solid' }
                   : team._score >= 0.38 ? { icon: '➡️',  label: 'MID',   cls: 'power-heat--mid'  }
                   :                       { icon: '❄️',  label: 'COLD',  cls: 'power-heat--cold'  };

        const confBadge = team.conference === 'East'
            ? '<span class="power-conf power-conf--east">E</span>'
            : '<span class="power-conf power-conf--west">W</span>';

        return `
            <div class="power-row" style="cursor:pointer" onclick="_nbaStandingsTeamClick('${team.teamAbbr}')">
                <div class="power-rank">${rank}</div>
                <img class="power-logo" src="${logo}" alt="" loading="lazy" data-hide-on-error>
                <div class="power-team">
                    <div class="power-team-name">${team.teamCity} ${team.teamName} ${confBadge}</div>
                    <div class="power-bar-wrap">
                        <div class="power-bar-fill" style="width:${barW}%"></div>
                    </div>
                </div>
                <div class="power-record">${team.wins}–${team.losses}<span class="power-pct">${winPct}</span></div>
                <div class="power-l10">${l10Pips}</div>
                <div class="power-streak" style="color:${streakColor}">${streak}</div>
                <div class="power-heat ${heat.cls}">${heat.icon} ${heat.label}</div>
            </div>
        `;
    }).join('');

    grid.innerHTML = `
        ${tabHtml}
        <div class="power-header-row">
            <div></div><div></div>
            <div class="power-col-label">Team</div>
            <div class="power-col-label">Record</div>
            <div class="power-col-label">L10</div>
            <div class="power-col-label">Streak</div>
            <div class="power-col-label">Form</div>
        </div>
        <div class="power-list">${rows_html}</div>
        <p class="power-note">Power score = Win% (50%) + L10 form (35%) + streak (15%)</p>
    `;
}

async function _nbaStandingsTeamClick(abbr) {
    if (!AppState.allTeams.length) AppState.allTeams = await fetchTeamsAPI();
    const team = AppState.allTeams.find(t => t.abbreviation === abbr);
    if (team) showTeamDetail(team.id);
}

if (typeof window !== 'undefined') {
    window.loadStandings             = loadStandings;
    window.displayStandings          = displayStandings;
    window.displayPowerRankings      = displayPowerRankings;
    window._nbaStandingsTeamClick    = _nbaStandingsTeamClick;
}
