// ============================================================
// Leaderboards — stat leaders per category
// ============================================================

const LEADERBOARD_CATEGORIES = [
    { key: 'pts',      label: 'Scoring',        unit: 'PPG',  color: '#fbbf24', decimals: 1 },
    { key: 'reb',      label: 'Rebounds',        unit: 'RPG',  color: '#34d399', decimals: 1 },
    { key: 'ast',      label: 'Assists',         unit: 'APG',  color: '#60a5fa', decimals: 1 },
    { key: 'stl',      label: 'Steals',          unit: 'SPG',  color: '#a78bfa', decimals: 1 },
    { key: 'blk',      label: 'Blocks',          unit: 'BPG',  color: '#f472b6', decimals: 1 },
    { key: 'fg_pct',   label: 'FG%',             unit: 'FG%',  color: '#fb923c', decimals: 1, pct: true },
    { key: 'fg3_pct',  label: '3-Point %',       unit: '3P%',  color: '#818cf8', decimals: 1, pct: true },
    { key: 'ft_pct',   label: 'Free Throw %',    unit: 'FT%',  color: '#38bdf8', decimals: 1, pct: true },
    { key: 'turnover', label: 'Turnovers',        unit: 'TOV',  color: '#f87171', decimals: 1 },
    { key: 'min',      label: 'Minutes',          unit: 'MIN',  color: '#94a3b8', decimals: 1 },
];

// Computed at render time so it reflects the selected season
function _seasonLabel() {
    return `${CURRENT_SEASON}–${(CURRENT_SEASON + 1).toString().slice(-2)}`;
}

async function loadLeaderboards() {
    const grid = document.getElementById('playersGrid');

    if (window.setBreadcrumb) setBreadcrumb('leaders', null);

    grid.className = 'leaderboards-grid';
    grid.innerHTML = Array.from({ length: 6 }, () => `
        <div class="skeleton-card">
            <div class="skeleton-line" style="width:55%;height:16px;margin-bottom:1rem"></div>
            ${Array.from({ length: 5 }, () => `
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.75rem">
                    <div class="skeleton-line" style="width:24px;height:24px;border-radius:50%;flex-shrink:0"></div>
                    <div class="skeleton-avatar" style="width:32px;height:32px;flex-shrink:0"></div>
                    <div style="flex:1"><div class="skeleton-line" style="width:70%;height:12px"></div></div>
                    <div class="skeleton-line" style="width:36px;height:20px"></div>
                </div>
            `).join('')}
        </div>
    `).join('');

    try {
        if (AppState.allPlayers.length === 0) {
            AppState.allPlayers = await fetchAllPlayers();
        }
        if (Object.keys(AppState.playerStats).length === 0) {
            await loadStatsForPlayers(AppState.allPlayers);
        }
        displayLeaderboards();
    } catch (error) {
        Logger.error('Failed to load leaderboards', error, 'LEADERS');
        ErrorHandler.renderErrorState(grid, error, loadLeaderboards);
        ErrorHandler.toast(error.message, 'error', { title: 'Failed to Load Leaders' });
    }
}

function displayLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';
    const fragment = document.createDocumentFragment();
    LEADERBOARD_CATEGORIES.forEach(cat => fragment.appendChild(_buildPanel(cat)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

function _buildPanel(cat) {
    const ranked = AppState.allPlayers
        .filter(p => AppState.playerStats[p.id]?.[cat.key] != null)
        .sort((a, b) => AppState.playerStats[b.id][cat.key] - AppState.playerStats[a.id][cat.key])
        .slice(0, 8);

    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const header = document.createElement('div');
    header.className = 'leaderboard-header';
    header.style.borderLeftColor = cat.color;
    header.innerHTML = `
        <span class="leaderboard-title">${cat.label}</span>
        <span class="leaderboard-unit" style="color:${cat.color}">${_seasonLabel()} · ${cat.unit}</span>
    `;

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    if (ranked.length === 0) {
        list.innerHTML = `<p style="color:var(--color-text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
    } else {
        ranked.forEach((player, i) => {
            const val     = AppState.playerStats[player.id][cat.key];
            const display = cat.pct ? (val * 100).toFixed(cat.decimals) + '%' : val.toFixed(cat.decimals);
            const abbr    = player.team?.abbreviation || '';
            const colors  = getTeamColors(abbr);
            const initials = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
            const headshotUrl = getESPNHeadshotUrl(player);

            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.addEventListener('click', () => showPlayerDetail(player.id));

            row.innerHTML = `
                <span class="lb-rank ${i < 3 ? `lb-rank-${i + 1}` : ''}">${i + 1}</span>
                <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
                    ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
                    <span class="lb-avatar-initials">${initials}</span>
                </div>
                <div class="lb-player">
                    <span class="lb-name">${player.first_name} ${player.last_name}</span>
                    <span class="lb-team">${abbr}${player.position ? ' · ' + player.position : ''}</span>
                </div>
                <span class="lb-value" style="color:${cat.color}">${display}</span>
            `;
            list.appendChild(row);
        });
    }

    panel.appendChild(header);
    panel.appendChild(list);
    return panel;
}

if (typeof window !== 'undefined') {
    window.loadLeaderboards   = loadLeaderboards;
    window.displayLeaderboards = displayLeaderboards;
}
