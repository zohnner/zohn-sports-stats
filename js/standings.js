// ============================================================
// NBA Standings view
// ============================================================

let _standingsConf = 'East';

async function loadStandings() {
    const grid = document.getElementById('playersGrid');
    const viewCount = document.getElementById('viewResultCount');
    if (viewCount) viewCount.textContent = 'NBA Standings';
    if (window.setBreadcrumb) setBreadcrumb('standings', null);

    grid.className = 'standings-container';
    grid.innerHTML = Array.from({ length: 15 }, () => `
        <div class="skeleton-line" style="height:40px;border-radius:8px;margin-bottom:4px"></div>
    `).join('');

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
            <button class="standings-tab ${conf === 'East' ? 'active' : ''}"
                onclick="displayStandings(AppState.nbaStandings, 'East')">Eastern</button>
            <button class="standings-tab ${conf === 'West' ? 'active' : ''}"
                onclick="displayStandings(AppState.nbaStandings, 'West')">Western</button>
        </div>
    `;

    const rowsHtml = confRows.map((team, idx) => {
        const rank      = idx + 1;
        const logoUrl   = `https://a.espncdn.com/i/teamlogos/nba/500/${team.teamAbbr.toLowerCase()}.png`;
        const pct       = typeof team.pct === 'number' ? team.pct.toFixed(3) : (team.pct ?? '—');
        const gb        = team.gb === 0 || team.gb === '0' || !team.gb ? '—' : team.gb;
        const streak    = team.streak || '—';
        const streakWin = streak.startsWith('W');
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
            <tr class="standings-row ${rowCls}">
                <td class="standings-rank">${rank}</td>
                <td class="standings-team-cell">
                    <img class="standings-logo" src="${logoUrl}" alt=""
                         loading="lazy" onerror="this.style.display='none'">
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

if (typeof window !== 'undefined') {
    window.loadStandings    = loadStandings;
    window.displayStandings = displayStandings;
}
