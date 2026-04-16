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

// ── Shared pill-bar control ───────────────────────────────────
// labelText : string shown before the pills (e.g. "Min GP:" or "Position:")
// options   : array of { value, label } or plain values (0 = 'All' for GP)
// current   : currently selected value
// onSelect  : called with the selected value
function _buildPillControl(labelText, options, current, onSelect) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'grid-column:1/-1;display:flex;align-items:center;gap:0.35rem;flex-wrap:wrap;padding:0.05rem 0 0.2rem;';

    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    lbl.style.cssText = 'font-size:0.72rem;font-weight:700;color:#475569;letter-spacing:0.4px;margin-right:0.1rem;white-space:nowrap;flex-shrink:0;';
    wrap.appendChild(lbl);

    options.forEach(opt => {
        const val   = (typeof opt === 'object') ? opt.value : opt;
        const text  = (typeof opt === 'object') ? opt.label : (val === 0 ? 'All' : `${val} GP`);
        const active = val === current || String(val) === String(current);
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.style.cssText = `
            padding:0.2rem 0.55rem;border-radius:20px;cursor:pointer;font-weight:600;
            font-size:0.72rem;font-family:inherit;transition:all 0.18s;
            border:1px solid ${active ? 'transparent' : 'rgba(255,255,255,0.1)'};
            background:${active ? 'rgba(99,102,241,0.22)' : 'rgba(255,255,255,0.03)'};
            color:${active ? '#818cf8' : '#475569'};
        `;
        btn.addEventListener('click', () => onSelect(val));
        wrap.appendChild(btn);
    });

    return wrap;
}

// Backwards-compat alias used by mlb.js
function _buildMinGPControl(options, current, onSelect) {
    return _buildPillControl('Min GP:', options, current, onSelect);
}

const NBA_MINGP_OPTIONS = [0, 10, 20, 50, 70];
const NBA_POS_OPTIONS   = [
    { value: 'all', label: 'All' },
    { value: 'G',   label: 'Guard' },
    { value: 'F',   label: 'Forward' },
    { value: 'C',   label: 'Center' },
];

function displayLeaderboards() {
    const grid = document.getElementById('playersGrid');
    grid.className = 'leaderboards-grid';

    const fragment = document.createDocumentFragment();

    // Control row 1 — Min GP
    fragment.appendChild(_buildPillControl('Min GP:', NBA_MINGP_OPTIONS, AppState.nbaLeaderMinGP, val => {
        AppState.nbaLeaderMinGP = val;
        displayLeaderboards();
    }));

    // Control row 2 — Position
    fragment.appendChild(_buildPillControl('Position:', NBA_POS_OPTIONS, AppState.nbaLeaderPosition, val => {
        AppState.nbaLeaderPosition = val;
        displayLeaderboards();
    }));

    LEADERBOARD_CATEGORIES.forEach(cat => fragment.appendChild(_buildPanel(cat)));
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

const LB_INIT_COUNT = 10;

function _buildLeaderboardRow(player, rank, cat, topVal) {
    const val     = AppState.playerStats[player.id][cat.key];
    const display = cat.pct ? (val * 100).toFixed(cat.decimals) + '%' : val.toFixed(cat.decimals);
    const barPct  = topVal > 0 ? Math.round((val / topVal) * 100) : 0;
    const abbr    = player.team?.abbreviation || '';
    const colors  = getTeamColors(abbr);
    const initials = (player.first_name?.[0] || '') + (player.last_name?.[0] || '');
    const headshotUrl = getESPNHeadshotUrl(player);

    const row = document.createElement('div');
    row.className = 'leaderboard-row';
    row.addEventListener('click', () => showPlayerDetail(player.id));

    row.innerHTML = `
        <span class="lb-rank ${rank < 3 ? `lb-rank-${rank + 1}` : ''}">${rank + 1}</span>
        <div class="lb-avatar" style="background:linear-gradient(135deg,${colors.primary}cc,${colors.primary}44)">
            ${headshotUrl ? `<img src="${headshotUrl}" alt="" loading="lazy" onerror="this.style.display='none'" onload="var s=this.parentElement.querySelector('.lb-avatar-initials');if(s)s.style.visibility='hidden'">` : ''}
            <span class="lb-avatar-initials">${initials}</span>
        </div>
        <div class="lb-player">
            <span class="lb-name">${player.first_name} ${player.last_name}</span>
            <span class="lb-team">${abbr}${player.position ? ' · ' + player.position : ''}</span>
            <div class="lb-bar"><div class="lb-bar-fill" style="width:${barPct}%;background:${cat.color}22;border-right:2px solid ${cat.color}88"></div></div>
        </div>
        <span class="lb-value" style="color:${cat.color}">${display}</span>
    `;
    return row;
}

function _buildPanel(cat) {
    const minGP  = AppState.nbaLeaderMinGP    || 0;
    const posFilt = AppState.nbaLeaderPosition || 'all';
    const eligible = AppState.allPlayers
        .filter(p => {
            if (AppState.playerStats[p.id]?.[cat.key] == null) return false;
            if (minGP > 0 && (AppState.playerStats[p.id]?.games_played ?? 0) < minGP) return false;
            if (posFilt !== 'all' && !p.position?.toUpperCase().includes(posFilt)) return false;
            return true;
        })
        .sort((a, b) => AppState.playerStats[b.id][cat.key] - AppState.playerStats[a.id][cat.key]);

    const panel = document.createElement('div');
    panel.className = 'leaderboard-panel';

    const header = document.createElement('div');
    header.className = 'leaderboard-header';
    header.style.borderLeftColor = cat.color;
    header.innerHTML = `
        <span class="leaderboard-title">${cat.label}</span>
        <span class="leaderboard-unit" style="color:${cat.color}">${_seasonLabel()} · ${cat.unit}${minGP > 0 ? ` · ${eligible.length} qualifying` : ` · ${eligible.length} players`}</span>
    `;

    const list = document.createElement('div');
    list.className = 'leaderboard-list';

    if (eligible.length === 0) {
        list.innerHTML = `<p style="color:var(--text-muted);padding:1.5rem;text-align:center;font-size:0.875rem">No data available</p>`;
    } else {
        const topVal = AppState.playerStats[eligible[0].id][cat.key];

        // Always render the first LB_INIT_COUNT rows visible
        eligible.slice(0, LB_INIT_COUNT).forEach((player, i) => {
            list.appendChild(_buildLeaderboardRow(player, i, cat, topVal));
        });

        // Render the remainder hidden; revealed by the toggle button below
        const extra = eligible.slice(LB_INIT_COUNT);
        extra.forEach((player, i) => {
            const row = _buildLeaderboardRow(player, LB_INIT_COUNT + i, cat, topVal);
            row.style.display = 'none';
            row.dataset.extra = '1';
            list.appendChild(row);
        });

        if (extra.length > 0) {
            const moreBtn = document.createElement('button');
            moreBtn.className = 'leaderboard-more-btn';
            moreBtn.textContent = `Show ${extra.length} more`;
            moreBtn.style.cssText = `
                width:100%;padding:0.5rem;margin-top:0.5rem;background:var(--bg-subtle);
                border:1px solid var(--border-default);border-radius:var(--radius-sm);
                color:var(--text-muted);font-size:0.75rem;cursor:pointer;
                transition:background var(--transition-fast);
            `;
            moreBtn.addEventListener('mouseenter', () => moreBtn.style.background = 'var(--bg-card)');
            moreBtn.addEventListener('mouseleave', () => moreBtn.style.background = 'var(--bg-subtle)');
            moreBtn.addEventListener('click', () => {
                const hidden = [...list.querySelectorAll('[data-extra]')];
                const showing = hidden[0]?.style.display !== 'none';
                hidden.forEach(r => r.style.display = showing ? 'none' : '');
                moreBtn.textContent = showing ? `Show ${extra.length} more` : 'Show less';
            });
            panel.appendChild(header);
            panel.appendChild(list);
            panel.appendChild(moreBtn);
            return panel;
        }
    }

    panel.appendChild(header);
    panel.appendChild(list);
    return panel;
}

if (typeof window !== 'undefined') {
    window.loadLeaderboards   = loadLeaderboards;
    window.displayLeaderboards = displayLeaderboards;
}
